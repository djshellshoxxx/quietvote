// @verifies QV-08-REQ-031, QV-28-REQ-010
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite';
import { before, test } from 'node:test';
import { MerkleTree, hashLeaf, parseCheckpoint, verifyLogSignature } from '@quietvote/board';
import { hexToBytes } from '@quietvote/crypto';
import { MIGRATIONS as CONTROL_MIGRATIONS, ControlDb } from '../src/controldb.ts';
import { MIGRATIONS as ELECTION_MIGRATIONS, ElectionDb } from '../src/electiondb.ts';
import { openDb, validateSchema } from '../src/db.ts';
import { World } from './helpers/world.ts';

type Row = Record<string, SQLOutputValue>;
const golden: Record<string, Row[]> = {};
let logKey: Uint8Array;
before(async () => {
  const world = new World({ seed: 'migration-historical-golden', n: 3, t: 2, voters: 3, witnessQuorum: 0 });
  try {
    await world.start(); await world.setupOrgAndElection(); await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201); await world.ceremony();
    const runtime = (await world.server.pool.get(world.electionId))!;
    assert.equal(runtime.st.state, 'READY');
    for (const table of ['election', 'meta', 'log_entry', 'checkpoint']) golden[table] = runtime.edb.db.prepare(`SELECT * FROM ${table}`).all();
    assert.ok(golden['log_entry']!.length > 5); assert.ok(golden['checkpoint']!.length > 0);
    logKey = hexToBytes(world.logPkHex, 32);
    for (const row of golden['checkpoint']!) {
      const parsed = parseCheckpoint(String(row['note_text'])); assert.ok(parsed.ok); assert.ok(verifyLogSignature(parsed.value, logKey));
    }
  } finally { await world.stop(); }
});

function copyTable(db: DatabaseSync, table: string, rows: Row[]): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => String(column['name']));
  const insert = db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (const row of rows) insert.run(...columns.map((column) => row[column] as SQLInputValue));
}
function boardRows(db: DatabaseSync) {
  return { entries: db.prepare('SELECT * FROM log_entry ORDER BY seq').all(), checkpoints: db.prepare('SELECT * FROM checkpoint ORDER BY tree_size').all() };
}
function verifyRoots(db: DatabaseSync): string {
  const leaves = db.prepare('SELECT header,leaf_hash FROM log_entry ORDER BY seq').all().map((row) => {
    const hash = hashLeaf(row['header'] as Uint8Array); assert.deepEqual(hash, new Uint8Array(row['leaf_hash'] as Uint8Array)); return hash;
  });
  const tree = MerkleTree.fromLeafHashes(leaves);
  for (const row of db.prepare('SELECT * FROM checkpoint ORDER BY tree_size').all()) {
    assert.deepEqual(tree.root(Number(row['tree_size'])), new Uint8Array(row['root_hash'] as Uint8Array));
    const parsed = parseCheckpoint(String(row['note_text'])); assert.ok(parsed.ok); assert.ok(verifyLogSignature(parsed.value, logKey));
  }
  return Buffer.from(tree.root()).toString('hex');
}
function snapshot(path: string): string {
  const root = path + '.pre-migrations', directories = readdirSync(root).filter((name) => name.startsWith('v'));
  assert.equal(directories.length, 1); return join(root, directories[0]!, 'database.sqlite');
}

for (let version = 1; version < CONTROL_MIGRATIONS.length; version++) test(`control v${version} upgrades through the shipped chain and keeps its prior snapshot`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-control-migration-')), path = join(dir, 'control.sqlite');
  try {
    const old = openDb({ path, applicationId: 0x51564343, synchronous: 'FULL', migrations: CONTROL_MIGRATIONS.slice(0, version), appVersion: 'old-fixture' });
    old.exec("INSERT INTO instance_meta VALUES ('instance_id','historical-instance'); INSERT INTO org(org_id,name,created_at) VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaa','Historical organization',123)"); old.close();
    const current = new ControlDb(dir, () => 456, 'current-fixture');
    try {
      assert.equal(current.migrationVersion(), CONTROL_MIGRATIONS.length);
      assert.equal(current.instanceId(), 'historical-instance');
      assert.equal(current.db.prepare('SELECT name FROM org').get()?.['name'], 'Historical organization');
    } finally { current.close(); }
    const copy = new DatabaseSync(snapshot(path), { readOnly: true });
    try {
      assert.equal(validateSchema(copy, CONTROL_MIGRATIONS), version);
      assert.equal(copy.prepare('SELECT value FROM instance_meta').get()?.['value'], 'historical-instance');
    } finally { copy.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (let version = 1; version < ELECTION_MIGRATIONS.length; version++) test(`election v${version} preserves real signed board rows, every checkpoint and the recomputed root`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'qv-election-migration-')), path = join(dir, 'election.sqlite');
  try {
    const old = openDb({ path, applicationId: 0x51564442, synchronous: 'FULL', migrations: ELECTION_MIGRATIONS.slice(0, version), appVersion: 'old-fixture' });
    // Migration 6 creates this projection, so a pre-v6 fixture cannot already contain it.
    old.exec('DELETE FROM meta');
    for (const table of ['election', 'meta', 'log_entry', 'checkpoint']) copyTable(old, table,
      table === 'meta' && version < 6 ? golden[table]!.filter((row) => row['key'] !== 'webhook_bridge_floor') : golden[table]!);
    const rows = boardRows(old), root = verifyRoots(old); old.close();
    const current = new ElectionDb(path, 'current-fixture');
    try {
      assert.equal(validateSchema(current.db, ELECTION_MIGRATIONS), ELECTION_MIGRATIONS.length);
      assert.deepEqual(boardRows(current.db), rows); assert.equal(verifyRoots(current.db), root);
    } finally { current.close(); }
    const copy = new DatabaseSync(snapshot(path), { readOnly: true });
    try {
      assert.equal(validateSchema(copy, ELECTION_MIGRATIONS), version);
      assert.deepEqual(boardRows(copy), rows); assert.equal(verifyRoots(copy), root);
    } finally { copy.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
