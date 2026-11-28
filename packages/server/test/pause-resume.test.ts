// @verifies QV-02-REQ-062, QV-07-REQ-081 — signed pause/resume, persistent halt cap and terminal invalidation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorKeyId, b64u, checkEntry, toHex, unb64u, verifyLog } from '@quietvote/board';
import { bytesToHex, hexToBytes, parseQvJson, type Ed25519Keypair } from '@quietvote/crypto';
import { PROTO_ID, signRecordRaw, verifySig } from '@quietvote/protocol';
import { logBundle } from '../src/export.ts';
import { World, kp, type Resp } from './helpers/world.ts';

type Action = 'pause' | 'resume' | 'invalidate';
const LIMIT = 2;
async function snapshot(w: World) {
  const rt = (await w.server.pool.get(w.electionId))!;
  const checkpoint = await w.get(`/api/v1/elections/${w.electionId}/log/checkpoint`); assert.equal(checkpoint.status, 200);
  const state = await w.get(`/api/v1/elections/${w.electionId}/state`); assert.equal(state.status, 200);
  const kid = b64u(authorKeyId('ed25519', w.voters[0]!.publicKey));
  const voter = await w.get(`/api/v1/elections/${w.electionId}/voters/${kid}`); assert.equal(voter.status, 200);
  const manifest = await w.get(`/api/v1/elections/${w.electionId}/manifest`); assert.equal(manifest.status, 200);
  return { checkpoint: checkpoint.text, size: state.json.tree_size as number, phase: state.json.phase as string,
    counter: state.json.control_seq as number, next: state.json.next_control_seq as number, halts: rt.st.halts,
    bodyBytes: rt.edb.totalBodyBytes(), voter: voter.json, manifest: manifest.json.body_b64u as string };
}

test('coordinator quorum controls pause/resume; halt limit survives reopen, close time stays fixed, invalidate is terminal', { timeout: 180_000 }, async () => {
  const operator = kp('pause-limit', 'instance-operator');
  const w = new World({ seed: 'pause-limit', n: 3, t: 2, voters: 4, witnessQuorum: 0, freshConnections: true,
    server: { maxHalts: LIMIT, adminKeys: [bytesToHex(operator.publicKey)] } });
  const model = { phase: 'OPEN', counter: 0, halts: 0 };
  try {
    await w.start(); await w.setupOrgAndElection(); await w.registerVoters();
    assert.equal((await w.publishManifest()).status, 201); await w.ceremony(); assert.equal((await w.open()).status, 201);
    assert.equal((await w.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 201);
    const initial = await snapshot(w), originalManifest = initial.manifest;
    const decoded = parseQvJson(unb64u(originalManifest)!) as { body: { voting_close: string } };
    const closesAt = Date.parse(decoded.body.voting_close);
    // This is a real seeded instance-admin identity, not merely an unregistered key.
    const admin = await w.signed('GET', '/api/v1/admin/status', undefined, operator);
    assert.equal(admin.status, 200, admin.text);

    function record(action: Action, signers = [0, 1]) {
      return w.multi(w.mh, { proto: PROTO_ID, type: 'control', action, control_seq: model.counter + 1,
        ...(action === 'pause' ? { reason: 'AVAILABILITY' } : {}) }, signers);
    }
    async function submit(who: Ed25519Keypair, rec: unknown): Promise<Resp> {
      const packet = w.entry('notice', who, rec), rt = (await w.server.pool.get(w.electionId))!;
      assert.ok(checkEntry(packet.headerBytes, packet.body, w.origin, () => who.publicKey, rt.log.size).ok,
        'every authority case has a real valid outer signature');
      return w.submit(packet.headerBytes, packet.body);
    }
    async function refused(send: () => Promise<Resp>, status: number, code: string, reason?: string): Promise<void> {
      const before = await snapshot(w), response = await send();
      assert.equal(response.status, status, response.text); assert.equal(response.json.code, code);
      if (reason !== undefined) assert.equal(response.json.reason, reason);
      assert.deepEqual(await snapshot(w), before, 'refusal preserves board, voter index, control counter, halt count and phase');
    }
    async function authorityRefusals(action: Action): Promise<void> {
      const single = record(action, [0]), sig = single.sigs[0]!;
      assert.ok(verifySig(w.mh, 'control', single.body, sig, sig.key), 'the lone coordinator signature is valid but below quorum');
      await refused(() => submit(w.coord[0]!, single), 422, 'ENTRY_INVALID', 'E_SIG');
      const body = record(action).body, operatorSig = signRecordRaw(operator.secretKey, operator.publicKey, w.mh, 'control', body);
      assert.ok(verifySig(w.mh, 'control', body, operatorSig, operatorSig.key), 'operator record signature is cryptographically valid');
      await refused(() => submit(operator, { body, sigs: [operatorSig] }), 403, 'AUTHOR_NOT_AUTHORIZED');
    }
    async function accept(action: Action): Promise<void> {
      const before = await snapshot(w), rec = record(action);
      const response = await submit(w.coord[0]!, rec); assert.equal(response.status, 201, response.text);
      model.counter++;
      if (action === 'pause') { model.halts++; model.phase = 'PAUSED'; }
      else model.phase = action === 'resume' ? 'OPEN' : 'INVALIDATED';
      const after = await snapshot(w);
      assert.equal(after.phase, model.phase); assert.equal(after.counter, model.counter); assert.equal(after.next, model.counter + 1);
      assert.equal(after.halts, model.halts); assert.equal(after.size, before.size + 1);
      assert.equal(after.manifest, originalManifest, 'controls preserve the signed close time and election context');
    }

    await authorityRefusals('pause');
    await refused(() => submit(operator, record('pause')), 403, 'AUTHOR_NOT_AUTHORIZED');
    await accept('pause');
    await refused(() => w.cast(0, { budget: ['no'], chair: ['bob'] }), 409, 'WRONG_PHASE');
    await authorityRefusals('resume'); await accept('resume');
    assert.equal((await w.cast(0, { budget: ['no'], chair: ['bob'] })).status, 201, 'resuming within the voting window restores ballot admission');

    // A second pause crosses the original signed deadline. Current controls do not extend it.
    w.clock = closesAt - 60_000; await accept('pause');
    await refused(() => w.cast(0, { budget: ['yes'], chair: ['cy'] }), 409, 'WRONG_PHASE');
    w.clock = closesAt + 30_000; await accept('resume');
    await refused(() => w.cast(0, { budget: ['yes'], chair: ['cy'] }), 409, 'WRONG_PHASE');
    assert.equal((await snapshot(w)).phase, 'OPEN', 'the resumed lifecycle is OPEN even though its original voting window elapsed');
    const publicState = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json;
    assert.equal(publicState.gates.find((g: { name: string }) => g.name === 'voting_window').satisfied, false);
    assert.equal(model.halts, LIMIT);

    const beforeReopen = await snapshot(w); await w.server.stop(); await w.start();
    assert.deepEqual(await snapshot(w), beforeReopen, 'replay preserves exhausted halt capacity and the original deadline');
    await refused(() => submit(w.coord[0]!, record('pause')), 409, 'STATE_CONFLICT');
    assert.equal((await snapshot(w)).counter, 2 * LIMIT, 'the excess pause does not consume a control sequence');
    await authorityRefusals('invalidate'); await accept('invalidate');
    assert.equal(model.counter, 2 * LIMIT + 1);
    await refused(() => submit(w.coord[0]!, record('resume')), 409, 'WRONG_PHASE');
    await refused(() => w.post('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh)), 409, 'WRONG_PHASE');

    const log = await w.fetchLog();
    assert.equal(log.filter((e) => e.type === 'ceremony_start').length, 1, 'the workflow never starts a second ceremony');
    assert.deepEqual(log.filter((e) => e.rec?.body?.type === 'control').map((e) => [e.rec.body.action, e.rec.body.control_seq]),
      [['pause', 1], ['resume', 2], ['pause', 3], ['resume', 4], ['invalidate', 5]]);
    const rt = (await w.server.pool.get(w.electionId))!;
    const keys = new Map([w.owner, ...w.coord, ...w.trustees, ...w.voters].map((key) => [toHex(authorKeyId('ed25519', key.publicKey)), key.publicKey]));
    const board = verifyLog(logBundle(rt), { logPublicKey: hexToBytes(w.logPkHex, 32), resolveAuthorKey: (h) => keys.get(toHex(h.author)),
      witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] } });
    assert.deepEqual(board.failures, []); assert.equal(board.integrity, 'VERIFIED');
  } finally { await w.stop(); }
});
