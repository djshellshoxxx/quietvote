// @verifies QV-28-REQ-010, QV-28-REQ-015
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { openDb, type Migration, type OpenOpts } from '../src/db.ts';
import { MIGRATIONS as ELECTION_MIGRATIONS } from '../src/electiondb.ts';

const next: Migration = { version: 2, name: 'next', sql: 'CREATE TABLE added(id INTEGER PRIMARY KEY) STRICT;' };
const schema = (table: string): Migration => ({ version: 1, name: 'initial', sql: `
CREATE TABLE schema_migration(version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 BLOB NOT NULL, applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT;
CREATE TABLE ${table}(state TEXT NOT NULL) STRICT;
${table === 'election' ? 'CREATE TABLE log_entry(seq INTEGER PRIMARY KEY,header BLOB,leaf_hash BLOB); CREATE TABLE checkpoint(tree_size INTEGER PRIMARY KEY,root_hash BLOB);' : ''}` });
function fixture(table: string, state: string, applicationId: number, fn: (options: OpenOpts, directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'qv-migration-policy-'));
  const options: OpenOpts = { path: join(directory, 'test.sqlite'), applicationId, synchronous: 'FULL', appVersion: 'fixture', migrations: [schema(table), next] };
  try {
    const db = openDb({ ...options, migrations: [schema(table)] }); db.prepare(`INSERT INTO ${table} VALUES (?)`).run(state); db.close();
    fn(options, directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

for (const [table, applicationId] of [['election', 0x51564442], ['election_registry', 0x51564343]] as const) {
  test(`${table}: automatic pending schema upgrade refuses OPEN before creating a backup`, () => fixture(table, 'OPEN', applicationId, (options) => {
    assert.throws(() => openDb(options), /OPEN.*force-migrate-open/);
    assert.equal(existsSync(options.path + '.pre-migrations'), false);
    const reader = new DatabaseSync(options.path, { readOnly: true });
    try { assert.equal(reader.prepare('PRAGMA user_version').get()?.['user_version'], 1); }
    finally { reader.close(); }
  }));
  test(`${table}: explicit force permits a backed-up upgrade, then current-schema OPEN needs no force`, () => fixture(table, 'OPEN', applicationId, (options) => {
    openDb({ ...options, forceMigrateOpen: true }).close();
    assert.equal(existsSync(options.path + '.pre-migrations'), true);
    openDb(options).close();
  }));
}

for (const state of ['ARCHIVED', 'IMPORTED']) test(`${state} upgrade requires a distinct explicit archive maintenance operation`, () => fixture('election', state, 0x51564442, (options) => {
  assert.throws(() => openDb({ ...options, forceMigrateOpen: true }), /explicit archive migration/);
  assert.equal(existsSync(options.path + '.pre-migrations'), false);
  openDb({ ...options, allowArchiveMigration: true }).close();
}));

test('an unrelated version-zero SQLite file is not claimed as a new QuietVote database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-unrelated-db-')), path = join(dir, 'other.sqlite');
  try {
    const original = new DatabaseSync(path); original.exec("CREATE TABLE existing(value TEXT); INSERT INTO existing VALUES('retained')"); original.close();
    assert.throws(() => openDb({ path, applicationId: 0x51564442, migrations: [schema('election')], appVersion: 'fixture', synchronous: 'FULL' }), /uninitialized.*not empty/);
    const reader = new DatabaseSync(path, { readOnly: true });
    try { assert.equal(reader.prepare('PRAGMA application_id').get()?.['application_id'], 0); assert.equal(reader.prepare('SELECT value FROM existing').get()?.['value'], 'retained'); }
    finally { reader.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration ledger entries beyond user_version refuse before migration', () => fixture('election', 'DRAFT', 0x51564442, (options) => {
  const original = new DatabaseSync(options.path);
  original.exec("INSERT INTO schema_migration VALUES(99,'extra',zeroblob(32),0,'fixture')"); original.close();
  assert.throws(() => openDb(options), /migration ledger/);
  assert.equal(existsSync(options.path + '.pre-migrations'), false);
}));

for (const table of ['election', 'log_entry', 'checkpoint']) test(`an established election cannot migrate after its ${table} table is lost`, () => {
  const directory = mkdtempSync(join(tmpdir(), 'qv-missing-migration-evidence-')), path = join(directory, 'election.sqlite');
  const options: OpenOpts = { path, applicationId: 0x51564442, synchronous: 'FULL', appVersion: 'fixture', migrations: ELECTION_MIGRATIONS };
  try {
    const original = openDb({ ...options, migrations: ELECTION_MIGRATIONS.slice(0, 1) });
    original.exec(`DROP TABLE ${table}`); original.close();
    assert.throws(() => openDb(options), new RegExp(`missing required ${table} table`));
    assert.equal(existsSync(path + '.pre-migrations'), false, 'a missing evidence baseline cannot produce a migration backup');
    const inspected = new DatabaseSync(path, { readOnly: true });
    try { assert.equal(inspected.prepare('PRAGMA user_version').get()?.['user_version'], 1); }
    finally { inspected.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
