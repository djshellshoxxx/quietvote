// @verifies QV-09-REQ-014, QV-09-REQ-015, QV-28-REQ-010
// QV-ADR-027 N-32(b): persistent PUBLIC snapshots, explicit acknowledgement and ARCHIVED deletion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cosignLine, toHex } from '@quietvote/board';
import { bytesToHex, sha256 } from '@quietvote/crypto';
import { signRecord } from '@quietvote/protocol';
import { EXPORT_DELETE_GRACE_MS, EXPORT_DOWNLOAD_MS, MAX_PUBLIC_EXPORTS } from '../src/export-model.ts';
import { signRequest } from '../src/index.ts';
import { randomId } from '../src/util.ts';
import { fullElection, waitJob } from './helpers/full.ts';
import { World, kp } from './helpers/world.ts';

const admin = kp('recorded-exports', 'admin');
const root = (w: World): string => `/api/v1/elections/${w.electionId}`;
const binding = (r: any): { tree_size: number; root_hash: string; sha256: string } => ({ tree_size: r.tree_size, root_hash: r.root_hash, sha256: r.sha256 });
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function fixture(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 2, freshConnections: true, server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  await w.start(); await w.setupOrgAndElection(); await w.publishManifest();
  return w;
}
async function makeExport(w: World): Promise<any> {
  const response = await w.signed('POST', `${root(w)}/exports`, { kind: 'public' }, w.owner, w.idemKey());
  assert.equal(response.status, 202, response.text);
  const job = await waitJob(w, response.json.job_id);
  assert.equal(job.state, 'done', JSON.stringify(job));
  const record = await w.signed('GET', job.result_ref);
  assert.equal(record.status, 200, record.text);
  return record.json;
}
async function rawDownload(w: World, target: string, extra: Record<string, string> = {}): Promise<Response> {
  return fetch(w.base + target, { headers: { ...extra, connection: 'close', authorization: signRequest(w.owner.secretKey, w.owner.publicKey,
    'GET', target, w.audience, new Uint8Array(0), w.nowSec, w.rng.bytes(16)) } });
}
async function archive(w: World): Promise<void> {
  assert.equal((await w.close()).status, 201);
  for (const j of [1, 3]) { assert.equal((await w.trusteeShares(j)).status, 201); w.tick(); }
  const draft = await w.get(`${root(w)}/tally/draft?decrypters=1,3`), coordinator = w.coord[0]!;
  assert.equal((await w.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, draft.json.body))).status, 201);
  assert.equal((await w.post('audit_close', coordinator, w.control('audit-close'))).status, 201);
}

test('recorded export job is replay-safe, private to its organization, and pins exact bytes across later cosignatures and restart', async () => {
  const w = await fixture('exports-snapshot');
  try {
    const endpoint = `${root(w)}/exports`, key = w.idemKey();
    assert.equal((await w.req('POST', endpoint, { kind: 'public' }, { headers: key })).status, 401);
    assert.equal((await w.signed('POST', endpoint, { kind: 'public' })).status, 400);
    assert.equal((await w.signed('POST', endpoint, { kind: 'operator' }, w.owner, w.idemKey())).status, 422);
    assert.equal((await w.signed('POST', endpoint, { kind: 'public', include_contacts: false }, w.owner, w.idemKey())).status, 422);
    const canary = 'private-contact-must-not-be-exported';
    const invite = await w.signed('POST', `${root(w)}/invites`, { items: [{ contact: canary, label: canary }] }, w.owner, w.idemKey());
    assert.equal(invite.status, 201);
    const first = await w.signed('POST', endpoint, { kind: 'public' }, w.owner, key);
    assert.equal(first.status, 202, first.text);
    const duplicate = await w.signed('POST', endpoint, { kind: 'public' }, w.owner, key);
    assert.equal(duplicate.headers.get('idempotent-replay'), 'true');
    assert.equal(duplicate.json.job_id, first.json.job_id);
    const job = await waitJob(w, first.json.job_id);
    assert.equal(job.state, 'done', JSON.stringify(job));
    const record = (await w.signed('GET', job.result_ref)).json;
    const download = await rawDownload(w, record.download_url), bytes = new Uint8Array(await download.arrayBuffer());
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.equal(toHex(sha256(bytes)), record.sha256);
    assert.equal(bytes.length, record.byte_length);
    assert.ok(!Buffer.from(bytes).toString().includes(canary));
    const rt = (await w.server.pool.get(w.electionId))!;
    const note = (await w.get(`${root(w)}/log/checkpoint`)).text, witness = w.witnesses[0]!;
    const cosign = await w.req('POST', `${root(w)}/log/cosignatures`, { checkpoint_size: rt.log.size,
      lines: [cosignLine('w1', witness.secretKey, witness.publicKey, note.slice(0, note.indexOf('\n\n') + 1), w.nowSec)] });
    assert.equal(cosign.status, 200, cosign.text);
    assert.equal(rt.edb.publicExports().length, 1);
    assert.equal(rt.edb.publicExport(record.export_id)?.acknowledged_at, null);
    await w.server.stop(); await w.start();
    const again = new Uint8Array(await (await rawDownload(w, record.download_url)).arrayBuffer());
    assert.deepEqual(again, bytes, 'checkpoint additions and restarted clocks cannot reconstruct different bytes');
    assert.equal((await w.signed('GET', `${root(w)}/exports`)).json.items.length, 1);
    const stranger = kp('exports-snapshot', 'other-owner');
    const org = await w.req('POST', '/api/v1/orgs', { name: 'Other', owner_key: { alg: 'ed25519', pk: Buffer.from(stranger.publicKey).toString('base64url') } },
      { key: stranger, headers: w.idemKey() });
    assert.equal(org.status, 201, org.text);
    for (const target of [endpoint, job.result_ref, record.download_url]) assert.equal((await w.signed('GET', target, undefined, stranger)).status, 404);
    assert.equal((await w.signed('GET', `${root(w)}/exports/not-an-id`)).status, 404);
  } finally { await w.stop(); }
});

test('full, ranged and cancelled downloads never acknowledge; signed acknowledgement binds digest, root and size and keeps its first time', async () => {
  const w = await fixture('exports-ack');
  try {
    const record = await makeExport(w), rt = (await w.server.pool.get(w.electionId))!;
    const partial = await rawDownload(w, record.download_url, { range: 'bytes=0-127' });
    assert.equal(partial.status, 206); assert.equal((await partial.arrayBuffer()).byteLength, 128);
    const cancelled = await rawDownload(w, record.download_url); await cancelled.body?.cancel();
    assert.equal(rt.edb.publicExport(record.export_id)?.acknowledged_at, null);
    for (const changed of [{ sha256: '00'.repeat(32) }, { root_hash: '00'.repeat(32) }, { tree_size: record.tree_size + 1 }]) {
      const bad = await w.signed('POST', record.acknowledgement_url, { ...binding(record), ...changed }, w.owner, w.idemKey());
      assert.equal(bad.status, 422, bad.text); assert.equal(bad.json.code, 'EXPORT_BINDING_MISMATCH');
    }
    assert.equal(rt.edb.publicExport(record.export_id)?.acknowledged_at, null);
    const key = w.idemKey(), first = await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, key);
    assert.equal(first.status, 200, first.text);
    const firstAt = first.json.acknowledged_at;
    w.tick(20);
    const retry = await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, key);
    assert.equal(retry.headers.get('idempotent-replay'), 'true'); assert.equal(retry.json.acknowledged_at, firstAt);
    const later = await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, w.idemKey());
    assert.equal(later.json.acknowledged_at, firstAt);
    assert.equal(later.json.deletion_notice_at, null);
    assert.throws(() => rt.edb.db.prepare('UPDATE export_record SET acknowledged_at=acknowledged_at+1').run(), /immutable/);
    assert.throws(() => rt.edb.db.prepare('UPDATE export_record SET sha256=?').run(new Uint8Array(32)), /immutable/);
  } finally { await w.stop(); }
});

test('both deletion APIs and direct pool removal refuse an unacknowledged ARCHIVED tree; explicit final-export acknowledgement allows deletion', { timeout: 120_000 }, async () => {
  const w = await fullElection('exports-delete', { server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  try {
    const reg = w.server.env.control.election(w.electionId)!;
    const count = (): number => Number(w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM job WHERE kind='delete'").get()?.['n']);
    const before = count();
    for (const [target, signer] of [[root(w), w.owner], [`/api/v1/admin/elections/${w.electionId}`, admin]] as const) {
      const refusal = await w.signed('DELETE', target, { confirm: reg.title }, signer, w.idemKey());
      assert.equal(refusal.status, 409, refusal.text); assert.match(refusal.json.detail, /recorded public export/);
    }
    assert.equal(count(), before, 'admin preflight must not enqueue a destructive job');
    await assert.rejects(w.server.pool.remove(w.electionId), /recorded public export/);
    assert.ok(existsSync(join(w.dir, reg.db_path)));
    assert.ok(w.server.env.control.election(w.electionId)?.dek_wrapped);
    const record = await makeExport(w);
    await (await rawDownload(w, record.download_url)).arrayBuffer();
    await assert.rejects(w.server.pool.remove(w.electionId), /explicit acknowledgement/);
    const ack = await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, w.idemKey());
    assert.equal(ack.status, 200, ack.text);
    const rt = (await w.server.pool.get(w.electionId))!;
    const damaged = rt.edb.publicExportBytes(record.export_id)!;
    damaged[damaged.length - 1] = damaged[damaged.length - 1]! ^ 1;
    // Fault injection needs an explicit writer now that ordinary archived readers are physically read-only.
    rt.edb.withMaintenance('recovery', (db) => {
      db.db.exec('DROP TRIGGER export_record_noupdate');
      db.db.prepare('UPDATE export_record SET snapshot=? WHERE export_id=?').run(damaged, record.export_id);
    });
    await assert.rejects(w.server.pool.remove(w.electionId), /recorded public export/);
    const replacement = await makeExport(w);
    assert.equal((await w.signed('POST', replacement.acknowledgement_url, binding(replacement), w.owner, w.idemKey())).status, 200);
    // A damaged earlier acknowledgement must neither satisfy deletion nor prevent recovery with a valid replacement.
    const deletion = await w.signed('DELETE', root(w), { confirm: reg.title });
    assert.equal(deletion.status, 202, deletion.text);
    assert.equal(existsSync(join(w.dir, reg.db_path)), false);
    const tombstone = w.server.env.control.db.prepare('SELECT state,dek_wrapped FROM election_registry WHERE election_id=?').get(w.electionId);
    assert.equal(tombstone?.['state'], 'DELETED'); assert.equal(tombstone?.['dek_wrapped'], null);
  } finally { await w.stop(); }
});

test('grace begins only at an explicit signed final-tree notice, survives restart and permits deletion exactly at 30 days', { timeout: 120_000 }, async () => {
  const w = await fullElection('exports-grace', { server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  try {
    const record = await makeExport(w), reg = w.server.env.control.election(w.electionId)!;
    w.clock += EXPORT_DELETE_GRACE_MS;
    await assert.rejects(w.server.pool.assertDeletable(w.electionId), /signed deletion notice/);
    const expired = await rawDownload(w, record.download_url);
    assert.equal(expired.status, 410); await expired.arrayBuffer();
    const first = await w.signed('POST', record.deletion_notice_url, binding(record), w.owner, w.idemKey());
    assert.equal(first.status, 200, first.text);
    const notified = w.clock;
    w.tick();
    const twice = await w.signed('POST', record.deletion_notice_url, binding(record), w.owner, w.idemKey());
    assert.equal(twice.json.deletion_notice_at, first.json.deletion_notice_at);
    assert.equal(twice.json.acknowledged_at, null);
    await w.server.stop(); await w.start();
    w.clock = notified + EXPORT_DELETE_GRACE_MS - 1;
    await assert.rejects(w.server.pool.remove(w.electionId), /30 days/);
    w.clock++;
    const deletion = await w.signed('DELETE', `/api/v1/admin/elections/${w.electionId}`, { confirm: reg.title }, admin, w.idemKey());
    assert.equal(deletion.status, 202, deletion.text);
    assert.equal((await waitJob(w, deletion.json.job_id, admin)).state, 'done');
    assert.equal(existsSync(join(w.dir, reg.db_path)), false);
  } finally { await w.stop(); }
});

test('acknowledging an earlier tree cannot authorize final-tree deletion, and damaged artifacts cannot be acknowledged or downloaded', { timeout: 120_000 }, async () => {
  const w = await fullElection('exports-stale', { stopAt: 'OPEN' });
  try {
    const early = await makeExport(w);
    assert.equal((await w.signed('POST', early.deletion_notice_url, binding(early), w.owner, w.idemKey())).status, 409);
    assert.equal((await w.signed('POST', early.acknowledgement_url, binding(early), w.owner, w.idemKey())).status, 200);
    await archive(w);
    await assert.rejects(w.server.pool.remove(w.electionId), /recorded public export/);
    assert.equal((await w.signed('POST', early.deletion_notice_url, binding(early), w.owner, w.idemKey())).status, 409);
    const current = await makeExport(w), rt = (await w.server.pool.get(w.electionId))!;
    const bytes = rt.edb.publicExportBytes(current.export_id)!; bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    rt.edb.withMaintenance('recovery', (db) => {
      db.db.exec('DROP TRIGGER export_record_noupdate');
      db.db.prepare('UPDATE export_record SET snapshot=? WHERE export_id=?').run(bytes, current.export_id);
    });
    const damaged = await rawDownload(w, current.download_url);
    assert.equal(damaged.status, 409); await damaged.arrayBuffer();
    const ack = await w.signed('POST', current.acknowledgement_url, binding(current), w.owner, w.idemKey());
    assert.equal(ack.status, 409, ack.text);
    assert.equal(rt.edb.publicExport(current.export_id)?.acknowledged_at, null);
    await assert.rejects(w.server.pool.remove(w.electionId), /recorded public export/);
  } finally { await w.stop(); }
});

test('committed snapshot recovers a failed job completion on restart without generating another artifact', async () => {
  const w = await fixture('exports-job-recovery');
  try {
    const control = w.server.env.control, audit = control.audit.bind(control), key = w.idemKey();
    control.audit = (actor, action, target, detail) => {
      if (action === 'export.create') throw new Error('injected failure after election snapshot commit');
      audit(actor, action, target, detail);
    };
    const response = await w.signed('POST', `${root(w)}/exports`, { kind: 'public' }, w.owner, key);
    assert.equal(response.status, 202, response.text);
    for (let i = 0; i < 100 && control.job(response.json.job_id)?.state !== 'failed'; i++) await tick();
    assert.equal(control.job(response.json.job_id)?.state, 'failed');
    const rt = (await w.server.pool.get(w.electionId))!, row = rt.edb.publicExportForJob(response.json.job_id)!;
    assert.ok(row); const original = rt.edb.publicExportBytes(row.export_id)!;
    await w.server.stop(); await w.start();
    const job = await waitJob(w, response.json.job_id);
    assert.equal(job.state, 'done', JSON.stringify(job)); assert.equal(job.result.export_id, row.export_id);
    const replay = await w.signed('POST', `${root(w)}/exports`, { kind: 'public' }, w.owner, key);
    assert.equal(replay.headers.get('idempotent-replay'), 'true'); assert.equal(replay.json.job_id, job.job_id);
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.edb.publicExports().length, 1);
    assert.deepEqual(reopened.edb.publicExportBytes(row.export_id), original);
    const audits = w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='export.create' AND target=?").get(row.export_id);
    assert.equal(audits?.['n'], 1);
  } finally { await w.stop(); }
});

test('acknowledgement journals its exact response with the mutation and recovers a lost control-cache completion', async () => {
  const w = await fixture('exports-ack-recovery');
  try {
    const record = await makeExport(w), key = w.idemKey(), control = w.server.env.control, original = control.storeIdem.bind(control);
    let fail = true;
    control.storeIdem = (...args) => {
      if (fail && args[1] === key['idempotency-key'] && args[5] === 200) { fail = false; throw new Error('injected completion failure'); }
      original(...args);
    };
    const response = await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, key);
    assert.equal(response.status, 500, response.text);
    const firstAt = (await w.server.pool.get(w.electionId))!.edb.publicExport(record.export_id)?.acknowledged_at;
    assert.equal(firstAt, w.clock);
    await w.server.stop(); w.tick(10); await w.start();
    const replay = await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, key);
    assert.equal(replay.status, 200, replay.text); assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.equal(Date.parse(replay.json.acknowledged_at), firstAt);
    assert.equal((await w.server.pool.get(w.electionId))!.edb.publicExport(record.export_id)?.acknowledged_at, firstAt);
    const audits = w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='export.acknowledge' AND target=?").get(w.electionId);
    assert.equal(audits?.['n'], 1);
  } finally { await w.stop(); }
});

test('bounded export storage refuses excess without changing retained evidence and reclaims expired unprotected snapshots', async () => {
  const w = await fixture('exports-capacity');
  try {
    const record = await makeExport(w), rt = (await w.server.pool.get(w.electionId))!;
    const row = rt.edb.publicExport(record.export_id)!, bytes = rt.edb.publicExportBytes(row.export_id)!;
    assert.equal((await w.signed('POST', record.acknowledgement_url, binding(record), w.owner, w.idemKey())).status, 200);
    for (let i = 1; i < MAX_PUBLIC_EXPORTS; i++) rt.edb.addPublicExport({ ...row, export_id: randomId(), job_id: randomId() }, bytes);
    const request = await w.signed('POST', `${root(w)}/exports`, { kind: 'public' }, w.owner, w.idemKey());
    const failed = await waitJob(w, request.json.job_id);
    assert.equal(failed.state, 'failed'); assert.equal(failed.error.code, 'EXPORT_CAPACITY');
    assert.equal(rt.edb.publicExports().length, MAX_PUBLIC_EXPORTS);
    w.clock += EXPORT_DOWNLOAD_MS;
    const next = await makeExport(w);
    assert.notEqual(next.export_id, record.export_id);
    assert.equal(rt.edb.publicExports().length, 2);
    assert.equal(rt.edb.publicExport(record.export_id)?.acknowledged_at, w.clock - EXPORT_DOWNLOAD_MS,
      'keep current-tree acknowledged artifact and its original acknowledgement');
  } finally { await w.stop(); }
});

test('schema10 upgrade preserves historical checksums and durable operation receipts while adding empty export storage', async () => {
  const w = await fixture('exports-upgrade');
  try {
    const rt = (await w.server.pool.get(w.electionId))!, dbPath = rt.edb.path;
    const before = rt.edb.db.prepare('SELECT version,hex(sha256) AS hash FROM schema_migration WHERE version<=10 ORDER BY version').all();
    const receipts = rt.edb.db.prepare('SELECT * FROM operation_receipt').all();
    await w.server.stop();
    const db = new DatabaseSync(dbPath);
    try {
      db.exec(`DROP TABLE export_record;
        ALTER TABLE operation_receipt RENAME TO saved_receipts;
        CREATE TABLE operation_receipt (
          principal TEXT NOT NULL, idem_key TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL,
          req_sha256 BLOB NOT NULL CHECK (length(req_sha256)=32), expires_at INTEGER NOT NULL,
          status INTEGER NOT NULL CHECK (status BETWEEN 200 AND 299), response TEXT,
          audit_action TEXT CHECK (audit_action IN ('election.create','quarantine.clear')), audit_detail TEXT,
          PRIMARY KEY(principal,idem_key)) STRICT;
        INSERT INTO operation_receipt SELECT * FROM saved_receipts; DROP TABLE saved_receipts;
        DELETE FROM schema_migration WHERE version=11; PRAGMA user_version=10;`);
    } finally { db.close(); }
    await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.edb.db.prepare('PRAGMA user_version').get()?.['user_version'], 11);
    assert.deepEqual(reopened.edb.db.prepare('SELECT version,hex(sha256) AS hash FROM schema_migration WHERE version<=10 ORDER BY version').all(), before);
    assert.deepEqual(reopened.edb.db.prepare('SELECT * FROM operation_receipt').all(), receipts);
    assert.deepEqual(reopened.edb.publicExports(), []);
    assert.equal((await makeExport(w)).kind, 'public');
  } finally { await w.stop(); }
});
