#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-30-REQ-027 QV-24-REQ-012
//
// Requirement traceability report (QV-30 section 12, QV-24, approved item N-23c: report-only).
//
// Sources of truth and inputs:
//   1. Requirement tables in docs/NN-*.md. A requirement is DEFINED by a table row whose first
//      cell is `QV-NN-REQ-nnn` in the spec file with the same NN prefix. Priority comes from the
//      `Pri`/`Priority` column (M/S/C or Must/Should/Could).
//   2. `@verifies QV-NN-REQ-nnn ...` annotations in source and test files.
//   3. Hand-maintained links in trace/links.json (QV-24 section 5: JSON form of links.yaml):
//      { "schema": "qv-trace-links/1", "requirements": { "<id>": { "status", "impl", "tests", "note" } } }
//
// What "covered" means here: status `implemented_tested` AND at least one linked or annotated
// test file that exists in the tree. It is a link check, not proof the test is sufficient.
// The statuses in trace/links.json come from an AI-assisted sweep, not an independent audit.
//
// Usage: node scripts/trace.mjs [--root <dir>] [--links <file>] [--json] [--write] [--check] [--release-gate]
//   (default)        print a per-spec summary table
//   --json           print the full matrix as JSON
//   --write          write trace/matrix.json, trace/summary.md and trace/gaps.md under the root
//   --check          exit 1 on structural errors: duplicate definitions, unknown IDs, dangling paths, bad status
//   --release-gate   additionally exit 1 if an in-scope Must requirement is not covered
// Exit codes: 0 = ok, 1 = findings for the selected gate, 2 = usage or read/parse error.
// Node built-ins only; no dependencies; runs offline.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQ_ID = /QV-(\d{2})-REQ-(\d{3})/g;
const REQ_ID_EXACT = /^QV-(\d{2})-REQ-(\d{3})$/;

// docs/SPEC-INDEX.md "Retained pre-renumbering drafts": non-authoritative files whose old QV
// numbers collide with the current index. Their IDs are not active requirements.
export const RETAINED_DRAFTS = new Set([
  '15-cryptography-and-technical-design.md',
  '17-portable-membership-credentials.md',
  '18-federated-governance.md',
  '19-delegation-exit-fork.md',
]);

export const STATUSES = new Set([
  'implemented_tested', // implementation and at least one automated test
  'implemented_untested',
  'partial',
  'not_implemented',
  'blocked_decision', // needs a recorded owner decision
  'external', // needs people or third parties (audit, counsel, native review, AT testing)
  'deferred_out_of_v1',
  'process', // an ongoing practice, not evidenced by a repository artifact
  'unassessed',
]);
// Requirements engineering alone cannot close; excluded from the engineering denominator.
export const OUT_OF_ENGINEERING_SCOPE = new Set(['external', 'deferred_out_of_v1', 'process']);

const SCAN_DIRS = ['packages', 'verifier-py', 'scripts', '.github', 'test-vectors'];
const SCAN_EXT = /\.(ts|mts|mjs|js|py|sh|yml|yaml)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__pycache__', 'fuzz-corpus']);

export function normalizePriority(cell) {
  const v = String(cell ?? '').replace(/[*`_]/g, '').trim().toLowerCase();
  if (v === 'm' || v === 'must') return 'Must';
  if (v === 's' || v === 'should') return 'Should';
  if (v === 'c' || v === 'could') return 'Could';
  return 'unknown';
}

function splitRow(line) {
  // Markdown table row -> trimmed cells. Escaped pipes stay inside their cell.
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((c) => c.trim());
}

/** Parse requirement definitions from one spec's markdown text. */
export function parseSpec(text, file) {
  const m = /^(\d{2})-/.exec(file);
  if (!m) return [];
  const specNo = m[1];
  const out = [];
  let priIdx = -1;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trimStart().startsWith('|')) {
      priIdx = -1;
      continue;
    }
    const cells = splitRow(line);
    if (/^ID$/i.test(cells[0] ?? '') && cells.some((c) => /^Requirement$/i.test(c))) {
      priIdx = cells.findIndex((c) => /^Pri(ority)?\.?$/i.test(c));
      continue;
    }
    const id = REQ_ID_EXACT.exec((cells[0] ?? '').replace(/[*`]/g, ''));
    if (!id || id[1] !== specNo) continue;
    out.push({
      id: id[0],
      spec: `QV-${specNo}`,
      file: `docs/${file}`,
      line: i + 1,
      priority: priIdx >= 0 ? normalizePriority(cells[priIdx]) : 'unknown',
      text: (cells[1] ?? '').slice(0, 240),
    });
  }
  return out;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out);
    } else if (e.isFile() && SCAN_EXT.test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
}

export function isTestPath(rel) {
  const p = rel.split(sep).join('/');
  return /(^|\/)(test|tests|e2e)\//.test(p) || /\.test\.[a-z]+$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p);
}

/** Collect `@verifies` annotations: Map<id, {tests:Set, impl:Set}>. */
export function scanAnnotations(root) {
  const found = new Map();
  const files = [];
  for (const d of SCAN_DIRS) walk(join(root, d), files);
  for (const f of files) {
    let text;
    try {
      if (statSync(f).size > 2_000_000) continue;
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes('@verifies')) continue;
    const rel = relative(root, f).split(sep).join('/');
    for (const line of text.split(/\r?\n/)) {
      const at = line.indexOf('@verifies');
      if (at < 0) continue;
      for (const id of line.slice(at).matchAll(REQ_ID)) {
        let slot = found.get(id[0]);
        if (!slot) found.set(id[0], (slot = { tests: new Set(), impl: new Set() }));
        (isTestPath(rel) ? slot.tests : slot.impl).add(rel);
      }
    }
  }
  return found;
}

function stripLocator(p) {
  // "path/to/file.ts:12" or "path/to/file.test.ts#name fragment" -> "path/to/file.ts"
  return String(p).replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '').trim();
}

export function buildMatrix(root, linksPath) {
  const errors = [];
  const docsDir = join(root, 'docs');
  const defs = new Map();
  let specFiles = [];
  try {
    specFiles = readdirSync(docsDir).filter((f) => /^\d{2}-.*\.md$/.test(f) && !RETAINED_DRAFTS.has(f)).sort();
  } catch (e) {
    throw new Error(`cannot read ${docsDir}: ${e.message}`);
  }
  for (const f of specFiles) {
    for (const r of parseSpec(readFileSync(join(docsDir, f), 'utf8'), f)) {
      const prev = defs.get(r.id);
      if (prev) errors.push(`duplicate definition of ${r.id}: ${prev.file}:${prev.line} and ${r.file}:${r.line}`);
      else defs.set(r.id, r);
    }
  }

  let links = { requirements: {} };
  if (linksPath && existsSync(linksPath)) {
    try {
      links = JSON.parse(readFileSync(linksPath, 'utf8'));
    } catch (e) {
      throw new Error(`cannot parse ${linksPath}: ${e.message}`);
    }
    if (links === null || typeof links !== 'object' || typeof links.requirements !== 'object' || links.requirements === null) {
      throw new Error(`${linksPath}: expected an object with a "requirements" object`);
    }
  }

  const annotations = scanAnnotations(root);
  for (const id of annotations.keys()) {
    if (!defs.has(id)) errors.push(`@verifies names an undefined requirement: ${id}`);
  }
  for (const id of Object.keys(links.requirements)) {
    if (!defs.has(id)) errors.push(`trace links name an undefined requirement: ${id}`);
  }

  const rows = [];
  for (const def of [...defs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const link = Object.hasOwn(links.requirements, def.id) ? links.requirements[def.id] : undefined;
    const ann = annotations.get(def.id);
    const status = link?.status ?? 'unassessed';
    if (!STATUSES.has(status)) errors.push(`${def.id}: invalid status ${JSON.stringify(status)}`);
    const tests = new Set(ann ? ann.tests : []);
    const impl = new Set(ann ? ann.impl : []);
    for (const [kind, set] of [['tests', tests], ['impl', impl]]) {
      const listed = link?.[kind] ?? [];
      if (!Array.isArray(listed)) {
        errors.push(`${def.id}: ${kind} must be an array`);
        continue;
      }
      for (const raw of listed) {
        const p = stripLocator(raw);
        if (!p || p.startsWith('/') || p.split('/').includes('..')) {
          errors.push(`${def.id}: ${kind} path must be repository-relative: ${JSON.stringify(raw)}`);
        } else if (!existsSync(join(root, p))) {
          errors.push(`${def.id}: ${kind} path does not exist: ${p}`);
        } else {
          set.add(p);
        }
      }
    }
    const covered = status === 'implemented_tested' && tests.size > 0;
    if (status === 'implemented_tested' && tests.size === 0) errors.push(`${def.id}: status implemented_tested without any existing test path`);
    rows.push({
      id: def.id,
      spec: def.spec,
      file: def.file,
      line: def.line,
      priority: def.priority,
      status,
      covered,
      in_engineering_scope: !OUT_OF_ENGINEERING_SCOPE.has(status),
      impl: [...impl].sort(),
      tests: [...tests].sort(),
      note: typeof link?.note === 'string' ? link.note : '',
    });
  }
  return { rows, errors, links_method: typeof links.method === 'string' ? links.method : '' };
}

export function summarize(rows) {
  const bySpec = new Map();
  const blank = () => ({ total: 0, must: 0, must_in_scope: 0, must_covered: 0, must_out_of_scope: 0, must_unassessed: 0, statuses: {} });
  const all = blank();
  for (const r of rows) {
    let s = bySpec.get(r.spec);
    if (!s) bySpec.set(r.spec, (s = { spec: r.spec, file: r.file, ...blank() }));
    for (const t of [s, all]) {
      t.total++;
      t.statuses[r.status] = (t.statuses[r.status] ?? 0) + 1;
      if (r.priority !== 'Must') continue;
      t.must++;
      if (r.status === 'unassessed') t.must_unassessed++;
      if (r.in_engineering_scope) {
        t.must_in_scope++;
        if (r.covered) t.must_covered++;
      } else {
        t.must_out_of_scope++;
      }
    }
  }
  return { specs: [...bySpec.values()].sort((a, b) => a.spec.localeCompare(b.spec)), all };
}

export function pct(n, d) {
  return d === 0 ? 'n/a' : `${Math.floor((100 * n) / d)}%`;
}

export function renderSummary(summary, meta) {
  const lines = [
    '# Requirement traceability summary',
    '',
    '> Generated by `node scripts/trace.mjs --write`. Do not edit by hand.',
    '> Statuses come from `trace/links.json` (an AI-assisted sweep of specs, code and tests) and from',
    '> `@verifies` annotations. This is a link report, **not** an independent audit and not proof that',
    '> a linked test is sufficient. QuietVote is unaudited and not for real elections.',
    '',
    `Commit: \`${meta.commit}\`${meta.method ? ` · Method: ${meta.method}` : ''}`,
    '',
    '"Must covered" = Must requirements whose status is `implemented_tested` with at least one existing test file linked.',
    '"In scope" excludes requirements that engineering alone cannot close (`external`, `process`, `deferred_out_of_v1`).',
    '',
    '| Spec | File | Reqs | Must | Must in scope | Must covered | Covered / in scope | Out of scope | Unassessed |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const s of summary.specs) {
    lines.push(`| ${s.spec} | \`${s.file}\` | ${s.total} | ${s.must} | ${s.must_in_scope} | ${s.must_covered} | ${pct(s.must_covered, s.must_in_scope)} | ${s.must_out_of_scope} | ${s.must_unassessed} |`);
  }
  const a = summary.all;
  lines.push(`| **All** | | ${a.total} | ${a.must} | ${a.must_in_scope} | ${a.must_covered} | ${pct(a.must_covered, a.must_in_scope)} | ${a.must_out_of_scope} | ${a.must_unassessed} |`);
  lines.push('', '## All requirements by status', '', '| Status | Count |', '|---|---:|');
  for (const [k, v] of Object.entries(a.statuses).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))) lines.push(`| \`${k}\` | ${v} |`);
  return `${lines.join('\n')}\n`;
}

export function renderGaps(rows) {
  const lines = [
    '# Traceability gaps',
    '',
    '> Generated by `node scripts/trace.mjs --write`. Do not edit by hand. Report-only (approved item N-23c).',
    '',
    '## Must requirements in engineering scope without a covering test',
    '',
    '| ID | Status | Note |',
    '|---|---|---|',
  ];
  for (const r of rows) {
    if (r.priority === 'Must' && r.in_engineering_scope && !r.covered) lines.push(`| ${r.id} | \`${r.status}\` | ${r.note.replace(/\|/g, '\\|')} |`);
  }
  lines.push('', '## Must requirements outside engineering scope', '', '| ID | Status | Note |', '|---|---|---|');
  for (const r of rows) {
    if (r.priority === 'Must' && !r.in_engineering_scope) lines.push(`| ${r.id} | \`${r.status}\` | ${r.note.replace(/\|/g, '\\|')} |`);
  }
  return `${lines.join('\n')}\n`;
}

function readCommit(root) {
  // Offline, no child process: resolve HEAD from the git directory when present.
  try {
    let gitDir = join(root, '.git');
    if (statSync(gitDir).isFile()) gitDir = resolve(root, readFileSync(gitDir, 'utf8').replace(/^gitdir:\s*/, '').trim());
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return head;
    const ref = head.slice(4).trim();
    for (const base of [gitDir, existsSync(join(gitDir, 'commondir')) ? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()) : gitDir]) {
      if (existsSync(join(base, ref))) return readFileSync(join(base, ref), 'utf8').trim();
    }
  } catch {
    // not a git checkout
  }
  return 'unknown';
}

export function runCli(argv) {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let linksPath;
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && i + 1 < argv.length) root = resolve(argv[++i]);
    else if (a === '--links' && i + 1 < argv.length) linksPath = resolve(argv[++i]);
    else if (['--json', '--write', '--check', '--release-gate'].includes(a)) flags.add(a);
    else if (a === '--help') return { exitCode: 0, stdout: 'Usage: node scripts/trace.mjs [--root <dir>] [--links <file>] [--json] [--write] [--check] [--release-gate]\n', stderr: '' };
    else return { exitCode: 2, stdout: '', stderr: `trace: unknown or incomplete argument: ${a}\n` };
  }
  linksPath ??= join(root, 'trace', 'links.json');
  let matrix;
  try {
    matrix = buildMatrix(root, linksPath);
  } catch (e) {
    return { exitCode: 2, stdout: '', stderr: `trace: ${e.message}\n` };
  }
  const summary = summarize(matrix.rows);
  const meta = { commit: readCommit(root), method: matrix.links_method };
  const summaryMd = renderSummary(summary, meta);
  if (flags.has('--write')) {
    const dir = join(root, 'trace');
    mkdirSync(dir, { recursive: true });
    // No commit or timestamp in the written files: output is a pure function of the tree, so CI can drift-check it.
    const stable = { commit: 'see git history', method: meta.method };
    writeFileSync(join(dir, 'matrix.json'), `${JSON.stringify({ schema: 'qv-trace-matrix/1', summary, requirements: matrix.rows }, null, 1)}\n`);
    writeFileSync(join(dir, 'summary.md'), renderSummary(summary, stable));
    writeFileSync(join(dir, 'gaps.md'), renderGaps(matrix.rows));
  }
  const uncovered = matrix.rows.filter((r) => r.priority === 'Must' && r.in_engineering_scope && !r.covered).length;
  let stderr = '';
  let exitCode = 0;
  if (flags.has('--check') && matrix.errors.length) {
    stderr += matrix.errors.map((e) => `trace: ${e}\n`).join('');
    exitCode = 1;
  } else if (matrix.errors.length) {
    stderr += `trace: ${matrix.errors.length} structural finding(s); run with --check to list and fail on them\n`;
  }
  if (flags.has('--release-gate') && uncovered > 0) {
    stderr += `trace: release gate: ${uncovered} in-scope Must requirement(s) without a covering test\n`;
    exitCode = 1;
  }
  const stdout = flags.has('--json')
    ? `${JSON.stringify({ commit: meta.commit, summary, errors: matrix.errors, requirements: matrix.rows }, null, 1)}\n`
    : summaryMd;
  return { exitCode, stdout, stderr };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = exitCode;
}
