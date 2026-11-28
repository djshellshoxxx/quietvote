#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-33-REQ-003 (local template/syntax/expiry slice only)
// Unsigned UTF-8 security.txt validator. No network, key, signature or hosting checks.
// Usage: node scripts/check-security-txt.mjs [--release] [path/to/security.txt]
import { closeSync, openSync, readSync } from 'node:fs';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'Usage: node scripts/check-security-txt.mjs [--release] [path/to/security.txt]';
const DAY = 86400000, MAX_BYTES = 32768, MAX_LINES = 1000, MAX_LINE = 2048;
const URI_FIELDS = new Set(['contact', 'canonical', 'encryption', 'acknowledgments', 'hiring', 'policy']);
const PLACEHOLDERS = new Map([
  ...[...URI_FIELDS].map(field => [field, `[OWNER_${field.toUpperCase()}_URI]`]),
  ['expires', '[OWNER_EXPIRES_RFC3339]'], ['preferred-languages', '[OWNER_PREFERRED_LANGUAGES]'],
]);
const MARKER = /\[(?:OWNER_[A-Z0-9_]+|PLACEHOLDER[^\]\r\n]*)\]|\{\{[^}\r\n]+\}\}/i;
const GRANDFATHERED = new Set(('en-gb-oed i-ami i-bnn i-default i-enochian i-hak i-klingon i-lux i-mingo ' +
  'i-navajo i-pwn i-tao i-tay i-tsu sgn-be-fr sgn-be-nl sgn-ch-de art-lojban cel-gaulish ' +
  'no-bok no-nyn zh-guoyu zh-hakka zh-min zh-min-nan zh-xiang').split(' '));
const ATOM = "(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})";
const REG_NAME = new RegExp(`^${ATOM}*$`), USERINFO = new RegExp(`^(?:${ATOM}|:)*$`);
const PATH = new RegExp(`^(?:${ATOM}|[:@/])*$`), QUERY = new RegExp(`^(?:${ATOM}|[:@/?])*$`);

// RFC 3986 generic URI syntax, including IPv6/IPvFuture literals. Scheme-specific
// delivery semantics are outside this syntax check. HTTP web URIs must use HTTPS.
function uri(value) {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value);
  if (!match) return null;
  const [, rawScheme, authority, path, query = '', fragment = ''] = match, scheme = rawScheme.toLowerCase();
  if (!PATH.test(path) || !QUERY.test(query) || !QUERY.test(fragment)) return null;
  let host = '';
  if (authority !== undefined) {
    if (path !== '' && !path.startsWith('/')) return null;
    const parts = authority.split('@');
    if (parts.length > 2 || (parts.length === 2 && !USERINFO.test(parts[0]))) return null;
    const hostPort = parts.at(-1);
    if (hostPort.startsWith('[')) {
      const literal = /^\[([^\]]+)\](?::[0-9]*)?$/.exec(hostPort);
      if (!literal) return null;
      if (!(isIP(literal[1]) === 6 && !literal[1].includes('%')) &&
          !/^v[0-9a-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/i.test(literal[1])) return null;
      host = literal[1];
    } else {
      const regular = /^([^:]*)(?::[0-9]*)?$/.exec(hostPort);
      if (!regular || !REG_NAME.test(regular[1])) return null;
      host = regular[1];
    }
  } else if (path.startsWith('//')) return null;
  if (scheme === 'http' || (scheme === 'https' && (authority === undefined || host === ''))) return null;
  return { scheme, host, path };
}

// RFC 5646 well-formedness, including private-use and the fixed grandfathered list.
// Does not assert current IANA registration or extension-specific semantics.
function language(value) {
  const tag = value.toLowerCase();
  if (GRANDFATHERED.has(tag)) return true;
  const parts = tag.split('-');
  if (parts[0] === 'x') return parts.length > 1 && parts.slice(1).every(part => /^[a-z0-9]{1,8}$/.test(part));
  if (!/^[a-z]{2,8}$/.test(parts[0])) return false;
  let index = 1;
  if (parts[0].length <= 3) for (let count = 0; count < 3 && /^[a-z]{3}$/.test(parts[index] ?? ''); count++) index++;
  if (/^[a-z]{4}$/.test(parts[index] ?? '')) index++;
  if (/^(?:[a-z]{2}|[0-9]{3})$/.test(parts[index] ?? '')) index++;
  const variants = new Set(), singletons = new Set();
  while (/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/.test(parts[index] ?? '')) {
    if (variants.has(parts[index])) return false;
    variants.add(parts[index++]);
  }
  while (/^[a-wy-z0-9]$/.test(parts[index] ?? '')) {
    if (singletons.has(parts[index])) return false;
    singletons.add(parts[index++]);
    const start = index;
    while (/^[a-z0-9]{2,8}$/.test(parts[index] ?? '')) index++;
    if (start === index) return false;
  }
  if (parts[index] === 'x') return index + 1 < parts.length && parts.slice(index + 1).every(part => /^[a-z0-9]{1,8}$/.test(part));
  return index === parts.length;
}

function timestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = '', , sign, offsetHour = '0', offsetMinute = '0'] = match;
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31 || +hour > 23 || +minute > 59 ||
      +second > 59 || +offsetHour > 23 || +offsetMinute > 59) return null;
  // Future leap-second insertions require external announcements. This offline
  // profile explicitly refuses :60 expiries rather than guessing their validity.
  const date = new Date(0);
  date.setUTCFullYear(+year, +month - 1, +day);
  date.setUTCHours(+hour, +minute, +second, Number(fraction.slice(0, 3).padEnd(3, '0')));
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day) return null;
  const offset = (+offsetHour * 60 + +offsetMinute) * 60000 * (sign === '-' ? -1 : 1);
  // Flooring sub-millisecond fractions preserves both comparisons against the
  // integer-millisecond minimum (>=) and exclusive anniversary maximum (<).
  return date.getTime() - offset;
}

function anniversary(now) {
  const date = new Date(now), month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0); // Feb 29 -> Feb 28, same UTC time.
  return date.getTime();
}

const asciiDecode = value => value.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
function reservedHost(host) {
  const value = asciiDecode(host).toLowerCase().replace(/\.$/, '');
  return /(?:^|\.)(?:example|invalid)$/.test(value) || /(?:^|\.)example\.(?:com|net|org)$/.test(value);
}

/** Local unsigned-file validation; now is injectable for deterministic expiry tests. */
export function checkSecurityTxt(input, { release = false, now = Date.now() } = {}) {
  const issues = [], add = (line, code) => issues.push({ line, code });
  let placeholders = 0;
  const result = () => ({ format: 'qv-security-txt-check/v1', mode: release ? 'release' : 'template',
    valid: issues.length === 0, placeholders, issues });
  if (typeof release !== 'boolean' || !Number.isSafeInteger(now) || !Number.isFinite(anniversary(now))) {
    add(0, 'INVALID_OPTIONS'); return result();
  }
  let text;
  try {
    if (typeof input === 'string') {
      if (Buffer.byteLength(input, 'utf8') > MAX_BYTES) { add(0, 'FILE_TOO_LARGE'); return result(); }
      text = input;
      if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(text, 'utf8')) !== text) throw new Error();
    } else {
      if (!(input instanceof Uint8Array)) throw new Error();
      if (input.length > MAX_BYTES) { add(0, 'FILE_TOO_LARGE'); return result(); }
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
    }
  } catch { add(0, 'INVALID_UTF8'); return result(); }
  if (text.startsWith('\uFEFF') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufffe\uffff]/u.test(text)) add(0, 'INVALID_TEXT');
  if (text.normalize('NFC') !== text) add(0, 'NON_NFC_TEXT');
  if (!text.endsWith('\n') || /\r(?!\n)/.test(text)) add(0, 'INVALID_LINE_ENDING');
  if (text.startsWith('-----BEGIN PGP')) { add(0, 'SIGNED_INPUT_UNSUPPORTED'); return result(); }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > MAX_LINES) { add(0, 'TOO_MANY_LINES'); return result(); }
  const counts = new Map();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/[ \t]+$/, ''), number = index + 1;
    if ([...line].length > MAX_LINE) { add(number, 'LINE_TOO_LONG'); continue; }
    if (line === '') continue;
    if (line.startsWith('#')) { if (release && MARKER.test(line)) add(number, 'OWNER_PLACEHOLDER'); continue; }
    const match = /^([\x21-\x39\x3b-\x7e]+): (.+)$/.exec(line);
    if (!match) { add(number, 'INVALID_FIELD'); continue; }
    const field = match[1].toLowerCase(), value = match[2];
    counts.set(field, (counts.get(field) ?? 0) + 1);
    if ((field === 'expires' || field === 'preferred-languages') && counts.get(field) > 1) add(number, 'DUPLICATE_SINGLETON_FIELD');
    if (value === PLACEHOLDERS.get(field)) {
      placeholders++;
      if (release) add(number, 'OWNER_PLACEHOLDER');
      continue;
    }
    if (MARKER.test(asciiDecode(value))) {
      placeholders++; add(number, release ? 'OWNER_PLACEHOLDER' : 'UNSUPPORTED_PLACEHOLDER'); continue;
    }
    if (URI_FIELDS.has(field)) {
      const parsed = uri(value);
      if (!parsed) add(number, 'INVALID_URI');
      else if (reservedHost(parsed.host) || (parsed.scheme === 'mailto' &&
        parsed.path.split(',').some(address => reservedHost(address.slice(address.lastIndexOf('@') + 1))))) {
        placeholders++; if (release) add(number, 'OWNER_PLACEHOLDER');
      }
    } else if (field === 'expires') {
      const expires = timestamp(value);
      if (expires === null) add(number, 'INVALID_EXPIRES');
      else if (expires < now + 30 * DAY) add(number, 'EXPIRES_TOO_SOON');
      else if (expires >= anniversary(now)) add(number, 'EXPIRES_TOO_FAR');
    } else if (field === 'preferred-languages') {
      if (/^[ \t]/.test(value) || !value.split(',').every(tag => language(tag.replace(/^[ \t]+|[ \t]+$/g, '')))) add(number, 'INVALID_LANGUAGES');
    }
    // Unknown extensions retain field syntax validation and no inferred semantics.
  }
  if (!counts.has('contact')) add(0, 'MISSING_CONTACT');
  if (!counts.has('expires')) add(0, 'MISSING_EXPIRES');
  return result();
}

export function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(USAGE + '\n'); return 0; }
  let release = false, file;
  for (const arg of args) {
    if (arg === '--release' && !release) release = true;
    else if (!arg.startsWith('-') && file === undefined) file = arg;
    else { process.stderr.write(USAGE + '\n'); return 2; }
  }
  let fd, bytes;
  try {
    fd = openSync(file ?? join(ROOT, 'security/security.txt.template'), 'r');
    const buffer = Buffer.alloc(MAX_BYTES + 1); let length = 0, read;
    while (length < buffer.length && (read = readSync(fd, buffer, length, buffer.length - length, null)) !== 0) length += read;
    bytes = buffer.subarray(0, length);
  } catch { process.stderr.write('security-txt: cannot read input\n'); return 2; }
  finally { if (fd !== undefined) closeSync(fd); }
  const report = checkSecurityTxt(bytes, { release });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return report.valid ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
