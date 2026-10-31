import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { qv, TINY, tmp } from './helpers.ts';

test('board verify refuses an external witness policy for an election bundle', async () => {
  const result = await qv(['board', 'verify', TINY, '--witness-policy', join(tmp(), 'absent-policy.json'), '--json']);
  assert.equal(result.code, 2, result.out + result.err);
  assert.match(result.err, /witness-policy.*standalone|witness-policy.*election bundle/);
  assert.equal(result.out, '');
});
