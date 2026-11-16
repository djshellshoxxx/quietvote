// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkEntry, unb64u } from '@quietvote/board';
import { hexToBytes, jcs, parseQvJson } from '@quietvote/crypto';
import { logOrigin, verifySig, type Sig } from '@quietvote/protocol';
import { trusteeMain } from '../src/index.ts';
import { Ceremony, electionFixture, mkDeps, PASS } from './helpers/harness.ts';

test('board export signs only generated outputs for the joined election and detects stale bundles', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'board-export' });
  await c.setup();
  try {
    const t = await c.act(1, async (x) => x);
    await assert.rejects(t.exportBoardEntry('r1-commit'), { code: 'OUTPUT_NOT_READY' });
    await assert.rejects(t.exportBoardEntry('manifest'), { code: 'USAGE' });
    c.marker('dkg-open');
    await c.sync(1);
    const current = await c.act(1, async (x) => x);
    const packet = await current.commit();
    for (const index of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(current.exportBoardEntry('r1-commit', index), { code: 'USAGE' });
    }
    await assert.rejects(current.exportBoardEntry('r1-commit', 1), { code: 'OUTPUT_NOT_READY' });
    const before = readFileSync(current.path);
    const entry = await current.exportBoardEntry('r1-commit');
    const body = unb64u(entry.body)!;
    assert.deepEqual(body, jcs(packet.obj.records[0]));
    const checked = checkEntry(unb64u(entry.header)!, body, logOrigin(c.manifest), () => hexToBytes(current.signPk, 32), 10);
    assert.equal(checked.ok, true);
    if (checked.ok) assert.equal(checked.value.type, 'dkg_round1');
    assert.deepEqual(readFileSync(current.path), before, 'export does not change the sealed bundle');
    await c.act(1, (x) => x.abort('test abort'));
    await assert.rejects(current.exportBoardEntry('r1-commit'), { code: 'BUNDLE_CHANGED' });
    await assert.rejects(c.act(1, (x) => x.exportBoardEntry('r1-commit')), { code: 'WRONG_STATE' });
  } finally { c.cleanup(); }
});

test('board tally export reuses a gated, ledger-backed release and preserves every proof', async () => {
  const { c } = await electionFixture({ n: 3, t: 2, seed: 'board-tally-export' });
  try {
    const t = await c.act(1, async (x) => x);
    await assert.rejects(t.exportBoardEntry('tally-share'), { code: 'OUTPUT_NOT_READY' });
    await assert.rejects(t.releaseTally(c.bundle({ evidence: false })), { code: 'LOG_EVIDENCE_REQUIRED' });
    await assert.rejects(t.exportBoardEntry('tally-share'), { code: 'OUTPUT_NOT_READY' });
    const packet = await t.releaseTally(c.bundle());
    const ledger = readFileSync(`${t.path}.releases`);
    const entry = await c.act(1, (x) => x.exportBoardEntry('tally-share'));
    const record = parseQvJson(unb64u(entry.body)!) as unknown as { body: { type: string; j: number; shares: unknown[] }; sig: Sig };
    assert.equal(record.body.type, 'dec-shares');
    assert.equal(record.body.j, 1);
    assert.deepEqual(jcs(record.body.shares), jcs((packet.obj.records[0] as { body: { shares: unknown[] } }).body.shares));
    assert.equal(verifySig(c.ctx!, record.body.type, record.body, record.sig, t.signPk), true);
    assert.equal(checkEntry(unb64u(entry.header)!, unb64u(entry.body)!, logOrigin(c.manifest), () => hexToBytes(t.signPk, 32), 100).ok, true);
    assert.deepEqual(readFileSync(`${t.path}.releases`), ledger);
  } finally { c.cleanup(); }
});

test('export-entry rejects invalid arguments before prompting and protects output files', async () => {
  const c = new Ceremony({ n: 3, t: 2, seed: 'board-export-cli' });
  await c.setup();
  try {
    let prompts = 0;
    const io = { out: (_s: string) => {}, err: (_s: string) => {}, promptSecret: async () => { prompts++; return PASS; } };
    const deps = mkDeps('board-export-cli');
    const common = ['export-entry', '--bundle', c.path(1), '--json'];
    const out = join(c.dir, 'entry.json');
    for (const extra of [['--round', 'arbitrary', '--out', out], ['--round', 'r1-commit'],
      ...['-1', '1.5', '01', '9007199254740992'].map((i) => ['--round', 'r1-commit', '--index', i, '--out', out])]) {
      assert.equal(await trusteeMain([...common, ...extra], io, deps), 2);
    }
    assert.equal(prompts, 0);
    c.marker('dkg-open');
    await c.sync(1);
    await c.act(1, (t) => t.commit());
    assert.equal(await trusteeMain([...common, '--round', 'r1-commit', '--out', c.path(1)], io, deps), 60);
    writeFileSync(out, 'keep existing bytes');
    assert.equal(await trusteeMain([...common, '--round', 'r1-commit', '--out', out], io, deps), 60);
    assert.equal(readFileSync(out, 'utf8'), 'keep existing bytes');
    const fresh = join(c.dir, 'fresh.json');
    assert.equal(await trusteeMain([...common, '--round', 'r1-commit', '--out', fresh], io, deps), 0);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(fresh, 'utf8'))).sort(), ['body', 'header']);
  } finally { c.cleanup(); }
});
