import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, concatBytes, ed25519Keypair, h256, hexToBytes, jcs, sha256, u32, utf8 } from '@quietvote/crypto';
import {
  evaluateContest, leafHash, manifestHash, mth, nodeHash, quorumMet, rollLeaf, rollRoot, validateManifest,
  type Manifest, type ManifestContest,
} from '../src/index.ts';
import { buildManifest, clone, defaultContests, kp } from './helpers/sim.ts';

const H = bytesToHex;
const mk = (): Manifest => {
  const coord = [kp('m', 'coord')];
  const tk = [1, 2, 3].map((i) => kp('m', `t${i}`));
  return buildManifest({ seed: 'm', n: 3, t: 2, voters: 10 }, coord, tk, 10, '00'.repeat(32));
};

test('valid manifest passes; hash is JCS-based and sensitive to every field', () => {
  const m = mk();
  const v = validateManifest(m, 10);
  assert.ok(v.ok, JSON.stringify(v));
  const h = H(manifestHash(m));
  assert.equal(h, H(h256('manifest', jcs(m))));
  const m2 = clone(m);
  m2.contests[0]!.options[0]!.label = 'Yes!';
  assert.notEqual(H(manifestHash(m2)), h);
  // key order is irrelevant: JCS sorts
  const rev = (x: unknown): unknown => Array.isArray(x) ? x.map(rev) : typeof x === 'object' && x !== null ? Object.fromEntries(Object.entries(x).reverse().map(([k, v]) => [k, rev(v)])) : x;
  const reordered = rev(m) as Manifest;
  assert.equal(H(manifestHash(reordered)), h);
});

const bad: [string, (m: Manifest) => void, string][] = [
  ['unknown proto', (m) => (m.proto = 'qv2-x'), 'E_VERSION'],
  ['unknown field', (m) => ((m as any).evil = 1), 'E_SCHEMA'],
  ['missing field', (m) => delete (m as any).bb, 'E_SCHEMA'],
  ['wrong type', (m) => ((m as any).n = '3'), 'E_SCHEMA'],
  ['uppercase hex', (m) => (m.election_id = m.election_id.toUpperCase()), 'E_SCHEMA'],
  ['short election id', (m) => (m.election_id = 'ab'), 'E_SCHEMA'],
  ['bad contest id', (m) => (m.contests[0]!.id = 'Bad Id'), 'E_SCHEMA'],
  ['t > n', (m) => (m.t = 4), 'E_MANIFEST'],
  ['n != trustees', (m) => (m.n = 2), 'E_MANIFEST'],
  ['trustee index order', (m) => (m.trustees[0]!.index = 2), 'E_MANIFEST'],
  ['duplicate trustee key', (m) => (m.trustees[1]!.sign_pk = m.trustees[0]!.sign_pk), 'E_MANIFEST'],
  ['small-order trustee key', (m) => (m.trustees[1]!.sign_pk = '01' + '00'.repeat(31)), 'E_MANIFEST'],
  ['coordinator m > keys', (m) => (m.coordinator.m = 2), 'E_MANIFEST'],
  ['time ordering', (m) => (m.voting_close = m.voting_open), 'E_MANIFEST'],
  ['bad timestamp', (m) => (m.voting_open = '2026-02-30T00:00:00Z'), 'E_MANIFEST'],
  ['timestamp with fraction', (m) => (m.voting_open = '2026-11-01T09:00:00.5Z'), 'E_SCHEMA'],
  ['duplicate contest', (m) => (m.contests[1]!.id = m.contests[0]!.id), 'E_MANIFEST'],
  ['duplicate option', (m) => (m.contests[1]!.options[1]!.id = m.contests[1]!.options[0]!.id), 'E_MANIFEST'],
  ['reserved option prefix', (m) => (m.contests[1]!.options[0]!.id = '~ph1'), 'E_SCHEMA'],
  ['yes-no wrong options', (m) => (m.contests[0]!.options[0]!.id = 'maybe'), 'E_MANIFEST'],
  ['yes-no without rule', (m) => delete m.contests[0]!.rule, 'E_MANIFEST'],
  ['rule on single-choice', (m) => (m.contests[1]!.rule = { type: 'threshold', num: 1, den: 2, basis: 'yes+no', strict: true }), 'E_MANIFEST'],
  ['rule fraction > 1', (m) => (m.contests[0]!.rule!.num = 3), 'E_MANIFEST'],
  ['approval with limit', (m) => (m.contests[2]!.selection_limit = 2), 'E_MANIFEST'],
  ['k-of-n with k = n', (m) => (m.contests[3]!.selection_limit = 5), 'E_MANIFEST'],
  ['single-choice limit 2', (m) => (m.contests[1]!.selection_limit = 2), 'E_MANIFEST'],
  ['min_selections != 0', (m) => ((m.contests[0] as any).min_selections = 1), 'E_SCHEMA'],
  ['beacon tie-break (reserved)', (m) => (m.contests[1]!.tie_break = { type: 'beacon' }), 'E_MANIFEST'],
  ['status-quo outside yes-no', (m) => (m.contests[1]!.tie_break = { type: 'status-quo', option: 'ann' }), 'E_MANIFEST'],
  ['status-quo unknown option', (m) => (m.contests[0]!.tie_break = { type: 'status-quo', option: 'maybe' }), 'E_MANIFEST'],
  ['non-NFC title', (m) => (m.title = 'é'), 'E_MANIFEST'],
  ['bidi control in label', (m) => (m.contests[0]!.options[0]!.label = 'Y‮es'), 'E_MANIFEST'],
  ['roll root without size', (m) => delete m.roll.size, 'E_MANIFEST'],
  ['weights not uniform', (m) => ((m.roll as any).weights = 'weighted'), 'E_SCHEMA'],
  ['quorum fraction missing den', (m) => (m.quorum = { type: 'fraction', basis: 'roll', num: 1 }), 'E_MANIFEST'],
  ['quorum count with fraction fields', (m) => (m.quorum = { type: 'count', value: 3, num: 1 }), 'E_MANIFEST'],
  ['min_counted below hard floor', (m) => (m.min_counted_ballots = 2), 'E_SCHEMA'],
  ['floor < 10 without privacy_ack', (m) => (m.privacy_ack = false), 'E_MANIFEST'],
  ['unknown method', (m) => ((m.contests[0] as any).method = 'ranked'), 'E_SCHEMA'],
];
for (const [name, mut, code] of bad) {
  test(`manifest negative: ${name}`, () => {
    const m = mk();
    mut(m);
    const v = validateManifest(m, 10);
    assert.ok(!v.ok && v.error === code, JSON.stringify(v));
  });
}

test('manifest warnings: t=1, secrecy, availability, small roll', () => {
  const m = mk();
  m.t = 1;
  const v = validateManifest(m, 5);
  assert.ok(v.ok);
  if (v.ok) assert.ok(v.value.warnings.some((w) => w.startsWith('W-NO-THRESHOLD')) && v.value.warnings.some((w) => w.startsWith('W-SMALL-ROLL')));
});

// ---------------------------------------------------------------- roll Merkle (RFC 9162)
function rfcRoot(leaves: Uint8Array[]): Uint8Array {
  // independent formulation: perfect subtrees by binary decomposition, folded from the right
  const n = leaves.length;
  const perfect = (xs: Uint8Array[]): Uint8Array => (xs.length === 1 ? xs[0]! : nodeHash(perfect(xs.slice(0, xs.length / 2)), perfect(xs.slice(xs.length / 2))));
  const parts: Uint8Array[] = [];
  let off = 0;
  for (let bit = 31; bit >= 0; bit--) {
    if ((n >> bit) & 1) {
      parts.push(perfect(leaves.slice(off, off + (1 << bit))));
      off += 1 << bit;
    }
  }
  let acc = parts.pop()!;
  while (parts.length > 0) acc = nodeHash(parts.pop()!, acc);
  return acc;
}

test('roll Merkle root: RFC 9162 split rule for sizes 1,2,3,5,7,8,9', () => {
  for (const n of [1, 2, 3, 5, 7, 8, 9]) {
    const keys = Array.from({ length: n }, (_, i) => ed25519Keypair(sha256(utf8(`k${i}`))).publicKey).sort((a, b) => (H(a) < H(b) ? -1 : 1));
    const r = rollRoot(keys.map(H));
    assert.ok(r.ok);
    const leaves = keys.map(rollLeaf);
    if (r.ok) assert.equal(H(r.value), H(rfcRoot(leaves)), `n=${n}`);
  }
  assert.equal(H(mth([])), H(sha256(new Uint8Array(0))));
});

test('roll leaf format and leaf/node domain separation', () => {
  const pk = ed25519Keypair(sha256(utf8('x'))).publicKey;
  assert.equal(H(rollLeaf(pk)), H(sha256(concatBytes(Uint8Array.of(0), pk, u32(1)))));
  const a = rollLeaf(pk);
  const b = rollLeaf(ed25519Keypair(sha256(utf8('y'))).publicKey);
  // an internal node presented as a leaf hashes differently (second-preimage defence)
  assert.notEqual(H(nodeHash(a, b)), H(leafHash(concatBytes(a, b))));
});

test('roll rejects duplicates, unsorted, small-order and non-canonical keys', () => {
  const ks = [1, 2].map((i) => H(ed25519Keypair(sha256(utf8(`r${i}`))).publicKey)).sort();
  assert.ok(rollRoot(ks).ok);
  assert.ok(!rollRoot([ks[1]!, ks[0]!]).ok);
  assert.ok(!rollRoot([ks[0]!, ks[0]!]).ok);
  assert.ok(!rollRoot(['01' + '00'.repeat(31)]).ok);
  assert.ok(!rollRoot(['ee' + 'ff'.repeat(30) + '7f']).ok);
  assert.ok(!rollRoot(['zz']).ok);
  assert.ok(hexToBytes(ks[0]!).length === 32);
});

// ---------------------------------------------------------------- rules
const cs = defaultContests();
const M = (over: Partial<Manifest> = {}): Manifest => ({ ...mk(), ...over });
const tmap = (o: Record<string, number>): Map<string, number> => new Map(Object.entries(o));
const yn = (num: number, den: number, strict: boolean, basis: 'yes+no' | 'counted' = 'yes+no', tb: ManifestContest['tie_break'] = { type: 'status-quo', option: 'no' }): ManifestContest => ({
  ...cs[0]!, rule: { type: 'threshold', num, den, basis, strict }, tie_break: tb,
});

test('yes-no: simple majority boundaries (exact integers)', () => {
  const c = yn(1, 2, true);
  const run = (y: number, n: number, tb?: ManifestContest['tie_break']) =>
    evaluateContest(M(), tb ? { ...c, tie_break: tb } : c, tmap({ yes: y, no: n }), y + n, 100).outcome;
  assert.equal(run(51, 50).kind, 'passed');
  assert.equal(run(50, 51).kind, 'rejected');
  assert.deepEqual(run(50, 50), { kind: 'rejected', reason: 'tie-break' });
  assert.deepEqual(run(50, 50, { type: 'status-quo', option: 'yes' }), { kind: 'passed', reason: 'tie-break' });
  assert.deepEqual(run(50, 50, { type: 'declare-tie' }), { kind: 'tie', tied: ['no', 'yes'] });
  assert.deepEqual(run(50, 50, { type: 'lexicographic' }), { kind: 'rejected', reason: 'tie-break' });
});

test('yes-no: two-thirds non-strict boundary and counted basis', () => {
  const c = yn(2, 3, false);
  const f = (y: number, n: number) => evaluateContest(M(), c, tmap({ yes: y, no: n }), y + n, 100).outcome.kind;
  assert.equal(f(2, 1), 'passed'); // 2/3 exactly passes with >=
  assert.equal(f(66, 34), 'rejected');
  assert.equal(f(67, 33), 'passed');
  const cc = yn(1, 2, true, 'counted');
  // 5 yes of 10 counted: 5*2 > 1*10 is false and equal => tie-break (status quo no => rejected)
  assert.deepEqual(evaluateContest(M(), cc, tmap({ yes: 5, no: 0 }), 10, 100).outcome, { kind: 'rejected', reason: 'tie-break' });
  assert.equal(evaluateContest(M(), cc, tmap({ yes: 6, no: 0 }), 10, 100).outcome.kind, 'passed');
  assert.deepEqual(evaluateContest(M(), yn(1, 2, false), tmap({ yes: 0, no: 0 }), 0, 100).outcome, { kind: 'rejected', reason: 'no-base' });
});

test('quorum: fraction and count boundaries; failing quorum overrides', () => {
  const f = M({ quorum: { type: 'fraction', basis: 'roll', num: 1, den: 3 } });
  assert.ok(quorumMet(f, 34, 100));
  assert.ok(!quorumMet(f, 33, 100));
  assert.ok(quorumMet(f, 33, 99));
  const c = M({ quorum: { type: 'count', value: 5 } });
  assert.ok(quorumMet(c, 5, 100) && !quorumMet(c, 4, 100));
  assert.ok(quorumMet(M(), 0, 100));
  const r = evaluateContest(f, yn(1, 2, true), tmap({ yes: 10, no: 0 }), 10, 100);
  assert.equal(r.quorum_met, false);
  assert.deepEqual(r.outcome, { kind: 'no-quorum' });
});

test('plurality / approval / k-of-n winners and tie handling', () => {
  const m = M();
  const single = cs[1]!;
  assert.deepEqual(evaluateContest(m, single, tmap({ ann: 3, bob: 2, cy: 1 }), 6, 10).outcome, { kind: 'winners', winners: ['ann'] });
  assert.deepEqual(evaluateContest(m, single, tmap({ ann: 2, bob: 2, cy: 1 }), 5, 10).outcome, { kind: 'winners', winners: ['ann'], reason: 'tie-break' });
  const approval = cs[2]!; // winners = 2, declare-tie
  assert.deepEqual(evaluateContest(m, approval, tmap({ a: 5, b: 4, c: 1, d: 0 }), 6, 10).outcome, { kind: 'winners', winners: ['a', 'b'] });
  assert.deepEqual(evaluateContest(m, approval, tmap({ a: 5, b: 3, c: 3, d: 0 }), 6, 10).outcome, { kind: 'tie', winners: ['a'], tied: ['b', 'c'] });
  assert.deepEqual(evaluateContest(m, approval, tmap({ a: 3, b: 3, c: 3, d: 3 }), 6, 10).outcome, { kind: 'tie', winners: [], tied: ['a', 'b', 'c', 'd'] });
  const kofn = cs[3]!; // k=2 lexicographic
  assert.deepEqual(evaluateContest(m, kofn, tmap({ p: 4, q: 4, r: 4, s: 1, t: 0 }), 6, 10).outcome, { kind: 'winners', winners: ['p', 'q'], reason: 'tie-break' });
  assert.deepEqual(evaluateContest(m, kofn, tmap({ p: 4, q: 3, r: 2, s: 1, t: 0 }), 6, 10).outcome, { kind: 'winners', winners: ['p', 'q'] });
});
