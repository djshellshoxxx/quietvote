// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-014
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const runner = new URL('./run-browser-journeys.sh', import.meta.url).pathname;
const journeys = ['run', 'help', 'a11y', 'verifier', 'spoil-shares'];
function run({ failed = '', missingNode = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qv-browser-runner-'));
  try {
    const log = join(root, 'journeys.log');
    if (!missingNode) writeFileSync(join(root, 'node'), `#!/bin/bash
printf '%s %s\\n' "$QV_REQUIRE_BROWSER" "$1" >> "$QV_TEST_LOG"
if [[ "$1" == "$QV_TEST_FAIL" ]]; then exit 7; fi
`, { mode: 0o755 });
    // Only the fake node is discoverable. The runner must fail if it is absent.
    const result = spawnSync('/bin/bash', [runner], {
      encoding: 'utf8',
      env: { ...process.env, PATH: root, QV_REQUIRE_BROWSER: '0', QV_TEST_LOG: log, QV_TEST_FAIL: failed },
    });
    assert.equal(result.error, undefined);
    return { ...result, calls: missingNode ? '' : readFileSync(log, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('runs all five journeys with browser tooling required even if caller permits skips', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.trim().split('\n'), journeys.map((name) => `1 packages/web/e2e/${name}.ts`));
  assert.doesNotMatch(result.stdout, /::error::/);
});

test('first, middle and last journey failures remain failures and cannot hide other journeys', () => {
  for (const failed of ['run', 'a11y', 'spoil-shares']) {
    const result = run({ failed: `packages/web/e2e/${failed}.ts` });
    assert.equal(result.status, 1, failed);
    assert.equal(result.calls.trim().split('\n').length, 5, failed);
    assert.match(result.stdout, new RegExp('::error::Browser journey failed: ' + failed));
  }
});

test('missing node executable fails every journey instead of reporting a browser pass', () => {
  const result = run({ missingNode: true });
  assert.equal(result.status, 1);
  assert.equal((result.stdout.match(/::error::Browser journey failed:/g) ?? []).length, 5);
});
