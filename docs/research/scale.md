# QuietVote scale research: from 10 voters on a Raspberry Pi to millions

**Status:** Research note (not normative). **Date:** 2026-10-21.
**Scope:** one codebase, one wire format, one verifier, three operating profiles.
**Constraints honoured:** no repository writes except this file; no edits under `packages/**`; proposals are fenced TypeScript/SQL snippets only.
**Reproduction:** all measurements come from scratch scripts in `/tmp/claude-0/-home-user-quietvote/293bec81-7b47-5f66-979a-4451005dca44/scratchpad/bench/` that import the repo packages read-only (`prim.mjs`, `ballots.mjs`, `verifyprof.mjs`, `merkle.mjs`, `sqlite.mjs`, `misc.mjs`, `bundle.mjs`, `gz.mjs`, `unsafe.mjs`, `precomp.mjs`, `msm2.mjs`, `decode.mjs`).

---

## 0. Summary

**Measurement host:** Intel Xeon @ 2.80 GHz, 4 vCPU, 16 GB RAM, ext4 on virtio disk, Node v22.22.0, `@noble/curves` 2.4.0 (as installed in `node_modules`). Single-threaded numbers unless stated. **No Raspberry Pi was measured**; Pi numbers below are assumptions and are labelled as such.

Top bottlenecks, ranked by impact at scale:

1. **Ballot zero-knowledge verification on the ingest path, serialized per election.** About 280 ms per ballot on the default four-contest manifest (14 selections). `election.ts` runs `verifyEnvelope` inside `this.mutex` (`processLocked`). Ingest ceiling is about 3.6 ballots/s per election, regardless of core count. At 500k ballots that is about 39 core-hours in a single serial lane.
2. **Verifier and tally are O(N) with a large constant, and memory is O(N x ballot size).** Verify and analyze cost about 265 ms per ballot. `ensureAnalysis` loads every ballot body into memory, and `analyzeBallotLog` keeps all cast envelopes in `casts`. Parsed envelopes cost about 12 KB of heap each.
3. **Monolithic bundles hit hard limits.** Node's maximum string length is 536,870,888 characters (about 512 MiB). The verifier caps input at 64 MiB (`MAX_BUNDLE_BYTES`). The server caps the log at 4 GiB (compiled hard bound on `maxLogBytes`). Measured bundle size is about 9.4 KB per ballot. Effective caps: about 7,100 ballots under the verifier cap (protocol member only), about 425,000 ballots under the 4 GiB log cap, and about 57,000 ballots for a single JSON string.
4. **Duplicated decoding.** Each ballot's points are decoded once in `verifyBallotContent` and again in `aggregate`. Aggregation costs about 8.7 ms per ballot, of which about 7 ms is 28 point decodes at about 254 µs each. The repo's `pointFromBytes` also re-encodes every decoded point as a defence-in-depth check, which is about half the decode cost.
5. **The board Merkle tree is in-memory and linear in the wrong places.** `inclusionProofByLeaf` scans every leaf: 20 ms at 10^4 leaves and 66 ms at 10^5, so about 0.7 s at 10^6 (linear extrapolation). `BoardLog` rebuilds the whole tree and grammar at startup.
6. **Not bottlenecks (measured):** SQLite append throughput (2,080/s per commit under `synchronous=FULL`, 11,761/s batched 100), BSGS discrete log (table of 1,001 entries at V = 10^6), checkpoint signing (1.1 ms per checkpoint, so only per-append signing is a problem), witness cosigning (about 3.6 ms per cosign).

**Recommendation in one line:** keep SQLite, the single-sequencer model and the wire format; move ballot proof verification out of the per-election lock into a worker pool; make verification and tally streaming with incremental aggregation; serve Merkle tiles and bundles as static, chunked objects; select the profile by config.

---

## 1. Measurements

### 1.1 Ristretto255 primitives (noble-curves 2.4.0, measured)

| Operation | Time per op | Notes |
|---|---|---|
| `baseMul` via `pointMul(G, k)` (`multiply`, constant-time) | 451 to 624 µs | includes scalar generation in one run |
| variable-base `multiply` (constant-time) | 1.42 to 1.8 ms | `fixedWindowCT` / `wnafCachedCT` in profile |
| variable-base `multiplyUnsafe` (variable-time) | 1.26 ms | about 30% faster; public inputs only |
| base-point `multiplyUnsafe` | 198 µs | about 2.3x faster than constant-time base mul |
| variable-base after `precompute(6, false)` | 260 µs | about 5.5x faster; per fixed point, e.g. joint key `K` |
| `pointFromBytes` (noble decode only) | 159 µs | RFC 9496 decode; rejects non-canonical input (checked) |
| `toBytes` (encode) | 124 to 128 µs | |
| repo `pointFromBytes` (decode + re-encode check) | about 254 µs | `packages/crypto/src/ristretto.ts` |
| `pointAdd` | 8 µs | |
| 2-point interleaved MSM (`interleavedMSMUnsafe`) | no gain | measured 1.3 to 1.9 ms vs 1.28 ms naive; not recommended |
| `ed25519Sign` / `ed25519Verify` | 1.1 ms / 2.5 ms | checkpoint and witness costs |
| `sha256` of 65 bytes | 4.9 µs | |

Profile of `verifyBallotContent` (CPU profile, 12 ballots): about 80% of self-time is BigInt field arithmetic in `abstract/modular.js`. Constant-time paths are visible in the profile (`fixedWindowCT`, `wnafCachedCT`). The signature check is a minor share.

### 1.2 Discrete log (BSGS), `dlogTable` / `dlogSolve`

| V (max count) | m = ceil(sqrt(V+1)) | Table build | Solve, worst T | Heap (estimate) |
|---|---|---|---|---|
| 10 | 4 | 2 ms | 0.9 ms | negligible |
| 10^3 | 32 | 12 ms | 4 ms | negligible |
| 10^4 | 101 | 12 ms | 16 ms | < 1 MB |
| 10^5 | 317 | 40 ms | 53 ms | < 1 MB |
| 10^6 | 1,001 | 132 ms | 116 ms | about 0.2 MB (estimate) |

Per-step cost is dominated by the giant-step point encode (about 128 µs), not the table. `dlogTable` is rebuilt on every `decryptAggregates` call (`packages/protocol/src/tally.ts` calls `dlogTable(V)` directly). The code refuses bounds above 2^40. Caveat: Phase 2 weighting multiplies the bound. BSGS is not a scale bottleneck at the crypto suite v1 limits (section 3.4).

### 1.3 Ballot pipeline (protocol simulator, default manifest: 4 contests, 14 selections, 18 CDS/limit statements, 3 trustees, threshold 2)

Measured with `packages/protocol/test/helpers/sim.ts` (test helper, read-only use):

| Stage | Measured | Scaling |
|---|---|---|
| Client-side ballot build (`castBallot`, includes encryption and proofs) | 210 ms avg per ballot | O(selections); client cost, not server |
| `verifyEnvelope` (schema + signature + content), server ingest | 278 to 291 ms per ballot | O(selections) |
| `verifyBallotContent` alone | 278 ms per ballot | |
| `analyzeBallotLog` (40 ballots) | 10,587 ms total, 265 ms per ballot | includes one `verifyEnvelope` per ballot |
| `aggregate` (40 ballots) | 349 ms total, about 8.7 ms per ballot | 2 decodes per selection per ballot |
| `trusteeDecryptTally` (per trustee, 40 ballots) | 411 ms | recomputes aggregates, as QV-16 §5.16 requires |
| `decryptAggregates` (2 trustees, 40 ballots) | 435 ms | includes BSGS |
| Envelope JSON, average | 8,985 bytes | |
| Parsed heap per envelope (V8) | about 12 KB | about 1.3x JSON |
| RSS for the 40-ballot run | 132 MB | includes Node baseline and simulator |

Not measured: a 2-selection manifest. Scaling is roughly linear in proof statements (estimate: a yes/no contest with one placeholder is 3 statements against 18 on the default manifest, so about 1/6 of the cost). Treat this as an estimate.

### 1.4 Board Merkle tree (`packages/board/src/merkle.ts`, `log.ts`)

| Operation | 10^4 leaves | 10^5 leaves | 10^6 leaves (extrapolated) |
|---|---|---|---|
| append (`appendLeafHash`) | 2.1 µs / leaf | 0.6 µs / leaf | constant |
| root, cold memo | 71 ms | 737 ms | about 7 to 8 s, once |
| root, warm | 29 µs | 35 µs | |
| root after 1 append | 21 µs | 24 µs | incremental through memo |
| inclusion proof | 53 µs | 97 µs | O(log n) after warm-up |
| inclusion proof verify (`verifyInclusion`) | ok | ok | |
| `inclusionProofByLeaf` (linear scan) | 20 ms | 66 ms | about 0.7 s, linear |
| checkpoint sign (`signCheckpoint`) | 1.3 to 1.8 ms | 1.3 ms | |

Memory (estimate, not measured): the in-memory tree holds one 32-byte leaf per entry plus a memo `Map` keyed by `"a:n"` strings. Roughly 200 MB at 10^6 leaves. The memo is unbounded.

### 1.5 SQLite (`node:sqlite`, WAL, ext4, measured)

| Mode | Throughput | Notes |
|---|---|---|
| one `BEGIN IMMEDIATE`/`COMMIT` per append, `synchronous=FULL` | 2,080/s (481 µs) | fsync-bound |
| one tx per append, `synchronous=NORMAL` | 6,686/s (150 µs) | |
| batch of 100 per tx, `synchronous=FULL` | 11,761/s (85 µs) | |
| batch of 100, `synchronous=NORMAL` | 10,450/s (96 µs) | |
| range read, 20,000 leaf hashes | 107 ms | |
| indexed lookup by `leaf_hash` (UNIQUE) | 3.2 µs | |
| DB size, 20,000 rows, 1,000-byte bodies | 46.6 MB | about 2.3 KB per row including headers and indexes |

Node emits `ExperimentalWarning: SQLite is an experimental feature` at runtime. The Node docs currently state stability 1.2 (release candidate) (fetched, see section 8). The repo spec states stability 1.1 for v22. The v22 page was not fetched, so the 1.1 claim is unverified.

### 1.6 Bundles and compression

| Quantity | Value |
|---|---|
| protocol `ElectionBundle` JSON per ballot (40-ballot run) | 9,394 bytes |
| `gzip -9` ratio of a protocol bundle | 0.48 (40 ballots; hex-heavy JSON, sample is small) |
| board member, if bodies are duplicated base64url (estimate) | about 12,100 bytes per ballot |

The board-member estimate assumes the `board` member duplicates each ballot body, based on `packages/verifier/NOTES.md` item 9 (`bundle carries board member`). This is an estimate from the code path, not a measured bundle. Confirm before relying on it.

### 1.7 Witness, checkpoint, and fan-out costs (derived)

- **Checkpoint cadence.** Per-append signing costs about 1.1 to 1.8 ms per entry. At 10^6 entries that is 18 to 30 CPU-minutes. Signing every 64 entries (spec target) is about 15,600 signatures, roughly 20 to 30 CPU-seconds over the whole election.
- **Witness cosign.** A witness verifies the log signature (2.5 ms), a consistency proof (about 20 hashes at 10^6), and signs (1.1 ms). About 3.6 ms per cosign per witness. At one checkpoint per second, one witness uses about 0.4% of a core.
- **SSE fan-out (estimate).** Each client holds a cursor and queries `event` by `event_id`. Using the 3.2 µs indexed lookup as a proxy, 1,024 clients at 10 events/s is about 10,000 queries/s, about 3% of a core. The event query itself was not measured.
- **Rate-limit state.** `packages/server/src/ratelimit.ts` keeps buckets in memory. At 10^6 distinct author keys, about 200 MB (estimate).

---

## 2. Bottleneck analysis (per concern)

### 2.1 Ballot ingest and verify throughput
- **Cost:** 278 to 291 ms per ballot (default manifest). Throughput ceiling per election is 1 / 0.28 s = 3.6 ballots/s on one core.
- **Serialization:** `processLocked` runs `verifyEnvelope` inside `this.mutex` (`packages/server/src/election.ts`, around line 1029). Adding cores does not help. `maxVerifyQueue` defaults to 10,000 (`packages/server/src/config.ts`, line 168). A request queued behind 10,000 proofs would wait about 47 minutes, so the 503 `BUSY` backstop is effectively never reached in time.
- **Fix:** the proof check does not depend on server state. Run it in a worker pool before taking the lock, then re-check state (supersedes, duplicate code, revote limit) under the lock. This turns the lock into a cheap sequencing step. Expected gain: near-linear in cores until the sequencer lock dominates (about 0.1 ms per state check, estimate).

### 2.2 Merkle append and proof cost
- Appends are cheap. Warm root and proofs are microseconds. Cold root is the cost (737 ms at 10^5), paid once at startup via `BoardLog` reload.
- `inclusionProofByLeaf` is O(n). The SQLite store already has `UNIQUE(leaf_hash)` and `seqByLeaf` (`packages/server/src/electiondb.ts`), so the server should not use the in-memory scan.
- Startup reload is O(n) with per-entry header decode and grammar replay. At 10^6 entries this will be seconds to minutes (estimate).

### 2.3 Checkpoint cadence
- Keep the spec cadence (every 64th size, phase boundaries, and every witnessed size). Per-append checkpoints are rejected: 18 to 30 CPU-minutes per million entries plus one witness round trip per entry.

### 2.4 Witness cosign load
- Negligible CPU (section 1.7). Network and availability matter more than CPU. Witness requests should be batched per checkpoint, not per entry.

### 2.5 Tally aggregation O(ballots x options)
- `aggregate` costs about 8.7 ms per ballot, from 2 point decodes per selection (each about 254 µs) plus point sums. At 10^6 counted ballots: about 2.4 core-hours, single-threaded.
- Aggregation is associative, so it shards cleanly. The coordinator can also aggregate incrementally: on each admissible cast that replaces voter v's previous counted ballot `prev`, do `agg = agg + new - prev`. This keeps memory at O(options) and removes the second decode if points are carried from verification.
- Trustees must recompute aggregates (`trusteeDecryptTally` does), so each trustee pays the same cost (about 2.4 core-hours at 10^6). Trustees run in parallel, so this is a per-trustee wall-clock budget, not a shared one.

### 2.6 BSGS table size vs max count
- Table size is m = ceil(sqrt(V+1)). At the crypto suite v1 cap (section 3.4), m is about 1,025. The table is never the bottleneck. Solve cost is per option and per giant step (about 128 µs each, dominated by encoding). A cache keyed by V avoids rebuilding the table per tally.

### 2.7 Verifier memory and time for N ballots
- Time: about 265 ms per ballot for analyze, plus about 8.7 ms for aggregate. Single-core at 10^6 ballots: about 73 core-hours for analyze. Verification is embarrassingly parallel per ballot and per voter shard.
- Memory: `loadBundle` parses the whole text (JSON text plus about 1.3x parsed). `analyzeBallotLog` keeps `casts` (every cast envelope) and `counted` (one envelope per voter). At 10^5 ballots this is about 1.2 to 2.2 GB of V8 heap (estimate from 12 KB per parsed envelope). At 10^6 it is not feasible in one process.
- The verifier enforces `MAX_BUNDLE_BYTES = 64 MiB` (`packages/verifier/src/bundle.ts`, line 6), which caps a bundle at about 7,100 protocol-only ballots, or about 3,100 if the board member duplicates bodies (section 1.6).

### 2.8 Bundle export size
- About 9.4 KB per ballot raw, about 4.5 KB gzipped (ratio 0.48, small sample). 10^6 ballots: about 9.4 GB raw, about 4.5 GB gzipped, before any board duplication.
- A monolithic bundle string fails above about 57,000 ballots (512 MiB). `bundleToJson` builds one object in memory (`packages/board/src/bundle.ts`, line 338), so export at scale must stream.

### 2.9 SSE fan-out
- Per-client cursor is fine at small scale (section 1.7). At large scale, the right design is one broadcaster per election that reads the outbox once per event and pushes to all clients, or no SSE at all: clients poll static checkpoint tiles (see 2.10).
- `maxSseTotal` defaults to 1,024 and is bounded to 10,000 (`config.ts` line 232).

### 2.10 CDN-served tiles and the static read path
- C2SP tlog-tiles (fetched): full tile height 8, 256 hashes per full tile (8,192 bytes), tile path `<prefix>/tile/<L>/<N>`, partial tiles `.p/<W>` with width 1 to 255 that must not be hashed into the level above.
- Hash-tile sizing at 10^6 leaves: 1,000,000 / 256 = 3,906 full level-0 tiles, about 32 MB total with higher levels (about 1/255 extra).
- Entry (data) tiles: UNVERIFIED layout details; if they hold 256 entries at 9.4 KB each, about 2.4 MB per tile and about 9.4 GB total at 10^6 ballots. This is the same data as the bundle; do not store it twice.
- Tessera (fetched) serves tlog-tiles from GCP or AWS object storage, or from a POSIX directory served by any HTTP server. Its README does not mention a CDN explicitly; that is inference.

### 2.11 Database choice: SQLite vs Postgres
- SQLite is not the bottleneck at any size measured (section 1.5). The single-sequencer model (QV-18 section 20) means one writer per election regardless of engine. Postgres would add a network hop and a second process to every append and buys nothing for throughput within one election.
- Postgres becomes relevant only for multi-host HA of the control plane and for a shared read replica, which the spec currently handles by mirrors. Keep SQLite and the `Store` port (QV-28 REQ-018). Revisit only if the control DB needs multi-writer access.

### 2.12 Sharding, batching, tiles, streaming verification
- **Sharding by election:** already the model (one file per election, QV-28 section 7). Horizontal scale is across elections, not within one.
- **Sharding within one election (verifier only):** shard the counted set by voter-key hash. Each voter's supersedes chain lives in one shard, so per-voter admissibility is local. Cross-shard checks are the global duplicate-code set (32 bytes per ballot, about 32 MB at 10^6) and the spoiled-code set. Partial aggregates merge by point addition.
- **Batching:** batch appends per transaction (11,761/s vs 2,080/s). Batch checkpoint signing and witness submission per checkpoint.
- **Streaming verification:** feed entries in log order, keep O(voters) state (32-byte keys), emit findings as they occur. The current `analyzeBallotLog(p, roll, entries, ...)` takes an array; the streaming form is in the snippets below.

### 2.13 Rate limiting
- Defaults (`config.ts` lines 145 to 155): reads 120/min per bucket, proofs 600/min, author writes 10/min burst 5, ballots 6/hour per voter (spec section 10).
- At scale, the IP-hash bucket is shared by everyone behind a NAT. A school or carrier NAT of 10,000 voters shares one 120/min read bucket. Read rate limiting belongs at the CDN for tile reads, with per-author limits kept at the origin.

---

## 3. Limits that exist in the code and spec today

### 3.1 Compiled hard bounds (`packages/server/src/config.ts`)
- `maxLogBytes`: default 1 GiB, hard bound 4 GiB (line 223). At 9.4 KB per ballot the 4 GiB ceiling is about 425,000 ballots. A million-voter profile requires raising the compiled bound (QV-29 REQ-002). Flag for owner.
- `maxVerifyQueue`: default 10,000 (line 168), no compiled bound shown in the excerpt read.
- `maxSseTotal`: default 1,024, bound 10,000 (line 232).

### 3.2 Verifier input cap
- `MAX_BUNDLE_BYTES = 64 MiB` (`packages/verifier/src/bundle.ts`, line 6). Blocks any bundle beyond about 7,100 ballots.

### 3.3 Node string limit
- `buffer.constants.MAX_STRING_LENGTH` = 536,870,888 characters (measured). Any monolithic JSON text beyond that fails.

### 3.4 Crypto suite v1 caps: an internal inconsistency to resolve
- `docs/16-crypto-protocol.md` line 776 says `T_o ≤ V ≤ N_roll ≤ 2^31` in suite v1.
- The same document, line 851, says `roll ≤ 2^20 (v1)`.
- The "huge" tier in this note (millions of voters) requires `N_roll` above 2^20. That is a suite-level decision, because the cap is part of the protocol's DoS and verifier-memory argument. **Owner decision needed.**

### 3.5 Spec targets
- `docs/18` section 20: at least 50 appends/s sustained, at most 100k entries per election, "ballot verification dominates CPU". Measurement confirms the last point. The 100k figure is about 7.8 hours of single-lane ingest at 3.6/s, so it is achievable only with the verify pool.

### 3.6 Spec versus docs
- `docs/28` section 9 and section 24 state `node:sqlite` Stability 1.1 and cite v22. The current Node docs (fetched) state 1.2 (release candidate). Confirm the v22 docs before relying on the 1.1 statement. UNVERIFIED for v22.

---

## 4. Tiering design

Same wire format (QV-16 proto `qv1-r255-sha2`, QV-18 `qv-bundle/v1`, QV-28 schema v1). Same verifier code path. Only internals and configuration change. Selected by `profile: 'small' | 'medium' | 'large'` in server config. A bundle produced by any profile verifies under any verifier profile.

| Dimension | small | medium | large |
|---|---|---|---|
| Target | up to 10^3 ballots; one Pi-class host | 10^3 to 10^5 ballots; one 4 to 8 core host | 10^5 to 2^20 roll (suite v1 cap); multi-core host plus CDN |
| Verify execution | inline, under mutex | worker pool (N = cores - 1) outside mutex | worker pool (N = cores) outside mutex; shard-capable |
| Proof verify math | constant-time (unchanged) | constant-time; K precomputed | variable-time for public verification (decision); K precomputed |
| Aggregation | batch at tally | incremental, decodes carried | incremental, sharded partials |
| Merkle | SQLite `merkle_node` (QV-28 design); in-memory memo bounded | SQLite-backed; `seqByLeaf` index | SQLite-backed; tiles exported to static store |
| Checkpoint cadence | every 64 entries plus phases | every 64 | every 64 (witnesses batched) |
| Bundle | single `.qvb` tar, streamed | streamed tar | chunked tar, one tile set |
| Verifier | in-memory bundle OK | streaming analyzer | streaming analyzer, sharded runner |
| SSE | per-client cursor, `maxSseTotal` 64 | per-client cursor, 1,024 | broadcaster or off; clients poll tiles |
| Rate limits | as default | as default | read limits at CDN; author limits at origin |
| Log cap | 256 MiB | 1 GiB (default) | raise compiled bound to 16 GiB (decision) |
| Queue | `maxVerifyQueue` 50 | 2,000 | 10,000 |

### 4.1 Expected capacity per profile (computed from measured numbers; not measured end-to-end)

| Profile | Host | Ingest ceiling | Tally (aggregate) | Analyze (verifier) | Bundle (raw) |
|---|---|---|---|---|---|
| small | Pi-class, assumed 5x slower than this Xeon (UNVERIFIED) | about 0.7 ballots/s; 1,000 ballots in about 24 min | about 45 s (1,000 x 8.7 ms x 5) | about 22 min (1,000 x 0.265 s x 5) | about 9.4 MB |
| medium | 4 vCPU Xeon-class | about 14 ballots/s with 4 workers (before optimizations); 10^5 ballots in about 2 h | about 15 min at 10^5 (single-thread) | about 7.4 h single-core; parallel across shards | about 940 MB |
| large | 16 vCPU, one election | about 57 ballots/s with 16 workers and no other changes; 10^6 in about 5 h ingest; with optimizations (est. 2x to 3x) about 2 h | about 2.4 core-h, parallel over shards | about 73 core-h, sharded | about 9.4 GB raw, about 4.5 GB gzip |

Figures are estimates from measured per-operation costs and assume linear scaling across workers. End-to-end benchmarks (section 6) are needed before publishing any of them.

### 4.2 Large-profile sizing at 10^6 ballots (30% to 50% turnout, so 3x10^5 to 5x10^5 ballots)
- Ingest CPU at 3x10^5 ballots: 23 core-hours. At 5x10^5: 39 core-hours. Must be parallelised.
- Log bytes: about 9.4 GB protocol plus headers (about 0.2 GB), on disk per election DB about 9.6 to 10 GB.
- Merkle hash tiles: about 32 MB static.
- Memory for the in-memory board tree at 10^6: about 200 MB (estimate); remove once SQLite-backed.
- Witness load: about 15,600 checkpoints across the election; negligible CPU.
- SSE at 1,024 clients, 10 events/s: about 3% of a core (estimate).
- Rate-limit state: about 200 MB (estimate); move to a bounded LRU.

---

## 5. Proposed code changes (fenced snippets; nothing applied)

Each change lists the package. Snippets are proposals; none are present in the repo.

### 5.1 `packages/crypto/src/ristretto.ts`: public-input multiply and precomputation

```ts
// Verification only: scalars and points are public. Never call on secret scalars
// (decProve, cdsProve nonces, DKG shares). Measured ~30% faster for variable-base,
// ~2.3x for base point (section 1.1).
export function pointMulPublic(p: Point, k: Scalar): Point {
  const s = scalarMod(k);
  if (s === 0n) return IDENTITY;
  return p.multiplyUnsafe(s);
}

// Election-wide fixed point (joint key K): precompute once, reuse in every CDS check.
// Measured 260 us vs 1.42 ms for a variable-base multiply (section 1.1).
export function precomputeFixed(p: Point): Point {
  p.precompute(6, false);
  return p;
}
```

Owner decision: whether verifier code may use variable-time multiplication. The threat model (docs/16 section 5 security claims) must be checked before use. The prover paths keep `multiply`.

### 5.2 `packages/crypto/src/proofs.ts`: verifier uses public multiply

```ts
// commit() is used by cdsVerify, limitVerify, decVerify (public inputs only).
// Prover functions keep the constant-time commit().
function commitPublic(B1: Point, X1: Point, c: Scalar, s: Scalar): Point {
  return pointSub(pointMulPublic(B1, s), pointMulPublic(X1, c));
}
```

Expected gain: about 25% of CDS verify (only two of six variable multiplies use K; the other four use per-ballot points that cannot be precomputed). Measured gain on the whole ballot path not yet benchmarked (see section 6).

### 5.3 `packages/crypto/src/dlog.ts`: cache the baby-step table

```ts
const tableCache = new Map<number, DlogTable>();
export function dlogTableCached(bound: number): DlogTable {
  let t = tableCache.get(bound);
  if (t === undefined) {
    if (tableCache.size >= 16) tableCache.clear(); // bounded
    t = dlogTable(bound);
    tableCache.set(bound, t);
  }
  return t;
}
```

Use in `decryptAggregates` (`packages/protocol/src/tally.ts`). Saves 12 to 132 ms per tally at the measured bounds.

### 5.4 `packages/protocol/src/ballot.ts`: return decoded points from verification

```ts
export interface DecodedSelection { a: Point; b: Point }
export interface VerifiedBody { body: BallotBody; points: Map<string, DecodedSelection> } // key: `${contest}/${opt}`

// verifyBallotContent(p, body) -> Result<VerifiedBody>
// Decode each point once; aggregate() consumes `points` instead of re-decoding.
// Removes ~7 ms per ballot of duplicate decode (section 1.3).
```

### 5.5 `packages/protocol/src/ballotlog.ts`: streaming analyzer with O(voters) state

```ts
export class StreamingAnalyzer {
  private readonly last = new Map<string, { seq: number; code: string; env: CastEnvelope }>(); // voter hex -> counted
  private readonly codeOwner = new Map<string, string>();    // code hex -> voter hex
  private readonly spoiled = new Map<string, SpoilRecord>();
  private readonly admissible = new Map<string, number>();
  private readonly agg = new Map<string, Map<string, Aggregate>>(); // contest -> option -> running sum
  readonly findings: Finding[] = [];

  constructor(private readonly p: ElectionParams, private readonly roll: ReadonlySet<string>,
              private readonly open: number, private readonly close: number) {}

  /** Feed entries in log order. Replaces counted ballot of the same voter: agg = agg + new - prev. */
  push(seq: number, raw: unknown): void { /* same rules as analyzeBallotLog, one entry at a time */ }
  finish(): { counted: number; counted_root: Uint8Array; aggregates: Map<string, Map<string, Aggregate>> } { /* ... */ }
}
```

Equivalence test: the streaming result must equal `analyzeBallotLog` plus `aggregate` byte-for-byte (`counted_root` and each `A`, `B`) on the simulator corpus.

Memory: O(voters x 32 B) plus O(options). Removes `casts` (about 12 KB per cast envelope in V8).

### 5.6 `packages/server/src/verify-pool.ts` (new): verification off the lock

```ts
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

export class VerifyPool {
  private readonly workers: Worker[];
  private next = 0;
  constructor(private readonly size = Math.max(1, availableParallelism() - 1), workerUrl: URL) {
    this.workers = Array.from({ length: size }, () => new Worker(workerUrl));
  }
  /** Stateless proof check. `raw` is the parsed envelope text; roll/params are sent once per election. */
  verify(electionKey: string, rawText: string): Promise<{ ok: boolean; error?: string }> {
    const w = this.workers[this.next++ % this.workers.length]!;
    return new Promise((resolve) => {
      const onMsg = (m: { id: string; ok: boolean; error?: string }) => { /* resolve by id */ };
      w.postMessage({ electionKey, rawText });
      w.once('message', onMsg);
    });
  }
}
```

Change in `packages/server/src/election.ts` (`append` path): call `await pool.verify(...)` before `this.queued(...)`; under the mutex keep only the state checks (supersedes, duplicate code, revote limit) and then sequence. The worker must be sent the election's params and roll once per election (not per ballot).

### 5.7 `packages/server/src/electiondb.ts`: use the index, not a scan

```ts
// Already present (seqByLeaf). Expose through the Store port for BoardLog:
export interface BoardStore {
  seqByLeaf?(leafHash: Uint8Array): number | undefined; // optional, O(log n) on UNIQUE(leaf_hash)
}
```

`packages/board/src/log.ts` `inclusionProofByLeaf` then uses `store.seqByLeaf` when present and falls back to the scan only for `MemoryBoardStore`.

### 5.8 `packages/board/src/merkle.ts`: bounded memo

```ts
// Replace the unbounded Map with an LRU of complete-subtree hashes, or persist subtrees
// to SQLite merkle_node (QV-28 section 8.2). Memory at 10^6 leaves: about 200 MB (estimate) unbounded.
```

### 5.9 `packages/server/src/electiondb.ts`: SQLite merkle_node table (QV-28 design, not yet in code)

```sql
CREATE TABLE merkle_node (
  level INTEGER NOT NULL CHECK (level >= 1),
  idx   INTEGER NOT NULL CHECK (idx >= 0),
  hash  BLOB NOT NULL CHECK (length(hash)=32),
  PRIMARY KEY (level, idx)
) STRICT, WITHOUT ROWID;
```

Keeps the tree warm across restarts (no O(n) rebuild, section 1.4).

### 5.10 `packages/board/src/bundle.ts`: streaming bundle writer

```ts
// NDJSON (or tar member per chunk of 256 entries, aligned with tile width).
export async function* exportBundleChunks(store: BoardStore, o: ExportOptions, chunk = 256): AsyncGenerator<Uint8Array> {
  yield headerChunk(o, store.size());
  for (let s = 0; s < store.size(); s += chunk) {
    yield entriesChunk(store, s, Math.min(s + chunk, store.size()));
  }
  yield trailerChunk(store);
}
```

Verifier side (`packages/verifier/src/bundle.ts`): read chunks, verify each, hold O(chunk) memory. Raises the effective cap from 64 MiB to per-chunk limits.

### 5.11 `packages/server/src/config.ts`: profiles

```ts
export const PROFILES = {
  small:  { maxVerifyQueue: 50,    verifyWorkers: 0, maxSseTotal: 64,   maxLogBytes: 256 * 1024 * 1024 },
  medium: { maxVerifyQueue: 2_000, verifyWorkers: 3, maxSseTotal: 1024, maxLogBytes: 1024 * 1024 * 1024 },
  large:  { maxVerifyQueue: 10_000,verifyWorkers: 15,maxSseTotal: 0,    maxLogBytes: 16 * 1024 * 1024 * 1024 }, // needs compiled-bound change (section 3.1)
} as const;
export type Profile = keyof typeof PROFILES;
```

`verifyWorkers: 0` means inline (small profile). `maxSseTotal: 0` disables SSE. The large profile raises `maxLogBytes` above the compiled 4 GiB bound: a decision, not a config tweak.

### 5.12 `packages/server/src/export.ts`: stream the tar

Replace the in-memory tar writer (`packages/server/src/tar.ts`, `writeTar`) with a streaming writer that emits headers and body chunks as they are read from the store. Keep the existing `readTarStrict` limits for imports.

### 5.13 Tile endpoints (`packages/server/src/app.ts`, `static.ts`)

Serve tlog-tiles paths (`/tile/<L>/<N>[.p/<W>]`, `/tile/entries/<N>[.p/<W>]`) from a static directory generated at checkpoint time, with `Cache-Control: public, max-age=31536000, immutable` for full tiles and short TTL for partial tiles and checkpoint. Partial-tile rule from C2SP (section 2.10). Export generation must be incremental per checkpoint.

### 5.14 `packages/verifier/src/verify.ts` and `main.ts`: streaming runner and shard option

```ts
// qv-verify --shards 8 --profile large
// Runs StreamingAnalyzer per shard (hash(voter) mod N), merges counts and aggregates, and fails if any shard's
// global duplicate-code check disagrees. Output identical to the single-shard run (test in section 6).
```

### 5.15 `packages/trustee/src/tally.ts`: reuse incremental aggregates

Trustees keep recomputing (QV-16 section 5.16 requires it), but use `StreamingAnalyzer` (5.5) and the cached table (5.3). Cuts trustee memory from O(ballots) to O(options).

---

## 6. Test and benchmark plan

### 6.1 Correctness gates (must pass before any change above lands)
- Existing `packages/protocol/test/vectors.test.ts` and `packages/verifier/test/*` pass unchanged (wire-format invariance).
- Pool vs inline: for a 10^3-ballot corpus, verdicts and `counted_root` identical (`VerifyPool` vs `verifyEnvelope`).
- Streaming vs batch: `StreamingAnalyzer` equals `analyzeBallotLog` + `aggregate` on all test corpora, including re-votes, spoils, duplicate codes, and out-of-window entries.
- Incremental aggregate equals batch aggregate after random revote sequences (property test with `fast-check`-style generator, or a seeded loop).
- `pointMulPublic` equals `multiply` on random public inputs; never used in prover paths (lint rule: grep for `pointMulPublic` outside `proofs.ts` verify functions).
- Verifier sharding: N-shard result equals 1-shard result on 10^4 ballots.

### 6.2 Benchmarks (new `bench/` directories, not run in CI by default)
1. Ristretto micro: sections 1.1 numbers, plus MSM rejected case, reproduced by `prim.mjs`, `unsafe.mjs`, `precomp.mjs`.
2. Ballot pipeline by manifest size: 1, 2, 7, 14, 18 selections; N = 1, 10, 100, 1000 ballots. Report ingest per ballot, verify per ballot, analyze per ballot, aggregate per ballot, bundle bytes per ballot.
3. Pool scaling: throughput at 1, 2, 4, 8 workers on the 4-vCPU host (expect near-linear to 3 workers).
4. End-to-end ingest over HTTP: 10^3 ballots with `POST /entries`, p50, p99, queue behaviour at `maxVerifyQueue` 50 and 2,000.
5. Merkle: append 10^6 leaves, cold root, warm root, proof p99, `seqByLeaf` lookup p99 (replace linear scan).
6. SQLite: append at batch 1, 100, 1000 with `synchronous=FULL` and `NORMAL`; checkpoint write cost; WAL growth under concurrent readers.
7. Bundle: export and verify at 10^3, 10^4, 10^5 ballots; peak RSS; chunked vs monolithic. Record the 512 MiB string failure point empirically.
8. SSE: 100, 1,000, 10,000 clients at 1, 10, 100 events/s; CPU and p99 delivery latency; compare per-client cursor vs broadcaster.
9. Raspberry Pi: run section 6.2.2 on a Pi 4 or Pi 5 (not yet done; all Pi numbers in this note are assumptions).
10. Tile serving: generate tiles at 10^6 leaves, size on disk, CDN cache hit assumption, cold-start time.

### 6.3 Regression thresholds (CI, generous)
- Per-ballot verify no slower than 1.2x baseline on the same host.
- Bundle bytes per ballot within 5% of 9.4 KB at the default manifest.
- Streaming verifier peak RSS below 300 MB for 10^4 ballots.

### 6.4 Release-blocking claims
- Any published capacity number must come from section 6.2 measurements on named hardware, not from section 4.1 estimates.

---

## 7. Open questions for the owner

1. Permit variable-time multiplication in verifier code paths (section 5.1)? Affects docs/16 security wording.
2. Resolve roll cap: `2^20` (docs/16 line 851) vs `2^31` (line 776). "Millions" needs the larger cap, and a new suite string if the cap changes proto semantics.
3. Raise the compiled `maxLogBytes` bound from 4 GiB for the large profile (QV-29 REQ-002)?
4. Confirm whether the bundle's `board` member duplicates ballot bodies from `log` (section 1.6 estimate). If so, the duplication should be removed in the bundle format, not only at export time.
5. Accept SSE as a small-profile feature only, with tiles as the large-profile read path?
6. Keep trustees recomputing aggregates (QV-16 section 5.16) even though it costs each trustee about 2.4 core-hours at 10^6?

---

## 8. Sources (accessed 2026-10-21)

| Source | URL | Status |
|---|---|---|
| C2SP tlog-tiles | https://github.com/C2SP/C2SP/blob/main/tlog-tiles.md (accessed 2026-10-21) | Fetched. Tile height 8, 256 hashes per full tile, path format, partial-tile rule. Quoted in section 2.10. |
| Tessera (successor to Trillian v1) | https://github.com/transparency-dev/tessera (accessed 2026-10-21) | Fetched. Backends GCP, AWS, POSIX; tlog-tiles API. CDN not stated; inference. |
| ElectionGuard | https://github.com/microsoft/electionguard (accessed 2026-10-21) | Fetched. No scale figures, no DLOG method stated. |
| ElectionGuard docs | https://electionguard.readthedocs.io/ (accessed 2026-10-21) | Not reachable (DNS failure in sandbox). UNVERIFIED. |
| Node.js `node:sqlite` | https://nodejs.org/api/sqlite.html (accessed 2026-10-21) | Fetched, latest docs: stability 1.2 (release candidate). v22 page not fetched. The repo's "Stability 1.1 for v22" claim is UNVERIFIED. |
| SQLite limits | https://sqlite.org/limits.html (accessed 2026-10-21) | Not reachable (DNS failure). UNVERIFIED. Not relied on; file sizes come from measurement. |
| RFC 9162 (Certificate Transparency v2) | https://www.rfc-editor.org/rfc/rfc9162.html (accessed 2026-10-21) | Not reachable (DNS failure for rfc-editor, datatracker, ietf.org). UNVERIFIED. Section numbers (2.1.1 MTH, 2.1.3 inclusion, 2.1.4 consistency) are taken from the repo's code comments, not re-checked. |
| Trillian | https://github.com/google/trillian (accessed 2026-10-21) | Not fetched. UNVERIFIED. Only the Tessera README's statement that it succeeds Trillian v1 was read. |
| Node.js performance (V8/Node tuning) | https://nodejs.org/api/worker_threads.html (accessed 2026-10-21) | Not fetched. UNVERIFIED. Worker-pool design in 5.6 uses the standard API. |
| `@noble/curves` 2.4.0 | local `node_modules/@noble/curves` | Read locally: `multiplyUnsafe`, `precompute`, `interleavedMSMUnsafe` present. |
| Repo docs | `docs/16-crypto-protocol.md`, `docs/18-bulletin-board-transparency.md` (section 20), `docs/28-data-model-storage.md` | Read in full or in relevant sections. |
| Repo code | `packages/{crypto,protocol,board,server,verifier}` (read-only) | Read; line references as cited. |

---

## 9. Appendix: exact measured values (for reproduction)

- Host: Intel Xeon 2.80 GHz, 4 vCPU, 16 GB RAM, Node v22.22.0, `@noble/curves` 2.4.0, ext4 virtio.
- Default manifest: `defaultContests()` from `packages/protocol/test/helpers/sim.ts`: 4 contests, 14 real selections, 18 CDS/limit statements. Setup with `n: 3, t: 2`.
- Ballot pipeline: 40 ballots, `setup` 334 ms, `castBallot` 210 ms avg, `verifyEnvelope` 278 to 291 ms, `analyzeBallotLog` 10,587 ms total, `aggregate` 349 ms, `trusteeDecryptTally` 411 ms per trustee, `decryptAggregates` 435 ms.
- Bundle: 40 ballots, JSON 375,762 bytes (9,394 per ballot), gzip -9 181,120 bytes (ratio 0.482).
- Merkle: 10^4 and 10^5 leaves as in section 1.4; checkpoint sign 1.3 to 1.8 ms; verifyInclusion true at both sizes after fix.
- SQLite: 2,000 single-commit appends and 20,000 batched appends per mode, as in section 1.5.
