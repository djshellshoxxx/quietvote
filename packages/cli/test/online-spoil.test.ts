// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { bytesToHex, sha256, streamRng } from '@quietvote/crypto';
import { analyzeBallotLog, ballotCode, manifestHash, shareToHex, signRecord, trusteeDecryptSpoiled, PROTO_ID, type SignedRecord, type SpoilShareBody } from '@quietvote/protocol';
import { bundleOf, closeElection, setup, spoilBallot, trusteeKeyFor, type Sim } from '../../protocol/test/helpers/sim.ts';
import { World } from '../../server/test/helpers/world.ts';
import { qv, tmp, writeJson, type Res } from './helpers.ts';

const H = bytesToHex;
let dir: string, election: string, pin: string, id: string;
let sim: Sim;
let records: SignedRecord<SpoilShareBody>[];

before(async () => {
  dir = tmp();
  sim = await setup({ seed: 'cli-online-spoil', n: 3, t: 2, voters: 3, spoilTrustees: true });
  const spoil = spoilBallot(sim, 0, { budget: ['yes'], chair: ['ann'] }, 'trustees');
  const code = H(ballotCode(sim.params!.ctx, spoil.env.body));
  closeElection(sim);
  const an = analyzeBallotLog(sim.params!, new Set(sim.rollHex), sim.log.filter((e) => 'intent' in (e.entry as object)).map((e) => ({ seq: e.seq, raw: e.entry })), sim.openSeq!, sim.closeSeq!);
  const rec = an.spoiled.get(code)!;
  assert.ok(rec);
  records = [1, 2, 3].map((j) => {
    const out = trusteeDecryptSpoiled(sim.params!, trusteeKeyFor(sim, j), rec, streamRng(`online-spoil-${j}`));
    assert.ok(out.ok);
    const shares = [...out.value].map(([key, share]) => {
      const [contest, opt] = key.split('/') as [string, string];
      const { M, c, s } = shareToHex(j, share);
      return { contest, opt, M, c, s };
    });
    const key = sim.trusteeKeys[j - 1]!;
    return signRecord(key.secretKey, key.publicKey, sim.params!.ctx,
      { proto: PROTO_ID, type: 'spoil-share' as const, ctx: H(sim.params!.ctx), j, code, spoil_seq: rec.seq, shares });
  });
  election = writeJson(dir, 'election.json', bundleOf(sim));
  pin = H(manifestHash(sim.params!.manifest));
  id = sim.params!.manifest.election_id;
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

function postDir(values: readonly unknown[] = records): string {
  const path = mkdtempSync(join(dir, 'post-'));
  values.forEach((value, index) => writeJson(path, `${index + 1}.json`, value));
  return path;
}
const argv = (server: string, path: string, extra: string[] = []): string[] => [
  'online', 'election-spoil-post', '--server', server, '--id', id, '--post-dir', path,
  '--election', election, '--manifest-hash', pin, '--json', ...extra,
];
type Reply = { status: string; code: string; j: number };
type Report = { ok: boolean; acknowledged: number; total: number; verification: Record<string, unknown>;
  results: { status: string; code: string; j: number; body_sha256: string; http_status: number | null; error_code: string | null }[] };
const report = (result: Res): Report => JSON.parse(result.out) as Report;
async function body(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(Buffer.from(part as Uint8Array));
  return Buffer.concat(parts);
}
function accept(res: ServerResponse, record: SignedRecord<SpoilShareBody>, duplicate = false): void {
  const reply: Reply = { status: duplicate ? 'duplicate' : 'accepted', code: record.body.code, j: record.body.j };
  res.writeHead(duplicate ? 200 : 201, { 'content-type': 'application/json' });
  res.end(JSON.stringify(reply));
}
async function http(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, work: (origin: string) => Promise<void>): Promise<void> {
  const server = createServer((req, res) => { void handler(req, res).catch((error: unknown) => { res.destroy(error instanceof Error ? error : undefined); }); });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await work(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); }); }
}

test('spoil-post retains exact bytes and accepts only matching 201/200 acknowledgments', async () => {
  const path = postDir();
  const unusual = Buffer.from(` \r\n${JSON.stringify({ sig: records[0]!.sig, body: records[0]!.body }, null, 2)}\t\n`);
  writeFileSync(join(path, '1.json'), unusual);
  const originals = readdirSync(path).sort().map((name) => readFileSync(join(path, name)));
  const sent: Buffer[] = [];
  await http(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, `/api/v1/elections/${id}/spoil-shares`);
    assert.equal(req.headers['content-type'], 'application/json');
    assert.equal(req.headers['authorization'], undefined);
    assert.equal(req.headers['qv-read-key'], undefined);
    sent.push(await body(req));
    accept(res, records[sent.length - 1]!, sent.length === 2);
  }, async (origin) => {
    const result = await qv(argv(origin, path));
    assert.equal(result.code, 0, result.err);
    const info = report(result);
    assert.equal(info.acknowledged, 3);
    assert.deepEqual(info.results.map((r) => r.status), ['accepted', 'duplicate', 'accepted']);
    assert.equal(info.verification['scope'], 'manifest-context-and-signatures');
    assert.equal(info.verification['share_proofs_verified'], false);
    assert.equal(info.verification['server_admission_verified'], false);
    assert.equal(info.verification['tally_inclusion_verified'], false);
    assert.deepEqual(info.results.map((r) => r.body_sha256), originals.map((bytes) => H(sha256(bytes))));
  });
  assert.deepEqual(sent, originals);
  assert.deepEqual(readdirSync(path).sort().map((name) => readFileSync(join(path, name))), originals);
});

test('all input bodies and the pinned context are validated before any request', async () => {
  let requests = 0;
  await http(async (req, res) => { requests++; await body(req); res.end('{}'); }, async (origin) => {
    const badSignature = structuredClone(records[1]!);
    badSignature.sig.sig = '00'.repeat(64);
    const wrongContext = structuredClone(records[1]!);
    wrongContext.body.ctx = '11'.repeat(32);
    const wrongSigner = signRecord(sim.trusteeKeys[0]!.secretKey, sim.trusteeKeys[0]!.publicKey, sim.params!.ctx, records[1]!.body);
    for (const bad of [null, {}, { ...records[1], extra: 'no' }, badSignature, wrongContext, wrongSigner, records[0]]) {
      const result = await qv(argv(origin, postDir([records[0], bad])));
      assert.ok(result.code === 4 || result.code === 1, result.err);
      assert.equal(requests, 0);
    }
    for (const bytes of [Buffer.from('{"body":{},"body":{}}'), Buffer.from([0xff]), Buffer.alloc(1_048_577, 32)]) {
      const path = postDir([records[0]]);
      writeFileSync(join(path, '2.json'), bytes);
      assert.equal((await qv(argv(origin, path))).code, 4);
      assert.equal(requests, 0);
    }
    const path = postDir();
    for (const [flag, value] of [['--manifest-hash', '00'.repeat(32)], ['--id', '00'.repeat(16)]]) {
      const input = argv(origin, path);
      input[input.indexOf(flag!) + 1] = value!;
      assert.equal((await qv(input)).code, 1);
      assert.equal(requests, 0);
    }
  });
});

test('spoil-post rejects empty, excessive, unexpected and nonregular directory inputs', async () => {
  let requests = 0;
  await http(async (req, res) => { requests++; await body(req); res.end('{}'); }, async (origin) => {
    const empty = postDir([]);
    assert.equal((await qv(argv(origin, empty))).code, 4);
    const nested = postDir([records[0]]);
    mkdirSync(join(nested, '2.json'));
    assert.equal((await qv(argv(origin, nested))).code, 4);
    const extra = postDir([records[0]]);
    writeFileSync(join(extra, 'unrelated.txt'), 'must not be sent');
    assert.equal((await qv(argv(origin, extra))).code, 4);
    const many = postDir([]);
    for (let i = 0; i < 1025; i++) writeFileSync(join(many, `${i}.json`), '{}');
    assert.equal((await qv(argv(origin, many))).code, 4);
    if (process.platform !== 'win32') {
      const linked = postDir([records[0]]);
      symlinkSync(join(linked, '1.json'), join(linked, '2.json'));
      assert.equal((await qv(argv(origin, linked))).code, 4);
      const directoryLink = join(dir, 'directory-link');
      symlinkSync(postDir(), directoryLink);
      assert.equal((await qv(argv(origin, directoryLink))).code, 4);
      const fifo = postDir([records[0]]);
      execFileSync('mkfifo', [join(fifo, '2.json')]);
      assert.equal((await qv(argv(origin, fifo))).code, 4);
    }
    assert.equal(requests, 0);
  });
});

test('aggregate input bytes are bounded even when every individual signed body fits', async () => {
  const path = postDir([]), key = sim.trusteeKeys[0]!;
  for (let i = 0; i < 65; i++) {
    const record = signRecord(key.secretKey, key.publicKey, sim.params!.ctx, { ...records[0]!.body, code: i.toString(16).padStart(64, '0') });
    const bytes = Buffer.alloc(1_048_576, 32);
    bytes.write(JSON.stringify(record));
    writeFileSync(join(path, `${i.toString().padStart(2, '0')}.json`), bytes);
  }
  try {
    const result = await qv(argv('http://127.0.0.1:1', path));
    assert.equal(result.code, 4, result.err);
    assert.match(result.err, /64 MiB total limit/);
  } finally { rmSync(path, { recursive: true, force: true }); }
});

test('spoil-post requires the pin, bundle and safe transport options', async () => {
  const path = postDir();
  for (const flag of ['--manifest-hash', '--election']) {
    const input = argv('http://127.0.0.1:1', path), index = input.indexOf(flag);
    input.splice(index, 2);
    assert.equal((await qv(input)).code, 2);
  }
  for (const origin of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/path']) {
    assert.equal((await qv(argv(origin, path))).code, 2);
  }
  assert.equal((await qv(argv('http://127.0.0.1:1', path, ['--timeout-ms', '0']))).code, 2);
  assert.equal((await qv(argv('http://127.0.0.1:1', path, ['--read-key-file', 'unneeded-secret']))).code, 2);
});

test('explicit rejection retains prior acknowledgments and stops; server text is not echoed', async () => {
  let requests = 0;
  const path = postDir(), originals = readdirSync(path).sort().map((name) => readFileSync(join(path, name)));
  await http(async (req, res) => {
    await body(req);
    if (++requests === 1) accept(res, records[0]!);
    else { res.writeHead(422); res.end(JSON.stringify({ code: 'INVALID', message: '\u001b[2JRESPONSE_SECRET_CANARY' })); }
  }, async (origin) => {
    const result = await qv(argv(origin, path));
    assert.equal(result.code, 1);
    assert.equal(report(result).acknowledged, 1);
    assert.deepEqual(report(result).results.map((r) => r.status), ['accepted', 'rejected', 'not_attempted']);
    assert.match(result.err, /HTTP 422 INVALID/);
    assert.doesNotMatch(result.out + result.err, /RESPONSE_SECRET_CANARY|\u001b/);
  });
  assert.equal(requests, 2);
  assert.deepEqual(readdirSync(path).sort().map((name) => readFileSync(join(path, name))), originals);
});

test('uncertain HTTP outcomes are never retried or followed by later posts', async () => {
  for (const mode of ['drop', 'timeout', '500', 'redirect', 'oversized', 'malformed', 'wrong-code', 'wrong-index', 'wrong-status', '202', 'invalid-utf8']) {
    let requests = 0;
    await http(async (req, res) => {
      await body(req);
      if (++requests === 1) { accept(res, records[0]!); return; }
      if (mode === 'drop') { req.socket.destroy(); return; }
      if (mode === 'timeout') return;
      if (mode === 'redirect') { res.writeHead(307, { location: '/redirect-target' }); res.end(); return; }
      if (mode === '500') { res.writeHead(500); res.end('{"code":"FAILED","message":"SERVER_CANARY"}'); return; }
      if (mode === 'oversized') { res.writeHead(201); res.end(' '.repeat(65_537)); return; }
      if (mode === 'malformed') { res.writeHead(201); res.end('SERVER_CANARY'); return; }
      if (mode === 'invalid-utf8') { res.writeHead(201); res.end(Buffer.from([0xff])); return; }
      res.writeHead(mode === '202' ? 202 : 201);
      res.end(JSON.stringify({ status: mode === 'wrong-status' ? 'duplicate' : 'accepted',
        code: mode === 'wrong-code' ? '00'.repeat(32) : records[1]!.body.code, j: mode === 'wrong-index' ? 3 : 2 }));
    }, async (origin) => {
      const result = await qv(argv(origin, postDir(), ['--timeout-ms', '1000']));
      assert.equal(result.code, 1, mode);
      assert.deepEqual(report(result).results.map((r) => r.status), ['accepted', 'unknown', 'not_attempted'], mode);
      assert.match(result.err, /outcome unknown/, mode);
      assert.doesNotMatch(result.out + result.err, /SERVER_CANARY/);
    });
    assert.equal(requests, 2, `no retry or redirect: ${mode}`);
  }
});

test('human output never prints untrusted filenames or server error strings', async () => {
  const path = postDir([]);
  // Bidi controls are valid filenames on Windows too; C0 controls are not.
  writeJson(path, '\u202eFILE_CANARY.json', records[0]);
  await http(async (req, res) => { await body(req); res.writeHead(400); res.end('{"code":"BAD\\u001b[2JSERVER_CANARY"}'); }, async (origin) => {
    const result = await qv(argv(origin, path).filter((part) => part !== '--json'));
    assert.equal(result.code, 1);
    assert.match(result.err, /HTTP 400 HTTP_ERROR/);
    assert.doesNotMatch(result.out + result.err, /FILE_CANARY|SERVER_CANARY|\u001b|\u202e/);
  });
});

test('bundle parser and verification errors retain their exit classes without echoing paths or content', async () => {
  let requests = 0;
  await http(async (req, res) => { requests++; await body(req); res.end('{}'); }, async (origin) => {
    const path = postDir(), hostile = join(dir, '\u202eBUNDLE_PATH_CANARY.json');
    writeFileSync(hostile, 'BUNDLE_CONTENT_CANARY');
    const input = argv(origin, path).filter((part) => part !== '--json');
    input[input.indexOf('--election') + 1] = hostile;
    const malformed = await qv(input);
    assert.equal(malformed.code, 4);
    assert.match(malformed.err, /cannot read a valid bounded election bundle/);
    assert.doesNotMatch(malformed.out + malformed.err, /BUNDLE_PATH_CANARY|BUNDLE_CONTENT_CANARY|\u202e/);
    const bad = structuredClone(bundleOf(sim));
    bad.manifest_hash = '00'.repeat(32);
    bad.manifest.body.title = 'BUNDLE_CONTENT_CANARY';
    writeFileSync(hostile, JSON.stringify(bad));
    const unverified = await qv(input);
    assert.equal(unverified.code, 1);
    assert.match(unverified.err, /election manifest, DKG context or independent manifest hash did not verify/);
    assert.doesNotMatch(unverified.out + unverified.err, /BUNDLE_PATH_CANARY|BUNDLE_CONTENT_CANARY|\u202e/);
    assert.equal(requests, 0);
  });
});

test('later requests use the validated byte snapshot even if a file is replaced after the first POST', async () => {
  const path = postDir(), originals = readdirSync(path).sort().map((name) => readFileSync(join(path, name)));
  const sent: Buffer[] = [];
  await http(async (req, res) => {
    sent.push(await body(req));
    if (sent.length === 1) writeFileSync(join(path, '2.json'), 'AFTER_PREFLIGHT_CANARY');
    accept(res, records[sent.length - 1]!);
  }, async (origin) => {
    const result = await qv(argv(origin, path));
    assert.equal(result.code, 0, result.err);
    assert.deepEqual(report(result).results.map((r) => r.body_sha256), originals.map((bytes) => H(sha256(bytes))));
  });
  assert.deepEqual(sent, originals);
});

test('real link-election workflow collects, posts, replays and incorporates signed shares without a read key on POST', { timeout: 300_000 }, async () => {
  const w = new World({ seed: 'cli-spoil-post-real', n: 3, t: 2, voters: 5, spoilTrustees: true });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const created = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Private spoil relay', access: 'link' }, w.owner, w.idemKey());
    assert.equal(created.status, 201);
    w.electionId = created.json.election_id;
    w.origin = created.json.origin;
    w.logPkHex = created.json.log_pk_hex;
    const readKey = created.json.read_key as string;
    const get = w.get.bind(w);
    w.get = (path, headers) => get(path, { 'qv-read-key': readKey, ...headers });
    await w.registerVoters();
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    await w.open();
    for (let i = 0; i < 4; i++) assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    assert.equal((await w.spoil(4, { budget: ['no'], chair: ['bob'] }, 'trustees')).status, 201);
    assert.equal((await w.close()).status, 201);
    const code = [...(await w.analysis()).spoiled.keys()][0]!;
    const shares = await Promise.all([1, 2].map((j) => w.spoilShareRecord(j, code)));
    const packet = writeJson(w.dir, 'spoil-packet.json', { format: 'qv-ceremony-packet/v1', round: 'spoil-share', records: shares });
    const exported = await w.get(`/api/v1/elections/${w.electionId}/export.json`);
    assert.equal(exported.status, 200);
    const bundle = join(w.dir, 'election.json');
    writeFileSync(bundle, exported.text);
    const output = join(w.dir, 'post');
    const collected = await qv(['election', 'spoil-collect', '--election', bundle, '--manifest-hash', H(w.mh), '--code', code, '--packet', packet, '--post-body-out', output, '--json']);
    assert.equal(collected.code, 0, collected.err);
    const originals = readdirSync(output).sort().map((name) => readFileSync(join(output, name)));
    const input = ['online', 'election-spoil-post', '--server', w.base, '--id', w.electionId, '--post-dir', output,
      '--election', bundle, '--manifest-hash', H(w.mh), '--json'];
    const posted = await qv(input);
    assert.equal(posted.code, 0, posted.err);
    assert.deepEqual(report(posted).results.map((r) => r.status), ['accepted', 'accepted']);
    const replay = await qv(input);
    assert.equal(replay.code, 0, replay.err);
    assert.deepEqual(report(replay).results.map((r) => r.status), ['duplicate', 'duplicate']);
    assert.equal((await get(`/api/v1/elections/${w.electionId}/spoil-shares`)).status, 403, 'GET still needs the link read key');
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/spoil-shares?code=${code}`)).json.items.length, 2);
    for (const j of [1, 2]) assert.equal((await w.trusteeShares(j)).status, 201);
    const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,2`);
    assert.equal(draft.status, 200, draft.text);
    assert.deepEqual(draft.json.body.spoiled[0].selections, { budget: ['no'], chair: ['bob'] });
    const coordinator = w.coord[0]!;
    assert.equal((await w.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, draft.json.body))).status, 201);
    const closed = await qv(input);
    assert.equal(closed.code, 1);
    assert.deepEqual(report(closed).results.map((r) => r.status), ['rejected', 'not_attempted']);
    assert.match(closed.err, /HTTP 409 WRONG_PHASE/);
    assert.deepEqual(readdirSync(output).sort().map((name) => readFileSync(join(output, name))), originals);
    assert.doesNotMatch(posted.out + replay.out + closed.out, new RegExp(readKey));
  } finally { await w.stop(); }
});
