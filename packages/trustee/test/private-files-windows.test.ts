// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Trustee } from '../src/trustee.ts';
import { atomicWrite, readSecretFile } from '../src/fsutil.ts';
import { PASS, mkDeps } from './helpers/harness.ts';
import { windowsFixture } from '../../cli/test/windows-acl-fixture.ts';

const windows = { skip: process.platform !== 'win32' };
const temp = () => mkdtempSync(join(tmpdir(), 'qvt-native-'));
function assertPrivate(path: string): void {
  const acl = windowsFixture('inspect', path);
  assert.equal(acl.owner, acl.user); assert.equal(acl.protected, true); assert.equal(acl.nullDacl, false);
  assert.ok(acl.rules.every(rule => !rule.inherited && !rule.callback && (!rule.allow || rule.sid === acl.user)));
}

test('Windows trustee keygen, reopen, backup and restore use real owner-private native files', windows, async () => {
  const dir = temp(), path = join(dir, 'bundle'), backup = join(dir, 'backup'), restored = join(dir, 'restored');
  const deps = mkDeps('native-windows-custody');
  try {
    windowsFixture('permissive-parent', dir);
    const t = await Trustee.keygen(path, PASS, deps);
    assertPrivate(path);
    const signPk = t.data.sign_pk;
    assert.equal((await Trustee.open(path, PASS, deps)).data.sign_pk, signPk);
    await t.backup(backup, PASS + ' backup');
    assertPrivate(path); assertPrivate(backup);
    const resumed = await Trustee.restore(backup, PASS + ' backup', restored, PASS, deps);
    assert.equal(resumed.data.sign_pk, signPk); assertPrivate(restored);
    windowsFixture('broad', path);
    await assert.rejects(Trustee.open(path, PASS, deps), { code: 'BAD_PERMISSIONS', exitCode: 60 });
    await assert.rejects(t.backup(join(dir, 'refused-backup'), PASS), { code: 'BAD_PERMISSIONS' });
    assert.equal(readdirSync(dir).includes('refused-backup'), false, 'failed live-bundle comparison removes its private backup copy');
    for (const name of readdirSync(dir)) {
      const bytes = readFileSync(join(dir, name));
      assert.equal(bytes.includes(PASS), false); assert.equal(bytes.includes(t.data.sk_sign), false);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows trustee reads reject actual null and uninspectable ACLs instead of falling back to Node', windows, async () => {
  const dir = temp(), path = join(dir, 'secret');
  try {
    await atomicWrite(path, Buffer.from('native-only-read'));
    windowsFixture('null', path);
    await assert.rejects(readSecretFile(path), { code: 'BAD_PERMISSIONS' });
    windowsFixture('private', path);
    const opaque = windowsFixture<{ readable: boolean; inspectable: boolean }>('uninspectable', path);
    assert.deepEqual(opaque, { readable: true, inspectable: false });
    await assert.rejects(readSecretFile(path), { code: 'BAD_PERMISSIONS' });
    windowsFixture('private', path);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Windows shipped trustee CLI exits after native reads and rejects a broadened passphrase file without leaking it', windows, async () => {
  const dir = temp(), path = join(dir, 'bundle'), passwordFile = join(dir, 'password');
  const passphrase = 'W7!cobalt-R4$maple-Q2#river-N8';
  const bin = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  try {
    await atomicWrite(passwordFile, Buffer.from(passphrase + '\n'));
    const invoke = (command: string, expected: number) => {
      const result = spawnSync(process.execPath, [bin, command, '--bundle', path, '--passphrase-file', passwordFile, '--json'], {
        encoding: 'utf8', timeout: 90_000,
      });
      assert.equal(result.error, undefined, 'idle native service must not keep the completed CLI alive');
      assert.equal(result.status, expected, result.stderr);
      assert.equal((result.stdout + result.stderr).includes(passphrase), false);
      return result;
    };
    invoke('keygen', 0); assertPrivate(path); assertPrivate(passwordFile);
    invoke('status', 0);
    const before = readFileSync(path);
    windowsFixture('broad', passwordFile);
    assert.match(invoke('status', 60).stderr, /BAD_PERMISSIONS/);
    assert.deepEqual(readFileSync(path), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
