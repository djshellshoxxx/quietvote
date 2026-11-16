// Election/control outbox bridge: committed source events survive lost callbacks and partial fanout transactions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { WebhookRequest } from '../src/ssrf.ts';
import { World } from './helpers/world.ts';

function fixture(seed: string): { w: World; sent: WebhookRequest[] } {
  const sent: WebhookRequest[] = [];
  const w = new World({ seed, n: 3, t: 2, voters: 2, server: {
    webhookResolver: async () => [{ address: '93.184.216.34', family: 4 }],
    webhookTransport: async (req) => { sent.push(req); return { status: 200, truncated: false }; },
  } });
  return { w, sent };
}
async function hook(w: World): Promise<string> {
  const r = await w.signed('POST', `/api/v1/orgs/${w.orgId}/webhooks`, {
    url: 'https://hooks.example.com/qv', events: ['entry', 'checkpoint', 'phase'], election_id: w.electionId,
  }, w.owner, w.idemKey());
  assert.equal(r.status, 201, r.text);
  return r.json.webhook_id as string;
}
const eventIds = (sent: WebhookRequest[]): string[] => sent.map((req) => req.headers['QV-Webhook-Id']!);

test('startup forwards committed events lost before the control outbox without requiring a client to reopen the election', async () => {
  const { w, sent } = fixture('bridge-lost-callback');
  await w.start();
  try {
    await w.setupOrgAndElection();
    await hook(w);
    w.server.env.recoverEvents = () => false; // process dies after source commit and before bridge callback
    assert.equal((await w.publishManifest()).status, 201);
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.deepEqual(rt.edb.eventsAfter(0, 10).map((e) => e.type), ['entry', 'checkpoint', 'phase']);
    assert.equal(w.server.env.control.outboxCount(), 0);
    assert.equal(sent.length, 0);
    await w.server.stop();
    await w.start();
    await w.server.webhooks.idle();
    assert.equal(sent.length, 3, 'startup itself must forward the backlog');
    assert.equal(new Set(eventIds(sent)).size, 3);
    assert.equal(w.server.env.control.webhookEventCursor(w.electionId), 3);
    assert.equal(w.server.env.control.outboxCount(), 0, 'successful delivery deletes pending rows');
    await w.server.stop();
    await w.start();
    await w.server.webhooks.idle();
    assert.equal(sent.length, 3, 'persistent cursor prevents resending completed deliveries');
  } finally { await w.stop(); }
});

test('a fanout failure rolls back every hook and its cursor; a later read retries all original IDs', async () => {
  const { w, sent } = fixture('bridge-partial-fanout');
  await w.start();
  try {
    await w.setupOrgAndElection();
    await hook(w); await hook(w);
    const ctl = w.server.env.control;
    const insert = ctl.outboxInsert.bind(ctl);
    let n = 0;
    ctl.outboxInsert = (row) => { if (++n % 2 === 0) throw new Error('injected second hook write failure'); insert(row); };
    assert.equal((await w.publishManifest()).status, 201);
    await w.server.webhooks.idle();
    assert.equal(sent.length, 0, 'no transport starts before the fanout transaction commits');
    assert.equal(ctl.outboxCount(), 0, 'first hook write is rolled back too');
    assert.equal(ctl.webhookEventCursor(w.electionId), 0);
    ctl.outboxInsert = insert;
    assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).status, 200);
    await w.server.webhooks.idle();
    assert.equal(sent.length, 6);
    assert.equal(new Set(eventIds(sent)).size, 6);
    assert.equal(ctl.webhookEventCursor(w.electionId), 3);
    assert.ok(w.logs.some((line) => line.includes('storage_retry_pending')));
  } finally { await w.stop(); }
});

test('cursor failure after pending delivery insertion cannot send uncommitted deliveries or lose the source event', async () => {
  const { w, sent } = fixture('bridge-cursor-failure');
  await w.start();
  try {
    await w.setupOrgAndElection(); await hook(w);
    const ctl = w.server.env.control;
    const advance = ctl.advanceWebhookEventCursor.bind(ctl);
    ctl.advanceWebhookEventCursor = (id, event) => { if (event > 0) throw new Error('injected cursor write failure'); advance(id, event); };
    assert.equal((await w.publishManifest()).status, 201);
    assert.equal(ctl.outboxCount(), 0);
    assert.equal(sent.length, 0);
    await w.server.stop(); await w.start();
    await w.server.webhooks.idle();
    assert.equal(sent.length, 3);
    assert.equal(new Set(eventIds(sent)).size, 3);
  } finally { await w.stop(); }
});

test('upgrade floors pre-cursor history without replaying already delivered events', async () => {
  const { w, sent } = fixture('bridge-upgrade');
  await w.start();
  try {
    await w.setupOrgAndElection(); await hook(w);
    assert.equal((await w.publishManifest()).status, 201);
    await w.server.webhooks.idle();
    assert.equal(sent.length, 3);
    const rel = w.server.env.control.election(w.electionId)!.db_path;
    await w.server.stop();
    const oldElection = new DatabaseSync(join(w.dir, rel));
    oldElection.exec("DROP TABLE operation_receipt; DROP TABLE append_completion; DELETE FROM meta WHERE key='webhook_bridge_floor'; DELETE FROM schema_migration WHERE version>=6; PRAGMA user_version=5");
    oldElection.close();
    const oldControl = new DatabaseSync(join(w.dir, 'control.sqlite'));
    oldControl.exec('DROP TABLE webhook_event_cursor; DELETE FROM schema_migration WHERE version=7; PRAGMA user_version=6');
    oldControl.close();
    await w.start();
    await w.server.webhooks.idle();
    assert.equal(sent.length, 3, 'legacy delivered history has no durable receipt and must not be replayed');
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.webhookBridgeFloor(), 3);
    await w.ok('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    await w.server.webhooks.idle();
    assert.equal(sent.length, 6, 'new committed events cross the new durable bridge');
    assert.equal(new Set(eventIds(sent)).size, 6);
  } finally { await w.stop(); }
});


test('legacy pending webhook retries survive bridge migration with their original ID, body and next attempt', async () => {
  const { w, sent } = fixture('bridge-upgrade-pending');
  let status = 500;
  w.o.server!.webhookTransport = async (req) => { sent.push(req); return { status, truncated: false }; };
  w.o.server!.webhookBackoffBaseMs = 60_000;
  await w.start();
  try {
    await w.setupOrgAndElection(); await hook(w);
    assert.equal((await w.publishManifest()).status, 201);
    const end = Date.now() + 5000;
    while (w.server.webhooks.stats.retries !== 3) {
      assert.ok(Date.now() < end, 'three pending retry rows must be recorded');
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const pending = w.server.env.control.outboxAll();
    assert.equal(pending.length, 3);
    assert.ok(pending.every((row) => row.attempt === 2));
    const rel = w.server.env.control.election(w.electionId)!.db_path;
    await w.server.stop();
    const oldElection = new DatabaseSync(join(w.dir, rel));
    oldElection.exec("DROP TABLE operation_receipt; DROP TABLE append_completion; DELETE FROM meta WHERE key='webhook_bridge_floor'; DELETE FROM schema_migration WHERE version>=6; PRAGMA user_version=5");
    oldElection.close();
    const oldControl = new DatabaseSync(join(w.dir, 'control.sqlite'));
    oldControl.exec('DROP TABLE webhook_event_cursor; DELETE FROM schema_migration WHERE version=7; PRAGMA user_version=6');
    oldControl.close();
    status = 200; w.tick(61);
    await w.start(); await w.server.webhooks.idle();
    assert.equal(sent.length, 6, 'one original attempt plus one resumed attempt per event');
    const replayed = sent.slice(3);
    assert.deepEqual(eventIds(replayed).sort(), pending.map((row) => row.delivery_id).sort());
    for (const request of replayed) {
      const original = pending.find((row) => row.delivery_id === request.headers['QV-Webhook-Id'])!;
      assert.equal(Buffer.from(request.body).toString(), original.body);
    }
    assert.equal(w.server.env.control.outboxCount(), 0);
    await w.server.stop(); await w.start(); await w.server.webhooks.idle();
    assert.equal(sent.length, 6, 'the upgrade floor prevents replay after pending delivery completion');
  } finally { await w.stop(); }
});
