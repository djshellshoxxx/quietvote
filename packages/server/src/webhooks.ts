// Outbound webhooks (QV-09 §6.3, QV-09-REQ-014): public events only, HMAC-signed, retried with exponential backoff.
//
// Delivery contract (also in NOTES.md):
//   POST <url>   Content-Type: application/json
//   QV-Webhook-Id         stable id of this delivery; identical across retries (receivers dedupe on it)
//   QV-Webhook-Timestamp  unix seconds at signing (fresh on every attempt)
//   QV-Webhook-Signature  "v1=" + hex(HMAC-SHA256(secret, `${timestamp}.${id}.${body}`))
// Targets are validated (ssrf.ts) at registration and again immediately before every attempt, and the socket connects to the
// address that was validated.
//
// Persistence: every pending delivery is a row in control.webhook_outbox (body, attempt number, next attempt time) written
// before it is queued, so a restart resumes retries at their scheduled time. A delivery whose attempt was in flight at crash
// time is re-sent with the same attempt number (at-least-once; receivers dedupe on QV-Webhook-Id). The in-memory queue and
// retry timers are only a cache of those rows. Per-hook consecutive-failure counts are persisted in control.webhook.failures.
// Cap and pruning: at most `webhookMaxQueue` deliveries per process are queued or waiting for a retry (in-flight sends are not
// counted, as before persistence). Admitting a delivery beyond the cap prunes the OLDEST queued/waiting rows (counted in
// stats.dropped, their retry timers cancelled); the newcomer is always kept. A delivery in flight is never pruned.
import { createHmac, randomBytes } from 'node:crypto';
import type { WebhookRow } from './controldb.ts';
import type { EventRow } from './electiondb.ts';
import type { Env } from './env.ts';
import { open as unseal, seal } from './kek.ts';
import { TargetRejected, httpsTransport, systemResolver, validateTarget, type WebhookResolver, type WebhookTransport } from './ssrf.ts';
import { randomId, toIso } from './util.ts';

export const WEBHOOK_EVENTS = ['entry', 'checkpoint', 'phase', 'witness', 'alert'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookView {
  webhook_id: string;
  url: string;
  events: string[];
  election_id: string | null;
  created_at: string;
  disabled: boolean;
}

export interface WebhookStats {
  delivered: number;
  failed: number;
  retries: number;
  dropped: number;
  blocked: number;
  disabled: number;
}

interface Job {
  hookId: string;
  deliveryId: string;
  body: string;
  eventType: string;
  attempt: number;
}

export function signDelivery(secret: string, timestamp: number, deliveryId: string, body: string): string {
  return 'v1=' + createHmac('sha256', secret).update(`${timestamp}.${deliveryId}.${body}`).digest('hex');
}

export class WebhookService {
  readonly stats: WebhookStats = { delivered: 0, failed: 0, retries: 0, dropped: 0, blocked: 0, disabled: 0 };
  private readonly env: Env;
  private readonly resolve: WebhookResolver;
  private readonly transport: WebhookTransport;
  /** Deliveries ready to send (their rows are in control.webhook_outbox). */
  private readonly queue: Job[] = [];
  /** Retry timers, keyed by delivery id. */
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** Deliveries whose send is in progress (never pruned). */
  private readonly flying = new Set<string>();
  private stopped = false;
  private idleWaiters: (() => void)[] = [];

  constructor(env: Env) {
    this.env = env;
    this.resolve = env.cfg.webhookResolver ?? systemResolver;
    this.transport = env.cfg.webhookTransport ?? httpsTransport();
    this.restore();
  }

  // ------------------------------------------------------------------ management

  /** Validates the target (throws TargetRejected) and stores the sealed URL and a fresh secret. The secret is returned once. */
  async create(orgId: string, url: string, events: readonly string[], electionId: string | undefined): Promise<{ row: WebhookRow; secret: string }> {
    const t = await validateTarget(url, this.resolve);
    const id = randomId();
    const secret = 'whsec_' + randomBytes(32).toString('base64url');
    const row = {
      webhook_id: id, org_id: orgId, election_id: electionId ?? null,
      url_enc: seal(this.env.kek, new TextEncoder().encode(t.url.href), `webhook:${id}:url`),
      secret_enc: seal(this.env.kek, new TextEncoder().encode(secret), `webhook:${id}:secret`),
      events: JSON.stringify([...new Set(events)].sort()),
    };
    this.env.control.insertWebhook(row);
    return { row: this.env.control.webhook(id)!, secret };
  }

  view(r: WebhookRow): WebhookView {
    return {
      webhook_id: r.webhook_id, url: this.urlOf(r), events: JSON.parse(r.events) as string[], election_id: r.election_id,
      created_at: toIso(r.created_at / 1000), disabled: r.disabled_at !== null,
    };
  }

  private urlOf(r: WebhookRow): string {
    return new TextDecoder().decode(unseal(this.env.kek, r.url_enc, `webhook:${r.webhook_id}:url`));
  }
  private secretOf(r: WebhookRow): string {
    return new TextDecoder().decode(unseal(this.env.kek, r.secret_enc, `webhook:${r.webhook_id}:secret`));
  }

  // ------------------------------------------------------------------ fan-out

  /** Env.onEvent hook: enqueue one delivery per matching, enabled webhook. Never throws. */
  onEvent(who: { electionId: string; orgId: string }, ev: EventRow): void {
    if (this.stopped) return;
    let hooks: WebhookRow[];
    try {
      hooks = this.env.control.webhooksFor(who.orgId, who.electionId);
    } catch {
      return;
    }
    for (const h of hooks) {
      let types: string[];
      try {
        types = JSON.parse(h.events) as string[];
      } catch {
        continue;
      }
      if (!types.includes(ev.type)) continue;
      const deliveryId = `${h.webhook_id}.${who.electionId}.${ev.id}`;
      const body = JSON.stringify({
        id: deliveryId, election_id: who.electionId, event_id: ev.id, type: ev.type, seq: ev.seq, ts: toIso(ev.ts / 1000), data: JSON.parse(ev.data) as unknown,
      });
      if (Buffer.byteLength(body) > this.env.cfg.webhookMaxBodyBytes) {
        this.stats.dropped++;
        continue;
      }
      try {
        this.admit({ hookId: h.webhook_id, deliveryId, body, eventType: ev.type, attempt: 1 });
      } catch {
        this.stats.dropped++; // storage failure: the delivery is not queued (the public log remains the source of truth)
      }
    }
  }

  /**
   * Persists a new delivery and queues it. Enforces `webhookMaxQueue` by pruning the oldest pending rows, all in one transaction.
   * Rows pruned from memory are cancelled here; a pruned in-flight delivery is handled in run().
   */
  private admit(j: Job): void {
    const ctl = this.env.control;
    const max = this.env.cfg.webhookMaxQueue;
    const pruned = ctl.tx(() => {
      const gone = ctl.outboxPruneTo(max - 1, this.flying); // leave room for the newcomer
      ctl.outboxInsert({ delivery_id: j.deliveryId, webhook_id: j.hookId, event_type: j.eventType, body: j.body, attempt: j.attempt, next_at: this.env.cfg.now() });
      return gone;
    });
    for (const id of pruned) {
      this.forget(id);
      this.stats.dropped++;
    }
    this.queue.push(j);
    this.pump();
  }

  /** Cancels the in-memory state of a delivery whose row was removed. */
  private forget(deliveryId: string): void {
    const t = this.timers.get(deliveryId);
    if (t !== undefined) {
      clearTimeout(t);
      this.timers.delete(deliveryId);
    }
    const i = this.queue.findIndex((q) => q.deliveryId === deliveryId);
    if (i >= 0) this.queue.splice(i, 1);
    this.checkIdle();
  }

  /** Reloads the persisted outbox at startup: due deliveries are queued now, the rest get a timer for their scheduled time. */
  private restore(): void {
    const ctl = this.env.control;
    this.stats.dropped += ctl.outboxPruneTo(this.env.cfg.webhookMaxQueue).length; // the cap may have been lowered
    const now = this.env.cfg.now();
    for (const r of ctl.outboxAll()) {
      const j: Job = { hookId: r.webhook_id, deliveryId: r.delivery_id, body: r.body, eventType: r.event_type, attempt: r.attempt };
      const delay = Math.max(0, r.next_at - now);
      if (delay === 0) this.queue.push(j);
      else this.schedule(j, delay);
    }
    this.pump();
  }

  private schedule(j: Job, delayMs: number): void {
    const t = setTimeout(() => {
      this.timers.delete(j.deliveryId);
      if (this.stopped) return;
      this.queue.push(j);
      this.pump();
    }, delayMs);
    t.unref();
    this.timers.set(j.deliveryId, t);
  }

  private pump(): void {
    while (!this.stopped && this.flying.size < this.env.cfg.webhookMaxInflight && this.queue.length > 0) {
      const j = this.queue.shift()!;
      this.flying.add(j.deliveryId);
      void this.run(j)
        .catch(() => this.env.logger.event('webhook', { outcome: 'error', note: 'internal' }))
        .finally(() => {
          this.flying.delete(j.deliveryId);
          this.pump();
          this.checkIdle();
        });
    }
    this.checkIdle();
  }

  private checkIdle(): void {
    if (this.flying.size === 0 && this.queue.length === 0 && this.timers.size === 0) {
      const w = this.idleWaiters;
      this.idleWaiters = [];
      for (const f of w) f();
    }
  }

  /** Resolves when nothing is queued, in flight or waiting for a retry. */
  idle(): Promise<void> {
    return new Promise((res) => {
      this.idleWaiters.push(res);
      this.checkIdle();
    });
  }

  /**
   * Stops timers and sends. Pending rows are kept in the outbox, so a later process resumes them. In-flight sends finish;
   * their outcome is recorded (a retry is persisted but not scheduled).
   */
  stop(): void {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.queue.length = 0;
    this.checkIdle();
  }

  // ------------------------------------------------------------------ delivery

  backoffMs(attempt: number): number {
    const c = this.env.cfg;
    return Math.min(c.webhookMaxBackoffMs, c.webhookBackoffBaseMs * 2 ** (attempt - 1));
  }

  private async run(j: Job): Promise<void> {
    const cfg = this.env.cfg;
    const ctl = this.env.control;
    const hook = ctl.webhook(j.hookId);
    if (!hook || hook.disabled_at !== null) {
      ctl.outboxDelete(j.deliveryId); // deleted or disabled meanwhile
      return;
    }
    let outcome: 'ok' | 'retry' | 'fail';
    let note: string;
    try {
      const target = await validateTarget(this.urlOf(hook), this.resolve); // re-validated per attempt: DNS may have changed
      const ts = this.env.nowSec();
      const body = Buffer.from(j.body);
      const res = await this.transport({
        url: target.url, ip: target.ip, family: target.family, body, timeoutMs: cfg.webhookTimeoutMs, maxResponseBytes: cfg.webhookMaxResponseBytes,
        headers: {
          'Content-Type': 'application/json', 'User-Agent': 'QuietVote-Webhook/1', 'QV-Webhook-Id': j.deliveryId, 'QV-Webhook-Event': j.eventType,
          'QV-Webhook-Timestamp': String(ts), 'QV-Webhook-Signature': signDelivery(this.secretOf(hook), ts, j.deliveryId, j.body),
        },
      });
      if (res.status >= 200 && res.status < 300) [outcome, note] = ['ok', 'delivered'];
      else if (res.status === 408 || res.status === 429 || res.status >= 500) [outcome, note] = ['retry', `status_${res.status}`];
      else [outcome, note] = ['fail', `status_${res.status}`]; // 3xx is never followed; other 4xx will not improve by retrying
    } catch (e) {
      if (e instanceof TargetRejected) {
        const transient = e.code === 'DNS_FAILED';
        [outcome, note] = [transient ? 'retry' : 'fail', e.code.toLowerCase()];
        if (!transient) this.stats.blocked++;
      } else [outcome, note] = ['retry', 'transport_error'];
    }
    if (outcome === 'ok') {
      this.stats.delivered++;
      ctl.outboxDelete(j.deliveryId);
      ctl.setWebhookFailures(j.hookId, 0);
      this.env.logger.event('webhook', { outcome: 'ok', note });
      return;
    }
    if (outcome === 'retry' && j.attempt < cfg.webhookMaxAttempts) {
      const delay = this.backoffMs(j.attempt);
      // The row carries the next attempt and its time before anything is scheduled, so a restart cannot lose it.
      if (!ctl.outboxReschedule(j.deliveryId, j.attempt + 1, cfg.now() + delay)) return; // pruned meanwhile: never retried
      this.stats.retries++;
      if (!this.stopped) this.schedule({ ...j, attempt: j.attempt + 1 }, delay);
      return;
    }
    ctl.outboxDelete(j.deliveryId);
    this.stats.failed++;
    this.env.logger.event('webhook', { outcome: 'error', note: `${note} after ${j.attempt}` });
    // Read fresh: concurrent in-flight deliveries of one hook must not overwrite each other's count (no await since the read).
    const n = ctl.setWebhookFailures(j.hookId, (ctl.webhook(j.hookId)?.failures ?? 0) + 1);
    if (n >= cfg.webhookDisableAfter) {
      ctl.disableWebhook(j.hookId);
      ctl.setWebhookFailures(j.hookId, 0);
      this.stats.disabled++;
      this.env.logger.event('webhook', { outcome: 'error', note: 'disabled_after_failures' });
    }
  }
}
