// @verifies QV-06-REQ-015 — real server flow with isolated, instrumented outbound connectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSecureContext } from 'node:tls';
import { Worker } from 'node:worker_threads';
import { bytesToHex } from '@quietvote/crypto';
import { signRecord, verifyElectionText } from '@quietvote/protocol';
import { readTar } from '../src/tar.ts';
import { World } from './helpers/world.ts';

interface Attempt { api: string; allowed: boolean; target: string; pinned?: string }
interface Report {
  calls: Attempt[]; bindLookups: number; stats: { delivered: number; failed: number; blocked: number; retries: number };
  outbox: number | null; url?: string; guards?: string[];
}
interface Reply { id: number; ok: boolean; value: Report; error?: string }
async function isolated(w: World, localTls?: { port: number; ca: string }) {
  const shared = new SharedArrayBuffer(8), clock = new BigInt64Array(shared);
  Atomics.store(clock, 0, BigInt(w.clock));
  const pending = new Map<number, { resolve(value: Report): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  let next = 0, exited = false;
  function wait(id: number): Promise<Report> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`egress worker response ${id} timed out`)); }, 30_000);
      pending.set(id, { resolve, reject, timer });
    });
  }
  const ready = wait(0), worker = new Worker(new URL('./helpers/egress-worker.ts', import.meta.url), {
    workerData: { dir: w.dir, clock: shared, witness: bytesToHex(w.witnesses[0]!.publicKey), ...(localTls ? { localTls } : {}) },
  });
  const fail = (error: Error): void => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear();
  };
  worker.on('error', fail);
  const ended = new Promise<number>((resolve) => worker.on('exit', (code) => { exited = true; fail(new Error(`egress worker exited ${code}`)); resolve(code); }));
  worker.on('message', (reply: Reply) => {
    const p = pending.get(reply.id); if (!p) return;
    pending.delete(reply.id); clearTimeout(p.timer);
    if (reply.ok) p.resolve(reply.value); else p.reject(new Error(reply.error ?? 'egress worker failed'));
  });
  async function send(op: string): Promise<Report> {
    const id = ++next, result = wait(id); worker.postMessage({ id, op }); return result;
  }
  async function dispose(): Promise<void> {
    if (!exited) await worker.terminate();
    await ended; rmSync(w.dir, { recursive: true, force: true });
  }
  try {
    const initial = await ready; assert.deepEqual(initial.calls, [], 'startup has no outbound attempts'); assert.ok(initial.url);
    w.base = initial.url;
    const req = w.req.bind(w);
    w.req = (...args: Parameters<World['req']>) => { Atomics.store(clock, 0, BigInt(w.clock)); return req(...args); };
    w.audience = `qv:${(await w.get('/api/v1/instance')).json.instance_id}@http://localhost`;
    return {
      send, dispose,
      async stop(): Promise<Report> {
        const result = await send('stop'); let timer: NodeJS.Timeout | undefined;
        try {
          const code = await Promise.race([ended, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('egress worker did not exit after shutdown')), 30_000);
          })]);
          assert.equal(code, 0); return result;
        } finally { clearTimeout(timer); }
      },
    };
  } catch (error) { await dispose(); throw error; }
}
async function readyElection(w: World): Promise<void> {
  await w.setupOrgAndElection(); await w.registerVoters();
  assert.equal((await w.publishManifest()).status, 201); await w.ceremony();
}
async function finishElection(w: World): Promise<void> {
  assert.equal((await w.close()).status, 201);
  for (const j of [1, 3]) { const r = await w.trusteeShares(j); assert.equal(r.status, 201, r.text); w.tick(); }
  const draft = await w.get(`/api/v1/elections/${w.electionId}/tally/draft?decrypters=1,3`);
  assert.equal(draft.status, 200, draft.text); const c0 = w.coord[0]!;
  assert.equal((await w.post('tally_result', c0, signRecord(c0.secretKey, c0.publicKey, w.params.ctx, draft.json.body))).status, 201);
  assert.equal((await w.post('audit_close', c0, w.control('audit-close'))).status, 201);
  assert.equal((await w.get(`/api/v1/elections/${w.electionId}/state`)).json.phase, 'ARCHIVED');
}

test('a full election, exports, empty-peer gossip run and shutdown make no outbound attempts', { timeout: 180_000 }, async (t) => {
  const w = new World({ seed: 'egress-default', n: 3, t: 2, voters: 4, witnessQuorum: 0, freshConnections: true });
  const server = await isolated(w);
  try {
    const probes = await server.send('probe');
    assert.ok(probes.guards && probes.guards.length >= 11);
    assert.deepEqual(probes.calls.map((c) => c.api).sort(), [...probes.guards].sort());
    assert.ok(probes.calls.every((c) => !c.allowed));
    t.diagnostic(`${probes.guards.length} connector/DNS guard positive controls were blocked before I/O`);
    for (const api of ['dns.lookup', 'dns/promises.lookup', 'http.request', 'https.request', 'net.connect',
      'net.createConnection', 'net.Socket.connect', 'tls.connect', 'fetch']) assert.ok(probes.guards.includes(api), api);
    assert.deepEqual((await server.send('clear')).calls, []);

    await readyElection(w); assert.equal((await w.open()).status, 201);
    for (let i = 0; i < 4; i++) assert.equal((await w.cast(i, { budget: [i % 2 ? 'yes' : 'no'], chair: ['ann'] })).status, 201);
    assert.equal((await w.cast(1, { budget: ['no'], chair: ['bob'] })).status, 201);
    assert.equal((await w.spoil(2, { budget: ['yes'], chair: ['cy'] }, 'publish')).status, 201);
    await finishElection(w);
    const json = await w.get(`/api/v1/elections/${w.electionId}/export.json`);
    assert.equal(json.status, 200); const verified = await verifyElectionText(json.text);
    assert.equal(verified.verdict, 'INCOMPLETE'); assert.equal(verified.checks['chk.tally.decrypt'], 'pass');
    const tar = await fetch(`${w.base}/api/v1/elections/${w.electionId}/export.qvb`, { headers: { connection: 'close' } });
    assert.equal(tar.status, 200); assert.ok(readTar(new Uint8Array(await tar.arrayBuffer())).has('election.json'));
    const idle = await server.send('idle'); assert.equal(idle.outbox, 0); assert.deepEqual(idle.calls, []);
    assert.deepEqual((await server.stop()).calls, [], 'shutdown also stays within the guarded boundary');
  } finally { await server.dispose(); }
});

test('only the validated webhook reaches controlled TLS; private targets, redirects and rebinding cannot add a destination', { timeout: 180_000 }, async (t) => {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return t.skip('openssl is needed for the real local TLS positive control');
    throw error;
  }
  const dir = mkdtempSync(join(tmpdir(), 'qv-egress-tls-'));
  let mode: 'ok' | 'redirect' = 'ok';
  const hits: { method: string; url: string; host: string; remote: string; id: string; ts: string; signature: string; body: string }[] = [];
  const sni: string[] = [];
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2',
    '-subj', '/CN=hooks.egress.example', '-addext', 'subjectAltName=DNS:hooks.egress.example', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  const ca = readFileSync(join(dir, 'cert.pem'), 'utf8');
  const key = readFileSync(join(dir, 'key.pem')), context = createSecureContext({ cert: ca, key });
  const listener = createServer({ cert: ca, key, SNICallback: (name, callback) => { sni.push(name); callback(null, context); } }, (req, res) => {
    const parts: Buffer[] = []; req.on('data', (part: Buffer) => parts.push(part));
    req.on('end', () => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', host: req.headers.host ?? '',
        remote: req.socket.remoteAddress ?? '', id: String(req.headers['qv-webhook-id']), ts: String(req.headers['qv-webhook-timestamp']),
        signature: String(req.headers['qv-webhook-signature']), body: Buffer.concat(parts).toString('utf8') });
      res.writeHead(mode === 'ok' ? 204 : 302, mode === 'ok' ? {} : { Location: 'https://redirect.egress.example:8443/canary' }); res.end();
    });
  });
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const w = new World({ seed: 'egress-webhook', n: 3, t: 2, voters: 4, witnessQuorum: 0, freshConnections: true });
  let server: Awaited<ReturnType<typeof isolated>> | undefined;
  try {
    server = await isolated(w, { port: (listener.address() as { port: number }).port, ca });
    await readyElection(w); assert.deepEqual((await server.send('idle')).calls, []);
    const path = `/api/v1/orgs/${w.orgId}/webhooks`;
    for (const [url, reason] of [['http://hooks.egress.example/hook', 'URL_NOT_HTTPS'], ['https://127.0.0.1/hook', 'TARGET_BLOCKED'],
      ['https://blocked.egress.example/hook', 'TARGET_BLOCKED']] as const) {
      const rejected = await w.signed('POST', path, { url, events: ['entry'] }, w.owner, w.idemKey());
      assert.equal(rejected.status, 422, rejected.text); assert.equal(rejected.json.reason, reason);
    }
    assert.equal((await w.signed('GET', path)).json.items.length, 0);
    const rejected = await server.send('idle');
    assert.deepEqual(rejected.calls, [{ api: 'dns/promises.lookup', allowed: true, target: 'blocked.egress.example' }]);
    assert.equal(hits.length, 0); await server.send('clear');
    const made = await w.signed('POST', path, { url: 'https://hooks.egress.example:8443/hook', events: ['entry'], election_id: w.electionId }, w.owner, w.idemKey());
    assert.equal(made.status, 201, made.text);
    assert.equal((await w.open()).status, 201);
    const delivered = await server.send('idle'); assert.equal(delivered.stats.delivered, 1); assert.equal(hits.length, 1);
    const hit = hits[0]!;
    assert.equal(hit.method, 'POST'); assert.equal(hit.url, '/hook'); assert.deepEqual(sni, ['hooks.egress.example']); assert.equal(hit.remote, '127.0.0.1');
    assert.match(hit.host, /^hooks\.egress\.example:/);
    assert.equal(hit.signature, 'v1=' + createHmac('sha256', made.json.secret as string).update(`${hit.ts}.${hit.id}.${hit.body}`).digest('hex'));
    assert.equal(JSON.parse(hit.body).election_id, w.electionId);
    assert.ok(delivered.calls.every((c) => c.allowed));
    for (const api of ['dns/promises.lookup', 'https.request', 'tls.connect', 'net.Socket.connect']) assert.ok(delivered.calls.some((c) => c.api === api), api);
    assert.deepEqual(delivered.calls.filter((c) => c.api === 'https.request'), [
      { api: 'https.request', allowed: true, target: 'hooks.egress.example:8443/hook', pinned: '93.184.216.34' },
    ]);

    await server.send('clear'); mode = 'redirect';
    assert.equal((await w.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 201);
    const redirect = await server.send('idle'); assert.equal(hits.length, 2);
    assert.equal(redirect.stats.failed, 1); assert.equal(redirect.stats.retries, 0);
    assert.ok(redirect.calls.every((c) => c.allowed && !c.target.includes('redirect.egress.example')));
    assert.equal(redirect.calls.filter((c) => c.api === 'https.request').length, 1);

    await server.send('clear'); await server.send('rebind');
    assert.equal((await w.cast(1, { budget: ['no'], chair: ['bob'] })).status, 201);
    const rebound = await server.send('idle'); assert.equal(rebound.stats.blocked, 1); assert.equal(rebound.stats.retries, 0);
    assert.equal(hits.length, 2, 'delivery revalidation blocks the private answer before HTTPS/TLS/TCP');
    assert.deepEqual(rebound.calls, [{ api: 'dns/promises.lookup', allowed: true, target: 'hooks.egress.example' }]);
    assert.equal(rebound.outbox, 0); assert.deepEqual((await server.stop()).calls, rebound.calls);
  } finally {
    await server?.dispose(); listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve())); rmSync(dir, { recursive: true, force: true });
  }
});
