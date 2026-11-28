// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-33-REQ-003 (local template/syntax/expiry slice only)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSecurityTxt } from './check-security-txt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), SCRIPT = join(ROOT, 'scripts/check-security-txt.mjs');
const NOW = Date.parse('2027-01-01T12:34:56.123Z');
const TEMPLATE = readFileSync(join(ROOT, 'security/security.txt.template'));
// Documentation IP literals are fixtures only; no contact or host is published or contacted.
const valid = (expires = '2027-04-01T12:34:56.123Z') => `Contact: https://192.0.2.10/report\nExpires: ${expires}\n`;
const check = (text, options = {}) => checkSecurityTxt(text, { now: NOW, ...options });
const codes = result => result.issues.map(issue => issue.code);
function passes(text, options) { const result = check(text, options); assert.equal(result.valid, true, JSON.stringify(result)); return result; }
function refuses(text, code, options) { const result = check(text, options); assert.equal(result.valid, false); assert.ok(codes(result).includes(code), JSON.stringify(result)); }
function run(args = [], options = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', ...options });
  assert.equal(result.error, undefined, result.error?.message); return result;
}

test('the owner template passes as explicitly unresolved and release rejects every owner field', () => {
  const result = passes(TEMPLATE);
  assert.equal(result.mode, 'template'); assert.equal(result.placeholders, 4);
  const release = check(TEMPLATE, { release: true });
  assert.equal(release.valid, false); assert.equal(release.mode, 'release');
  assert.deepEqual(codes(release), Array(4).fill('OWNER_PLACEHOLDER'));
  assert.match(TEMPLATE.toString(), /^Contact: \[OWNER_CONTACT_URI\]$/m);
  assert.match(TEMPLATE.toString(), /^Canonical: \[OWNER_CANONICAL_URI\]$/m);
  assert.doesNotMatch(TEMPLATE.toString(), /mailto:|https:\/\/|BEGIN PGP PUBLIC KEY/);
});

test('required fields, singleton counts and optional fields follow RFC 9116', () => {
  passes(valid(), { release: true });
  passes(valid() + 'Contact: tel:+1-201-555-0123\nCanonical: https://192.0.2.10/.well-known/security.txt\nCanonical: https://[2001:db8::1]/.well-known/security.txt\n');
  refuses('Expires: 2027-04-01T00:00:00Z\n', 'MISSING_CONTACT');
  refuses('Contact: https://192.0.2.10/report\n', 'MISSING_EXPIRES');
  refuses(valid() + 'eXpIrEs: 2027-05-01T00:00:00Z\n', 'DUPLICATE_SINGLETON_FIELD');
  refuses(valid() + 'Preferred-Languages: en\npreferred-languages: fr\n', 'DUPLICATE_SINGLETON_FIELD');
  refuses(valid().replace('Contact: https://192.0.2.10/report', 'Contact: '), 'INVALID_FIELD');
});

test('URI syntax accepts RFC examples and generic schemes without network resolution', () => {
  for (const value of ['mailto:security%2Buri%2Bencoded@example.com', 'tel:+1-201-555-0123',
    'https://192.0.2.10/path%20segment?via=security#report', 'HTTPS://[2001:db8::1]:443/report',
    'https://[v1.a:host]/report', 'dns:abc._openpgpkey.example.com?type=OPENPGPKEY',
    'openpgp4fpr:5f2de5521c63a801ab59ccb603d49de44b29100f']) {
    passes(valid().replace('https://192.0.2.10/report', value));
  }
  passes(valid() + 'Encryption: dns:abc._openpgpkey.example.com?type=OPENPGPKEY\nPolicy: https://192.0.2.10/policy\nAcknowledgments: https://192.0.2.10/thanks\nHiring: https://192.0.2.10/jobs\n');
});

test('bare addresses, relative references, HTTP, malformed escapes and authorities refuse', () => {
  for (const value of ['security@example.com', '/report', '//192.0.2.10/report', 'http://192.0.2.10/report',
    'https:192.0.2.10', 'https:///report', 'https://', 'https://192.0.2.10/a b',
    'https://192.0.2.10/%GG', 'https://192.0.2.10/%', 'https://[bad]/',
    'https://[2001:db8::1', 'https://[2001:db8::1]:bad/', 'https://a@b@host/',
    'https://host:bad/', 'https://192.0.2.10/a\\b', 'https://192.0.2.10/é', 'https://host/#one#two']) {
    refuses(valid().replace('https://192.0.2.10/report', value), 'INVALID_URI');
  }
  refuses(valid() + 'Canonical: http://192.0.2.10/.well-known/security.txt\n', 'INVALID_URI');
});

test('template exemptions are exact and cannot hide malformed concrete fields', () => {
  const partial = valid().replace('https://192.0.2.10/report', '[OWNER_CONTACT_URI]');
  passes(partial); refuses(partial, 'OWNER_PLACEHOLDER', { release: true });
  refuses(partial + 'Canonical: not a URI\n', 'INVALID_URI');
  refuses(partial.replace('2027-04-01T12:34:56.123Z', '2027-01-02T00:00:00Z'), 'EXPIRES_TOO_SOON');
  refuses(partial.replace('[OWNER_CONTACT_URI]', '[OWNER_CANONICAL_URI]'), 'UNSUPPORTED_PLACEHOLDER');
  refuses(valid() + 'Policy: https://host/%5BOWNER_POLICY_URI%5D\n', 'OWNER_PLACEHOLDER', { release: true });
  passes(valid() + '# [PLACEHOLDER: pending owner review]\n');
  refuses(valid() + '# [PLACEHOLDER: pending owner review]\n', 'OWNER_PLACEHOLDER', { release: true });
});

test('reserved example contacts and hosts remain template values and refuse release mode', () => {
  for (const value of ['mailto:security@quietvote.example', 'https://example.com/report',
    'https://docs.example.org/report', 'https://site.invalid/report', 'https://quietvote%2eexample./report']) {
    const text = valid().replace('https://192.0.2.10/report', value);
    assert.equal(passes(text).placeholders, 1); refuses(text, 'OWNER_PLACEHOLDER', { release: true });
  }
  // Internal names are not evidence of deployment, but are not automatically owner placeholders.
  passes(valid().replace('192.0.2.10', 'localhost'), { release: true });
});

test('language syntax includes private-use, grandfathered tags and unique variants/extensions', () => {
  for (const value of ['en', 'en, fr-CA, zh-Hant', 'sl-rozaj-biske-1994', 'en-US-u-ca-gregory',
    'x-private', 'de-CH-x-phonebk', 'i-klingon', 'en-GB-oed', 'sgn-BE-FR', 'en-US,\tfr']) passes(valid() + `Preferred-Languages: ${value}\n`);
  for (const value of ['', 'en_US', '*', 'e', 'en,', ',en', 'en,,fr', 'en;fr', ' en', 'en-abcdefghi',
    'en-a', 'en-a-b-foo', 'de-DE-1901-1901', 'en-a-foo-a-bar', 'x', 'x-', 'en-x', 'en-1234-1234']) {
    const result = check(valid() + `Preferred-Languages: ${value}\n`);
    assert.equal(result.valid, false, value); assert.ok(codes(result).some(code => ['INVALID_FIELD', 'INVALID_LANGUAGES'].includes(code)));
  }
});

test('the 30-day minimum is inclusive down to fractions finer than one millisecond', () => {
  passes(valid('2027-01-31T12:34:56.123Z'));
  passes(valid('2027-01-31t14:34:56.123000001+02:00'));
  passes(valid('2027-01-31T12:34:56.123z'));
  refuses(valid('2027-01-31T12:34:56.122Z'), 'EXPIRES_TOO_SOON');
  refuses(valid('2027-01-31T12:34:56.122999999Z'), 'EXPIRES_TOO_SOON');
  refuses(valid('2027-01-01T12:34:56.123Z'), 'EXPIRES_TOO_SOON');
});

test('QuietVote requires strictly less than a UTC calendar year, not a fixed 365-day duration', () => {
  passes(valid('2028-01-01T12:34:56.122999999Z'));
  refuses(valid('2028-01-01T12:34:56.123Z'), 'EXPIRES_TOO_FAR');
  refuses(valid('2029-01-01T00:00:00Z'), 'EXPIRES_TOO_FAR');
  const beforeLeapDay = { now: Date.parse('2027-03-01T00:00:00Z') };
  passes(valid('2028-02-29T23:59:59.999Z'), beforeLeapDay);
  refuses(valid('2028-03-01T00:00:00Z'), 'EXPIRES_TOO_FAR', beforeLeapDay);
});

test('a leap-day clock clamps the next anniversary to February 28 at the same UTC time', () => {
  const options = { now: Date.parse('2028-02-29T06:07:08.009Z') };
  passes(valid('2029-02-28T06:07:08.008Z'), options);
  refuses(valid('2029-02-28T06:07:08.009Z'), 'EXPIRES_TOO_FAR', options);
  refuses(valid('2029-03-01T00:00:00Z'), 'EXPIRES_TOO_FAR', options);
});

test('RFC3339 calendar, mandatory zone and offset rules reject Date normalization shortcuts', () => {
  passes(valid('2027-04-01T08:00:00-04:00'));
  passes(valid('2027-04-01T12:00:00-00:00'));
  for (const value of ['2027-02-29T00:00:00Z', '2027-02-30T00:00:00Z', '2027-04-31T00:00:00Z',
    '2027-00-01T00:00:00Z', '2027-13-01T00:00:00Z', '2027-04-00T00:00:00Z', '2027-04-01T24:00:00Z',
    '2027-04-01T00:60:00Z', '2027-04-01T00:00:60Z', '2027-04-01T00:00:00+24:00',
    '2027-04-01T00:00:00+01:60', '2027-04-01T00:00:00', '2027-04-01',
    '2027-04-01 00:00:00Z', '2027-04-01T00:00:00.Z']) refuses(valid(value), 'INVALID_EXPIRES');
});

test('UTF-8, NFC, line endings, field framing and extensions are checked without rewriting', () => {
  passes(('# Café\n' + valid() + 'X-Owner-Note: résumé\n').replaceAll('\n', '\r\n'));
  passes(valid().replace('Contact:', 'cOnTaCt:') + 'X-Future-Field: opaque value\nX-Future-Field: another value\n');
  refuses(Buffer.from([0xc3, 0x28]), 'INVALID_UTF8');
  refuses(valid().slice(0, -1), 'INVALID_LINE_ENDING');
  refuses(valid().replaceAll('\n', '\r'), 'INVALID_LINE_ENDING');
  refuses('# Cafe\u0301\n' + valid(), 'NON_NFC_TEXT');
  refuses('\uFEFF' + valid(), 'INVALID_TEXT');
  refuses(valid() + '# bad\u0000text\n', 'INVALID_TEXT');
  for (const line of ['Contact:https://192.0.2.10/report', ' Contact: https://192.0.2.10/report',
    'X Field: value', 'continuation line']) refuses(valid() + line + '\n', 'INVALID_FIELD');
  refuses('-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n\n' + valid(), 'SIGNED_INPUT_UNSUPPORTED');
});

test('resource limits and invalid caller options refuse with finite diagnostics', () => {
  refuses(Buffer.alloc(32769, 32), 'FILE_TOO_LARGE');
  refuses(valid() + '#' + 'a'.repeat(2048) + '\n', 'LINE_TOO_LONG');
  refuses(valid() + '\n'.repeat(1000), 'TOO_MANY_LINES');
  refuses(valid(), 'INVALID_OPTIONS', { now: NaN });
  refuses(valid(), 'INVALID_OPTIONS', { release: 'yes' });
});

test('the actual CLI validates default and concrete release files without changing their bytes', t => {
  const directory = mkdtempSync(join(tmpdir(), 'qv-security-txt-')), path = join(directory, 'policy.txt');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const template = run([], { cwd: directory });
  assert.equal(template.status, 0, template.stderr); assert.equal(JSON.parse(template.stdout).placeholders, 4);
  const refusal = run(['--release']); assert.equal(refusal.status, 1); assert.equal(JSON.parse(refusal.stdout).valid, false);
  const bytes = Buffer.from(valid(new Date(Date.now() + 90 * 86400000).toISOString())); writeFileSync(path, bytes);
  const release = run(['--release', path]);
  assert.equal(release.status, 0, release.stderr); assert.equal(release.stderr, '');
  assert.deepEqual(JSON.parse(release.stdout), { format: 'qv-security-txt-check/v1', mode: 'release', valid: true, placeholders: 0, issues: [] });
  assert.deepEqual(readFileSync(path), bytes);
  writeFileSync(path, Buffer.alloc(32769, 32));
  const large = run([path]); assert.equal(large.status, 1); assert.deepEqual(codes(JSON.parse(large.stdout)), ['FILE_TOO_LARGE']);
  const missing = run([join(directory, 'private-path-marker')]);
  assert.equal(missing.status, 2); assert.equal(missing.stdout, ''); assert.equal(missing.stderr, 'security-txt: cannot read input\n');
  for (const args of [['--unknown'], ['--release', '--release'], [path, path], ['--help', '--release']]) {
    const result = run(args); assert.equal(result.status, 2); assert.match(result.stderr, /^Usage:/);
  }
  const help = run(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /^Usage:/);
});
