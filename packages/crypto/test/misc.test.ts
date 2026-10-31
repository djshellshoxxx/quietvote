import test from 'node:test';
import assert from 'node:assert/strict';
import {
  G, IDENTITY, ORDER, QvCryptoError, baseMul, bytesToHex, canonicalize, combineShares, decodeUtf8Strict, decryptShare,
  decryptShareWithDh, dlogSolve, dlogTable, encryptShare, feldmanCommit, feldmanEval, feldmanVerifyShare,
  h256, jcs, lagrangeAtZero, parseQvJson, pointMul, polyEval, publicKeyShare, reconstructSecret, scalarAdd,
  scalarRandomNonZero, streamRng, utf8, vecrng, pointSum, pointFromBytes, type Scalar,
} from '../src/index.ts';

const rng = streamRng('misc');

test('Feldman VSS + Lagrange: any t-subset reconstructs; t-1 shares do not match', () => {
  const t = 3, n = 5;
  const coeffs = Array.from({ length: t }, () => scalarRandomNonZero(rng));
  const A = feldmanCommit(coeffs);
  const shares = new Map<number, Scalar>();
  for (let j = 1; j <= n; j++) {
    const y = polyEval(coeffs, j);
    shares.set(j, y);
    assert.ok(feldmanVerifyShare(y, A, j));
    assert.ok(!feldmanVerifyShare(scalarAdd(y, 1n), A, j));
    assert.ok(!feldmanVerifyShare(y, A, j + 1));
  }
  const subsets = [[1, 2, 3], [1, 3, 5], [2, 4, 5], [3, 4, 5]];
  for (const S of subsets) assert.equal(reconstructSecret(S, shares), coeffs[0]);
  assert.notEqual(reconstructSecret([1, 2], shares), coeffs[0]);
  assert.throws(() => lagrangeAtZero([1, 1, 2], 1));
  assert.throws(() => lagrangeAtZero([1, 2], 3));
  assert.ok(feldmanEval(A, 0).equals(A[0]!));
});

test('Lagrange on points matches Appendix A.2 identities', () => {
  // lambda_1^{1,3} = 3/2 ; lambda_3^{1,3} = -1/2 ; lambda_1^{1,2}=2 ; lambda_2^{1,2} = -1
  assert.equal((lagrangeAtZero([1, 3], 1) * 2n) % ORDER, 3n);
  assert.equal((lagrangeAtZero([1, 3], 3) * 2n) % ORDER, ORDER - 1n);
  assert.equal(lagrangeAtZero([1, 2], 1), 2n);
  assert.equal(lagrangeAtZero([1, 2], 2), ORDER - 1n);
  const x = scalarRandomNonZero(rng);
  const f = [x, scalarRandomNonZero(rng)];
  const Ms = new Map<number, ReturnType<typeof baseMul>>();
  for (const j of [1, 2, 3]) Ms.set(j, pointMul(G, polyEval(f, j)));
  assert.ok(combineShares([1, 3], Ms).equals(baseMul(x)));
  assert.ok(combineShares([2, 3], Ms).equals(baseMul(x)));
  assert.throws(() => combineShares([1, 4], Ms));
});

test('public key share equals [s_j]G for joint polynomial', () => {
  const t = 2;
  const polys = [0, 1, 2].map(() => Array.from({ length: t }, () => scalarRandomNonZero(rng)));
  const commits = polys.map((p) => feldmanCommit(p));
  for (let j = 1; j <= 3; j++) {
    const sj = polys.reduce((acc, p) => scalarAdd(acc, polyEval(p, j)), 0n);
    assert.ok(publicKeyShare(commits, j).equals(baseMul(sj)));
  }
  assert.ok(pointSum([]).equals(IDENTITY));
});

test('BSGS: all values 0..V, bound edge, and failures', () => {
  for (const V of [0, 1, 2, 3, 10, 50]) {
    const tab = dlogTable(V);
    for (let T = 0; T <= V; T++) assert.equal(dlogSolve(baseMul(BigInt(T)), tab), T, `V=${V} T=${T}`);
    assert.equal(dlogSolve(baseMul(BigInt(V + 1)), tab), null);
    assert.equal(dlogSolve(pointMul(G, scalarRandomNonZero(rng)), tab), null);
  }
  assert.equal(dlogTable(2).m, 2);
  assert.throws(() => dlogTable(-1));
});

test('share cipher: round trip, binding to (i,j), tamper and DH-reveal decryption', async () => {
  const mh = h256('manifest', utf8('m'));
  const e = scalarRandomNonZero(rng);
  const E = baseMul(e);
  const y = scalarRandomNonZero(rng);
  const pkg = await encryptShare(mh, 1, 2, E, y, rng);
  assert.equal(pkg.ct.length, 32);
  assert.equal(pkg.tag.length, 16);
  assert.equal(await decryptShare(mh, 1, 2, e, pkg), y);
  await assert.rejects(decryptShare(mh, 2, 2, e, pkg), (er: unknown) => er instanceof QvCryptoError && er.code === 'E_AEAD');
  await assert.rejects(decryptShare(mh, 1, 3, e, pkg));
  await assert.rejects(decryptShare(h256('manifest', utf8('m2')), 1, 2, e, pkg));
  const bad = { ...pkg, ct: pkg.ct.slice() };
  bad.ct[0] = bad.ct[0]! ^ 1;
  await assert.rejects(decryptShare(mh, 1, 2, e, bad));
  // DH reveal: S = [e]R
  const R = pointFromBytes(pkg.R);
  assert.equal(await decryptShareWithDh(mh, 1, 2, pointMul(R, e), pkg), y);
});

test('vecrng is deterministic and label-separated', () => {
  assert.equal(bytesToHex(vecrng('a', 'x', 16)), bytesToHex(vecrng('a', 'x', 16)));
  assert.notEqual(bytesToHex(vecrng('a', 'x', 16)), bytesToHex(vecrng('a', 'y', 16)));
  assert.notEqual(bytesToHex(vecrng('a', 'x', 16)), bytesToHex(vecrng('b', 'x', 16)));
});

// -------------------------------------------------------------- QV-JSON

const perr = (s: string | Uint8Array): boolean => {
  try {
    parseQvJson(s);
    return false;
  } catch (e) {
    return e instanceof QvCryptoError && e.code === 'E_PARSE';
  }
};

test('QV-JSON parser rejects out-of-profile input', () => {
  assert.ok(perr('{"a":1,"a":2}'), 'duplicate key');
  assert.ok(perr('{"a":{"b":1,"b":1}}'), 'nested duplicate key');
  assert.ok(perr('null'));
  assert.ok(perr('{"a":null}'));
  assert.ok(perr('1.0'));
  assert.ok(perr('1e2'));
  assert.ok(perr('-0'));
  assert.ok(perr('9007199254740992'));
  assert.ok(perr('01'));
  assert.ok(perr('"\\ud800"'), 'escaped lone surrogate');
  assert.ok(perr(new Uint8Array([0x22, 0xc3, 0x28, 0x22])), 'invalid utf-8');
  assert.ok(perr(new Uint8Array([0xef, 0xbb, 0xbf, 0x31])), 'BOM');
  assert.ok(perr('"é"'), 'non-NFC');
  assert.ok(perr('[1,]'));
  assert.ok(perr('{"a":1} x'));
  assert.ok(perr('{"a" 1}'));
  assert.ok(perr('"\t"'), 'raw control char');
  assert.ok(perr('['.repeat(40) + ']'.repeat(40)), 'too deep');
});

test('QV-JSON parser accepts the profile and canonicalizes (RFC 8785)', () => {
  const v = parseQvJson('{ "b" : [1, 2, {"z":true,"a":false}], "a": "x\\u00e9\\n", "€": 0, "A": -5 }');
  assert.equal(canonicalize(v), '{"A":-5,"a":"xé\\n","b":[1,2,{"a":false,"z":true}],"€":0}');
  // UTF-16 code-unit ordering: U+1F600 (surrogates D83D) sorts BEFORE U+FF5E per code units
  assert.equal(canonicalize({ '～': 1, '\u{1f600}': 2 }), '{"\u{1f600}":2,"～":1}');
  assert.equal(canonicalize(' \u007f'), '" \u007f"');
  assert.equal(canonicalize('\u0001\u001f"\\'), '"\\u0001\\u001f\\"\\\\"');
  assert.equal(canonicalize([]), '[]');
  assert.equal(canonicalize({}), '{}');
  assert.equal(canonicalize(9007199254740991), '9007199254740991');
  assert.deepEqual(jcs({ a: 1 }), utf8('{"a":1}'));
  assert.equal(decodeUtf8Strict(utf8('ok')), 'ok');
});

test('canonicalize refuses out-of-profile values', () => {
  for (const bad of [null, undefined, 1.5, NaN, -0, 2 ** 53, Symbol.iterator, () => 1, { a: undefined }, '\ud800']) {
    assert.throws(() => canonicalize(bad as never), QvCryptoError);
  }
});

test('parse then canonicalize is idempotent for random structures (property)', () => {
  const r = streamRng('json-prop');
  const mk = (d: number): unknown => {
    const k = r.bytes(1)[0]! % (d > 2 ? 4 : 6);
    if (k === 0) return r.bytes(1)[0]! % 2 === 0;
    if (k === 1) return r.bytes(2)[0]! - 100;
    if (k === 2) return bytesToHex(r.bytes(3));
    if (k === 3) return 'é' + bytesToHex(r.bytes(1));
    if (k === 4) return Array.from({ length: r.bytes(1)[0]! % 4 }, () => mk(d + 1));
    const o: Record<string, unknown> = {};
    for (let i = 0; i < r.bytes(1)[0]! % 4; i++) o[bytesToHex(r.bytes(2))] = mk(d + 1);
    return o;
  };
  for (let i = 0; i < 200; i++) {
    const v = mk(0);
    const c = canonicalize(v);
    assert.equal(canonicalize(parseQvJson(c)), c);
    assert.equal(c, c.normalize('NFC'));
  }
});
