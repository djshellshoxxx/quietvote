import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { checkEntry, decodeHeader } from '@quietvote/board';
import { bytesToHex, jcs, streamRng } from '@quietvote/crypto';
import { logOrigin, verifyMultiSig, verifySig, type ElectionBundle, type MarkerBody, type MultiSignedRecord, type SignedRecord, type TallyBody } from '@quietvote/protocol';
import { bundleOf, castBallot, clone, closeElection, publishTally, setup, type Sim } from '../../protocol/test/helpers/sim.ts';
import { ADMIN_ACTIONS, AdminError, MAX_ADMIN_BYTES, adminSnapshot, prepareAdminAction, submitAdminPacket, trusteePacket, type AdminAction } from '../src/flow/admin.ts';
import { prepareEntry } from '../src/flow/entries.ts';
import { createSigner } from '../src/key/signer.ts';
import { b64uDecode } from '../src/util/hex.ts';
import { ApiClient } from '../src/api/client.ts';

let sim: Sim, original: ElectionBundle;
before(async () => {
  sim = await setup({ seed: 'admin-console', n: 3, t: 2, voters: 3, minCounted: 3, boundLog: true });
  original = clone(bundleOf(sim));
});
const at = (action: AdminAction): ElectionBundle => {
  const e = clone(original);
  const row = e.log.find(({ entry }) => {
    const b = (entry as { body?: { type?: string; name?: string } }).body;
    return action === 'roll-commit' ? b?.type === action : b?.name === action;
  });
  if (row) e.log = e.log.filter((r) => r.seq < row.seq);
  return e;
};
const snapshot = (e: ElectionBundle) => adminSnapshot(e, bytesToHex(sim.mh), sim.manifest.election_id);
async function prepare(action: AdminAction, e = at(action), extra: Partial<Parameters<typeof prepareAdminAction>[0]> = {}) {
  const signer = await createSigner(sim.coord[0]!.secretKey.slice(), { preferWebCrypto: false });
  try { return await prepareAdminAction({ snapshot: snapshot(e), action, signer, rng: streamRng(action), now: Date.parse('2026-11-10T00:00:00Z') / 1000, ...extra }); }
  finally { signer.lock(); }
}

test('organizer prepares every ceremony boundary, committed roll and correctly bound election opening from signed history', async () => {
  for (const action of ADMIN_ACTIONS.filter((a) => a !== 'election-close' && a !== 'tally')) {
    const made = await prepare(action);
    const rec = made.record as MultiSignedRecord<MarkerBody>;
    assert.equal(rec.body.type === 'marker' ? rec.body.name : rec.body.type, action);
    assert.ok(verifyMultiSig(action === 'election-open' ? sim.params!.ctx : sim.mh, rec, sim.manifest.coordinator.keys, 1));
    const header = b64uDecode(made.packet.header)!;
    const checked = checkEntry(header, b64uDecode(made.packet.body)!, logOrigin(sim.manifest), () => sim.coord[0]!.publicKey, 0);
    assert.ok(checked.ok, action);
    if (action === 'election-open') {
      assert.equal(rec.body.manifest_hash, bytesToHex(sim.mh));
      const expected = original.log.find((r) => (r.entry as { body: MarkerBody }).body?.name === 'election-open')!.entry as MultiSignedRecord<MarkerBody>;
      assert.deepEqual(rec.body, expected.body);
    }
  }
});

test('organizer refuses changed pins, malformed history, unauthorized keys, early close and incomplete ceremony', async () => {
  assert.throws(() => adminSnapshot(original, '00'.repeat(32), sim.manifest.election_id), AdminError);
  assert.throws(() => adminSnapshot(original, bytesToHex(sim.mh), '00'.repeat(16)), AdminError);
  const dup = clone(original); dup.log.push(dup.log[0]!); assert.throws(() => snapshot(dup), AdminError);
  const forged = at('dkg-r1-close'); (forged.log[0]!.entry as MultiSignedRecord<MarkerBody>).sigs[0]!.sig = '00'.repeat(64);
  await assert.rejects(prepare('dkg-r1-close', forged), AdminError);
  await assert.rejects(prepare('dkg-final', at('dkg-r2-close')), AdminError);
  await assert.rejects(prepare('dkg-open', original), AdminError);
  await assert.rejects(prepare('election-close', original, { now: 0 }), AdminError);
  const other = await createSigner(sim.voters[0]!.secretKey.slice());
  try { await assert.rejects(prepare('dkg-open', at('dkg-open'), { signer: other }), AdminError); } finally { other.lock(); }
  const wrongRoll = at('roll-commit'); wrongRoll.roll.pop();
  await assert.rejects(prepare('roll-commit', wrongRoll), AdminError);
});

test('organizer close uses verified context; tally refuses tampered results and shares before returning any packet', async () => {
  const close = await prepare('election-close');
  assert.ok(verifyMultiSig(sim.params!.ctx, close.record as MultiSignedRecord<MarkerBody>, sim.manifest.coordinator.keys, 1));
  for (let i = 0; i < 3; i++) castBallot(sim, i, { budget: ['yes'], chair: ['ann'], topics: [], board: [] });
  closeElection(sim); publishTally(sim, [1, 2]);
  const e = clone(bundleOf(sim));
  const tally = (e.log.pop()!.entry as SignedRecord<TallyBody>).body;
  const good = await prepare('tally', e, { tally });
  assert.ok(verifySig(sim.params!.ctx, 'tally', tally, (good.record as SignedRecord<TallyBody>).sig, sim.manifest.coordinator.keys[0]));
  const bad = clone(tally); bad.n_counted++;
  await assert.rejects(prepare('tally', e, { tally: bad }), AdminError);
  const different = clone(tally); different.ctx = 'ff'.repeat(32);
  await assert.rejects(prepare('tally', e, { tally: different }), AdminError);
  await assert.rejects(prepare('tally', e, { tally: { ...tally, extra: true } }), AdminError);
});

test('cancelled preparation cannot produce signed packets and input snapshot is detached', async () => {
  const e = at('dkg-open'), checked = snapshot(e);
  e.manifest.body.title = 'changed after check';
  assert.notEqual(checked.manifest.title, e.manifest.body.title);
  let signs = 0;
  const signer = await createSigner(sim.coord[0]!.secretKey.slice());
  const spy = { ...signer, sign: async (m: Uint8Array) => { signs++; return signer.sign(m); } };
  try { await assert.rejects(prepare('dkg-open', at('dkg-open'), { signer: spy, current: () => false }), AdminError); }
  finally { signer.lock(); }
  assert.equal(signs, 0);
});

test('public trustee relay checks size, board origin, type and authorized signature', async () => {
  const s = snapshot(original), signer = await createSigner(sim.trusteeKeys[0]!.secretKey.slice());
  try {
    const input = { signer, origin: logOrigin(s.manifest), type: 'dkg_round1' as const,
      record: original.log.find((r) => (r.entry as { body?: { type?: string } }).body?.type === 'dkg-commit')!.entry,
      rng: streamRng('relay'), now: 1000 };
    const packet = await prepareEntry(input);
    const json = JSON.stringify({ header: packet.headerB64u, body: packet.bodyB64u });
    assert.deepEqual(trusteePacket(json, s), { header: packet.headerB64u, body: packet.bodyB64u });
    assert.throws(() => trusteePacket(' '.repeat(MAX_ADMIN_BYTES + 1), s), AdminError);
    assert.throws(() => trusteePacket(JSON.stringify({ header: packet.headerB64u, body: packet.bodyB64u + 'a' }), s), AdminError);
    const other = await prepareEntry({ ...input, origin: 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa' });
    assert.throws(() => trusteePacket(JSON.stringify({ header: other.headerB64u, body: other.bodyB64u }), s), AdminError);
    const wrong = await prepareEntry({ ...input, type: 'election_open' });
    assert.throws(() => trusteePacket(JSON.stringify({ header: wrong.headerB64u, body: wrong.bodyB64u }), s), AdminError);
    assert.ok(decodeHeader(packet.headerBytes).ok); assert.ok(jcs(input.record).length);
  } finally { signer.lock(); }
});

test('console POST makes one attempt and tally draft uses the existing read endpoint', async () => {
  const calls: { url: string; method?: string }[] = [];
  const api = new ApiClient({ fetch: async (url, init) => {
    calls.push({ url, ...(init?.method ? { method: init.method } : {}) });
    if (init?.method === 'POST') throw new TypeError('unknown delivery');
    return new Response(JSON.stringify({ body: { type: 'tally' } }));
  } });
  assert.deepEqual(await api.tallyDraft('one'), { type: 'tally' });
  await assert.rejects(submitAdminPacket(api, 'one', { header: 'same', body: 'same' }));
  assert.deepEqual(calls, [{ url: '/api/v1/elections/one/tally/draft', method: 'GET' }, { url: '/api/v1/elections/one/log/entries', method: 'POST' }]);
});
