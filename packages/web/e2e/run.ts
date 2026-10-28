// Browser e2e against a stub API (FakeBoard: real protocol simulation, Merkle log, signed checkpoints).
// Needs Playwright + Chromium that are NOT repo dependencies: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, executablePath
// /opt/pw-browsers/chromium. Skips (exit 0) when they are missing. Run: npm run e2e -w @quietvote/web
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { streamRng } from '@quietvote/crypto';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, serializeContainer, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import { FakeBoard, sharedSim } from '../test/helpers/fake-board.ts';

const CHROMIUM = process.env.QV_CHROMIUM ?? '/opt/pw-browsers/chromium';
const req = createRequire('/opt/node22/lib/node_modules/');
let pw: typeof import('playwright');
try {
  pw = req('playwright');
} catch {
  console.log('e2e skipped: playwright is not installed');
  process.exit(0);
}
if (!existsSync(CHROMIUM)) {
  console.log('e2e skipped: no chromium at', CHROMIUM);
  process.exit(0);
}
const exe = statSync(CHROMIUM).isDirectory() ? join(CHROMIUM, 'chrome-linux', 'chrome') : CHROMIUM;

const dist = mkdtempSync(join(tmpdir(), 'qv-e2e-'));
await buildSite(dist);
const sim = await sharedSim();
const board = new FakeBoard(sim);
const policy = csp().header;
const MIME: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const external: string[] = [];

const server = createServer(async (rq, rs) => {
  const url = new URL(rq.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const r = await board.fetch(url.pathname + url.search, { method: rq.method ?? 'GET', headers: rq.headers as Record<string, string>, body: await new Promise<string | undefined>((res) => { const c: Buffer[] = []; rq.on('data', (d: Buffer) => c.push(d)); rq.on('end', () => res(c.length ? Buffer.concat(c).toString() : undefined)); }) }).catch(() => new Response('{}', { status: 502 }));
    rs.writeHead(r.status, { 'Content-Type': r.headers.get('Content-Type') ?? 'application/json' });
    rs.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let file = url.pathname.startsWith('/assets/') || url.pathname === '/verifier.html' ? url.pathname : '/index.html';
  if (!existsSync(join(dist, file))) file = '/index.html';
  const body = readFileSync(join(dist, file));
  rs.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': file === '/verifier.html' ? "default-src 'none'" : policy, 'Cross-Origin-Opener-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' });
  rs.end(body);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const PASS = 'correct horse battery staple';
const keyFile = join(dist, 'voter.qvkey');
const w = await wrapSeed(sim.voters[0]!.secretKey.slice(), PASS, { ...defaultDeps(), rng: streamRng('e2e') }, FLOOR_PARAMS);
writeFileSync(keyFile, serializeContainer(w.container));

const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let failed = 0;
const step = async (name: string, f: () => Promise<void>): Promise<void> => {
  try {
    await f();
    console.log('ok  -', name);
  } catch (e) {
    failed++;
    console.log('FAIL-', name, e instanceof Error ? e.message.split('\n')[0] : e);
  }
};
try {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if ((m.type() === 'error' && !/404/.test(m.text())) || /Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  const base = `${origin}/e/${board.apiId}`;
  // C-STEPPER: an ordered list named by the progress text, with exactly one item marked aria-current="step".
  const currentStep = async (n: number, timeout?: number): Promise<void> => {
    const list = page.getByRole('list', { name: `Step ${n} of 4` });
    await list.waitFor(timeout === undefined ? {} : { timeout });
    const items = list.getByRole('listitem');
    if (await items.count() !== 4) throw new Error('stepper should list 4 steps');
    if (await list.locator('[aria-current="step"]').count() !== 1 || await items.nth(n - 1).getAttribute('aria-current') !== 'step') throw new Error(`step ${n} should be the only current step`);
  };
  await step('home shows How this works', async () => {
    await page.goto(origin + '/');
    await page.getByRole('heading', { name: 'How this works' }).waitFor({ timeout: 10000 });
  });
  await step('overview: step indicator and Election ID check', async () => {
    await page.goto(`${base}#inv=AAAAAAAAAAAAAAAAAAAAAA`);
    await currentStep(1, 20000);
    await page.getByRole('button', { name: 'Yes, it matches' }).click();
    await page.getByText('Election ID confirmed on this device.').waitFor();
  });
  // The stub election is OPEN with its roll committed, so registration is closed (QV-09: 403 REGISTRATION_CLOSED). The
  // imported key is already on the roll: the accepted journey is importing it without an invite (QV-04 §new device).
  const importKey = async (p: typeof page, url: string): Promise<void> => {
    await p.goto(url);
    await p.getByLabel('Use a key file I saved before').check();
    await p.getByLabel('Key file', { exact: true }).setInputFiles(keyFile);
    await p.getByLabel('Passphrase', { exact: true }).fill(PASS);
    await p.getByRole('button', { name: 'Create key' }).click();
  };
  await step('invite link after roll commit: registration refusal is shown, not hidden', async () => {
    const p = await (await browser.newContext()).newPage();
    try {
      await importKey(p, `${base}/key#inv=AAAAAAAAAAAAAAAAAAAAAA`);
      await p.getByRole('alert').waitFor({ timeout: 30000 });
      if (await p.getByText('Your key is registered.').count()) throw new Error('refused registration reported as success');
    } finally {
      await p.context().close();
    }
  });
  await step('import key file and unlock', async () => {
    await importKey(page, `${base}/key`);
    await currentStep(2);
    await page.getByText('Your key is registered.').waitFor({ timeout: 30000 });
  });
  await step('vote: choose, review, seal; buttons enabled only after the code shows', async () => {
    await page.getByRole('link', { name: 'Vote' }).first().click();
    await currentStep(3);
    await page.getByText('Your choices stay secret. Everyone can see that you voted.').waitFor();
    await page.getByLabel('YES', { exact: true }).check();
    await page.getByRole('button', { name: 'Review my choices' }).click();
    // An in-place re-render removes the clicked button; focus must land on the new content, not fall back to <body>.
    if (await page.evaluate(() => document.activeElement === document.body)) throw new Error('focus fell back to body after review render');
    await page.getByRole('button', { name: 'Seal my ballot' }).click();
    await page.getByText('Double-check that this vote says what you chose').waitFor({ timeout: 30000 });
    if (await page.getByRole('button', { name: 'Send my vote' }).isDisabled()) throw new Error('send disabled after code shown');
  });
  await step('optional double-check, then seal again', async () => {
    await page.getByRole('button', { name: 'Double-check this vote' }).click();
    await page.getByText('Practice vote opened').waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Seal a new ballot' }).click();
    await page.getByRole('button', { name: 'Seal my ballot' }).click();
    await page.getByRole('button', { name: 'Send my vote' }).waitFor({ timeout: 30000 });
  });
  await step('send: friendly confirmation and recorded in the log', async () => {
    const before = board.entries.length;
    await page.getByRole('button', { name: 'Send my vote' }).click();
    await page.getByText('Your vote was recorded. Here is your receipt.').waitFor({ timeout: 30000 });
    if (board.entries.length <= before) throw new Error('log did not grow');
  });
  await step('no CSP / Trusted Types violations and no third-party requests', async () => {
    if (errors.length) throw new Error(errors.join(' | '));
    if (external.length) throw new Error(external.join(','));
  });
} finally {
  await browser.close();
  server.close();
}
if (failed > 0) process.exit(1);
