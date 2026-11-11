import test from 'node:test';
import assert from 'node:assert/strict';
import { contestsFor, defaultOptions, fixedSelections, median, parseArgs, runBench, type Stat } from '../bench/tally-bench.ts';

/** Every Stat in the result, by dotted path (a Stat is an object with medianMs, runsMs and extrapolated). */
function statsOf(x: unknown, path = ''): [string, Stat][] {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return [];
  const o = x as Record<string, unknown>;
  if ('medianMs' in o && 'runsMs' in o && 'extrapolated' in o) return [[path, o as unknown as Stat]];
  return Object.entries(o).flatMap(([k, v]) => statsOf(v, path === '' ? k : `${path}.${k}`));
}

// Keeps bench/tally-bench.ts from rotting (docs/reports/performance-baseline-2026-11-04.md). It checks that every phase runs and is
// self-consistent at N=12 and that the decrypted counts are exactly right; it asserts nothing about speed.
//
// The election is deterministic (pattern 'fixed', see fixedSelections) with these known per-option totals for V = N = 12 ballots:
//   budget (yes/no, limit 1):  ballot i selects yes if i % 3 == 0, no if i % 3 == 1, abstains if i % 3 == 2  -> yes 4, no 4
//   topics (approval a, b):    every ballot selects a, ballots with i even also select b (ballot 0 selects both) -> a 12, b 6
// topics/a == V, so an off-by-one BSGS bound in decryptAggregates cannot recover it, and every ballot contributes to topics/a,
// so dropping any counted ballot in aggregate() changes a decrypted count.
const N = 12;
const EXPECTED = { budget: { yes: 4, no: 4 }, topics: { a: 12, b: 6 } };

test('tally bench smoke: fixed N=12 election decrypts exactly the plaintext tally, every phase runs, the full bundle verifies PASS', { timeout: 300_000 }, async () => {
  // the fixed pattern itself: independent of the bench's own accounting
  const contests = contestsFor('smoke');
  const tally: Record<string, Record<string, number>> = Object.fromEntries(contests.map((c) => [c.id, Object.fromEntries(c.options.map((op) => [op.id, 0]))]));
  for (let i = 0; i < N; i++) for (const [cid, ids] of Object.entries(fixedSelections(i, contests))) for (const id of ids) tally[cid]![id]! += 1;
  assert.deepEqual(tally, EXPECTED);
  assert.deepEqual(fixedSelections(0, contests), { budget: ['yes'], topics: ['a', 'b'] }, 'ballot 0 selects every option it may');

  const lines: string[] = [];
  const o = { ...defaultOptions(N), sample: N, runs: 1, opCount: 3, bsgs: [N, 1000], shape: 'smoke' as const, pattern: 'fixed' as const, log: (l: string) => lines.push(l) };
  const r = await runBench(o);

  assert.equal(r.config.n, N);
  assert.equal(r.config.sample, N);
  assert.equal(r.config.pattern, 'fixed');
  assert.equal(r.config.ciphertextsPerBallot, 5);
  assert.equal(r.config.limitProofsPerBallot, 1);
  // exact counts at N: threshold decryption + BSGS (bound N) must return the plaintext tally
  assert.deepEqual(r.counts.expected, EXPECTED);
  assert.deepEqual(r.counts.decrypted, EXPECTED);
  assert.equal(r.countsMatch, true);

  // extrapolated is set exactly on the two N-projections; every other Stat is a direct measurement
  const stats = statsOf(r);
  assert.ok(stats.length > 20, `found ${stats.length} stats`);
  assert.deepEqual(stats.filter(([, s]) => s.extrapolated).map(([k]) => k).sort(), ['encrypt.projectedN', 'verify.projectedN']);
  for (const [k, s] of stats) assert.ok(Number.isFinite(s.medianMs) && s.medianMs > 0 && s.runsMs.length > 0, `${k}: ${JSON.stringify(s)}`);
  for (const s of [r.encrypt.perBallot, r.verify.perBallot, r.aggregation, r.trusteeDecrypt.perTrustee, r.combine, r.ed25519.verifyMs, r.full[0]!.verifyElection]) {
    assert.equal(s.extrapolated, false);
  }
  for (const proj of [r.encrypt, r.verify]) {
    assert.match(proj.projectedN.note ?? '', /EXTRAPOLATED/);
    assert.ok(Math.abs(proj.projectedN.medianMs - proj.perBallot.medianMs * N) <= 1e-9 * proj.projectedN.medianMs, 'projection = per-ballot x N');
    assert.equal(proj.projectedNMs, proj.projectedN.medianMs);
  }
  assert.ok(lines.some((l) => l.includes('EXTRAPOLATED')), 'extrapolated numbers are labelled in the output');

  assert.deepEqual(r.bsgs.map((b) => [b.bound, b.ok]), [[N, true], [1000, true]]);
  assert.equal(r.bsgs[1]!.m, Math.ceil(Math.sqrt(1001)));
  // at N=12 the full verification is cheap, so `auto` measures it at N itself, on a real bundle cast with the same fixed pattern
  assert.deepEqual(r.config.fullSizes, [N]);
  assert.equal(r.full.length, 1);
  const f = r.full[0]!;
  assert.equal(f.verdict, 'PASS');
  assert.deepEqual(f.counts.expected, EXPECTED);
  assert.deepEqual(f.counts.coordinator, EXPECTED);
  assert.deepEqual(f.counts.published, EXPECTED);
  assert.equal(f.countsMatch, true);
  assert.equal(f.countedReported, N);
  assert.equal(f.spoilsTrustees, 2);
  assert.ok(r.micro['cdsVerify (one ciphertext)'] !== undefined);
});

test('tally bench CLI parsing and median helper', () => {
  const o = parseArgs(['500', '--sample=50', '--runs=5', '--full=1000,2000', '--shape=full', '--bsgs=10,20']);
  assert.equal(o.n, 500);
  assert.equal(o.sample, 50);
  assert.equal(o.runs, 5);
  assert.deepEqual(o.full, [1000, 2000]);
  assert.equal(o.shape, 'full');
  assert.deepEqual(o.bsgs, [10, 20]);
  assert.equal(o.pattern, 'seeded');
  assert.equal(parseArgs(['--pattern=fixed', '--shape=smoke']).pattern, 'fixed');
  assert.throws(() => parseArgs(['--pattern=weird']));
  assert.equal(parseArgs([]).n, 10_000);
  assert.deepEqual(parseArgs([]).bsgs, [10_000, 1_000_000, 100_000_000]);
  assert.throws(() => parseArgs(['--shape=weird']));
  assert.throws(() => parseArgs(['0']));
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});
