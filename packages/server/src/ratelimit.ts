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
 * First four 16-bit groups of an IPv6 text address, after expanding `::`. Node prints zero runs compressed, so taking the first
 * four colon-separated tokens of the text would mix host bits into the "network" part (e.g. 2001:db8::1:2:3:4) and hand one /64
 * an almost unlimited number of buckets. Unparseable input falls back to the whole string (a finer bucket cannot be chosen by a
 * client: the socket address is set by the kernel).
 */
export function v6Prefix64(addr: string): string {
  let s = addr.toLowerCase();
  const z = s.indexOf('%');
  if (z >= 0) s = s.slice(0, z);
  if (s.includes('.')) {
    const c = s.lastIndexOf(':');
    const q = s.slice(c + 1).split('.').map(Number);
    if (q.length !== 4 || q.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return addr;
    s = `${s.slice(0, c + 1)}${((q[0]! << 8) | q[1]!).toString(16)}:${((q[2]! << 8) | q[3]!).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return addr;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const tail = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return addr;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return addr;
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':');
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
      else prefix = v6Prefix64(a); // IPv6: /64 (coarser than the spec's /56 but never finer; see NOTES)
    }
    return createHmac('sha256', this.key).update(prefix).digest('base64url').slice(0, 22);
  }
}
