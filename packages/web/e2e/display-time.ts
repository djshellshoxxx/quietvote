// Built-app overview and real accepted receipt under browser-local time-zone overrides.
// Run: QV_REQUIRE_BROWSER=1 node packages/web/e2e/display-time.ts
// @verifies QV-13-REQ-091
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { streamRng } from '@quietvote/crypto';
import { defaultContests, setup } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { launchBrowser } from './browser.ts';

const sim = await setup({ seed: 'browser-display-time', n: 3, t: 2, voters: 4, minCounted: 3, contests: [defaultContests()[0]!] });
let board = new FakeBoard(sim);
const passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('display-time-key') }, FLOOR_PARAMS);
const keyBytes = Buffer.from(serializeContainer(wrapped.container));
const dist = mkdtempSync(join(tmpdir(), 'qv-display-time-'));
await buildSite(dist);
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/favicon.ico') { response.writeHead(404).end(); return; }
  if (url.pathname.startsWith('/api/')) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await board.fetch(url.pathname + url.search, { method: request.method ?? 'GET', headers: request.headers as Record<string, string>,
      ...(chunks.length ? { body: Buffer.concat(chunks).toString() } : {}) });
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
const plain = (text: string): string => text.replace(/[\u2068\u2069]/g, '');
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
try {
  browser = await launchBrowser();
  for (const fixture of [
    { zone: 'Europe/Berlin', opens: '10:00', closes: '22:00', deadlineOffset: 'UTC+01:00', logged: '16:13:20', receiptOffset: 'UTC+02:00' },
    { zone: 'America/New_York', opens: '04:00', closes: '16:00', deadlineOffset: 'UTC-05:00', logged: '10:13:20', receiptOffset: 'UTC-04:00' },
    { zone: 'Asia/Kolkata', opens: '14:30', closes: '02:30', deadlineOffset: 'UTC+05:30', logged: '19:43:20', receiptOffset: 'UTC+05:30' },
  ]) {
    board = new FakeBoard(sim);
    const context = await browser.newContext({ timezoneId: fixture.zone, locale: 'en-US' });
    try {
      const page = await context.newPage();
      const errors: string[] = [], external: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (event) => { if (/Content Security|Trusted Type/i.test(event.text())) errors.push(event.text()); });
      page.on('request', (request) => { if (!request.url().startsWith(origin) && !/^(?:blob:|data:)/.test(request.url())) external.push(request.url()); });
      const base = `${origin}/e/${board.apiId}`;
      await page.goto(base);
      await page.getByRole('heading', { name: sim.manifest.title, exact: true }).waitFor();
      // The browser may canonicalize an IANA alias. Show its actual selected local zone, without inventing a manifest zone.
      const actualZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
      for (const [prefix, time] of [['Opens ', fixture.opens], ['Closes ', fixture.closes]]) {
        const text = plain(await page.getByText(new RegExp('^' + prefix)).innerText());
        assert.ok(text.includes(time!)); assert.ok(text.includes(`(${fixture.deadlineOffset}, ${actualZone})`));
        assert.equal(text.includes('Your time:'), false); assert.equal(text.split(actualZone).length - 1, 1);
      }
      await page.getByRole('button', { name: 'Yes, it matches', exact: true }).click();
      await page.getByText('Election ID confirmed on this device.', { exact: true }).waitFor();
      await page.goto(base + '/key');
      await page.getByLabel('Use a key file I saved before').check();
      await page.getByLabel('Key file', { exact: true }).setInputFiles({ name: 'voter.qvkey', mimeType: 'application/json', buffer: keyBytes });
      await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
      await page.getByRole('button', { name: 'Create key', exact: true }).click();
      await page.getByText('You are on the voter list.', { exact: true }).waitFor({ timeout: 30_000 });
      await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
      await page.getByLabel('YES', { exact: true }).check();
      await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
      await page.getByRole('button', { name: 'Seal my ballot', exact: true }).click();
      await page.getByRole('button', { name: 'Send my vote', exact: true }).waitFor({ timeout: 30_000 });
      const response = page.waitForResponse((result) => result.url().endsWith('/log/entries') && result.request().method() === 'POST');
      await page.getByRole('button', { name: 'Send my vote', exact: true }).click();
      const signed = await (await response).json() as { receipt: { seq: number; promise: { sequenced_at: number } } };
      assert.equal(signed.receipt.promise.sequenced_at, 1_790_000_000);
      await page.getByText('Your vote was recorded. Here is your receipt.', { exact: true }).waitFor({ timeout: 30_000 });
      const logged = plain(await page.getByText(/^Logged /).innerText());
      assert.ok(logged.includes(fixture.logged), 'the signed receipt seconds must be displayed');
      assert.ok(logged.includes(`(${fixture.receiptOffset}, ${actualZone})`));
      assert.ok(logged.includes(`entry #${signed.receipt.seq}`));
      assert.equal(logged.includes('Your time:'), false); assert.equal(logged.split(actualZone).length - 1, 1);
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      console.log(`ok - ${fixture.zone}: explicit overview offsets and signed receipt time with seconds`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close(); server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dist, { recursive: true, force: true });
}
