// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-10-REQ-011, QV-13-REQ-003, QV-13-REQ-060, QV-13-REQ-063, QV-13-REQ-092
// Real production bundle, IndexedDB transactions and four-method ballots. No production test hooks.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { streamRng } from '@quietvote/crypto';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, serializeContainer, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import type { DeviceSettings } from '../src/key/storage.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { launchBrowser } from './browser.ts';

type Page = import('playwright').Page;
const dist = mkdtempSync(join(tmpdir(), 'qv-device-settings-'));
await buildSite(dist);
const sim = await setup({ seed: 'web-device-settings', n: 3, t: 2, voters: 4, minCounted: 3 });
const board = new FakeBoard(sim);
const policy = csp().header;
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (rq, rs) => {
  const url = new URL(rq.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const body = await new Promise<string | undefined>((resolve) => {
      const chunks: Buffer[] = []; rq.on('data', (chunk: Buffer) => chunks.push(chunk));
      rq.on('end', () => resolve(chunks.length ? Buffer.concat(chunks).toString() : undefined));
    });
    const answer = await board.fetch(url.pathname + url.search, { method: rq.method ?? 'GET', headers: rq.headers as Record<string, string>, ...(body === undefined ? {} : { body }) }).catch(() => new Response('{}', { status: 502 }));
    rs.writeHead(answer.status, { 'Content-Type': answer.headers.get('Content-Type') ?? 'application/json' });
    rs.end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  const file = url.pathname.startsWith('/assets/') && existsSync(join(dist, url.pathname)) ? url.pathname : '/index.html';
  rs.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': policy, 'Cross-Origin-Opener-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' });
  rs.end(readFileSync(join(dist, file)));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const base = `${origin}/e/${board.apiId}`;
const passphrase = 'correct horse battery staple';
const keyFile = join(dist, 'voter.qvkey');
const key = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('device-settings-key') }, FLOOR_PARAMS);
writeFileSync(keyFile, serializeContainer(key.container));
const browser = await launchBrowser();
const errors: string[] = [];
const watch = (page: Page): void => { page.on('pageerror', (error) => errors.push(error.message)); };
const shared = (page: Page) => page.getByRole('checkbox', { name: 'This is a shared or public device', exact: true });
const remember = (page: Page) => page.getByRole('checkbox', { name: 'Remember receipts on this device', exact: true });
const acknowledgment = (page: Page) => page.getByRole('checkbox', { name: 'I have read these rules and privacy limits', exact: true });
const idle = async (page: Page): Promise<void> => { await page.waitForFunction(() => [...document.querySelectorAll('.device-settings input')].length === 2 && [...document.querySelectorAll('.device-settings input')].every((input) => !(input as HTMLInputElement).disabled)); };
const saved = async (page: Page): Promise<{ settings?: DeviceSettings; counts: Record<string, number> }> => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('quietvote-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try {
    const get = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['keys', 'receipts', 'heads', 'settings'], 'readonly');
    const settingsRequest = get(tx.objectStore('settings').get('settings'));
    const counts = Object.fromEntries(await Promise.all(['keys', 'receipts', 'heads', 'settings'].map(async (name) => [name, await get(tx.objectStore(name).count())])));
    const settings = await settingsRequest as DeviceSettings | undefined;
    return { ...(settings === undefined ? {} : { settings }), counts };
  } finally { db.close(); }
});
const step = async (name: string, run: () => Promise<void>): Promise<void> => { await run(); console.log(`ok - ${name}`); };

try {
  await step('organizer uses explicit DST choices and valid gap alternatives independently of the browser zone', async () => {
    const context = await browser.newContext({ timezoneId: 'America/New_York', viewport: { width: 320, height: 800 } });
    try {
      const page = await context.newPage(); watch(page); await page.goto(`${origin}/new`);
      const zone = page.getByLabel('Time zone of this election', { exact: true });
      const opens = page.getByLabel('Voting opens', { exact: true });
      assert.equal(await zone.inputValue(), 'America/New_York');
      await zone.fill('Europe/Berlin');
      await opens.fill('2027-03-28T02:30');
      assert.equal(await opens.getAttribute('aria-invalid'), 'true');
      await page.getByText(/That local time does not exist/).waitFor();
      const alternative = page.getByRole('button', { name: '2027-03-28 01:30', exact: true });
      await alternative.focus(); await page.keyboard.press('Enter');
      assert.equal(await opens.inputValue(), '2027-03-28T01:30');
      assert.ok(await opens.evaluate((element) => element === document.activeElement));
      await page.getByText(/2027-03-28T00:30:00Z/).waitFor();
      await opens.fill('2027-10-31T02:30');
      const earlier = page.getByRole('radio', { name: 'UTC+02:00', exact: true });
      const later = page.getByRole('radio', { name: 'UTC+01:00', exact: true });
      assert.equal(await earlier.isChecked(), false); assert.equal(await later.isChecked(), false);
      assert.equal(await opens.getAttribute('aria-invalid'), 'true');
      await later.focus(); await page.keyboard.press('Space');
      await page.getByText(/2027-10-31T01:30:00Z/).waitFor();
      assert.equal(await later.isChecked(), true);
      assert.ok(await later.evaluate((element) => element === document.activeElement), 'rerendering the selected offset must preserve keyboard focus');
      await page.keyboard.press('ArrowLeft');
      await page.getByText(/2027-10-31T00:30:00Z/).waitFor();
      assert.equal(await earlier.isChecked(), true);
      await opens.fill('2027-10-31T02:45');
      assert.equal(await opens.getAttribute('aria-invalid'), 'true');
      assert.equal(await earlier.isChecked(), false); assert.equal(await later.isChecked(), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'offset controls reflow at 320 CSS pixels');
      await zone.fill('Pacific/Apia'); await opens.fill('2011-12-30T12:00');
      await page.getByRole('button', { name: '2011-12-29 12:00', exact: true }).waitFor();
      await page.getByRole('button', { name: '2011-12-31 12:00', exact: true }).click();
      assert.equal(await opens.getAttribute('aria-invalid'), 'false');
      await page.getByText(/2011-12-30T22:00:00Z/).waitFor();
      await zone.fill('not/a-zone');
      assert.equal(await opens.getAttribute('aria-invalid'), 'true');
      await zone.fill('UTC'); await opens.fill('0099-01-01T00:00');
      await page.getByText(/0099-01-01T00:00:00Z/).waitFor();
      assert.equal(await opens.getAttribute('aria-invalid'), 'false');
      await zone.fill('Europe/Paris'); await opens.fill('1900-01-01T12:00');
      await page.getByText(/1900-01-01T11:50:39Z/).waitFor();
    } finally { await context.close(); }
  });

  await step('concurrent tabs merge distinct preferences and reload their committed values', async () => {
    const context = await browser.newContext();
    try {
      const left = await context.newPage(), right = await context.newPage(); watch(left); watch(right);
      await left.setViewportSize({ width: 320, height: 800 });
      await Promise.all([left, right].map(async (page) => { await page.goto(origin); await idle(page); }));
      await shared(left).focus();
      await Promise.all([left.keyboard.press('Space'), remember(right).uncheck()]);
      await Promise.all([idle(left), idle(right)]);
      assert.ok(await left.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'device controls reflow at 320 CSS pixels');
      const settings = (await saved(left)).settings!;
      assert.equal(settings.sharedDevice, true); assert.equal(settings.rememberReceipts, false);
      await left.reload(); await idle(left);
      assert.equal(await shared(left).isChecked(), true); assert.equal(await remember(left).isChecked(), false);
    } finally { await context.close(); }
  });

  await step('a settings request that succeeds before transaction abort is never announced as saved', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage(); watch(page); await page.goto(origin); await idle(page);
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          const request = original.call(this, value, key);
          if (this.name === 'settings' && key === 'settings') request.addEventListener('success', () => this.transaction.abort(), { once: true });
          return request;
        };
      });
      await shared(page).click(); // This failure intentionally reverts the native checkbox before an action assertion can run.
      await page.getByText('Could not confirm saved settings.', { exact: true }).first().waitFor();
      assert.equal(await shared(page).isChecked(), false);
      assert.equal(await shared(page).isDisabled(), true);
      assert.equal(await page.getByText('Done', { exact: true }).count(), 0);
      assert.equal((await saved(page)).settings, undefined);
      await page.reload(); await idle(page);
      assert.equal(await shared(page).isChecked(), false);
    } finally { await context.close(); }
  });

  await step('late settings work cannot write or announce success after route navigation', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage(); watch(page); await page.goto(origin); await idle(page);
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.get;
        let hold = true;
        IDBObjectStore.prototype.get = function (query: IDBValidKey | IDBKeyRange) {
          const request = original.call(this, query);
          if (hold && this.name === 'settings' && this.transaction.mode === 'readwrite' && query === 'settings') {
            hold = false;
            Object.defineProperty(request, 'onsuccess', { set(handler: (event: Event) => void) {
              request.addEventListener('success', (event) => {
                (window as unknown as { releaseSettingsRead: () => void }).releaseSettingsRead = () => handler.call(request, event);
              }, { once: true });
            } });
          }
          return request;
        };
      });
      await shared(page).check();
      await page.waitForFunction(() => typeof (window as unknown as { releaseSettingsRead?: unknown }).releaseSettingsRead === 'function');
      await page.getByRole('link', { name: 'Help and accessibility', exact: true }).click();
      await page.getByRole('heading', { name: 'Help and accessibility', exact: true }).waitFor();
      await page.evaluate(() => (window as unknown as { releaseSettingsRead: () => void }).releaseSettingsRead());
      await idle(page);
      assert.equal((await saved(page)).settings, undefined);
      assert.equal(await shared(page).isChecked(), false);
      assert.equal(await page.getByText('Done', { exact: true }).count(), 0);
    } finally { await context.close(); }
  });

  await step('unreadable local settings never become silent defaults or a rules-acknowledgment gate', async () => {
    const context = await browser.newContext();
    try {
      await context.addInitScript(() => {
        const original = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (query: IDBValidKey | IDBKeyRange) {
          if (this.name === 'settings' && query === 'settings') throw new DOMException('settings unavailable', 'UnknownError');
          return original.call(this, query);
        };
      });
      const page = await context.newPage(); watch(page); await page.goto(`${base}/rules`);
      await page.getByText('Could not confirm saved settings.', { exact: true }).first().waitFor();
      assert.equal(await acknowledgment(page).isDisabled(), true);
      assert.equal(await shared(page).isDisabled(), true);
      await page.getByText('Could not confirm saved settings.', { exact: true }).first().waitFor();
      await page.getByRole('link', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Create key', exact: true }).waitFor();
    } finally { await context.close(); }
  });

  const context = await browser.newContext();
  const page = await context.newPage(); watch(page);
  try {
    await step('rules acknowledgment stays local, optional, and persistent beside the device preferences', async () => {
      await page.goto(`${base}/rules`); await idle(page);
      assert.equal(await acknowledgment(page).isChecked(), false);
      const requests = board.requests.filter((request) => request.method === 'POST').length;
      await page.getByRole('link', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Create key', exact: true }).waitFor();
      await page.getByRole('link', { name: 'Rules and privacy', exact: true }).click();
      await acknowledgment(page).check();
      await page.getByText('Done', { exact: true }).first().waitFor();
      await shared(page).check(); await idle(page); await remember(page).uncheck(); await idle(page);
      assert.equal(board.requests.filter((request) => request.method === 'POST').length, requests);
      await page.reload(); await idle(page);
      assert.equal(await acknowledgment(page).isChecked(), true);
      assert.equal(await shared(page).isChecked(), true); assert.equal(await remember(page).isChecked(), false);
      await page.getByRole('link', { name: 'Continue', exact: true }).click();
      await page.getByLabel('Use a key file I saved before').check();
      await page.getByLabel('Key file', { exact: true }).setInputFiles(keyFile);
      await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
      await page.getByRole('button', { name: 'Create key', exact: true }).click();
      await page.getByText('You are on the voter list.', { exact: true }).waitFor({ timeout: 30000 });
    });
    await step('review notices use the correct maximum for all four methods and never disable sealing', async () => {
      await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
      await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
      const notice = "You've selected fewer than the maximum. That is allowed.";
      assert.equal(await page.getByText(notice, { exact: true }).count(), 4);
      assert.equal(await page.getByRole('button', { name: 'Seal my ballot', exact: true }).isEnabled(), true);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      for (const option of ['YES', 'ANN', 'A', 'B', 'P', 'Q']) await page.getByLabel(option, { exact: true }).check();
      await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
      assert.equal(await page.getByText(notice, { exact: true }).count(), 1, 'two of four approvals remains an undervote despite two winners');
      await page.getByRole('rowheader', { name: 'Topics', exact: true }).locator('..').getByText(notice, { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      for (const option of ['C', 'D']) await page.getByLabel(option, { exact: true }).check();
      await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
      assert.equal(await page.getByText(notice, { exact: true }).count(), 0);
      assert.equal(await page.getByRole('table', { name: 'Review your choices', exact: true }).getAttribute('translate'), 'no');
    });
    await step('opting out preserves the receipt download and voting key, while future opt-in saves a receipt', async () => {
      const cast = async (): Promise<void> => {
        await page.getByRole('button', { name: 'Seal my ballot', exact: true }).click();
        await page.getByRole('button', { name: 'Send my vote', exact: true }).click();
        await page.getByText('Your vote was recorded. Here is your receipt.', { exact: true }).waitFor({ timeout: 30000 });
        await idle(page);
      };
      await cast();
      let state = await saved(page);
      assert.equal(state.counts['receipts'], 0); assert.equal(state.counts['keys'], 1);
      await page.getByRole('button', { name: 'Save receipt file', exact: true }).waitFor();
      assert.equal(state.settings!.sharedDevice, true, 'shared mode does not automatically clear the device');
      await remember(page).check(); await idle(page);
      await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
      await page.getByLabel('YES', { exact: true }).check();
      await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
      await cast();
      state = await saved(page); assert.equal(state.counts['receipts'], 1);
      await remember(page).uncheck(); await idle(page);
      assert.equal((await saved(page)).counts['receipts'], 1, 'turning remembering off never silently removes an existing receipt');
    });
    await step('only confirmed Clear this device removes keys, receipts and preferences', async () => {
      await page.getByRole('button', { name: 'Clear this device', exact: true }).click();
      await page.getByRole('dialog', { name: 'Clear this device', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal((await saved(page)).counts['keys'], 1); assert.equal((await saved(page)).counts['receipts'], 1);
      await page.getByRole('button', { name: 'Clear this device', exact: true }).click();
      await page.getByRole('dialog', { name: 'Clear this device', exact: true }).getByRole('button', { name: 'Remove my key, receipts and drafts from this browser', exact: true }).click();
      await page.getByRole('main').getByText('Your key is locked.', { exact: true }).waitFor(); await idle(page);
      const state = await saved(page);
      assert.deepEqual(state.counts, { keys: 0, receipts: 0, heads: 0, settings: 0 });
      assert.equal(await shared(page).isChecked(), false); assert.equal(await remember(page).isChecked(), true);
    });
  } finally { await context.close(); }
  assert.deepEqual(errors, [], 'no unhandled browser errors');
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  rmSync(dist, { recursive: true, force: true });
}
