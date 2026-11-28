// SPDX-License-Identifier: AGPL-3.0-or-later
// Build the actual shipped schema-11 prefix around a genuine signed pre-completion append.
import assert from 'node:assert/strict';
import { renameSync } from 'node:fs';
import type { SQLOutputValue } from 'node:sqlite';
import { openDb } from '../../src/db.ts';
import { ElectionDb, MIGRATIONS } from '../../src/electiondb.ts';

type Row = Record<string, SQLOutputValue>;
const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** Called by the sole fixture child after COMMIT and immediately before process.exit. */
export function installLegacyAppendFixture(source: ElectionDb, prior: Row): void {
  const rows = new Map<string, Row[]>();
  for (const { name } of source.db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()) {
    rows.set(String(name), source.db.prepare(`SELECT * FROM ${quote(String(name))}`).all());
  }
  for (const row of rows.get('election')!) Object.assign(row, prior);
  rows.set('event', rows.get('event')!.filter((row) => row['type'] !== 'phase'));
  rows.set('schema_migration', rows.get('schema_migration')!.filter((row) => Number(row['version']) <= 11));
  for (const row of rows.get('sqlite_sequence') ?? []) {
    if (row['name'] === 'event') row['seq'] = Math.max(0, ...rows.get('event')!.map((event) => Number(event['event_id'])));
  }
  const path = source.path + '.legacy-fixture';
  const old = openDb({ path, applicationId: 0x51564442, synchronous: 'FULL', migrations: MIGRATIONS.slice(0, 11), appVersion: 'legacy-append-fixture' });
  try {
    old.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    const tables = old.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name<>'sqlite_sequence' ORDER BY rowid").all();
    for (const { name } of tables) {
      const table = String(name), columns = old.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => String(row['name']));
      old.exec(`DELETE FROM ${quote(table)}`);
      const insert = old.prepare(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of rows.get(table) ?? []) insert.run(...columns.map((column) => row[column]!));
    }
    old.exec('DELETE FROM sqlite_sequence');
    for (const row of rows.get('sqlite_sequence') ?? []) old.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)').run(row['name']!, row['seq']!);
    old.exec('COMMIT; PRAGMA foreign_keys=ON');
    assert.equal(old.prepare('PRAGMA foreign_key_check').get(), undefined);
    assert.equal(old.prepare('PRAGMA user_version').get()!['user_version'], 11);
    assert.equal(old.prepare('PRAGMA table_info(append_completion)').all().some((row) => row['name'] === 'events_committed'), false);
  } finally { old.close(); }
  source.close(); // No SQLite handle may retain the replaced fixture file.
  renameSync(path, source.path);
}
