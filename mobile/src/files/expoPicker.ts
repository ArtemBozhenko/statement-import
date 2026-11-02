import * as DocumentPicker from 'expo-document-picker';

import type { StatementPicker } from './ports';

/**
 * System picker. The type list is a hint for the OS; the real check is done on the bytes.
 * On Android CSV often arrives as text/plain, hence it is in the list.
 *
 * `copyToCacheDirectory` is off on both platforms, so the picker itself never copies the file:
 *  - iOS: the import-mode picker always places the document in `tmp/<bundle>-Inbox` (that copy is
 *    made by the system and cannot be avoided); the pipeline moves it into our own folder.
 *  - Android: we get the `content://` URI itself. The size comes from the provider's metadata, so an
 *    oversize file is rejected before a single byte is copied; an accepted one is copied by us.
 */
export const PICKER_TYPES = ['application/pdf', 'text/csv', 'text/comma-separated-values', 'text/plain'];

export const expoPicker: StatementPicker = {
  async pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, multiple: false, copyToCacheDirectory: false });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return { canceled: true };
    return { canceled: false, uri: asset.uri, displayName: asset.name, sizeBytes: typeof asset.size === 'number' ? asset.size : null };
  },
};
