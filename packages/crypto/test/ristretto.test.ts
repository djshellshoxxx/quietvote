import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, IDENTITY, ORDER, QvCryptoError, baseMul, bytesToHex, ed25519IsStrictPoint, ed25519Keypair, ed25519Sign,
  ed25519Verify, hexToBytes, isIdentity, pointAdd, pointFromBytes, pointMul, pointToBytes, scalarFromBytes,
  scalarFromWide, scalarInv, scalarMul, scalarRandomNonZero, scalarToBytes, constantRng, streamRng, concatBytes,
} from '../src/index.ts';

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof QvCryptoError ? e.code : 'other';
  }
  return undefined;
};

test('base point and identity encodings (RFC 9496)', () => {
  assert.equal(bytesToHex(pointToBytes(G)), 'e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76');
  assert.equal(bytesToHex(pointToBytes(IDENTITY)), '00'.repeat(32));
  assert.equal(bytesToHex(pointToBytes(baseMul(2n))), '6a493210f7499cd17fecb510ae0cea23a110e8d5b901f8acadd3095c73a3b919');
  assert.equal(bytesToHex(pointToBytes(baseMul(3n))), '94741f5d5d52755ece4f23f044ee27d5d1ea1e2bd196b462166b16152a9d0259');
});

test('group order constant', () => {
  assert.equal(ORDER, 2n ** 252n + 27742317777372353535851937790883648493n);
  assert.ok(isIdentity(baseMul(ORDER)));
  assert.ok(isIdentity(pointMul(G, 0n)));
});

test('round trip of [k]G for k = 0..16', () => {
  for (let k = 0n; k <= 16n; k++) {
    const P = baseMul(k);
    assert.ok(pointFromBytes(pointToBytes(P)).equals(P));
  }
});

const BAD = [
  '00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'f3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '0100000000000000000000000000000000000000000000000000000000000000',
  '01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '26948d35ca62e643e26a83177332e6b6afeb9d08e4268b650f1f5bbd8d81d371',
  '4eac077a713c57b4f4397629a4145982c661f48044dd3f96427d40b147d9742f',
  '3eb858e78f5a7254d8c9731174a94f76755fd3941c0ac93735c07ba14579630e',
  'a45fdc55c76448c049a1ab33f17023edfb2be3581e9c7aade8a6125215e04220',
];
test('invalid ristretto255 encodings are rejected (non-canonical, negative, non-square)', () => {
  for (const h of BAD) assert.equal(code(() => pointFromBytes(hexToBytes(h))), 'E_POINT_DECODE', h);
});

test('wrong lengths rejected', () => {
  assert.equal(code(() => pointFromBytes(new Uint8Array(31))), 'E_POINT_DECODE');
  assert.equal(code(() => pointFromBytes(new Uint8Array(33))), 'E_POINT_DECODE');
  assert.equal(code(() => scalarFromBytes(new Uint8Array(31))), 'E_LENGTH');
});

test('identity is a valid encoding but rejected when nonIdentity is demanded', () => {
  assert.ok(isIdentity(pointFromBytes(new Uint8Array(32))));
  assert.equal(code(() => pointFromBytes(new Uint8Array(32), { nonIdentity: true })), 'E_IDENTITY');
});

test('scalar strict decoding: l and 2^256-1 rejected, l-1 accepted, never reduced', () => {
  const l = scalarToBytes(ORDER - 1n);
  assert.equal(scalarFromBytes(l), ORDER - 1n);
  const le = (x: bigint): Uint8Array => {
    const o = new Uint8Array(32);
    for (let i = 0; i < 32; i++, x >>= 8n) o[i] = Number(x & 255n);
    return o;
  };
  assert.equal(code(() => scalarFromBytes(le(ORDER))), 'E_SCALAR_RANGE');
  assert.equal(code(() => scalarFromBytes(le(2n ** 256n - 1n))), 'E_SCALAR_RANGE');
  assert.equal(code(() => scalarToBytes(ORDER)), 'E_SCALAR_RANGE');
  assert.equal(scalarFromBytes(le(0n)), 0n);
});

test('scalar arithmetic and wide reduction', () => {
  const a = 123456789123456789n;
  assert.equal(scalarMul(a, scalarInv(a)), 1n);
  assert.throws(() => scalarInv(0n));
  assert.equal(scalarFromWide(new Uint8Array(64).fill(0xff)), (2n ** 512n - 1n) % ORDER);
  assert.throws(() => scalarFromWide(new Uint8Array(32)));
});

test('random non-zero scalars: zero RNG output never yields zero (REQ-003)', () => {
  let calls = 0;
  const rng = {
    bytes(n: number) {
      calls++;
      return calls < 3 ? new Uint8Array(n) : new Uint8Array(n).fill(7);
    },
  };
  assert.notEqual(scalarRandomNonZero(rng), 0n);
  assert.ok(calls >= 3);
  assert.throws(() => scalarRandomNonZero(constantRng(0)));
});

test('group homomorphism property (randomised)', () => {
  const rng = streamRng('prop-1');
  for (let i = 0; i < 20; i++) {
    const a = scalarRandomNonZero(rng);
    const b = scalarRandomNonZero(rng);
    assert.ok(pointAdd(baseMul(a), baseMul(b)).equals(baseMul((a + b) % ORDER)));
    assert.ok(pointMul(baseMul(a), b).equals(baseMul((a * b) % ORDER)));
  }
});

test('ed25519: RFC 8032 test 1/2 and strictness', () => {
  const sk1 = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
  const kp = ed25519Keypair(sk1);
  assert.equal(bytesToHex(kp.publicKey), 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  const sig = ed25519Sign(sk1, new Uint8Array(0));
  assert.equal(
    bytesToHex(sig),
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  );
  assert.ok(ed25519Verify(kp.publicKey, sig, new Uint8Array(0)));
  // S >= l (add l to S) must be rejected (malleability)
  const l = ORDER;
  let S = 0n;
  for (let i = 63; i >= 32; i--) S = (S << 8n) | BigInt(sig[i]!);
  let S2 = S + l;
  const mall = sig.slice();
  for (let i = 32; i < 64; i++, S2 >>= 8n) mall[i] = Number(S2 & 255n);
  assert.ok(!ed25519Verify(kp.publicKey, mall, new Uint8Array(0)));
  // small-order public key (identity, y=1) rejected
  const ident = new Uint8Array(32);
  ident[0] = 1;
  assert.ok(!ed25519IsStrictPoint(ident));
  assert.ok(!ed25519Verify(ident, concatBytes(ident, new Uint8Array(32)), new Uint8Array(0)));
  // non-canonical y (y = p + 1 encoded)
  const nc = hexToBytes('eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f');
  assert.ok(!ed25519IsStrictPoint(nc));
  assert.ok(!ed25519Verify(kp.publicKey, new Uint8Array(63), new Uint8Array(0)));
});
