// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { observeNativeFixture, type NativeFixturePhase, type NativeFixtureTiming } from './helpers/native-fixture-observation.ts';

function fixture() {
  let current = 0;
  let callback: (() => void) | undefined;
  let stops = 0;
  const messages: string[] = [];
  const clock: NativeFixtureTiming = {
    now: () => current,
    heartbeat(next) {
      assert.equal(callback, undefined);
      callback = next;
      return () => { stops++; callback = undefined; };
    },
  };
  return {
    clock, messages,
    diagnostic: (message: string) => { messages.push(message); },
    advance(to: number, sample = false) {
      assert.ok(to >= current, 'the injected clock is monotonic');
      current = to;
      if (sample) { assert.ok(callback); callback(); }
    },
    assertStopped() {
      assert.equal(stops, 1);
      assert.equal(callback, undefined);
    },
  };
}

test('native fixture observation preserves success and records ordinary callback gaps', async () => {
  const f = fixture(), result = { saved: true };
  const actual = await observeNativeFixture('voter-key', async () => {
    f.advance(100, true);
    f.advance(200, true);
    f.advance(250);
    return result;
  }, f.diagnostic, f.clock);
  assert.equal(actual, result);
  assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
    phase: 'voter-key', elapsed_ms: 250, heartbeat_samples: 2, largest_callback_gap_ms: 100,
  }]);
  f.assertStopped();
});

test('native fixture observation retains a late callback gap', async () => {
  const f = fixture();
  await observeNativeFixture('invite', async () => {
    f.advance(100, true);
    f.advance(500, true);
    f.advance(525);
  }, f.diagnostic, f.clock);
  assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
    phase: 'invite', elapsed_ms: 525, heartbeat_samples: 2, largest_callback_gap_ms: 400,
  }]);
  f.assertStopped();
});

test('native fixture observation includes a terminal gap after the final callback', async () => {
  const f = fixture();
  await observeNativeFixture('voter-key', async () => {
    f.advance(100, true);
    f.advance(10_100);
  }, f.diagnostic, f.clock);
  assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
    phase: 'voter-key', elapsed_ms: 10_100, heartbeat_samples: 1, largest_callback_gap_ms: 10_000,
  }]);
  f.assertStopped();
});

test('native fixture observation preserves failure and measures a wait with no samples', async () => {
  const f = fixture(), refusal = new Error('fixture refused');
  await assert.rejects(observeNativeFixture('invite', async () => {
    f.advance(15_000);
    throw refusal;
  }, f.diagnostic, f.clock), error => error === refusal);
  assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
    phase: 'invite', elapsed_ms: 15_000, heartbeat_samples: 0, largest_callback_gap_ms: 15_000,
  }]);
  f.assertStopped();
});

test('native fixture observation cleans up after a synchronous operation failure', async () => {
  const f = fixture(), refusal = new Error('synchronous fixture refusal');
  await assert.rejects(observeNativeFixture('voter-key', () => {
    throw refusal;
  }, f.diagnostic, f.clock), error => error === refusal);
  f.assertStopped();
  assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
    phase: 'voter-key', elapsed_ms: 0, heartbeat_samples: 0, largest_callback_gap_ms: 0,
  }]);
});

test('native fixture observation stops before emitting and preserves outcomes if emission fails', async () => {
  for (const rejected of [false, true]) {
    const f = fixture(), result = {}, refusal = new Error('original fixture refusal');
    const pending = observeNativeFixture('invite', async () => {
      f.advance(123);
      if (rejected) throw refusal;
      return result;
    }, () => { f.assertStopped(); throw new Error('diagnostic sink unavailable'); }, f.clock);
    if (rejected) await assert.rejects(pending, error => error === refusal);
    else assert.equal(await pending, result);
    f.assertStopped();
  }
});

test('native fixture observation serializes only the four closed fields, never results or errors', async () => {
  const marker = 'PRIVATE-FIXTURE-OBSERVATION-CANARY';
  const privateValue = {
    path: marker, contents: marker, extra: marker,
    toJSON() { assert.fail('fixture values must not be serialized'); },
  };
  const refusal = Object.assign(new Error(marker), privateValue);
  for (const rejected of [false, true]) {
    const f = fixture();
    const pending = observeNativeFixture('voter-key', async () => {
      f.advance(0.6);
      if (rejected) throw refusal;
      return privateValue;
    }, f.diagnostic, f.clock);
    if (rejected) await assert.rejects(pending, error => error === refusal);
    else assert.equal(await pending, privateValue);
    assert.equal(f.messages.length, 1);
    assert.doesNotMatch(f.messages[0]!, new RegExp(marker));
    const observation = JSON.parse(f.messages[0]!) as Record<string, unknown>;
    assert.deepEqual(Object.keys(observation), ['phase', 'elapsed_ms', 'heartbeat_samples', 'largest_callback_gap_ms']);
    assert.deepEqual(observation, {
      phase: 'voter-key', elapsed_ms: 1, heartbeat_samples: 0, largest_callback_gap_ms: 1,
    });
    f.assertStopped();
  }
});

test('native fixture observation never logs an unknown runtime phase', async () => {
  const f = fixture(), result = {};
  const actual = await observeNativeFixture('PRIVATE-PHASE-CANARY' as NativeFixturePhase, async () => result, f.diagnostic, f.clock);
  assert.equal(actual, result);
  assert.deepEqual(f.messages, []);
});
