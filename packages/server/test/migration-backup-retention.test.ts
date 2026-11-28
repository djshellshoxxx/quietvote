// @verifies QV-28-REQ-010, QV-28-REQ-013
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createMigrationBackup } from '../src/migration-backup.ts';
import { DELETED_BACKUP_RETENTION_MS, MIGRATION_BACKUP_RETENTION_MS, pruneMigrationBackups } from '../src/migration-backup-retention.ts';
import { buildServer } from '../src/app.ts';

const day = 24 * 60 * 60 * 1000, now = 200 * day;
function withSource(fn: (source: string, snapshot: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'qv-migration-retention-')), source = join(dir, 'control.sqlite');
  try {
    const db = new DatabaseSync(source);
    db.exec('PRAGMA application_id=1364607811; PRAGMA user_version=1; CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES (\'original\')');
    db.close();
    const original = createMigrationBackup({ path: source, applicationId: 0x51564343, fromVersion: 1, toVersion: 2, appVersion: 'retention-fixture' });
    fn(source, dirname(original));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function age(directory: string, createdAt: number): string {
  const path = join(directory, 'manifest.json');
  const m = JSON.parse(readFileSync(path, 'utf8')); m.created_at = createdAt;
  writeFileSync(path, JSON.stringify(m));
  const next = join(dirname(directory), `v${m.from_version}-${createdAt}-${basename(directory).split('-').at(-1)}`);
  renameSync(directory, next); return next;
}
function second(directory: string, createdAt: number): string {
  const next = mkdtempSync(join(dirname(directory), '.copy-')); cpSync(directory, next, { recursive: true }); return age(next, createdAt);
}
const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

test('30-day boundary removes an older complete snapshot while keeping the newest live snapshot and source bytes', () => withSource((source, original) => {
  const older = age(original, now - MIGRATION_BACKUP_RETENTION_MS), newer = second(older, now - day);
  const bytes = digest(source);
  assert.equal(pruneMigrationBackups(source, now - 1), 0);
  assert.equal(pruneMigrationBackups(source, now), 1);
  assert.equal(existsSync(older), false); assert.equal(existsSync(newer), true);
  assert.equal(pruneMigrationBackups(source, now + 1000 * day), 0, 'last live snapshot is never expired');
  assert.equal(digest(source), bytes);
}));

test('clock rollback and future timestamps do not expire snapshots', () => withSource((source, original) => {
  const future = age(original, now + day); second(future, now + 2 * day);
  assert.equal(pruneMigrationBackups(source, now), 0);
  assert.throws(() => pruneMigrationBackups(source, Number.NaN), /retention time/);
}));

test('same-size corruption in the newest backup preserves every older valid snapshot until repaired', () => withSource((source, original) => {
  const older = age(original, day), newer = second(older, 2 * day), path = join(newer, 'database.sqlite');
  const originalBytes = readFileSync(path), corrupt = Buffer.from(originalBytes); corrupt[corrupt.length - 1]! ^= 1;
  writeFileSync(path, corrupt);
  assert.throws(() => pruneMigrationBackups(source, now), /retained migration backup checksum mismatch/);
  assert.equal(existsSync(older), true, 'the only intact snapshot remains available');
  assert.equal(existsSync(newer), true, 'corruption is retained for inspection');
  writeFileSync(path, originalBytes);
  assert.equal(pruneMigrationBackups(source, now), 1);
  assert.equal(existsSync(newer), true);
}));

test('deleted snapshots retain the full 90-day grace and then allow the final snapshot to expire', () => withSource((source, original) => {
  const directory = age(original, day), deletedAt = 100 * day;
  assert.equal(pruneMigrationBackups(source, deletedAt + DELETED_BACKUP_RETENTION_MS - 1, deletedAt), 0);
  assert.equal(existsSync(directory), true);
  assert.equal(pruneMigrationBackups(source, deletedAt + DELETED_BACKUP_RETENTION_MS, deletedAt), 1);
  assert.equal(existsSync(directory), false); assert.equal(existsSync(source), true);
}));

test('unknown, incomplete, foreign-source and extra-member directories are preserved', () => withSource((source, original) => {
  const old = age(original, day), root = source + '.pre-migrations';
  second(old, now - day);
  for (const name of ['operator-notes', '.pending-AbCd12', 'v1-2-AbCd13', 'v1-3-AbCd14']) mkdirSync(join(root, name));
  const foreign = join(root, 'v1-4-AbCd15'); cpSync(old, foreign, { recursive: true });
  const path = join(foreign, 'manifest.json'), m = JSON.parse(readFileSync(path, 'utf8'));
  m.created_at = 4; m.source = 'another.sqlite'; writeFileSync(path, JSON.stringify(m));
  writeFileSync(join(old, 'operator-notes.txt'), 'preserve me');
  assert.equal(pruneMigrationBackups(source, now), 0);
  assert.ok(existsSync(old)); assert.ok(existsSync(foreign));
  assert.equal(readFileSync(join(old, 'operator-notes.txt'), 'utf8'), 'preserve me');
}));

test('linked snapshot members are ineligible and a linked root refuses without touching its target', () => withSource((source, original) => {
  const old = age(original, day); second(old, now - day);
  const alias = join(dirname(source), 'linked-database.sqlite'); linkSync(join(old, 'database.sqlite'), alias);
  assert.equal(pruneMigrationBackups(source, now), 0);
  assert.ok(existsSync(old));
  const link = join(dirname(source), 'link.sqlite.pre-migrations');
  symlinkSync(source + '.pre-migrations', link, 'junction');
  assert.throws(() => pruneMigrationBackups(join(dirname(source), 'link.sqlite'), now), /real directory/);
  assert.ok(existsSync(old)); assert.ok(existsSync(alias));
}));

test('periodic retention prunes control and imported snapshots without opening historical mirror writers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-migration-sweep-'));
  let clock = now;
  const server = buildServer({ dataDir: dir, now: () => clock, retentionSweepMs: 0, minFreeBytes: 0, logSink: () => {} });
  try {
    const controlPath = join(dir, 'control.sqlite');
    const controlSnapshot = dirname(createMigrationBackup({ path: controlPath, applicationId: 0x51564343,
      fromVersion: server.env.control.migrationVersion(), toVersion: server.env.control.migrationVersion() + 1, appVersion: 'sweep-fixture' }));
    const oldControl = age(controlSnapshot, day); second(oldControl, now - day);
    const org = server.env.control.createOrg('retention', 'a'.repeat(16), Buffer.alloc(32));
    const imported = 'b'.repeat(32), rel = join('elections', 'bb', `${imported}.sqlite`), path = join(dir, rel);
    server.env.control.insertImported({ election_id: imported, org_id: org.org_id, db_path: rel, access: 'public', title: 'mirror', bytes_used: 0 });
    mkdirSync(dirname(path), { recursive: true });
    // A mirror's schema need not be current for metadata-only backup expiry. Never open or migrate it.
    writeFileSync(path, 'historical mirror remains untouched');
    const root = path + '.pre-migrations'; mkdirSync(root);
    const mirrorSnapshot = join(root, 'v1-1-AbCd12'); cpSync(oldControl, mirrorSnapshot, { recursive: true });
    const metaPath = join(mirrorSnapshot, 'manifest.json'), meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.source = basename(path); meta.from_version = 1; meta.to_version = 2; meta.created_at = 1; meta.application_id = 0x51564442;
    writeFileSync(metaPath, JSON.stringify(meta)); second(mirrorSnapshot, now - day);
    assert.equal(await server.retention.runOnce(), 0);
    assert.equal(server.retention.status.prunedMigrationBackups, 2);
    assert.equal(server.retention.status.failedDatabases, 0);
    assert.equal(existsSync(oldControl), false); assert.equal(existsSync(mirrorSnapshot), false);
    assert.equal(readFileSync(path, 'utf8'), 'historical mirror remains untouched');
    server.env.control.markDeleted(imported); rmSync(path);
    clock += DELETED_BACKUP_RETENTION_MS - 1;
    await server.retention.runOnce(); assert.equal(readdirSync(root).length, 1);
    clock++;
    await server.retention.runOnce(); assert.equal(readdirSync(root).length, 0);
    assert.equal(server.env.control.electionAny(imported)?.state, 'DELETED');
    assert.equal(existsSync(path), false, 'retention does not recreate the deleted database');
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});
