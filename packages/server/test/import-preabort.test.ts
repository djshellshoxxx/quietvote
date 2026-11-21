import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBundle } from '../src/imports.ts';
import type { Env } from '../src/env.ts';

// Cooperative scheduling: an already-cancelled import must not inspect untrusted archive bytes.
test('an already-aborted import exits before archive parsing or progress callbacks', async () => {
  const controller = new AbortController();
  const reason = new Error('synthetic cancellation before import verification');
  controller.abort(reason);
  let ticked = false;
  let progressed = false;
  await assert.rejects(
    verifyBundle(
      {} as Env,
      new Uint8Array(0),
      undefined,
      async () => { ticked = true; },
      () => { progressed = true; },
      controller.signal,
    ),
    (error: unknown) => error === reason,
  );
  assert.equal(ticked, false);
  assert.equal(progressed, false);
});
