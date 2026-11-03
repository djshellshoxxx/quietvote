// In-memory token buckets and network buckets (QV-29 §6.2). Nothing here is ever persisted or logged.
import { createHmac, randomBytes } from 'node:crypto';
import type { RateSpec } from './config.ts';

export interface Take {
  ok: boolean;
  limit: number;
  remaining: number;
  resetSec: number;
  retryAfterSec: number;
}

interface B {
  tokens: number;
  at: number;
}

export class RateLimiter {
  private readonly m = new Map<string, B>();
  private readonly now: () => number;
  private readonly max: number;
  constructor(now: () => number, maxEntries = 100_000) {
    this.now = now;
    this.max = maxEntries;
  }

  take(key: string, spec: RateSpec, cost = 1): Take {
    const t = this.now();
    const cap = spec.burst ?? spec.limit;
    const perMs = spec.limit / (spec.windowSec * 1000);
    let b = this.m.get(key);
    if (b === undefined) b = { tokens: cap, at: t };
    else {
      b.tokens = Math.min(cap, b.tokens + Math.max(0, t - b.at) * perMs);
      b.at = t;
      this.m.delete(key);
    }
    const ok = b.tokens >= cost;
    if (ok) b.tokens -= cost;
    this.m.set(key, b); // re-insert: Map order = recency
    if (this.m.size > this.max) {
      const oldest = this.m.keys().next().value;
      if (oldest !== undefined) this.m.delete(oldest);
    }
    const need = ok ? 0 : cost - b.tokens;
    const retry = ok ? 0 : Math.max(1, Math.ceil(need / perMs / 1000));
    return {
      ok, limit: spec.limit, remaining: Math.max(0, Math.floor(b.tokens)),
      resetSec: Math.max(0, Math.ceil((cap - b.tokens) / perMs / 1000)), retryAfterSec: retry,
    };
  }

  get size(): number {
    return this.m.size;
  }
}

/** Sliding failure counter (e.g. failed invite redemptions). */
export class FailureCounter {
  private readonly m = new Map<string, number[]>();
  private readonly now: () => number;
  constructor(now: () => number) {
    this.now = now;
  }
  blocked(key: string, spec: RateSpec): boolean {
    const t = this.now() - spec.windowSec * 1000;
    const a = (this.m.get(key) ?? []).filter((x) => x > t);
    if (a.length === 0) this.m.delete(key);
    else this.m.set(key, a);
    return a.length >= spec.limit;
  }
  fail(key: string): void {
    const a = this.m.get(key) ?? [];
    a.push(this.now());
    this.m.set(key, a);
    if (this.m.size > 100_000) {
      const k = this.m.keys().next().value;
      if (k !== undefined) this.m.delete(k);
    }
  }
}

/**
 * Network bucket = HMAC(epoch key, address prefix): IPv4 /24, IPv6 /56. The epoch key lives only in memory
 * and rotates every 24 h and at process start. A proxy may supply its own already-hashed bucket id instead.
 */
export class BucketKeyer {
  private key: Buffer = randomBytes(32);
  private epoch: number;
  private readonly now: () => number;
  constructor(now: () => number) {
    this.now = now;
    this.epoch = Math.floor(now() / 86_400_000);
  }
  bucket(address: string | undefined, proxyId?: string): string {
    const e = Math.floor(this.now() / 86_400_000);
    if (e !== this.epoch) {
      this.epoch = e;
      this.key = randomBytes(32);
    }
    let prefix = proxyId !== undefined ? `p:${proxyId.slice(0, 128)}` : 'none';
    if (proxyId === undefined && address !== undefined) {
      const a = address.startsWith('::ffff:') ? address.slice(7) : address;
      if (a.includes('.')) prefix = a.split('.').slice(0, 3).join('.');
      else prefix = a.split(':').slice(0, 4).join(':'); // IPv6: /64 (coarser than the spec's /56 but never finer; see NOTES)
    }
    return createHmac('sha256', this.key).update(prefix).digest('base64url').slice(0, 22);
  }
}
