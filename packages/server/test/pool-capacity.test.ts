import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { ElectionRuntime } from '../src/election.ts';
import { ApiError } from '../src/problem.ts';
import { SseClient } from './helpers/sse.ts';
import { World } from './helpers/world.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function anotherElection(w: World): Promise<string> {
  const response = await w.signed('POST', `/api/v1/orgs/${w.orgId}/elections`, { title: 'Another election' }, w.owner, w.idemKey());
  assert.equal(response.status, 201, response.text);
  return response.json.election_id as string;
}

test('a full SSE-pinned pool refuses admission without returning a closed runtime, then recovers', async () => {
  const w = new World({ seed: 'pool-capacity-sse', n: 3, t: 2, voters: 1, server: { maxOpenElections: 1 } });
  await w.start();
  let stream: SseClient | undefined;
  try {
    await w.setupOrgAndElection();
    const other = await anotherElection(w);
    stream = await SseClient.open(w.base, `/api/v1/elections/${w.electionId}/events`);
    assert.equal(stream.status, 200);
    const pinned = (await w.server.pool.get(w.electionId))!;
    assert.equal(pinned.inUse, 1);

    const refused = await w.get(`/api/v1/elections/${other}/state`);
    assert.equal(refused.status, 503, refused.text);
    assert.equal(refused.json.code, 'BUSY');
    assert.ok(Number(refused.headers.get('retry-after')) > 0);
    assert.equal(w.server.pool.openCount(), 1);
    assert.equal(pinned.poisoned, false);
    assert.equal(w.server.sse.stats.active, 1, 'capacity pressure must not evict an active stream');

    w.server.sse.closeAll();
    assert.equal(pinned.inUse, 0);
    const recovered = await w.get(`/api/v1/elections/${other}/state`);
    assert.equal(recovered.status, 200, recovered.text);
    assert.equal(w.server.pool.openCount(), 1);
    assert.equal(pinned.poisoned, true, 'the now-idle least-recently-used runtime can be evicted');
    assert.equal((await w.server.pool.get(other))!.poisoned, false);
  } finally { stream?.close(); await w.stop(); }
});

test('in-flight runtime loading reserves capacity while same-election callers share that load', async (t) => {
  const w = new World({ seed: 'pool-capacity-opening', n: 3, t: 2, voters: 1, server: { maxOpenElections: 1 } });
  await w.start();
  const entered = deferred(), resume = deferred();
  const pending: Promise<unknown>[] = [];
  try {
    await w.setupOrgAndElection();
    const other = await anotherElection(w);
    const original = ElectionRuntime.open;
    let loads = 0;
    t.mock.method(ElectionRuntime, 'open', async (...args: Parameters<typeof ElectionRuntime.open>) => {
      loads++;
      entered.resolve();
      await resume.promise;
      return original(...args);
    });
    const first = w.server.pool.get(w.electionId);
    pending.push(first);
    await entered.promise;
    const same = w.server.pool.get(w.electionId);
    const over = w.server.pool.get(other).then(
      (runtime) => ({ runtime, error: undefined }),
      (error: unknown) => ({ runtime: undefined, error }),
    );
    pending.push(same, over);
    await tick();
    assert.equal(loads, 1, 'a different election must not open beyond the reserved capacity');
    resume.resolve();
    const [a, b, refused] = await Promise.all([first, same, over]);
    assert.equal(a, b);
    assert.equal(a!.poisoned, false);
    assert.ok(refused.error instanceof ApiError);
    assert.equal(refused.error.code, 'BUSY');
    assert.equal(w.server.pool.openCount(), 1);
  } finally {
    resume.resolve();
    await Promise.allSettled(pending);
    await w.stop();
  }
});

test('reacquisition waits for the old runtime writer to drain before opening its replacement', async (t) => {
  const w = new World({ seed: 'pool-capacity-evicting', n: 3, t: 2, voters: 1, server: { maxOpenElections: 1 } });
  await w.start();
  const entered = deferred(), resume = deferred();
  const pending: Promise<unknown>[] = [];
  try {
    await w.setupOrgAndElection();
    const old = (await w.server.pool.get(w.electionId))!;
    const held = old.mutex.run(async () => { entered.resolve(); await resume.promise; });
    pending.push(held);
    await entered.promise;
    const original = ElectionRuntime.open;
    let loads = 0;
    t.mock.method(ElectionRuntime, 'open', async (...args: Parameters<typeof ElectionRuntime.open>) => {
      loads++;
      return original(...args);
    });
    const eviction = w.server.pool.evict(w.electionId);
    const replacement = w.server.pool.get(w.electionId);
    pending.push(eviction, replacement);
    await tick();
    assert.equal(loads, 0, 'one election cannot have independently sequenced live writer runtimes');
    assert.equal(old.poisoned, false, 'the admitted writer still owns its original handle');
    resume.resolve();
    const [, next] = await Promise.all([eviction, replacement]);
    assert.notEqual(next, old);
    assert.equal(old.poisoned, true);
    assert.equal(next!.poisoned, false);
    assert.equal(loads, 1);
    assert.equal(w.server.pool.openCount(), 1);
  } finally {
    resume.resolve();
    await Promise.allSettled(pending);
    await w.stop();
  }
});
