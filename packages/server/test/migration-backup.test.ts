// @verifies QV-08-REQ-031, QV-28-REQ-010
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { openDb, type Migration } from '../src/db.ts';

const applicationId = 0x51564343;
const initial: Migration = { version: 1, name: 'initial', sql: `
CREATE TABLE schema_migration(version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 BLOB NOT NULL, applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT;
CREATE TABLE item(id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT;
INSERT INTO item VALUES (1,'before');` };
const next: Migration = { version: 2, name: 'second', sql: "ALTER TABLE item ADD COLUMN extra TEXT; UPDATE item SET value='after';" };
const open = (path: string, migrations: readonly Migration[]) => openDb({ path, migrations, applicationId, synchronous: 'FULL', appVersion: 'fixture' });
function fixture(fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'qv-migration-backup-'));
  try { fn(join(dir, 'control.sqlite')); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function backups(path: string): string[] {
  const root = path + '.pre-migrations';
  return existsSync(root) ? readdirSync(root).filter((name) => /^v\d+-\d+-[a-zA-Z0-9]+$/.test(name)).map((name) => join(root, name)) : [];
}

test('a new database and a current-schema reopen do not create migration backups', () => fixture((path) => {
  open(path, [initial, next]).close(); open(path, [initial, next]).close();
  assert.equal(existsSync(path + '.pre-migrations'), false);
}));

test('pending migration first saves a verified private snapshot including committed WAL data', () => fixture((path) => {
  const writer = open(path, [initial]);
  try {
    writer.exec("INSERT INTO item VALUES (2,'committed-in-WAL')");
    assert.ok(lstatSync(path + '-wal').size > 0);
    const upgraded = open(path, [initial, next]);
    try {
      assert.equal(upgraded.prepare('PRAGMA user_version').get()?.['user_version'], 2);
      assert.equal(upgraded.prepare('SELECT value FROM item WHERE id=2').get()?.['value'], 'after');
      const directories = backups(path); assert.equal(directories.length, 1);
      const directory = directories[0]!, snapshot = join(directory, 'database.sqlite');
      const metadata = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
      assert.equal(metadata.format, 'qv-migration-backup/v1');
      assert.equal(metadata.from_version, 1); assert.equal(metadata.to_version, 2); assert.equal(metadata.application_id, applicationId);
      assert.equal(metadata.sha256, createHash('sha256').update(readFileSync(snapshot)).digest('hex'));
      assert.equal(metadata.byte_length, lstatSync(snapshot).size);
      assert.ok(Number.isSafeInteger(metadata.created_at));
      const copy = new DatabaseSync(snapshot, { readOnly: true });
      try {
        assert.equal(copy.prepare('PRAGMA integrity_check').get()?.['integrity_check'], 'ok');
        assert.equal(copy.prepare('PRAGMA user_version').get()?.['user_version'], 1);
        assert.deepEqual(copy.prepare('SELECT id,value FROM item ORDER BY id').all().map((row) => ({ ...row })),
          [{ id: 1, value: 'before' }, { id: 2, value: 'committed-in-WAL' }]);
      } finally { copy.close(); }
      if (process.platform !== 'win32') {
        assert.equal(lstatSync(directory).mode & 0o777, 0o700);
        assert.equal(lstatSync(snapshot).mode & 0o777, 0o600);
        assert.equal(lstatSync(join(directory, 'manifest.json')).mode & 0o777, 0o600);
      }
    } finally { upgraded.close(); }
  } finally { writer.close(); }
}));

test('failure to create the backup prevents all pending SQL and preserves the previous schema', () => fixture((path) => {
  open(path, [initial]).close();
  writeFileSync(path + '.pre-migrations', 'blocked by a regular file');
  assert.throws(() => open(path, [initial, next]), /migration backup/i);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 1);
    assert.equal(db.prepare('SELECT value FROM item').get()?.['value'], 'before');
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_migration').get()?.['n'], 1);
  } finally { db.close(); }
}));

test('a later failed migration rolls back the complete pending chain while retaining its verified backup', () => fixture((path) => {
  open(path, [initial]).close();
  const broken: Migration = { version: 3, name: 'broken', sql: 'CREATE TABLE second_added(id INTEGER); INSERT INTO missing VALUES (1);' };
  assert.throws(() => open(path, [initial, next, broken]), /missing/);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 1);
    assert.equal(db.prepare('SELECT value FROM item').get()?.['value'], 'before');
    assert.deepEqual(db.prepare('PRAGMA table_info(item)').all().map((row) => row['name']), ['id', 'value']);
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='second_added'").get()?.['n'], 0);
  } finally { db.close(); }
  assert.equal(backups(path).length, 1);
}));

for (const sql of ['COMMIT;', 'END;', 'ROLLBACK;', 'SAVEPOINT escape;', 'PRAGMA application_id=1;', "ATTACH ':memory:' AS second;"])
  test(`migration SQL cannot escape runner ownership with ${sql.split(' ')[0]}`, () => fixture((path) => {
    open(path, [initial]).close();
    const invalid: Migration = { version: 3, name: 'unsafe-control', sql: `/* a comment with a semicolon; */ ${sql} UPDATE item SET value='escaped';` };
    assert.throws(() => open(path, [initial, next, invalid]), /unsupported migration SQL/);
    const reader = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(reader.prepare('PRAGMA user_version').get()?.['user_version'], 1);
      assert.equal(reader.prepare('PRAGMA application_id').get()?.['application_id'], applicationId);
      assert.equal(reader.prepare('SELECT value FROM item').get()?.['value'], 'before');
    } finally { reader.close(); }
    assert.equal(backups(path).length, 1);
  }));

test('SQLite boundaries preserve quoted semicolons, comments and complete trigger bodies', () => fixture((path) => {
  open(path, [initial]).close();
  const complex: Migration = { version: 2, name: 'quoted-and-trigger', sql: `-- Leading comment; COMMIT;
INSERT INTO item VALUES(2,'a; -- quoted');
CREATE TRIGGER keep_item BEFORE DELETE ON item BEGIN SELECT RAISE(ABORT,'keep; item'); END;
/* harmless trailing comment; */` };
  const db = open(path, [initial, complex]);
  try {
    assert.equal(db.prepare('SELECT value FROM item WHERE id=2').get()?.['value'], 'a; -- quoted');
    assert.throws(() => db.exec('DELETE FROM item'), /keep; item/);
  } finally { db.close(); }
}));
