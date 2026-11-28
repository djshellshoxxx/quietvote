// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-18-REQ-032
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { b64u, readTarStrict, writeTar } from '@quietvote/board';
import { jcs } from '@quietvote/crypto';
import { loadBundle, MAX_BUNDLE_BYTES } from '../src/bundle.ts';
import { verifyWithSelfTest } from '../src/main.ts';
import { hashReport, verifyBundle } from '../src/verify.ts';
import { archiveFiles, archiveFixture, encode, jsonBytes, jsonFile, resealEntries, seal, type Files } from './helpers/archive.ts';

let shared: ReturnType<typeof archiveFixture> | undefined;
const fixture = () => shared ??= archiveFixture();
const root = fileURLToPath(new URL('../../../', import.meta.url));
const guard = fileURLToPath(new URL('./helpers/offline-guard.mjs', import.meta.url));
const bins = [['packages/verifier/src/bin.ts'], ['packages/cli/bin/qv.ts', 'verify']];
const cli = (args: string[]) => spawnSync(process.execPath, ['--import', guard, ...args], { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });

async function changed(edit: (files: Files) => void, entriesDigest = true): Promise<Uint8Array> {
  const files = new Map((await fixture()).files);
  edit(files);
  if (entriesDigest) resealEntries(files);
  return seal(files);
}

function entryEdit(files: Files, edit: (rows: Record<string, unknown>[]) => void): void {
  const rows = new TextDecoder().decode(files.get('log/entries.jsonl')!).trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
  edit(rows);
  files.set('log/entries.jsonl', encode(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'));
}

test('archive: supported signed and witnessed snapshot has byte-exact full JSON report parity', async () => {
  const f = await fixture();
  const loaded = loadBundle(f.bytes);
  assert.ok(loaded.ok, JSON.stringify(loaded));
  assert.deepEqual(jcs(loaded.value.election), jcs(f.content));
  assert.deepEqual(jcs(loaded.value.boardJson), jcs(f.board));
  const report = await verifyBundle(f.bytes, { pinnedManifestHash: f.pin });
  assert.equal(report.verdict, 'PASS', JSON.stringify(report.findings));
  assert.equal(report.checks.V4.status, 'pass');
  assert.deepEqual(report, await verifyBundle(JSON.stringify(f.full), { pinnedManifestHash: f.pin }));
  assert.equal(report.reportHash, hashReport(report));
  assert.deepEqual((await verifyBundle(f.bytes)).caveats, (await verifyBundle(f.full)).caveats);
});

test('archive: original JSON text/bytes remain supported, including a ustar magic collision', () => {
  for (const whitespace of ['', ' \n\t']) {
    const prefix = whitespace + '{"manifest":{"body":{"pad":"';
    const text = prefix + 'x'.repeat(257 - prefix.length) + 'ustar"}},"manifest_hash":"x","roll":[],"log":[]}';
    const bytes = encode(text);
    assert.equal(new TextDecoder().decode(bytes.subarray(257, 262)), 'ustar');
    assert.deepEqual(loadBundle(bytes), loadBundle(text));
    assert.equal(loadBundle(bytes).ok, true);
  }
});

test('archive: strict tar framing and complete checksums refuse modified input', async () => {
  const f = await fixture();
  const files = [...readTarStrict(f.bytes, { maxFiles: 100 })].map(([name, data]) => ({ name, data }));
  const badSum = f.bytes.slice(); badSum[148] = badSum[148]! ^ 1;
  const tampered = f.bytes.slice(); tampered[512] = tampered[512]! ^ 1;
  const noSums = writeTar(files.filter((file) => file.name !== 'SHA256SUMS'));
  const extra = writeTar([...files, { name: 'unlisted.txt', data: encode('extra') }]);
  const variants: [string, Uint8Array][] = [
    ['header checksum', badSum], ['member checksum', tampered], ['no checksums', noSums], ['unlisted member', extra],
    ['duplicate member', writeTar([...files, files[0]!])], ['unsafe path', writeTar([{ name: '../escape', data: encode('x') }])],
    ['missing end', f.bytes.subarray(0, f.bytes.length - 1024)], ['trailing data', new Uint8Array([...f.bytes, 1])],
  ];
  for (const [label, bytes] of variants) {
    assert.equal(loadBundle(bytes).ok, false, label);
    const report = await verifyBundle(bytes);
    assert.equal(report.verdict, 'FAIL', label);
    assert.ok(report.findings.some((finding) => finding.code === 'E_SCHEMA'), label);
  }
  // Change only the header type/prefix, then repair the TAR header checksum: these are format refusals.
  for (const offset of [156, 345]) {
    const bytes = f.bytes.slice(); bytes[offset] = offset === 156 ? 0x32 : 0x61; bytes.fill(0x20, 148, 156);
    const sum = bytes.subarray(0, 512).reduce((n, byte) => n + byte, 0);
    bytes.set(encode(sum.toString(8).padStart(6, '0') + '\0 '), 148);
    assert.equal(loadBundle(bytes).ok, false, `TAR field ${offset}`);
  }
});

test('archive: well-checksummed malformed descriptors, JSONL, checkpoints and bindings are refused', async () => {
  const variants: [string, (files: Files) => void][] = [
    ['missing election', (files) => files.delete('election.json')],
    ['duplicate JSON member', (files) => files.set('bundle.json', encode('{"format":1,"format":2}'))],
    ['unsupported format', (files) => files.set('bundle.json', jsonBytes({ ...jsonFile(files, 'bundle.json'), format: 'qv-bundle/v2' }))],
    ['invalid UTF-8', (files) => files.set('election.json', Uint8Array.of(255))],
    ['missing newline', (files) => files.set('log/entries.jsonl', files.get('log/entries.jsonl')!.subarray(0, -1))],
    ['blank line', (files) => files.set('log/entries.jsonl', encode('\n'))],
    ['sequence gap', (files) => entryEdit(files, (rows) => { rows[1]!['seq'] = 2; })],
    ['sequence string', (files) => entryEdit(files, (rows) => { rows[1]!['seq'] = '1'; })],
    ['unknown entry field', (files) => entryEdit(files, (rows) => { rows[1]!['ignored'] = true; })],
    ['bad entry encoding', (files) => entryEdit(files, (rows) => { rows[1]!['body_b64u'] = '!'; })],
    ['second board', (files) => files.set('election.json', jsonBytes({ ...jsonFile(files, 'election.json'), board: {} }))],
    ['manifest copy', (files) => { const election = jsonFile(files, 'election.json'); election.manifest.body.title += '!'; files.set('election.json', jsonBytes(election)); }],
    ['changed content record', (files) => { const election = jsonFile(files, 'election.json'); election.log[0].entry = {}; files.set('election.json', jsonBytes(election)); }],
    ['duplicate content record', (files) => { const election = jsonFile(files, 'election.json'); election.log.push(election.log[0]); files.set('election.json', jsonBytes(election)); }],
    ['string content sequence', (files) => { const election = jsonFile(files, 'election.json'); election.log[0].seq = String(election.log[0].seq); files.set('election.json', jsonBytes(election)); }],
    ['unbound content sequence', (files) => { const election = jsonFile(files, 'election.json'); election.log[0].seq = 10000; files.set('election.json', jsonBytes(election)); }],
    ['descriptor log key', (files) => files.set('bundle.json', jsonBytes({ ...jsonFile(files, 'bundle.json'), log_pk_b64u: b64u(new Uint8Array(32)) }))],
    ['policy log key', (files) => files.set('witness/policy.json', jsonBytes({ ...jsonFile(files, 'witness/policy.json'), log_pk_b64: Buffer.alloc(32).toString('base64') }))],
    ['bad checkpoint filename', (files) => { const [name, bytes] = [...files].find(([name]) => name.startsWith('log/checkpoints/'))!; files.delete(name); files.set('log/checkpoints/0.txt', bytes); }],
    ['unrecognized checkpoint filename', (files) => files.set('log/checkpoints/other.txt', encode('not a note'))],
  ];
  for (const [label, edit] of variants) {
    const bytes = await changed(edit, label !== 'duplicate JSON member');
    assert.equal(loadBundle(bytes).ok, false, label);
    assert.equal((await verifyBundle(bytes)).verdict, 'FAIL', label);
  }
  assert.equal(loadBundle(await changed((files) => files.set('bundle.json', jsonBytes({ ...jsonFile(files, 'bundle.json'), entries_sha256: '0'.repeat(64) })), false)).ok, false);
});

test('archive: input, descriptor and entry-count limits precede costly verification', async () => {
  assert.equal(loadBundle(new Uint8Array(MAX_BUNDLE_BYTES + 1)).ok, false);
  assert.equal(loadBundle(await changed((files) => files.set('election.json', encode('{"float":1.5}')))).ok, false);
  assert.equal(loadBundle(await changed((files) => files.set('bundle.json', encode(' '.repeat(65_537))), false)).ok, false);
  const many = await changed((files) => files.set('log/entries.jsonl', encode('{"seq":0,"header_b64u":"","body_b64u":""}\n'.repeat(10_001))));
  const result = loadBundle(many);
  assert.ok(!result.ok && result.errors.some((error) => error.includes('10000 entries')));
});

test('archive: cryptographic and independent-pin failures retain ordinary verifier semantics', async () => {
  const f = await fixture();
  const wrongPin = await verifyBundle(f.bytes, { pinnedManifestHash: '00'.repeat(32) });
  assert.equal(wrongPin.verdict, 'FAIL'); assert.equal(wrongPin.checks.V1.status, 'fail');
  for (const field of ['origin', 'root_b64', 'tree_size'] as const) {
    const bytes = await changed((files) => { const meta = jsonFile(files, 'bundle.json'); meta[field] = field === 'tree_size' ? meta[field] + 1 : field === 'origin' ? 'quietvote/v1/aaaaaaaaaaaaaaaaaaaaaaaaaa' : Buffer.alloc(32).toString('base64'); files.set('bundle.json', jsonBytes(meta)); });
    assert.equal(loadBundle(bytes).ok, true, field);
    assert.equal((await verifyBundle(bytes)).verdict, 'FAIL', field);
  }
  const body = await changed((files) => entryEdit(files, (rows) => { rows[1]!['header_b64u'] = rows[2]!['header_b64u']; }));
  assert.equal(loadBundle(body).ok, true);
  assert.equal((await verifyBundle(body)).verdict, 'FAIL');
  const missingTally = await archiveFixture({ tally: false });
  const incomplete = await verifyBundle(missingTally.bytes);
  assert.equal(incomplete.verdict, 'INCOMPLETE');
  assert.deepEqual(incomplete, await verifyBundle(missingTally.full));
  const brokenSelfTest = await verifyWithSelfTest(f.bytes, { pinnedManifestHash: f.pin, corpusText: '{' });
  assert.equal(brokenSelfTest.verdict, 'FAIL'); assert.equal(brokenSelfTest.selfTest?.ok, false);
});

test('archive: embedded keys cannot authorize a supplemental author or hide its board record', async () => {
  const f = await archiveFixture({ supplemental: true });
  const filtered = { ...f.content, log: f.content.log.filter((row) => row.seq !== f.content.log.at(-2)!.seq) };
  const files = archiveFiles(filtered, f.board, { server_pk_b64u: b64u(Buffer.from(f.extraPin, 'hex')), organizer_pk_b64u: b64u(Buffer.from(f.extraPin, 'hex')), extraAuthorKeys: [f.extraPin] });
  const bytes = seal(files), loaded = loadBundle(bytes);
  assert.ok(loaded.ok); assert.deepEqual(jcs(loaded.value.election.log), jcs(f.content.log));
  const refused = await verifyBundle(bytes);
  assert.equal(refused.verdict, 'FAIL');
  assert.deepEqual(refused, await verifyBundle(f.full));
  const options = { extraAuthorKeys: [f.extraPin], pinnedManifestHash: f.pin };
  assert.equal((await verifyBundle(bytes, options)).verdict, 'PASS');
  assert.deepEqual(await verifyBundle(bytes, options), await verifyBundle(f.full, options));
});

test('archive: null body redactions retain every header and degrade claims without becoming PASS', async () => {
  const f = await fixture(), board = structuredClone(f.board);
  const rows = board['entries'] as { seq: number; body_b64u: string | null }[];
  const cast = f.content.log.find((row) => (row.entry as { intent?: string }).intent === 'cast')!;
  rows[cast.seq]!.body_b64u = null;
  board['redactions'] = [{ seq: cast.seq, redacted_at: 1_800_000_000, reason: 'fixture retention' }];
  const content = { ...f.content, log: f.content.log.filter((row) => row.seq !== cast.seq) };
  const bytes = seal(archiveFiles(content, board)), loaded = loadBundle(bytes);
  assert.ok(loaded.ok, JSON.stringify(loaded));
  assert.equal(loaded.value.board!.entries.length, rows.length);
  assert.equal(loaded.value.board!.entries[cast.seq]!.body, null);
  const report = await verifyBundle(bytes, { allowNoLog: true });
  assert.equal(report.verdict, 'FAIL');
  assert.equal(report.board?.redacted, 1);
  assert.equal(report.board?.integrity, 'PARTIAL');
  assert.deepEqual(report, await verifyBundle(JSON.stringify({ ...content, board }), { allowNoLog: true }));
  assert.deepEqual(report, await verifyBundle({ ...content, board }, { allowNoLog: true }));
});

test('archive: checksummed attachments are unassessed and never become trust or receipt evidence', async () => {
  const f = await fixture();
  const bytes = await changed((files) => {
    files.set('anchors/1.ots', encode('unassessed proof'));
    files.set('log/receipts/example.json', jsonBytes({ extraAuthorKeys: [f.extraPin] }));
    files.set('manifest.entry.json', encode('unassessed convenience copy'));
  });
  const report = await verifyBundle(bytes);
  assert.deepEqual(report, await verifyBundle(f.full));
  assert.equal(report.log?.receipt_claims, 0);
});

test('archive: actual qv-verify and qv verify run offline, preserve reports and leave files unchanged', async () => {
  const f = await fixture(), dir = mkdtempSync(join(tmpdir(), 'qv-archive-cli-'));
  try {
    const path = join(dir, 'snapshot.qvb'); writeFileSync(path, f.bytes);
    const expected = await verifyWithSelfTest(f.bytes, { pinnedManifestHash: f.pin, skipSelfTest: true });
    for (const bin of bins) {
      const success = cli([...bin, path, '--json', '--skip-selftest', '--manifest-hash', f.pin]);
      assert.equal(success.error, undefined); assert.equal(success.status, 0, success.stderr);
      assert.doesNotMatch(success.stderr, /QV_TEST_OUTBOUND_ATTEMPT/);
      assert.deepEqual(JSON.parse(success.stdout), expected);
      const wrong = cli([...bin, path, '--json', '--skip-selftest', '--manifest-hash', '00'.repeat(32)]);
      assert.equal(wrong.status, 1, wrong.stderr); assert.equal(JSON.parse(wrong.stdout).checks.V1.status, 'fail');
      assert.doesNotMatch(wrong.stderr, /QV_TEST_OUTBOUND_ATTEMPT/);
    }
    assert.deepEqual(new Uint8Array(readFileSync(path)), f.bytes);
    const extra = await archiveFixture({ supplemental: true }); writeFileSync(path, extra.bytes);
    for (const bin of bins) {
      const refused = cli([...bin, path, '--json', '--skip-selftest']);
      assert.equal(refused.status, 1, refused.stderr);
      const pinned = cli([...bin, path, '--json', '--skip-selftest', '--extra-author-key', extra.extraPin]);
      assert.equal(pinned.status, 0, pinned.stderr); assert.equal(JSON.parse(pinned.stdout).verdict, 'PASS');
      assert.doesNotMatch(refused.stderr + pinned.stderr, /QV_TEST_OUTBOUND_ATTEMPT/);
    }
    writeFileSync(path, f.bytes.subarray(0, 513));
    for (const bin of bins) { const malformed = cli([...bin, path, '--json', '--skip-selftest']); assert.equal(malformed.status, 1, malformed.stderr); assert.equal(JSON.parse(malformed.stdout).verdict, 'FAIL'); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('archive: offline guard has reachable DNS, promises, HTTP, HTTPS, fetch, TLS and socket controls', () => {
  const result = cli(['--input-type=module', '--eval', "import dns from 'node:dns'; import dp from 'node:dns/promises'; import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; for (const call of [() => dns.lookup('example.invalid', () => {}), () => dp.lookup('example.invalid'), () => new dp.Resolver().resolve4('example.invalid'), () => http.get('http://example.invalid'), () => https.get('https://example.invalid'), () => fetch('https://example.invalid'), () => tls.connect(443), () => net.connect(80)]) { try { await call(); } catch {} }"]);
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.match(/QV_TEST_OUTBOUND_ATTEMPT/g)?.length, 8);
});
