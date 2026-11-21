import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTO_ID } from '@quietvote/protocol';
import { electionBundle } from '../src/export.ts';
import { World } from './helpers/world.ts';

async function ceremony(seed: string): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 0 });
  await w.start();
  await w.setupOrgAndElection();
  assert.equal((await w.publishManifest()).status, 201);
  await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
  return w;
}
const control = (w: World, seq?: number, signers = [0, 1]) => w.multi(w.mh, {
  proto: PROTO_ID, type: 'control', action: 'security-notice', ...(seq === undefined ? {} : { control_seq: seq }),
}, signers);

test('signed control counters reject gaps and rewraps, preserve exact retries, and recover after restart', async () => {
  const w = await ceremony('control-sequence-admission');
  try {
    let rt = (await w.server.pool.get(w.electionId))!;
    const originalSize = rt.log.size;
    for (const seq of [undefined, 0, -1]) {
      const r = await w.post('notice', w.coord[0]!, control(w, seq));
      assert.equal(r.status, 422, r.text);
      assert.equal(r.json.reason, 'E_SCHEMA');
    }
    const future = await w.post('notice', w.coord[0]!, control(w, 2));
    assert.equal(future.status, 409, future.text);
    assert.equal(future.json.reason, 'CONTROL_SEQUENCE');
    assert.equal(future.json.next_control_seq, 1);
    const unauthorized = await w.post('notice', w.coord[0]!, control(w, 1, [0]));
    assert.equal(unauthorized.status, 422, unauthorized.text);
    const wrongAuthor = await w.post('notice', w.trustees[0]!, control(w, 1));
    assert.equal(wrongAuthor.status, 403, wrongAuthor.text);
    assert.equal(rt.st.controlSeq, 0);
    assert.equal(rt.log.size, originalSize);

    const firstRecord = control(w, 1), packet = w.entry('notice', w.coord[0]!, firstRecord);
    const first = await w.submit(packet.headerBytes, packet.body);
    assert.equal(first.status, 201, first.text);
    const retry = await w.submit(packet.headerBytes, packet.body);
    assert.equal(retry.status, 200, retry.text);
    assert.equal(rt.log.size, originalSize + 1);
    assert.equal(rt.st.controlSeq, 1);
    const rewrapped = await w.post('notice', w.coord[0]!, firstRecord);
    assert.equal(rewrapped.status, 409, rewrapped.text);
    assert.equal(rewrapped.json.reason, 'CONTROL_SEQUENCE');
    assert.equal((await w.post('notice', w.coord[0]!, control(w, 3))).status, 409);
    assert.equal((await w.post('notice', w.coord[0]!, control(w, 2))).status, 201);
    await w.server.stop(); await w.start();
    rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.st.controlSeq, 2);
    assert.equal((await w.post('notice', w.coord[0]!, firstRecord)).status, 409);
    const recoveredRetry = await w.submit(packet.headerBytes, packet.body);
    assert.equal(recoveredRetry.status, 200, recoveredRetry.text);
    assert.equal((await w.post('notice', w.coord[0]!, control(w, 3))).status, 201);
    assert.equal(rt.st.controlSeq, 3);
    assert.equal(rt.log.size, originalSize + 3);
    const abort = w.multi(w.mh, { ...control(w, 4).body, action: 'abort' });
    const aborted = await w.post('ceremony_abort', w.coord[0]!, abort);
    assert.equal(aborted.status, 201, aborted.text);
    const exported = electionBundle(rt).log.map((r) => r.entry as { body?: { type?: string; control_seq?: number } });
    assert.deepEqual(exported.filter((r) => r.body?.type === 'control').map((r) => r.body?.control_seq), [1, 2, 3, 4], 'content export keeps the full signed control order including terminal entry types');
  } finally { await w.stop(); }
});

test('historical controls form a readable prefix and the first new control starts at one', async () => {
  const w = await ceremony('control-sequence-legacy-prefix');
  try {
    const rt = (await w.server.pool.get(w.electionId))!;
    for (let i = 0; i < 2; i++) {
      const legacy = i === 0 ? w.multi(w.mh, { ...control(w).body, action: 'witness-waiver', reason: 'historical review' }) : control(w);
      const packet = w.entry('notice', w.coord[0]!, legacy);
      rt.edb.tx(() => {
        assert.equal(rt.log.append(packet.headerBytes, packet.body).ok, true);
        assert.equal(rt.log.checkpoint().ok, true);
      });
    }
    await w.server.stop(); await w.start();
    assert.equal((await w.server.pool.get(w.electionId))!.st.controlSeq, 0);
    const accepted = await w.post('notice', w.coord[0]!, control(w, 1));
    assert.equal(accepted.status, 201, accepted.text);
    assert.equal((await w.post('notice', w.coord[0]!, control(w))).status, 422);
    await w.server.stop(); await w.start();
    assert.equal((await w.server.pool.get(w.electionId))!.st.controlSeq, 1);
    assert.equal((await w.post('notice', w.coord[0]!, control(w, 2))).status, 201);
  } finally { await w.stop(); }
});

test('concurrent proposals for one counter admit one record and leave the next counter available', async () => {
  const w = await ceremony('control-sequence-concurrent');
  try {
    const responses = await Promise.all([0, 1].map((i) => w.post('notice', w.coord[i]!, control(w, 1))));
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await w.server.pool.get(w.electionId))!.st.controlSeq, 1);
    assert.equal((await w.post('notice', w.coord[0]!, control(w, 2))).status, 201);
  } finally { await w.stop(); }
});
