#!/usr/bin/env node
// Public-claims lint: flags banned or overstated phrases in public documentation.
//
// Scans: README.md, docs/**/*.md, wiki/**/*.md, packages/*/README.md
// Rules: docs/claims/banned-phrases.txt (format documented in that file)
// Exemptions: inline marker <!-- claims-lint-ignore --> (same line or the line before),
//             block <!-- claims-lint-ignore-start --> ... <!-- claims-lint-ignore-end -->,
//             quoted text inside docs/claims/** only.
//
// Usage: node scripts/lint-claims.mjs [--quiet]
// Exit codes: 0 = no findings, 1 = findings, 2 = configuration or usage error.
// CI runs this as a non-blocking step (continue-on-error), see .github/workflows/ci.yml.
// Node built-ins only; no dependencies.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES_FILE = join(ROOT, 'docs', 'claims', 'banned-phrases.txt');
const QUIET = process.argv.includes('--quiet');

const NEGATION = /\b(not|no|never|nor|without|cannot|can't|isn't|doesn't|don't)\b|\bun-?(audited|certified|reviewed|verified)\b|\bnon-\w+/i;
const MARKER_LINE = /<!--\s*claims-lint-ignore\s*-->/;
const MARKER_START = /<!--\s*claims-lint-ignore-start\s*-->/;
const MARKER_END = /<!--\s*claims-lint-ignore-end\s*-->/;
const QUOTED = /"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/g;
// A line that labels wording as a non-claim, unsupported or forbidden is not a public claim.
const NON_CLAIM_LINE = /\b(non-?claims?|unsupported|forbidden|banned|must not|not claimed|(does|do) not (claim|promise|guarantee)|restricted language)\b/i;
const ALLOW_WINDOW = 80;
const NEGATION_WINDOW = 60;

function fail(message, code = 2) {
  console.error(`lint-claims: ${message}`);
  process.exit(code);
}

// ---- rules -------------------------------------------------------------------

function parseRules(text) {
  const rules = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    let [pattern, allow] = line.split(' || ').map((s) => s.trim());
    let source;
    let regex;
    try {
      if (pattern.startsWith('re:')) {
        source = pattern.slice(3);
        regex = new RegExp(source, 'giu');
      } else {
        source = pattern;
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
      }
    } catch (error) {
      fail(`${RULES_FILE}:${index + 1}: invalid pattern (${error.message})`);
    }
    let allowRegex = null;
    if (allow) {
      try {
        allowRegex = new RegExp(allow, 'iu');
      } catch (error) {
        fail(`${RULES_FILE}:${index + 1}: invalid allow-pattern (${error.message})`);
      }
    }
    rules.push({ id: source, regex, allowRegex, line: index + 1 });
  });
  return rules;
}

// ---- files -------------------------------------------------------------------

function walk(directory, out) {
  if (!existsSync(directory)) return out;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, out);
    else if (/\.md$/i.test(name)) out.push(path);
  }
  return out;
}

function collectFiles() {
  const files = [join(ROOT, 'README.md')];
  walk(join(ROOT, 'docs'), files);
  walk(join(ROOT, 'wiki'), files);
  const packages = join(ROOT, 'packages');
  if (existsSync(packages)) {
    for (const name of readdirSync(packages)) {
      const readme = join(packages, name, 'README.md');
      if (existsSync(readme)) files.push(readme);
    }
  }
  return files.filter((file) => existsSync(file)).sort();
}

// ---- matching ----------------------------------------------------------------

function quotedSpans(line) {
  const spans = [];
  for (const match of line.matchAll(QUOTED)) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

function isNegated(line, start) {
  const before = line.slice(0, start);
  const sentenceStart = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf(';'), before.lastIndexOf(':'));
  const segment = before.slice(Math.max(sentenceStart + 1, start - NEGATION_WINDOW));
  return NEGATION.test(segment);
}

function allowed(rule, line, start, end) {
  if (!rule.allowRegex) return false;
  const window = line.slice(Math.max(0, start - ALLOW_WINDOW), Math.min(line.length, end + ALLOW_WINDOW));
  return rule.allowRegex.test(window);
}

function lintFile(file, rules) {
  const rel = relative(ROOT, file).split(sep).join('/');
  const inClaimsDir = rel.startsWith('docs/claims/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const findings = [];
  let inBlock = false;
  lines.forEach((line, index) => {
    if (MARKER_START.test(line)) {
      inBlock = true;
      return;
    }
    if (MARKER_END.test(line)) {
      inBlock = false;
      return;
    }
    if (inBlock || MARKER_LINE.test(line) || (index > 0 && MARKER_LINE.test(lines[index - 1]))) return;

    if (NON_CLAIM_LINE.test(line)) return;
    const quoted = inClaimsDir ? quotedSpans(line) : [];
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      for (const match of line.matchAll(rule.regex)) {
        const start = match.index;
        const end = start + match[0].length;
        if (quoted.some(([qs, qe]) => start >= qs && end <= qe)) continue;
        if (isNegated(line, start)) continue;
        if (allowed(rule, line, start, end)) continue;
        findings.push({ file: rel, line: index + 1, column: start + 1, rule: rule.id, text: match[0], excerpt: line.trim().slice(0, 160) });
      }
    }
  });
  return findings;
}

// ---- main --------------------------------------------------------------------

if (!existsSync(RULES_FILE)) fail(`rules file not found: ${RULES_FILE}`);
const rules = parseRules(readFileSync(RULES_FILE, 'utf8'));
if (rules.length === 0) fail('rules file contains no rules');

const files = collectFiles();
const findings = files.flatMap((file) => lintFile(file, rules));

for (const f of findings) {
  console.log(`${f.file}:${f.line}:${f.column}: [${f.rule}] "${f.text}"`);
  if (!QUIET) console.log(`    ${f.excerpt}`);
}

const filesWithFindings = new Set(findings.map((f) => f.file)).size;
console.log(`claims-lint: ${findings.length} finding(s) in ${filesWithFindings} file(s); ${files.length} file(s) and ${rules.length} rule(s) checked.`);
process.exitCode = findings.length > 0 ? 1 : 0;
