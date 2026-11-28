// Actual built-app result disclosures with genuine tally proofs and independent witness evidence.
// Run: QV_REQUIRE_BROWSER=1 node packages/web/e2e/result-disclosures.ts
// @verifies QV-07-REQ-017
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { signRecord, type TallyBody } from '@quietvote/protocol';
import { bundleOf, clone } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { disclosureFixture } from '../test/helpers/disclosure-fixture.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { witnessedBoard } from '../test/helpers/witnessed-board.ts';
import { launchBrowser } from './browser.ts';

const specs = [
  { name: 'roll9-mixed', roll: 9, pattern: 'mixed' as const, small: true, choice: [null, null, 'none'], approval: ['all', null, 'none'], counts: [[2, 2, 0], [4, 2, 0]] },
  { name: 'roll10-mixed', roll: 10, pattern: 'mixed' as const, small: false, choice: [null, null, 'none'], approval: ['all', null, 'none'], counts: [[2, 2, 0], [4, 2, 0]] },
  { name: 'no-warning', roll: 10, pattern: 'none' as const, small: false, choice: [null, null, null], approval: [null, null, null], counts: [[2, 1, 1], [3, 2, 2]] },
  { name: 'single-choice-all', roll: 10, pattern: 'single-all' as const, small: false, choice: ['all', 'none', 'none'], approval: [null, null, null], counts: [[4, 0, 0], [3, 2, 2]] },
];
const sims = await Promise.all(specs.map((spec) => disclosureFixture(`browser-disclosure-${spec.name}`, spec.roll, spec.pattern)));
const empty = await disclosureFixture('browser-disclosure-empty', 9, 'empty');
const forged = clone(bundleOf(sims[0]!));
const tally = forged.log.find((record) => (record.entry as { body?: { type?: string } }).body?.type === 'tally')!;
const body = (tally.entry as { body: TallyBody }).body;
body.contests[0]!.options[0]!.T++;
const coord = sims[0]!.coord[0]!;
tally.entry = signRecord(coord.secretKey, coord.publicKey, sims[0]!.params!.ctx, body);
let board = new FakeBoard(sims[0]!);
let omitEvidence = false;
const dist = mkdtempSync(join(tmpdir(), 'qv-result-disclosures-'));
await buildSite(dist);
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/favicon.ico') { response.writeHead(404).end(); return; }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.endsWith('/export.json') && url.searchParams.get('board') === '1') {
      const bundle = board.bundle();
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ...bundle, ...(omitEvidence ? {} : { board: witnessedBoard(board.sim, bundle) }) })); return;
    }
    const result = await board.fetch(url.pathname + url.search, { method: request.method ?? 'GET' });
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
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, locale: 'fr-FR' });
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (/Content Security|Trusted Type/i.test(event.text())) errors.push(event.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !/^(?:blob:|data:)/.test(request.url())) external.push(request.url()); });
  for (const [i, spec] of specs.entries()) {
    board = new FakeBoard(sims[i]!);
    await page.goto(`${origin}/e/${board.apiId}/results`);
    await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).waitFor({ timeout: 30_000 });
    const small = page.locator('.result-disclosure');
    assert.equal(await small.count(), spec.small ? 1 : 0);
    if (spec.small) { assert.equal(await small.isVisible(), true); assert.equal(await small.textContent(), 'Results may reveal individual votes'); }
    for (const [index, title] of ['Single choice', 'Approval choices'].entries()) {
      const table = page.getByRole('table', { name: title, exact: true });
      const rows = table.locator('tbody tr');
      assert.equal(await rows.count(), 3);
      const expected = index === 0 ? spec.choice : spec.approval;
      for (let option = 0; option < 3; option++) {
        const row = rows.nth(option), notice = row.locator('.option-disclosure');
        assert.equal(await row.locator('td').evaluate((cell) => cell.firstChild?.textContent), String(spec.counts[index]![option]));
        assert.equal(await notice.count(), expected[option] === null ? 0 : 1);
        if (expected[option] !== null) {
          assert.equal(await notice.isVisible(), true);
          assert.equal(await notice.locator('strong').textContent(), 'For this option');
          assert.ok((await notice.innerText()).includes("Unanimous result: every participant's choice is known"));
          assert.ok((await notice.innerText()).includes(expected[option] === 'all' ? 'All counted voters selected this option.' : 'No counted voter selected this option.'));
        }
      }
    }
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    console.log(`ok - ${spec.name}: verified counts and option-scoped disclosures`);
  }

  board = new FakeBoard(empty);
  await page.goto(`${origin}/e/${board.apiId}/results`);
  await page.getByText('Results appear after voting closes and the trustees open the total.', { exact: true }).waitFor();
  assert.equal(await page.locator('.result-disclosure, .option-disclosure').count(), 0);
  console.log('ok - no counted voters/no tally produces no result disclosure claims');

  board = new FakeBoard(sims[0]!); omitEvidence = true;
  await page.goto(`${origin}/e/${board.apiId}/results`);
  await page.getByRole('heading', { name: 'Incomplete: more evidence is needed', exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('table, .result-disclosure, .option-disclosure').count(), 0);
  console.log('ok - missing evidence withholds counts and disclosure inferences');

  board = new FakeBoard({ ...sims[0]!, log: forged.log }); omitEvidence = false;
  await page.goto(`${origin}/e/${board.apiId}/results`);
  await page.getByRole('heading', { name: 'A check failed', exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('table, .result-disclosure, .option-disclosure').count(), 0);
  console.log('ok - signed forged tally withholds counts and disclosure inferences');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
} finally {
  await browser?.close(); server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dist, { recursive: true, force: true });
}
