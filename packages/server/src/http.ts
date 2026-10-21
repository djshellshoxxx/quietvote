// HTTP layer: routing, size/time limits, security headers, CORS, rate limits, problem+json. node:http only.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { parseQvJson } from '@quietvote/crypto';
import { authenticate, type AuthInfo } from './auth.ts';
import type { RateConfig } from './config.ts';
import type { Env } from './env.ts';
import { ApiError, problemBody } from './problem.ts';
import { BucketKeyer } from './ratelimit.ts';
import { ELECTION_ID_RE, ORG_ID_RE, type Field } from './util.ts';

export type RateClass = 'R' | 'P' | 'W' | 'A' | 'M' | 'X' | 'G';
const CLASS_KEY: Record<RateClass, keyof RateConfig> = { R: 'read', P: 'proof', W: 'writePre', A: 'auth', M: 'manage', X: 'export', G: 'gossip' };

export interface Reply {
  status: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
  bytes?: Uint8Array;
  contentType?: string;
  etag?: string;
  cache?: string;
}

export interface Ctx {
  env: Env;
  req: IncomingMessage;
  method: string;
  /** Raw request target (path + query), as signed by management clients. */
  target: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  requestId: string;
  bucket: string;
  body: Uint8Array;
  auth: AuthInfo | undefined;
  header(name: string): string | undefined;
  /** Strict-parse the JSON body against a shape (unknown members -> 400 UNKNOWN_FIELD). */
  parse<T>(f: Field<T>): T;
  rawJson(): unknown;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  cls: RateClass;
  /** none: anonymous; sig: signed management request; self: handler authenticates (e.g. org registration). */
  auth: 'none' | 'sig' | 'self';
  body?: 'json' | 'none';
  maxBody?: number;
  cache?: string;
  handler(c: Ctx): Promise<Reply> | Reply;
}

const PARAM_RE: Record<string, RegExp> = {
  id: ELECTION_ID_RE, org: ORG_ID_RE, invite: ORG_ID_RE, seq: /^\d{1,12}$/, kid: /^[A-Za-z0-9_-]{16,64}$/, leaf: /^[A-Za-z0-9_-]{43}$/,
  j: /^\d{1,2}$/, keyid: /^[A-Za-z0-9_-]{16,64}$/,
};

interface Compiled {
  route: Route;
  segs: { lit?: string; param?: string }[];
}

function compile(r: Route): Compiled {
  return { route: r, segs: r.path.split('/').slice(1).map((s) => (s.startsWith(':') ? { param: s.slice(1) } : { lit: s })) };
}

function matchPath(c: Compiled, parts: string[]): Record<string, string> | undefined {
  if (parts.length !== c.segs.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const s = c.segs[i]!;
    const p = parts[i]!;
    if (s.lit !== undefined) {
      if (s.lit !== p) return undefined;
    } else {
      const re = PARAM_RE[s.param!];
      if (!re || !re.test(p)) return undefined;
      params[s.param!] = p;
    }
  }
  return params;
}

export const SEC_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'QV-API-Version': '1.0',
};
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
export const STATIC_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export interface StaticHandler {
  serve(path: string, method: string): Reply | undefined;
}

export interface HttpApp {
  server: Server;
  routes: Route[];
  listen(): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
}

export function createHttpApp(env: Env, routes: Route[], statics?: StaticHandler): HttpApp {
  const cfg = env.cfg;
  const compiled = routes.map(compile);
  const keyer = new BucketKeyer(() => env.nowMs());
  const origins = new Set(cfg.allowedOrigins);
  const https = cfg.publicUrl.startsWith('https://');

  const server = createServer({
    maxHeaderSize: cfg.maxHeaderBytes,
    headersTimeout: cfg.headersTimeoutMs,
    requestTimeout: cfg.requestTimeoutMs,
    keepAliveTimeout: cfg.keepAliveTimeoutMs,
    connectionsCheckingInterval: Math.max(50, Math.min(30_000, Math.floor(Math.min(cfg.headersTimeoutMs, cfg.requestTimeoutMs) / 2))),
    // Node's parser already refuses requests carrying both Content-Length and Transfer-Encoding.
    insecureHTTPParser: false,
    joinDuplicateHeaders: false,
  } as never);
  server.maxConnections = cfg.maxConnections;
  server.maxRequestsPerSocket = cfg.maxRequestsPerSocket;
  server.maxHeadersCount = 64;
  server.on('clientError', (_e, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    else socket.destroy();
  });

  function baseHeaders(requestId: string, https_: boolean): Record<string, string> {
    const h: Record<string, string> = { ...SEC_HEADERS, 'X-Request-Id': requestId };
    if (https_) h['Strict-Transport-Security'] = 'max-age=31536000';
    return h;
  }

  function send(res: ServerResponse, method: string, status: number, headers: Record<string, string>, payload: Uint8Array | undefined): void {
    const h = { ...headers };
    if (payload !== undefined) h['Content-Length'] = String(payload.length);
    else h['Content-Length'] = '0';
    res.writeHead(status, h);
    if (method === 'HEAD' || payload === undefined || status === 304 || status === 204) res.end();
    else res.end(payload);
  }

  async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
    const cl = req.headers['content-length'];
    if (cl !== undefined && Number(cl) > max) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `request body exceeds ${max} bytes`);
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const ch of req) {
      const b = ch as Buffer;
      n += b.length;
      if (n > max) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `request body exceeds ${max} bytes`);
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const t0 = env.nowMs();
    env.stats.requests++;
    const requestId = randomBytes(12).toString('base64url');
    const method = (req.method ?? 'GET').toUpperCase();
    let routeTpl = '-';
    let status = 500;
    let bytesIn = 0;
    let electionId: string | undefined;
    let closeAfter = false;
    const headers: Record<string, string> = baseHeaders(requestId, https);
    let isPublicGet = false;
    let errCode: string | undefined;
    try {
      // ---- request line
      const rawUrl = req.url ?? '/';
      if (rawUrl.length > 2048) throw new ApiError(414, 'URI_TOO_LONG', 'request target too long');
      if (!/^\/[\x21-\x7e]*$/.test(rawUrl) || rawUrl.includes('\\') || /%00/i.test(rawUrl) || rawUrl.startsWith('//')) throw new ApiError(400, 'BAD_REQUEST', 'malformed request target');
      let url: URL;
      try {
        url = new URL(rawUrl, 'http://x');
      } catch {
        throw new ApiError(400, 'BAD_REQUEST', 'malformed request target');
      }
      let parts: string[];
      try {
        parts = url.pathname.split('/').slice(1).map((s) => decodeURIComponent(s));
      } catch {
        throw new ApiError(400, 'BAD_REQUEST', 'malformed percent-encoding');
      }
      if (parts.some((s) => s.includes('\u0000') || s.includes('/') || s === '..' || s === '.')) throw new ApiError(400, 'BAD_REQUEST', 'malformed path');
      const path = '/' + parts.join('/');
      const bucket = keyer.bucket(req.socket.remoteAddress, cfg.bucketHeader ? (req.headers[cfg.bucketHeader.toLowerCase()] as string | undefined) : undefined);

      // ---- routing
      let hit: { c: Compiled; params: Record<string, string> } | undefined;
      const allow = new Set<string>();
      for (const c of compiled) {
        const p = matchPath(c, parts);
        if (p === undefined) continue;
        allow.add(c.route.method);
        if (c.route.method === method || (method === 'HEAD' && c.route.method === 'GET')) hit = { c, params: p };
      }
      if (method === 'OPTIONS') {
        const origin = req.headers.origin;
        const pub = allow.has('GET');
        if (allow.size === 0) throw new ApiError(404, 'NOT_FOUND', 'no such route');
        if (pub) headers['Access-Control-Allow-Origin'] = '*';
        else if (typeof origin === 'string' && origins.has(origin)) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Vary'] = 'Origin';
        }
        headers['Access-Control-Allow-Methods'] = [...allow, 'OPTIONS'].join(', ');
        headers['Access-Control-Allow-Headers'] = 'authorization, content-type, idempotency-key, qv-read-key';
        headers['Access-Control-Max-Age'] = '600';
        status = 204;
        send(res, method, 204, headers, undefined);
        return;
      }
      if (hit === undefined) {
        if (allow.size > 0) {
          headers['Allow'] = [...allow].join(', ');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', `method ${method} not allowed`);
        }
        if ((method === 'GET' || method === 'HEAD') && statics) {
          const r = statics.serve(path, method);
          if (r) {
            status = r.status;
            routeTpl = '(static)';
            const rl = env.limiter.take(`R:${bucket}`, cfg.rate.read);
            if (!rl.ok) throw new ApiError(429, 'RATE_LIMITED', 'too many requests', { retryAfter: rl.retryAfterSec });
            const h: Record<string, string> = { ...headers, 'Content-Type': r.contentType ?? 'application/octet-stream', 'Cache-Control': r.cache ?? 'no-cache', 'Content-Security-Policy': STATIC_CSP };
            if (r.etag) h['ETag'] = r.etag;
            if (r.etag && req.headers['if-none-match'] === r.etag) {
              status = 304;
              send(res, method, 304, h, undefined);
              return;
            }
            send(res, method, r.status, h, r.bytes);
            return;
          }
        }
        throw new ApiError(404, 'NOT_FOUND', 'no such route');
      }
      const route = hit.c.route;
      routeTpl = `${route.method} ${route.path}`;
      electionId = hit.params['id'];
      isPublicGet = route.method === 'GET' && route.auth === 'none';
      headers['Content-Security-Policy'] = API_CSP;
      const origin = req.headers.origin;
      if (isPublicGet) {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Expose-Headers'] = 'ETag, Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, X-Request-Id, QV-API-Version';
        headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
      } else {
        if (typeof origin === 'string' && origins.has(origin)) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Vary'] = 'Origin';
        }
        headers['Cross-Origin-Resource-Policy'] = 'same-origin';
      }

      // ---- rate limit before any body work (QV-29 §6.1: size/headers -> bucket -> ...)
      const rl = env.limiter.take(`${route.cls}:${bucket}`, cfg.rate[CLASS_KEY[route.cls]]);
      headers['RateLimit-Limit'] = String(rl.limit);
      headers['RateLimit-Remaining'] = String(rl.remaining);
      headers['RateLimit-Reset'] = String(rl.resetSec);
      if (!rl.ok) {
        env.logger.limitHit(route.cls);
        headers['Retry-After'] = String(rl.retryAfterSec);
        closeAfter = true;
        throw new ApiError(429, 'RATE_LIMITED', 'too many requests; retry later', { retryAfter: rl.retryAfterSec });
      }

      // ---- body admission
      if (req.headers['content-encoding'] !== undefined && req.headers['content-encoding'] !== 'identity') {
        closeAfter = true;
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'request Content-Encoding is not accepted');
      }
      let body: Buffer = Buffer.alloc(0);
      const expectsBody = route.body === 'json';
      const hasBody = (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0') || req.headers['transfer-encoding'] !== undefined;
      if (!expectsBody && hasBody) {
        closeAfter = true;
        throw new ApiError(400, 'BAD_REQUEST', 'this endpoint takes no request body');
      }
      if (expectsBody) {
        const max = Math.min(route.maxBody ?? cfg.maxJsonBytes, cfg.maxRequestBytes);
        const cl = req.headers['content-length'];
        if (cl !== undefined && Number(cl) > max) {
          closeAfter = true;
          throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `request body exceeds ${max} bytes`);
        }
        if (hasBody) {
          const ct = (req.headers['content-type'] ?? '').toLowerCase().replace(/\s/g, '');
          if (ct !== 'application/json' && ct !== 'application/json;charset=utf-8') {
            closeAfter = true;
            throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
          }
        }
        try {
          body = await readBody(req, max);
        } catch (e) {
          closeAfter = true;
          throw e;
        }
        bytesIn = body.length;
      }

      // ---- authentication (management endpoints)
      let auth: AuthInfo | undefined;
      if (route.auth === 'sig') {
        auth = authenticate(env, method, rawUrl, req.headers.authorization, body);
        const mk = env.limiter.take(`M:${auth.keyId}`, cfg.rate.manage);
        if (!mk.ok) throw new ApiError(429, 'RATE_LIMITED', 'too many management requests', { retryAfter: mk.retryAfterSec });
      }
      const ctx: Ctx = {
        env, req, method, target: rawUrl, path, query: url.searchParams, params: hit.params, requestId, bucket, body, auth,
        header: (n) => {
          const v = req.headers[n.toLowerCase()];
          return Array.isArray(v) ? v[0] : v;
        },
        parse: (f) => f(ctx.rawJson(), ''),
        rawJson: () => {
          if (body.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'request body required');
          try {
            return parseQvJson(body);
          } catch {
            throw new ApiError(400, 'BAD_REQUEST', 'body is not strict JSON');
          }
        },
      };
      const reply = await route.handler(ctx);
      status = reply.status;
      const h: Record<string, string> = { ...headers, ...(reply.headers ?? {}) };
      h['Cache-Control'] = reply.cache ?? route.cache ?? (route.auth === 'none' ? 'no-cache' : 'no-store');
      let payload: Uint8Array | undefined;
      if (reply.json !== undefined) {
        payload = Buffer.from(JSON.stringify(reply.json));
        h['Content-Type'] = reply.contentType ?? 'application/json; charset=utf-8';
      } else if (reply.text !== undefined) {
        payload = Buffer.from(reply.text);
        h['Content-Type'] = reply.contentType ?? 'text/plain; charset=utf-8';
      } else if (reply.bytes !== undefined) {
        payload = reply.bytes;
        h['Content-Type'] = reply.contentType ?? 'application/octet-stream';
      }
      if (reply.etag) {
        h['ETag'] = reply.etag;
        if (req.headers['if-none-match'] === reply.etag && reply.status === 200) {
          status = 304;
          send(res, method, 304, h, undefined);
          return;
        }
      }
      send(res, method, reply.status, h, payload);
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(500, 'INTERNAL', 'internal error');
      if (!(e instanceof ApiError)) env.logger.event('internal_error', { request_id: requestId, route: routeTpl, error_code: (e as Error)?.name ?? 'Error', outcome: 'error' });
      status = err.status;
      errCode = err.code;
      const h: Record<string, string> = { ...headers, 'Content-Type': 'application/problem+json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (err.extra.retryAfter !== undefined) h['Retry-After'] = String(err.extra.retryAfter);
      if (closeAfter) h['Connection'] = 'close';
      if (!res.headersSent) send(res, method, err.status, h, Buffer.from(JSON.stringify(problemBody(err, requestId))));
      else res.destroy();
      if (closeAfter) res.once('finish', () => req.socket.destroy());
    } finally {
      env.logger.event('request', {
        request_id: requestId, route: routeTpl, method, status, outcome: status < 400 ? 'ok' : status < 500 ? 'rejected' : 'error',
        ...(errCode !== undefined ? { error_code: errCode } : {}), bytes_in: bytesIn, latency_ms: env.nowMs() - t0,
        ...(electionId !== undefined ? { election_id: electionId } : {}),
      });
    }
  }

  server.on('request', (req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  return {
    server,
    routes,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(cfg.port, cfg.host, () => {
          const a = server.address();
          resolve({ port: typeof a === 'object' && a ? a.port : cfg.port, host: cfg.host });
        });
      }),
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
