import type { Operation } from './types';

/**
 * Pure mapping of the operation to what the user sees. No guesswork:
 * 202 means "sent", not "done"; "deleted" appears only after the server confirms it.
 */
export type Tone = 'info' | 'success' | 'warning' | 'danger';

export type ImportAction = 'retry_upload' | 'delete' | 'retry_delete' | 'start_over';

export interface PhaseView {
  title: string;
  body: string;
  tone: Tone;
  /** The operation is waiting on the server: show an indicator. */
  busy: boolean;
  actions: ImportAction[];
  /** Connectivity line shown when the last request did not reach the server. */
  offlineHint: string | null;
}

const POLLING = new Set<Operation['status']>(['queued', 'processing', 'deleting']);

/** The hint promises a retry only where the controller actually keeps polling. */
function offlineHint(op: Operation): string | null {
  if (!op.offline) return null;
  if (POLLING.has(op.status)) return 'No connection. Retrying…';
  if (op.status === 'ready') return 'Couldn’t check for updates. Showing the last known report.';
  return 'No connection. Check your network and try again.';
}

export function describeOperation(op: Operation): PhaseView {
  const base = { offlineHint: offlineHint(op) };
  switch (op.status) {
    case 'uploading':
      // After a relaunch, or after a POST with no answer, only a GET by key runs: no bytes are being sent.
      return op.checking
        ? { ...base, title: 'Checking the upload…', body: 'Looking for your statement on the server.', tone: 'info', busy: true, actions: [] }
        : { ...base, title: 'Uploading…', body: 'Sending your statement.', tone: 'info', busy: true, actions: [] };
    case 'queued':
      return { ...base, title: 'Queued', body: 'Waiting for the server to start.', tone: 'info', busy: true, actions: ['delete'] };
    case 'processing':
      return { ...base, title: 'Processing', body: 'Looking for recurring charges.', tone: 'info', busy: true, actions: ['delete'] };
    case 'ready': {
      const count = op.result?.items.length ?? 0;
      return { ...base, title: 'Report ready', body: `${count} recurring charge${count === 1 ? '' : 's'} found.`, tone: 'success', busy: false, actions: ['delete', 'start_over'] };
    }
    case 'deleting':
      // Start over is offered as an exit if the server never confirms; the copy says nothing about the data being gone.
      return { ...base, title: 'Deleting…', body: 'Waiting for the server to confirm. Until then the data may still be on the server.', tone: 'info', busy: true, actions: ['start_over'] };
    case 'deleted':
      return { ...base, title: 'Import deleted', body: 'Removed from the server.', tone: 'success', busy: false, actions: ['start_over'] };
    case 'error':
      return { ...base, ...describeError(op), busy: false };
  }
}

function describeError(op: Operation): Pick<PhaseView, 'title' | 'body' | 'tone' | 'actions'> {
  const httpStatus = op.error?.httpStatus ?? null;
  switch (op.error?.reason) {
    case 'upload_unconfirmed':
      return {
        title: 'Upload not confirmed',
        body: 'Retrying won’t create a duplicate.',
        tone: 'warning',
        actions: ['retry_upload', 'start_over'],
      };
    case 'delete_failed':
      return httpStatus === null
        ? {
            // No answer at all, and the server did not show the job as deleting: the request most likely never arrived.
            title: 'Couldn’t confirm the deletion',
            body: 'The request may not have reached the server. Retrying is safe.',
            tone: 'warning',
            actions: ['retry_delete', 'start_over'],
          }
        : {
            title: 'Couldn’t delete',
            body: 'Your data is still on the server. Retry, or start a new import and leave it there.',
            tone: 'danger',
            actions: ['retry_delete', 'start_over'],
          };
    case 'job_missing':
      return {
        title: 'Import not found',
        body: 'The server no longer has this import. Start a new import.',
        tone: 'warning',
        actions: ['start_over'],
      };
    default:
      return {
        title: 'Couldn’t upload',
        body:
          httpStatus === 409
            ? 'A different file was already sent for this import. Start a new import.'
            : 'The server didn’t accept this file. Start a new import.',
        tone: 'danger',
        actions: ['start_over'],
      };
  }
}

export const ACTION_LABELS: Record<ImportAction, string> = {
  retry_upload: 'Retry upload',
  delete: 'Delete import',
  retry_delete: 'Retry delete',
  start_over: 'Start new import',
};
