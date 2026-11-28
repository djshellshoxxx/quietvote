// SPDX-License-Identifier: AGPL-3.0-or-later
// Built voter key form, real default Argon2id and native AES. The test only pauses/counts the AES-key handoff.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { streamRng } from '@quietvote/crypto';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, DEFAULT_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { browserTools, launchBrowser } from './browser.ts';

type Observation = { count: number; release(): void; reset(): void };
type ObservedWindow = Window & { __qvKeyOperation: Observation };
async function observe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let release!: () => void, pending: Promise<void>;
    const state = { count: 0, release: () => release(), reset: () => {
      state.count = 0; pending = new Promise<void>((resolve) => { release = resolve; });
    } };
    state.reset();
    const native = crypto.subtle.importKey.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'importKey', { configurable: true, value: async (...args: unknown[]) => {
      if (args[2] === 'AES-GCM') { state.count++; await pending; }
      return Reflect.apply(native, undefined, args);
    } });
    Object.defineProperty(window, '__qvKeyOperation', { value: state });
  });
}
async function held(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as ObservedWindow).__qvKeyOperation.count === 1);
  const form = keyForm(page, true); await form.waitFor();
  assert.equal(await form.locator('input').evaluateAll((elements) => elements.length > 0 && elements.every((element) => (element as HTMLInputElement).disabled)), true);
  for (const name of ['Create key', 'Unlock key', 'Generate 7 words for me', 'Import organizer key']) {
    const button = form.getByRole('button', { name, exact: true });
    if (await button.count()) assert.equal(await button.isDisabled(), true);
  }
}
const keyForm = (page: Page, busy: boolean) => page.locator(`main [aria-busy="${busy}"]`).filter({ has: page.getByLabel('Passphrase', { exact: true }) });
const count = (page: Page) => page.evaluate(() => (window as unknown as ObservedWindow).__qvKeyOperation.count);
const release = (page: Page) => page.evaluate(() => (window as unknown as ObservedWindow).__qvKeyOperation.release());

test('production voter key controls guard duplicate work and recover after cost cancellation', { timeout: 180_000 }, async (t) => {
  try { browserTools({ required: true }); }
  catch (error) {
    if (process.env.QV_REQUIRE_BROWSER !== '1' && error instanceof Error && error.message.startsWith('Browser checks unavailable:')) {
      t.skip(error.message); return;
    }
    throw error;
  }
  const dist = mkdtempSync(join(tmpdir(), 'qv-key-flight-browser-'));
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  const sim = await setup({ seed: 'voter-key-single-flight-browser', n: 3, t: 2, voters: 4, minCounted: 3 });
  const board = new FakeBoard(sim), password = 'correct horse battery staple';
  const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), password, { ...defaultDeps(), rng: streamRng('browser-key-flight') }, DEFAULT_PARAMS);
  const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/favicon.ico') { response.writeHead(404).end(); return; }
    if (url.pathname.startsWith('/api/')) {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
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
  try {
    browser = await launchBrowser(); await buildSite(dist);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const errors: string[] = [], external: string[] = [], methods: string[] = [];
    const newPage = async (organizer = false) => {
      const page = await (await browser!.newContext()).newPage(); page.setDefaultTimeout(30_000); await observe(page);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (/Content Security|Trusted Type/i.test(message.text())) errors.push(message.text()); });
      page.on('request', (request) => {
        methods.push(request.method());
        if (!request.url().startsWith(origin) && !/^(data|blob):/.test(request.url())) external.push(request.url());
      });
      await page.goto(organizer ? `${origin}/new` : `${origin}/e/${board.apiId}/key`); await page.getByRole('button', { name: 'Create key', exact: true }).waitFor();
      return page;
    };
    const page = await newPage(); await page.getByLabel('Passphrase', { exact: true }).fill(password);
    const create = page.getByRole('button', { name: 'Create key', exact: true }); await create.dblclick(); await held(page);
    await create.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.getByRole('button', { name: 'Generate 7 words for me', exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
    assert.equal(await page.getByLabel('Passphrase', { exact: true }).inputValue(), password); assert.equal(await count(page), 1);
    await release(page); await page.getByRole('button', { name: 'Unlock key', exact: true }).waitFor();
    await keyForm(page, false).waitFor(); assert.equal(await count(page), 2);
    assert.equal(await page.getByRole('button', { name: 'Download key file', exact: true }).isEnabled(), true);
    console.log('ok - duplicate Create performs one real wrap/unlock pair; related controls disable and backup remains available');

    await page.evaluate(() => (window as unknown as ObservedWindow).__qvKeyOperation.reset());
    const unlock = page.getByRole('button', { name: 'Unlock key', exact: true }); await unlock.dblclick(); await held(page);
    await unlock.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await count(page), 1); await release(page); await keyForm(page, false).waitFor();
    assert.equal(await count(page), 1); assert.equal(await unlock.isEnabled(), true);
    console.log('ok - duplicate Unlock performs one derivation and re-enables its controls');

    await page.evaluate(() => (window as unknown as ObservedWindow).__qvKeyOperation.reset());
    const preview = page.getByRole('button', { name: 'Show recovery code', exact: true });
    const codesBefore = await page.locator('main bdi.code').count(); await preview.dblclick(); await held(page);
    assert.equal(await preview.isDisabled(), true); assert.equal(await page.getByRole('button', { name: 'Download key file', exact: true }).isDisabled(), true);
    await preview.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await release(page); await page.getByRole('button', { name: 'I have written it down', exact: true }).waitFor();
    await keyForm(page, false).waitFor(); assert.equal(await count(page), 1); assert.equal(await page.locator('main bdi.code').count(), codesBefore + 1);
    await page.getByRole('button', { name: 'I have written it down', exact: true }).click();
    assert.equal(await page.locator('main bdi.code').count(), codesBefore); assert.equal(await preview.isEnabled(), true);
    console.log('ok - repeated recovery preview derives once, preserves backup controls and hides its code on request');

    const imported = await newPage();
    await imported.getByLabel('Use a key file I saved before', { exact: true }).check();
    const file = imported.getByLabel('Key file', { exact: true });
    await file.setInputFiles({ name: 'cost-profile.qvkey', mimeType: 'application/json', buffer: Buffer.from(serializeContainer({ ...wrapped.container, t: DEFAULT_PARAMS.t + 1 })) });
    await imported.getByLabel('Passphrase', { exact: true }).fill(password);
    await imported.getByRole('button', { name: 'Create key', exact: true }).click();
    await imported.getByRole('dialog').waitFor(); assert.equal(await count(imported), 0);
    assert.equal(await imported.getByLabel('Passphrase', { exact: true }).isDisabled(), true);
    await imported.getByRole('button', { name: 'Cancel', exact: true }).click();
    await imported.getByText('Unlock cancelled. Nothing was unlocked.', { exact: true }).waitFor();
    assert.equal(await count(imported), 0); assert.equal(await file.isEnabled(), true);
    await file.setInputFiles({ name: 'voter.qvkey', mimeType: 'application/json', buffer: Buffer.from(serializeContainer(wrapped.container)) });
    await imported.getByRole('button', { name: 'Create key', exact: true }).click(); await held(imported); await release(imported);
    await imported.getByText('You are on the voter list.', { exact: true }).waitFor();
    await keyForm(imported, false).waitFor(); assert.equal(await count(imported), 2);
    console.log('ok - cancelling the cost prompt does no derivation; the file/password controls recover for a successful import');

    const organizer = await newPage(true);
    await organizer.getByLabel('Organizer key file', { exact: true }).setInputFiles({ name: 'organizer.qvkey', mimeType: 'application/json', buffer: Buffer.from(serializeContainer(wrapped.container)) });
    await organizer.getByLabel('Passphrase', { exact: true }).fill(password);
    await organizer.getByRole('button', { name: 'Import organizer key', exact: true }).click(); await held(organizer); await release(organizer);
    await keyForm(organizer, false).waitFor(); assert.equal(await organizer.getByRole('button', { name: 'Unlock key', exact: true }).isEnabled(), true);
    const freeze = organizer.getByRole('button', { name: 'Freeze election', exact: true }); assert.equal(await freeze.isEnabled(), true);
    await organizer.evaluate(() => (window as unknown as ObservedWindow).__qvKeyOperation.reset());
    await organizer.getByLabel('Passphrase', { exact: true }).fill(password);
    await organizer.getByRole('button', { name: 'Unlock key', exact: true }).click(); await held(organizer); assert.equal(await freeze.isDisabled(), true);
    const before = await organizer.locator('main').textContent();
    await freeze.evaluate((button) => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await organizer.locator('main').textContent(), before);
    await release(organizer); await keyForm(organizer, false).waitFor(); assert.equal(await freeze.isEnabled(), true); assert.equal(await count(organizer), 1);
    console.log('ok - a previously unlocked organizer disables Freeze election during another key operation, then restores it');
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.ok(methods.every((method) => method === 'GET'));
  } finally {
    await browser?.close(); server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve())); rmSync(dist, { recursive: true, force: true });
  }
});
