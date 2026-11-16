// SPDX-License-Identifier: AGPL-3.0-or-later
// Production web assets and real HTTP server; no fake API responses.
// Uses the existing World ceremony/registration fixture without changing protocol bytes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytesToHex, ed25519Sign, streamRng } from '@quietvote/crypto';
import { ballotCode } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { ApiClient } from '../src/api/client.ts';
import { buildSite } from '../src/build/site.ts';
import { lookupBallotCode } from '../src/flow/receipt-code.ts';
import { bindServerLog, deriveElectionContext } from '../src/flow/election.ts';
import { entryRecord } from '../src/flow/entries.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { ballotCodeDisplay } from '../src/util/crockford.ts';
import { browserTools, launchBrowser } from './browser.ts';

test('signed client adapter authenticates real HTTP management requests', { timeout: 30_000 }, async () => {
  const world = new World({ seed: 'signed-client-server', n: 3, t: 2, voters: 0 });
  let started = false;
  try {
    await world.start();
    started = true;
    await world.setupOrgAndElection();
    // Exercise the actual web QV-Sig adapter over HTTP, including body and audience binding.
    const signing = {
      signer: { publicKey: world.owner.publicKey, sign: async (message: Uint8Array) => ed25519Sign(world.owner.secretKey, message) },
      audience: world.audience, now: () => world.nowSec, nonce: () => world.rng.bytes(16),
    };
    const client = new ApiClient({ baseUrl: world.base, signing });
    const created = await client.createElection(world.orgId, 'Signed browser adapter acceptance', 'browser-server-signed-create');
    assert.ok(created.election_id);
    assert.equal((await world.get(`/api/v1/elections/${created.election_id}`)).json.title, 'Signed browser adapter acceptance');
    await assert.rejects(new ApiClient({ baseUrl: world.base, signing: { ...signing, audience: 'qv:wrong@http://localhost' } })
      .createElection(world.orgId, 'Wrong audience', 'browser-server-bad-audience'), (e: unknown) => (e as { status?: number }).status === 401);
  } finally {
    if (started) await world.stop();
    else rmSync(world.dir, { recursive: true, force: true });
  }
});

test('receipt code lookup authenticates a real server cast and its inclusion proof', { timeout: 120_000 }, async () => {
  const world = new World({ seed: 'receipt-code-server', n: 3, t: 2, voters: 3 });
  let started = false;
  try {
    await world.start();
    started = true;
    await world.setupOrgAndElection();
    await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201);
    await world.ceremony();
    assert.equal((await world.open()).status, 201);
    assert.equal((await world.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 201);
    const api = new ApiClient({ baseUrl: world.base });
    const entries = await api.allEntries(world.electionId);
    const context = await deriveElectionContext(entries.entries.map((entry) => ({ seq: entry.seq, record: entryRecord(entry) })));
    assert.ok(context.ok, context.ok ? '' : context.detail);
    const election = await api.election(world.electionId);
    const bound = bindServerLog(context.value.manifest, { logPkB64u: election.log_pk, origin: election.origin });
    assert.ok(bound.ok, bound.ok ? '' : bound.detail);
    const cast = (await world.fetchLog('ballot')).at(-1)!;
    const result = await lookupBallotCode({ input: ballotCodeDisplay(ballotCode(world.params.ctx, cast.rec.body), true),
      api, apiElectionId: world.electionId, ctx: context.value.params.ctx,
      logPk: bound.logPk, expectedOrigin: bound.origin, pinned: undefined });
    assert.equal(result.state, 'included');
    if (result.state === 'included') assert.equal(result.seq, cast.seq);
  } finally {
    if (started) await world.stop();
    else rmSync(world.dir, { recursive: true, force: true });
  }
});

test('production browser imports an enrolled key, casts and verifies a real server receipt', { timeout: 180_000 }, async (t) => {
  // A permitted tooling skip must not process.exit(0) and erase earlier HTTP-test failures.
  try {
    browserTools({ required: true });
  } catch (error) {
    if (process.env.QV_REQUIRE_BROWSER !== '1' && error instanceof Error && error.message.startsWith('Browser checks unavailable:')) {
      t.skip(error.message);
      return;
    }
    throw error;
  }
  const dist = mkdtempSync(join(tmpdir(), 'qv-browser-server-'));
  const world = new World({ seed: 'browser-server', n: 3, t: 2, voters: 3, server: { staticDir: dist } });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let started = false;
  try {
    // Launch before the expensive ceremony so missing browser OS support fails promptly.
    browser = await launchBrowser();
    await buildSite(dist);
    await world.start();
    started = true;
    await world.setupOrgAndElection();

    await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201);
    await world.ceremony();
    assert.equal((await world.open()).status, 201);

    const passphrase = 'correct horse battery staple';
    const keyFile = join(world.dir, 'voter.qvkey');
    const wrapped = await wrapSeed(world.voters[0]!.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('browser-server-key') }, FLOOR_PARAMS);
    writeFileSync(keyFile, serializeContainer(wrapped.container));
    // The enrollment fixture key stays outside the public static directory.
    assert.equal((await world.get('/voter.qvkey')).status, 404);

    const page = await (await browser.newContext()).newPage();
    page.setDefaultTimeout(30_000);
    await page.clock.install({ time: world.clock });
    const errors: string[] = [];
    const external: string[] = [];
    const responses: { path: string; status: number; method: string }[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
    page.on('request', (r) => {
      if (!r.url().startsWith(world.base) && !/^(data|blob):/.test(r.url())) external.push(r.url());
    });
    page.on('response', (r) => responses.push({ path: new URL(r.url()).pathname, status: r.status(), method: r.request().method() }));
    const base = `${world.base}/e/${world.electionId}`;
    await page.goto(`${base}/key`);
    await page.getByLabel('Use a key file I saved before').check();
    await page.getByLabel('Key file', { exact: true }).setInputFiles(keyFile);
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Create key', exact: true }).click();
    await page.getByText('You are on the voter list.', { exact: true }).waitFor();
    assert.equal(responses.filter((r) => r.path.endsWith('/registrations')).length, 0, 'import must not register again');

    const before = await world.fetchLog('ballot');
    await page.getByRole('link', { name: 'Vote', exact: true }).first().click();
    await page.getByLabel('YES', { exact: true }).check();
    await page.getByLabel('ANN', { exact: true }).check();
    await page.getByRole('button', { name: 'Review my choices', exact: true }).click();
    await page.getByRole('button', { name: 'Seal my ballot', exact: true }).click();
    await page.getByRole('button', { name: 'Send my vote', exact: true }).click();
    await page.getByText('Your vote was recorded. Here is your receipt.', { exact: true }).waitFor();
    const after = await world.fetchLog('ballot');
    assert.equal(after.length, before.length + 1, 'browser cast appends exactly one real log entry');
    assert.equal(after.at(-1)!.rec.intent, 'cast');
    assert.ok(responses.some((r) => r.method === 'POST' && r.path.endsWith('/log/entries') && r.status === 201));

    await page.getByRole('link', { name: 'Check inclusion now', exact: true }).click();
    await page.getByRole('heading', { name: 'Check a receipt', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await page.getByText(`Included in the public record at entry #${after.at(-1)!.seq}`, { exact: false }).waitFor();
    await page.getByText('The record is consistent with the version you saw before.', { exact: true }).waitFor();
    assert.ok(responses.some((r) => r.path.endsWith('/log/proof/inclusion') && r.status === 200));
    // A separate browser has no voting key or saved receipts: a typed public code is sufficient.
    const publicPage = await (await browser.newContext()).newPage();
    publicPage.setDefaultTimeout(30_000);
    await publicPage.goto(`${base}/receipt`);
    await publicPage.getByText('No receipts are saved on this device.', { exact: true }).waitFor();
    const typedCode = ballotCodeDisplay(ballotCode(world.params.ctx, after.at(-1)!.rec.body), true);
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    let reached!: () => void;
    const checkpointReached = new Promise<void>((resolve) => { reached = resolve; });
    await publicPage.route('**/log/checkpoint', async (route) => {
      const response = await route.fetch(); // Keep the real server's signed response unchanged.
      reached();
      await paused;
      await route.fulfill({ response });
    }, { times: 1 });
    await publicPage.getByLabel('Ballot code', { exact: true }).fill(typedCode);
    await publicPage.getByRole('button', { name: 'Check ballot code', exact: true }).click();
    await checkpointReached;
    assert.equal(await publicPage.getByLabel('Ballot code', { exact: true }).isDisabled(), true);
    // Even a synthetic edit delivered while controls are disabled invalidates the pending result.
    await publicPage.getByLabel('Ballot code', { exact: true }).evaluate((input) => {
      (input as HTMLInputElement).value = '00'.repeat(32);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    release();
    await publicPage.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent === 'Check ballot code' && !button.disabled));
    assert.equal(await publicPage.getByText('Included in the public record', { exact: false }).count(), 0);
    await publicPage.getByLabel('Ballot code', { exact: true }).fill(typedCode);
    await publicPage.getByRole('button', { name: 'Check ballot code', exact: true }).click();
    await publicPage.getByText(`Included in the public record at entry #${after.at(-1)!.seq}`, { exact: false }).waitFor();
    await publicPage.getByText('The record is consistent with the version you saw before.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await browser?.close();
    if (started) await world.stop();
    else rmSync(world.dir, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  }
});

test('production organizer reviews and sends ceremony packets to the real server', { timeout: 180_000 }, async (t) => {
  try { browserTools({ required: true }); }
  catch (error) {
    if (process.env.QV_REQUIRE_BROWSER !== '1' && error instanceof Error && error.message.startsWith('Browser checks unavailable:')) {
      t.skip(error.message); return;
    }
    throw error;
  }
  const dist = mkdtempSync(join(tmpdir(), 'qv-organizer-browser-'));
  const world = new World({ seed: 'organizer-browser-server', n: 3, t: 2, voters: 3, witnessQuorum: 0, server: { staticDir: dist } });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let started = false;
  try {
    browser = await launchBrowser();
    await buildSite(dist); await world.start(); started = true;
    await world.setupOrgAndElection(); await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201);
    const passphrase = 'correct horse battery staple';
    assert.equal((await world.get('/coordinator.qvkey')).status, 404);
    const errors: string[] = [], external: string[] = [];
    // Each coordinator has a distinct device store; the fixture requires 2-of-3.
    const pages = [];
    for (const index of [0, 1]) {
      const keyFile = join(world.dir, `coordinator-${index}.qvkey`);
      const wrapped = await wrapSeed(world.coord[index]!.secretKey.slice(), passphrase,
        { ...defaultDeps(), rng: streamRng(`organizer-browser-key-${index}`) }, FLOOR_PARAMS);
      writeFileSync(keyFile, serializeContainer(wrapped.container));
      const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
      page.setDefaultTimeout(30_000); await page.clock.install({ time: world.clock });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (/Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
      page.on('request', (r) => { if (!r.url().startsWith(world.base) && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
      await page.goto(`${world.base}/new`);
      await page.getByLabel('Organizer key file', { exact: true }).setInputFiles(keyFile);
      await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
      await page.getByRole('button', { name: 'Import organizer key', exact: true }).click();
      await page.getByText('Organizer public key (hex)', { exact: true }).waitFor();
      await page.goto(`${world.base}/e/${world.electionId}/admin`);
      await page.getByLabel('Saved manifest hash (64 hexadecimal characters)', { exact: true }).fill(bytesToHex(world.mh));
      pages.push(page);
    }
    const [proposer, page] = pages as [typeof pages[number], typeof pages[number]];
    for (const [action, entryType] of [['dkg-open', 'ceremony_start'], ['dkg-r1-open', 'notice']] as const) {
      const before = (await world.fetchLog(entryType)).length;
      await proposer.getByLabel('Organizer action', { exact: true }).selectOption(action);
      await proposer.getByLabel('Passphrase', { exact: true }).fill(passphrase);
      await proposer.getByRole('button', { name: 'Prepare signed packet', exact: true }).click();
      await proposer.waitForFunction(() => (document.querySelector('.admin-packet')?.textContent?.length ?? 0) > 0);
      const partial = JSON.parse((await proposer.locator('.admin-packet').textContent())!);
      assert.equal(partial.sigs.length, 1);
      assert.equal(await proposer.getByRole('button', { name: 'Send reviewed packet', exact: true }).isDisabled(), true);
      assert.equal(await proposer.getByLabel('Passphrase', { exact: true }).inputValue(), '');
      await page.locator('input[type=file]').setInputFiles({ name: 'coordinator-record.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(partial)) });
      await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
      await page.getByRole('button', { name: 'Add coordinator signature', exact: true }).click();
      await page.waitForFunction(() => (document.querySelector('.admin-packet')?.textContent?.length ?? 0) > 0);
      assert.equal((await world.fetchLog(entryType)).length, before, 'preparation does not submit');
      assert.equal(await page.getByLabel('Passphrase', { exact: true }).inputValue(), '');
      const shown = JSON.parse((await page.locator('.admin-packet').textContent())!);
      assert.equal(shown.body.name, action);
      assert.equal(shown.sigs.length, 2);
      assert.equal(await page.getByRole('button', { name: 'Send reviewed packet', exact: true }).isDisabled(), false);
      const [accepted] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/log/entries')),
        page.getByRole('button', { name: 'Send reviewed packet', exact: true }).click(),
      ]);
      assert.equal(accepted.status(), 201);
      await page.waitForFunction(() => document.querySelector('.admin-packet')?.textContent === '');
      assert.equal((await world.fetchLog(entryType)).length, before + 1);
      assert.equal(await page.getByRole('button', { name: 'Send reviewed packet', exact: true }).isDisabled(), true);
      await proposer.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally {
    await browser?.close();
    if (started) await world.stop(); else rmSync(world.dir, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  }
});
