// B3-26: the standalone verifier's Worker controller (src/verifier/controller.ts), the shared job (src/verifier/bundle.ts)
// and the build wiring of the verify worker. The controller is driven with a fake Worker and fake timers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyElectionText, type VerificationReport } from '@quietvote/protocol';
import { buildSite } from '../src/build/site.ts';
import { allowedWorkerUrl } from '../src/worker/worker-sealer.ts';
import { runVerifyWorker } from '../src/verifier/worker-main.ts';
import { isBundleResult, verifyBundle, type BundleResult, type Phase } from '../src/verifier/bundle.ts';
import { startVerification, type ControllerDeps, type Engine, type Timers, type WorkerLike } from '../src/verifier/controller.ts';
import { electionIdOf } from '../src/util/crockford.ts';
import { hexToBytes } from '@quietvote/crypto';

const VECTORS = new URL('../../../test-vectors/v1/elections/', import.meta.url);
const tiny = readFileSync(new URL('tiny-yesno-3v/bundle.json', VECTORS), 'utf8');

function report(verdict: VerificationReport['verdict'] = 'PASS'): VerificationReport {
  return { verdict, checks: { 'chk.manifest.hash': 'pass' } as VerificationReport['checks'], findings: [], warnings: [], caveats: [], counts: { cast: 1, spoiled: 0, counted: 1, ignored: {} }, verifier: 'test' };
}
const okResult = (verdict: VerificationReport['verdict'] = 'PASS'): BundleResult => ({ report: report(verdict), anchorBad: false });

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  postMessage(m: unknown): void { this.posted.push(m); }
  terminate(): void { this.terminated = true; }
  send(data: unknown): void { this.onmessage?.({ data }); }
}

class FakeTimers implements Timers {
  private next = 1;
  readonly pending = new Map<number, { fn: () => void; ms: number }>();
  set(fn: () => void, ms: number): unknown { const id = this.next++; this.pending.set(id, { fn, ms }); return id; }
  clear(h: unknown): void { this.pending.delete(h as number); }
  /** Fire every pending timer whose delay is at least `ms` (the controller has at most one of each kind). */
  fire(ms: number): void { for (const [id, x] of [...this.pending]) if (x.ms === ms) { this.pending.delete(id); x.fn(); } }
}

function harness(over: Partial<ControllerDeps> = {}) {
  const w = new FakeWorker();
  const timers = new FakeTimers();
  const phases: [Phase, Engine][] = [];
  let inThreadCalls = 0;
  const deps: ControllerDeps = {
    createWorker: () => w,
    inThread: async () => { inThreadCalls++; return okResult('FAIL'); },
    readyTimeoutMs: 100, timeoutMs: 1000, timers, ...over,
  };
  const run = startVerification(deps, { text: '{"x":1}', anchor: 'A' }, (p, e) => phases.push([p, e]));
  return { w, timers, phases, run, inThreadCalls: () => inThreadCalls };
}

test('controller: posts {text, anchor}, forwards progress phases, then a valid worker result (done)', async () => {
  const h = harness();
  assert.deepEqual(h.w.posted, [{ text: '{"x":1}', anchor: 'A' }]);
  assert.equal(h.run.engine, 'worker');
  h.w.send({ type: 'ready' });
  h.w.send({ type: 'progress', phase: 'parsing' });
  h.w.send({ type: 'progress', phase: 'verifying' });
  h.w.send({ type: 'result', result: okResult('PASS') });
  const o = await h.run.outcome;
  assert.equal(o.kind, 'result');
  assert.equal(o.engine, 'worker');
  assert.equal(o.kind === 'result' && o.result.report.verdict, 'PASS');
  assert.deepEqual(h.phases, [['parsing', 'worker'], ['verifying', 'worker'], ['done', 'worker']]);
  assert.ok(h.w.terminated, 'one job per worker');
  assert.equal(h.timers.pending.size, 0, 'timers cleared');
  assert.equal(h.inThreadCalls(), 0);
});

test('controller: worker error message, crash after ready, malformed result, unknown message, messageerror and timeout are all failures', async () => {
  const cases: [string, (h: ReturnType<typeof harness>) => void, RegExp][] = [
    ['error message', (h) => { h.w.send({ type: 'ready' }); h.w.send({ type: 'error', detail: 'boom' }); }, /^boom$/],
    ['crash after ready', (h) => { h.w.send({ type: 'ready' }); h.w.onerror?.({}); }, /crashed/],
    ['malformed result', (h) => { h.w.send({ type: 'ready' }); h.w.send({ type: 'result', result: { report: { verdict: 'PASS' }, anchorBad: false } }); }, /malformed/],
    ['result with unknown verdict', (h) => { h.w.send({ type: 'ready' }); h.w.send({ type: 'result', result: { ...okResult(), report: { ...report(), verdict: 'OK' } } }); }, /malformed/],
    ['unknown message', (h) => { h.w.send({ type: 'ready' }); h.w.send({ type: 'PASS' }); }, /unexpected/],
    ['null message', (h) => { h.w.send({ type: 'ready' }); h.w.send(null); }, /unexpected/],
    ['messageerror', (h) => { h.w.send({ type: 'ready' }); h.w.onmessageerror?.({}); }, /could not be read/],
    ['timeout', (h) => { h.w.send({ type: 'ready' }); h.timers.fire(1000); }, /timed out/],
  ];
  for (const [name, act, re] of cases) {
    const h = harness();
    act(h);
    const o = await h.run.outcome;
    assert.equal(o.kind, 'failed', name);
    assert.match(o.kind === 'failed' ? o.detail : '', re, name);
    assert.ok(h.w.terminated, `${name}: worker terminated`);
    assert.ok(!h.phases.some(([p]) => p === 'done'), `${name}: never done`);
    assert.equal(h.inThreadCalls(), 0, `${name}: a failing worker is not silently retried in-thread`);
    // A late PASS after the failure is ignored.
    h.w.send({ type: 'result', result: okResult('PASS') });
    assert.equal((await h.run.outcome).kind, 'failed', name);
  }
});

test('controller: cancel terminates the worker and is never a result, even if a PASS arrives afterwards', async () => {
  const h = harness();
  h.w.send({ type: 'ready' });
  h.w.send({ type: 'progress', phase: 'verifying' });
  const handler = h.w.onmessage;
  h.run.cancel();
  assert.ok(h.w.terminated);
  handler?.({ data: { type: 'result', result: okResult('PASS') } });
  const o = await h.run.outcome;
  assert.equal(o.kind, 'cancelled');
  assert.ok(!h.phases.some(([p]) => p === 'done'));
  assert.equal(h.timers.pending.size, 0);
});

test('controller: cancel during the in-thread fallback discards its result', async () => {
  let release!: (r: BundleResult) => void;
  const h = harness({ createWorker: undefined, inThread: () => new Promise<BundleResult>((r) => { release = r; }) });
  assert.equal(h.run.engine, 'main-thread');
  h.run.cancel();
  release(okResult('PASS'));
  assert.equal((await h.run.outcome).kind, 'cancelled');
});

test('controller: no Worker, a throwing constructor, a load error before ready or no ready in time fall back to the main thread', async () => {
  const cases: [string, Partial<ControllerDeps>, (h: ReturnType<typeof harness>) => void][] = [
    ['no Worker API', { createWorker: undefined }, () => {}],
    ['factory returns undefined', { createWorker: () => undefined }, () => {}],
    ['constructor throws', { createWorker: () => { throw new DOMException('blocked', 'SecurityError'); } }, () => {}],
    ['load error before ready (CSP block, 404)', {}, (h) => h.w.onerror?.({})],
    ['ready never arrives', {}, (h) => h.timers.fire(100)],
  ];
  for (const [name, over, act] of cases) {
    const h = harness({ inThread: async (_job, onPhase) => { onPhase('parsing'); onPhase('verifying'); return okResult('PASS'); }, ...over });
    act(h);
    const o = await h.run.outcome;
    assert.equal(o.kind, 'result', name);
    assert.equal(o.engine, 'main-thread', name);
    assert.deepEqual(h.phases, [['parsing', 'main-thread'], ['verifying', 'main-thread'], ['done', 'main-thread']], name);
  }
  const blocked = harness({ inThread: async () => okResult('PASS') });
  blocked.w.onerror?.({});
  await blocked.run.outcome;
  assert.ok(blocked.w.terminated, 'the dead worker is terminated before falling back');
  blocked.w.send({ type: 'result', result: okResult('FAIL') });
  assert.equal((await blocked.run.outcome).engine, 'main-thread', 'a stale worker message after fallback is ignored');
});

test('controller: an in-thread exception or a non-report from the fallback is a failure', async () => {
  const thrown = harness({ createWorker: undefined, inThread: async () => { throw new Error('bad bundle'); } });
  const o1 = await thrown.run.outcome;
  assert.deepEqual([o1.kind, o1.kind === 'failed' && o1.detail], ['failed', 'bad bundle']);
  const sync = harness({ createWorker: undefined, inThread: () => { throw new Error('sync'); } });
  assert.equal((await sync.run.outcome).kind, 'failed');
  const junk = harness({ createWorker: undefined, inThread: async () => ({}) as BundleResult });
  assert.equal((await junk.run.outcome).kind, 'failed');
});

test('verifyBundle: same report as verifyElectionText on a corpus bundle and on unparsable text; phases in order', async () => {
  for (const text of [tiny, '{"not": "a bundle"}', '{bad json', tiny.replace('"manifest_hash"', '"manifest_hash" ')]) {
    const phases: string[] = [];
    const r = await verifyBundle({ text, anchor: '' }, (p) => phases.push(p));
    assert.deepEqual(r.report, await verifyElectionText(text));
    assert.deepEqual(phases, ['parsing', 'verifying']);
    assert.ok(isBundleResult(r));
    assert.equal(r.anchorBad, false);
  }
  assert.equal((await verifyBundle({ text: tiny, anchor: '' })).report.verdict, 'PASS');
});

test('verifyBundle: outside Election ID matches, mismatches, or cannot be compared', async () => {
  const id = electionIdOf(hexToBytes((JSON.parse(tiny) as { manifest_hash: string }).manifest_hash, 32));
  assert.deepEqual([(await verifyBundle({ text: tiny, anchor: ` ${id} ` })).anchorBad], [false]);
  const bad = await verifyBundle({ text: tiny, anchor: '0000-0000-0000-0000-0000' });
  assert.deepEqual([bad.anchorBad, bad.anchorProblem, bad.report.verdict], [true, 'mismatch', 'PASS']);
  const unreadable = await verifyBundle({ text: '{bad', anchor: id });
  assert.deepEqual([unreadable.anchorBad, unreadable.anchorProblem], [true, 'unreadable']);
});

test('worker mode: ready first, then progress and one result for one job; a second job or a malformed job is not run', async () => {
  const sent: unknown[] = [];
  let onMsg!: (e: { data: unknown }) => void;
  const done = new Promise<void>((resolve) => {
    runVerifyWorker({ postMessage: (m) => { sent.push(m); if ((m as { type: string }).type === 'result') resolve(); }, addEventListener: (_t, fn) => { onMsg = fn; } });
  });
  assert.deepEqual(sent, [{ type: 'ready' }]);
  onMsg({ data: { text: tiny, anchor: '' } });
  onMsg({ data: { text: '{bad', anchor: '' } });
  await done;
  assert.deepEqual(sent.slice(0, 3), [{ type: 'ready' }, { type: 'progress', phase: 'parsing' }, { type: 'progress', phase: 'verifying' }]);
  assert.equal(sent.length, 4);
  const last = sent[3] as { type: string; result: BundleResult };
  assert.equal(last.result.report.verdict, 'PASS');
  const bad: unknown[] = [];
  let onBad!: (e: { data: unknown }) => void;
  runVerifyWorker({ postMessage: (m) => bad.push(m), addEventListener: (_t, fn) => { onBad = fn; } });
  onBad({ data: { text: 1 } });
  assert.deepEqual(bad, [{ type: 'ready' }, { type: 'error', detail: 'malformed verification job' }]);
});

test('the app\'s worker Trusted Types rule never admits a blob: URL (the generated common header now also lists blob: workers)', () => {
  const o = 'https://v.example';
  assert.ok(allowedWorkerUrl('/assets/seal-worker.0123456789ab.js', o));
  for (const u of [`blob:${o}/0b6c2f1e-1111-4222-8333-444455556666`, 'blob:null/0b6c2f1e', 'data:text/javascript,1']) assert.equal(allowedWorkerUrl(u, o), false, u);
});

test('build: verifier.html allows only blob: workers, its Worker source is its own hash-pinned inline script, no worker file is emitted', async () => {
  const d = mkdtempSync(join(tmpdir(), 'qvVW-'));
  try {
    await buildSite(d);
    const html = readFileSync(join(d, 'verifier.html'), 'utf8');
    const policy = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!;
    const directives = new Map(policy.split(/;\s*/).map((x) => { const [k, ...v] = x.trim().split(/\s+/); return [k!, v.join(' ')]; }));
    assert.equal(directives.get('worker-src'), 'blob:', 'workers only from blob:, no \'self\', no data:');
    assert.equal(directives.get('connect-src'), "'none'");
    assert.equal(directives.get('default-src'), "'none'");
    assert.deepEqual([...directives.keys()], ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'worker-src', 'form-action', 'base-uri']);
    // Exactly one script element, inline; its SHA-256 is the only script-src source.
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0]![1], '', 'inline, no src/type');
    const script = scripts[0]![2]!;
    assert.equal(directives.get('script-src'), `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
    // The Worker is created from document.currentScript's textContent (that same element), and the bundle has a worker mode.
    assert.match(script, /document\.currentScript/);
    assert.match(script, /\.textContent/);
    assert.match(script, /createObjectURL\(new Blob\(\[/);
    assert.match(script, /typeof document(?:>"u"|\s*[=!]==?\s*"undefined")/);
    assert.ok(!/new Worker\("|new Worker\('|importScripts|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(script), 'no fetched worker URL, no network');
    assert.deepEqual(readdirSync(d).filter((f) => /worker/i.test(f)), [], 'no separate worker file next to verifier.html');
    assert.ok(!readdirSync(join(d, 'assets')).some((f) => /verify/i.test(f)));
    const mani = JSON.parse(readFileSync(join(d, 'asset-manifest.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(mani.verifier_worker, undefined);
    assert.match(html, /<button id="cancel" type="button" hidden>/);
    const headers = readFileSync(join(d, '_headers'), 'utf8');
    assert.ok(headers.includes(`/verifier.html\n  Content-Security-Policy: ${policy}; frame-ancestors 'none'`));
    assert.match(headers, /^  Content-Security-Policy: .*worker-src 'self' blob:;/m, 'common header admits the blob: worker on /verifier.html');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
