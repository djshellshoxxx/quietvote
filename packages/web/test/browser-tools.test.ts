// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('browser tooling can throw for a test-local skip without erasing an earlier failure', () => {
  const helper = new URL('../e2e/browser.ts', import.meta.url).href;
  const script = `import { browserTools } from ${JSON.stringify(helper)};
    process.exitCode = 7;
    try { browserTools({ required: true }); }
    catch (error) { console.log(error.message); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...process.env, QV_REQUIRE_BROWSER: '0', QV_CHROMIUM: '/nonexistent/qv-test-chromium' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 7, result.stderr);
  assert.match(result.stdout, /Browser checks unavailable: no Chromium executable/);
});
