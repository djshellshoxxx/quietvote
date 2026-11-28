#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Bounded, first-party secret-pattern gate. Findings never contain matched bytes or source excerpts.
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

export const RULES = Object.freeze(['PRIVATE_KEY_PEM', 'TOKEN_PREFIX', 'HEX_SECRET']);
export const LIMITS = Object.freeze({ fileBytes: 16 * 1024 * 1024, totalBytes: 256 * 1024 * 1024,
  lineBytes: 1024 * 1024, fileLines: 200_000, files: 100_000, findings: 2_000, gitBytes: 32 * 1024 * 1024, gitMs: 120_000 });
const ALLOWLIST = 'scripts/secret-scan-allowlist.json';
const utf8 = new TextDecoder('utf-8', { fatal: true });
export class ScanError extends Error {
  constructor(code, path) { super(code); this.code = code; if (path !== undefined) this.path = path; }
}
const fail = (code, path) => { throw new ScanError(code, path); };
export const valueHash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const gitEnv = () => ({ ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' });

function validPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 4096 && !isAbsolute(path) &&
    !path.includes('\\') && !path.includes('\0') && !/^[A-Za-z]:/.test(path) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
function decode(bytes, path) { try { return utf8.decode(bytes); } catch { return fail('TEXT_ENCODING', path); } }
function git(root, args, limits = LIMITS) {
  const child = spawnSync('git', ['-c', 'core.quotePath=true', ...args], { cwd: root, env: gitEnv(),
    encoding: 'buffer', timeout: limits.gitMs, maxBuffer: limits.gitBytes, windowsHide: true });
  if (child.error || child.signal || child.status !== 0) fail('GIT_FAILED');
  return child.stdout;
}
function secretName(name) {
  const words = name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/);
  if (words.some((word) => ['public', 'pub', 'pk', 'hash', 'digest', 'root', 'fingerprint', 'checksum', 'signature'].includes(word))) return false;
  return words.some((word) => ['secret', 'private', 'seed', 'token', 'password', 'passphrase', 'api', 'signing', 'sk', 'kek', 'dek', 'key'].includes(word) ||
    /^(?:(?:secret|private|api|signing)key|(?:seed|token|key)hex)$/.test(word));
}

/** Internal digests/offsets support exact exceptions and line mapping; the finding serializer omits them. */
export function detectLine(line) {
  const matches = [];
  const keep = (rule, match, value = match[0]) => matches.push({ rule, sha256: valueHash(value), start: match.index, valueAt: match.index + match[0].lastIndexOf(value) });
  for (const match of line.matchAll(/-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/g)) {
    keep('PRIVATE_KEY_PEM', match);
  }
  const tokens = /(?<![A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,255}|npm_[A-Za-z0-9]{36}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,200}|sk_(?:live|test)_[A-Za-z0-9]{16,128}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,256})(?![A-Za-z0-9_-])/g;
  for (const match of line.matchAll(tokens)) keep('TOKEN_PREFIX', match);
  const hex = /["'`]?([A-Za-z_$][A-Za-z0-9_$.-]{0,120})["'`]?[ \t\r\n]{0,64}(?::[ \t\r\n]{0,32}[A-Za-z_$][A-Za-z0-9_$.\[\]]{0,64})?[ \t\r\n]{0,32}(?:=|:)[ \t\r\n]{0,64}(?:(?:Buffer\.from|hexToBytes|bytesFromHex|fromHex|decodeHex|unhex|hex)[ \t\r\n]{0,32}\([ \t\r\n]{0,64})?["'`]?([a-fA-F0-9]{64})(?![a-fA-F0-9])/g;
  for (const match of line.matchAll(hex)) if (secretName(match[1])) keep('HEX_SECRET', match, match[2]);
  return matches;
}

export function validateAllowlist(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'entries,version' || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 2_000) fail('ALLOWLIST_INVALID');
  const seen = new Set();
  for (const row of value.entries) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('ALLOWLIST_INVALID');
    const keys = Object.keys(row).sort().join(',');
    if (keys !== 'path,reason,rule,sha256' && keys !== 'commit,path,reason,rule,sha256') fail('ALLOWLIST_INVALID');
    if (!validPath(row.path) || /[*?\[\]{}]/.test(row.path) || !RULES.includes(row.rule) || !/^[a-f0-9]{64}$/.test(row.sha256) ||
        typeof row.reason !== 'string' || row.reason.trim().length < 12 || row.reason.length > 500 || /[\r\n\0]/.test(row.reason)) fail('ALLOWLIST_INVALID');
    if (row.commit !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(row.commit)) fail('ALLOWLIST_INVALID');
    if (row.rule !== 'HEX_SECRET' && row.commit === undefined) fail('ALLOWLIST_INVALID');
    const key = [row.path, row.rule, row.sha256, row.commit ?? ''].join('\0');
    if (seen.has(key)) fail('ALLOWLIST_INVALID');
    seen.add(key);
  }
  return value.entries;
}
function allowlist(root) {
  try {
    const data = readCurrent(root, ALLOWLIST, { ...LIMITS, fileBytes: 1024 * 1024 });
    if (data === null) fail('ALLOWLIST_INVALID');
    return validateAllowlist(JSON.parse(decode(data)));
  } catch { return fail('ALLOWLIST_INVALID'); }
}
function outputCollector(entries, limits) {
  const findings = new Map(), excluded = new Map();
  let allowed = 0, scanned = 0, bytes = 0;
  const addText = (path, firstLine, source, commit, added) => {
    if (Buffer.byteLength(source) > limits.fileBytes) fail('FILE_LIMIT', path);
    const starts = [0];
    let start = 0, end;
    while ((end = source.indexOf('\n', start)) !== -1) {
      if (Buffer.byteLength(source.slice(start, end)) > limits.lineBytes) fail('LINE_LIMIT', path);
      starts.push(end + 1); start = end + 1;
      if (starts.length > limits.fileLines) fail('LINE_LIMIT', path);
    }
    if (Buffer.byteLength(source.slice(start)) > limits.lineBytes) fail('LINE_LIMIT', path);
    const lineAt = (offset) => {
      let lo = 0, hi = starts.length;
      while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (starts[mid] <= offset) lo = mid; else hi = mid; }
      return lo;
    };
    for (const match of detectLine(source)) {
      const local = lineAt(match.valueAt);
      if (added) {
        let introduced = false;
        for (let line = lineAt(match.start); line <= local; line++) if (added.has(line)) { introduced = true; break; }
        if (!introduced) continue;
      }
      if (entries.some((row) => row.path === path && row.rule === match.rule && row.sha256 === match.sha256 && (row.commit === undefined || row.commit === commit))) { allowed++; continue; }
      const line = firstLine + local;
      const finding = { path, line, rule: match.rule, ...(commit === undefined ? {} : { commit }) };
      findings.set(JSON.stringify(finding), finding);
      if (findings.size > limits.findings) fail('FINDING_LIMIT');
    }
  };
  return {
    addText,
    exclude(path, reason, commit) {
      const row = { path, reason, ...(commit === undefined ? {} : { commit }) }; excluded.set(JSON.stringify(row), row);
      if (excluded.size > limits.files) fail('FILE_LIMIT');
    },
    addBytes(n) { bytes += n; if (bytes > limits.totalBytes) fail('INPUT_LIMIT'); },
    scanned() { scanned++; if (scanned > limits.files) fail('FILE_LIMIT'); },
    result(mode) {
      const lex = (a, b) => a < b ? -1 : a > b ? 1 : 0;
      const order = (a, b) => lex(a.path, b.path) || lex(a.commit ?? '', b.commit ?? '') || (a.line ?? 0) - (b.line ?? 0) || lex(a.rule ?? a.reason, b.rule ?? b.reason);
      return { format: 'quietvote-secret-scan-v1', mode, complete: true, status: findings.size ? 'fail' : 'pass', findings: [...findings.values()].sort(order), excluded: [...excluded.values()].sort(order), counts: { files: scanned, bytes, allowed } };
    },
  };
}
function readCurrent(root, path, limits) {
  let full = root;
  for (const part of path.split('/')) {
    full = join(full, part);
    let stat; try { stat = lstatSync(full); } catch { fail('READ_FAILED', path); }
    if (stat.isSymbolicLink()) return null;
  }
  let fd;
  try {
    // Inspect special files without waiting for a FIFO writer, including a
    // pathname replaced after the component checks above.
    fd = openSync(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const before = fstatSync(fd);
    if (!before.isFile()) fail('NOT_REGULAR_FILE', path);
    if (before.size > limits.fileBytes) fail('FILE_LIMIT', path);
    const chunks = [], block = Buffer.alloc(64 * 1024);
    let size = 0;
    for (;;) {
      const n = readSync(fd, block, 0, block.length, null);
      if (n === 0) break;
      size += n;
      if (size > limits.fileBytes) fail('FILE_LIMIT', path);
      chunks.push(Buffer.from(block.subarray(0, n)));
    }
    const after = fstatSync(fd);
    if (before.size !== size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('READ_CHANGED', path);
    return Buffer.concat(chunks, size);
  } catch (error) { if (error instanceof ScanError) throw error; return fail('READ_FAILED', path); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export function scanTree(root, entries = [], limits = LIMITS) {
  const output = outputCollector(entries, limits);
  const listing = decode(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], limits));
  if (listing !== '' && !listing.endsWith('\0')) fail('GIT_FORMAT');
  const paths = [...new Set(listing.split('\0').filter(Boolean))].sort();
  if (paths.length > limits.files) fail('FILE_LIMIT');
  for (const path of paths) {
    if (!validPath(path)) fail('GIT_PATH');
    const data = readCurrent(root, path, limits);
    if (data === null) { output.exclude(path, 'symlink'); continue; }
    output.addBytes(data.length);
    if (data.includes(0)) { output.exclude(path, 'binary_nul'); continue; }
    output.scanned();
    output.addText(path, 1, decode(data, path));
  }
  return output.result('tree');
}

/** Git C-quoted paths use byte escapes, including three-digit octal UTF-8 bytes. */
export function decodeGitPath(raw) {
  if (!raw.startsWith('"')) return raw;
  if (!raw.endsWith('"')) fail('GIT_PATH');
  const bytes = [], escaped = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '\\': 92, '"': 34 };
  for (let i = 1; i < raw.length - 1; i++) {
    const ch = raw[i];
    if (ch === '"') fail('GIT_PATH');
    if (ch !== '\\') { bytes.push(...Buffer.from(ch)); continue; }
    const code = raw[++i];
    if (Object.hasOwn(escaped, code)) bytes.push(escaped[code]);
    else if (/^[0-7]{3}$/.test(raw.slice(i, i + 3))) {
      const byte = parseInt(raw.slice(i, i + 3), 8); if (byte > 255) fail('GIT_PATH'); bytes.push(byte); i += 2;
    } else fail('GIT_PATH');
  }
  return decode(Buffer.from(bytes));
}
function diffPath(raw) {
  let left, right;
  if (raw.startsWith('"')) {
    let end = 1;
    for (; end < raw.length; end++) {
      if (raw[end] === '\\') { end++; continue; }
      if (raw[end] === '"') break;
    }
    if (raw[end + 1] !== ' ') fail('GIT_PATH');
    left = decodeGitPath(raw.slice(0, end + 1)); right = decodeGitPath(raw.slice(end + 2));
  } else {
    // --no-renames guarantees equal paths; spaces do not themselves cause Git quoting.
    const middle = (raw.length - 1) / 2;
    if (!Number.isInteger(middle) || raw[middle] !== ' ') fail('GIT_PATH');
    left = raw.slice(0, middle); right = raw.slice(middle + 1);
  }
  if (!left.startsWith('a/') || !right.startsWith('b/') || left.slice(2) !== right.slice(2) || !validPath(left.slice(2))) fail('GIT_PATH');
  return left.slice(2);
}
function historyParser(output, limits, readBlob) {
  let commit, file, oldLeft = 0, newLeft = 0, lineNumber = 0, commits = 0, hunkStart = 0, textBytes = 0;
  let textLines = [], added = new Set();
  function finishHunk() {
    if (!oldLeft && !newLeft && textLines.length) {
      if (!file.excluded) output.addText(file.path, hunkStart, textLines.join('\n'), commit, added);
      textLines = []; added = new Set(); textBytes = 0;
    }
  }
  function takeText(source, isAdded) {
    textBytes += Buffer.byteLength(source) + 1;
    if (textBytes > limits.fileBytes || textLines.length >= limits.fileLines) fail('FILE_LIMIT', file.path);
    if (isAdded) added.add(textLines.length);
    textLines.push(source); newLeft--; lineNumber++;
  }
  function finishFile() {
    if (oldLeft !== 0 || newLeft !== 0) fail('GIT_TRUNCATED');
    if (file && !file.excluded) output.scanned();
    file = undefined;
  }
  function line(source) {
    if (Buffer.byteLength(source) > limits.lineBytes) fail('LINE_LIMIT');
    if (oldLeft || newLeft) {
      const prefix = source[0];
      if (prefix === '\\' && source === '\\ No newline at end of file') return;
      if (prefix === '+' && newLeft > 0) { takeText(source.slice(1), true); finishHunk(); return; }
      if (prefix === '-' && oldLeft > 0) { oldLeft--; finishHunk(); return; }
      if (prefix === ' ' && oldLeft > 0 && newLeft > 0) { oldLeft--; takeText(source.slice(1), false); finishHunk(); return; }
      fail('GIT_TRUNCATED');
    }
    const marker = /^\0QV-SCAN:([a-f0-9]{40}|[a-f0-9]{64})\0$/.exec(source);
    if (marker) { finishFile(); commit = marker[1]; if (++commits > limits.files) fail('COMMIT_LIMIT'); return; }
    if (source === '') return;
    if (!commit) fail('GIT_FORMAT');
    if (source.startsWith('diff --git ')) { finishFile(); file = { path: diffPath(source.slice(11)), old: false, next: false, excluded: false }; return; }
    if (!file) fail('GIT_FORMAT');
    const index = /^index ([a-f0-9]{40}|[a-f0-9]{64})\.\.([a-f0-9]{40}|[a-f0-9]{64})(?: (100644|100755|120000|160000))?$/.exec(source);
    if (index) {
      if (file.blobs) fail('GIT_FORMAT');
      file.blobs = [...new Set([index[1], index[2]].filter((id) => !/^0+$/.test(id)))];
      if (index[3] === '160000') fail('UNSUPPORTED_GITLINK', file.path);
      if (index[3] === '120000') { file.excluded = true; output.exclude(file.path, 'symlink', commit); }
      return;
    }
    const mode = /^(?:new file mode|new mode) (100644|100755|120000|160000)$/.exec(source);
    if (mode) {
      if (mode[1] === '160000') fail('UNSUPPORTED_GITLINK', file.path);
      if (mode[1] === '120000') { file.excluded = true; output.exclude(file.path, 'symlink', commit); }
      return;
    }
    if (/^(?:old mode|deleted file mode) (?:100644|100755|120000)$/.test(source)) return;
    if (source.startsWith('--- ') || source.startsWith('+++ ')) {
      const old = source.startsWith('--- ');
      let raw = source.slice(4);
      // Git appends a separator tab to unquoted space-containing paths; actual tabs in names are C-quoted.
      if (!raw.startsWith('"') && raw.endsWith('\t')) raw = raw.slice(0, -1);
      const path = decodeGitPath(raw);
      if (path !== '/dev/null' && path !== (old ? 'a/' : 'b/') + file.path) fail('GIT_PATH');
      if (old) { if (file.old || file.next) fail('GIT_FORMAT'); file.old = true; }
      else { if (!file.old || file.next) fail('GIT_FORMAT'); file.next = true; }
      return;
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(source);
    if (hunk) {
      if (!file.old || !file.next) fail('GIT_FORMAT');
      oldLeft = Number(hunk[2] ?? 1); newLeft = Number(hunk[4] ?? 1); lineNumber = Number(hunk[3]);
      hunkStart = lineNumber;
      if (![Number(hunk[1]), oldLeft, newLeft, lineNumber].every((n) => Number.isSafeInteger(n) && n <= limits.totalBytes)) fail('HUNK_LIMIT');
      return;
    }
    if (/^Binary files .+ and .+ differ$/.test(source)) {
      if (!readBlob || !file.blobs?.length) fail('BINARY_UNREAD', file.path);
      let text = false;
      for (const id of file.blobs) {
        const data = readBlob(id); output.addBytes(data.length);
        if (data.includes(0)) { output.exclude(file.path, 'binary_nul', commit); continue; }
        text = true;
        output.addText(file.path, 1, decode(data, file.path), commit);
      }
      file.excluded = !text; return;
    }
    if (source === '\\ No newline at end of file') return;
    fail('GIT_FORMAT');
  }
  return { line, finish() { finishFile(); if (!commits) fail('GIT_FORMAT'); } };
}
export function parseHistory(text, entries = [], limits = LIMITS) {
  const output = outputCollector(entries, limits), parser = historyParser(output, limits);
  output.addBytes(Buffer.byteLength(text));
  for (const line of text.split('\n')) parser.line(line);
  parser.finish(); return output.result('history');
}
export async function scanHistory(root, entries = [], limits = LIMITS) {
  const shallow = decode(git(root, ['rev-parse', '--is-shallow-repository'], limits)).trim();
  if (shallow === 'true') fail('SHALLOW_HISTORY');
  if (shallow !== 'false') fail('GIT_FORMAT');
  const output = outputCollector(entries, limits);
  const parser = historyParser(output, limits, (id) => git(root, ['cat-file', 'blob', id], { ...limits, gitBytes: limits.fileBytes }));
  const args = ['--no-pager', '-c', 'core.quotePath=true', 'log', '-p', '--root', '-m', '--full-history', '--no-renames', '--no-color',
    '--no-ext-diff', '--no-textconv', '--no-notes', '--no-show-signature', '--full-index', '--unified=8', '--format=%x00QV-SCAN:%H%x00', 'HEAD', '--branches', '--remotes', '--tags', '--'];
  await new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd: root, env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let pending = Buffer.alloc(0), error, stderrBytes = 0;
    const stop = (cause) => { if (!error) error = cause instanceof ScanError ? cause : new ScanError('GIT_FAILED'); child.kill('SIGKILL'); };
    const timer = setTimeout(() => stop(new ScanError('GIT_TIMEOUT')), limits.gitMs);
    child.on('error', () => { clearTimeout(timer); reject(new ScanError('GIT_FAILED')); });
    child.stderr.on('data', (chunk) => { stderrBytes += chunk.length; if (stderrBytes > 64 * 1024) stop(new ScanError('GIT_FAILED')); });
    child.stdout.on('data', (chunk) => {
      if (error) return;
      try {
        output.addBytes(chunk.length);
        pending = Buffer.concat([pending, chunk]);
        let start = 0, end;
        while ((end = pending.indexOf(10, start)) !== -1) { if (end - start > limits.lineBytes) fail('LINE_LIMIT'); parser.line(decode(pending.subarray(start, end))); start = end + 1; }
        pending = Buffer.from(pending.subarray(start));
        if (pending.length > limits.lineBytes) fail('LINE_LIMIT');
      } catch (cause) { stop(cause); }
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (error) { reject(error); return; }
      if (code !== 0 || signal) { reject(new ScanError('GIT_FAILED')); return; }
      try { if (pending.length) parser.line(decode(pending)); parser.finish(); resolvePromise(); } catch (cause) { reject(cause); }
    });
  });
  return output.result('history');
}

export async function main(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), json = false, history = false;
  try {
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--json') json = true;
      else if (argv[i] === '--history') history = true;
      else if (argv[i] === '--root' && argv[i + 1]) root = resolve(argv[++i]);
      else fail('USAGE');
    }
    const top = decode(git(root, ['rev-parse', '--show-toplevel'])).trimEnd();
    if (resolve(top) !== root) fail('REPOSITORY_ROOT');
    const entries = allowlist(root);
    const result = history ? await scanHistory(root, entries) : scanTree(root, entries);
    if (json) process.stdout.write(JSON.stringify(result) + '\n');
    else {
      for (const finding of result.findings) process.stdout.write(`${JSON.stringify(finding.path)}:${finding.line}: ${finding.rule}${finding.commit ? ` commit=${finding.commit}` : ''}\n`);
      for (const row of result.excluded) process.stdout.write(`excluded ${JSON.stringify(row.path)}: ${row.reason}\n`);
      process.stdout.write(`secret-scan: ${result.status}; ${result.counts.files} text files; ${result.findings.length} findings; ${result.excluded.length} exclusions\n`);
    }
    return result.status === 'pass' ? 0 : 1;
  } catch (error) {
    const detail = error instanceof ScanError ? { code: error.code, ...(error.path === undefined ? {} : { path: error.path }) } : { code: 'SCAN_FAILED' };
    const result = { format: 'quietvote-secret-scan-v1', complete: false, status: 'incomplete', error: detail };
    process.stdout.write(json ? JSON.stringify(result) + '\n' : `secret-scan: incomplete; ${detail.code}${detail.path ? ` ${JSON.stringify(detail.path)}` : ''}\n`);
    return 2;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
