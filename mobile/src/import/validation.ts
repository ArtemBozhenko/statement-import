import { MAX_STATEMENT_BYTES, type StatementFormat } from './types';

/**
 * Local file validation before the POST. Mirrors the mock server rules:
 *  - PDF: the first 5 bytes equal `%PDF-`;
 *  - CSV: the first 24 bytes with `\r` removed start with `date,description,amount\n`;
 *  - size strictly larger than 10 MiB is rejected.
 * The extension and the declared MIME type are not trusted at all. The function is pure: it takes the header
 * (the first bytes of the file) and the size from metadata; the whole file is never read.
 */

/** How many header bytes are enough to read for classification. */
export const HEADER_BYTES = 32;

export type RejectionReason = 'too_large' | 'not_pdf_or_csv';

export type Verdict = { ok: true; format: StatementFormat } | { ok: false; reason: RejectionReason };

const PDF_MAGIC = asciiBytes('%PDF-');
const CSV_HEADER = asciiBytes('date,description,amount\n');
const CR = 0x0d;

function asciiBytes(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

function startsWith(bytes: ArrayLike<number>, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) if (bytes[i] !== prefix[i]) return false;
  return true;
}

/** Detects the format from the first bytes. null means neither PDF nor CSV. */
export function detectFormat(header: Uint8Array): StatementFormat | null {
  if (startsWith(header, PDF_MAGIC)) return 'pdf';
  // The server takes the first 24 bytes, drops CRs and compares against the header including the `\n`.
  const first24 = Array.from(header.subarray(0, 24)).filter((b) => b !== CR);
  if (startsWith(first24, CSV_HEADER)) return 'csv';
  return null;
}

/** Verdict from the header and size. Size is checked first: a large file is not read at all. */
export function validateStatement(header: Uint8Array, sizeBytes: number): Verdict {
  if (sizeBytes > MAX_STATEMENT_BYTES) return { ok: false, reason: 'too_large' };
  const format = detectFormat(header);
  if (!format) return { ok: false, reason: 'not_pdf_or_csv' };
  return { ok: true, format };
}

/** Standalone size check, to reject before copying and reading the file. */
export function isSizeAcceptable(sizeBytes: number): boolean {
  return sizeBytes <= MAX_STATEMENT_BYTES;
}
