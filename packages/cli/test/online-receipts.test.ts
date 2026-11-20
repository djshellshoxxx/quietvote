// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { b64u, buildEntry, receiptToJson, signPromise, type Receipt } from '@quietvote/board';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { expectedLogId, logOrigin, manifestHash } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { BIN, COORD, LOGK, qv, tinyBundle, tmp, writeJson } from './helpers.ts';

const exec = promisify(execFile);

/** Public receipt in the actual QV-09 transport shape, not board receipt JSON. */
function promiseView(receipt: Receipt) {
  return { origin: receipt.origin, seq: receipt.seq, leaf_hash: b64u(receipt.leafHash),
    promise: { sequenced_at: receipt.sequencedAt, checkpoint_deadline: receipt.checkpointDeadline },
    promise_sig: b64u(receipt.promiseSig) };
}

function ordinaryPromise() {
  const manifest = tinyBundle().manifest;
  const id: string = manifest.body.election_id, origin = logOrigin({ election_id: id });
  const entry = buildEntry({ origin, type: 'manifest', secretKey: COORD.secretKey, publicKey: COORD.publicKey,
    nonce: new Uint8Array(16).fill(4), createdAt: 1_800_000_000, body: jcs(manifest) });
  const packet = { header: b64u(entry.headerBytes), body: b64u(entry.body) };
  const receipt = signPromise(LOGK.secretKey, origin, 0, entry.leafHash, 1_800_000_000);
  return { id, origin, entry, packet, receipt, wire: { status: 'sequenced', receipt: promiseView(receipt) } };
}

async function responseServer(value: () => unknown) {
  const requests: { method: string | undefined; path: string | undefined; body: string }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, path: request.url, body: Buffer.concat(chunks).toString('utf8') });
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify(value()));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { base: `http://127.0.0.1:${address.port}`, requests,
    stop: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

test('checked relay verifies a real server receipt, preserves exact replay and keeps legacy mode', { timeout: 60_000 }, async (t) => {
  const w = new World({ seed: 'cli-receipt-real', n: 3, t: 2, voters: 3, freshConnections: true });
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    w.manifest = w.buildManifest(); w.manifest.bb.log_id = expectedLogId(w.origin);
    w.mh = manifestHash(w.manifest);
    const entry = w.entry('manifest', w.owner, w.multi(w.mh, w.manifest));
    const packet = writeJson(w.dir, 'manifest-packet.json', { header: b64u(entry.headerBytes), body: b64u(entry.body) });
    const before = readFileSync(packet);
    const common = ['online', 'election-submit', '--server', w.base, '--id', w.electionId, '--file', packet];
    const { stdout, stderr } = await exec(process.execPath, [BIN, ...common, '--log-key', w.logPkHex, '--json'],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, signal: t.signal });
    const checked = JSON.parse(stdout);
    assert.equal(checked.status, 'included', stderr + stdout);
    assert.equal(checked.verification.scope, 'receipt-only');
    assert.equal(checked.verification.promise, 'VERIFIED');
    assert.equal(checked.verification.inclusion, 'VERIFIED');
    assert.equal(checked.verification.origin, w.origin);
    assert.equal(checked.verification.leaf_hash, bytesToHex(entry.leafHash));
    assert.equal(checked.verification.log_key, w.logPkHex);
    for (const flag of ['authority_verified', 'witness_quorum_verified', 'freshness_verified', 'ballot_counting_verified']) {
      assert.equal(checked.verification[flag], false, flag);
    }
    assert.equal(checked.receipt.seq, 0);
    assert.equal(typeof checked.receipt.sequenced_at, 'number');
    assert.equal(checked.receipt.promise, undefined, 'checked output uses normalized board receipt JSON');

    const replay = await qv([...common, '--log-key', w.logPkHex]);
    assert.equal(replay.code, 0, replay.err);
    assert.deepEqual(JSON.parse(replay.out), checked);
    const legacy = await qv([...common, '--json']);
    assert.equal(legacy.code, 0, legacy.err);
    const raw = JSON.parse(legacy.out);
    assert.equal(raw.verification, undefined);
    assert.equal(raw.receipt.leaf_hash, b64u(entry.leafHash));
    assert.equal(raw.receipt.promise.sequenced_at, checked.receipt.sequenced_at);
    assert.equal((await w.fetchLog()).length, 1, 'explicit exact-byte replays do not append duplicates');

    const normalized = writeJson(w.dir, 'receipt.json', checked.receipt);
    const offline = await qv(['verify-receipt', normalized, '--log-key', w.logPkHex,
      '--origin', w.origin, '--leaf-hash', bytesToHex(entry.leafHash), '--json']);
    assert.equal(offline.code, 0, offline.err);
    assert.equal(JSON.parse(offline.out).inclusion, 'VERIFIED');
    assert.deepEqual(readFileSync(packet), before);
  } finally { await w.stop(); }
});

test('checked relay preserves promise-only evidence and ignores additive transport metadata', async () => {
  const dir = tmp(), fixture = ordinaryPromise();
  const response = { ...fixture.wire, metadata: { delay: 0.25, next: null, label: 'cafe\u0301' },
    verification: { note: 'server advisory' }, receipt: { ...fixture.wire.receipt, next: null,
      promise: { ...fixture.wire.receipt.promise, precision: 0.5 } } };
  const server = await responseServer(() => response);
  try {
    const file = writeJson(dir, 'packet.json', fixture.packet), before = readFileSync(file);
    const result = await qv(['online', 'election-submit', '--server', server.base, '--id', fixture.id,
      '--file', file, '--log-key', bytesToHex(LOGK.publicKey)]);
    assert.equal(result.code, 3, result.err + result.out);
    const report = JSON.parse(result.out);
    assert.equal(report.status, 'sequenced');
    assert.equal(report.verification.promise, 'VERIFIED');
    assert.equal(report.verification.inclusion, 'INCOMPLETE');
    assert.equal(report.verification.scope, 'receipt-only');
    assert.equal(report.verification.note, undefined);
    assert.equal(report.metadata, undefined);
    assert.deepEqual(report.receipt, receiptToJson(fixture.receipt));
    assert.equal(report.verification.leaf_hash, bytesToHex(fixture.entry.leafHash));
    assert.equal(server.requests.length, 1, 'promise-only result causes no poll or automatic retry');
    assert.equal(server.requests[0]!.method, 'POST');
    assert.equal(server.requests[0]!.path, `/api/v1/elections/${fixture.id}/log/entries`);
    assert.deepEqual(JSON.parse(server.requests[0]!.body), fixture.packet);
    const offline = await qv(['verify-receipt', writeJson(dir, 'receipt.json', report.receipt),
      '--log-key', bytesToHex(LOGK.publicKey), '--origin', fixture.origin,
      '--leaf-hash', bytesToHex(fixture.entry.leafHash), '--json']);
    assert.equal(offline.code, 3, offline.err);
    assert.equal(JSON.parse(offline.out).inclusion, 'INCOMPLETE');
    assert.deepEqual(readFileSync(file), before);
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('checked relay keeps possible acceptance after a wrong pin or incomplete success response', async () => {
  const dir = tmp(), fixture = ordinaryPromise();
  let response: unknown = fixture.wire;
  const server = await responseServer(() => response);
  try {
    const file = writeJson(dir, 'packet.json', fixture.packet), before = readFileSync(file);
    const args = ['online', 'election-submit', '--server', server.base, '--id', fixture.id, '--file', file];
    const wrongPin = await qv([...args, '--log-key', bytesToHex(COORD.publicKey)]);
    assert.equal(wrongPin.code, 1);
    assert.match(wrongPin.err, /may have been accepted|outcome unknown/i);
    assert.equal(server.requests.length, 1);
    response = { status: 'sequenced' };
    const unfinished = await qv([...args, '--log-key', bytesToHex(LOGK.publicKey)]);
    assert.equal(unfinished.code, 1);
    assert.match(unfinished.err, /may have been accepted|outcome unknown/i);
    assert.equal(server.requests.length, 2, 'each explicit invocation makes only one request');
    assert.deepEqual(readFileSync(file), before);
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('checked relay refuses invalid pins and unbound or unreadable packets before sending', async () => {
  const dir = tmp(), fixture = ordinaryPromise(), server = await responseServer(() => fixture.wire);
  try {
    const good = writeJson(dir, 'packet.json', fixture.packet);
    const mismatched = writeJson(dir, 'different-body.json', { ...fixture.packet, body: b64u(new Uint8Array([1])) });
    const malformed = join(dir, 'malformed.json'); writeFileSync(malformed, '{');
    const oversized = writeJson(dir, 'oversized.json', fixture.packet); truncateSync(oversized, 1_153_435);
    const invoke = (file: string, key = bytesToHex(LOGK.publicKey), id = fixture.id) => qv([
      'online', 'election-submit', '--server', server.base, '--id', id, '--file', file, '--log-key', key,
    ]);
    assert.equal((await invoke(good, 'not-hex')).code, 2);
    assert.equal((await invoke(good, '00'.repeat(32))).code, 2);
    assert.equal((await invoke(good, bytesToHex(LOGK.publicKey), '00'.repeat(16))).code, 4);
    for (const file of [mismatched, malformed, oversized, dir]) assert.equal((await invoke(file)).code, 4, file);
    assert.equal(server.requests.length, 0);
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});
