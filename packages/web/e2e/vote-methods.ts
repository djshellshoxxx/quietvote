// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-10-REQ-005, QV-10-REQ-007, QV-13 C-CHOICE
// Production bundle, real encrypted ballots and signed FakeBoard receipts; no production test hooks.
// Run: QV_REQUIRE_BROWSER=1 node packages/web/e2e/vote-methods.ts
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { checkEntry } from '@quietvote/board';
import { streamRng } from '@quietvote/crypto';
import { verifyEnvelope, type ManifestContest } from '@quietvote/protocol';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { launchBrowser } from './browser.ts';

const contests: ManifestContest[] = [
  { id: 'topics', title: 'Approval topics', method: 'approval', min_selections: 0, winners: 2, tie_break: { type: 'declare-tie' },
    options: ['a', 'b', 'c', 'd'].map((id) => ({ id, label: `PRIVATE_APPROVAL_${id.toUpperCase()}_7F31` })) },
  { id: 'board', title: 'Limited board selection', method: 'k-of-n', min_selections: 0, selection_limit: 2, tie_break: { type: 'declare-tie' },
    options: ['p', 'q', 'r', 's'].map((id) => ({ id, label: `PRIVATE_LIMITED_${id.toUpperCase()}_9C42` })) },
];
const sim = await setup({ seed: 'browser-vote-methods', n: 3, t: 2, voters: 4, minCounted: 3, contests });
const board = new FakeBoard(sim);
const passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('vote-methods-key') }, FLOOR_PARAMS);
const keyBytes = Buffer.from(serializeContainer(wrapped.container));
const dist = mkdtempSync(join(tmpdir(), 'qv-vote-methods-'));
await buildSite(dist);
const policy = csp().header;
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
  response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': policy,
    'Cross-Origin-Opener-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' });
  response.end(readFileSync(join(dist, file)));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const base = `${origin}/e/${board.apiId}`;
const plain = (text: string): string => text.replace(/[\u2068\u2069]/g, '');
const labels = contests.flatMap((contest) => contest.options.map((option) => option.label));
const submissions = () => board.requests.filter((request) => request.method === 'POST' && request.url.endsWith('/log/entries'));
type Page = import('playwright').Page;
async function noOptionLabels(page: Page, stage: string): Promise<void> {
  // Include hidden nodes, attributes and current form values, rather than checking only visible text.
  const dom = await page.evaluate(() => [document.documentElement.outerHTML,
    ...Array.from(document.querySelectorAll('input,textarea,select'), (element) => (element as HTMLInputElement).value)].join('\n'));
  for (const label of labels) assert.equal(dom.includes(label), false, `${stage}: option label remained in the document`);
}
const step = async (name: string, run: () => Promise<void>): Promise<void> => { await run(); console.log(`ok - ${name}`); };
let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
try {
  browser = await launchBrowser();
  const page = await (await browser.newContext({ viewport: { width: 960, height: 800 } })).newPage();
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (/Content Security|Trusted Type/i.test(event.text())) errors.push(event.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !/^(?:blob:|data:)/.test(request.url())) external.push(request.url()); });
  await page.goto(base);
  await page.getByRole('button', { name: 'Yes, it matches', exact: true }).click();
  await page.getByText('Election ID confirmed on this device.', { exact: true }).waitFor();
  await page.goto(base + '/key');
  await page.getByLabel('Use a key file I saved before').check();
  await page.getByLabel('Key file', { exact: true }).setInputFiles({ name: 'voter.qvkey', mimeType: 'application/json', buffer: keyBytes });
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByText('You are on the voter list.', { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Vote', exact: true }).first().click();

  const approval = page.getByRole('group', { name: contests[0]!.title, exact: true });
  const limited = page.getByRole('group', { name: contests[1]!.title, exact: true });
  const approvalCounter = approval.locator('p.hint').filter({ hasText: /selected$/ });
  const limitedCounter = limited.locator('p.hint').filter({ hasText: /selected$/ });
  const approvalLabels = contests[0]!.options.map((option) => option.label);
  const limitedLabels = contests[1]!.options.map((option) => option.label);
  await step('approval permits every option despite fewer winners and updates its counter', async () => {
    assert.equal(plain(await approvalCounter.innerText()), '0 of 4 selected');
    for (const [index, label] of approvalLabels.entries()) {
      await approval.getByLabel(label, { exact: true }).check();
      assert.equal(plain(await approvalCounter.innerText()), `${index + 1} of 4 selected`);
    }
    assert.equal(await approval.locator('input:checked').count(), 4);
    assert.equal(await page.locator('#live-urgent').innerText(), '');
    await approval.getByLabel(approvalLabels[3]!, { exact: true }).uncheck();
    assert.equal(plain(await approvalCounter.innerText()), '3 of 4 selected');
  });
  await step('k-of-n rejects an extra choice, announces the limit and preserves the selection count', async () => {
    assert.equal(plain(await limitedCounter.innerText()), '0 of 2 selected');
    await limited.getByLabel(limitedLabels[0]!, { exact: true }).check();
    assert.equal(plain(await limitedCounter.innerText()), '1 of 2 selected');
    await limited.getByLabel(limitedLabels[1]!, { exact: true }).check();
    await limited.getByLabel(limitedLabels[2]!, { exact: true }).click();
    assert.equal(await limited.getByLabel(limitedLabels[2]!, { exact: true }).isChecked(), false);
    assert.equal(await limited.locator('input:checked').count(), 2);
    assert.equal(plain(await limitedCounter.innerText()), '2 of 2 selected');
    await page.waitForFunction(() => document.getElementById('live-urgent')?.textContent?.replace(/[\u2068\u2069]/g, '') === "You can choose up to 2. You've chosen 3.");
    await limited.getByLabel(limitedLabels[0]!, { exact: true }).uncheck();
    assert.equal(plain(await limitedCounter.innerText()), '1 of 2 selected');
    await limited.getByLabel(limitedLabels[2]!, { exact: true }).check();
    assert.equal(plain(await limitedCounter.innerText()), '2 of 2 selected');
  });
  await step('review shows only chosen labels and sealing removes all option labels from the document', async () => {
    await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
    const review = page.getByRole('table', { name: 'Review your choices', exact: true });
    const text = await review.innerText();
    for (const label of [...approvalLabels.slice(0, 3), ...limitedLabels.slice(1, 3)]) assert.ok(text.includes(label));
    for (const label of [approvalLabels[3]!, limitedLabels[0]!, limitedLabels[3]!]) assert.equal(text.includes(label), false);
    assert.equal(submissions().length, 0, 'choosing and reviewing must not submit a ballot');
    await page.getByRole('button', { name: 'Seal my ballot', exact: true }).click();
    const cast = page.getByRole('button', { name: 'Send my vote', exact: true });
    await cast.waitFor({ timeout: 30_000 });
    assert.equal(await cast.isDisabled(), false);
    await noOptionLabels(page, 'sealed');
    assert.equal(submissions().length, 0, 'sealing must not submit a ballot');
  });
  await step('casting records one valid signed ballot and leaves no option labels on its receipt screen', async () => {
    const before = board.entries.length;
    const response = page.waitForResponse((result) => result.url().endsWith('/log/entries') && result.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send my vote', exact: true }).click();
    assert.equal((await response).status(), 201);
    await page.getByText('Your vote was recorded. Here is your receipt.', { exact: true }).waitFor({ timeout: 30_000 });
    await noOptionLabels(page, 'cast');
    assert.equal(submissions().length, 1); assert.equal(board.entries.length, before + 1);
    const entry = board.entries.at(-1)!;
    const checked = checkEntry(entry.headerBytes, entry.body, board.origin, () => sim.voters[0]!.publicKey, entry.seq);
    assert.ok(checked.ok); assert.equal(checked.value.type, 'ballot');
    const envelope = verifyEnvelope(sim.params!, new Set(sim.rollHex), entry.record);
    assert.ok(envelope.ok); assert.equal(envelope.value.intent, 'cast');
    await page.getByRole('button', { name: 'Save receipt file', exact: true }).waitFor();
  });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
} finally {
  await browser?.close(); server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dist, { recursive: true, force: true });
}
