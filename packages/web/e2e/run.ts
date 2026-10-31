// Browser e2e against a stub API (FakeBoard: real protocol simulation, Merkle log, signed checkpoints).
// Uses pinned Playwright and Chromium; QV_CHROMIUM overrides the binary.
// QV_REQUIRE_BROWSER=1 fails if browser tooling is unavailable. Run: npm run e2e -w @quietvote/web
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { bytesToHex, streamRng } from '@quietvote/crypto';
import { ballotCode, type CastEnvelope } from '@quietvote/protocol';
import { buildSite, csp } from '../src/build/site.ts';
import { defaultDeps, serializeContainer, wrapSeed, FLOOR_PARAMS } from '../src/key/keystore.ts';
import { FakeBoard, sharedSim } from '../test/helpers/fake-board.ts';
import { launchBrowser } from './browser.ts';

const dist = mkdtempSync(join(tmpdir(), 'qv-e2e-'));
await buildSite(dist);
const sim = await sharedSim();
const board = new FakeBoard(sim);
const policy = csp().header;
const MIME: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const external: string[] = [];
let unavailableEventResponses = 0;

const server = createServer(async (rq, rs) => {
  const url = new URL(rq.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const r = await board.fetch(url.pathname + url.search, { method: rq.method ?? 'GET', headers: rq.headers as Record<string, string>, body: await new Promise<string | undefined>((res) => { const c: Buffer[] = []; rq.on('data', (d: Buffer) => c.push(d)); rq.on('end', () => res(c.length ? Buffer.concat(c).toString() : undefined)); }) }).catch(() => new Response('{}', { status: 502 }));
    if (url.pathname.endsWith('/events') && r.status === 404) unavailableEventResponses++;
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

const browser = await launchBrowser();
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
  await page.clock.install();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
    await page.getByText('You are on the voter list.').waitFor({ timeout: 30000 });
    if (await page.getByText('Your key is registered.').count()) throw new Error('import without registration reported as a new registration');
  });
  await step('vote: choose, review, seal; buttons enabled only after the code shows', async () => {
    await page.getByRole('link', { name: 'Vote' }).first().click();
    await currentStep(3);
    await page.getByText('Your choices stay secret. Everyone can see that you voted.').waitFor();
    await page.getByLabel('YES', { exact: true }).check();
    await page.getByLabel('P', { exact: true }).check();
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
    const audit = page.getByRole('table', { name: 'Do these match what you picked?', exact: true });
    await audit.getByRole('rowheader', { name: 'Adopt the budget?', exact: true }).locator('..').getByRole('cell', { name: 'YES', exact: true }).waitFor();
    await audit.getByRole('rowheader', { name: 'Board', exact: true }).locator('..').getByRole('cell', { name: 'P', exact: true }).waitFor();
    const beforeQuestion = await audit.evaluate((table) => {
      const group = [...document.querySelectorAll('fieldset')].find((field) => field.querySelector('legend')?.textContent === 'Do these match what you picked?');
      return group !== undefined && Boolean(table.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    if (!beforeQuestion) throw new Error('decoded choices must appear before the voter is asked to confirm them');
    await page.getByRole('radio', { name: 'Yes', exact: true }).check();
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
  await step('Receipt to Vote refreshes the cast chain and records a revote without SSE', async () => {
    const casts = (): CastEnvelope[] => board.entries.map((entry) => entry.record).filter((record): record is CastEnvelope => typeof record === 'object' && record !== null && 'intent' in record && record.intent === 'cast');
    const before = casts();
    const previous = before.at(-1);
    if (!previous) throw new Error('the first cast is missing from the log');
    if (unavailableEventResponses === 0) throw new Error('the unavailable SSE scenario was not exercised');
    await page.getByRole('link', { name: 'Check inclusion now', exact: true }).click();
    await page.getByRole('heading', { name: 'Check a receipt', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
    await page.getByLabel('NO', { exact: true }).check();
    await page.getByLabel('Q', { exact: true }).check();
    await page.getByRole('button', { name: 'Review my choices' }).click();
    await page.getByRole('button', { name: 'Seal my ballot' }).click();
    await page.getByRole('button', { name: 'Send my vote' }).click();
    await page.getByText('Your vote was recorded. Here is your receipt.').waitFor({ timeout: 30000 });
    const after = casts();
    if (after.length !== before.length + 1) throw new Error('revote did not append exactly one cast');
    if (after.at(-1)!.body.supersedes !== bytesToHex(ballotCode(sim.params!.ctx, previous.body))) throw new Error('revote did not supersede the first recorded ballot');
  });
  await step('Clear this device Cancel preserves the stored key and it still unlocks', async () => {
    await page.getByRole('button', { name: 'Clear this device', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear this device', exact: true });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Your voting key', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock key', exact: true }).waitFor();
    await page.getByLabel('Passphrase', { exact: true }).fill(PASS);
    await page.getByRole('button', { name: 'Unlock key', exact: true }).click();
    await page.getByText('You are on the voter list.').waitFor({ timeout: 30000 });
    await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
    await page.getByLabel('YES', { exact: true }).waitFor();
  });
  await step('idle timeout visibly locks the active ballot session', async () => {
    // Playwright owns the browser clock. No Date/document.hidden replacement or application test hook.
    await page.clock.fastForward(10 * 60_000 + 15_001);
    await page.getByRole('main').getByText('Your key is locked.', { exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Review my choices' }).count()) throw new Error('locked ballot controls remain active');
  });
  await step('confirmed device clearing removes the key and saved receipts', async () => {
    await page.getByRole('link', { name: 'Your voting key', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock key', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear this device', exact: true }).click();
    await page.getByRole('dialog', { name: 'Clear this device', exact: true }).getByRole('button', { name: 'Remove my key, receipts and drafts from this browser', exact: true }).click();
    await page.getByRole('button', { name: 'Create key', exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Unlock key', exact: true }).count()) throw new Error('stored key remains after confirmed clear');
    await page.getByRole('link', { name: 'Check a receipt', exact: true }).click();
    await page.getByText('No receipts are saved on this device.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
    await page.getByRole('main').getByText('Your key is locked.', { exact: true }).waitFor();
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
