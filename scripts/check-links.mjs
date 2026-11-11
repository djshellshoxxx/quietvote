#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline Markdown link checker (backlog N-23 / T-235 tooling; first-party only, never touches the network).
//
// Scans README.md, root *.md, docs/**/*.md, wiki/**/*.md, packages/*/*.md, verifier-py/*.md and test-vectors/**/*.md.
// Checks, for every link outside fenced code blocks and inline code:
//   - inline links and images  [text](target "title")  and  ![alt](target)
//   - reference-style link definitions  [label]: target  (their targets are checked wherever the label is used or not; an
//                              undefined [text][label] is plain text in CommonMark and is NOT flagged, because it is also how
//                              array indexing such as P[i][j] appears in the specs)
//   - autolinks <https://...> and raw HTML href="..." / src="..." attributes
//   - GitHub wiki links        [[Page Name]], [[Page Name#heading]], [[Display text|Page Name]]  (resolved to Page-Name.md in the
//                              same directory, the way wiki/ uses them; case-insensitive file match like GitHub's wiki)
// Relative targets must exist (file or directory; paths resolve from the linking file, a leading "/" resolves from the repo root;
// inside wiki/ a target without extension also tries ".md"). A "#fragment" on a Markdown target must match a heading slug in that
// file (GitHub rules: lowercase, punctuation removed, spaces to hyphens, duplicates get -1, -2 ...) or an explicit <a id/name>.
// Fragments on non-Markdown files (e.g. #L12-L20) are accepted without checking. http(s) targets are validated for URL
// syntax only; other schemes (mailto:, tel:, ...) and protocol-relative links are skipped. No suppression list exists.
//
// Limitations: links that span several lines, indented (4-space) code blocks and shortcut/full reference uses ([text][label], [label]) are not interpreted.
//
// Usage: node scripts/check-links.mjs [--root <repo-root>] [--json]
// Exit codes: 0 = clean, 1 = broken links, 2 = usage or internal error. Node built-ins only; no dependencies.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------------------------------------------------------

function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.name !== 'node_modules' && e.name !== '.git');
  } catch {
    return [];
  }
}

function mdIn(dir, recursive, out) {
  for (const entry of listDir(dir)) {
    const full = join(dir, entry.name);
    if (entry.isFile() && /\.md$/i.test(entry.name)) out.push(full);
    else if (entry.isDirectory() && recursive) mdIn(full, true, out);
  }
}

export function discoverFiles(root) {
  const out = [];
  mdIn(root, false, out); // README.md and every root *.md
  mdIn(join(root, 'docs'), true, out);
  mdIn(join(root, 'wiki'), true, out);
  mdIn(join(root, 'verifier-py'), false, out);
  mdIn(join(root, 'test-vectors'), true, out);
  for (const entry of listDir(join(root, 'packages'))) {
    if (entry.isDirectory()) mdIn(join(root, 'packages', entry.name), false, out);
  }
  return [...new Set(out)].sort();
}

// ---------------------------------------------------------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// Returns lines with fenced code blocks blanked (line count preserved) so positions still map to the original file.
function maskFences(text) {
  const lines = text.split(/\r?\n/);
  let open = null;
  return lines.map((line) => {
    const m = FENCE.exec(line);
    if (open === null) {
      if (m !== null) { open = { ch: m[1][0], len: m[1].length }; return ''; }
      return line;
    }
    if (m !== null && m[1][0] === open.ch && m[1].length >= open.len && /^ {0,3}[`~]+\s*$/.test(line)) open = null;
    return '';
  });
}

// Replace inline code spans with spaces (same length) so brackets inside code are not links.
function maskInlineCode(line) {
  return line.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (all) => ' '.repeat(all.length));
}

export function slugify(heading) {
  let t = heading;
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'); // links/images keep their text
  t = t.replace(/<[^>]+>/g, ''); // inline HTML
  t = t.replace(/`/g, '');
  t = t.replace(/[*~]/g, '');
  t = t.trim().toLowerCase();
  // GitHub keeps letters, numbers, marks, connector punctuation (underscore), hyphen and spaces; everything else is dropped.
  t = t.replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '');
  return t.replace(/ /g, '-');
}

const anchorCache = new Map();

function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const anchors = new Set();
  const counts = new Map();
  const lines = maskFences(readFileSync(file, 'utf8'));
  const addHeading = (raw) => {
    const base = slugify(raw);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const atx = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (atx !== null) addHeading(atx[1]);
    else if (i + 1 < lines.length && line.trim() !== '' && /^ {0,3}(=+|-+)[ \t]*$/.test(lines[i + 1]) && !/^ {0,3}([-*+]|\d+[.)])\s/.test(line)) {
      addHeading(line.trim());
    }
    for (const m of line.matchAll(/<a\s[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["']/gi)) anchors.add(m[1].toLowerCase());
    for (const m of line.matchAll(/<[a-z][a-z0-9]*\s[^>]*\bid\s*=\s*["']([^"']+)["']/gi)) anchors.add(m[1].toLowerCase());
  }
  anchorCache.set(file, anchors);
  return anchors;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Link extraction
// ---------------------------------------------------------------------------------------------------------------------------

// Parses the destination that follows "](" starting at index `start`. Returns { dest, end } or null.
function parseDestination(line, start) {
  let i = start;
  while (line[i] === ' ' || line[i] === '\t') i += 1;
  let dest = '';
  if (line[i] === '<') {
    const close = line.indexOf('>', i + 1);
    if (close < 0) return null;
    dest = line.slice(i + 1, close);
    i = close + 1;
  } else {
    let depth = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === '\\' && i + 1 < line.length) { dest += line[i + 1]; i += 2; continue; }
      if (c === ' ' || c === '\t') break;
      if (c === '(') depth += 1;
      if (c === ')') { if (depth === 0) break; depth -= 1; }
      dest += c;
      i += 1;
    }
  }
  // optional title, then the closing parenthesis
  const rest = line.slice(i);
  if (!/^\s*(?:(?:"[^"]*"|'[^']*'|\([^)]*\))\s*)?\)/.test(rest)) return null;
  return { dest, end: i };
}

export function extractLinks(text) {
  const lines = maskFences(text);
  const links = []; // { line, target, kind }
  const definitions = new Map(); // label -> { line, target }
  for (let n = 0; n < lines.length; n += 1) {
    const raw = lines[n];
    if (raw === '') continue;
    const line = maskInlineCode(raw);
    const lineNo = n + 1;

    const def = /^ {0,3}\[([^\]]+)\]:[ \t]*(<[^>]*>|\S+)/.exec(line);
    if (def !== null) {
      const target = def[2].replace(/^<|>$/g, '');
      definitions.set(def[1].trim().toLowerCase().replace(/\s+/g, ' '), { line: lineNo, target });
      links.push({ line: lineNo, target, kind: 'reference-definition' });
      continue;
    }

    // wiki links [[...]] (processed first and blanked so they are not read as nested brackets)
    let work = line.replace(/\[\[([^\]]+)\]\]/g, (all, inner) => {
      links.push({ line: lineNo, target: inner, kind: 'wiki' });
      return ' '.repeat(all.length);
    });

    // inline links and images
    let from = 0;
    for (;;) {
      const idx = work.indexOf('](', from);
      if (idx < 0) break;
      const parsed = parseDestination(work, idx + 2);
      if (parsed === null) { from = idx + 2; continue; }
      links.push({ line: lineNo, target: parsed.dest, kind: 'inline' });
      from = parsed.end;
    }
    // blank inline links so reference scanning does not see their brackets
    work = work.replace(/\]\([^)]*\)/g, (all) => ' '.repeat(all.length));

    for (const m of line.matchAll(/<((?:https?|ftp):\/\/[^>\s]+)>/gi)) links.push({ line: lineNo, target: m[1], kind: 'autolink' });
    for (const m of line.matchAll(/<(?:a|img|source|link|script|iframe|video|audio)\s[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      links.push({ line: lineNo, target: m[1] ?? m[2], kind: 'html' });
    }
  }
  return { links, definitions };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------------------------------------

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function insideRoot(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && resolve(rel) !== rel);
}

// Case-insensitive file lookup in one directory (GitHub wiki page names are case-insensitive).
function findInsensitive(dir, name) {
  const lower = name.toLowerCase();
  return listDir(dir).find((e) => e.name.toLowerCase() === lower)?.name ?? null;
}

function checkFragment(targetFile, fragment) {
  const frag = safeDecode(fragment).toLowerCase();
  if (frag === '' || frag === 'top') return null;
  if (!/\.md$/i.test(targetFile)) return null; // #L12 / #L12-L20 line anchors and other non-Markdown fragments are not checked
  return anchorsOf(targetFile).has(frag) ? null : `no heading or anchor "#${fragment}" in ${basename(targetFile)}`;
}

// Returns null when the link is fine, otherwise a reason string.
function checkTarget(root, file, link) {
  let target = link.target.trim();
  if (target === '') return 'empty link target';

  if (link.kind === 'wiki') {
    let page = target.includes('|') ? target.slice(target.lastIndexOf('|') + 1).trim() : target;
    let fragment = '';
    const hash = page.indexOf('#');
    if (hash >= 0) { fragment = page.slice(hash + 1); page = page.slice(0, hash); }
    const dir = dirname(file);
    const fileName = page === '' ? basename(file) : `${page.replace(/\s+/g, '-')}.md`;
    const actual = findInsensitive(dir, fileName);
    if (actual === null) return `wiki page "${page}" not found (expected ${fileName} next to the linking page)`;
    return fragment === '' ? null : checkFragment(join(dir, actual), fragment);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    if (/^https?:/i.test(target)) {
      try {
        const url = new URL(target);
        if (url.hostname === '') return 'URL has no host';
      } catch {
        return `malformed URL ${target}`;
      }
    }
    return null; // other schemes (mailto:, tel:, ...) are not checked
  }
  if (target.startsWith('//')) return null; // protocol-relative

  let fragment = null;
  const hash = target.indexOf('#');
  if (hash >= 0) { fragment = target.slice(hash + 1); target = target.slice(0, hash); }
  const q = target.indexOf('?');
  if (q >= 0) target = target.slice(0, q);

  if (target === '') return fragment === null ? 'empty link target' : checkFragment(file, fragment);

  const decoded = safeDecode(target);
  const base = decoded.startsWith('/') ? join(root, decoded) : resolve(dirname(file), decoded);
  if (!insideRoot(root, base)) return `target ${target} resolves outside the repository`;
  let resolved = base;
  if (!existsSync(resolved)) {
    const inWiki = relative(root, file).split(sep)[0] === 'wiki';
    const withMd = `${resolved}.md`;
    if (inWiki && existsSync(withMd)) resolved = withMd;
    else if (inWiki && findInsensitive(dirname(resolved), `${basename(resolved)}.md`) !== null) {
      resolved = join(dirname(resolved), findInsensitive(dirname(resolved), `${basename(resolved)}.md`));
    } else {
      return `file not found: ${relative(root, base).split(sep).join('/')}`;
    }
  }
  if (fragment === null || fragment === '') return null;
  if (statSync(resolved).isDirectory()) return null;
  return checkFragment(resolved, fragment);
}

export function checkLinks(root) {
  anchorCache.clear();
  const files = discoverFiles(root);
  const broken = [];
  let checked = 0;
  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    const { links } = extractLinks(readFileSync(file, 'utf8'));
    for (const link of links) {
      checked += 1;
      const reason = checkTarget(root, file, link);
      if (reason !== null) broken.push({ file: rel, line: link.line, target: link.target, kind: link.kind, reason });
    }
  }
  broken.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { ok: broken.length === 0, broken, stats: { files: files.length, links: checked } };
}

// ---------------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------------

function main(argv) {
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let json = false;
  for (let k = 0; k < argv.length; k += 1) {
    const arg = argv[k];
    if (arg === '--json') json = true;
    else if (arg === '--root') {
      if (argv[k + 1] === undefined) { console.error('check-links: --root needs a directory'); return 2; }
      root = resolve(argv[k + 1]);
      k += 1;
    } else {
      console.error(`check-links: unknown argument ${arg}\nusage: node scripts/check-links.mjs [--root <repo-root>] [--json]`);
      return 2;
    }
  }
  let result;
  try {
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`${root} is not a directory`);
    result = checkLinks(root);
    if (result.stats.files === 0) throw new Error(`no Markdown files found under ${root}`);
  } catch (error) {
    console.error(`check-links: ${error.message}`);
    return 2;
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const b of result.broken) console.error(`${b.file}:${b.line} -> ${b.target}  (${b.reason})`);
    if (result.ok) console.log(`check-links: ${result.stats.links} links in ${result.stats.files} files: none broken.`);
    else console.error(`check-links: ${result.broken.length} broken link(s) in ${result.stats.files} files.`);
  }
  return result.ok ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
