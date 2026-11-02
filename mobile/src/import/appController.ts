import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';

import { expoFileSystem } from '@/files/expoFileSystem';
import { expoPicker } from '@/files/expoPicker';
import { expoFileUploader } from '@/files/expoUploader';
import { acquireStatement, discardStatement, sweepOrphanCopies, type AcquireResult } from '@/files/pipeline';
import { log } from '@/logging/logger';
import { fileStore } from '@/storage/fileStore';

import { API_BASE_URL } from './config';
import { createImportController, type ImportController, type PreparedStatement } from './controller';
import { createOperationRecord } from './operationRecord';
import { createFetchTransport } from './transport';

/** Composition root for the device. A single instance per app. */
export interface AppImport {
  controller: ImportController;
  /** Picker → copy → validation. Does not touch the controller. */
  acquire(): Promise<AcquireResult>;
  /** The user cancelled on the confirmation card: the private copy is deleted right away. */
  discard(prepared: PreparedStatement): void;
  /** Reads the record, sweeps orphan copies, resumes the actions that are safe to resume. Idempotent. */
  start(): Promise<void>;
}

let instance: AppImport | undefined;
let started: Promise<void> | undefined;

export function getAppImport(): AppImport {
  if (instance) return instance;
  const controller = createImportController({
    transport: createFetchTransport({ baseUrl: () => API_BASE_URL, fetch: (url, init) => fetch(url, init), uploadFile: expoFileUploader }),
    record: createOperationRecord(fileStore),
    generateKey: randomUUID,
    localCopy: expoFileSystem,
    log,
  });
  AppState.addEventListener('change', (next) => controller.setActive(next === 'active'));

  instance = {
    controller,
    acquire: () => acquireStatement({ picker: expoPicker, fs: expoFileSystem, log, randomName: randomUUID }),
    discard: (prepared) => discardStatement(expoFileSystem, prepared, log),
    start() {
      started ??= (async () => {
        await controller.hydrate();
        sweepOrphanCopies(expoFileSystem, controller.getState()?.localCopyUri ?? null, log);
      })();
      return started;
    },
  };
  return instance;
}
