// @verifies QV-08-REQ-031, QV-28-REQ-010
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { openDb, validateSchema, type Migration } from '../src/db.ts';

const migrations: Migration[] = [
  { version: 1, name: 'initial', sql: `CREATE TABLE schema_migration(version INTEGER PRIMARY KEY,name TEXT NOT NULL,sha256 BLOB NOT NULL,applied_at INTEGER NOT NULL,app_version TEXT NOT NULL) STRICT;
    CREATE TABLE marker(id INTEGER PRIMARY KEY,value TEXT NOT NULL) STRICT; INSERT INTO marker VALUES(1,'original');` },
  { version: 2, name: 'changed', sql: "UPDATE marker SET value='changed'; CREATE TABLE second_step(id INTEGER PRIMARY KEY) STRICT;" },
  { version: 3, name: 'final', sql: "ALTER TABLE marker ADD COLUMN added TEXT; INSERT INTO marker VALUES(2,'later','new');" },
];
const options = (path: string) => ({ path, applicationId: 0x51564343, synchronous: 'FULL' as const, appVersion: 'crash-fixture' });

test('process death before migration commit rolls back every pending step and retains a usable original snapshot', { timeout: 30_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'qv-migration-crash-')), path = join(directory, 'control.sqlite');
  try {
    openDb({ ...options(path), migrations: migrations.slice(0, 1) }).close();
    const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/migration-crash.mjs', import.meta.url)), path, JSON.stringify(migrations)],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    const closed = new Promise<void>((resolve, reject) => {
      child.once('error', reject); child.once('close', () => resolve());
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`migration child did not reach commit boundary: ${stderr}`)), 15_000);
        child.stderr.on('data', (bytes: Buffer) => { stderr = (stderr + bytes.toString()).slice(-4096); });
        child.stdout.on('data', (bytes: Buffer) => {
          stdout = (stdout + bytes.toString()).slice(-4096);
          if (stdout.includes('MIGRATION_BEFORE_COMMIT\n')) { clearTimeout(timer); resolve(); }
        });
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('close', () => { clearTimeout(timer); reject(new Error(`migration child exited before the cut: ${stderr}`)); });
      });
      assert.equal(child.kill('SIGKILL'), true);
      await closed;
      const recovered = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(validateSchema(recovered, migrations), 1);
        assert.deepEqual(recovered.prepare('SELECT * FROM marker').all().map((row) => ({ ...row })), [{ id: 1, value: 'original' }]);
        assert.equal(recovered.prepare("SELECT name FROM sqlite_schema WHERE name='second_step'").get(), undefined);
        assert.equal(recovered.prepare('PRAGMA integrity_check').get()?.['integrity_check'], 'ok');
      } finally { recovered.close(); }
      const root = path + '.pre-migrations', snapshots = readdirSync(root).filter((name) => name.startsWith('v'));
      assert.equal(snapshots.length, 1);
      const snapshot = new DatabaseSync(join(root, snapshots[0]!, 'database.sqlite'), { readOnly: true });
      try {
        assert.equal(validateSchema(snapshot, migrations), 1);
        assert.equal(snapshot.prepare('SELECT value FROM marker').get()?.['value'], 'original');
        assert.equal(snapshot.prepare('PRAGMA integrity_check').get()?.['integrity_check'], 'ok');
      } finally { snapshot.close(); }
      const upgraded = openDb({ ...options(path), migrations });
      try {
        assert.equal(validateSchema(upgraded, migrations), 3);
        assert.deepEqual(upgraded.prepare('SELECT * FROM marker ORDER BY id').all().map((row) => ({ ...row })),
          [{ id: 1, value: 'changed', added: null }, { id: 2, value: 'later', added: 'new' }]);
      } finally { upgraded.close(); }
    } finally { child.kill('SIGKILL'); await closed; }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
