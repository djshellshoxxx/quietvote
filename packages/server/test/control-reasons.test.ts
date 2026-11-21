// New public control reasons are catalog codes; existing signed history remains readable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from './helpers/world.ts';

async function ceremony(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 0 });
  await w.start();
  await w.setupOrgAndElection();
  assert.equal((await w.publishManifest()).status, 201);
  await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  return w;
}

test('new control reasons reject public free text before log mutation and never echo it', async () => {
  const w = await ceremony('control-reason-admission');
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const size = rt.log.size;
    const canary = 'PRIVATE_CANARY_operator@example.invalid';
    for (const reason of [canary, 'OTHER: private explanation', 'availability']) {
      const result = await w.post('notice', w.coord[0]!, w.control('security-notice', reason));
      assert.equal(result.status, 422, result.text);
      assert.equal(result.json.reason, 'E_SCHEMA');
      assert.equal(rt.log.size, size, 'a rejected reason cannot add a public entry');
      assert.ok(!result.text.includes(reason), 'the problem response does not echo rejected text');
    }
    assert.ok(!w.logs.join('\n').includes(canary), 'private input does not enter request logs');
    for (const reason of ['AVAILABILITY', 'OTHER', undefined]) {
      const result = await w.post('notice', w.coord[0]!, w.control('security-notice', reason));
      assert.equal(result.status, 201, result.text);
    }
  } finally { await w.stop(); }
});

test('historical signed free-text control reasons survive ordinary replay', async () => {
  const w = await ceremony('control-reason-legacy');
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    const record = w.multi(w.mh, { proto: 'qv1-r255-sha2', type: 'control', action: 'security-notice', reason: 'legacy operator review' });
    const entry = w.entry('notice', w.coord[0]!, record);
    // Model an already-admitted historical record; new HTTP admission is tested above.
    rt.edb.tx(() => {
      const appended = rt.log.append(entry.headerBytes, entry.body);
      assert.equal(appended.ok, true);
      assert.equal(rt.log.checkpoint().ok, true);
    });
    const size = rt.log.size;
    await w.server.stop();
    await w.start();
    const reopened = (await w.server.pool.get(w.electionId))!;
    assert.equal(reopened.log.size, size);
    assert.equal(reopened.state, 'CEREMONY');
    assert.equal((await w.fetchLog()).at(-1)!.rec.body.reason, 'legacy operator review');
  } finally { await w.stop(); }
});
