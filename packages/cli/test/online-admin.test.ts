import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex } from '@quietvote/crypto';
import { World, kp } from '../../server/test/helpers/world.ts';
import { qv, writeJson } from './helpers.ts';

test('online admin-status uses signed admin authorization and exposes durable gossip counts', async () => {
  const admin = kp('cli-admin-status', 'admin');
  const w = new World({ seed: 'cli-admin-status', n: 3, t: 2, voters: 3, server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  w.clock = Date.now();
  await w.start();
  try {
    const key = (name: string, pair: typeof admin) => writeJson(w.dir, name, { format: 'qv-voter-key/v1',
      public_key: bytesToHex(pair.publicKey), seed: bytesToHex(pair.secretKey) });
    const invoke = (file: string, audience = w.audience) => qv(['online', 'admin-status', '--server', w.base,
      '--audience', audience, '--key', file, '--json']);
    const adminFile = key('admin.key', admin);
    const status = await invoke(adminFile);
    assert.equal(status.code, 0, status.err);
    const health = JSON.parse(status.out).gossip;
    assert.equal(health.configured_peers, 0);
    assert.equal(health.healthy_peers, 0);
    assert.equal((await invoke(key('stranger.key', w.owner))).code, 1);
    assert.equal((await invoke(adminFile, 'qv:wrong@http://localhost')).code, 1);
    assert.equal((await qv(['online', 'admin-status', '--server', w.base, '--audience', w.audience])).code, 2);
  } finally { await w.stop(); }
});
