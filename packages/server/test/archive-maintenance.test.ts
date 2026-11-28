// @verifies QV-28-REQ-015, QV-18-REQ-033, QV-09-REQ-014, QV-09-REQ-015
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cosignLine } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { makeSpoil, signRecord } from '@quietvote/protocol';
import { ElectionDb } from '../src/electiondb.ts';
import { exportQvb, importAndWait, waitJob } from './helpers/full.ts';
import { World } from './helpers/world.ts';

const root = (w: World): string => `/api/v1/elections/${w.electionId}`;

async function enrolled(seed: string, extra: { spoilTrustees?: boolean; pinnedRoll?: boolean } = {}): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 4, ...extra, freshConnections: true, server: { retentionSweepMs: 0 } });
  try { await w.start(); await w.setupOrgAndElection(); await w.registerVoters(); return w; }
  catch (error) { await w.stop(); throw error; }
}

async function vote(w: World): Promise<void> {
  assert.equal((await w.publishManifest()).status, 201);
  await w.ceremony();
  assert.equal((await w.open()).status, 201);
  for (let i = 0; i < 4; i++) assert.equal((await w.cast(i, { budget: [i % 2 ? 'no' : 'yes'], chair: ['ann'] })).status, 201);
}

async function archive(w: World): Promise<void> {
  assert.equal((await w.close()).status, 201);
  for (const j of [1, 3]) { assert.equal((await w.trusteeShares(j)).status, 201); w.tick(); }
  const draft = await w.get(`${root(w)}/tally/draft?decrypters=1,3`), c = w.coord[0]!;
  assert.equal(draft.status, 200);
  assert.equal((await w.post('tally_result', c, signRecord(c.secretKey, c.publicKey, w.params.ctx, draft.json.body))).status, 201);
  assert.equal((await w.post('audit_close', c, w.control('audit-close'))).status, 201);
}

test('archive maintenance preserves the stable reader through witness rollback, export recovery, retention and deletion', { timeout: 120_000 }, async (t) => {
  const w = await enrolled('archive-maintenance-native', { pinnedRoll: true });
  try {
    const issued = await w.signed('POST', `${root(w)}/invites`, { items: [{ label: 'unused invite', contact: 'unused@example.invalid' }] }, w.owner, w.idemKey());
    assert.equal(issued.status, 201);
    const inviteId: string = issued.json.invites[0].invite_id;
    await vote(w); await archive(w);
    const rt = (await w.server.pool.get(w.electionId))!, reader = rt.edb.db;
    const treeSize = rt.log.size, rootHash = bytesToHex(rt.log.root());
    assert.equal(rt.edb.readOnly, true);
    rt.finalizeArchive();
    assert.equal(rt.edb.db, reader, 'idempotent archive finalization keeps the normal reader');
    assert.equal((await w.signed('PUT', `${root(w)}/pinned-roll`, { pinned_roll: w.rollHex }, w.owner, w.idemKey())).status, 200);
    assert.equal((await w.signed('PUT', `${root(w)}/pinned-roll`, { pinned_roll: w.rollHex.slice(1) }, w.owner, w.idemKey())).status, 409);
    assert.equal((await w.signed('DELETE', `${root(w)}/invites/${inviteId}`)).status, 204);
    const invite = rt.edb.inviteById(inviteId)!;
    assert.equal(invite.state, 'revoked');
    assert.equal(invite.label_enc, null); assert.equal(invite.contact_enc, null);
    assert.equal(rt.edb.db, reader);

    const note = (await w.get(`${root(w)}/log/checkpoint`)).text, witness = w.witnesses[0]!;
    const cosignature = { checkpoint_size: treeSize,
      lines: [cosignLine('w1', witness.secretKey, witness.publicKey, note.slice(0, note.indexOf('\n\n') + 1), w.nowSec)] };
    const insertEvent = ElectionDb.prototype.insertEvent;
    const fault = t.mock.method(ElectionDb.prototype, 'insertEvent', function (this: ElectionDb, ...args: Parameters<typeof insertEvent>) {
      if (args[1] === 'witness') throw new Error('injected terminal witness event failure');
      return insertEvent.apply(this, args);
    });
    assert.equal((await w.req('POST', `${root(w)}/log/cosignatures`, cosignature)).status, 500);
    fault.mock.restore();
    assert.equal((await w.get(`${root(w)}/log/checkpoint`)).text, note, 'event failure rolls back the checkpoint update');
    const cosigned = await w.req('POST', `${root(w)}/log/cosignatures`, cosignature);
    assert.equal(cosigned.status, 200);
    assert.deepEqual(cosigned.json.accepted, ['w1']);
    assert.equal(rt.witnessInfo().have, 1);
    assert.equal(Number(reader.prepare("SELECT COUNT(*) AS n FROM event WHERE type='witness'").get()!['n']), 1);
    assert.equal(rt.edb.db, reader);
    assert.equal((await w.req('POST', '/api/v1/gossip/checkpoints', { note: (await w.get(`${root(w)}/log/checkpoint`)).text })).status, 200);
    assert.equal(rt.edb.gossipCount(), 1);
    assert.equal(rt.edb.db, reader);

    const started = await w.signed('POST', `${root(w)}/exports`, { kind: 'public' }, w.owner, w.idemKey());
    assert.equal(started.status, 202);
    const job = await waitJob(w, started.json.job_id);
    assert.equal(job.state, 'done');
    const got = await w.signed('GET', job.result_ref);
    assert.equal(got.status, 200);
    const record = got.json, binding = { tree_size: record.tree_size, root_hash: record.root_hash, sha256: record.sha256 };
    assert.equal(record.tree_size, treeSize); assert.equal(record.root_hash, rootHash);
    await assert.rejects(w.server.pool.assertDeletable(w.electionId), /explicit acknowledgement/);
    assert.equal((await w.signed('POST', record.deletion_notice_url, binding, w.owner, w.idemKey())).status, 200);
    await assert.rejects(w.server.pool.assertDeletable(w.electionId), /30 days/);

    const control = w.server.env.control, original = control.storeIdem, key = w.idemKey();
    const acknowledgement = t.mock.method(control, 'storeIdem', function (this: typeof control, ...args: Parameters<typeof original>) {
      if (args[1] === key['idempotency-key'] && args[5] === 200) throw new Error('injected acknowledgement response persistence failure');
      return original.apply(this, args);
    });
    assert.equal((await w.signed('POST', record.acknowledgement_url, binding, w.owner, key)).status, 500);
    acknowledgement.mock.restore();
    const acknowledgedAt = rt.edb.publicExport(record.export_id)!.acknowledged_at;
    assert.equal(acknowledgedAt, w.clock, 'election maintenance committed before the control-response failure');
    assert.equal(rt.edb.db, reader);
    assert.throws(() => reader.prepare('UPDATE election SET title=title').run(), /readonly database/);
    await w.server.stop(); await w.start(); w.tick(10);
    const replay = await w.signed('POST', record.acknowledgement_url, binding, w.owner, key);
    assert.equal(replay.status, 200); assert.equal(replay.headers.get('idempotent-replay'), 'true');
    const reopened = (await w.server.pool.get(w.electionId))!, stable = reopened.edb.db;
    assert.equal(reopened.edb.readOnly, true);
    assert.equal(reopened.edb.publicExport(record.export_id)!.acknowledged_at, acknowledgedAt);
    assert.equal(reopened.log.size, treeSize); assert.equal(bytesToHex(reopened.log.root()), rootHash);
    assert.equal(reopened.edb.row().log_sk_enc, null); assert.equal(reopened.edb.row().srv_sk_enc, null);

    w.clock += 31 * 86_400_000;
    assert.equal((await w.get(`${root(w)}/events?last_event_id=0`)).status, 410);
    assert.equal(reopened.edb.eventBounds(), undefined, 'lazy archive retention used explicit maintenance');
    assert.equal(reopened.edb.db, stable);
    const reg = w.server.env.control.election(w.electionId)!, path = join(w.dir, reg.db_path);
    assert.equal((await w.signed('DELETE', root(w), { confirm: reg.title })).status, 202);
    assert.equal(stable.isOpen, false); assert.equal(existsSync(path), false);
  } finally { t.mock.restoreAll(); await w.stop(); }
});

test('an imported partial election refuses genuine spoil shares without attempting to write its mirror', { timeout: 120_000 }, async () => {
  const source = await enrolled('archive-maintenance-partial-source', { spoilTrustees: true });
  const mirror = new World({ seed: 'archive-maintenance-partial-mirror', n: 3, t: 2, voters: 0, freshConnections: true, server: { retentionSweepMs: 0 } });
  try {
    await vote(source);
    const ballot = source.build(0, { budget: ['no'], chair: ['bob'] }), voter = source.voters[0]!;
    const code = bytesToHex(ballot.code);
    assert.equal((await source.post('ballot_audit', voter, makeSpoil(source.params, voter.secretKey, ballot, 'trustees'))).status, 201);
    assert.equal((await source.close()).status, 201);
    const share = await source.spoilShareRecord(1, code);
    await mirror.start(); await mirror.setupOrgAndElection();
    const job = await importAndWait(mirror, await exportQvb(source));
    assert.equal(job.state, 'done');
    const rt = (await mirror.server.pool.get(source.electionId))!, reader = rt.edb.db;
    const size = rt.log.size, rootHash = bytesToHex(rt.log.root());
    assert.equal(rt.imported, true); assert.equal(rt.edb.readOnly, true);
    const refused = await mirror.req('POST', `/api/v1/elections/${source.electionId}/spoil-shares`, share);
    assert.equal(refused.status, 409); assert.equal(refused.json.code, 'STATE_CONFLICT');
    assert.equal(rt.edb.spoilShare(code, 1), undefined);
    assert.equal(rt.edb.db, reader);
    assert.throws(() => reader.prepare('UPDATE election SET title=title').run(), /readonly database/);
    assert.equal(rt.log.size, size); assert.equal(bytesToHex(rt.log.root()), rootHash);
  } finally { if (mirror.server) await mirror.stop(); await source.stop(); }
});
