// SPDX-License-Identifier: AGPL-3.0-or-later
// Shipped coordinator/voter processes; World supplies only operator enrollment, held registration and trustee operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, type Ed25519Keypair } from '@quietvote/crypto';
import { manifestHash } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { BIN } from './helpers.ts';

const exec = promisify(execFile);
test('shipped coordinator and voter executables generate, relay and verify a three-voter HTTP election', { timeout: 600_000 }, async (t) => {
  const w = new World({ seed: 'coordinator-voter-executables', n: 3, t: 2, voters: 3 });
  w.clock = Date.now();
  const passphrase = 'G8!synthetic-packet-Q7$falcon';
  const passFile = join(w.dir, 'passphrase.txt');
  writeFileSync(passFile, passphrase + '\n', { mode: 0o600 });
  let serial = 0;
  const path = (suffix: string) => join(w.dir, `${serial++}-${suffix}`);
  const json = (name: string, value: unknown) => { const p = path(name); writeFileSync(p, JSON.stringify(value)); return p; };
  const cli = async (args: string[]): Promise<Record<string, any>> => {
    const { stdout, stderr } = await exec(process.execPath, [BIN, ...args, '--json'], {
      encoding: 'utf8', timeout: 90_000, maxBuffer: 4 * 1024 * 1024, signal: t.signal,
    });
    assert.equal((stdout + stderr).includes(passphrase), false);
    for (const key of [w.owner, ...w.coord, ...w.voters]) assert.equal((stdout + stderr).includes(bytesToHex(key.secretKey)), false, 'seed not printed');
    return JSON.parse(stdout);
  };
  const keys = new Map<string, string>();
  const provision = async (key: Ed25519Keypair) => {
    const seed = path('seed'); writeFileSync(seed, key.secretKey, { mode: 0o600 });
    const out = path('key');
    const result = await cli(['keygen', '--seed-file', seed, '--passphrase-file', passFile, '--out', out]);
    assert.equal(result['public_key'], bytesToHex(key.publicKey));
    assert.equal(result['protected'], true);
    keys.set(bytesToHex(key.publicKey), out);
  };
  const keyArgs = (key: Ed25519Keypair) => ['--key', keys.get(bytesToHex(key.publicKey))!, '--passphrase-file', passFile];
  const online = (command: string, args: string[]) => cli(['online', command, '--server', w.base, '--id', w.electionId, ...args]);
  const download = async () => { const out = path('election.json'); await online('election-export', ['--format', 'json', '--out', out]); return out; };
  await w.start();
  try {
    for (const key of [w.owner, ...w.coord.slice(0, 2), ...w.voters]) await provision(key);
    await w.setupOrgAndElection();
    await w.registerVoters(); // B3-01: fixture follows current raw-token contract; no client registration claim.
    w.manifest = w.buildManifest();
    const ts = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    w.manifest.voting_open = ts(w.clock + 3_600_000);
    w.manifest.voting_close = ts(w.clock + 7_200_000);
    w.mh = manifestHash(w.manifest);
    const mf = json('manifest.json', w.manifest);
    const sign = async (body: any, election?: string) => {
      const first = path('record.json');
      const common = ['election', 'sign-record', '--manifest', mf, '--manifest-hash', bytesToHex(w.mh), ...(election ? ['--election', election] : [])];
      const r = await cli([...common, '--body', json('body.json', body), ...keyArgs(w.coord[0]!), '--out', first]);
      if (body.type === 'tally') { assert.equal(r['quorum'], true); return first; }
      assert.equal(r['quorum'], false, 'first coordinator cannot form the required 2-of-3 quorum');
      const out = path('record.json');
      assert.equal((await cli([...common, '--record', first, ...keyArgs(w.coord[1]!), '--out', out]))['quorum'], true);
      return out;
    };
    const relay = async (type: string, record: string, author: Ed25519Keypair) => {
      const out = path('packet.json');
      await cli(['election', 'export-entry', '--origin', w.origin, '--type', type, '--file', record, ...keyArgs(author), '--out', out]);
      return online('election-submit', ['--file', out]);
    };
    // The manifest outer author remains the distinct organizer; quorum signatures are coordinator signatures.
    await relay('manifest', await sign(w.manifest), w.owner); w.tick();
    const nativePost = w.post.bind(w);
    w.post = async (type, who, rec, election, origin) => {
      if (w.coord.some((k) => bytesToHex(k.publicKey) === bytesToHex(who.publicKey))) {
        const body = (rec as { body: any }).body;
        const context = body.type === 'marker' && ['election-open', 'election-close'].includes(body.name);
        await relay(type, await sign(body, context ? await download() : undefined), who);
        return { status: 201, json: {}, text: '', headers: new Headers() };
      }
      return nativePost(type, who, rec, election, origin);
    };
    await w.ceremony(); // Coordinator markers and roll commitment go through shipped sign/export/relay; trustee math is fixture-owned.
    w.clock = Date.parse(w.manifest.voting_open) + 1000;
    await relay('election_open', await sign(w.openMarker(await w.openBinding()).body, await download()), w.coord[0]!);
    const voting = await download();
    const codes: string[] = [];
    for (const i of [0, 1, 2]) {
      const envelope = path('ballot.json');
      const encrypted = await cli(['ballot', 'encrypt', '--election', voting, '--manifest-hash', bytesToHex(w.mh), ...keyArgs(w.voters[i]!),
        '--select', `budget=${i === 2 ? 'no' : 'yes'}`, '--select', 'chair=ann', '--out', envelope]);
      codes.push(encrypted['ballot_code']);
      await relay('ballot', envelope, w.voters[i]!); w.tick();
    }
    await w.close();
    for (const j of [1, 2]) assert.equal((await w.trusteeShares(j)).status, 201);
    const draft = path('tally-body.json');
    assert.equal((await online('election-tally-draft', ['--decrypters', '1,2', '--out', draft]))['verified'], false);
    await relay('tally_result', await sign(JSON.parse(readFileSync(draft, 'utf8')), await download()), w.coord[0]!);
    const report = await cli(['verify', await download(), '--manifest-hash', bytesToHex(w.mh), '--content-only']);
    assert.equal(report['verdict'], 'PASS');
    assert.equal(report['counts'].cast, 3); assert.equal(report['counts'].counted, 3);
    assert.equal(new Set(codes).size, 3);
    assert.equal(w.manifest.coordinator.keys.includes(bytesToHex(w.owner.publicKey)), false, 'separate organizer policy retained');
    assert.ok(readFileSync(mf).length > 0);
  } finally { await w.stop(); }
});
