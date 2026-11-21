import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { bytesToHex, jcs, streamRng } from '@quietvote/crypto';
import { authorKeyId, checkEntry, hashLeaf, signCheckpoint, signPromise } from '@quietvote/board';
import { logOrigin, manifestHash, signRecordRaw, verifyMultiSig, type ElectionBundle, type MarkerBody, type MultiSignedRecord } from '@quietvote/protocol';
import { bundleOf, clone, kp, setup } from '../../protocol/test/helpers/sim.ts';
import type { AppendResult } from '../src/api/types.ts';
import { AdminError, adminSnapshot, coSignAdminPacket, prepareAdminAction, reviewSavedAdminPacket, submitAdminPacket, type AdminPacket } from '../src/flow/admin.ts';
import { prepareEntry } from '../src/flow/entries.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';
import { b64uDecode, b64uEncode } from '../src/util/hex.ts';

const seed = 'independent-multisig-review';
const coordinators = ['a', 'b', 'c'].map((name) => kp(seed, name));
let election: ElectionBundle;
before(async () => {
  const sim = await setup({ seed, n: 3, t: 2, voters: 3, boundLog: true });
  election = clone(bundleOf(sim)); election.log = [];
  election.manifest.body.coordinator = { keys: coordinators.map((k) => bytesToHex(k.publicKey)), m: 3 };
  const mh = manifestHash(election.manifest.body); election.manifest_hash = bytesToHex(mh);
  election.manifest.sigs = coordinators.map((k) => signRecordRaw(k.secretKey, k.publicKey, mh, 'manifest', election.manifest.body));
});
const snapshot = () => adminSnapshot(election, election.manifest_hash, election.manifest.body.election_id);
async function signing<T>(index: number, fn: (signer: Signer) => Promise<T>): Promise<T> {
  const signer = await createSigner(coordinators[index]!.secretKey.slice(), { preferWebCrypto: false });
  try { return await fn(signer); } finally { signer.lock(); }
}
const prepare = (signer: Signer) => prepareAdminAction({ snapshot: snapshot(), action: 'dkg-open', signer, rng: streamRng(seed), now: 1000 });
const cosign = (text: string, signer: Signer, current?: () => boolean) => coSignAdminPacket({ snapshot: snapshot(), text, signer, rng: streamRng('cosign'), now: 1000, ...(current ? { current } : {}) });

test('review: 3-of-3 accumulates byte-stable bodies and prior signatures; two signatures remain below quorum', async () => {
  const first = await signing(0, prepare);
  const second = await signing(2, (signer) => cosign(JSON.stringify(first.packet), signer));
  assert.equal(first.quorum, false); assert.equal(second.quorum, false);
  await assert.rejects(reviewSavedAdminPacket(JSON.stringify(second.packet), snapshot()), AdminError);
  const third = await signing(1, (signer) => cosign(JSON.stringify(second.record), signer));
  assert.equal(third.quorum, true);
  const initial = first.record as MultiSignedRecord<MarkerBody>, partial = second.record as MultiSignedRecord<MarkerBody>, full = third.record as MultiSignedRecord<MarkerBody>;
  assert.deepEqual(jcs(full.body), jcs(initial.body));
  assert.deepEqual(jcs(full.sigs.slice(0, 2)), jcs(partial.sigs));
  assert.equal(new Set(full.sigs.map((s) => s.key)).size, 3);
  assert.ok(verifyMultiSig(manifestHash(election.manifest.body), full, election.manifest.body.coordinator.keys, 3));
  const checked = checkEntry(b64uDecode(third.packet.header)!, b64uDecode(third.packet.body)!, logOrigin(election.manifest.body),
    (h) => bytesToHex(h.author) === bytesToHex(authorKeyId('ed25519', coordinators[1]!.publicKey)) ? coordinators[1]!.publicKey : undefined, 0);
  assert.ok(checked.ok);
  const restored = await reviewSavedAdminPacket(JSON.stringify(third.packet), snapshot());
  assert.deepEqual(restored.packet, third.packet);
});

test('review: unknown, duplicate, forged, wrong-scope and body-modified prior signatures never invoke signer', async () => {
  const first = await signing(0, prepare), original = first.record as MultiSignedRecord<MarkerBody>;
  const outsider = kp(seed, 'outside');
  const unknown = clone(original); unknown.sigs.push(signRecordRaw(outsider.secretKey, outsider.publicKey, manifestHash(election.manifest.body), 'marker', unknown.body));
  const duplicate = clone(original); duplicate.sigs.push(clone(duplicate.sigs[0]!));
  const forged = clone(original); forged.sigs[0]!.sig = '00'.repeat(64);
  const modified = clone(original); modified.body.name = 'dkg-r1-open';
  const wrongScope = clone(original); wrongScope.sigs = [signRecordRaw(coordinators[0]!.secretKey, coordinators[0]!.publicKey, new Uint8Array(32), 'marker', wrongScope.body)];
  await signing(1, async (signer) => {
    let calls = 0;
    const spy = { ...signer, sign: async (message: Uint8Array) => { calls++; return signer.sign(message); } };
    for (const record of [unknown, duplicate, forged, modified, wrongScope]) await assert.rejects(cosign(JSON.stringify(record), spy), AdminError);
    assert.equal(calls, 0);
  });
});

test('review: valid inner signatures cannot bypass wrong-origin, wrong-type or unauthorized outer framing', async () => {
  const first = await signing(0, prepare), records: string[] = [];
  const outsider = kp(seed, 'outside');
  for (const variant of ['origin', 'type', 'author']) {
    const key = variant === 'author' ? outsider : coordinators[0]!;
    const signer = await createSigner(key.secretKey.slice());
    try {
      const p = await prepareEntry({ signer, record: first.record, rng: streamRng(variant), now: 1000,
        type: variant === 'type' ? 'election_open' : 'ceremony_start',
        origin: variant === 'origin' ? 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa' : logOrigin(election.manifest.body) });
      records.push(JSON.stringify({ header: p.headerB64u, body: p.bodyB64u }));
    } finally { signer.lock(); }
  }
  await signing(1, async (signer) => {
    let calls = 0;
    const spy = { ...signer, sign: async (message: Uint8Array) => { calls++; return signer.sign(message); } };
    for (const text of records) await assert.rejects(cosign(text, spy), AdminError);
    assert.equal(calls, 0);
  });
});

test('review: invalidation during inner or outer co-sign completion returns no usable packet', async () => {
  const first = await signing(0, prepare);
  for (const cancelAt of [1, 2, 3]) await signing(1, async (signer) => {
    let calls = 0, current = true;
    const spy = { ...signer, sign: async (message: Uint8Array) => {
      const result = await signer.sign(message); calls++; if (calls === cancelAt) current = false; return result;
    } };
    await assert.rejects(cosign(JSON.stringify(first.packet), spy, () => current), (e: unknown) => e instanceof AdminError && e.code === 'stale');
    assert.equal(calls, cancelAt);
  });
});

function signedReceipt(packet: AdminPacket, options: { foreignOrigin?: boolean; foreignLeaf?: boolean; foreignKey?: boolean; inclusion?: 'valid' | 'bad' } = {}): AppendResult {
  const logKey = kp(seed, options.foreignKey ? 'other-log' : 'log');
  const origin = options.foreignOrigin ? 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa' : logOrigin(election.manifest.body);
  const leaf = options.foreignLeaf ? new Uint8Array(32) : hashLeaf(b64uDecode(packet.header)!);
  const r = signPromise(logKey.secretKey, origin, 0, leaf, 1000);
  return { status: options.inclusion ? 'included' : 'sequenced', receipt: {
    origin, seq: 0, leaf_hash: b64uEncode(leaf), promise: { sequenced_at: r.sequencedAt, checkpoint_deadline: r.checkpointDeadline }, promise_sig: b64uEncode(r.promiseSig),
    ...(options.inclusion ? { inclusion: { seq: 0, leaf_hash: b64uEncode(leaf), tree_size: 1, path: [],
      checkpoint_note: signCheckpoint(origin, 1, options.inclusion === 'bad' ? new Uint8Array(32) : leaf, logKey.secretKey, logKey.publicKey) } } : {}),
  } };
}

test('review: append verifies authenticated origin, log key, expected leaf and any inclusion proof', async () => {
  const first = await signing(0, prepare);
  const second = await signing(1, (signer) => cosign(JSON.stringify(first.packet), signer));
  const full = await signing(2, (signer) => cosign(JSON.stringify(second.packet), signer));
  const s = snapshot(), sent: AdminPacket[] = [];
  for (const bad of [{ foreignOrigin: true }, { foreignLeaf: true }, { foreignKey: true }, { inclusion: 'bad' as const }]) {
    await assert.rejects(submitAdminPacket({ postEntry: async (_id, header, body) => { sent.push({ header, body }); return signedReceipt(full.packet, bad); } }, s.manifest.election_id, full.packet, s));
  }
  for (const inclusion of [undefined, 'valid'] as const) {
    const result = await submitAdminPacket({ postEntry: async (_id, header, body) => { sent.push({ header, body }); return signedReceipt(full.packet, inclusion ? { inclusion } : {}); } }, s.manifest.election_id, full.packet, s);
    assert.equal(result.status, inclusion ? 'included' : 'sequenced');
  }
  assert.equal(sent.length, 6); assert.ok(sent.every((packet) => JSON.stringify(packet) === JSON.stringify(full.packet)));
});
