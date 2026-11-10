import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SealRequest, SealResponse } from '../src/flow/seal.ts';
import { workerSealer } from '../src/worker/worker-sealer.ts';

const workerFailed: SealResponse = { ok: false, error: 'worker failed' };

async function withFakeWorker(Fake: typeof Worker, run: () => Promise<void>): Promise<void> {
  const globals = globalThis as { Worker?: typeof Worker };
  const previous = globals.Worker;
  globals.Worker = Fake;
  try {
    await run();
  } finally {
    if (previous === undefined) delete globals.Worker;
    else globals.Worker = previous;
  }
}

test('sealing worker terminates and reports failure if postMessage throws synchronously', async () => {
  let started = 0;
  let stopped = 0;
  class FakeWorker {
    onmessage: ((event: MessageEvent<SealResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
    constructor() { started++; }
    postMessage(): void { throw new Error('structured-clone rejected request'); }
    terminate(): void { stopped++; }
  }
  await withFakeWorker(FakeWorker as unknown as typeof Worker, async () => {
    const sealer = workerSealer('/assets/seal-worker.js');
    assert.ok(sealer);
    assert.deepEqual(await sealer.seal({} as SealRequest), workerFailed);
  });
  assert.equal(started, 1);
  assert.equal(stopped, 1, 'failed posting must not leave a live Worker');
});

test('sealing worker terminates and settles if message deserialization fails', async () => {
  let stopped = 0;
  class FakeWorker {
    onmessage: ((event: MessageEvent<SealResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
    postMessage(): void {
      queueMicrotask(() => this.onmessageerror?.({ type: 'messageerror' } as MessageEvent<unknown>));
    }
    terminate(): void { stopped++; }
  }
  await withFakeWorker(FakeWorker as unknown as typeof Worker, async () => {
    const sealer = workerSealer('/assets/seal-worker.js');
    assert.ok(sealer);
    const bounded = await Promise.race([
      sealer.seal({} as SealRequest),
      new Promise<'unsettled'>((resolve) => setTimeout(() => resolve('unsettled'), 200)),
    ]);
    assert.deepEqual(bounded, workerFailed, 'messageerror must not leave the UI stuck sealing');
  });
  assert.equal(stopped, 1, 'messageerror must terminate the Worker');
});

test('successful Worker messages still resolve and terminate once', async () => {
  let stopped = 0;
  const received: SealResponse = { ok: false, error: 'invalid selection' };
  class FakeWorker {
    onmessage: ((event: MessageEvent<SealResponse>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
    postMessage(): void {
      queueMicrotask(() => this.onmessage?.({ data: received } as MessageEvent<SealResponse>));
    }
    terminate(): void { stopped++; }
  }
  await withFakeWorker(FakeWorker as unknown as typeof Worker, async () => {
    const sealer = workerSealer('/assets/seal-worker.js');
    assert.ok(sealer);
    assert.deepEqual(await sealer.seal({} as SealRequest), received);
  });
  assert.equal(stopped, 1);
});
