// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReceiptCheckGate } from '../src/flow/receipt-check-gate.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('editing A to B while A is awaiting verification suppresses A output and head pinning', async () => {
  const gate = new ReceiptCheckGate();
  const response = deferred();
  const output: string[] = [];
  const pins: number[] = [];
  const pending = gate.run(async (current) => {
    await response.promise;
    if (!current()) return;
    pins.push(10);
    output.push('A included');
  });
  gate.invalidate(); // Receipt input's input/change handler.
  assert.equal(await gate.run(async () => { output.push('B concurrent'); }), false);
  response.resolve();
  await pending;
  assert.equal(output.length, 0);
  assert.equal(pins.length, 0);
  await gate.run(async (current) => { if (current()) { pins.push(11); output.push('B included'); } });
  assert.deepEqual(output, ['B included']);
  assert.deepEqual(pins, [11]);
});

test('upload and stored checks cannot overlap an awaited head write or overwrite a newer check', async () => {
  const gate = new ReceiptCheckGate();
  const write = deferred();
  const pins: number[] = [];
  const first = gate.run(async (current) => {
    assert.equal(current(), true);
    await write.promise;
    pins.push(10);
  });
  assert.equal(await gate.run(async () => { pins.push(11); }), false);
  write.resolve();
  await first;
  assert.equal(await gate.run(async () => { pins.push(11); }), true);
  assert.deepEqual(pins, [10, 11]);
});

test('a failed receipt request releases the gate for a later check', async () => {
  const gate = new ReceiptCheckGate();
  await assert.rejects(gate.run(async () => { throw new Error('failed lookup'); }));
  assert.equal(await gate.run(async (current) => { assert.equal(current(), true); }), true);
});
