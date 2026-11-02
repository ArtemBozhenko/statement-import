import { describeOperation } from './presentation';
import type { Operation } from './types';

function op(extra: Partial<Operation>): Operation {
  return {
    key: 'k',
    deleteKey: null,
    file: { displayName: 'statement.csv', sizeBytes: 112, format: 'csv' },
    localCopyUri: null,
    status: 'uploading',
    jobId: null,
    revision: 0,
    result: null,
    error: null,
    offline: false,
    ...extra,
  };
}

describe('describeOperation', () => {
  it('never calls an accepted upload "ready"', () => {
    const view = describeOperation(op({ status: 'queued', jobId: 'j', revision: 1 }));
    expect(view.title).toBe('Queued');
    expect(view.title.toLowerCase()).not.toContain('ready');
    expect(view.busy).toBe(true);
  });

  it('offers a manual retry only for an unconfirmed upload, never after a server rejection', () => {
    expect(describeOperation(op({ status: 'error', error: { reason: 'upload_unconfirmed', httpStatus: null } })).actions).toEqual(['retry_upload', 'start_over']);
    expect(describeOperation(op({ status: 'error', error: { reason: 'upload_rejected', httpStatus: 415 } })).actions).toEqual(['start_over']);
  });

  it('explains a 409 as a key reused with different bytes', () => {
    expect(describeOperation(op({ status: 'error', error: { reason: 'upload_rejected', httpStatus: 409 } })).body).toContain('A different file was already sent');
  });

  it('ready offers delete and start over only', () => {
    expect(describeOperation(op({ status: 'ready', jobId: 'j', revision: 3, result: { currency: 'AUD', items: [] } })).actions).toEqual(['delete', 'start_over']);
  });

  it('claims deletion only after the server confirmed it', () => {
    expect(describeOperation(op({ status: 'deleting', jobId: 'j', revision: 4 })).title).toBe('Deleting…');
    expect(describeOperation(op({ status: 'error', jobId: 'j', revision: 3, error: { reason: 'delete_failed', httpStatus: 503 } })).body).toContain('still on the server');
    expect(describeOperation(op({ status: 'deleted', jobId: 'j', revision: 5 })).title).toBe('Import deleted');
  });

  it('surfaces a network problem as a hint, not as an error status', () => {
    const view = describeOperation(op({ status: 'processing', jobId: 'j', revision: 2, offline: true }));
    expect(view.tone).toBe('info');
    expect(view.offlineHint).toContain('No connection');
  });

  it('promises "Retrying" only where polling is actually running', () => {
    expect(describeOperation(op({ status: 'queued', jobId: 'j', revision: 1, offline: true })).offlineHint).toMatch(/Retrying/);
    expect(describeOperation(op({ status: 'error', error: { reason: 'upload_unconfirmed', httpStatus: null }, offline: true })).offlineHint).not.toMatch(/Retrying/);
    expect(describeOperation(op({ status: 'ready', jobId: 'j', revision: 3, result: { currency: 'AUD', items: [] }, offline: true })).offlineHint).toMatch(/last known report/);
  });

  it('says "checking", not "sending", while only a GET by key runs', () => {
    expect(describeOperation(op({ status: 'uploading' })).title).toBe('Uploading…');
    const checking = describeOperation(op({ status: 'uploading', checking: true }));
    expect(checking.title).toBe('Checking the upload…');
    expect(checking.body).not.toMatch(/Sending/);
  });

  it('deleting offers start over as an exit without claiming the data is gone', () => {
    const view = describeOperation(op({ status: 'deleting', jobId: 'j', revision: 4 }));
    expect(view.actions).toEqual(['start_over']);
    expect(view.body).toMatch(/may still be on the server/);
  });

  it('a DELETE with no answer is not reported as "still on the server"', () => {
    const view = describeOperation(op({ status: 'error', jobId: 'j', revision: 3, error: { reason: 'delete_failed', httpStatus: null } }));
    expect(view.body).not.toContain('still on the server');
    expect(view.body).toContain('Retrying is safe');
    expect(view.actions).toEqual(['retry_delete', 'start_over']);
  });

  it('a failed delete and a vanished job both leave a way out', () => {
    expect(describeOperation(op({ status: 'error', jobId: 'j', revision: 3, error: { reason: 'delete_failed', httpStatus: 503 } })).actions).toEqual(['retry_delete', 'start_over']);
    const missing = describeOperation(op({ status: 'error', jobId: 'j', revision: 1, error: { reason: 'job_missing', httpStatus: 404 } }));
    expect(missing.actions).toEqual(['start_over']);
    expect(missing.busy).toBe(false);
    expect(missing.title).toBe('Import not found');
  });
});
