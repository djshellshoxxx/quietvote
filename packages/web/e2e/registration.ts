// Production browser + real server enrollment before manifest/DKG, QV-ADR-028.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { b64u, unb64u } from '@quietvote/board';
import { sha256, streamRng } from '@quietvote/crypto';
import { World, kp } from '../../server/test/helpers/world.ts';
import { buildSite } from '../src/build/site.ts';
import { defaultDeps, FLOOR_PARAMS, serializeContainer, wrapSeed } from '../src/key/keystore.ts';
import { browserTools, launchBrowser } from './browser.ts';

test('production browser enrolls and reloads the first voter before ceremony; no raw token is sent', { timeout: 180_000 }, async (t) => {
  try { browserTools({ required: true }); }
  catch (error) {
    if (process.env.QV_REQUIRE_BROWSER !== '1' && error instanceof Error && error.message.startsWith('Browser checks unavailable:')) { t.skip(error.message); return; }
    throw error;
  }
  const dist = mkdtempSync(join(tmpdir(), 'qv-registration-browser-'));
  const w = new World({ seed: 'browser-registration', n: 3, t: 2, voters: 0, server: { staticDir: dist } });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined, started = false;
  try {
    browser = await launchBrowser(); await buildSite(dist); await w.start(); started = true; await w.setupOrgAndElection();
    const issued = await w.signed('POST', `/api/v1/elections/${w.electionId}/invites`, { count: 1 }, w.owner, w.idemKey());
    assert.equal(issued.status, 201); const code: string = issued.json.invites[0].code;
    const key = kp('browser-registration', 'first-voter'), passphrase = 'correct horse battery staple';
    const wrapped = await wrapSeed(key.secretKey.slice(), passphrase, { ...defaultDeps(), rng: streamRng('registration-browser-wrap') }, FLOOR_PARAMS);
    const file = join(w.dir, 'voter.qvkey'); writeFileSync(file, serializeContainer(wrapped.container));
    const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
    page.setDefaultTimeout(30_000); await page.clock.install({ time: w.clock });
    const errors: string[] = [], external: string[] = [], registrations: Record<string, string>[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
    page.on('request', (r) => {
      if (!r.url().startsWith(w.base) && !/^(data|blob):/.test(r.url())) external.push(r.url());
      assert.ok(!r.url().includes(code) && !(r.postData() ?? '').includes(code), 'raw fragment token never enters an HTTP request');
      if (r.method() === 'POST' && r.url().endsWith('/registrations')) registrations.push(r.postDataJSON());
    });
    await page.goto(`${w.base}/e/${w.electionId}#inv=${code}`);
    await page.getByLabel('Use a key file I saved before', { exact: true }).check();
    await page.getByLabel('Key file', { exact: true }).setInputFiles(file);
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Create key', exact: true }).click();
    await page.getByText('Your key is registered. The organizer will add it to the voter list.', { exact: true }).waitFor();
    const rt = (await w.server.pool.get(w.electionId))!;
    assert.equal(rt.edb.voterCount(), 1); assert.equal(rt.log.size, 0);
    assert.equal(registrations.length, 1); assert.equal(registrations[0]!['invite_code'], b64u(sha256(unb64u(code)!)));
    await page.reload();
    await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
    await page.getByRole('button', { name: 'Unlock key', exact: true }).click();
    await page.getByText('Your key is registered. The organizer will add it to the voter list.', { exact: true }).waitFor();
    assert.equal(registrations.length, 2); assert.deepEqual(registrations[1], registrations[0]); assert.equal(rt.edb.voterCount(), 1);
    rt.edb.db.exec("UPDATE election SET registration_scheme='legacy-raw-v1'");
    await page.reload();
    await page.getByText('This election needs an updated invitation. Contact its organizer.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Create key', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Unlock key', exact: true }).count(), 0);
    assert.equal(registrations.length, 2, 'legacy scheme is refused before credential transmission');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally {
    await browser?.close(); if (started) await w.stop(); else rmSync(w.dir, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  }
});
