// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite';
import { bytesToHex } from '@quietvote/crypto';
import { makeSpoil, signRecord } from '@quietvote/protocol';
import { openDb } from '../../src/db.ts';
import { MIGRATIONS } from '../../src/electiondb.ts';
import { MIGRATIONS as CONTROL_MIGRATIONS } from '../../src/controldb.ts';
import { exportQvb, importAndWait, waitJob } from './full.ts';
import { World } from './world.ts';

type Row = Record<string, SQLOutputValue>;
const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;
export interface ArchiveGolden {
  kind: 'native' | 'imported'; dir: string; id: string; relative: string; rows: Map<string, Row[]>; clock: number; seed: string;
}
export interface ArchiveFixture { golden: ArchiveGolden; dir: string; path: string; control: string; version: number }

function snapshot(w: World, root: string, kind: ArchiveGolden['kind'], id: string): ArchiveGolden {
  const relative = join('elections', id.slice(0, 2), `${id}.sqlite`), rows = new Map<string, Row[]>();
  const db = new DatabaseSync(join(w.dir, relative), { readOnly: true });
  try {
    for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY rowid").all()) {
      assert.equal(typeof name, 'string');
      rows.set(String(name), db.prepare(`SELECT * FROM ${quote(String(name))}`).all());
    }
  } finally { db.close(); }
  const dir = join(root, kind); cpSync(w.dir, dir, { recursive: true });
  return { kind, dir, id, relative, rows, clock: w.clock, seed: w.o.seed };
}

/** Genuine signed/proved archive and verified imported mirror; no invented log rows or acceptance-policy changes. */
export async function archiveGoldens(root: string): Promise<ArchiveGolden[]> {
  const native = new World({ seed: 'archive-migration-native', n: 3, t: 2, voters: 4, pinnedRoll: true, spoilTrustees: true,
    freshConnections: true, server: { retentionSweepMs: 0 } });
  const mirror = new World({ seed: 'archive-migration-mirror', n: 3, t: 2, voters: 0, freshConnections: true, server: { retentionSweepMs: 0 } });
  try {
    await native.start(); await native.setupOrgAndElection(); await native.registerVoters();
    const endpoint = `/api/v1/elections/${native.electionId}`;
    const unused = await native.signed('POST', endpoint + '/invites', { items: [{ label: 'archive-label-canary', contact: 'archive-contact-canary' }] }, native.owner, native.idemKey());
    assert.equal(unused.status, 201);
    assert.equal((await native.signed('DELETE', endpoint + '/invites/' + unused.json.invites[0].invite_id)).status, 204);
    assert.equal((await native.publishManifest()).status, 201); await native.ceremony();
    assert.equal((await native.open()).status, 201);
    for (let i = 0; i < 4; i++) assert.equal((await native.cast(i, { budget: [i % 2 ? 'no' : 'yes'], chair: ['ann'] })).status, 201);
    const ballot = native.build(0, { budget: ['no'], chair: ['bob'] }), voter = native.voters[0]!;
    assert.equal((await native.post('ballot_audit', voter, makeSpoil(native.params, voter.secretKey, ballot, 'trustees'))).status, 201);
    assert.equal((await native.close()).status, 201);
    for (const j of [1, 3]) {
      assert.equal((await native.postSpoilShare(await native.spoilShareRecord(j, bytesToHex(ballot.code)))).status, 201);
      assert.equal((await native.trusteeShares(j)).status, 201); native.tick();
    }
    const draft = await native.get(endpoint + '/tally/draft?decrypters=1,3'), coordinator = native.coord[0]!;
    assert.equal(draft.status, 200);
    assert.equal((await native.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, native.params.ctx, draft.json.body))).status, 201);
    assert.equal((await native.post('audit_close', coordinator, native.control('audit-close'))).status, 201);
    assert.equal((await native.signed('GET', endpoint + '/invites')).status, 200);
    const started = await native.signed('POST', endpoint + '/exports', { kind: 'public' }, native.owner, native.idemKey());
    assert.equal(started.status, 202);
    const job = await waitJob(native, started.json.job_id); assert.equal(job.state, 'done');
    const exported = (await native.signed('GET', job.result_ref)).json;
    assert.equal((await native.signed('POST', exported.acknowledgement_url,
      { tree_size: exported.tree_size, root_hash: exported.root_hash, sha256: exported.sha256 }, native.owner, native.idemKey())).status, 200);
    const runtime = (await native.server.pool.get(native.electionId))!;
    runtime.maintain('retention', (db) => db.pruneEvents()); // Nonzero AUTOINCREMENT floor with no retained event rows.
    await mirror.start(); await mirror.setupOrgAndElection();
    assert.equal((await importAndWait(mirror, await exportQvb(native))).state, 'done');
    await native.server.stop(); await mirror.server.stop();
    return [snapshot(native, root, 'native', native.electionId), snapshot(mirror, root, 'imported', native.electionId)];
  } finally {
    if (mirror.server) await mirror.stop(); else rmSync(mirror.dir, { recursive: true, force: true });
    if (native.server) await native.stop(); else rmSync(native.dir, { recursive: true, force: true });
  }
}

/** Reconstruct a shipped historical schema and project only columns/records that existed in that version. */
export function historicalArchive(root: string, golden: ArchiveGolden, version: number): ArchiveFixture {
  const dir = mkdtempSync(join(root, `${golden.kind}-v${version}-`)); cpSync(golden.dir, dir, { recursive: true });
  const path = join(dir, golden.relative);
  for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
  const db = openDb({ path, applicationId: 0x51564442, synchronous: 'FULL', migrations: MIGRATIONS.slice(0, version), appVersion: 'historical-fixture' });
  try {
    db.exec('PRAGMA foreign_keys=OFF; DELETE FROM meta');
    const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migration' ORDER BY rowid").all();
    for (const { name } of names) {
      const table = String(name), columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => String(row['name']));
      const insert = db.prepare(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of golden.rows.get(table) ?? []) {
        if (table === 'meta' && version < 6 && row['key'] === 'webhook_bridge_floor') continue;
        if (table === 'operation_receipt' && version < 11 && typeof row['audit_action'] === 'string' && row['audit_action'].startsWith('export.')) continue;
        insert.run(...columns.map((column) => row[column] as SQLInputValue));
      }
    }
    if (version >= 2) {
      db.exec('DELETE FROM sqlite_sequence');
      for (const row of golden.rows.get('sqlite_sequence') ?? []) {
        if (names.some(({ name }) => name === row['name'])) db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)').run(row['name']!, row['seq']!);
      }
    }
    db.exec('PRAGMA foreign_keys=ON');
    assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  } finally { db.close(); }
  return { golden, dir, path, control: join(dir, 'control.sqlite'), version };
}

/** Preserve actual registry/control rows in the shipped prefix, including a genuinely pre-anchor control schema. */
export function historicalControl(fixture: ArchiveFixture, version: number): void {
  const rows = new Map<string, Row[]>(), original = new DatabaseSync(fixture.control, { readOnly: true });
  try {
    for (const { name } of original.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()) {
      rows.set(String(name), original.prepare(`SELECT * FROM ${quote(String(name))}`).all());
    }
  } finally { original.close(); }
  for (const suffix of ['', '-wal', '-shm']) rmSync(fixture.control + suffix, { force: true });
  const db = openDb({ path: fixture.control, applicationId: 0x51564343, synchronous: 'FULL',
    migrations: CONTROL_MIGRATIONS.slice(0, version), appVersion: 'historical-control-fixture' });
  try {
    db.exec('PRAGMA foreign_keys=OFF');
    const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migration' ORDER BY rowid").all();
    for (const { name } of names) {
      const table = String(name), columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((row) => String(row['name']));
      const insert = db.prepare(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of rows.get(table) ?? []) insert.run(...columns.map((column) => row[column] as SQLInputValue));
    }
    db.exec('DELETE FROM sqlite_sequence');
    for (const row of rows.get('sqlite_sequence') ?? []) {
      if (names.some(({ name }) => name === row['name'])) db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)').run(row['name']!, row['seq']!);
    }
    db.exec('PRAGMA foreign_keys=ON');
    assert.equal(db.prepare('PRAGMA foreign_key_check').get(), undefined);
  } finally { db.close(); }
}

export function fileHash(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
export function oldData(db: DatabaseSync): { table: string; columns: string[]; hash: string }[] {
  const tables: { table: string; columns: string[]; hash: string }[] = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name<>'schema_migration' ORDER BY name").all()) {
    const table = String(name), columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => String(column['name']));
    tables.push({ table, columns, hash: tableHash(db, table, columns) });
  }
  return tables;
}
export function tableHash(db: DatabaseSync, table: string, columns: string[], omitBridge = false): string {
  const where = omitBridge && table === 'meta' ? " WHERE key<>'webhook_bridge_floor'" : '';
  const rows = db.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}${where}`).all();
  const encoded = rows.map((row) => JSON.stringify(row, (_key, value: unknown) => value instanceof Uint8Array ? { bytes: Buffer.from(value).toString('base64') } : value)).sort();
  return createHash('sha256').update(JSON.stringify(encoded)).digest('hex');
}

export async function assertRuntimeReader(fixture: ArchiveFixture): Promise<void> {
  const w = new World({ seed: fixture.golden.seed, n: 3, t: 2, voters: 0, server: { retentionSweepMs: 0 } });
  rmSync(w.dir, { recursive: true, force: true }); w.dir = fixture.dir; w.clock = fixture.golden.clock;
  try {
    await w.start();
    const rt = (await w.server.pool.get(fixture.golden.id))!;
    assert.equal(rt.edb.readOnly, true);
    assert.equal(rt.state, fixture.golden.kind === 'native' ? 'ARCHIVED' : 'IMPORTED');
    assert.throws(() => rt.edb.db.prepare('UPDATE election SET title=title').run(), /readonly database/);
    assert.equal((await w.get(`/api/v1/elections/${fixture.golden.id}/state`)).status, 200);
  } finally { if (w.server) await w.server.stop(); }
}
