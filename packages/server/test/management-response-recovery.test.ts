// Control-database mutations and their redacted replay receipts commit in the same transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { b64u } from '@quietvote/board';
import { bytesToHex } from '@quietvote/crypto';
import { World, kp } from './helpers/world.ts';

const orgBody = (w: World) => ({ name: 'Recovery organization', owner_key: { pk: b64u(w.owner.publicKey), alg: 'ed25519' } });
const count = (w: World, table: 'org' | 'job' | 'webhook'): number => Number(w.server.env.control.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);

test('organization mutation and audit roll back if its replay receipt cannot be saved', async () => {
  const w = new World({ seed: 'org-response-rollback', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    const ctl = w.server.env.control;
    const store = ctl.storeIdem.bind(ctl);
    ctl.storeIdem = (...args) => { if (args[5] === 201) throw new Error('injected receipt write failure'); store(...args); };
    const headers = w.idemKey();
    assert.equal((await w.signed('POST', '/api/v1/orgs', orgBody(w), w.owner, headers)).status, 500);
    assert.equal(count(w, 'org'), 0);
    assert.equal(Number(ctl.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='org.create'").get()!.n), 0);
    await w.server.stop(); await w.start();
    const retry = await w.signed('POST', '/api/v1/orgs', orgBody(w), w.owner, headers);
    assert.equal(retry.status, 409, 'uncertain requests retain their original conservative binding');
    const fresh = await w.signed('POST', '/api/v1/orgs', orgBody(w), w.owner, w.idemKey());
    assert.equal(fresh.status, 201, fresh.text);
    assert.equal(count(w, 'org'), 1);
  } finally { await w.stop(); }
});

test('lost organization completion replays the committed response after restart with no duplicate mutation or audit', async () => {
  const w = new World({ seed: 'org-response-lost', n: 3, t: 2, voters: 2 });
  await w.start();
  try {
    const ctl = w.server.env.control;
    const tx = ctl.tx.bind(ctl), store = ctl.storeIdem.bind(ctl);
    let saved = false;
    ctl.storeIdem = (...args) => { store(...args); if (args[5] === 201) saved = true; };
    ctl.tx = <T>(fn: () => T): T => { const result = tx(fn); if (saved) { saved = false; throw new Error('injected post-commit completion loss'); } return result; };
    const headers = w.idemKey();
    assert.equal((await w.signed('POST', '/api/v1/orgs', orgBody(w), w.owner, headers)).status, 500);
    assert.equal(count(w, 'org'), 1);
    await w.server.stop(); await w.start();
    const replay = await w.signed('POST', '/api/v1/orgs', orgBody(w), w.owner, headers);
    assert.equal(replay.status, 201, replay.text);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.equal(replay.json.org_id, w.server.env.control.db.prepare('SELECT org_id FROM org').get()!.org_id);
    assert.equal(count(w, 'org'), 1);
    assert.equal(Number(w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='org.create'").get()!.n), 1);
    const mismatch = await w.signed('POST', '/api/v1/orgs', { ...orgBody(w), name: 'Changed' }, w.owner, headers);
    assert.equal(mismatch.status, 422);
  } finally { await w.stop(); }
});

test('lost webhook completion replays only its redacted committed response', async () => {
  const w = new World({ seed: 'hook-response-lost', n: 3, t: 2, voters: 2, server: {
    webhookResolver: async () => [{ address: '93.184.216.34', family: 4 }],
  } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const create = w.server.webhooks.create.bind(w.server.webhooks);
    w.server.webhooks.create = async (...args) => { await create(...args); throw new Error('injected post-commit completion loss'); };
    const path = `/api/v1/orgs/${w.orgId}/webhooks`, headers = w.idemKey();
    const body = { url: 'https://hooks.example.com/private-token', events: ['entry'], election_id: w.electionId };
    assert.equal((await w.signed('POST', path, body, w.owner, headers)).status, 500);
    assert.equal(count(w, 'webhook'), 1);
    await w.server.stop(); await w.start();
    const replay = await w.signed('POST', path, body, w.owner, headers);
    assert.equal(replay.status, 201, replay.text);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.equal(replay.json.webhook_id, w.server.env.control.webhooksOf(w.orgId)[0]!.webhook_id);
    assert.equal(replay.json.secret, undefined); assert.equal(replay.json.url, undefined);
    assert.equal(count(w, 'webhook'), 1);
    const cached = w.server.env.control.db.prepare('SELECT response FROM idempotency WHERE idem_key=?').get(headers['idempotency-key']!)!.response;
    assert.doesNotMatch(Buffer.from(cached as Uint8Array).toString(), /private-token|whsec_/);
  } finally { await w.stop(); }
});

test('job receipt failure rolls back job creation before execution; lost completion replays the original job', async () => {
  const admin = kp('job-response', 'admin');
  const w = new World({ seed: 'job-response', n: 3, t: 2, voters: 2, server: { adminKeys: [bytesToHex(admin.publicKey)] } });
  await w.start();
  try {
    const ctl = w.server.env.control;
    const store = ctl.storeIdem.bind(ctl);
    ctl.storeIdem = (...args) => { if (args[5] === 202) throw new Error('injected receipt failure'); store(...args); };
    assert.equal((await w.signed('POST', '/api/v1/admin/backups', { scope: 'all' }, admin, w.idemKey())).status, 500);
    assert.equal(count(w, 'job'), 0);
    assert.equal(w.server.jobs.active('admin'), 0, 'rolled-back job must never enter the running queue');
    ctl.storeIdem = store;
    const submit = w.server.jobs.submit.bind(w.server.jobs);
    w.server.jobs.submit = (...args) => { submit(...args); throw new Error('injected completion loss after durable job submission'); };
    const headers = w.idemKey();
    assert.equal((await w.signed('POST', '/api/v1/admin/backups', { scope: 'all' }, admin, headers)).status, 500);
    assert.equal(count(w, 'job'), 1);
    const jobId = ctl.db.prepare('SELECT job_id FROM job').get()!.job_id;
    await w.server.stop(); await w.start();
    const replay = await w.signed('POST', '/api/v1/admin/backups', { scope: 'all' }, admin, headers);
    assert.equal(replay.status, 202, replay.text);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.equal(replay.json.job_id, jobId);
    assert.equal(count(w, 'job'), 1);
    assert.equal((await w.signed('GET', `/api/v1/jobs/${String(jobId)}`, undefined, admin)).status, 200);
  } finally { await w.stop(); }
});


test('webhook deletion and restore-floor tombstone commit together; keyed deletion recovers a lost completion', async () => {
  const w = new World({ seed: 'hook-deletion-response', n: 3, t: 2, voters: 2, server: {
    webhookResolver: async () => [{ address: '93.184.216.34', family: 4 }],
  } });
  await w.start();
  try {
    await w.setupOrgAndElection();
    const base = `/api/v1/orgs/${w.orgId}/webhooks`;
    const made = await w.signed('POST', base, { url: 'https://hooks.example.com/qv', events: ['entry'] }, w.owner, w.idemKey());
    assert.equal(made.status, 201, made.text);
    const path = `${base}/${made.json.webhook_id}`, ctl = w.server.env.control;
    const audit = ctl.audit.bind(ctl);
    ctl.audit = (...args) => { if (args[1] === 'webhook.delete') throw new Error('injected deletion tombstone failure'); audit(...args); };
    assert.equal((await w.signed('DELETE', path)).status, 500);
    assert.equal(count(w, 'webhook'), 1, 'without the tombstone, deletion must roll back');
    assert.equal(Number(ctl.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='webhook.delete'").get()!.n), 0);
    ctl.audit = audit;
    const tx = ctl.tx.bind(ctl), store = ctl.storeIdem.bind(ctl);
    let recorded = false;
    ctl.storeIdem = (...args) => { store(...args); if (args[5] === 204) recorded = true; };
    ctl.tx = <T>(fn: () => T): T => { const result = tx(fn); if (recorded) { recorded = false; throw new Error('injected deletion completion loss'); } return result; };
    const headers = w.idemKey();
    assert.equal((await w.signed('DELETE', path, undefined, w.owner, headers)).status, 500);
    assert.equal(count(w, 'webhook'), 0);
    assert.equal(Number(ctl.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='webhook.delete'").get()!.n), 1);
    await w.server.stop(); await w.start();
    const replay = await w.signed('DELETE', path, undefined, w.owner, headers);
    assert.equal(replay.status, 204, replay.text);
    assert.equal(replay.headers.get('idempotent-replay'), 'true');
    assert.equal(count(w, 'webhook'), 0);
    assert.equal(Number(w.server.env.control.db.prepare("SELECT COUNT(*) AS n FROM operator_audit WHERE action='webhook.delete'").get()!.n), 1);
  } finally { await w.stop(); }
});
