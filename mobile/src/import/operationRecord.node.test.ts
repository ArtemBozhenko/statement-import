import { createMemoryStore } from '@/storage/KeyValueStore';

import { createOperationRecord, OPERATION_RECORD_KEY, parseOperation } from './operationRecord';
import type { Operation } from './types';

const base: Operation = {
  key: 'key-00000001',
  deleteKey: 'del-00000001',
  file: { displayName: 'statement.pdf', sizeBytes: 33882, format: 'pdf' },
  localCopyUri: null,
  status: 'ready',
  jobId: 'job-demo-001',
  revision: 3,
  result: { currency: 'AUD', items: [{ id: 'rec-001', merchant: 'StreamBeam', amountMinor: 1999, cadence: 'monthly', lastSeen: '2026-10-01' }] },
  error: null,
  offline: false,
};

describe('operation record', () => {
  it('round-trips an operation and the key survives a store re-open', async () => {
    const store = createMemoryStore();
    await createOperationRecord(store).write({ ...base, status: 'uploading' });
    expect(createOperationRecord(store).read()).toEqual({ ...base, status: 'uploading' });
    expect(store.getString(OPERATION_RECORD_KEY)).toContain('key-00000001');
  });

  it('treats a malformed record as absent instead of throwing', () => {
    expect(parseOperation(undefined)).toBeUndefined();
    expect(parseOperation('not json')).toBeUndefined();
    expect(parseOperation(JSON.stringify({ ...base, key: 42 }))).toBeUndefined();
    expect(parseOperation(JSON.stringify({ ...base, status: 'mystery' }))).toBeUndefined();
  });
});
