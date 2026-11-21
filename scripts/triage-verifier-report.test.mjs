import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runCli, summarizeComparatorReport } from './triage-verifier-report.mjs';

const candidate = {
  ok: false, cases: 3, failures: 2,
  rows: [
    { id: 'elections/good', ts_verdict: 'PASS', python_verdict: 'PASS', differences: [], skipped: ['chk.board.witness: Python not implemented'] },
    { id: 'mutations/held', ts_verdict: 'FAIL', python_verdict: 'FAIL', differences: ['chk.result.rules: TS="not_run" Python="fail"', 'results: TS=[] Python=[1]'], skipped: ['chk.board.witness: Python not implemented'] },
    { id: 'canary/canary-election', ts_verdict: 'PASS', python_verdict: 'THROW', differences: ['Python threw: ValueError()'], skipped: [] },
  ],
};

test('mismatch summary preserves strict failure and isolates field counts', () => {
  const result = summarizeComparatorReport(candidate);
  assert.equal(result.ok, false);
  assert.equal(result.mismatching_cases, 2);
  assert.equal(result.verdict_agreements, 2);
  assert.deepEqual(result.differing_fields, [
    { field: 'chk.result.rules', count: 1 },
    { field: 'python_exception', count: 1 },
    { field: 'results', count: 1 },
  ]);
  assert.deepEqual(result.excluded_capabilities, ['chk.board.witness: Python not implemented']);
});

test('a truthful green comparator produces exit 0 and no mismatches', () => {
  const report = { ok: true, cases: 1, failures: 0, rows: [{ id: 'one', ts_verdict: 'PASS', python_verdict: 'PASS', differences: [], skipped: [] }] };
  assert.equal(runCli(['--json'], JSON.stringify(report)).exitCode, 0);
  assert.deepEqual(summarizeComparatorReport(report).differing_fields, []);
});

test('comparator failures cannot be erased by false top-level success', () => {
  for (const property of [{ ok: true }, { failures: 0 }, { cases: 4 }]) {
    assert.throws(() => summarizeComparatorReport({ ...candidate, ...property }), /contradict|invalid/i);
  }
});

test('invalid and duplicated rows cannot silently count as agreement', () => {
  const duplicate = { ...candidate, rows: [candidate.rows[0], candidate.rows[0], candidate.rows[2]] };
  assert.throws(() => summarizeComparatorReport(duplicate), /duplicate/i);
  assert.throws(() => summarizeComparatorReport({ ...candidate, rows: [{ ...candidate.rows[0], differences: [false] }, ...candidate.rows.slice(1)] }), /invalid/i);
});

test('text summary does not describe exclusions as agreement', () => {
  const { exitCode, output } = runCli([], JSON.stringify(candidate));
  assert.equal(exitCode, 1);
  assert.match(output, /2 mismatching cases/);
  assert.match(output, /not agreement/i);
  assert.match(output, /2\/3/);
});

test('real subprocess exits 1 for mismatches and 2 for malformed input', () => {
  const script = fileURLToPath(new URL('./triage-verifier-report.mjs', import.meta.url));
  const mismatch = spawnSync(process.execPath, [script, '--json'], { input: JSON.stringify(candidate), encoding: 'utf8' });
  assert.equal(mismatch.status, 1);
  assert.equal(JSON.parse(mismatch.stdout).ok, false);
  const invalid = spawnSync(process.execPath, [script], { input: '{', encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /triage error/);
});

test('unrecognized arguments are errors, help documents exit behavior', () => {
  assert.throws(() => runCli(['--bogus'], '{}'), /Unknown/);
  assert.match(runCli(['--help']).output, /A mismatch exits 1/);
});
