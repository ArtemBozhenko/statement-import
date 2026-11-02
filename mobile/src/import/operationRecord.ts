import type { KeyValueStore } from '@/storage/KeyValueStore';

import type { ImportStatus, Operation } from './types';

/**
 * Persistent operation record. We read what we wrote ourselves, so validation is
 * minimal: a corrupt record is treated as missing rather than crashing startup.
 */
export const OPERATION_RECORD_KEY = 'import.operation';

const STATUSES: ImportStatus[] = ['uploading', 'queued', 'processing', 'ready', 'deleting', 'deleted', 'error'];

export function parseOperation(text: string | undefined): Operation | undefined {
  if (text === undefined) return undefined;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return undefined;
    const op = raw as Operation;
    if (typeof op.key !== 'string' || !STATUSES.includes(op.status) || typeof op.file?.displayName !== 'string') return undefined;
    return op;
  } catch {
    return undefined;
  }
}

export interface OperationRecord {
  read(): Operation | undefined;
  write(op: Operation): Promise<void>;
  clear(): Promise<void>;
}

export function createOperationRecord(store: KeyValueStore): OperationRecord {
  return {
    read: () => parseOperation(store.getString(OPERATION_RECORD_KEY)),
    write: (op) => store.set(OPERATION_RECORD_KEY, JSON.stringify(op)),
    clear: () => store.remove(OPERATION_RECORD_KEY),
  };
}
