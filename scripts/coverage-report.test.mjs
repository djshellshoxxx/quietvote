// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-11-REQ-003 QV-30-REQ-013
// Report-only groundwork: these checks do not establish the requirements' coverage/mutation gates.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import reporter, { buildReport, formatReport, LIMITS, parseEvidence, percentage, productionPath, repositoryPath, runCli, summarizeWorkspace } from './coverage-report.mjs';

const script = resolve(import.meta.dirname, 'coverage-report.mjs');
const testRun = { success: true, tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 };
const counts = (covered, total) => ({ covered, total });
const file = (root, path, lines = counts(3, 4), branches = counts(2, 3)) => ({ path: join(root, path), lines, branches });
const evidence = (root, files, version = 'v24.22.3') => ({ schema: 'qv-node-coverage/1', nodeVersion: version,
  complete: true, workingDirectory: root, testRun, files });
function fixture(t, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'qv-coverage-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = { 'package.json': JSON.stringify({ private: true, workspaces: ['packages/*'] }),
    'packages/crypto/package.json': JSON.stringify({ name: '@quietvote/crypto', type: 'module' }), ...extra };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), text);
  }
  return root;
}
function save(root, data) { const path = join(root, 'evidence.json'); writeFileSync(path, JSON.stringify(data)); return path; }
async function collect(events) {
  async function* stream() { yield* events; }
  let text = ''; for await (const part of reporter(stream())) text += part;
  return JSON.parse(text);
}
function rawSummary(root, files) {
  return { type: 'test:coverage', data: { nesting: 0, summary: { workingDirectory: root, files: files.map((entry) => ({
    path: entry.path, coveredLineCount: entry.lines.covered, totalLineCount: entry.lines.total,
    coveredBranchCount: entry.branches.covered, totalBranchCount: entry.branches.total,
    // Native events also carry functions, line arrays, percentages, totals and thresholds. They are not denominators here.
    functions: [], branches: [], lines: [], coveredLinePercent: 999, coveredBranchPercent: 999,
  })), totals: { coveredLinePercent: 999 }, thresholds: { line: 0, branch: 0, function: 0 } } } };
}
const finalSummary = () => ({ type: 'test:summary', data: { success: true, counts: testRun } });

test('structured Node 22/24 fields produce the same production counts despite native test-file inclusion differences', async () => {
  const root = '/checkout';
  const source = file(root, 'packages/crypto/src/example.ts');
  for (const [version, extras] of [['v22.20.0', [file(root, 'packages/crypto/test/example.test.ts', counts(500, 500))]], ['v24.22.3', []]]) {
    const raw = await collect([
      { type: 'test:stdout', data: { message: 'unrelated output' } },
      { type: 'test:summary', data: { file: '/checkout/test.ts', success: false } },
      rawSummary(root, [source, ...extras]), finalSummary(),
    ]);
    raw.nodeVersion = version;
    const parsed = parseEvidence(JSON.stringify(raw), root);
    assert.equal(parsed.available, true);
    assert.deepEqual(parsed.files, [{ path: 'packages/crypto/src/example.ts', lines: counts(3, 4), branches: counts(2, 3) }]);
    assert.equal(parsed.ignoredNonProduction, extras.length);
    const row = summarizeWorkspace('crypto', ['packages/crypto/src/example.ts'], parsed);
    assert.equal(row.linePercent, 75); assert.equal(row.branchPercent, 200 / 3);
    assert.equal(row.shortfallPercentagePoints.line, 25);
    assert.equal(row.shortfallPercentagePoints.branch, 100 / 3);
  }
});

test('aggregation weights integer counts, is order-independent, and excludes tests, fixtures, types, benches and dependencies', (t) => {
  const root = fixture(t, { 'packages/crypto/src/a.ts': 'a', 'packages/crypto/src/b.ts': 'b',
    'packages/crypto/src/types.d.ts': 'types', 'packages/crypto/src/a.test.ts': 'test',
    'packages/crypto/src/fixtures/seed.ts': 'fixture', 'packages/crypto/bench/bench.ts': 'bench',
    'packages/crypto/test/a.test.ts': 'test' });
  const files = [file(root, 'packages/crypto/src/a.ts', counts(1, 2), counts(0, 1)),
    file(root, 'packages/crypto/src/b.ts', counts(9, 10), counts(9, 9)),
    ...['packages/crypto/src/types.d.ts', 'packages/crypto/src/a.test.ts', 'packages/crypto/src/fixtures/seed.ts',
      'packages/crypto/bench/bench.ts', 'packages/crypto/test/a.test.ts', 'node_modules/dependency/index.js'].map((p) => file(root, p, counts(1000, 1000)))];
  const input = save(root, evidence(root, files));
  const report = buildReport(root, input, 'crypto');
  assert.equal(report.available, true);
  const row = report.workspaces[0];
  assert.deepEqual(row.observed, { lines: counts(10, 12), branches: counts(9, 10) });
  assert.equal(row.linePercent, 1000 / 12); assert.equal(row.branchPercent, 90);
  assert.equal(report.evidence.ignoredNonProduction, 6);
  save(root, evidence(root, files.toReversed()));
  assert.equal(JSON.stringify(buildReport(root, input, 'crypto')), JSON.stringify(report));
  assert.match(formatReport(report), /crypto \| 83\.33% \| 90\.00% \| 2\/2 \| available/);
  assert.match(formatReport(report), /shortfall 16\.67 percentage points \/ 10\.00 percentage points/);
});

test('production path boundaries exclude nested fixtures, declared types and test suffixes while including runtime bin entries', () => {
  for (const path of ['packages/crypto/src/bytes.ts', 'packages/cli/bin/qv.ts', 'packages/web/src/ui/app.ts', 'packages/web/src/build/site.ts']) assert.equal(productionPath(path), true, path);
  for (const path of ['packages/crypto/test/x.ts', 'packages/crypto/src/fixtures/x.ts', 'packages/crypto/src/__tests__/x.ts',
    'packages/crypto/src/a.test.mts', 'packages/crypto/src/a.spec.tsx', 'packages/crypto/src/a.fixture.js',
    'packages/crypto/src/a.d.cts', 'packages/crypto/src/test.ts', 'packages/crypto/src/bench/x.ts',
    'packages/crypto/src/readme.md', 'vendor/a.js', 'node_modules/p/src/a.js', 'scripts/a.mjs']) assert.equal(productionPath(path), false, path);
});

test('unimported or changed source inventories make complete percentages and crypto target shortfall unavailable', (t) => {
  const root = fixture(t, { 'packages/crypto/src/a.ts': 'a', 'packages/crypto/src/b.ts': 'b', 'packages/crypto/bin/run.ts': 'bin' });
  const input = save(root, evidence(root, [file(root, 'packages/crypto/src/a.ts', counts(4, 4), counts(3, 3))]));
  let report = buildReport(root, input, 'crypto'), row = report.workspaces[0];
  assert.equal(row.available, false); assert.equal(row.reason, 'missing-source-evidence');
  assert.equal(row.linePercent, null); assert.equal(row.branchPercent, null);
  assert.deepEqual(row.shortfallPercentagePoints, { line: null, branch: null });
  assert.deepEqual(row.missing, ['packages/crypto/bin/run.ts', 'packages/crypto/src/b.ts']);
  assert.match(formatReport(report), /crypto \| unavailable \| unavailable/);
  assert.match(formatReport(report), /Observed subset only: lines 100.00%/);
  assert.match(formatReport(report), /shortfall unavailable \/ unavailable/);
  save(root, evidence(root, [file(root, 'packages/crypto/src/removed.ts')]));
  report = buildReport(root, input, 'crypto'); row = report.workspaces[0];
  assert.equal(row.available, false); assert.equal(row.reason, 'source-inventory-mismatch');
});

test('failed or cancelled workers make coverage unavailable even when every production source has counters', (t) => {
  const root = fixture(t, { 'packages/crypto/src/a.ts': 'a', 'packages/crypto/src/b.ts': 'b' });
  const files = ['a', 'b'].map((name) => file(root, `packages/crypto/src/${name}.ts`, counts(4, 4), counts(3, 3)));
  for (const summary of [
    { ...testRun, success: false, tests: 2, failed: 1 },
    { ...testRun, success: false, tests: 2, cancelled: 1 },
    { ...testRun, success: false },
    { ...testRun, tests: 2, failed: 1 },
  ]) {
    const data = { ...evidence(root, files), testRun: summary };
    const parsed = parseEvidence(JSON.stringify(data), root);
    assert.equal(parsed.available, false); assert.equal(parsed.reason, 'test-run-failed');
    assert.equal(parsed.files.length, 2); assert.deepEqual(parsed.testRun, summary);
    const report = buildReport(root, save(root, data), 'crypto'), row = report.workspaces[0];
    assert.equal(report.available, false); assert.equal(row.reason, 'test-run-failed');
    assert.equal(row.linePercent, null); assert.equal(row.branchPercent, null);
    assert.deepEqual(row.shortfallPercentagePoints, { line: null, branch: null });
    assert.match(formatReport(report), /crypto \| unavailable \| unavailable/);
    assert.doesNotMatch(formatReport(report), /\| 100\.00%|Observed subset only/);
  }
});

test('outer measurement outcomes cannot be replaced by a successful native summary or a continue-on-error conclusion', (t) => {
  const root = fixture(t, { 'packages/crypto/src/a.ts': 'a' });
  const input = save(root, evidence(root, [file(root, 'packages/crypto/src/a.ts')]));
  for (const outcome of ['success', 'failure', 'cancelled', 'skipped', 'unknown']) {
    const result = runCli(['--report-only', '--root', root, '--input', input, '--measurement-outcome', outcome, '--json']);
    assert.equal(result.exitCode, 0);
    const report = JSON.parse(result.stdout), row = report.workspaces[0];
    assert.equal(report.measurementOutcome, outcome);
    assert.equal(report.evidence.testRun.success, true, 'native success is retained as a distinct fact');
    assert.equal(report.available, outcome === 'success');
    if (outcome !== 'success') {
      assert.equal(row.reason, 'measurement-' + outcome);
      assert.equal(row.linePercent, null); assert.equal(row.branchPercent, null);
      assert.deepEqual(row.shortfallPercentagePoints, { line: null, branch: null });
    }
  }
  assert.equal(runCli(['--report-only', '--root', root, '--input', input, '--measurement-outcome', 'passed']).exitCode, 2);
});

test('an empty source set or zero measured denominator is unavailable, and rounding never hides a real crypto shortfall', () => {
  assert.equal(percentage(counts(0, 0)), null);
  const noFiles = { available: true, files: [] };
  assert.equal(summarizeWorkspace('crypto', [], noFiles).reason, 'empty-production-inventory');
  const path = 'packages/crypto/src/a.ts';
  const empty = summarizeWorkspace('crypto', [path], { available: true, files: [{ path, lines: counts(0, 0), branches: counts(0, 0) }] });
  assert.equal(empty.available, false); assert.equal(empty.shortfallPercentagePoints.line, null);
  const almost = summarizeWorkspace('crypto', [path], { available: true, files: [{ path, lines: counts(999_999, 1_000_000), branches: counts(999_999, 1_000_000) }] });
  assert.ok(almost.shortfallPercentagePoints.line > 0);
  assert.match(formatReport({ workspaces: [almost] }), /crypto \| <100\.00% \| <100\.00%/);
  assert.match(formatReport({ workspaces: [almost] }), /shortfall <0\.01 percentage points \/ <0\.01 percentage points/);
});

test('POSIX and Windows paths use exact checkout containment, normalize separators and reject unsupported relative paths', () => {
  assert.equal(repositoryPath('/repo/packages/crypto/src/a.ts', '/repo'), 'packages/crypto/src/a.ts');
  assert.equal(repositoryPath('/repo-other/packages/crypto/src/a.ts', '/repo'), null);
  assert.equal(repositoryPath('/repo/packages/../outside.ts', '/repo'), 'outside.ts');
  assert.equal(repositoryPath('C:\\Repo\\packages\\crypto\\src\\A.ts', 'c:\\repo'), 'packages/crypto/src/a.ts');
  assert.equal(repositoryPath('D:\\repo\\packages\\crypto\\src\\a.ts', 'C:\\repo'), null);
  assert.equal(repositoryPath('C:\\repo-other\\packages\\crypto\\src\\a.ts', 'C:\\repo'), null);
  assert.throws(() => repositoryPath('packages/crypto/src/a.ts', '/repo'), /unsupported/);
  assert.throws(() => repositoryPath('file:///repo/packages/crypto/src/a.ts', '/repo'), /unsupported/);
  const raw = evidence('/repo', [file('/repo-other', 'packages/crypto/src/a.ts')]);
  const parsed = parseEvidence(JSON.stringify(raw), '/repo');
  assert.equal(parsed.available, true); assert.equal(parsed.files.length, 0); assert.equal(parsed.ignoredOutside, 1);
});

test('malformed, partial, unsupported, duplicated and oversized evidence is explicitly unavailable', () => {
  const root = '/repo', valid = evidence(root, [file(root, 'packages/crypto/src/a.ts')]);
  const mutations = [
    (d) => { d.complete = false; }, (d) => { delete d.testRun; }, (d) => { d.testRun = { ...testRun, tests: 0 }; },
    (d) => { d.nodeVersion = 'v26.0.0'; }, (d) => { d.schema = 'other'; }, (d) => { d.files = {}; },
    (d) => { d.workingDirectory = '/other'; }, (d) => { d.files[0].lines.covered = 5; },
    (d) => { d.files[0].lines.total = -1; }, (d) => { d.files[0].branches.covered = 1.5; },
    (d) => { d.files[0].branches.total = '3'; }, (d) => { d.files[0].lines.total = 1e20; },
    (d) => { delete d.files[0].branches; }, (d) => { d.files.push(structuredClone(d.files[0])); },
    (d) => { d.files[0].path = 'relative.ts'; }, (d) => { d.files[0].path = '/a\0b'; },
    (d) => { d.files[0].path = '/' + 'x'.repeat(LIMITS.path); },
  ];
  for (const change of mutations) { const data = structuredClone(valid); change(data); assert.equal(parseEvidence(JSON.stringify(data), root).available, false, change.toString()); }
  for (const text of ['', '{', JSON.stringify(valid).slice(0, -1), JSON.stringify(valid) + JSON.stringify(valid), ' '.repeat(LIMITS.bytes + 1)]) {
    const parsed = parseEvidence(text, root); assert.equal(parsed.available, false); assert.ok(parsed.reason);
  }
  const text = JSON.stringify(valid).replace('"total":4', '"total":1e400');
  assert.equal(parseEvidence(text, root).available, false);
});

test('collector completion requires one valid coverage event and one final test summary', async () => {
  const root = '/repo', coverage = rawSummary(root, [file(root, 'packages/crypto/src/a.ts')]);
  for (const events of [[], [coverage], [finalSummary()], [coverage, coverage, finalSummary()], [coverage, finalSummary(), finalSummary()],
    [{ type: 'test:coverage', data: { nesting: 0, summary: {} } }, finalSummary()]]) {
    const output = await collect(events);
    assert.equal(output.complete, true); assert.equal(typeof output.unavailable, 'string');
    assert.equal(parseEvidence(JSON.stringify(output), root).available, false);
  }
});

test('report-only invocation marks missing files and invalid layouts unavailable; invocation mistakes still fail', (t) => {
  const root = fixture(t, { 'packages/crypto/src/a.ts': 'a' });
  const args = ['--report-only', '--root', root, '--input', join(root, 'missing.json')];
  const missing = runCli(args); assert.equal(missing.exitCode, 0); assert.match(missing.stdout, /unavailable/);
  assert.doesNotMatch(missing.stdout, /\| 0\.00%|\| 100\.00%/);
  for (const argv of [[], ['--input', 'missing'], ['--report-only'], ['--report-only', '--input'], [...args, '--json', '--json'], [...args, '--bogus'], [...args, '--workspace', '../escape']]) assert.equal(runCli(argv).exitCode, 2);
  const selected = runCli([...args, '--workspace', 'missing', '--json']);
  assert.equal(selected.exitCode, 0); assert.equal(JSON.parse(selected.stdout).available, false);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ workspaces: ['other/*'] }));
  assert.equal(JSON.parse(runCli([...args, '--json']).stdout).reason, 'workspace-inventory-unavailable');
});

test('evidence reads reject nonregular, symlinked, invalid-UTF8 and oversized files; source symlinks are not silently skipped', (t) => {
  const root = fixture(t, { 'packages/crypto/src/a.ts': 'a' });
  const input = save(root, evidence(root, [file(root, 'packages/crypto/src/a.ts')]));
  const link = join(root, 'linked.json'); symlinkSync(input, link);
  for (const path of [root, link, join(root, 'absent')]) assert.equal(buildReport(root, path, 'crypto').available, false);
  writeFileSync(input, Buffer.from([0xff, 0xfe])); assert.equal(buildReport(root, input, 'crypto').available, false);
  writeFileSync(input, 'x'.repeat(LIMITS.bytes + 1)); assert.equal(buildReport(root, input, 'crypto').available, false);
  save(root, evidence(root, [file(root, 'packages/crypto/src/a.ts')]));
  symlinkSync(join(root, 'packages/crypto/src/a.ts'), join(root, 'packages/crypto/src/alias.ts'));
  assert.equal(buildReport(root, input, 'crypto').workspaces[0].reason, 'source-inventory-unavailable');
});

test('untrusted source names are quoted in diagnostics and cannot inject terminal lines', (t) => {
  const name = 'packages/crypto/src/missing\n::error::\u001b[31m.ts';
  const root = fixture(t, { [name]: 'a' });
  const report = buildReport(root, save(root, evidence(root, [])), 'crypto');
  const text = formatReport(report);
  assert.ok(text.includes('missing\\n::error::\\u001b[31m.ts'));
  assert.ok(!text.includes('\u001b')); assert.ok(!text.includes('\n::error::'));
});

function nativeRun(t, fail) {
  const root = fixture(t, {
    'packages/crypto/src/logic.ts': 'export function choose(n: number): number {\n  if (n > 0) return n;\n  return -n;\n}\n',
    'packages/crypto/test/sample.test.ts': `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { choose } from '../src/logic.ts';\ntest('native coverage', () => assert.equal(choose(1), ${fail ? 2 : 1}));\n`,
  });
  const cwd = join(root, 'packages/crypto'), destination = join(root, 'native.json');
  const args = ['--test', '--test-reporter=spec'];
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [...args, '--experimental-test-coverage', '--test-reporter=' + script,
    '--test-reporter-destination=stdout', '--test-reporter-destination=' + destination, 'test/sample.test.ts'], { cwd, env, encoding: 'utf8', timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  assert.equal(result.error, undefined, result.error?.message);
  return { root, cwd, destination, args: [...args, 'test/sample.test.ts'], env, result };
}

test('actual native TypeScript coverage supplies production counts alongside the existing spec reporter', (t) => {
  const native = nativeRun(t, false);
  assert.equal(native.result.status, 0, native.result.stderr + native.result.stdout);
  assert.match(native.result.stdout, /native coverage/);
  const report = buildReport(native.root, native.destination, 'crypto'), row = report.workspaces[0];
  assert.equal(report.available, true, JSON.stringify(report));
  assert.equal(row.observedFiles, 1); assert.equal(row.linePercent, 75); assert.equal(row.branchPercent, 200 / 3);
  assert.equal(report.evidence.nodeVersion, process.version);
  const raw = JSON.parse(readFileSync(native.destination, 'utf8'));
  assert.equal(raw.complete, true); assert.equal(raw.testRun.success, true);
});

test('actual test failure keeps the same nonzero status; the explicit report-only command cannot turn it into a test pass', (t) => {
  const native = nativeRun(t, true);
  const baseline = spawnSync(process.execPath, native.args, { cwd: native.cwd, env: native.env, encoding: 'utf8', timeout: 15_000 });
  assert.equal(baseline.status, 1); assert.equal(native.result.status, baseline.status);
  const result = runCli(['--report-only', '--root', native.root, '--workspace', 'crypto', '--input', native.destination]);
  assert.equal(result.exitCode, 0); assert.match(result.stdout, /reported test summary failed/);
  assert.match(result.stdout, /normal test process exit status remains authoritative/);
  assert.equal(JSON.parse(readFileSync(native.destination, 'utf8')).testRun.failed, 1);
  const json = runCli(['--report-only', '--root', native.root, '--workspace', 'crypto', '--input', native.destination, '--json']);
  assert.equal(json.exitCode, 0);
  const report = JSON.parse(json.stdout), row = report.workspaces[0];
  assert.equal(report.available, false); assert.equal(report.evidence.reason, 'test-run-failed');
  assert.equal(row.linePercent, null); assert.equal(row.branchPercent, null);
  assert.deepEqual(row.shortfallPercentagePoints, { line: null, branch: null });
  assert.match(result.stdout, /crypto \| unavailable \| unavailable/);
});
