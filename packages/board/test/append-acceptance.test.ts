// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-18-REQ-004 QV-18-REQ-005 (docs/18-bulletin-board-transparency.md)
// Exercises one synchronous sequencer and an atomic in-memory store boundary, not OS-process crash durability.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BoardLog, MemoryBoardStore, nonceKey, parseCheckpoint, toHex, verifyConsistency, verifyInclusion,
  verifyLogSignature, verifyReceipt, type BuiltEntry, type Receipt,
} from '../src/index.ts';
import { LOG, NOW, ORIGIN, kp, mk, register, resolveAuthorKey, rng } from './helpers.ts';
import { ReferenceMerkle, referenceLeafHash } from './reference-merkle.ts';

const logOver = (store: MemoryBoardStore): BoardLog => new BoardLog({
  origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey,
});
const keyFor = (entry: BuiltEntry): string => nonceKey(toHex(entry.header.author), entry.header.type, toHex(entry.header.authorNonce));

test('1000 interleaved callers produce gapless signed appends, idempotent retries and atomic failure recovery', async (context) => {
  const store = new MemoryBoardStore(), log = logOver(store);
  const persist = store.appendEntry.bind(store);
  let faultPending = true, faults = 0;
  store.appendEntry = (entry) => {
    if (faultPending && entry.seq === 512) {
      faultPending = false; faults++;
      // The Store contract requires atomic failure: throw before committing, never simulate a partial-write store.
      throw new Error('injected atomic storage failure');
    }
    persist(entry);
  };
  const committed: BuiltEntry[] = [], receipts: Receipt[] = [], roots: Uint8Array[] = [];
  const remember = (entry: BuiltEntry, receipt: Receipt): void => {
    assert.equal(receipt.seq, committed.length);
    committed.push(entry); receipts.push(receipt); roots.push(log.root());
    assert.equal(log.size, committed.length); assert.equal(store.size(), committed.length);
  };
  for (const type of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open'] as const) {
    const entry = mk(type), result = log.append(entry.headerBytes, entry.body);
    assert.ok(result.ok && !result.value.duplicate);
    remember(entry, result.value.receipt);
  }
  const before = log.checkpoint(); assert.ok(before.ok);
  const authors = Array.from({ length: 8 }, (_, i) => kp(`append-acceptance-author-${i}`));
  authors.forEach(register);
  const entries = Array.from({ length: 1000 }, (_, i) => mk('ballot', authors[i % authors.length]!, `request-${i}`));
  const failed: number[] = [], order = Array.from({ length: 1000 }, (_, i) => i), random = rng(0x18_004);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!];
  }
  assert.notDeepEqual(order, Array.from({ length: 1000 }, (_, i) => i), 'requests are not released in construction order');
  let duplicateChecks = 0, duplicatesBeforeLastNewAppend = 0;
  const callers = entries.map((entry, id) => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const done = ready.then(async () => {
      const size = log.size, root = log.root();
      const snapshot = faultPending && size === 512 ? store.leafHashes(0, size) : undefined;
      const result = log.append(entry.headerBytes, entry.body);
      if (!result.ok) {
        assert.equal(result.error.code, 'QV_BOARD_INTERNAL');
        assert.ok(snapshot, 'only the planned storage exception fails a request');
        assert.equal(log.size, size); assert.equal(store.size(), size);
        assert.deepEqual(log.root(), root); assert.deepEqual(store.leafHashes(0, size), snapshot);
        assert.equal(store.getEntry(size), undefined); assert.equal(store.findByNonce(keyFor(entry)), undefined);
        const missing = log.getReceipt(size); assert.ok(!missing.ok && missing.error.code === 'QV_BOARD_NOT_FOUND');
        assert.deepEqual(store.latestCheckpoint()?.note, before.value);
        failed.push(id); return;
      }
      assert.equal(result.value.duplicate, false);
      remember(entry, result.value.receipt);
      await Promise.resolve(); // Other released callers reach the same synchronous sequencer before these duplicates.
      if (id % 29 === 0) {
        const duplicate = log.append(entry.headerBytes, entry.body);
        assert.ok(duplicate.ok && duplicate.value.duplicate);
        assert.deepEqual(duplicate.value.receipt, result.value.receipt);
        duplicateChecks++;
        if (committed.length < 1004) duplicatesBeforeLastNewAppend++;
      }
    });
    return { release, done };
  });
  // All 1000 callers are pending. Release deterministic batches with microtask yields so
  // duplicate requests from earlier batches run between newly released submissions.
  for (let offset = 0; offset < order.length; offset += 17) {
    for (const id of order.slice(offset, offset + 17)) callers[id]!.release();
    await Promise.resolve();
  }
  await Promise.all(callers.map((caller) => caller.done));
  assert.equal(faults, 1); assert.equal(failed.length, 1);
  assert.equal(duplicateChecks, entries.filter((_, id) => id % 29 === 0 && id !== failed[0]).length);
  assert.ok(duplicatesBeforeLastNewAppend > 0, 'duplicates actually interleave with new appends');
  assert.equal(log.size, 1004, 'five setup entries plus 999 initially successful ballots');
  const retried = entries[failed[0]!]!, retry = log.append(retried.headerBytes, retried.body);
  assert.ok(retry.ok && !retry.value.duplicate, 'failed entry was neither sequenced nor consumed as a duplicate');
  remember(retried, retry.value.receipt);
  assert.equal(log.size, 1005);
  assert.deepEqual(receipts.map((receipt) => receipt.seq), Array.from({ length: 1005 }, (_, i) => i));
  assert.equal(new Set(committed.map(keyFor)).size, 1005);
  const reference = new ReferenceMerkle(committed.map((entry) => entry.headerBytes));
  for (let i = 0; i < committed.length; i++) {
    const expected = committed[i]!, stored = store.getEntry(i)!;
    assert.equal(stored.seq, i); assert.equal(store.findByNonce(keyFor(expected)), i);
    assert.deepEqual(stored.headerBytes, expected.headerBytes); assert.deepEqual(stored.body, expected.body);
    assert.deepEqual(stored.leafHash, referenceLeafHash(expected.headerBytes));
    assert.deepEqual(roots[i], reference.root(i + 1), `root after committed append ${i}`);
    assert.deepEqual(receipts[i]!.leafHash, stored.leafHash);
    assert.ok(verifyReceipt(receipts[i]!, LOG.publicKey).ok, `promise signature ${i}`);
  }
  const after = log.checkpoint(); assert.ok(after.ok);
  const checkpoint = parseCheckpoint(after.value); assert.ok(checkpoint.ok);
  assert.ok(verifyLogSignature(checkpoint.value, LOG.publicKey));
  assert.equal(checkpoint.value.size, 1005); assert.deepEqual(checkpoint.value.root, reference.root());
  const consistency = log.consistencyProof(5, 1005); assert.ok(consistency.ok);
  assert.deepEqual(consistency.value, reference.consistency(5, 1005));
  assert.ok(verifyConsistency(5, 1005, reference.root(5), reference.root(), consistency.value));
  for (const seq of [0, 4, 5, 255, 256, 511, 512, 513, 999, 1004]) {
    const receipt = log.getReceipt(seq); assert.ok(receipt.ok && receipt.value.inclusion);
    assert.ok(verifyReceipt(receipt.value, LOG.publicKey).ok);
    assert.deepEqual(receipt.value.inclusion.path, reference.inclusion(seq, 1005));
    assert.ok(verifyInclusion(referenceLeafHash(committed[seq]!.headerBytes), seq, 1005, receipt.value.inclusion.path, reference.root()));
  }
  const replay = logOver(store); // Replace, never run concurrently with the original sequencer.
  assert.deepEqual(replay.status, { state: 'ok', reason: '' });
  assert.equal(replay.size, store.size()); assert.deepEqual(replay.root(), reference.root());
  assert.equal(replay.selfAudit(), true);
  const duplicate = replay.append(retried.headerBytes, retried.body);
  assert.ok(duplicate.ok && duplicate.value.duplicate);
  assert.equal(duplicate.value.receipt.seq, 1004); assert.ok(verifyReceipt(duplicate.value.receipt, LOG.publicKey).ok);
  assert.equal(replay.size, 1005); assert.equal(store.size(), 1005);
  context.diagnostic(`1000 released async callers; synchronous single sequencer; 1005 committed entries; ${duplicateChecks} interleaved duplicate checks; one atomic storage failure and retry`);
});

test('failed close persistence leaves grammar open, nonce unused and the same close bytes retryable', () => {
  const store = new MemoryBoardStore(), log = logOver(store), committed: BuiltEntry[] = [];
  const append = (entry: BuiltEntry): Receipt => {
    const result = log.append(entry.headerBytes, entry.body); assert.ok(result.ok && !result.value.duplicate);
    committed.push(entry); return result.value.receipt;
  };
  for (const type of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'ballot'] as const) append(mk(type));
  const before = log.root(), size = log.size, close = mk('election_close'), persist = store.appendEntry.bind(store);
  let fail = true;
  store.appendEntry = (entry) => { if (fail) { fail = false; throw new Error('injected atomic close failure'); } persist(entry); };
  const rejected = log.append(close.headerBytes, close.body);
  assert.ok(!rejected.ok && rejected.error.code === 'QV_BOARD_INTERNAL');
  assert.equal(store.size(), size); assert.equal(log.size, size); assert.deepEqual(log.root(), before);
  assert.equal(store.findByNonce(keyFor(close)), undefined); assert.equal(store.getEntry(size), undefined);
  const lateBallot = append(mk('ballot'));
  assert.equal(lateBallot.seq, size, 'failed close did not commit the closed grammar state');
  const closed = append(close); assert.equal(closed.seq, size + 1);
  const afterClose = mk('ballot'), refused = log.append(afterClose.headerBytes, afterClose.body);
  assert.ok(!refused.ok && refused.error.code === 'QV_BOARD_GRAMMAR');
  const reference = new ReferenceMerkle(committed.map((entry) => entry.headerBytes));
  assert.equal(log.size, 8); assert.equal(store.size(), 8); assert.deepEqual(log.root(), reference.root());
  assert.equal(log.selfAudit(), true);
  const replay = logOver(store);
  assert.deepEqual(replay.status, { state: 'ok', reason: '' }); assert.deepEqual(replay.root(), reference.root());
  const again = replay.append(close.headerBytes, close.body);
  assert.ok(again.ok && again.value.duplicate); assert.equal(again.value.receipt.seq, closed.seq);
  assert.equal(replay.size, 8);
});
