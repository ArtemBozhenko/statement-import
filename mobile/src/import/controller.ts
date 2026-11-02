import type { Logger, LogReason } from '@/logging/logger';

import type { OperationRecord } from './operationRecord';
import { applyServerSnapshot } from './snapshot';
import { TransportError, type ImportTransport } from './transport';
import type { FileMeta, ImportState, Operation } from './types';

/**
 * Import operation controller. Owns the single operation, persists every change,
 * talks to the transport, polls the server and notifies subscribers.
 *
 * Invariants:
 *  - the POST key and the DELETE key are written to storage before the first request that uses them;
 *  - after a restart a POST is never sent on its own: only a GET by key and the manual button;
 *  - the local copy is removed as soon as the server has confirmed the job;
 *  - a deletion counts as done only after a snapshot with status deleted.
 */

/** How many times within a live session we automatically repeat the POST with the same key after a 404 by key. */
export const MAX_AUTO_RECOVERY_POSTS = 2;
export const POLL_INTERVAL_MS = 1500;
/** Polling slows down while nothing changes: the interval doubles every N polls up to the cap. */
export const POLL_BACKOFF_EVERY = 8;
export const POLL_MAX_INTERVAL_MS = 12_000;
/** This many consecutive 404s by jobId mean the server has forgotten the job: stop polling. */
export const NOT_FOUND_POLLS_LIMIT = 3;

export interface LocalCopyAccess {
  exists(uri: string): boolean;
  remove(uri: string): void;
}

/** The selected and already validated file. */
export interface PreparedStatement {
  meta: FileMeta;
  localCopyUri: string;
}

export interface ControllerDeps {
  transport: ImportTransport;
  record: OperationRecord;
  generateKey: () => string;
  localCopy: LocalCopyAccess;
  log: Logger;
}

export interface ImportController {
  getState(): ImportState;
  subscribe(listener: (state: ImportState) => void): () => void;
  /** Reads the record from storage and resumes whatever is safe to resume. */
  hydrate(): Promise<void>;
  beginUpload(prepared: PreparedStatement): Promise<void>;
  /** Manual retry of the POST with the same key from error(upload_unconfirmed). */
  retryUpload(): Promise<void>;
  /** Delete request; a retry reuses the same delete key. */
  requestDelete(): Promise<void>;
  /** Resets the operation and removes the local copy. */
  startOver(): Promise<void>;
  /** Polling pauses in the background and resumes on return to the foreground. */
  setActive(active: boolean): void;
  dispose(): void;
}

/** Classifies a thrown error for the log and for the offline flag. */
function failureKind(error: unknown): LogReason {
  return error instanceof TransportError ? error.kind : 'unknown';
}

export function createImportController({ transport, record, generateKey, localCopy, log }: ControllerDeps): ImportController {
  let state: ImportState = null;
  const listeners = new Set<(state: ImportState) => void>();
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let active = true;
  /** Monotonic counter: responses from stale cycles do not touch the new state. */
  let generation = 0;
  /** POST attempts in this session for the current operation; continues across manual retries. */
  let postAttempts = 0;
  /** Polls since the last applied snapshot; drives the backoff. */
  let unchangedPolls = 0;
  /** Consecutive 404s by jobId. */
  let notFoundPolls = 0;
  /** The server's Retry-After from the last poll, if it sent one; overrides the backoff for the next poll. */
  let serverRetryAfterMs: number | undefined;

  function commit(next: ImportState): Promise<void> {
    state = next;
    for (const listener of listeners) listener(state);
    return next ? record.write(next) : record.clear();
  }

  function patch(changes: Partial<Operation>): Promise<void> {
    return state ? commit({ ...state, ...changes }) : Promise.resolve();
  }

  const wantsPolling = (op: Operation) => op.status === 'queued' || op.status === 'processing' || op.status === 'deleting';

  function cancelPoll() {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function pollDelay(): number {
    if (serverRetryAfterMs !== undefined) return Math.min(serverRetryAfterMs, POLL_MAX_INTERVAL_MS);
    return Math.min(POLL_INTERVAL_MS * 2 ** Math.floor(unchangedPolls / POLL_BACKOFF_EVERY), POLL_MAX_INTERVAL_MS);
  }

  function schedulePoll(delayMs: number) {
    cancelPoll();
    if (!state || !wantsPolling(state) || !active) return;
    const myGeneration = generation;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void pollOnce(myGeneration);
    }, delayMs);
  }

  async function pollOnce(myGeneration: number) {
    if (!state || myGeneration !== generation || !wantsPolling(state) || !state.jobId) return;
    unchangedPolls += 1;
    await fetchJobOnce(state.jobId, myGeneration);
    if (myGeneration === generation) schedulePoll(pollDelay());
  }

  /**
   * After a DELETE with no answer: true if the server already shows the job as deleting/deleted
   * (the snapshot is absorbed and polling resumes), false if it does not or cannot be asked.
   */
  async function deleteReachedServer(jobId: string, myGeneration: number): Promise<boolean> {
    try {
      const outcome = await transport.getJob(jobId);
      if (myGeneration !== generation || !state) return true;
      if (outcome.kind !== 'found' || (outcome.snapshot.status !== 'deleting' && outcome.snapshot.status !== 'deleted')) return false;
      log('delete.confirmed_by_get', { jobId, status: outcome.snapshot.status, revision: outcome.snapshot.revision });
      absorb(outcome.snapshot);
      schedulePoll(0);
      return true;
    } catch {
      return false;
    }
  }

  /** A single GET by jobId. A network failure sets the offline flag, it is not an operation error. */
  async function fetchJobOnce(jobId: string, myGeneration: number) {
    try {
      const outcome = await transport.getJob(jobId);
      if (myGeneration !== generation || !state) return;
      serverRetryAfterMs = outcome.retryAfterMs;
      if (outcome.kind === 'found') {
        notFoundPolls = 0;
        absorb(outcome.snapshot);
        return;
      }
      notFoundPolls += 1;
      log('poll.not_found', { jobId, attempt: notFoundPolls });
      // The server has forgotten the job: there is nothing left to wait for. While polling we allow a few
      // transient 404s; for a `ready` job (the single GET after a relaunch) one authoritative 404 is enough.
      if ((notFoundPolls >= NOT_FOUND_POLLS_LIMIT && wantsPolling(state)) || state.status === 'ready') {
        void patch({ status: 'error', error: { reason: 'job_missing', httpStatus: 404 }, offline: false });
      }
    } catch (error) {
      if (myGeneration !== generation || !state) return;
      const kind = failureKind(error);
      log('poll.failed', { jobId, reason: kind });
      // Only a network failure is "offline"; a broken response keeps the status and polling as they are.
      if (kind === 'network') void patch({ offline: true });
    }
  }

  /** Applies the snapshot through the pure function and releases the file copy once the job is confirmed. */
  function absorb(snapshot: Parameters<typeof applyServerSnapshot>[1]) {
    if (!state) return;
    const result = applyServerSnapshot(state, snapshot);
    if (!result.applied) {
      log('snapshot.ignored', { jobId: snapshot.jobId, status: snapshot.status, revision: snapshot.revision, reason: result.reason });
      return;
    }
    log('snapshot.applied', { jobId: snapshot.jobId, status: snapshot.status, revision: snapshot.revision });
    unchangedPolls = 0;
    const next = result.operation;
    next.checking = false;
    if (next.localCopyUri) {
      // The server confirmed the job: it has the bytes, the copy is no longer needed.
      try {
        localCopy.remove(next.localCopyUri);
      } catch {
        log('local_copy.remove_failed');
      }
      next.localCopyUri = null;
    }
    void commit(next);
  }

  /** A single POST. Returns false if the outcome is unknown (network), otherwise true. */
  async function post(myGeneration: number): Promise<boolean> {
    const op = state;
    if (!op || !op.localCopyUri) return true;
    postAttempts += 1;
    void patch({ status: 'uploading', checking: false, error: null, offline: false });
    log('upload.started', { attempt: postAttempts });
    try {
      const outcome = await transport.createImport({ key: op.key, fileName: op.file.displayName, uri: op.localCopyUri });
      if (myGeneration !== generation || !state) return true;
      if (outcome.kind === 'accepted') {
        log('upload.accepted', { jobId: outcome.snapshot.jobId, httpStatus: 202 });
        absorb(outcome.snapshot);
        schedulePoll(0);
      } else {
        log('upload.rejected', { httpStatus: outcome.httpStatus });
        void patch({ status: 'error', error: { reason: 'upload_rejected', httpStatus: outcome.httpStatus } });
      }
      return true;
    } catch (error) {
      if (myGeneration !== generation || !state) return true;
      if (error instanceof TransportError && error.kind === 'network') {
        log('upload.unconfirmed', { attempt: postAttempts });
        return false;
      }
      log('upload.protocol_error');
      void patch({ status: 'error', error: { reason: 'upload_rejected', httpStatus: null } });
      return true;
    }
  }

  /**
   * The POST outcome is unknown: GET by key → found: done; 404 → within a live session up to two
   * auto-POSTs with the same key; after a restart (`allowAutoPost` = false) only a manual retry.
   */
  async function recover(myGeneration: number, allowAutoPost: boolean) {
    for (let attempt = 0; ; attempt += 1) {
      if (!state || myGeneration !== generation) return;
      // Still `uploading` for the screen, but no bytes are moving: the banner must say "checking", not "sending".
      void patch({ checking: true });
      try {
        const lookup = await transport.lookupByKey(state.key);
        if (myGeneration !== generation || !state) return;
        if (lookup.kind === 'found') {
          log('recovery.found_by_key', { jobId: lookup.snapshot.jobId });
          absorb(lookup.snapshot);
          schedulePoll(0);
          return;
        }
        log('recovery.not_found_by_key', { attempt });
      } catch (error) {
        if (myGeneration !== generation || !state) return;
        const kind = failureKind(error);
        log('recovery.lookup_failed', { attempt, reason: kind });
        void patch({ status: 'error', checking: false, error: { reason: 'upload_unconfirmed', httpStatus: null }, offline: kind === 'network' });
        return;
      }
      if (!allowAutoPost || attempt >= MAX_AUTO_RECOVERY_POSTS || !state.localCopyUri || !localCopy.exists(state.localCopyUri)) {
        void patch({ status: 'error', checking: false, error: { reason: 'upload_unconfirmed', httpStatus: null } });
        return;
      }
      if (await post(myGeneration)) return;
    }
  }

  async function uploadFlow() {
    generation += 1;
    const myGeneration = generation;
    cancelPoll();
    if (!(await post(myGeneration))) await recover(myGeneration, true);
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },

    async hydrate() {
      const stored = record.read() ?? null;
      // An interrupted POST is only ever checked after a relaunch, never resent: say so from the first frame.
      state = stored?.status === 'uploading' ? { ...stored, checking: true } : stored;
      for (const listener of listeners) listener(state);
      if (!stored) return;
      log('hydrate', { status: stored.status });
      generation += 1;
      switch (stored.status) {
        case 'uploading':
          // The app died in the middle of a POST: find out the outcome by reading only.
          await recover(generation, false);
          return;
        case 'queued':
        case 'processing':
        case 'deleting':
          schedulePoll(0);
          return;
        case 'ready':
          // A current job after a restart: one safe GET, no POST.
          if (stored.jobId) await fetchJobOnce(stored.jobId, generation);
          return;
        default:
          return;
      }
    },

    async beginUpload(prepared) {
      if (state) throw new Error('an import operation is already in progress');
      postAttempts = 0;
      // The record with the key lands in storage before the first byte is sent.
      await commit({
        key: generateKey(),
        deleteKey: null,
        file: prepared.meta,
        localCopyUri: prepared.localCopyUri,
        status: 'uploading',
        jobId: null,
        revision: 0,
        result: null,
        error: null,
        offline: false,
      });
      await uploadFlow();
    },

    async retryUpload() {
      if (state?.error?.reason !== 'upload_unconfirmed') return;
      await uploadFlow();
    },

    async requestDelete() {
      const op = state;
      if (!op?.jobId) return;
      const allowed = op.status === 'ready' || op.status === 'queued' || op.status === 'processing' || op.error?.reason === 'delete_failed';
      if (!allowed) return;
      const { jobId } = op;
      // The delete key is fixed before the request and reused on every retry.
      const deleteKey = op.deleteKey ?? generateKey();
      if (op.deleteKey !== deleteKey) await patch({ deleteKey });
      generation += 1;
      const myGeneration = generation;
      cancelPoll();
      log('delete.requested', { jobId });
      try {
        const outcome = await transport.deleteJob({ jobId, deleteKey });
        if (myGeneration !== generation || !state) return;
        if (outcome.kind === 'accepted') {
          log('delete.accepted', { jobId, httpStatus: 202 });
          absorb(outcome.snapshot);
          schedulePoll(0);
        } else if (outcome.httpStatus === 404) {
          // Nothing to delete: the server has no such job any more.
          log('delete.rejected', { jobId, httpStatus: 404 });
          void patch({ status: 'error', error: { reason: 'job_missing', httpStatus: 404 }, offline: false });
        } else {
          log('delete.rejected', { jobId, httpStatus: outcome.httpStatus });
          void patch({ status: 'error', error: { reason: 'delete_failed', httpStatus: outcome.httpStatus } });
        }
      } catch (error) {
        if (myGeneration !== generation || !state) return;
        const kind = failureKind(error);
        log('delete.failed', { jobId, reason: kind });
        // The outcome is unknown: the DELETE may well have reached the server. One GET tells us whether
        // the job is already deleting/deleted, so the screen does not claim "still on the server" wrongly.
        if (kind === 'network' && (await deleteReachedServer(jobId, myGeneration))) return;
        if (myGeneration !== generation || !state) return;
        void patch({ status: 'error', error: { reason: 'delete_failed', httpStatus: null }, offline: kind === 'network' });
      }
    },

    async startOver() {
      generation += 1;
      cancelPoll();
      postAttempts = 0;
      unchangedPolls = 0;
      notFoundPolls = 0;
      if (state?.localCopyUri) {
        try {
          localCopy.remove(state.localCopyUri);
        } catch {
          log('local_copy.remove_failed');
        }
      }
      log('start_over');
      await commit(null);
    },

    setActive(next) {
      active = next;
      if (next) {
        // The user is looking again: poll promptly and restart the backoff.
        unchangedPolls = 0;
        schedulePoll(0);
      } else {
        cancelPoll();
      }
    },

    dispose() {
      generation += 1;
      cancelPoll();
      listeners.clear();
    },
  };
}
