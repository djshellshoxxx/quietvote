import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupSymbols } from '../src/util/crockford.ts';

test('display grouping keeps existing canonical four-symbol and explicit grouping', () => {
  assert.equal(groupSymbols('0123456789'), '0123-4567-89');
  assert.equal(groupSymbols('ABCDEFG', 3), 'ABC-DEF-G');
  assert.equal(groupSymbols('', 4), '');
});

test('display grouping refuses nonpositive, non-integer and unbounded group sizes', () => {
  for (const size of [0, -1, -1.5, -Infinity, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => groupSymbols('ABCDEFG', size), RangeError, `size=${String(size)}`);
    assert.throws(() => groupSymbols('', size), RangeError, `empty code, size=${String(size)}`);
  }
});
