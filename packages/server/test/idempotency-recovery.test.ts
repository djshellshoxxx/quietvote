// A failed response-cache write must never make a committed management mutation automatically repeatable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from './helpers/world.ts';

const makeWorld = (): World => new World({ seed: 'idempotency-recovery', n: 3, t: 2, voters: 2 });

test('committed work with a lost idempotency response stays reserved and becomes a nonretryable conflict after restart', async () => {
  const w = makeWorld();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const path = `/api/v1/orgs/${w.orgId}/elections`;
    const body = { title: 'Lost response election' };
    const headers = w.idemKey();
    const store = w.server.env.control.storeIdem.bind(w.server.env.control);
    w.server.env.control.storeIdem = (...args) => {
      if (args[5] === 201) throw new Error('injected response-cache failure');
      store(...args);
    };
    const response = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(response.status, 500, response.text);
    assert.equal(w.server.env.control.countElections(w.orgId), 2, 'the election was committed despite the lost response');
    const pending = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(pending.status, 409, pending.text);
    assert.equal(pending.json.reason, 'IDEMPOTENCY_INTERRUPTED');
    assert.equal(pending.json.retryable, false);
    assert.equal(w.server.env.control.countElections(w.orgId), 2, 'same-process retry must not duplicate committed work');
    w.server.env.control.db.prepare('UPDATE idempotency SET status=0 WHERE idem_key=?').run(headers['idempotency-key']!);
    await w.server.stop();
    await w.start();
    const interrupted = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(interrupted.status, 409, interrupted.text);
    assert.equal(interrupted.json.code, 'STATE_CONFLICT');
    assert.equal(interrupted.json.reason, 'IDEMPOTENCY_INTERRUPTED');
    assert.equal(interrupted.json.retryable, false);
    assert.equal(interrupted.headers.get('retry-after'), null);
    assert.equal(w.server.env.control.countElections(w.orgId), 2);
    const mismatch = await w.signed('POST', path, { title: 'Different request' }, w.owner, headers);
    assert.equal(mismatch.status, 422, mismatch.text);
    assert.equal(mismatch.json.code, 'IDEMPOTENCY_MISMATCH');
    // Distinct, successfully recorded requests retain normal replay semantics.
    const freshHeaders = w.idemKey();
    const fresh = await w.signed('POST', path, { title: 'Fresh election' }, w.owner, freshHeaders);
    assert.equal(fresh.status, 201, fresh.text);
    await w.server.stop();
    await w.start();
    const replay = await w.signed('POST', path, { title: 'Fresh election' }, w.owner, freshHeaders);
    assert.equal(replay.status, 201, replay.text);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.deepEqual(replay.json, fresh.json);
    assert.equal(w.server.env.control.countElections(w.orgId), 3);
  } finally {
    await w.stop();
  }
});

test('a live request remains retryable in progress while its original work finishes', async () => {
  const w = makeWorld();
  await w.start();
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let entered = (): void => undefined;
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  try {
    await w.setupOrgAndElection();
    const create = w.server.pool.create.bind(w.server.pool);
    w.server.pool.create = async (...args) => {
      entered();
      await gate;
      return create(...args);
    };
    const path = `/api/v1/orgs/${w.orgId}/elections`;
    const body = { title: 'Concurrent election' };
    const headers = w.idemKey();
    const original = w.signed('POST', path, body, w.owner, headers);
    await waiting;
    const pending = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(pending.status, 409, pending.text);
    assert.equal(pending.json.code, 'IDEMPOTENCY_IN_PROGRESS');
    assert.equal(pending.json.retryable, true);
    assert.equal(pending.headers.get('retry-after'), '1');
    release();
    const response = await original;
    assert.equal(response.status, 201, response.text);
    const replay = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(replay.status, 201, replay.text);
    assert.equal(replay.json.election_id, response.json.election_id);
    assert.equal(w.server.env.control.countElections(w.orgId), 2);
  } finally {
    release();
    await w.stop();
  }
});

test('an internal failure inside management work preserves a potentially committed request', async () => {
  const w = makeWorld();
  await w.start();
  try {
    await w.setupOrgAndElection();
    const audit = w.server.env.control.audit.bind(w.server.env.control);
    w.server.env.control.audit = (...args) => {
      if (args[1] === 'election.create') throw new Error('injected audit failure after creation');
      audit(...args);
    };
    const path = `/api/v1/orgs/${w.orgId}/elections`;
    const body = { title: 'Committed before internal failure' };
    const headers = w.idemKey();
    assert.equal((await w.signed('POST', path, body, w.owner, headers)).status, 500);
    assert.equal(w.server.env.control.countElections(w.orgId), 2);
    const retry = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(retry.status, 409, retry.text);
    assert.equal(retry.json.reason, 'IDEMPOTENCY_INTERRUPTED');
    assert.equal(retry.json.retryable, false);
    assert.equal(w.server.env.control.countElections(w.orgId), 2);
  } finally {
    await w.stop();
  }
});
