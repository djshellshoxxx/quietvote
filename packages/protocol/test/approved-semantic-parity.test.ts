// ADR-027 B1-02/07: preserve the reference behavior for the same public audit
// examples exercised independently by Python. No generated expected output is read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bytesToHex, hexToBytes } from '@quietvote/crypto';
import { adjudicateDkg, verifyElection, type DkgInput, type ElectionBundle } from '../src/index.ts';

const fixture = (file: string): any => JSON.parse(readFileSync(new URL(`../../../docs/audit/2026-10-28/poc/B1/audit-b1-poc/out/${file}`, import.meta.url), 'utf8'));
const bundle = (name = 'E0-baseline'): ElectionBundle => fixture(`${name}.bundle.json`);

for (const [name, code, encoding] of [
  ['E7-bad-close-then-good', 'E_SIG', 'pass'],
  ['E13-C3-close-with-binding', 'E_SCHEMA', 'fail'],
  ['E17-tally-posted-twice', 'E_SCHEMA', 'pass'],
]) {
  test(`approved non-ballot classification: ${name}`, async () => {
    const b = bundle(name);
    const r = await verifyElection(b, { allowNoLog: true });
    assert.equal(r.verdict, 'PASS');
    assert.ok(r.findings.some((f) => f.code === code && f.cls === 'L'));
    assert.equal(r.checks['chk.encoding.canonical'], encoding);
    for (const id of ['chk.keys.trustees', 'chk.time.window', 'chk.tally.aggregate', 'chk.tally.decrypt', 'chk.result.rules'] as const) assert.equal(r.checks[id], 'pass');
    assert.equal((await verifyElection(b)).verdict, 'INCOMPLETE');
  });
}

for (const name of ['E2-count-quorum', 'E3-tie-basis-counted', 'E3b-2of3-status-quo-yes', 'E4-kofn-winner-order', 'E15-excluded-latest-cast']) {
  test(`approved exact outcome: ${name}`, async () => {
    const b = bundle(name);
    const r = await verifyElection(b, { allowNoLog: true });
    assert.equal(r.verdict, 'PASS');
    const tally = b.log.map((row) => row.entry as { body?: { type?: string; results?: unknown } }).find((entry) => entry.body?.type === 'tally');
    assert.deepEqual(r.results, tally?.body?.results);
  });
}

test('unknown tally version is not examined; a conflicting valid-format tally is fatal', async () => {
  const b = bundle();
  const tally = b.log.map((row) => row.entry as { body?: { type?: string; proto?: string } }).find((entry) => entry.body?.type === 'tally')!;
  tally.body!.proto = 'qv2-unknown';
  const r = await verifyElection(b, { allowNoLog: true });
  assert.equal(r.verdict, 'INCOMPLETE');
  assert.equal(r.checks['chk.tally.decrypt'], 'not_run');
  assert.ok(r.findings.some((f) => f.code === 'E_VERSION' && f.cls === 'L'));
  const conflict = await verifyElection(bundle('K-P3-second-tally-differs'), { allowNoLog: true });
  assert.equal(conflict.verdict, 'FAIL');
  assert.ok(conflict.findings.some((f) => f.code === 'E_RESULT' && f.cls === 'F'));
});

const expected: Record<string, { Q: number[]; ctx: string }> = {
  'D0-honest': { Q: [1, 2, 3], ctx: 'bed87454af06620a1772b99c6b42d4a86f9944cd8d1482dc1c75107cc4e6ef45' },
  'D1-duplicate-different-commit': { Q: [1, 2], ctx: '0856ce918a0c587b7d1fa6e5ec73dfc4f2481204cacc0d060466449f22c5b024' },
  'D3-complaint-vs-R2-disqualified': { Q: [1, 3], ctx: '1151574fece914d9004ac64d791977bd608822528960c7729b73d101a7d5625c' },
  'D4-commit-before-dkg-open': { Q: [1, 2, 3], ctx: 'd36b2afefca89aada1042ed8e0cc18f9d835d63e26faf4ade1ce04ee72c63971' },
};
for (const v of fixture('op-dkg.json')) {
  if (expected[v.id] === undefined) continue;
  test(`approved DKG adjudication: ${v.id}`, async () => {
    for (const reverse of [false, true]) {
      const records = structuredClone(v.records) as Pick<DkgInput, 'commits' | 'dealings' | 'shares' | 'complaints'>;
      if (reverse) for (const rows of Object.values(records)) rows.reverse();
      const r = await adjudicateDkg({ mh: hexToBytes(v.manifest_hash_hex), n: v.n, t: v.t, markers: v.markers, ...records });
      assert.ok(r.ok);
      if (!r.ok) return;
      assert.deepEqual(r.value.Q, expected[v.id]!.Q);
      assert.equal(bytesToHex(r.value.ctx), expected[v.id]!.ctx);
    }
  });
}
