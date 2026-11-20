// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { MerkleTree, signCheckpoint, type Result } from '@quietvote/board';
import { bytesToHex, ed25519Keypair, sha256 } from '@quietvote/crypto';
import { CHECKPOINT_PIN_FORMAT, MAX_CHECKPOINT_PIN_BYTES, proposeCheckpointPin, readCheckpointPin } from '../src/checkpoint-pin.ts';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
function accepted<T>(result: Result<T>): T {
  if (!result.ok) throw Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}
function refused(result: Result<unknown>, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, code);
}
function fixture() {
  const keys = ed25519Keypair(sha256(utf8('checkpoint-pin-r15-log')));
  const origin = 'quietvote/v1/' + 'ab'.repeat(16);
  const tree = new MerkleTree();
  tree.appendLeaf(utf8('first admitted header'));
  const note1 = signCheckpoint(origin, 1, tree.root(), keys.secretKey, keys.publicKey);
  tree.appendLeaf(utf8('next admitted header'));
  const note2 = signCheckpoint(origin, 2, tree.root(), keys.secretKey, keys.publicKey);
  const proof12 = tree.consistencyProof(1, 2);
  return { keys, origin, tree, note1, note2, proof12, anchors: { origin, logKey: keys.publicKey } };
}

test('independently anchored first pin is bounded, signed, and round-trips without claiming storage', () => {
  const f = fixture();
  const first = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors));
  assert.equal(first.action, 'INITIAL');
  assert.equal(first.consistency, 'NOT_CHECKED');
  assert.equal(first.previous_size, null);
  assert.equal(first.checkpoint_size, 1);
  assert.ok(first.bytes.length <= MAX_CHECKPOINT_PIN_BYTES);
  const verified = accepted(readCheckpointPin(first.bytes, f.anchors));
  assert.equal(verified.record.format, CHECKPOINT_PIN_FORMAT);
  assert.equal(verified.record.origin, f.origin);
  assert.equal(verified.record.log_key, bytesToHex(f.keys.publicKey));
  assert.equal(verified.checkpoint.size, 1);
  const repeat = accepted(proposeCheckpointPin(first.bytes, f.note1, f.anchors));
  assert.equal(repeat.action, 'UNCHANGED');
  assert.equal(repeat.consistency, 'VERIFIED');
  assert.deepEqual(repeat.bytes, first.bytes);
});

test('normal append-only 1 to 2 requires a real consistency proof and refuses stale replacement', () => {
  const f = fixture();
  const first = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors));
  refused(proposeCheckpointPin(first.bytes, f.note2, f.anchors), 'QV_BOARD_BAD_PROOF');
  refused(proposeCheckpointPin(first.bytes, f.note2, f.anchors, []), 'QV_BOARD_BAD_PROOF');
  const advanced = accepted(proposeCheckpointPin(first.bytes, f.note2, f.anchors, f.proof12));
  assert.equal(advanced.action, 'ADVANCED');
  assert.equal(advanced.previous_size, 1);
  assert.equal(advanced.checkpoint_size, 2);
  assert.equal(advanced.consistency, 'VERIFIED');
  assert.equal(accepted(readCheckpointPin(advanced.bytes, f.anchors)).checkpoint.size, 2);
  refused(proposeCheckpointPin(advanced.bytes, f.note1, f.anchors), 'QV_BOARD_ROLLBACK');
});

test('signed equal-size fork is rejected, signed note changes do not erase prior evidence', () => {
  const f = fixture();
  const first = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors));
  const alternate = signCheckpoint(f.origin, 1, sha256(utf8('different root')), f.keys.secretKey, f.keys.publicKey);
  refused(proposeCheckpointPin(first.bytes, alternate, f.anchors), 'QV_BOARD_FORK');
  refused(proposeCheckpointPin(first.bytes, f.note1, f.anchors, [sha256(utf8('unexpected'))]), 'QV_BOARD_BAD_PROOF');
  assert.deepEqual(accepted(proposeCheckpointPin(first.bytes, f.note1, f.anchors)).bytes, first.bytes);
});

test('wrong election, changed key, unsigned advertisement and corrupt stored state fail closed', () => {
  const f = fixture();
  const first = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors));
  const wrongOrigin = { origin: 'quietvote/v1/' + 'cd'.repeat(16), logKey: f.keys.publicKey };
  const wrongKey = ed25519Keypair(sha256(utf8('other log key')));
  refused(readCheckpointPin(first.bytes, wrongOrigin), 'QV_BOARD_ORIGIN_MISMATCH');
  refused(readCheckpointPin(first.bytes, { origin: f.origin, logKey: wrongKey.publicKey }), 'QV_BOARD_ORIGIN_MISMATCH');
  refused(proposeCheckpointPin(first.bytes, { tree_size: 2, root: bytesToHex(f.tree.root()) }, f.anchors), 'QV_BOARD_BAD_CHECKPOINT');
  refused(proposeCheckpointPin(first.bytes, f.note2, f.anchors, [new Uint8Array(31)]), 'QV_BOARD_BAD_PROOF');
  refused(proposeCheckpointPin(new Uint8Array(MAX_CHECKPOINT_PIN_BYTES + 1), f.note2, f.anchors, f.proof12), 'QV_BOARD_TOO_LARGE');
  refused(proposeCheckpointPin(utf8('{'), f.note2, f.anchors, f.proof12), 'QV_BOARD_MALFORMED');
  const extra = JSON.parse(new TextDecoder().decode(first.bytes));
  extra.trusted_latest = true;
  refused(readCheckpointPin(utf8(JSON.stringify(extra)), f.anchors), 'QV_BOARD_ORIGIN_MISMATCH');
  const badNote = { ...JSON.parse(new TextDecoder().decode(first.bytes)), checkpoint_note: 'untrusted' };
  refused(readCheckpointPin(utf8(JSON.stringify(badNote)), f.anchors), 'QV_BOARD_BAD_CHECKPOINT');
});

test('missing optional signed checkpoint remains incomplete: no proposal is emitted', () => {
  const f = fixture();
  const first = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors));
  refused(proposeCheckpointPin(first.bytes, undefined, f.anchors), 'QV_BOARD_BAD_CHECKPOINT');
  refused(proposeCheckpointPin(first.bytes, '', f.anchors), 'QV_BOARD_BAD_CHECKPOINT');
  assert.equal(accepted(readCheckpointPin(first.bytes, f.anchors)).checkpoint.size, 1);
});

test('unchanged proposal cannot alias and mutate the caller retained snapshot', () => {
  const f = fixture();
  const stored = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors)).bytes;
  const savedCopy = stored.slice();
  const repeated = accepted(proposeCheckpointPin(stored, f.note1, f.anchors));
  assert.equal(repeated.action, 'UNCHANGED');
  repeated.bytes.fill(0);
  assert.deepEqual(stored, savedCopy, 'a result mutation must not mutate the retained input buffer');
  assert.equal(accepted(readCheckpointPin(stored, f.anchors)).checkpoint.size, 1);
});

test('pin snapshot bytes must be canonical even when alternate JSON would parse', () => {
  const f = fixture();
  const original = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors)).bytes;
  const parsed = JSON.parse(new TextDecoder().decode(original));
  // Same fields and authenticated note, different valid JSON byte spelling.
  const noncanonical = utf8(JSON.stringify(parsed, null, 2));
  refused(readCheckpointPin(noncanonical, f.anchors), 'QV_BOARD_MALFORMED');
  refused(proposeCheckpointPin(noncanonical, f.note2, f.anchors, f.proof12), 'QV_BOARD_MALFORMED');
  assert.equal(accepted(readCheckpointPin(original, f.anchors)).checkpoint.size, 1);
});

test('malformed runtime anchors and proof containers return named refusals without altering a held pin', () => {
  const f = fixture();
  const held = accepted(proposeCheckpointPin(undefined, f.note1, f.anchors)).bytes;
  const original = held.slice();
  refused(readCheckpointPin(held, null as unknown as typeof f.anchors), 'QV_BOARD_ORIGIN_MISMATCH');
  refused(proposeCheckpointPin(undefined, f.note1, null as unknown as typeof f.anchors), 'QV_BOARD_ORIGIN_MISMATCH');
  refused(proposeCheckpointPin(held, f.note1, f.anchors, null as unknown as readonly Uint8Array[]), 'QV_BOARD_BAD_PROOF');
  refused(proposeCheckpointPin(held, f.note2, f.anchors, { length: 0 } as unknown as readonly Uint8Array[]), 'QV_BOARD_BAD_PROOF');
  refused(proposeCheckpointPin(held, f.note2, f.anchors, Array(1) as readonly Uint8Array[]), 'QV_BOARD_BAD_PROOF');
  assert.deepEqual(held, original);
  assert.equal(accepted(readCheckpointPin(held, f.anchors)).checkpoint.size, 1);
});
