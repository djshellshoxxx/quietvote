// @verifies QV-08-REQ-034 QV-19-REQ-022 QV-09-REQ-009
// Production assets on a separate static HTTP server; every API response comes from the real board.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { b64u, unb64u } from '@quietvote/board';
import { bytesToHex, sha256, streamRng, utf8 } from '@quietvote/crypto';
import { kp, World } from '../../server/test/helpers/world.ts';
import { buildSite } from '../src/build/site.ts';
import { parseFragment } from '../src/flow/invite.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { browserTools, launchBrowser } from './browser.ts';

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
};
const close = async (server: Server): Promise<void> => { await new Promise<void>((resolve) => server.close(() => resolve())); };

test('split-origin configuration routes enrollment, live recovery, ballot, receipt and organizer publication', { timeout: 240_000 }, async () => {
  // This journey is mandatory even when called outside the CI runner.
  browserTools({ required: true });
  const dist = mkdtempSync(join(tmpdir(), 'qv-split-origin-'));
  const staticRequests: string[] = [];
  let headers: Record<string, string> = {};
  const site = createServer((rq, rs) => {
    const path = new URL(rq.url ?? '/', 'http://unused').pathname;
    staticRequests.push(rq.url ?? '/');
    if (path.startsWith('/api/')) { rs.writeHead(404); rs.end(); return; }
    const file = path.startsWith('/assets/') ? path : '/index.html';
    if (!existsSync(join(dist, file))) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { ...headers, 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(file)] ?? 'text/html' });
    rs.end(readFileSync(join(dist, file)));
  });
  const frontend = await listen(site);
  // Reserve a port before constructing the server so its signed publicUrl is the actual API origin.
  const reservation = createServer();
  const configuredApi = await listen(reservation);
  await close(reservation);
  const w = new World({ seed: 'browser-split-origin', n: 3, t: 2, voters: 3, server: {
    publicUrl: configuredApi, host: '127.0.0.1', port: Number(new URL(configuredApi).port), allowedOrigins: [frontend], sseHeartbeatMs: 100,
  } });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined, started = false;
  try {
    browser = await launchBrowser(); await w.start(); started = true;
    assert.equal(w.base, configuredApi);
    w.audience = `qv:${(await w.get('/api/v1/instance')).json.instance_id}@${w.base}`;
    // The second approved board origin reaches the same real board. Identical election IDs then distinguish cache/storage isolation.
    const selected = `http://localhost:${new URL(w.base).port}`;
    await buildSite(dist, { apiBase: w.base, connectOrigins: [selected] });
    // Serve the generated common header policy, alongside index.html's independently enforced meta policy.
    for (const line of readFileSync(join(dist, '_headers'), 'utf8').split('\n').slice(1)) {
      if (!line.startsWith('  ')) break;
      const at = line.indexOf(':'); headers[line.slice(2, at)] = line.slice(at + 2);
    }
    assert.ok(headers['Content-Security-Policy']!.includes(`connect-src 'self' ${w.base} ${selected}`));
    await w.setupOrgAndElection();
    const issued = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
    assert.equal(issued.status, 201);
    const token: string = issued.json.invites[0].code;
    const readKey = 'split_origin_read_key_123456';
    const passphrase = 'correct horse battery staple';
    const keyFile = join(w.dir, 'voter.qvkey'), ownerFile = join(w.dir, 'organizer.qvkey');
    // setupOrgAndElection already registered w.owner on this real board. The
    // publish journey must register a different owner: the API correctly
    // refuses re-registering an existing owner key, regardless of org name.
    const publishingOwner = kp('browser-split-origin', 'publishing-owner');
    assert.notEqual(bytesToHex(publishingOwner.publicKey), bytesToHex(w.owner.publicKey));
    for (const [key, file] of [[w.voters[0]!, keyFile], [publishingOwner, ownerFile]] as const) {
      const wrapped = await wrapSeed(key.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng(file) }, FLOOR_PARAMS);
      writeFileSync(file, serializeContainer(wrapped.container));
    }
    const context = await browser.newContext({ timezoneId: 'UTC' });
    const page = await context.newPage(); page.setDefaultTimeout(30_000);
    await page.clock.install({ time: w.clock });
    const errors: string[] = [], privacy: string[] = [];
    const requests: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
    const responses: { url: string; status: number; method: string }[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
    context.on('request', (r) => {
      if (!/^(data|blob):/.test(r.url()) && ![frontend, w.base, selected].includes(new URL(r.url()).origin)) privacy.push('unapproved origin');
      if (r.url().includes(token) || r.url().includes(readKey) || (r.postData() ?? '').includes(token) || r.headers()['referer']) privacy.push('fragment secret or referrer on wire');
      requests.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() ?? '' });
    });
    page.on('response', (r) => responses.push({ url: r.url(), status: r.status(), method: r.request().method() }));
    const fragment = (board: string, key = readKey): string => `#read=${key}&board=${encodeURIComponent(board)}`;
    const base = `${frontend}/e/${w.electionId}`;
    const apiRequests = () => requests.filter((r) => new URL(r.url).pathname.startsWith('/api/'));
    await page.goto(`${base}/key#inv=${token}&read=${readKey}&board=${encodeURIComponent(selected)}`);
    await page.getByLabel('Use a key file I saved before', { exact: true }).check();
    await page.getByLabel('Key file', { exact: true }).setInputFiles(keyFile);
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Create key', exact: true }).click();
    await page.getByText('Your key is registered. The organizer will add it to the voter list.', { exact: true }).waitFor();
    const registrations = apiRequests().filter((r) => r.url.endsWith('/registrations'));
    assert.equal(registrations.length, 1); assert.equal(new URL(registrations[0]!.url).origin, selected);
    assert.equal(JSON.parse(registrations[0]!.body).invite_code, b64u(sha256(unb64u(token)!)));
    assert.ok(apiRequests().every((r) => new URL(r.url).origin === selected), 'fragment selector overrides the configured API base');
    await w.registerVoters(1); assert.equal((await w.publishManifest()).status, 201); await w.ceremony(); assert.equal((await w.open()).status, 201);
    const rt = (await w.server.pool.get(w.electionId))!;
    rt.edb.db.prepare("UPDATE election SET access='link', read_key_hash=?").run(sha256(utf8(`QV-READKEY-v1\0${readKey}`)));
    await page.clock.setSystemTime(w.clock);
    // The fixture clock jumps from enrollment to voting by seven days. Playwright
    // setSystemTime does not fire the interval that normally enforces idle lock.
    // Exercise the actual keyboard path now, BEFORE entering a fresh passphrase:
    // otherwise the Unlock pointerdown expires the old signer and clears that
    // newly entered password. Assert the production lock rather than skipping it.
    await page.keyboard.press('Tab');
    await page.getByText('Your key is locked.', { exact: true }).waitFor();
    // A same-document goto can resolve before hashchange has retired the enrollment form.
    // Wait for that exact old input to detach, not merely for an Unlock button which exists in both views.
    const enrollmentPass = await page.getByLabel('Passphrase', { exact: true }).elementHandle();
    assert.ok(enrollmentPass, 'enrollment form is still mounted before changing the fragment');
    assert.equal(await page.goto(`${base}/key${fragment(selected)}`), null, 'removing the invitation stays in the same document');
    await page.waitForFunction((oldInput) => !oldInput.isConnected, enrollmentPass);
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Unlock key', exact: true }).click();
    try {
      await page.getByText('You are on the voter list.', { exact: true }).waitFor();
    } catch (e) {
      // Failure-only finite diagnostics. Do not emit URL fragments, key material, invitation tokens or response bodies.
      const view = await page.evaluate(() => {
        const main = document.querySelector('main');
        const content = main?.textContent ?? '';
        return {
          registeredMessage: content.includes('Your key is registered.'),
          onRollMessage: content.includes('You are on the voter list.'),
          errorCount: main?.querySelectorAll('.error').length ?? 0,
          unlockButtons: Array.from(main?.querySelectorAll('button') ?? []).filter((b) => b.textContent?.trim() === 'Unlock key').length,
        };
      });
      const rollStatuses = responses.filter((r) => new URL(r.url).pathname.endsWith('/roll')).map((r) => r.status);
      console.error('split-origin membership wait diagnostics (no secrets):', JSON.stringify({ view, rollStatuses }));
      throw e;
    }
    await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
    assert.equal(new URL(page.url()).hash, fragment(selected), 'tabs retain board and read key without an invitation token');
    await page.getByLabel('YES', { exact: true }).check(); await page.getByLabel('ANN', { exact: true }).check();
    await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
    await page.getByRole('button', { name: 'Seal my ballot', exact: true }).click();
    const before = rt.log.size;
    const hintRead = page.waitForResponse((r) => {
      const u = new URL(r.url());
      return u.origin === selected && u.pathname.endsWith('/log/entries') && u.searchParams.get('from') === String(before) && r.status() === 200;
    });
    await page.getByRole('button', { name: 'Send my vote', exact: true }).click();
    await page.getByText('Your vote was recorded. Here is your receipt.', { exact: true }).waitFor();
    assert.equal(rt.log.size, before + 1);
    await hintRead; // The client processed an event cursor before the stream is deliberately ended.
    await page.getByText('Live updates are on.', { exact: true }).waitFor();
    const resumed = page.waitForRequest((r) => r.url() === `${selected}/api/v1/elections/${w.electionId}/events` && r.headers()['last-event-id'] !== undefined);
    w.server.sse.closeAll();
    await page.clock.runFor(4000);
    const resume = await resumed;
    assert.equal(resume.headers()['qv-read-key'], readKey);
    await page.getByText('Live updates are on.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Check inclusion now', exact: true }).click();
    assert.equal(new URL(page.url()).hash, fragment(selected), 'post-cast receipt link retains the chosen board');
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByText('The record is consistent with the version you saw before.', { exact: true }).waitFor();
    assert.ok(responses.some((r) => r.url.startsWith(selected) && r.url.includes('/log/proof/inclusion') && r.status === 200));
    const electionTraffic = apiRequests().filter((r) => r.url.includes(`/elections/${w.electionId}`));
    assert.ok(electionTraffic.every((r) => new URL(r.url).origin === selected && r.headers['qv-read-key'] === readKey));

    // Same page, same election ID, different credential: a cached authenticated client must not be reused.
    const refused = page.waitForResponse((r) => r.url() === `${selected}/api/v1/elections/${w.electionId}` && r.status() === 403);
    await page.evaluate((hash) => { location.hash = hash; }, fragment(selected, 'wrong_read_key_123456'));
    await refused;
    await page.getByRole('link', { name: 'Home', exact: true }).first().click();
    await page.goto(`${base}/key${fragment(selected)}`);
    await page.getByRole('button', { name: 'Unlock key', exact: true }).waitFor();
    // Change only the fragment while the app is running, so the in-memory cache is exercised too.
    const otherBoard = page.waitForResponse((r) => r.url() === `${w.base}/api/v1/elections/${w.electionId}` && r.status() === 200);
    await page.evaluate((hash) => { location.hash = hash; }, fragment(w.base));
    await otherBoard;
    await page.getByRole('button', { name: 'Create key', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Unlock key', exact: true }).count(), 0);
    await page.getByRole('link', { name: 'Check a receipt', exact: true }).click();
    await page.getByText('No receipts are saved on this device.', { exact: true }).waitFor();
    await page.evaluate((hash) => { location.hash = hash; }, fragment(selected));
    await page.getByRole('button', { name: 'Check', exact: true }).waitFor();
    for (const bad of [fragment('http://127.0.0.1:1'), fragment(selected + '/path'), '#read=' + readKey + '&board=%']) {
      await page.evaluate((hash) => { location.hash = hash; }, fragment(selected));
      await page.getByRole('button', { name: 'Check', exact: true }).waitFor();
      const count = apiRequests().length;
      await page.evaluate((hash) => { location.hash = hash; }, bad);
      await page.getByRole('heading', { name: 'Something went wrong', exact: true }).waitFor();
      assert.equal(apiRequests().length, count, 'invalid or unallowed board fails before any credential-bearing fetch');
    }

    // The organizer uses the configured default API, including its signed server audience.
    await page.goto(frontend + '/new');
    await page.getByLabel('Organizer key file', { exact: true }).setInputFiles(ownerFile);
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Import organizer key', exact: true }).click();
    await page.getByText('Organizer public key (hex)', { exact: true }).waitFor();
    await page.getByLabel('Name of decision', { exact: true }).fill('Split-origin publication');
    await page.getByLabel('Question', { exact: true }).fill('Adopt the plan?');
    await page.getByLabel('Voting opens', { exact: true }).fill('2027-03-01T08:00');
    await page.getByLabel('Voting closes', { exact: true }).fill('2027-03-14T17:00');
    await page.getByLabel('Voter public keys', { exact: true }).fill(w.rollHex.join('\n'));
    await page.getByLabel('Trustees', { exact: true }).fill(w.trustees.map((key, i) => `T${i + 1},${bytesToHex(key.publicKey)}`).join('\n'));
    await page.getByRole('button', { name: 'Freeze election', exact: true }).click();
    await page.getByLabel('Organization name', { exact: true }).fill('Split-origin council');
    await page.getByLabel('Passphrase', { exact: true }).last().fill(passphrase);
    await page.getByRole('button', { name: 'Create organization', exact: true }).click();
    // Both the publish panel and the separate accessibility live region announce success.
    // Scope success checks to the visible application content so each locator is unique.
    await page.locator('main').getByText(/^Organization created\. Its ID is /).waitFor();
    await page.getByLabel('Passphrase', { exact: true }).last().fill(passphrase);
    await page.getByRole('button', { name: 'Publish election', exact: true }).click();
    await page.locator('main').getByText(/^Election published\. Its ID is /).waitFor();
    const invites = await page.locator('.qv-invite-link').allTextContents(); assert.equal(invites.length, w.voters.length);
    for (const text of invites) { const url = new URL(text); assert.equal(url.origin, frontend); assert.equal(parseFragment(url.hash).board, w.base); }
    assert.ok(responses.some((r) => r.url === w.base + '/api/v1/orgs' && r.method === 'POST' && r.status === 201), 'real server accepts the API audience');
    assert.ok(responses.some((r) => r.url.startsWith(w.base + '/api/v1/orgs/') && r.url.endsWith('/elections') && r.status === 201));
    assert.ok(!staticRequests.some((url) => url.startsWith('/api/')), 'frontend never proxies API traffic');
    assert.deepEqual(errors, []); assert.deepEqual(privacy, []);
    console.log('split-origin: real registration, scoped same-ID storage/cache, read-key refusal, SSE resume, cast/receipt, organizer create/publish and strict serving policies passed');
  } finally {
    await browser?.close(); if (started) await w.stop(); else rmSync(w.dir, { recursive: true, force: true });
    await close(site); rmSync(dist, { recursive: true, force: true });
  }
});
