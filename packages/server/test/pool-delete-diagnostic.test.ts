// Operator-facing deletion diagnostics must match the already-authorized state policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ElectionPool } from '../src/pool.ts';
import { ApiError } from '../src/problem.ts';
import type { Env } from '../src/env.ts';

test('rejected deletion lists IMPORTED among the pre-existing permitted states', async () => {
  let changed = false;
  const env = {
    control: {
      election: () => ({ state: 'OPEN' }),
      markDeleted: () => { changed = true; },
    },
  } as unknown as Env;
  await assert.rejects(
    new ElectionPool(env).remove('0123456789abcdef0123456789abcdef'),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'STATE_CONFLICT');
      assert.equal(error.status, 409);
      assert.match(error.message, /state must be DRAFT, ARCHIVED, CANCELLED, ABORTED or IMPORTED$/);
      return true;
    },
  );
  assert.equal(changed, false, 'a refused deletion must not erase its registration');
});
