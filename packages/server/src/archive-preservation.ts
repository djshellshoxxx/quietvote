// SPDX-License-Identifier: AGPL-3.0-or-later
// Storage preservation for explicit archive migration; private comparison hashes, never public authority evidence.
import { createHash, type Hash } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { openDb, type Migration } from './db.ts';
import { MIGRATIONS } from './electiondb.ts';
import { MIGRATIONS as CONTROL_MIGRATIONS } from './controldb.ts';

type Row = Record<string, SQLOutputValue>;
interface TableShape { name: string; columns: Row[]; foreignKeys: Row[]; strict: number; wr: number }
interface TableSnapshot {
  name: string;
  columns: string[];
  order: string[];
  omitBridgeFloor: boolean;
  rows: bigint;
  sha256: string;
}
export interface ArchivePreservation { version: number; tables: readonly TableSnapshot[] }
const protectedBoard = new Set(['log_entry', 'checkpoint', 'merkle_node']);
const ident = (name: string): string => `"${name.replaceAll('"', '""')}"`;
function fail(): never { throw new Error('archive storage preservation failed'); }

function tableShape(db: DatabaseSync, name: string): TableShape {
  const object = db.prepare('SELECT type,rootpage FROM main.sqlite_schema WHERE name=?').get(name);
  if (object?.type !== 'table' || typeof object.rootpage !== 'number' || object.rootpage <= 0 ||
      db.prepare('SELECT 1 FROM sqlite_temp_schema WHERE name=? COLLATE NOCASE').get(name) !== undefined) fail();
  const row = db.prepare('PRAGMA main.table_list').all().find((entry) => entry.name === name && entry.schema === 'main');
  if (row === undefined || typeof row.strict !== 'number' || typeof row.wr !== 'number') fail();
  return { name, columns: db.prepare(`PRAGMA main.table_xinfo(${ident(name)})`).all(),
    foreignKeys: db.prepare(`PRAGMA main.foreign_key_list(${ident(name)})`).all(), strict: row.strict, wr: row.wr };
}

/** A matching checksum ledger is necessary but cannot prove that required tables/columns still exist. */
function assertSchema(db: DatabaseSync, version: number, migrations: readonly Migration[], applicationId: number): void {
  if (!Number.isSafeInteger(version) || version < 1 || version > migrations.length) fail();
  const expected = openDb({ path: ':memory:', applicationId, synchronous: 'FULL',
    migrations: migrations.slice(0, version), appVersion: 'archive-schema-check' });
  try {
    for (const row of expected.prepare("SELECT name FROM sqlite_schema WHERE type='table'").iterate()) {
      if (typeof row.name !== 'string') fail();
      if (JSON.stringify(tableShape(db, row.name)) !== JSON.stringify(tableShape(expected, row.name))) fail();
    }
    // Explicit indexes and triggers in the shipped prefix have not been rewritten by these migrations.
    for (const row of expected.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY name").iterate()) {
      const actual = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name=?').get(row.name!);
      if (JSON.stringify(actual) !== JSON.stringify(row)) fail();
    }
  } finally { expected.close(); }
}

export function assertArchiveSchema(db: DatabaseSync, version: number): void {
  assertSchema(db, version, MIGRATIONS, 0x51564442);
}
/** Historical absence of runtime_anchor is valid only when the declared control schema also predates it. */
export function assertControlSchema(db: DatabaseSync, version: number): void {
  assertSchema(db, version, CONTROL_MIGRATIONS, 0x51564343);
}

function frame(hash: Hash, type: number, bytes: Uint8Array): void {
  const prefix = Buffer.alloc(9);
  prefix[0] = type; prefix.writeBigUInt64BE(BigInt(bytes.byteLength), 1);
  hash.update(prefix).update(bytes);
}
function value(hash: Hash, type: SQLOutputValue | undefined, data: SQLOutputValue | undefined): void {
  if (type === 'null' && data === null) { frame(hash, 0, new Uint8Array()); return; }
  if (type === 'integer' && typeof data === 'bigint') {
    const bytes = Buffer.alloc(8); bytes.writeBigInt64BE(data); frame(hash, 1, bytes); return;
  }
  if (type === 'real' && typeof data === 'number' && !Number.isNaN(data)) {
    const bytes = Buffer.alloc(8); bytes.writeDoubleBE(data); frame(hash, 2, bytes); return;
  }
  if ((type === 'text' || type === 'blob') && data instanceof Uint8Array) { frame(hash, type === 'text' ? 3 : 4, data); return; }
  fail();
}

function digest(db: DatabaseSync, table: Omit<TableSnapshot, 'rows' | 'sha256'>, version: number): { rows: bigint; sha256: string } {
  const shape = tableShape(db, table.name);
  if (table.columns.some((name) => !shape.columns.some((column) => column.name === name))) fail();
  const projection = table.columns.map((name, i) => {
    const column = ident(name);
    return `typeof(${column}) AS t${i}, CASE WHEN typeof(${column}) IN ('text','blob') THEN CAST(${column} AS BLOB) ELSE ${column} END AS v${i}`;
  }).join(',');
  const where = table.name === 'schema_migration' ? ' WHERE version<=?' : table.omitBridgeFloor ? " WHERE key<>'webhook_bridge_floor'" : '';
  const statement = db.prepare(`SELECT ${projection} FROM main.${ident(table.name)}${where} ORDER BY ${table.order.map(ident).join(',')}`);
  statement.setReadBigInts(true);
  const iterator = table.name === 'schema_migration' ? statement.iterate(version) : statement.iterate();
  const hash = createHash('sha256');
  frame(hash, 10, Buffer.from('qv-archive-preservation/v1')); frame(hash, 11, Buffer.from(table.name));
  for (const name of table.columns) frame(hash, 12, Buffer.from(name));
  let rows = 0n;
  try {
    for (const row of iterator) {
      hash.update(new Uint8Array([13]));
      for (let i = 0; i < table.columns.length; i++) value(hash, row[`t${i}`], row[`v${i}`]);
      rows++;
    }
  } finally { iterator.return?.(); }
  return { rows, sha256: hash.digest('hex') };
}

/** Preserve every preexisting non-board row/column, including erased fields, old receipts and sqlite_sequence. */
export function captureArchivePreservation(db: DatabaseSync, version: number): ArchivePreservation {
  const tables: TableSnapshot[] = [];
  for (const object of db.prepare("SELECT name FROM main.sqlite_schema WHERE type IN ('table','view') AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name").all()) {
    if (typeof object.name !== 'string') fail();
    if (protectedBoard.has(object.name)) continue; // Shared migration invariants verify these exact rows and Merkle roots.
    const shape = tableShape(db, object.name);
    const columns = shape.columns.map((column) => {
      if (typeof column.name !== 'string' || column.hidden !== 0) fail();
      return column.name;
    }).sort();
    const order = shape.columns.filter((column) => typeof column.pk === 'number' && column.pk > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk)).map((column) => String(column.name));
    if (object.name === 'sqlite_sequence') order.push('name', 'seq');
    if (order.length === 0) fail();
    const omitBridgeFloor = object.name === 'meta' && version < 6 &&
      db.prepare("SELECT 1 FROM meta WHERE key='webhook_bridge_floor'").get() === undefined;
    const table = { name: object.name, columns, order, omitBridgeFloor };
    tables.push({ ...table, ...digest(db, table, version) });
  }
  return { version, tables };
}

export function assertArchivePreserved(db: DatabaseSync, before: ArchivePreservation): void {
  for (const table of before.tables) {
    const after = digest(db, table, before.version);
    if (after.rows !== table.rows || after.sha256 !== table.sha256) fail();
  }
}
