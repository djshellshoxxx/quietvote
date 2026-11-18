// Real HTTP acceptance of the browser's DOM-free organizer adapter. Trustee and
// voter crypto comes from World; this is distinct from all-executable acceptance.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex } from '@quietvote/crypto';
import { expectedLogId, logOrigin, verifyElection, type ElectionBundle } from '@quietvote/protocol';
import { World, T_VOTING } from '../../server/test/helpers/world.ts';
import { ApiClient } from '../src/api/client.ts';
import { adminSnapshot, prepareAdminAction, reviewSavedAdminPacket, submitAdminPacket, type AdminAction } from '../src/flow/admin.ts';
import { createSigner } from '../src/key/signer.ts';

test('organizer adapter drives ceremony, roll, opening, closing and verified tally over actual HTTP', { timeout: 180000 }, async () => {
  const w = new World({ seed: 'web-organizer-http', n: 3, t: 2, voters: 3 });
  const build = w.buildManifest.bind(w);
  w.buildManifest = () => { const m = build(); m.coordinator.m = 1; m.bb.log_id = expectedLogId(logOrigin(m)); return m; };
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters(); assert.equal((await w.publishManifest()).status, 201);
    const api = new ApiClient({ baseUrl: w.base });
    const snapshot = async () => adminSnapshot(await api.exportJson(w.electionId), bytesToHex(w.mh), w.electionId);
    const actions: string[] = [];
    const send = async (action: AdminAction) => {
      const s = await snapshot(), signer = await createSigner(w.coord[0]!.secretKey.slice());
      try {
        const made = await prepareAdminAction({ snapshot: s, action, signer, now: w.nowSec, tally: action === 'tally' ? await api.tallyDraft(w.electionId) : undefined });
        assert.equal(made.quorum, true);
        const result = await submitAdminPacket(api, w.electionId, made.packet, s);
        actions.push(action); w.tick();
        return { result, made };
      } finally { signer.lock(); }
    };
    // Only trustee cryptography uses the harness. Every coordinator lifecycle
    // body and framing must come from the shipped browser adapter.
    const ok = w.ok.bind(w);
    w.ok = async (type, who, rec) => {
      const action = (rec as { body?: { type?: string; name?: string } }).body;
      if (['ceremony_start', 'notice', 'joint_key', 'roll_commit'].includes(type)) {
        const { result } = await send((action?.type === 'roll-commit' ? 'roll-commit' : action?.name) as AdminAction);
        return { status: 201, headers: new Headers(), json: result, text: JSON.stringify(result) };
      }
      return ok(type, who, rec);
    };
    await w.ceremony();
    w.clock = T_VOTING; const opened = await send('election-open');
    for (let i = 0; i < 3; i++) assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    w.clock = Date.parse(w.manifest.voting_close); await send('election-close');
    for (const j of [1, 2]) { assert.equal((await w.trusteeShares(j)).status, 201); w.tick(); }
    await send('tally');
    const complete = await api.exportJson(w.electionId) as ElectionBundle;
    const report = await verifyElection(complete); assert.equal(report.verdict, 'PASS');
    assert.equal(report.counts.counted, 3);
    assert.deepEqual(actions, ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close', 'dkg-final', 'roll-commit', 'election-open', 'election-close', 'tally']);
    // A saved packet is reloadable after the server moved forward. Replaying its
    // exact header/body returns the original authenticated receipt, without a key.
    const final = await snapshot();
    const restored = await reviewSavedAdminPacket(JSON.stringify(opened.made.packet), final);
    assert.deepEqual(restored.packet, opened.made.packet);
    const duplicate = await submitAdminPacket(api, w.electionId, restored.packet, final);
    assert.equal(duplicate.receipt.seq, opened.result.receipt.seq);
  } finally { await w.stop(); }
});
