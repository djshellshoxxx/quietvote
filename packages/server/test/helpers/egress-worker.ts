// Test-only process boundary: install guards before importing any server module.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import { parentPort, workerData } from 'node:worker_threads';
import type { ServerOptions } from '../../src/config.ts';

interface Boot { dir: string; clock: SharedArrayBuffer; witness: string; localTls?: { port: number; ca: string } }
interface Attempt { api: string; allowed: boolean; target: string; pinned?: string }
const boot = workerData as Boot, port = parentPort;
assert.ok(port);
const clock = new BigInt64Array(boot.clock), calls: Attempt[] = [], local = new AsyncLocalStorage<boolean>();
const HOST = 'hooks.egress.example', PIN = '93.184.216.34';
const guarded = Symbol('egress-test-guard');
let binding = false, bindLookups = 0, rebind = false, stopped = false;
const guards = new Map<string, () => unknown>();
function note(api: string, allowed: boolean, target: string, pinned?: string): void {
  calls.push({ api, allowed, target, ...(pinned === undefined ? {} : { pinned }) });
  if (!allowed) throw new Error(`egress guard refused ${api}: ${target}`);
}
function patch(object: object, name: string, replace: (original: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown): void {
  const slots = object as Record<string, unknown>, original = slots[name];
  assert.equal(typeof original, 'function');
  const replacement = replace(original as (...args: unknown[]) => unknown);
  Object.defineProperty(replacement, guarded, { value: true }); slots[name] = replacement;
}
function options(args: unknown[]): Record<string, unknown> {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first !== null && typeof first === 'object') return first as Record<string, unknown>;
  return { port: first, host: args[1] };
}
function socketGuard(api: string, original: (...args: unknown[]) => unknown) {
  return function (this: unknown, ...args: unknown[]): unknown {
    const o = options(args), host = String(o['host'] ?? o['hostname'] ?? ''), destination = `${host}:${String(o['port'])}`;
    const allowed = boot.localTls !== undefined && local.getStore() === true
      && Number(o['port']) === boot.localTls.port && (host === HOST || host === '127.0.0.1');
    note(api, allowed, destination);
    return Reflect.apply(original, this, args);
  };
}
for (const name of ['connect', 'createConnection']) patch(net, name, (original) => socketGuard(`net.${name}`, original));
patch(net.Socket.prototype, 'connect', (original) => socketGuard('net.Socket.connect', original));
patch(tls, 'connect', (original) => socketGuard('tls.connect', original));
for (const [mod, name] of [[http, 'http'], [https, 'https']] as const) {
  for (const method of ['request', 'get']) patch(mod, method, (original) => function (this: unknown, ...args: unknown[]): unknown {
    const o = options(args), host = String(o['hostname'] ?? o['host'] ?? ''), api = `${name}.${method}`;
    const allowed = name === 'https' && method === 'request' && boot.localTls !== undefined
      && host === HOST && Number(o['port']) === 8443 && o['method'] === 'POST' && o['path'] === '/hook';
    // The real transport must use the address accepted by validateTarget. Only after
    // checking its pinned lookup do we map this one connection to a local TLS listener.
    let pinned: string | undefined;
    if (allowed) {
      assert.equal(typeof o['lookup'], 'function');
      (o['lookup'] as (...args: unknown[]) => void)(HOST, { all: true }, (error: unknown, addresses: unknown) => {
        assert.equal(error, null); assert.deepEqual(addresses, [{ address: PIN, family: 4 }]); pinned = PIN;
      });
      assert.equal(pinned, PIN); assert.equal(o['servername'], HOST); assert.equal(o['rejectUnauthorized'], true);
    }
    note(api, allowed, `${host}:${String(o['port'])}${String(o['path'] ?? '')}`, pinned);
    const mapped = {
      ...o, port: boot.localTls!.port, ca: boot.localTls!.ca,
      lookup: (_host: string, opt: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (opt?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
        else callback(null, '127.0.0.1', 4);
      },
    };
    return local.run(true, () => Reflect.apply(original, this, [mapped, ...args.slice(1)]));
  });
}

const dnsMethods = ['lookup', 'lookupService', 'resolve', 'resolveAny', 'resolve4', 'resolve6', 'resolveCaa', 'resolveCname', 'resolveMx',
  'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse'];
for (const [mod, name] of [[dns, 'dns'], [dnsPromises, 'dns/promises']] as const) {
  for (const method of dnsMethods) {
    if (typeof (mod as unknown as Record<string, unknown>)[method] !== 'function') continue;
    patch(mod, method, () => (...args: unknown[]): unknown => {
      const host = String(args[0]);
      // Server.listen asks lookup for its numeric bind address. This is inbound setup,
      // performs no DNS/network I/O, and is counted separately from outgoing attempts.
      if (name === 'dns' && method === 'lookup' && binding && host === '127.0.0.1') {
        bindLookups++;
        const all = typeof args[1] === 'object' && (args[1] as { all?: boolean }).all;
        const callback = args.at(-1) as (...items: unknown[]) => void;
        queueMicrotask(() => all ? callback(null, [{ address: host, family: 4 }]) : callback(null, host, 4)); return;
      }
      const allowed = name === 'dns/promises' && method === 'lookup' && boot.localTls !== undefined
        && (host === HOST || host === 'blocked.egress.example');
      note(`${name}.${method}`, allowed, host);
      assert.deepEqual(args[1], { all: true, verbatim: true });
      return Promise.resolve([{ address: host === HOST && !rebind ? PIN : '127.0.0.1', family: 4 }]);
    });
  }
  // Resolver instances use native DNS directly, rather than module lookup or net.Socket.
  for (const method of dnsMethods) {
    const proto = mod.Resolver.prototype as unknown as Record<string, unknown>;
    if (typeof proto[method] !== 'function') continue;
    patch(proto, method, () => (...args: unknown[]): never => {
      note(`${name}.Resolver.${method}`, false, String(args[0])); throw new Error('unreachable');
    });
  }
}
globalThis.fetch = (() => { note('fetch', false, 'probe-or-server-request'); throw new Error('unreachable'); }) as typeof fetch;
syncBuiltinESMExports();

// Probe the actual ESM exports, including aliases a server module can capture at import time.
const esmNet = await import('node:net'), esmTls = await import('node:tls');
const esmHttp = await import('node:http'), esmHttps = await import('node:https');
for (const [mod, name] of [[esmHttp, 'http'], [esmHttps, 'https']] as const) {
  for (const method of ['request', 'get'] as const) guards.set(`${name}.${method}`, () => mod[method]({ hostname: '127.0.0.1', port: 1 }));
}
guards.set('net.connect', () => esmNet.connect({ host: '127.0.0.1', port: 1 }));
guards.set('net.createConnection', () => esmNet.createConnection({ host: '127.0.0.1', port: 1 }));
guards.set('net.Socket.connect', () => { const socket = new esmNet.Socket(); try { socket.connect({ host: '127.0.0.1', port: 1 }); } finally { socket.destroy(); } });
guards.set('tls.connect', () => esmTls.connect({ host: '127.0.0.1', port: 1 }));
guards.set('fetch', () => fetch('http://127.0.0.1:1/'));
for (const [mod, name] of [[await import('node:dns'), 'dns'], [await import('node:dns/promises'), 'dns/promises']] as const) {
  for (const method of dnsMethods) {
    const fn = (mod as unknown as Record<string, unknown>)[method];
    if (typeof fn === 'function') {
      assert.equal((fn as unknown as Record<symbol, unknown>)[guarded], true, `unguarded ${name}.${method}`);
      guards.set(`${name}.${method}`, () => Reflect.apply(fn, mod, ['guard-probe.invalid']));
    }
    const resolver = new mod.Resolver(), member = (resolver as unknown as Record<string, unknown>)[method];
    if (typeof member === 'function') {
      assert.equal((member as unknown as Record<symbol, unknown>)[guarded], true, `unguarded ${name}.Resolver.${method}`);
      guards.set(`${name}.Resolver.${method}`, () => Reflect.apply(member, resolver, ['guard-probe.invalid']));
    }
  }
}

const { buildServer } = await import('../../src/index.ts');
const rate = { limit: 100_000, windowSec: 60 };
const cfg: ServerOptions = {
  dataDir: boot.dir, host: '127.0.0.1', port: 0, now: () => Number(Atomics.load(clock, 0)), logSink: () => undefined,
  minFreeBytes: 0, minBallotIntervalSec: 2, auditWindowSec: 0, witnesses: [{ name: 'w1', publicKey: boot.witness }],
  rate: { read: rate, proof: rate, writeKey: rate, writePre: rate, auth: rate, manage: rate, export: rate, gossip: rate, inviteFail: rate },
  // No resolver/transport override: exercise the real systemResolver and httpsTransport imports.
};
const server = buildServer(cfg);
binding = true;
const address = await server.start();
binding = false;
const state = () => ({ calls: [...calls], bindLookups, stats: { ...server.webhooks.stats }, outbox: stopped ? null : server.env.control.outboxCount() });
port.postMessage({ id: 0, ok: true, value: { ...address, ...state() } });
port.on('message', async ({ id, op }: { id: number; op: string }) => {
  try {
    if (op === 'probe') {
      for (const [api, probe] of guards) await assert.rejects(async () => { await probe(); }, new RegExp(`egress guard refused ${api.replaceAll('.', '\\.')}`));
    } else if (op === 'clear') calls.length = 0;
    else if (op === 'rebind') rebind = true;
    else if (op === 'idle') { await server.webhooks.idle(); await server.gossip.runOnce(); }
    else if (op === 'stop') { await server.stop(); stopped = true; }
    else throw new Error(`unknown test command ${op}`);
    port.postMessage({ id, ok: true, value: { ...state(), ...(op === 'probe' ? { guards: [...guards.keys()] } : {}) } });
    if (op === 'stop') port.close();
  } catch (error) {
    port.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
