import { randomUUID } from 'node:crypto';

import { createMockControl, type MockControl } from '@/diagnostics/mockControl';
import { createImportController, type ImportController, type LocalCopyAccess, type PreparedStatement } from '@/import/controller';
import { createOperationRecord } from '@/import/operationRecord';
import { createFetchTransport, type FetchLike, type ImportTransport } from '@/import/transport';
import type { FileMeta, ImportState, Operation } from '@/import/types';
import type { LogFields } from '@/logging/logger';
import { createMemoryStore, type KeyValueStore } from '@/storage/KeyValueStore';

/**
 * Integration test bench: in-memory storage, fake local copies,
 * the real transport against the real mock, log capture.
 */
export class FakeLocalCopies implements LocalCopyAccess {
  readonly files = new Map<string, Uint8Array>();
  put(uri: string, bytes: Uint8Array) {
    this.files.set(uri, bytes);
  }
  exists(uri: string) {
    return this.files.has(uri);
  }
  remove(uri: string) {
    this.files.delete(uri);
  }
}

export interface Harness {
  controller: ImportController;
  transport: ImportTransport;
  mock: MockControl;
  store: KeyValueStore;
  copies: FakeLocalCopies;
  logs: { event: string; fields?: LogFields }[];
  /** Recreates the controller on the same storage, simulating an app relaunch. */
  relaunch(): Promise<Harness>;
}

export interface HarnessOptions {
  baseUrl: string;
  store?: KeyValueStore;
  copies?: FakeLocalCopies;
  fetchImpl?: FetchLike;
  keys?: () => string;
}

export function createHarness(options: HarnessOptions): Harness {
  const store = options.store ?? createMemoryStore();
  const copies = options.copies ?? new FakeLocalCopies();
  const logs: Harness['logs'] = [];
  const transport = createFetchTransport({
    baseUrl: () => options.baseUrl,
    fetch: options.fetchImpl ?? (fetch as unknown as FetchLike),
    // As expo-file-system would do it: the file bytes as the request body.
    uploadFile: async ({ url, uri, headers }) => {
      const bytes = copies.files.get(uri);
      if (!bytes) throw new Error(`no local copy at ${uri}`);
      const response = await fetch(url, { method: 'POST', headers, body: Buffer.from(bytes) });
      return { status: response.status, body: await response.text() };
    },
  });
  const controller = createImportController({
    transport,
    record: createOperationRecord(store),
    generateKey: options.keys ?? (() => randomUUID()),
    localCopy: copies,
    log: (event, fields) => logs.push({ event, fields }),
  });
  return {
    controller,
    transport,
    mock: createMockControl(() => options.baseUrl),
    store,
    copies,
    logs,
    async relaunch() {
      controller.dispose();
      const next = createHarness({ ...options, store, copies });
      await next.controller.hydrate();
      return next;
    },
  };
}

export function prepared(bytes: Uint8Array, meta: FileMeta, copies: FakeLocalCopies, uri = `file:///cache/imports/${meta.displayName}`): PreparedStatement {
  copies.put(uri, bytes);
  return { meta, localCopyUri: uri };
}

/** Waits until the state satisfies the predicate, or fails on timeout. */
export function waitFor(controller: ImportController, predicate: (state: ImportState) => boolean, timeoutMs = 10_000): Promise<Operation> {
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    let settled = false;
    const timer = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(`state did not match within ${timeoutMs}ms; last status: ${controller.getState()?.status ?? 'null'}`));
    }, timeoutMs);
    unsubscribe = controller.subscribe((state) => {
      if (settled || !predicate(state)) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(state as Operation);
    });
    if (settled) unsubscribe();
  });
}

export const statusIs = (status: Operation['status']) => (state: ImportState) => state?.status === status;
