// QV-ADR-027 N-32(a): approved /56 network grouping, recovered from PR #27.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BucketKeyer, RateLimiter } from '../src/ratelimit.ts';

test('all 256 IPv6 /64 networks within a /56 share one rate-limit bucket', () => {
  const keyer = new BucketKeyer(() => 0);
  const expected = keyer.bucket('2001:db8:1234:5600::1');
  for (let subnet = 0; subnet <= 255; subnet++) {
    const address = `2001:db8:1234:${(0x5600 + subnet).toString(16)}:abcd:ef01:2345:6789`;
    assert.equal(keyer.bucket(address), expected, address);
  }
  assert.notEqual(keyer.bucket('2001:db8:1234:55ff:ffff:ffff:ffff:ffff'), expected, 'previous /56');
  assert.notEqual(keyer.bucket('2001:db8:1234:5700::'), expected, 'next /56');
  assert.notEqual(keyer.bucket('2001:db8:1235:5600::1'), expected, 'earlier prefix bits');
});

test('IPv6 compression, letter case and zone suffixes cannot split a network bucket', () => {
  const keyer = new BucketKeyer(() => 0);
  const expected = keyer.bucket('2001:db8:0:0:1:2:3:4');
  for (const address of [
    '2001:db8::1:2:3:4', '2001:0DB8:0000:00ff:0001:0002:0003:0004',
    '2001:db8:0:ff::1', '2001:db8:0:ff::1%eth0',
  ]) assert.equal(keyer.bucket(address), expected, address);
  assert.equal(keyer.bucket('::'), keyer.bucket('0:0:0:ff:ffff:ffff:ffff:ffff'));
  assert.notEqual(keyer.bucket('::'), keyer.bucket('0:0:0:100::'));
  assert.equal(keyer.bucket('fe80::1%eth0'), keyer.bucket('FE80:0:0:ff::2%eth1'));
});

test('requests from distinct /64s consume the same /56 allowance', () => {
  const keyer = new BucketKeyer(() => 0);
  const limiter = new RateLimiter(() => 0);
  const spec = { limit: 2, windowSec: 60 };
  assert.equal(limiter.take(keyer.bucket('2001:db8:1:2a00::1'), spec).ok, true);
  assert.equal(limiter.take(keyer.bucket('2001:db8:1:2a01::2'), spec).ok, true);
  assert.equal(limiter.take(keyer.bucket('2001:db8:1:2aff::3'), spec).ok, false);
  assert.equal(limiter.take(keyer.bucket('2001:db8:1:2b00::1'), spec).ok, true);
});

test('IPv4 /24 and IPv4-mapped bucketing remain separate from IPv6', () => {
  const keyer = new BucketKeyer(() => 0);
  assert.equal(keyer.bucket('192.0.2.1'), keyer.bucket('192.0.2.254'));
  assert.equal(keyer.bucket('192.0.2.1'), keyer.bucket('::ffff:192.0.2.254'));
  assert.notEqual(keyer.bucket('192.0.2.1'), keyer.bucket('192.0.3.1'));
  assert.notEqual(keyer.bucket('192.0.2.1'), keyer.bucket('::c000:201'));
});
