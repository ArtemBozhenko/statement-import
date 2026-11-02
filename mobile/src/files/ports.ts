/**
 * File layer ports: exactly what the pipeline and the controller need.
 * Expo implementations live next to them, fakes in the tests. All URIs are strings in the platform's format.
 */

/** Result of the system picker. Size and MIME are OS hints; we do not trust them for validation. */
export type PickResult = { canceled: true } | { canceled: false; uri: string; displayName: string; sizeBytes: number | null };

export interface StatementPicker {
  pick(): Promise<PickResult>;
}

export interface StatementFileSystem {
  exists(uri: string): boolean;
  /** Size from metadata without reading the contents; null if the OS does not provide it. */
  sizeOf(uri: string): number | null;
  /**
   * Brings the picked document into the private import folder under a new name and returns the new URI.
   * A file in our own sandbox (iOS Inbox) is moved; a document behind a `content://` URI (Android) is
   * copied, and the user's original is never touched.
   */
  importIntoImports(sourceUri: string, targetName: string): Promise<string>;
  /** Reads the first `length` bytes without loading the whole file. */
  readHead(uri: string, length: number): Promise<Uint8Array>;
  /** Deletes a file in our own sandbox. A URI outside it (`content://`) is left alone. */
  remove(uri: string): void;
  /** All files in the import folder. */
  listImports(): string[];
  /** Deletes the copies the system picker left in its auxiliary folders. Returns their count. */
  purgePickerScratch(): number;
}
