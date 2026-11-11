// Regression tests for audit findings F1-F14 (see NOTES.md items 14+).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BoardLog, ENTRY_TYPES, MemoryBoardStore, checkBrokenPromise, checkFork, checkInconsistent, exportBundle, grammarStep,
  importBundle, newGrammar, parseCheckpoint, signCheckpoint, signPromise, utf8, verifyConsistency, witnessStatus,
  type BoardStore, type EntryType, type GrammarState, type StoredEntry,
} from '../src/index.ts';
import { isPow2 } from '../src/merkle.ts';
import { LOG, NOW, ORG, ORIGIN, POLICY, W1, W2, W3, cosign, fullElection, kp, mk, newLog, resolveAuthorKey } from './helpers.ts';

function add(log: BoardLog, t: EntryType, body?: string) {
  const e = mk(t, ORG, body);
  return log.append(e.headerBytes, e.body);
}
const prelude = (log: BoardLog, manifestBody?: string): void => {
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open'] as const) {
    const r = add(log, t, t === 'manifest' ? manifestBody : undefined);
    assert.ok(r.ok, t);
  }
};
const code = (r: { ok: boolean; error?: { code: string } }): string => (r.ok ? 'ok' : (r.error?.code ?? '?'));
const logOver = (store: BoardStore): BoardLog =>
  new BoardLog({ origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });

// ---- F1 ----
test('F1 importBundle requires trusted log key, witness policy, author resolver, and VERIFIED unless allowPartial', () => {
  const { store } = fullElection(2);
  const bundle = exportBundle(store, { origin: ORIGIN, createdAt: NOW, generator: 't', policy: { logPublicKey: LOG.publicKey, witnessPolicy: POLICY } });
  const full = { logPublicKey: LOG.publicKey, witnessPolicy: POLICY, resolveAuthorKey };
  const tryImport = (o: object) => importBundle(bundle, new MemoryBoardStore(), o);
  assert.equal(tryImport({}).ok, false, 'self-attested only');
  assert.equal(tryImport({ witnessPolicy: POLICY, resolveAuthorKey }).ok, false, 'no trusted log key');
  assert.equal(tryImport({ logPublicKey: LOG.publicKey, resolveAuthorKey }).ok, false, 'no witness policy');
  assert.equal(tryImport({ logPublicKey: LOG.publicKey, witnessPolicy: POLICY }).ok, false, 'no resolver');
  assert.ok(tryImport(full).ok);
  // redacted bundle is PARTIAL: refused unless explicit allowPartial
  const red = { ...bundle, entries: bundle.entries.map((e) => ({ ...e })), redactions: [{ seq: 5, redactedAt: NOW, reason: 'r' }] };
  red.entries[5]!.body = null;
  assert.equal(importBundle(red, new MemoryBoardStore(), full).ok, false);
  assert.ok(importBundle(red, new MemoryBoardStore(), { ...full, allowPartial: true }).ok);
  // allowPartial does not waive the trust anchors
  assert.equal(importBundle(red, new MemoryBoardStore(), { allowPartial: true }).ok, false);
});

// ---- F2 ----
const PHASES = ['SETUP', 'CEREMONY', 'KEYED', 'READY', 'OPEN', 'CLOSED', 'TALLIED', 'AUDIT'] as const;
const PATH: Record<(typeof PHASES)[number], EntryType[]> = {
  SETUP: ['manifest'],
  CEREMONY: ['manifest', 'ceremony_start'],
  KEYED: ['manifest', 'ceremony_start', 'joint_key'],
  READY: ['manifest', 'ceremony_start', 'joint_key', 'roll_commit'],
  OPEN: ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open'],
  CLOSED: ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close'],
  TALLIED: ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close', 'tally_result'],
  AUDIT: ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'election_close', 'tally_result', 'audit_close'],
};
const stateAt = (p: (typeof PHASES)[number]): GrammarState => {
  const g = newGrammar();
  for (const t of PATH[p]) assert.equal(grammarStep(g, t), undefined, `${p}:${t}`);
  return g;
};
// Phases (docs/18 §5.2/§5.4) in which a type is allowed *for phase reasons only* (prerequisites are covered elsewhere).
const BEFORE_OPEN = ['SETUP', 'CEREMONY', 'KEYED', 'READY'];
const phaseRule: Partial<Record<EntryType, readonly string[]>> = {
  trustee_accept: BEFORE_OPEN, trustee_decline: BEFORE_OPEN,
  dkg_round1: BEFORE_OPEN, dkg_round2: BEFORE_OPEN, dkg_complaint: BEFORE_OPEN, dkg_justification: BEFORE_OPEN,
  key_confirm: BEFORE_OPEN, keycheck: BEFORE_OPEN,
  ceremony_abort: ['CEREMONY'],
  election_cancel: ['SETUP', 'CEREMONY', 'KEYED', 'READY', 'OPEN'],
};
test('F2 phase gating table (type x phase)', () => {
  for (const [type, allowed] of Object.entries(phaseRule) as [EntryType, readonly string[]][]) {
    for (const p of PHASES) {
      const g = stateAt(p);
      const needsCeremony = type.startsWith('dkg_') || type === 'key_confirm'; // NEEDS ceremony_start
      const r = grammarStep(g, type);
      // types that also need ceremony_start fail in SETUP for that reason; only assert the phase-driven outcomes
      if (needsCeremony && p === 'SETUP') { assert.notEqual(r, undefined, `${type}@${p}`); continue; }
      assert.equal(r === undefined, allowed.includes(p), `${type}@${p}: ${r ?? 'accepted'}`);
    }
  }
  // types without phase restrictions are unaffected by this rule
  for (const t of ['notice', 'anchor', 'trustee_compromise_report'] as const) {
    for (const p of PHASES) assert.equal(grammarStep(stateAt(p), t), undefined, `${t}@${p}`);
  }
  assert.ok(ENTRY_TYPES.length > 0);
});
test('F2 via BoardLog: dkg after open, cancel after close, abort after open are refused', () => {
  const { log } = newLog();
  prelude(log);
  assert.equal(code(add(log, 'dkg_round1')), 'QV_BOARD_GRAMMAR');
  assert.equal(code(add(log, 'key_confirm')), 'QV_BOARD_GRAMMAR');
  assert.equal(code(add(log, 'ceremony_abort')), 'QV_BOARD_GRAMMAR');
  assert.ok(add(log, 'election_close').ok);
  assert.equal(code(add(log, 'election_cancel')), 'QV_BOARD_GRAMMAR');
});

// ---- F3 / F4 ----
test('F3 redact only ballot, ballot_audit, dkg_* bodies; staticRoll persisted at append time', () => {
  const { log, store } = newLog();
  prelude(log, '{"roll":{"root":"ab"}}');
  for (const seq of [0, 1, 2, 3, 4]) {
    const r = log.redact(seq);
    assert.ok(!r.ok && r.error.code === 'QV_BOARD_GRAMMAR', `seq ${seq}`);
  }
  assert.notEqual(store.getEntry(0)?.body, null);
  assert.ok(add(log, 'ballot').ok);
  assert.ok(log.redact(5).ok);
  assert.equal(store.getEntry(5)?.body, null);
  assert.equal(logOver(store).status.state, 'ok');

  // staticRoll survives a null manifest body (e.g. imported/other store): not re-derived from the body.
  const s2 = new MemoryBoardStore();
  const l2 = logOver(s2);
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'election_open'] as const) {
    assert.ok(add(l2, t, t === 'manifest' ? '{"roll":{"root":"ab"}}' : undefined).ok, t);
  }
  s2.redactBody(0);
  assert.equal(logOver(s2).status.state, 'ok');
});
test('F4 redact refuses on read-only and quarantined logs', () => {
  const { log, store } = newLog();
  prelude(log);
  add(log, 'ballot');
  store.setReadOnly(true);
  let r = log.redact(5);
  assert.ok(!r.ok && r.error.code === 'QV_BOARD_READ_ONLY');
  assert.notEqual(store.getEntry(5)?.body, null);
  store.setReadOnly(false);
  log.observeExternalCheckpoint(signCheckpoint(ORIGIN, 99, new Uint8Array(32), LOG.secretKey, LOG.publicKey));
  assert.equal(log.status.state, 'quarantine');
  r = log.redact(5);
  assert.ok(!r.ok && r.error.code === 'QV_BOARD_QUARANTINE');
  assert.notEqual(store.getEntry(5)?.body, null);
});

// ---- F5 ----
test('F5 load path and selfAudit recompute leaf hashes and body digests; store returns copies', () => {
  const mem = (s: MemoryBoardStore) => (s as unknown as { entries: StoredEntry[] }).entries;
  const build = (): MemoryBoardStore => { const { log, store } = newLog(); prelude(log); add(log, 'ballot'); void log; return store; };
  let s = build();
  mem(s)[2]!.leafHash = new Uint8Array(32).fill(7);
  assert.equal(logOver(s).status.state, 'quarantine', 'stored leaf hash forged');
  s = build();
  mem(s)[5]!.body = utf8('swapped');
  const l = logOver(s);
  assert.equal(l.status.state, 'quarantine', 'stored body does not match header digest');
  s = build();
  const l3 = logOver(s);
  assert.equal(l3.selfAudit(), true);
  mem(s)[5]!.body = utf8('swapped');
  assert.equal(l3.selfAudit(), false, 'selfAudit checks body digests');
  // copies
  s = build();
  s.getEntry(1)!.headerBytes[0]! ^= 0xff;
  s.getEntry(1)!.leafHash[0]! ^= 0xff;
  s.getEntry(5)!.body![0]! ^= 0xff;
  assert.equal(logOver(s).status.state, 'ok', 'mutating returned entry does not corrupt store');
  const h = s.leafHashes(0, 1);
  h[0]![0]! ^= 0xff;
  assert.equal(logOver(s).status.state, 'ok');
  // appendEntry input is copied too
  const e: StoredEntry = { ...s.getEntry(0)!, seq: 6, nonceKey: 'k' };
  s.appendEntry(e);
  e.leafHash.fill(0);
  assert.notDeepEqual(s.getEntry(6)!.leafHash, new Uint8Array(32));
});

// ---- F6 ----
test('F6 same public key under two witness names counts once toward quorum', () => {
  const { log } = newLog();
  prelude(log);
  const note = log.checkpoint();
  assert.ok(note.ok);
  if (!note.ok) return;
  const pol = { quorum: 2, noneAcknowledged: false, witnesses: [
    { name: 'a', alg: 'ed25519' as const, publicKey: W1.publicKey },
    { name: 'b', alg: 'ed25519' as const, publicKey: W1.publicKey },
    { name: 'w2', alg: 'ed25519' as const, publicKey: W2.publicKey },
  ] };
  const cp = parseCheckpoint(note.value + cosign(note.value, W1, 'a') + cosign(note.value, W1, 'b'));
  assert.ok(cp.ok);
  if (!cp.ok) return;
  const st = witnessStatus(cp.value, pol);
  assert.equal(st.valid.size, 1);
  assert.equal(st.witnessed, false);
  const cp2 = parseCheckpoint(note.value + cosign(note.value, W1, 'a') + cosign(note.value, W1, 'b') + cosign(note.value, W2, 'w2'));
  assert.ok(cp2.ok && witnessStatus(cp2.value, pol).witnessed);
});

// ---- F7 / F8 ----
test('F7 attachCosignatures: one line per element, dedupe by name within a call, junk lines dropped', () => {
  const { log } = newLog();
  prelude(log);
  const note = log.checkpoint();
  assert.ok(note.ok);
  if (!note.ok) return;
  const size = log.size;
  const a = cosign(note.value, W1, 'w1', NOW);
  const a2 = cosign(note.value, W1, 'w1', NOW + 1);
  const r = log.attachCosignatures(size, [a, a2], POLICY);
  assert.ok(r.ok);
  assert.equal((r.ok ? r.value.note : '').split('\n').filter((l) => l.startsWith('— w1 ')).length, 1, 'same witness twice in one call');
  const junk = '— evil AAAAAAAAAA==\n';
  const r2 = log.attachCosignatures(size, [junk + cosign(note.value, W2, 'w2')], POLICY);
  assert.ok(r2.ok && r2.value.witnessed);
  assert.ok(r2.ok && !r2.value.note.includes('evil'), 'junk line smuggled inside a multi-line element');
  assert.equal(r2.ok && r2.value.note.split('\n').filter((l) => l.startsWith('— w2 ')).length, 1);
});
test('F8 attachCosignatures rejects cosignatures more than 300 s in the future', () => {
  const { log } = newLog();
  prelude(log);
  const note = log.checkpoint();
  assert.ok(note.ok);
  if (!note.ok) return;
  const r = log.attachCosignatures(log.size, [cosign(note.value, W3, 'w3', NOW + 1000), cosign(note.value, W1, 'w1', NOW + 300)], POLICY);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(!r.value.note.includes('— w3 '), 'future-dated dropped');
  assert.ok(r.value.note.includes('— w1 '), 'now+300 accepted');
});

// ---- F9 ----
test('F9 store.appendEntry throwing yields QV_BOARD_INTERNAL and leaves log unchanged', () => {
  const store = new MemoryBoardStore();
  let boom = false;
  const orig = store.appendEntry.bind(store);
  store.appendEntry = (e) => { if (boom) throw new Error('disk full'); orig(e); };
  const log = logOver(store);
  assert.ok(add(log, 'manifest').ok);
  const root = log.root();
  boom = true;
  const e = mk('ceremony_start');
  const r = log.append(e.headerBytes, e.body);
  assert.ok(!r.ok && r.error.code === 'QV_BOARD_INTERNAL');
  assert.equal(log.size, 1);
  assert.deepEqual(log.root(), root);
  boom = false;
  assert.ok(log.append(e.headerBytes, e.body).ok, 'same entry admissible afterwards (grammar unchanged)');
  assert.equal(log.size, 2);
});

// ---- F10 ----
test('F10 equivocation checkers are total on negative / huge / non-integer numbers', () => {
  const { log } = newLog();
  prelude(log);
  const n = log.checkpoint();
  assert.ok(n.ok);
  if (!n.ok) return;
  const base = signPromise(LOG.secretKey, ORIGIN, 1, new Uint8Array(32), NOW);
  for (const bad of [-1, 2 ** 60, 1.5, NaN, Infinity]) {
    for (const r of [{ ...base, seq: bad }, { ...base, sequencedAt: bad }, { ...base, checkpointDeadline: bad }]) {
      let res;
      assert.doesNotThrow(() => { res = checkBrokenPromise(r, n.value, new Uint8Array(32), [], LOG.publicKey); }, `bad=${bad}`);
      assert.equal((res as unknown as { ok: boolean }).ok, false);
    }
  }
  assert.doesNotThrow(() => checkFork(n.value, n.value, LOG.publicKey));
  assert.doesNotThrow(() => checkInconsistent(n.value, n.value, [], LOG.publicKey));
  assert.doesNotThrow(() => verifyConsistency(-1, 5, new Uint8Array(32), new Uint8Array(32), []));
});

// ---- F12 ----
test('F12 putCheckpoint conflict compares full roots and requires 32-byte roots', () => {
  const s = new MemoryBoardStore();
  const root = new Uint8Array(32).fill(1);
  s.putCheckpoint({ size: 1, root, note: 'n' });
  s.putCheckpoint({ size: 1, root: root.slice(), note: 'n2' }); // identical root: replace note OK
  assert.throws(() => s.putCheckpoint({ size: 1, root: root.slice(0, 16), note: 'x' }), /conflicting|root/);
  assert.throws(() => s.putCheckpoint({ size: 1, root: new Uint8Array(33).fill(1), note: 'x' }), /conflicting|root/);
  assert.throws(() => s.putCheckpoint({ size: 2, root: new Uint8Array(16), note: 'x' }), /root/);
  const other = root.slice();
  other[31] = 9;
  assert.throws(() => s.putCheckpoint({ size: 1, root: other, note: 'x' }), /conflicting/);
  assert.equal(s.getCheckpoint(1)?.note, 'n2');
});

// ---- F14 ----
test('F14 isPow2 is exact', () => {
  for (let k = 0; k <= 52; k++) assert.equal(isPow2(2 ** k), true, `2^${k}`);
  for (const n of [0, -1, 3, 6, 2 ** 52 + 1, 2 ** 53 - 1, 2 ** 40 + 1, 2 ** 52 - 1, 1.5]) assert.equal(isPow2(n), false, `${n}`);
  void kp;
});
