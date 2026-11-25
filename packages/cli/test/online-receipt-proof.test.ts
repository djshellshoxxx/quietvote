// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync, rmSync, truncateSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { b64, b64u, buildEntry, hashChildren, receiptToJson, signCheckpoint, signPromise, type ReceiptJson } from '@quietvote/board';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { dkgDeal, expectedLogId, logOrigin, manifestHash, signRecord } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import type { ReceiptProofReport } from '../src/receipt-proof.ts';
import { BIN, COORD, LOGK, qv, tinyBundle, tmp, writeJson } from './helpers.ts';
import { writePrivateFixtureAsync } from './private-fixture.ts';

const exec = promisify(execFile);
type RequestView = { method: string; path: string; query: Record<string, string>; readKey: boolean };
interface FixtureReceiptWire {
  origin: string;
  seq: number;
  leaf_hash: string;
  promise_sig: string;
  promise: { sequenced_at: number; checkpoint_deadline: number };
  inclusion?: { seq: number; leaf_hash: string; tree_size: number; path: string[]; checkpoint_note: string };
}

function requestView(request: IncomingMessage): RequestView {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  return { method: request.method ?? '', path: url.pathname,
    query: Object.fromEntries(url.searchParams), readKey: typeof request.headers['qv-read-key'] === 'string' };
}

/** Convert a known fixture's actual server receipt to the existing saved board representation. */
function savedReceipt(wire: FixtureReceiptWire): ReceiptJson {
  const normalized: ReceiptJson = {
    origin: wire.origin, seq: wire.seq,
    leaf_hash: Buffer.from(wire.leaf_hash, 'base64url').toString('base64'),
    promise_sig: Buffer.from(wire.promise_sig, 'base64url').toString('base64'),
    sequenced_at: wire.promise.sequenced_at, checkpoint_deadline: wire.promise.checkpoint_deadline,
  };
  if (wire.inclusion) normalized.inclusion = { tree_size: wire.inclusion.tree_size,
    path: wire.inclusion.path, checkpoint_note: wire.inclusion.checkpoint_note };
  return normalized;
}

async function admittedManifest(w: World) {
  await w.registerVoters();
  w.manifest = w.buildManifest(); w.manifest.bb.log_id = expectedLogId(w.origin);
  w.mh = manifestHash(w.manifest);
  const entry = w.entry('manifest', w.owner, w.multi(w.mh, w.manifest));
  const result = await w.submit(entry.headerBytes, entry.body);
  assert.equal(result.status, 201, result.text);
  assert.equal(result.json.status, 'included');
  w.tick();
  return { entry, receipt: savedReceipt(result.json.receipt) };
}

function checkArgs(base: string, id: string, file: string, key: string, leaf: string, size: number): string[] {
  return ['online', 'receipt-check', '--server', base, '--id', id, '--file', file,
    '--log-key', key, '--leaf-hash', leaf, '--tree-size', String(size)];
}

function scoped(report: ReceiptProofReport, origin: string, key: string, leaf: string, requested: number, previous: number | null): void {
  assert.equal(report.verification.scope, 'receipt-proof');
  assert.equal(report.verification.promise, 'VERIFIED');
  assert.equal(report.verification.origin, origin);
  assert.equal(report.verification.log_key, key);
  assert.equal(report.verification.leaf_hash, leaf);
  assert.equal(report.verification.requested_tree_size, requested);
  assert.equal(report.verification.previous_tree_size, previous);
  for (const flag of ['authority_verified', 'witness_quorum_verified', 'freshness_verified', 'ballot_counting_verified'] as const) {
    assert.equal(report.verification[flag], false, flag);
  }
}

test('receipt proof command upgrades real evidence and checks growth without writing or mutating', { timeout: 60_000 }, async (t) => {
  const w = new World({ seed: 'cli-later-proof', n: 3, t: 2, voters: 3, freshConnections: true });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const { entry, receipt } = await admittedManifest(w), leaf = bytesToHex(entry.leafHash);
    assert.equal(receipt.inclusion!.tree_size, 1);
    const promise = structuredClone(receipt); delete promise.inclusion;
    const promiseFile = writeJson(w.dir, 'saved-promise.json', promise);
    const includedFile = writeJson(w.dir, 'saved-inclusion.json', receipt);
    const beforePromise = readFileSync(promiseFile), beforeIncluded = readFileSync(includedFile);
    const requests: RequestView[] = [];
    w.server.http.server.on('request', (request) => requests.push(requestView(request)));
    const path = `/api/v1/elections/${w.electionId}/log/proof`;

    // Exercise the real executable while the normal server remains live.
    const { stdout, stderr } = await exec(process.execPath, [BIN,
      ...checkArgs(w.base, w.electionId, promiseFile, w.logPkHex, leaf, 1), '--json'],
    { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, signal: t.signal });
    const upgraded = JSON.parse(stdout);
    assert.equal(upgraded.status, 'included', stderr);
    scoped(upgraded, w.origin, w.logPkHex, leaf, 1, null);
    assert.equal(upgraded.verification.inclusion, 'VERIFIED');
    assert.equal(upgraded.verification.consistency, 'NOT_CHECKED');
    assert.equal(upgraded.verification.receipt_tree_size, 1);
    assert.deepEqual(upgraded.receipt, receipt);
    assert.deepEqual(requests, [{ method: 'GET', path: `${path}/inclusion`, query: { seq: '0', tree_size: '1' }, readKey: false }]);

    // A legitimate next ceremony record supplies a later signed checkpoint.
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const phaseBefore = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase;
    requests.length = 0;
    const grown = await qv(checkArgs(w.base, w.electionId, includedFile, w.logPkHex, leaf, 2));
    assert.equal(grown.code, 0, grown.err);
    const growth = JSON.parse(grown.out);
    scoped(growth, w.origin, w.logPkHex, leaf, 2, 1);
    assert.equal(growth.status, 'included');
    assert.equal(growth.verification.inclusion, 'VERIFIED');
    assert.equal(growth.verification.consistency, 'VERIFIED');
    assert.equal(growth.verification.receipt_tree_size, 2);
    assert.equal(growth.receipt.inclusion.tree_size, 2);
    assert.equal(growth.receipt.seq, receipt.seq);
    assert.equal(growth.receipt.leaf_hash, receipt.leaf_hash);
    assert.equal(growth.receipt.promise_sig, receipt.promise_sig);
    assert.deepEqual(requests, [
      { method: 'GET', path: `${path}/inclusion`, query: { seq: '0', tree_size: '2' }, readKey: false },
      { method: 'GET', path: `${path}/consistency`, query: { old: '1', new: '2' }, readKey: false },
    ]);

    const refreshedFile = writeJson(w.dir, 'returned-inclusion.json', growth.receipt), beforeRefreshed = readFileSync(refreshedFile);
    const offline = await qv(['verify-receipt', refreshedFile, '--log-key', w.logPkHex,
      '--origin', w.origin, '--leaf-hash', leaf, '--json']);
    assert.equal(offline.code, 0, offline.err);
    assert.equal(JSON.parse(offline.out).inclusion, 'VERIFIED');
    requests.length = 0;
    const equal = await qv(checkArgs(w.base, w.electionId, refreshedFile, w.logPkHex, leaf, 2));
    assert.equal(equal.code, 0, equal.err);
    const same = JSON.parse(equal.out);
    scoped(same, w.origin, w.logPkHex, leaf, 2, 2);
    assert.equal(same.verification.consistency, 'VERIFIED');
    assert.deepEqual(same.receipt, growth.receipt);
    assert.deepEqual(requests, [{ method: 'GET', path: `${path}/inclusion`, query: { seq: '0', tree_size: '2' }, readKey: false }]);
    assert.deepEqual(readFileSync(promiseFile), beforePromise);
    assert.deepEqual(readFileSync(includedFile), beforeIncluded);
    assert.deepEqual(readFileSync(refreshedFile), beforeRefreshed);
    assert.equal((await w.fetchLog()).length, 2, 'proof checks append no entries');
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, phaseBefore);
  } finally { await w.stop(); }
});

test('receipt proof command advances a nonzero receipt from a three-entry checkpoint to seven entries', { timeout: 60_000 }, async () => {
  const w = new World({ seed: 'cli-later-proof-three-seven', n: 3, t: 2, voters: 3, freshConnections: true });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await admittedManifest(w);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    const deals = [1, 2, 3].map((i) => dkgDeal(w.mh, i, 2, w.rng));
    const firstTrustee = w.trustees[0]!;
    const first = w.entry('dkg_round1', firstTrustee,
      signRecord(firstTrustee.secretKey, firstTrustee.publicKey, w.mh, deals[0]!.commit));
    const accepted = await w.submit(first.headerBytes, first.body);
    assert.equal(accepted.status, 201, accepted.text);
    assert.equal(accepted.json.status, 'included');
    w.tick();
    const receipt = savedReceipt(accepted.json.receipt), leaf = bytesToHex(first.leafHash);
    assert.equal(receipt.seq, 2);
    assert.equal(receipt.inclusion!.tree_size, 3);
    const file = writeJson(w.dir, 'three-entry-receipt.json', receipt), before = readFileSync(file);

    // Continue the ordinary ceremony prefix; no extra or fabricated board entries.
    for (let i = 1; i < deals.length; i++) {
      const trustee = w.trustees[i]!;
      await w.ok('dkg_round1', trustee, signRecord(trustee.secretKey, trustee.publicKey, w.mh, deals[i]!.commit));
    }
    await w.ok('notice', w.coord[0]!, w.marker('dkg-r1-open', w.mh));
    await w.ok('dkg_round1', firstTrustee,
      signRecord(firstTrustee.secretKey, firstTrustee.publicKey, w.mh, deals[0]!.body));
    assert.equal((await w.fetchLog()).length, 7);
    const phaseBefore = (await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase;
    const requests: RequestView[] = [];
    w.server.http.server.on('request', (request) => requests.push(requestView(request)));

    const checked = await qv(checkArgs(w.base, w.electionId, file, w.logPkHex, leaf, 7));
    assert.equal(checked.code, 0, checked.err);
    const report: ReceiptProofReport = JSON.parse(checked.out);
    scoped(report, w.origin, w.logPkHex, leaf, 7, 3);
    assert.equal(report.status, 'included');
    assert.equal(report.verification.inclusion, 'VERIFIED');
    assert.equal(report.verification.consistency, 'VERIFIED');
    assert.equal(report.verification.receipt_tree_size, 7);
    assert.ok(report.receipt.inclusion);
    assert.equal(report.receipt.inclusion.tree_size, 7);
    assert.ok(report.receipt.inclusion.path.length > 1, 'normal inclusion uses a multi-hash path');
    assert.deepEqual({ ...report.receipt, inclusion: receipt.inclusion }, receipt, 'the original promise and receipt identity are unchanged');
    const path = `/api/v1/elections/${w.electionId}/log/proof`;
    assert.deepEqual(requests, [
      { method: 'GET', path: `${path}/inclusion`, query: { seq: '2', tree_size: '7' }, readKey: false },
      { method: 'GET', path: `${path}/consistency`, query: { old: '3', new: '7' }, readKey: false },
    ]);
    const outputFile = writeJson(w.dir, 'seven-entry-receipt.json', report.receipt);
    const offline = await qv(['verify-receipt', outputFile, '--log-key', w.logPkHex,
      '--origin', w.origin, '--leaf-hash', leaf, '--json']);
    assert.equal(offline.code, 0, offline.err);
    assert.equal(JSON.parse(offline.out).inclusion, 'VERIFIED');
    assert.deepEqual(readFileSync(file), before);
    assert.equal((await w.fetchLog()).length, 7, 'proof checking appends no entries');
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, phaseBefore);
  } finally { await w.stop(); }
});

test('receipt proof command reads a legitimate link election with its private read-key file', { timeout: 60_000 }, async () => {
  const w = new World({ seed: 'cli-later-proof-link', n: 3, t: 2, voters: 3, freshConnections: true });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const created = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Link receipt check', access: 'link' }, w.owner, w.idemKey());
    assert.equal(created.status, 201, created.text);
    w.electionId = created.json.election_id; w.origin = created.json.origin; w.logPkHex = created.json.log_pk_hex;
    const { entry, receipt } = await admittedManifest(w);
    const readKeyFile = join(w.dir, 'read-key.txt');
    await writePrivateFixtureAsync(readKeyFile, created.json.read_key);
    const file = writeJson(w.dir, 'receipt.json', receipt), before = readFileSync(file), beforeKey = readFileSync(readKeyFile);
    const requests: RequestView[] = [];
    w.server.http.server.on('request', (request) => requests.push(requestView(request)));
    const result = await qv([...checkArgs(w.base, w.electionId, file, w.logPkHex, bytesToHex(entry.leafHash), 1), '--read-key-file', readKeyFile]);
    assert.equal(result.code, 0, result.err);
    const report = JSON.parse(result.out);
    scoped(report, w.origin, w.logPkHex, bytesToHex(entry.leafHash), 1, 1);
    assert.equal(report.verification.inclusion, 'VERIFIED');
    assert.equal(report.verification.consistency, 'VERIFIED');
    assert.deepEqual(requests, [{ method: 'GET', path: `/api/v1/elections/${w.electionId}/log/proof/inclusion`,
      query: { seq: '0', tree_size: '1' }, readKey: true }]);
    assert.deepEqual(readFileSync(file), before);
    assert.deepEqual(readFileSync(readKeyFile), beforeKey);
    assert.equal(result.out.includes(created.json.read_key), false, 'access key is not printed');
  } finally { await w.stop(); }
});

function ordinaryFixture() {
  const manifest = tinyBundle().manifest, id: string = manifest.body.election_id, origin = logOrigin({ election_id: id });
  const entry = (nonce: number) => buildEntry({ origin, type: 'manifest', secretKey: COORD.secretKey, publicKey: COORD.publicKey,
    nonce: new Uint8Array(16).fill(nonce), createdAt: 1_800_000_000, body: jcs(manifest) });
  const first = entry(5), second = entry(6), signed = signPromise(LOGK.secretKey, origin, 0, first.leafHash, 1_800_000_000);
  const promise = receiptToJson(signed);
  signed.inclusion = { treeSize: 1, path: [], checkpointNote: signCheckpoint(origin, 1, first.leafHash, LOGK.secretKey, LOGK.publicKey) };
  const included = receiptToJson(signed);
  const later = { ...signed, inclusion: { treeSize: 2, path: [second.leafHash],
    checkpointNote: signCheckpoint(origin, 2, hashChildren(first.leafHash, second.leafHash), LOGK.secretKey, LOGK.publicKey) } };
  return { id, origin, leaf: bytesToHex(first.leafHash), key: bytesToHex(LOGK.publicKey), promise, included, later: receiptToJson(later),
    proof: { seq: 0, leaf_hash: b64u(first.leafHash), tree_size: 2, path: [b64(second.leafHash)] } };
}

async function ordinaryProofServer(responseValue: unknown) {
  const requests: RequestView[] = [];
  const server = createServer((request, response) => {
    requests.push(requestView(request)); request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(responseValue));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { base: `http://127.0.0.1:${address.port}`, requests,
    stop: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

test('a requested proof without its optional checkpoint note remains incomplete and preserves saved evidence', async () => {
  const dir = tmp(), fixture = ordinaryFixture();
  const server = await ordinaryProofServer({ ...fixture.proof, metadata: { next: null, delay: 0.25, label: 'cafe\u0301' },
    verification: { inclusion: 'server advisory' } });
  try {
    for (const saved of [fixture.included, fixture.promise]) {
      const previous = saved.inclusion?.tree_size ?? null;
      const file = writeJson(dir, `saved-${previous ?? 'promise'}.json`, saved), before = readFileSync(file);
      server.requests.length = 0;
      const result = await qv(checkArgs(server.base, fixture.id, file, fixture.key, fixture.leaf, 2));
      assert.equal(result.code, 3, result.err + result.out);
      const report = JSON.parse(result.out);
      assert.equal(report.status, 'incomplete');
      scoped(report, fixture.origin, fixture.key, fixture.leaf, 2, previous);
      assert.equal(report.verification.inclusion, 'INCOMPLETE');
      assert.equal(report.verification.consistency, previous === null ? 'NOT_CHECKED' : 'INCOMPLETE');
      assert.equal(report.verification.receipt_tree_size, previous);
      assert.deepEqual(report.receipt, saved, 'the earlier authenticated evidence is retained');
      assert.equal(report.metadata, undefined);
      assert.equal(server.requests.length, 1, 'no consistency read, polling or retry without a signed requested checkpoint');
      assert.equal(server.requests[0]!.method, 'GET');
      assert.deepEqual(server.requests[0]!.query, { seq: '0', tree_size: '2' });
      assert.deepEqual(readFileSync(file), before);
    }
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('receipt proof input anchors and requested sizes are checked before any read request', async () => {
  const dir = tmp(), fixture = ordinaryFixture(), server = await ordinaryProofServer(fixture.proof);
  try {
    const file = writeJson(dir, 'promise.json', fixture.promise), before = readFileSync(file);
    const laterFile = writeJson(dir, 'later.json', fixture.later);
    const oversized = writeJson(dir, 'oversized.json', fixture.promise); truncateSync(oversized, 65_537);
    const good = checkArgs(server.base, fixture.id, file, fixture.key, fixture.leaf, 2);
    const replace = (flag: string, value: string) => { const args = [...good]; args[args.indexOf(flag) + 1] = value; return args; };
    const missingKey = [...good]; missingKey.splice(missingKey.indexOf('--log-key'), 2);
    assert.equal((await qv(missingKey)).code, 2);
    assert.equal((await qv(replace('--log-key', 'not-a-key'))).code, 2);
    for (const size of ['0', String(2 ** 40 + 1)]) {
      const refused = await qv(replace('--tree-size', size));
      assert.equal(refused.code, 2, refused.err);
    }
    for (const args of [replace('--id', '00'.repeat(16)), replace('--log-key', bytesToHex(COORD.publicKey)),
      replace('--leaf-hash', '22'.repeat(32)), replace('--file', dir), replace('--file', oversized),
      checkArgs(server.base, fixture.id, laterFile, fixture.key, fixture.leaf, 1)]) {
      const refused = await qv(args);
      assert.equal(refused.code, 4, refused.err);
    }
    assert.equal(server.requests.length, 0, 'invalid local expectations cannot initiate a GET');
    assert.deepEqual(readFileSync(file), before);
  } finally { await server.stop(); rmSync(dir, { recursive: true, force: true }); }
});
