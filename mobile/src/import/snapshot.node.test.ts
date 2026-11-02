import { applyServerSnapshot } from './snapshot';
import type { ImportResult, Operation, ServerSnapshot } from './types';

const result: ImportResult = {
  currency: 'AUD',
  items: [
    { id: 'rec-001', merchant: 'StreamBeam', amountMinor: 1999, cadence: 'monthly', lastSeen: '2026-10-01' },
    { id: 'rec-002', merchant: 'BrightGrid', amountMinor: 13200, cadence: 'monthly', lastSeen: '2026-10-03' },
  ],
};

const JOB = 'job-demo-001';
function op(extra: Partial<Operation>): Operation {
  return {
    key: 'key-00000001',
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
const tracking = (status: 'queued' | 'processing', revision: number) => op({ status, jobId: JOB, revision });
const readyOp = op({ status: 'ready', jobId: JOB, revision: 3, result });

const queued: ServerSnapshot = { jobId: JOB, status: 'queued', revision: 1 };
const processing: ServerSnapshot = { jobId: JOB, status: 'processing', revision: 2 };
const ready: ServerSnapshot = { jobId: JOB, status: 'ready', revision: 3, result };
const deleting: ServerSnapshot = { jobId: JOB, status: 'deleting', revision: 4 };
const deleted: ServerSnapshot = { jobId: JOB, status: 'deleted', revision: 5 };

const apply = (o: Operation, s: ServerSnapshot) => {
  const r = applyServerSnapshot(o, s);
  if (!r.applied) throw new Error(`unexpectedly ignored: ${r.reason}`);
  return r.operation;
};
const ignored = (o: Operation, s: ServerSnapshot) => {
  const r = applyServerSnapshot(o, s);
  return r.applied ? 'applied' : r.reason;
};

describe('applyServerSnapshot', () => {
  it('confirms a job from uploading at any revision (POST response or by-key lookup)', () => {
    expect(apply(op({}), queued)).toMatchObject({ status: 'queued', jobId: JOB, revision: 1 });
    expect(apply(op({ status: 'error', error: { reason: 'upload_unconfirmed', httpStatus: null } }), ready)).toMatchObject({ status: 'ready', revision: 3, result, error: null });
  });

  it('advances queued → processing → ready and takes items only from ready', () => {
    const afterProcessing = apply(tracking('queued', 1), processing);
    expect(afterProcessing).toMatchObject({ status: 'processing', revision: 2, result: null });
    expect(apply(afterProcessing, ready)).toMatchObject({ status: 'ready', revision: 3, result });
  });

  it('stale_status: processing/2 after ready/3 is ignored and the UI stays ready', () => {
    expect(ignored(readyOp, processing)).toBe('stale_revision');
  });

  it('an equal revision is not applied either', () => {
    expect(ignored(tracking('processing', 2), processing)).toBe('stale_revision');
  });

  it('a snapshot for another jobId is ignored', () => {
    expect(ignored(tracking('queued', 1), { jobId: 'job-demo-999', status: 'ready', revision: 3, result })).toBe('foreign_job');
  });

  it('a late ready never resurrects a deleting, deleted or delete_failed job', () => {
    const lateReady: ServerSnapshot = { jobId: JOB, status: 'ready', revision: 9, result };
    expect(ignored(op({ status: 'deleting', jobId: JOB, revision: 4 }), lateReady)).toBe('after_delete');
    expect(ignored(op({ status: 'deleted', jobId: JOB, revision: 5 }), lateReady)).toBe('after_delete');
    expect(ignored(op({ status: 'error', jobId: JOB, revision: 3, error: { reason: 'delete_failed', httpStatus: 503 } }), lateReady)).toBe('after_delete');
  });

  it('delete_failed → deleting → deleted is accepted (retry succeeded) and clears the error', () => {
    const r1 = apply(op({ status: 'error', jobId: JOB, revision: 3, error: { reason: 'delete_failed', httpStatus: 503 } }), deleting);
    expect(r1).toMatchObject({ status: 'deleting', revision: 4, error: null });
    expect(apply(r1, deleted)).toMatchObject({ status: 'deleted', revision: 5 });
  });

  it('a ready snapshot without result is refused', () => {
    expect(ignored(tracking('processing', 2), { jobId: JOB, status: 'ready', revision: 3 })).toBe('ready_without_result');
  });

  it('applying a snapshot clears the offline flag', () => {
    expect(apply(op({ ...tracking('queued', 1), offline: true }), processing).offline).toBe(false);
  });
});
