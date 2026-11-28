// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-014 QV-30-REQ-013
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { runCli } from './coverage-report.mjs';

const launcher = resolve(import.meta.dirname, 'test-workspace.mjs');
const env = () => {
  const result = { ...process.env }; delete result.NODE_TEST_CONTEXT; delete result.QV_COVERAGE_OUTPUT;
  result.PATH = dirname(process.execPath) + delimiter + (result.PATH ?? '');
  return result;
};
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'qv-test-launcher-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) { mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), text); }
  return root;
}
function run(cwd, args, extra = {}) {
  const result = spawnSync(process.execPath, args, { cwd, env: { ...env(), ...extra }, encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message); return result;
}

test('all eight manifest edits keep existing workspace hooks and select the shared launcher', () => {
  for (const name of ['board', 'cli', 'crypto', 'protocol', 'server', 'trustee', 'verifier', 'web']) {
    const pkg = JSON.parse(readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url), 'utf8'));
    assert.equal(pkg.scripts.test, (name === 'web' ? 'npm run i18n:check && ' : '') + 'node ../../scripts/test-workspace.mjs');
  }
});

test('actual spawned runner preserves stdout, stderr, nonzero exits and the unchanged explicit test glob', (t) => {
  const root = fixture(t, {
    'test/one.test.ts': "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('visible test', () => { console.log('visible stdout'); console.error('visible stderr'); assert.equal(process.env.QV_COVERAGE_OUTPUT, undefined); });\n",
    'test/fixture.ts': "throw new Error('the test glob must not execute this helper');\n",
  });
  const output = join(root, 'coverage.json');
  const passing = run(root, [launcher], { QV_COVERAGE_OUTPUT: output });
  assert.equal(passing.status, 0, passing.stdout + passing.stderr);
  assert.match(passing.stdout, /visible test/); assert.match(passing.stdout, /visible stdout/);
  assert.match(passing.stdout + passing.stderr, /visible stderr/);
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).testRun.success, true);
  const badFlag = ['--test-quietvote-unsupported-flag'];
  const direct = run(root, ['--test', '--test-reporter=spec', ...badFlag, 'test/**/*.test.ts']);
  const wrapped = run(root, [launcher, ...badFlag]);
  assert.ok(direct.status > 0); assert.equal(wrapped.status, direct.status);
});

test('actual child-runner unhandled signal termination remains a signal through the launcher', (t) => {
  // The test runner handles SIGTERM itself; SIGKILL distinguishes a real signal result from its normal exit handling.
  const root = fixture(t, { 'test/terminate.test.ts': "process.kill(process.ppid, 'SIGKILL');\n" });
  const direct = run(root, ['--test', '--test-reporter=spec', 'test/**/*.test.ts']);
  const wrapped = run(root, [launcher]);
  assert.equal(direct.signal, 'SIGKILL'); assert.equal(direct.status, null);
  assert.equal(wrapped.signal, direct.signal); assert.equal(wrapped.status, null);
});

test('real npm web precheck and lifecycle hooks run once; failed precheck keeps tests stopped and its failure status', (t) => {
  const testScript = JSON.parse(readFileSync(new URL('../packages/web/package.json', import.meta.url), 'utf8')).scripts.test;
  const root = fixture(t, {
    'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
    'packages/web/package.json': JSON.stringify({ name: '@quietvote/web', type: 'module', scripts: {
      pretest: 'node hook.mjs pretest', test: testScript, posttest: 'node hook.mjs posttest', 'i18n:check': 'node precheck.mjs',
    } }),
    'packages/web/hook.mjs': "import {appendFileSync} from 'node:fs'; appendFileSync('trace', process.argv[2]+'\\n'); if(process.env.FAIL_POSTTEST === '1' && process.argv[2] === 'posttest') process.exitCode=7;\n",
    'packages/web/precheck.mjs': "import {appendFileSync} from 'node:fs'; appendFileSync('trace', 'precheck\\n'); if(process.env.FAIL_PRECHECK === '1') process.exitCode=6;\n",
    'packages/web/src/example.ts': 'export const value: number = 1;\n',
    'packages/web/test/one.test.ts': "import {test} from 'node:test'; import {appendFileSync} from 'node:fs'; import assert from 'node:assert/strict'; import {value} from '../src/example.ts'; test('npm fixture', () => { assert.equal(value,1); appendFileSync('trace', 'test\\n'); });\n",
    'scripts/.fixture': '',
  });
  for (const name of ['test-workspace.mjs', 'coverage-report.mjs']) copyFileSync(resolve(import.meta.dirname, name), join(root, 'scripts', name));
  const output = join(root, 'coverage.json');
  const invoke = (extra) => spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test', '-w', '@quietvote/web', '--', '--test-concurrency=1'], {
    cwd: root, env: { ...env(), QV_COVERAGE_OUTPUT: output, ...extra }, shell: process.platform === 'win32', encoding: 'utf8', timeout: 20_000,
  });
  const passing = invoke({}); assert.equal(passing.error, undefined); assert.equal(passing.status, 0, passing.stdout + passing.stderr);
  const trace = join(root, 'packages/web/trace'); assert.equal(readFileSync(trace, 'utf8'), 'pretest\nprecheck\ntest\nposttest\n');
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).testRun.success, true);
  const report = (outcome) => JSON.parse(runCli(['--report-only', '--root', root, '--input', output,
    '--workspace', 'web', '--measurement-outcome', outcome, '--json']).stdout);
  assert.equal(report('success').available, true);
  rmSync(output); writeFileSync(trace, '');
  const failed = invoke({ FAIL_PRECHECK: '1' }); assert.equal(failed.error, undefined); assert.equal(failed.status, 6, failed.stdout + failed.stderr);
  assert.equal(readFileSync(trace, 'utf8'), 'pretest\nprecheck\n'); assert.equal(existsSync(output), false);
  writeFileSync(trace, '');
  const postFailed = invoke({ FAIL_POSTTEST: '1' });
  assert.equal(postFailed.error, undefined); assert.equal(postFailed.status, 7, postFailed.stdout + postFailed.stderr);
  assert.equal(readFileSync(trace, 'utf8'), 'pretest\nprecheck\ntest\nposttest\n');
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).testRun.success, true);
  const failedReport = report('failure');
  assert.equal(failedReport.available, false); assert.equal(failedReport.workspaces[0].reason, 'measurement-failure');
  assert.equal(failedReport.workspaces[0].linePercent, null); assert.equal(failedReport.workspaces[0].branchPercent, null);
});

test('actual scheduling proves the old trailing concurrency cap is ignored and the forwarded cap is now honored', (t) => {
  const files = { 'events.mjs': `export default async function* (source) {
    let active=0, maximum=0, completed=0;
    for await(const event of source) {
      if(typeof event.data?.name !== 'string' || !event.data.name.endsWith('.test.ts')) continue;
      if(event.type === 'test:dequeue') maximum=Math.max(maximum,++active);
      if(event.type === 'test:complete') { active--; completed++; }
    }
    yield JSON.stringify({maximum,active,completed})+'\\n';
  }` };
  for (let i = 0; i < 4; i++) files[`test/${i}.test.ts`] = "import {test} from 'node:test'; test('case', () => {});\n";
  const root = fixture(t, files), custom = join(root, 'events.mjs');
  // An explicit prior value of four makes this independent of the machine's CPU count. The final value must win.
  const before = run(root, ['--test', '--test-concurrency=4', '--test-reporter=' + custom, 'test/**/*.test.ts', '--test-concurrency=2']);
  assert.equal(before.status, 0, before.stderr);
  assert.deepEqual(JSON.parse(before.stdout), { maximum: 4, active: 0, completed: 4 });
  const destination = join(root, 'events.json');
  const after = run(root, [launcher, '--test-concurrency=4', '--test-concurrency=2', '--test-reporter=' + custom,
    '--test-reporter-destination=stdout', '--test-reporter-destination=' + destination]);
  assert.equal(after.status, 0, after.stderr + after.stdout);
  assert.deepEqual(JSON.parse(readFileSync(destination, 'utf8')), { maximum: 2, active: 0, completed: 4 });
});
