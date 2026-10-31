// Help/Home checks against the production app bundle, stylesheet and CSP.
// QV_REQUIRE_BROWSER=1 fails if tooling is unavailable; QV_CHROMIUM overrides the binary.
// Run from the repository root: node packages/web/e2e/help.ts
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { buildSite, csp } from '../src/build/site.ts';
import { launchBrowser } from './browser.ts';

const browserTest = String.raw`
const checks = [];
const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
try {
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

const dist = mkdtempSync(join(tmpdir(), 'qv-help-'));
await buildSite(dist);
const browser = await launchBrowser();
const policy = csp().header;
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const unexpected: string[] = [];
const errors: string[] = [];
const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/favicon.ico') return void res.writeHead(404).end();
  const asset = path.startsWith('/assets/') && existsSync(join(dist, path));
  if (!asset && path !== '/help' && path !== '/') {
    unexpected.push(path);
    return void res.writeHead(404).end();
  }
  const file = asset ? path : '/index.html';
  res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff' });
  res.end(readFileSync(join(dist, file)));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
try {
  for (const width of [320, 1280]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({ colorScheme: dark ? 'dark' : 'light', viewport: { width, height: 720 } });
      try {
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => { if (/Content Security|Trusted Type/i.test(message.text())) errors.push(message.text()); });
        page.on('request', (request) => { if (!request.url().startsWith(origin + '/') && !/^(?:data|blob):/.test(request.url())) unexpected.push(request.url()); });
        await page.goto(`${origin}/help?dark=${dark}`);
        await page.getByRole('combobox', { name: 'Colour theme' }).waitFor({ timeout: 30_000 });
        await page.evaluate(browserTest);
        const state = await page.evaluate(() => ({ status: document.documentElement.dataset.helpCheck, results: document.getElementById('help-check-results')?.textContent ?? '' }));
        assert.equal(state.status, 'pass', state.results);
        console.log(`${width}px ${dark ? 'dark' : 'light'}: ${state.results.split('\n').length} production Help/Home checks passed`);
      } finally {
        await context.close();
      }
    }
  }
  assert.deepEqual(errors, [], 'Production Help/Home must have no page errors or CSP/Trusted Types violations');
  assert.deepEqual(unexpected, [], 'Only production Help/Home assets may be requested');
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  rmSync(dist, { recursive: true, force: true });
}
