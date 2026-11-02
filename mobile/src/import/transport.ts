import type { ImportResult, RecurringItem, ServerSnapshot, ServerStatus } from './types';

/**
 * Transport to the API. Network failures and timeouts throw TransportError('network'), unexpected
 * responses TransportError('protocol'); HTTP rejections from the server are returned as values.
 */

export type CreateOutcome = { kind: 'accepted'; snapshot: ServerSnapshot } | { kind: 'rejected'; httpStatus: number };
/** `retryAfterMs` carries the server's Retry-After hint when it sends one; the poller prefers it over its own backoff. */
export type LookupOutcome = { kind: 'found'; snapshot: ServerSnapshot; retryAfterMs?: number } | { kind: 'not_found'; retryAfterMs?: number };

export interface ImportTransport {
  /** POST of the raw file bytes from the local copy URI. */
  createImport(input: { key: string; fileName: string; uri: string }): Promise<CreateOutcome>;
  lookupByKey(key: string): Promise<LookupOutcome>;
  getJob(jobId: string): Promise<LookupOutcome>;
  deleteJob(input: { jobId: string; deleteKey: string }): Promise<CreateOutcome>;
}

export class TransportError extends Error {
  constructor(
    readonly kind: 'network' | 'protocol',
    message: string,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

/** Minimal fetch contract so it can be substituted in tests. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string>; headers?: { get(name: string): string | null } }>;

/** Retry-After in seconds (delta form only; an HTTP-date is ignored) → milliseconds, or undefined. */
export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}

/** Uploads a file from disk as the request body. On device: expo-file-system; in Node: fetch with the bytes. */
export type FileUploader = (input: { url: string; uri: string; headers: Record<string, string> }) => Promise<{ status: number; body: string }>;

/** GET / DELETE are small JSON exchanges; a POST carries up to 10 MiB over a mobile link. */
export const REQUEST_TIMEOUT_MS = 15_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const STATUSES: ServerStatus[] = ['queued', 'processing', 'ready', 'deleting', 'deleted'];

function parseItem(raw: unknown): RecurringItem | null {
  if (!isRecord(raw)) return null;
  const { id, merchant, amountMinor, cadence, lastSeen } = raw;
  if (typeof id !== 'string' || typeof merchant !== 'string' || typeof amountMinor !== 'number') return null;
  if (typeof cadence !== 'string' || typeof lastSeen !== 'string') return null;
  return { id, merchant, amountMinor, cadence, lastSeen };
}

/** Parses the response body into a snapshot; throws TransportError('protocol') on an unexpected shape. */
export function parseSnapshot(text: string): ServerSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new TransportError('protocol', 'response is not JSON');
  }
  if (!isRecord(raw) || typeof raw.jobId !== 'string' || typeof raw.revision !== 'number') {
    throw new TransportError('protocol', 'snapshot lacks jobId or revision');
  }
  const status = raw.status;
  if (typeof status !== 'string' || !STATUSES.includes(status as ServerStatus)) throw new TransportError('protocol', 'unknown job status');
  const snapshot: ServerSnapshot = { jobId: raw.jobId, status: status as ServerStatus, revision: raw.revision };
  if (status === 'ready') {
    const items = Array.isArray(raw.items) ? raw.items.map(parseItem) : null;
    if (!items || items.some((i) => i === null) || typeof raw.currency !== 'string') {
      throw new TransportError('protocol', 'ready snapshot lacks items or currency');
    }
    const result: ImportResult = { currency: raw.currency, items: items as RecurringItem[] };
    snapshot.result = result;
  }
  return snapshot;
}

export interface FetchTransportOptions {
  baseUrl: () => string;
  fetch: FetchLike;
  uploadFile: FileUploader;
  /** Overridable for tests; production uses the constants above. */
  timeouts?: { requestMs: number; uploadMs: number };
}

export function createFetchTransport({ baseUrl, fetch, uploadFile, timeouts }: FetchTransportOptions): ImportTransport {
  const requestMs = timeouts?.requestMs ?? REQUEST_TIMEOUT_MS;
  const uploadMs = timeouts?.uploadMs ?? UPLOAD_TIMEOUT_MS;
  const url = (path: string) => `${baseUrl().replace(/\/+$/, '')}${path}`;

  /** A GET or DELETE with an abort timeout. Any failure, including the timeout, is a network error. */
  async function request(path: string, init?: Parameters<FetchLike>[1]) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), requestMs);
    try {
      return await fetch(url(path), { ...init, signal: abort.signal });
    } catch {
      throw new TransportError('network', 'request failed or timed out');
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookup(path: string): Promise<LookupOutcome> {
    const response = await request(path);
    const retryAfterMs = parseRetryAfterMs(response.headers?.get('retry-after'));
    if (response.status === 404) return { kind: 'not_found', retryAfterMs };
    const text = await response.text();
    if (response.status !== 200) throw new TransportError('protocol', `unexpected status ${response.status}`);
    return { kind: 'found', snapshot: parseSnapshot(text), retryAfterMs };
  }

  return {
    async createImport({ key, fileName, uri }) {
      const headers = { 'Content-Type': 'application/octet-stream', 'Idempotency-Key': key, 'X-File-Name': fileName };
      let result: { status: number; body: string };
      // The native upload cannot be aborted from here; after the timeout its outcome is simply
      // unknown, which is exactly the case the by-key recovery handles.
      let timer: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TransportError('network', 'upload timed out')), uploadMs);
      });
      try {
        result = await Promise.race([uploadFile({ url: url('/imports'), uri, headers }), timeout]);
      } catch {
        throw new TransportError('network', 'upload failed or timed out');
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
      if (result.status === 202) return { kind: 'accepted', snapshot: parseSnapshot(result.body) };
      return { kind: 'rejected', httpStatus: result.status };
    },
    lookupByKey: (key) => lookup(`/imports/by-key/${encodeURIComponent(key)}`),
    getJob: (jobId) => lookup(`/imports/${encodeURIComponent(jobId)}`),
    async deleteJob({ jobId, deleteKey }) {
      const response = await request(`/imports/${encodeURIComponent(jobId)}`, { method: 'DELETE', headers: { 'Idempotency-Key': deleteKey } });
      const text = await response.text();
      if (response.status === 202) return { kind: 'accepted', snapshot: parseSnapshot(text) };
      return { kind: 'rejected', httpStatus: response.status };
    },
  };
}
