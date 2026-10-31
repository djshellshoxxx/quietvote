import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Trustee } from '../src/trustee.ts';
import { writeBundle } from '../src/bundle.ts';
import { atomicWrite, shred } from '../src/fsutil.ts';
import { mkDeps, PASS } from './helpers/harness.ts';

const temp = (): string => mkdtempSync(join(tmpdir(), 'qv-custody-'));

test('B2-08: relative backups stay anchored across cwd changes and parent symlink retargeting', async () => {
  const originalCwd = process.cwd();
  const dir = temp();
  try {
    const a = join(dir, 'a'), b = join(dir, 'b'), alias = join(dir, 'alias');
    mkdirSync(a); mkdirSync(b); symlinkSync(a, alias, 'dir');
    const deps = mkDeps('custody-cwd');
    const trustee = await Trustee.keygen(join(a, 'share.qvtb'), PASS, deps);
    const dest = relative(originalCwd, join(alias, 'backup.qvtb'));
    await trustee.backup(dest, PASS);
    assert.equal(trustee.data.backups[0]!.path, join(a, 'backup.qvtb'));
    unlinkSync(alias); symlinkSync(b, alias, 'dir');
    const unrelated = join(b, 'backup.qvtb');
    writeFileSync(unrelated, 'unrelated data');
    process.chdir(b);
    const reopened = await Trustee.open(join(a, 'share.qvtb'), PASS, deps);
    const result = await reopened.destroy({}, '');
    assert.deepEqual(result.backupsRemoved, [join(a, 'backup.qvtb')]);
    assert.equal(existsSync(join(a, 'backup.qvtb')), false);
    assert.equal(readFileSync(unrelated, 'utf8'), 'unrelated data');
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TR-08: shred preserves symlink targets, hardlinked files and nonregular paths', async () => {
  const dir = temp();
  try {
    const target = join(dir, 'target'), alias = join(dir, 'alias');
    writeFileSync(target, 'precious');
    symlinkSync(target, alias);
    assert.equal(await shred(alias, (n) => new Uint8Array(n)), false);
    assert.equal(readFileSync(target, 'utf8'), 'precious');
    unlinkSync(alias); linkSync(target, alias);
    assert.equal(await shred(alias, (n) => new Uint8Array(n)), false);
    assert.equal(readFileSync(target, 'utf8'), 'precious');
    assert.equal(await shred(dir, (n) => new Uint8Array(n)), false);
    unlinkSync(alias);
    assert.equal(await shred(target, (n) => new Uint8Array(n)), true);
    assert.equal(existsSync(target), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('TR-08: replaced backup bytes and legacy relative paths are never shredded or reported removed', async () => {
  const originalCwd = process.cwd();
  const dir = temp();
  try {
    const path = join(dir, 'share.qvtb'), backup = join(dir, 'backup.qvtb');
    const deps = mkDeps('custody-replaced');
    let trustee = await Trustee.keygen(path, PASS, deps);
    await trustee.backup(backup, PASS);
    writeFileSync(backup, 'unrelated replacement');
    // Legacy bundles have no recorded original cwd or fingerprint for a relative backup path.
    trustee.data.backups.push({ path: 'legacy.qvtb', at: deps.now().toISOString(), epoch: 0 });
    await writeBundle(path, trustee.data, PASS, deps);
    process.chdir(dir);
    writeFileSync('legacy.qvtb', 'unrelated legacy-name file');
    trustee = await Trustee.open(path, PASS, deps);
    const result = await trustee.destroy({}, '');
    assert.deepEqual(result.backupsRemoved, []);
    assert.deepEqual(result.backupsMissing, [backup, 'legacy.qvtb']);
    assert.equal(readFileSync(backup, 'utf8'), 'unrelated replacement');
    assert.equal(readFileSync('legacy.qvtb', 'utf8'), 'unrelated legacy-name file');
    assert.ok(result.reminders.some((r) => /not safely removed/i.test(r)));
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('TR-03: bundle aliases use the same canonical path, release ledger and lock', async () => {
  const dir = temp();
  try {
    const path = join(dir, 'share.qvtb'), alias = join(dir, 'alias.qvtb');
    const deps = mkDeps('custody-alias');
    await Trustee.keygen(path, PASS, deps);
    symlinkSync(path, alias);
    const trustee = await Trustee.open(alias, PASS, deps);
    assert.equal(trustee.path, path);
    writeFileSync(`${path}.lock`, 'other writer');
    await assert.rejects(trustee.backup(join(dir, 'backup.qvtb'), PASS), { code: 'BUNDLE_LOCKED' });
    assert.equal(existsSync(join(dir, 'backup.qvtb')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('custody: an atomic-write failure removes its sealed temporary file', async () => {
  const dir = temp();
  try {
    const occupied = join(dir, 'occupied');
    mkdirSync(occupied);
    await assert.rejects(atomicWrite(occupied, new TextEncoder().encode('sensitive sealed bytes')));
    assert.deepEqual(readdirSync(dir), ['occupied']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('custody: restore registers the actual moved source backup for safe destruction', async () => {
  const dir = temp();
  try {
    const path = join(dir, 'share.qvtb'), backup = join(dir, 'backup.qvtb');
    const moved = join(dir, 'moved.qvtb'), restored = join(dir, 'restored.qvtb');
    const deps = mkDeps('custody-moved-restore');
    const live = await Trustee.keygen(path, PASS, deps);
    await live.backup(backup, PASS);
    renameSync(backup, moved);
    const trustee = await Trustee.restore(moved, PASS, restored, PASS, deps);
    const result = await trustee.destroy({}, '');
    assert.deepEqual(result.backupsRemoved, [moved]);
    assert.deepEqual(result.backupsMissing, [backup]);
    assert.equal(existsSync(moved), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('custody: concurrent backups to one destination never overwrite another share', async () => {
  const dir = temp();
  try {
    const a = await Trustee.keygen(join(dir, 'a.qvtb'), PASS, mkDeps('custody-backup-a'));
    const b = await Trustee.keygen(join(dir, 'b.qvtb'), PASS, mkDeps('custody-backup-b'));
    const dest = join(dir, 'backup.qvtb');
    const results = await Promise.allSettled([a.backup(dest, PASS), b.backup(dest, PASS)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const failed = results.find((r) => r.status === 'rejected');
    assert.equal((failed as PromiseRejectedResult).reason.code, 'BUNDLE_EXISTS');
    assert.equal(a.data.backups.length + b.data.backups.length, 1);
    assert.equal(existsSync(dest), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('custody: a destroyed live path refuses an older sealed bundle copied back over it', async () => {
  const dir = temp();
  try {
    const path = join(dir, 'share.qvtb');
    const deps = mkDeps('custody-tombstone-copyback');
    const trustee = await Trustee.keygen(path, PASS, deps);
    const old = readFileSync(path);
    await trustee.destroy({}, '');
    writeFileSync(path, old, { mode: 0o600 });
    await assert.rejects(Trustee.open(path, PASS, deps), { code: 'DESTROYED' });
    await assert.rejects(Trustee.restore(path, PASS, path, PASS, deps), { code: 'DESTROYED' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('custody: a tombstoned DESTROYING bundle can resume cleanup after a final-wipe crash', async () => {
  const dir = temp();
  try {
    const path = join(dir, 'share.qvtb');
    const deps = mkDeps('custody-tombstone-resume');
    const trustee = await Trustee.keygen(path, PASS, deps);
    const rng = deps.rng;
    deps.rng = { bytes(n) {
      if (n > 100) throw new Error('simulated crash before final wipe');
      return rng.bytes(n);
    } };
    await assert.rejects(trustee.destroy({}, ''), /simulated crash/);
    assert.equal(existsSync(`${path}.destroyed`), true);
    assert.equal(existsSync(path), true);
    deps.rng = rng;
    const resumed = await Trustee.open(path, PASS, deps);
    assert.equal(resumed.state, 'DESTROYING');
    await resumed.destroy({}, '');
    assert.equal(resumed.state, 'DESTROYED');
    assert.equal(existsSync(path), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
