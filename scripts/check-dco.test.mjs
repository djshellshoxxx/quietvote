// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-25-REQ-003 QV-30-REQ-019
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectRange } from './check-dco.mjs';

const SCRIPT = fileURLToPath(new URL('./check-dco.mjs', import.meta.url));
const NAME = 'Example Contributor';
const EMAIL = 'contributor@example.invalid';
const SIGNOFF = `Signed-off-by: ${NAME} <${EMAIL}>`;
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'qv dco '));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const hooks = join(repo, 'empty hooks');
  mkdirSync(hooks);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull,
    GIT_AUTHOR_NAME: NAME, GIT_AUTHOR_EMAIL: EMAIL, GIT_COMMITTER_NAME: NAME, GIT_COMMITTER_EMAIL: EMAIL,
    GIT_AUTHOR_DATE: '2001-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2001-01-01T00:00:00Z' };
  const git = (args, input, extra = {}) => execFileSync('git', ['-c', `core.hooksPath=${hooks}`,
    '-c', 'commit.gpgsign=false', ...args], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8',
    input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const commit = (message, extra = {}) => {
    git(['commit', '--allow-empty', '--no-verify', '--no-gpg-sign', '--cleanup=verbatim', '-F', '-'], `${message}\n`, extra);
    return git(['rev-parse', 'HEAD']);
  };
  git(['init', '--quiet']);
  const base = commit(`chore: base\n\n${SIGNOFF}`);
  git(['branch', '-M', 'main']);
  const inspect = () => inspectRange({ repo, base, head: 'HEAD' });
  const cli = args => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env, encoding: 'utf8', timeout: 20000 });
  return { repo, base, git, commit, inspect, cli };
}

test('matching footer and conventional subject pass; JSON is deterministic', t => {
  const f = fixture(t);
  const sha = f.commit(`fix(server): keep append atomic\n\nRefs: QV-28-REQ-005\n${SIGNOFF}`);
  assert.deepEqual(f.inspect().commits, [{ sha, issues: [] }]);
  const args = ['--base', f.base, '--head', 'HEAD', '--json'];
  const first = f.cli(args); const second = f.cli(args);
  assert.equal(first.status, 0); assert.equal(first.stderr, '');
  assert.equal(first.stdout, second.stdout);
  assert.equal(JSON.parse(first.stdout).format, 'qv-dco-report/v1');
});

for (const [label, footer, code] of [
  ['missing', '', 'DCO_MISSING'],
  ['different author', `Signed-off-by: Someone Else <${EMAIL}>`, 'DCO_AUTHOR_MISMATCH'],
  ['different email', `Signed-off-by: ${NAME} <someone@example.invalid>`, 'DCO_AUTHOR_MISMATCH'],
  ['body lookalike', `${SIGNOFF}\n\nThis is prose after the apparent sign-off.`, 'DCO_MISSING'],
]) test(`${label} sign-off refuses without echoing private commit text`, t => {
  const f = fixture(t); f.commit(`fix: private-message-marker\n\n${footer}`);
  assert.deepEqual(f.inspect().commits[0].issues, [code]);
  const result = f.cli(['--base', f.base, '--head', 'HEAD']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(code));
  assert.doesNotMatch(result.stdout + result.stderr, /private-message-marker|Example Contributor|example\.invalid/);
});

test('another sign-off does not hide a matching author footer; scoped breaking subject passes', t => {
  const f = fixture(t);
  f.commit(`feat(storage)!: change storage\n\nSigned-off-by: Reviewer <reviewer@example.invalid>\n${SIGNOFF}`);
  assert.deepEqual(f.inspect().commits[0].issues, []);
});

test('raw commit text permits a final author trailer after a Markdown horizontal rule', t => {
  const f = fixture(t);
  f.commit(`docs: explain the change\n\nOrdinary body text.\n\n---\n\nFurther notes.\n\n${SIGNOFF}`);
  assert.deepEqual(f.inspect().commits[0].issues, []);
});

test('a raw-message divider cannot hide later prose after an apparent sign-off', t => {
  const f = fixture(t);
  f.commit(`docs: show an example\n\n${SIGNOFF}\n\n---\n\nLater body prose is not a trailer.`);
  assert.deepEqual(f.inspect().commits[0].issues, ['DCO_MISSING']);
});

test('subject limit is 72 Unicode code points and format errors remain distinct', t => {
  const f = fixture(t);
  f.commit(`fix: ${'é'.repeat(67)}\n\n${SIGNOFF}`);
  f.commit(`fix: ${'é'.repeat(68)}\n\n${SIGNOFF}`);
  f.commit(`Not a conventional subject\n\n${SIGNOFF}`);
  assert.deepEqual(f.inspect().commits.map(c => c.issues), [[], ['SUBJECT_LENGTH'], ['SUBJECT_FORMAT']]);
});

test('author spelling and case are exact, including Unicode', t => {
  const f = fixture(t);
  f.commit(`docs: unicode author\n\nSigned-off-by: Zoë Example <${EMAIL}>`, { GIT_AUTHOR_NAME: 'Zoë Example' });
  f.commit(`docs: changed case\n\nSigned-off-by: zoë Example <${EMAIL}>`, { GIT_AUTHOR_NAME: 'Zoë Example' });
  assert.deepEqual(f.inspect().commits.map(c => c.issues), [[], ['DCO_AUTHOR_MISMATCH']]);
});

test('bot identities have no unapproved DCO exemption', t => {
  const f = fixture(t);
  f.commit('build: bot update', { GIT_AUTHOR_NAME: 'dependency-bot[bot]', GIT_AUTHOR_EMAIL: 'bot@example.invalid' });
  assert.deepEqual(f.inspect().commits[0].issues, ['DCO_MISSING']);
});

test('range inspection includes merged side commits rather than just first parents', t => {
  const f = fixture(t);
  f.git(['checkout', '-b', 'side']);
  const side = f.commit('fix: unsigned side commit');
  f.git(['checkout', 'main']);
  const main = f.commit(`docs: main change\n\n${SIGNOFF}`);
  f.git(['merge', '--no-ff', '--no-gpg-sign', '-m', `chore: merge side\n\n${SIGNOFF}`, 'side']);
  const merge = f.git(['rev-parse', 'HEAD']);
  const bySha = new Map(f.inspect().commits.map(c => [c.sha, c.issues]));
  assert.equal(bySha.size, 3);
  assert.deepEqual(bySha.get(side), ['DCO_MISSING']);
  assert.deepEqual(bySha.get(main), []); assert.deepEqual(bySha.get(merge), []);
});

test('Git-generated merge subjects are not exempted from the documented format', t => {
  const f = fixture(t); f.commit(`Merge branch 'side'\n\n${SIGNOFF}`);
  assert.deepEqual(f.inspect().commits[0].issues, ['SUBJECT_FORMAT']);
});

test('equal endpoints form an empty range; explicit repository paths may contain spaces', t => {
  const f = fixture(t);
  const result = f.cli(['--repo', f.repo, '--base', f.base, '--head', f.base, '--json']);
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout).commits, []);
});

test('unresolvable refs fail with a bounded diagnostic; CLI rejects missing and repeated arguments', t => {
  const f = fixture(t);
  const bad = f.cli(['--base', 'private-invalid-ref', '--head', 'HEAD']);
  assert.equal(bad.status, 2); assert.equal(bad.stdout, '');
  assert.equal(bad.stderr, 'Unable to inspect the requested Git commit range.\n');
  for (const args of [[], ['--base'], ['--base', '--head', 'HEAD'], ['--base', f.base, '--head', 'HEAD', '--head', 'HEAD'],
    ['--base', f.base, '--head', 'HEAD', '--json', '--json'], ['--unknown'], ['--help', '--json']]) {
    const result = f.cli(args); assert.equal(result.status, 2); assert.match(result.stderr, /^Usage:/);
  }
  const help = f.cli(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /^Usage:/);
});
