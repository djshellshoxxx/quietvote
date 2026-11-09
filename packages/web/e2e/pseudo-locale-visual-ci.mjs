// Isolated app-only pseudo-locale browser checks. Uses Playwright route fulfillment, not a web/API server.
// Pseudo locales are test-only fixtures; this does not mark any shipped translation as reviewed or offered.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const playwrightPath = process.env.QV_PLAYWRIGHT_MODULE_ROOT
  ? join(process.env.QV_PLAYWRIGHT_MODULE_ROOT, 'playwright')
  : 'playwright';
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightPath);
const sourceDir = fileURLToPath(new URL('..', import.meta.url));
const entry = String.raw`
import { startApp } from './src/ui/app.ts';
import { IdbStorage } from './src/key/storage.ts';
import { EN, MESSAGE_KEYS } from './src/i18n/en.ts';
import { sourceHash } from './src/i18n/locales-core.ts';
import { pseudoEnXA, pseudoArXB } from './src/i18n/pseudo.ts';
import { readLanguagePreference, writeLanguagePreference } from './src/i18n/preference.ts';
const pseudo = (tag, dir, map) => {
  const messages = {}; const review = {};
  for (const key of MESSAGE_KEYS) { messages[key] = map(EN[key].message); review[key] = sourceHash(key); }
  return { tag, dir, autonym: tag, tier: 1, messages, review };
};
const locales = [
  { tag: 'en', dir: 'ltr', autonym: 'English', tier: 'source', messages: {}, review: {} },
  pseudo('en-XA', 'ltr', pseudoEnXA),
  pseudo('ar-XB', 'rtl', pseudoArXB),
];
const storage = new IdbStorage();
const url = new URL(location.href);
const seed = url.searchParams.get('__seed');
if (seed) {
  await writeLanguagePreference(storage, seed);
  url.searchParams.delete('__seed');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}
const storedLanguage = await readLanguagePreference(storage);
startApp({ root: document.getElementById('app'), storage, storedLanguage, build: { version: 'test', id: 'pseudo-visual-ci' }, locales });
`;
const built = await build({
  stdin: { contents: entry, resolveDir: sourceDir, loader: 'js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
});
const client = built.outputFiles[0].text;
const styles = readFileSync(new URL('../static/styles.css', import.meta.url), 'utf8');
const origin = 'http://quietvote.test';
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QuietVote visual fixture</title><link rel="stylesheet" href="/styles.css"><script type="module" src="/client.js"></script></head><body><div id="app"></div></body></html>';
const unexpected = [];
const pageErrors = [];
const browser = await chromium.launch({ ...(process.env.QV_CHROMIUM ? { executablePath: process.env.QV_CHROMIUM } : {}), args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(url.href); await route.abort(); return; }
    if (url.pathname === '/client.js') { await route.fulfill({ status: 200, contentType: 'text/javascript', body: client }); return; }
    if (url.pathname === '/styles.css') { await route.fulfill({ status: 200, contentType: 'text/css', body: styles }); return; }
    if (url.pathname === '/favicon.ico') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });

  await page.goto(`${origin}/?__seed=en-XA`);
  await page.locator('main h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-XA', 'stored pseudo language is used at startup');
  assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
  assert.equal(await page.locator('.language-picker select').count(), 1, 'multiple reviewed test fixtures expose the language picker');

  const verifyViewport = async (locale, dir, path, width) => {
    await page.setViewportSize({ width, height: 800 });
    if (new URL(page.url()).pathname !== path) await page.goto(`${origin}${path}`);
    await page.locator('main h1').waitFor();
    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      navWidth: document.querySelector('nav')?.scrollWidth ?? 0,
      navClient: document.querySelector('nav')?.clientWidth ?? 0,
      heading: document.querySelector('main h1')?.textContent?.trim() ?? '',
    }));
    assert.equal(state.lang, locale, `${locale} ${path} language`);
    assert.equal(state.dir, dir, `${locale} ${path} direction`);
    assert.ok(state.heading.length > 0, `${locale} ${path} has a heading`);
    assert.ok(state.document <= width && state.body <= width, `${locale} ${path} has no horizontal page overflow at ${width}px: ${JSON.stringify(state)}`);
    assert.ok(state.navWidth <= state.navClient, `${locale} ${path} navigation fits at ${width}px: ${JSON.stringify(state)}`);
    console.log(`ok - ${locale} ${path} ${width}px`);
  };

  for (const width of [320, 1280]) await verifyViewport('en-XA', 'ltr', '/', width);
  await page.locator('nav a[href="/help"]').click();
  await page.locator('main h1').waitFor();
  assert.equal(new URL(page.url()).pathname, '/help');
  for (const width of [320, 1280]) await verifyViewport('en-XA', 'ltr', '/help', width);

  // The query overrides the saved locale. A menu choice then persists in IndexedDB and is used after reload.
  await page.goto(`${origin}/?lang=ar-XB`);
  await page.locator('main h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ar-XB');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  await page.goto(`${origin}/`);
  await page.locator('main h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-XA', 'stored locale is still in effect before a menu change');
  await page.locator('.language-picker select').selectOption('ar-XB');
  await page.waitForFunction(() => document.documentElement.lang === 'ar-XB');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl', 'menu change reloads using persisted IndexedDB preference');

  for (const width of [320, 1280]) await verifyViewport('ar-XB', 'rtl', '/', width);
  await page.locator('nav a[href="/help"]').click();
  await page.locator('main h1').waitFor();
  assert.equal(new URL(page.url()).pathname, '/help');
  for (const width of [320, 1280]) await verifyViewport('ar-XB', 'rtl', '/help', width);

  await page.goto(`${origin}/?lang=en-XA`);
  await page.locator('main h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en-XA', 'query overrides stored RTL locale');
  await page.goto(`${origin}/`);
  await page.locator('main h1').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ar-XB', 'stored RTL locale resumes after query is removed');
  assert.deepEqual(unexpected, [], 'the client makes no external requests');
  assert.deepEqual(pageErrors, [], 'no uncaught browser errors');
  console.log('pseudo-locale visual and stored-language browser checks passed (UI fixture only; no server/API/election)');
} finally {
  await browser.close();
}
