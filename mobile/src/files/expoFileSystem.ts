import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type { StatementFileSystem } from './ports';

/**
 * File port on expo-file-system (File/Directory classes). The import folder lives in the cache:
 * the system may purge it, and backups do not include it.
 */
const IMPORTS_DIR = 'statement-imports';
/** Where expo-document-picker puts its copy when `copyToCacheDirectory` is on; kept as a safety net. */
const PICKER_CACHE_DIR = 'DocumentPicker';

const importsDirectory = () => new Directory(Paths.cache, IMPORTS_DIR);

/** Only `file://` URIs point into our sandbox; `content://` is someone else's document. */
const isSandboxFile = (uri: string) => uri.startsWith('file://');

export const expoFileSystem: StatementFileSystem = {
  exists: (uri) => new File(uri).exists,

  sizeOf(uri) {
    // For content:// the File class asks the provider; some providers report no size, hence null.
    const file = new File(uri);
    if (!file.exists) return null;
    const { size } = file;
    return typeof size === 'number' && Number.isFinite(size) ? size : null;
  },

  async importIntoImports(sourceUri, targetName) {
    const dir = importsDirectory();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const destination = new File(dir, targetName);
    const source = new File(sourceUri);
    if (isSandboxFile(sourceUri)) {
      // iOS: the picker's Inbox file is ours to move, which also empties the Inbox.
      await source.move(destination);
    } else {
      // Android: stream the document through the content resolver into our folder; the original stays.
      await source.copy(destination);
    }
    return destination.uri;
  },

  async readHead(uri, length) {
    const handle = new File(uri).open(FileMode.ReadOnly);
    try {
      return await handle.readBytes(length);
    } finally {
      handle.close();
    }
  },

  remove(uri) {
    // Never delete through a content:// URI: that would delete the user's document, not a copy.
    if (!isSandboxFile(uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  },

  listImports() {
    const dir = importsDirectory();
    return dir.exists ? dir.list().flatMap((entry) => (entry instanceof File ? [entry.uri] : [])) : [];
  },

  purgePickerScratch() {
    const dir = new Directory(Paths.cache, PICKER_CACHE_DIR);
    if (!dir.exists) return 0;
    const files = dir.list().filter((entry): entry is File => entry instanceof File);
    for (const file of files) file.delete();
    return files.length;
  },
};
