// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent R18 ordinary pin transitions. No filesystem durability is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addCosignatures, checkpointText, cosignLine, MerkleTree, signCheckpoint, type Result } from '@quietvote/board';
import { ed25519Keypair, sha256 } from '@quietvote/crypto';
import { proposeCheckpointPin, readCheckpointPin } from '../src/checkpoint-pin.ts';

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);
function accepted<T>(result: Result<T>): T {
  if (!result.ok) throw Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
function fixture() {
  const keys = ed25519Keypair(sha256(utf8('independent-r18-pin-log')));
  const origin = 'quietvote/v1/' + '76'.repeat(16);
  const tree = new MerkleTree();
  const note = () => signCheckpoint(origin, tree.size, tree.root(), keys.secretKey, keys.publicKey);
  return { keys, origin, tree, note, anchors: { origin, logKey: keys.publicKey } };
}

// @verifies QV-18-REQ-026
test('review: a retained Node Buffer snapshot and an unchanged proposal own independent bytes', () => {
  const f = fixture();
  f.tree.appendLeaf(utf8('ordinary admitted header'));
  const original = accepted(proposeCheckpointPin(undefined, f.note(), f.anchors)).bytes;
  const retained = Buffer.from(original);
  const repeat = accepted(proposeCheckpointPin(retained, f.note(), f.anchors));
  assert.equal(repeat.action, 'UNCHANGED');
  assert.equal(repeat.consistency, 'VERIFIED');
  assert.deepEqual(Array.from(repeat.bytes), Array.from(retained));
  repeat.bytes.fill(0);
  assert.deepEqual(retained, Buffer.from(original));
  assert.equal(accepted(readCheckpointPin(retained, f.anchors)).checkpoint.size, 1);
});

// @verifies QV-18-REQ-002, QV-18-REQ-026
test('review: an ordinary empty signed head is idempotent and advances with the exact empty proof', () => {
  const f = fixture();
  const initial = accepted(proposeCheckpointPin(undefined, f.note(), f.anchors));
  assert.equal(initial.action, 'INITIAL');
  assert.equal(initial.checkpoint_size, 0);
  assert.equal(initial.consistency, 'NOT_CHECKED');
  const repeat = accepted(proposeCheckpointPin(initial.bytes, f.note(), f.anchors, []));
  assert.equal(repeat.action, 'UNCHANGED');
  assert.deepEqual(repeat.bytes, initial.bytes);
  f.tree.appendLeaf(utf8('first header'));
  f.tree.appendLeaf(utf8('second header'));
  const path = f.tree.consistencyProof(0, 2);
  assert.deepEqual(path, []);
  const next = accepted(proposeCheckpointPin(initial.bytes, f.note(), f.anchors, path));
  assert.equal(next.action, 'ADVANCED');
  assert.equal(next.previous_size, 0);
  assert.equal(next.checkpoint_size, 2);
  assert.equal(next.consistency, 'VERIFIED');
  assert.equal(accepted(readCheckpointPin(initial.bytes, f.anchors)).checkpoint.size, 0);
  assert.equal(accepted(readCheckpointPin(next.bytes, f.anchors)).checkpoint.size, 2);
});

// @verifies QV-18-REQ-026
test('review: retained pins follow ordinary multi-level 1 to 3 to 7 consistency paths', () => {
  const f = fixture();
  f.tree.appendLeaf(utf8('header 0'));
  let pin = accepted(proposeCheckpointPin(undefined, f.note(), f.anchors));
  for (const size of [3, 7]) {
    const previousSize = pin.checkpoint_size;
    const previousBytes = new Uint8Array(pin.bytes);
    while (f.tree.size < size) f.tree.appendLeaf(utf8(`header ${f.tree.size}`));
    const proof = f.tree.consistencyProof(previousSize, size);
    assert.ok(proof.length > 1);
    pin = accepted(proposeCheckpointPin(previousBytes, f.note(), f.anchors, proof));
    assert.equal(pin.action, 'ADVANCED');
    assert.equal(pin.previous_size, previousSize);
    assert.equal(pin.checkpoint_size, size);
    const checked = accepted(readCheckpointPin(pin.bytes, f.anchors));
    assert.deepEqual(checked.checkpoint.root, f.tree.root());
    assert.equal(accepted(readCheckpointPin(previousBytes, f.anchors)).checkpoint.size, previousSize);
  }
});

// @verifies QV-18-REQ-026
test('review: an equal signed head retains the original genuine witness line byte for byte', () => {
  const f = fixture();
  f.tree.appendLeaf(utf8('witnessed header'));
  const witness = ed25519Keypair(sha256(utf8('independent-r18-pin-witness')));
  const cosigned = addCosignatures(f.note(), [cosignLine('independent-r18-witness', witness.secretKey,
    witness.publicKey, checkpointText(f.origin, f.tree.size, f.tree.root()), 1_800_000_000)]);
  const initial = accepted(proposeCheckpointPin(undefined, cosigned, f.anchors));
  const repeat = accepted(proposeCheckpointPin(initial.bytes, f.note(), f.anchors));
  assert.equal(repeat.action, 'UNCHANGED');
  assert.deepEqual(repeat.bytes, initial.bytes);
  assert.equal(accepted(readCheckpointPin(repeat.bytes, f.anchors)).record.checkpoint_note, cosigned);
});
