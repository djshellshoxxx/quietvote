// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-027 QV-24-REQ-012
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { buildMatrix, isTestPath, normalizePriority, parseSpec, pct, runCli, summarize } from './trace.mjs';

// Built at run time so the scanner, which also reads this file, does not take fixtures for real annotations.
const TAG = ['@', 'verifies'].join('');

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'qv-trace-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

const SPEC_05 = [
  '# Spec',
  '',
  '| ID | Requirement | Priority | Acceptance criteria | Verification |',
  '|---|---|---|---|---|',
  '| QV-05-REQ-001 | Ballots are encrypted. | Must | a | T |',
  '| QV-05-REQ-002 | Revotes replace earlier ballots. | Must | b | T |',
  '| QV-05-REQ-003 | Nice to have. | Could | c | T |',
  '| QV-05-REQ-004 | Independent audit is published. | Must | d | R |',
  '',
  'Prose citing QV-16-REQ-020 and QV-05-REQ-001 is not a definition.',
  '| QV-16-REQ-020 | A row for another spec number is not a definition here. | Must | x | T |',
].join('\n');

const SPEC_13 = [
  '| ID | Requirement | Pri | Acceptance criteria | Ver |',
  '|---|---|---|---|---|',
  '| QV-13-REQ-001 | Pages conform. | M | a | T, M |',
  '| QV-13-REQ-002 | Optional. | S | a | T |',
].join('\n');

test('priority cells normalise M/S/C and words; anything else is unknown', () => {
  assert.equal(normalizePriority('M'), 'Must');
  assert.equal(normalizePriority('**Must**'), 'Must');
  assert.equal(normalizePriority('should'), 'Should');
  assert.equal(normalizePriority('C'), 'Could');
  assert.equal(normalizePriority('T'), 'unknown');
  assert.equal(normalizePriority(undefined), 'unknown');
});

test('only table rows whose ID matches the file number define a requirement', () => {
  const rows = parseSpec(SPEC_05, '05-ballot-protocol.md');
  assert.deepEqual(rows.map((r) => r.id), ['QV-05-REQ-001', 'QV-05-REQ-002', 'QV-05-REQ-003', 'QV-05-REQ-004']);
  assert.deepEqual(rows.map((r) => r.priority), ['Must', 'Must', 'Could', 'Must']);
  assert.equal(rows[0].line, 5);
  assert.deepEqual(parseSpec(SPEC_13, '13-a11y.md').map((r) => r.priority), ['Must', 'Should']);
  assert.deepEqual(parseSpec(SPEC_05, 'notes.md'), []);
});

test('test paths are recognised by directory and suffix', () => {
  assert.equal(isTestPath('packages/protocol/test/tally.test.ts'), true);
  assert.equal(isTestPath('packages/web/e2e/run.ts'), true);
  assert.equal(isTestPath('verifier-py/tests/test_x.py'), true);
  assert.equal(isTestPath('scripts/trace.test.mjs'), true);
  assert.equal(isTestPath('packages/protocol/src/tally.ts'), false);
});

test('coverage needs status implemented_tested AND an existing test; scope excludes external work', () => {
  const root = fixture({
    'docs/05-ballot-protocol.md': SPEC_05,
    'docs/13-a11y.md': SPEC_13,
    'docs/17-portable-membership-credentials.md': '| ID | Requirement | Acceptance criteria |\n|---|---|---|\n| QV-17-REQ-001 | Retained draft. | x |\n',
    'packages/p/src/a.ts': `// ${TAG} QV-05-REQ-001\nexport const a = 1;\n`,
    'packages/p/test/a.test.ts': `// ${TAG} QV-05-REQ-001, QV-05-REQ-002\n`,
    'trace/links.json': JSON.stringify({
      schema: 'qv-trace-links/1',
      method: 'fixture',
      requirements: {
        'QV-05-REQ-001': { status: 'implemented_tested', impl: ['packages/p/src/a.ts:1'], tests: ['packages/p/test/a.test.ts#name'], note: '' },
        'QV-05-REQ-002': { status: 'partial', impl: [], tests: [], note: 'chain rule untested' },
        'QV-05-REQ-004': { status: 'external', impl: [], tests: [], note: 'needs reviewers' },
        'QV-13-REQ-001': { status: 'implemented_untested', impl: ['packages/p/src/a.ts'], tests: [], note: '' },
      },
    }),
  });
  try {
    const m = buildMatrix(root, join(root, 'trace/links.json'));
    assert.deepEqual(m.errors, []);
    assert.equal(m.rows.some((r) => r.id === 'QV-17-REQ-001'), false, 'retained drafts define no active requirement');
    const by = Object.fromEntries(m.rows.map((r) => [r.id, r]));
    assert.equal(by['QV-05-REQ-001'].covered, true);
    assert.deepEqual(by['QV-05-REQ-001'].tests, ['packages/p/test/a.test.ts']);
    assert.equal(by['QV-05-REQ-002'].covered, false, 'an annotation alone does not override a partial status');
    assert.equal(by['QV-05-REQ-003'].status, 'unassessed');
    assert.equal(by['QV-05-REQ-004'].in_engineering_scope, false);
    const s = summarize(m.rows);
    const s05 = s.specs.find((x) => x.spec === 'QV-05');
    assert.deepEqual([s05.must, s05.must_in_scope, s05.must_covered, s05.must_out_of_scope], [3, 2, 1, 1]);
    assert.equal(pct(s05.must_covered, s05.must_in_scope), '50%');
    assert.equal(pct(0, 0), 'n/a', 'an empty denominator is never reported as 100%');
    assert.equal(s.all.must, 4);
    assert.equal(s.all.must_covered, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('--check fails on dangling paths, unknown IDs, bad status, escaping paths and untested "tested" claims', () => {
  const root = fixture({
    'docs/05-ballot-protocol.md': SPEC_05,
    'packages/p/test/a.test.ts': `// ${TAG} QV-99-REQ-001\n`,
    'trace/links.json': JSON.stringify({
      requirements: {
        'QV-05-REQ-001': { status: 'implemented_tested', impl: ['packages/p/src/missing.ts'], tests: [] },
        'QV-05-REQ-002': { status: 'done', impl: ['../outside.ts'], tests: ['/etc/passwd'] },
        'QV-77-REQ-001': { status: 'partial' },
      },
    }),
  });
  try {
    const plain = runCli(['--root', root]);
    assert.equal(plain.exitCode, 0, 'the default report is not a gate');
    assert.match(plain.stderr, /structural finding/);
    const checked = runCli(['--root', root, '--check']);
    assert.equal(checked.exitCode, 1);
    for (const needle of [
      'path does not exist: packages/p/src/missing.ts',
      'implemented_tested without any existing test path',
      'invalid status "done"',
      'must be repository-relative: "../outside.ts"',
      'must be repository-relative: "/etc/passwd"',
      'trace links name an undefined requirement: QV-77-REQ-001',
      `${TAG} names an undefined requirement: QV-99-REQ-001`,
    ]) assert.ok(checked.stderr.includes(needle), `missing finding: ${needle}\n${checked.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('duplicate definitions are reported; --release-gate fails on an uncovered in-scope Must; --write is deterministic', () => {
  const root = fixture({
    'docs/05-ballot-protocol.md': `${SPEC_05}\n\n| ID | Requirement | Priority | Acceptance criteria | Verification |\n|---|---|---|---|---|\n| QV-05-REQ-001 | Defined twice. | Must | a | T |\n`,
    'packages/p/test/a.test.ts': `// ${TAG} QV-05-REQ-001\n`,
    'trace/links.json': JSON.stringify({ requirements: { 'QV-05-REQ-001': { status: 'implemented_tested', tests: ['packages/p/test/a.test.ts'] } } }),
  });
  try {
    const checked = runCli(['--root', root, '--check']);
    assert.equal(checked.exitCode, 1);
    assert.match(checked.stderr, /duplicate definition of QV-05-REQ-001/);
    const gate = runCli(['--root', root, '--release-gate']);
    assert.equal(gate.exitCode, 1);
    assert.match(gate.stderr, /release gate: 2 in-scope Must requirement\(s\) without a covering test/);
    assert.equal(runCli(['--root', root, '--write']).exitCode, 0);
    const first = ['matrix.json', 'summary.md', 'gaps.md'].map((f) => readFileSync(join(root, 'trace', f), 'utf8'));
    assert.equal(runCli(['--root', root, '--write']).exitCode, 0);
    const second = ['matrix.json', 'summary.md', 'gaps.md'].map((f) => readFileSync(join(root, 'trace', f), 'utf8'));
    assert.deepEqual(second, first, 'written reports must not embed time or commit');
    assert.match(first[2], /QV-05-REQ-002 \| `unassessed`/);
    assert.equal(JSON.parse(first[0]).schema, 'qv-trace-matrix/1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('usage errors and unreadable input exit 2, never 0', () => {
  assert.equal(runCli(['--bogus']).exitCode, 2);
  assert.equal(runCli(['--root']).exitCode, 2);
  const root = fixture({ 'docs/05-ballot-protocol.md': SPEC_05, 'trace/links.json': '{not json' });
  try {
    assert.equal(runCli(['--root', root]).exitCode, 2);
    assert.equal(runCli(['--root', join(root, 'absent')]).exitCode, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
