#!/usr/bin/env node
// Dependency and licence snapshot generator.
//
// Reads package-lock.json (lockfileVersion 2 or 3) and, for each third-party package it lists,
// the installed node_modules/<name>/package.json when present (falling back to the lockfile
// entry). Writes a Markdown report to docs/reports/dependency-licence-snapshot.md.
//
// Usage: node scripts/licence-snapshot.mjs [--stdout]
//
// This is a snapshot for engineering review. It is NOT legal advice and NOT a licence audit.
// Classifications use a fixed table below; anything not in the table is flagged for manual review.
// Node built-ins only; no dependencies.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, 'package-lock.json');
const OUT = join(ROOT, 'docs', 'reports', 'dependency-licence-snapshot.md');
const TO_STDOUT = process.argv.includes('--stdout');
const SNAPSHOT_DATE = new Date().toISOString().slice(0, 10);

// Licence classes relative to the project licence (AGPL-3.0-or-later).
//   permissive   : may be combined into an AGPL-3.0-or-later work; attribution/notice duties only.
//   copyleft-ok  : GPL/LGPL/AGPL version 3 or later; compatible with AGPL-3.0-or-later.
//   flag         : known incompatible, non-OSI, or restrictive; needs human review before release.
//   unknown      : no licence declared, unrecognised string, or a licence file that must be read.
const CLASS_TABLE = new Map([
  ['MIT', 'permissive'], ['MIT-0', 'permissive'], ['ISC', 'permissive'], ['BSD-2-Clause', 'permissive'],
  ['BSD-3-Clause', 'permissive'], ['Apache-2.0', 'permissive'], ['0BSD', 'permissive'], ['Unlicense', 'permissive'],
  ['CC0-1.0', 'permissive'], ['BlueOak-1.0.0', 'permissive'], ['Zlib', 'permissive'], ['BSL-1.0', 'permissive'],
  ['Python-2.0', 'permissive'],
  ['GPL-3.0-only', 'copyleft-ok'], ['GPL-3.0-or-later', 'copyleft-ok'], ['AGPL-3.0-only', 'copyleft-ok'],
  ['AGPL-3.0-or-later', 'copyleft-ok'], ['LGPL-3.0-only', 'copyleft-ok'], ['LGPL-3.0-or-later', 'copyleft-ok'],
  ['GPL-2.0-or-later', 'copyleft-ok'], ['LGPL-2.1-or-later', 'copyleft-ok'],
  ['GPL-2.0-only', 'flag'], ['GPL-2.0', 'flag'], ['LGPL-2.1-only', 'flag'], ['SSPL-1.0', 'flag'],
  ['BUSL-1.1', 'flag'], ['CC-BY-NC-4.0', 'flag'], ['CC-BY-NC-SA-4.0', 'flag'],
  ['UNLICENSED', 'unknown'], ['SEE LICENSE IN', 'unknown'], ['UNKNOWN', 'unknown'],
]);

function normaliseId(id) {
  const trimmed = id.trim();
  if (CLASS_TABLE.has(trimmed)) return trimmed;
  // Accept "GPL-2.0" bare forms that appear in older package.json files.
  if (/^SEE LICEN[SC]E/i.test(trimmed)) return 'SEE LICENSE IN';
  return trimmed;
}

// Parse an SPDX-like expression. Supports "A OR B", "A AND B", "(A OR B)" and "A WITH exception".
function classifyExpression(expression) {
  const text = expression.replace(/[()]/g, ' ').trim();
  if (text === '') return 'unknown';
  // OR: one compatible alternative is enough. AND: all parts must be compatible.
  if (/\sOR\s/.test(text)) {
    const parts = text.split(/\s+OR\s+/).map(classifyExpression);
    if (parts.includes('permissive') || parts.includes('copyleft-ok')) return parts.includes('permissive') ? 'permissive' : 'copyleft-ok';
    if (parts.includes('unknown')) return 'unknown';
    return 'flag';
  }
  if (/\sAND\s/.test(text)) {
    const parts = text.split(/\s+AND\s+/).map(classifyExpression);
    if (parts.includes('flag')) return 'flag';
    if (parts.includes('unknown')) return 'unknown';
    return parts.includes('copyleft-ok') ? 'copyleft-ok' : 'permissive';
  }
  const id = normaliseId(text.replace(/\s+WITH\s+.*$/, ''));
  return CLASS_TABLE.get(id) ?? 'unknown';
}

function licenceString(meta) {
  if (!meta) return null;
  if (typeof meta.license === 'string') return meta.license;
  if (meta.license && typeof meta.license.type === 'string') return meta.license.type;
  if (Array.isArray(meta.licenses)) {
    const types = meta.licenses.map((l) => (typeof l === 'string' ? l : l && l.type)).filter(Boolean);
    if (types.length > 0) return types.join(' OR ');
  }
  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// ---- collect -------------------------------------------------------------------

const lock = readJson(LOCK);
if (!lock || !lock.packages) {
  console.error(`licence-snapshot: cannot read ${LOCK}`);
  process.exit(2);
}

const rows = [];
let workspaceLinksSkipped = 0;
for (const [key, entry] of Object.entries(lock.packages)) {
  if (!key.startsWith('node_modules/')) continue; // root and workspace package entries
  if (entry.link) {
    workspaceLinksSkipped += 1;
    continue;
  }
  const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
  if (name.startsWith('@quietvote/')) {
    workspaceLinksSkipped += 1;
    continue; // project's own packages
  }
  const installed = readJson(join(ROOT, key, 'package.json'));
  const fromInstalled = installed !== null;
  const meta = fromInstalled ? installed : entry;
  const version = (fromInstalled ? installed.version : entry.version) ?? 'unknown';
  const declared = licenceString(meta) ?? licenceString(entry);
  const scope = entry.dev ? 'dev' : 'prod';
  const optional = entry.optional ? ' (optional)' : '';
  const classification = declared ? classifyExpression(declared) : 'unknown';
  rows.push({
    name,
    version,
    declared: declared ?? 'none declared',
    classification,
    scope: scope + optional,
    source: fromInstalled ? 'installed package.json' : existsSync(join(ROOT, key)) ? 'installed (no package.json)' : 'lockfile only',
    flag: classification === 'flag' || classification === 'unknown',
  });
}

rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// ---- render --------------------------------------------------------------------

const flagged = rows.filter((r) => r.flag);
const counts = { permissive: 0, 'copyleft-ok': 0, flag: 0, unknown: 0 };
for (const r of rows) counts[r.classification] += 1;
const lockfileOnly = rows.filter((r) => r.source === 'lockfile only').length;

const lines = [];
lines.push('# Dependency and licence snapshot');
lines.push('');
lines.push(`**Snapshot date:** ${SNAPSHOT_DATE}  `);
lines.push('**Generated by:** `node scripts/licence-snapshot.mjs` from `package-lock.json` and installed `node_modules/*/package.json`.  ');
lines.push('**Project licence (declared in `LICENSE` and `package.json`):** AGPL-3.0-or-later.');
lines.push('');
lines.push('> **Snapshot, not legal advice.** This is an engineering snapshot of declared licence metadata. It is not a licence audit, does not read licence texts or NOTICE files, and does not confirm that a declared licence is correct. Any licence question before a release or distribution needs a qualified reviewer.');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Measure | Count |');
lines.push('|---|---|');
lines.push(`| Third-party packages listed in the lockfile | ${rows.length} |`);
lines.push(`| Permissive (compatible with AGPL-3.0-or-later) | ${counts.permissive} |`);
lines.push(`| GPL/LGPL/AGPL v3 or later (compatible) | ${counts['copyleft-ok']} |`);
lines.push(`| Flagged: incompatible or restrictive licence | ${counts.flag} |`);
lines.push(`| Flagged: unknown or undeclared licence | ${counts.unknown} |`);
lines.push(`| Resolved from lockfile only (not installed) | ${lockfileOnly} |`);
lines.push(`| @quietvote/* workspace link entries (excluded from the list) | ${workspaceLinksSkipped} |`);
lines.push('');
lines.push('## Flags for review');
lines.push('');
if (flagged.length === 0) {
  lines.push('No package is flagged. Every declared licence is in the fixed classification table in `scripts/licence-snapshot.mjs`.');
} else {
  lines.push('| Package | Version | Declared licence | Class | Scope | Why |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of flagged) {
    const why = r.classification === 'flag' ? 'Licence not compatible with AGPL-3.0-or-later, or restrictive; review before use' : 'Licence missing or not recognised; read the package licence text';
    lines.push(`| ${escapeCell(r.name)} | ${escapeCell(r.version)} | ${escapeCell(r.declared)} | ${r.classification} | ${escapeCell(r.scope)} | ${why} |`);
  }
}
lines.push('');
lines.push('## All dependencies');
lines.push('');
lines.push('Scope is taken from the lockfile: `prod` means not marked dev-only, `dev` means dev-only. The lockfile does not show whether a package is shipped in a build.');
lines.push('');
lines.push('| Package | Version | Declared licence | Class | Scope | Source |');
lines.push('|---|---|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${escapeCell(r.name)} | ${escapeCell(r.version)} | ${escapeCell(r.declared)} | ${r.classification} | ${escapeCell(r.scope)} | ${escapeCell(r.source)} |`);
}
lines.push('');
lines.push('## Method and limits');
lines.push('');
lines.push('- Versions and licences come from the installed `package.json` when it exists, otherwise from the lockfile entry.');
lines.push('- Classes: `permissive` (MIT, ISC, BSD, Apache-2.0, 0BSD, and similar), `copyleft-ok` (GPL, LGPL, AGPL version 3 or later), `flag` (GPL-2.0-only and other entries in the table as incompatible or restrictive), `unknown` (missing or unrecognised).');
lines.push('- Expressions with `OR` count as compatible if any alternative is compatible; `AND` requires every part to be compatible.');
lines.push('- Not covered: transitive licence texts, copyright notices, vendored code not listed in the lockfile, font and asset licences, and licences of tools run outside the repository (for example the Playwright browser).');
lines.push('- Regenerate after any change to `package-lock.json`: `node scripts/licence-snapshot.mjs`.');
lines.push('');

const output = lines.join('\n');
if (TO_STDOUT) {
  process.stdout.write(output);
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, output, 'utf8');
  console.log(`licence-snapshot: wrote ${rows.length} package(s) to ${OUT}; flagged ${flagged.length}.`);
}
