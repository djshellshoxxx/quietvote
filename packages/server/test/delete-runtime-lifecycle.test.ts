// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-009, QV-28-REQ-013
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { manifestHash } from '@quietvote/protocol';
import { ApiError } from '../src/problem.ts';
import type { ElectionRuntime } from '../src/election.ts';
import { World } from './helpers/world.ts';

async function world(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 2, witnessQuorum: 0 });
  await w.start();
  await w.setupOrgAndElection();
  return w;
}

async function queued(rt: ElectionRuntime, count: number): Promise<void> {
  // Only promise scheduling is involved: no clock or timeout makes the race probable.
  for (let i = 0; i < 100 && rt.mutex.pending < count; i++) await Promise.resolve();
  assert.equal(rt.mutex.pending, count, 'expected operations are queued behind the barrier');
}

function assertNoSigning(rt: ElectionRuntime, headerBytes: Uint8Array, body: Uint8Array): void {
  for (const result of [rt.log.append(headerBytes, body), rt.log.getReceipt(0), rt.log.checkpoint()]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'QV_BOARD_READ_ONLY');
  }
}

test('a manifest writer queued after deletion cannot return a receipt for erased storage', async () => {
  const w = await world('delete-runtime-queued-append');
  try {
    w.manifest = w.buildManifest();
    w.mh = manifestHash(w.manifest);
    const packet = w.entry('manifest', w.owner, w.multi(w.mh, w.manifest));
    const rt = (await w.server.pool.get(w.electionId))!;
    const path = join(w.dir, w.server.env.control.election(w.electionId)!.db_path);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const blocker = rt.mutex.run(() => barrier);
    try {
      const deletion = w.server.pool.remove(w.electionId);
      await queued(rt, 2);
      const append = rt.append(packet.headerBytes, packet.body);
      const results = Promise.allSettled([deletion, append]);
      await queued(rt, 3);
      release();
      await blocker;
      const [removed, written] = await results;
      assert.equal(removed.status, 'fulfilled');
      assert.equal(written.status, 'rejected', 'the later writer must not issue a signed receipt');
      if (written.status === 'rejected') {
        assert.ok(written.reason instanceof ApiError);
        assert.equal(written.reason.code, 'LOG_UNAVAILABLE');
      }
      assert.equal(w.server.env.control.runtimeAnchor(w.electionId)!.tree_size, 0);
      assert.equal(w.server.env.control.election(w.electionId), undefined);
      assert.equal(existsSync(path), false);
      assertNoSigning(rt, packet.headerBytes, packet.body);
    } finally { release(); }
  } finally { await w.stop(); }
});

test('a durable deletion tombstone immediately blocks cached acquisition and direct duplicate signing', async () => {
  const w = await world('delete-runtime-tombstone');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const entry = rt.edb.store.getEntry(0)!;
    assert.equal(rt.log.getReceipt(0).ok, true);
    w.server.env.control.markDeleted(w.electionId);
    assertNoSigning(rt, entry.headerBytes, entry.body!);
    assert.equal(await w.server.pool.get(w.electionId), undefined);
    assert.throws(() => rt.outcomeFor(0, true), (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND');
  } finally { await w.stop(); }
});

test('eviction retires only the old handle and a normal reopen can still issue receipts', async () => {
  const w = await world('delete-runtime-eviction');
  try {
    await w.publishManifest();
    const rt = (await w.server.pool.get(w.electionId))!;
    const entry = rt.edb.store.getEntry(0)!;
    await w.server.pool.evict(w.electionId);
    assertNoSigning(rt, entry.headerBytes, entry.body!);
    assert.doesNotThrow(() => rt.close(), 'retiring the same handle twice is harmless');
    assert.throws(() => rt.outcomeFor(0, true), (e: unknown) => e instanceof ApiError && e.code === 'LOG_UNAVAILABLE');
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.notEqual(reopened, rt);
    assert.equal(reopened.quarantineReason(), undefined);
    assert.equal(reopened.log.getReceipt(0).ok, true);
    assert.equal((await reopened.append(entry.headerBytes, entry.body!)).duplicate, true);
  } finally { await w.stop(); }
});
