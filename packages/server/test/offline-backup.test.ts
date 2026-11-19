// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-011, QV-12-REQ-005, QV-07-REQ-045
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { bytesToHex } from '@quietvote/crypto';
import { decodeHeader, encodeHeader, hashLeaf } from '@quietvote/board';
import { backupWork } from '../src/admin.ts';
import { buildServer } from '../src/app.ts';
import { verifyBackup, restoreBackup, BackupError, backupMain } from '../src/offline-backup.ts';
import { World } from './helpers/world.ts';

const root = mkdtempSync(join(tmpdir(), 'qv-drill-'));
const unrelatedCwd = join(root, 'unrelated working directory');
mkdirSync(unrelatedCwd);
const backupExecutable = fileURLToPath(new URL('../bin/qv-backup.ts', import.meta.url));
const key = join(root, 'independent-kek.bin');
let w: World;
let old: string;
let current: string;
let serial = 0;
async function snapshot(): Promise<string> {
  const jobId = `backup-${++serial}`;
  const result = await backupWork(w.server.env, w.server.pool, jobId, 'all', undefined,
    { jobId, signal: new AbortController().signal, progress: () => {}, tick: async () => {} });
  return join(w.dir, result.result_ref!);
}
function clone(source = current): string {
  const dir = join(root, `clone-${++serial}`); cpSync(source, dir, { recursive: true }); return dir;
}
function reseal(dir: string): void {
  const path = join(dir, 'manifest.json');
  const m = JSON.parse(readFileSync(path, 'utf8'));
  for (const f of m.files) {
    const b = readFileSync(join(dir, f.name)); f.bytes = b.length; f.sha256 = createHash('sha256').update(b).digest('hex');
  }
  writeFileSync(path, JSON.stringify(m));
}
function mutate(dir: string, file: string, sql: string): void {
  const db = new DatabaseSync(join(dir, file)); try { db.exec(sql); } finally { db.close(); }
  reseal(dir);
}
const code = (c: string) => (e: unknown): boolean => e instanceof BackupError && e.code === c;
before(async () => {
  w = new World({ seed: 'offline-recovery', n: 3, t: 2, voters: 2, witnessQuorum: 0 });
  await w.start(); await w.setupOrgAndElection(); await w.publishManifest();
  copyFileSync(join(w.dir, 'kek', 'kek.bin'), key); chmodSync(key, 0o600);
  old = await snapshot();
  await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  current = await snapshot();
}, { timeout: 60000 });
after(async () => { await w.stop(); rmSync(root, { recursive: true, force: true }); });

test('offline verify uses disposable copies, authenticates separately supplied KEK, preserves all source bytes', async () => {
  const dir = clone();
  const before = readdirSync(dir).map((p) => [p, createHash('sha256').update(readFileSync(join(dir, p))).digest('hex')]);
  const r = await verifyBackup(dir, key);
  assert.equal(r.files, 2); assert.equal(r.elections[0]!.tree_size, 2); assert.ok(r.authenticated_envelopes >= 3);
  assert.deepEqual(readdirSync(dir).map((p) => [p, createHash('sha256').update(readFileSync(join(dir, p))).digest('hex')]), before);
});

const launchDirectories = [
  ['repository', fileURLToPath(new URL('../../../', import.meta.url))],
  ['workspace', fileURLToPath(new URL('../', import.meta.url))],
  ['unrelated directory with spaces', unrelatedCwd],
] as const;
for (const [location, cwd] of launchDirectories) {
  test(`real executable restore drill from ${location}: independent KEK, preserved tree/checkpoint, restart and append, restore audit`, { timeout: 60000 }, async () => {
    const destination = join(root, `restored-${location}`);
    const cli = spawnSync(process.execPath, [backupExecutable, 'restore', '--backup', current, '--kek-file', key,
      '--minimum-backup', old, '--destination', destination], { cwd, encoding: 'utf8', timeout: 30000 });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).elections[0].tree_size, 2);
    if (process.platform !== 'win32') {
      assert.equal(statSync(destination).mode & 0o777, 0o700);
      assert.equal(statSync(join(destination, 'kek', 'kek.bin')).mode & 0o777, 0o600);
    }
    const restored = buildServer({ dataDir: destination, minFreeBytes: 0, registrationMode: 'closed', now: () => w.clock, logSink: () => {} });
    try {
      const rt = (await restored.pool.get(w.electionId))!;
      const original = (await w.server.pool.get(w.electionId))!;
      assert.equal(bytesToHex(rt.log.root()), bytesToHex(original.log.root()));
      assert.deepEqual(rt.edb.store.listCheckpoints(), original.edb.store.listCheckpoints());
      assert.equal(rt.edb.row().state, 'CEREMONY');
      assert.ok(restored.env.control.auditRows().some((r) => r.action === 'restore'));
      const at = await restored.start();
      const response = await fetch(`${at.url}/api/v1/elections/${w.electionId}/state`);
      assert.equal(response.status, 200); assert.equal((await response.json() as { tree_size: number }).tree_size, 2);
      const base = w.base;
      try {
        w.base = at.url;
        await w.ok('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
        assert.equal(rt.log.size, 3);
      } finally { w.base = base; }
    } finally { await restored.stop(); }
    // Missing KEK after a restore remains a hard startup failure; it is never silently regenerated.
    rmSync(join(destination, 'kek', 'kek.bin'));
    assert.throws(() => buildServer({ dataDir: destination, logSink: () => {} }), /KEK file missing/);
    assert.equal(existsSync(join(destination, 'kek', 'kek.bin')), false);
  });
}

test('restore refuses older history, missing elections and conflicting prefix floors before creating destination', async () => {
  const destination = join(root, 'stale-refused');
  await assert.rejects(restoreBackup(old, key, destination, current), code('BACKUP_ROLLBACK'));
  assert.equal(existsSync(destination), false);
  const minimum = await verifyBackup(old, key);
  minimum.elections[0]!.root = '00'.repeat(32);
  await assert.rejects(verifyBackup(current, key, minimum), code('BACKUP_ROLLBACK'));
  minimum.elections[0]!.election_id = '00'.repeat(16);
  await assert.rejects(verifyBackup(current, key, minimum), code('BACKUP_ROLLBACK'));
});

test('restore never overwrites an existing, live, empty or symlink destination', async () => {
  const report = await verifyBackup(current, key);
  const empty = join(root, 'empty-existing'); mkdirSync(empty);
  for (const destination of [root, w.dir, empty]) {
    await assert.rejects(restoreBackup(current, key, destination, current), /EEXIST/);
    assert.ok(existsSync(destination));
  }
  const link = join(root, 'target-link'); symlinkSync(join(root, 'absent'), link);
  await assert.rejects(restoreBackup(current, key, link, current), /EEXIST/);
  assert.equal((await verifyBackup(current, key)).elections[0]!.root, report.elections[0]!.root);
});

test('missing/wrong/truncated/permissive KEK refuses, never generates or copies keys into backup', async () => {
  await assert.rejects(verifyBackup(current, join(root, 'missing')));
  const wrong = join(root, 'wrong'); writeFileSync(wrong, randomBytes(32), { mode: 0o600 });
  await assert.rejects(verifyBackup(current, wrong), code('BACKUP_VERIFY'));
  writeFileSync(wrong, randomBytes(31));
  await assert.rejects(verifyBackup(current, wrong), code('BACKUP_KEK'));
  if (process.platform !== 'win32') {
    writeFileSync(wrong, randomBytes(32)); chmodSync(wrong, 0o644);
    await assert.rejects(verifyBackup(current, wrong), code('BACKUP_KEK_PERMISSIONS'));
  }
  assert.ok(!readdirSync(current).some((p) => p.includes('kek')));
});

test('manifest boundaries refuse traversal, duplicate files/JSON keys, partial backups and unexpected members', async () => {
  for (const change of [
    (m: any) => { m.files[1].name = '../../outside'; },
    (m: any) => { m.files.push(m.files[1]); },
    (m: any) => { m.scope = 'election'; },
    (m: any) => { m.files[0].bytes = -1; },
    (m: any) => { m.files[0].sha256 = 'wrong'; },
  ]) {
    const dir = clone(); const p = join(dir, 'manifest.json'); const m = JSON.parse(readFileSync(p, 'utf8')); change(m); writeFileSync(p, JSON.stringify(m));
    await assert.rejects(verifyBackup(dir, key), code('BACKUP_MANIFEST'));
  }
  const duplicate = clone(); const p = join(duplicate, 'manifest.json'); writeFileSync(p, readFileSync(p, 'utf8').replace('{', '{"scope":"all",'));
  await assert.rejects(verifyBackup(duplicate, key));
  const extra = clone(); writeFileSync(join(extra, 'kek.bin'), randomBytes(32));
  await assert.rejects(verifyBackup(extra, key), code('BACKUP_MEMBERS'));
  const missing = clone(); rmSync(join(missing, `elections-${w.electionId}.sqlite`));
  await assert.rejects(verifyBackup(missing, key), code('BACKUP_MEMBERS'));
});

test('checksum damage, symlinks and re-sealed registry paths cannot escape recovery directory', async () => {
  const damaged = clone(); writeFileSync(join(damaged, 'control.sqlite'), 'corrupted');
  await assert.rejects(verifyBackup(damaged, key), code('BACKUP_CHECKSUM'));
  const linked = clone(); const p = join(linked, 'control.sqlite'); rmSync(p); symlinkSync(join(current, 'control.sqlite'), p);
  await assert.rejects(verifyBackup(linked, key), code('BACKUP_FILE'));
  const path = clone(); mutate(path, 'control.sqlite', "UPDATE election_registry SET db_path='../../outside'");
  await assert.rejects(verifyBackup(path, key), code('BACKUP_REGISTRY'));
});

test('re-sealed broken bodies, quarantine, future schemas and foreign instances refuse', async () => {
  const file = `elections-${w.electionId}.sqlite`;
  const body = clone(); mutate(body, file, "DROP TRIGGER log_entry_noupdate; UPDATE log_entry SET body=x'7b7d' WHERE seq=1");
  await assert.rejects(verifyBackup(body, key));
  const quarantine = clone(); mutate(quarantine, 'control.sqlite', "UPDATE election_registry SET quarantine='incident'");
  await assert.rejects(verifyBackup(quarantine, key), code('BACKUP_QUARANTINE'));
  const future = clone(); mutate(future, 'control.sqlite', 'PRAGMA user_version=999');
  await assert.rejects(verifyBackup(future, key), code('BACKUP_VERIFY'));
  const other = await verifyBackup(old, key); other.instance_id = 'another';
  await assert.rejects(verifyBackup(current, key, other), code('BACKUP_INSTANCE'));
});

test('CLI rejects missing/duplicate/unknown flags, sanitizes errors and supports help', async () => {
  const out: string[] = []; const err: string[] = [];
  const run = (args: string[]) => backupMain(args, (s) => { out.push(s); }, (s) => { err.push(s); });
  assert.equal(await run(['--help']), 0);
  for (const args of [[], ['verify'], ['restore', '--backup', current], ['verify', '--backup', current, '--kek-file', key, '--extra', 'x'],
    ['verify', '--backup', current, '--backup', current]]) assert.equal(await run(args), 2);
  assert.equal(await run(['verify', '--backup', current, '--kek-file', '/SECRET-PATH-NOT-ECHOED']), 1);
  assert.ok(!err.join('').includes('SECRET-PATH')); assert.ok(!err.join('').includes('Error:'));
});


test('stored author signatures are checked even when attacker re-seals hashes and removes checkpoints', async () => {
  const dir = clone(); const file = join(dir, `elections-${w.electionId}.sqlite`);
  const db = new DatabaseSync(file);
  try {
    const row = db.prepare('SELECT header FROM log_entry WHERE seq=1').get()!;
    const decoded = decodeHeader(row['header'] as Uint8Array); assert.ok(decoded.ok);
    decoded.value.sig[0] = decoded.value.sig[0]! ^ 1;
    const header = encodeHeader(decoded.value);
    db.exec('DROP TRIGGER log_entry_noupdate; DELETE FROM checkpoint');
    db.prepare('UPDATE log_entry SET header=?,leaf_hash=? WHERE seq=1').run(header, hashLeaf(header));
  } finally { db.close(); }
  reseal(dir);
  await assert.rejects(verifyBackup(dir, key), code('BACKUP_SIGNATURE'));
});

test('legacy inert WAL/SHM is ignored, while unmanifested WAL data is refused', async () => {
  const dir = clone();
  writeFileSync(join(dir, 'control.sqlite-wal'), new Uint8Array());
  writeFileSync(join(dir, 'control.sqlite-shm'), new Uint8Array(32768));
  assert.equal((await verifyBackup(dir, key)).files, 2);
  writeFileSync(join(dir, 'control.sqlite-wal'), new Uint8Array(32));
  await assert.rejects(verifyBackup(dir, key));
});

test('online snapshot uses copied registry membership and refuses a disappearing target', async () => {
  let added = false;
  const jobId = `membership-${++serial}`;
  const result = await backupWork(w.server.env, w.server.pool, jobId, 'all', undefined, {
    jobId, signal: new AbortController().signal, progress: () => {}, tick: async () => {
      if (added) return; added = true;
      const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Created during backup' }, w.owner, w.idemKey());
      assert.equal(r.status, 201);
    },
  });
  assert.equal((await verifyBackup(join(w.dir, result.result_ref!), key)).files, 2);
  const draft = w.server.env.control.listAllElections('DRAFT', undefined, 100)[0]!;
  let removed = false;
  const failingId = `disappearing-${++serial}`;
  await assert.rejects(backupWork(w.server.env, w.server.pool, failingId, 'all', undefined, {
    jobId: failingId, signal: new AbortController().signal, progress: () => {}, tick: async () => {
      if (!removed) { removed = true; await w.server.pool.remove(draft.election_id); }
    },
  }), /no longer available/);
  assert.equal(existsSync(join(w.dir, 'backups', failingId)), false);
});


test('deleted registry paths are validated before startup cleanup can consume them', async () => {
  const dir = clone();
  mutate(dir, 'control.sqlite', "UPDATE election_registry SET state='DELETED',dek_wrapped=NULL,db_path='../../outside'");
  const path = join(dir, 'manifest.json'); const m = JSON.parse(readFileSync(path, 'utf8'));
  for (const f of m.files) if (f.name !== 'control.sqlite') rmSync(join(dir, f.name));
  m.files = m.files.filter((f: { name: string }) => f.name === 'control.sqlite'); writeFileSync(path, JSON.stringify(m));
  await assert.rejects(verifyBackup(dir, key), code('BACKUP_REGISTRY'));
});


test('a newer floor recording deletion cannot resurrect the old live election', async () => {
  const floor = clone();
  mutate(floor, 'control.sqlite', "UPDATE election_registry SET state='DELETED',dek_wrapped=NULL");
  const path = join(floor, 'manifest.json'); const m = JSON.parse(readFileSync(path, 'utf8'));
  for (const f of m.files) if (f.name !== 'control.sqlite') rmSync(join(floor, f.name));
  m.files = m.files.filter((f: { name: string }) => f.name === 'control.sqlite'); writeFileSync(path, JSON.stringify(m));
  assert.deepEqual((await verifyBackup(floor, key)).deleted_elections, [w.electionId]);
  const destination = join(root, 'resurrection-refused');
  await assert.rejects(restoreBackup(current, key, destination, floor), code('BACKUP_ROLLBACK'));
  assert.equal(existsSync(destination), false);
});


test('a restore candidate cannot discard a deletion tombstone from its history floor', async () => {
  const floor = clone();
  mutate(floor, 'control.sqlite', "UPDATE election_registry SET state='DELETED',dek_wrapped=NULL");
  const path = join(floor, 'manifest.json'); const m = JSON.parse(readFileSync(path, 'utf8'));
  for (const f of m.files) if (f.name !== 'control.sqlite') rmSync(join(floor, f.name));
  m.files = m.files.filter((f: { name: string }) => f.name === 'control.sqlite'); writeFileSync(path, JSON.stringify(m));
  const candidate = clone(floor);
  mutate(candidate, 'control.sqlite', 'DELETE FROM election_cleanup; DELETE FROM runtime_anchor; DELETE FROM election_registry');
  assert.deepEqual((await verifyBackup(candidate, key)).deleted_elections, [], 'candidate is structurally valid but has forgotten the deletion');
  const destination = join(root, 'forgotten-tombstone-refused');
  await assert.rejects(restoreBackup(candidate, key, destination, floor), code('BACKUP_ROLLBACK'));
  assert.equal(existsSync(destination), false);
});
