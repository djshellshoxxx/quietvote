// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { readPrivateFile, readPrivateFileSync, reservePrivateOutput, writePrivateFileSync } from '../src/private-files.ts';

const bytes = Buffer.from('PRIVATE_FILE_CANARY_34b71');
const temp = () => mkdtempSync(join(tmpdir(), 'qv-private-'));

test('private output is exclusive, replacement is atomic, and a failed publication cleans its temp file', () => {
  const dir = temp(), path = join(dir, 'key');
  try {
    writePrivateFileSync(path, bytes);
    assert.deepEqual(readPrivateFileSync(path), bytes);
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.throws(() => writePrivateFileSync(path, 'do not replace'), { code: 'EEXIST' });
    assert.deepEqual(readFileSync(path), bytes);
    assert.deepEqual(readdirSync(dir), ['key']);
    writePrivateFileSync(path, 'replacement', true);
    assert.equal(Buffer.from(readPrivateFileSync(path)).toString(), 'replacement');
    assert.deepEqual(readdirSync(dir), ['key']);
    const directory = join(dir, 'directory'); mkdirSync(directory);
    assert.throws(() => writePrivateFileSync(directory, bytes, true));
    assert.deepEqual(readdirSync(directory), []);
    assert.deepEqual(readdirSync(dir).sort(), ['directory', 'key']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX output protects the complete staging ancestry and supports trusted sticky parents and aliases', { skip: process.platform === 'win32' }, () => {
  const dir = temp(), shared = join(dir, 'shared'), owned = join(shared, 'owned'), alias = join(dir, 'alias');
  mkdirSync(shared, { mode: 0o700 });
  mkdirSync(owned, { mode: 0o700 });
  symlinkSync(owned, alias, 'dir');
  try {
    chmodSync(shared, 0o777);
    assert.throws(() => writePrivateFileSync(join(owned, 'key'), bytes), { code: 'UNSAFE_DIRECTORY' });
    assert.throws(() => writePrivateFileSync(join(alias, 'key'), bytes), { code: 'UNSAFE_DIRECTORY' });
    assert.deepEqual(readdirSync(owned), [], 'a private leaf alone cannot protect writable nonsticky ancestry');
    chmodSync(shared, 0o1777);
    writePrivateFileSync(join(shared, 'direct'), bytes);
    const viaAlias = relative(process.cwd(), join(alias, 'key'));
    writePrivateFileSync(viaAlias, bytes);
    writePrivateFileSync(viaAlias, 'replacement', true);
    assert.equal(readFileSync(join(owned, 'key'), 'utf8'), 'replacement');
    assert.equal(statSync(join(owned, 'key')).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(owned), ['key']);
    assert.deepEqual(readdirSync(shared).sort(), ['direct', 'owned']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('private snapshots enforce exact bounds, empty input, regular files, and a unique hard-link identity', async () => {
  const dir = temp(), path = join(dir, 'secret');
  try {
    writePrivateFileSync(path, new Uint8Array());
    assert.equal((await readPrivateFile(path, 0)).length, 0);
    writePrivateFileSync(path, bytes, true);
    assert.deepEqual(await readPrivateFile(path, bytes.length), bytes);
    await assert.rejects(readPrivateFile(path, bytes.length - 1));
    await assert.rejects(readPrivateFile(path, -1));
    await assert.rejects(readPrivateFile(dir));
    linkSync(path, join(dir, 'alias'));
    await assert.rejects(readPrivateFile(path));
    await assert.rejects(readPrivateFile(join(dir, 'alias')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a held private output never writes a substituted pathname and keeps the original recoverable bytes', async () => {
  const dir = temp(), path = join(dir, 'requested'), original = join(dir, 'original');
  const held = await reservePrivateOutput(path, bytes.length);
  try {
    assert.equal(await held.bound(), true);
    await held.save(new Uint8Array());
    assert.equal(statSync(path).size, 0);
    renameSync(path, original);
    writeFileSync(path, 'independent file');
    assert.equal(await held.bound(), false);
    await held.save(bytes);
    assert.deepEqual(readFileSync(original), bytes);
    assert.equal(readFileSync(path, 'utf8'), 'independent file');
    await assert.rejects(held.save(Buffer.alloc(bytes.length + 1)));
    assert.deepEqual(readFileSync(original), bytes);
  } finally { await held.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX private reads reject broad permissions, symlinks and FIFOs without exposing or blocking', { skip: process.platform === 'win32' }, async () => {
  const dir = temp(), path = join(dir, 'secret'), link = join(dir, 'link'), fifo = join(dir, 'fifo');
  try {
    writePrivateFileSync(path, bytes);
    symlinkSync(path, link);
    await assert.rejects(readPrivateFile(link));
    assert.throws(() => writePrivateFileSync(link, 'other', true));
    assert.deepEqual(readFileSync(path), bytes);
    chmodSync(path, 0o640);
    await assert.rejects(readPrivateFile(path));
    execFileSync('mkfifo', [fifo]);
    await assert.rejects(readPrivateFile(fifo));
    assert.equal(existsSync(fifo), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the package-local private-file helpers remain byte-identical', () => {
  for (const file of ['windows-private-files.ts', 'windows-private-files.ps1', 'posix-staging.ts']) {
    assert.deepEqual(readFileSync(new URL(`../src/${file}`, import.meta.url)),
      readFileSync(new URL(`../../trustee/src/${file}`, import.meta.url)), file);
  }
});
