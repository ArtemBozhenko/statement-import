import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAX_STATEMENT_BYTES } from './types';
import { detectFormat, HEADER_BYTES, isSizeAcceptable, validateStatement } from './validation';

const kit = join(__dirname, '..', '..', '..', 'kit', 'fixtures');
const header = (name: string) => new Uint8Array(readFileSync(join(kit, name)).subarray(0, HEADER_BYTES));
const ascii = (text: string) => new Uint8Array(Array.from(text, (c) => c.charCodeAt(0)));

describe('validateStatement', () => {
  it('accepts the kit PDF fixture by magic bytes', () => {
    expect(validateStatement(header('statement.pdf'), 33882)).toEqual({ ok: true, format: 'pdf' });
  });

  it('accepts the kit CSV fixture by exact header', () => {
    expect(validateStatement(header('statement.csv'), 112)).toEqual({ ok: true, format: 'csv' });
  });

  it('rejects spoofed.pdf: plain text with a .pdf name', () => {
    expect(validateStatement(header('spoofed.pdf'), 84)).toEqual({ ok: false, reason: 'not_pdf_or_csv' });
  });

  it('rejects CSV with a different header or extra whitespace', () => {
    expect(detectFormat(ascii('Date,Description,Amount\n2026'))).toBeNull();
    expect(detectFormat(ascii(' date,description,amount\n'))).toBeNull();
    expect(detectFormat(ascii('date,description,amount,extra\n'))).toBeNull();
  });

  it('mirrors the server on CRLF: 24 bytes with CR stripped never contain the newline', () => {
    expect(detectFormat(ascii('date,description,amount\r\n2026-09-01,X,-1\n'))).toBeNull();
  });

  it('treats exactly 10 MiB as acceptable and 10 MiB + 1 as too large', () => {
    expect(isSizeAcceptable(MAX_STATEMENT_BYTES)).toBe(true);
    expect(isSizeAcceptable(MAX_STATEMENT_BYTES + 1)).toBe(false);
    expect(validateStatement(header('statement.csv'), MAX_STATEMENT_BYTES)).toEqual({ ok: true, format: 'csv' });
    expect(validateStatement(header('statement.csv'), MAX_STATEMENT_BYTES + 1)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('size wins over content: an oversize PDF is reported as too_large', () => {
    expect(validateStatement(header('statement.pdf'), MAX_STATEMENT_BYTES + 1)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('handles headers shorter than the magic', () => {
    expect(detectFormat(ascii('%PD'))).toBeNull();
    expect(detectFormat(new Uint8Array(0))).toBeNull();
  });
});
