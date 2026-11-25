// CP-08 / M18 (docs/audit/crypto-protocol.md §4): ZIP-215 sensitivity of the Ed25519 verify wrapper.
//
// QV-16-REQ-016 / §5.12.2 require strict verification (canonical A and R, S < l, no small-order A, cofactorless-equivalent
// equation; CP-04 adds torsion-free A and R). ZIP-215 accepts strictly more. Below, a corpus of signatures that are valid
// under ZIP-215 (control: noble's own ZIP-215 mode accepts each) and invalid under a test-local strict RFC 8032 model must
// all be rejected by `ed25519Verify`.
//
// Note on M18 (`{ zip215: false }` -> `{ zip215: true }` in `ed25519Verify`): with noble 2.4.0 the switch only relaxes
// point decoding and the small-order-A check, and the wrapper's `ed25519IsStrictPoint` pre-checks on A and R already
// reject every such input (also found in B1-11). M18 is therefore behaviourally EQUIVALENT through the public API at this
// SHA; the corpus test proves the wrapper policy, and the final test pins the explicit option so the defence does not
// silently depend on the pre-checks alone (noble's ed25519 default is zip215: true). AI-assisted test work; not an audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { ORDER, ed25519IsStrictPoint, ed25519Keypair, ed25519Sign, ed25519Verify, hexToBytes, utf8 } from '../src/index.ts';

const P = ed25519.Point;
type EdPoint = InstanceType<typeof P>;
const B = P.BASE;
const l = ORDER; // the Ed25519 prime subgroup order equals the ristretto255 group order
const T8 = P.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a'); // order 8 (as in audit.test.ts)

const cat = (...xs: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};
const leInt = (b: Uint8Array): bigint => b.reduceRight((acc, x) => (acc << 8n) | BigInt(x), 0n);
const le32 = (v: bigint): Uint8Array => {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++, v >>= 8n) out[i] = Number(v & 255n);
  return out;
};
const mod = (v: bigint): bigint => ((v % l) + l) % l;
const eq = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
/** RFC 8032 challenge k = SHA-512(R || A || M) mod l over the exact encoded bytes. */
const kOf = (R: Uint8Array, A: Uint8Array, m: Uint8Array): bigint => mod(leInt(sha512(cat(R, A, m))));

/** Test-local model of the QV-16 strict policy: canonical A/R, S < l, A/R not small order, cofactorless [S]B = R + [k]A. */
function strictRfc8032(pk: Uint8Array, sig: Uint8Array, msg: Uint8Array): boolean {
  const canon = (b: Uint8Array): EdPoint | null => {
    try {
      const p = P.fromBytes(b, false);
      return eq(p.toBytes(), b) ? p : null;
    } catch {
      return null;
    }
  };
  if (pk.length !== 32 || sig.length !== 64) return false;
  const A = canon(pk);
  const R = canon(sig.subarray(0, 32));
  if (A === null || R === null || A.isSmallOrder() || R.isSmallOrder()) return false;
  const S = leInt(sig.subarray(32));
  if (S >= l) return false;
  const k = kOf(sig.subarray(0, 32), pk, msg);
  return B.multiplyUnsafe(S).equals(R.add(A.multiplyUnsafe(k)));
}
const zip215 = (pk: Uint8Array, sig: Uint8Array, msg: Uint8Array): boolean => ed25519.verify(sig, msg, pk, { zip215: true });
const nobleStrict = (pk: Uint8Array, sig: Uint8Array, msg: Uint8Array): boolean => ed25519.verify(sig, msg, pk, { zip215: false });

// Non-canonical encodings of the identity: y = p + 1 (reduces to y = 1), and y = 1 with the x sign bit set (x = 0).
const ID = hexToBytes('0100000000000000000000000000000000000000000000000000000000000000');
const ID_Y_PLUS_P = hexToBytes('eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f');
const ID_NEG_ZERO = hexToBytes('0100000000000000000000000000000000000000000000000000000000000080');

const a = 0x2d6f1b4c7a9e33n; // signer scalar for the hand-built signatures
const r = 0x51c0ffee1234n; // nonce scalar
const A = B.multiply(a).toBytes();
const Rb = B.multiply(r).toBytes();

interface Case {
  name: string;
  pk: Uint8Array;
  sig: Uint8Array;
  msg: Uint8Array;
  /** noble's own `zip215: false` result: it uses the cofactored equation, so mixed-order inputs pass it (CP-04). */
  nobleStrict: boolean;
}

function corpus(): Case[] {
  const msg = utf8('qv cp-08 zip215 sensitivity');
  const cases: Case[] = [];
  // small-order public keys: [8](R + kA - SB) = O for R = O, S = 0 regardless of k
  cases.push({ name: 'small-order A (identity), R = O, S = 0', pk: ID, sig: cat(ID, le32(0n)), msg, nobleStrict: false });
  cases.push({ name: 'small-order A (order-8 T), R = O, S = 0', pk: T8.toBytes(), sig: cat(ID, le32(0n)), msg, nobleStrict: false });
  // non-canonical A (identity as y = p + 1): R = [r]B, S = r
  cases.push({ name: 'non-canonical small-order A (y = p + 1)', pk: ID_Y_PLUS_P, sig: cat(Rb, le32(r)), msg, nobleStrict: false });
  // non-canonical R encodings of the identity with an honest key: S = k * a over the raw R bytes
  for (const [name, R] of [['y = p + 1', ID_Y_PLUS_P], ['x = 0 with sign bit', ID_NEG_ZERO]] as const) {
    const S = mod(kOf(R, A, msg) * a);
    cases.push({ name: `non-canonical small-order R (${name})`, pk: A, sig: cat(R, le32(S)), msg, nobleStrict: false });
  }
  // mixed-order R = [r]B + T: cofactored equation holds, cofactorless does not
  {
    const R = B.multiply(r).add(T8).toBytes();
    const S = mod(r + kOf(R, A, msg) * a);
    cases.push({ name: 'mixed-order R = [r]B + T8', pk: A, sig: cat(R, le32(S)), msg, nobleStrict: true });
  }
  // mixed-order A' = [a]B + T: residue [k]T vanishes only under the cofactor; pick a message with k mod 8 != 0
  {
    const Am = B.multiply(a).add(T8).toBytes();
    let m = msg;
    for (let i = 0; kOf(Rb, Am, m) % 8n === 0n; i++) m = utf8(`qv cp-08 zip215 sensitivity ${i}`);
    const S = mod(r + kOf(Rb, Am, m) * a);
    cases.push({ name: "mixed-order A' = [a]B + T8", pk: Am, sig: cat(Rb, le32(S)), msg: m, nobleStrict: true });
  }
  return cases;
}

test('CP-08 M18: signatures valid under ZIP-215 but invalid under strict RFC 8032 are rejected by ed25519Verify', () => {
  // positive control: an honest RFC 8032 signature passes all three verifiers
  const kp = ed25519Keypair(new Uint8Array(32).fill(11));
  const m0 = utf8('honest');
  const s0 = ed25519Sign(kp.secretKey, m0);
  assert.ok(zip215(kp.publicKey, s0, m0) && strictRfc8032(kp.publicKey, s0, m0) && ed25519Verify(kp.publicKey, s0, m0));
  // the hand-built signer is a correct RFC 8032 signer too (so every case below differs only in the edge component)
  const S1 = mod(r + kOf(Rb, A, m0) * a);
  assert.ok(strictRfc8032(A, cat(Rb, le32(S1)), m0) && ed25519Verify(A, cat(Rb, le32(S1)), m0), 'hand-built honest signature');

  const cases = corpus();
  assert.equal(cases.length, 7);
  for (const c of cases) {
    assert.equal(zip215(c.pk, c.sig, c.msg), true, `${c.name}: control, must be ZIP-215 valid`);
    assert.equal(strictRfc8032(c.pk, c.sig, c.msg), false, `${c.name}: control, must be strict-RFC-8032 invalid`);
    assert.equal(nobleStrict(c.pk, c.sig, c.msg), c.nobleStrict, `${c.name}: noble zip215:false result changed`);
    assert.equal(ed25519Verify(c.pk, c.sig, c.msg), false, `${c.name}: accepted by the QuietVote verify wrapper`);
    // the wrapper's pre-check is what rejects it (this is why M18 is behaviourally equivalent today)
    assert.equal(ed25519IsStrictPoint(c.pk) && ed25519IsStrictPoint(c.sig.subarray(0, 32)), false, `${c.name}: strict-point`);
  }
});

test('CP-08 M18: S >= l is rejected under both ZIP-215 and the wrapper (malleability is not a ZIP-215 leniency)', () => {
  const S = mod(r + kOf(Rb, A, utf8('m')) * a);
  const sig = cat(Rb, le32(S + l));
  assert.equal(zip215(A, sig, utf8('m')), false);
  assert.equal(ed25519Verify(A, sig, utf8('m')), false);
});

test('CP-08 M18 pin: every noble ed25519.verify call in packages/crypto/src passes { zip215: false } explicitly', () => {
  // Static guard (M18 is not observable through ed25519Verify, see header). noble's ed25519 defaults to zip215: true, so
  // an omitted or flipped option would leave the strict-point pre-checks as the only line of defence.
  const dir = new URL('../src/', import.meta.url);
  let calls = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /zip215\s*:\s*true/, `${f}: zip215 enabled`);
    for (const m of src.matchAll(/ed25519\.verify\(([^)]*)\)/g)) {
      calls++;
      assert.match(m[1]!, /,\s*\{\s*zip215\s*:\s*false\s*\}\s*$/, `${f}: ed25519.verify without explicit { zip215: false }`);
    }
  }
  assert.equal(calls, 1, 'expected exactly one noble verify call site (the ed25519Verify wrapper)');
});
