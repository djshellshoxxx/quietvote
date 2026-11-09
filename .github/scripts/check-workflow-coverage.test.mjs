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
