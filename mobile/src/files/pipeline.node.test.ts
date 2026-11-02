import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAX_STATEMENT_BYTES } from '@/import/types';
import type { LogFields } from '@/logging/logger';

import { acquireStatement, discardStatement, sweepOrphanCopies } from './pipeline';
import type { PickResult, StatementFileSystem, StatementPicker } from './ports';

const fixtures = join(__dirname, '..', '..', '..', 'kit', 'fixtures');
const read = (name: string) => new Uint8Array(readFileSync(join(fixtures, name)));
const IMPORTS = 'file:///cache/statement-imports/';
const PICKER = 'file:///cache/DocumentPicker/';

/** Fake FS: files live in a Map, directories are URI prefixes. */
class FakeFs implements StatementFileSystem {
  files = new Map<string, Uint8Array>();
  failRemove = new Set<string>();
  exists = (uri: string) => this.files.has(uri);
  sizeOf = (uri: string) => this.files.get(uri)?.length ?? null;
  async importIntoImports(sourceUri: string, targetName: string) {
    const bytes = this.files.get(sourceUri);
    if (!bytes) throw new Error('missing source');
    this.files.delete(sourceUri);
    this.files.set(`${IMPORTS}${targetName}`, bytes);
    return `${IMPORTS}${targetName}`;
  }
  async readHead(uri: string, length: number) {
    const bytes = this.files.get(uri);
    if (!bytes) throw new Error('missing file');
    return bytes.subarray(0, length);
  }
  remove(uri: string) {
    if (this.failRemove.has(uri)) throw new Error('busy');
    this.files.delete(uri);
  }
  listImports = () => [...this.files.keys()].filter((u) => u.startsWith(IMPORTS));
  purgePickerScratch() {
    const victims = [...this.files.keys()].filter((u) => u.startsWith(PICKER));
    victims.forEach((u) => this.files.delete(u));
    return victims.length;
  }
}

function setup(picked: { name: string; bytes: Uint8Array; reportedSize?: number | null } | null) {
  const fs = new FakeFs();
  const logs: { event: string; fields?: LogFields }[] = [];
  let result: PickResult = { canceled: true };
  if (picked) {
    fs.files.set(`${PICKER}${picked.name}`, picked.bytes);
    result = { canceled: false, uri: `${PICKER}${picked.name}`, displayName: picked.name, sizeBytes: picked.reportedSize === undefined ? picked.bytes.length : picked.reportedSize };
  }
  const picker: StatementPicker = { pick: async () => result };
  let n = 0;
  return { fs, logs, run: () => acquireStatement({ picker, fs, log: (event, fields) => logs.push({ event, fields }), randomName: () => `copy-${++n}` }) };
}

describe('acquireStatement', () => {
  it.each([
    ['statement.csv', 'csv'],
    ['statement.pdf', 'pdf'],
  ])('accepts %s, moves it under a random name and keeps the display name only in meta', async (name, format) => {
    const bytes = read(name);
    const s = setup({ name, bytes });
    const result = await s.run();
    expect(result).toEqual({ kind: 'accepted', prepared: { meta: { displayName: name, sizeBytes: bytes.length, format }, localCopyUri: `${IMPORTS}copy-1` } });
    expect([...s.fs.files.keys()]).toEqual([`${IMPORTS}copy-1`]); // the picker's copy is gone (moved)
  });

  it('rejects spoofed.pdf by content and deletes the copy', async () => {
    const s = setup({ name: 'spoofed.pdf', bytes: read('spoofed.pdf') });
    expect(await s.run()).toEqual({ kind: 'rejected', reason: 'not_pdf_or_csv', displayName: 'spoofed.pdf', sizeBytes: 84 });
    expect(s.fs.files.size).toBe(0);
  });

  it('rejects an oversize file from metadata before moving or reading it', async () => {
    const s = setup({ name: 'oversize.csv', bytes: read('statement.csv'), reportedSize: MAX_STATEMENT_BYTES + 1 });
    expect(await s.run()).toEqual({ kind: 'rejected', reason: 'too_large', displayName: 'oversize.csv', sizeBytes: MAX_STATEMENT_BYTES + 1 });
    expect(s.fs.files.size).toBe(0);
  });

  it('settles an unknown metadata size (null or 0, as Android reports it) on the copy, and refuses a copy whose size cannot be read', async () => {
    const bytes = read('statement.csv');
    for (const reportedSize of [null, 0]) {
      const s = setup({ name: 'statement.csv', bytes, reportedSize });
      const result = await s.run();
      expect(result.kind === 'accepted' && result.prepared.meta.sizeBytes).toBe(bytes.length);
    }

    const unknown = setup({ name: 'statement.csv', bytes, reportedSize: null });
    unknown.fs.sizeOf = () => null;
    expect(await unknown.run()).toMatchObject({ kind: 'rejected', reason: 'too_large', sizeBytes: null });
    expect(unknown.fs.files.size).toBe(0);
  });

  it('rejects an oversize file that the provider reported as 0 bytes once the copy reveals its real size, and removes the copy', async () => {
    const s = setup({ name: 'big.csv', bytes: new Uint8Array(8), reportedSize: 0 });
    const realSize = MAX_STATEMENT_BYTES + 1;
    const originalSizeOf = s.fs.sizeOf;
    s.fs.sizeOf = (uri) => (uri.startsWith(IMPORTS) ? realSize : originalSizeOf(uri));
    expect(await s.run()).toEqual({ kind: 'rejected', reason: 'too_large', displayName: 'big.csv', sizeBytes: realSize });
    expect(s.fs.files.size).toBe(0);
  });

  it('rejects an empty file', async () => {
    const s = setup({ name: 'empty.csv', bytes: new Uint8Array(0) });
    expect((await s.run()).kind).toBe('rejected');
    expect(s.fs.files.size).toBe(0);
  });

  it('reports cancel without touching files', async () => {
    const s = setup(null);
    expect(await s.run()).toEqual({ kind: 'canceled' });
  });

  it('never logs the file name', async () => {
    const s = setup({ name: 'statement.pdf', bytes: read('statement.pdf') });
    await s.run();
    expect(JSON.stringify(s.logs)).not.toContain('statement.pdf');
  });

  it('purges leftover picker copies after every pick outcome', async () => {
    const s = setup({ name: 'spoofed.pdf', bytes: read('spoofed.pdf') });
    s.fs.files.set(`${PICKER}stale-from-earlier.pdf`, new Uint8Array(3));
    await s.run();
    expect(s.fs.files.size).toBe(0);
  });
});

describe('discardStatement', () => {
  it('deletes the accepted copy when the user cancels on the confirmation card', async () => {
    const s = setup({ name: 'statement.csv', bytes: read('statement.csv') });
    const result = await s.run();
    if (result.kind !== 'accepted') throw new Error('expected accepted');
    discardStatement(s.fs, result.prepared, (event, fields) => s.logs.push({ event, fields }));
    expect(s.fs.files.size).toBe(0);
    expect(s.logs.map((l) => l.event)).toContain('pick.discarded');
    expect(JSON.stringify(s.logs)).not.toContain('statement.csv');
  });

  it('logs a failed delete instead of throwing', () => {
    const events: string[] = [];
    discardStatement({ remove: () => { throw new Error('busy'); } }, { meta: { displayName: 'x', sizeBytes: 1, format: 'csv' }, localCopyUri: 'file:///copy' }, (e) => events.push(e));
    expect(events).toEqual(['local_copy.remove_failed']);
  });
});

describe('sweepOrphanCopies', () => {
  it('removes every import copy except the one the current operation still needs', () => {
    const fs = new FakeFs();
    fs.files.set(`${IMPORTS}a`, new Uint8Array(1));
    fs.files.set(`${IMPORTS}b`, new Uint8Array(1));
    fs.files.set('file:///cache/other/c', new Uint8Array(1));
    fs.files.set(`${PICKER}leftover.pdf`, new Uint8Array(1));
    expect(sweepOrphanCopies(fs, `${IMPORTS}b`, () => {})).toBe(2);
    expect([...fs.files.keys()].sort()).toEqual(['file:///cache/other/c', `${IMPORTS}b`]);
  });

  it('a failing delete is logged and does not stop the sweep', () => {
    const fs = new FakeFs();
    fs.files.set(`${IMPORTS}a`, new Uint8Array(1));
    fs.files.set(`${IMPORTS}b`, new Uint8Array(1));
    fs.failRemove.add(`${IMPORTS}a`);
    const events: string[] = [];
    expect(sweepOrphanCopies(fs, null, (event) => events.push(event))).toBe(1);
    expect(events).toContain('local_copy.remove_failed');
  });
});
