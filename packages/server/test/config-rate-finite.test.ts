import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/config.ts';

// QV-29: invalid rate configuration must fail at startup rather than silently
// accepting an unbounded token bucket.
test('non-finite rate config is rejected before server startup', () => {
  const base = { dataDir: '/not-used' };
  for (const value of [Infinity, -Infinity, Number.NaN]) {
    assert.throws(() => resolveConfig({ ...base, rate: { read: { limit: value, windowSec: 60 } } }), /rate\.read invalid/, 'invalid limit must fail');
    assert.throws(() => resolveConfig({ ...base, rate: { read: { limit: 6, windowSec: value } } }), /rate\.read invalid/, 'invalid window must fail');
    assert.throws(() => resolveConfig({ ...base, rate: { read: { limit: 6, windowSec: 60, burst: value } } }), /rate\.read invalid/, 'invalid burst must fail');
  }
  const good = resolveConfig({ ...base, rate: { read: { limit: 6, windowSec: 60, burst: 2 } } });
  assert.equal(good.rate.read.limit, 6);
  assert.equal(good.rate.read.windowSec, 60);
});
