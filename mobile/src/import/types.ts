/**
 * Import domain types. No UI, no networking: only the shape of the data that the
 * controller, transport and storage work with.
 */

/** File format detected from the content, not the extension. */
export type StatementFormat = 'pdf' | 'csv';

/** Job statuses on the server. */
export type ServerStatus = 'queued' | 'processing' | 'ready' | 'deleting' | 'deleted';

export interface RecurringItem {
  id: string;
  merchant: string;
  amountMinor: number;
  cadence: string;
  lastSeen: string;
}

/** Import result. Arrives only together with the ready status. */
export interface ImportResult {
  currency: string;
  items: RecurringItem[];
}

/** Job snapshot as the server returns it (POST, GET by-key, GET by id, DELETE). */
export interface ServerSnapshot {
  jobId: string;
  status: ServerStatus;
  revision: number;
  result?: ImportResult;
}

/** Metadata of the selected file. Shown on screen, never written to logs. */
export interface FileMeta {
  displayName: string;
  sizeBytes: number;
  format: StatementFormat;
}

/**
 * Operation status: the server statuses from the spec plus two client-side ones:
 * `uploading` (POST not yet confirmed by the server) and `error`.
 */
export type ImportStatus = 'uploading' | ServerStatus | 'error';

export type ErrorReason =
  /** The server answered the POST with 4xx/5xx. */
  | 'upload_rejected'
  /** No response to the POST, and the server found no job by key. Retrying with the same key is safe. */
  | 'upload_unconfirmed'
  /** The DELETE failed; the data is still on the server. */
  | 'delete_failed'
  /** The server no longer knows the job (repeated 404 by jobId, or 404 on DELETE). Terminal. */
  | 'job_missing';

/**
 * The only persisted record: one operation per app, lives until "Start new import".
 * The jobId/revision fields hold only what the server has confirmed.
 */
export interface Operation {
  /** POST idempotency key. Saved before the first request. */
  key: string;
  /** DELETE idempotency key. null until a deletion has been requested. */
  deleteKey: string | null;
  file: FileMeta;
  /** URI of the private file copy; null after the server has confirmed the job. */
  localCopyUri: string | null;
  status: ImportStatus;
  jobId: string | null;
  revision: number;
  result: ImportResult | null;
  error: { reason: ErrorReason; httpStatus: number | null } | null;
  /** The last request did not reach the server over the network. The status does not change. */
  offline: boolean;
  /** While `uploading`: the client is only asking the server about the POST (GET by key), not sending bytes. */
  checking?: boolean;
}

export type ImportState = Operation | null;

/** Size threshold: strictly larger is rejected. Exactly 10 MiB is accepted by the server. */
export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
