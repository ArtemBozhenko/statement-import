import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { OPERATION_RECORD_KEY } from '@/import/operationRecord';
import type { FileMeta, Operation } from '@/import/types';
import { HEADER_BYTES, validateStatement } from '@/import/validation';

import { createHarness, prepared, statusIs, waitFor, type Harness } from './harness';
import { startMockServer, type RunningMock } from './mockServer';

/**
 * The assignment's acceptance matrix against the real mock from the kit.
 * Each matrix row is a separate test that checks the /__test/state counters.
 */
const fixtures = join(__dirname, '..', '..', '..', 'kit', 'fixtures');
const csvBytes = new Uint8Array(readFileSync(join(fixtures, 'statement.csv')));
const pdfBytes = new Uint8Array(readFileSync(join(fixtures, 'statement.pdf')));
const spoofedBytes = new Uint8Array(readFileSync(join(fixtures, 'spoofed.pdf')));

const csvMeta: FileMeta = { displayName: 'statement.csv', sizeBytes: csvBytes.length, format: 'csv' };
const pdfMeta: FileMeta = { displayName: 'statement.pdf', sizeBytes: pdfBytes.length, format: 'pdf' };
const COPY = 'file:///cache/imports/statement.csv';

/** An "app died in the middle of the POST" record for the restart test. */
const uploadingRecord = (key: string): Operation => ({
  key,
  deleteKey: null,
  file: csvMeta,
  localCopyUri: COPY,
  status: 'uploading',
  jobId: null,
  revision: 0,
  result: null,
  error: null,
  offline: false,
});

let mock: RunningMock;
let harness: Harness;

beforeAll(async () => {
  mock = await startMockServer();
});
afterAll(async () => {
  await mock.stop();
});
beforeEach(async () => {
  harness = createHarness({ baseUrl: mock.baseUrl });
  await harness.mock.reset();
  await harness.mock.setScenario('happy');
});
afterEach(() => harness.controller.dispose());

describe('happy', () => {
  it.each([
    ['statement.csv', csvBytes, csvMeta],
    ['statement.pdf', pdfBytes, pdfMeta],
  ])('%s: real bytes are sent, 202 is not ready, ready shows two items totalling 151.99 AUD', async (_name, bytes, meta) => {
    const { controller, copies } = harness;
    await controller.beginUpload(prepared(bytes, meta, copies));

    // Right after the POST: only the job acknowledgement, not the report.
    expect(controller.getState()).toMatchObject({ status: 'queued', localCopyUri: null });

    const ready = await waitFor(controller, statusIs('ready'));
    expect(ready.result?.currency).toBe('AUD');
    expect(ready.result?.items.map((i) => i.merchant)).toEqual(['StreamBeam', 'BrightGrid']);
    expect(ready.result?.items.reduce((sum, i) => sum + i.amountMinor, 0)).toBe(15199);

    expect((await harness.mock.state()).stats).toMatchObject({ createRequests: 1, newJobs: 1, duplicateHits: 0, acceptedBytes: bytes.length });
  });

  it('a ready operation survives relaunch: one GET to confirm the job, no POST', async () => {
    await harness.controller.beginUpload(prepared(csvBytes, csvMeta, harness.copies));
    await waitFor(harness.controller, statusIs('ready'));
    const before = (await harness.mock.state()).stats;
    harness = await harness.relaunch();
    expect(harness.controller.getState()?.status).toBe('ready');
    expect((await harness.mock.state()).stats).toEqual(before); // createRequests did not grow
    expect(harness.logs.filter((l) => l.event.startsWith('snapshot.'))).toHaveLength(1);
  });
});

describe('lost_ack', () => {
  it('first POST creates a job without a response; recovery by key finds it; exactly one job exists', async () => {
    await harness.mock.setScenario('lost_ack');
    await harness.controller.beginUpload(prepared(csvBytes, csvMeta, harness.copies));
    const confirmed = await waitFor(harness.controller, (s) => s?.status === 'queued' || s?.status === 'processing' || s?.status === 'ready');
    expect(confirmed.jobId).toBe('job-demo-001');

    const state = await harness.mock.state();
    expect(state.stats).toMatchObject({ createRequests: 1, newJobs: 1 });
    expect(state.jobs).toHaveLength(1);
    expect(harness.logs.some((l) => l.event === 'recovery.found_by_key')).toBe(true);
  });

  it('the idempotency key is persisted before the first byte leaves', async () => {
    const { store, copies } = harness;
    let keyAtRequestTime: string | undefined;
    harness.controller.dispose();
    harness = createHarness({ baseUrl: mock.baseUrl, store, copies, keys: () => 'fixed-key-0001' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/imports')) keyAtRequestTime = JSON.parse(store.getString(OPERATION_RECORD_KEY) ?? 'null')?.key;
      return originalFetch(url, init);
    }) as typeof fetch;
    try {
      await harness.controller.beginUpload(prepared(csvBytes, csvMeta, copies));
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(keyAtRequestTime).toBe('fixed-key-0001');
    await waitFor(harness.controller, statusIs('ready'));
  });

  it('after relaunch mid-upload only GET by-key runs; no automatic POST', async () => {
    const { copies, store } = harness;
    // Under lost_ack the first POST creates the job but gets no response: the server drops the connection.
    await harness.mock.setScenario('lost_ack');
    const raw = await fetch(`${mock.baseUrl}/imports`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'relaunch-key-0001', 'X-File-Name': 'statement.csv', 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(csvBytes),
    }).catch(() => null);
    expect(raw).toBeNull();
    await store.set(OPERATION_RECORD_KEY, JSON.stringify(uploadingRecord('relaunch-key-0001')));
    copies.put(COPY, csvBytes);
    await harness.mock.setScenario('happy');
    const before = (await harness.mock.state()).stats;

    harness = await harness.relaunch();
    const found = await waitFor(harness.controller, (s) => s?.jobId !== null);
    expect(found.jobId).toBe('job-demo-001');
    const after = (await harness.mock.state()).stats;
    expect(after.createRequests).toBe(before.createRequests); // no POST was sent
    expect(after.newJobs).toBe(1);
  });

  it('after relaunch with no job on the server the user gets a manual retry, not an automatic POST', async () => {
    const { copies, store } = harness;
    await store.set(OPERATION_RECORD_KEY, JSON.stringify(uploadingRecord('never-sent-key-01')));
    copies.put(COPY, csvBytes);
    harness = await harness.relaunch();
    expect(harness.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_unconfirmed' } });
    expect((await harness.mock.state()).stats.createRequests).toBe(0);

    // A manual retry with the same key uses the local copy and creates exactly one job.
    await harness.controller.retryUpload();
    await waitFor(harness.controller, statusIs('ready'));
    expect((await harness.mock.state()).stats).toMatchObject({ createRequests: 1, newJobs: 1 });
  });
});

describe('stale_status', () => {
  it('processing/2 after ready/3 does not roll the UI back', async () => {
    // In this scenario the first GET returns ready/3, the second one processing/2.
    await harness.mock.setScenario('stale_status');
    await harness.controller.beginUpload(prepared(csvBytes, csvMeta, harness.copies));
    const ready = await waitFor(harness.controller, statusIs('ready'));
    expect(ready.revision).toBe(3);
    // The second GET happens on relaunch (a single verification GET for ready).
    harness = await harness.relaunch();
    expect(harness.controller.getState()).toMatchObject({ status: 'ready', revision: 3 });
    const stale = harness.logs.filter((l) => l.event === 'snapshot.ignored');
    expect(stale).toHaveLength(1);
    expect(stale[0]?.fields).toMatchObject({ jobId: ready.jobId, status: 'processing', revision: 2, reason: 'stale_revision' });
  });
});

describe('delete_failure', () => {
  it('503 keeps server data; retry with the same key reaches deleting, then deleted', async () => {
    const { controller, copies, transport } = harness;
    await controller.beginUpload(prepared(csvBytes, csvMeta, copies));
    await waitFor(controller, statusIs('ready'));

    await harness.mock.setScenario('delete_failure');
    await controller.requestDelete();
    expect(controller.getState()).toMatchObject({ status: 'error', error: { reason: 'delete_failed', httpStatus: 503 } });
    const deleteKey = controller.getState()?.deleteKey;
    expect(deleteKey).toBeTruthy();

    // On the server the job is still ready; no deletion happened.
    const serverView = await transport.getJob('job-demo-001');
    expect(serverView.kind === 'found' && serverView.snapshot.status).toBe('ready');

    await harness.mock.setScenario('happy');
    await controller.requestDelete();
    expect(controller.getState()).toMatchObject({ status: 'deleting', deleteKey }); // the same delete key

    const deleted = await waitFor(controller, statusIs('deleted'));
    expect(deleted).toMatchObject({ jobId: 'job-demo-001', revision: 5 });
    expect((await harness.mock.state()).stats.deleteRequests).toBe(2);
  });

  it('deleting is never reported as deleted before the server says so, and does not come back', async () => {
    const { controller, copies } = harness;
    await controller.beginUpload(prepared(csvBytes, csvMeta, copies));
    await waitFor(controller, statusIs('ready'));
    await controller.requestDelete();
    expect(controller.getState()?.status).toBe('deleting');
    await waitFor(controller, statusIs('deleted'));
    await new Promise((r) => setTimeout(r, 300));
    expect(controller.getState()?.status).toBe('deleted');
  });
});

describe('spoofed + oversize', () => {
  it('both files are rejected locally and createRequests does not change', async () => {
    const before = (await harness.mock.state()).stats.createRequests;
    expect(validateStatement(spoofedBytes.subarray(0, HEADER_BYTES), spoofedBytes.length)).toEqual({ ok: false, reason: 'not_pdf_or_csv' });
    expect(validateStatement(csvBytes.subarray(0, HEADER_BYTES), 10 * 1024 * 1024 + 1)).toEqual({ ok: false, reason: 'too_large' });
    expect(harness.controller.getState()).toBeNull();
    expect((await harness.mock.state()).stats.createRequests).toBe(before);
  });

  it('the server would also reject them (defence in depth), and that lands in error without a retry', async () => {
    await harness.controller.beginUpload(prepared(spoofedBytes, { displayName: 'spoofed.pdf', sizeBytes: spoofedBytes.length, format: 'pdf' }, harness.copies));
    expect(harness.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_rejected', httpStatus: 415 }, jobId: null });
    expect((await harness.mock.state()).stats.newJobs).toBe(0);
  });
});

describe('key reuse with different bytes', () => {
  it('409 lands in error and no second job appears', async () => {
    const { copies, store } = harness;
    harness.controller.dispose();
    harness = createHarness({ baseUrl: mock.baseUrl, store, copies, keys: () => 'same-key-000001' });
    await harness.controller.beginUpload(prepared(csvBytes, csvMeta, copies));
    await waitFor(harness.controller, statusIs('ready'));
    await harness.controller.startOver();

    const other = createHarness({ baseUrl: mock.baseUrl, copies, keys: () => 'same-key-000001' });
    await other.controller.beginUpload(prepared(pdfBytes, pdfMeta, copies, 'file:///cache/imports/other.pdf'));
    expect(other.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_rejected', httpStatus: 409 } });
    other.controller.dispose();
    expect((await harness.mock.state()).stats.newJobs).toBe(1);
  });
});

describe('start over', () => {
  it('clears the record and removes the local copy', async () => {
    const { copies, store } = harness;
    const p = prepared(csvBytes, csvMeta, copies);
    // The server is unreachable: the operation holds the copy, startOver must remove it.
    harness.controller.dispose();
    harness = createHarness({ baseUrl: 'http://127.0.0.1:1', store, copies });
    await harness.controller.beginUpload(p);
    expect(harness.controller.getState()).toMatchObject({ status: 'error', error: { reason: 'upload_unconfirmed' }, offline: true });
    expect(copies.files.has(p.localCopyUri)).toBe(true);
    await harness.controller.startOver();
    expect(harness.controller.getState()).toBeNull();
    expect(store.getString(OPERATION_RECORD_KEY)).toBeUndefined();
    expect(copies.files.has(p.localCopyUri)).toBe(false);
  });
});
