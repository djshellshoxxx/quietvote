import test from 'node:test';
import assert from 'node:assert/strict';
import { b64u, buildEntry, signPromise } from '@quietvote/board';
import { ed25519Keypair } from '@quietvote/crypto';
import { logOrigin } from '@quietvote/protocol';
import { checkReturnedSubmissionReceipt, submittedPacketLeaf } from '../src/submit-receipt.ts';

const signing = ed25519Keypair(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const log = ed25519Keypair(Uint8Array.from({ length: 32 }, (_, i) => i + 41));
const origin = logOrigin({ election_id: 'a'.repeat(32) });
function entry() {
  return buildEntry({
    origin, type: 'notice', secretKey: signing.secretKey, publicKey: signing.publicKey,
    nonce: new Uint8Array(16), createdAt: 1_800_000_000, body: new TextEncoder().encode('{}'),
  });
}
function wire() {
  const e = entry();
  const promise = signPromise(log.secretKey, origin, 3, e.leafHash, 1_800_000_000);
  return {
    packet: { header: b64u(e.headerBytes), body: b64u(e.body) },
    receipt: { status: 'sequenced', receipt: { origin, seq: 3, leaf_hash: b64u(promise.leafHash),
      promise: { sequenced_at: promise.sequencedAt, checkpoint_deadline: promise.checkpointDeadline },
      promise_sig: b64u(promise.promiseSig) } },
    leaf: e.leafHash,
  };
}
test('submitted packet preflight binds exact canonical signed header and body before POST', () => {
  const { packet, leaf } = wire();
  assert.deepEqual(submittedPacketLeaf(packet, origin), leaf);
  assert.throws(() => submittedPacketLeaf(packet, logOrigin({ election_id: 'b'.repeat(32) })), /another election/);
  assert.throws(() => submittedPacketLeaf({ ...packet, body: b64u(new TextEncoder().encode('{"a":1}')) }, origin), /length or digest/);
  assert.throws(() => submittedPacketLeaf({ ...packet, header: '%%%not-base64' }, origin), /base64url/);
});
test('nested QV-09 signed promise is verified but not misreported as inclusion', () => {
  const { receipt, leaf } = wire();
  assert.deepEqual(checkReturnedSubmissionReceipt(receipt, { origin, leafHash: leaf, logPk: log.publicKey }),
    { promise: 'VERIFIED', inclusion: 'INCOMPLETE', origin, leaf_hash: b64u(leaf), seq: 3,
      scope: 'returned receipt only; no witness quorum, newest head, freshness, election tally, finality or ballot-counting verdict' });
});
test('wire tampering, client-trust changes and incoherent status cannot assert verification', () => {
  const { receipt, leaf } = wire();
  const expected = { origin, leafHash: leaf, logPk: log.publicKey };
  assert.throws(() => checkReturnedSubmissionReceipt({ ...receipt, status: 'included' }, expected), /may have been accepted/);
  assert.throws(() => checkReturnedSubmissionReceipt(receipt, { ...expected, logPk: signing.publicKey }), /may have been accepted/);
  assert.throws(() => checkReturnedSubmissionReceipt(receipt, { ...expected, leafHash: new Uint8Array(32) }), /may have been accepted/);
  assert.throws(() => checkReturnedSubmissionReceipt({ ...receipt, receipt: {
    ...receipt.receipt, promise: { ...receipt.receipt.promise, checkpoint_deadline: receipt.receipt.promise.checkpoint_deadline + 1 },
  } }, expected), /may have been accepted/);
  assert.throws(() => checkReturnedSubmissionReceipt({ ...receipt, status: 'included', receipt: {
    ...receipt.receipt, inclusion: { seq: 2, leaf_hash: receipt.receipt.leaf_hash,
      tree_size: 5, path: [], checkpoint_note: 'not a checkpoint' },
  } }, expected), /may have been accepted/);
  assert.throws(() => checkReturnedSubmissionReceipt({ ...receipt, status: 'included', receipt: {
    ...receipt.receipt, inclusion: { seq: 3, leaf_hash: b64u(new Uint8Array(32)),
      tree_size: 5, path: [], checkpoint_note: 'not a checkpoint' },
  } }, expected), /may have been accepted/);
});
