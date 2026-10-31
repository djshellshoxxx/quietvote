import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519Keypair, ed25519Sign, ed25519Verify, sha256 } from '../src/index.ts';

test('sha256 abc', () => {
  const h = Buffer.from(sha256(new TextEncoder().encode('abc'))).toString('hex');
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('ed25519 sign/verify', () => {
  const kp = ed25519Keypair();
  const m = new Uint8Array([1, 2, 3]);
  const s = ed25519Sign(kp.secretKey, m);
  assert.ok(ed25519Verify(kp.publicKey, s, m));
  assert.ok(!ed25519Verify(kp.publicKey, s, new Uint8Array([9])));
});
