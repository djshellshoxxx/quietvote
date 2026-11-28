// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-11-REQ-013
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lintReleaseNotes, parseClaimRules } from './lint-release-notes.mjs';
import { EXPERIMENTAL_BANNER, InputError, REVIEW_QUALIFICATION } from './release-input.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = join(ROOT, 'scripts/lint-release-notes.mjs');
const BANNERS = `${EXPERIMENTAL_BANNER}\n\n${REVIEW_QUALIFICATION}\n\n`;
function run(args = []) { return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 }); }
function notes(extra = '') { return `# Changes\n\n## Unreleased\n\n${BANNERS}${extra}\n`; }
function has(findings, code) { return findings.some(finding => finding.code === code); }

test('existing Unreleased history with the two visible qualifications is accepted', () => {
  const text = readFileSync(join(ROOT, 'CHANGES.md'), 'utf8');
  assert.deepEqual(lintReleaseNotes(text), []);
  assert.match(text, /^## Unreleased$/m);
  assert.deepEqual(lintReleaseNotes(notes('The checklist records artifact presence. No release has been made.')), []);
});

test('the exact Experimental banner and independent-review qualification are separately required', () => {
  assert.equal(has(lintReleaseNotes(REVIEW_QUALIFICATION), 'missing_experimental_banner'), true);
  assert.equal(has(lintReleaseNotes(EXPERIMENTAL_BANNER), 'missing_review_qualification'), true);
  for (const banner of ['Experimental - not for binding elections', 'experimental — not for binding elections', 'Experimental — suitable for binding elections']) {
    assert.equal(has(lintReleaseNotes(`${banner}\n\n${REVIEW_QUALIFICATION}`), 'missing_experimental_banner'), true);
  }
});

test('comments, fenced examples, inline code, quotations and indented code cannot substitute for a banner', () => {
  for (const hidden of [`<!-- ${EXPERIMENTAL_BANNER} -->`, `\`\`\`text\n${EXPERIMENTAL_BANNER}\n\`\`\``,
    `~~~\n${EXPERIMENTAL_BANNER}\n~~~`, `\`${EXPERIMENTAL_BANNER}\``, `> ${EXPERIMENTAL_BANNER}`, `    ${EXPERIMENTAL_BANNER}`]) {
    assert.equal(has(lintReleaseNotes(`${hidden}\n\n${REVIEW_QUALIFICATION}`), 'missing_experimental_banner'), true, hidden);
  }
  assert.equal(has(lintReleaseNotes(`<!-- never closes\n${BANNERS}`), 'missing_experimental_banner'), true);
});

test('general policy phrases and QV10 copy restrictions refuse positive claims', () => {
  for (const claim of ['QuietVote is UNHACKABLE.', 'This is guaranteed secure.', 'We provide anonymous voting.',
    'The system is coercion-resistant.', 'Everything is 100% secure.', 'Your vote is safe.', 'Verified!',
    'The release is independently reviewed.', 'It is end-to-end encrypted.']) {
    assert.equal(has(lintReleaseNotes(notes(claim)), 'banned_phrase'), true, claim);
  }
});

test('explicit non-claims remain readable and do not certify a release', () => {
  assert.deepEqual(lintReleaseNotes(notes('QuietVote is unaudited. No system is unhackable. This file does not claim that the project is certified.')), []);
  // The preserved CHANGES introduction uses this explicit non-claim.
  assert.deepEqual(lintReleaseNotes(notes('Nothing in this file is a statement that any change was reviewed, audited or approved by an independent party.')), []);
});

test('an earlier disclaimer or claims-lint marker cannot suppress a separate positive claim', () => {
  assert.equal(has(lintReleaseNotes(notes('No review is recorded.\n\nQuietVote is unhackable.')), 'banned_phrase'), true);
  assert.equal(has(lintReleaseNotes(notes('The tool is not finished. The release is independently reviewed.')), 'banned_phrase'), true);
  assert.equal(has(lintReleaseNotes(notes('<!-- claims-lint-ignore -->\nQuietVote is unhackable.')), 'banned_phrase'), true);
  assert.equal(has(lintReleaseNotes(notes('<!-- claims-lint-ignore-start -->\nQuietVote is unhackable.\n<!-- claims-lint-ignore-end -->')), 'banned_phrase'), true);
});

test('literal policy matching respects word boundaries, case and ordinary Markdown emphasis', () => {
  assert.deepEqual(lintReleaseNotes(notes('This is an unaudited prototype. No audit is claimed.')), []);
  assert.equal(has(lintReleaseNotes(notes('The system is **UnHaCkAbLe**.')), 'banned_phrase'), true);
  assert.equal(has(lintReleaseNotes(notes('The system is fully\nsecure.')), 'banned_phrase'), true);
  assert.equal(has(lintReleaseNotes(notes('This is a secureboard label.'), 'secure'), 'banned_phrase'), false);
});

test('malformed or missing policy rules fail closed', () => {
  for (const policy of ['', '# no rules', 're:[', 'text || [', 'text || allow || more']) {
    assert.throws(() => parseClaimRules(policy), error => error instanceof InputError && error.code === 'invalid_claim_policy');
  }
  assert.throws(() => lintReleaseNotes(notes(), ''), error => error instanceof InputError && error.code === 'invalid_claim_policy');
});

test('actual CLI returns distinct success, wording violation and input refusal outcomes', t => {
  const root = mkdtempSync(join(tmpdir(), 'qv-release-notes-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'notes.md');
  writeFileSync(path, notes('Only an unapproved local checklist is generated.'));
  assert.equal(run([path]).status, 0);
  writeFileSync(path, notes('QuietVote is unhackable.'));
  const failed = run([path]); assert.equal(failed.status, 1); assert.match(failed.stderr, /banned_phrase/);
  writeFileSync(path, notes().replace(EXPERIMENTAL_BANNER, 'Experimental'));
  assert.equal(run([path]).status, 1);
  writeFileSync(path, Buffer.from([0xff, 0xfe])); assert.equal(run([path]).status, 2);
  truncateSync(path, 256 * 1024 + 1); assert.equal(run([path]).status, 2);
  assert.equal(run([join(root, 'missing.md')]).status, 2);
  assert.equal(run(['--help']).status, 0); assert.equal(run(['--unknown']).status, 2);
  const actual = run(); assert.equal(actual.status, 0, actual.stderr);
});

test('release-note checks run as blocking docs checks on docs-only pull requests', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/claims-lint.yml'), 'utf8');
  const on = workflow.split(/^on:\n/m)[1].split(/^\S/m)[0];
  assert.match(on, /^  pull_request:\s*$/m); assert.doesNotMatch(on, /paths(?:-ignore)?:/);
  const docs = workflow.split(/^  docs-checks:\n/m)[1];
  assert.ok(docs); assert.doesNotMatch(docs, /continue-on-error:\s*true|^\s+if:/m);
  assert.match(docs, /run: node --test scripts\/release-dossier\.test\.mjs scripts\/lint-release-notes\.test\.mjs/);
  assert.match(docs, /run: node scripts\/lint-release-notes\.mjs/);
  assert.match(workflow, /Lint public claims \(non-blocking\)[\s\S]*?continue-on-error: true/, 'existing general claims policy is unchanged');
});
