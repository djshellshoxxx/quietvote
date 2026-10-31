// Webhook retry state persistence (QV-09 §6.3): restart resumes retries, the outbox cap prunes the oldest pending rows,
// and per-hook failure counts survive a restart. Drives WebhookService directly over a real ControlDb in a temp directory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ControlDb } from '../src/controldb.ts';
import type { Env } from '../src/env.ts';
import type { EventRow } from '../src/electiondb.ts';
import { resolveConfig, type ServerOptions } from '../src/config.ts';
import { Logger } from '../src/logger.ts';
import type { WebhookRequest, WebhookResponse } from '../src/ssrf.ts';
import { signDelivery, WebhookService } from '../src/webhooks.ts';

const T0 = 1_800_000_000_000;
const URL_ = 'https://hooks.example.com/qv';
const ELECTION = 'a'.repeat(32);
const KEK = randomBytes(32);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 5000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('condition not reached');
    await sleep(2);
  }
};

const resolver = async (host: string) => {
  if (host !== 'hooks.example.com') throw new Error('ENOTFOUND');
  return [{ address: '93.184.216.34', family: 4 as const }];
};

interface Sent {
  req: WebhookRequest;
  at: number;
}

/** One "process": a WebhookService over the control database in `dir`, started with the given options and transport. */
interface Proc {
  svc: WebhookService;
  control: ControlDb;
  sent: Sent[];
  status: { code: number };
  down(): void;
}

function boot(dir: string, now: () => number, o: Partial<ServerOptions> & { status?: number; gate?: Promise<void> } = {}): Proc {
  const sent: Sent[] = [];
  const status = { code: o.status ?? 200 };
  let gate = o.gate; // holds the first attempt inside the transport until released
  const transport = async (req: WebhookRequest): Promise<WebhookResponse> => {
    sent.push({ req, at: Date.now() });
    if (gate !== undefined) {
      const g = gate;
      gate = undefined;
      await g;
    }
    return { status: status.code, truncated: false } as WebhookResponse;
  };
  const { status: _s, gate: _g, ...opts } = o;
  const cfg = resolveConfig({
    dataDir: dir, now, webhookResolver: resolver, webhookTransport: transport, webhookTimeoutMs: 1000, webhookMaxAttempts: 6,
    webhookBackoffBaseMs: 60_000, webhookMaxBackoffMs: 3_600_000, webhookDisableAfter: 5, webhookMaxInflight: 8, ...opts,
  });
  const control = new ControlDb(dir, now, 'test');
  const env = {
    cfg, control, kek: KEK, logger: new Logger(() => undefined, now), nowSec: () => Math.floor(now() / 1000),
    stats: { proofVerifications: 0, requests: 0, appended: 0 }, inflight: { n: 0 },
  } as unknown as Env;
  const svc = new WebhookService(env);
  return {
    svc, control, sent, status,
    down() {
      svc.stop();
      control.close();
    },
  };
}

function ev(id: number): EventRow {
  return { id, ts: T0, type: 'entry', seq: id, data: JSON.stringify({ n: id }) };
}

function setup(): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'qv-wh-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Waits for the service to go idle. A referenced keep-alive holds the event loop open while only microtasks and unref'd
 *  retry timers remain (in production the HTTP server keeps the process alive). */
async function settle(svc: WebhookService): Promise<void> {
  const keep = setInterval(() => undefined, 1000);
  try {
    await svc.idle();
  } finally {
    clearInterval(keep);
  }
}

/** Creates the org and the hook through the service's own registration path (URL sealed, secret returned once). */
async function seed(p: Proc, orgTag: string): Promise<{ orgId: string; hookId: string; secret: string }> {
  const org = p.control.createOrg(`Org ${orgTag}`, `key-${orgTag}`, new Uint8Array(32));
  const made = await p.svc.create(org.org_id, URL_, ['entry'], undefined);
  return { orgId: org.org_id, hookId: made.row.webhook_id, secret: made.secret };
}

test('restart resumes a pending retry at its persisted attempt and time, with the same delivery id and body', async () => {
  const { dir, cleanup } = setup();
  try {
    const clock = { t: T0 };
    const now = () => clock.t;
    const p1 = boot(dir, now, { status: 500 });
    const { orgId, hookId, secret } = await seed(p1, 'a');
    p1.svc.onEvent({ electionId: ELECTION, orgId }, ev(1));
    await until(() => p1.svc.stats.retries === 1);
    assert.equal(p1.sent.length, 1);
    const [row] = p1.control.outboxAll();
    assert.equal(row!.attempt, 2, 'the next attempt is persisted before anything is scheduled');
    assert.equal(row!.next_at, T0 + 60_000);
    assert.equal(row!.webhook_id, hookId);
    const firstBody = p1.sent[0]!.req.body.toString();
    p1.down(); // process exits with the retry pending

    // time passes past the scheduled retry; the next process picks the row up at startup
    clock.t = T0 + 60_000;
    const p2 = boot(dir, now, { status: 200 });
    assert.equal(p2.control.outboxAll().length, 1, 'the pending row survived the restart');
    await settle(p2.svc);
    assert.equal(p2.sent.length, 1);
    const r = p2.sent[0]!.req;
    assert.equal(r.body.toString(), firstBody, 'identical body on resume');
    assert.equal(r.headers['QV-Webhook-Id'], `${hookId}.${ELECTION}.1`, 'stable delivery id across the restart');
    const ts = Number(r.headers['QV-Webhook-Timestamp']);
    assert.equal(ts, Math.floor((T0 + 60_000) / 1000), 'timestamp is fresh on the resumed attempt');
    assert.equal(r.headers['QV-Webhook-Signature'], signDelivery(secret, ts, r.headers['QV-Webhook-Id']!, firstBody));
    assert.equal(p2.svc.stats.delivered, 1);
    assert.equal(p2.control.outboxAll().length, 0, 'a delivered row is removed');
    p2.down();
  } finally {
    cleanup();
  }
});

test('restart before the scheduled retry keeps the remaining wait instead of sending early', async () => {
  const { dir, cleanup } = setup();
  try {
    const now = () => Date.now();
    const p1 = boot(dir, now, { status: 500, webhookBackoffBaseMs: 300, webhookMaxBackoffMs: 300 });
    const { orgId } = await seed(p1, 'b');
    p1.svc.onEvent({ electionId: ELECTION, orgId }, ev(1));
    await until(() => p1.svc.stats.retries === 1);
    const due = p1.control.outboxAll()[0]!.next_at;
    p1.down();

    const p2 = boot(dir, now, { status: 200, webhookBackoffBaseMs: 300, webhookMaxBackoffMs: 300 });
    if (Date.now() < due - 50) assert.equal(p2.sent.length, 0, 'not re-sent before its due time');
    await settle(p2.svc);
    assert.equal(p2.sent.length, 1);
    assert.ok(p2.sent[0]!.at >= due - 2, 'sent no earlier than the persisted due time');
    p2.down();
  } finally {
    cleanup();
  }
});

test('outbox cap: admitting beyond webhookMaxQueue prunes the oldest queued rows; an in-flight delivery is never pruned', async () => {
  const { dir, cleanup } = setup();
  try {
    const now = () => T0;
    // Delivery 1 blocks inside the transport until released, so 2..5 are admitted while 1 is in flight (not counted against the cap).
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = boot(dir, now, { webhookMaxQueue: 3, webhookMaxInflight: 1, gate });
    const { orgId } = await seed(p, 'c');
    for (let i = 1; i <= 5; i++) p.svc.onEvent({ electionId: ELECTION, orgId }, ev(i));
    // queued/waiting rows are capped at 3; the in-flight row 1 is persisted alongside them and is never pruned
    assert.deepEqual(p.control.outboxAll().map((r) => r.delivery_id.split('.').pop()), ['1', '3', '4', '5']);
    assert.equal(p.svc.stats.dropped, 1, 'only the oldest queued row (2) was pruned');
    release();
    await settle(p.svc);
    const ids = p.sent.map((s) => s.req.headers['QV-Webhook-Id']!.split('.').pop());
    assert.deepEqual(ids.sort(), ['1', '3', '4', '5'], 'in-flight 1 sent once; pruned 2 never sent');
    assert.equal(p.control.outboxCount(), 0);
    p.down();
  } finally {
    cleanup();
  }
});

test('outbox cap: a newcomer prunes a retry-waiting row and cancels its timer', async () => {
  const { dir, cleanup } = setup();
  try {
    const now = () => T0;
    const p = boot(dir, now, { status: 500, webhookMaxQueue: 1 });
    const { orgId } = await seed(p, 'd');
    p.svc.onEvent({ electionId: ELECTION, orgId }, ev(1));
    await until(() => p.svc.stats.retries === 1); // 1 now waits 60 s for its retry
    p.svc.onEvent({ electionId: ELECTION, orgId }, ev(2)); // cap 1: prunes waiting 1, cancelling its timer
    await until(() => p.svc.stats.retries === 2);
    assert.equal(p.svc.stats.dropped, 1);
    assert.deepEqual(p.control.outboxAll().map((r) => r.delivery_id.split('.').pop()), ['2']);
    assert.deepEqual(p.sent.map((s) => s.req.headers['QV-Webhook-Id']!.split('.').pop()), ['1', '2'], 'the pruned delivery is never re-sent');
    p.down();
  } finally {
    cleanup();
  }
});

test('outbox cap: a restart with a lower cap prunes the oldest persisted rows at startup', async () => {
  const { dir, cleanup } = setup();
  try {
    const now = () => T0;
    const p1 = boot(dir, now, { status: 500, webhookMaxQueue: 3 });
    const { orgId } = await seed(p1, 'f');
    for (let i = 1; i <= 3; i++) p1.svc.onEvent({ electionId: ELECTION, orgId }, ev(i));
    await until(() => p1.svc.stats.retries === 3);
    assert.equal(p1.control.outboxCount(), 3);
    p1.down();

    const p2 = boot(dir, now, { status: 500, webhookMaxQueue: 1 });
    assert.deepEqual(p2.control.outboxAll().map((r) => r.delivery_id.split('.').pop()), ['3']);
    assert.equal(p2.svc.stats.dropped, 2);
    p2.down();
  } finally {
    cleanup();
  }
});

test('per-hook failure count survives a restart; disabling removes the hook pending rows', async () => {
  const { dir, cleanup } = setup();
  try {
    const now = () => T0;
    const p1 = boot(dir, now, { status: 400, webhookDisableAfter: 2 });
    const { orgId, hookId } = await seed(p1, 'e');
    p1.svc.onEvent({ electionId: ELECTION, orgId }, ev(1));
    await until(() => p1.svc.stats.failed === 1);
    assert.equal(p1.control.webhook(hookId)!.failures, 1);
    p1.down();

    const p2 = boot(dir, now, { status: 400, webhookDisableAfter: 2 });
    p2.svc.onEvent({ electionId: ELECTION, orgId }, ev(2));
    await settle(p2.svc);
    assert.equal(p2.svc.stats.disabled, 1, 'the second terminal failure, counted across the restart, disables the hook');
    assert.notEqual(p2.control.webhook(hookId)!.disabled_at, null);
    assert.equal(p2.control.outboxCount(), 0);
    p2.svc.onEvent({ electionId: ELECTION, orgId }, ev(3));
    await settle(p2.svc);
    assert.equal(p2.sent.length, 1, 'no delivery to a disabled hook (only event 2 was sent by this process)');
    p2.down();
  } finally {
    cleanup();
  }
});
