// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-015
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// Check behavior against tiny synthetic workflow roots; no repository files are changed.
const checker = resolve(import.meta.dirname, 'check-action-pins.mjs');
const sha = '11bd71901bbe5b1630ceea73d27597364c9af683';

function check(...contents) {
  const root = mkdtempSync(join(tmpdir(), 'qv-action-pins-'));
  const workflows = join(root, '.github', 'workflows');
  try {
    mkdirSync(workflows, { recursive: true });
    contents.forEach((content, i) => {
      writeFileSync(join(workflows, 'fixture-' + i + '.' + (i % 2 ? 'yaml' : 'yml')), content);
    });
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
    assert.equal(result.error, undefined, result.error?.message);
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('rejects unpinned ordinary step actions (dash-prefixed uses)', () => {
  const result = check('jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /fixture-0\.yml:4: action must be pinned/);
});

test('accepts pinned ordinary actions and local relative actions', () => {
  const result = check('jobs:\n  test:\n    steps:\n      - uses: actions/checkout@' + sha + '\n      - uses: ./.github/actions/local\n');
  assert.equal(result.code, 0, result.stderr);
});

test('rejects unpinned reusable workflow job references', () => {
  const result = check('jobs:\n  test:\n    uses: example/project/.github/workflows/test.yml@main\n');
  assert.equal(result.code, 1);
});

test('reports every unpinned action across yml and yaml files', () => {
  const result = check('steps:\n  - uses: actions/checkout@v4\n', 'steps:\n  - uses: actions/setup-node@v4\n');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /fixture-0\.yml:2/);
  assert.match(result.stderr, /fixture-1\.yaml:2/);
});

test('ignores commented examples and does not flag a local action', () => {
  const result = check('steps:\n  # - uses: actions/checkout@v4\n  - uses: ./.github/actions/local\n');
  assert.equal(result.code, 0, result.stderr);
});
test('rejects empty workflow roots and empty or comment-only files', () => {
  assert.equal(check().code, 1);
  for (const value of ['', '  \n', '# no workflow\n', '---\n# no workflow\n...\n']) {
    const result = check(value);
    assert.equal(result.code, 1, JSON.stringify(value));
    assert.match(result.stderr, /workflow file is empty/);
  }
});

test('rejects empty, malformed, and non-SHA action references', () => {
  for (const value of [
    '', '# comment only', "''", '""', 'null', 'false', '[]', '{}', '*alias',
    'actions/checkout', 'actions/checkout@v4', 'actions/checkout@' + sha.slice(1),
    'actions/checkout@' + sha + '0', 'actions/checkout@' + sha + '@v4',
    'actions/checkout@' + sha + ' unexpected', 'actions/checkout@' + sha + '#suffix',
    '"actions/checkout@' + sha, "'actions/checkout@" + sha + '"',
    '"actions/checkout@' + sha + '" unexpected', './', './local unexpected',
    'https://example.com/action@' + sha, '${{ inputs.action }}',
  ]) {
    const result = check('steps:\n  - uses: ' + value + '\n');
    assert.equal(result.code, 1, value);
    assert.match(result.stderr, /fixture-0\.yml:2: action must be pinned/);
  }
});

test('checks simply quoted keys and values and permits trailing comments', () => {
  for (const key of ['uses', '"uses"', "'uses'"]) {
    for (const quote of ['', '"', "'"]) {
      const pinned = quote + 'actions/checkout@' + sha + quote;
      const local = quote + './.github/actions/local' + quote;
      assert.equal(check('steps:\n  - ' + key + ': ' + pinned + ' # pinned\n').code, 0);
      assert.equal(check('steps:\n  - ' + key + ': ' + local + '\n').code, 0);
      assert.equal(check('steps:\n  - ' + key + ': ' + quote + 'actions/checkout@v4' + quote + '\n').code, 1);
    }
  }
});

test('rejects action references hidden in unsupported YAML forms', () => {
  for (const value of [
    'steps:\n  - { uses: actions/checkout@v4 }\n',
    'steps: [{ "uses": "actions/checkout@v4" }]\n',
    'steps:\n  - uses: >-\n      actions/checkout@' + sha + '\n',
    'steps:\n  - ? uses\n    : actions/checkout@v4\n',
    'steps:\n  - "\\u0075ses": actions/checkout@v4\n',
    'steps:\n  - &checkout uses: actions/checkout@v4\n',
    'steps:\n  - !!str uses: actions/checkout@v4\n',
    'steps: [uses: actions/checkout@v4]\n',
    'steps:\n  - { "\\u0075ses": actions/checkout@v4 }\n',
    'steps:\n  - { !!str uses: actions/checkout@v4 }\n',
    'steps:\n  - { &u uses: actions/checkout@v4 }\n',
    'env:\n  KEY: &k uses\nsteps:\n  - *k : actions/checkout@v4\n',
    'steps: &steps [uses: actions/checkout@v4]\n',
    '--- {name: ci, on: push, jobs: {test: {runs-on: ubuntu-latest, steps: [{uses: actions/checkout@v4}]}}}\n',
  ]) {
    assert.equal(check(value).code, 1, value);
  }
});

test('ignores action-like text inside run blocks and checks following steps', () => {
  for (const indicator of ['|', '>-', '|2-']) {
    const run = 'steps:\n  - run: ' + indicator + '\n      uses: actions/example@v1\n      - { uses: actions/example@v1 }\n';
    assert.equal(check(run + '  - uses: actions/checkout@' + sha + '\n').code, 0);
    assert.equal(check(run + '  - uses: actions/checkout@v4\n').code, 1);
  }
});

test('accepts pinned reusable workflow jobs and workflows with only run steps', () => {
  assert.equal(check('jobs:\n  test:\n    uses: example/project/.github/workflows/test.yml@' + sha + '\n').code, 0);
  assert.equal(check('jobs:\n  test:\n    steps:\n      - run: echo ok\n').code, 0);
  assert.equal(check('steps:\n  - run: echo ok # { uses: actions/checkout@v4 }\n').code, 0);
  assert.equal(check(`permissions: {}\nsteps:\n  - run: 'echo "{ uses: actions/checkout@v4 }"'\n`).code, 0);
});
