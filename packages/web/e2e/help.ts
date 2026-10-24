// Ordinary Help/Home presentation smoke test. No election, verifier, API or persistent storage flows.
// Run from the repository root: node packages/web/e2e/help.ts
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const run = promisify(execFile);
const chromium = process.env.QV_CHROMIUM ?? '/usr/bin/chromium';
const browserTest = String.raw`
import { startApp } from './src/ui/app.ts';
import { MemoryStorage } from './src/key/storage.ts';
const checks = [];
const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
try {
  startApp({ root: document.getElementById('app'), storage: new MemoryStorage(), build: { version: 'test', id: 'help-only' } });
  const requestedDark = new URL(location.href).searchParams.get('dark') === 'true';
  const theme = () => document.querySelector('main select');
  const contrast = () => document.querySelector('main input[type=checkbox]');
  const bg = () => getComputedStyle(document.body).backgroundColor;
  const scheme = () => getComputedStyle(document.documentElement).colorScheme;
  const choose = (v) => { theme().value = v; theme().dispatchEvent(new Event('change', { bubbles: true })); };
  const nav = (path) => document.querySelector('nav a[href="' + path + '"]').click();
  check('Help controls start at device defaults', theme().value === 'auto' && !contrast().checked);
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

const output = await build({ stdin: { contents: browserTest, resolveDir: resolve('packages/web'), loader: 'js' }, bundle: true, format: 'esm', write: false, logLevel: 'silent' });
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
const scratch = await mkdtemp(join(tmpdir(), 'quietvote-help-'));
try {
  for (const dark of [false, true]) {
    const { stdout, stderr } = await run(chromium, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking', `--user-data-dir=${join(scratch, dark ? 'dark' : 'light')}`, ...(dark ? ['--force-dark-mode'] : []), '--virtual-time-budget=1500', '--dump-dom', `http://127.0.0.1:${address.port}/help?dark=${dark}`], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, XDG_CACHE_HOME: join(scratch, 'cache'), XDG_CONFIG_HOME: join(scratch, 'config') } });
    const results = /<pre id="help-check-results">([\s\S]*?)<\/pre>/.exec(stdout)?.[1];
    assert.match(stdout, /data-help-check="pass"/, results ?? (stdout || stderr).slice(-1600));
    console.log(`${dark ? 'Dark' : 'Light'} device: ${results?.split('\n').length} Help/Home checks passed`);
  }
  assert.deepEqual(unexpected, [], 'Only Help/Home test assets may be requested');
} finally {
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  await rm(scratch, { recursive: true, force: true });
}
