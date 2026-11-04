/**
 * Deterministic tally performance baseline (docs/audit/HANDOFF.md §3.3 "Performance"; docs/reports/performance-baseline-2026-11-04.md).
 *
 *   node bench/tally-bench.ts [N=10000] [--sample=200] [--runs=3] [--full=auto|none|1000,2000] [--shape=referendum|full|smoke]
 *                             [--bsgs=N,1000000,100000000] [--ops=200] [--full-runs=1] [--full-budget-s=600] [--pattern=seeded|fixed]
 *                             [--json=out.json]
 *
 * Everything is seeded (streamRng, sim seeds): no network, no clock in any input, so the same N gives the same ballots, bundle and
 * decrypted counts. Only the timings differ between runs. Every measurement uses process.hrtime.bigint().
 *
 * What is MEASURED and what is EXTRAPOLATED is recorded on every Stat: `extrapolated: true` is set exactly on the projected Stats
 * (`encrypt.projectedN`, `verify.projectedN`); every other Stat in the result is a direct measurement (`extrapolated: false`):
 *  - ballot encryption + proofs + signature: measured on `sample` ballots (`encrypt.perBallot`), extrapolated linearly to N
 *    (`encrypt.projectedN`, extrapolated: true; `encrypt.projectedNMs` is its median as a bare number);
 *  - ballot proof verification (verifyEnvelope): measured on the same sample (median of `runs` passes, `verify.perBallot`),
 *    extrapolated to N (`verify.projectedN`, extrapolated: true; `verify.projectedNMs`);
 *  - homomorphic aggregation, threshold decryption, BSGS: measured AT N over a synthetic counted set that cycles the sample's
 *    valid ciphertexts (point decoding and addition costs do not depend on which valid point is decoded);
 *  - full verifyElection: measured on real bundles built by the sim (every ballot freshly encrypted and signed), at N if the
 *    estimate fits in ~10 minutes, otherwise at 1000 and 2000 (`--full=auto`).
 *
 * This file is a measurement tool only; it never changes production code paths. Unaudited prototype; not for real elections.
 */
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import {
  baseMul, bytesToHex, cdsProve, cdsVerify, dlogSolve, dlogTable, ed25519IsStrictPoint, ed25519Keypair, ed25519Sign, ed25519Verify,
  elgamalEncrypt, pointFromBytes, pointMul, pointToBytes, scalarRandomNonZero, sha256, streamRng, utf8, type Point, type Rng,
} from '@quietvote/crypto';
import {
  aggregate, ballotCode, binderFor, buildBallot, buildTally, castDigest, decryptAggregates, makeCast, NO_SUPERSEDES, signRecord,
  trusteeDecryptSpoiled, trusteeDecryptTally, verifyBallotContent, verifyElectionText, verifyEnvelope,
  type CastEnvelope, type CountedBallot, type ManifestContest, type Selections, type ShareSet, type SpoilEnvelope, type SpoilRecord,
} from '../src/index.ts';
import { bundleOf, castBallot, closeElection, defaultContests, push, setup, spoilBallot, trusteeKeyFor, type Sim } from '../test/helpers/sim.ts';

const H = bytesToHex;

// ------------------------------------------------------------------ timing helpers

/** Milliseconds elapsed while running `fn`, via process.hrtime.bigint(). */
export function timeMs<T>(fn: () => T): { ms: number; value: T } {
  const t0 = process.hrtime.bigint();
  const value = fn();
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, value };
}
async function timeMsAsync<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = process.hrtime.bigint();
  const value = await fn();
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, value };
}
export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

export interface Stat {
  /** median over runs (or over per-item samples, see `per`) in milliseconds */
  medianMs: number;
  runsMs: number[];
  extrapolated: boolean;
  note?: string;
}
const stat = (runsMs: number[], extrapolated = false, note?: string): Stat =>
  note === undefined ? { medianMs: median(runsMs), runsMs, extrapolated } : { medianMs: median(runsMs), runsMs, extrapolated, note };

/** Per-operation cost: run `op` `count` times per run, `runs` runs; reports the median of the per-run means. */
function perOp(runs: number, count: number, op: (i: number) => unknown): { perOpMs: number; runsPerOpMs: number[] } {
  const r: number[] = [];
  for (let k = 0; k < runs; k++) {
    const { ms } = timeMs(() => {
      for (let i = 0; i < count; i++) op(i);
    });
    r.push(ms / count);
  }
  return { perOpMs: median(r), runsPerOpMs: r };
}

// ------------------------------------------------------------------ workload

export type Shape = 'referendum' | 'full' | 'smoke';

/** referendum: one yes/no contest with selection_limit 1 (3 ciphertexts + 1 limit proof per ballot);
 *  full: the sim's four default contests (yes-no, single-choice, approval, 2-of-5: 18 ciphertexts + 3 limit proofs);
 *  smoke: the yes/no contest plus a 2-option approval contest without a limit, so a ballot can select every option
 *  (5 ciphertexts + 1 limit proof; used by test/bench-smoke.test.ts). */
export function contestsFor(shape: Shape): ManifestContest[] {
  const all = defaultContests();
  if (shape === 'referendum') return all.filter((c) => c.id === 'budget');
  if (shape === 'smoke') {
    const topics = all.find((c) => c.id === 'topics')!;
    return [all.find((c) => c.id === 'budget')!, { ...topics, options: topics.options.slice(0, 2), winners: 1 }];
  }
  return all;
}

/** Selection source for the counted ballots: `seeded` draws rule-respecting random selections (abstentions included);
 *  `fixed` uses {@link fixedSelections}, whose per-option totals are known in closed form. */
export type Pattern = 'seeded' | 'fixed';

/**
 * Deterministic selections for ballot `i` (0-based). Per contest with n options and limit L (no limit: L = n):
 *  - L >= n (every option may be selected): option 0 on every ballot, option k >= 1 iff i % (k + 1) === 0. Ballot 0 therefore
 *    selects every option and option 0 totals exactly V = number of ballots (the BSGS bound), so an off-by-one bound or a
 *    dropped ballot changes a decrypted count;
 *  - L < n: r = i % (n + 1); r === n abstains, otherwise options r, r+1, ... (mod n), L of them. Ballot 0 selects options 0..L-1.
 */
export function fixedSelections(i: number, contests: readonly ManifestContest[]): Selections {
  const out: Selections = {};
  for (const c of contests) {
    const ids = c.options.map((o) => o.id);
    const n = ids.length;
    const L = c.selection_limit ?? n;
    if (L >= n) out[c.id] = ids.filter((_, k) => k === 0 || i % (k + 1) === 0);
    else {
      const r = i % (n + 1);
      out[c.id] = r === n ? [] : ids.filter((_, k) => (k - r + n) % n < L);
    }
  }
  return out;
}

/** Seeded, rule-respecting selections (abstentions included). */
export function pickSelections(rng: Rng, contests: readonly ManifestContest[]): Selections {
  const out: Selections = {};
  for (const c of contests) {
    const ids = c.options.map((o) => o.id);
    const b = rng.bytes(ids.length + 1);
    const L = c.selection_limit ?? ids.length;
    const chosen = ids.filter((_, k) => b[k + 1]! % 2 === 0).slice(0, b[0]! % (L + 1));
    out[c.id] = chosen;
  }
  return out;
}

function addCounts(into: Map<string, Map<string, number>>, contests: readonly ManifestContest[], sel: Selections): void {
  for (const c of contests) {
    let m = into.get(c.id);
    if (m === undefined) {
      m = new Map(c.options.map((o) => [o.id, 0]));
      into.set(c.id, m);
    }
    for (const id of sel[c.id] ?? []) m.set(id, m.get(id)! + 1);
  }
}
export type CountsRecord = Record<string, Record<string, number>>;
const countsRecord = (m: ReadonlyMap<string, ReadonlyMap<string, number>>): CountsRecord =>
  Object.fromEntries([...m].map(([cid, om]) => [cid, Object.fromEntries(om)]));
const countsEqual = (a: ReadonlyMap<string, ReadonlyMap<string, number>>, b: ReadonlyMap<string, ReadonlyMap<string, number>>): boolean =>
  a.size === b.size && [...a].every(([cid, m]) => m.size === b.get(cid)?.size && [...m].every(([oid, v]) => b.get(cid)!.get(oid) === v));

// ------------------------------------------------------------------ options / result

export interface BenchOptions {
  n: number;
  sample: number;
  runs: number;
  /** 'auto' | 'none' | explicit sizes */
  full: 'auto' | 'none' | number[];
  /** runs of verifyElection per full size (default 1; each one is a whole-bundle verification) */
  fullRuns: number;
  shape: Shape;
  /** where the counted ballots' selections come from (default `seeded`) */
  pattern: Pattern;
  bsgs: number[];
  /** budget for `--full=auto` (estimated verifyElection seconds at N) */
  fullBudgetS: number;
  /** repetitions per run for the Ed25519 and ristretto255 micro measurements (default 200) */
  opCount: number;
  log: (line: string) => void;
}

export function defaultOptions(n = 10_000): BenchOptions {
  return { n, sample: 200, runs: 3, full: 'auto', fullRuns: 1, shape: 'referendum', pattern: 'seeded', bsgs: [n, 1_000_000, 100_000_000], fullBudgetS: 600, opCount: 200, log: (l) => console.log(l) };
}

export interface FullRun {
  ballots: number;
  spoilsTrustees: number;
  bundleBytes: number;
  buildCastMs: number;
  coordinatorTallyMs: number;
  verifyElection: Stat;
  verdict: string;
  countsMatch: boolean;
  countedReported: number;
  /** plaintext tally of the cast selections, the coordinator's decrypted counts and the T values in the published tally record */
  counts: { expected: CountsRecord; coordinator: CountsRecord; published: CountsRecord };
}

export interface BenchResult {
  machine: { nproc: number; cpu: string; node: string; platform: string; arch: string; totalMemGiB: number; loadavgStart: number[]; loadavgEnd?: number[] };
  config: { n: number; sample: number; runs: number; shape: Shape; pattern: Pattern; ciphertextsPerBallot: number; limitProofsPerBallot: number; trustees: string; fullSizes: number[] };
  setupDkgMs: number;
  encrypt: { perBallot: Stat; perBallotMedianMs: number; perBallotP95Ms: number; buildBallotMs: number; makeCastSignMs: number; projectedN: Stat; projectedNMs: number };
  verify: { perBallot: Stat; ballotsPerSecond: number; ed25519PartMs: number; contentPartMs: number; projectedN: Stat; projectedNMs: number };
  aggregation: Stat;
  trusteeDecrypt: { perTrustee: Stat; trustees: number };
  combine: Stat;
  countsMatch: boolean;
  /** plaintext tally of the synthetic counted set at N and what decryptAggregates returned for it (last run) */
  counts: { expected: CountsRecord; decrypted: CountsRecord };
  bsgs: { bound: number; m: number; tableMs: Stat; solveMaxMs: Stat; ok: boolean }[];
  full: FullRun[];
  fullSkippedReason?: string;
  ed25519: { verifyMs: Stat; strictPointMs: Stat; signMs: Stat; reference?: { verifyNoTorsionMs: Stat; strictNoTorsionMs: Stat; nobleVerifyOnlyMs: Stat } };
  micro: Record<string, Stat>;
}

// ------------------------------------------------------------------ the benchmark

export async function runBench(o: BenchOptions): Promise<BenchResult> {
  const log = o.log;
  const contests = contestsFor(o.shape);
  const ctPerBallot = contests.reduce((a, c) => a + c.options.length + (c.selection_limit ?? 0), 0);
  const limPerBallot = contests.filter((c) => c.selection_limit !== undefined).length;
  const sampleN = Math.max(1, Math.min(o.sample, o.n));
  const runs = Math.max(1, o.runs);
  const selRng = streamRng(`bench/select/${o.shape}`);
  const rng = streamRng(`bench/rng/${o.shape}`);

  const machine = {
    nproc: os.availableParallelism(), cpu: os.cpus()[0]?.model ?? 'unknown', node: process.version, platform: process.platform, arch: process.arch,
    totalMemGiB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10, loadavgStart: os.loadavg().map((x) => Math.round(x * 100) / 100),
  } as BenchResult['machine'];
  const select = (i: number): Selections => (o.pattern === 'fixed' ? fixedSelections(i, contests) : pickSelections(selRng, contests));
  log(`# QuietVote tally bench  N=${o.n} sample=${sampleN} runs=${runs} shape=${o.shape} pattern=${o.pattern} (${ctPerBallot} ct/ballot)`);
  log(`machine: ${machine.cpu}, nproc=${machine.nproc}, node ${machine.node} ${machine.platform}/${machine.arch}, loadavg ${machine.loadavgStart.join(' ')}`);

  // ---- setup: 3-of-5 DKG, roll of `sampleN` voters, trustee-mode spoils enabled
  const { ms: setupDkgMs, value: sim } = await timeMsAsync(() =>
    setup({ seed: `bench/sample/${o.shape}`, n: 5, t: 3, voters: sampleN, contests, spoilTrustees: true, maxPerVoter: 2 }),
  );
  const p = sim.params!;
  const roll = new Set(sim.rollHex);
  log(`setup (DKG 3-of-5 + roll of ${sampleN}): ${setupDkgMs.toFixed(0)} ms`);

  // ---- 1. encryption + proofs (+ signature) per ballot, measured on the sample
  const sample: { env: CastEnvelope; sel: Selections }[] = [];
  const encMs: number[] = [];
  const buildMs: number[] = [];
  const signMs: number[] = [];
  for (let i = 0; i < sampleN; i++) {
    const v = sim.voters[i]!;
    const sel = select(i);
    const b = timeMs(() => buildBallot(p, v.secretKey, v.publicKey, NO_SUPERSEDES, sel, rng));
    if (!b.value.ok) throw new Error(`buildBallot: ${b.value.error}`);
    const built = b.value.value;
    const s = timeMs(() => makeCast(p, v.secretKey, built));
    buildMs.push(b.ms);
    signMs.push(s.ms);
    encMs.push(b.ms + s.ms);
    sample.push({ env: s.value, sel });
  }
  const encPer = mean(encMs);
  const encrypt = {
    perBallot: stat([encPer], false, `mean over ${sampleN} ballots (buildBallot + makeCast)`),
    perBallotMedianMs: median(encMs),
    perBallotP95Ms: pct(encMs, 0.95),
    buildBallotMs: mean(buildMs),
    makeCastSignMs: mean(signMs),
    projectedN: stat([encPer * o.n], true, `EXTRAPOLATED: mean per-ballot cost on ${sampleN} sample ballots x N=${o.n}`),
    projectedNMs: encPer * o.n,
  };
  log(`encrypt+proofs+sign: ${encPer.toFixed(2)} ms/ballot (median ${encrypt.perBallotMedianMs.toFixed(2)}, p95 ${encrypt.perBallotP95Ms.toFixed(2)}); ` +
    `N=${o.n} EXTRAPOLATED ${(encrypt.projectedNMs / 1000).toFixed(1)} s`);

  // ---- 2. ballot verification throughput (verifyEnvelope = schema, ctx, roll, strict Ed25519, CDS + limit proofs)
  const verRuns = perOp(runs, sample.length, (i) => {
    if (!verifyEnvelope(p, roll, sample[i]!.env).ok) throw new Error('sample envelope failed to verify');
  });
  const edPart = perOp(1, sample.length, (i) => {
    const body = sample[i]!.env.body;
    const voter = Uint8Array.from(Buffer.from(body.voter, 'hex'));
    ed25519IsStrictPoint(voter);
    ed25519Verify(voter, Uint8Array.from(Buffer.from(sample[i]!.env.sig, 'hex')), castDigest(p.ctx, ballotCode(p.ctx, body)));
  }).perOpMs;
  const contentPart = perOp(1, sample.length, (i) => verifyBallotContent(p, sample[i]!.env.body)).perOpMs;
  const verify = {
    perBallot: stat(verRuns.runsPerOpMs, false, `median of ${runs} passes over ${sample.length} ballots (per-ballot mean per pass)`),
    ballotsPerSecond: 1000 / verRuns.perOpMs,
    ed25519PartMs: edPart,
    contentPartMs: contentPart,
    projectedN: stat(verRuns.runsPerOpMs.map((x) => x * o.n), true, `EXTRAPOLATED: per-ballot verifyEnvelope cost of each pass over ${sample.length} sample ballots x N=${o.n}`),
    projectedNMs: verRuns.perOpMs * o.n,
  };
  log(`verifyEnvelope: ${verRuns.perOpMs.toFixed(2)} ms/ballot = ${verify.ballotsPerSecond.toFixed(1)} ballots/s ` +
    `(Ed25519 part ${edPart.toFixed(2)} ms, proofs/content part ${contentPart.toFixed(2)} ms); N=${o.n} EXTRAPOLATED ${(verify.projectedNMs / 1000).toFixed(1)} s`);

  // ---- 3. homomorphic aggregation at N (synthetic counted set cycling the sample's valid ciphertexts)
  const counted: CountedBallot[] = [];
  const expected = new Map<string, Map<string, number>>();
  for (let i = 0; i < o.n; i++) {
    const s = sample[i % sample.length]!;
    counted.push({ seq: i + 1, voter: H(sha256(utf8(`bench-voter-${i}`))), code: H(sha256(utf8(`bench-code-${i}`))), env: s.env });
    addCounts(expected, contests, s.sel);
  }
  const aggRuns: number[] = [];
  let aggs = aggregate(p, counted.slice(0, 1));
  for (let k = 0; k < runs; k++) {
    const r = timeMs(() => aggregate(p, counted));
    aggRuns.push(r.ms);
    aggs = r.value;
  }
  const aggregation = stat(aggRuns, false, `aggregate() over N=${o.n} counted ballots (${2 * contests.reduce((a, c) => a + c.options.length, 0) * o.n} point decodes)`);
  log(`aggregation (N=${o.n}): median ${aggregation.medianMs.toFixed(0)} ms  runs=[${aggRuns.map((x) => x.toFixed(0)).join(', ')}]`);

  // ---- 4. threshold decryption at N: t=3 trustees each re-aggregate and prove; coordinator verifies + combines + BSGS
  const subset = [1, 2, 3];
  const shares = new Map<number, ShareSet>();
  const tRuns: number[] = [];
  for (const j of subset) {
    const r = timeMs(() => trusteeDecryptTally(p, trusteeKeyFor(sim, j), counted, undefined, o.n, rng));
    if (!r.value.ok) throw new Error(`trustee ${j}: ${r.value.error}`);
    shares.set(j, r.value.value);
    tRuns.push(r.ms);
  }
  const trusteeDecrypt = { perTrustee: stat(tRuns, false, 'trusteeDecryptTally per trustee (includes its own re-aggregation of N ballots + one decProve per option)'), trustees: subset.length };
  const Y = sim.outcome!.Y;
  const Q = new Set(sim.outcome!.Q);
  const combRuns: number[] = [];
  let countsMatch = true;
  let decrypted: CountsRecord = {};
  for (let k = 0; k < runs; k++) {
    const r = timeMs(() => decryptAggregates(p, Y, Q, aggs, o.n, shares));
    if (!r.value.ok) throw new Error(`decryptAggregates: ${r.value.error} ${r.value.detail ?? ''}`);
    countsMatch &&= countsEqual(r.value.value.counts, expected);
    decrypted = countsRecord(r.value.value.counts);
    combRuns.push(r.ms);
  }
  const combine = stat(combRuns, false, 'decryptAggregates: decVerify of every share, Lagrange combination, BSGS table (bound N) + solve per option');
  log(`trusteeDecryptTally: median ${trusteeDecrypt.perTrustee.medianMs.toFixed(0)} ms/trustee; decryptAggregates: median ${combine.medianMs.toFixed(1)} ms; counts match plaintext: ${countsMatch}`);

  // ---- 5. BSGS discrete log for the maximum count (T = bound, the worst case: all giant steps)
  const bsgs: BenchResult['bsgs'] = [];
  for (const bound of [...new Set(o.bsgs)].sort((a, b) => a - b)) {
    const tab: number[] = [];
    const sol: number[] = [];
    let ok = true;
    let m = 0;
    const D: Point = baseMul(BigInt(bound));
    for (let k = 0; k < runs; k++) {
      const t = timeMs(() => dlogTable(bound));
      m = t.value.m;
      tab.push(t.ms);
      const s = timeMs(() => dlogSolve(D, t.value));
      ok &&= s.value === bound;
      sol.push(s.ms);
    }
    bsgs.push({ bound, m, tableMs: stat(tab), solveMaxMs: stat(sol), ok });
    log(`BSGS bound=${bound} (m=${m}): table ${median(tab).toFixed(1)} ms, solve(T=bound) ${median(sol).toFixed(1)} ms, correct=${ok}`);
  }

  // ---- 6. Ed25519 (CP-04 strict torsion check) and reference without it
  const ed25519 = await benchEd25519(runs, o.opCount);
  log(`Ed25519 verify (strict, CP-04): ${ed25519.verifyMs.medianMs.toFixed(3)} ms; strict point check ${ed25519.strictPointMs.medianMs.toFixed(3)} ms; sign ${ed25519.signMs.medianMs.toFixed(3)} ms`);
  if (ed25519.reference !== undefined) {
    log(`  reference without torsion check: verify ${ed25519.reference.verifyNoTorsionMs.medianMs.toFixed(3)} ms, strict point check ${ed25519.reference.strictNoTorsionMs.medianMs.toFixed(3)} ms, noble verify only ${ed25519.reference.nobleVerifyOnlyMs.medianMs.toFixed(3)} ms`);
  }

  // ---- 7. ristretto255 micro costs (evidence for the optimisation recommendation; uses copies, never the election key object)
  const micro = benchMicro(p.K, p.ctx, runs, o.opCount, sample[0]!.env, contests);
  for (const [k, v] of Object.entries(micro)) log(`micro ${k}: ${v.medianMs.toFixed(3)} ms`);

  // ---- 8. full verifyElection on real bundles
  let fullSizes: number[];
  let fullSkippedReason: string | undefined;
  const estVerifyS = (verRuns.perOpMs * o.n) / 1000;
  if (o.full === 'none') {
    fullSizes = [];
    fullSkippedReason = '--full=none';
  } else if (o.full === 'auto') {
    // feasible: measure at N, plus a 1000-ballot point for the scaling check
    if (estVerifyS <= o.fullBudgetS) fullSizes = [...new Set([Math.min(1000, o.n), o.n])];
    else {
      fullSizes = [1000, 2000].filter((x) => x < o.n);
      fullSkippedReason = `estimated verifyElection at N=${o.n} is ${estVerifyS.toFixed(0)} s > ${o.fullBudgetS} s budget; measured at ${fullSizes.join(', ')} instead`;
    }
  } else fullSizes = o.full;
  if (fullSkippedReason !== undefined) log(`full verifyElection: ${fullSkippedReason}`);
  const full: FullRun[] = [];
  for (const F of fullSizes) {
    const fr = await fullBundle(F, contests, o.shape, o.pattern, Math.max(1, o.fullRuns), log);
    full.push(fr);
  }

  const result: BenchResult = {
    machine,
    config: { n: o.n, sample: sampleN, runs, shape: o.shape, pattern: o.pattern, ciphertextsPerBallot: ctPerBallot, limitProofsPerBallot: limPerBallot, trustees: 't=3 of n=5', fullSizes },
    setupDkgMs, encrypt, verify, aggregation, trusteeDecrypt, combine, countsMatch,
    counts: { expected: countsRecord(expected), decrypted }, bsgs, full, ed25519, micro,
  };
  if (fullSkippedReason !== undefined) result.fullSkippedReason = fullSkippedReason;
  machine.loadavgEnd = os.loadavg().map((x) => Math.round(x * 100) / 100);
  log(`loadavg at end: ${machine.loadavgEnd.join(' ')}`);
  return result;
}

async function fullBundle(F: number, contests: ManifestContest[], shape: Shape, pattern: Pattern, fullRuns: number, log: (l: string) => void): Promise<FullRun> {
  const sim: Sim = await setup({ seed: `bench/full/${shape}/${F}`, n: 5, t: 3, voters: F, contests, spoilTrustees: true, maxPerVoter: 2, maxSpoils: 2 });
  const p = sim.params!;
  const selRng = streamRng(`bench/full-select/${shape}/${F}`);
  const expected = new Map<string, Map<string, number>>();
  addCounts(expected, contests, {});
  // two trustee-mode spoils (Benaloh audits decrypted by the trustees), then every voter casts once
  const spoilers = Math.min(2, F);
  const spoils: { env: SpoilEnvelope; sel: Selections; seq: number }[] = [];
  for (let i = 0; i < spoilers; i++) {
    const sel = pickSelections(selRng, contests);
    const r = spoilBallot(sim, i, sel, 'trustees');
    spoils.push({ env: r.env, sel, seq: sim.seq });
  }
  const casts: CountedBallot[] = [];
  const build = timeMs(() => {
    for (let i = 0; i < F; i++) {
      const sel = pattern === 'fixed' ? fixedSelections(i, contests) : pickSelections(selRng, contests);
      const { env } = castBallot(sim, i, sel);
      casts.push({ seq: sim.seq, voter: env.body.voter, code: H(ballotCode(p.ctx, env.body)), env });
      addCounts(expected, contests, sel);
    }
  });
  closeElection(sim);
  // Coordinator tally. Bench shortcut: the counted set is taken from the generator (every voter cast exactly once, all valid)
  // instead of re-deriving it with analyzeBallotLog, whose cost is ~ F x verifyEnvelope (measured separately). The verifier below
  // recomputes everything independently, so a wrong shortcut would show up as a FAIL.
  const coord = timeMs(() => {
    const countedSorted = [...casts].sort((a, b) => (a.voter < b.voter ? -1 : 1));
    const rng = streamRng(`bench/full-trustee/${shape}/${F}`);
    const shares = new Map<number, ShareSet>();
    for (const j of [1, 2, 3]) {
      const r = trusteeDecryptTally(p, trusteeKeyFor(sim, j), countedSorted, undefined, sim.rollHex.length, rng);
      if (!r.ok) throw new Error(`trustee ${j}: ${r.error}`);
      shares.set(j, r.value);
    }
    const spoiled: Parameters<typeof buildTally>[1]['spoiled'] = spoils.map((s) => {
      const rec: SpoilRecord = { seq: s.seq, code: H(ballotCode(p.ctx, s.env.body)), voter: s.env.body.voter, env: s.env };
      const sets = new Map<number, ShareSet>();
      for (const j of [1, 2, 3]) {
        const r = trusteeDecryptSpoiled(p, trusteeKeyFor(sim, j), rec, rng);
        if (!r.ok) throw new Error(`spoil trustee ${j}: ${r.error}`);
        sets.set(j, r.value);
      }
      return { rec, mode: 'trustees' as const, selections: s.sel, shares: sets };
    });
    const t = buildTally(p, { analysis: { counted: countedSorted }, shares, Y: sim.outcome!.Y, decrypters: new Set(sim.outcome!.Q), rollSize: sim.rollHex.length, spoiled });
    if (!t.ok) throw new Error(`tally: ${t.error} ${t.detail ?? ''}`);
    const c = sim.coord[0]!;
    push(sim, signRecord(c.secretKey, c.publicKey, p.ctx, t.value.body));
    return t.value.counts;
  });
  const coordCountsMatch = countsEqual(coord.value, expected);
  const text = JSON.stringify(bundleOf(sim));
  const vr: number[] = [];
  let verdict = '';
  let countedReported = -1;
  let tallyMatch = true;
  for (let k = 0; k < fullRuns; k++) {
    const r = await timeMsAsync(() => verifyElectionText(text));
    vr.push(r.ms);
    verdict = r.value.verdict;
    countedReported = r.value.counts.counted;
    if (r.value.verdict !== 'PASS') log(`  verifyElection findings: ${JSON.stringify(r.value.findings.filter((f) => f.cls === 'F').slice(0, 5))}`);
  }
  const tallyBody = (JSON.parse(text) as { log: { entry: { body: { contests: { id: string; options: { id: string; T: number }[] }[] } } }[] }).log.at(-1)!.entry.body;
  const published: CountsRecord = {};
  for (const c of tallyBody.contests) {
    published[c.id] = Object.fromEntries(c.options.map((op) => [op.id, op.T]));
    for (const op of c.options) tallyMatch &&= expected.get(c.id)?.get(op.id) === op.T;
  }
  const fr: FullRun = {
    ballots: F, spoilsTrustees: spoilers, bundleBytes: Buffer.byteLength(text), buildCastMs: build.ms, coordinatorTallyMs: coord.ms,
    verifyElection: stat(vr, false, `verifyElectionText on a real ${F}-ballot bundle (parse + full Appendix C verification)`),
    verdict, countsMatch: coordCountsMatch && tallyMatch, countedReported,
    counts: { expected: countsRecord(expected), coordinator: countsRecord(coord.value), published },
  };
  log(`full F=${F}: build(cast ${F}) ${(build.ms / 1000).toFixed(1)} s, coordinator tally ${(coord.ms / 1000).toFixed(1)} s, bundle ${(fr.bundleBytes / 1e6).toFixed(2)} MB, ` +
    `verifyElection ${(median(vr) / 1000).toFixed(1)} s (${((median(vr) / F)).toFixed(2)} ms/ballot) verdict=${verdict} counts=${fr.countsMatch}`);
  return fr;
}

async function benchEd25519(runs: number, COUNT: number): Promise<BenchResult['ed25519']> {
  const kp = ed25519Keypair(sha256(utf8('bench/ed25519')));
  const rng = streamRng('bench/ed25519/msgs');
  const msgs = Array.from({ length: COUNT }, () => rng.bytes(32));
  const sigs = msgs.map((m) => ed25519Sign(kp.secretKey, m));
  const v = perOp(runs, COUNT, (i) => {
    if (!ed25519Verify(kp.publicKey, sigs[i]!, msgs[i]!)) throw new Error('ed25519 verify');
  });
  const sp = perOp(runs, COUNT, (i) => ed25519IsStrictPoint(i % 2 === 0 ? kp.publicKey : sigs[i]!.subarray(0, 32)));
  const sg = perOp(runs, COUNT, (i) => ed25519Sign(kp.secretKey, msgs[i]!));
  const out: BenchResult['ed25519'] = {
    verifyMs: stat(v.runsPerOpMs, false, 'ed25519Verify: 2 strict point checks (canonical, not small order, torsion-free) + noble verify zip215:false'),
    strictPointMs: stat(sp.runsPerOpMs, false, 'ed25519IsStrictPoint (A and R alternately)'),
    signMs: stat(sg.runsPerOpMs),
  };
  // Reference: the pre-CP-04 policy (no torsion check), reconstructed with @noble/curves, which is the dependency of @quietvote/crypto
  // (it is resolved from the workspace root; nothing is added to protocol's package.json). Skipped if not resolvable.
  try {
    const { ed25519 } = await import('@noble/curves/ed25519.js');
    const strictNoTorsion = (b: Uint8Array): boolean => {
      try {
        const P = ed25519.Point.fromBytes(b, false);
        const re = P.toBytes();
        for (let i = 0; i < 32; i++) if (re[i] !== b[i]) return false;
        return !P.isSmallOrder();
      } catch {
        return false;
      }
    };
    const vnt = perOp(runs, COUNT, (i) => {
      const s = sigs[i]!;
      if (!(strictNoTorsion(kp.publicKey) && strictNoTorsion(s.subarray(0, 32)) && ed25519.verify(s, msgs[i]!, kp.publicKey, { zip215: false }))) throw new Error('ref verify');
    });
    const snt = perOp(runs, COUNT, (i) => strictNoTorsion(i % 2 === 0 ? kp.publicKey : sigs[i]!.subarray(0, 32)));
    const nv = perOp(runs, COUNT, (i) => ed25519.verify(sigs[i]!, msgs[i]!, kp.publicKey, { zip215: false }));
    out.reference = {
      verifyNoTorsionMs: stat(vnt.runsPerOpMs, false, 'reconstruction of the pre-CP-04 verify (same checks without isTorsionFree)'),
      strictNoTorsionMs: stat(snt.runsPerOpMs),
      nobleVerifyOnlyMs: stat(nv.runsPerOpMs, false, 'noble ed25519.verify zip215:false alone'),
    };
  } catch {
    // reference unavailable: report only the production path
  }
  return out;
}

function benchMicro(K: Point, ctx: Uint8Array, runs: number, COUNT: number, env: CastEnvelope, contests: ManifestContest[]): Record<string, Stat> {
  const rng = streamRng('bench/micro');
  const sc = Array.from({ length: COUNT }, () => scalarRandomNonZero(rng));
  const Kb = pointToBytes(K);
  const Kcopy = (): Point => pointFromBytes(Kb); // a fresh object: precompute caches are per point instance
  const Kplain = Kcopy();
  const Kpre = Kcopy().precompute(8, false);
  const A = pointFromBytes(Uint8Array.from(Buffer.from(env.body.contests[0]!.sel[0]!.a, 'hex')));
  const binder = binderFor(ctx, Uint8Array.from(Buffer.from(env.body.voter, 'hex')));
  const cid = contests[0]!.id;
  const oid = contests[0]!.options[0]!.id;
  const xi = rng.bytes(64);
  const r0 = sc[0]!;
  const ct = elgamalEncrypt(Kplain, 1, r0);
  const st = { ctx, binder, cid, oid, K: Kplain, ct };
  const pr = cdsProve(st, 1, r0, xi);
  const res: Record<string, Stat> = {};
  const add = (name: string, op: (i: number) => unknown, note?: string): void => {
    const r = perOp(runs, COUNT, op);
    res[name] = stat(r.runsPerOpMs, false, note);
  };
  add('baseMul (G, noble precomputed table)', (i) => baseMul(sc[i]!));
  add('pointMul K (constant-time, no precompute; production)', (i) => pointMul(Kplain, sc[i]!));
  add('K.multiplyUnsafe (variable-time, public scalars only)', (i) => Kplain.multiplyUnsafe(sc[i]!));
  add('K.multiply with precompute(8) (what-if)', (i) => Kpre.multiply(sc[i]!));
  add('pointMul A (fresh ciphertext point; production)', (i) => pointMul(A, sc[i]!));
  add('A.multiplyUnsafe (what-if)', (i) => A.multiplyUnsafe(sc[i]!));
  add('pointFromBytes (strict decode + re-encode)', () => pointFromBytes(Kb));
  add('pointToBytes', (i) => pointToBytes(i % 2 === 0 ? Kplain : A));
  add('elgamalEncrypt', (i) => elgamalEncrypt(Kplain, 1, sc[i]!));
  add('cdsProve (one ciphertext)', () => cdsProve(st, 1, r0, xi));
  add('cdsVerify (one ciphertext)', () => {
    if (!cdsVerify(st, pr)) throw new Error('cds');
  });
  return res;
}

// ------------------------------------------------------------------ CLI

export function parseArgs(argv: readonly string[]): BenchOptions {
  let n = 10_000;
  const kv = new Map<string, string>();
  for (const a of argv) {
    if (/^\d+$/.test(a)) n = Number(a);
    else if (a.startsWith('--')) {
      const [k, v = 'true'] = a.slice(2).split('=', 2) as [string, string?];
      kv.set(k, v);
    } else throw new Error(`unknown argument ${a}`);
  }
  if (kv.has('n')) n = Number(kv.get('n'));
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('N must be a positive integer');
  const o = defaultOptions(n);
  const num = (k: string, d: number): number => {
    const v = kv.get(k);
    if (v === undefined) return d;
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) throw new Error(`--${k} must be a non-negative number`);
    return x;
  };
  o.sample = num('sample', o.sample);
  o.runs = num('runs', o.runs);
  o.fullRuns = num('full-runs', o.fullRuns);
  o.fullBudgetS = num('full-budget-s', o.fullBudgetS);
  o.opCount = Math.max(1, num('ops', o.opCount));
  const shape = kv.get('shape') ?? 'referendum';
  if (shape !== 'referendum' && shape !== 'full' && shape !== 'smoke') throw new Error('--shape must be referendum, full or smoke');
  o.shape = shape;
  const pattern = kv.get('pattern') ?? 'seeded';
  if (pattern !== 'seeded' && pattern !== 'fixed') throw new Error('--pattern must be seeded or fixed');
  o.pattern = pattern;
  const full = kv.get('full') ?? 'auto';
  o.full = full === 'auto' || full === 'none' ? full : full.split(',').map(Number);
  if (Array.isArray(o.full) && o.full.some((x) => !Number.isSafeInteger(x) || x < 1)) throw new Error('--full sizes must be positive integers');
  if (kv.has('bsgs')) o.bsgs = kv.get('bsgs')!.split(',').map(Number);
  return o;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const jsonArg = args.find((a) => a.startsWith('--json='));
  const o = parseArgs(args.filter((a) => !a.startsWith('--json=')));
  const t0 = process.hrtime.bigint();
  const r = await runBench(o);
  console.log(`total bench wall time: ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1)} s`);
  if (jsonArg !== undefined) {
    writeFileSync(jsonArg.slice('--json='.length), `${JSON.stringify(r, null, 2)}\n`);
    console.log(`wrote ${jsonArg.slice('--json='.length)}`);
  }
  if (!r.countsMatch || r.bsgs.some((b) => !b.ok) || r.full.some((f) => f.verdict !== 'PASS' || !f.countsMatch)) {
    console.error('BENCH SELF-CHECK FAILED (wrong counts, BSGS result or verdict)');
    process.exitCode = 1;
  }
}
