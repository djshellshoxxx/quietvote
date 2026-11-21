// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The isolated child uses ordinary simulated transport events and a mock clock.
// This does not execute native Windows file operations or qualify their latency.
test('asynchronous native deadlines identify the pending operation without replay or private data', () => {
  const fixture = fileURLToPath(new URL('./fixtures/windows-private-operation-diagnostics.mjs', import.meta.url));
  const env = { ...process.env };
  delete env['NODE_TEST_CONTEXT'];
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks', '--test', '--test-concurrency=1', '--test-reporter=tap', fixture], {
    encoding: 'utf8', timeout: 10_000, env,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tests 3/);
  assert.match(result.stdout, /pass 3/);
  assert.match(result.stdout, /skipped 0/);
});
