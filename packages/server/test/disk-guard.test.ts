// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-28-REQ-016 QV-29-REQ-018
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { authorKeyId, toHex, verifyLog } from '@quietvote/board';
import { hexToBytes } from '@quietvote/crypto';
import { logBundle } from '../src/export.ts';
import { World } from './helpers/world.ts';

const FLOOR = 500 * 1024 * 1024;
type Space = { bsize: bigint; blocks: bigint; bavail: bigint };
function observeSpace(t: TestContext, state: { space: Space; calls: number }): void {
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  t.mock.method(fs, 'statfsSync', ((_path: unknown, options?: { bigint?: boolean }) => {
    state.calls++;
    const values = { type: 0n, bfree: state.space.bavail, files: 0n, ffree: 0n, ...state.space };
    return options?.bigint ? values : Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]));
  }) as typeof fs.statfsSync);
  syncBuiltinESMExports();
}
async function ready(seed: string, minFreeBytes = FLOOR): Promise<World> {
  const w = new World({ seed, n: 3, t: 2, voters: 3, server: { minFreeBytes } });
  try {
    await w.start(); await w.setupOrgAndElection();
    const published = await w.publishManifest();
    assert.equal(published.status, 201, published.text);
    return w;
  } catch (error) { await w.stop(); throw error; }
}
async function assertReadableAndIntact(w: World, size: number, root: Uint8Array): Promise<void> {
  const rt = (await w.server.pool.get(w.electionId))!;
  assert.equal(rt.log.size, size); assert.deepEqual(rt.log.root(), root);
  assert.equal(rt.log.selfAudit(), true);
  for (const suffix of ['/state', '/log/entries', '/export.json?board=1']) {
    const response = await w.get(`/api/v1/elections/${w.electionId}${suffix}`);
    assert.equal(response.status, 200, response.text);
  }
  const keys = new Map([w.owner, ...w.coord].map((k) => [toHex(authorKeyId('ed25519', k.publicKey)), k.publicKey]));
  const checked = verifyLog(logBundle(rt), {
    logPublicKey: hexToBytes(w.logPkHex, 32),
    witnessPolicy: { quorum: 0, noneAcknowledged: true, witnesses: [] },
    resolveAuthorKey: (header) => keys.get(toHex(header.author)),
  });
  assert.deepEqual(checked.failures, []); assert.equal(checked.integrity, 'VERIFIED');
}

test('percentage disk reserve refuses below 5%, preserves reads and resumes the exact append at 5%', async (t) => {
  const state = { space: { bsize: 4096n, blocks: 10_000_000n, bavail: 1_000_000n }, calls: 0 };
  observeSpace(t, state);
  const w = await ready('disk-percentage');
  try {
    const rt = (await w.server.pool.get(w.electionId))!, root = rt.log.root(), bytes = rt.edb.totalBodyBytes();
    const entry = w.entry('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    state.space.bavail = 499_999n; // Nearly 2 GiB available: absolute floor is satisfied.
    assert.ok(state.space.bavail * state.space.bsize > BigInt(FLOOR));
    const denied = await w.submit(entry.headerBytes, entry.body);
    assert.equal(denied.status, 507, denied.text); assert.equal(denied.json.code, 'LOG_FULL');
    assert.equal(rt.edb.totalBodyBytes(), bytes);
    const probes = state.calls;
    await assertReadableAndIntact(w, 1, root);
    assert.equal(state.calls, probes, 'read/export paths do not require free-space probes');
    state.space.bavail = 500_000n;
    const resumed = await w.submit(entry.headerBytes, entry.body);
    assert.equal(resumed.status, 201, resumed.text);
    await assertReadableAndIntact(w, 2, rt.log.root());
    assert.equal(rt.edb.totalBodyBytes(), bytes + entry.body.length);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await w.stop(); }
});

test('absolute disk floor retains whole-byte and fractional configured boundaries', async (t) => {
  for (const minimum of [FLOOR, FLOOR + 0.5]) await t.test(`minimum ${minimum}`, async (t) => {
    const threshold = BigInt(Math.ceil(minimum));
    const state = { space: { bsize: 1n, blocks: threshold * 4n, bavail: threshold + 1n }, calls: 0 };
    observeSpace(t, state);
    const w = await ready(`disk-absolute-${minimum}`, minimum);
    try {
      const rt = (await w.server.pool.get(w.electionId))!, root = rt.log.root();
      const entry = w.entry('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
      state.space.bavail = threshold - 1n;
      assert.ok(state.space.bavail * 20n > state.space.blocks, 'percentage reserve is satisfied');
      const denied = await w.submit(entry.headerBytes, entry.body);
      assert.equal(denied.status, 507, denied.text); assert.equal(denied.json.code, 'LOG_FULL');
      await assertReadableAndIntact(w, 1, root);
      state.space.bavail = threshold;
      const resumed = await w.submit(entry.headerBytes, entry.body);
      assert.equal(resumed.status, 201, resumed.text);
      await assertReadableAndIntact(w, 2, rt.log.root());
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await w.stop(); }
  });
});

test('percentage comparison retains integer precision beyond Number safe block counts', async (t) => {
  const reserve = 2n ** 55n;
  const state = { space: { bsize: 4096n, blocks: reserve * 20n, bavail: reserve }, calls: 0 };
  observeSpace(t, state);
  const w = await ready('disk-bigint');
  try {
    const rt = (await w.server.pool.get(w.electionId))!, root = rt.log.root();
    const entry = w.entry('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh));
    state.space.bavail = reserve - 1n;
    const denied = await w.submit(entry.headerBytes, entry.body);
    assert.equal(denied.status, 507, denied.text); assert.equal(denied.json.code, 'LOG_FULL');
    await assertReadableAndIntact(w, 1, root);
    state.space.bavail = reserve;
    const resumed = await w.submit(entry.headerBytes, entry.body);
    assert.equal(resumed.status, 201, resumed.text);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await w.stop(); }
});

test('log-size cap runs before disk I/O and remains enabled when disk probing is disabled', async (t) => {
  for (const minimum of [FLOOR, 0]) await t.test(`minimum ${minimum}`, async (t) => {
    const state = { space: { bsize: 4096n, blocks: 10_000_000n, bavail: minimum ? 1_000_000n : 0n }, calls: 0 };
    observeSpace(t, state);
    const w = await ready(`disk-log-cap-${minimum}`, minimum);
    try {
      const rt = (await w.server.pool.get(w.electionId))!, root = rt.log.root(), bytes = rt.edb.totalBodyBytes();
      const entry = w.entry('ceremony_start', w.coord[0]!, w.marker('dkg-open', w.mh)), probes = state.calls;
      w.server.env.cfg.maxLogBytes = bytes + entry.body.length - 1;
      const denied = await w.submit(entry.headerBytes, entry.body);
      assert.equal(denied.status, 507, denied.text); assert.equal(denied.json.code, 'LOG_FULL');
      await assertReadableAndIntact(w, 1, root);
      assert.equal(state.calls, probes, 'the size cap precedes any disk probe');
      w.server.env.cfg.maxLogBytes++;
      const resumed = await w.submit(entry.headerBytes, entry.body);
      assert.equal(resumed.status, 201, resumed.text);
      assert.equal(rt.edb.totalBodyBytes(), w.server.env.cfg.maxLogBytes);
      if (minimum === 0) assert.equal(state.calls, 0, 'existing explicit minFreeBytes=0 bypass is preserved');
    } finally { t.mock.restoreAll(); syncBuiltinESMExports(); await w.stop(); }
  });
});
