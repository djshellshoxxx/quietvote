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
