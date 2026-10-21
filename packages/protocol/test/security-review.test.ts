// Regression tests for the 2026-10-21 security review (docs/reports/security-review-2026-10-21.md), protocol package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, ed25519Keypair } from '@quietvote/crypto';
import { cosignLine, parseCheckpoint, signCheckpoint, witnessStatus } from '@quietvote/board';
import { witnessAnchors, type Manifest } from '../src/index.ts';

test('SR-5: caller witness anchors that repeat one key under two names are refused (one witness cannot count twice)', () => {
  const origin = 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa';
  const log = ed25519Keypair(new Uint8Array(32).fill(3));
  const w = ed25519Keypair(new Uint8Array(32).fill(4));
  const pk = bytesToHex(w.publicKey);
  const m = { bb: { witness_quorum: 2 } } as unknown as Manifest; // the manifest lists no witnesses: caller anchors apply (X-23)
  const res = witnessAnchors(m, [{ name: 'a', pk }, { name: 'b', pk }]);
  // Impact before the fix: one witness cosigning twice under two names met quorum 2.
  const note = signCheckpoint(origin, 5, new Uint8Array(32).fill(9), log.secretKey, log.publicKey);
  const text = note.slice(0, note.indexOf('\n\n') + 1);
  const two = note + cosignLine('a', w.secretKey, w.publicKey, text, 1_800_000_000) + cosignLine('b', w.secretKey, w.publicKey, text, 1_800_000_000);
  const cp = parseCheckpoint(two);
  assert.ok(cp.ok);
  const st = witnessStatus(cp.value, { witnesses: res.anchors, quorum: 2, noneAcknowledged: false });
  assert.equal(st.witnessed, false, 'a single witness key must not reach a quorum of 2');
  assert.deepEqual(res, { anchors: [], source: 'none' });
  // distinct keys are still accepted
  const w2 = ed25519Keypair(new Uint8Array(32).fill(5));
  const okRes = witnessAnchors(m, [{ name: 'a', pk }, { name: 'b', pk: bytesToHex(w2.publicKey) }]);
  assert.equal(okRes.source, 'caller');
  assert.equal(okRes.anchors.length, 2);
  // the same key in a different case spelling is the same key
  assert.deepEqual(witnessAnchors(m, [{ name: 'a', pk }, { name: 'b', pk: pk.toUpperCase() }]).anchors, []);
});
