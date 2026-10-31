import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { ed25519IsStrictPoint, ed25519Verify, ed25519Keypair, ed25519Sign, hexToBytes } from '../src/index.ts';

// CP-04: a mixed-order key (prime-order point + order-8 torsion) must not be a strict point.
const T = ed25519.Point.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a');

test('CP-04: mixed-order public keys and R values are rejected; honest keys still verify', () => {
  const mixed = ed25519.Point.BASE.multiply(0x1234567890abcdefn).add(T).toBytes();
  assert.equal(ed25519IsStrictPoint(mixed), false);
  assert.equal(ed25519IsStrictPoint(T.toBytes()), false);
  const kp = ed25519Keypair(new Uint8Array(32).fill(7));
  assert.equal(ed25519IsStrictPoint(kp.publicKey), true);
  const sig = ed25519Sign(kp.secretKey, new Uint8Array([1, 2, 3]));
  assert.equal(ed25519Verify(kp.publicKey, sig, new Uint8Array([1, 2, 3])), true);
  const badR = Uint8Array.from(sig);
  badR.set(ed25519.Point.fromBytes(sig.subarray(0, 32)).add(T).toBytes(), 0);
  assert.equal(ed25519Verify(kp.publicKey, badR, new Uint8Array([1, 2, 3])), false);
});

test('B1-11: a key-holder signature with identity R is rejected even though the verification equation holds', () => {
  const pk = hexToBytes('4128ade330b7b6e672bd56dc965ebf4ad9ffc86e4b35af8d84a8e5d7f6316b64');
  const msg = hexToBytes('623120736d616c6c2d6f726465722052');
  const sig = hexToBytes('0100000000000000000000000000000000000000000000000000000000000000a956cfd790020b17d61e57d0b7803d18c7c41ed8aa9b3a2a56dba578da032f0c');
  assert.equal(ed25519.verify(sig, msg, pk, { zip215: false }), true, 'equation control: S = k*a, R = O');
  assert.equal(ed25519Verify(pk, sig, msg), false, 'QV strict R policy');
});
