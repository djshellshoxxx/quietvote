// Rolled-back supplemental event rows must never reach SSE or webhook delivery with reusable event IDs.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { EventRow } from '../src/electiondb.ts';
import { World } from './helpers/world.ts';

test('a supplemental event commit failure publishes only committed append events', async () => {
  const w = new World({ seed: 'outbox-rollback', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    const live: EventRow[] = [];
    const webhook: EventRow[] = [];
    rt.subscribe({ event: (row) => live.push(row), close: () => undefined });
    w.server.env.onEvent = (_who, row) => { webhook.push(row); };
    const transaction = rt.edb.tx.bind(rt.edb);
    let failed = false;
    rt.edb.tx = <T>(fn: () => T): T => transaction(() => {
      const out = fn();
      if (rt.edb.eventsAfter(0, 100).some((row) => row.type === 'phase')) {
        failed = true;
        throw new Error('injected supplemental transaction commit failure');
      }
      return out;
    });
    const response = await w.publishManifest();
    assert.equal(response.status, 201, response.text);
    assert.equal(failed, true, 'fault reached the transaction after phase insertion');
    const durable = rt.edb.eventsAfter(0, 100).map((row) => ({ ...row }));
    assert.deepEqual(durable.map((row) => row.type), ['entry', 'checkpoint']);
    assert.deepEqual(live, durable, 'live events must match committed event rows');
    assert.deepEqual(webhook, durable, 'webhook callbacks must receive committed rows only');
    rt.edb.tx = transaction;
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    assert.equal(new Set(live.map((row) => row.id)).size, live.length, 'no rolled-back ID can be delivered then reused');
    await w.server.stop();
    await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.log.size, 2);
    assert.equal(reopened.logState, 'CEREMONY');
  } finally {
    await w.stop();
  }
});
