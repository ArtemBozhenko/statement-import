import type { LogFields } from '@/logging/logger';
import { createMemoryStore } from '@/storage/KeyValueStore';

import { createImportController, MAX_AUTO_RECOVERY_POSTS, NOT_FOUND_POLLS_LIMIT, POLL_BACKOFF_EVERY, POLL_INTERVAL_MS, type ImportController, type LocalCopyAccess } from './controller';
import { createOperationRecord } from './operationRecord';
import { TransportError, type CreateOutcome, type ImportTransport, type LookupOutcome } from './transport';
import type { FileMeta, ServerSnapshot } from './types';

/**
 * Unit tests for the controller policy on a fake transport and Jest fake timers.
 * The server contract is covered by the integration tests against the real mock.
 */
const meta: FileMeta = { displayName: 'statement.csv', sizeBytes: 112, format: 'csv' };
const JOB = 'job-demo-001';
const snap = (status: ServerSnapshot['status'], revision: number): ServerSnapshot => ({
  jobId: JOB,
  status,
  revision,
  ...(status === 'ready' ? { result: { currency: 'AUD', items: [] } } : {}),
});

/** Scripted transport: a queue of responses per method. */
function fakeTransport() {
  const calls = { create: 0, lookup: 0, get: 0, delete: 0 };
  const queues = { create: [] as (CreateOutcome | Error)[], lookup: [] as (LookupOutcome | Error)[], get: [] as (LookupOutcome | Error)[] };
  const take = <T>(queue: (T | Error)[], fallback: T): T => {
    const next = queue.length ? queue.shift()! : fallback;
    if (next instanceof Error) throw next;
    return next;
  };
  const network = () => new TransportError('network', 'offline');
  const transport: ImportTransport = {
    async createImport() {
      calls.create += 1;
      return take(queues.create, { kind: 'accepted', snapshot: snap('queued', 1) });
    },
    async lookupByKey() {
      calls.lookup += 1;
      return take(queues.lookup, { kind: 'not_found' });
    },
    async getJob() {
      calls.get += 1;
      return take(queues.get, { kind: 'found', snapshot: snap('processing', 2) });
    },
    async deleteJob() {
      calls.delete += 1;
      return { kind: 'accepted', snapshot: snap('deleting', 4) };
    },
  };
  return { transport, calls, queues, network };
}

/** Advances the fake timers and lets promises settle. */
async function advance(ms: number) {
  await jest.advanceTimersByTimeAsync(ms);
}

function setup(store = createMemoryStore()) {
  const copies: LocalCopyAccess & { files: Set<string> } = {
    files: new Set(['file:///copy']),
    exists(uri) {
      return this.files.has(uri);
    },
    remove(uri) {
      this.files.delete(uri);
    },
  };
  const logs: { event: string; fields?: LogFields }[] = [];
  const t = fakeTransport();
  let keyNo = 0;
  const controller: ImportController = createImportController({
    transport: t.transport,
    record: createOperationRecord(store),
    generateKey: () => `key-${String(++keyNo).padStart(8, '0')}`,
    localCopy: copies,
    log: (event, fields) => logs.push({ event, fields }),
  });
  const begin = () => controller.beginUpload({ meta, localCopyUri: 'file:///copy' });
  return { controller, store, copies, logs, begin, ...t };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('import controller policy', () => {
  it('polls at a fixed interval after confirmation and stops at ready', async () => {
    const s = setup();
    s.queues.get.push({ kind: 'found', snapshot: snap('processing', 2) }, { kind: 'found', snapshot: snap('ready', 3) });
    await s.begin();
    expect(s.controller.getState()?.status).toBe('queued');
    expect(s.copies.files.has('file:///copy')).toBe(false); // the copy is released after the acknowledgement
    await advance(0);
    expect(s.calls.get).toBe(1);
    await advance(POLL_INTERVAL_MS);
    expect(s.calls.get).toBe(2);
    expect(s.controller.getState()?.status).toBe('ready');
    await advance(POLL_INTERVAL_MS * 10);
    expect(s.calls.get).toBe(2); // no polling after ready
    s.controller.dispose();
  });

  it('stops polling in the background and resumes on foreground', async () => {
    const s = setup();
    await s.begin();
    await advance(0);
    expect(s.calls.get).toBe(1);
    s.controller.setActive(false);
    await advance(POLL_INTERVAL_MS * 5);
    expect(s.calls.get).toBe(1);
    s.controller.setActive(true);
    await advance(0);
    expect(s.calls.get).toBe(2);
    s.controller.dispose();
  });

  it('network failures during polling set the offline flag and keep polling', async () => {
    const s = setup();
    s.queues.get.push(s.network(), s.network());
    await s.begin();
    await advance(0);
    expect(s.controller.getState()).toMatchObject({ status: 'queued', offline: true });
    await advance(POLL_INTERVAL_MS * 2);
    expect(s.calls.get).toBe(3);
    expect(s.controller.getState()?.offline).toBe(false);
    s.controller.dispose();
  });

  it('live session: unconfirmed POST → by-key 404 → automatic POST retries with the same key, then manual retry', async () => {
    const s = setup();
    s.queues.create.push(s.network(), s.network(), s.network());
    await s.begin();
    expect(s.calls.create).toBe(1 + MAX_AUTO_RECOVERY_POSTS);
    expect(s.calls.lookup).toBe(1 + MAX_AUTO_RECOVERY_POSTS);
    expect(s.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_unconfirmed', httpStatus: null }, key: 'key-00000001' });
    await s.controller.retryUpload();
    expect(s.calls.create).toBe(4);
    expect(s.controller.getState()).toMatchObject({ status: 'queued', key: 'key-00000001' });
    s.controller.dispose();
  });

  it('live session: a single automatic retry succeeds and reuses the key', async () => {
    const s = setup();
    s.queues.create.push(s.network());
    await s.begin();
    expect(s.calls.create).toBe(2);
    expect(s.controller.getState()).toMatchObject({ status: 'queued', key: 'key-00000001' });
    s.controller.dispose();
  });

  it('a failed by-key lookup ends in unconfirmed + offline without another POST', async () => {
    const s = setup();
    s.queues.create.push(s.network());
    s.queues.lookup.push(s.network());
    await s.begin();
    expect(s.calls.create).toBe(1);
    expect(s.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_unconfirmed' }, offline: true });
    s.controller.dispose();
  });

  it('hydrate of an uploading record only looks up by key: no automatic POST after relaunch', async () => {
    const s = setup();
    s.queues.create.push(s.network(), s.network(), s.network());
    await s.begin();
    s.controller.dispose();
    // A storage record as if the app had died in the middle of the POST.
    await createOperationRecord(s.store).write({ ...s.controller.getState()!, status: 'uploading', error: null });
    const next = setup(s.store);
    await next.controller.hydrate();
    expect(next.calls.lookup).toBe(1);
    expect(next.calls.create).toBe(0);
    expect(next.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_unconfirmed' } });
    next.controller.dispose();
  });

  it('hydrate of a queued record resumes polling without any POST', async () => {
    const s = setup();
    await s.begin();
    s.controller.dispose();
    const next = setup(s.store);
    await next.controller.hydrate();
    expect(next.controller.getState()?.status).toBe('queued');
    await advance(0);
    expect(next.calls.get).toBe(1);
    expect(next.calls.create).toBe(0);
    next.controller.dispose();
  });

  it('requestDelete persists the delete key before the request and reuses it', async () => {
    const s = setup();
    let keyAtRequest: string | null | undefined;
    const original = s.transport.deleteJob;
    s.transport.deleteJob = async (input) => {
      keyAtRequest = s.controller.getState()?.deleteKey;
      return original(input);
    };
    s.queues.get.push({ kind: 'found', snapshot: snap('ready', 3) });
    await s.begin();
    await advance(0);
    expect(s.controller.getState()?.status).toBe('ready');
    await s.controller.requestDelete();
    expect(keyAtRequest).toBe('key-00000002');
    expect(s.controller.getState()).toMatchObject({ status: 'deleting', jobId: JOB, revision: 4, deleteKey: 'key-00000002' });
    s.controller.dispose();
  });
});

describe('import controller failure handling', () => {
  it('a protocol failure while polling is logged but is not "offline", and polling continues', async () => {
    const s = setup();
    s.queues.get.push(new TransportError('protocol', 'unexpected status 500'));
    await s.begin();
    await advance(0);
    expect(s.controller.getState()).toMatchObject({ status: 'queued', offline: false });
    expect(s.logs.find((l) => l.event === 'poll.failed')?.fields).toMatchObject({ reason: 'protocol' });
    await advance(POLL_INTERVAL_MS);
    expect(s.calls.get).toBe(2);
    s.controller.dispose();
  });

  it('polling backs off while nothing changes and resets on foreground', async () => {
    const s = setup();
    // Every GET answers the same processing/2: the first one applies, the rest are stale.
    await s.begin();
    for (let i = 0; i < POLL_BACKOFF_EVERY; i += 1) await advance(POLL_INTERVAL_MS);
    const before = s.calls.get;
    await advance(POLL_INTERVAL_MS); // one base interval is no longer enough
    expect(s.calls.get).toBe(before);
    await advance(POLL_INTERVAL_MS);
    expect(s.calls.get).toBe(before + 1);
    s.controller.setActive(false);
    s.controller.setActive(true);
    await advance(0);
    expect(s.calls.get).toBe(before + 2); // prompt poll after returning to the foreground
    s.controller.dispose();
  });

  it('repeated 404 by jobId ends in job_missing with a way out instead of polling forever', async () => {
    const s = setup();
    for (let i = 0; i < NOT_FOUND_POLLS_LIMIT; i += 1) s.queues.get.push({ kind: 'not_found' });
    await s.begin();
    await advance(POLL_INTERVAL_MS * NOT_FOUND_POLLS_LIMIT);
    expect(s.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'job_missing', httpStatus: 404 } });
    const polls = s.calls.get;
    await advance(POLL_INTERVAL_MS * 10);
    expect(s.calls.get).toBe(polls);
    s.controller.dispose();
  });

  it('DELETE 404 is job_missing, not a delete failure to retry', async () => {
    const s = setup();
    s.queues.get.push({ kind: 'found', snapshot: snap('ready', 3) });
    s.transport.deleteJob = async () => ({ kind: 'rejected', httpStatus: 404 });
    await s.begin();
    await advance(0);
    await s.controller.requestDelete();
    expect(s.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'job_missing', httpStatus: 404 } });
    s.controller.dispose();
  });

  it('a Retry-After from the server replaces the backoff interval for the next poll', async () => {
    const s = setup();
    s.queues.get.push({ kind: 'found', snapshot: snap('processing', 2), retryAfterMs: 5000 });
    await s.begin();
    await advance(0);
    expect(s.calls.get).toBe(1);
    await advance(POLL_INTERVAL_MS * 2); // the usual interval has passed twice, the server asked for 5 s
    expect(s.calls.get).toBe(1);
    await advance(5000 - POLL_INTERVAL_MS * 2);
    expect(s.calls.get).toBe(2);
    await advance(POLL_INTERVAL_MS); // the second answer carried no header: back to the normal interval
    expect(s.calls.get).toBe(3);
    s.controller.dispose();
  });

  it('a DELETE with no answer that did reach the server is recognised by one GET and continues as deleting', async () => {
    const s = setup();
    s.queues.get.push({ kind: 'found', snapshot: snap('ready', 3) }, { kind: 'found', snapshot: snap('deleting', 4) }, { kind: 'found', snapshot: snap('deleted', 5) });
    s.transport.deleteJob = async () => {
      throw s.network();
    };
    await s.begin();
    await advance(0);
    await s.controller.requestDelete();
    expect(s.controller.getState()).toMatchObject({ status: 'deleting', revision: 4, error: null });
    expect(s.logs.some((l) => l.event === 'delete.confirmed_by_get')).toBe(true);
    await advance(POLL_INTERVAL_MS);
    expect(s.controller.getState()?.status).toBe('deleted');
    s.controller.dispose();
  });

  it('a DELETE with no answer that never arrived ends in delete_failed without an HTTP status, offline', async () => {
    const s = setup();
    s.queues.get.push({ kind: 'found', snapshot: snap('ready', 3) }, { kind: 'found', snapshot: snap('ready', 3) });
    s.transport.deleteJob = async () => {
      throw s.network();
    };
    await s.begin();
    await advance(0);
    await s.controller.requestDelete();
    expect(s.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'delete_failed', httpStatus: null }, offline: true });
    s.controller.dispose();
  });

  it('hydrate of an uploading record shows "checking" while the GET by key runs, never "sending"', async () => {
    const s = setup();
    s.queues.create.push(s.network(), s.network(), s.network());
    await s.begin();
    s.controller.dispose();
    await createOperationRecord(s.store).write({ ...s.controller.getState()!, status: 'uploading', error: null });
    const next = setup(s.store);
    const seen: (boolean | undefined)[] = [];
    next.controller.subscribe((state) => {
      if (state?.status === 'uploading') seen.push(state.checking);
    });
    await next.controller.hydrate();
    expect(seen).toContain(true);
    expect(seen).not.toContain(false); // no POST, so never back to "sending"
    expect(next.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_unconfirmed' }, checking: false });
    next.controller.dispose();
  });

  it('a ready job that the server no longer knows ends in job_missing on relaunch', async () => {
    const s = setup();
    s.queues.get.push({ kind: 'found', snapshot: snap('ready', 3) });
    await s.begin();
    await advance(0);
    s.controller.dispose();
    const next = setup(s.store);
    next.queues.get.push({ kind: 'not_found' });
    await next.controller.hydrate();
    expect(next.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'job_missing', httpStatus: 404 } });
    next.controller.dispose();
  });

  it('POST attempts are numbered across the session, including the manual retry', async () => {
    const s = setup();
    s.queues.create.push(s.network(), s.network(), s.network());
    await s.begin();
    await s.controller.retryUpload();
    const attempts = s.logs.filter((l) => l.event === 'upload.started').map((l) => l.fields?.attempt);
    expect(attempts).toEqual([1, 2, 3, 4]);
    s.controller.dispose();
  });
});
