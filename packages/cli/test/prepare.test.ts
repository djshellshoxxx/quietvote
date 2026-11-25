import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, symlinkSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex } from '@quietvote/crypto';
import { expectedLogId } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { dec, enc, entryLines, rewrite, setEntryLines } from '../../server/test/helpers/full.ts';
import { qv } from './helpers.ts';

test('prepare ships ceremony and release files with every public board body and refuses overwrites', async () => {
  const w = new World({ seed: 'cli-prepare', n: 3, t: 2, voters: 3 });
  w.owner = w.coord[0]!;
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    const build = w.buildManifest.bind(w);
    w.buildManifest = () => { const m = build(); m.bb.log_id = expectedLogId(w.origin); return m; };
    assert.equal((await w.publishManifest()).status, 201);
    const archive = join(w.dir, 'public.qvb');
    const downloaded = await fetch(`${w.base}/api/v1/elections/${w.electionId}/export.qvb`);
    assert.equal(downloaded.status, 200);
    writeFileSync(archive, new Uint8Array(await downloaded.arrayBuffer()));
    const invoke = (out: string, format: string, pin = bytesToHex(w.mh)) => qv([
      'election', 'prepare', archive, '--manifest-hash', pin, '--format', format, '--out', out, '--json',
    ]);
    const ceremony = join(w.dir, 'ceremony.qvl');
    const prepared = await invoke(ceremony, 'ceremony');
    assert.equal(prepared.code, 0, prepared.err);
    assert.equal(JSON.parse(readFileSync(ceremony, 'utf8')).format, 'qv-ceremony-log/v1');
    const release = join(w.dir, 'release.json');
    const result = await invoke(release, 'election');
    assert.equal(result.code, 0, result.err);
    const input = JSON.parse(readFileSync(release, 'utf8'));
    assert.equal(input.log.length, input.log_evidence.board.entries.length - 1);
    assert.equal(input.manifest_hash, bytesToHex(w.mh));
    assert.equal(JSON.parse(result.out).protocol_verified, false);
    assert.equal(JSON.parse(result.out).board_structure_verified, true);
    const before = readFileSync(release);
    assert.equal((await invoke(release, 'election')).code, 4);
    assert.deepEqual(readFileSync(release), before);
    const original = readFileSync(archive);
    const mutations: [string, (files: Map<string, Uint8Array>) => void][] = [
      ['origin', (files) => { const meta = JSON.parse(dec(files.get('bundle.json')!)); meta.origin = 'quietvote/v1/' + 'a'.repeat(26); files.set('bundle.json', enc(JSON.stringify(meta))); }],
      ['signature', (files) => { const lines = entryLines(files); const bytes = Buffer.from(lines[0].header_b64u, 'base64url'); bytes[bytes.length - 1] = bytes.at(-1)! ^ 1; lines[0].header_b64u = bytes.toString('base64url'); setEntryLines(files, lines); }],
      ['body', (files) => { const lines = entryLines(files); const manifest = JSON.parse(Buffer.from(lines[0].body_b64u, 'base64url').toString()); manifest.body.title = 'tampered'; lines[0].body_b64u = Buffer.from(JSON.stringify(manifest)).toString('base64url'); setEntryLines(files, lines); }],
      ['checkpoint', (files) => { for (const name of files.keys()) if (name.startsWith('log/checkpoints/')) files.delete(name); }],
      ['missing-manifest', (files) => { files.delete('election.json'); }],
      ['duplicate-json', (files) => { files.set('election.json', enc('{"manifest":{},"manifest":{}}')); }],
    ];
    for (const [name, mutate] of mutations) {
      writeFileSync(archive, rewrite(original, mutate));
      const out = join(w.dir, `forged-${name}.json`);
      const refused = await invoke(out, 'election');
      assert.ok(refused.code === 1 || refused.code === 4, `${name}: ${refused.err}`);
      assert.equal(existsSync(out), false, name);
    }
    writeFileSync(archive, original);
    const link = join(w.dir, 'linked.json');
    symlinkSync(release, link);
    assert.equal((await invoke(link, 'election')).code, 4);
    assert.deepEqual(readFileSync(release), before);
    const wrong = join(w.dir, 'wrong.json');
    assert.equal((await invoke(wrong, 'election', '00'.repeat(32))).code, 1);
    assert.equal(existsSync(wrong), false);
    const bytes = readFileSync(archive);
    bytes[512] = bytes[512]! ^ 1;
    writeFileSync(archive, bytes);
    const damaged = join(w.dir, 'damaged.json');
    assert.equal((await invoke(damaged, 'election')).code, 4);
    assert.equal(existsSync(damaged), false);
    truncateSync(archive, 64 * 1024 * 1024 + 1);
    assert.equal((await invoke(damaged, 'election')).code, 4);
    assert.equal(existsSync(damaged), false);
    assert.equal((await qv(['election', 'prepare', archive, '--out', damaged])).code, 2);
  } finally { await w.stop(); }
});

test('prepare preserves refusal of manifest envelopes authored by a separate organizer', async () => {
  const w = new World({ seed: 'cli-prepare-authority', n: 3, t: 2, voters: 3 });
  await w.start();
  try {
    await w.setupOrgAndElection(); await w.registerVoters();
    const build = w.buildManifest.bind(w);
    w.buildManifest = () => { const m = build(); m.bb.log_id = expectedLogId(w.origin); return m; };
    assert.equal((await w.publishManifest()).status, 201);
    const archive = join(w.dir, 'public.qvb');
    const response = await fetch(`${w.base}/api/v1/elections/${w.electionId}/export.qvb`);
    writeFileSync(archive, new Uint8Array(await response.arrayBuffer()));
    const output = join(w.dir, 'refused.json');
    const result = await qv(['election', 'prepare', archive, '--manifest-hash', bytesToHex(w.mh), '--out', output]);
    assert.equal(result.code, 1, result.err);
    assert.match(result.err, /E_LOG_BINDING/);
    assert.equal(existsSync(output), false);
  } finally { await w.stop(); }
});
