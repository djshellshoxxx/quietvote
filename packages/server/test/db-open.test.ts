// @verifies QV-28-REQ-003, QV-28-REQ-010, QV-28-REQ-015
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { openDb, type Migration } from '../src/db.ts';

const first: Migration = { version: 1, name: 'initial', sql: `
CREATE TABLE schema_migration (version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 BLOB NOT NULL, applied_at INTEGER NOT NULL, app_version TEXT NOT NULL) STRICT;
CREATE TABLE item (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT;
INSERT INTO item VALUES (1, 'retained');` };
const second: Migration = { version: 2, name: 'second', sql: 'CREATE TABLE added (id INTEGER PRIMARY KEY) STRICT;' };
const applicationId = 0x51564442;

function fixture(fn: (path: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'qv-db-open-')), path = join(dir, 'election.sqlite');
  try {
    const db = openDb({ path, applicationId, synchronous: 'FULL', migrations: [first], appVersion: 'fixture' });
    db.close();
    fn(path, dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function durableState(dir: string): [string, string][] {
  // SQLite may create locking SHM and a zero-byte WAL even for a native read-only
  // connection. Neither contains committed changes; actual database bytes must match.
  return readdirSync(dir).sort().flatMap((name) => {
    if (name === 'election.sqlite-shm') return [];
    const content = readFileSync(join(dir, name));
    if (name === 'election.sqlite-wal') { assert.equal(content.length, 0, 'no WAL frames may be written'); return []; }
    return [[name, createHash('sha256').update(content).digest('hex')]];
  });
}
function modify(path: string, sql: string): void {
  const db = new DatabaseSync(path);
  try { db.exec(sql); } finally { db.close(); }
}

test('a native read-only database opens with protections and refuses actual writes', () => fixture((path) => {
  const db = openDb({ path, applicationId, synchronous: 'FULL', migrations: [first], appVersion: 'test', readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA trusted_schema').get()?.['trusted_schema'], 0);
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'], 1);
    assert.equal(db.prepare('PRAGMA cell_size_check').get()?.['cell_size_check'], 1);
    assert.equal(db.prepare('SELECT value FROM item WHERE id=1').get()?.['value'], 'retained');
    assert.throws(() => db.exec("INSERT INTO item VALUES (2, 'forbidden')"), /readonly/i);
    assert.throws(() => db.exec("UPDATE item SET value='forbidden'"), /readonly/i);
  } finally { db.close(); }
}));

for (const readOnly of [true, false]) {
  for (const [label, sql, expected] of [
    ['wrong application ID', 'PRAGMA application_id=123', /application_id/],
    ['missing established application ID', 'PRAGMA application_id=0', /application_id/],
    ['newer schema', 'PRAGMA user_version=99', /newer than/],
    ['altered old checksum', 'UPDATE schema_migration SET sha256=zeroblob(32) WHERE version=1', /checksum mismatch/],
    ['missing old checksum', 'DELETE FROM schema_migration WHERE version=1', /checksum mismatch/],
  ] as const) test(`${readOnly ? 'read-only' : 'writable'} opening refuses ${label} before database changes`, () => fixture((path, dir) => {
    modify(path, sql);
    const before = durableState(dir);
    assert.throws(() => openDb({ path, applicationId, synchronous: 'FULL', migrations: [first, second], appVersion: 'test', readOnly }), expected);
    assert.deepEqual(durableState(dir), before);
  }));
}

test('an older read-only archive refuses without silently applying the pending migration', () => fixture((path, dir) => {
  const before = durableState(dir);
  assert.throws(() => openDb({ path, applicationId, synchronous: 'FULL', migrations: [first, second], appVersion: 'test', readOnly: true }), /explicit migration/);
  assert.deepEqual(durableState(dir), before);
}));

test('a named maintenance writer can change current data without permitting schema upgrade', () => fixture((path, dir) => {
  const before = durableState(dir);
  assert.throws(() => openDb({ path, applicationId, synchronous: 'FULL', migrations: [first, second], appVersion: 'test', allowMigrations: false }), /explicit migration/);
  assert.deepEqual(durableState(dir), before);
  const db = openDb({ path, applicationId, synchronous: 'FULL', migrations: [first], appVersion: 'test', allowMigrations: false });
  try {
    db.exec("UPDATE item SET value='explicit maintenance' WHERE id=1");
    assert.equal(db.prepare('SELECT value FROM item WHERE id=1').get()?.['value'], 'explicit maintenance');
    assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 1);
  } finally { db.close(); }
}));
