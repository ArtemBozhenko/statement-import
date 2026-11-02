import type { PreparedStatement } from '@/import/controller';
import { HEADER_BYTES, isSizeAcceptable, validateStatement, type RejectionReason } from '@/import/validation';
import type { Logger } from '@/logging/logger';

import type { StatementFileSystem, StatementPicker } from './ports';

/**
 * Obtaining a statement from the device: picker → size from metadata → private copy under
 * a random name → first 32 bytes → verdict. Any rejection deletes the copy immediately.
 */
export type AcquireResult =
  | { kind: 'canceled' }
  | { kind: 'rejected'; reason: RejectionReason; displayName: string; sizeBytes: number | null }
  | { kind: 'accepted'; prepared: PreparedStatement };

export interface AcquireDeps {
  picker: StatementPicker;
  fs: StatementFileSystem;
  log: Logger;
  randomName: () => string;
}

export async function acquireStatement({ picker, fs, log, randomName }: AcquireDeps): Promise<AcquireResult> {
  const picked = await picker.pick();
  try {
    if (picked.canceled) return { kind: 'canceled' };

    // 1. Size from metadata, before any copying. Android's File API answers 0 when the provider does not
    //    report a size, so 0 means "unknown" here, not "empty": an unknown size is settled on our own copy below.
    const reported = picked.sizeBytes ?? fs.sizeOf(picked.uri);
    const metaSize = reported !== null && reported > 0 ? reported : null;
    if (metaSize !== null && !isSizeAcceptable(metaSize)) {
      safeRemove(fs, picked.uri, log);
      log('pick.rejected', { reason: 'too_large' });
      return { kind: 'rejected', reason: 'too_large', displayName: picked.displayName, sizeBytes: metaSize };
    }

    // 2. Our own copy under a random name: the original name lives only in metadata.
    let localCopyUri: string;
    try {
      localCopyUri = await fs.importIntoImports(picked.uri, randomName());
    } catch (error) {
      safeRemove(fs, picked.uri, log);
      throw error;
    }

    // 2b. The copy is a plain file of ours, so its size is authoritative: this catches a provider that lied
    //     or stayed silent about the size. An empty or unreadable copy is rejected too.
    const copySize = fs.sizeOf(localCopyUri);
    const sizeBytes = copySize !== null && copySize > 0 ? copySize : null;
    if (sizeBytes === null || !isSizeAcceptable(sizeBytes)) {
      safeRemove(fs, localCopyUri, log);
      log('pick.rejected', { reason: 'too_large' });
      return { kind: 'rejected', reason: 'too_large', displayName: picked.displayName, sizeBytes };
    }

    // 3. Classification by the first bytes.
    const verdict = validateStatement(await fs.readHead(localCopyUri, HEADER_BYTES), sizeBytes);
    if (!verdict.ok) {
      safeRemove(fs, localCopyUri, log);
      log('pick.rejected', { reason: verdict.reason });
      return { kind: 'rejected', reason: verdict.reason, displayName: picked.displayName, sizeBytes };
    }

    log('pick.accepted');
    return { kind: 'accepted', prepared: { meta: { displayName: picked.displayName, sizeBytes, format: verdict.format }, localCopyUri } };
  } finally {
    // The picker's auxiliary copies are not needed in any outcome.
    purgeScratch(fs, log);
  }
}

function purgeScratch(fs: StatementFileSystem, log: Logger): number {
  try {
    const count = fs.purgePickerScratch();
    if (count > 0) log('picker_scratch.purged', { count });
    return count;
  } catch {
    log('picker_scratch.purge_failed');
    return 0;
  }
}

function safeRemove(fs: StatementFileSystem, uri: string, log: Logger) {
  try {
    fs.remove(uri);
  } catch {
    log('local_copy.remove_failed');
  }
}

/**
 * Cancel on the confirmation card: the copy is deleted now, not at the next start.
 * (If the app dies while the card is shown, the copy is an orphan with no operation holding it,
 * and `sweepOrphanCopies` removes it on the next launch.)
 */
export function discardStatement(fs: Pick<StatementFileSystem, 'remove'>, prepared: PreparedStatement, log: Logger): void {
  try {
    fs.remove(prepared.localCopyUri);
    log('pick.discarded');
  } catch {
    log('local_copy.remove_failed');
  }
}

/** Startup sweeper: deletes everything in the import folder except the current operation's copy. */
export function sweepOrphanCopies(fs: StatementFileSystem, keep: string | null, log: Logger): number {
  let removed = purgeScratch(fs, log);
  for (const uri of fs.listImports()) {
    if (uri === keep) continue;
    try {
      fs.remove(uri);
      removed += 1;
    } catch {
      log('local_copy.remove_failed');
    }
  }
  if (removed > 0) log('local_copy.swept', { count: removed });
  return removed;
}
