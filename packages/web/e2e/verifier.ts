// Production browser regressions for proof-gated results and the offline verifier under actual serving policies.
import assert from 'node:assert/strict';
import { closeSync, ftruncateSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { signRecord } from '@quietvote/protocol';
import { buildServer } from '../../server/src/index.ts';
import { bundleOf, castBallot, clone, closeElection, publishTally, setup } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { launchBrowser } from './browser.ts';

const dir = mkdtempSync(join(tmpdir(), 'qv-verifier-browser-'));
const dist = join(dir, 'site'); await buildSite(dist);
const sim = await setup({ seed: 'b3-browser-results', n: 3, t: 2, voters: 4, minCounted: 3 });
for (let i = 0; i < 4; i++) castBallot(sim, i, { budget: ['yes'], chair: ['ann'] });
closeElection(sim); publishTally(sim, [1, 2]);
const good = bundleOf(sim);
const forged = clone(good);
const tally = forged.log.find((e) => (e.entry as any).body?.type === 'tally')!;
const body = (tally.entry as any).body; body.contests[0].options[0].T++;
const coord = sim.coord[0]!; tally.entry = signRecord(coord.secretKey, coord.publicKey, sim.params!.ctx, body);
const goodFile = join(dir, 'good.json'), badFile = join(dir, 'bad.json');
writeFileSync(goodFile, JSON.stringify(good)); writeFileSync(badFile, JSON.stringify(forged));
// Repeated real proofs keep the ballot loop busy without generating a costly large election.
// The added envelopes are outside the close window and must still be checked before rejection.
const large = clone(good);
const envelope = good.log.find((e) => (e.entry as any).intent === 'cast')!;
for (let i = 0; i < 80; i++) large.log.push({ seq: large.log.at(-1)!.seq + 1, entry: clone(envelope.entry) });
const largeFile = join(dir, 'large.json'); writeFileSync(largeFile, JSON.stringify(large));
let board = new FakeBoard(sim);
let waitForElection: Promise<void> | undefined;
let electionRequested: (() => void) | undefined;
let waitForCharts: Promise<void> | undefined;
let chartsRequested: (() => void) | undefined;
let streamEvents = false;
const eventClients = new Set<ServerResponse>();
const policies = [...readFileSync(join(dist, '_headers'), 'utf8').matchAll(/^  Content-Security-Policy: (.+)$/gm)].map((m) => m[1]!);
assert.equal(policies.length, 2, 'common and standalone policies emitted');
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const site = createServer(async (rq, rs) => {
  const u = new URL(rq.url ?? '/', 'http://x');
  if (u.pathname.startsWith('/api/')) {
    if (u.pathname === `/api/v1/elections/${board.apiId}/events` && streamEvents) {
      rs.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      rs.write(': connected\n\n'); eventClients.add(rs);
      rq.on('close', () => { eventClients.delete(rs); rs.end(); }); return;
    }
    if (u.pathname === `/api/v1/elections/${board.apiId}` && waitForElection) { electionRequested?.(); await waitForElection; }
    const chunks: Buffer[] = []; for await (const c of rq) chunks.push(Buffer.from(c));
    const r = await board.fetch(u.pathname + u.search, { method: rq.method ?? 'GET', headers: rq.headers as Record<string, string>, ...(chunks.length ? { body: Buffer.concat(chunks).toString() } : {}) });
    rs.writeHead(r.status, { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' }); rs.end(Buffer.from(await r.arrayBuffer())); return;
  }
  if (/^\/assets\/charts-[^/]+\.js$/.test(u.pathname) && waitForCharts) { chartsRequested?.(); await waitForCharts; }
  const file = u.pathname.startsWith('/assets/') || u.pathname === '/verifier.html' ? u.pathname : '/index.html';
  rs.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': file === '/verifier.html' ? policies : csp().header });
  rs.end(readFileSync(join(dist, file)));
});
await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
const real = buildServer({ dataDir: join(dir, 'server'), staticDir: dist, port: 0, host: '127.0.0.1', minFreeBytes: 0, logSink: () => {} });
const address = await real.start();
const browser = await launchBrowser();
const errors: string[] = [], thirdParty: string[] = [];
let checks = 0;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security|Trusted Type|inline script|inline style/i.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith(address.url) && !/^(?:data:|blob:)/.test(r.url())) thirdParty.push(r.url()); });
  const offline = async (base: string) => {
    await page.goto(`${base}/verifier.html`);
    await page.getByLabel('Election bundle file (JSON)').setInputFiles(goodFile);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).waitFor({ timeout: 30000 });
    assert.ok(await page.getByText('not run', { exact: false }).count() > 0); checks++;
    await page.getByLabel('Election ID you were told', { exact: false }).fill('0000-0000-0000-0000-0000');
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).count(), 0); checks++;
    await page.getByLabel('Election ID you were told', { exact: false }).fill('');
    await page.getByLabel('Election bundle file (JSON)').setInputFiles(badFile);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor({ timeout: 30000 }); checks++;
  };
  await offline(origin); // all matching generated _headers policies enforced together
  await offline(address.url); // actual server StaticAssets policy, no routing interception
  // The real standalone page yields during cryptographic work. Cancellation and retry must remain usable.
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/verifier.html`);
    const requests: string[] = [];
    const recordRequest = (r: import('playwright').Request): void => { requests.push(r.url()); };
    page.on('request', recordRequest);
    await page.getByLabel('Election bundle file (JSON)').setInputFiles(largeFile);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.waitForFunction(() => document.getElementById('progress-detail')?.textContent?.startsWith('Checking ballot proofs:'));
    assert.equal(await page.getByRole('button', { name: 'Run checks' }).isDisabled(), true);
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-label'), 'Verification work in current stage');
    await page.getByRole('button', { name: 'Cancel verification' }).click();
    await page.getByText('Verification cancelled. No report was produced.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Run checks' }).isEnabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Run checks' }).evaluate((e) => e === document.activeElement), true);
    await page.getByLabel('Election bundle file (JSON)').setInputFiles(goodFile);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).waitFor({ timeout: 30000 });
    await page.getByLabel('Election ID you were told', { exact: false }).fill('changed');
    assert.equal(await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).count(), 0, 'anchor edits invalidate a previous result');
    assert.deepEqual(requests, [], 'standalone verification/cancel/retry makes no network requests');
    page.off('request', recordRequest); checks++;
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  // Hold an old read until a replacement run has finished, then deliver success and rejection separately.
  for (const reject of [false, true]) {
    await page.goto(`${origin}/verifier.html`);
    await page.evaluate(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        if (this.name !== 'delayed.json') return original.call(this);
        return new Promise<string>((resolve, reject) => {
          (globalThis as any).__qvReleaseRead = async (fail: boolean) => {
            if (fail) reject(new Error('delayed read rejected'));
            else resolve(await original.call(this));
          };
        });
      };
    });
    await page.getByLabel('Election bundle file (JSON)').setInputFiles({ name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) });
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.waitForFunction(() => typeof (globalThis as any).__qvReleaseRead === 'function');
    await page.getByLabel('Election bundle file (JSON)').setInputFiles(badFile);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor({ timeout: 30000 });
    await page.evaluate(async (fail) => { await (globalThis as any).__qvReleaseRead(fail); await new Promise<void>((resolve) => setTimeout(resolve, 0)); }, reject);
    assert.equal(await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).count(), 0);
    await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Run checks' }).isEnabled(), true); checks++;
  }
  // A page lifetime ending during work invalidates completion (including pages retained in browser history).
  await page.goto(`${origin}/verifier.html`);
  await page.getByLabel('Election bundle file (JSON)').setInputFiles(largeFile);
  await page.getByRole('button', { name: 'Run checks' }).click();
  await page.waitForFunction(() => document.getElementById('progress-detail')?.textContent?.startsWith('Checking ballot proofs:'));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.getByText('Verification stopped. Run checks to start again.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).count(), 0); checks++;
  await page.goto(`${origin}/e/${board.apiId}/results`);
  await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).waitFor({ timeout: 30000 });
  assert.ok(await page.getByRole('table').count() > 0); checks++;
  const forgedSim = { ...sim, log: forged.log };
  board = new FakeBoard(forgedSim);
  await page.reload();
  await page.getByText('The result is not established. Export the evidence and report it.', { exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('table').count(), 0, 'forged tally never renders numbers'); checks++;
  await page.goto(`${origin}/verify`);
  await page.getByLabel('Election bundle file (JSON)').setInputFiles(goodFile);
  await page.getByLabel('Election ID', { exact: false }).fill('0000-0000-0000-0000-0000');
  await page.getByRole('button', { name: 'Run checks' }).click();
  await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor({ timeout: 30000 }); checks++;
  const requested = new Promise<void>((resolve) => { electionRequested = resolve; });
  let release!: () => void; waitForElection = new Promise<void>((resolve) => { release = resolve; });
  const slow = await browser.newPage();
  await slow.goto(`${origin}/e/${board.apiId}`); await requested;
  await slow.getByRole('link', { name: 'Help and accessibility', exact: true }).click();
  await slow.getByRole('heading', { name: 'Help and accessibility', exact: true }).waitFor();
  const delivered = slow.waitForResponse((r) => r.url() === `${origin}/api/v1/elections/${board.apiId}/log/entries?from=0&limit=1000`);
  release(); waitForElection = undefined; await delivered; await slow.waitForLoadState('networkidle');
  await slow.getByRole('heading', { name: 'Help and accessibility', exact: true }).waitFor();
  assert.ok(slow.url().endsWith('/help')); await slow.close(); checks++;
  board = new FakeBoard(sim);
  const noStorage = await browser.newContext();
  await noStorage.addInitScript(() => { indexedDB.open = () => { throw new DOMException('storage blocked for regression test', 'SecurityError'); }; });
  const readOnly = await noStorage.newPage();
  await readOnly.goto(`${origin}/e/${board.apiId}/rules`);
  await readOnly.getByRole('heading', { name: 'Rules and privacy', exact: true }).waitFor({ timeout: 30000 });
  await readOnly.goto(`${origin}/e/${board.apiId}/results`);
  await readOnly.getByRole('heading', { name: 'Supplied checks passed', exact: true }).waitFor({ timeout: 30000 });
  assert.ok(await readOnly.getByRole('table').count() > 0); await noStorage.close(); checks++;
  // Keep the real lazy-module HTTP response pending while SSE triggers a verified log reread.
  streamEvents = true;
  let releaseCharts!: () => void;
  waitForCharts = new Promise<void>((resolve) => { releaseCharts = resolve; });
  const chartPending = new Promise<void>((resolve) => { chartsRequested = resolve; });
  const racing = await browser.newPage();
  await racing.goto(`${origin}/e/${board.apiId}/results`); await chartPending;
  const appendedSeq = board.entries.length;
  board = new FakeBoard({ ...sim, log: [...sim.log, { seq: appendedSeq, entry: tally.entry }] });
  const firstRead = racing.waitForResponse((r) => r.url().includes(`/log/entries?from=${appendedSeq}&`));
  for (const client of eventClients) client.write(`id: 1\nevent: entry\ndata: ${JSON.stringify({ seq: appendedSeq, type: 'notice', author: 'AA', leaf_hash: 'AA' })}\n\n`);
  await firstRead;
  // A second read from the new end proves that the first append has reached LiveElection.records.
  const freshEndRead = racing.waitForResponse((r) => r.url().includes(`/log/entries?from=${appendedSeq + 1}&`));
  for (const client of eventClients) client.write(`id: 2\nevent: phase\ndata: ${JSON.stringify({ from: 'TALLIED', to: 'TALLIED', seq: appendedSeq })}\n\n`);
  await freshEndRead;
  releaseCharts(); waitForCharts = undefined;
  await racing.getByText('The result is not established. Export the evidence and report it.', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await racing.getByRole('table').count(), 0, 'an append during chart import is reverified before counts render');
  await racing.close(); streamEvents = false; for (const client of eventClients) client.end(); eventClients.clear(); checks++;
  const tooLarge = join(dir, 'oversized.json'); const fd = openSync(tooLarge, 'w'); ftruncateSync(fd, 64 * 1024 * 1024 + 1); closeSync(fd);
  for (const path of ['/verify', '/verifier.html']) {
    await page.goto(`${origin}${path}`);
    await page.getByLabel('Election bundle file (JSON)').setInputFiles(tooLarge);
    await page.getByRole('button', { name: 'Run checks' }).click();
    await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor({ timeout: 30000 });
    await page.getByText('file exceeds 67108864 bytes', { exact: true }).waitFor(); checks++;
  }
  const entryHtml = readFileSync(join(dist, 'index.html'), 'utf8');
  const chunk = /rel="modulepreload" href="\/(assets\/chunk-[^"]+\.js)"/.exec(entryHtml)?.[1];
  assert.ok(chunk, 'static shared module has an integrity preload');
  const bytes = readFileSync(join(dist, chunk));
  writeFileSync(join(dist, chunk), Buffer.concat([bytes, Buffer.from(';globalThis.__qvTamper=true;')]));
  const tamperPage = await browser.newPage();
  const blocked = tamperPage.waitForEvent('console', { predicate: (m) => /integrity|valid digest/i.test(m.text()), timeout: 10000 });
  await tamperPage.goto(origin); await blocked;
  assert.equal(await tamperPage.evaluate(() => Object.hasOwn(globalThis, '__qvTamper')), false);
  await tamperPage.close(); writeFileSync(join(dist, chunk), bytes); checks++;
  assert.deepEqual(errors, [], 'no CSP, Trusted Types, or uncaught page errors');
  assert.deepEqual(thirdParty, []); checks++;
  console.log(`verifier browser: ${checks}/${checks} passed (generated policies, real server, proof gate, anchor, skipped checks, static SRI, stale navigation, blocked storage, size bounds, live append during chart import, offline cancellation/retry/stale reads)`);
} finally {
  await browser.close(); await real.stop(); await new Promise<void>((resolve) => site.close(() => resolve())); rmSync(dir, { recursive: true, force: true });
}
