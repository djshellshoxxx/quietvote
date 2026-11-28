// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-014 QV-30-REQ-015
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { test } from 'node:test';

// These tests inspect the repository's existing event/path-list layout, not
// arbitrary YAML. A layout change fails explicitly for review; this helper is
// neither the action-pin scanner nor a workflow/schema validator.
function pathsFor(workflow, event) {
  const source = readFileSync(new URL('../workflows/' + workflow, import.meta.url), 'utf8');
  const events = source.split(/^on:\n/m)[1]?.split(/^\S/m)[0];
  assert.ok(events, workflow + ': expected an ordinary on block');
  const block = events.split(new RegExp('^  ' + event + ':\\n', 'm'))[1]?.split(/^  [a-z_]+:/m)[0];
  assert.ok(block, workflow + ': expected event ' + event);
  const lines = block.split(/^    paths:\n/m)[1]?.trimEnd().split('\n');
  assert.ok(lines?.length, workflow + ': expected paths for ' + event);
  return lines.map((line) => {
    const match = /^      - '([^']+)'$/.exec(line);
    assert.ok(match, workflow + ': review changed path-list layout: ' + line);
    return match[1];
  });
}

// GitHub evaluates positive and negative path patterns in order. The fixtures
// below exercise only literal paths and the current * / ** glob subset.
function selected(path, patterns) {
  let result = false;
  for (const pattern of patterns) {
    const negative = pattern.startsWith('!');
    if (matchesGlob(path, negative ? pattern.slice(1) : pattern)) result = !negative;
  }
  return result;
}

for (const event of ['pull_request', 'push']) {
  test('main CI covers executable inputs and explicit Markdown fixtures on ' + event, () => {
    const paths = pathsFor('ci.yml', event);
    for (const input of [
      'package-lock.json', 'package.json', 'tsconfig.json',
      'VENDOR.lock', 'vendor/noble-curves/ed25519.js', 'vendor/noble-curves/README.md', 'scripts/vendor.mjs',
      'packages/crypto/src/hash.ts', 'packages/web/e2e/browser.ts',
      'packages/web/COPY.md', 'docs/audit/2026-10-28/poc/B3/example.md',
      'test-vectors/v1/README.md', '.github/scripts/check-workflow-coverage.test.mjs',
    ]) assert.equal(selected(input, paths), true, input);
    for (const input of ['README.md', 'docs/30-engineering-standards.md', 'wiki/FAQ.md']) {
      assert.equal(selected(input, paths), false, input);
    }
  });

  test('pseudo-locale CI covers transitive package and tooling changes on ' + event, () => {
    const paths = pathsFor('pseudo-locale-visual.yml', event);
    for (const input of [
      'package-lock.json', 'package.json', 'tsconfig.json',
      'VENDOR.lock', 'vendor/noble-hashes/sha2.js', 'scripts/vendor.mjs',
      'packages/web/package.json', 'packages/web/src/ui/app.ts',
      'packages/web/static/styles.css', 'packages/web/e2e/pseudo-locale-visual-ci.mjs',
      'packages/board/src/receipt.ts', 'packages/crypto/src/hash.ts',
      'packages/protocol/src/ballot.ts', '.github/workflows/pseudo-locale-visual.yml',
      '.github/scripts/check-workflow-coverage.test.mjs',
    ]) assert.equal(selected(input, paths), true, input);
    assert.equal(selected('docs/30-engineering-standards.md', paths), false);
  });
}

test('pseudo-locale checks remain available for merge queues and manual qualification', () => {
  const source = readFileSync(new URL('../workflows/pseudo-locale-visual.yml', import.meta.url), 'utf8');
  assert.match(source, /^  merge_group:$/m);
  assert.match(source, /^  workflow_dispatch:$/m);
});

test('every CI dependency restore explicitly installs verified vendor bytes before execution', () => {
  for (const workflow of ['ci.yml', 'pseudo-locale-visual.yml']) {
    const source = readFileSync(new URL('../workflows/' + workflow, import.meta.url), 'utf8');
    const restores = source.split('      - run: npm ci --ignore-scripts\n').slice(1);
    assert.ok(restores.length, `${workflow}: expected dependency restores`);
    for (const remaining of restores) assert.match(remaining,
      /^      - name: Install and verify the pinned vendored crypto bytes\n        run: npm run vendor:install\n/,
      `${workflow}: every npm ci must be followed by vendor installation`);
  }
});

test('Windows Node 22 and 24 native-file suites cap test-file fan-out but retain all shard tests', () => {
  const source = readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8');
  const testJob = source.split(/^  test:\n/m)[1]?.split(/^  [a-z][a-z0-9_-]*:\n/m)[0];
  assert.ok(testJob, 'review changed test-job layout');
  for (const exact of [
    'for w in ${{ matrix.shard.ws }}; do',
    'if [[ "${{ matrix.os }}" == "windows-2025" && ( "$w" == "cli" || "$w" == "server" ) ]]; then',
    'args=(-- --test-concurrency=2)',
    'npm test -w "@quietvote/$w" "${args[@]}" || { rc=1; echo "::error::@quietvote/$w tests failed"; }',
    'exit $rc',
  ]) assert.ok(testJob.includes(exact), `CI coverage boundary changed: ${exact}`);
  assert.equal((testJob.match(/npm test -w/g) ?? []).length, 1, 'keep one shared authoritative test command');
  assert.doesNotMatch(testJob, /QV_COVERAGE_OUTPUT|experimental-test-coverage/, 'normal test gates remain uninstrumented');
});

test('coverage is explicit, bounded and non-gating, separate from the unchanged normal test matrix', () => {
  const source = readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8');
  const job = source.split(/^  coverage:\n/m)[1]?.split(/^  [a-z][a-z0-9_-]*:\n/m)[0];
  assert.ok(job, 'review changed optional coverage-job layout');
  const jobHeader = job.split(/^    steps:\n/m)[0];
  assert.doesNotMatch(jobHeader, /\$\{\{\s*runner\./, 'runner context is allowed in step env, not job env');
  const output = '          QV_COVERAGE_OUTPUT: ${{ runner.temp }}/quietvote-coverage-${{ github.run_id }}-${{ github.run_attempt }}.json';
  assert.equal(job.split(output).length - 1, 2, 'measurement and report step env select the same temporary file');
  assert.match(source, /coverage_workspace:\n[\s\S]*?default: none\n[\s\S]*?type: choice/);
  for (const exact of [
    `if: github.event_name == 'workflow_dispatch' && contains(fromJSON('["board","cli","crypto","protocol","server","trustee","verifier","web"]'), inputs.coverage_workspace)`,
    'runs-on: ubuntu-24.04', 'node-version: 24', 'continue-on-error: true', 'contents: read',
    'timeout-minutes: 20', 'timeout-minutes: 15', 'if: always()',
    'rm -f -- "$QV_COVERAGE_OUTPUT"',
    'npm test -w "@quietvote/$QV_COVERAGE_WORKSPACE"',
    "QV_COVERAGE_OUTCOME: ${{ steps.measurement.outcome || 'unknown' }}",
    'node scripts/coverage-report.mjs --report-only --input "$QV_COVERAGE_OUTPUT" --workspace "$QV_COVERAGE_WORKSPACE" --measurement-outcome "$QV_COVERAGE_OUTCOME"',
  ]) assert.ok(job.includes(exact), `optional coverage integration changed: ${exact}`);
  assert.equal((job.match(/npm test -w/g) ?? []).length, 1, 'measure only the selected workspace');
  assert.doesNotMatch(job, /npm test[^\n]*(?:\|\||&&|;)/, 'the instrumented test step keeps its actual exit status');
  assert.doesNotMatch(job, /steps\.measurement\.conclusion/, 'continue-on-error conclusions must not qualify coverage');
  const scripts = job.split(/^        run: /m).slice(1).map((part) => part.split(/^      - /m)[0]).join('\n');
  assert.doesNotMatch(scripts, /\$\{\{/, 'inputs belong in env, never interpolated into shell code');
  assert.doesNotMatch(job, /--test-coverage-(?:lines|branches|functions)=/, 'reporting must not add or lower a threshold');
  assert.ok(job.indexOf('npm test -w') < job.indexOf('node scripts/coverage-report.mjs'), 'report after measurement, including failed outcomes');
});
