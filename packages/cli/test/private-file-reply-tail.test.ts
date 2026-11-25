// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep experimental module mocking inside a dedicated child on supported Node
// versions. Both actual package-local bridges are checked by the same fixture.
test('native bridges enforce JSON response framing and preserve cleanup', () => {
  const fixture = fileURLToPath(new URL('./fixtures/windows-private-reply-tail.mjs', import.meta.url));
  const env = { ...process.env };
  delete env['NODE_TEST_CONTEXT'];
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test', '--test-concurrency=1', '--test-reporter=tap', fixture], {
    encoding: 'utf8', timeout: 10_000, env,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tests 20/);
  assert.match(result.stdout, /pass 20/);
  assert.match(result.stdout, /skipped 0/);
});
