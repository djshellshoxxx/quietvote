import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { b64u } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { signRecord } from '@quietvote/protocol';
import { T_VOTING, World } from '../../server/test/helpers/world.ts';
import { qv, tmp, writeJson } from './helpers.ts';

const keyFile = (w: World): string => writeJson(w.dir, 'owner.key', {
  format: 'qv-voter-key/v1', public_key: bytesToHex(w.owner.publicKey), seed: bytesToHex(w.owner.secretKey),
});

test('online commands create, inspect and edit a draft through the real signed HTTP API', async () => {
  const w = new World({ seed: 'cli-online-create', n: 3, t: 2, voters: 3 });
  w.clock = Date.now();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const cli = (argv: string[]) => qv(argv, { rng: w.rng });
    const common = ['--server', w.base, '--json'];
    const auth = ['--key', keyFile(w), '--audience', w.audience];
    const instance = await cli(['online', 'instance', ...common]);
    assert.equal(instance.code, 0, instance.err);
    assert.equal(JSON.parse(instance.out).registration_mode, 'open');
    const create = await cli(['online', 'election-create', ...common, ...auth, '--org', w.orgId, '--title', 'CLI election', '--access', 'public', '--idempotency-key', 'create-election-1']);
    assert.equal(create.code, 0, create.err);
    const id = JSON.parse(create.out).election_id;
    const replay = await cli(['online', 'election-create', ...common, ...auth, '--org', w.orgId, '--title', 'CLI election', '--access', 'public', '--idempotency-key', 'create-election-1']);
    assert.equal(replay.code, 0, replay.err);
    assert.equal(JSON.parse(replay.out).election_id, id);
    const inspect = await cli(['online', 'election-inspect', ...common, '--id', id]);
    assert.equal(inspect.code, 0, inspect.err);
    assert.equal(JSON.parse(inspect.out).title, 'CLI election');
    const draft = writeJson(w.dir, 'draft.json', { title: 'Draft from CLI' });
    const edit = await cli(['online', 'election-draft', ...common, ...auth, '--id', id, '--file', draft]);
    assert.equal(edit.code, 0, edit.err);
    assert.deepEqual(JSON.parse(edit.out).draft, { title: 'Draft from CLI' });
    const wrong = await cli(['online', 'election-draft', ...common, ...auth.filter((_, i) => i < 2), '--audience', 'qv:wrong@http://localhost', '--id', id, '--file', draft]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.err, /BAD_SIGNATURE/);
    const unknown = await cli(['online', 'instance', ...common, '--typo']);
    assert.equal(unknown.code, 2);
  } finally { await w.stop(); }
});

test('online signed-entry relay opens/closes an election and exports without overwriting', { timeout: 120000 }, async () => {
  const w = new World({ seed: 'cli-online-relay', n: 3, t: 2, voters: 3 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    await w.registerVoters();
    assert.equal((await w.publishManifest()).status, 201);
    await w.ceremony();
    const common = ['--server', w.base, '--id', w.electionId, '--json'];
    const relay = async (type: 'election_open' | 'election_close' | 'tally_result', record: unknown) => {
      const e = w.entry(type, w.coord[0]!, record);
      const packet = writeJson(w.dir, `${type}.json`, { header: b64u(e.headerBytes), body: b64u(e.body) });
      return qv(['online', 'election-submit', ...common, '--file', packet]);
    };
    w.clock = T_VOTING;
    const opening = w.marker('election-open', w.params.ctx, await w.openBinding());
    const opened = await relay('election_open', opening);
    assert.equal(opened.code, 0, opened.err);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'OPEN');
    for (let i = 0; i < 3; i++) {
      assert.equal((await w.cast(i, { budget: ['yes'], chair: ['ann'] })).status, 201);
    }
    // An early close is rejected by the real election state machine.
    const early = await relay('election_close', w.marker('election-close', w.params.ctx));
    assert.equal(early.code, 1);
    w.clock = Date.parse(w.manifest.voting_close) + 1000;
    const close = await relay('election_close', w.marker('election-close', w.params.ctx));
    assert.equal(close.code, 0, close.err);
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'TALLYING');
    for (const j of [1, 2]) {
      assert.equal((await w.trusteeShares(j)).status, 201);
      w.tick();
    }
    const tally = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,2`);
    assert.equal(tally.status, 200, tally.text);
    const coordinator = w.coord[0]!;
    const result = await relay('tally_result', signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, tally.json.body));
    assert.equal(result.code, 0, result.err);
    const out = join(w.dir, 'export.json');
    const exported = await qv(['online', 'election-export', ...common, '--format', 'json', '--out', out]);
    assert.equal(exported.code, 0, exported.err);
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).manifest.body.election_id, w.electionId);
    const verified = await qv(['verify', out, '--manifest-hash', bytesToHex(w.mh), '--json']);
    assert.equal(verified.code, 0, verified.err);
    const report = JSON.parse(verified.out);
    assert.equal(report.counts.cast, 3);
    assert.equal(report.counts.counted, 3);
    // Use the Python implementation's real supported CLI (vector runner). Every shared report field is
    // compared, not merely its exit code. The JSON export has no board evidence, so those checks are not_run.
    const vectorDir = join(w.dir, 'live-election-vector');
    mkdirSync(vectorDir);
    copyFileSync(out, join(vectorDir, 'bundle.json'));
    writeJson(vectorDir, 'expected-report.json', {
      verdict: report.verdict, checks: report.chk,
      counts: { cast: report.counts.cast, spoiled: report.counts.spoiled, counted: report.counts.counted },
      ctx_prefix: report.ctxPrefix, results: report.results,
    });
    const pyReport = join(w.dir, 'python-report.json');
    const python = spawnSync(process.env.QV_PYTHON ?? 'python3', ['-I',
      fileURLToPath(new URL('../../../verifier-py/qv_verifier', import.meta.url)),
      'vectors', vectorDir, '--report', pyReport], { encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 });
    assert.equal(python.status, 0, python.stderr + python.stdout + String(python.error ?? ''));
    assert.deepEqual(JSON.parse(readFileSync(pyReport, 'utf8')).results,
      { total: 1, passed: 1, failed: 0, not_implemented: 0 });
    if (process.platform !== 'win32') assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.equal((await qv(['online', 'election-export', ...common, '--format', 'json', '--out', out])).code, 4);
  } finally { await w.stop(); }
});

test('online validates server URLs, identifiers and options before network use', async () => {
  for (const server of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'file:///etc/passwd']) {
    const r = await qv(['online', 'instance', '--server', server]);
    assert.equal(r.code, 2, r.err);
  }
  assert.equal((await qv(['online', 'election-inspect', '--server', 'http://127.0.0.1', '--id', '../x'])).code, 2);
});

test('online rejects malformed and oversized entry input before contacting a server', async () => {
  const w = new World({ seed: 'cli-online-bounds', n: 3, t: 2, voters: 3 });
  try {
    const malformed = writeJson(w.dir, 'bad-entry.json', { header: 'AAAA', body: '', extra: 'not allowed' });
    const common = ['--server', 'http://127.0.0.1:1', '--id', 'a'.repeat(32)];
    const rejected = await qv(['online', 'election-submit', ...common, '--file', malformed]);
    assert.equal(rejected.code, 4);
    assert.match(rejected.err, /only base64url header and body/);
    const oversized = writeJson(w.dir, 'large-entry.json', { header: 'AAAA', body: 'A'.repeat(1153434) });
    const tooLarge = await qv(['online', 'election-submit', ...common, '--file', oversized]);
    assert.equal(tooLarge.code, 4);
    assert.match(tooLarge.err, /size limit/);
  } finally {
    rmSync(w.dir, { recursive: true, force: true });
  }
});

test('online transport never retries ambiguous mutations or follows redirects', async () => {
  const dir = tmp();
  const packet = writeJson(dir, 'packet.json', { header: 'AAAA', body: '' });
  try {
    for (const mode of ['drop', 'server-error', 'malformed-success', 'redirect'] as const) {
      let requests = 0;
      const server = createServer((req, res) => {
        requests++;
        req.resume();
        if (mode === 'drop') { req.socket.destroy(); return; }
        if (mode === 'server-error') { res.writeHead(500); res.end('{"code":"INTERNAL_ERROR"}'); return; }
        if (mode === 'malformed-success') { res.writeHead(201); res.end('{'); return; }
        res.writeHead(307, { location: '/redirect-target' }); res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const result = await qv(['online', 'election-submit', '--server', `http://127.0.0.1:${address.port}`,
          '--id', 'a'.repeat(32), '--file', packet]);
        assert.equal(result.code, 1, mode);
        assert.match(result.err, /outcome unknown|may have been accepted/, mode);
        assert.equal(requests, 1, `no automatic retry or redirect (${mode})`);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
