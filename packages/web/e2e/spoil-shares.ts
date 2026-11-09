// SPDX-License-Identifier: AGPL-3.0-or-later
// Production app/CSP with real signed public shares and a fault-controlled HTTP board.
// QV_REQUIRE_BROWSER=1 fails before assertions if required browser tooling is absent.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { ballotCode, PROTO_ID, shareToHex, signRecord, trusteeDecryptSpoiled, type SpoilShareBody } from '@quietvote/protocol';
import { bundleOf, closeElection, setup, spoilBallot, trusteeKeyFor } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { deriveElectionContext } from '../src/flow/election.ts';
import { deriveSpoilTargets } from '../src/flow/spoil-shares.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { FakeBoard, TEST_CONTESTS } from '../test/helpers/fake-board.ts';
import { launchBrowser } from './browser.ts';

const sim = await setup({ seed: 'spoil-browser', n: 3, t: 2, voters: 4, minCounted: 3, spoilTrustees: true, contests: TEST_CONTESTS()! });
const spoiled = spoilBallot(sim, 0, { budget: ['yes'], board: ['p'] }, 'trustees');
closeElection(sim);
const records = [{ seq: 0, record: bundleOf(sim).manifest }, ...sim.log.map(({ seq, entry }) => ({ seq, record: entry }))];
const ctx = await deriveElectionContext(records);
assert.ok(ctx.ok);
const targets = deriveSpoilTargets(ctx.value, records, sim.rollHex);
assert.ok(targets.ok);
const code = bytesToHex(ballotCode(sim.params!.ctx, spoiled.env.body));
const spoil = targets.value.spoils.get(code)!;
const releases = [1, 2].map((j) => {
  const opened = trusteeDecryptSpoiled(sim.params!, trusteeKeyFor(sim, j), spoil, streamRng(`spoil-browser-release-${j}`));
  assert.ok(opened.ok);
  const shares: SpoilShareBody['shares'] = [...opened.value].map(([key, share]) => {
    const [contest, opt] = key.split('/') as [string, string];
    const { M, c, s } = shareToHex(j, share);
    return { contest, opt, M, c, s };
  });
  const body: SpoilShareBody = { proto: PROTO_ID, type: 'spoil-share', ctx: bytesToHex(sim.params!.ctx), j, code, spoil_seq: spoil.seq, shares };
  return signRecord(sim.trusteeKeys[j - 1]!.secretKey, sim.trusteeKeys[j - 1]!.publicKey, sim.params!.ctx, body);
});
const board = new FakeBoard(sim);
board.closed = true;
const dist = mkdtempSync(join(tmpdir(), 'qv-spoil-browser-'));
await buildSite(dist);
const stored = new Map<number, typeof releases[number]>();
let posts = 0;
let failSecond = true;
let gate: Promise<void> | undefined;
let releaseGate: (() => void) | undefined;
let postStarted: (() => void) | undefined;
const nextPost = (): Promise<void> => new Promise((resolve, reject) => {
  const deadline = setTimeout(() => reject(new Error('share POST did not reach the fixture within 10 seconds')), 10_000);
  postStarted = () => { clearTimeout(deadline); resolve(); };
});
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const site = createServer(async (rq, rs) => {
  const url = new URL(rq.url ?? '/', 'http://x');
  if (url.pathname === `/api/v1/elections/${board.apiId}/spoil-shares`) {
    rs.setHeader('Content-Type', 'application/json');
    if (rq.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of rq) chunks.push(Buffer.from(chunk));
      const record = JSON.parse(Buffer.concat(chunks).toString()) as typeof releases[number];
      posts++;
      postStarted?.();
      if (gate) await gate;
      if (failSecond && posts === 2) {
        rs.writeHead(503);
        rs.end(JSON.stringify({ code: 'LOG_UNAVAILABLE', status: 503, retryable: true, request_id: 'synthetic' }));
        return;
      }
      const duplicate = stored.has(record.body.j);
      stored.set(record.body.j, record);
      rs.end(JSON.stringify({ status: duplicate ? 'duplicate' : 'accepted', j: record.body.j, code }));
    } else {
      rs.end(JSON.stringify({ code, items: [...stored].map(([j, record]) => ({ j, spoil_seq: spoil.seq, record })) }));
    }
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const r = await board.fetch(url.pathname + url.search, { method: rq.method ?? 'GET' });
    rs.writeHead(r.status, { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' });
    rs.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const file = url.pathname.startsWith('/assets/') ? url.pathname : '/index.html';
  rs.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp().header });
  rs.end(readFileSync(join(dist, file)));
});
await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !/^(?:blob:|data:)/.test(r.url())) external.push(r.url()); });
  const tr = createTranslator('en');
  await page.goto(`${origin}/e/${board.apiId}/spoils`);
  const input = page.getByRole('textbox', { name: tr.t('qv.spoil.add.title'), exact: true });
  const send = page.getByRole('button', { name: tr.t('qv.spoil.add.send'), exact: true });
  await input.waitFor();
  const batch = JSON.stringify(releases);
  await input.fill(batch);
  await send.click();
  await page.getByText(tr.t('qv.spoil.out.server', { status: 503 }), { exact: true }).waitFor();
  assert.equal(await input.inputValue(), batch, 'partial acceptance must preserve retry input');
  assert.equal(posts, 2);
  failSecond = false;
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('.spoil-add button')?.disabled === false);
  await send.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector<HTMLTextAreaElement>('.spoil-add textarea')?.value === '' && document.querySelector<HTMLButtonElement>('.spoil-add button')?.disabled === false);
  assert.equal(posts, 4, 'retry sends the identical batch; first share is a duplicate');
  await page.getByRole('table').waitFor();
  const decoded = page.getByRole('table');
  await decoded.getByRole('rowheader', { name: 'Adopt the budget?', exact: true }).locator('..').getByRole('cell', { name: 'YES', exact: true }).waitFor();
  await decoded.getByRole('rowheader', { name: 'Board', exact: true }).locator('..').getByRole('cell', { name: 'P', exact: true }).waitFor();
  console.log('PASS partial acceptance, keyboard retry, duplicate response and verified decoded selections');

  gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  const started = nextPost();
  await input.fill(JSON.stringify(releases[0]));
  await send.click();
  await started;
  assert.equal(await send.isDisabled(), true);
  assert.equal(await page.locator('.spoil-add').getAttribute('aria-busy'), 'true');
  await input.fill('replacement input');
  releaseGate!(); gate = undefined;
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('.spoil-add button')?.disabled === false);
  assert.equal(await input.inputValue(), 'replacement input', 'late response must preserve edited input');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '375px layout has no horizontal overflow');
  console.log('PASS pending controls, replacement input, mobile layout');

  gate = new Promise<void>((resolve) => { releaseGate = resolve; });
  const startedAgain = nextPost();
  await input.fill(JSON.stringify(releases[0]));
  await send.click();
  await startedAgain;
  await page.getByRole('link', { name: tr.t('qv.shell.helpLink'), exact: true }).first().click();
  await page.getByRole('heading', { name: tr.t('qv.help.title'), exact: true }).waitFor();
  const response = page.waitForResponse((r) => r.url().endsWith('/spoil-shares') && r.request().method() === 'POST');
  releaseGate!(); gate = undefined;
  await response;
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('.spoil-add').count(), 0);
  assert.equal(await page.locator('#live-polite').textContent(), '');
  assert.equal(await page.locator('#live-urgent').textContent(), '');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('PASS navigation suppresses stale completion; CSP/no-external-request checks');
} finally {
  releaseGate?.();
  await browser?.close();
  site.closeAllConnections();
  await new Promise<void>((resolve, reject) => site.close((error) => error ? reject(error) : resolve()));
  rmSync(dist, { recursive: true, force: true });
}
