// SPDX-License-Identifier: AGPL-3.0-or-later
// One real-process election. Fixtures supply public manifest choices and organization
// bootstrap; invitation issuance and voter enrollment use shipped CLI commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { authorKeyId, b64u } from '@quietvote/board';
import { bytesToHex, hexToBytes, type Ed25519Keypair } from '@quietvote/crypto';
import { expectedLogId, manifestHash } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';

const exec = promisify(execFile);
const qvBin = fileURLToPath(new URL('../bin/qv.ts', import.meta.url));
const trusteeBin = fileURLToPath(new URL('../../trustee/src/cli.ts', import.meta.url));
const serverBin = fileURLToPath(new URL('../../server/bin/qv-server.ts', import.meta.url));
const pythonBin = fileURLToPath(new URL('../../../verifier-py/qv_verifier', import.meta.url));

test('all shipped executables complete one real-clock election with exact totals and independent verification', { timeout: 1_200_000 }, async (t) => {
  const w = new World({ seed: 'all-client-executables', n: 3, t: 2, voters: 3 });
  // This overlap is required by the existing trustee archive-author rule; no separate-organizer claim.
  w.owner = w.coord[0]!;
  const passphrase = 'T4!synthetic-C8$combined-R6#client';
  const passFile = join(w.dir, 'passphrase.txt');
  writeFileSync(passFile, passphrase + '\n', { mode: 0o600 });
  let serial = 0;
  const path = (suffix: string) => join(w.dir, `${serial++}-${suffix}`);
  const json = (name: string, value: unknown) => { const p = path(name); writeFileSync(p, JSON.stringify(value)); return p; };
  const config = json('server.json', {
    dataDir: join(w.dir, 'server-data'), publicUrl: 'http://localhost', host: '127.0.0.1', port: 0,
    registrationMode: 'open', minFreeBytes: 0, auditWindowSec: 0,
    keepAliveTimeoutMs: 30_000,
    rate: Object.fromEntries(['read', 'proof', 'writeKey', 'writePre', 'auth', 'manage', 'export', 'gossip', 'inviteFail']
      .map((key) => [key, { limit: 100000, windowSec: 60 }])),
  });
  const server = spawn(process.execPath, [serverBin, '--config', config], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const serverStdout = server.stdout;
  assert.ok(serverStdout && server.stderr);
  const exited = once(server, 'exit');
  let serverStderr = '';
  server.stderr.setEncoding('utf8').on('data', (chunk: string) => { serverStderr += chunk; });
  t.after(() => { server.kill('SIGKILL'); });
  const run = async (bin: string, args: string[], expected = 0): Promise<Record<string, any>> => {
    let stdout = '', stderr = '', code = 0;
    try {
      ({ stdout, stderr } = await exec(process.execPath, [bin, ...args, '--json'], {
        encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024, signal: t.signal,
      }));
    } catch (error) {
      const e = error as { code?: number; stdout?: string; stderr?: string };
      code = typeof e.code === 'number' ? e.code : -1;
      stdout = e.stdout ?? ''; stderr = e.stderr ?? '';
    }
    assert.equal((stdout + stderr).includes(passphrase), false, 'no passphrase in command output');
    for (const key of [...w.coord, ...w.voters]) assert.equal((stdout + stderr).includes(bytesToHex(key.secretKey)), false, 'no fixture seed in command output');
    assert.equal(code, expected, `${args.slice(0, 2).join(' ')}: ${stderr}`);
    return JSON.parse(expected === 0 || expected === 3 ? stdout : stderr);
  };
  const cli = (args: string[], expected = 0) => run(qvBin, args, expected);
  const online = (command: string, args: string[] = [], expected = 0) => cli(['online', command, '--server', w.base,
    ...(command === 'instance' || command === 'election-create' ? [] : ['--id', w.electionId]), ...args], expected);
  const trustee = (i: number, command: string, args: string[] = [], expected = 0) => run(trusteeBin,
    [command, '--bundle', join(w.dir, `trustee-${i}.qvtb`), '--passphrase-file', passFile, ...args], expected);
  const keys = new Map<string, string>();
  const keyArgs = (key: Ed25519Keypair) => ['--key', keys.get(bytesToHex(key.publicKey))!, '--passphrase-file', passFile];
  const download = async (format = 'json') => {
    const out = path(`election.${format}`);
    await online('election-export', ['--format', format, '--out', out]);
    return out;
  };
  // Fixture-only organization bootstrap uses current wall-clock request timestamps.
  const fixtureRequest = w.req.bind(w);
  w.req = (...args) => { w.clock = Date.now(); return fixtureRequest(...args); };
  try {
    const address = await new Promise<{ host: string; port: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server readiness timed out')), 30_000);
      let output = '';
      serverStdout.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
        const line = output.split('\n').find((s) => s.startsWith('{'));
        if (line) {
          clearTimeout(timer);
          try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
        }
      });
      server.once('error', (e) => { clearTimeout(timer); reject(e); });
      server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${serverStderr}`)); });
    });
    w.base = `http://${address.host}:${address.port}`;
    assert.equal((await fetch(`${w.base}/readyz`)).status, 200);
    w.audience = `qv:${(await online('instance'))['instance_id']}@http://localhost`;
    for (const key of [...w.coord.slice(0, 2), ...w.voters]) {
      const seed = path('seed'); writeFileSync(seed, key.secretKey, { mode: 0o600 });
      const out = path('key.qvkey');
      const generated = await cli(['keygen', '--seed-file', seed, '--passphrase-file', passFile, '--out', out]);
      assert.equal(generated['protected'], true);
      assert.equal(generated['public_key'], bytesToHex(key.publicKey));
      keys.set(bytesToHex(key.publicKey), out);
    }
    for (const i of [1, 2, 3]) {
      const identity = await trustee(i, 'keygen');
      w.trustees[i - 1] = { publicKey: hexToBytes(identity['sign_pk'], 32), secretKey: new Uint8Array() };
    }
    const org = await w.req('POST', '/api/v1/orgs', { name: 'Combined-client fixture', owner_key: { pk: b64u(w.owner.publicKey), alg: 'ed25519' } },
      { key: w.owner, headers: w.idemKey() });
    assert.equal(org.status, 201, org.text);
    w.orgId = org.json.org_id;
    const created = await online('election-create', ['--org', w.orgId, '--title', 'Combined-client election', '--access', 'public',
      '--audience', w.audience, '--idempotency-key', 'combined-client-create', ...keyArgs(w.owner)]);
    w.electionId = created['election_id']; w.origin = created['origin']; w.logPkHex = created['log_pk_hex'];
    const invitations = path('issued-invitations.json');
    const issuance = await online('invites-create', ['--count', String(w.voters.length), '--out', invitations,
      '--audience', w.audience, '--idempotency-key', 'combined-client-invites', ...keyArgs(w.owner)]);
    assert.equal(issuance['count'], w.voters.length);
    const issued = JSON.parse(readFileSync(invitations, 'utf8')).invites as { invite_id: string; code: string }[];
    for (const [i, voter] of w.voters.entries()) {
      const tokenFile = path('invite.txt'); writeFileSync(tokenFile, issued[i]!.code + '\n', { mode: 0o600 });
      assert.equal(JSON.stringify(issuance).includes(issued[i]!.code), false, 'issuer stdout contains no bearer');
      const enrolled = await online('enroll', ['--invite-file', tokenFile, ...keyArgs(voter)]);
      assert.equal(enrolled['status'], 'approved');
      assert.equal(enrolled['voter_kid'], b64u(authorKeyId('ed25519', voter.publicKey)));
    }
    w.manifest = w.buildManifest();
    const ts = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const started = Date.now();
    w.manifest.created = ts(started - 86_400_000);
    w.manifest.voting_open = ts(started - 60_000);
    // The executable intentionally has no test clock. Wait for the actual deadline; never weaken close admission.
    w.manifest.voting_close = ts(started + 600_000);
    w.manifest.bb.log_id = expectedLogId(w.origin);
    w.mh = manifestHash(w.manifest);
    const pin = bytesToHex(w.mh);
    const manifest = json('manifest.json', w.manifest);
    const sign = async (body: string, context = false, single = false) => {
      const common = ['election', 'sign-record', '--manifest', manifest, '--manifest-hash', pin,
        ...(context ? ['--election', await download()] : [])];
      const first = path('signed.json');
      assert.equal((await cli([...common, '--body', body, ...keyArgs(w.coord[0]!), '--out', first]))['quorum'], single);
      if (single) return first;
      const out = path('signed.json');
      assert.equal((await cli([...common, '--record', first, ...keyArgs(w.coord[1]!), '--out', out]))['quorum'], true);
      return out;
    };
    const relay = async (type: string, record: string, author = w.coord[0]!) => {
      const out = path('entry.json');
      await cli(['election', 'export-entry', '--origin', w.origin, '--type', type, '--file', record, ...keyArgs(author), '--out', out]);
      return online('election-submit', ['--file', out]);
    };
    await relay('manifest', await sign(manifest), w.owner);
    // Trustees join the signed public manifest from the server, never a private test-harness ceremony object.
    const signedManifest = json('signed-manifest.json', JSON.parse(readFileSync(await download(), 'utf8')).manifest);
    for (const i of [1, 2, 3]) await trustee(i, 'join', ['--manifest', signedManifest, '--manifest-hash', pin]);
    const sync = async () => {
      const log = path('ceremony.qvl');
      await cli(['election', 'prepare', await download('qvb'), '--manifest-hash', pin, '--format', 'ceremony', '--out', log]);
      for (const i of [1, 2, 3]) await trustee(i, 'import', ['--log', log]);
    };
    const marker = async (kind: string, type = 'notice', options: { context?: boolean; sync?: boolean } = {}) => {
      const body = path('draft.json');
      await cli(['election', 'draft-record', await download('qvb'), '--manifest-hash', pin, '--kind', kind, '--out', body]);
      await relay(type, await sign(body, options.context));
      if (options.sync !== false) await sync();
    };
    const submitTrustee = async (i: number, round: string) => {
      const out = path('trustee-entry.json');
      await trustee(i, 'export-entry', ['--round', round, '--out', out]);
      await online('election-submit', ['--file', out]);
    };
    await marker('dkg-open', 'ceremony_start');
    for (const i of [1, 2, 3]) { await trustee(i, 'commit'); await submitTrustee(i, 'r1-commit'); }
    await marker('dkg-r1-open');
    for (const i of [1, 2, 3]) { await trustee(i, 'reveal'); await submitTrustee(i, 'r1-dealing'); }
    await marker('dkg-r1-close');
    for (const i of [1, 2, 3]) { await trustee(i, 'shares'); await submitTrustee(i, 'r2-shares'); }
    await marker('dkg-r2-close');
    for (const i of [1, 2, 3]) assert.deepEqual((await trustee(i, 'verify'))['complaints'], []);
    await marker('dkg-r3-close');
    const words: string[] = [];
    for (const i of [1, 2, 3]) {
      const finalized = await trustee(i, 'finalize');
      assert.deepEqual(finalized['qualified'], [1, 2, 3]);
      words.push(finalized['check_words']);
    }
    assert.equal(new Set(words).size, 1);
    for (const i of [1, 2, 3]) {
      await trustee(i, 'confirm', ['--compared-with', String(i === 1 ? 2 : 1), '--words', words[0]!]);
      await submitTrustee(i, 'r4-keyconf');
    }
    await marker('dkg-final', 'joint_key', { sync: false });
    await marker('roll-commit', 'roll_commit', { sync: false });
    await marker('election-open', 'election_open', { context: true });
    const voting = await download();
    const codes: string[] = [];
    for (const i of [0, 1, 2]) {
      const ballot = path('ballot.json');
      const encrypted = await cli(['ballot', 'encrypt', '--election', voting, '--manifest-hash', pin, ...keyArgs(w.voters[i]!),
        '--select', `budget=${i === 2 ? 'no' : 'yes'}`, '--select', 'chair=ann', '--out', ballot]);
      codes.push(encrypted['ballot_code']);
      await relay('ballot', ballot, w.voters[i]!);
    }
    assert.equal(new Set(codes).size, 3);
    t.diagnostic('all trustee and voter processes finished; waiting for the real voting-close deadline');
    while (Date.now() < Date.parse(w.manifest.voting_close)) {
      await delay(Math.min(10_000, Date.parse(w.manifest.voting_close) - Date.now()), undefined, { signal: t.signal });
    }
    await marker('election-close', 'election_close', { context: true });
    const release = path('release.json');
    await cli(['election', 'prepare', await download('qvb'), '--manifest-hash', pin, '--out', release]);
    for (const i of [1, 2]) {
      await trustee(i, 'tally-release', ['--election', release]);
      await submitTrustee(i, 'tally-share');
      assert.equal((await trustee(i, 'status'))['state'], 'RELEASED');
    }
    assert.equal((await trustee(3, 'status'))['state'], 'STANDBY');
    assert.equal(w.tkeys.size, 0, 'the fixture never generated or held trustee decryption shares');
    const tallyBody = path('tally.json');
    assert.equal((await online('election-tally-draft', ['--decrypters', '1,2', '--out', tallyBody]))['verified'], false);
    const totals: Record<string, number> = { yes: 2, no: 1, ann: 3, bob: 0, cy: 0 };
    for (const contest of JSON.parse(readFileSync(tallyBody, 'utf8')).contests) for (const option of contest.options) {
      assert.equal(option.T, totals[option.id], `${contest.id}/${option.id}`);
    }
    await relay('tally_result', await sign(tallyBody, true, true));
    const final = await download();
    assert.equal((await cli(['verify', final, '--manifest-hash', pin], 3))['verdict'], 'INCOMPLETE');
    // This export is content-only; the independent corpus comparison is scoped explicitly.
    const report = await cli(['verify', final, '--manifest-hash', pin, '--content-only']);
    assert.equal(report['verdict'], 'PASS');
    assert.deepEqual([report['counts'].cast, report['counts'].spoiled, report['counts'].counted], [3, 0, 3]);
    const vectorDir = join(w.dir, 'python-vector'); mkdirSync(vectorDir);
    writeFileSync(join(vectorDir, 'bundle.json'), readFileSync(final));
    writeFileSync(join(vectorDir, 'expected-report.json'), JSON.stringify({ verdict: report['verdict'], checks: report['chk'],
      counts: { cast: 3, spoiled: 0, counted: 3 }, ctx_prefix: report['ctxPrefix'], results: report['results'] }));
    const pyReport = path('python-report.json');
    await exec(process.env.QV_PYTHON ?? 'python3', ['-I', pythonBin, 'vectors', vectorDir, '--report', pyReport], { timeout: 90_000, signal: t.signal });
    assert.deepEqual(JSON.parse(readFileSync(pyReport, 'utf8')).results, { total: 1, passed: 1, failed: 0, not_implemented: 0 });
    server.send('qv-server:shutdown');
    const [code, signal] = await exited;
    assert.equal(code, 0, serverStderr); assert.equal(signal, null);
    assert.equal(existsSync(join(w.dir, 'server-data', '.qv-server.lock')), false, 'cleanup releases ownership before exit');
    assert.equal(serverStderr.includes(passphrase), false);
  } finally {
    server.kill('SIGKILL');
    await exited;
    rmSync(w.dir, { recursive: true, force: true });
  }
});
