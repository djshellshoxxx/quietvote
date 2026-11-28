// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-010, QV-28-REQ-015
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS } from '../src/electiondb.ts';
import { ArchiveMigrationError, archiveMigrationMain, migrateArchive, type ArchiveMigrationOperations } from '../src/archive-migration.ts';
import { DATA_LOCK_NAME, lockDataDirectory } from '../src/data-lock.ts';
import { archiveGoldens, historicalArchive, historicalControl, fileHash, oldData, tableHash, assertRuntimeReader, type ArchiveGolden, type ArchiveFixture } from './helpers/archive-migration-fixture.ts';

const root = mkdtempSync(join(tmpdir(), 'qv-archive-migration-test-'));
let goldens: ArchiveGolden[];
before(async () => { goldens = await archiveGoldens(root); }, { timeout: 120_000 });
after(() => rmSync(root, { recursive: true, force: true }));
function fixture(version = 8, kind: ArchiveGolden['kind'] = 'native'): ArchiveFixture {
  return historicalArchive(root, goldens.find((value) => value.kind === kind)!, version);
}
function read<T>(path: string, fn: (database: DatabaseSync) => T): T {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return fn(db); } finally { db.close(); }
}
function write(path: string, fn: (database: DatabaseSync) => void): void {
  const db = new DatabaseSync(path);
  try { fn(db); } finally { db.close(); }
}
function refused(f: ArchiveFixture, operations: ArchiveMigrationOperations = {}, publication: 'not_published' | 'possibly_published' = 'not_published'): ArchiveMigrationError {
  let error: unknown;
  try { migrateArchive(f.dir, f.golden.id, operations); } catch (failure) { error = failure; }
  assert.ok(error instanceof ArchiveMigrationError, 'migration must produce a bounded error');
  assert.equal(error.publication, publication);
  return error;
}
function child(mode: string, path: string, argument: string, expected: number): void {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./helpers/archive-migration-crash.ts', import.meta.url)), mode, path, argument],
    { encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
  assert.equal(result.error, undefined); assert.equal(result.status, expected);
  assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
}

for (const kind of ['native', 'imported'] as const) for (let version = 1; version < MIGRATIONS.length; version++) {
  test(`${kind} archive schema ${version} migrates via a private copy and preserves exact old data and control state`, { timeout: 120_000 }, async () => {
    const f = fixture(version, kind), control = fileHash(f.control), kek = fileHash(join(f.dir, 'kek', 'kek.bin'));
    const original = read(f.path, oldData), originalFile = fileHash(f.path);
    const result = migrateArchive(f.dir, f.golden.id);
    assert.equal(result.outcome, 'migrated'); assert.equal(result.from_version, version); assert.equal(result.to_version, MIGRATIONS.length);
    assert.equal(result.verification_scope, 'storage_preservation');
    assert.equal(result.runtime_anchor, kind === 'native' ? 'preserved' : 'not_owned');
    assert.ok(result.tree_size > 10); assert.match(result.root, /^[0-9a-f]{64}$/);
    assert.equal(fileHash(f.control), control, 'control, including its independent security floors, is untouched');
    assert.equal(fileHash(join(f.dir, 'kek', 'kek.bin')), kek);
    assert.ok(result.backup_path); assert.ok(existsSync(result.backup_path));
    read(result.backup_path, (db) => {
      assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], version);
      for (const table of original) assert.equal(tableHash(db, table.table, table.columns), table.hash, `backup retains ${table.table}`);
    });
    read(f.path, (db) => {
      assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], MIGRATIONS.length);
      for (const table of original) assert.equal(tableHash(db, table.table, table.columns, version < 6), table.hash, `migration preserves ${table.table}`);
      assert.equal(db.prepare('SELECT log_sk_enc,srv_sk_enc FROM election').get()?.['log_sk_enc'], null);
      assert.equal(db.prepare('SELECT log_sk_enc,srv_sk_enc FROM election').get()?.['srv_sk_enc'], null);
      if (version < 9) assert.equal(db.prepare('SELECT registration_scheme FROM election').get()?.['registration_scheme'], 'legacy-raw-v1');
    });
    assert.notEqual(fileHash(f.path), originalFile, 'the schema upgrade publishes the verified copy');
    assert.equal(readdirSync(join(f.dir, 'elections', f.golden.id.slice(0, 2))).some((name) => name.startsWith('.qv-archive-migration-')), false);
    await assertRuntimeReader(f);
  });
}

for (const kind of ['native', 'imported'] as const) test(`${kind} current archive is an exact no-op with no backup or replacement`, () => {
  const f = fixture(MIGRATIONS.length, kind), before = fileHash(f.path), control = fileHash(f.control);
  const report = migrateArchive(f.dir, f.golden.id, { backup: () => { throw new Error('unexpected backup'); }, replace: () => { throw new Error('unexpected replacement'); } });
  assert.equal(report.outcome, 'already_current'); assert.equal(report.backup_path, undefined);
  assert.equal(fileHash(f.path), before); assert.equal(fileHash(f.control), control);
});

test('an existing data-directory owner prevents archive maintenance before any database changes', () => {
  const f = fixture(), before = fileHash(f.path), control = fileHash(f.control), held = lockDataDirectory(f.dir);
  try {
    refused(f); assert.equal(fileHash(f.path), before); assert.equal(fileHash(f.control), control);
    assert.equal(existsSync(f.path + '.pre-migrations'), false);
  } finally { held.release(); }
});

for (const [name, mutation] of [
  ['future schema', (f: ArchiveFixture) => write(f.path, (db) => db.exec('PRAGMA user_version=99'))],
  ['checksum lineage', (f: ArchiveFixture) => write(f.path, (db) => db.exec('UPDATE schema_migration SET sha256=zeroblob(32) WHERE version=1'))],
  ['required table', (f: ArchiveFixture) => write(f.path, (db) => db.exec('DROP TABLE operation_receipt'))],
  ['public checkpoint root', (f: ArchiveFixture) => write(f.path, (db) => db.exec('UPDATE checkpoint SET root_hash=zeroblob(32)'))],
  ['organization binding', (f: ArchiveFixture) => write(f.path, (db) => db.exec("UPDATE election SET org_id='different-organization'"))],
  ['active lifecycle', (f: ArchiveFixture) => write(f.path, (db) => db.exec("UPDATE election SET state='OPEN'"))],
  ['independent anchor conflict', (f: ArchiveFixture) => write(f.control, (db) => db.exec('UPDATE runtime_anchor SET conflicted=1'))],
  ['independent anchor ahead of the archive', (f: ArchiveFixture) => write(f.control, (db) => db.exec('UPDATE runtime_anchor SET tree_size=tree_size+1'))],
  ['independent anchor fork', (f: ArchiveFixture) => write(f.control, (db) => db.exec('UPDATE runtime_anchor SET root=zeroblob(32)'))],
  ['missing required control anchor table', (f: ArchiveFixture) => write(f.control, (db) => db.exec('DROP TABLE runtime_anchor'))],
] as const) test(`${name} refuses before backup or persistent source mutation`, () => {
  const f = fixture(); mutation(f);
  const before = fileHash(f.path), control = fileHash(f.control);
  refused(f); assert.equal(fileHash(f.path), before); assert.equal(fileHash(f.control), control);
  assert.equal(existsSync(f.path + '.pre-migrations'), false);
});

for (const [name, sql] of [
  ['invitation state without a tree change', "UPDATE voter_invite SET state='issued' WHERE state='registered'"],
  ['erased invitation field', "UPDATE voter_invite SET label_enc=X'00' WHERE label_enc IS NULL"],
  ['operation receipt', "UPDATE operation_receipt SET response='{}'"],
  ['event sequence floor', "UPDATE sqlite_sequence SET seq=seq+1 WHERE name='event'"],
] as const) test(`candidate change to ${name} is rejected and the original stays usable`, () => {
  const f = fixture(), before = fileHash(f.path), control = fileHash(f.control);
  const error = refused(f, { observe: (phase, path) => { if (phase === 'migrated') write(path, (db) => db.exec(sql)); } });
  assert.ok(error.backupPath); assert.equal(fileHash(f.path), before); assert.equal(fileHash(f.control), control);
  assert.equal(read(f.path, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), f.version);
});

test('a failure that throws undefined cannot be reported as a successful no-op', () => {
  const f = fixture(), before = fileHash(f.path);
  refused(f, { observe: (phase) => { if (phase === 'copied') throw undefined; } });
  assert.equal(fileHash(f.path), before);
});

for (const mode of ['older_prefix', 'absent_row', 'historical_control'] as const) test(`${mode} anchor evidence is preserved without creating or advancing trust`, () => {
  const f = fixture();
  if (mode === 'historical_control') historicalControl(f, 7);
  else if (mode === 'absent_row') write(f.control, (db) => db.prepare('DELETE FROM runtime_anchor WHERE election_id=?').run(f.golden.id));
  else {
    const prefix = read(f.path, (db) => db.prepare('SELECT tree_size,root_hash FROM checkpoint ORDER BY tree_size LIMIT 1').get()!);
    write(f.control, (db) => db.prepare('UPDATE runtime_anchor SET tree_size=?,root=? WHERE election_id=?').run(prefix['tree_size']!, prefix['root_hash']!, f.golden.id));
  }
  const control = fileHash(f.control), report = migrateArchive(f.dir, f.golden.id);
  assert.equal(report.outcome, 'migrated'); assert.equal(report.verification_scope, 'storage_preservation');
  assert.equal(report.runtime_anchor, mode === 'older_prefix' ? 'preserved' : 'absent');
  assert.equal(fileHash(f.control), control, 'the command neither upgrades control nor creates/advances an independent anchor');
  assert.equal(Object.hasOwn(report, 'verified'), false); assert.equal(Object.hasOwn(report, 'fresh'), false);
  read(f.control, (db) => {
    if (mode === 'historical_control') {
      assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 7);
      assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='runtime_anchor'").get(), undefined);
    } else if (mode === 'absent_row') assert.equal(db.prepare('SELECT 1 FROM runtime_anchor WHERE election_id=?').get(f.golden.id), undefined);
  });
});

test('an imported mirror cannot inherit native anchor ownership', () => {
  const f = fixture(8, 'imported');
  const row = read(f.path, (db) => db.prepare('SELECT origin,log_pk FROM election').get()!);
  write(f.control, (db) => db.prepare('INSERT INTO runtime_anchor(election_id,origin,log_pk,tree_size,root) VALUES (?,?,?,?,?)')
    .run(f.golden.id, row['origin']!, row['log_pk']!, 0, new Uint8Array(32)));
  const before = fileHash(f.path), control = fileHash(f.control);
  assert.equal(refused(f).code, 'ARCHIVE_ANCHOR');
  assert.equal(fileHash(f.path), before); assert.equal(fileHash(f.control), control);
});

test('committed source WAL is retained in both copies while control main and WAL bytes stay untouched', { timeout: 120_000 }, async () => {
  const f = fixture();
  child('wal', f.path, 'election', 73); child('wal', f.control, 'control', 73);
  assert.ok(statSync(f.path + '-wal').size > 0); assert.ok(statSync(f.control + '-wal').size > 0);
  const control = fileHash(f.control), controlWal = fileHash(f.control + '-wal');
  const report = migrateArchive(f.dir, f.golden.id);
  assert.equal(report.outcome, 'migrated'); assert.ok(report.backup_path);
  for (const path of [report.backup_path, f.path]) read(path, (db) => {
    assert.equal(db.prepare("SELECT value FROM meta WHERE key='archive_wal_fixture'").get()?.['value'], 'committed');
  });
  assert.equal(fileHash(f.control), control); assert.equal(fileHash(f.control + '-wal'), controlWal);
  assert.equal(existsSync(f.path + '-wal'), false, 'replacement cannot inherit a stale source WAL');
  await assertRuntimeReader(f);
});

test('a busy source checkpoint refuses replacement and keeps committed WAL data available for retry', { timeout: 120_000 }, () => {
  const f = fixture(); child('wal', f.path, 'election', 73);
  const reader = new DatabaseSync(f.path, { readOnly: true });
  try {
    reader.exec('BEGIN'); assert.equal(reader.prepare("SELECT value FROM meta WHERE key='archive_wal_fixture'").get()?.['value'], 'committed');
    const out: string[] = [], err: string[] = [];
    assert.equal(archiveMigrationMain(['--data-dir', f.dir, '--election', f.golden.id], (text) => out.push(text), (text) => err.push(text)), 1);
    assert.deepEqual(out, []); assert.equal(err.length, 1);
    assert.match(err[0]!, /^qv-migrate-archive: ARCHIVE_CHECKPOINT; replacement was not published\.\nRetained backup: /);
    const retained = err[0]!.split('\n')[1]!.slice('Retained backup: '.length);
    assert.ok(existsSync(retained));
    assert.equal(read(retained, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), f.version);
    assert.doesNotMatch(err[0]!, /Error:|SQLITE_BUSY|stack/);
    assert.ok(statSync(f.path + '-wal').size > 0);
    assert.equal(reader.prepare('PRAGMA user_version').get()?.['user_version'], f.version);
  } finally { reader.close(); }
  const result = migrateArchive(f.dir, f.golden.id); assert.equal(result.outcome, 'migrated');
  assert.equal(read(f.path, (db) => db.prepare("SELECT value FROM meta WHERE key='archive_wal_fixture'").get()?.['value']), 'committed');
});

for (const boundary of ['copied', 'migrated', 'verified', 'before_replace'] as const) test(`failure at ${boundary} retains the old archive and the retained backup`, () => {
  const f = fixture(), before = fileHash(f.path), control = fileHash(f.control);
  const error = refused(f, { observe: (phase) => { if (phase === boundary) throw new Error('injected preparation failure'); } });
  assert.ok(error.backupPath); assert.ok(existsSync(error.backupPath));
  assert.equal(fileHash(f.path), before); assert.equal(fileHash(f.control), control);
  assert.equal(read(f.path, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), f.version);
  assert.equal(existsSync(join(f.dir, DATA_LOCK_NAME)), false);
});

for (const stage of ['backup', 'source_checkpoint'] as const) test(`${stage} failure prevents archive replacement`, () => {
  const f = fixture(), before = fileHash(f.path);
  const operations: ArchiveMigrationOperations = stage === 'backup'
    ? { backup: () => { throw new Error('injected backup failure'); } }
    : { checkpoint: (db, kind) => {
      if (kind === 'source') throw new Error('injected checkpoint failure');
      assert.equal(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()?.['busy'], 0);
    } };
  refused(f, operations); assert.equal(fileHash(f.path), before);
  assert.equal(read(f.path, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), f.version);
});

test('a replacement operation that reports failure conservatively reports possible publication', () => {
  const f = fixture(), before = fileHash(f.path);
  refused(f, { replace: () => { throw new Error('injected replacement failure'); } }, 'possibly_published');
  assert.equal(fileHash(f.path), before, 'this injected operation did not rename, but the command cannot assume that from an error');
});

for (const stage of ['replace_return', 'directory_sync'] as const) test(`${stage} failure after rename reports possible publication and retains the old backup`, { timeout: 120_000 }, async () => {
  const f = fixture(), control = fileHash(f.control);
  const operations: ArchiveMigrationOperations = stage === 'replace_return'
    ? { replace: (source, destination) => { renameSync(source, destination); throw new Error('injected post-rename failure'); } }
    : { syncDirectory: () => { throw new Error('injected directory sync failure'); } };
  const error = refused(f, operations, 'possibly_published'); assert.ok(error.backupPath);
  assert.equal(read(error.backupPath, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), f.version);
  assert.equal(read(f.path, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), MIGRATIONS.length);
  assert.equal(fileHash(f.control), control); await assertRuntimeReader(f);
});

for (const boundary of ['before_replace', 'after_replace'] as const) test(`process exit at ${boundary} leaves an old or complete new archive with a retained original`, { timeout: 120_000 }, async () => {
  const f = fixture(), before = fileHash(f.path), control = fileHash(f.control);
  child(boundary, f.dir, f.golden.id, 74);
  assert.equal(existsSync(join(f.dir, DATA_LOCK_NAME)), true, 'a dead owner does not silently lose its maintenance lock');
  assert.equal(fileHash(f.control), control);
  const expected = boundary === 'before_replace' ? f.version : MIGRATIONS.length;
  assert.equal(read(f.path, (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), expected);
  if (boundary === 'before_replace') assert.equal(fileHash(f.path), before);
  const backups = readdirSync(f.path + '.pre-migrations', { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith(`v${f.version}-`));
  assert.equal(backups.length, 1);
  assert.equal(read(join(f.path + '.pre-migrations', backups[0]!.name, 'database.sqlite'), (db) => db.prepare('PRAGMA user_version').get()?.['user_version']), f.version);
  // The sole owning child has exited. Recovery here models an operator removing only that confirmed stale lock.
  rmdirSync(join(f.dir, DATA_LOCK_NAME));
  const result = migrateArchive(f.dir, f.golden.id);
  assert.equal(result.outcome, boundary === 'before_replace' ? 'migrated' : 'already_current');
  assert.equal(readdirSync(join(f.dir, 'elections', f.golden.id.slice(0, 2))).some((name) => name.startsWith('.qv-archive-migration-')), true,
    'the command does not adopt or delete an abandoned private copy from another process');
  await assertRuntimeReader(f);
});

test('pinned roll corruption in a candidate is refused even when the original tree and schema are unchanged', () => {
  const f = fixture(10), before = fileHash(f.path);
  const error = refused(f, { observe: (phase, path) => {
    if (phase !== 'migrated') return;
    write(path, (db) => {
      const trigger = db.prepare("SELECT sql FROM sqlite_schema WHERE name='pinned_roll_noupdate'").get()?.['sql'];
      assert.equal(typeof trigger, 'string');
      db.exec("DROP TRIGGER pinned_roll_noupdate; UPDATE pinned_roll SET keys_json='[]'");
      db.exec(String(trigger));
    });
  } });
  assert.ok(error.backupPath); assert.equal(fileHash(f.path), before);
});

test('the installed qv delegate performs a real historical migration and reports only its storage scope', { timeout: 120_000 }, async () => {
  const f = fixture(), control = fileHash(f.control), repository = fileURLToPath(new URL('../../..', import.meta.url));
  const result = spawnSync(process.execPath, [join(repository, 'packages/cli/bin/qv.ts'), 'migrate-archive',
    '--data-dir', f.dir, '--election', f.golden.id, '--json'], { encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, PATH: [join(repository, 'node_modules/.bin'), dirname(process.execPath)].join(delimiter), NODE_NO_WARNINGS: '1' } });
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.deepEqual(Object.keys(report).sort(), ['format', 'outcome', 'verification_scope', 'runtime_anchor', 'election_id', 'from_version',
    'to_version', 'tree_size', 'root', 'backup_path', 'directory_sync'].sort());
  assert.equal(report['outcome'], 'migrated'); assert.equal(report['verification_scope'], 'storage_preservation');
  assert.equal(report['runtime_anchor'], 'preserved'); assert.equal(report['election_id'], f.golden.id);
  assert.equal(fileHash(f.control), control); await assertRuntimeReader(f);
});

test('maintenance failure JSON has closed fields and does not echo raw paths or create a mistyped directory', () => {
  const missing = join(root, 'withheld-mistyped-data-directory'), out: string[] = [], err: string[] = [];
  assert.equal(archiveMigrationMain(['--data-dir', missing, '--election', 'ab'.repeat(16), '--json'], (text) => out.push(text), (text) => err.push(text)), 1);
  assert.deepEqual(out, []); assert.equal(err.length, 1);
  assert.deepEqual(JSON.parse(err[0]!), { code: 'ARCHIVE_MIGRATION_FAILED', publication: 'not_published' });
  assert.doesNotMatch(err[0]!, /withheld-mistyped-data-directory|ENOENT|stack/); assert.equal(existsSync(missing), false);
});
