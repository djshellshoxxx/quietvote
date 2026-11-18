// QV-ADR-027 B2-12 option A: keyless mirrors serve existing evidence and never sign.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoardLog, MemoryBoardStore, parseCheckpoint, verifyInclusion, verifyLogSignature } from '../src/index.ts';
import { LOG, NOW, ORIGIN, mk, newLog, resolveAuthorKey } from './helpers.ts';

test('keyless board rejects admission before writing any entry or checkpoint', () => {
  const store = new MemoryBoardStore();
  const log = new BoardLog({ origin: ORIGIN, store, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  const entry = mk('manifest');
  const result = log.append(entry.headerBytes, entry.body);
  assert.ok(!result.ok && result.error.code === 'QV_BOARD_READ_ONLY');
  assert.equal(log.size, 0);
  assert.equal(store.size(), 0);
  const checkpoint = log.checkpoint();
  assert.ok(!checkpoint.ok && checkpoint.error.code === 'QV_BOARD_READ_ONLY');
  assert.equal(store.latestCheckpoint(), undefined);
});

test('keyless board rejects duplicate and direct receipts while preserving stored proofs', () => {
  const { log: signer, store } = newLog();
  const entry = mk('manifest');
  assert.ok(signer.append(entry.headerBytes, entry.body).ok);
  const checkpoint = signer.checkpoint();
  assert.ok(checkpoint.ok);
  const log = new BoardLog({ origin: ORIGIN, store, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  const duplicate = log.append(entry.headerBytes, entry.body);
  assert.ok(!duplicate.ok && duplicate.error.code === 'QV_BOARD_READ_ONLY');
  const receipt = log.getReceipt(0);
  assert.ok(!receipt.ok && receipt.error.code === 'QV_BOARD_READ_ONLY');
  const freshCheckpoint = log.checkpoint();
  assert.ok(!freshCheckpoint.ok && freshCheckpoint.error.code === 'QV_BOARD_READ_ONLY');
  const stored = store.latestCheckpoint();
  assert.equal(stored?.note, checkpoint.value);
  const parsed = parseCheckpoint(stored!.note);
  assert.ok(parsed.ok && verifyLogSignature(parsed.value, LOG.publicKey));
  const proof = log.inclusionProof(0);
  assert.ok(proof.ok && verifyInclusion(store.getEntry(0)!.leafHash, 0, 1, proof.value, log.root()));
  assert.equal(log.selfAudit(), true);
  assert.equal(log.size, 1);
  assert.equal(store.size(), 1);
});
