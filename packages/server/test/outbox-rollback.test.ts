// A fault after the entry event but before phase generation rolls back the entire append and publishes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EventRow } from '../src/electiondb.ts';
import { World } from './helpers/world.ts';

test('an entry-event failure rolls back the append and a restarted retry publishes only committed rows', async () => {
  const w = new World({ seed: 'outbox-rollback', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const live: EventRow[] = [];
    const webhook: EventRow[] = [];
    rt.subscribe({ event: (row) => live.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { webhook.push(row); };
    const insert = rt.edb.insertEvent.bind(rt.edb);
    let failed = false;
    rt.edb.insertEvent = (...args) => {
      const out = insert(...args);
      if (args[1] === 'entry') {
        failed = true;
        throw new Error('injected failure after entry event, before phase');
      }
      return out;
    };
    const response = await w.publishManifest();
    assert.equal(response.status, 500, response.text);
    assert.equal(failed, true, 'fault reached the transaction after entry-event insertion');
    const durable = rt.edb.eventsAfter(0, 100).map((row) => ({ ...row }));
    assert.deepEqual(durable, []);
    assert.equal(live.length, 0, 'no rolled-back row can reach a live subscriber');
    assert.equal(webhook.length, 0, 'no rolled-back row can reach a webhook callback');
    assert.equal(rt.edb.store.size(), 0); assert.equal(rt.edb.store.latestCheckpoint(), undefined);
    assert.equal(rt.edb.hasAppendCompletions(), false);
    assert.equal(w.server.env.control.runtimeAnchor(w.electionId)?.tree_size ?? 0, 0);
    rt.edb.insertEvent = insert;
    await w.server.stop(); await w.start();
    const retry = (await w.server.pool.get(w.electionId))!;
    retry.subscribe({ event: (row) => live.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { webhook.push(row); };
    assert.equal(retry.log.size, 0); assert.equal((await w.publishManifest()).status, 201);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    assert.equal(new Set(live.map((row) => row.id)).size, live.length, 'no rolled-back ID can be delivered then reused');
    assert.deepEqual(live, retry.edb.eventsAfter(0, 100).map((row) => ({ ...row }))); assert.deepEqual(webhook, live);
    await w.server.stop();
    await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.log.size, 2);
    assert.equal(reopened.logState, 'CEREMONY');
  } finally {
    await w.stop();
  }
});
