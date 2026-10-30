// Ordinary Help/Home presentation smoke test. No election, verifier, API or persistent storage flows.
// Uses Playwright + Chromium, which are NOT repo dependencies (global install). Skips (exit 0) when either is missing; QV_REQUIRE_BROWSER=1 makes a skip fail. QV_CHROMIUM overrides the browser binary.
// Run from the repository root: node packages/web/e2e/help.ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const req = createRequire('/opt/node22/lib/node_modules/');
let pw: typeof import('playwright');
try {
  pw = req('playwright');
} catch {
  console.log('help e2e skipped: playwright is not installed');
  process.exit(process.env.QV_REQUIRE_BROWSER ? 1 : 0);
}
let browser: import('playwright').Browser;
try {
  browser = await pw.chromium.launch(process.env.QV_CHROMIUM ? { executablePath: process.env.QV_CHROMIUM } : {});
} catch (e) {
  console.log('help e2e skipped: chromium cannot be launched:', e instanceof Error ? e.message.split('\n')[0] : e);
  process.exit(process.env.QV_REQUIRE_BROWSER ? 1 : 0);
}
const browserTest = String.raw`
import { startApp } from './src/ui/app.ts';
import { MemoryStorage } from './src/key/storage.ts';
const checks = [];
const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
try {
  startApp({ root: document.getElementById('app'), storage: new MemoryStorage(), build: { version: 'test', id: 'help-only' } });
  const requestedDark = new URL(location.href).searchParams.get('dark') === 'true';
  const notices = [...document.querySelectorAll('.banner')].map((node) => node.textContent?.trim() ?? '').join(' ');
  check('experimental and demo warnings are visible', notices.includes('Experimental software') && notices.includes('DEMO — not for real votes'));
  const noticeOverflow = [...document.querySelectorAll('.banner')].some((node) => {
    const box = node.getBoundingClientRect();
    return box.left < -1 || box.right > innerWidth + 1 || node.scrollWidth > node.clientWidth + 1;
  });
  check('warning banners fit the viewport', !noticeOverflow);
  const cdlCredit = document.querySelector('footer a[href="https://djshellshoxxx.github.io/circuitdriftlabs/"]');
  check('CDL credit links to the official studio page', cdlCredit?.textContent?.includes('Circuit Drift Labs') === true);
  const theme = () => document.querySelector('main select');
  const contrast = () => document.querySelector('main input[type=checkbox]');
  const bg = () => getComputedStyle(document.body).backgroundColor;
  const scheme = () => getComputedStyle(document.documentElement).colorScheme;
  const choose = (v) => { theme().value = v; theme().dispatchEvent(new Event('change', { bubbles: true })); };
  const nav = (path) => document.querySelector('nav a[href="' + path + '"]').click();
  check('Help controls start at device defaults', theme().value === 'auto' && !contrast().checked);
  check('Help is linked once in the shared header', document.querySelectorAll('header a[href="/help"]').length === 1);
  check('Theme has a visible associated label', document.querySelector('label[for="' + theme().id + '"]').textContent === 'Colour theme');
  choose('dark');
  check('Explicit dark palette and native controls', bg() === 'rgb(16, 21, 31)' && scheme() === 'dark');
  contrast().click();
  check('High contrast overrides dark palette', bg() === 'rgb(0, 0, 0)' && scheme() === 'dark');
  nav('/');
  check('Home navigation updates heading and focus', location.pathname === '/' && document.activeElement === document.querySelector('main h1'));
  nav('/help');
  check('Help revisit restores both controls', theme().value === 'dark' && contrast().checked);
  contrast().click();
  check('Turning contrast off restores selected dark palette', bg() === 'rgb(16, 21, 31)');
  choose('light');
  check('Explicit light palette and native controls', bg() === 'rgb(255, 255, 255)' && scheme() === 'light');
  choose('auto');
  const darkDevice = matchMedia('(prefers-color-scheme: dark)').matches;
  check('Automatic removes override and follows device', !document.documentElement.hasAttribute('data-theme') && bg() === (darkDevice ? 'rgb(16, 21, 31)' : 'rgb(255, 255, 255)'));
  check('Requested device mode is exercised', darkDevice === requestedDark);
  const home = document.querySelector('nav a[href="/"]');
  let intercepted;
  home.addEventListener('click', (event) => { intercepted = event.defaultPrevented; event.preventDefault(); }, { once: true });
  home.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
  check('Modified navigation retains browser handling', intercepted === false && location.pathname === '/help');
  nav('/');
  check('Unmodified navigation still uses the app', location.pathname === '/');
  document.documentElement.dataset.helpCheck = 'pass';
} catch (error) {
  checks.push('FAIL: ' + error.message);
  document.documentElement.dataset.helpCheck = 'fail';
}
const result = document.createElement('pre');
result.id = 'help-check-results';
result.textContent = checks.join('\n');
document.body.append(result);
`;

const output = await build({ stdin: { contents: browserTest, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'js' }, bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const css = await readFile(new URL('../static/styles.css', import.meta.url));
const unexpected: string[] = [];
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/help.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(output.outputFiles[0]!.contents); }
  else if (path === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else if (path === '/help' || path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/help.js"></script>'); }
  else { if (path !== '/favicon.ico') unexpected.push(path); res.writeHead(404).end(); }
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
try {
  for (const width of [320, 1280]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({ colorScheme: dark ? 'dark' : 'light', viewport: { width, height: 720 } });
      const page = await context.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (e) => pageErrors.push(e.message));
      await page.goto(`http://127.0.0.1:${address.port}/help?dark=${dark}`);
      await page.waitForFunction(() => document.documentElement.dataset.helpCheck !== undefined, undefined, { timeout: 30_000 }).catch((e: unknown) => { throw new Error(`Help checks did not finish: ${pageErrors.join('; ') || String(e)}`); });
      const state = await page.evaluate(() => ({ status: document.documentElement.dataset.helpCheck, results: document.getElementById('help-check-results')?.textContent ?? '' }));
      assert.equal(state.status, 'pass', state.results);
      console.log(`${width}px ${dark ? 'dark' : 'light'}: ${state.results.split('\n').length} Help/Home checks passed`);
      await context.close();
    }
  }
  assert.deepEqual(unexpected, [], 'Only Help/Home test assets may be requested');
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
}
