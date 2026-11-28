#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-11-REQ-013
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPERIMENTAL_BANNER, InputError, readRegular, REVIEW_QUALIFICATION } from './release-input.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POLICY = join(ROOT, 'docs/claims/banned-phrases.txt');
// QV-10 §7.5 adds these copy restrictions to the general public-claims list.
const COPY_RULES = ['secure', 'guaranteed', 'anonymous', 'your vote is safe', '100%',
  're:(?<![\\p{L}\\p{N}])verified!(?=\\s*(?:$|\\n))',
  'end-to-end encrypted || \\b(means|meaning|defined as|definition)\\b'];
const NEGATION = /\b(not|no|nothing|never|nor|without|cannot|can't|isn't|doesn't|don't)\b|\bun-?(audited|certified|reviewed|verified)\b|\bnon-\w+/i;

export function parseClaimRules(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const parts = line.split(' || ');
    if (parts.length > 2 || parts.some(part => part.trim() === '')) throw new InputError('invalid_claim_policy');
    const [pattern, allow] = parts.map(part => part.trim());
    try {
      const source = pattern.startsWith('re:') ? pattern.slice(3) :
        `(?<![\\p{L}\\p{N}])${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`;
      rules.push({ rule: pattern, regex: new RegExp(source, 'giu'), allow: allow === undefined ? null : new RegExp(allow, 'iu') });
    } catch { throw new InputError('invalid_claim_policy'); }
  }
  if (rules.length === 0) throw new InputError('invalid_claim_policy');
  return rules;
}

function prose(text) {
  // Hidden comments and fenced examples cannot satisfy a visible assurance banner.
  const lines = text.replace(/<!--[\s\S]*?(?:-->|$)/g, match => match.replace(/[^\n]/g, ' ')).split(/\r?\n/);
  let fence;
  return lines.map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && marker[2].trim() === '') fence = undefined;
      return '';
    }
    if (marker) { fence = marker[1]; return ''; }
    return line;
  }).join('\n');
}

export function lintReleaseNotes(text, policy = readRegular(POLICY, { text: true, maxBytes: 64 * 1024 }).text) {
  const visible = prose(text), lines = visible.split('\n'), findings = [];
  const paragraphs = lines.map(line => line.replace(/^ {0,3}/, '').trimEnd());
  if (!paragraphs.includes(EXPERIMENTAL_BANNER)) findings.push({ code: 'missing_experimental_banner', line: 1 });
  if (!paragraphs.includes(REVIEW_QUALIFICATION)) findings.push({ code: 'missing_review_qualification', line: 1 });
  const rules = [...parseClaimRules(policy), ...parseClaimRules(COPY_RULES.join('\n'))];
  for (const rule of rules) {
    for (const match of visible.matchAll(rule.regex)) {
      const start = match.index, end = start + match[0].length, before = visible.slice(0, start);
      const boundary = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'),
        before.lastIndexOf(';'), before.lastIndexOf(':'), before.lastIndexOf('\n\n'));
      // Explicit negation is permitted; this bounded heuristic is not a semantic claims review.
      if (NEGATION.test(before.slice(Math.max(boundary + 1, start - 80)))) continue;
      const after = visible.slice(end, end + 80), sentenceEnd = after.search(/[.!?;]|\n\n/);
      const contextEnd = end + (sentenceEnd < 0 ? after.length : sentenceEnd);
      if (rule.allow?.test(visible.slice(Math.max(boundary + 1, start - 80), contextEnd))) continue;
      const prefix = visible.slice(0, start), line = prefix.split('\n').length;
      findings.push({ code: 'banned_phrase', line, column: start - prefix.lastIndexOf('\n'), rule: rule.rule });
    }
  }
  return findings.sort((a, b) => a.line - b.line || (a.column ?? 0) - (b.column ?? 0) || a.code.localeCompare(b.code) || (a.rule ?? '').localeCompare(b.rule ?? ''));
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    process.stdout.write('Usage: node scripts/lint-release-notes.mjs [FILE.md ...]\nDefault: CHANGES.md. Checks the current Experimental profile; does not establish an assurance level.\n'); return 0;
  }
  if (argv.length > 16 || argv.some(arg => arg.startsWith('-') || arg.length > 4096)) {
    process.stderr.write('lint-release-notes: invalid_arguments\n'); return 2;
  }
  try {
    const policy = readRegular(POLICY, { text: true, maxBytes: 64 * 1024 }).text;
    let count = 0;
    for (const path of argv.length ? argv : [join(ROOT, 'CHANGES.md')]) {
      const text = readRegular(resolve(path), { text: true, maxBytes: 256 * 1024 }).text;
      const findings = lintReleaseNotes(text, policy); count += findings.length;
      for (const finding of findings.slice(0, 50)) process.stderr.write(`${JSON.stringify(path.slice(-240))}:${finding.line}: ${finding.code}${finding.rule ? ` (${JSON.stringify(finding.rule)})` : ''}\n`);
    }
    process.stdout.write(`lint-release-notes: ${count} finding(s); artifact presence never implies assurance or approval\n`);
    return count ? 1 : 0;
  } catch (error) {
    process.stderr.write(`lint-release-notes: ${error instanceof InputError ? error.code : 'input_unavailable'}\n`); return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
