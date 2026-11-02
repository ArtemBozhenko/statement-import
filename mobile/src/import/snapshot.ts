import type { Operation, ServerSnapshot } from './types';

/**
 * Pure application of a server snapshot to the operation. Rules:
 *  1. A snapshot for a different jobId is ignored.
 *  2. Until the job is confirmed, any snapshot with a jobId is accepted: that is the confirmation.
 *  3. From then on the revision must strictly grow: an old revision (stale_status) does not roll back the UI.
 *  4. After deleting/deleted only deleting/deleted are accepted: a late ready does not resurrect the job.
 *  5. ready without a result is rejected.
 */
export type IgnoreReason = 'foreign_job' | 'stale_revision' | 'after_delete' | 'ready_without_result';

export type ApplyResult = { applied: true; operation: Operation } | { applied: false; reason: IgnoreReason };

export function applyServerSnapshot(op: Operation, snapshot: ServerSnapshot): ApplyResult {
  if (op.jobId !== null && op.jobId !== snapshot.jobId) return { applied: false, reason: 'foreign_job' };
  if (op.jobId !== null && snapshot.revision <= op.revision) return { applied: false, reason: 'stale_revision' };
  const deleteStage = op.status === 'deleting' || op.status === 'deleted' || op.error?.reason === 'delete_failed';
  if (deleteStage && snapshot.status !== 'deleting' && snapshot.status !== 'deleted') return { applied: false, reason: 'after_delete' };
  if (snapshot.status === 'ready' && !snapshot.result) return { applied: false, reason: 'ready_without_result' };
  return {
    applied: true,
    operation: {
      ...op,
      status: snapshot.status,
      jobId: snapshot.jobId,
      revision: snapshot.revision,
      result: snapshot.status === 'ready' ? (snapshot.result ?? null) : op.result,
      error: null,
      offline: false,
    },
  };
}
