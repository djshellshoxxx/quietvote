import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { rollRoot, type ElectionBundle, type MarkerBody, type MultiSignedRecord, type RollCommitBody } from '@quietvote/protocol';
import { bundleOf, clone, kp, setup, type Sim } from '../../protocol/test/helpers/sim.ts';
import { AdminError, adminSnapshot, prepareAdminAction, type AdminAction } from '../src/flow/admin.ts';
import { signMulti } from '../src/flow/organizer.ts';
import { createSigner, type Signer } from '../src/key/signer.ts';

let sim: Sim, original: ElectionBundle;
before(async () => {
  sim = await setup({ seed: 'independent-organizer-review', n: 3, t: 2, voters: 3, boundLog: true });
  original = clone(bundleOf(sim));
});
function marker(e: ElectionBundle, name: string) {
  return e.log.find(({ entry }) => (entry as MultiSignedRecord<MarkerBody>).body?.name === name)!;
}
async function withSigner(fn: (signer: Signer) => Promise<void>) {
  const signer = await createSigner(sim.coord[0]!.secretKey.slice(), { preferWebCrypto: false });
  try { await fn(signer); } finally { signer.lock(); }
}
async function prepare(e: ElectionBundle, action: AdminAction, signer: Signer) {
  return prepareAdminAction({ snapshot: adminSnapshot(e, bytesToHex(sim.mh), sim.manifest.election_id), action, signer,
    now: Date.parse('2026-11-10T00:00:00Z') / 1000, rng: streamRng('independent-review') });
}

test('review: signed final without threshold key-confirm evidence cannot authorize election opening', async () => {
  const e = clone(original);
  const openSeq = marker(e, 'election-open').seq;
  e.log = e.log.filter(({ seq, entry }) => seq < openSeq && (entry as { body?: { type?: string } }).body?.type !== 'dkg-keyconf');
  await withSigner(async (signer) => { await assert.rejects(prepare(e, 'election-open', signer), AdminError); });
});

test('review: authenticated open with a wrong setup reference cannot authorize election closing', async () => {
  const e = clone(original);
  const open = marker(e, 'election-open');
  const body = clone((open.entry as MultiSignedRecord<MarkerBody>).body);
  body.roll_commit_seq = 0;
  await withSigner(async (signer) => {
    open.entry = await signMulti(signer, sim.params!.ctx, body);
    await assert.rejects(prepare(e, 'election-close', signer), AdminError);
  });
});

test('review: duplicate authenticated open marker cannot authorize election closing', async () => {
  const e = clone(original), open = marker(e, 'election-open');
  e.log.push({ seq: e.log.at(-1)!.seq + 1, entry: clone(open.entry) });
  await withSigner(async (signer) => { await assert.rejects(prepare(e, 'election-close', signer), AdminError); });
});

test('review: forged context marker must be refused instead of silently omitted from state', async () => {
  const e = clone(original), open = marker(e, 'election-open');
  (open.entry as MultiSignedRecord<MarkerBody>).sigs[0]!.sig = '00'.repeat(64);
  await withSigner(async (signer) => { await assert.rejects(prepare(e, 'election-open', signer), AdminError); });
});

test('review: setup markers cannot carry fields reserved for election-open', async () => {
  const e = clone(original), first = marker(e, 'dkg-open');
  e.log = [first];
  const body = clone((first.entry as MultiSignedRecord<MarkerBody>).body);
  body.manifest_hash = bytesToHex(sim.mh);
  await withSigner(async (signer) => {
    first.entry = await signMulti(signer, sim.mh, body);
    await assert.rejects(prepare(e, 'dkg-r1-open', signer), AdminError);
  });
});

test('review: existing final without key confirmations cannot authorize roll commitment', async () => {
  const e = clone(original), final = marker(e, 'dkg-final');
  e.log = e.log.filter(({ seq, entry }) => seq <= final.seq && (entry as { body?: { type?: string } }).body?.type !== 'dkg-keyconf');
  await withSigner(async (signer) => { await assert.rejects(prepare(e, 'roll-commit', signer), AdminError); });
});

test('review: supplied roll and signed commitment cannot override the pinned manifest roll', async () => {
  const e = clone(original), openSeq = marker(e, 'election-open').seq;
  e.log = e.log.filter(({ seq }) => seq < openSeq);
  e.roll = e.roll.map((_pk, i) => bytesToHex(kp('review-foreign-roll', String(i)).publicKey)).sort();
  const root = rollRoot(e.roll); assert.ok(root.ok);
  const commit = e.log.find(({ entry }) => (entry as MultiSignedRecord<RollCommitBody>).body.type === 'roll-commit')!;
  const body = clone((commit.entry as MultiSignedRecord<RollCommitBody>).body); body.root = bytesToHex(root.value);
  await withSigner(async (signer) => {
    commit.entry = await signMulti(signer, sim.mh, body);
    await assert.rejects(prepare(e, 'election-open', signer), AdminError);
  });
});

test('review: snapshot sequence numbers must fit protocol reference fields before an opening is signed', async () => {
  const e = clone(original), openSeq = marker(e, 'election-open').seq;
  e.log = e.log.filter(({ seq }) => seq < openSeq).map((row) => ({ ...row, seq: row.seq + 0x1_0000_0000 }));
  await withSigner(async (signer) => { await assert.rejects(prepare(e, 'election-open', signer), AdminError); });
});
