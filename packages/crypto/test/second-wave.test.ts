// Second-wave triage (docs/audit/crypto-protocol.md, "Second-wave triage"). Each test was written to fail before its fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLE_MAX_LOGN, G, IDENTITY, ORDER, baseMul, canonicalize, dhProve, dhVerify, elgamalEncrypt, encryptShare, feldmanCommit,
  feldmanVerifyShare, lagrangeAtZero, limitVerify, openWithPassphrase, parseQvJson, pointMul, polyEval, sealWithPassphrase,
  streamRng, utf8,
} from '../src/index.ts';

const rng = streamRng('second-wave');

test('C1: encryptShare refuses an identity recipient key (DH output would be public)', async () => {
  await assert.rejects(encryptShare(new Uint8Array(32), 1, 2, IDENTITY, 5n, rng), { code: 'E_IDENTITY' });
  await encryptShare(new Uint8Array(32), 1, 2, baseMul(7n), 5n, rng);
});

test('C4: elgamalEncrypt requires 0 < r < l (r = l would give A = O)', () => {
  const K = baseMul(9n);
  for (const r of [0n, ORDER, ORDER + 1n, -1n]) assert.throws(() => elgamalEncrypt(K, 1, r), String(r));
  assert.equal(elgamalEncrypt(K, 1, 3n).A.equals(baseMul(3n)), true);
});

test('C5: canonicalize rejects values parseQvJson would reject (Map, typed arrays, NFD, lone surrogate keys, class instances)', () => {
  assert.throws(() => canonicalize(new Map([['a', 1]])), { code: 'E_PARSE' });
  assert.throws(() => canonicalize(new Uint8Array([1, 2])), { code: 'E_PARSE' });
  assert.throws(() => canonicalize({ d: new Date(0) }), { code: 'E_PARSE' });
  assert.throws(() => canonicalize('é'), { code: 'E_PARSE' });
  assert.throws(() => canonicalize({ ['é']: 1 }), { code: 'E_PARSE' });
  assert.throws(() => canonicalize({ ['\ud800']: 1 }), { code: 'E_PARSE' });
  // round trip still holds for profile values, including null-prototype objects from parseQvJson
  const v = parseQvJson('{"b":[1,true,"é"],"a":{"x":"y"}}');
  assert.equal(canonicalize(v), '{"a":{"x":"y"},"b":[1,true,"é"]}');
});

test('C6: limitVerify returns false (does not throw) for a non-u32 L', () => {
  const st = { ctx: new Uint8Array(32), binder: new Uint8Array(32), cid: 'c', K: baseMul(3n), Asum: G, Bsum: G };
  for (const L of [1.5, -1, 2 ** 32, Number.NaN]) assert.equal(limitVerify({ ...st, L }, { c: 1n, s: 1n }), false, String(L));
});

test('C7: index 0 is rejected by lagrangeAtZero and feldmanVerifyShare', () => {
  assert.throws(() => lagrangeAtZero([0], 0), { code: 'E_ARG' });
  assert.throws(() => lagrangeAtZero([0, 1], 1), { code: 'E_ARG' });
  const coeffs = [11n, 22n];
  const A = feldmanCommit(coeffs);
  assert.equal(feldmanVerifyShare(polyEval(coeffs, 0), A, 0), false);
  assert.equal(feldmanVerifyShare(polyEval(coeffs, 3), A, 3), true);
});

test('C8: dhVerify rejects identity Ej / R / S statements', () => {
  const mh = new Uint8Array(32);
  const R = baseMul(5n);
  const pr = dhProve(mh, 1, 2, IDENTITY, R, IDENTITY, 0n, rng);
  assert.equal(dhVerify(mh, 1, 2, IDENTITY, R, IDENTITY, pr), false);
  const e = 77n;
  const Ej = baseMul(e);
  const pr2 = dhProve(mh, 1, 2, Ej, R, pointMul(R, e), e, rng);
  assert.equal(dhVerify(mh, 1, 2, Ej, R, pointMul(R, e), pr2), true);
});

test('C10: openWithPassphrase refuses a header work factor above the cap before running scrypt', async () => {
  assert.ok(BUNDLE_MAX_LOGN <= 20);
  const f = await sealWithPassphrase(utf8('x'), 'pw', rng, { logN: 10, allowWeak: true });
  const forged = Uint8Array.from(f);
  forged[8] = 22;
  await assert.rejects(openWithPassphrase(forged, 'pw', { allowWeak: true }), { code: 'E_PARSE' });
  forged[8] = 12;
  await assert.rejects(openWithPassphrase(forged, 'pw', { allowWeak: true, maxLogN: 11 }), { code: 'E_PARSE' });
  assert.deepEqual(await openWithPassphrase(f, 'pw', { allowWeak: true, maxLogN: 10 }), utf8('x'));
});
