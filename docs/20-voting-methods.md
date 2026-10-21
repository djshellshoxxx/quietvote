# QV-20 — Voting Methods

**Module ID:** `voting-methods`
**Status:** Draft
**Owner:** Protocol lead (with cryptography reviewer)
**Last reviewed:** 2026-10-21
**Related specs:** QV-05 (ballot protocol), QV-16 (crypto protocol, byte-level encodings), QV-04 (identity), QV-03 (governance), QV-07 (threat model), QV-09 (API), QV-10 (UX), QV-11 (testing), QV-26 (metadata privacy), QV-21 (post-quantum research); ADR-004, ADR-005, ADR-006, ADR-008.

This document defines, per voting method: the plaintext semantics, the ballot encoding into exponential-ElGamal ciphertext vectors (ADR-004), the zero-knowledge validity statements, the public tally algorithm, tie and invalid-ballot handling, the audit procedure, discrete-log bounds, limitations and UX implications. Byte-level serialisation, domain-separation tags and Fiat–Shamir transcript layouts are owned by QV-16; this document owns the *statements* being proven and the *semantics* of the result. No new cryptographic primitive is introduced; every proof is a composition of Chaum–Pedersen (CP) and Cramer–Damgård–Schoenmakers (CDS) sigma protocols [R1][R2].

## 1. Objective

Give engineers and reviewers a complete, testable definition of every supported voting method so that (a) the client can build ballots, (b) the server can validate them without learning choices, (c) trustees can decrypt only aggregates, and (d) any observer can recompute the result from the public bulletin board (ADR-007).

## 2. Scope

### In scope
- MVP methods (ADR-006): yes/no, single-choice, approval, k-of-n (bounded multi-select), with quorum and simple/supermajority thresholds.
- Phase-2 methods: ranked ballots tallied by Schulze or Ranked Pairs from an encrypted pairwise matrix; weighted votes; bounded delegation.
- Tie-break declaration, invalid and spoiled ballot handling, audit procedure, discrete-log (dlog) bounds.

### Out of scope
- Write-in candidates (ADR-006: excluded; would require a verifiable mixnet).
- STV/IRV (requires sequential elimination on decrypted rankings; not computable from aggregates) — deferred; see §9.5.
- Quadratic/score voting beyond approval — Could, Phase 3, via bounded-range proofs (§9.6).
- Coercion resistance (ADR-008 non-claim).

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Organizer | Declare method, options, thresholds, tie rule in the manifest | Group rules agreed (QV-03) | Signed manifest fixes every parameter below |
| Voter | Express a valid choice privately | On roll; election open | Ciphertext vector + proofs accepted; receipt |
| Trustee | Decrypt only the aggregate | DKG complete; election closed | Partial decryptions + CP proofs |
| Auditor/observer | Recompute result | Public log | Pass/fail verdict from the CLI verifier |
| Server | Validate and append | Manifest known | Accept/reject with reason code, never learning choices |

## 4. Common machinery

### 4.1 Notation
- Group: ristretto255, prime order ℓ = 2^252 + 27742317777372353535851937790883648493, generator G (ADR-004). Election public key PK = x·G, x shared t-of-n among trustees (QV-16).
- Exponential ElGamal of integer m ∈ ℤ_ℓ with randomness r ← ℤ_ℓ: `Enc(m; r) = (A, B) = (r·G, m·G + r·PK)`. Additively homomorphic: `Enc(m1;r1) ⊕ Enc(m2;r2) = (A1+A2, B1+B2)`; public scalar multiplication `w ⊗ Enc(m;r) = (wA, wB)`.
- Notation `ct ⊖ cG` for subtracting a constant: `(A, B − c·G)`.

### 4.2 Proof statements (named, reused below)
All proofs are non-interactive via Fiat–Shamir over a transcript that includes the election id, manifest hash, ballot slot id, voter/token binding (so a proof cannot be replayed into another ballot or election), the full statement (all ciphertexts, public key) and the commitments (QV-16 §domain separation). Weak Fiat–Shamir (omitting statement) is a known source of real attacks [R5]; this is a Must (QV-20-REQ-003).

- **P01(ct, {v0..vk}) — "ct encrypts one of the public values".** CDS disjunction [R2] of CP proofs: for each candidate value v: `log_G(A) = log_PK(B − vG)`. Simulate branches not known, split the challenge `c = Σ c_i`. Size: 2k scalars + implicit; for k=2 (bit): 4 scalars = 128 B. Written **BIT(ct)** for values {0,1}.
- **P02(ct, L) — "ct encrypts exactly L" (constant-sum).** Single CP: prove knowledge of r with `A = rG ∧ B − L·G = r·PK`. 2 scalars = 64 B. Applied to the homomorphic sum of a ciphertext vector, this proves the plaintext sum equals L without opening anything (as used by ElectionGuard's selection-limit proof [R6]).
- **P03(ct, S) — set membership** for a small public set S: same as P01.
- **P04 — decryption proof.** CP that `D = x_i·A` for trustee share key `Y_i = x_i·G` (QV-16).
- **P05(ciphertext tuple, S⊂{0,1}^m) — pattern membership** (used for ranked ballots, §8): CDS OR over patterns s∈S of the *conjunction* over coordinates j of a CP proof "ct_j encrypts s_j". Standard AND/OR sigma composition [R2][R3].

### 4.3 Manifest fields consumed (QV-09 schema owner)
**Names conformed to QV-16 §5.6.1 (QV-16 prevails):** `method` ∈ {`yes-no`,`single-choice`,`approval`,`k-of-n`} in suite v1 (`ranked` is Phase 2 and gated, QV-ADR-023; older names `yesno`/`single`/`kofn` are retired); `selection_limit` (`L`, max) replaces `selection_limits.max`, and `min_selections` is `0` in suite v1 (min > 0 is presentation-only/reserved); `rule {type:"threshold", num, den, basis ∈ {yes+no, counted, roll}, strict}` replaces `threshold {kind,num,den,base}` (`yn`→`yes+no`, `cast`→`counted`, `eligible`→`roll`); `tie_break.type` uses hyphens (`status-quo`, `declare-tie`, `lexicographic`; `beacon` is reserved and rejected in suite v1); `allow_blank` is presentation-only because an all-zero ballot is always valid. Original list: `method` ∈ {`yesno`,`single`,`approval`,`kofn`,`ranked`}; `options[]` (ids, labels, ≤ 255 chars each, unique); `selection_limits {min,max}`; `allow_blank` (bool); `threshold {kind, num, den, base}`; `quorum {kind, value}`; `tie_break {kind, params}`; `weights_mode` ∈ {`none`,`roll`,`delegated`}; `max_weight`; `disclosure` (§10); `tally_algorithm` ∈ {`schulze`,`ranked_pairs`} for ranked.

### 4.4 Placeholder (slack) technique — undervotes without range proofs
To support `min ≤ Σ selections ≤ max` using only P02 and BIT, the client appends `max − min` **slack selections** (bits). The ballot is valid iff every real and slack bit satisfies BIT and the homomorphic sum of *all* (real+slack) bits equals `max` (P02). Then real sum ∈ [min, max]. Slack ciphertexts are included in the ballot and aggregated like any other; they are not attributed to any option and their aggregate total only reveals the **total undervote count** `N·max − Σ_real` (derivable anyway from the public ballot count and the real totals). Slack positions are shuffled by a client-chosen permutation *inside* the vector only if the vector order is public-structure-irrelevant; QV-16 fixes slack at the end (the order leaks nothing since all are encrypted).

## 5. Methods — MVP

### 5.1 Yes/No (blank = abstain)
- **Semantics.** Options are exactly `[yes, no]` (QV-16 §5.6.1). There is **no `abstain` option or ciphertext**: abstaining is a blank (all-zero) ballot, always valid, counted as participation (quorum) and in `T_abs = V − T_yes − T_no` (derived from the public counted-voter count `V`), and counted in the threshold base only for basis `counted`. `allow_blank` only controls whether the UI offers an explicit "Abstain" choice.
- **Encoding.** Vector of 2 real ciphertexts (`yes`, `no`) plus the QV-16 placeholder, at most one real bit set (limit `L = 1`, blank allowed); QV-16 §5.9–5.10 prevail over the older "exactly one bit" text below.
- **Validity statement.** `∀j: BIT(c_j)` ∧ `P02(⊕_j c_j, 1)`. Proof size m·128 + 64 B (m=2: 320 B).
- **Tally.** Aggregate `C_j = ⊕_ballots c_j`; threshold decryption yields `T_j·G`; solve dlog (§11) for `T_yes, T_no` (and `T_abs = V − T_yes − T_no`).
- **Decision rule** (all integer arithmetic, no floats): let `base = T_yes + T_no` (`base=yn`) or `T_yes+T_no+T_abs` (`base=cast`) or `|roll|` (`base=eligible`). Passes iff quorum satisfied ∧ `den·T_yes ≥ num·base` (≥) or `>` per manifest `threshold.strict`. Simple majority: num/den = 1/2 with strict `>`. Two-thirds: 2/3 with `≥`. Pseudocode:

```
function decide(T, manifest, N_cast, N_roll):
  q = manifest.quorum
  if q.kind == "count"   and N_cast <  q.value:           return FAILED_QUORUM
  if q.kind == "fraction" and N_cast*q.den < q.num*N_roll: return FAILED_QUORUM
  base = select(manifest.threshold.base, T, N_roll)
  lhs = manifest.threshold.den * T["yes"]
  rhs = manifest.threshold.num * base
  ok  = manifest.threshold.strict ? lhs > rhs : lhs >= rhs
  if base == 0:                                           return FAILED_NO_BASE
  return ok ? PASSED : REJECTED     // exact tie on strict rule => REJECTED (status quo)
```

### 5.2 Single-choice (one of n)
- **Encoding.** n bits, exactly one set; optional blank = all zeros only if `allow_blank` (then min=0,max=1, one slack bit; blank then is "slack set").
- **Validity.** BIT on each of n(+1) ciphertexts and P02(sum, 1) over all including slack. Size ≈ (n+1)·(64+128)+64 B ≈ 192n+256 B.
- **Tally.** Aggregate per option, decrypt, rank by count. Winner = argmax; the result also publishes all counts (required for verifiability, see §10).
- **Tie.** If top count shared by ≥ 2 options → §12.
- **Limitations.** Plurality is vulnerable to vote splitting/spoiler effects; recommend approval or ranked for groups with >3 options (UX hint, §14).

### 5.3 Approval
- **Semantics.** Voter marks any subset; each option gets one approval per approving voter [R7 Brams–Fishburn, approval voting].
- **Encoding.** n bits, `min=0` (or 1 if blank forbidden), `max=n`. With `max=n`, `min=0` the slack count is n and the ballot is n real + n slack bits summing to n (cost doubles). **Optimisation (Should):** when `min=0,max=n` omit slack and omit P02 entirely — only BIT on each ciphertext is needed because any 0/1 vector is valid. When `min≥1` use slack of `n−min`.
- **Tally/winner.** Highest approval count wins (single-winner) or top-w for `seats = w` (multi-winner, "approval top-w", no proportionality claim). Ties §12.
- **Limitations.** Strategic thresholding; no expression of strength; multi-winner approval is not proportional.

### 5.4 k-of-n (bounded multi-select)
- **Semantics.** Voter selects between `kmin` and `kmax` options (e.g., choose exactly 3 of 7 board nominees). Seats `s` to be filled is a separate manifest value (`seats`), typically `s = kmax`.
- **Encoding/validity.** §4.4 with `max=kmax`, slack = `kmax−kmin`. Over-voting is cryptographically impossible (P02 would fail), so the *server rejects* rather than the tally discarding.
- **Tally.** Top-`s` by count. Ties at the cut line §12.
- **Size.** n bits ×192 B + slack (kmax−kmin)×192 B + 64 B.

## 6. Quorum and supermajority (all methods)
- **Quorum kinds:** `count` (≥ q ballots counted), `fraction` of roll (`N_cast·den ≥ num·N_roll`). Quorum is evaluated on **counted ballots** (the last valid ballot per voter in Phase 1, per ADR-005; in Phase 2 on distinct spent tokens), not on yes votes.
- **Threshold bases:** `yn` (yes+no), `cast` (including abstain/blank), `eligible` (whole roll). Default for supermajority is `eligible` only if the organizer explicitly selects it; default otherwise `yn`. UI must show the formula in plain language (QV-10).
- **Verifiability.** Both rules depend only on public counts: ballots-counted (public from log) and decrypted aggregates. No additional proofs are needed. Hidden-threshold ("reveal only pass/fail") is *not* provided (needs ZK comparison/MPC; research item, QV-OQ-3).
- **Late/early closing.** Quorum is evaluated once at close; there is no mid-election quorum notification that leaks counts (the server may publish only the *ballot count*, which in Phase 1 is public anyway; in Phase 2 it is a protected-by-config option, see QV-26 §8).

## 7. Interaction of revoting and methods
Under ADR-005 Phase 1, the latest valid signed ballot per voter counts. The tally algorithm therefore first computes the counted set:

```
function counted_ballots(log):
  latest = {}                       # voter_pubkey -> ballot
  for entry in log.entries(type=BALLOT) in log order:
      if not verify_ballot(entry): record_rejection(entry); continue
      v = entry.voter_pubkey
      if v in latest and entry.seq <= latest[v].seq: record_rejection(entry, SUPERSEDED_OLD); continue
      latest[v] = entry
  return latest.values()            # exactly one per voter
```
**Conformed to QV-16 §5.14 / QV-ADR-016:** there is no voter-chosen `seq`. Order is the bulletin-board sequence number; the server's power to reorder is bounded by the signed `supersedes` hash chain (a ballot with a stale `supersedes` is inadmissible, `E_SUPERSEDES`) and by `max_per_voter` (`E_REVOTE_LIMIT`). The pseudocode's `entry.seq` is the log sequence number and the comparison is replaced by the chain rule. Original text: `seq` is a voter-chosen strictly increasing integer included in the signed statement. Superseded ballots remain in the log (needed for public verifiability of the count) but are excluded from the homomorphic sum. A Benaloh-audited (spoiled) ballot is never counted (§13).

## 8. Phase 2 — Ranked ballots (Schulze / Ranked Pairs)

### 8.1 Why a pairwise matrix
Condorcet-consistent methods such as Schulze [R3] and Ranked Pairs (Tideman) [R4] need only the **pairwise preference matrix** `d[i][j]` = number of voters strictly preferring i over j; the full rankings are not needed. Since `d` is a *sum over voters* of per-voter 0/1 indicators, it can be computed homomorphically — an encrypted-matrix approach that reveals only aggregate pairwise counts, never individual rankings. This yields a homomorphic ranked tally within the ADR-004 toolkit, avoiding mixnets (ADR-004 alternatives). Condorcet's idea of pairwise comparison dates to 1785 [R8]. This design is a *composition of standard sigma-protocol proofs*; it is not a published, reviewed scheme in this exact form, so it is flagged **[REVIEW-REQUIRED]** and is blocked from release claims until QV-11 independent cryptographic review (QV-20-REQ-040).

### 8.2 Encoding
For n candidates, the voter forms the relation matrix `P` of `n(n−1)` ordered pairs: `P[i][j] = 1` iff the voter ranks i strictly above j, else 0. Only the `n(n−1)/2` unordered pairs are *both* encrypted: for i<j the client encrypts two bits `P[i][j]` and `P[j][i]` (equal ranking ⇒ both 0). Total `n(n−1)` ciphertexts. Unranked candidates are treated as tied at the bottom (so "rank only my top 3" is expressible; unranked-vs-ranked pairs give ranked ≻ unranked). Ties within levels are allowed (weak order) if `allow_ties` true; otherwise strict total order is required.

### 8.3 Validity statement (weak order)
A relation `≻` is a *strict weak order* iff it is asymmetric and negatively transitive; both are conditions on pairs and triples. Hence a ballot is valid iff:
1. For every ordered pair: `BIT(P[i][j])`.
2. For every unordered triple {a,b,c} the 6-tuple `(P[a][b],P[b][a],P[b][c],P[c][b],P[a][c],P[c][a])` ∈ W₃, where W₃ is the set of the 13 encodings of weak orders on 3 elements (1 all-tied, 6 strict orders, 3 "one on top, two tied below", 3 "two tied on top, one below" → 1+6+3+3 = 13). Proven with P05 (13-way OR of 6-way conjunctions). This also implies asymmetry (`P[i][j]=P[j][i]=1` appears in no pattern). For n=2 only the pair check `P[a][b]+P[b][a] ≤ 1` via P03 on their sum with S={0,1}.
3. If `allow_ties=false` (strict total order): replace W₃ by the 6 strict orders (then `P[i][j]+P[j][i]=1` is implied).

*Soundness argument (to be reviewed):* every triple consistent with a weak order ⇒ whole relation is a weak order because asymmetry and negative transitivity are 3-local properties. *Completeness:* an honest weak-order ranking encodes into a W₃ pattern on every triple.

**Cost.** Triples = C(n,3). Per triple the proof is 13 branches × 6 CP = 78 CP sub-transcripts (≈ 2×78 scalars ≈ 5 KB) — large. For strict orders, 6 branches × 6 CP, or the cheaper test "sum of the cycle bits ∈ {1,2}" using only P03 on three homomorphic sums (a strict tournament is transitive iff it has no directed 3-cycle — classical tournament theory) at ≈ 4 scalars per triple. **Decision:** strict-order ballots use the cycle test (cheap); weak-order ballots use P05. Table for planning (bytes ≈ 64·n(n−1) ciphertexts + 128·n(n−1) BIT proofs + triples proofs):

| n | pairs n(n−1) | triples | strict ballot ≈ | weak ballot ≈ |
|---|---|---|---|---|
| 4 | 12 | 4 | 3 KB | 24 KB |
| 6 | 30 | 20 | 7 KB | 120 KB |
| 8 | 56 | 56 | 13 KB | 330 KB |
| 10 | 90 | 120 | 21 KB | 700 KB |

Hard limit: `n ≤ 10` candidates for `ranked` (Must). Weak orders limited to `n ≤ 7` (Should) [numbers are estimates; benchmark in QV-11].

### 8.4 Tally
```
function ranked_tally(counted, manifest):
  D = n x n matrix of ciphertext zeros
  for each ballot b in counted: for each (i,j), i!=j: D[i][j] = D[i][j] (+) b.P[i][j]
  for each (i,j): d[i][j] = threshold_decrypt_and_dlog(D[i][j], bound=N)   # §11
  verify each decryption proof P04
  return d

function schulze(d, n):                    # [R3], Floyd–Warshall strongest-path form
  p = n x n; for i!=j: if d[i][j] > d[j][i]: p[i][j] = d[i][j] else p[i][j] = 0
  for k in 0..n-1: for i != k: for j != k, j != i:
      p[i][j] = max(p[i][j], min(p[i][k], p[k][j]))
  W = { i : for all j != i, p[i][j] >= p[j][i] }   # potential winners
  return W   # |W|>1 means a tie; §12
```
`O(n³)` — trivial. Ranked Pairs [R4]: sort majorities `(i,j)` with `d[i][j] > d[j][i]` by margin (or winning votes, manifest param `margin_kind`), lock each edge unless it creates a cycle in the locked graph; winner is the source node. Tie among equal majorities in sort order: break by the manifest's fixed candidate order seeded permutation (§12) — Tideman's method requires a tie-breaking order over candidates/pairs and the specification must fix it (`tie_perm` derived from the beacon or the manifest). Both algorithms are specified in full and shipped with published test vectors including the Schulze paper's worked examples [R3] (Must).

### 8.5 Limitations (state to users)
- The pairwise matrix leaks more than the winner: with few voters, matrices can nearly reveal individual rankings (e.g., N=3). Minimum group rule §10.
- Ballot size grows ~n²; 8+ candidates on mobile is slow (client proving ≈ seconds; benchmark).
- Not coercion-resistant: Italian-style attacks (specific ranking patterns as signature) apply, and the ranking space is large, which makes signalling easy. Documented non-claim (ADR-008).
- Strategic behaviour exists in every Condorcet method; Schulze/Ranked Pairs satisfy clone independence and Condorcet criteria but not all criteria [R3][R4].

## 9. Phase 2 — Weighted, delegation; deferred methods

### 9.1 Weighted voting
- **Weights** are public integers `w_v ∈ [1, W_max]` committed in the roll (`roll leaf = (pubkey, weight)`), so everyone can recompute `ΣW`. Ballot encoding is unchanged (unweighted bits and their proofs). The tally applies the public scalar: `C_j = ⊕_v w_v ⊗ c_{v,j}`, so decrypted `T_j = Σ w_v·x_{v,j}`.
- **Bound.** `B = ΣW` (§11). Constraint `ΣW ≤ 2^40` (Must).
- **Phase 2 unlinkable tokens (ADR-005):** weight must be a public attribute of the token, so there is one token class per weight value ("denomination"); the anonymity set shrinks to voters sharing the weight. Document this (QV-26 §9). Recommend ≤ 4 classes.
- **Validity/quorum:** quorum may be by weight (`weight_fraction`) or headcount; manifest chooses.

### 9.2 Delegation (bounded, static, pre-open)
Liquid democracy with secret delegation is incompatible with unlinkable ballots, and transitively revealing delegation chains is a privacy cost. **Decision:** delegation is **public, signed, resolved before the election opens** (or by a separate delegation window) and affects only weights.
- A delegation record `D = Sign_v(election_id, v → d, depth_cap, expiry)` is appended to the log by the delegator `v`. Each voter has at most one outgoing delegation, `d` must be on the roll, self-delegation invalid.
- **Resolution** (public deterministic function, run by every verifier):

```
function effective_weights(roll, delegations, counted_voters, depth_cap=3):
  w = {v: roll[v].weight for v in roll}
  for v in roll where v not in counted_voters and v has delegation:   # delegator did not vote themselves
      path = follow(v, depth_cap)           # v -> d1 -> d2 ... stops at first voter who voted
      if path ends at a voter d who is in counted_voters and len(path) <= depth_cap and no cycle:
          w[d] += w[v]; w[v] = 0
      else:  # cycle, depth exceeded, or delegate did not vote
          w[v] unchanged; v is simply non-participating (weight not cast)
  return w
```
Because delegators who vote override their delegation, the effective weights depend on the *set of counted voters*, which is public in Phase 1 (ADR-005). In Phase 2 (unlinkable) this is **not computable**; therefore delegation is **Phase 1 only** (Must) and must not be combined with unlinkable tokens (the manifest validator rejects the combination).
- **Limitation:** delegation chains are public; delegates can be pressured; weights concentrate. Per-topic delegation is out of scope.

### 9.3 Cumulative/budget voting
Out of scope (needs range proofs; §9.6).

### 9.4 Multi-winner proportional (STV)
Deferred; requires an anonymised ranked-ballot shuffle (verifiable mixnet) — Phase 3 research with QV-21/QV-11.

### 9.5 Write-ins
Excluded (ADR-006). Attack: signature patterns and unbounded text.

### 9.6 Score / range voting
A score in [0, s] per option can be proven with P03 over {0..s} for `s ≤ 10`; cost 2(s+1) scalars. Candidate for Phase 3; bound `B = N·s`.

## 10. Result disclosure and small-group rules (owned jointly with QV-26 §10)
Verifiability requires publishing the decrypted per-option aggregates (or the full pairwise matrix). That inherently leaks in small groups:
- **Unanimity:** if all N voters choose A, every voter's choice is public. Unavoidable.
- **Differencing/inference:** coalition of N−1 voters knows the last voter's choice.
Rules (Must unless noted): (1) manifest validation **rejects** electorates with `|roll| < 3`; (2) between 3 and 9 the organizer UI shows a leakage warning and the published result page includes a standing note; (3) ranked ballots require `|roll| ≥ 15` unless the organizer acknowledges the warning (Should); (4) the manifest `disclosure` field is `full` (default; all counts published) — no `pass_fail_only` mode is offered because it cannot be verified without additional ZK/MPC (open question QV-OQ-3).

## 11. Discrete-log bounds
Decryption of a trustee-combined aggregate gives `M·G`, and we need `M`. All tally values are bounded integers `0 ≤ M ≤ B`.

| Method | Value | B (bound) |
|---|---|---|
| yes/no, single, approval, k-of-n | per-option count | N_roll |
| weighted | per-option weighted count | ΣW ≤ 2^40 |
| ranked | per-cell pairwise count | N_roll (weighted: ΣW) |
| slack aggregates | undervote total | N_roll·max |

**Algorithm.** Baby-step giant-step (Shanks) with `m = ⌈√(B+1)⌉`: table of `j·G` for j∈[0,m) keyed by the 32-byte compressed encoding; giant steps subtract `m·G`. Time/space O(√B). Examples: N=10⁶ → m=1,000 (≈ 1,000 table entries, tens of KB); `ΣW=2^40` → m=2^20, ≈ 1M entries ≈ 64 MB with 64-bit key prefixes — acceptable for server/CLI, heavy for browser; use **the verifier does not solve dlog**: the trustees publish `M` alongside the decryption proof, and the verifier checks `M·G == D_total` (one scalar mult), so verifiers need no table (Must). For bounds ≤ 2^32 clients/trustees use BSGS. If BSGS finds no `M ≤ B`, the tally is **aborted with TALLY_OUT_OF_BOUND**: the ballots were proven valid, so this signals trustee error or key compromise — treated as an integrity incident (QV-12).
Pairwise cells must satisfy `d[i][j] + d[j][i] ≤ N` — an additional public consistency check.

## 12. Tie handling
Manifest `tie_break.kind` (declared before opening; Must):
| Kind | Behaviour | Verifiable? |
|---|---|---|
| `fail` | No decision; motion/seat unfilled | yes |
| `status_quo` | Tied motion rejected (default for yes/no on strict threshold) | yes |
| `ranked_fallback` | Use another declared ordering (e.g., approval counts, then roll order of oldest member id) | yes |
| `beacon_random` | Select uniformly among tied options using a public randomness beacon round fixed in the manifest (e.g. a drand round [R9]) hashed with the tally: `idx = H("QV-tie" ‖ election_id ‖ beacon_value ‖ tally_hash) mod k` (rejection-sample to avoid modulo bias) | yes, if beacon verifiable |
| `runoff` | New election restricted to tied options; scheduled automatically | yes |
| `chair` | A designated key signs a selection | no (trust-based; allowed but flagged) |
`beacon_random` needs the future beacon round to be after close time (Must) so nobody can choose after seeing the tally; a beacon outage falls back to `fail`.

## 13. Invalid, spoiled, and malformed ballots
| Class | Detection | Handling |
|---|---|---|
| Malformed encoding (bad point, non-canonical scalar, wrong vector length, wrong manifest hash) | Server and every verifier | Rejected pre-append; reason code from QV-16 §5.20 (`E_PARSE`/`E_SCHEMA`/`E_POINT_DECODE`/`E_SCALAR_RANGE`; legacy `E_ENCODING`); **not** logged as a ballot entry (to avoid DoS growth) except in a rate-limited rejection counter. Verifiers re-check all logged ballots |
| Proof failure | Server | Rejected, `E_CDS`/`E_LIMIT_PROOF` (legacy `E_PROOF`). A malicious server may *wrongly* accept; verifiers re-run all proofs and reject the tally if any counted ballot fails (so a bad accepted ballot is a verifiable server fault) |
| Wrong signature / voter not on roll | Server/verifiers | `E_SIG` / `E_VOTER_NOT_ELIGIBLE` (legacy `E_AUTH`) |
| Stale `supersedes` / over revote limit | Server | `E_SUPERSEDES` / `E_REVOTE_LIMIT`, retained only if appended earlier |
| Late (after close) | Server clock + log time | `E_CLOSED` |
| Spoiled by Benaloh challenge | Client sends audit request | Ballot + randomness published and marked SPOILED; never counted |
| Blank (all-zero selections) | Always valid in suite v1 (QV-16 `min_selections = 0`); `allow_blank=false` is enforced by the UI only | Counted for quorum/participation |
Because validity is proven in zero knowledge, **no counted ballot can be "invalid-but-undetectable"**; there is no unreadable or discarded-in-the-tally category (QV-20-REQ-004). An all-zero real vector is valid in every suite-v1 election (placeholders absorb the limit sum); an election that wants no blanks can only discourage them in the UI and report them as undervotes.

## 14. Audit procedure
The independent CLI verifier (QV-11) performs, in order, and outputs PASS/FAIL with the first failing step:
1. Verify manifest signature, hash, trustee DKG transcript and the election public key `PK` (QV-16).
2. Verify the log: STH signatures, consistency proofs between all observed heads, inclusion proof for every entry (ADR-007).
3. For each ballot entry: re-verify signature, roll membership (Merkle path), proofs (BIT/P02/P05), `seq`.
4. Recompute the counted set (§7), delegations → effective weights (§9.2).
5. Recompute aggregate ciphertexts homomorphically from the counted set only (including `w ⊗` scalars); compare to the published aggregates.
6. Verify each trustee's P04 for each aggregate and the threshold-combination; check `M·G == D_total`.
7. Recompute decision: quorum, threshold, winner(s), Schulze/RP from `d`, tie rule including beacon value.
8. Compare against the published result. Any mismatch ⇒ FAIL.
Voters additionally: (a) Benaloh challenge on their own device (cast-as-intended); (b) check receipt inclusion proof (recorded-as-cast); (c) tally verification via 1–8 (tallied-as-recorded). Spoiled ballots audited by anyone: open and compare to the claimed selections.

## 15. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-20-REQ-001 | The system shall support methods yes/no, single-choice, approval, k-of-n in MVP, each defined by the manifest `method` field | Must | Each method has end-to-end test vectors (build → validate → tally → verify) | Integration test |
| QV-20-REQ-002 | Every ballot shall contain, per selection, a BIT proof, and a P02 constant-sum proof over the full vector (including slack) wherever §5 requires it | Must | Ballots with a selection of 2, −1, or over-limit sum are rejected with `E_PROOF` | Unit + fuzz |
| QV-20-REQ-003 | Fiat–Shamir challenges shall hash the complete statement, election id, manifest hash and voter/token binding with domain separation | Must | Replay of a valid proof into a different election/ballot slot fails; mutation tests of each transcript field fail verification | Unit, review |
| QV-20-REQ-004 | The tally shall be computed only from the counted set; no counted ballot shall be discardable post hoc for invalidity | Must | Verifier rejects result if any counted ballot fails verification | Integration |
| QV-20-REQ-005 | All thresholds and quorums shall use integer arithmetic exactly as in §5.1 | Must | Boundary vectors (exact 2/3, 1/2 strict, N=0) match reference outputs | Unit |
| QV-20-REQ-006 | The manifest shall declare a tie-break; elections with unresolved tie shall follow it exactly | Must | Tie fixtures for each kind produce deterministic, verifier-reproducible output | Unit |
| QV-20-REQ-007 | Decrypted values shall be accompanied by `M` and P04 proofs; verifiers shall check `M·G` rather than solving dlog | Must | Verifier runs on a 2^40-weight election in < 5 s without BSGS | Perf test |
| QV-20-REQ-008 | A tally exceeding its bound or violating `d[i][j]+d[j][i] ≤ N` shall abort with a published error | Must | Fault-injection test | Integration |
| QV-20-REQ-009 | Manifest validation shall reject `|roll| < 3` and shall warn at `|roll| < 10` | Must | Validator unit tests | Unit |
| QV-20-REQ-010 | Superseded ballots shall be excluded; ordering is the log sequence number plus the QV-16 `supersedes` chain (QV-ADR-016), with no voter-chosen `seq` | Must | Server reorder simulation yields identical tally | Integration |
| QV-20-REQ-011 | Benaloh-spoiled ballots shall be published with randomness and never counted | Must | Spoiled ballot absent from aggregate; opening re-encrypts to same ciphertexts | Integration |
| QV-20-REQ-020 | Weighted voting shall apply public weights via scalar multiplication with `ΣW ≤ 2^40` | Should | Aggregate equals Σ w·x on random vectors | Unit |
| QV-20-REQ-021 | Delegation shall be public, depth-capped (default 3), cycle-safe, overridden by a delegator's own ballot, and disallowed with unlinkable tokens | Should | Cycle/override/depth fixtures; validator rejects combination | Unit |
| QV-20-REQ-030 | Beacon-random tie-break shall use a beacon round later than close time with unbiased index derivation | Should | Fixtures; manifest validator rejects earlier round | Unit |
| QV-20-REQ-040 | The ranked encoding (§8) shall not be enabled in releases until independent cryptographic review signs off | Must | Release gate in QV-11 | Review |
| QV-20-REQ-041 | Schulze and Ranked Pairs implementations shall pass published example vectors and cross-check against at least one independent implementation | Must | CI cross-test on ≥ 1,000 random matrices | Unit, differential |
| QV-20-REQ-042 | Ranked elections shall be limited to n ≤ 10 candidates (weak orders n ≤ 7) | Should | Validator test | Unit |

## 16. Data and privacy
- Inputs: manifest, roll, ballots (ciphertext+proofs), delegations. Outputs: aggregates, decryptions, result, audit transcript.
- Visible to server/observers: ciphertexts, proofs, the method, counts. Secret: individual selections (given ≥ t trustees honest and ≥ 1 honest trustee-set; ADR-008).
- Not claimed: coercion/vote-buying resistance; secrecy against quantum adversaries (ADR-013); anonymity of participation in Phase 1; hiding of small-group outcomes (§10).

## 17. Security and abuse cases
| Case | Attacker | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Over/under-vote ballot | Malicious client | Skewed tally | P02/BIT proofs rejected by all verifiers | Soundness depends on DL hardness |
| Ballot replay across elections | Server/voter | Duplicate/foreign votes | Statement-bound Fiat–Shamir, manifest hash | None known |
| Server reorders revotes | Server | Wrong ballot counted | Signed `supersedes` chain (QV-16 §5.14.2) | Withholding (availability) |
| Pattern signalling in ranked ballots | Vote buyer | Coercion | Documented non-claim; revoting | Residual (ADR-008) |
| Small-group inference | Coalition | Reveals last vote | §10 warnings | Residual |
| Malformed point / small-subgroup | Malicious client | Crash/forgery | ristretto255 canonical decoding rejects invalid encodings (prime-order abstraction) | Library bugs |
| Beacon manipulation | Beacon operators | Biased tie | Fallback `fail`; multi-beacon option | Low |
| Delegated-weight pressure | Powerful delegate | Social coercion | Public delegation is documented; override right | Residual |

## 18. Interfaces and dependencies
Upstream: QV-16 (encodings, FS transcript), QV-04 (roll, tokens), QV-03 (rule semantics). Downstream: QV-09 (schemas `BallotV1{method,vector,proofs}`), QV-10 (ballot UI), QV-11 (vectors). Versioning: each method has an identifier `qv.method.<name>.v1`; semantic changes require a new version and new test vectors (ADR-013 algorithm agility).

## 19. UX, accessibility, localization (implications; owner QV-10/QV-13)
- Show "you may choose exactly k / between a and b" counters; disable submit until valid, but still show reason text (not colour only).
- Approval: explain "choose as many as you accept". Single-choice with >3 options: surface a hint that approval/ranked exist (organizer-facing only).
- Ranked: provide keyboard-operable drag-free ordering (up/down buttons, numeric rank fields); screen-reader order announcements; "unranked = tied last" explained.
- Show estimated proof time and a progress indicator for ranked (seconds on low-end phones); support Web Worker so UI doesn't freeze.
- Quorum/threshold displayed as a formula and example sentence ("Passes if at least 2 of every 3 yes-or-no votes are yes, and at least 40 members vote").
- Weighted/delegated: show a voter their effective weight before casting; delegations visibly public with explicit consent copy.
- Tie rule displayed before voting; result page states the tie rule outcome and small-group notice.

## 20. Operations
Configuration: method parameters in manifest only (immutable after open). Monitoring: counts of `E_*` rejection codes (no PII, QV-31). Backups include proofs (needed for audit). Incident: `TALLY_OUT_OF_BOUND` or verifier FAIL → QV-12 integrity runbook.

## 21. Testing and verification
Unit: encode/decode, each proof (honest + 100% mutation set), threshold arithmetic boundaries, Schulze/RP vectors, delegation fixtures. Differential: Schulze vs. independent implementation. Fuzz: ballot parser and proof verifier. Property: homomorphic sum equals plaintext sum for random ballots. Perf: BSGS table build; ranked n=10 proof/verify time. Release-blocking: all MVP vectors pass; ranked locked behind QV-20-REQ-040.

## 22. Constraints and assumptions
- Assumes ≥ t honest trustees for secrecy and DL hardness in ristretto255 for soundness/secrecy.
- Ballot size/time estimates in §8.3 are analytical and must be benchmarked.

## 23. Open questions
| Question | Owner | Target | Proposed default |
|---|---|---|---|
| QV-OQ-1 Is weak-order (tie) support worth ~8x ballot size? | Protocol lead | Phase 2 design review | Strict orders default; ties opt-in n ≤ 7 |
| QV-OQ-2 Should slack placement be hidden by permutation? | Cryptographer | QV-16 review | Fixed trailing slack (no leak) |
| QV-OQ-3 Pass/fail-only disclosure via ZK/MPC comparison | Researcher | Phase 3 | Not offered |
| QV-OQ-4 Which beacon(s) for tie-break? | Protocol lead | Phase 1 end | drand quicknet, fallback `fail` |
| QV-OQ-5 Multi-winner Schulze (STV-like) | Researcher | Phase 3 | Out of scope |

## 24. Proposed ADRs
- **QV-ADR-P20-1 — Slack-selection encoding for min/max limits.** Use BIT + constant-sum P02 over real+slack bits instead of range proofs. Rationale: reuses audited primitives, mirrors ElectionGuard's selection-limit approach [R6]. Consequence: aggregates of slack reveal total undervote count only.
- **QV-ADR-P20-2 — Ranked ballots via encrypted pairwise bits with per-triple weak-order pattern proofs.** Strict-order shortcut via 3-cycle test. Gated by independent review (adopted as QV-ADR-023, n ≤ 12). Alternatives: mixnet (ADR-004), decrypting rankings per ballot (violates secrecy).
- **QV-ADR-P20-3 — Delegation is public, static, Phase 1 only.**
- **QV-ADR-P20-4 — Verifiers check `M·G` instead of solving dlog.**
- **QV-ADR-P20-5 — Declared tie-break kinds including beacon-random.**

## 25. Approval and change history
| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |
| Independent cryptographer | Pending (§8 mandatory) | — | — |

## References (accessed 2026-10-21 unless noted)
- [R1] D. Chaum, T. Pedersen, "Wallet databases with observers", CRYPTO '92 (CP proof).
- [R2] R. Cramer, I. Damgård, B. Schoenmakers, "Proofs of partial knowledge and simplified design of witness hiding protocols", CRYPTO '94 (CDS).
- [R3] M. Schulze, "The Schulze Method of Voting", arXiv:1804.02973 (v18, Oct 2025) — https://arxiv.org/pdf/1804.02973 (verified by search); also Schulze, Social Choice and Welfare 36 (2011) 267–303 [UNVERIFIED pages].
- [R4] T. N. Tideman, "Independence of clones as a criterion for voting rules", Social Choice and Welfare 4 (1987) 185–206 [UNVERIFIED pages].
- [R5] D. Bernhard, O. Pereira, B. Warinschi, "How not to prove yourself: pitfalls of the Fiat–Shamir heuristic and applications to Helios", ASIACRYPT 2012.
- [R6] ElectionGuard specification (Microsoft/ElectionGuard), https://github.com/microsoft/electionguard [selection-limit proofs; version not checked].
- [R7] S. Brams, P. Fishburn, "Approval Voting", 1983 (book).
- [R8] Marquis de Condorcet, "Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix", 1785.
- [R9] drand, https://drand.love [not fetched; verify round/chain parameters at implementation].
- [R10] B. Adida, "Helios: Web-based Open-Audit Voting", USENIX Security 2008.
- [R11] J. Benaloh, "Simple verifiable elections", EVT 2006 (Benaloh challenge).
