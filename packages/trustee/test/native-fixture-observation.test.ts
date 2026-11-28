// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { observeNativeFixture, type NativeFixturePhase, type NativeFixtureTiming } from './helpers/native-fixture-observation.ts';

function fixture(phase: NativeFixturePhase = 'audit-cast-rewrap-keygen') {
  let current = 0;
  let callback: (() => void) | undefined;
  let starts = 0;
  let stops = 0;
  const messages: string[] = [];
  const clock: NativeFixtureTiming = {
    now: () => current,
    heartbeat(next) {
      starts++;
      assert.equal(callback, undefined);
      callback = next;
      return () => { stops++; callback = undefined; };
    },
  };
  return {
    clock, messages, observation: { phase, diagnostic: (message: string) => { messages.push(message); } },
    advance(to: number, sample = false) {
      assert.ok(to >= current, 'the injected clock is monotonic');
      current = to;
      if (sample) { assert.ok(callback); callback(); }
    },
    assertStopped(expected = 1) {
      assert.equal(starts, expected);
      assert.equal(stops, expected);
      assert.equal(callback, undefined);
    },
  };
}

test('trustee timing keeps success identity and records only fixed counters, including a terminal callback gap', async () => {
  const f = fixture(), marker = 'PRIVATE-SUCCESS-CANARY';
  const result = { path: marker, seed: marker, payload: marker, toJSON() { assert.fail('result must never be serialized'); } };
  const actual = await observeNativeFixture(f.observation, async () => {
    f.advance(100, true);
    f.advance(450, true);
    f.advance(1000);
    return result;
  }, f.clock);
  assert.equal(actual, result);
  assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
    phase: 'audit-cast-rewrap-keygen', elapsed_ms: 1000, heartbeat_samples: 2, largest_callback_gap_ms: 550,
  }]);
  assert.doesNotMatch(f.messages.join(''), new RegExp(marker));
  f.assertStopped();
});

test('trustee timing keeps original async and synchronous errors and stops when no heartbeat has run', async () => {
  for (const synchronous of [false, true]) {
    const f = fixture('audit-before-open-keygen'), marker = 'PRIVATE-ERROR-CANARY';
    const refusal = Object.assign(new Error(marker), { path: marker, passphrase: marker,
      toJSON() { assert.fail('error must never be serialized'); },
    });
    const reject = (): never => { f.advance(15_000); throw refusal; };
    await assert.rejects(observeNativeFixture(f.observation, synchronous ? reject : async () => reject(), f.clock), error => error === refusal);
    assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
      phase: 'audit-before-open-keygen', elapsed_ms: 15_000, heartbeat_samples: 0, largest_callback_gap_ms: 15_000,
    }]);
    assert.doesNotMatch(f.messages.join(''), new RegExp(marker));
    f.assertStopped();
  }
});

test('a failed trustee diagnostic sink preserves the result or original error after heartbeat cleanup', async () => {
  for (const rejected of [false, true]) {
    const f = fixture('board-export-keygen'), result = {}, refusal = new Error('original fixture refusal');
    const pending = observeNativeFixture({ ...f.observation, diagnostic() {
      f.assertStopped();
      throw new Error('diagnostic sink unavailable');
    } }, async () => {
      f.advance(100, true);
      f.advance(200);
      if (rejected) throw refusal;
      return result;
    }, f.clock);
    if (rejected) await assert.rejects(pending, error => error === refusal);
    else assert.equal(await pending, result);
    f.assertStopped();
  }
});

test('trustee timing accepts the remaining closed labels and never emits an unknown runtime label', async () => {
  for (const phase of ['board-tally-export-keygen', 'ceremony-honest-keygen', 'ceremony-bad-share-keygen'] as const) {
    const f = fixture(phase);
    await observeNativeFixture(f.observation, async () => undefined, f.clock);
    assert.deepEqual(f.messages.map(message => JSON.parse(message)), [{
      phase, elapsed_ms: 0, heartbeat_samples: 0, largest_callback_gap_ms: 0,
    }]);
    f.assertStopped();
  }
  const f = fixture('PRIVATE-LABEL-CANARY' as NativeFixturePhase), result = {};
  assert.equal(await observeNativeFixture(f.observation, async () => result, f.clock), result);
  assert.deepEqual(f.messages, []);
  f.assertStopped(0);
});
