import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Reader } from '../src/bytes.ts';

test('Reader.raw rejects invalid lengths without changing the cursor', () => {
  for (const length of [-1, -0.5, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const reader = new Reader(Uint8Array.from([0x11, 0x22, 0x33]));
    assert.throws(() => reader.raw(length), RangeError, `length=${String(length)}`);
    assert.deepEqual(reader.raw(3), Uint8Array.from([0x11, 0x22, 0x33]), `cursor changed for ${String(length)}`);
    assert.equal(reader.atEnd, true);
  }
});

test('Reader.raw preserves exact-boundary and zero-length reads', () => {
  const reader = new Reader(Uint8Array.from([0x11, 0x22, 0x33]));
  assert.deepEqual(reader.raw(0), new Uint8Array(0));
  assert.deepEqual(reader.raw(2), Uint8Array.from([0x11, 0x22]));
  assert.throws(() => reader.raw(2), RangeError);
  assert.deepEqual(reader.raw(1), Uint8Array.from([0x33]));
  assert.equal(reader.atEnd, true);
});
