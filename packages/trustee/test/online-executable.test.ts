// SPDX-License-Identifier: AGPL-3.0-or-later
// Real qv-trustee processes with production RNG/KDF; the harness owns only coordinator/voter setup and the test clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { b64u, unb64u } from '@quietvote/board';
import { bytesToHex, hexToBytes, parseQvJson } from '@quietvote/crypto';
import { PROTO_ID, adjudicateDkg, expectedLogId, rollRoot, signRecord, type ElectionBundle, type MarkerSeqs } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { readTarStrict } from '../../server/src/tar.ts';
import { markerSeq, takeDkg } from '../src/ceremonylog.ts';

const exec = promisify(execFile);
const trusteeBin = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const qvBin = fileURLToPath(new URL('../../cli/bin/qv.ts', import.meta.url));

test('shipped trustee executable completes 2-of-3 DKG and tally over HTTP without exposing trustee keys', { timeout: 900_000 }, async (t) => {
  const w = new World({ seed: 'trustee-executable-http', n: 3, t: 2, voters: 3 });
  w.clock = Date.now();
  // Use an organizer who is also a manifest coordinator, as required by the existing trustee log-evidence verifier.
  w.owner = w.coord[0]!;
  const passphrase = 'H7!quartz-M2$falcon-P9#violet-X4'; // synthetic test secret, never an argv value
  const passFile = join(w.dir, 'passphrase.txt');
  writeFileSync(passFile, passphrase + '\n', { mode: 0o600 });
  const write = (name: string, value: unknown): string => {
    const path = join(w.dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  const run = async (bin: string, args: string[], expected = 0): Promise<Record<string, any>> => {
    let stdout = '', stderr = '', code = 0;
    try {
      ({ stdout, stderr } = await exec(process.execPath, [bin, ...args, '--json'], {
        encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024, signal: t.signal,
      }));
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      code = typeof e.code === 'number' ? e.code : -1;
      stdout = e.stdout ?? ''; stderr = e.stderr ?? '';
    }
    assert.equal((stdout + stderr).includes(passphrase), false, 'passphrase never appears in command output');
    assert.equal(code, expected, `${args[0]}: ${stderr}`);
    return JSON.parse(expected === 0 ? stdout : stderr);
  };
  const trustee = (i: number, command: string, args: string[] = [], expected = 0) => run(trusteeBin,
    [command, '--bundle', join(w.dir, `trustee-${i}.qvtb`), '--passphrase-file', passFile, ...args], expected);
  let serial = 0;
  const online = (command: string, args: string[] = []) => run(qvBin,
    ['online', command, '--server', w.base, '--id', w.electionId, ...args]);
  const download = async (format = 'json'): Promise<string> => {
    const path = join(w.dir, `download-${serial++}.${format}`);
    await online('election-export', ['--format', format, '--out', path]);
    return path;
  };
  const syncAll = async (): Promise<ElectionBundle> => {
    const bundle = JSON.parse(readFileSync(await download(), 'utf8')) as ElectionBundle;
    const path = write(`log-${serial++}.qvl`, { format: 'qv-ceremony-log/v1', manifest_hash: bundle.manifest_hash, entries: bundle.log });
    for (const i of [1, 2, 3]) await trustee(i, 'import', ['--log', path]);
    return bundle;
  };
  const submit = async (i: number, round: string): Promise<string> => {
    const out = join(w.dir, `entry-${serial++}.json`);
    await trustee(i, 'export-entry', ['--round', round, '--out', out]);
    await online('election-submit', ['--file', out]);
    w.tick();
    return out;
  };
  await w.start();
  try {
    for (const i of [1, 2, 3]) {
      const identity = await trustee(i, 'keygen');
      // The parent gets only the public identity. No Trustee.open, test KDF override or trustee secret extraction.
      w.trustees[i - 1] = { publicKey: hexToBytes(identity['sign_pk'], 32), secretKey: new Uint8Array() };
    }
    await w.setupOrgAndElection();
    await w.registerVoters(); // B3-01 remains a separate registration-contract hold.
    const buildManifest = w.buildManifest.bind(w);
    w.buildManifest = () => {
      const m = buildManifest();
      m.bb.log_id = expectedLogId(w.origin);
      const timestamp = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
      m.created = timestamp(w.clock - 86_400_000);
      m.voting_open = timestamp(w.clock + 3_600_000);
      m.voting_close = timestamp(w.clock + 7_200_000);
      return m;
    };
    const published = await w.publishManifest();
    assert.equal(published.status, 201, published.text);
    const initial = JSON.parse(readFileSync(await download(), 'utf8')) as ElectionBundle;
    const manifest = write('manifest.json', initial.manifest);
    for (const i of [1, 2, 3]) await trustee(i, 'join', ['--manifest', manifest, '--manifest-hash', bytesToHex(w.mh)]);
    const marker = async (name: string, type: 'ceremony_start' | 'notice' = 'notice') => {
      await w.ok(type, w.coord[0]!, w.marker(name, w.mh));
      return syncAll();
    };
    await marker('dkg-open', 'ceremony_start');
    for (const i of [1, 2, 3]) { await trustee(i, 'commit'); await submit(i, 'r1-commit'); }
    await marker('dkg-r1-open');
    for (const i of [1, 2, 3]) { await trustee(i, 'reveal'); await submit(i, 'r1-dealing'); }
    await marker('dkg-r1-close');
    for (const i of [1, 2, 3]) { await trustee(i, 'shares'); await submit(i, 'r2-shares'); }
    await marker('dkg-r2-close');
    for (const i of [1, 2, 3]) assert.deepEqual((await trustee(i, 'verify'))['complaints'], []);
    const publicBundle = await marker('dkg-r3-close');
    const fingerprints: string[] = [];
    for (const i of [1, 2, 3]) {
      const finalized = await trustee(i, 'finalize');
      assert.deepEqual(finalized['qualified'], [1, 2, 3]);
      fingerprints.push(finalized['check_words']);
    }
    assert.equal(new Set(fingerprints).size, 1, 'all three independent trustee processes derive the same fingerprint');
    for (const i of [1, 2, 3]) {
      await trustee(i, 'confirm', ['--compared-with', String(i === 1 ? 2 : 1), '--words', fingerprints[0]!]);
      await submit(i, 'r4-keyconf');
    }
    const markers: Partial<MarkerSeqs> = { 'dkg-final': Number.MAX_SAFE_INTEGER };
    for (const name of ['dkg-open', 'dkg-r1-open', 'dkg-r1-close', 'dkg-r2-close', 'dkg-r3-close'] as const) {
      markers[name] = markerSeq(publicBundle.log, name)!;
    }
    const adj = await adjudicateDkg({ mh: w.mh, n: 3, t: 2, markers: markers as MarkerSeqs, ...takeDkg(publicBundle.log) });
    assert.equal(adj.ok, true);
    w.params = { manifest: w.manifest, mh: w.mh, K: adj.value.K, ctx: adj.value.ctx };
    await w.ok('joint_key', w.coord[0]!, w.marker('dkg-final', w.mh, { qmask: adj.value.qmask, K: bytesToHex(adj.value.K.toBytes()) }));
    const root = rollRoot(w.rollHex);
    assert.equal(root.ok, true);
    await w.ok('roll_commit', w.coord[0]!, w.multi(w.mh, { proto: PROTO_ID, type: 'roll-commit', root: bytesToHex(root.value), size: 3 }));
    w.clock = Date.parse(w.manifest.voting_open) + 1000;
    assert.equal((await w.post('election_open', w.coord[0]!, w.openMarker(await w.openBinding()))).status, 201);
    await syncAll();
    for (const i of [0, 1, 2]) assert.equal((await w.cast(i, { budget: [i === 2 ? 'no' : 'yes'], chair: ['ann'] })).status, 201);
    assert.equal((await w.close()).status, 201);
    const closed = await syncAll();
    const missingEvidence = write('missing-evidence.json', closed);
    assert.equal((await trustee(1, 'tally-release', ['--election', missingEvidence], 60))['code'], 'LOG_EVIDENCE_REQUIRED');

    // Public-file preparation only: unpack the real downloaded archive into the trustee's existing JSON input format.
    // A shipped qvb-to-trustee-input command remains separate work; no server private state is read here.
    const files = readTarStrict(readFileSync(await download('qvb')), { maxFiles: 1000 });
    const text = (name: string): string => new TextDecoder().decode(files.get(name)!);
    const meta = JSON.parse(text('bundle.json'));
    const board = { format: meta.format, origin: meta.origin, created_at: meta.created_at,
      tree_size: meta.tree_size, root_b64: meta.root_b64, generator: meta.generator, spec: meta.spec,
      entries: text('log/entries.jsonl').trim().split('\n').map((line) => JSON.parse(line)),
      checkpoints: [...files.keys()].filter((name) => name.startsWith('log/checkpoints/')).map(text),
      receipts: [], policy: JSON.parse(text('witness/policy.json')), redactions: JSON.parse(text('redactions.json')) };
    // The content-only JSON export omits server aggregate entries. Evidence must bind every actual board entry.
    const fullLog = board.entries.slice(1).map((entry: { seq: number; body_b64u: string }) =>
      ({ seq: entry.seq, entry: parseQvJson(unb64u(entry.body_b64u)!) }));
    const releaseInput = write('release-input.json', { ...closed, log: fullLog,
      log_evidence: { board, extraAuthorKeys: [bytesToHex(unb64u(meta.server_pk_b64u)!)] } });
    for (const i of [1, 2]) {
      await trustee(i, 'tally-release', ['--election', releaseInput]);
      await submit(i, 'tally-share');
      assert.equal((await trustee(i, 'status'))['state'], 'RELEASED');
    }
    assert.equal((await trustee(3, 'status'))['state'], 'STANDBY', 'threshold succeeds without the third trustee releasing');
    assert.equal(w.tkeys.size, 0, 'the HTTP harness never generated or held trustee decryption shares');
    const tally = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,2`);
    assert.equal(tally.status, 200, tally.text);
    const expectedCounts: Record<string, number> = { yes: 2, no: 1, ann: 3, bob: 0, cy: 0 };
    for (const contest of tally.json.body.contests) for (const option of contest.options) {
      assert.equal(option.T, expectedCounts[option.id], `${contest.id}/${option.id}`);
    }
    const coordinator = w.coord[0]!;
    const result = w.entry('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, w.params.ctx, tally.json.body));
    await online('election-submit', ['--file', write('tally-entry.json', { header: b64u(result.headerBytes), body: b64u(result.body) })]);
    const final = await download();
    const report = await run(qvBin, ['verify', final, '--manifest-hash', bytesToHex(w.mh)]);
    assert.equal(report['verdict'], 'PASS');
    assert.equal(report['counts'].cast, 3);
    assert.equal(report['counts'].counted, 3);
    const vectorDir = join(w.dir, 'python-vector');
    mkdirSync(vectorDir);
    writeFileSync(join(vectorDir, 'bundle.json'), readFileSync(final));
    writeFileSync(join(vectorDir, 'expected-report.json'), JSON.stringify({ verdict: report['verdict'], checks: report['chk'],
      counts: { cast: report['counts'].cast, spoiled: report['counts'].spoiled, counted: report['counts'].counted },
      ctx_prefix: report['ctxPrefix'], results: report['results'] }));
    const pyReport = join(w.dir, 'python-report.json');
    await exec(process.env.QV_PYTHON ?? 'python3', ['-I', fileURLToPath(new URL('../../../verifier-py/qv_verifier', import.meta.url)),
      'vectors', vectorDir, '--report', pyReport], { timeout: 90_000, signal: t.signal });
    assert.deepEqual(JSON.parse(readFileSync(pyReport, 'utf8')).results, { total: 1, passed: 1, failed: 0, not_implemented: 0 });
  } finally { await w.stop(); }
});
