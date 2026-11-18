// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_RECEIPT_FILE_BYTES, parseReceiptFile, receiptFileText, type ReceiptFile } from '../src/flow/receipt.ts';
import { b64uEncode } from '../src/util/hex.ts';
import { ed25519Keypair } from '@quietvote/crypto';
import { signCheckpoint } from '@quietvote/board';
import { BoardIntegrityError, checkInclusion } from '../src/flow/receipt.ts';
import { ApiClient } from '../src/api/client.ts';

const leaf = b64uEncode(new Uint8Array(32).fill(3));
const file: ReceiptFile = {
  format: 'qv-receipt/1', election: 'a'.repeat(26), manifest_hash: '12'.repeat(32), ballot_code: '34'.repeat(32),
  seq: 3, leaf_hash: leaf, client_build: 'test',
  receipt: { origin: 'quietvote/v1/test', seq: 3, leaf_hash: leaf,
    promise: { sequenced_at: 1, checkpoint_deadline: 2 }, promise_sig: b64uEncode(new Uint8Array(64)) },
};
const expected = { election: file.election, manifestHash: file.manifest_hash };

// @verifies QV-19-REQ-015
test('receipt file round trip is structurally checked and bound to the selected election', () => {
  const text = receiptFileText(file);
  assert.deepEqual(parseReceiptFile(text, expected), file);
  assert.equal(parseReceiptFile(text, { ...expected, election: 'b'.repeat(26) }), undefined);
  assert.equal(parseReceiptFile(text, { ...expected, manifestHash: '56'.repeat(32) }), undefined);
  const realApiFile = { ...file, election: '0123456789abcdef'.repeat(2) };
  assert.deepEqual(parseReceiptFile(receiptFileText(realApiFile), { ...expected, election: realApiFile.election }), realApiFile);
});

test('receipt file rejects malformed metadata and contradictory nested receipt', () => {
  for (const patch of [
    { seq: -1 }, { seq: 1.5 }, { seq: Number.MAX_SAFE_INTEGER + 1 }, { election: '' }, { manifest_hash: '12' },
    { ballot_code: 'bad' }, { leaf_hash: 'AA' }, { client_build: null }, { receipt: null },
    { receipt: { ...file.receipt, seq: 4 } }, { receipt: { ...file.receipt, leaf_hash: b64uEncode(new Uint8Array(32)) } },
    { receipt: { ...file.receipt, promise: null } },
  ]) assert.equal(parseReceiptFile(JSON.stringify({ ...file, ...patch })), undefined, JSON.stringify(patch));
  for (const text of ['null', '[]', '{}', '{', ' '.repeat(MAX_RECEIPT_FILE_BYTES + 1),
    JSON.stringify({ ...file, extra: 'é'.repeat(MAX_RECEIPT_FILE_BYTES / 2) })]) {
    assert.equal(parseReceiptFile(text), undefined);
  }
});

test('receipt inclusion refuses a validly signed checkpoint from a different log origin', async () => {
  const key = ed25519Keypair(new Uint8Array(32).fill(7));
  const note = signCheckpoint('quietvote/v1/other', 0, new Uint8Array(32), key.secretKey, key.publicKey);
  let calls = 0;
  const api = new ApiClient({ fetch: async () => { calls++; return new Response(note); } });
  await assert.rejects(checkInclusion({ api, apiElectionId: file.election, logPk: key.publicKey,
    leafHash: new Uint8Array(32), seq: 0, pinned: undefined, expectedOrigin: 'quietvote/v1/expected' }),
  (error: unknown) => error instanceof BoardIntegrityError && error.code === 'E-BOARD-INCL-FAIL');
  assert.equal(calls, 1, 'refuse before requesting an inclusion proof');
});
