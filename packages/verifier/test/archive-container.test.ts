// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-18-REQ-032, QV-18-REQ-034
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { b64u, bundleFromJson } from '@quietvote/board';
import { bytesToHex, jcs, parseQvJson } from '@quietvote/crypto';
import { manifestHash, signRecordRaw, verifyMultiSig } from '@quietvote/protocol';
import { loadBundle } from '../src/bundle.ts';
import { verifyWithSelfTest } from '../src/main.ts';
import { verifyBundle } from '../src/verify.ts';
import { archiveFiles, archiveFixture, encode, jsonBytes, jsonFile, resealEntries, seal } from './helpers/archive.ts';

let shared: ReturnType<typeof archiveFixture> | undefined;
const fixture = () => shared ??= archiveFixture();

for (const member of ['log/entries.jsonl', 'checkpoint']) {
  test(`archive container: checksummed ${member} BOM is refused instead of normalized`, async () => {
    const f = await fixture(), files = new Map(f.files);
    const name = member === 'checkpoint' ? [...files.keys()].find((name) => name.startsWith('log/checkpoints/'))! : member;
    files.set(name, new Uint8Array([...encode('\ufeff'), ...files.get(name)!]));
    resealEntries(files);
    const result = loadBundle(seal(files));
    assert.ok(!result.ok, `${member}: a leading BOM must remain an input error`);
    assert.ok(result.errors.some((error) => error.includes('BOM not allowed')));
  });
}

async function redacted(seq: number) {
  const f = await fixture(), board = structuredClone(f.board);
  const rows = board['entries'] as { seq: number; body_b64u: string | null }[];
  rows[seq]!.body_b64u = null;
  board['redactions'] = [{ seq, redacted_at: 1_800_000_000, reason: 'test retention' }];
  const content = { ...f.content, log: f.content.log.filter((row) => row.seq !== seq) };
  return { ...f, board, content, bytes: seal(archiveFiles(content, board)), full: { ...content, board } };
}

test('archive container: redacted manifest keeps header binding, parsed-object parity and partial verdict in both modes', async () => {
  const f = await redacted(0), loaded = loadBundle(f.bytes), expected = bundleFromJson(f.board);
  assert.ok(loaded.ok, JSON.stringify(loaded)); assert.ok(expected.ok);
  assert.deepEqual(loaded.value.board, expected.value, 'all headers, null rows, checkpoints and redaction metadata survive');
  assert.deepEqual(jcs(loaded.value.election), jcs(f.content));
  for (const allowNoLog of [false, true]) {
    const options = { allowNoLog, pinnedManifestHash: f.pin };
    const report = await verifyBundle(f.bytes, options);
    assert.equal(report.verdict, 'INCOMPLETE');
    assert.equal(report.board?.integrity, 'PARTIAL'); assert.equal(report.board.redacted, 1);
    assert.equal(report.chk['chk.manifest.sig'], 'pass');
    assert.equal(report.checks.V4.status, 'not_run');
    assert.ok(report.checks.V4.notes.some((note) => note.includes('1 entry body')));
    assert.deepEqual(report, await verifyBundle(JSON.stringify(f.full), options));
    assert.deepEqual(report, await verifyBundle(f.full, options));
  }
});

test('archive container: redacted manifest cannot hide a different validly signed convenience manifest', async () => {
  const f = await redacted(0), body = structuredClone(f.content.manifest.body), signer = f.manifestSigner;
  body.title = body.title.slice(0, -1) + (body.title.endsWith('x') ? 'y' : 'x');
  const mh = manifestHash(body);
  const manifest = { body, sigs: [signRecordRaw(signer.secretKey, signer.publicKey, mh, 'manifest', body)] };
  assert.equal(verifyMultiSig(mh, manifest, body.coordinator.keys, body.coordinator.m), true);
  assert.equal(jcs(manifest).length, jcs(f.content.manifest).length, 'the mismatch must exercise digest binding, not only length');
  const content = { ...f.content, manifest, manifest_hash: bytesToHex(mh) };
  const bytes = seal(archiveFiles(content, f.board)), loaded = loadBundle(bytes);
  assert.ok(!loaded.ok && loaded.errors.some((error) => error.includes('entry 0 differs')));
  for (const allowNoLog of [false, true]) {
    const options = { allowNoLog, pinnedManifestHash: content.manifest_hash };
    assert.equal((await verifyBundle(bytes, options)).verdict, 'FAIL');
    const json = await verifyBundle(JSON.stringify({ ...content, board: f.board }), options);
    assert.equal(json.verdict, 'FAIL');
    assert.equal(json.chk['chk.manifest.sig'], 'pass', 'manifest signatures alone cannot authenticate the mismatched board');
    assert.equal(json.chk['chk.board.append_only'], 'fail');
    assert.deepEqual(json, await verifyBundle({ ...content, board: f.board }, options));
  }
});

test('archive container: JSON null permission is confined to the exact board entries array body field', async () => {
  const f = await fixture();
  const bad: object[] = [
    { ...f.full, body_b64u: null }, { ...f.full, manifest: null }, { ...f.full, roll: [null] },
    { ...f.full, log: [{ seq: 1, entry: null }] }, { ...f.full, log: [{ seq: 1, entry: { body_b64u: null } }] },
    { ...f.full, board: { ...f.board, entries: { 0: { body_b64u: null } } } },
    { ...f.full, board: { ...f.board, entries: [null] } },
    { ...f.full, board: { ...f.board, entries: [{ body_b64u: { body_b64u: null } }] } },
    { ...f.full, board: { ...f.board, entries: [[{ body_b64u: null }]] } },
    { ...f.full, board: { ...f.board, entries: [{ body_b64u: [null] }] } },
    { ...f.full, board: { ...f.board, policy: null } },
    { ...f.full, board: { ...f.board, redactions: [null] } },
    { ...f.full, board: { ...f.board, receipts: [{ inclusion: null }] } },
  ];
  for (const key of ['body_b64U', 'body_b64u ', 'body_b64u\u200b']) bad.push({ ...f.full, board: { ...f.board, entries: [{ [key]: null }] } });
  for (const input of bad) {
    const text = JSON.stringify(input), loaded = loadBundle(text);
    assert.ok(!loaded.ok && loaded.errors.some((error) => error.includes('null not allowed')), text.slice(0, 100));
    assert.equal((await verifyBundle(text, { allowNoLog: true })).verdict, 'FAIL');
  }
});

test('archive container: JSONL nulls elsewhere, duplicate nullable keys, and decoded signed-body nulls are refused', async () => {
  const f = await fixture();
  for (const line of [
    '{"seq":0,"header_b64u":null,"body_b64u":null}', '{"seq":null,"header_b64u":"","body_b64u":null}',
    '{"seq":0,"header_b64u":"","body_b64u":{"body_b64u":null}}',
    '{"seq":0,"header_b64u":"","body_b64u":[null]}', '{"seq":0,"header_b64u":"","body_b64u\\u200b":null}',
    '{"seq":0,"header_b64u":"","body_b64u":null,"\\u0062ody_b64u":null}',
  ]) {
    const files = new Map(f.files); files.set('log/entries.jsonl', encode(line + '\n')); resealEntries(files);
    const loaded = loadBundle(seal(files));
    assert.ok(!loaded.ok, line);
    assert.ok(loaded.errors.some((error) => error.includes(line.includes('\\u0062ody') ? 'duplicate key' : 'null not allowed')), line);
  }
  const files = new Map(f.files);
  const rows = new TextDecoder().decode(files.get('log/entries.jsonl')).trimEnd().split('\n').map((line) => JSON.parse(line));
  rows[1].body_b64u = b64u(encode('{"body":{"type":"marker","body_b64u":null}}'));
  files.set('log/entries.jsonl', encode(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'));
  const content = jsonFile(files, 'election.json'); content.log = content.log.filter((row: { seq: number }) => row.seq !== 1);
  files.set('election.json', jsonBytes(content)); resealEntries(files);
  const loaded = loadBundle(seal(files));
  assert.ok(!loaded.ok && loaded.errors.some((error) => error.includes('null not allowed')));
  assert.throws(() => parseQvJson('{"body_b64u":null}'), { code: 'E_PARSE' });
});

test('archive container: a missing body without a recorded redaction remains a verification failure', async () => {
  const f = await redacted(0); f.board['redactions'] = [];
  const report = await verifyBundle(seal(archiveFiles(f.content, f.board)), { allowNoLog: true });
  assert.equal(report.verdict, 'FAIL'); assert.equal(report.board?.redacted, 1);
  assert.equal(report.board?.integrity, 'FAILED');
  assert.ok(report.findings.some((finding) => finding.detail.includes('redaction')));
});

test('archive container: real offline CLI commands report redacted evidence and cannot promote partial input', async () => {
  const f = await redacted(0), dir = mkdtempSync(join(tmpdir(), 'qv-redacted-cli-'));
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const guard = fileURLToPath(new URL('./helpers/offline-guard.mjs', import.meta.url));
  try {
    const archive = join(dir, 'redacted.qvb'), json = join(dir, 'redacted.json');
    writeFileSync(archive, f.bytes); writeFileSync(json, JSON.stringify(f.full));
    const options = { pinnedManifestHash: f.pin, skipSelfTest: true };
    const expected = await verifyWithSelfTest(f.bytes, options);
    for (const bin of [['packages/verifier/src/bin.ts'], ['packages/cli/bin/qv.ts', 'verify']]) {
      for (const input of [archive, json]) {
        const run = spawnSync(process.execPath, ['--import', guard, ...bin, input, '--json', '--skip-selftest', '--manifest-hash', f.pin], { cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
        assert.equal(run.error, undefined); assert.equal(run.status, 3, run.stderr);
        assert.doesNotMatch(run.stderr, /QV_TEST_OUTBOUND_ATTEMPT/);
        assert.deepEqual(JSON.parse(run.stdout), expected);
      }
    }
    assert.deepEqual(new Uint8Array(readFileSync(archive)), f.bytes);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
