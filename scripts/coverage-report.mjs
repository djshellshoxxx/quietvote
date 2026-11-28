#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Report-only groundwork for QV-11-REQ-003 / QV-30-REQ-013; no coverage threshold is enforced.
// A second Node test reporter records integer counts without changing the normal spec reporter or test exit status.
// Render with: node scripts/coverage-report.mjs --report-only --input <file> [--workspace <name>] [--measurement-outcome <outcome>] [--root <repo>] [--json]
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'qv-node-coverage/1';
const MEASUREMENT_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped', 'unknown']);
export const LIMITS = Object.freeze({ bytes: 4 * 1024 * 1024, files: 10_000, path: 4096, depth: 32 });
const integer = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validPath = (p) => typeof p === 'string' && p.length > 0 && p.length <= LIMITS.path && !p.includes('\0');
const workspaceName = (s) => typeof s === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(s);
const excludedDirectory = (s) => /^(?:test|tests|__tests__|fixture|fixtures|__fixtures__|e2e|bench|benchmarks|node_modules)$/i.test(s);
const unavailable = (reason) => ({ available: false, reason });

function metric(file, kind) {
  const total = file[`total${kind}Count`], covered = file[`covered${kind}Count`];
  if (!integer(total) || !integer(covered) || covered > total) throw new Error('invalid-coverage-counts');
  return { covered, total };
}

/** Node 22 and 24 expose these same integer fields; their human tables and default test exclusions differ. */
function projectSummary(summary) {
  if (!object(summary) || !validPath(summary.workingDirectory) || !Array.isArray(summary.files)
    || summary.files.length > LIMITS.files) throw new Error('invalid-coverage-summary');
  return {
    workingDirectory: summary.workingDirectory,
    files: summary.files.map((file) => {
      if (!object(file) || !validPath(file.path)) throw new Error('invalid-coverage-path');
      return { path: file.path, lines: metric(file, 'Line'), branches: metric(file, 'Branch') };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  };
}

function projectTestSummary(summary) {
  if (!object(summary) || typeof summary.success !== 'boolean' || !object(summary.counts)) throw new Error('invalid-test-summary');
  const counts = {};
  for (const key of ['tests', 'passed', 'failed', 'cancelled', 'skipped', 'todo']) {
    if (!integer(summary.counts[key])) throw new Error('invalid-test-summary');
    counts[key] = summary.counts[key];
  }
  return { success: summary.success, ...counts };
}

/** Import as a second --test-reporter. No file writes or subprocesses occur in the reporter itself. */
export default async function* coverageReporter(events) {
  let coverage, testRun, failure, coverageEvents = 0, summaries = 0;
  try {
    for await (const event of events) {
      if (event.type === 'test:coverage' && event.data?.nesting === 0) {
        coverageEvents++;
        try { coverage = projectSummary(event.data.summary); } catch { failure = 'malformed-node-coverage'; }
      }
      if (event.type === 'test:summary' && event.data?.file === undefined) {
        summaries++;
        try { testRun = projectTestSummary(event.data); } catch { failure = 'malformed-node-test-summary'; }
      }
    }
  } catch { failure = 'interrupted-reporter-stream'; }
  if (coverageEvents !== 1) failure = coverageEvents === 0 ? 'missing-node-coverage' : 'multiple-node-coverage-events';
  if (summaries !== 1 || !testRun) failure = 'missing-or-duplicate-test-summary';
  const record = { schema: SCHEMA, nodeVersion: process.version, complete: true,
    ...(failure ? { unavailable: failure } : { ...coverage, testRun }) };
  // Emit only after the stream ends. A truncated or empty destination is unavailable, never an empty successful run.
  const text = JSON.stringify(record);
  yield Buffer.byteLength(text) <= LIMITS.bytes ? text + '\n'
    : JSON.stringify({ schema: SCHEMA, nodeVersion: process.version, complete: true, unavailable: 'coverage-output-limit' }) + '\n';
}

/** Return a repository-relative path, or null for a file outside the checkout. Paths are never matched by suffix. */
export function repositoryPath(file, root) {
  if (!validPath(file) || !validPath(root)) throw new Error('invalid-coverage-path');
  const windows = win32.isAbsolute(root) && !posix.isAbsolute(root);
  const paths = windows ? win32 : posix;
  if (!paths.isAbsolute(file) || (windows !== (win32.isAbsolute(file) && !posix.isAbsolute(file)))) {
    throw new Error('unsupported-coverage-path');
  }
  const relative = paths.relative(paths.normalize(root), paths.normalize(file));
  if (relative === '..' || relative.startsWith('..' + paths.sep) || paths.isAbsolute(relative)) return null;
  return (windows ? relative.toLowerCase() : relative).split(paths.sep).join('/');
}

/** Executable source inventory only; test/fixture/benchmark files and type declarations never enter the denominator. */
export function productionPath(path) {
  const parts = path.split('/');
  if (parts.length < 4 || parts[0] !== 'packages' || !workspaceName(parts[1]) || !['src', 'bin'].includes(parts[2])) return false;
  if (parts.some(excludedDirectory)) return false;
  const name = parts.at(-1);
  return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(name)
    && !/\.d\.[cm]?ts$/.test(name)
    && !/(?:^|\.)(?:test|spec|fixture)\.[cm]?[jt]sx?$/.test(name);
}

export function parseEvidence(text, root) {
  try {
    if (Buffer.byteLength(text) > LIMITS.bytes) return unavailable('evidence-size-limit');
    const data = JSON.parse(text);
    if (!object(data) || data.schema !== SCHEMA || data.complete !== true) return unavailable('incomplete-or-unsupported-evidence');
    if (typeof data.nodeVersion !== 'string' || !/^v(?:22|24)\.\d+\.\d+$/.test(data.nodeVersion)) return unavailable('unsupported-node-version');
    if (typeof data.unavailable === 'string') return unavailable('collector-unavailable');
    if (!validPath(data.workingDirectory) || repositoryPath(data.workingDirectory, root) === null) return unavailable('foreign-working-directory');
    if (!Array.isArray(data.files) || data.files.length > LIMITS.files) return unavailable('invalid-file-list');
    const testRun = projectTestSummary({ success: data.testRun?.success, counts: data.testRun });
    if (testRun.tests === 0) return unavailable('no-tests-reported');
    const files = [], seen = new Set();
    let ignoredOutside = 0, ignoredNonProduction = 0;
    for (const file of data.files) {
      if (!object(file) || !object(file.lines) || !object(file.branches)) return unavailable('invalid-coverage-counts');
      for (const counts of [file.lines, file.branches]) {
        if (!integer(counts.total) || !integer(counts.covered) || counts.covered > counts.total) return unavailable('invalid-coverage-counts');
      }
      const relative = repositoryPath(file.path, root);
      if (relative === null) { ignoredOutside++; continue; }
      if (seen.has(relative)) return unavailable('duplicate-file-evidence');
      seen.add(relative);
      if (!productionPath(relative)) { ignoredNonProduction++; continue; }
      files.push({ path: relative, lines: file.lines, branches: file.branches });
    }
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    // A failed or killed worker can omit counters even when other workers imported every source file.
    // Source-inventory completeness alone therefore cannot qualify a failed invocation's percentages.
    const failed = !testRun.success || testRun.failed > 0 || testRun.cancelled > 0;
    return { available: !failed, ...(failed ? { reason: 'test-run-failed' } : {}),
      nodeVersion: data.nodeVersion, testRun, files, ignoredOutside, ignoredNonProduction };
  } catch (error) { return unavailable(['invalid-coverage-path', 'unsupported-coverage-path'].includes(error.message) ? error.message : 'malformed-evidence'); }
}

function readBounded(file, limit = LIMITS.bytes) {
  const before = lstatSync(file);
  if (!before.isFile() || before.size > limit) throw new Error('unreadable-or-oversized-evidence');
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('unreadable-or-oversized-evidence');
    const data = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < data.length) {
      const count = readSync(fd, data, length, data.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > limit) throw new Error('unreadable-or-oversized-evidence');
    return new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, length));
  } finally { if (fd !== undefined) closeSync(fd); }
}

function workspaceNames(root) {
  const manifest = JSON.parse(readBounded(join(root, 'package.json'), 64 * 1024));
  if (!object(manifest) || JSON.stringify(manifest.workspaces) !== '["packages/*"]') throw new Error('unsupported-workspace-layout');
  const entries = readdirSync(join(root, 'packages'), { withFileTypes: true });
  if (entries.length > 100) throw new Error('workspace-count-limit');
  return entries.filter((entry) => entry.isDirectory() && workspaceName(entry.name)).map((entry) => entry.name).sort();
}

function inventory(root, workspace, budget) {
  const files = [];
  function walk(directory, depth) {
    if (++budget.visited > LIMITS.files || depth > LIMITS.depth) throw new Error('source-inventory-limit');
    const entries = readdirSync(directory, { withFileTypes: true });
    if (entries.length > LIMITS.files) throw new Error('source-inventory-limit');
    for (const entry of entries) {
      if (excludedDirectory(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('source-symlink');
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) {
        if (++budget.visited > LIMITS.files) throw new Error('source-inventory-limit');
        const relative = repositoryPath(path, root);
        if (productionPath(relative)) files.push(relative);
      } else throw new Error('source-not-regular');
    }
  }
  const manifest = JSON.parse(readBounded(join(root, 'packages', workspace, 'package.json'), 64 * 1024));
  if (manifest?.name !== '@quietvote/' + workspace) throw new Error('unsupported-workspace-layout');
  for (const source of ['src', 'bin']) {
    const path = join(root, 'packages', workspace, source);
    try {
      if (!lstatSync(path).isDirectory()) throw new Error('source-not-directory');
    } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    walk(path, 0);
  }
  return files.sort();
}

export function percentage({ covered, total }) {
  return total === 0 ? null : covered * 100 / total;
}

/** Weighted by actual counts, never by averages of file percentages; separate runs are deliberately not merged. */
export function summarizeWorkspace(name, expected, evidence) {
  if (!evidence.available) return { workspace: name, ...unavailable(evidence.reason), linePercent: null, branchPercent: null,
    ...(name === 'crypto' ? { target: { line: 100, branch: 100 }, shortfallPercentagePoints: { line: null, branch: null } } : {}),
  };
  const prefix = `packages/${name}/`, observed = evidence.files.filter((file) => file.path.startsWith(prefix));
  const actual = new Set(observed.map((file) => file.path)), expectedSet = new Set(expected);
  const missing = expected.filter((path) => !actual.has(path));
  const unexpected = observed.filter((file) => !expectedSet.has(file.path)).map((file) => file.path);
  const totals = { lines: { covered: 0, total: 0 }, branches: { covered: 0, total: 0 } };
  for (const file of observed) for (const kind of ['lines', 'branches']) {
    totals[kind].covered += file[kind].covered;
    totals[kind].total += file[kind].total;
  }
  const reason = expected.length === 0 ? 'empty-production-inventory' : unexpected.length ? 'source-inventory-mismatch'
    : missing.length ? 'missing-source-evidence' : totals.lines.total === 0 ? 'empty-measured-source' : undefined;
  const linePercent = percentage(totals.lines), branchPercent = percentage(totals.branches);
  return { workspace: name, available: reason === undefined, ...(reason ? { reason } : {}),
    expectedFiles: expected.length, observedFiles: observed.length, missing, unexpected, observed: totals,
    linePercent: reason ? null : linePercent, branchPercent: reason ? null : branchPercent,
    ...(name === 'crypto' ? { target: { line: 100, branch: 100 }, shortfallPercentagePoints: {
      line: reason || linePercent === null ? null : (totals.lines.total - totals.lines.covered) * 100 / totals.lines.total,
      branch: reason || branchPercent === null ? null : (totals.branches.total - totals.branches.covered) * 100 / totals.branches.total,
    } } : {}),
  };
}

export function buildReport(root, input, workspace, measurementOutcome) {
  if (measurementOutcome !== undefined && !MEASUREMENT_OUTCOMES.has(measurementOutcome)) {
    return { reportOnly: true, available: false, reason: 'unsupported-measurement-outcome', workspaces: [] };
  }
  let names;
  try { names = workspaceNames(root); } catch { return { reportOnly: true, available: false, reason: 'workspace-inventory-unavailable', workspaces: [] }; }
  if (workspace !== undefined) names = names.includes(workspace) ? [workspace] : [];
  if (names.length === 0) return { reportOnly: true, available: false, reason: 'workspace-inventory-unavailable', workspaces: [] };
  let evidence;
  try { evidence = parseEvidence(readBounded(input), root); } catch { evidence = unavailable('evidence-unreadable-or-oversized'); }
  // The native runner does not know whether an npm posttest hook or the surrounding measurement step failed.
  // CI supplies the step's real outcome, never its continue-on-error conclusion.
  if (measurementOutcome !== undefined && measurementOutcome !== 'success') {
    evidence = { ...evidence, available: false, reason: 'measurement-' + measurementOutcome };
  }
  const budget = { visited: 0 };
  const workspaces = names.map((name) => {
    try { return summarizeWorkspace(name, inventory(root, name, budget), evidence); }
    catch { return { workspace: name, ...unavailable('source-inventory-unavailable') }; }
  });
  return { reportOnly: true, available: workspaces.every((row) => row.available),
    ...(measurementOutcome === undefined ? {} : { measurementOutcome }),
    scope: 'Production src/bin executable sources; tests, fixtures, benchmarks, declarations and dependencies excluded.',
    evidence: evidence.available ? { nodeVersion: evidence.nodeVersion, testRun: evidence.testRun,
      ignoredOutside: evidence.ignoredOutside, ignoredNonProduction: evidence.ignoredNonProduction } : evidence,
    workspaces };
}

const pct = (value) => value === null || value === undefined ? 'unavailable'
  : value < 100 && value.toFixed(2) === '100.00' ? '<100.00%' : value > 0 && value.toFixed(2) === '0.00' ? '>0.00%' : value.toFixed(2) + '%';
const pathsText = (paths) => paths.slice(0, 20).map((path) => JSON.stringify(path)).join(', ')
  + (paths.length > 20 ? `; ${paths.length - 20} more paths omitted from text output` : '');
export function formatReport(report) {
  const lines = ['Coverage evidence (report only; no thresholds enforced).',
    'Structural coverage does not prove correctness, mutation resistance or cryptographic assurance.',
    'Node-measured counters describe this test invocation; unexecuted functions can hide branch paths. These are not QV-11/QV-30 gate evidence.',
    'The normal test process exit status remains authoritative.', report.scope ?? 'Coverage unavailable: ' + report.reason,
    'Workspace | Node line coverage | Node branch coverage | production files | evidence'];
  for (const row of report.workspaces) {
    lines.push(`${row.workspace} | ${pct(row.linePercent)} | ${pct(row.branchPercent)} | ${row.observedFiles ?? 0}/${row.expectedFiles ?? '?'} | ${row.available ? 'available' : 'unavailable: ' + row.reason}`);
    if (!row.available && row.observed) lines.push(`  Observed subset only: lines ${pct(percentage(row.observed.lines))}, branches ${pct(percentage(row.observed.branches))}; not full-workspace coverage.`);
    if (row.missing?.length) lines.push('  Missing source evidence: ' + pathsText(row.missing));
    if (row.unexpected?.length) lines.push('  Source inventory mismatch: ' + pathsText(row.unexpected));
    if (row.workspace === 'crypto') {
      const shortfall = row.shortfallPercentagePoints;
      const pp = (value) => value === null || value === undefined ? 'unavailable'
        : value > 0 && value < 0.01 ? '<0.01 percentage points' : value.toFixed(2) + ' percentage points';
      lines.push(`  Crypto 100% line/branch target (QV-11-REQ-003): Node-measured shortfall ${pp(shortfall?.line)} / ${pp(shortfall?.branch)}.`);
    }
  }
  if (report.evidence?.nodeVersion) {
    const data = report.evidence;
    lines.push(`Node ${data.nodeVersion}; reported test summary ${data.testRun.success ? 'succeeded' : 'failed'}: ${data.testRun.tests} tests, ${data.testRun.failed} failed, ${data.testRun.cancelled} cancelled, ${data.testRun.skipped} skipped.`);
    lines.push(`Excluded records: ${data.ignoredNonProduction} non-production, ${data.ignoredOutside} outside this checkout.`);
  }
  if (report.measurementOutcome !== undefined) lines.push('Measurement step outcome: ' + report.measurementOutcome + '.');
  return lines.join('\n') + '\n';
}

export function runCli(argv) {
  const args = { root: ROOT, reportOnly: false, json: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) return { exitCode: 2, stdout: '', stderr: 'Coverage usage: repeated option.\n' };
    seen.add(flag);
    if (flag === '--report-only') args.reportOnly = true;
    else if (flag === '--json') args.json = true;
    else if (['--root', '--input', '--workspace', '--measurement-outcome'].includes(flag) && argv[i + 1] && !argv[i + 1].startsWith('--')) args[flag.slice(2)] = argv[++i];
    else return { exitCode: 2, stdout: '', stderr: 'Coverage usage: expected --report-only --input <file> [--workspace <name>] [--measurement-outcome <outcome>] [--root <repo>] [--json].\n' };
  }
  if (!args.reportOnly || !args.input || (args.workspace !== undefined && !workspaceName(args.workspace))) {
    return { exitCode: 2, stdout: '', stderr: 'Coverage usage: explicit --report-only and --input are required.\n' };
  }
  if (args['measurement-outcome'] !== undefined && !MEASUREMENT_OUTCOMES.has(args['measurement-outcome'])) {
    return { exitCode: 2, stdout: '', stderr: 'Coverage usage: measurement outcome must be success, failure, cancelled, skipped or unknown.\n' };
  }
  let report;
  try { report = buildReport(resolve(args.root), resolve(args.input), args.workspace, args['measurement-outcome']); }
  catch { report = { reportOnly: true, available: false, reason: 'report-unavailable', workspaces: [] }; }
  return { exitCode: 0, stdout: args.json ? JSON.stringify(report, null, 2) + '\n' : formatReport(report), stderr: '' };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = runCli(process.argv.slice(2));
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.exitCode;
}
