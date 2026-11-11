import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as receiptMod from '../src/receipt.ts';
import {
  MerkleTree, MemoryBoardStore, bundleFromJson, bundleToJson, exportBundle, importBundle, parseCheckpoint, signCheckpoint, toHex, utf8,
  verifyLog, BoardLog, type LogBundle, type VerifyOptions,
} from '../src/index.ts';
import { LOG, NOW, ORG, ORIGIN, POLICY, W1, W2, cosign, fullElection, mk, resolveAuthorKey, register, kp } from './helpers.ts';

const vopts: VerifyOptions = { logPublicKey: LOG.publicKey, witnessPolicy: POLICY, resolveAuthorKey };

function makeBundle(nBallots = 3): { bundle: LogBundle; log: BoardLog; store: MemoryBoardStore } {
  const { log, store } = fullElection(nBallots);
  const receipts = [log.getReceipt(5)].flatMap((r) => (r.ok ? [r.value] : []));
  const bundle = exportBundle(store, { origin: ORIGIN, createdAt: NOW, generator: 'test', policy: { logPublicKey: LOG.publicKey, witnessPolicy: POLICY }, receipts });
  return { bundle, log, store };
}
const clone = (b: LogBundle): LogBundle => ({
  ...b, entries: b.entries.map((e) => ({ ...e })), checkpoints: [...b.checkpoints], receipts: [...b.receipts], redactions: [...b.redactions],
});
const rules = (b: LogBundle, o: VerifyOptions = vopts): string[] => verifyLog(b, o).failures.map((f) => f.rule);

test('honest bundle verifies, witnessed 2/2, manifest hash reported', () => {
  const { bundle } = makeBundle();
  const v = verifyLog(bundle, vopts);
  assert.deepEqual(v.failures, []);
  assert.equal(v.integrity, 'VERIFIED');
  assert.deepEqual(v.witnessed, { have: 2, k: 2, latest: true });
  assert.equal(v.treeSize, bundle.entries.length);
  assert.equal(v.manifestHash?.length, 64);
  assert.equal(verifyLog(bundle, { ...vopts, expectedManifestHash: Uint8Array.from(Buffer.from(v.manifestHash ?? '', 'hex')) }).integrity, 'VERIFIED');
  assert.ok(rules(bundle, { ...vopts, expectedManifestHash: new Uint8Array(32) }).includes('QV_BOARD_BAD_BUNDLE'));
});

test('without resolver or trusted keys: PARTIAL with warnings, never silently VERIFIED', () => {
  const { bundle } = makeBundle();
  const v = verifyLog(bundle);
  assert.equal(v.integrity, 'PARTIAL');
  assert.ok(v.warnings.some((w) => w.includes('NOT checked')));
  assert.ok(v.warnings.some((w) => w.includes('self-attested')));
});

test('JSON round trip via strict decoder preserves verification; malformed JSON rejected', () => {
  const { bundle } = makeBundle();
  const j = JSON.parse(JSON.stringify(bundleToJson(bundle)));
  const d = bundleFromJson(j);
  assert.ok(d.ok);
  if (d.ok) assert.equal(verifyLog(d.value, vopts).integrity, 'VERIFIED');
  assert.equal(bundleFromJson(null).ok, false);
  assert.equal(bundleFromJson({ ...j, format: 'x' }).ok, false);
  assert.equal(bundleFromJson({ ...j, entries: [{ seq: 0, header_b64u: '!!', body_b64u: null }] }).ok, false);
  assert.equal(bundleFromJson({ ...j, policy: {} }).ok, false);
  assert.equal(bundleFromJson({ ...j, checkpoints: [1] }).ok, false);
});

test('tamper: altered header, altered body, flipped bits anywhere', () => {
  const { bundle } = makeBundle();
  for (const seq of [0, 3, 6]) {
    const b = clone(bundle);
    const e = b.entries[seq]!;
    const h = e.headerBytes.slice();
    h[h.length - 3]! ^= 1;
    e.headerBytes = h;
    const v = verifyLog(b, vopts);
    assert.equal(v.integrity, 'FAILED');
    assert.ok(v.failures.some((f) => f.seq === seq), `failure names seq ${seq}`);
  }
  const b = clone(bundle);
  b.entries[6]!.body = utf8('forged ballot');
  const v = verifyLog(b, vopts);
  assert.equal(v.failures[0]?.seq, 6);
  assert.equal(v.failures[0]?.rule, 'QV_BOARD_BODY_DIGEST');
});

test('tamper: reorder, drop, insert, duplicate entries', () => {
  const { bundle } = makeBundle();
  const swap = clone(bundle);
  [swap.entries[5], swap.entries[6]] = [swap.entries[6]!, swap.entries[5]!];
  assert.equal(verifyLog(swap, vopts).integrity, 'FAILED');

  const swapRenumbered = clone(swap);
  swapRenumbered.entries.forEach((e, i) => (e.seq = i));
  const r = rules(swapRenumbered);
  assert.ok(r.includes('QV_BOARD_FORK') || r.includes('QV_BOARD_BAD_BUNDLE'), 'root no longer matches signed checkpoints');

  const drop = clone(bundle);
  drop.entries.splice(6, 1);
  drop.entries.forEach((e, i) => (e.seq = i));
  assert.equal(verifyLog(drop, vopts).integrity, 'FAILED');
  const dropNoRenumber = clone(bundle);
  dropNoRenumber.entries.splice(6, 1);
  assert.ok(rules(dropNoRenumber).includes('QV_BOARD_GRAMMAR'), 'gap detected');

  const dropLast = clone(bundle);
  dropLast.entries.pop();
  assert.equal(verifyLog(dropLast, vopts).integrity, 'FAILED', 'truncation vs signed checkpoint/bundle size');

  const dup = clone(bundle);
  dup.entries.splice(7, 0, { ...bundle.entries[6]! });
  dup.entries.forEach((e, i) => (e.seq = i));
  assert.equal(verifyLog(dup, vopts).integrity, 'FAILED');
});

test('tamper: a dropped ballot cannot be hidden even if bundle root is recomputed', () => {
  const { bundle } = makeBundle();
  const b = clone(bundle);
  b.entries.splice(5, 1);
  b.entries.forEach((e, i) => (e.seq = i));
  b.treeSize = b.entries.length;
  // attacker recomputes bundle.root using a log built from the reduced set
  const st = new MemoryBoardStore();
  assert.ok(importBundle(b, st, { ...vopts }).ok === false);
  const v = verifyLog(b, vopts);
  assert.ok(v.failures.some((f) => f.rule === 'QV_BOARD_FORK' || f.rule === 'QV_BOARD_BAD_CHECKPOINT'));
});

test('equivocation: two signed roots for the same size, and a forged checkpoint', () => {
  const { bundle } = makeBundle();
  const b = clone(bundle);
  const last = parseCheckpoint(bundle.checkpoints.at(-1)!);
  assert.ok(last.ok);
  if (!last.ok) return;
  b.checkpoints.push(signCheckpoint(ORIGIN, last.value.size, new Uint8Array(32).fill(7), LOG.secretKey, LOG.publicKey));
  assert.ok(rules(b).includes('QV_BOARD_FORK'));
  const b2 = clone(bundle);
  const evil = kp('evil-log');
  b2.checkpoints[0] = signCheckpoint(ORIGIN, 4, new Uint8Array(32), evil.secretKey, evil.publicKey);
  assert.ok(rules(b2).includes('QV_BOARD_BAD_CHECKPOINT'));
  const b3 = clone(bundle);
  b3.checkpoints = [signCheckpoint('quietvote/v1/zzzzzzzzzzzzzzzzzzzzzzzzzz', 3, new Uint8Array(32), LOG.secretKey, LOG.publicKey)];
  assert.ok(rules(b3).includes('QV_BOARD_ORIGIN_MISMATCH'));
});

test('missing final checkpoint (uncovered tail) fails', () => {
  const { bundle } = makeBundle();
  const b = clone(bundle);
  b.checkpoints.pop();
  assert.ok(rules(b).includes('QV_BOARD_BAD_CHECKPOINT'));
  const none = clone(bundle);
  none.checkpoints = [];
  assert.equal(verifyLog(none, vopts).integrity, 'FAILED');
});

test('cosignature checks: stripped cosigs break gating; forged cosigs are not counted', () => {
  const { bundle } = makeBundle();
  const strip = clone(bundle);
  strip.checkpoints = strip.checkpoints.map((n) => n.split('\n').filter((l) => !l.startsWith('— w')).join('\n'));
  const v = verifyLog(strip, vopts);
  assert.equal(v.integrity, 'FAILED');
  assert.ok(v.failures.some((f) => f.detail.includes('election_open')), 'open gate');
  assert.equal(v.witnessed.latest, false);

  const forged = clone(bundle);
  forged.checkpoints = forged.checkpoints.map((n) => {
    const base = n.split('\n').filter((l) => !l.startsWith('— w')).join('\n') + '\n';
    return base + cosign(base, kp('mallory'), 'w1') + cosign(base, kp('mallory2'), 'w2');
  });
  assert.equal(verifyLog(forged, vopts).integrity, 'FAILED');
});

test('witness quorum 0 requires explicit acknowledgement and is flagged NOT WITNESSED', () => {
  const { bundle } = makeBundle();
  const none = { ...POLICY, quorum: 0, noneAcknowledged: false };
  assert.ok(rules(bundle, { ...vopts, witnessPolicy: none }).includes('QV_BOARD_GRAMMAR'));
  const ack = verifyLog(bundle, { ...vopts, witnessPolicy: { ...none, noneAcknowledged: true } });
  assert.equal(ack.integrity, 'VERIFIED');
  assert.ok(ack.warnings.includes('NOT WITNESSED'));
});

test('waiver notice unblocks gating but is surfaced as a warning', () => {
  const { bundle } = makeBundle();
  const strip = clone(bundle);
  strip.checkpoints = strip.checkpoints.map((n) => n.split('\n').filter((l) => !l.startsWith('— w')).join('\n'));
  // Build a log with a notice before the open to act as waiver.
  const { log, store } = (() => {
    const s = new MemoryBoardStore();
    const l = new BoardLog({ origin: ORIGIN, store: s, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
    for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'notice', 'election_open', 'election_close', 'tally_aggregate', 'tally_result'] as const) {
      const e = mk(t);
      assert.ok(l.append(e.headerBytes, e.body).ok);
    }
    l.checkpoint();
    return { log: l, store: s };
  })();
  void log;
  const b = exportBundle(store, { origin: ORIGIN, createdAt: NOW, generator: 't', policy: { logPublicKey: LOG.publicKey, witnessPolicy: POLICY } });
  assert.equal(verifyLog(b, vopts).integrity, 'FAILED');
  const w = verifyLog(b, { ...vopts, isWitnessWaiver: (_e, h) => h.type === 'notice' });
  assert.equal(w.failures.length, 0);
  assert.ok(w.warnings.some((x) => x.includes('waived')));
});

test('grammar violations in the log itself are caught by the verifier even if the server accepted them', () => {
  const store = new MemoryBoardStore();
  const log = new BoardLog({ origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  const m = mk('manifest');
  log.append(m.headerBytes, m.body);
  // A patched server appends a ballot before open by writing straight to the store.
  const bad = mk('ballot');
  store.appendEntry({ seq: 1, headerBytes: bad.headerBytes, body: bad.body, leafHash: bad.leafHash, sequencedAt: NOW, nonceKey: 'x' });
  const t = new BoardLog({ origin: ORIGIN, store: new MemoryBoardStore(), secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  void t;
  // sign a checkpoint over the bad tree using the log key directly
  const tree = new MerkleTree();
  tree.appendLeafHash(m.leafHash);
  tree.appendLeafHash(bad.leafHash);
  store.putCheckpoint({ size: 2, root: tree.root(), note: signCheckpoint(ORIGIN, 2, tree.root(), LOG.secretKey, LOG.publicKey) });
  const b = exportBundle(store, { origin: ORIGIN, createdAt: NOW, generator: 't', policy: { logPublicKey: LOG.publicKey, witnessPolicy: { ...POLICY, quorum: 0, noneAcknowledged: true } } });
  const v = verifyLog(b, { ...vopts, witnessPolicy: { ...POLICY, quorum: 0, noneAcknowledged: true } });
  assert.equal(v.integrity, 'FAILED');
  assert.ok(v.failures.some((f) => f.seq === 1 && f.rule === 'QV_BOARD_GRAMMAR'));
});


test('unauthorized author (bad signature / unknown key) in the log is caught', () => {
  const { bundle } = makeBundle();
  const b = clone(bundle);
  const stranger = kp('stranger-2');
  register(ORG);
  const forged = mk('ballot', stranger);
  b.entries[6] = { seq: 6, headerBytes: forged.headerBytes, body: forged.body };
  const v = verifyLog(b, vopts);
  assert.ok(v.failures.some((f) => f.seq === 6 && f.rule === 'QV_BOARD_AUTHOR_UNRESOLVED'));
});

test('redaction: body removed, tree/checkpoints still valid, verdict PARTIAL; unrecorded redaction fails', () => {
  const { bundle } = makeBundle();
  const b = clone(bundle);
  b.entries[6] = { ...b.entries[6]!, body: null };
  assert.ok(rules(b).includes('QV_BOARD_BODY_DIGEST'), 'unrecorded');
  b.redactions = [{ seq: 6, redactedAt: NOW, reason: 'retention' }];
  const v = verifyLog(b, vopts);
  assert.deepEqual(v.failures, []);
  assert.equal(v.integrity, 'PARTIAL');
  assert.equal(v.redacted, 1);
});

test('pinned checkpoint: prefix accepted; fork and rollback detected', () => {
  const { bundle } = makeBundle();
  const mid = bundle.checkpoints[0]!;
  const ok1 = verifyLog(bundle, { ...vopts, pinned: mid });
  assert.deepEqual(ok1.failures, []);
  assert.ok(ok1.pinnedCheckpoint?.startsWith('4:'));
  const fork = signCheckpoint(ORIGIN, 4, new Uint8Array(32).fill(1), LOG.secretKey, LOG.publicKey);
  assert.ok(rules(bundle, { ...vopts, pinned: fork }).includes('QV_BOARD_FORK'));
  const ahead = signCheckpoint(ORIGIN, 500, new Uint8Array(32), LOG.secretKey, LOG.publicKey);
  assert.ok(rules(bundle, { ...vopts, pinned: ahead }).includes('QV_BOARD_ROLLBACK'));
  assert.ok(rules(bundle, { ...vopts, pinned: 'junk' }).includes('QV_BOARD_BAD_CHECKPOINT'));
});

test('receipts in bundle: valid ones pass; one the log did not honour is flagged', () => {
  const { bundle } = makeBundle();
  assert.equal(bundle.receipts.length, 1);
  assert.deepEqual(verifyLog(bundle, vopts).failures, []);
  const b = clone(bundle);
  const r = b.receipts[0]!;
  // validly signed promise for a leaf that is not in the log
  b.receipts.push(receiptMod.signPromise(LOG.secretKey, ORIGIN, 5, new Uint8Array(32).fill(3), NOW));
  assert.ok(verifyLog(b, vopts).failures.some((f) => f.seq === 5 && f.detail.includes('broken_promise')));
  b.receipts = [{ ...r, promiseSig: new Uint8Array(64) }];
  assert.ok(rules(b).includes('QV_BOARD_BAD_RECEIPT'));
});

test('import: verifies fully, yields read-only store; corrupted bundle rejected with failing seq', () => {
  const { bundle, log } = makeBundle();
  const target = new MemoryBoardStore();
  const res = importBundle(bundle, target, vopts);
  assert.ok(res.ok);
  assert.equal(target.isReadOnly(), true);
  assert.equal(target.size(), bundle.entries.length);
  const l2 = new BoardLog({ origin: ORIGIN, store: target, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  assert.equal(l2.status.state, 'ok');
  assert.equal(toHex(l2.root()), toHex(log.root()));
  const e = mk('notice');
  const ap = l2.append(e.headerBytes, e.body);
  assert.ok(!ap.ok && ap.error.code === 'QV_BOARD_READ_ONLY');

  const bad = clone(bundle);
  bad.entries[4]!.body = utf8('corrupt');
  const t2 = new MemoryBoardStore();
  const r2 = importBundle(bad, t2, vopts);
  assert.ok(!r2.ok && r2.error.message.startsWith('seq=4 '));
  assert.equal(t2.size(), 0, 'nothing exposed');
  assert.equal(importBundle(bundle, target, vopts).ok, false, 'target must be empty');
});

test('verifyLog is total on garbage bundles', () => {
  const { bundle } = makeBundle();
  const junk = [
    { ...bundle, entries: [{ seq: 0, headerBytes: new Uint8Array(0), body: null }] },
    { ...bundle, entries: [] },
    { ...bundle, checkpoints: ['\u0000', ''] },
    { ...bundle, format: 'nope' },
    { ...bundle, entries: null },
  ] as unknown as LogBundle[];
  for (const j of junk) assert.equal(verifyLog(j, vopts).integrity, 'FAILED');
  void [ORG, W1, W2];
});
