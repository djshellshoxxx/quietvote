// Outbound webhooks (QV-09 §6.3, QV-09-REQ-014): public events only, HMAC-signed, retried with exponential backoff.
//
// Delivery contract (also in NOTES.md):
//   POST <url>   Content-Type: application/json
//   QV-Webhook-Id         stable id of this delivery; identical across retries (receivers dedupe on it)
//   QV-Webhook-Timestamp  unix seconds at signing (fresh on every attempt)
//   QV-Webhook-Signature  "v1=" + hex(HMAC-SHA256(secret, `${timestamp}.${id}.${body}`))
// Targets are validated (ssrf.ts) at registration and again immediately before every attempt, and the socket connects to the
// address that was validated. The retry queue is in memory and bounded; a restart drops pending retries (the SSE outbox and the
// public log remain the source of truth).
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
  private readonly queue: Job[] = [];
  private readonly waiting = new Set<NodeJS.Timeout>();
  private readonly failures = new Map<string, number>();
  private inflight = 0;
  private stopped = false;
  private idleWaiters: (() => void)[] = [];

  constructor(env: Env) {
    this.env = env;
    this.resolve = env.cfg.webhookResolver ?? systemResolver;
    this.transport = env.cfg.webhookTransport ?? httpsTransport();
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
      this.enqueue({ hookId: h.webhook_id, deliveryId, body, eventType: ev.type, attempt: 1 });
    }
  }

  private pendingCount(): number {
    return this.queue.length + this.waiting.size;
  }

  private enqueue(j: Job): void {
    const max = this.env.cfg.webhookMaxQueue;
    while (this.queue.length >= max || this.pendingCount() >= max) {
      if (this.queue.length === 0) {
        this.stats.dropped++; // everything pending is waiting on timers: refuse the newcomer instead
        return;
      }
      this.queue.shift();
      this.stats.dropped++;
    }
    this.queue.push(j);
    this.pump();
  }

  private pump(): void {
    while (!this.stopped && this.inflight < this.env.cfg.webhookMaxInflight && this.queue.length > 0) {
      const j = this.queue.shift()!;
      this.inflight++;
      void this.run(j).finally(() => {
        this.inflight--;
        this.pump();
        this.checkIdle();
      });
    }
    this.checkIdle();
  }

  private checkIdle(): void {
    if (this.inflight === 0 && this.queue.length === 0 && this.waiting.size === 0) {
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

  stop(): void {
    this.stopped = true;
    for (const t of this.waiting) clearTimeout(t);
    this.waiting.clear();
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
    const hook = this.env.control.webhook(j.hookId);
    if (!hook || hook.disabled_at !== null) return; // deleted or disabled meanwhile
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
      this.failures.delete(j.hookId);
      this.env.logger.event('webhook', { outcome: 'ok', note });
      return;
    }
    if (outcome === 'retry' && j.attempt < cfg.webhookMaxAttempts && !this.stopped) {
      this.stats.retries++;
      const t = setTimeout(() => {
        this.waiting.delete(t);
        this.enqueue({ ...j, attempt: j.attempt + 1 });
      }, this.backoffMs(j.attempt));
      t.unref();
      this.waiting.add(t);
      return;
    }
    this.stats.failed++;
    this.env.logger.event('webhook', { outcome: 'error', note: `${note} after ${j.attempt}` });
    const n = (this.failures.get(j.hookId) ?? 0) + 1;
    this.failures.set(j.hookId, n);
    if (n >= cfg.webhookDisableAfter) {
      this.env.control.disableWebhook(j.hookId);
      this.failures.delete(j.hookId);
      this.stats.disabled++;
      this.env.logger.event('webhook', { outcome: 'error', note: 'disabled_after_failures' });
    }
  }
}
