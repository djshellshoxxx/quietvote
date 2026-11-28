// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-29-REQ-006/008 — cheap refusals and overlapping admission, under ADR-028 registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { authorKeyId, b64u, hashLeaf, parseCheckpoint, toHex, unb64, unb64u, verifyLog, verifyReceipt, type Receipt } from '@quietvote/board';
import { bytesToHex, hexToBytes } from '@quietvote/crypto';
import { makeCast, makeSpoil, verifyEnvelope } from '@quietvote/protocol';
import type { ElectionRuntime } from '../src/election.ts';
import { logBundle } from '../src/export.ts';
import { World, kp, type Resp } from './helpers/world.ts';

const selections = { budget: ['yes'], chair: ['ann'] };
const kidOf = (key: Uint8Array) => b64u(authorKeyId('ed25519', key));

async function voting(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 4, witnessQuorum: 0, freshConnections: true });
  try {
    await w.start(); await w.setupOrgAndElection(); await w.registerVoters();
    assert.equal((await w.publishManifest()).status, 201); await w.ceremony();
    assert.equal((await w.open()).status, 201); return w;
  } catch (error) { await w.stop(); throw error; }
}

async function snapshot(w: World) {
  const rt = (await w.server.pool.get(w.electionId))!;
  const checkpoint = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`);
  assert.equal(checkpoint.status, 200);
  const parsed = parseCheckpoint(checkpoint.text); assert.ok(parsed.ok);
  return {
    checkpoint: checkpoint.text, size: parsed.value.size, root: parsed.value.root,
    bodyBytes: rt.edb.totalBodyBytes(), proofVerifications: w.server.env.stats.proofVerifications,
    appended: w.server.env.stats.appended,
    indexes: rt.edb.db.prepare('SELECT * FROM ballot_index ORDER BY voter_kid').all(),
    references: rt.edb.db.prepare('SELECT * FROM ballot_ref ORDER BY seq').all(),
    heads: [...rt.st.last], casts: [...rt.st.casts], spoils: [...rt.st.spoils],
  };
}

function checkBoard(w: World, rt: ElectionRuntime): void {
  const publicKeys = [w.owner, ...w.coord, ...w.trustees, ...w.voters].map(key => key.publicKey).concat([rt.srvPk]);
  const keys = new Map(publicKeys.map(key => [toHex(authorKeyId('ed25519', key)), key]));
  const result = verifyLog(logBundle(rt), {
    logPublicKey: hexToBytes(w.logPkHex, 32), resolveAuthorKey: header => keys.get(toHex(header.author)),
    witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] },
  });
  assert.deepEqual(result.failures, []); assert.equal(result.integrity, 'VERIFIED');
  // This checks board signatures and roots under fixture-owned keys, not witnessed full-election PASS.
}

interface WireReceipt {
  origin: string; seq: number; leaf_hash: string; promise_sig: string;
  promise: { sequenced_at: number; checkpoint_deadline: number };
  inclusion: { seq: number; leaf_hash: string; tree_size: number; path: string[]; checkpoint_note: string };
}
function checkReceipt(w: World, wire: WireReceipt, header: Uint8Array): void {
  const leaf = unb64u(wire.leaf_hash), sig = unb64u(wire.promise_sig);
  assert.ok(leaf && sig); assert.deepEqual(leaf, hashLeaf(header));
  assert.equal(wire.origin, w.origin); assert.equal(wire.inclusion.seq, wire.seq);
  assert.equal(wire.inclusion.leaf_hash, wire.leaf_hash);
  const receipt: Receipt = {
    origin: wire.origin, seq: wire.seq, leafHash: leaf, promiseSig: sig,
    sequencedAt: wire.promise.sequenced_at, checkpointDeadline: wire.promise.checkpoint_deadline,
    inclusion: { treeSize: wire.inclusion.tree_size, checkpointNote: wire.inclusion.checkpoint_note,
      path: wire.inclusion.path.map(value => { const bytes = unb64(value); assert.ok(bytes); return bytes; }),
    },
  };
  assert.deepEqual(verifyReceipt(receipt, hexToBytes(w.logPkHex, 32)), { ok: true, value: { treeSize: wire.inclusion.tree_size } });
}

async function hold(rt: ElectionRuntime) {
  let release: (() => void) | undefined;
  const waiting = rt.mutex.run(() => new Promise<void>(resolve => { release = resolve; }));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.ok(release); assert.equal(rt.mutex.pending, 1);
  return { release, waiting };
}

async function queued(rt: ElectionRuntime, expected: number): Promise<void> {
  const deadline = performance.now() + 5000;
  while (rt.mutex.pending < expected && performance.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(rt.mutex.pending, expected, 'every candidate must reach the held election lock before release');
}

test('over-cap casts return REVOTE_LIMIT without entering proof verification', { timeout: 120_000 }, async () => {
  const w = await voting('ballot-limit-before-proofs');
  try {
    const proofs = w.server.env.stats.proofVerifications;
    for (let i = 0; i < w.manifest.ballots.max_per_voter; i++) assert.equal((await w.cast(0, selections)).status, 201);
    assert.equal(w.server.env.stats.proofVerifications, proofs + w.manifest.ballots.max_per_voter, 'accepted controls exercise the proof verifier');
    const key = w.voters[0]!, ballot = w.build(0, selections), envelope = makeCast(w.params, key.secretKey, ballot);
    assert.equal(verifyEnvelope(w.params, new Set(w.rollHex), envelope).ok, true, 'the over-cap candidate has genuine valid proofs');
    const before = await snapshot(w);
    const response = await w.post('ballot', key, envelope);
    assert.equal(response.status, 429, response.text); assert.equal(response.json.code, 'REVOTE_LIMIT');
    assert.equal(response.json.reason, 'E_REVOTE_LIMIT');
    assert.equal(w.server.env.stats.proofVerifications, before.proofVerifications, 'quota refusal must precede proof verification');
    assert.deepEqual(await snapshot(w), before, 'quota refusal preserves the board and every ballot index');
    checkBoard(w, (await w.server.pool.get(w.electionId))!);
  } finally { await w.stop(); }
});

for (const first of ['cast', 'spoil'] as const) {
  test(`same-code ${first === 'cast' ? 'cast then spoil' : 'spoil then cast'} refuses before proofs without changing board or indexes`, { timeout: 120_000 }, async () => {
    const w = await voting(`same-code-${first}`);
    try {
      const key = w.voters[0]!, ballot = w.build(0, selections);
      const cast = makeCast(w.params, key.secretKey, ballot), spoil = makeSpoil(w.params, key.secretKey, ballot, 'publish');
      assert.deepEqual(cast.body, spoil.body, 'both requests use the identical code-bearing body');
      for (const envelope of [cast, spoil]) assert.equal(verifyEnvelope(w.params, new Set(w.rollHex), envelope).ok, true);
      const proofCount = w.server.env.stats.proofVerifications;
      const accepted = await w.post(first === 'cast' ? 'ballot' : 'ballot_audit', key, first === 'cast' ? cast : spoil);
      assert.equal(accepted.status, 201, accepted.text);
      assert.equal(w.server.env.stats.proofVerifications, proofCount + 1, 'the initial valid request reaches proof verification');
      w.tick(w.server.env.cfg.minBallotIntervalSec + 1);
      const before = await snapshot(w);
      assert.equal(before.references.length, 1); assert.equal(before.indexes.length, first === 'cast' ? 1 : 0);
      const refused = await w.post(first === 'cast' ? 'ballot_audit' : 'ballot', key, first === 'cast' ? spoil : cast);
      assert.equal(refused.status, 422, refused.text); assert.equal(refused.json.reason, 'E_SPOILED_CODE_CAST');
      assert.equal(w.server.env.stats.proofVerifications, before.proofVerifications, 'same-code exclusion precedes proof verification');
      assert.deepEqual(await snapshot(w), before, 'refusal cannot add a reference, change a head, or consume a cast/spoil');
      checkBoard(w, (await w.server.pool.get(w.electionId))!);
    } finally { await w.stop(); }
  });
}

test('two overlapping valid same-predecessor casts append once and refuse the stale contender', { timeout: 120_000 }, async () => {
  const w = await voting('ballot-overlapping-predecessor');
  let barrier: Awaited<ReturnType<typeof hold>> | undefined;
  const requests: Promise<Resp>[] = [];
  try {
    const rt = (await w.server.pool.get(w.electionId))!, key = w.voters[0]!;
    const ballots = [w.build(0, selections), w.build(0, { budget: ['no'], chair: ['bob'] })];
    assert.equal(ballots[0]!.body.supersedes, ballots[1]!.body.supersedes);
    assert.notDeepEqual(ballots[0]!.code, ballots[1]!.code);
    const packets = ballots.map(ballot => {
      const envelope = makeCast(w.params, key.secretKey, ballot);
      assert.equal(verifyEnvelope(w.params, new Set(w.rollHex), envelope).ok, true);
      return w.entry('ballot', key, envelope);
    });
    const before = await snapshot(w);
    barrier = await hold(rt);
    requests.push(w.submit(packets[0]!.headerBytes, packets[0]!.body));
    void requests[0]!.catch(() => undefined);
    await queued(rt, 2);
    // Both remain pending, but the second passes the real per-key interval gate.
    w.tick(w.server.env.cfg.minBallotIntervalSec + 1);
    requests.push(w.submit(packets[1]!.headerBytes, packets[1]!.body));
    void requests[1]!.catch(() => undefined);
    await queued(rt, 3);
    assert.equal(rt.log.size, before.size); assert.equal(w.server.env.stats.proofVerifications, before.proofVerifications);
    barrier.release(); await barrier.waiting;
    const [accepted, refused] = await Promise.all(requests);
    assert.equal(accepted!.status, 201, accepted!.text);
    assert.equal(refused!.status, 422, refused!.text); assert.equal(refused!.json.reason, 'E_SUPERSEDES');
    checkReceipt(w, accepted!.json.receipt, packets[0]!.headerBytes);
    const after = await snapshot(w);
    assert.equal(after.size, before.size + 1); assert.equal(after.appended, before.appended + 1);
    assert.equal(after.proofVerifications, before.proofVerifications + 1, 'only the winning candidate reaches proofs');
    assert.equal(after.references.length, before.references.length + 1);
    assert.deepEqual({ ...rt.edb.ballotIndex(kidOf(key.publicKey)) }, { first_seq: before.size, latest_seq: before.size, ballot_count: 1 });
    assert.equal(rt.st.last.get(bytesToHex(key.publicKey)), bytesToHex(ballots[0]!.code));
    assert.equal(rt.st.casts.get(bytesToHex(key.publicKey)), 1);
    assert.equal(rt.mutex.pending, 0); assert.equal(w.server.env.inflight.n, 0);
    checkBoard(w, rt);
  } finally {
    barrier?.release(); await Promise.allSettled(requests); await barrier?.waiting; await w.stop();
  }
});

test('100 overlapping hashed-pop-v1 redemptions of one invitation register exactly one distinct key', { timeout: 120_000 }, async () => {
  const w = new World({ seed: 'registration-hundred-contenders', n: 3, t: 2, voters: 0, freshConnections: true });
  let barrier: Awaited<ReturnType<typeof hold>> | undefined;
  const requests: Promise<Resp>[] = [];
  try {
    await w.start(); await w.setupOrgAndElection();
    const issued = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
    assert.equal(issued.status, 201, issued.text);
    const invite = issued.json.invites[0] as { code: string; invite_id: string };
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.row().registration_scheme, 'hashed-pop-v1'); assert.equal(rt.edb.voterCount(), 0);
    const keys = Array.from({ length: 100 }, (_, index) => kp('registration-hundred', `contender-${index}`));
    assert.equal(new Set(keys.map(key => bytesToHex(key.publicKey))).size, 100);
    const bodies = keys.map(key => w.registrationBody(invite.code, key));
    assert.equal(unb64u(bodies[0]!.invite_code)!.length, 32, 'the wire bearer is the adopted hash, not the raw token');
    assert.ok(bodies.every(body => body.invite_code === bodies[0]!.invite_code));
    barrier = await hold(rt);
    for (const body of bodies) {
      const pending = w.req('POST', `/api/v1/elections/${w.electionId}/registrations`, body);
      void pending.catch(() => undefined); requests.push(pending);
    }
    await queued(rt, 101);
    assert.equal(rt.edb.voterCount(), 0); assert.equal(rt.edb.inviteById(invite.invite_id)!.state, 'issued');
    barrier.release(); await barrier.waiting;
    const responses = await Promise.all(requests), winners = responses.flatMap((response, index) => response.status === 201 ? [index] : []);
    assert.equal(winners.length, 1);
    const refused = responses.filter(response => response.status !== 201);
    assert.equal(refused.length, 99);
    for (const response of refused) { assert.equal(response.status, 409, response.text); assert.equal(response.json.code, 'INVITE_USED'); }
    const winner = keys[winners[0]!]!, kid = kidOf(winner.publicKey);
    assert.equal(responses[winners[0]!]!.json.voter_kid, kid);
    assert.equal(rt.edb.voterCount(), 1);
    assert.deepEqual(rt.edb.voters(undefined, 101).map(voter => voter.voter_kid), [kid]);
    assert.equal(rt.edb.inviteById(invite.invite_id)!.state, 'registered');
    assert.equal(rt.log.size, 0); assert.equal(rt.edb.store.size(), 0, 'registration does not append ballot records');
    assert.equal(rt.mutex.pending, 0);
  } finally {
    barrier?.release(); await Promise.allSettled(requests); await barrier?.waiting; await w.stop();
  }
});
