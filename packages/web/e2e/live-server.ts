// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-09-REQ-010 QV-09-REQ-020
// Built SPA and real server. Request gates delay connections; no API response, stream frame or signature is replaced.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { signRecord } from '@quietvote/protocol';
import { World } from '../../server/test/helpers/world.ts';
import { buildSite } from '../src/build/site.ts';
import { browserTools, launchBrowser } from './browser.ts';

function signal(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
async function until(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition() && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.ok(condition(), label);
}

test('production browser recovers real SSE gaps and updates an open Results view', { timeout: 180_000 }, async (t) => {
  try { browserTools({ required: true }); }
  catch (error) {
    if (process.env.QV_REQUIRE_BROWSER !== '1' && error instanceof Error && error.message.startsWith('Browser checks unavailable:')) {
      t.skip(error.message); return;
    }
    throw error;
  }
  const dist = mkdtempSync(join(tmpdir(), 'qv-live-browser-'));
  const world = new World({ seed: 'web-live-browser-server', n: 3, t: 2, voters: 4, server: { staticDir: dist, sseHeartbeatMs: 100 } });
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined, started = false;
  const held: ReturnType<typeof signal>[] = [];
  try {
    browser = await launchBrowser(); await buildSite(dist); await world.start(); started = true;
    await world.setupOrgAndElection(); await world.registerVoters();
    assert.equal((await world.publishManifest()).status, 201); await world.ceremony(); assert.equal((await world.open()).status, 201);
    const runtime = (await world.server.pool.get(world.electionId))!;
    const eventRoute = world.server.http.routes.find((route) => route.path === '/api/v1/elections/:id/events')!;
    const handler = eventRoute.handler;
    let next: { reached: ReturnType<typeof signal>; release: ReturnType<typeof signal> } | undefined;
    const blockNext = () => { assert.equal(next, undefined); const gate = { reached: signal(), release: signal() }; next = gate; held.push(gate.release); return gate; };
    eventRoute.handler = async (request) => {
      const gate = next; next = undefined;
      if (gate) { gate.reached.resolve(); await gate.release.promise; }
      return handler(request);
    };
    const page = await (await browser.newContext()).newPage(); page.setDefaultTimeout(30_000);
    const errors: string[] = [], external: string[] = [];
    const streams: { last: string | undefined; status: number }[] = [], requests: { method: string; path: string; search: string; document: boolean }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (/Content Security|Trusted Type/i.test(message.text())) errors.push(message.text()); });
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!request.url().startsWith(world.base) && !/^(data|blob):/.test(request.url())) external.push(request.url());
      requests.push({ method: request.method(), path: url.pathname, search: url.search, document: request.isNavigationRequest() });
    });
    page.on('response', (response) => {
      if (response.url().endsWith('/events')) streams.push({ last: response.request().headers()['last-event-id'], status: response.status() });
    });
    const nextRead = (from: number) => page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/log/entries') && url.searchParams.get('from') === String(from) && response.status() === 200;
    });
    const assertRead = async (read: ReturnType<typeof nextRead>, from: number) => {
      const body = await (await read).json() as { entries: { seq: number }[] };
      assert.ok(body.entries.length > 0); assert.equal(body.entries[0]!.seq, from);
    };
    const waiting = 'Results appear after voting closes and the trustees open the total.';
    const initial = blockNext(), before = runtime.log.size;
    await page.goto(`${world.base}/e/${world.electionId}/results`);
    await page.getByText(waiting, { exact: true }).waitFor(); await initial.reached.promise;
    assert.equal((await world.cast(0, { budget: ['yes'], chair: ['ann'] })).status, 201);
    const firstRead = nextRead(before); initial.release.resolve(); await assertRead(firstRead, before);
    await page.getByText('Live updates are on.', { exact: true }).waitFor();
    assert.equal(streams[0]!.last, undefined);
    console.log('ok - initial load/stream gap rereads the real signed append without a new event');

    const cursorless = blockNext(), beforeReconnect = runtime.log.size;
    world.server.sse.closeAll(); await page.getByText(/^Live updates paused\./).waitFor(); await cursorless.reached.promise;
    assert.equal((await world.cast(1, { budget: ['no'], chair: ['bob'] })).status, 201);
    const reconnectRead = nextRead(beforeReconnect); cursorless.release.resolve(); await assertRead(reconnectRead, beforeReconnect);
    await page.getByText('Live updates are on.', { exact: true }).waitFor(); assert.equal(streams[1]!.last, undefined);
    console.log('ok - reconnect before the first event ID recovers the missing signed append');

    const beforeLive = runtime.log.size, beforeLiveEvent = runtime.edb.lastEventId(), liveRead = nextRead(beforeLive);
    assert.equal((await world.cast(2, { budget: ['yes'], chair: ['cy'] })).status, 201); await assertRead(liveRead, beforeLive);
    const cursor = runtime.edb.lastEventId(), retained = blockNext(), beforeReplay = runtime.log.size;
    world.server.sse.closeAll(); await retained.reached.promise;
    assert.equal((await world.cast(3, { budget: ['no'], chair: ['ann'] })).status, 201);
    const replayRead = nextRead(beforeReplay); retained.release.resolve(); await assertRead(replayRead, beforeReplay);
    await page.getByText('Live updates are on.', { exact: true }).waitFor();
    const resumed = Number(streams[2]!.last);
    assert.ok(Number.isSafeInteger(resumed) && resumed > beforeLiveEvent && resumed <= cursor, 'resume names a real event received from the live append');
    assert.ok(runtime.edb.eventsAfter(beforeLiveEvent, 100).some((event) => event.id === resumed));
    assert.ok(world.server.sse.stats.resumed > 0);
    console.log('ok - real entry events refresh records and retained cursor resumes in a header');

    const expired = blockNext(), beforeClose = runtime.log.size;
    world.server.sse.closeAll(); await expired.reached.promise;
    assert.equal((await world.close()).status, 201); runtime.edb.pruneEvents();
    const closeRead = nextRead(beforeClose); expired.release.resolve(); await assertRead(closeRead, beforeClose);
    await page.getByText('Live updates are on.', { exact: true }).waitFor();
    assert.equal(streams[3]!.status, 410); assert.ok(streams[3]!.last !== undefined);
    assert.equal(streams[4]!.status, 200); assert.equal(streams[4]!.last, undefined);
    console.log('ok - expired real outbox returns 410; cursor is reset and the signed log reread');

    // A live status label or GET alone does not prove a DOM update. Publish a real tally while Results stays open.
    for (const trustee of [1, 2]) { assert.equal((await world.trusteeShares(trustee)).status, 201); world.tick(); }
    const draft = await world.get(`/api/v1/elections/${world.electionId}/tally/draft?decrypters=1,2`); assert.equal(draft.status, 200, draft.text);
    const coordinator = world.coord[0]!;
    assert.equal((await world.post('tally_result', coordinator, signRecord(coordinator.secretKey, coordinator.publicKey, world.params.ctx, draft.json.body))).status, 201);
    await page.getByRole('button', { name: 'Run checks', exact: true }).waitFor();
    await page.getByText('The result is not established. Export the evidence and report it.', { exact: true }).waitFor();
    assert.equal(await page.getByText(waiting, { exact: true }).count(), 0);
    assert.equal(requests.filter((request) => request.document).length, 1, 'live tally updates the open page without navigation/reload');
    assert.equal(await page.getByRole('table').count(), 0, 'ordinary server derived records still do not establish verified results');
    assert.ok(requests.every((request) => request.method === 'GET'));
    assert.ok(requests.filter((request) => request.path.endsWith('/events')).every((request) => request.search === ''));
    console.log('ok - published signed tally updates the open Results view while verification refusal stays intact');

    await page.getByRole('link', { name: 'Help and accessibility', exact: true }).click();
    await until(() => world.server.sse.stats.active === 0, 'route exit releases the real stream');
    assert.equal(runtime.inUse, 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log('ok - leaving the election releases its stream; no page/CSP errors or external requests');
  } finally {
    for (const gate of held) gate.resolve();
    await browser?.close();
    if (started) await world.stop(); else rmSync(world.dir, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  }
});
