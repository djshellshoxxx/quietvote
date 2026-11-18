import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY, ORDER, baseMul, cdsProve, cdsVerify, ctZero, elgamalDecryptToPoint,
  elgamalEncrypt, elgamalRerandomize, scalarAdd,
} from '../src/index.ts';

test('T-028: rerandomization preserves plaintext and uses the sum of encryption randomness', () => {
  const secret = 53n;
  const key = baseMul(secret);
  for (const message of [0n, 1n, 3n, 5000n]) {
    for (const [originalRandomness, additionalRandomness] of [[7n, 11n], [ORDER - 3n, 8n]]) {
      const original = elgamalEncrypt(key, message, originalRandomness!);
      const originalBytes = [original.A.toHex(), original.B.toHex()];
      const changed = elgamalRerandomize(key, original, additionalRandomness!);
      const expected = elgamalEncrypt(key, message, scalarAdd(originalRandomness!, additionalRandomness!));
      assert.ok(changed.A.equals(expected.A));
      assert.ok(changed.B.equals(expected.B));
      assert.ok(elgamalDecryptToPoint(changed, secret).equals(baseMul(message)));
      assert.ok(!changed.A.equals(original.A));
      assert.ok(!changed.B.equals(original.B));
      assert.deepEqual([original.A.toHex(), original.B.toHex()], originalBytes);
    }
  }
});

test('T-028: additional randomness must be a canonical nonzero bigint', () => {
  const key = baseMul(53n);
  const original = elgamalEncrypt(key, 1, 7n);
  for (const bad of [0n, -1n, ORDER, ORDER + 1n, 1, NaN, undefined, '1']) {
    assert.throws(() => elgamalRerandomize(key, original, bad as bigint), /randomness/);
  }
});

test('T-028: reject identity keys and cancellation that would expose the plaintext point', () => {
  const key = baseMul(53n);
  const original = elgamalEncrypt(key, 1, 7n);
  assert.throws(() => elgamalRerandomize(IDENTITY, original, 11n), /key.*identity/);
  assert.throws(() => elgamalRerandomize(key, original, ORDER - 7n), /randomness.*identity/);
  const zero = elgamalRerandomize(key, ctZero(), 11n);
  assert.ok(zero.A.equals(baseMul(11n)));
  assert.ok(elgamalDecryptToPoint(zero, 53n).equals(IDENTITY));
});

test('T-028: old CDS proof cannot authenticate a rerandomized ciphertext', () => {
  const key = baseMul(53n);
  const statement = {
    ctx: new Uint8Array(32).fill(1), binder: new Uint8Array(32).fill(2), cid: 'budget', oid: 'yes',
    K: key, ct: elgamalEncrypt(key, 1, 7n),
  };
  const proof = cdsProve(statement, 1, 7n, new Uint8Array(64).fill(9));
  assert.ok(cdsVerify(statement, proof));
  assert.equal(cdsVerify({ ...statement, ct: elgamalRerandomize(key, statement.ct, 11n) }, proof), false);
});
