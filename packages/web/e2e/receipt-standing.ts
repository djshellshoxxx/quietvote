// SPDX-License-Identifier: AGPL-3.0-or-later
// Production CSP/bundle and genuine adopted protocol snapshots. Ordinary final-server refusal has a separate HTTP test.
// Run: QV_REQUIRE_BROWSER=1 node packages/web/e2e/receipt-standing.ts
// @verifies QV-10-REQ-010 (qualified closed snapshots only)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { hexToBytes } from '@quietvote/crypto';
import { buildSite, csp } from '../src/build/site.ts';
import { ballotCodeDisplay } from '../src/util/crockford.ts';
import { standingApi, standingBoard, standingFixture, standingHeads } from '../test/helpers/standing-fixture.ts';
import { launchBrowser } from './browser.ts';

const fixture = await standingFixture('browser-checked-receipt-standing');
const good = standingApi(fixture.sim, fixture.election);
let selected = good;
let delayExport = false, release: (() => void) | undefined, exportStarted: (() => void) | undefined;
const dist = mkdtempSync(join(tmpdir(), 'qv-receipt-standing-'));
const build = await buildSite(dist);
const scripts = build.assets.filter((asset) => asset.path.endsWith('.js'));
const compressed = (path: string): number => gzipSync(readFileSync(join(dist, path))).length;
const jsBytes = scripts.reduce((size, asset) => size + compressed(asset.path), 0);
const entry = scripts.find((asset) => /^assets\/app\./.test(asset.path))!;
assert.ok(jsBytes <= 200 * 1024); assert.ok(build.verifierBytes < 400 * 1024);
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/favicon.ico') { response.writeHead(404).end(); return; }
  if (url.pathname.startsWith('/api/')) {
    assert.equal(request.method, 'GET', 'receipt checks need no login or board mutation');
    if (url.pathname.endsWith('/events')) { response.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(': receipt fixture\n\n'); return; }
    if (delayExport && url.pathname.endsWith('/export.json')) await new Promise<void>((resolve) => { release = resolve; exportStarted?.(); });
    const result = await selected.fetch(url.pathname + url.search, { method: request.method });
    if (response.destroyed) return;
    response.writeHead(result.status, { 'Content-Type': result.headers.get('Content-Type') ?? 'application/json' });
    response.end(Buffer.from(await result.arrayBuffer())); return;
  }
  const file = url.pathname.startsWith('/assets/') && existsSync(join(dist, url.pathname)) ? url.pathname : '/index.html';
  response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp().header,
    'Cross-Origin-Opener-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' });
  response.end(readFileSync(join(dist, file)));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
try {
  browser = await launchBrowser();
  let page = await browser.newPage({ viewport: { width: 320, height: 800 }, locale: 'fr-FR' });
  const errors: string[] = [], external: string[] = [];
  const observe = (): void => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (event) => { if (/Content Security|Trusted Type/i.test(event.text())) errors.push(event.text()); });
    page.on('request', (request) => { if (!request.url().startsWith(origin) && !/^(?:blob:|data:)/.test(request.url())) external.push(request.url()); });
  };
  observe();
  let panel = page.locator('.qv-standing');
  const newVisitor = async (): Promise<void> => {
    // Each prefix scenario is a different visitor; a real saved newer head must keep rejecting rollback.
    await page.close(); page = await browser!.newPage({ viewport: { width: 320, height: 800 }, locale: 'fr-FR' });
    observe(); panel = page.locator('.qv-standing');
  };
  const enter = async (code = fixture.old.code, pin = fixture.election.manifest_hash): Promise<void> => {
    await page.getByLabel('Ballot code', { exact: true }).fill(code);
    await page.getByLabel('Saved rules code (64 characters, using 0–9 and a–f)', { exact: true }).fill(pin);
  };
  const included = async (): Promise<void> => { await page.getByText(`Included in the public record at entry #${fixture.old.seq} (record size ${selected.head.size}).`, { exact: true }).waitFor(); };
  const check = async (): Promise<void> => { await page.getByRole('button', { name: 'Check ballot code', exact: true }).click(); };
  const status = async (state: string, code = fixture.old.code): Promise<void> => {
    await page.locator(`.qv-standing.${state}`).waitFor({ timeout: 30_000 });
    assert.equal(await panel.count(), 1); assert.equal(await panel.getAttribute('data-ballot-code'), code);
    const text = await panel.innerText(); assert.doesNotMatch(text, /\byour\b|\bLatest\b|counts instead|Only your newest/i);
    assert.match(text, /does not establish that the record is up to date or that the result is final/);
  };
  await page.goto(`${origin}/e/${good.apiId}/receipt`);
  await enter(fixture.old.code, ''); await check(); await included(); await status('unverified');
  assert.equal(good.requests.filter((request) => request.path.includes('/export.json')).length, 0);
  console.log('ok - no-login typed inclusion remains available without a status anchor');

  await enter(ballotCodeDisplay(hexToBytes(fixture.old.code, 32), true)); await check(); await included(); await status('superseded');
  assert.ok((await panel.innerText()).includes(fixture.middle.code));
  assert.ok((await panel.innerText()).includes(`entry #${fixture.middle.seq}`));
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  console.log('ok - displayed code prefix qualifies its exact verified predecessor chain at three widths');

  const file = JSON.stringify(good.receiptFile(fixture.old));
  await page.getByLabel('Or choose a receipt file', { exact: true }).setInputFiles({ name: 'receipt.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await included(); await status('superseded');
  await enter(fixture.latest.code); await check(); await status('counted', fixture.latest.code);
  assert.match(await panel.innerText(), /included in the checked tally in this snapshot/);
  console.log('ok - uploaded and typed receipts share truthful code-bound tally status');

  await enter('ab'.repeat(32)); assert.equal(await panel.count(), 0); await check();
  await page.getByText('Not found (yet). A new ballot can take up to a minute to appear. Try again shortly.', { exact: true }).waitFor();
  assert.equal(await panel.count(), 0);
  console.log('ok - a new missing code removes previous replacement status');

  for (const before of [fixture.sim.closeSeq!, fixture.election.log.at(-1)!.seq]) {
    const election = { ...fixture.election, log: fixture.election.log.filter((entry) => entry.seq < before) };
    selected = standingApi(fixture.sim, election);
    await newVisitor();
    await page.goto(`${origin}/e/${selected.apiId}/receipt`); await enter(); await check(); await included(); await status('unverified');
    assert.match(await panel.innerText(), /not established while voting is open/);
  }
  console.log('ok - open and closed-without-tally prefixes retain inclusion and explicitly unverified standing');

  const heads = standingHeads(fixture.sim, fixture.election); heads[heads.length - 1] = { size: good.head.size };
  selected = standingApi(fixture.sim, fixture.election, standingBoard(fixture.sim, fixture.election, heads));
  await page.goto(`${origin}/e/${selected.apiId}/receipt`); await enter(); await check(); await included(); await status('unverified');
  assert.match(await panel.innerText(), /required snapshot checks did not pass/);
  console.log('ok - missing exact-head witness quorum refuses status even with valid inclusion');

  selected = good; delayExport = true;
  const started = new Promise<void>((resolve) => { exportStarted = resolve; });
  await page.goto(`${origin}/e/${selected.apiId}/receipt`); await enter(); await check();
  await started;
  await page.getByText('Running checks…', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText('Verification cancelled. No report was produced.', { exact: true }).waitFor();
  assert.equal(await panel.count(), 0);
  delayExport = false; release?.(); await check(); await status('superseded');
  assert.equal(await page.getByLabel('Ballot code', { exact: true }).isEnabled(), true);
  console.log('ok - cancellation suppresses the old download and a later explicit retry succeeds');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('build', JSON.stringify({ id: build.buildId, javascriptGzip: jsBytes, javascriptBudget: 204800,
    entryGzip: compressed(entry.path), entryRaw: entry.size, verifierBytes: build.verifierBytes, verifierBudget: 409600 }));
} finally {
  release?.(); await browser?.close(); server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve())); rmSync(dist, { recursive: true, force: true });
}
