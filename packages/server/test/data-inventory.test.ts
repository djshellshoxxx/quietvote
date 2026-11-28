// @verifies QV-06-REQ-001 — current SQLite columns, not arbitrary nested JSON or non-database stores.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { ControlDb } from '../src/controldb.ts';
import { ElectionDb } from '../src/electiondb.ts';

interface Evidence { path: string; contains: string }
interface Column { name: string; class: string; basis: string; rationale?: string }
interface Table { name: string; purpose: string; evidence: Evidence[]; columns: Column[] }
interface Inventory {
  format: string;
  classification_source: string;
  bases: { id: string; class: string; rationale: string; evidence: Evidence[] }[];
  databases: { id: string; schema_source: string; tables: Table[] }[];
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
const inventory = JSON.parse(readFileSync(join(root, 'docs/data-inventory.json'), 'utf8')) as Inventory;
const privacy = readFileSync(join(root, 'docs/06-privacy-data-lifecycle.md'), 'utf8');
const classes = new Set([...privacy.matchAll(/^\| \*\*(C\d) /gm)].map((m) => m[1]!));
const nonempty = (s: string): void => assert.ok(typeof s === 'string' && s.trim().length > 0, 'nonempty string required');
function unique(names: string[], what: string): void {
  assert.equal(new Set(names).size, names.length, `duplicate ${what}`);
}
function validate(i: Inventory): void {
  assert.equal(i.format, 'qv-data-inventory/v1');
  assert.equal(i.classification_source, 'docs/06-privacy-data-lifecycle.md');
  assert.deepEqual([...classes], ['C0', 'C1', 'C2', 'C3', 'C4'], 'use the actual QV-06 classes');
  unique(i.bases.map((b) => b.id), 'classification basis');
  const bases = new Map(i.bases.map((b) => [b.id, b]));
  for (const b of i.bases) {
    nonempty(b.id); nonempty(b.rationale);
    assert.ok(classes.has(b.class), `unknown class ${b.class}`);
    assert.ok(b.evidence.length > 0, `missing basis evidence: ${b.id}`);
  }
  unique(i.databases.map((d) => d.id), 'database');
  assert.deepEqual(i.databases.map((d) => d.id).sort(), ['control', 'election']);
  for (const d of i.databases) {
    assert.ok(d.tables.length > 0);
    unique(d.tables.map((t) => t.name), `${d.id} table`);
    for (const t of d.tables) {
      nonempty(t.name); nonempty(t.purpose);
      assert.ok(t.evidence.length > 0 && t.columns.length > 0, `${d.id}.${t.name}: evidence and columns required`);
      unique(t.columns.map((c) => c.name), `${d.id}.${t.name} column`);
      for (const c of t.columns) {
        const field = `${d.id}.${t.name}.${c.name}`;
        nonempty(c.name);
        assert.ok(classes.has(c.class), `${field}: unknown class ${c.class}`);
        assert.notEqual(c.class, 'C4', `${field}: C4 is memory-only, not a persisted column`);
        assert.ok(bases.has(c.basis), `${field}: missing classification basis ${c.basis}`);
        assert.equal(c.class, bases.get(c.basis)!.class, `${field}: class contradicts its basis`);
        if (c.rationale !== undefined) nonempty(c.rationale);
      }
    }
  }
}
function stores(t: TestContext): Record<'control' | 'election', ControlDb | ElectionDb> {
  const dir = mkdtempSync(join(tmpdir(), 'qv-data-inventory-'));
  const opened: (ControlDb | ElectionDb)[] = [];
  t.after(() => {
    try { for (const store of opened.reverse()) store.close(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  const control = new ControlDb(dir, () => 0, 'inventory-test');
  opened.push(control);
  const election = new ElectionDb(join(dir, 'election.sqlite'), 'inventory-test');
  opened.push(election);
  return { control, election };
}
function fields(db: DatabaseSync, id: string): string[] {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  return tables.flatMap((t) => {
    // table_xinfo is the table_info superset: generated/hidden columns must not bypass coverage.
    const columns = db.prepare('SELECT name FROM pragma_table_xinfo(?) ORDER BY cid').all(String(t['name']));
    return columns.map((c) => `${id}.${String(t['name'])}.${String(c['name'])}`);
  }).sort();
}
function covered(db: DatabaseSync, id: string, i = inventory): void {
  const listed = i.databases.find((d) => d.id === id)!.tables.flatMap((t) => t.columns.map((c) => `${id}.${t.name}.${c.name}`)).sort();
  const actual = fields(db, id);
  const actualSet = new Set(actual), listedSet = new Set(listed);
  const missing = actual.filter((f) => !listedSet.has(f));
  const stale = listed.filter((f) => !actualSet.has(f));
  assert.deepEqual({ missing, stale }, { missing: [], stale: [] }, `inventory mismatch: ${JSON.stringify({ missing, stale })}`);
}
function firstColumn(i: Inventory): Column { return i.databases[0]!.tables[0]!.columns[0]!; }

test('data inventory has valid QV-06 classes, explicit bases and existing source evidence', () => {
  validate(inventory);
  const evidence = [
    ...inventory.bases.flatMap((b) => b.evidence),
    ...inventory.databases.flatMap((d) => [{ path: d.schema_source, contains: 'const MIGRATIONS:' }, ...d.tables.flatMap((t) => t.evidence)]),
  ];
  for (const e of evidence) {
    nonempty(e.path); nonempty(e.contains);
    assert.ok(readFileSync(join(root, e.path), 'utf8').includes(e.contains), `stale evidence: ${e.path}: ${e.contains}`);
  }
});

test('all columns from the real control and election migrations have exactly one inventory entry', (t) => {
  validate(inventory);
  for (const [id, store] of Object.entries(stores(t))) covered(store.db, id);
});

test('adding an unlisted column to either real database fails coverage', (t) => {
  for (const [id, store] of Object.entries(stores(t))) {
    store.db.exec('ALTER TABLE schema_migration ADD COLUMN inventory_canary TEXT');
    assert.throws(() => covered(store.db, id), new RegExp(`${id}\\.schema_migration\\.inventory_canary`));
  }
});

test('adding an unlisted table to either real database fails coverage', (t) => {
  for (const [id, store] of Object.entries(stores(t))) {
    store.db.exec('CREATE TABLE inventory_unlisted (value TEXT) STRICT');
    assert.throws(() => covered(store.db, id), new RegExp(`${id}\\.inventory_unlisted\\.value`));
  }
});

test('generated columns also fail coverage when not inventoried', (t) => {
  const { election } = stores(t);
  election.db.exec('ALTER TABLE schema_migration ADD COLUMN inventory_generated TEXT GENERATED ALWAYS AS (name) VIRTUAL');
  assert.throws(() => covered(election.db, 'election'), /election\.schema_migration\.inventory_generated/);
});

test('removed and stale inventory entries both fail coverage', (t) => {
  const { control } = stores(t);
  const missing = structuredClone(inventory);
  missing.databases[0]!.tables[0]!.columns.shift();
  assert.throws(() => covered(control.db, 'control', missing), /control\.schema_migration\.version/);
  const stale = structuredClone(inventory);
  stale.databases[0]!.tables[0]!.columns.push({ name: 'no_such_column', class: 'C3', basis: 'operations' });
  assert.throws(() => covered(control.db, 'control', stale), /control\.schema_migration\.no_such_column/);
});

test('unknown classes, transient persisted data, missing bases and contradictory bases are rejected', () => {
  for (const [change, message] of [
    [(c: Column) => { c.class = 'P0'; }, /unknown class P0/],
    [(c: Column) => { c.class = 'C4'; }, /C4 is memory-only/],
    [(c: Column) => { c.basis = 'unlisted'; }, /missing classification basis/],
    [(c: Column) => { c.class = 'C0'; }, /class contradicts its basis/],
  ] as const) {
    const invalid = structuredClone(inventory);
    change(firstColumn(invalid));
    assert.throws(() => validate(invalid), message);
  }
});

test('duplicate databases, tables, columns and classification bases are rejected', () => {
  for (const change of [
    (i: Inventory) => i.databases.push(i.databases[0]!),
    (i: Inventory) => i.databases[0]!.tables.push(i.databases[0]!.tables[0]!),
    (i: Inventory) => i.databases[0]!.tables[0]!.columns.push(firstColumn(i)),
    (i: Inventory) => i.bases.push(i.bases[0]!),
  ]) {
    const invalid = structuredClone(inventory);
    change(invalid);
    assert.throws(() => validate(invalid), /duplicate/);
  }
});
