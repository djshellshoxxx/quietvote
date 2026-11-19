// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent review found that a rejected opening promise prevented the explicit settings retry from reopening.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, IdbStorage } from '../src/key/storage.ts';

function fixture() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  function connection() {
    return {
      closed: 0, reads: 0, stores: [] as string[],
      close() { this.closed++; }, createObjectStore(name: string) { this.stores.push(name); },
      transaction() {
        this.reads++;
        return { objectStore() { return { get() {
          const request = { result: undefined, onsuccess: undefined as (() => void) | undefined };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        } }; } };
      },
    };
  }
  type Opening = { result: ReturnType<typeof connection>; error: Error; onsuccess?: () => void; onerror?: () => void;
    onblocked?: () => void; onupgradeneeded?: () => void; transaction: { aborted: number; abort(): void } };
  const openings: Opening[] = [];
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() {
    const request: Opening = { result: connection(), error: new Error('transient open failure'), transaction: { aborted: 0, abort() { this.aborted++; } } };
    openings.push(request);
    return request;
  } } });
  return { openings, storage: new IdbStorage(), restore() {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  } };
}

test('simultaneous reads share one opening; an explicit retry after failure opens once and caches the success', async () => {
  const f = fixture();
  try {
    const first = Promise.allSettled([f.storage.getSettings(), f.storage.getSettings()]);
    assert.equal(f.openings.length, 1);
    f.openings[0]!.onerror!();
    assert.deepEqual((await first).map((result) => result.status), ['rejected', 'rejected']);
    const retry = Promise.all([f.storage.getSettings(), f.storage.getSettings()]);
    assert.equal(f.openings.length, 2);
    f.openings[1]!.onsuccess!();
    assert.deepEqual(await retry, [DEFAULT_SETTINGS, DEFAULT_SETTINGS]);
    assert.deepEqual(await f.storage.getSettings(), DEFAULT_SETTINGS);
    assert.equal(f.openings.length, 2);
    assert.equal(f.openings[1]!.result.closed, 0);
  } finally { f.restore(); }
});

test('a blocked abandoned opening cannot replace the retry connection and closes its late success', async () => {
  const f = fixture();
  try {
    const blocked = assert.rejects(f.storage.getSettings(), /blocked/);
    const old = f.openings[0]!;
    old.onblocked!(); await blocked;
    const retry = f.storage.getSettings();
    assert.equal(f.openings.length, 2);
    const current = f.openings[1]!;
    current.onsuccess!(); await retry;
    old.onupgradeneeded!();
    assert.equal(old.transaction.aborted, 1, 'an abandoned upgrade does not alter stores');
    assert.deepEqual(old.result.stores, []);
    old.onsuccess!();
    old.onerror!();
    assert.equal(old.result.closed, 1);
    assert.deepEqual(await f.storage.getSettings(), DEFAULT_SETTINGS);
    assert.equal(f.openings.length, 2);
    assert.equal(old.result.reads, 0);
    assert.equal(current.result.reads, 2);
    assert.equal(current.result.closed, 0);
  } finally { f.restore(); }
});
