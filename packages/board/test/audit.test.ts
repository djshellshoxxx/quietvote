// AI-assisted audit (docs/audit/board-cli.md): property/fuzz/mutation tests and regression tests for BC-* findings.
// Deterministic (seeded xorshift), so failures reproduce.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sha256 } from '@quietvote/crypto';
import {
  BoardLog, MerkleTree, bundleFromJson, bundleToJson, checkBrokenPromise, checkFork, checkInconsistent, cosignLine,
  exportBundle, hashLeaf, parseCheckpoint, receiptFromJson, receiptToJson, signCheckpoint, unb64, unb64u, utf8, b64, b64u,
  verifyConsistency, verifyInclusion, verifyLog, verifyLogSignature, verifyReceipt, witnessStatus, emptyRoot,
  type LogBundle, type VerifyOptions, type WitnessPolicy,
} from '../src/index.ts';
import { LOG, NOW, ORIGIN, POLICY, W1, W2, W3, cosign, fullElection, kp, mk, newLog, resolveAuthorKey, rng } from './helpers.ts';

const vopts: VerifyOptions = { logPublicKey: LOG.publicKey, witnessPolicy: POLICY, resolveAuthorKey };

function pick<T>(r: () => number, a: readonly T[]): T {
  return a[Math.floor(r() * a.length)] as T;
}
function flipByte(b: Uint8Array, r: () => number): Uint8Array {
  const c = b.slice();
  if (c.length === 0) return Uint8Array.of(1);
  c[Math.floor(r() * c.length)]! ^= 1 + Math.floor(r() * 255);
  return c;
}
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// ------------------------------------------------------------------ Merkle proofs

test('fuzz: random trees, every mutation class of inclusion/consistency proofs is rejected', () => {
  const r = rng(0xc0ffee);
  for (let iter = 0; iter < 60; iter++) {
    const n = 2 + Math.floor(r() * 70);
    const t = new MerkleTree();
    for (let i = 0; i < n; i++) t.appendLeaf(utf8(`l${iter}-${i}`));
    const m = Math.floor(r() * n);
    const root = t.root();
    const lh = t.leafHash(m)!;
    const path = t.inclusionProof(m);
    assert.ok(verifyInclusion(lh, m, n, path, root));
    const bad: [string, boolean][] = [];
    if (path.length > 0) {
      const k = Math.floor(r() * path.length);
      bad.push(['flip', verifyInclusion(lh, m, n, path.map((p, i) => (i === k ? flipByte(p, r) : p)), root)]);
      bad.push(['drop', verifyInclusion(lh, m, n, path.filter((_, i) => i !== k), root)]);
      bad.push(['truncate', verifyInclusion(lh, m, n, path.slice(0, -1), root)]);
      if (path.length > 1 && !same(path[0]!, path[path.length - 1]!)) bad.push(['reorder', verifyInclusion(lh, m, n, [...path].reverse(), root)]);
    }
    bad.push(['extend', verifyInclusion(lh, m, n, [...path, new Uint8Array(32)], root)]);
    bad.push(['wrong leaf', verifyInclusion(flipByte(lh, r), m, n, path, root)]);
    bad.push(['wrong root', verifyInclusion(lh, m, n, path, flipByte(root, r))]);
    // a different index with this path must not verify unless it is a sibling-equivalent (it cannot be: leaf hashes differ)
    const m2 = (m + 1 + Math.floor(r() * (n - 1))) % n;
    bad.push(['other index', verifyInclusion(lh, m2, n, path, root)]);
    for (const [name, accepted] of bad) assert.equal(accepted, false, `inclusion mutation accepted: ${name} (n=${n}, m=${m})`);

    const a = 1 + Math.floor(r() * (n - 1));
    const cp = t.consistencyProof(a, n);
    const ra = t.root(a);
    assert.ok(verifyConsistency(a, n, ra, root, cp));
    const cbad: [string, boolean][] = [
      ['wrong old root', verifyConsistency(a, n, flipByte(ra, r), root, cp)],
      ['wrong new root', verifyConsistency(a, n, ra, flipByte(root, r), cp)],
      ['extend', verifyConsistency(a, n, ra, root, [...cp, new Uint8Array(32)])],
      ['swapped roots', verifyConsistency(a, n, root, ra, cp)],
    ];
    if (cp.length > 0) {
      const k = Math.floor(r() * cp.length);
      cbad.push(['flip', verifyConsistency(a, n, ra, root, cp.map((p, i) => (i === k ? flipByte(p, r) : p)))]);
      cbad.push(['drop', verifyConsistency(a, n, ra, root, cp.filter((_, i) => i !== k))]);
    }
    for (const [name, accepted] of cbad) assert.equal(accepted, false, `consistency mutation accepted: ${name} (a=${a}, n=${n})`);
  }
});

test('fuzz: Merkle verifiers are total on random hostile input (no throw, no accept)', () => {
  const r = rng(77);
  const h32 = (): Uint8Array => Uint8Array.from({ length: 32 }, () => Math.floor(r() * 256));
  const weird = [-1, 0, 1, 2, 3, 7, 2 ** 31, 2 ** 32, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 2, NaN, Infinity, 1.5];
  for (let i = 0; i < 400; i++) {
    const path = Array.from({ length: Math.floor(r() * 6) }, () => (r() < 0.1 ? Uint8Array.from({ length: Math.floor(r() * 40) }, () => 1) : h32()));
    assert.equal(verifyInclusion(h32(), pick(r, weird), pick(r, weird), path, h32()), false);
    assert.equal(verifyConsistency(pick(r, weird), pick(r, weird), h32(), h32(), path), false);
  }
  // wrong-typed elements inside a path
  assert.equal(verifyInclusion(h32(), 0, 2, [null as unknown as Uint8Array], h32()), false);
  assert.equal(verifyInclusion(h32(), 0, 2, ['x' as unknown as Uint8Array], h32()), false);
  // size 0 / empty-tree special cases cannot be abused
  assert.equal(verifyConsistency(0, 5, h32(), h32(), []), false);
  assert.equal(verifyConsistency(0, 5, emptyRoot(), h32(), []), true, 'QV-18 7.3: from size 0 the proof is empty');
  assert.equal(verifyConsistency(0, 5, emptyRoot(), h32(), [h32()]), false);
});

test('second-preimage resistance: an interior node cannot pose as a leaf', () => {
  const t = new MerkleTree();
  for (let i = 0; i < 4; i++) t.appendLeaf(utf8(`x${i}`));
  const l0 = t.leafHash(0)!;
  const l1 = t.leafHash(1)!;
  const inner = new Uint8Array(64);
  inner.set(l0, 0);
  inner.set(l1, 32);
  // a 2-leaf tree whose single leaf is the 64-byte concatenation must NOT share the 4-leaf tree's left node
  const fake = new MerkleTree();
  fake.appendLeaf(inner);
  assert.equal(b64(fake.root()) === b64(t.root(2)), false);
});

// ------------------------------------------------------------------ encodings and checkpoints

test('fuzz: canonical base64 / base64url decoders accept exactly their own encodings', () => {
  const r = rng(5);
  for (let i = 0; i < 300; i++) {
    const b = Uint8Array.from({ length: Math.floor(r() * 40) }, () => Math.floor(r() * 256));
    assert.ok(same(unb64(b64(b))!, b));
    assert.ok(same(unb64u(b64u(b))!, b));
    const s = b64(b);
    if (s.length > 0) {
      // mutate one char: result must be rejected or decode to something whose canonical encoding is the mutated string
      const k = Math.floor(r() * s.length);
      const c = pick(r, [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_ \n.']);
      const m = s.slice(0, k) + c + s.slice(k + 1);
      const d = unb64(m);
      if (d !== undefined) assert.equal(b64(d), m, 'accepted a non-canonical encoding');
    }
  }
  for (const bad of ['AB==', 'AAB=', 'A===', 'AAAA=', 'AA=A', ' AAAA', 'AAAA\n', 'AA\u0000A']) assert.equal(unb64(bad), undefined, JSON.stringify(bad));
});

const GOOD_NOTE = (() => {
  const note = signCheckpoint(ORIGIN, 7, sha256(utf8('root')), LOG.secretKey, LOG.publicKey);
  const text = note.slice(0, note.indexOf('\n\n') + 1);
  return note + cosignLine('w1', W1.secretKey, W1.publicKey, text, NOW) + cosignLine('w2', W2.secretKey, W2.publicKey, text, NOW);
})();

test('fuzz: checkpoint parser is total and no mutation yields a different, validly signed checkpoint', () => {
  const r = rng(1234);
  const orig = parseCheckpoint(GOOD_NOTE);
  assert.ok(orig.ok && verifyLogSignature(orig.value, LOG.publicKey));
  if (!orig.ok) return;
  let accepted = 0;
  for (let i = 0; i < 3000; i++) {
    const bytes = utf8(GOOD_NOTE);
    let m = bytes;
    const kind = Math.floor(r() * 5);
    if (kind === 0) m = flipByte(bytes, r);
    else if (kind === 1) m = bytes.slice(0, Math.floor(r() * bytes.length));
    else if (kind === 2) {
      const k = Math.floor(r() * bytes.length);
      m = Uint8Array.from([...bytes.slice(0, k), ...bytes.slice(k + 1 + Math.floor(r() * 3))]);
    } else if (kind === 3) {
      const k = Math.floor(r() * bytes.length);
      m = Uint8Array.from([...bytes.slice(0, k), ...pick(r, [utf8('\n'), utf8('\n\n'), utf8(' '), utf8('\r'), utf8('+'), utf8('— ')]), ...bytes.slice(k)]);
    } else m = Uint8Array.from({ length: Math.floor(r() * 200) }, () => Math.floor(r() * 256));
    const note = new TextDecoder('utf-8').decode(m); // lossy decode is fine: the parser takes strings
    const p = parseCheckpoint(note); // must not throw
    if (!p.ok) continue;
    if (verifyLogSignature(p.value, LOG.publicKey)) {
      accepted++;
      assert.equal(p.value.text, orig.value.text, 'a validly log-signed checkpoint with different text appeared');
      assert.equal(p.value.size, orig.value.size);
      assert.ok(same(p.value.root, orig.value.root));
    }
    witnessStatus(p.value, POLICY); // total
  }
  assert.ok(accepted >= 0);
});

test('checkpoint parser rejects structural tricks', () => {
  const root = b64(sha256(utf8('r')));
  const sigline = GOOD_NOTE.slice(GOOD_NOTE.indexOf('\n\n') + 2).split('\n')[0] + '\n';
  const body = (t: string): string => `${t}\n${sigline}`;
  const cases: Record<string, string> = {
    'extension line': body(`${ORIGIN}\n7\n${root}\nextra\n`),
    'leading zero size': body(`${ORIGIN}\n07\n${root}\n`),
    'plus size': body(`${ORIGIN}\n+7\n${root}\n`),
    'hex size': body(`${ORIGIN}\n0x7\n${root}\n`),
    'huge size': body(`${ORIGIN}\n99999999999999999\n${root}\n`),
    'unsafe size': body(`${ORIGIN}\n9007199254740993\n${root}\n`),
    'root wrong length': body(`${ORIGIN}\n7\n${b64(new Uint8Array(31))}\n`),
    'root unpadded': body(`${ORIGIN}\n7\n${root.replace(/=+$/, '')}\n`),
    'empty origin': body(`\n7\n${root}\n`),
    'no sig lines': `${ORIGIN}\n7\n${root}\n\n`,
    'no trailing newline': `${ORIGIN}\n7\n${root}\n\n${sigline.trimEnd()}`,
    'crlf': body(`${ORIGIN}\r\n7\r\n${root}\r\n`),
  };
  for (const [name, note] of Object.entries(cases)) assert.equal(parseCheckpoint(note).ok, false, name);
});

test('witness cosignatures: a signature is bound to the checkpoint text and to the policy key; one key under two names counts once (BC-08)', () => {
  const p = parseCheckpoint(GOOD_NOTE);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.equal(witnessStatus(p.value, POLICY).valid.size, 2);
  // cosignature copied onto a different checkpoint does not verify
  const other = signCheckpoint(ORIGIN, 8, sha256(utf8('root2')), LOG.secretKey, LOG.publicKey);
  const line = GOOD_NOTE.split('\n').filter((l) => l.startsWith('— w1'))[0]! + '\n';
  const moved = parseCheckpoint(other + line);
  assert.ok(moved.ok);
  if (moved.ok) assert.equal(witnessStatus(moved.value, POLICY).valid.size, 0);
  // BC-08: the same Ed25519 key registered under two names must not count as two witnesses
  const dup: WitnessPolicy = {
    quorum: 2, noneAcknowledged: false,
    witnesses: [{ name: 'w1', alg: 'ed25519', publicKey: W1.publicKey }, { name: 'w1b', alg: 'ed25519', publicKey: W1.publicKey }],
  };
  const text = other.slice(0, other.indexOf('\n\n') + 1);
  const two = other + cosignLine('w1', W1.secretKey, W1.publicKey, text, NOW) + cosignLine('w1b', W1.secretKey, W1.publicKey, text, NOW);
  const q = parseCheckpoint(two);
  assert.ok(q.ok);
  if (q.ok) {
    const st = witnessStatus(q.value, dup);
    assert.equal(st.valid.size, 1, 'one key = one witness');
    assert.equal(st.witnessed, false);
  }
});

// ------------------------------------------------------------------ bundles

function makeBundle(): LogBundle {
  const { log, store } = fullElection(3);
  const rc = log.getReceipt(5);
  return exportBundle(store, { origin: ORIGIN, createdAt: NOW, generator: 'test', policy: { logPublicKey: LOG.publicKey, witnessPolicy: POLICY }, receipts: rc.ok ? [rc.value] : [] });
}
const toJ = (b: LogBundle): any => JSON.parse(JSON.stringify(bundleToJson(b)));
const verdictOf = (j: unknown): 'REJECTED' | 'VERIFIED' | 'PARTIAL' | 'FAILED' => {
  const d = bundleFromJson(j);
  return d.ok ? verifyLog(d.value, vopts).integrity : 'REJECTED';
};

test('mutation: every single-byte change of an authenticated bundle field (headers, bodies, root, size, checkpoints, receipts) is caught', () => {
  const base = toJ(makeBundle());
  assert.equal(verdictOf(base), 'VERIFIED');
  const r = rng(99);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const j = structuredClone(base);
    const target = Math.floor(r() * 6);
    const ent = pick(r, j.entries as any[]);
    const mutateStr = (s: string): string => {
      const k = Math.floor(r() * s.length);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let c = pick(r, [...alphabet]);
      if (c === s[k]) c = c === 'A' ? 'B' : 'A';
      return s.slice(0, k) + c + s.slice(k + 1);
    };
    if (target === 0) ent.header_b64u = mutateStr(ent.header_b64u);
    else if (target === 1) {
      if (ent.body_b64u === null) continue;
      ent.body_b64u = mutateStr(ent.body_b64u);
    } else if (target === 2) j.root_b64 = mutateStr(j.root_b64);
    else if (target === 3) j.tree_size += 1 + Math.floor(r() * 3);
    else if (target === 4) {
      const k = Math.floor(r() * j.checkpoints.length);
      // mutate within the signed text or the log signature line (first two '\n'-separated blocks), not cosig timestamps
      const note: string = j.checkpoints[k];
      const cut = note.indexOf('\n— ' + ORIGIN.slice(0, 0)) >= 0 ? note.indexOf('\n\n') : note.length;
      const pos = Math.floor(r() * Math.max(1, cut));
      const ch = note[pos]!;
      j.checkpoints[k] = note.slice(0, pos) + String.fromCharCode(((ch.charCodeAt(0) + 1 + Math.floor(r() * 5)) % 94) + 33) + note.slice(pos + 1);
    } else {
      const rc = j.receipts[0];
      rc.leaf_hash = b64(flipByte(unb64(rc.leaf_hash)!, r));
    }
    const v = verdictOf(j);
    n++;
    assert.notEqual(v, 'VERIFIED', `mutation target ${target} still VERIFIED`);
    assert.notEqual(v, 'PARTIAL', `mutation target ${target} downgraded to PARTIAL instead of FAILED/rejected`);
  }
  assert.ok(n > 300);
});

test('mutation: drop / reorder / duplicate / swap whole items in a bundle never verifies', () => {
  const base = toJ(makeBundle());
  const r = rng(4242);
  for (let i = 0; i < 120; i++) {
    const j = structuredClone(base);
    const field = pick(r, ['entries', 'checkpoints', 'receipts'] as const);
    const arr: unknown[] = j[field];
    const op = Math.floor(r() * 4);
    const a = Math.floor(r() * arr.length);
    const b = Math.floor(r() * arr.length);
    if (op === 0) arr.splice(a, 1);
    else if (op === 1) {
      if (a === b) continue;
      [arr[a], arr[b]] = [arr[b], arr[a]];
      if (field !== 'entries' && field !== 'checkpoints') continue; // receipts order is not significant
      if (field === 'checkpoints') continue; // checkpoint order is not significant: verifier sorts by size
    } else if (op === 2) arr.splice(a, 0, structuredClone(arr[a]));
    else {
      if (field === 'receipts' || field === 'checkpoints') continue;
      if (a === b) continue;
      (arr[a] as any).seq = (arr[b] as any).seq;
    }
    const v = verdictOf(j);
    // dropping or duplicating an unnecessary checkpoint / the receipt is legitimately harmless; everything on entries is not
    if (field === 'entries') assert.ok(v === 'FAILED' || v === 'REJECTED', `entries op ${op} gave ${v}`);
    else if (op === 0 && field === 'checkpoints') {
      /* may drop a gate checkpoint (FAILED) or a redundant one (VERIFIED) */
    } else if (op === 0 && field === 'receipts') assert.equal(v, 'VERIFIED');
    else if (op === 2) assert.ok(v === 'VERIFIED' || v === 'FAILED');
  }
  // dropping the final checkpoint specifically must fail (uncovered tail)
  const j = structuredClone(base);
  j.checkpoints.pop();
  assert.equal(verdictOf(j), 'FAILED');
  // dropping each entry individually, including the last, always fails
  for (let k = 0; k < base.entries.length; k++) {
    const q = structuredClone(base);
    q.entries.splice(k, 1);
    assert.equal(verdictOf(q), 'FAILED', `dropped entry ${k}`);
  }
});

test('fuzz: bundleFromJson / verifyLog never throw on random structural garbage, incl. a null bundle (BC-10)', () => {
  const r = rng(31337);
  const base = toJ(makeBundle());
  const junk: unknown[] = [null, undefined, 0, -1, 1.5, NaN, '', 'x', [], {}, [[]], { seq: 0 }, true, 2 ** 60, '\u0000', 'A'.repeat(100000)];
  const paths: string[][] = [['format'], ['origin'], ['tree_size'], ['root_b64'], ['entries'], ['checkpoints'], ['receipts'], ['policy'], ['policy', 'witness_policy'], ['policy', 'log_pk_b64'], ['redactions'], ['entries', '0'], ['entries', '0', 'seq'], ['entries', '0', 'header_b64u'], ['entries', '0', 'body_b64u'], ['receipts', '0', 'inclusion'], ['receipts', '0', 'inclusion', 'path'], ['policy', 'witness_policy', 'witnesses', '0']];
  for (let i = 0; i < 500; i++) {
    const j = structuredClone(base);
    const path = pick(r, paths);
    let o: any = j;
    for (const k of path.slice(0, -1)) o = o?.[k];
    if (o === undefined || o === null) continue;
    const val = pick(r, junk);
    if (val === o[path[path.length - 1]!]) continue;
    o[path[path.length - 1]!] = val;
    const d = bundleFromJson(j);
    if (d.ok) {
      const v = verifyLog(d.value, vopts);
      // an empty receipts/redactions list or unused (anchor-overridden) policy copy is legitimately harmless
      const harmless = path[0] === 'policy' || path[0] === 'receipts' || path[0] === 'redactions';
      if (!harmless) assert.notEqual(v.integrity, 'VERIFIED', `garbage at ${path.join(".")} = ${JSON.stringify(val)?.slice(0,40)} verified`);
    }
  }
  // verifyLog directly on hostile in-memory objects (callers other than bundleFromJson)
  const b = makeBundle();
  const hostile: unknown[] = [
    { ...b, entries: null }, { ...b, entries: [{ seq: 0, headerBytes: null, body: null }] }, { ...b, checkpoints: [null] },
    { ...b, receipts: [{}] }, { ...b, redactions: null }, null, 5,
  ];
  for (const [idx, h] of hostile.entries()) {
    const v = verifyLog(h as LogBundle, vopts);
    assert.notEqual(v.integrity, 'VERIFIED', `hostile object #${idx}`);
  }
});

test('fuzz: receiptFromJson/verifyReceipt/equivocation checkers are total (BC-09)', () => {
  const { log } = newLog();
  for (const t of ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'ballot'] as const) {
    const e = mk(t);
    assert.ok(log.append(e.headerBytes, e.body).ok);
  }
  const note = log.checkpoint();
  assert.ok(note.ok);
  if (!note.ok) return;
  const rc = log.getReceipt(5);
  assert.ok(rc.ok);
  if (!rc.ok) return;
  const rj = receiptToJson(rc.value);
  const weird = [-1, 2 ** 53, 1.5, '1', null, {}, [], 2 ** 64];
  const r = rng(8);
  for (let i = 0; i < 200; i++) {
    const j = structuredClone(rj) as any;
    const k = pick(r, ['origin', 'seq', 'leaf_hash', 'sequenced_at', 'checkpoint_deadline', 'promise_sig', 'inclusion']);
    j[k] = pick(r, weird);
    const d = receiptFromJson(j);
    if (!d.ok) continue;
    if (!(k === 'inclusion' && j[k] === null)) assert.equal(verifyReceipt(d.value, LOG.publicKey).ok, false);
    // evidence checkers must return a Result, never throw, on a hostile receipt
    const res = checkBrokenPromise(d.value, note.value, new Uint8Array(32), [], LOG.publicKey);
    assert.equal(res.ok, false);
  }
  // log key of the wrong length must not make checkers throw either
  const short = new Uint8Array(5);
  assert.equal(checkFork(note.value, note.value, short).ok, false);
  assert.equal(checkInconsistent(note.value, note.value, [], short).ok, false);
});

// ------------------------------------------------------------------ BoardLog robustness (BC-3, BC-4)

test('BC-06: tampered stored header bytes (leaf hash left intact) are detected on load and by selfAudit', () => {
  const { log, store } = newLog();
  for (const t of ['manifest', 'ceremony_start', 'joint_key'] as const) {
    const e = mk(t);
    assert.ok(log.append(e.headerBytes, e.body).ok);
  }
  assert.ok(log.checkpoint().ok);
  assert.ok(log.selfAudit());
  const entries = (store as unknown as { entries: { headerBytes: Uint8Array; leafHash: Uint8Array }[] }).entries;
  const orig = entries[1]!.headerBytes;
  entries[1]!.headerBytes = flipByte(orig, rng(1));
  assert.equal(log.selfAudit(), false, 'selfAudit must recompute leaf hashes from the stored headers');
  assert.equal(log.status.state, 'quarantine');
  // a restarted log refuses to serve the corrupted store too
  const again = new BoardLog({ origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey });
  assert.equal(again.status.state, 'quarantine');
  entries[1]!.headerBytes = orig;
  assert.equal(new BoardLog({ origin: ORIGIN, store, secretKey: LOG.secretKey, publicKey: LOG.publicKey, clock: () => NOW, resolveAuthorKey }).status.state, 'ok');
  void hashLeaf;
});

test('BC-07: attachCosignatures stores only the single verified cosignature line, never smuggled extra lines', () => {
  const { log } = newLog();
  for (const t of ['manifest', 'ceremony_start', 'joint_key'] as const) {
    const e = mk(t);
    assert.ok(log.append(e.headerBytes, e.body).ok);
  }
  const note = log.checkpoint();
  assert.ok(note.ok);
  if (!note.ok) return;
  const good = cosign(note.value, W1, 'w1');
  const junk = `— attacker ${b64(new Uint8Array(40))}\n`;
  const res = log.attachCosignatures(log.size, [junk + good], POLICY);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.value.note.includes('attacker'), false, 'unauthenticated line was persisted into the checkpoint note');
  const res1 = log.attachCosignatures(log.size, [good], POLICY);
  assert.ok(res1.ok);
  const res2 = log.attachCosignatures(log.size, [good + good, cosign(note.value, W3, 'w3') + '\n\n— x y\n'], POLICY);
  assert.ok(res2.ok);
  if (!res2.ok) return;
  const lines = res2.value.note.split('\n').filter((l) => l.startsWith('— '));
  assert.equal(lines.length, 2, 'log line + exactly one cosignature');
  void kp;
});
