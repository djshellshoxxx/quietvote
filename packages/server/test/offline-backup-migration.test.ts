// @verifies QV-28-REQ-010, QV-28-REQ-011, QV-12-REQ-005
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import { backupWork } from '../src/admin.ts';
import { buildServer } from '../src/app.ts';
import { MIGRATIONS as CONTROL_MIGRATIONS } from '../src/controldb.ts';
import { openDb, validateSchema } from '../src/db.ts';
import { MIGRATIONS as ELECTION_MIGRATIONS } from '../src/electiondb.ts';
import { BackupError, restoreBackup, verifyBackup } from '../src/offline-backup.ts';
import { exportQvb, fullElection, importAndWait } from './helpers/full.ts';
import { World } from './helpers/world.ts';

const hash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
function directoryBytes(directory: string): [string, string][] {
  return readdirSync(directory).sort().map((name) => [name, hash(join(directory, name))]);
}
async function snapshot(world: World, name: string): Promise<string> {
  const result = await backupWork(world.server.env, world.server.pool, name, 'all', undefined,
    { jobId: name, signal: new AbortController().signal, progress: () => {}, tick: async () => {} });
  return join(world.dir, result.result_ref!);
}
function seal(directory: string): void {
  const path = join(directory, 'manifest.json'), manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const item of manifest.files) {
    const bytes = readFileSync(join(directory, item.name)); item.bytes = bytes.length;
    item.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(path, JSON.stringify(manifest));
}
const quote = (name: string): string => '"' + name.replaceAll('"', '""') + '"';
/** Build actual shipped DDL, then populate its existing columns from a genuine signed election. */
function historical(path: string, control: boolean): void {
  const migrations = control ? CONTROL_MIGRATIONS : ELECTION_MIGRATIONS, version = migrations.length - 1;
  const source = new DatabaseSync(path, { readOnly: true }), next = path + '.historical';
  const destination = openDb({ path: next, applicationId: control ? 0x51564343 : 0x51564442,
    synchronous: 'FULL', migrations: migrations.slice(0, version), appVersion: 'historical-backup-fixture' });
  try {
    destination.exec('PRAGMA foreign_keys=OFF; BEGIN');
    for (const table of destination.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migration' ORDER BY rowid").all()) {
      const name = String(table['name']), columns = destination.prepare(`PRAGMA table_info(${quote(name)})`).all().map((c) => String(c['name']));
      destination.exec(`DELETE FROM ${quote(name)}`);
      const insert = destination.prepare(`INSERT INTO ${quote(name)}(${columns.map(quote).join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
      for (const row of source.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(name)}`).all()) {
        insert.run(...columns.map((column) => row[column] as SQLInputValue));
      }
    }
    destination.exec('COMMIT; PRAGMA foreign_keys=ON');
    assert.deepEqual(destination.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(validateSchema(destination, migrations), version);
    destination.exec('PRAGMA journal_mode=DELETE');
  } finally { destination.close(); source.close(); }
  renameSync(next, path);
}
function keyFor(world: World, root: string): string {
  const key = join(root, 'independent-kek.bin'); copyFileSync(join(world.dir, 'kek', 'kek.bin'), key); chmodSync(key, 0o600); return key;
}

test('explicit offline verification and restore migrate genuine historical OPEN copies without changing sources or bypassing a newer security floor', { timeout: 120_000 }, async () => {
  const world = await fullElection('offline-migrate-open', { stopAt: 'OPEN', server: { retentionSweepMs: 0 } });
  const root = mkdtempSync(join(tmpdir(), 'qv-offline-open-upgrade-'));
  try {
    const current = await snapshot(world, 'current-open'), old = join(root, 'historical'); cpSync(current, old, { recursive: true });
    historical(join(old, 'control.sqlite'), true); historical(join(old, `elections-${world.electionId}.sqlite`), false); seal(old);
    const before = directoryBytes(old), key = keyFor(world, root), original = (await world.server.pool.get(world.electionId))!;
    const report = await verifyBackup(old, key);
    assert.equal(report.elections[0]!.root, Buffer.from(original.log.root()).toString('hex'));
    assert.deepEqual(directoryBytes(old), before, 'verification changes only private disposable copies');
    const refused = join(root, 'newer-floor-refused');
    await assert.rejects(restoreBackup(old, key, refused, current),
      (error: unknown) => error instanceof BackupError && error.code === 'BACKUP_SECURITY_ROLLBACK');
    const destination = join(root, 'restored'); await restoreBackup(old, key, destination, old);
    assert.deepEqual(directoryBytes(old), before, 'restore does not upgrade or rewrite either source');
    const restored = buildServer({ dataDir: destination, now: () => world.clock, minFreeBytes: 0, retentionSweepMs: 0, logSink: () => {} });
    try {
      const runtime = (await restored.pool.get(world.electionId))!;
      assert.equal(runtime.state, 'OPEN');
      assert.equal(validateSchema(restored.env.control.db, CONTROL_MIGRATIONS), CONTROL_MIGRATIONS.length);
      assert.equal(validateSchema(runtime.edb.db, ELECTION_MIGRATIONS), ELECTION_MIGRATIONS.length);
      assert.deepEqual(runtime.log.root(), original.log.root());
      assert.deepEqual(runtime.edb.store.listCheckpoints(), original.edb.store.listCheckpoints());
      assert.ok(restored.env.control.auditRows().some((row) => row.action === 'restore'));
    } finally { await restored.stop(); }
  } finally { await world.stop(); rmSync(root, { recursive: true, force: true }); }
});

test('historical ARCHIVED and verified IMPORTED private backups restore to current read-only runtimes with all source bytes preserved', { timeout: 180_000 }, async () => {
  const source = await fullElection('offline-migrate-archive', { server: { retentionSweepMs: 0 } });
  const mirror = new World({ seed: 'offline-migrate-mirror', n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  const root = mkdtempSync(join(tmpdir(), 'qv-offline-terminal-upgrade-'));
  await mirror.start();
  try {
    await mirror.setupOrgAndElection();
    const imported = await importAndWait(mirror, await exportQvb(source)); assert.equal(imported.state, 'done');
    for (const [label, world] of [['ARCHIVED', source], ['IMPORTED', mirror]] as const) {
      const base = join(root, label);
      const current = await snapshot(world, `current-${label}`), old = base + '-historical'; cpSync(current, old, { recursive: true });
      historical(join(old, `elections-${source.electionId}.sqlite`), false); seal(old);
      const key = join(root, `${label}.kek`); copyFileSync(join(world.dir, 'kek', 'kek.bin'), key); chmodSync(key, 0o600);
      const before = directoryBytes(old), expected = await verifyBackup(current, key);
      assert.deepEqual(await verifyBackup(old, key), expected);
      const destination = base + '-restored'; await restoreBackup(old, key, destination, current);
      assert.deepEqual(directoryBytes(old), before);
      const restored = buildServer({ dataDir: destination, now: () => world.clock, minFreeBytes: 0, retentionSweepMs: 0, logSink: () => {} });
      try {
        const runtime = (await restored.pool.get(source.electionId))!;
        assert.equal(runtime.edb.readOnly, true);
        assert.equal(runtime.edb.row().state, label);
        assert.throws(() => runtime.edb.db.exec('UPDATE election SET title=title'), /readonly database/);
        assert.equal(validateSchema(runtime.edb.db, ELECTION_MIGRATIONS), ELECTION_MIGRATIONS.length);
        assert.equal(runtime.edb.row().log_sk_enc, null);
        const original = (await world.server.pool.get(source.electionId))!;
        assert.deepEqual(runtime.log.root(), original.log.root());
        assert.deepEqual(runtime.edb.store.listCheckpoints(), original.edb.store.listCheckpoints());
      } finally { await restored.stop(); }
    }
  } finally { await mirror.stop(); await source.stop(); rmSync(root, { recursive: true, force: true }); }
});
