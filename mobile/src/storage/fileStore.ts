import { Directory, File, Paths } from 'expo-file-system';

import type { KeyValueStore } from './KeyValueStore';

/**
 * On-device storage: one file per key in the app's documents folder.
 * Unlike the cache, the documents folder is not purged by the system, and it needs no native dependencies.
 */
const dir = () => new Directory(Paths.document, 'statement-import-state');
const fileOf = (key: string) => new File(dir(), `${key}.json`);

export const fileStore: KeyValueStore = {
  getString(key) {
    const file = fileOf(key);
    return file.exists ? file.textSync() : undefined;
  },
  async set(key, value) {
    const folder = dir();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    const file = fileOf(key);
    if (!file.exists) file.create();
    await file.write(value);
  },
  async remove(key) {
    const file = fileOf(key);
    if (file.exists) file.delete();
  },
};
