// @verifies QV-02-REQ-045 — accepted ballot retry and cast-quota recovery after a real server reopen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorKeyId, b64u, hashLeaf, parseCheckpoint, toHex, unb64, unb64u, verifyLog, verifyReceipt, type Receipt } from '@quietvote/board';
import { bytesToHex, hexToBytes } from '@quietvote/crypto';
import { makeCast } from '@quietvote/protocol';
import { logBundle } from '../src/export.ts';
import { fullElection } from './helpers/full.ts';
import type { World } from './helpers/world.ts';

interface WireReceipt {
  origin: string; seq: number; leaf_hash: string; promise_sig: string;
  promise: { sequenced_at: number; checkpoint_deadline: number };
  inclusion: { seq: number; leaf_hash: string; tree_size: number; path: string[]; checkpoint_note: string };
}
function checkReceipt(w: World, wire: WireReceipt, header: Uint8Array): Receipt {
  const leaf = unb64u(wire.leaf_hash), signature = unb64u(wire.promise_sig);
  assert.ok(leaf && signature); assert.deepEqual(leaf, hashLeaf(header));
  assert.equal(wire.origin, w.origin); assert.equal(wire.inclusion.seq, wire.seq);
  assert.equal(wire.inclusion.leaf_hash, wire.leaf_hash);
  const path = wire.inclusion.path.map((p) => { const bytes = unb64(p); assert.ok(bytes); return bytes; });
  const receipt: Receipt = {
    origin: wire.origin, seq: wire.seq, leafHash: leaf, promiseSig: signature,
    sequencedAt: wire.promise.sequenced_at, checkpointDeadline: wire.promise.checkpoint_deadline,
    inclusion: { treeSize: wire.inclusion.tree_size, path, checkpointNote: wire.inclusion.checkpoint_note },
  };
  assert.deepEqual(verifyReceipt(receipt, hexToBytes(w.logPkHex, 32)), { ok: true, value: { treeSize: wire.inclusion.tree_size } });
  return receipt;
}
async function snapshot(w: World) {
  const rt = (await w.server.pool.get(w.electionId))!;
  const voter = w.voters[0]!, kid = b64u(authorKeyId('ed25519', voter.publicKey));
  const publicVoter = await w.get(`/api/v1/elections/${w.electionId}/voters/${kid}`);
  assert.equal(publicVoter.status, 200);
  const checkpoint = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`);
  assert.equal(checkpoint.status, 200);
  const parsed = parseCheckpoint(checkpoint.text); assert.ok(parsed.ok);
  return {
    checkpoint: checkpoint.text, size: parsed.value.size, root: parsed.value.root,
    voter: publicVoter.json, casts: rt.st.casts.get(bytesToHex(voter.publicKey)), bytes: rt.edb.totalBodyBytes(),
  };
}
async function checkBoard(w: World): Promise<void> {
  const rt = (await w.server.pool.get(w.electionId))!;
  const keys = new Map([w.owner, ...w.coord, ...w.trustees, ...w.voters].map((k) => [toHex(authorKeyId('ed25519', k.publicKey)), k.publicKey]));
  const result = verifyLog(logBundle(rt), {
    logPublicKey: hexToBytes(w.logPkHex, 32), resolveAuthorKey: (h) => keys.get(toHex(h.author)),
    witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] },
  });
  assert.deepEqual(result.failures, []); assert.equal(result.integrity, 'VERIFIED');
  // Board signatures/inclusion under fixture-owned keys, not witnessed full-election verification.
}

test('exact ballot replay after reopening preserves receipt and quota through the configured cast limit', { timeout: 180_000 }, async () => {
  const w = await fullElection('ballot-restart-quota', { stopAt: 'READY' });
  try {
    assert.equal((await w.open()).status, 201);
    const voter = w.voters[0]!, limit = w.manifest.ballots.max_per_voter;
    const ballot = w.build(0, { budget: ['yes'], chair: ['ann'] });
    const packet = w.entry('ballot', voter, makeCast(w.params, voter.secretKey, ballot));
    const first = await w.submit(packet.headerBytes, packet.body);
    assert.equal(first.status, 201, first.text);
    w.last.set(bytesToHex(voter.publicKey), bytesToHex(ballot.code));
    const originalReceipt = first.json.receipt as WireReceipt;
    checkReceipt(w, originalReceipt, packet.headerBytes);
    const before = await snapshot(w);
    assert.equal(before.casts, 1); assert.equal(before.voter.ballot_count, 1);

    await w.server.stop(); await w.start();
    assert.deepEqual(await snapshot(w), before, 'reopening reconstructs exactly the accepted cast and checkpoint');
    const replay = await w.submit(packet.headerBytes, packet.body);
    assert.equal(replay.status, 200, replay.text);
    assert.deepEqual(replay.json.receipt, originalReceipt, 'unchanged tree returns the original signed promise and inclusion');
    checkReceipt(w, replay.json.receipt, packet.headerBytes);
    assert.deepEqual(await snapshot(w), before, 'retry does not consume a cast or append any bytes');
    await checkBoard(w);

    for (let casts = 2; casts <= limit; casts++) {
      w.tick();
      const accepted = await w.cast(0, { budget: [casts % 2 ? 'yes' : 'no'], chair: ['bob'] });
      assert.equal(accepted.status, 201, accepted.text);
      const state = await snapshot(w);
      assert.equal(state.casts, casts); assert.equal(state.voter.ballot_count, casts);
      assert.equal(state.size, before.size + casts - 1);
    }
    const atLimit = await snapshot(w);
    await w.server.stop(); await w.start();
    assert.deepEqual(await snapshot(w), atLimit, 'the exhausted quota also survives restart');
    const oldRetry = await w.submit(packet.headerBytes, packet.body);
    assert.equal(oldRetry.status, 200, oldRetry.text);
    const checked = checkReceipt(w, oldRetry.json.receipt, packet.headerBytes);
    assert.equal(checked.seq, originalReceipt.seq);
    assert.deepEqual(oldRetry.json.receipt.promise, originalReceipt.promise);
    assert.equal(oldRetry.json.receipt.promise_sig, originalReceipt.promise_sig);
    assert.deepEqual(await snapshot(w), atLimit, 'an old included ballot can still be retried at the cast limit');
    const refused = await w.cast(0, { budget: ['yes'], chair: ['cy'] });
    assert.equal(refused.status, 429, refused.text);
    assert.equal(refused.json.code, 'REVOTE_LIMIT'); assert.equal(refused.json.reason, 'E_REVOTE_LIMIT');
    assert.deepEqual(await snapshot(w), atLimit, 'over-limit refusal neither appends nor consumes quota');
    await checkBoard(w);
  } finally { await w.stop(); }
});
