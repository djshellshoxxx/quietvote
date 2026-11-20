// @verifies QV-09-REQ-014, QV-09-REQ-015, QV-28-REQ-010
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { writeTar } from '@quietvote/board';
import { bytesToHex, sha256, streamRng, utf8 } from '@quietvote/crypto';
import { logOrigin } from '@quietvote/protocol';
import { FLOOR_PARAMS, wrapSeed } from '../src/keyfile.ts';
import { run } from '../src/main.ts';
import { fullElection, waitJob } from '../../server/test/helpers/full.ts';
import { BIN, qv, tmp, voterKeyFile, writePrivateJson } from './helpers.ts';

test('recorded export CLI creates once, inspects jobs, retains exact bytes and separates download, notice and acknowledgement', { timeout: 120_000 }, async () => {
  const w = await fullElection('cli-recorded-export');
  w.clock = Date.now();
  try {
    const key = writePrivateJson(w.dir, 'export-owner.key', { format: 'qv-voter-key/v1',
      public_key: bytesToHex(w.owner.publicKey), seed: bytesToHex(w.owner.secretKey) });
    const auth = ['--server', w.base, '--audience', w.audience, '--key', key, '--json'];
    const common = [...auth, '--id', w.electionId];
    const cli = (command: string, rest: string[] = []) => qv(['online', command, ...common, ...rest], { rng: w.rng });
    const created = await cli('export-create', ['--idempotency-key', 'recorded-export-create']);
    assert.equal(created.code, 0, created.err);
    const jobId = JSON.parse(created.out).job_id;
    const replay = await cli('export-create', ['--idempotency-key', 'recorded-export-create']);
    assert.equal(replay.code, 0, replay.err);
    assert.equal(JSON.parse(replay.out).job_id, jobId);
    const done = await waitJob(w, jobId);
    assert.equal(done.state, 'done', JSON.stringify(done));
    const status = await qv(['online', 'job-inspect', ...auth, '--job-id', jobId], { rng: w.rng });
    assert.equal(status.code, 0, status.err);
    assert.equal(JSON.parse(status.out).state, 'done');
    const exportId = done.result.export_id as string;
    const id = ['--export-id', exportId];
    const listed = await cli('export-list');
    assert.equal(listed.code, 0, listed.err);
    assert.equal(JSON.parse(listed.out).items.length, 1);
    const inspected = await cli('export-inspect', id);
    assert.equal(inspected.code, 0, inspected.err);
    const record = JSON.parse(inspected.out);
    assert.equal(record.acknowledged_at, null);
    const out = join(w.dir, 'retained-export.qvb');
    // Exercise the installed bin dispatch and process exit status, while the actual server remains live.
    const executable = await new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, 'online', 'export-download', ...common, ...id, '--out', out], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', (b: Buffer) => { stdout += b.toString(); });
      child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, out: stdout, err: stderr }));
    });
    assert.equal(executable.code, 0, executable.err);
    assert.equal(JSON.parse(executable.out).artifact_matches_record, true);
    assert.equal(JSON.parse(executable.out).verified, false);
    assert.equal(JSON.parse(executable.out).acknowledged, false);
    const saved = readFileSync(out);
    assert.equal(bytesToHex(sha256(saved)), record.sha256);
    assert.equal(saved.length, record.byte_length);
    assert.equal((await cli('export-download', [...id, '--out', out])).code, 4);
    assert.deepEqual(readFileSync(out), saved);
    assert.equal(JSON.parse((await cli('export-inspect', id)).out).acknowledged_at, null);
    const notice = [...id, '--tree-size', String(record.tree_size), '--root-hash', record.root_hash,
      '--sha256', record.sha256, '--idempotency-key', 'recorded-export-notice'];
    const notified = await cli('export-deletion-notice', notice);
    assert.equal(notified.code, 0, notified.err);
    assert.equal(JSON.parse(notified.out).acknowledged_at, null);
    assert.equal(Date.parse(JSON.parse(notified.out).deletion_eligible_at) - Date.parse(JSON.parse(notified.out).deletion_notice_at), 30 * 86400000);
    const acknowledgement = [...id, '--file', out, '--idempotency-key', 'recorded-export-acknowledge'];
    assert.equal((await cli('export-acknowledge', acknowledgement)).code, 2, 'retention must be explicit');
    writeFileSync(out, Buffer.from('damaged retained file'));
    const damaged = await cli('export-acknowledge', [...acknowledgement, '--retained']);
    assert.equal(damaged.code, 1, damaged.err);
    assert.equal(JSON.parse((await cli('export-inspect', id)).out).acknowledged_at, null);
    writeFileSync(out, saved);
    const ack = await cli('export-acknowledge', [...acknowledgement, '--retained']);
    assert.equal(ack.code, 0, ack.err);
    assert.equal(typeof JSON.parse(ack.out).acknowledged_at, 'string');
    const repeated = await cli('export-acknowledge', [...acknowledgement, '--retained']);
    assert.equal(repeated.code, 0, repeated.err);
    assert.equal(JSON.parse(repeated.out).acknowledged_at, JSON.parse(ack.out).acknowledged_at);
    assert.equal((await w.server.pool.get(w.electionId))!.logState, 'ARCHIVED', 'no CLI export command deletes the election');
  } finally { await w.stop(); }
});

function fixture() {
  const dir = tmp(), election = '12'.repeat(16), exportId = 'a'.repeat(26);
  const root = 'ab'.repeat(32);
  const meta = { format: 'qv-bundle/v1', origin: logOrigin({ election_id: election }), tree_size: 2, root_b64: Buffer.from(root, 'hex').toString('base64') };
  const archive = (changes: Record<string, unknown> = {}): Uint8Array => {
    const data = Buffer.from(JSON.stringify({ ...meta, ...changes }));
    return writeTar([{ name: 'bundle.json', data }, { name: 'SHA256SUMS', data: Buffer.from(`${bytesToHex(sha256(data))}  bundle.json\n`) }]);
  };
  const bytes = archive();
  const record = { export_id: exportId, kind: 'public', tree_size: 2, root_hash: root,
    byte_length: bytes.length, sha256: bytesToHex(sha256(bytes)), acknowledged_at: null, deletion_notice_at: null,
    download_url: 'https://untrusted.example/download' };
  const common = ['--server', 'https://board.example', '--id', election, '--export-id', exportId,
    '--audience', 'qv:test@https://board.example', '--key', voterKeyFile(dir, 0), '--json'];
  const path = `https://board.example/api/v1/elections/${election}/exports/${exportId}`;
  return { dir, election, bytes, archive, record, common, path };
}

test('recorded downloads refuse mismatched metadata, corrupt bytes and cross-election archives; metadata links never select the request URL', async (t) => {
  const f = fixture();
  try {
    let metadata: unknown = f.record, downloaded = f.bytes;
    const calls: { url: string; method: string }[] = [];
    t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), method: init.method! });
      assert.equal(init.redirect, 'error');
      assert.match((init.headers as Record<string, string>)['authorization']!, /^QV-Sig /);
      if (String(url) === f.path) return new Response(JSON.stringify(metadata));
      assert.equal(String(url), `${f.path}/download`);
      return new Response(Buffer.from(downloaded));
    });
    const out = (name: string) => join(f.dir, `${name}.qvb`);
    const invoke = (name: string) => qv(['online', 'export-download', ...f.common, '--out', out(name)]);
    const good = await invoke('good');
    assert.equal(good.code, 0, good.err);
    assert.ok(calls.every((c) => c.method === 'GET' && c.url.startsWith(f.path)));
    for (const [name, changes] of [
      ['other-record', { export_id: 'b'.repeat(26) }], ['bad-size', { tree_size: 1.5 }],
      ['big', { byte_length: 64 * 1024 * 1024 + 1 }], ['bad-hash', { root_hash: 'AB'.repeat(32) }],
    ] as const) {
      metadata = { ...f.record, ...changes };
      const before = calls.length, refused = await invoke(name);
      assert.equal(refused.code, 1, refused.err);
      assert.equal(calls.length, before + 1, 'invalid metadata stops before download');
      assert.equal(existsSync(out(name)), false);
    }
    metadata = f.record;
    downloaded = Uint8Array.from(f.bytes, (v, i) => i === 512 ? v ^ 1 : v);
    assert.equal((await invoke('corrupt')).code, 1);
    assert.equal(existsSync(out('corrupt')), false);
    for (const [name, change] of [['election', { origin: logOrigin({ election_id: '34'.repeat(16) }) }], ['tree', { tree_size: 3 }]] as const) {
      downloaded = f.archive(change);
      metadata = { ...f.record, byte_length: downloaded.length, sha256: bytesToHex(sha256(downloaded)) };
      const refused = await invoke(name);
      assert.equal(refused.code, 1, refused.err);
      assert.equal(existsSync(out(name)), false);
    }
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('acknowledgement rechecks retained bytes after key unlock, and ambiguous mutations are never retried', async (t) => {
  const f = fixture(), file = join(f.dir, 'retained.qvb');
  writeFileSync(file, f.bytes);
  try {
    let posts = 0;
    t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
      if (init.method === 'GET') {
        assert.equal(String(url), f.path);
        writeFileSync(file, 'changed while metadata was being obtained');
        return new Response(JSON.stringify(f.record));
      }
      posts++;
      throw new Error('connection interrupted');
    });
    const argv = ['online', 'export-acknowledge', ...f.common, '--file', file, '--retained', '--idempotency-key', 'acknowledgement-0001'];
    const refused = await qv(argv);
    assert.equal(refused.code, 1, refused.err);
    assert.equal(posts, 0, 'changed retained data never reaches the mutation');
    t.mock.restoreAll();
    writeFileSync(file, f.bytes);
    t.mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
      if (init.method === 'GET') return new Response(JSON.stringify(f.record));
      posts++;
      throw new Error('connection interrupted');
    });
    const unknown = await qv(argv);
    assert.equal(unknown.code, 1, unknown.err);
    assert.match(unknown.err, /outcome unknown/);
    assert.equal(posts, 1);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('recorded management rejects malformed IDs, bindings and missing confirmation before network activity', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('invalid input must not contact a server'); });
  const common = ['--server', 'https://board.example', '--id', '12'.repeat(16)];
  for (const argv of [
    ['export-create', ...common], ['job-inspect', '--server', 'https://board.example', '--job-id', '../escape'],
    ['export-inspect', ...common, '--export-id', '../escape'],
    ['export-acknowledge', ...common, '--export-id', 'a'.repeat(26), '--file', 'absent.qvb', '--idempotency-key', 'acknowledge-0001'],
    ['export-deletion-notice', ...common, '--export-id', 'a'.repeat(26), '--tree-size', '1e3', '--root-hash', 'ab'.repeat(32), '--sha256', 'cd'.repeat(32), '--idempotency-key', 'notice-00001'],
  ]) {
    const result = await qv(['online', ...argv]);
    assert.equal(result.code, 2, result.err);
  }
});

for (const command of ['export-download', 'export-acknowledge'] as const) {
  test(`protected ${command} reads its stdin passphrase once across both signed requests`, async (t) => {
    const f = fixture(), file = join(f.dir, 'retained.qvb');
    const passphrase = 'correct horse battery staple';
    try {
      const plain = JSON.parse(readFileSync(f.common[f.common.indexOf('--key') + 1]!, 'utf8')) as { seed: string };
      const key = writePrivateJson(f.dir, 'protected.key', await wrapSeed(Buffer.from(plain.seed, 'hex'), passphrase,
        streamRng(`protected-${command}`), FLOOR_PARAMS));
      const common = f.common.map((value, index) => f.common[index - 1] === '--key' ? key : value);
      const calls: { url: string; method: string }[] = [];
      t.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
        calls.push({ url: String(url), method: init.method! });
        assert.match((init.headers as Record<string, string>)['authorization']!, /^QV-Sig /);
        if (String(url) === f.path) return new Response(JSON.stringify(f.record));
        if (command === 'export-download') {
          assert.equal(String(url), `${f.path}/download`);
          return new Response(Buffer.from(f.bytes));
        }
        assert.equal(String(url), `${f.path}/acknowledge`);
        assert.equal(init.method, 'POST');
        return new Response(JSON.stringify({ ...f.record, acknowledged_at: '2026-11-20T02:00:00Z' }));
      });
      const extra = command === 'export-download' ? ['--out', file] : ['--file', file, '--retained', '--idempotency-key', 'protected-acknowledgement'];
      if (command === 'export-acknowledge') writeFileSync(file, f.bytes);
      let reads = 0, output = '', error = '';
      const code = await run(['online', command, ...common, ...extra, '--passphrase-stdin'], {
        out: (text) => { output += text; }, err: (text) => { error += text; }, rng: streamRng(`request-${command}`),
        stdin: async () => utf8(++reads === 1 ? passphrase : ''), prompt: async () => undefined,
      });
      assert.equal(code, 0, error);
      assert.equal(reads, 1, 'one stdin stream cannot supply a second passphrase');
      assert.equal(calls.length, 2);
      assert.deepEqual(readFileSync(file), Buffer.from(f.bytes));
      if (command === 'export-download') assert.equal(JSON.parse(output).acknowledged, false);
      else assert.equal(JSON.parse(output).acknowledged_at, '2026-11-20T02:00:00Z');
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });
}
