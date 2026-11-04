# Performance baseline: tally, verification, Ed25519, suite time (2026-11-04)

This report closes the "Performance" item of `docs/audit/HANDOFF.md` §3.3 by measuring the system. It does not optimise anything. No
production code was changed. QuietVote is an unaudited prototype and must not be used for real elections. These numbers come
from an AI-assisted measurement on one shared machine; they are not an independent audit and not a capacity guarantee.

## 1. Machine and method

| | |
|---|---|
| CPU | Intel(R) Xeon(R) Processor @ 2.10GHz, `nproc` = 4 (shared cloud container), 15.7 GiB RAM |
| Node | v22.23.4, linux/x64 (runs `.ts` natively) |
| Code | commit `93c5821` plus this change (bench and smoke test only) |
| Noise | Other agents shared the host. The bench records `os.loadavg()` (1/5/15-minute) only at its start and end (`machine.loadavgStart`/`loadavgEnd` in the evidence files, §8); nothing is sampled in between. Main 10k run: 1-minute load **6.42 at start, 3.03 at end** (5-minute 8.54 → 4.21, 15-minute 6.96 → 5.89), so the load fell during the run. "Quiet" rerun: 1-minute **1.04 → 1.49**. `full`-shape run: 1-minute **2.53 → 1.34**. Both referendum runs are reported. Treat differences under about 25 % as noise. |

The tool is `packages/protocol/bench/tally-bench.ts` (`npm run bench` in `packages/protocol`). It is seeded throughout
(`streamRng`, fixed sim seeds) and uses no network. Ballots, bundles and decrypted counts are therefore identical between runs;
only the timings vary. It times with `process.hrtime.bigint()`. Wherever a phase is cheap enough it reports the median of 3 runs.
The workload is a 3-of-5 threshold election built with the protocol test sim (`test/helpers/sim.ts`: real DKG and real
ballots). `spoil_trustee_decrypt` is on, and the full bundles contain 2 trustee-mode spoils that the trustees decrypt. The bench
checks itself: decrypted counts must equal the plaintext choices, BSGS must return the bound, and the bundle verdict must be PASS.
All of these held in every run below.

Ballot shapes:
* `referendum` (default): one yes/no contest with `selection_limit` 1. That is 3 ciphertexts (2 options + 1 placeholder), 3 CDS
  proofs and 1 limit proof per ballot.
* `full`: the sim's four default contests (yes-no, single-choice, approval, 2-of-5). That is 18 ciphertexts and 3 limit proofs.

Commands run (from `packages/protocol`):

```
npm run bench -- 10000 --json=bench-10000.json                                       # main run: everything, full verifyElection at 1k and 10k (1-min load 6.42 -> 3.03)
npm run bench -- 10000 --full=none --json=bench-10000-quiet.json                     # quiet rerun of all sample/at-N phases (1-min load 1.04 -> 1.49)
npm run bench -- 10000 --shape=full --full=none --ops=50 --bsgs=10000 --json=bench-10000-full.json     # 18-ciphertext ballots (1-min load 2.53 -> 1.34)
node --test test/bench-smoke.test.ts                                                 # fixed N=12 smoke election (about 5.6 s)
```

The main run took 1052 s of wall time, the quiet rerun about 116 s (console observation; no log or JSON field records it) and the `full`-shape run 513 s. Within the main run the phases
run in order: the 200-ballot sample measurements (encryption, `verifyEnvelope`) come first, at the start-of-run load (1-minute
6.42); the full-bundle phase comes last and takes most of the wall time (1k bundle about 80 s, then the 10k bundle: 340 s
build, 39 s tally, 426 s verification), ending at a 1-minute load of 3.03. Comparisons inside the main run between a
sample-based extrapolation and a full-bundle measurement therefore compare an early, more loaded measurement with a later,
less loaded one; they are marked as such below.

The smoke test (`test/bench-smoke.test.ts`) runs the whole bench on a deterministic N=12 election (`--shape=smoke
--pattern=fixed`: a yes/no contest plus a 2-option approval contest, a fixed selection pattern in which ballot 0 selects
every option it may and one option is selected by all N ballots). It asserts that the decrypted counts at N, the coordinator
counts and the published tally of the full bundle all equal the known plaintext totals (yes 4, no 4, a 12, b 6), and that
`extrapolated: true` is set on exactly the two projected Stats. Two mutants of production code were applied temporarily
and reverted: dropping the first counted ballot in `aggregate()` (`counted.slice(1)`, `src/ballotlog.ts`) fails the
exact-count assertion, and `dlogTable(V - 1)` in `decryptAggregates` (`src/tally.ts`) fails with `E_DLOG_RANGE topics/a`.

## 2. Results at N = 10 000 (referendum shape)

"Measured" means the operation itself was timed at the stated size. "EXTRAPOLATED" means a per-ballot cost from the 200-ballot
sample multiplied by N.

| Phase | Quiet rerun (1-min load 1.0-1.5) | Main run (1-min load 6.4 at start, 3.0 at end) | Kind |
|---|---|---|---|
| Setup: DKG 3-of-5 + roll | 0.93 s | 1.03 s | measured |
| Ballot encryption + CDS/limit proofs + Ed25519 sign, per ballot | 26.1 ms (median 23.9, p95 38.6) | 31.5 ms (median 29.9, p95 45.5) | measured on 200 ballots |
| Same, total for 10 000 ballots | **260.7 s** | **315.1 s** | **EXTRAPOLATED** |
| Same, real 10 000-ballot bundle build (cast loop incl. log push) | – | 340.4 s | measured late in the run (+8 % over the extrapolation from the early, more loaded sample; also includes log push) |
| Ballot verification `verifyEnvelope`, per ballot | 40.3 ms = 24.8 ballots/s | 45.8 ms = 21.8 ballots/s | measured: median of 3 passes over 200 ballots |
| of which Ed25519 (2 strict-point checks + verify, incl. `ballotCode`) | 4.1 ms | 5.9 ms | measured |
| of which proofs/content (`verifyBallotContent`) | 30.7 ms | 39.6 ms | measured |
| Same, total for 10 000 ballots | **402.6 s** | **458.0 s** | **EXTRAPOLATED** |
| Homomorphic aggregation `aggregate()` (40 000 point decodes) | 8.40 s | 8.81 s | measured at N |
| `trusteeDecryptTally`, per trustee (includes its own re-aggregation) | 8.12 s | 10.94 s | measured at N, 3 trustees |
| `decryptAggregates` (verify 3x2 shares, Lagrange, BSGS table + solve) | 32.9 ms | 57.8 ms | measured at N |
| BSGS V = 10^4 (m = 101): table / solve(T = V) | 7.0 / 6.9 ms | 20.6 / 20.6 ms | measured |
| BSGS V = 10^6 (m = 1001): table / solve | 94 / 90 ms | 176 / 132 ms | measured |
| BSGS V = 10^8 (m = 10001): table / solve | 1.18 / 1.04 s | 1.50 / 1.43 s | measured |
| Coordinator tally for the 10k bundle (3 trustees + `buildTally` + 2 trustee-mode spoils) | – | 39.4 s | measured; see note |
| **Full `verifyElectionText`, 10 000-ballot bundle (20.5 MB)** | – | **426.3 s (42.6 ms/ballot), PASS** | **measured** (1 run) |
| Full `verifyElectionText`, 1 000-ballot bundle (2.1 MB) | – | 47.0 s (47.0 ms/ballot), PASS | measured (1 run) |

Notes:
* Full verification at 10k was feasible, so it was measured directly rather than scaled from 1k/2k. The bench's `--full=auto`
  estimate was 458 s, under the 600 s budget, so it also took a 1k point. Per-ballot cost is flat from 1k to 10k (47.0 vs
  42.6 ms). The 1k bundle was verified before the 10k bundle, while the load was falling, so the lower 10k figure is not
  evidence of an economy of scale; it is within the load noise. No superlinear path was observed. `verifyElection` time is
  essentially N × `verifyEnvelope`: 426 s measured against 458 s extrapolated in the same run, but the 458 s comes from the
  sample measured at the start (1-minute load 6.42) and the 426 s from the last phase of the run (1-minute load 3.03 at its
  end). The quiet rerun's extrapolation (402.6 s, 1-minute load 1.0-1.5) is the less loaded reference; it is a different run.
* The coordinator-tally phase takes its counted set straight from the generator instead of from `analyzeBallotLog`. Every voter
  cast once and every ballot is valid, so the sets are the same. A real coordinator would add roughly N × `verifyEnvelope`
  (about 400 s at 10k) for `analyzeBallotLog`. The verifier recomputes everything independently, so a wrong shortcut would have
  shown up as FAIL.
* Aggregation and trustee decryption at N use a synthetic counted set that cycles the 200 sample ballots' valid ciphertexts,
  with unique voter and code strings. The cost of decoding and adding points does not depend on which valid point is used. The
  decrypted counts were checked against the cycled plaintexts.

### 18-ciphertext ballots (`--shape=full`, 1-minute load 2.53 at start, 1.34 at end)

| Phase | Value | Kind |
|---|---|---|
| Encryption + proofs + sign, per ballot | 167.0 ms (median 157.9, p95 244.2) | measured on 200 |
| Same, 10 000 ballots | 1670 s (27.8 min) | **EXTRAPOLATED** |
| `verifyEnvelope`, per ballot | 201.1 ms = 5.0 ballots/s (Ed25519 5.2 ms, content 183.2 ms) | measured on 200 x 3 |
| Same, 10 000 ballots (≈ full `verifyElection`) | 2010 s (33.5 min) | **EXTRAPOLATED** (not run) |
| Aggregation (280 000 point decodes) | 51.3 s | measured at N |
| `trusteeDecryptTally`, per trustee | 53.0 s | measured at N |
| `decryptAggregates` (14 options) | 302 ms | measured at N |

## 3. Ed25519 verification cost after CP-04

| | Quiet rerun | Main run | `full`-shape run |
|---|---|---|---|
| `ed25519Verify` (production: 2 strict-point checks incl. torsion + noble `zip215:false`) | **3.13 ms** | 3.91 ms | 4.03 ms |
| Reconstructed pre-CP-04 verify (same checks, without `isTorsionFree`) | **1.60 ms** | 2.80 ms | 1.85 ms |
| `ed25519IsStrictPoint` (production, with torsion check) | 1.01 ms | 1.59 ms | 0.99 ms |
| Strict-point check without torsion | 0.10 ms | 0.16 ms | 0.14 ms |
| noble `ed25519.verify` alone | 1.32 ms | 2.08 ms | 1.84 ms |
| `ed25519Sign` | 0.82 ms | 0.81 ms | 0.58 ms |

The reference row is rebuilt from `@noble/curves` (the dependency of `@quietvote/crypto`), with nothing added to protocol's
`package.json`. It is a reconstruction, not the old commit. In the quiet run the ratio is 1.96x (1.60 → 3.13 ms). That matches
the 2.0x in `docs/audit/HANDOFF.md` §1.4 (2.76 → 5.53 ms), though this machine is faster in absolute terms. Per ballot, `verifyEnvelope` runs
three strict-point checks: the voter key explicitly, then the key and R again inside `ed25519Verify`. The torsion check
therefore adds about 3 × 0.9 ≈ 2.7 ms to a 40 ms referendum ballot (about 7 %). That is a modelled split, not a separate measurement.

## 4. ristretto255 micro costs (evidence for the recommendation)

Quiet rerun, median per operation (200 ops × 3 runs). The "what-if" rows run on copies of K or A; production objects are not
modified.

| Operation | ms |
|---|---|
| `baseMul` (G, noble's base table) | 0.386 |
| `pointMul(K, s)`: production, constant-time, no precomputation | **1.282** |
| `K.multiply` after `K.precompute(8)` (what-if, still constant-time) | **0.244** (5.3x faster; 7.4x in the loaded run) |
| `K.multiplyUnsafe` (what-if, variable-time) | 1.205 |
| `pointMul(A, s)`: production, fresh ciphertext point | 1.474 |
| `A.multiplyUnsafe` (what-if, variable-time, public data only) | 0.920 |
| `pointFromBytes` (strict decode + canonical re-encode) | 0.163 |
| `pointToBytes` | 0.082 |
| `elgamalEncrypt` | 1.690 |
| `cdsProve` (one ciphertext) | 6.167 |
| `cdsVerify` (one ciphertext) | 8.547 |

Per CDS verification there are 8 scalar multiplications: 2 by G, 2 by K, and 4 by the ciphertext points (`commit` =
`[s]X - [c]Y`). Each ciphertext costs 3 multiplications by K to produce: `elgamalEncrypt`, and `cdsProve` (real branch plus
simulated branch). The limit proof adds 1 more multiplication by K, both when proving and when verifying.

## 5. Total test-suite time

Each workspace was run separately and in order, as `docs/audit/HANDOFF.md` §2 step 3 recommends:
`(cd packages/$p && node --test "test/**/*.test.ts")`. Load was 1.4 to 4.7 (not recorded in the evidence files of §8).

| Workspace | Tests | Wall time |
|---|---|---|
| board | 74 | 46.7 s |
| cli | 47 | 75.6 s |
| crypto | 58 | 3.8 s |
| protocol | 199 (includes the bench smoke, then 5.7 s at N=20; the reworked N=12 fixed smoke takes about 5.6 s; `e2e.test.ts` 26.9 s) | 88.4 s |
| server | 140 | 55.8 s |
| trustee | 83 | 93.6 s |
| verifier | 25 | 24.4 s |
| web | 189 | 29.8 s |
| **Total (sequential)** | **815, all pass, 0 skipped/todo** | **418 s ≈ 7.0 min** |

## 6. Top bottleneck

**Per-ballot proof verification dominates everything that scales with N.** Ballot verification is about 100 % of
`verifyElection` at 10k (426 s measured late in the main run against 403 s (quiet rerun) to 458 s (early main-run sample) of
extrapolated `verifyEnvelope`; see the load caveat in §1). Within one ballot, the CDS and limit proofs are
76 % (30.7 of 40.3 ms) and Ed25519 is 10 %. Ballot proving on the voter side is the second-largest cost: 26 ms per referendum
ballot and 167 ms per 18-ciphertext ballot in Node. The spec's browser estimate of "tens of ms per ciphertext" (QV-16 §12) is
consistent with this. Both costs are scalar multiplications. The tally itself is cheap. Aggregation is about 8 s at 10k (2 % of
verification) and costs about 0.2 ms per point decode. BSGS is negligible: 14 ms for table plus solve at V = 10^4, and about
2.2 s even at V = 10^8. This confirms QV-16 §5.18's claim that BSGS is "negligible".

## 7. Recommended optimisation (not implemented)

**Precompute a fixed-base window table for the joint election key K once per election.** For example, call
`K.precompute(8, false)` on the point stored in `ElectionParams`, so that every `pointMul(K, ·)` uses it. Evidence: a
multiplication by K drops from 1.28 ms to 0.24 ms (measured, 5.3x). K is the same point for every ciphertext of every ballot. It
is multiplied 7 times per referendum-ballot verification and 10 times per referendum-ballot encryption (§4). Estimated savings
below are a model, not a measurement:

* verification: 7 × 1.04 ms ≈ 7.3 ms of 40.3 ms per ballot, **about 18 %** (about 73 s off the 10k `verifyElection`);
* encryption: 10 × 1.04 ms ≈ 10.4 ms of 26.1 ms per ballot, **about 40 %** of voter-side proving (in a browser this is the
  voter-visible latency).

The precomputed path is still noble's constant-time `multiply`, so it is also safe for the secret nonces used in proving. The
only change is a per-point cache (about 4 k points for W = 8). The one-time table build was not measured here and should be
measured before adoption. The same idea applies to G: `baseMul` is 0.386 ms against 0.244 ms for the W=8 K table. Frozen vectors
cannot change, because results are bit-identical.

Follow-ups, smaller or needing a review decision:
1. Verification-only variable-time multiplication (`multiplyUnsafe`) on public ciphertext points: 1.47 → 0.92 ms, 4 times per
   CDS. That is about 2.2 ms per CDS, or about 17 % per referendum ballot (modelled). A double-scalar `[s]X - [c]Y` (Straus) was
   not measured. It must never be used on prover-side secrets.
2. Cache torsion-freeness per Ed25519 public key, as `docs/audit/HANDOFF.md` §1.4 suggests. This saves about 2 of the 3 torsion checks per
   envelope, roughly 1.8 ms or 4-5 % per ballot (modelled).
3. Aggregation and trustee re-aggregation are bound by point decoding. About half of `pointFromBytes` is the defensive canonical
   re-encode (0.082 of 0.163 ms). The crypto-protocol audit judged that check redundant with noble's strict decode (mutant M1,
   "equivalent"). Removing it is a security review decision, not a performance fix, and this report does not recommend it.
4. Verification is embarrassingly parallel per ballot, and the measurements above use one core. Worker threads across the
   available 4 cores would likely give near-linear speedup. That was not measured.

## 8. Evidence files

The raw bench output for the three 10k runs is committed next to this report, unmodified:

| File | Run | sha256 |
|---|---|---|
| `docs/reports/perf-2026-11-04/bench-10000.json` | main run (referendum, full verifyElection at 1k and 10k) | `d39c41cab0232af7b3c2faef9be86f1f394ecd67c655cc3554ab8602088f3715` |
| `docs/reports/perf-2026-11-04/bench-10000-quiet.json` | quiet rerun (referendum, `--full=none`) | `e11b4969ba8328422f41a2e9211c7a56edc47eeabe14a37351c1d1b89f99f06e` |
| `docs/reports/perf-2026-11-04/bench-10000-full.json` | 18-ciphertext ballots (`--shape=full --full=none --ops=50 --bsgs=10000`) | `2d91fc803a83ec4528923880ec940307278a8c180d1155b9a60f75bacc12ba18` |

They hold only machine information (CPU model, core count, Node version, memory, load averages), the run configuration and
timings. They contain no keys, seeds, ballots or file paths; the bench's seeds are fixed strings in its source. They were
written by the bench revision before the `projectedN` Stats and the `pattern`/`counts` fields were added: in them the
N-projections are the bare numbers `encrypt.projectedNMs` and `verify.projectedNMs` (the values labelled EXTRAPOLATED in §2),
and every Stat object they contain is a direct measurement, so all of them correctly carry `extrapolated: false`. The current
bench additionally emits `encrypt.projectedN` and `verify.projectedN` with `extrapolated: true`. The 10k runs were not repeated.

Unaudited prototype; not for real elections. AI-assisted measurement, not an independent audit.
