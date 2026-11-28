// SPDX-License-Identifier: AGPL-3.0-or-later
// Automated election-page heuristics extend e2e/a11y.ts; not a WCAG conformance or native-AT review claim.
// Real production assets, protocol fixtures, ballot submission and verified tally; no production test hooks.
// Run: QV_REQUIRE_BROWSER=1 node packages/web/e2e/a11y-election.ts
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { streamRng } from '@quietvote/crypto';
import { ballotCode, logOrigin, type CastEnvelope } from '@quietvote/protocol';
import { setup } from '../../protocol/test/helpers/sim.ts';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { ballotCodeDisplay } from '../src/util/crockford.ts';
import { disclosureFixture } from '../test/helpers/disclosure-fixture.ts';
import { FakeBoard } from '../test/helpers/fake-board.ts';
import { witnessedBoard } from '../test/helpers/witnessed-board.ts';
import { launchBrowser } from './browser.ts';

type Page = import('playwright').Page;
const sim = await setup({ seed: 'browser-election-a11y-open', n: 3, t: 2, voters: 4, minCounted: 3 });
const resultsSim = await disclosureFixture('browser-election-a11y-results', 9, 'mixed');
// The by-entry fixture route uses the real API's base32 ID, rather than FakeBoard's legacy hexadecimal default.
const board = new FakeBoard(sim, logOrigin(sim.manifest).slice('quietvote/v1/'.length));
const resultsBoard = new FakeBoard(resultsSim, logOrigin(resultsSim.manifest).slice('quietvote/v1/'.length));
resultsBoard.closed = true;
const boards = new Map([board, resultsBoard].map((item) => [item.apiId, item]));
const passphrase = 'correct horse battery staple';
const wrapped = await wrapSeed(sim.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('election-a11y-key') }, FLOOR_PARAMS);
const keyBytes = Buffer.from(serializeContainer(wrapped.container));
const dist = mkdtempSync(join(tmpdir(), 'qv-election-a11y-'));
await buildSite(dist);
const policy = csp().header;
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/favicon.ico') { response.writeHead(404).end(); return; }
  if (url.pathname.startsWith('/api/')) {
    const id = /\/elections\/([^/]+)/.exec(url.pathname)?.[1];
    const selected = id === undefined ? board : boards.get(id);
    if (!selected) { response.writeHead(404).end(); return; }
    if (selected === resultsBoard && url.pathname.endsWith('/export.json') && url.searchParams.get('board') === '1') {
      const bundle = selected.bundle();
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ...bundle, board: witnessedBoard(resultsSim, bundle) })); return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await selected.fetch(url.pathname + url.search, { method: request.method ?? 'GET', headers: request.headers as Record<string, string>,
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

async function landmarks(page: Page, name: string): Promise<void> {
  const state = await page.evaluate(() => ({
    main: document.querySelectorAll('main, [role=main]').length,
    banners: [...document.querySelectorAll('header, [role=banner]')].filter((element) => !element.closest('main, article, section, aside, nav')).length,
    navigation: [...document.querySelectorAll('nav')].map((element) => element.getAttribute('aria-label') ?? element.getAttribute('aria-labelledby') ?? ''),
    footers: [...document.querySelectorAll('footer, [role=contentinfo]')].filter((element) => !element.closest('main, article, section, aside, nav')).length,
    headings: document.querySelectorAll('h1').length, lang: document.documentElement.lang, dir: document.documentElement.dir,
  }));
  assert.equal(state.main, 1, `${name}: one main landmark`);
  assert.ok(state.banners > 0 && state.footers > 0, `${name}: banner and contentinfo landmarks`);
  assert.ok(state.navigation.length > 0 && state.navigation.every((label) => label.trim() !== ''), `${name}: named navigation`);
  assert.equal(state.headings, 1, `${name}: one primary heading`);
  assert.equal(state.lang, 'en', `${name}: only the offered, reviewed source locale`);
  assert.equal(state.dir, 'ltr');
}

async function reflow(page: Page, name: string): Promise<void> {
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const state = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      navigation: [...document.querySelectorAll('nav, .tabs')].map((element) => ({ scroll: element.scrollWidth, client: element.clientWidth })),
    }));
    assert.ok(state.document <= width && state.body <= width, `${name}: ${width}px page overflow ${JSON.stringify(state)}`);
    assert.ok(state.navigation.every((item) => item.scroll <= item.client), `${name}: ${width}px navigation overflow`);
  }
}

async function keyboard(page: Page, name: string): Promise<number> {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.keyboard.press('Tab');
  await page.locator('a.skip').focus();
  assert.ok(await page.locator('a.skip').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth && rect.width > 0;
  }), `${name}: focused skip link is visible`);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main', `${name}: skip link focuses main`);
  const expected = await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0) || getComputedStyle(element).visibility === 'hidden' || element.closest('.sr-only')) return false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
      }
      return true;
    };
    const elements = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')]
      .filter((element) => element.tabIndex >= 0 && visible(element) && !(element as HTMLInputElement).disabled);
    const stops = elements.filter((element) => {
      if (!(element instanceof HTMLInputElement) || element.type !== 'radio' || element.name === '') return true;
      const group = elements.filter((other): other is HTMLInputElement => other instanceof HTMLInputElement && other.type === 'radio' && other.name === element.name && other.form === element.form);
      // Native radio groups have one Tab stop; their other choices are reached with arrow keys.
      return (group.find((other) => other.checked) ?? group[0]) === element;
    });
    for (const [index, element] of stops.entries()) element.dataset.qvA11yStop = String(index);
    return stops.map((element) => element.dataset.qvA11yStop!);
  });
  assert.ok(expected.length > 0 && expected.length <= 150, `${name}: bounded visible keyboard controls`);
  const seen = new Set<string>();
  await page.locator('a.skip').focus();
  for (let index = 0; index <= expected.length + 1; index++) {
    const state = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      return { id: element.dataset.qvA11yStop, tag: element.tagName, text: element.textContent?.trim().slice(0, 40),
        indicator: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none',
        focusVisible: element.matches(':focus-visible'), visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth };
    });
    if (state.tag === 'BODY' || state.id !== undefined && seen.has(state.id)) break;
    assert.ok(state.id !== undefined, `${name}: unexpected Tab stop ${JSON.stringify(state)}`);
    assert.ok(state.indicator && state.focusVisible && state.visible, `${name}: missing visible keyboard focus ${JSON.stringify(state)}`);
    seen.add(state.id);
    await page.keyboard.press('Tab');
  }
  const missed = await page.evaluate((ids) => ids.map((id) => {
    const element = document.querySelector(`[data-qv-a11y-stop="${id}"]`);
    return { id, html: element?.outerHTML.slice(0, 400), details: element?.closest('details')?.open };
  }), expected.filter((id) => !seen.has(id)));
  assert.deepEqual([...seen].sort(), [...expected].sort(), `${name}: Tab reaches every visible native Tab stop; missed ${JSON.stringify(missed)}`);
  return seen.size;
}

// Same bounded CSS colour-sampling model and 4.5:1/3:1 thresholds as the existing ordinary-page a11y journey.
// Images, native-AT semantics and manual usability are outside this automated sample.
async function contrast(page: Page, name: string): Promise<number> {
  const samples = await page.evaluate(() => {
    type Color = { r: number; g: number; b: number; a: number };
    const parse = (value: string): Color | undefined => {
      const match = /rgba?\(([^)]+)\)/.exec(value);
      if (!match) return undefined;
      const channels = match[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: channels[0]!, g: channels[1]!, b: channels[2]!, a: channels[3] ?? 1 };
    };
    const over = (top: Color, bottom: Color): Color => {
      const alpha = top.a + bottom.a * (1 - top.a);
      return alpha === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha, a: alpha };
    };
    const luminance = (color: Color): number => {
      const linear = (channel: number): number => { const value = channel / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    };
    return [...document.querySelectorAll('main p, main li, main h1, main h2, a, button, .btn, label, legend, .hint, footer p, .banner, select, input, th, td, caption, figcaption, .qv-bar-value')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0) || getComputedStyle(element).visibility === 'hidden' || (element.textContent ?? '').trim() === '' || element.closest('.sr-only,[disabled],[aria-disabled=true]')) return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
        }
        return true;
      })
      .map((element) => {
        const style = getComputedStyle(element);
        const layers: Color[] = [];
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) { const layer = parse(getComputedStyle(ancestor).backgroundColor); if (layer) layers.push(layer); }
        const background = layers.reverse().reduce((current, layer) => over(layer, current), { r: 255, g: 255, b: 255, a: 1 });
        const foreground = parse(style.color);
        const size = parseFloat(style.fontSize), bold = parseInt(style.fontWeight, 10) >= 700;
        const required = size >= 24 || bold && size >= 18.66 ? 3 : 4.5;
        if (!foreground) return { text: style.color, ratio: 0, required };
        const values = [luminance(over(foreground, background)), luminance(background)].sort((a, b) => b - a);
        return { text: element.textContent!.trim().slice(0, 60), ratio: (values[0]! + 0.05) / (values[1]! + 0.05), required };
      });
  });
  assert.ok(samples.length > 0, `${name}: colour samples exist`);
  for (const sample of samples) assert.ok(sample.ratio >= sample.required, `${name}: ${sample.text} contrast ${sample.ratio.toFixed(2)}:1 needs ${sample.required}:1`);
  return samples.length;
}

async function checkPage(page: Page, name: string): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.device-settings input').length === 2 && [...document.querySelectorAll<HTMLInputElement>('.device-settings input')].every((input) => !input.disabled));
  await landmarks(page, name);
  await reflow(page, name);
  const collapsedStops = await keyboard(page, name);
  const disclosures = page.locator('main details');
  const disclosureCount = await disclosures.count();
  for (let index = 0; index < disclosureCount; index++) {
    const disclosure = disclosures.nth(index);
    if (await disclosure.evaluate((element) => (element as HTMLDetailsElement).open)) continue;
    await disclosure.locator(':scope > summary').focus();
    await page.keyboard.press('Space');
    assert.equal(await disclosure.evaluate((element) => (element as HTMLDetailsElement).open), true, `${name}: keyboard expands disclosure`);
  }
  if (disclosureCount > 0) await reflow(page, `${name}/expanded disclosures`);
  const expandedStops = disclosureCount > 0 ? await keyboard(page, `${name}/expanded disclosures`) : collapsedStops;
  const modes = [
    { name: 'light', scheme: 'light' as const, theme: '', highContrast: false },
    { name: 'system dark', scheme: 'dark' as const, theme: '', highContrast: false },
    { name: 'explicit dark', scheme: 'light' as const, theme: 'dark', highContrast: false },
    { name: 'high contrast', scheme: 'light' as const, theme: '', highContrast: true },
    { name: 'high contrast with dark', scheme: 'dark' as const, theme: '', highContrast: true },
  ];
  let samples = 0;
  for (const mode of modes) {
    await page.emulateMedia({ colorScheme: mode.scheme });
    // These are the same nonpersistent root attributes set by the existing Help controls; no inline styles or CSP changes.
    await page.evaluate(({ theme, highContrast }) => {
      const root = document.documentElement;
      if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
      root.toggleAttribute('data-contrast', highContrast);
    }, mode);
    samples += await contrast(page, `${name}/${mode.name}`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => { delete document.documentElement.dataset.theme; document.documentElement.removeAttribute('data-contrast'); });
  console.log(`ok - ${name}: landmarks, 320/768/1280px reflow, ${collapsedStops}/${expandedStops} collapsed/expanded keyboard stops, ${samples} text samples across 5 themes`);
}

let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
try {
  browser = await launchBrowser();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', timezoneId: 'UTC', locale: 'en-US' })).newPage();
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => { if (/Content Security|Trusted Type/i.test(event.text())) errors.push(event.text()); });
  page.on('request', (request) => { if (!request.url().startsWith(origin) && !/^(?:blob:|data:)/.test(request.url())) external.push(request.url()); });
  await page.goto(base);
  await page.getByRole('heading', { name: sim.manifest.title, exact: true }).waitFor();
  await checkPage(page, 'overview');
  await page.getByRole('button', { name: 'Yes, it matches', exact: true }).click();
  await page.getByText('Election ID confirmed on this device.', { exact: true }).waitFor();
  await page.goto(base + '/rules');
  await page.getByRole('heading', { name: 'Rules and privacy', exact: true }).waitFor();
  await checkPage(page, 'rules');
  await page.goto(base + '/key');
  await page.getByRole('heading', { name: 'Your voting key', exact: true }).waitFor();
  await checkPage(page, 'key');
  // Check arrow-key access to radio options omitted from the native Tab-stop count above.
  const create = page.getByRole('radio', { name: 'Create a new voting key on this device', exact: true });
  const imported = page.getByRole('radio', { name: 'Use a key file I saved before', exact: true });
  await create.focus(); await page.keyboard.press('ArrowDown');
  assert.equal(await imported.isChecked(), true);
  assert.equal(await imported.evaluate((element) => document.activeElement === element), true);
  await page.keyboard.press('ArrowUp'); assert.equal(await create.isChecked(), true);
  await imported.check();
  await page.getByLabel('Key file', { exact: true }).setInputFiles({ name: 'voter.qvkey', mimeType: 'application/json', buffer: keyBytes });
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByText('You are on the voter list.', { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
  for (const label of ['YES', 'ANN', 'A', 'C', 'P', 'Q']) await page.getByLabel(label, { exact: true }).check();
  await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
  await page.getByRole('table', { name: 'Review your choices', exact: true }).waitFor();
  await checkPage(page, 'vote review');
  await page.getByRole('button', { name: 'Seal my ballot', exact: true }).click();
  await page.getByRole('button', { name: 'Send my vote', exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Send my vote', exact: true }).click();
  await page.getByText('Your vote was recorded. Here is your receipt.', { exact: true }).waitFor({ timeout: 30_000 });
  const cast = board.entries.at(-1)!.record as CastEnvelope;
  const code = ballotCodeDisplay(ballotCode(sim.params!.ctx, cast.body), true);
  await page.goto(base + '/receipt');
  await page.getByRole('heading', { name: 'Check a receipt', exact: true }).waitFor();
  await page.getByLabel('Ballot code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Check ballot code', exact: true }).click();
  await page.getByText(/^Included in the public record at entry/).waitFor();
  await checkPage(page, 'receipt');
  await page.goto(`${origin}/e/${resultsBoard.apiId}/results`);
  await page.getByRole('heading', { name: 'Supplied checks passed', exact: true }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('table').count(), 2, 'verified results tables are present during their accessibility checks');
  await checkPage(page, 'verified results');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
} finally {
  await browser?.close(); server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dist, { recursive: true, force: true });
}
