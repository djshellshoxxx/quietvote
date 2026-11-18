// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-011
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { backupWork } from '../src/admin.ts';
import { World } from './helpers/world.ts';

test('online backup hashes multi-chunk snapshots without whole-file reads', async (t) => {
  const w = new World({ seed: 'backup-streaming', n: 3, t: 2, voters: 2, witnessQuorum: 0 });
  const readFile = fs.readFileSync;
  try {
    await w.start(); await w.setupOrgAndElection();
    // Real SQLite pages spanning many I/O chunks; snapshotting remains the real producer path.
    w.server.env.control.db.exec('CREATE TABLE streaming_fixture (payload BLOB); INSERT INTO streaming_fixture VALUES (zeroblob(1048593))');
    t.mock.method(fs, 'readFileSync', ((path: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (String(path).endsWith('.sqlite')) throw new Error('whole SQLite snapshot read is forbidden');
      return Reflect.apply(readFile, fs, [path, ...args]);
    }) as typeof fs.readFileSync);
    syncBuiltinESMExports();
    const result = await backupWork(w.server.env, w.server.pool, 'streaming-ok', 'all', undefined, {
      jobId: 'streaming-ok', signal: new AbortController().signal, progress: () => {}, tick: async () => {},
    });
    const dir = join(w.dir, result.result_ref!);
    const manifest = JSON.parse(readFile(join(dir, 'manifest.json'), 'utf8')) as { files: { name: string; bytes: number; sha256: string }[] };
    assert.equal(manifest.files.length, 2);
    assert.ok(manifest.files.find((f) => f.name === 'control.sqlite')!.bytes > 1024 * 1024);
    for (const file of manifest.files) {
      const bytes = readFile(join(dir, file.name));
      assert.equal(bytes.length, file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await w.stop();
  }
});

test('a snapshot read failure closes its stream and removes the partial backup', async (t) => {
  const w = new World({ seed: 'backup-stream-failure', n: 3, t: 2, voters: 2, witnessQuorum: 0 });
  const createStream = fs.createReadStream;
  const failure = new Error('injected snapshot read failure');
  let stream: fs.ReadStream | undefined;
  try {
    await w.start(); await w.setupOrgAndElection();
    t.mock.method(fs, 'createReadStream', ((...args: Parameters<typeof fs.createReadStream>) => {
      stream = createStream(...args);
      stream.once('data', () => stream!.destroy(failure));
      return stream;
    }) as typeof fs.createReadStream);
    syncBuiltinESMExports();
    await assert.rejects(backupWork(w.server.env, w.server.pool, 'streaming-failed', 'all', undefined, {
      jobId: 'streaming-failed', signal: new AbortController().signal, progress: () => {}, tick: async () => {},
    }), (error) => error === failure);
    assert.ok(stream?.destroyed);
    assert.ok(stream?.closed, 'file descriptor is closed before the failed backup returns');
    assert.equal(fs.existsSync(join(w.dir, 'backups', 'streaming-failed')), false);
    assert.equal(w.server.env.control.meta('last_backup_at'), undefined);
    assert.ok(!w.server.env.control.auditRows().some((r) => r.action === 'backup.create'));
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    await w.stop();
  }
});
