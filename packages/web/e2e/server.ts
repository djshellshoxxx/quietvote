// SPDX-License-Identifier: AGPL-3.0-or-later
// Production web assets and real HTTP server; no route interception or FakeBoard.
// Uses the existing World ceremony/registration fixture without changing protocol bytes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ed25519Sign, streamRng } from '@quietvote/crypto';
import { World } from '../../server/test/helpers/world.ts';
import { ApiClient } from '../src/api/client.ts';
import { buildSite } from '../src/build/site.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
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

test('production browser imports an enrolled key, casts and verifies a real server receipt', { timeout: 180_000 }, async () => {
  // The helper exits on explicitly permitted tooling skips; resolve before creating resources.
  browserTools();
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
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally {
    await browser?.close();
    if (started) await world.stop();
    else rmSync(world.dir, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  }
});
