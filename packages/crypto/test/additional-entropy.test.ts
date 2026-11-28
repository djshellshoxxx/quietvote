// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-17-REQ-012
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, hkdfSync } from 'node:crypto';
import { additionalEntropyRng, QvCryptoError, streamRng, utf8, type Rng } from '../src/index.ts';

test('additive entropy follows independent native HKDF-SHA256 composition across expansion blocks', () => {
  const entropy = utf8('123456'.repeat(50)), original = entropy.slice();
  const supplied: Uint8Array[] = [];
  const mixed = additionalEntropyRng({ bytes(n) {
    assert.equal(n, 32);
    const fresh = new Uint8Array(n).fill(supplied.length + 1);
    supplied.push(fresh);
    return fresh;
  } }, entropy);
  try {
    const actual = mixed.bytes(9000), prefix = Buffer.from('QuietVote trustee additional entropy v1');
    const expected = [8160, 840].map((length, i) => {
      const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(i));
      return Buffer.from(hkdfSync('sha256', Buffer.alloc(32, i + 1), createHash('sha256').update(entropy).digest(), Buffer.concat([prefix, counter]), length));
    });
    assert.deepEqual(Buffer.from(actual), Buffer.concat(expected));
    assert.equal(supplied.length, 2);
    assert.ok(supplied.every(bytes => bytes.every(byte => byte === 0)), 'source buffers are wiped after use');
    assert.deepEqual(entropy, original, 'caller-owned additional input is unchanged');
  } finally { mixed.destroy(); }
});

test('additional entropy and fresh platform input both affect the output', () => {
  const run = (seed: string, dice: string): Uint8Array => {
    const mixed = additionalEntropyRng(streamRng(seed), utf8(dice));
    try { return mixed.bytes(64); } finally { mixed.destroy(); }
  };
  const a = run('base-a', '123456');
  assert.deepEqual(a, run('base-a', '123456'));
  assert.notDeepEqual(a, streamRng('base-a').bytes(64));
  assert.notDeepEqual(a, run('base-a', '654321'));
  assert.notDeepEqual(a, run('base-b', '123456'));
});

test('each request needs source bytes and separate counter input even with a fixed test RNG', () => {
  let calls = 0;
  const mixed = additionalEntropyRng({ bytes: n => { calls++; return new Uint8Array(n).fill(7); } }, utf8('123456'));
  try {
    const first = mixed.bytes(32), second = mixed.bytes(32);
    assert.notDeepEqual(first, second);
    assert.equal(calls, 2);
  } finally { mixed.destroy(); }
});

test('missing, throwing, short and all-zero sources never fall back to dice alone', () => {
  const canary = 'PRIVATE-ENTROPY-SOURCE-CANARY';
  for (const source of [undefined, { bytes: () => { throw new Error(canary); } },
    { bytes: () => new Uint8Array(31).fill(1) }, { bytes: n => new Uint8Array(n) }] as (Rng | undefined)[]) {
    const mixed = additionalEntropyRng(source as Rng, utf8('654321'.repeat(50)));
    try {
      assert.throws(() => mixed.bytes(32), (error: unknown) => error instanceof QvCryptoError &&
        error.code === 'E_ARG' && !error.message.includes(canary));
    } finally { mixed.destroy(); }
  }
});

test('bounded input and closed RNG refuse without reading the source', () => {
  let calls = 0;
  const source = { bytes: (n: number) => { calls++; return new Uint8Array(n).fill(1); } };
  assert.throws(() => additionalEntropyRng(source, new Uint8Array()), QvCryptoError);
  assert.throws(() => additionalEntropyRng(source, new Uint8Array(8193)), QvCryptoError);
  const mixed = additionalEntropyRng(source, utf8('1'));
  assert.deepEqual(mixed.bytes(0), new Uint8Array());
  for (const length of [-1, 1.5, NaN, Infinity, 1024 * 1024 + 1]) assert.throws(() => mixed.bytes(length), QvCryptoError);
  mixed.destroy(); mixed.destroy();
  assert.throws(() => mixed.bytes(32), QvCryptoError);
  assert.equal(calls, 0);
});
