// Built-app warning journey using the existing Chromium harness and real protocol-backed FakeBoard.
// Run: QV_REQUIRE_BROWSER=1 node packages/web/e2e/manifest-warnings.ts
// @verifies QV-03-REQ-012 QV-02-REQ-032 QV-06-REQ-010
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { EN } from '../src/i18n/en.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { launchBrowser } from './browser.ts';

const message = (key: 'noThreshold' | 'secrecy' | 'availability' | 'smallRoll'): string => EN[`qv.election.warning.${key}`].message;
const fixtures = [
  { seed: 'warning-multiple', n: 3, t: 1, voters: 4, expected: [message('noThreshold'), message('secrecy'), message('smallRoll')] },
  { seed: 'warning-availability', n: 3, t: 3, voters: 8, expected: [message('availability')] },
  { seed: 'warning-none', n: 3, t: 2, voters: 8, expected: [] },
];
const boards = await Promise.all(fixtures.map(async (fixture) => new FakeBoard(await setup(fixture))));
const dist = mkdtempSync(join(tmpdir(), 'qv-manifest-warnings-'));
await buildSite(dist);
const hostile = 'W-FUTURE: <img src="/warning-canary" onerror="document.title=\'UNSAFE\'"> & </li><script>document.title="UNSAFE"</script>';
await build({
  stdin: { contents: `import { manifestWarnings } from './ui/manifest-warnings.ts'; import { createTranslator } from './i18n/index.ts'; document.body.append(manifestWarnings([${JSON.stringify(hostile)}], createTranslator('en')));`,
    resolveDir: fileURLToPath(new URL('../src/', import.meta.url)), sourcefile: 'warning-probe.ts' },
  bundle: true, format: 'esm', target: 'es2022', outfile: join(dist, 'assets', 'warning-probe.js'), logLevel: 'silent',
});
const external: string[] = [], errors: string[] = [], posted: string[] = [];
let canaryRequests = 0;
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/warning-canary') { canaryRequests++; response.writeHead(404).end(); return; }
  if (url.pathname === '/favicon.ico') { response.writeHead(404).end(); return; }
  if (url.pathname.startsWith('/api/')) {
    if (request.method !== 'GET') posted.push(url.pathname);
    const board = boards.find((item) => url.pathname.startsWith(`/api/v1/elections/${item.apiId}`)) ?? boards[0]!;
    const result = await board.fetch(url.pathname + url.search, { method: request.method ?? 'GET', headers: request.headers as Record<string, string> });
    response.writeHead(result.status, { 'Content-Type': result.headers.get('Content-Type') ?? 'application/json' });
    response.end(Buffer.from(await result.arrayBuffer())); return;
  }
  const headers = { 'Content-Security-Policy': csp().header, 'Cross-Origin-Opener-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
  if (url.pathname === '/warning-probe') {
    response.writeHead(200, { ...headers, 'Content-Type': 'text/html' });
    response.end('<!doctype html><html lang="en"><head><title>Warning probe</title></head><body><script type="module" src="/assets/warning-probe.js"></script></body></html>'); return;
  }
  const file = url.pathname.startsWith('/assets/') && existsSync(join(dist, url.pathname)) ? url.pathname : '/index.html';
  response.writeHead(200, { ...headers, 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
  response.end(readFileSync(join(dist, file)));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ locale: 'es-ES', timezoneId: 'UTC' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (/Content Security|Trusted Type/i.test(event.text())) errors.push(event.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) external.push(request.url()); });
  const check = async (expected: string[]): Promise<void> => {
    const panel = page.getByRole('region', { name: 'Election warnings', exact: true });
    assert.equal(await panel.count(), expected.length > 0 ? 1 : 0);
    if (expected.length > 0) {
      assert.equal(await panel.isVisible(), true);
      assert.deepEqual(await panel.locator('li').allTextContents(), expected);
      assert.equal(await panel.locator('[role="alert"], [aria-live]').count(), 0);
    }
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.getByLabel('Language', { exact: true }).count(), 0, 'draft translations must remain unavailable');
  };
  for (const [i, fixture] of fixtures.entries()) {
    for (const view of ['', '/rules']) {
      await page.goto(`${origin}/e/${boards[i]!.apiId}${view}?lang=fr`);
      await page.getByRole('heading', { name: view === '' ? boards[i]!.sim.manifest.title : 'Rules and privacy', exact: true }).waitFor();
      await check(fixture.expected);
      console.log(`ok - ${fixture.seed} ${view || '/overview'}`);
    }
  }

  const sim = boards[2]!.sim, passphrase = 'correct horse battery staple';
  const wrapped = await wrapSeed(sim.coord[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('warning-organizer-key') }, FLOOR_PARAMS);
  await page.goto(origin + '/new');
  await page.getByLabel('Organizer key file', { exact: true }).setInputFiles({ name: 'organizer.qvkey', mimeType: 'application/json', buffer: Buffer.from(serializeContainer(wrapped.container)) });
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Import organizer key', exact: true }).click();
  await page.getByText('Organizer public key (hex)', { exact: true }).waitFor();
  await page.getByLabel('Name of decision', { exact: true }).fill('Warnings preview');
  await page.getByLabel('Question', { exact: true }).fill('Proceed?');
  await page.getByLabel('Voting method', { exact: true }).selectOption('yes-no');
  await page.getByLabel('Time zone of this election', { exact: true }).fill('UTC');
  await page.getByLabel('Voting opens', { exact: true }).fill('2027-03-01T08:00');
  await page.getByLabel('Voting closes', { exact: true }).fill('2027-03-14T17:00');
  await page.getByLabel('Trustees', { exact: true }).fill(sim.trusteeKeys.map((key, i) => `T${i + 1},${bytesToHex(key.publicKey)}`).join('\n'));
  for (const preview of [
    { t: 1, voters: 4, expected: fixtures[0]!.expected },
    { t: 3, voters: 8, expected: fixtures[1]!.expected },
    { t: 2, voters: 8, expected: [] },
    { t: 2, voters: 7, expected: [message('smallRoll')] },
  ]) {
    await page.getByLabel('Voter public keys', { exact: true }).fill(sim.rollHex.slice(0, preview.voters).join('\n'));
    await page.getByLabel('Trustees needed to open the total (t)', { exact: true }).fill(String(preview.t));
    await page.getByRole('button', { name: 'Freeze election', exact: true }).click();
    await page.getByRole('button', { name: 'Publish election', exact: true }).waitFor();
    await check(preview.expected);
    console.log(`ok - organizer preview t=${preview.t} voters=${preview.voters}`);
  }
  await page.getByLabel('Voting closes', { exact: true }).fill('2027-03-14T18:00');
  assert.equal(await page.locator('.manifest-warnings').count(), 0, 'editing a frozen schedule clears its old preview warnings');
  assert.deepEqual(posted, [], 'warning previews must not publish anything');

  await page.goto(origin + '/warning-probe');
  await page.getByRole('heading', { name: 'Election warnings', exact: true }).waitFor();
  assert.ok((await page.locator('.manifest-warnings li').innerText()).includes(hostile));
  assert.equal(await page.locator('.manifest-warnings img, .manifest-warnings script').count(), 0);
  assert.equal(await page.title(), 'Warning probe');
  assert.equal(canaryRequests, 0);
  console.log('ok - unknown warning text stays escaped in Chromium');
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dist, { recursive: true, force: true });
}
