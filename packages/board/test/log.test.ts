import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ed25519Keypair } from '@quietvote/crypto';
import {
  BoardLog, MemoryBoardStore, authorKeyId, buildEntry, checkBrokenPromise, checkFork, checkInconsistent, decodeHeader,
  encodeHeader, parseCheckpoint, receiptFromJson, receiptToJson, signCheckpoint, toHex, utf8, verifyConsistency,
  verifyInclusion, verifyLogSignature, verifyPinAdvance, verifyReceipt, witnessStatus, hashLeaf, grammarStep, newGrammar,
} from '../src/index.ts';
import { LOG, NOW, ORG, ORIGIN, POLICY, W1, W2, W3, cosign, kp, mk, newLog, register, resolveAuthorKey, seedBytes } from './helpers.ts';

function add(log: BoardLog, t: Parameters<typeof mk>[0], who = ORG) {
  const e = mk(t, who);
  const r = log.append(e.headerBytes, e.body);
  return { e, r };
}
const prelude = (log: BoardLog): void => {
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open'] as const) {
    assert.ok(add(log, t).r.ok, t);
  }
};

test('header encoding round-trips and is canonical', () => {
  const e = mk('manifest');
  const d = decodeHeader(e.headerBytes);
  assert.ok(d.ok);
  assert.deepEqual(encodeHeader(d.ok ? d.value : e.header), e.headerBytes);
  assert.equal(decodeHeader(new Uint8Array([...e.headerBytes, 0])).ok, false, 'trailing byte');
  for (let i = 0; i < e.headerBytes.length; i += 7) assert.equal(decodeHeader(e.headerBytes.slice(0, i)).ok, false, `truncated ${i}`);
  assert.equal(decodeHeader(new Uint8Array(5000)).ok, false, 'oversize');
});

test('sequence numbers are gapless; manifest only at seq 0; phases enforced', () => {
  const { log } = newLog();
  assert.equal(add(log, 'ceremony_start').r.ok, false, 'first entry must be manifest');
  const m = add(log, 'manifest');
  assert.ok(m.r.ok && m.r.value.receipt.seq === 0);
  const m2 = add(log, 'manifest');
  assert.ok(!m2.r.ok && m2.r.error.code === 'QV_BOARD_GRAMMAR');
  assert.equal(add(log, 'ballot').r.ok, false, 'ballot before open');
  assert.equal(add(log, 'election_open').r.ok, false, 'open before ceremony');
  prelude(newLog().log);
  const { log: l2 } = newLog();
  prelude(l2);
  const seqs = [add(l2, 'ballot'), add(l2, 'ballot'), add(l2, 'ballot')].map((x) => (x.r.ok ? x.r.value.receipt.seq : -1));
  assert.deepEqual(seqs, [5, 6, 7]);
  assert.ok(add(l2, 'election_close').r.ok);
  assert.equal(add(l2, 'ballot').r.ok, false, 'ballot after close');
  assert.equal(add(l2, 'election_close').r.ok, false, 'second close');
  assert.equal(l2.size, 9);
});

test('terminal entries end the log', () => {
  const { log } = newLog();
  add(log, 'manifest');
  assert.ok(add(log, 'election_cancel').r.ok);
  assert.equal(add(log, 'notice').r.ok, false);
  const g = newGrammar();
  assert.equal(grammarStep(g, 'manifest'), undefined);
  assert.notEqual(grammarStep(g, 'tally_result'), undefined);
});

test('admission rejects bad origin, signature, unknown author, body tampering, clock skew', () => {
  const { log } = newLog();
  const good = mk('manifest');
  const code = (r: ReturnType<BoardLog['append']>): string => (r.ok ? 'OK' : r.error.code);
  const other = buildEntry({ origin: 'quietvote/v1/zzzzzzzzzzzzzzzzzzzzzzzzzz', type: 'manifest', secretKey: ORG.secretKey, publicKey: ORG.publicKey, nonce: new Uint8Array(16), createdAt: NOW, body: utf8('x') });
  assert.equal(code(log.append(other.headerBytes, other.body)), 'QV_BOARD_ORIGIN_MISMATCH');
  assert.equal(code(log.append(good.headerBytes, utf8('different body'))), 'QV_BOARD_BODY_DIGEST');
  const stranger = kp('stranger');
  const s = mk('manifest', stranger);
  assert.equal(code(log.append(s.headerBytes, s.body)), 'QV_BOARD_AUTHOR_UNRESOLVED');
  const flipped = good.headerBytes.slice();
  flipped[flipped.length - 1]! ^= 1;
  assert.equal(code(log.append(flipped, good.body)), 'QV_BOARD_BAD_SIGNATURE');
  const old = buildEntry({ origin: ORIGIN, type: 'manifest', secretKey: ORG.secretKey, publicKey: ORG.publicKey, nonce: new Uint8Array(16).fill(9), createdAt: NOW - 90000, body: utf8('x') });
  assert.equal(code(log.append(old.headerBytes, old.body)), 'QV_BOARD_CLOCK_SKEW');
  assert.equal(code(log.append(utf8('garbage'), new Uint8Array(0))), 'QV_BOARD_MALFORMED');
  assert.equal(log.size, 0, 'rejected entries leave no trace');
  assert.equal(code(log.append(good.headerBytes, good.body)), 'OK');
});

test('fails closed without a resolver', () => {
  const log = new BoardLog({ origin: ORIGIN, store: new MemoryBoardStore(), secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW });
  const e = mk('manifest');
  const r = log.append(e.headerBytes, e.body);
  assert.ok(!r.ok && r.error.code === 'QV_BOARD_AUTHOR_UNRESOLVED');
});

test('idempotent resubmission returns same receipt; nonce reuse with different bytes is a conflict', () => {
  const { log } = newLog();
  const { e, r } = add(log, 'manifest');
  assert.ok(r.ok);
  const again = log.append(e.headerBytes, e.body);
  assert.ok(again.ok && again.value.duplicate);
  assert.deepEqual(again.ok && again.value.receipt.promiseSig, r.ok && r.value.receipt.promiseSig);
  assert.equal(log.size, 1);
  // same (author,type,nonce) but different body
  const evil = buildEntry({ origin: ORIGIN, type: 'manifest', secretKey: ORG.secretKey, publicKey: ORG.publicKey, nonce: e.header.authorNonce, createdAt: NOW, body: utf8('other') });
  const c = log.append(evil.headerBytes, evil.body);
  assert.ok(!c.ok && c.error.code === 'QV_BOARD_NONCE_REUSE');
});

test('checkpoints: signed-note format, strict parsing, log signature', () => {
  const { log } = newLog();
  prelude(log);
  const note = log.checkpoint();
  assert.ok(note.ok);
  const n = note.ok ? note.value : '';
  assert.match(n, new RegExp(`^${ORIGIN}\\n5\\n[A-Za-z0-9+/]{43}=\\n\\n— ${ORIGIN} [A-Za-z0-9+/=]+\\n$`));
  const p = parseCheckpoint(n);
  assert.ok(p.ok && p.value.size === 5 && verifyLogSignature(p.value, LOG.publicKey));
  assert.ok(p.ok && !verifyLogSignature(p.value, W1.publicKey));
  // idempotent for same size
  assert.deepEqual(log.checkpoint(), note);
  // strictness
  assert.equal(parseCheckpoint(n.replace('\n5\n', '\n05\n')).ok, false, 'leading zero size');
  assert.equal(parseCheckpoint(n.replace('\n\n', '\nextension\n\n')).ok, false, 'extension line');
  assert.equal(parseCheckpoint(n.slice(0, -1)).ok, false, 'no trailing newline');
  assert.equal(parseCheckpoint(n.split('\n\n')[0] + '\n\n').ok, false, 'no signatures');
  assert.equal(parseCheckpoint(n.replace('— ', '- ')).ok, false, 'ascii dash');
  // tampering with size/root invalidates signature
  const t = parseCheckpoint(n.replace('\n5\n', '\n6\n'));
  assert.ok(t.ok && !verifyLogSignature(t.value, LOG.publicKey));
});

test('inclusion & consistency proofs served by the log verify against checkpoints', () => {
  const { log } = newLog();
  prelude(log);
  for (let i = 0; i < 20; i++) add(log, 'ballot');
  const c1 = log.checkpoint();
  const old = c1.ok ? parseCheckpoint(c1.value) : undefined;
  for (let i = 0; i < 17; i++) add(log, 'ballot');
  const c2 = log.checkpoint();
  const nw = c2.ok ? parseCheckpoint(c2.value) : undefined;
  assert.ok(old?.ok && nw?.ok);
  if (!old?.ok || !nw?.ok) return;
  const cons = log.consistencyProof(old.value.size, nw.value.size);
  assert.ok(cons.ok && verifyConsistency(old.value.size, nw.value.size, old.value.root, nw.value.root, cons.ok ? cons.value : []));
  assert.ok(c1.ok && c2.ok && verifyPinAdvance(c1.value, c2.value, cons.ok ? cons.value : [], LOG.publicKey).ok);
  for (const seq of [0, 7, 24, 41]) {
    const p = log.inclusionProof(seq);
    const e = log.getReceipt(seq);
    assert.ok(p.ok && e.ok);
    if (p.ok && e.ok) assert.ok(verifyInclusion(e.value.leafHash, seq, nw.value.size, p.value, nw.value.root));
  }
  assert.equal(log.inclusionProof(42).ok, false);
  assert.equal(log.consistencyProof(5, 100).ok, false);
  const byLeaf = log.getReceipt(9);
  assert.ok(byLeaf.ok);
  const found = byLeaf.ok ? log.inclusionProofByLeaf(byLeaf.value.leafHash) : byLeaf;
  assert.ok(found.ok && found.value.seq === 9);
});

test('pin advance detects equivocation, rollback and bad signature', () => {
  const { log } = newLog();
  prelude(log);
  const a = log.checkpoint();
  add(log, 'ballot');
  const b = log.checkpoint();
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  const proof = log.consistencyProof(5, 6);
  assert.ok(proof.ok);
  const pr = proof.ok ? proof.value : [];
  assert.deepEqual(verifyPinAdvance(a.value, b.value, pr, LOG.publicKey), { ok: true, value: 'advanced' });
  assert.deepEqual(verifyPinAdvance(a.value, a.value, [], LOG.publicKey), { ok: true, value: 'unchanged' });
  const rb = verifyPinAdvance(b.value, a.value, pr, LOG.publicKey);
  assert.ok(!rb.ok && rb.error.code === 'QV_BOARD_ROLLBACK');
  // forked history: same prefix size, different root, validly signed by (malicious) log key
  const other = new MemoryBoardStore();
  const forked = new BoardLog({ origin: ORIGIN, store: other, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'ballot'] as const) add(forked, t);
  const fb = forked.checkpoint();
  assert.ok(fb.ok);
  if (!fb.ok) return;
  const fp = forked.consistencyProof(5, 6);
  const adv = verifyPinAdvance(a.value, fb.value, fp.ok ? fp.value : [], LOG.publicKey);
  assert.ok(!adv.ok && adv.error.code === 'QV_BOARD_FORK', 'forked history fails consistency');
  // fork evidence: two signed notes, same size, different roots
  assert.ok(checkFork(b.value, fb.value, LOG.publicKey).ok);
  assert.equal(checkFork(b.value, b.value, LOG.publicKey).ok, false);
  assert.equal(checkFork(b.value, fb.value, W1.publicKey).ok, false, 'wrong key');
  // inconsistent evidence
  assert.ok(checkInconsistent(a.value, fb.value, fp.ok ? fp.value : [], LOG.publicKey).ok);
  assert.equal(checkInconsistent(a.value, b.value, pr, LOG.publicKey).ok, false, 'honest proof is not evidence');
  // note signed by someone else
  const evil = ed25519Keypair(seedBytes('evil'));
  const bogus = signCheckpoint(ORIGIN, 9, new Uint8Array(32), evil.secretKey, evil.publicKey);
  assert.equal(verifyPinAdvance(a.value, bogus, [], LOG.publicKey).ok, false);
});

test('receipts: promise, inclusion, JSON round trip, tamper and broken-promise evidence', () => {
  const { log } = newLog();
  prelude(log);
  const { r } = add(log, 'ballot');
  assert.ok(r.ok);
  if (!r.ok) return;
  const pending = r.value.receipt;
  assert.equal(pending.checkpointDeadline, pending.sequencedAt + 30);
  assert.equal(pending.inclusion, undefined);
  assert.ok(verifyReceipt(pending, LOG.publicKey).ok);
  log.checkpoint();
  const full = log.getReceipt(pending.seq);
  assert.ok(full.ok && full.value.inclusion);
  if (!full.ok) return;
  const v = verifyReceipt(full.value, LOG.publicKey);
  assert.ok(v.ok && v.value.treeSize === 6);
  const rt = receiptFromJson(JSON.parse(JSON.stringify(receiptToJson(full.value))));
  assert.ok(rt.ok && verifyReceipt(rt.value, LOG.publicKey).ok);
  assert.equal(verifyReceipt(full.value, W1.publicKey).ok, false, 'wrong key');
  assert.equal(verifyReceipt({ ...full.value, seq: 4 }, LOG.publicKey).ok, false, 'seq tamper');
  assert.equal(verifyReceipt({ ...full.value, sequencedAt: 1 }, LOG.publicKey).ok, false, 'time tamper');
  const bad = { ...full.value, inclusion: { ...(full.value.inclusion as NonNullable<typeof full.value.inclusion>), path: [] } };
  assert.equal(verifyReceipt(bad, LOG.publicKey).ok, false, 'path tamper');
  assert.equal(receiptFromJson({ origin: 1 }).ok, false);
  assert.equal(receiptFromJson(null).ok, false);

  // broken promise: a log that signed a receipt for leaf L, later shows a different leaf at that seq.
  const evilStore = new MemoryBoardStore();
  const evilLog = new BoardLog({ origin: ORIGIN, store: evilStore, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'ballot'] as const) add(evilLog, t);
  const note = evilLog.checkpoint();
  const other = evilLog.getReceipt(5);
  const proof = evilLog.inclusionProof(5);
  assert.ok(note.ok && other.ok && proof.ok);
  if (!note.ok || !other.ok || !proof.ok) return;
  assert.ok(checkBrokenPromise(pending, note.value, other.value.leafHash, proof.value, LOG.publicKey).ok);
  assert.equal(checkBrokenPromise(pending, note.value, pending.leafHash, proof.value, LOG.publicKey).ok, false);
});

test('witness cosignatures: quorum, distinctness, forgery, wrong key, non-policy, unsupported alg', () => {
  const { log } = newLog();
  prelude(log);
  const note = log.checkpoint();
  assert.ok(note.ok);
  if (!note.ok) return;
  const size = log.size;
  const c1 = cosign(note.value, W1, 'w1');
  const r1 = log.attachCosignatures(size, [c1], POLICY);
  assert.ok(r1.ok && !r1.value.witnessed, '1 of 2');
  const dup = log.attachCosignatures(size, [c1], POLICY);
  assert.ok(dup.ok && !dup.value.witnessed, 'same witness twice does not count twice');
  const forged = cosign(note.value, W3, 'w2'); // w3 key claiming to be w2
  const r2 = log.attachCosignatures(size, [forged], POLICY);
  assert.ok(r2.ok && !r2.value.witnessed, 'forged cosig ignored');
  const stranger = cosign(note.value, kp('nobody'), 'nobody');
  assert.ok(log.attachCosignatures(size, [stranger], POLICY).ok);
  const r3 = log.attachCosignatures(size, [cosign(note.value, W2, 'w2')], POLICY);
  assert.ok(r3.ok && r3.value.witnessed, '2 of 2');
  const p = parseCheckpoint(r3.ok ? r3.value.note : '');
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.ok(verifyLogSignature(p.value, LOG.publicKey), 'log sig still valid with cosig lines');
  const st = witnessStatus(p.value, POLICY);
  assert.deepEqual([...st.valid.keys()].sort(), ['w1', 'w2']);
  assert.equal(st.nonPolicy.length, 0, 'invalid/non-policy lines were not attached');
  // cosig for another checkpoint text does not verify here
  const other = signCheckpoint(ORIGIN, 99, new Uint8Array(32), LOG.secretKey, LOG.publicKey);
  const replay = parseCheckpoint(note.value + cosign(other, W3, 'w3'));
  assert.ok(replay.ok && witnessStatus(replay.value, POLICY).valid.size === 0, 'cosig replay across checkpoints');
  // future-dated cosig rejected when maxTimestamp given
  const future = parseCheckpoint(note.value + cosign(note.value, W3, 'w3', NOW + 1000));
  assert.ok(future.ok && witnessStatus(future.value, POLICY, NOW + 300).valid.size === 0);
  assert.ok(future.ok && witnessStatus(future.value, POLICY).valid.size === 1);
  // mldsa44 witnesses are recognised but never counted
  const ml = { ...POLICY, witnesses: [{ name: 'w1', alg: 'mldsa44' as const, publicKey: W1.publicKey }], quorum: 1 };
  const withC1 = parseCheckpoint(note.value + c1);
  assert.ok(withC1.ok && !witnessStatus(withC1.value, ml).witnessed && witnessStatus(withC1.value, ml).unsupported.length === 1);
  // quorum 0 is never "witnessed"
  assert.ok(withC1.ok && !witnessStatus(withC1.value, { ...POLICY, quorum: 0 }).witnessed);
});

test('rollback guard: restored older DB / ahead witness => quarantine, no signing, no appends', () => {
  const { log, store } = newLog();
  prelude(log);
  const old = log.checkpoint();
  for (let i = 0; i < 5; i++) add(log, 'ballot');
  const fresh = log.checkpoint();
  assert.ok(old.ok && fresh.ok);
  if (!old.ok || !fresh.ok) return;
  // Simulate restoring an old backup: a store holding the new checkpoint but fewer entries.
  const restored = new MemoryBoardStore();
  for (let i = 0; i < 5; i++) restored.appendEntry(store.getEntry(i)!);
  const sc = parseCheckpoint(fresh.value);
  assert.ok(sc.ok);
  restored.putCheckpoint({ size: 10, root: sc.ok ? sc.value.root : new Uint8Array(32), note: fresh.value });
  const l2 = new BoardLog({ origin: ORIGIN, store: restored, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  assert.equal(l2.status.state, 'quarantine');
  assert.equal(l2.checkpoint().ok, false);
  const e = mk('ballot');
  const r = l2.append(e.headerBytes, e.body);
  assert.ok(!r.ok && r.error.code === 'QV_BOARD_QUARANTINE');
  // Live log learns of a larger external checkpoint (witness 409 equivalent).
  const l3 = newLog();
  prelude(l3.log);
  assert.deepEqual(l3.log.observeExternalCheckpoint(old.value), { ok: true, value: 'quarantined' }, 'checkpoint of a different history at the same size => quarantine');
});

test('observeExternalCheckpoint: consistent, ahead and forked', () => {
  const { log } = newLog();
  prelude(log);
  const cp5 = log.checkpoint();
  add(log, 'ballot');
  add(log, 'ballot');
  const cp7 = log.checkpoint();
  assert.ok(cp5.ok && cp7.ok);
  if (!cp5.ok || !cp7.ok) return;
  assert.deepEqual(log.observeExternalCheckpoint(cp5.value), { ok: true, value: 'consistent' });
  assert.equal(log.status.state, 'ok');
  const other = newLog();
  prelude(other.log);
  add(other.log, 'ballot');
  add(other.log, 'ballot');
  add(other.log, 'ballot');
  const ahead = other.log.checkpoint();
  assert.ok(ahead.ok);
  assert.deepEqual(log.observeExternalCheckpoint(ahead.ok ? ahead.value : ''), { ok: true, value: 'quarantined' });
  assert.equal(log.status.state, 'quarantine');
  assert.equal(log.checkpoint().ok, false);
  const nonsense = signCheckpoint(ORIGIN, 1, new Uint8Array(32), W1.secretKey, W1.publicKey);
  assert.equal(log.observeExternalCheckpoint(nonsense).ok, false, 'not signed by log key: ignored');
});

test('self-audit detects store corruption', () => {
  const { log, store } = newLog();
  prelude(log);
  log.checkpoint();
  assert.ok(log.selfAudit());
  const e = store.getEntry(2)!;
  // corrupt the stored leaf hash behind the log's back
  const leaves = store.leafHashes(0, 5);
  void leaves;
  (store as unknown as { entries: { leafHash: Uint8Array }[] }).entries[2]!.leafHash = hashLeaf(utf8('x'));
  void e;
  assert.equal(log.selfAudit(), false);
  assert.equal(log.status.state, 'quarantine');
});

test('redaction leaves tree and proofs untouched', () => {
  const { log, store } = newLog();
  prelude(log);
  assert.ok(add(log, 'ballot').r.ok);
  const before = toHex(log.root());
  assert.ok(log.redact(5).ok);
  assert.equal(store.getEntry(5)?.body, null);
  assert.equal(toHex(log.root()), before);
  assert.equal(log.redact(99).ok, false);
});

test('read-only store (imported log) refuses appends and checkpoints', () => {
  const { log, store } = newLog();
  prelude(log);
  store.setReadOnly(true);
  const e = mk('ballot');
  const r = log.append(e.headerBytes, e.body);
  assert.ok(!r.ok && r.error.code === 'QV_BOARD_READ_ONLY');
  assert.equal(log.checkpoint().ok, false);
});

test('a log restarted from the same store continues identically', () => {
  const { log, store } = newLog();
  prelude(log);
  log.checkpoint();
  const l2 = new BoardLog({ origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  assert.equal(l2.status.state, 'ok');
  assert.equal(toHex(l2.root()), toHex(log.root()));
  assert.ok(add(l2, 'ballot').r.ok);
  assert.equal(add(l2, 'manifest').r.ok, false, 'grammar state restored');
});

test('registering a voter key authorises ballots by that voter only', () => {
  const { log } = newLog();
  prelude(log);
  const voter = kp('voter-1');
  assert.equal(add(log, 'ballot', voter).r.ok, false, 'unknown voter');
  register(voter);
  assert.ok(add(log, 'ballot', voter).r.ok);
  void authorKeyId; void resolveAuthorKey;
});

// QV-ADR-015 / QV-16 §5.15: static-roll manifests need no roll_commit; tally_aggregate is optional (recomputed).
test('grammar: static-roll manifest waives roll_commit only when manifest carries roll.root', () => {
  const run = (manifestBody: string, types: Parameters<typeof mk>[0][]): string[] => {
    const { log } = newLog();
    const out: string[] = [];
    types.forEach((t, i) => {
      const e = mk(t, ORG, i === 0 ? manifestBody : undefined);
      const r = log.append(e.headerBytes, e.body);
      out.push(r.ok ? 'ok' : r.error.code);
    });
    return out;
  };
  const seq = ['manifest', 'ceremony_start', 'joint_key', 'election_open'] as const;
  assert.equal(run('{"roll":{"root":"ab"}}', [...seq]).at(-1), 'ok', 'static roll: open without roll_commit');
  for (const body of ['{"roll":{"scheme":"x"}}', 'not json', '{"roll":{"root":5}}']) {
    assert.equal(run(body, [...seq]).at(-1), 'QV_BOARD_GRAMMAR', `roll_commit still required: ${body}`);
  }
  assert.equal(run('{"roll":{"root":"ab"}}', ['manifest', 'ceremony_start', 'election_open']).at(-1), 'QV_BOARD_GRAMMAR', 'joint_key still required');
});

test('grammar: tally_result needs election_close, not tally_aggregate; late aggregate refused', () => {
  const { log } = newLog();
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open'] as const) assert.ok(add(log, t).r.ok);
  assert.equal(add(log, 'tally_result').r.ok, false, 'result before close');
  assert.ok(add(log, 'election_close').r.ok);
  assert.ok(add(log, 'decryption_share').r.ok, 'share without aggregate entry');
  assert.ok(add(log, 'tally_result').r.ok, 'result without aggregate entry');
  const late = add(log, 'tally_aggregate').r;
  assert.ok(!late.ok && late.error.code === 'QV_BOARD_GRAMMAR', 'aggregate after result');
});
