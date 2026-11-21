// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, readSecretFile, shred } from '../src/fsutil.ts';

const secret = Buffer.from('TRUSTEE_PRIVATE_CANARY_92770');
const temp = () => mkdtempSync(join(tmpdir(), 'qvt-private-'));

test('trustee private writes remain exclusive and private snapshots enforce file type, links and bounds', async () => {
  const dir = temp(), path = join(dir, 'bundle');
  try {
    await atomicWrite(path, secret, 0o600, { exclusive: true });
    assert.deepEqual(await readSecretFile(path, secret.length), secret);
    await assert.rejects(atomicWrite(path, Buffer.from('replacement'), 0o600, { exclusive: true }), { code: 'EEXIST' });
    assert.deepEqual(readFileSync(path), secret);
    assert.deepEqual(readdirSync(dir), ['bundle']);
    await assert.rejects(readSecretFile(path, secret.length - 1), { code: 'BAD_PERMISSIONS' });
    await assert.rejects(readSecretFile(dir), { code: 'BAD_PERMISSIONS' });
    await assert.rejects(readSecretFile(join(dir, 'missing')), { code: 'NO_SUCH_FILE' });
    linkSync(path, join(dir, 'alias'));
    await assert.rejects(readSecretFile(path), { code: 'BAD_PERMISSIONS' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX trustee publication refuses unsafe ancestry for private and public outputs', { skip: process.platform === 'win32' }, async () => {
  const dir = temp(), shared = join(dir, 'shared'), owned = join(shared, 'owned');
  mkdirSync(shared, { mode: 0o700 });
  mkdirSync(owned, { mode: 0o700 });
  try {
    chmodSync(shared, 0o777);
    for (const mode of [0o600, 0o644]) {
      await assert.rejects(atomicWrite(join(owned, `file-${mode}`), secret, mode), { kind: 'REFUSED', code: 'UNSAFE_DIRECTORY', exitCode: 60 });
    }
    assert.deepEqual(readdirSync(owned), []);
    chmodSync(shared, 0o1777);
    await atomicWrite(join(owned, 'public'), Buffer.from('public bytes'), 0o644, { exclusive: true });
    assert.equal(readFileSync(join(owned, 'public'), 'utf8'), 'public bytes');
    assert.deepEqual(readdirSync(owned), ['public']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX trustee cleanup refuses unsafe ancestry before overwriting or removing a file', { skip: process.platform === 'win32' }, async () => {
  const dir = temp(), shared = join(dir, 'shared'), owned = join(shared, 'owned'), path = join(owned, 'backup');
  mkdirSync(shared, { mode: 0o700 }); mkdirSync(owned, { mode: 0o700 });
  try {
    await atomicWrite(path, secret);
    chmodSync(shared, 0o777);
    let requested = false;
    assert.equal(await shred(path, n => { requested = true; return new Uint8Array(n); }), false);
    assert.equal(requested, false, 'refusal precedes overwrite randomness and destructive I/O');
    assert.deepEqual(readFileSync(path), secret);
    chmodSync(shared, 0o1777);
    assert.equal(await shred(path, n => new Uint8Array(n)), true, 'trusted sticky ancestry retains ordinary cleanup');
    assert.equal(existsSync(path), false);
    assert.deepEqual(readdirSync(owned), [], 'permission inspection creates no staging artefact');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX trustee cleanup anchors a trusted ancestor alias but still refuses a symlinked leaf', { skip: process.platform === 'win32' }, async () => {
  const dir = temp(), owned = join(dir, 'owned'), alias = join(dir, 'alias');
  const actual = join(owned, 'backup'), viaAlias = join(alias, 'backup'), leafAlias = join(dir, 'leaf-alias');
  mkdirSync(owned, { mode: 0o700 });
  symlinkSync(owned, alias, 'dir');
  try {
    await atomicWrite(viaAlias, secret);
    assert.deepEqual(readFileSync(actual), secret);
    assert.equal(await shred(viaAlias, n => new Uint8Array(n)), true);
    assert.equal(existsSync(actual), false);
    await atomicWrite(actual, secret);
    symlinkSync(actual, leafAlias);
    let requested = false;
    assert.equal(await shred(leafAlias, n => { requested = true; return new Uint8Array(n); }), false);
    assert.equal(requested, false, 'a symlinked final component is refused before overwriting');
    assert.deepEqual(readFileSync(actual), secret);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('trustee cleanup keeps its original absolute path if cwd changes during overwrite', async () => {
  const originalCwd = process.cwd(), dir = realpathSync.native(temp()), other = join(dir, 'other');
  const path = join(dir, 'backup'), unrelated = join(other, 'backup');
  mkdirSync(other);
  try {
    await atomicWrite(path, secret);
    writeFileSync(unrelated, 'unrelated file');
    process.chdir(dir);
    assert.equal(await shred('backup', n => { process.chdir(other); return new Uint8Array(n); }), true);
    assert.equal(existsSync(path), false);
    assert.equal(readFileSync(unrelated, 'utf8'), 'unrelated file');
  } finally { process.chdir(originalCwd); rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX trustee reads refuse permissive modes and symlink aliases', { skip: process.platform === 'win32' }, async () => {
  const dir = temp(), path = join(dir, 'bundle'), alias = join(dir, 'alias');
  try {
    await atomicWrite(path, secret);
    symlinkSync(path, alias);
    await assert.rejects(readSecretFile(alias), { code: 'BAD_PERMISSIONS' });
    chmodSync(path, 0o644);
    await assert.rejects(readSecretFile(path), { code: 'BAD_PERMISSIONS' });
    assert.deepEqual(readFileSync(path), secret);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('POSIX trustee snapshot detects a deterministic pathname substitution during the same descriptor read', { skip: process.platform === 'win32' }, async t => {
  const dir = temp(), path = join(dir, 'bundle'), original = join(dir, 'original');
  try {
    await atomicWrite(path, secret);
    const observed = await open(path, 'r');
    const prototype = Object.getPrototypeOf(observed) as { read: (...args: any[]) => Promise<any> };
    const read = prototype.read;
    await observed.close();
    let substituted = false;
    const readBuffers: Buffer[] = [];
    t.mock.method(prototype, 'read', async function(this: unknown, ...args: any[]) {
      readBuffers.push(args[0] as Buffer);
      const result = await read.apply(this, args);
      if (!substituted) {
        substituted = true;
        renameSync(path, original);
        writeFileSync(path, 'substituted bytes', { mode: 0o600 });
      }
      return result;
    });
    await assert.rejects(readSecretFile(path), { code: 'BAD_PERMISSIONS' });
    assert.equal(substituted, true);
    assert.ok(readBuffers.length > 0 && readBuffers.every(buffer => buffer.every(byte => byte === 0)), 'rejected secret snapshot is wiped before propagating failure');
    assert.deepEqual(readFileSync(original), secret);
    assert.equal(readFileSync(path, 'utf8'), 'substituted bytes');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
