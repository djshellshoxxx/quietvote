#!/usr/bin/env node
// Requirements traceability report: requirement IDs in spec tables -> tests tagged @verifies.
//
// Status: REPORT-ONLY (QV-ADR-027 N-23c). It never fails because a requirement is untagged;
// QV-30-REQ-027 makes coverage a release gate, and no gated release exists yet. This is an
// interim script, not the full `rtm` generator specified in QV-24 §6 (links.yaml, waivers,
// evidence, text hashes and the RTM regions in docs/24 are not implemented).
//
// Inputs:
//   docs/*.md (top level)  Markdown table rows whose first cell is QV-NN-REQ-NNN. The
//                          priority / verification columns are found by header name.
//   test sources           packages/*/{test,tests,e2e,fuzz}/** and packages/**/*.test.*,
//                          verifier-py/tests/**; lines carrying `@verifies` (QV-30 §12) or
//                          `@covers` (QV-24 §6.1(c)) followed by requirement IDs.
// Output:
//   docs/reports/traceability-matrix.md (default), or --out <path>, or --stdout / --json.
//   The output is deterministic: sorted, no timestamps, no commit id, no requirement text.
//
// Usage: node scripts/trace.mjs [--out <path>] [--stdout] [--json] [--quiet]
// Exit codes: 0 = report produced (coverage gaps and warnings never change this);
//             2 = usage or input error.
// Node built-ins only; no dependencies. QuietVote is unaudited and not for real elections.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OUT = join('docs', 'reports', 'traceability-matrix.md');

const REQ_ID = /^QV-(\d{2})-REQ-(\d{3})$/;
const TAG = /@(verifies|covers)\b((?:[\s,]+QV-\d{2}-REQ-\d{3})+)/g;
const TAG_ID = /QV-\d{2}-REQ-\d{3}/g;
// Spec text that scopes part of a requirement out, e.g. "**Deferred (QV-ADR-027 ...)**".
const DEFERRED = /\bDeferred\b[^|]*?\bQV-ADR-\d{3}\b/;
const TEST_DIRS = new Set(['test', 'tests', 'e2e', 'fuzz']);
const TEST_EXT = /\.(?:ts|mts|js|mjs|cjs|py)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '__pycache__', 'coverage']);

function toPosix(path) {
  return path.split(sep).join('/');
}

// ---- requirements ----------------------------------------------------------------

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  // Split on pipes that are neither escaped nor inside a backtick code span (`|roll|`);
  // drop the empty first/last cells from the leading/trailing pipe.
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (ch === '`') {
      inCode = !inCode;
      cell += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  if (cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function stripMarkup(cell) {
  return cell.replace(/[`*_]/g, '').trim();
}

// Qualified priorities ("Should (Phase 2)", "Must before M4", "S→M for flow-critical") map to
// their strongest named level, so a conditional Must is still listed with the Musts.
export function normalizePriority(value) {
  const v = stripMarkup(value ?? '').toLowerCase();
  if (v === '') return 'Unknown';
  if (/(^|[^a-z])(m|must)([^a-z]|$)/.test(v)) return 'Must';
  if (/(^|[^a-z])(s|should)([^a-z]|$)/.test(v)) return 'Should';
  if (/(^|[^a-z])(c|could|may)([^a-z]|$)/.test(v)) return 'Could';
  return `Unknown(${stripMarkup(value)})`;
}

/** Parse requirement rows from one Markdown file. `rel` is the repo-relative path. */
export function parseRequirements(text, rel) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let header = null;
  let fence = null;
  lines.forEach((line, index) => {
    // Rows inside fenced code blocks are examples, not requirements (e.g. QV-24 §6.2).
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      header = null;
      return;
    }
    if (fence !== null) return;
    const cells = splitRow(line);
    if (!cells) {
      header = null;
      return;
    }
    if (header === null) {
      // First row of a table is its header row.
      header = cells.map((c) => stripMarkup(c).toLowerCase());
      return;
    }
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) return; // delimiter row
    const first = stripMarkup(cells[0] ?? '');
    const match = REQ_ID.exec(first);
    if (!match) return;
    const col = (names) => (header ? header.findIndex((h) => names.includes(h)) : -1);
    const pri = col(['priority', 'pri', 'pri.']);
    const ver = col(['verification', 'ver', 'ver.', 'verif', 'verif.']);
    out.push({
      id: first,
      spec: `QV-${match[1]}`,
      file: rel,
      line: index + 1,
      priority: pri >= 0 ? normalizePriority(cells[pri]) : 'Unknown',
      verification: ver >= 0 ? stripMarkup(cells[ver] ?? '') : '',
      deferredPart: DEFERRED.test(line),
      prefixMismatch: !rel.split('/').pop().startsWith(`${match[1]}-`),
    });
  });
  return out;
}

// ---- tags ------------------------------------------------------------------------

/** Find @verifies / @covers tags in one test source. */
export function parseTags(text, rel) {
  const out = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(TAG)) {
      for (const id of match[2].match(TAG_ID) ?? []) out.push({ id, file: rel, line: index + 1, kind: match[1] });
    }
  });
  return out;
}

function walk(directory, keep, out) {
  if (!existsSync(directory)) return out;
  for (const name of readdirSync(directory).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, keep, out);
    else if (keep(path)) out.push(path);
  }
  return out;
}

export function collectSpecFiles(root = ROOT) {
  const docs = join(root, 'docs');
  if (!existsSync(docs)) return [];
  return readdirSync(docs)
    .filter((name) => /^\d{2}-.*\.md$/.test(name))
    .sort()
    .map((name) => join(docs, name));
}

export function collectTestFiles(root = ROOT) {
  const isTest = (path) => {
    const rel = toPosix(relative(root, path));
    if (!TEST_EXT.test(rel)) return false;
    if (/\.test\.[a-z]+$/.test(rel)) return true;
    return rel.split('/').some((part) => TEST_DIRS.has(part));
  };
  const files = walk(join(root, 'packages'), isTest, []);
  walk(join(root, 'verifier-py', 'tests'), (path) => /\.py$/.test(path), files);
  return [...new Set(files)].sort();
}

// ---- model -----------------------------------------------------------------------

// "path:line" ordering: by path (code-point order, locale independent), then numerically by line.
function byLocation(a, b) {
  const [pa, la] = [a.slice(0, a.lastIndexOf(':')), Number(a.slice(a.lastIndexOf(':') + 1))];
  const [pb, lb] = [b.slice(0, b.lastIndexOf(':')), Number(b.slice(b.lastIndexOf(':') + 1))];
  if (pa !== pb) return pa < pb ? -1 : 1;
  return la - lb;
}

export function buildModel(requirementRows, tagRows) {
  const byId = new Map();
  for (const row of requirementRows) {
    if (!byId.has(row.id)) byId.set(row.id, { ...row, definitions: [] });
    byId.get(row.id).definitions.push(`${row.file}:${row.line}`);
  }
  const tagsById = new Map();
  const unknownTags = [];
  for (const tag of tagRows) {
    if (!byId.has(tag.id)) {
      unknownTags.push(tag);
      continue;
    }
    if (!tagsById.has(tag.id)) tagsById.set(tag.id, []);
    tagsById.get(tag.id).push(`${tag.file}:${tag.line}`);
  }
  const requirements = [...byId.values()]
    .map((req) => ({
      id: req.id,
      spec: req.spec,
      priority: req.priority,
      verification: req.verification,
      definitions: req.definitions,
      deferredPart: req.deferredPart,
      prefixMismatch: req.prefixMismatch,
      tests: [...new Set(tagsById.get(req.id) ?? [])].sort(byLocation),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const specs = new Map();
  for (const req of requirements) {
    if (!specs.has(req.spec)) specs.set(req.spec, { spec: req.spec, total: 0, must: 0, tagged: 0, mustTagged: 0 });
    const s = specs.get(req.spec);
    s.total += 1;
    if (req.tests.length > 0) s.tagged += 1;
    if (req.priority === 'Must') {
      s.must += 1;
      if (req.tests.length > 0) s.mustTagged += 1;
    }
  }
  const sum = (key) => [...specs.values()].reduce((n, s) => n + s[key], 0);
  return {
    requirements,
    specs: [...specs.values()].sort((a, b) => (a.spec < b.spec ? -1 : 1)),
    totals: { requirements: requirements.length, must: sum('must'), tagged: sum('tagged'), mustTagged: sum('mustTagged'), tags: tagRows.length },
    duplicates: requirements.filter((r) => r.definitions.length > 1),
    prefixMismatches: requirements.filter((r) => r.prefixMismatch),
    unknownPriority: requirements.filter((r) => r.priority.startsWith('Unknown')),
    deferred: requirements.filter((r) => r.deferredPart),
    unknownTags: unknownTags.sort((a, b) => byLocation(`${a.file}:${a.line}`, `${b.file}:${b.line}`)),
  };
}

// ---- rendering -------------------------------------------------------------------

function pct(n, d) {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`;
}

export function renderMarkdown(model) {
  const t = model.totals;
  const out = [];
  out.push('# Traceability matrix (generated, report-only)');
  out.push('');
  out.push('Generated by `node scripts/trace.mjs`. Do not edit by hand; rerun the script.');
  out.push('');
  out.push('**Status:** report-only per QV-ADR-027 N-23c. Untagged requirements are listed, not failed. This is an interim view, not the QV-24 §6 `rtm` generator, and it is not release evidence. A `@verifies` tag means a test author linked the test to the requirement; it is not a review that the test is sufficient. QuietVote is unaudited and not for real elections.');
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- Requirements found in spec tables: ${t.requirements} (Must: ${t.must}).`);
  out.push(`- Requirements with at least one tagged test: ${t.tagged} (${pct(t.tagged, t.requirements)}).`);
  out.push(`- Must requirements with at least one tagged test: ${t.mustTagged} of ${t.must} (${pct(t.mustTagged, t.must)}).`);
  out.push(`- Tagged requirement-ID references in tests: ${t.tags}; references to unknown IDs: ${model.unknownTags.length}.`);
  out.push(`- IDs defined more than once: ${model.duplicates.length}; IDs whose prefix differs from the file number: ${model.prefixMismatches.length}; rows without a recognised priority: ${model.unknownPriority.length}.`);
  out.push('');
  out.push('| Spec | Requirements | Must | Tagged | Must tagged |');
  out.push('|---|---|---|---|---|');
  for (const s of model.specs) out.push(`| ${s.spec} | ${s.total} | ${s.must} | ${s.tagged} | ${s.mustTagged} |`);
  out.push('');
  out.push('## Tagged requirements');
  out.push('');
  const tagged = model.requirements.filter((r) => r.tests.length > 0);
  if (tagged.length === 0) out.push('_None._');
  else {
    out.push('| Requirement | Priority | Tests (`@verifies` / `@covers` locations) | Notes |');
    out.push('|---|---|---|---|');
    for (const r of tagged) {
      const notes = r.deferredPart ? 'part of the requirement is deferred in the spec' : '';
      out.push(`| ${r.id} | ${r.priority} | ${r.tests.map((x) => `\`${x}\``).join('<br>')} | ${notes} |`);
    }
  }
  out.push('');
  out.push('## Requirements with a deferred part');
  out.push('');
  out.push('Rows whose spec text marks part of the requirement as deferred by an ADR. Coverage of such a row covers only the part in scope.');
  out.push('');
  if (model.deferred.length === 0) out.push('_None._');
  else for (const r of model.deferred) out.push(`- ${r.id} (${r.priority}): ${r.definitions.map((d) => `\`${d}\``).join(', ')}`);
  out.push('');
  out.push('## Untagged Must requirements by spec');
  out.push('');
  for (const s of model.specs) {
    const ids = model.requirements.filter((r) => r.spec === s.spec && r.priority === 'Must' && r.tests.length === 0).map((r) => r.id);
    if (ids.length > 0) out.push(`- **${s.spec}** (${ids.length}): ${ids.join(', ')}`);
  }
  out.push('');
  out.push('## Warnings');
  out.push('');
  out.push('### Tags referencing unknown requirement IDs');
  out.push('');
  if (model.unknownTags.length === 0) out.push('_None._');
  else for (const tag of model.unknownTags) out.push(`- ${tag.id} at \`${tag.file}:${tag.line}\``);
  out.push('');
  out.push('### IDs defined more than once');
  out.push('');
  if (model.duplicates.length === 0) out.push('_None._');
  else for (const r of model.duplicates) out.push(`- ${r.id}: ${r.definitions.map((d) => `\`${d}\``).join(', ')}`);
  out.push('');
  out.push('### IDs whose prefix differs from the spec file number');
  out.push('');
  if (model.prefixMismatches.length === 0) out.push('_None._');
  else for (const r of model.prefixMismatches) out.push(`- ${r.id}: ${r.definitions.map((d) => `\`${d}\``).join(', ')}`);
  out.push('');
  out.push('### Rows without a recognised priority column');
  out.push('');
  if (model.unknownPriority.length === 0) out.push('_None._');
  else for (const r of model.unknownPriority) out.push(`- ${r.id}: ${r.definitions.map((d) => `\`${d}\``).join(', ')}`);
  out.push('');
  return out.join('\n');
}

// ---- main ------------------------------------------------------------------------

export function run(root = ROOT) {
  const requirementRows = collectSpecFiles(root).flatMap((file) => parseRequirements(readFileSync(file, 'utf8'), toPosix(relative(root, file))));
  const tagRows = collectTestFiles(root).flatMap((file) => parseTags(readFileSync(file, 'utf8'), toPosix(relative(root, file))));
  return buildModel(requirementRows, tagRows);
}

function main(argv) {
  const known = new Set(['--out', '--stdout', '--json', '--quiet']);
  for (let i = 0; i < argv.length; i += 1) {
    if (!known.has(argv[i])) {
      console.error(`trace: unknown argument ${argv[i]}`);
      return 2;
    }
    if (argv[i] === '--out') i += 1;
  }
  const outIndex = argv.indexOf('--out');
  if (outIndex >= 0 && (argv[outIndex + 1] === undefined || argv[outIndex + 1].startsWith('--'))) {
    console.error('trace: --out needs a path');
    return 2;
  }
  const model = run(ROOT);
  if (model.totals.requirements === 0) {
    console.error('trace: no requirement rows found under docs/ (input error)');
    return 2;
  }
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(model, null, 2)}\n`);
    return 0;
  }
  const markdown = renderMarkdown(model);
  if (argv.includes('--stdout')) {
    process.stdout.write(markdown);
    return 0;
  }
  const outPath = join(ROOT, outIndex >= 0 ? argv[outIndex + 1] : DEFAULT_OUT);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, markdown);
  const t = model.totals;
  if (!argv.includes('--quiet')) {
    console.log(`trace: ${t.requirements} requirement(s) (${t.must} Must); ${t.tagged} tagged (${t.mustTagged} Must); ${t.tags} tag reference(s), ${model.unknownTags.length} unknown; ${model.duplicates.length} duplicate ID(s).`);
    console.log(`trace: wrote ${toPosix(relative(ROOT, outPath))} (report-only, QV-ADR-027 N-23c).`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
