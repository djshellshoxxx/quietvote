// SSRF-safe webhook targets (QV-09 §13 "Webhook SSRF": block private ranges, DNS pinning, HTTPS-only, no redirects).
// Policy lives here, separate from delivery, so it is unit-testable without a network.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const MAX_URL_LENGTH = 2048;
/** Only these ports are accepted; well-known service ports (ssh, smtp, databases...) are never webhook targets. */
export const ALLOWED_PORTS: ReadonlySet<number> = new Set([443, 8443]);

export class TargetRejected extends Error {
  readonly code: string;
  constructor(code: string, detail: string) {
    super(detail);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------------- address classes

function v4ToInt(a: string): number | undefined {
  const p = a.split('.');
  if (p.length !== 4) return undefined;
  let n = 0;
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return undefined;
    n = n * 256 + Number(x);
  }
  return n;
}

const V4_BLOCKED: readonly [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function v4Public(n: number): boolean {
  for (const [base, bits] of V4_BLOCKED) {
    const b = v4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((n & mask) >>> 0) === ((b & mask) >>> 0)) return false;
  }
  return true;
}

/** Expands an IPv6 literal (optionally with a dotted-quad tail) to eight 16-bit groups. */
function v6Groups(a: string): number[] | undefined {
  if (a.includes('%')) return undefined; // zone ids are never acceptable
  let s = a.toLowerCase();
  const dot = s.lastIndexOf('.');
  if (dot >= 0) {
    const colon = s.lastIndexOf(':');
    const n = v4ToInt(s.slice(colon + 1));
    if (n === undefined) return undefined;
    s = `${s.slice(0, colon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return undefined;
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const tail = halves.length === 2 ? (halves[1] === '' ? [] : halves[1]!.split(':')) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return undefined;
  const all = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (all.length !== 8) return undefined;
  const out: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return undefined;
    out.push(parseInt(g, 16));
  }
  return out;
}

function v6Public(g: number[]): boolean {
  const [a, b, c, d, e, f, x, y] = g as [number, number, number, number, number, number, number, number];
  const embedded = ((x << 16) | y) >>> 0;
  const lead5Zero = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;
  if (lead5Zero && f === 0xffff) return v4Public(embedded); // ::ffff:a.b.c.d (IPv4-mapped)
  if (lead5Zero && f === 0) return false; // ::, ::1, IPv4-compatible
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return v4Public(embedded); // 64:ff9b::/96 NAT64
  if (a === 0x2002) return v4Public(((b << 16) | c) >>> 0); // 6to4 embeds the IPv4 address
  if ((a & 0xe000) !== 0x2000) return false; // only global unicast 2000::/3 is routable
  if (a === 0x2001 && b === 0) return false; // Teredo
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x2001 && b >= 0x10 && b <= 0x2f) return false; // ORCHID / ORCHIDv2
  if (a === 0x2001 && b === 0x0002 && c === 0) return false; // benchmarking
  if (a === 0x3fff) return false; // documentation (RFC 9637)
  return true;
}

/** True only for globally routable unicast addresses. Anything unparseable is not public. */
export function isPublicIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return n !== undefined && v4Public(n);
  }
  if (fam === 6) {
    const g = v6Groups(ip);
    return g !== undefined && v6Public(g);
  }
  return false;
}

// ---------------------------------------------------------------------------------------------- URL policy

export interface Resolved {
  address: string;
  family: 4 | 6;
}
export type WebhookResolver = (host: string) => Promise<Resolved[]>;

/** Default resolver: every address the name maps to, bounded by a deadline. */
export const systemResolver: WebhookResolver = async (host) => {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error('dns timeout')), 3000);
    timer.unref();
  });
  try {
    const r = await Promise.race([dnsLookup(host, { all: true, verbatim: true }), deadline]);
    return r.map((x) => ({ address: x.address, family: x.family === 6 ? 6 : 4 }));
  } finally {
    clearTimeout(timer);
  }
};

export interface Target {
  url: URL;
  host: string;
  port: number;
  /** Validated addresses; the connection is pinned to the first one (no second lookup). */
  ip: string;
  family: 4 | 6;
}

const BAD_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.intranet', '.lan', '.home', '.corp', '.private', '.home.arpa', '.arpa', '.onion'];

/** Static checks that need no DNS. */
export function parseTargetUrl(raw: string): { url: URL; host: string; port: number; literal: string | undefined } {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) throw new TargetRejected('URL_INVALID', 'url must be 1..2048 characters');
  if (/[\u0000- \u007f\\]/.test(raw)) throw new TargetRejected('URL_INVALID', 'url contains forbidden characters');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TargetRejected('URL_INVALID', 'url does not parse');
  }
  if (url.protocol !== 'https:') throw new TargetRejected('URL_NOT_HTTPS', 'only https URLs are accepted');
  if (url.username !== '' || url.password !== '') throw new TargetRejected('URL_CREDENTIALS', 'credentials in the url are not accepted');
  const port = url.port === '' ? 443 : Number(url.port);
  if (!ALLOWED_PORTS.has(port)) throw new TargetRejected('URL_PORT', 'port must be 443 or 8443');
  // WHATWG URL already canonicalises 0x7f.1, 2130706433, 017700000001 and [::ffff:7f00:1] forms
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host === '') throw new TargetRejected('URL_INVALID', 'url has no host');
  if (host.endsWith('.')) host = host.slice(0, -1);
  const fam = isIP(host);
  if (fam !== 0) {
    if (!isPublicIp(host)) throw new TargetRejected('TARGET_BLOCKED', 'target address is not publicly routable');
    return { url, host, port, literal: host };
  }
  if (host === 'localhost' || !host.includes('.') || BAD_SUFFIXES.some((s) => host.endsWith(s))) throw new TargetRejected('TARGET_BLOCKED', 'host name is not publicly resolvable');
  // an all-numeric last label cannot be a TLD; it is an obfuscated IP literal the URL parser did not canonicalise
  if (/^\d+$/.test(host.slice(host.lastIndexOf('.') + 1))) throw new TargetRejected('TARGET_BLOCKED', 'host looks like an obfuscated address');
  return { url, host, port, literal: undefined };
}

/**
 * Full validation: static policy, then resolution; EVERY resolved address must be public (a name with one private A record
 * is rejected, so DNS rebinding tricks that mix records cannot succeed). Called at registration and again before each delivery.
 */
export async function validateTarget(raw: string, resolve: WebhookResolver): Promise<Target> {
  const p = parseTargetUrl(raw);
  if (p.literal !== undefined) return { url: p.url, host: p.host, port: p.port, ip: p.literal, family: isIP(p.literal) === 6 ? 6 : 4 };
  let addrs: Resolved[];
  try {
    addrs = await resolve(p.host);
  } catch {
    throw new TargetRejected('DNS_FAILED', 'host name did not resolve');
  }
  if (addrs.length === 0 || addrs.length > 32) throw new TargetRejected('DNS_FAILED', 'host name did not resolve to a usable address set');
  for (const a of addrs) if (!isPublicIp(a.address)) throw new TargetRejected('TARGET_BLOCKED', 'host resolves to a non-public address');
  const first = addrs[0]!;
  return { url: p.url, host: p.host, port: p.port, ip: first.address, family: isIP(first.address) === 6 ? 6 : 4 };
}

// ---------------------------------------------------------------------------------------------- transport

export interface WebhookRequest {
  url: URL;
  /** Already validated; the socket connects here regardless of what DNS says now. */
  ip: string;
  family: 4 | 6;
  headers: Record<string, string>;
  body: Buffer;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface WebhookResponse {
  status: number;
  /** The response body exceeded maxResponseBytes and the connection was dropped. */
  truncated: boolean;
}
export type WebhookTransport = (r: WebhookRequest) => Promise<WebhookResponse>;

/**
 * POST over TLS to a pinned address with certificate and host name verification against the URL's host.
 * Redirects are never followed (node:https does not follow; 3xx is returned as a status). One overall deadline bounds
 * connect + TLS + headers + body; the response body is read only up to maxResponseBytes.
 */
export function httpsTransport(tls: { ca?: string | Buffer } = {}): WebhookTransport {
  return (r) =>
    new Promise<WebhookResponse>((resolve, reject) => {
      let done = false;
      const finish = (fn: () => void): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn();
      };
      const literal = isIP(r.url.hostname.replace(/^\[|\]$/g, '')) !== 0;
      const req = httpsRequest({
        method: 'POST', hostname: r.url.hostname.replace(/^\[|\]$/g, ''), port: Number(r.url.port || 443), path: r.url.pathname + r.url.search,
        headers: { ...r.headers, 'Content-Length': String(r.body.length), Connection: 'close' },
        agent: false, maxHeaderSize: 16 * 1024, rejectUnauthorized: true, minVersion: 'TLSv1.2',
        ...(literal ? {} : { servername: r.url.hostname }),
        ...(tls.ca !== undefined ? { ca: tls.ca } : {}),
        lookup: ((_h: string, o: { all?: boolean }, cb: (...a: unknown[]) => void) => {
          if (o?.all) cb(null, [{ address: r.ip, family: r.family }]);
          else cb(null, r.ip, r.family);
        }) as never,
      });
      const timer = setTimeout(() => {
        finish(() => reject(new Error('timeout')));
        req.destroy();
      }, r.timeoutMs);
      timer.unref();
      req.on('error', (e) => finish(() => reject(e)));
      req.on('response', (res) => {
        let n = 0;
        const status = res.statusCode ?? 0;
        if (r.maxResponseBytes === 0) {
          finish(() => resolve({ status, truncated: false }));
          res.destroy();
          return;
        }
        res.on('data', (ch: Buffer) => {
          n += ch.length;
          if (n > r.maxResponseBytes) {
            finish(() => resolve({ status, truncated: true }));
            res.destroy();
            req.destroy();
          }
        });
        res.on('end', () => finish(() => resolve({ status, truncated: false })));
        res.on('error', () => finish(() => resolve({ status, truncated: false })));
        res.on('close', () => finish(() => resolve({ status, truncated: false })));
      });
      req.end(r.body);
    });
}
