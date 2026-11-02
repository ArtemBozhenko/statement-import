import type { IgnoreReason } from '@/import/snapshot';
import type { RejectionReason } from '@/import/validation';

/**
 * Leak-free logger: the set of fields is closed at the type level. File names, bytes,
 * operation descriptions and URLs are absent by construction: there is nowhere to pass them.
 * `reason` is a closed union too, so a free-text message cannot slip in through it.
 */
export type LogReason = RejectionReason | IgnoreReason | 'network' | 'protocol' | 'unknown';

export interface LogFields {
  jobId?: string;
  status?: string;
  revision?: number;
  httpStatus?: number | null;
  attempt?: number;
  reason?: LogReason;
  count?: number;
}

export type Logger = (event: string, fields?: LogFields) => void;

/** Console output only in dev builds; in release the logger is silent. */
export const log: Logger = (event, fields) => {
  if (__DEV__) console.log(`[import] ${event}`, fields ? JSON.stringify(fields) : '');
};
