#!/usr/bin/env node
// Summarize the existing strict TypeScript/Python verifier comparator JSON.
// This is diagnostic-only: it does not decide protocol semantics or waive mismatches.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeComparatorReport(report) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new TypeError('Comparator report must be a JSON object');
  }
  const { rows, cases, failures, ok } = report;
  if (!Array.isArray(rows) || !Number.isSafeInteger(cases) || cases <= 0 || rows.length !== cases ||
      !Number.isSafeInteger(failures) || failures < 0 || failures > cases || typeof ok !== 'boolean') {
    throw new TypeError('Comparator report has invalid cases, failures, ok, or rows');
  }
  const fields = new Map();
  const skipped = new Set();
  const mismatches = [];
  const ids = new Set();
  let verdictAgreements = 0;
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.id !== 'string' || !row.id || ids.has(row.id) ||
        typeof row.ts_verdict !== 'string' || typeof row.python_verdict !== 'string' ||
        !Array.isArray(row.differences) || !row.differences.every(d => typeof d === 'string') ||
        !Array.isArray(row.skipped) || !row.skipped.every(s => typeof s === 'string')) {
      throw new TypeError('Comparator report contains an invalid or duplicate case row');
    }
    ids.add(row.id);
    if (row.ts_verdict === row.python_verdict) verdictAgreements++;
    for (const entry of row.skipped) skipped.add(entry);
    if (!row.differences.length) continue;
    mismatches.push({ id: row.id, fields: row.differences.length });
    for (const difference of row.differences) {
      const key = difference.startsWith('Python threw:') ? 'python_exception' :
        (/^([A-Za-z][A-Za-z0-9_.-]*):/.exec(difference)?.[1] ?? 'unclassified');
      fields.set(key, (fields.get(key) ?? 0) + 1);
    }
  }
  if (mismatches.length !== failures || ok !== (failures === 0)) {
    throw new TypeError('Comparator summary counters contradict case rows; refusing to report a false pass');
  }
  return {
    ok,
    cases,
    mismatching_cases: failures,
    verdict_agreements: verdictAgreements,
    differing_fields: [...fields].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([field, count]) => ({ field, count })),
    mismatches,
    excluded_capabilities: [...skipped].sort(),
    note: 'Diagnostic only. Every difference remains a strict comparator failure; exclusions are not agreement.',
  };
}

export function runCli(argv, stdin = undefined) {
  let input = '-';
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help') {
      return { exitCode: 0, output: 'Usage: node scripts/triage-verifier-report.mjs [--input path|-] [--json]\nPass the full output of compare-verifiers.ts --json. A mismatch exits 1; bad input exits 2.\n' };
    }
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--input' && i + 1 < argv.length) input = argv[++i];
    else throw new TypeError(`Unknown or incomplete argument: ${argv[i]}`);
  }
  const content = input === '-' ? (stdin ?? readFileSync(0, 'utf8')) : readFileSync(input, 'utf8');
  const summary = summarizeComparatorReport(JSON.parse(content));
  const output = json ? `${JSON.stringify(summary, null, 2)}\n` : [
    `Strict comparator: ${summary.cases - summary.mismatching_cases}/${summary.cases} cases agree; ${summary.mismatching_cases} mismatching cases.`,
    `Verdicts agree: ${summary.verdict_agreements}/${summary.cases} (does not imply report agreement).`,
    ...summary.differing_fields.map(x => `  ${x.field}: ${x.count} differences`),
    `Excluded capabilities (not agreement): ${summary.excluded_capabilities.length ? summary.excluded_capabilities.join('; ') : 'none'}`,
    summary.note,
  ].join('\n') + '\n';
  return { exitCode: summary.ok ? 0 : 1, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { exitCode, output } = runCli(process.argv.slice(2));
    process.stdout.write(output);
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`Verifier comparator triage error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
