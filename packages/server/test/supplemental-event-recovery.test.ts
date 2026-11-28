import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { cosignLine } from '@quietvote/board';
import { DATA_LOCK_NAME } from '../src/data-lock.ts';
import type { EventRow } from '../src/electiondb.ts';
import { World } from './helpers/world.ts';

async function crashedWorld(mode: 'append' | 'legacy_append' | 'witness' | 'archive' | 'archive_erase'): Promise<World> {
  const info = await new Promise<{ dir: string; electionId: string; clock: number }>((resolve, reject) => {
    execFile(process.execPath, ['--max-old-space-size=256', fileURLToPath(new URL('./helpers/supplemental-crash.ts', import.meta.url)), mode],
      { timeout: 120_000 }, (error, stdout, stderr) => {
        if (!error || error.code !== 73) return reject(new Error(`child did not reach crash boundary: ${String(error)} ${stderr}`));
        try { resolve(JSON.parse(stdout.trim())); } catch (e) { reject(e); }
      });
  });
  const w = new World({ seed: 'supplemental-crash', n: 3, t: 2, voters: 2, witnessQuorum: 1 });
  rmSync(w.dir, { recursive: true });
  w.dir = info.dir; w.electionId = info.electionId; w.clock = info.clock;
  // The only process using this private test directory has exited. Mirror the documented operator lock removal.
  rmdirSync(join(w.dir, DATA_LOCK_NAME));
  return w;
}

for (const mode of ['append', 'legacy_append'] as const) test(`${mode} process exit retains or reconstructs its phase exactly once at startup`, async () => {
  const w = await crashedWorld(mode);
  const before = new DatabaseSync(join(w.dir, 'elections', w.electionId.slice(0, 2), `${w.electionId}.sqlite`), { readOnly: true });
  const oldHashes = before.prepare('SELECT version,sha256 FROM schema_migration WHERE version<=11 ORDER BY version').all();
  try {
    assert.equal(before.prepare("SELECT COUNT(*) AS n FROM event WHERE type='phase'").get()!['n'], mode === 'append' ? 1 : 0);
    if (mode === 'legacy_append') assert.equal(before.prepare('PRAGMA user_version').get()!['user_version'], 11);
    else assert.equal(before.prepare('SELECT events_committed FROM append_completion').get()!['events_committed'], 1);
  } finally { before.close(); }
  await w.start();
  try {
    const stored = new DatabaseSync(join(w.dir, 'elections', w.electionId.slice(0, 2), `${w.electionId}.sqlite`));
    try {
      assert.equal(stored.prepare('SELECT COUNT(*) AS n FROM append_completion').get()!.n, 0, 'startup resolves the intent without a client runtime request');
      assert.equal(stored.prepare("SELECT COUNT(*) AS n FROM event WHERE type='phase'").get()!.n, 1);
      assert.deepEqual(stored.prepare('SELECT version,sha256 FROM schema_migration WHERE version<=11 ORDER BY version').all(), oldHashes);
      assert.ok(stored.prepare('PRAGMA table_info(append_completion)').all().some((column) => column['name'] === 'events_committed'));
    } finally { stored.close(); }
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.log.size, 1);
    assert.equal(rt.edb.hasAppendCompletions(), false);
    const rows = rt.edb.eventsAfter(0, 20);
    assert.deepEqual(rows.map((r) => r.type), ['entry', 'checkpoint', 'phase']);
    assert.deepEqual(JSON.parse(rows[2]!.data), { from: 'DRAFT', to: 'SETUP', seq: 0 });
    assert.equal(rows[2]!.ts, rows[0]!.ts, 'recovered phase keeps the original append timestamp');
    await w.server.stop(); await w.start();
    assert.deepEqual((await w.server.pool.get(w.electionId))!.edb.eventsAfter(0, 20), rows);
  } finally { await w.stop(); }
});

test('new-intent completion rollback retains the intent without losing or regenerating committed event IDs', async () => {
  const w = new World({ seed: 'supplemental-intent-rollback', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const live: EventRow[] = [];
    rt.subscribe({ event: (row) => live.push(row), close: () => undefined });
    const finish = rt.edb.finishAppendCompletion.bind(rt.edb);
    rt.edb.finishAppendCompletion = (seq) => { finish(seq); throw new Error('injected failure after deleting completion intent'); };
    const r = await w.publishManifest();
    assert.equal(r.status, 201, r.text);
    assert.equal(rt.edb.hasAppendCompletions(), true);
    assert.equal(rt.edb.appendEventsCommitted(0), true);
    assert.deepEqual(rt.edb.eventsAfter(0, 20).map((r) => r.type), ['entry', 'checkpoint', 'phase']);
    assert.deepEqual(live.map((r) => r.type), ['entry', 'checkpoint', 'phase']);
    // Exercise the archive-retention guard with this real failed completion still pending.
    rt.st.state = 'ARCHIVED';
    w.server.env.control.setState(w.electionId, 'ARCHIVED');
    w.tick(31 * 86400);
    assert.equal(rt.pruneEventsIfExpired(), false, 'retention cannot discard history before its pending events complete');
    assert.equal(rt.edb.eventsAfter(0, 20).length, 3);
    rt.st.state = 'SETUP';
    w.tick(60);
    await w.server.stop(); await w.start();
    const recovered = (await w.server.pool.get(w.electionId))!;
    const rows = recovered.edb.eventsAfter(0, 20);
    assert.equal(recovered.edb.hasAppendCompletions(), false);
    assert.deepEqual(rows.map((r) => r.type), ['entry', 'checkpoint', 'phase']);
    assert.equal(rows[2]!.ts, live[0]!.ts);
    assert.deepEqual(rows.map((row) => ({ ...row })), live, 'recovery must retain the already-committed event IDs exactly');
  } finally { await w.stop(); }
});

test('replay never regenerates completed, pruned or pre-upgrade supplemental events', async () => {
  const w = new World({ seed: 'supplemental-no-history', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.hasAppendCompletions(), false);
    rt.edb.pruneEvents();
    // Simulate a pre-intent schema containing a historical durable log whose events were already pruned.
    rt.edb.db.exec('DROP TABLE export_record; DROP TABLE pinned_roll; ALTER TABLE election DROP COLUMN registration_scheme; DROP TABLE operation_receipt; DROP TABLE append_completion; DELETE FROM schema_migration WHERE version>=7; PRAGMA user_version=6');
    await w.server.stop(); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.log.size, 1);
    assert.equal(reopened.edb.hasAppendCompletions(), false);
    assert.deepEqual(reopened.edb.eventsAfter(0, 20), []);
    await w.server.stop(); await w.start();
    assert.deepEqual((await w.server.pool.get(w.electionId))!.edb.eventsAfter(0, 20), []);
  } finally { await w.stop(); }
});

test('a flag-1 pending intent never regenerates deliberately pruned events', async () => {
  const w = new World({ seed: 'atomic-intent-no-regeneration', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    rt.edb.finishAppendCompletion = () => { throw new Error('retain the committed intent'); };
    assert.equal((await w.publishManifest()).status, 201);
    assert.equal(rt.edb.appendEventsCommitted(0), true);
    const floor = rt.edb.lastEventId();
    // Ordinary retention refuses pending intents; direct fixture pruning checks that recovery does not infer old format from absence.
    rt.edb.pruneEvents();
    await w.server.stop(); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.edb.hasAppendCompletions(), false);
    assert.deepEqual(reopened.edb.eventsAfter(0, 20), []);
    assert.equal(reopened.edb.lastEventId(), floor);
    await w.server.stop(); await w.start();
    assert.deepEqual((await w.server.pool.get(w.electionId))!.edb.eventsAfter(0, 20), []);
  } finally { await w.stop(); }
});

test('witness event failure rolls back its cosignature and retry commits the pair once', async () => {
  const w = new World({ seed: 'supplemental-witness-rollback', n: 3, t: 2, voters: 2, witnessQuorum: 1 });
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const live: EventRow[] = [];
    rt.subscribe({ event: (row) => live.push(row), close: () => undefined });
    const cp = rt.edb.store.latestCheckpoint()!;
    const text = cp.note.split('\n').slice(0, 3).join('\n') + '\n';
    const witness = w.witnesses[0]!;
    const line = cosignLine('w1', witness.secretKey, witness.publicKey, text, w.nowSec);
    const insert = rt.edb.insertEvent.bind(rt.edb);
    rt.edb.insertEvent = (...args) => { const row = insert(...args); if (args[1] === 'checkpoint') throw new Error('injected event failure after witness row'); return row; };
    await assert.rejects(rt.attachCosignatures(cp.size, [line]), /injected/);
    assert.equal(rt.witnessInfo().have, 0);
    assert.equal(rt.edb.store.getCheckpoint(cp.size)!.note, cp.note);
    assert.equal(rt.edb.eventsAfter(0, 20).filter((r) => r.type === 'witness').length, 0);
    assert.deepEqual(live, []);
    await w.server.stop(); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    const accepted = await reopened.attachCosignatures(cp.size, [line]);
    assert.deepEqual(accepted.accepted, ['w1']);
    const rows = reopened.edb.eventsAfter(0, 20);
    assert.deepEqual(rows.slice(-2).map((r) => r.type), ['witness', 'checkpoint']);
    assert.deepEqual((await reopened.attachCosignatures(cp.size, [line])).accepted, []);
    assert.deepEqual(reopened.edb.eventsAfter(0, 20), rows);
  } finally { await w.stop(); }
});

test('process exit after cosignature commit retains witness events without regenerating them on replay', async () => {
  const w = await crashedWorld('witness');
  await w.start();
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.witnessInfo().have, 1);
    const rows = rt.edb.eventsAfter(0, 20);
    assert.deepEqual(rows.map((r) => r.type), ['entry', 'checkpoint', 'phase', 'witness', 'checkpoint']);
    await w.server.stop(); await w.start();
    assert.deepEqual((await w.server.pool.get(w.electionId))!.edb.eventsAfter(0, 20), rows);
  } finally { await w.stop(); }
});

for (const mode of ['archive', 'archive_erase'] as const) test(`process exit at ${mode} resumes archive key destruction before resolving its intent`, { timeout: 150_000 }, async () => {
  const w = await crashedWorld(mode);
  const raw = new DatabaseSync(join(w.dir, 'elections', w.electionId.slice(0, 2), `${w.electionId}.sqlite`));
  try {
    const row = raw.prepare('SELECT log_sk_enc,srv_sk_enc,state FROM election').get()!;
    assert.equal(row.state, 'ARCHIVED', 'archive phase projection committed with its entry; key destruction remains pending');
    assert.ok(row.log_sk_enc && row.srv_sk_enc);
    assert.equal(raw.prepare("SELECT value FROM meta WHERE key='read_only'").get(), undefined);
    assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM append_completion').get()!.n, 1);
    assert.equal(raw.prepare('SELECT events_committed FROM append_completion').get()!['events_committed'], 1);
  } finally { raw.close(); }
  await w.start();
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.logState, 'ARCHIVED');
    assert.equal(rt.edb.row().state, 'ARCHIVED');
    assert.equal(rt.edb.row().log_sk_enc, null);
    assert.equal(rt.edb.row().srv_sk_enc, null);
    assert.equal(rt.edb.store.isReadOnly(), true);
    assert.equal(rt.edb.hasAppendCompletions(), false);
    const rows = rt.edb.eventsAfter(0, 500);
    assert.deepEqual(JSON.parse(rows.at(-1)!.data), { from: 'AUDIT', to: 'ARCHIVED', seq: rt.log.size - 1 });
    assert.equal(rt.log.checkpoint().ok, false, 'archive stays unable to sign checkpoints');
    await w.server.stop(); await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.edb.row().log_sk_enc, null);
    assert.equal(reopened.edb.row().srv_sk_enc, null);
    assert.equal(reopened.edb.store.isReadOnly(), true);
    assert.deepEqual(reopened.edb.eventsAfter(0, 500), rows);
  } finally { await w.stop(); }
});
