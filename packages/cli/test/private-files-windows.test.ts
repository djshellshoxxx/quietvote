// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWindowsPrivateFile, readWindowsPrivateFileSync, reserveWindowsPrivateFile, writeWindowsPrivateFile, writeWindowsPrivateFileSync } from '../src/windows-private-files.ts';
import { windowsFixture, type NativeAcl } from './windows-acl-fixture.ts';
import { fileURLToPath } from 'node:url';
const BIN = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));

const windows = { skip: process.platform !== 'win32' };
const secret = Buffer.from('WINDOWS_PRIVATE_CANARY_59774');
const temp = () => mkdtempSync(join(tmpdir(), 'qv-native-private-'));
function privateAcl(path: string): NativeAcl {
  const acl = windowsFixture('inspect', path);
  assert.equal(acl.owner, acl.user);
  assert.equal(acl.protected, true);
  assert.equal(acl.nullDacl, false);
  assert.ok(acl.rules.length > 0);
  assert.ok(acl.rules.every(rule => !rule.inherited && !rule.callback && (!rule.allow || rule.sid === acl.user)));
  return acl;
}

test('Windows native CreateNew is private before its first byte even under an Everyone-readable parent', windows, async () => {
  const dir = temp(), path = join(dir, 'reserved');
  windowsFixture('permissive-parent', dir);
  const held = await reserveWindowsPrivateFile(path, secret.length);
  try {
    assert.equal(statSync(path).size, 0);
    privateAcl(path); // The handle is still held and no secret save has happened.
    assert.equal(await held.bound(), true);
    await held.save(secret);
    assert.deepEqual(await held.read(), secret);
    privateAcl(path);
    await assert.rejects(reserveWindowsPrivateFile(path, secret.length), { code: 'EEXIST' });
    assert.deepEqual(readFileSync(path), secret);
  } finally { await held.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('Windows native snapshots refuse broad inherited and explicit ACLs, null DACLs, and callback grants', windows, async () => {
  const dir = temp(), inherited = join(dir, 'inherited'), path = join(dir, 'private');
  try {
    windowsFixture('permissive-parent', dir);
    writeFileSync(inherited, secret);
    // Elevated Windows tokens may default new-file ownership to Administrators.
    // Isolate inherited-DACL refusal from the separate wrong-owner refusal test.
    const inheritedAcl = windowsFixture('current-owner', inherited);
    assert.equal(inheritedAcl.owner, inheritedAcl.user);
    assert.ok(inheritedAcl.rules.some(r => r.inherited && r.allow && r.sid === 'S-1-1-0'));
    await assert.rejects(readWindowsPrivateFile(inherited), { code: 'ACL' });
    for (const mutation of ['broad', 'null', 'callback']) {
      await writeWindowsPrivateFile(path, secret, true);
      const changed = windowsFixture(mutation, path);
      if (mutation === 'null') assert.equal(changed.nullDacl, true);
      if (mutation === 'callback') assert.ok(changed.rules.some(r => r.callback));
      if (mutation === 'broad') assert.ok(changed.rules.some(r => r.allow && r.sid === 'S-1-1-0'));
      await assert.rejects(readWindowsPrivateFile(path), { code: 'ACL' }, mutation);
      assert.deepEqual(readFileSync(path), secret);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows native reads fail closed for uninspectable ACLs and wrong ownership', windows, async () => {
  const dir = temp(), path = join(dir, 'opaque');
  try {
    await writeWindowsPrivateFile(path, secret);
    const observation = windowsFixture<{ readable: boolean; inspectable: boolean }>('uninspectable', path);
    assert.deepEqual(observation, { readable: true, inspectable: false });
    await assert.rejects(readWindowsPrivateFile(path));
    assert.throws(() => readWindowsPrivateFileSync(path));
    windowsFixture('private', path); // Restore inspectability for cleanup, not for the refusal assertion.
    const foreign = windowsFixture<{ path: string; owner: string; user: string }>('foreign-owned');
    assert.notEqual(foreign.owner, foreign.user);
    await assert.rejects(readWindowsPrivateFile(foreign.path), { code: 'OWNER' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows same-handle ACL/read/save never switches to a replacement path and stops on ACL loss', windows, async () => {
  const dir = temp(), path = join(dir, 'name'), original = join(dir, 'original');
  const held = await reserveWindowsPrivateFile(path, secret.length);
  try {
    await held.save(secret);
    renameSync(path, original);
    writeFileSync(path, 'unvalidated replacement');
    assert.deepEqual(await held.read(), secret, 'read bytes belong to the already-validated native stream');
    assert.equal(await held.bound(), false);
    await held.save(Buffer.from('retained response'));
    assert.equal(readFileSync(original, 'utf8'), 'retained response');
    assert.equal(readFileSync(path, 'utf8'), 'unvalidated replacement');
    windowsFixture('broad', original);
    await assert.rejects(held.save(secret), { code: 'ACL' });
    assert.equal(readFileSync(original, 'utf8'), 'retained response', 'no secret bytes written after losing privacy');
  } finally { await held.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('Windows native rename publishes private files, handles literal filenames, and rejects junctions and hardlinks', windows, async () => {
  const dir = temp(), target = join(dir, 'target'), junction = join(dir, 'junction');
  mkdirSync(target);
  try {
    windowsFixture('permissive-parent', target);
    const path = join(target, "literal-'`$()&;-file");
    writeWindowsPrivateFileSync(path, secret);
    privateAcl(path);
    writeWindowsPrivateFileSync(path, Buffer.from('new'), true);
    assert.equal(Buffer.from(readWindowsPrivateFileSync(path)).toString(), 'new');
    privateAcl(path);
    assert.throws(() => writeWindowsPrivateFileSync(path, secret), { code: 'EEXIST' });
    assert.deepEqual(readdirSync(target), ["literal-'`$()&;-file"]);
    const alias = join(target, 'hardlink'); linkSync(path, alias);
    await assert.rejects(readWindowsPrivateFile(path), { code: 'TYPE' });
    rmSync(alias);
    symlinkSync(target, junction, 'junction');
    await assert.rejects(readWindowsPrivateFile(join(junction, "literal-'`$()&;-file")), { code: 'PATH' });
    await assert.rejects(writeWindowsPrivateFile(join(junction, 'must-not-exist'), secret));
    assert.equal(existsSync(join(target, 'must-not-exist')), false);
    assert.deepEqual(readdirSync(target), ["literal-'`$()&;-file"], 'failed alias creation leaves no private temp copy');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows production reads and creation accept real DOS short names without resolving reparse aliases', windows, async t => {
  const dir = temp(), path = join(dir, 'long-secret-file-name.txt');
  try {
    await writeWindowsPrivateFile(path, secret);
    const file = windowsFixture<{ path: string; differs: boolean }>('short-name', path);
    const parent = windowsFixture<{ path: string; differs: boolean }>('short-name', dir);
    t.diagnostic(`filesystem supplied short aliases: file=${file.differs}, directory=${parent.differs}`);
    assert.deepEqual(await readWindowsPrivateFile(file.path), secret);
    const newPath = join(parent.path, 'created-from-short-parent');
    await writeWindowsPrivateFile(newPath, secret);
    assert.deepEqual(await readWindowsPrivateFile(join(dir, 'created-from-short-parent')), secret);
    const held = await reserveWindowsPrivateFile(join(parent.path, 'held-from-short-parent'), secret.length);
    try { await held.save(secret); assert.equal(await held.bound(), true); assert.deepEqual(await held.read(), secret); }
    finally { await held.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows actual keygen creates private output and unavailable native protection fails without output or secrets', windows, () => {
  const dir = temp(), path = join(dir, 'key.json'), failed = join(dir, 'missing-key.json');
  try {
    const good = spawnSync(process.execPath, [BIN, 'keygen', '--out', path, '--no-passphrase', '--seed-stdin', '--json'], {
      input: '31'.repeat(32), encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(good.error, undefined); assert.equal(good.status, 0, good.stderr);
    privateAcl(path);
    assert.equal((good.stdout + good.stderr).includes('31'.repeat(32)), false);
    const missingRuntime = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'systemroot'));
    missingRuntime['SystemRoot'] = join(dir, 'unavailable-system');
    const bad = spawnSync(process.execPath, [BIN, 'keygen', '--out', failed, '--no-passphrase', '--seed-stdin', '--json'], {
      env: missingRuntime, input: '31'.repeat(32), encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(bad.error, undefined); assert.equal(bad.status, 4); assert.equal(existsSync(failed), false);
    assert.equal((bad.stdout + bad.stderr).includes('31'.repeat(32)), false);
    assert.deepEqual(readdirSync(dir), ['key.json']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('Windows reusable native service anchors relative paths to the caller cwd on each operation', windows, async () => {
  const originalCwd = process.cwd(), dir = temp(), path = join(dir, 'relative-secret');
  try {
    await writeWindowsPrivateFile(path, secret); // Start the persistent helper before cwd changes.
    process.chdir(dir);
    assert.deepEqual(await readWindowsPrivateFile('relative-secret'), secret);
    assert.deepEqual(readWindowsPrivateFileSync('relative-secret'), secret);
    await writeWindowsPrivateFile('relative-output', secret);
    assert.deepEqual(readFileSync(join(dir, 'relative-output')), secret);
    const held = await reserveWindowsPrivateFile('relative-held', secret.length);
    try {
      process.chdir(originalCwd);
      await held.save(secret);
      assert.equal(await held.bound(), true, 'held reservation stays bound to its initial caller location');
      assert.deepEqual(await held.read(), secret);
    } finally { await held.close(); }
  } finally { process.chdir(originalCwd); rmSync(dir, { recursive: true, force: true }); }
});


test('Windows native JSON pipes preserve a multi-MiB bounded snapshot without truncation', windows, async () => {
  const dir = temp(), path = join(dir, 'large-private');
  const bytes = Buffer.alloc(3 * 1024 * 1024, 0x5a);
  try {
    await writeWindowsPrivateFile(path, bytes);
    assert.deepEqual(await readWindowsPrivateFile(path, bytes.length), bytes);
    await assert.rejects(readWindowsPrivateFile(path, bytes.length - 1), { code: 'SIZE' });
    privateAcl(path);
  } finally { bytes.fill(0); rmSync(dir, { recursive: true, force: true }); }
});
