# Audit: packages/crypto and packages/protocol

* Scope: `packages/crypto/src/*`, `packages/protocol/src/*` (excluding the QV-18 log-layer internals of `logcheck.ts`, which were only
  checked where they gate protocol decisions). Report only: no source or test file was changed by this review.
* Date: 2026-10-21. Branch `claude/quietvote-audit-qa-1`. The working tree changed while the review ran, because the coordinator
  was editing `protocol` at the same time (see CP-01 status).
* **This is an AI-assisted review, not an independent professional audit.** No claim of completeness is made. QuietVote is unaudited and
  not for real elections.
* Method: manual reading of all in-scope source files and the relevant parts of QV-16, QV-07 and NOTES. Throwaway proof-of-concept
  scripts and a mutation sweep were run in the session scratchpad, outside the repo. Every finding below has a PoC that was run, or
  exact reasoning with file:line.

## 1. Threat model (scope-specific)

**Assets.** Ballot secrecy, meaning the plaintext of each cast ballot. Trustee shares `s_j` and DKG secrets `a_ik`, `e_i`. Integrity
of the counted set and the tally. Agreement between independent verifiers on the verdict. Benaloh cast-or-audit assurance. Voter, trustee
and coordinator signing keys.

**Trust boundaries.** (1) Bytes from the board or bundle into `verifyElection` / `analyzeBallotLog`: everything there is hostile.
(2) The coordinator's requests to trustees (`trusteeDecryptTally`, `trusteeDecryptSpoiled`): the coordinator is untrusted.
(3) Voter client to board: the voter can act against their own privacy if a coercer pressures them. (4) Local secret files
(`bundle-cipher`). (5) The `@noble/*` primitives are trusted.

**Adversaries.** A malicious voter or a coerced voter (QV-07 A4). A malicious coordinator or board operator. Fewer than `t`
malicious trustees (A8). A malicious DKG dealer. A failed RNG on a trustee device (REQ-013 hedging). An independent re-implementer
whose verifier must reach the same verdict (QV-16 §5.12.2, universal verifiability).

**Assumptions.** DDH in ristretto255. ROM for Fiat-Shamir. At most `t-1` trustees collude. `systemRng` is a CSPRNG. The noble
libraries are correct. Witnessing and log integrity are covered elsewhere (log-layer / board audits).

**Failure modes considered.** Weak Fiat-Shamir (frozen heart) and domain-separation confusion. Non-canonical or small-order encodings.
Nonce reuse. Out-of-range dlog. Rogue-key and complaint abuse in the DKG. Trustees used as a decryption oracle. Spoil/cast confusion. The
verifier failing open. Schema malleability. Disagreement between verifiers.

## 2. Findings

| ID | Severity | Title | Evidence | Remediation | Status |
|---|---|---|---|---|---|
| CP-01 | medium | A voter can re-wrap a counted ballot as a spoil (only `supersedes` changes). Trustees then decrypt the counted vote, and `E_SPOILED_CODE_CAST` is bypassed | `protocol/src/ballotlog.ts:96,124` (spoil/cast compared by code only); `protocol/src/tally.ts:64-66` (trustee checks mode only); `crypto/src/proofs.ts:119` (CDS does not bind `supersedes`) | Compare spoil and cast at the ciphertext level (any `alpha` of a spoil equal to any cast `alpha` makes the spoil inadmissible). Do this in `analyzeBallotLog`, in `trusteeDecryptSpoiled` (refuse), and in the verifier for both `reveal` and `trustees` modes | open. Related to TR-01. A partial fix (verifier, trustee mode only) was in the working tree during review; PoC still reproduces at the protocol level (see detail) |
| CP-02 | low | `cp-dec-nonce` hedge omits the ciphertext `(A,B)`. With a failed RNG, two partial decryptions for the same `(ctx,cid,oid)` reuse the nonce and leak `s_j` | `crypto/src/proofs.ts:219` (registry `crypto/src/transcript.ts:39`) | Add `pt(A)`, `pt(B)` (and `pt(M)`) to the hedged nonce fields (spec registry erratum). Optionally hedge PoK/DLEQ/keyconf nonces too (X-20) | open (PoC) |
| CP-03 | low | Closed-schema check accepts inherited property names (`constructor`, `toString`, `__proto__`, `valueOf`, ...) as "known" fields | `protocol/src/schema.ts:69` (`k in s.req`) | Use `Object.hasOwn(s.req, k)` / `Object.hasOwn(opt, k)` (and likewise for the required-field presence test) | open (PoC) |
| CP-04 | medium | Ed25519 "strict" policy admits mixed-order keys and R. Verification is noble's cofactored equation, while QV-16 §5.12.2 says "cofactorless-equivalent". Verifiers can disagree | `crypto/src/ed25519.ts:22-28,39`; `protocol/src/manifest.ts:35` (roll accepts such keys); `docs/16-crypto-protocol.md:601` | Reject points with a torsion component (`[ℓ]P ≠ O`) in `ed25519IsStrictPoint`, or pin the cofactored equation in QV-16. Add mixed-order vectors to QV-34 | open (PoC) |
| CP-05 | low | Base verifier does not order `roll-commit` against `election-open`. When the manifest has no `roll.root`, extra or conflicting `roll-commit` records are silently ignored | `protocol/src/verify.ts:283-288,341-354` | Require the `roll-commit` seq < `election-open` seq (F). Flag any second, differing `roll-commit` as equivocation (F) | open (reasoning) |
| CP-06 | info | Feldman/Pedersen DKG selective-abort bias: corrupt dealers see all `A_i0` and then choose to drop out (withhold R2 / false complaint), so they choose among `2^c` joint keys | `protocol/src/dkg.ts:301-361` | Known GJKR limitation. Document it in QV-17. Use a GJKR/Pedersen-VSS commitment phase if uniform `K` is required | open (reasoning) |
| CP-07 | info | `openWithPassphrase` takes the scrypt `logN` from the unauthenticated header (up to 22, about 4 GiB) before any check. A crafted bundle file can exhaust memory | `crypto/src/bundle-cipher.ts:19,35,73-75` | Let the caller cap `logN` (for example the value it sealed with), or lower `BUNDLE_MAX_LOGN` | open (reasoning) |
| CP-08 | info | Test gaps: crypto unit tests do not catch Fiat-Shamir field omissions (only the protocol frozen vectors do). Nothing catches the switch to ZIP-215 or mixed-order Ed25519 | mutation sweep, §4 | Add per-field challenge-mutation unit tests in `crypto/test/proofs.test.ts`. Add mixed-order / ZIP-215 divergence vectors | open |

Counts: medium 2, low 3, info 3. None fixed (report-only scope).

## 3. Details

### CP-01: spoil re-wrap of a counted ballot (medium)

The CDS and limit statements bind `ctx`, the voter binder, `cid`, `oid`, `K` and the ciphertext (`proofs.ts:119-121,173-175`).
They do not bind `supersedes`. A voter can therefore take their own counted cast body `X`, change only `supersedes` to arbitrary
bytes, sign it under `sig-spoil` with the zero `reveal_digest` (trustee mode), and post it. The result:

* `analyzeBallotLog` keys spoiled ballots and the `E_SPOILED_CODE_CAST` test by ballot code (`ballotlog.ts:96,124`). The code
  differs, so `X` stays counted and no finding is raised.
* `trusteeDecryptSpoiled` only checks the manifest flag and the zero digest (`tally.ts:65-66`). Trustees then produce
  partial decryptions of the counted ciphertexts, and `decryptSpoiled` publishes the counted plaintext.

This breaks QV-16 §1(e) and §5.16 ("never an individual cast ballot", "a decryption oracle for an individual cast ballot would break
secrecy"). It also breaks the QV-07 AT-8 mitigation ("spoiled ballots are not counted; coercer cannot tell"): a coercer can check
that the decrypted spoil's ciphertexts are those of the final counted ballot. Revoting does not help, because a revote changes the
counted ballot and the coercer sees that. The same trick works in `publish` mode if the client keeps `xi`: `verifySpoilReveal`
recomputes with `body.supersedes`, so the public reveal opens the counted ballot.

PoC: `/tmp/claude-0/-home-user-quietvote/1beef061-d5dc-563f-9433-8e737ea98880/scratchpad/poc/cp1_spoil_rewrap.ts`. Output, first run
and a re-run near the end of the review on the then-current tree:

```
findings: []
voter0 cast counted: true
rewrapped spoil accepted: true benaloh check ok: true
trustees decrypted counted vote of voter0: {"budget":["no"],"chair":["ann"],...} actual: {"budget":["no"],"chair":["ann"],...}
verdict: PASS benaloh: pass counted: 6
```

Status note: during the review the coordinator added `castAlphas`/`collectAlphas` (`ballotlog.ts:58-65,138`) and a verifier check
(`verify.ts:~548-556`, "TR-01"). That check raises `E_SPOILED_CODE_CAST` only when the tally lists a **trustee-mode** spoil that
shares an alpha with a cast envelope. At the last check it did not cover four things: (a) `trusteeDecryptSpoiled` still decrypts,
(b) `analyzeBallotLog` still accepts the spoil and keeps `chk.benaloh.spoiled = pass` when the tally does not list it, (c) the
`reveal` mode branch, and (d) the re-wrap of a spoiled-and-revealed `X` as a later cast. Suggested regression tests are each of
(a)-(d) using the PoC construction.

### CP-02: decryption-proof nonce hedge misses the statement (low)

`decProve` derives `u = hs_nz("cp-dec-nonce"; s_j, ctx, cid, oid, rand32)` (`proofs.ts:219`). If `rand32` repeats (the failed RNG
that REQ-013 hedging targets) and the trustee is asked to decrypt two different aggregates for the same option, `u` repeats and
`s_j = (s1-s2)/(c1-c2)`. A coordinator can obtain two aggregates by presenting two different close markers or log views; the trustee
recomputes the aggregates, but from whatever log it is given. `spoilDecProve` appends the ballot code, so it is safe per ballot. PoC
`/tmp/claude-0/-home-user-quietvote/1beef061-d5dc-563f-9433-8e737ea98880/scratchpad/poc/cp2_decnonce.ts` (with `constantRng`):
`both proofs verify: true true`, `recovered s_j == s_j: true`. Related known item: PoK/DLEQ/keyconf nonces are plain CSPRNG, not
hedged (NOTES X-20). Under a fully constant RNG, `dkgDeal` would also derive identical coefficients.

### CP-03: schema `in` check (low)

`check()` tests `k in s.req`, which is true for inherited `Object.prototype` names. PoC
`/tmp/claude-0/-home-user-quietvote/1beef061-d5dc-563f-9433-8e737ea98880/scratchpad/poc/cp3_schema.ts`: an unknown field `foo` is
rejected, but `constructor`, `toString`, `hasOwnProperty`, `__proto__`, `valueOf` inside a strictly parsed signed record's `sig`
object all return `null` (accepted). Signed bodies are not malleable, because the signature covers `JCS(body)`. Unsigned wrappers
(`sig`, envelope top level, the tally record whose signature is only a convenience) can be re-encoded by a relay, which violates
QV-16 §5.5 item 7 and the uniqueness of record bytes. The log layer catches it only when `opts.log` is supplied.

### CP-04: mixed-order Ed25519 keys and verifier disagreement (medium)

`ed25519IsStrictPoint` rejects non-canonical and small-order points but accepts `aB + T8` (torsion component).
`ed25519.verify(..., {zip215:false})` in noble 2.4.0 checks the cofactored equation `[8](R + kA - SB) = O`
(`node_modules/@noble/curves/abstract/edwards.js`, `verify`). QV-16:601 calls this "cofactorless-equivalent". A voter, trustee
or coordinator who controls their key can produce signatures that QuietVote accepts and a cofactorless RFC 8032 verifier (for example
Go `crypto/ed25519`) rejects. Two spec-following verifiers then count a different ballot set. That defeats the stated rationale
("would otherwise allow two verifiers to disagree"). PoC
`/tmp/claude-0/-home-user-quietvote/1beef061-d5dc-563f-9433-8e737ea98880/scratchpad/poc/cp4_mixed_order.ts`:
`strict point accepts mixed-order key: true torsion-free: false` and
`QuietVote ed25519Verify=true cofactorless RFC8032=false`. `rollRoot` (`manifest.ts:35`) admits such voter keys.

### CP-05: roll-commit ordering (low)

`roll-commit` records are collected at any seq (`verify.ts:283-288`). When `m.roll.root` is absent, only `rollCommits[0]` is compared
to the supplied roll and later, different commits are ignored (`verify.ts:341-350`). Nothing compares the `roll-commit` seq with
`election-open`/`election-close`/`tally` except the optional log-layer gating (`logcheck.ts:393`), which runs only with
`opts.log` and `witness_quorum > 0`. A coordinator can therefore fix the eligibility list after voting, or show conflicting roll
commits, and still get PASS from the base verifier. (Reasoning only: the test sim always pins `roll.root`, so a PoC would need a
custom DKG setup.)

### CP-06: DKG bias (info)

Commit-then-reveal (`dkg.ts:259-282`) stops adaptive choice of `A_i0`. After the R1 reveal, though, a corrupt dealer can still
withhold its R2 package (`dkg.ts:304-325`) or file a false complaint (`dkg.ts:352-354`), which removes it (or the accused) from
`Q`. With `c` corrupt trustees that is up to `2^c` candidate keys `K`. This is the Gennaro-Jarecki-Krawczyk-Rabin observation:
ElGamal secrecy is believed to survive it, but `K` is not uniform. Rogue-key attacks are blocked by the per-coefficient PoK bound to
`(mh, i, k)` (`proofs.ts:49-62`) and by the symmetric duplicate-`A_0` rule.

### CP-07: bundle KDF work factor from the header (info)

`openWithPassphrase` reads `logN` (≤ 22) from an unauthenticated header and runs scrypt with
`maxmem = 128*8*(2^logN+2)+65536`, about 4 GiB at 22, before any AEAD check. These are local trustee files, so the impact is
availability only.

## 4. Mutation sanity (scratchpad copies only)

The crypto package and the crypto plus protocol packages were copied to the scratchpad. Each mutation was applied there and the tests
re-run.

| Mutation | crypto tests | protocol subset (vectors, attacks, ballot, dkg, tally) |
|---|---|---|
| M3 CDS challenge drops `ct.A` / M7 limit drops `L` / M8 dec drops `Yj` / M15 `hs_nz` counter first | SURVIVED | KILLED (frozen vectors) |
| M4 dlog bound, M5 small-order allowed, M6 scalar range, M10 proof scalar upper bound, M11 frame without `lp`, M12 spoil drops code, M13 PoK identity, M16 ElGamal `r=0`, M19 uppercase hex, M20 Lagrange dup | KILLED | n/a |
| M18 `zip215: true` | SURVIVED | SURVIVED (CP-04/CP-08) |
| M1 ristretto round-trip, M2 CDS identity checks, M9 Feldman range, M14 keyconf identity, M17 `c0==c` alternative | SURVIVED | M2/M14 SURVIVED. Judged equivalent: callers decode with `nonIdentity`/`scalarFromBytes`, noble decode is already strict, and M17 still needs a Fiat-Shamir fixed point |

## 5. Checked, no finding

* Transcript: injective framing (`lp` on every field plus a field count), closed label registry with kind check, 512-bit wide reduction.
  Every challenge binds the full statement (strong Fiat-Shamir): CDS (ctx, binder, cid, oid, K, A, B), limit (L, sums), dec/spoil
  (j, Yj, A/alpha, B/beta, M, code), PoK (mh, i, k), DLEQ (mh, i, j, E, R, S), keyconf (ctx, j).
* ristretto255: strict RFC 9496 decode plus round-trip, identity rejected at protocol decode sites, scalars strict `< ℓ`, non-zero sampling.
* Ballot copy/replay: the binder `H(ctx, voter)` inside CDS/limit stops ciphertext copy or re-randomisation by another voter. Cast and
  spoil use distinct signature labels.
* BSGS: table covers `[0, V]`, the result is re-verified, `null` maps to `E_DLOG_RANGE` (F). Bound `V` = counted voters. Contest
  sum bound is enforced.
* Trustee tally decryption recomputes aggregates and enforces the privacy floor (the trustee package re-derives the counted set via
  `analyzeBallotLog`).
* Verifier fail-closed: top-level catch gives FAIL. A missing election markers gives INCOMPLETE, never PASS. Aggregate identity, counted
  root, every share proof, subset consistency and exact-integer rules are all recomputed.
* Share cipher: single-use HKDF key per (S, i, j, R) with a zero IV. Complaint adjudication is deterministic and uses `R` from the shares
  record.

## 6. Commands run

* `npm test -w @quietvote/crypto`: 49 pass, 0 fail. `npm test -w @quietvote/protocol`: 165 pass, 0 fail (tree as of review time).
* PoCs: `node <scratchpad>/poc/cp1_spoil_rewrap.ts`, `cp2_decnonce.ts`, `cp3_schema.ts`, `cp4_mixed_order.ts` (from the repo root).
* Mutation sweeps: `python3 -I <scratchpad>/mut/mutate.py`, `python3 -I <scratchpad>/mut2/mut2.py`.
* `npm run typecheck` was not run (no code changed by this review).

## Disposition (coordinator, after the report)

| ID | Status |
|----|--------|
| CP-01 (medium) | **Fixed** in `analyzeBallotLog` (protocol/src/ballotlog.ts): a spoil of any mode sharing ElGamal `a` values with an envelope-valid cast under a *different* code is excluded from `spoiled`, ALARM `E_SPOILED_CODE_CAST` (`re-wrapped`), `chk.benaloh.spoiled` fails; same-code case keeps the old handling. Trustee relay (TR-01) already refuses. Tests: `protocol/test/audit.test.ts` (6 mode×order cases + control; 7 failed before the fix), `tally.test.ts`. Residual: `trusteeDecryptSpoiled` itself does not know the cast set (callers use `analyzeBallotLog`). |
| CP-03 (low) | **Fixed**: `Object.hasOwn` in the closed-schema check. Test: `protocol/test/audit.test.ts` (failed before). |
| CP-04 (medium) | **Fixed**: `ed25519IsStrictPoint` now also requires torsion-free, so cofactored and cofactorless verification agree. Test: `crypto/test/audit.test.ts` (failed before). Behaviour change: mixed-order keys/R values are rejected (honest keys are unaffected). |
| CP-02 (low) | **Open, declined**: adding A/B to the `cp-dec-nonce` hedge deviates from the registry field list `(s_j, ctx, cid, oid, rand32)` in QV-16; needs a spec-owner decision. Exposure needs a failed RNG plus two decryptions of the same (ctx, cid, oid) with different aggregates; the spoil path is code-bound. |
| CP-05 (low) | Open (roll-commit ordering vs election-open; second conflicting roll-commit ignored). |
| CP-06, CP-07, CP-08 (info) | Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4). |

AI-assisted review, not an independent professional audit. Unaudited; not for real elections.

## Second-wave triage

Date 2026-10-21. AI-assisted review, not an independent professional audit. Input: unverified findings from secondary (haiku) audits of
`packages/protocol` and `packages/crypto`. Method: a failing test or PoC was written first for each finding. Findings that reproduced and
needed no spec-owner decision got a minimal fix plus a regression test. Design questions are documented only. Tests:
`packages/protocol/test/second-wave.test.ts` (7) and `packages/crypto/test/second-wave.test.ts` (7). All 14 failed before the fixes and
pass after them.

| ID | Sev | Evidence (after fix) | Disposition | Status |
|----|-----|----------------------|-------------|--------|
| P1 / TSV-05 | medium (design) | `protocol/src/verify.ts:136,208`: the verdict ignores `chk.board.*`. Without `opts.log` the board checks stay `not_run` and only a caveat is added, so a cast the operator removed from the log can still yield PASS | Spec-owner decision (verdict semantics; the verifier package composes the log layer itself). No code change | open (design) |
| P2 | low | `protocol/src/tally.ts:41`: `trusteeDecryptTally([b,b,b])` passed the floor and decrypted one ballot | Refuse a repeated voter or code (`E_TRUSTEE_REFUSE`). Differencing over two different ≥floor subsets cannot be stopped without the log. The trustee package recomputes `counted` from the log (`trustee.ts` `verifiedElection`) and releases once, so it is not exposed. `decryptAggregates`/`buildTally` handle only public data | fixed (dup guard), test `P2`; differencing: open (API contract) |
| P3 | medium | `verify.ts:472`: a second signed tally with a different `T` gave PASS | A later differing body is F `E_RESULT`. An identical repeat stays L | fixed, test `P3` |
| P4 | medium | `ballotlog.ts:66`: a spoil with a bad attached reveal was dropped, so the same body cast later was counted (REQ-015) | Re-verify without `reveal`. If the voter signature holds, register the spoil, raise ALARM `E_SPOIL_MISMATCH` and fail benaloh. The later cast becomes `E_SPOILED_CODE_CAST` | fixed, test `P4/REQ-015` |
| P6 | low | `manifest.ts:65`: trustee and witness names skipped the NFC/bidi check | Check is extended to those names | fixed, test `P6` |
| P7 / TSV-03 | low | `verify.ts:478,558`: below the floor, `chk.tally.decrypt` read `pass` without any decryption (so verifier V10/V11 showed PASS) and the rules `fail` was overwritten to `not_run`. The verdict was already FAIL | `decrypt` is set to `pass` only after verification and combination. The rules failure is kept. Vectors regenerated | fixed, test `P7/TSV-03` |
| P8 | info | `types.ts:10` `E_TALLY_MISSING` is never emitted (a missing tally gives INCOMPLETE with no finding). `E_AEAD` is a crypto-layer code that `dkg.ts:114` maps to a complaint reason. Neither code is in the QV-16 §5.20 table | No defect reproduced. No change (adding a finding would alter every INCOMPLETE vector) | not reproducible (as a defect) |
| P9 | low | `verify.ts:391`: an invalid keyconf signed by trustee j shadowed j's later valid keyconf, so `\|T\|<t` gave FAIL | Only a valid keyconf settles j (§5.7.8) | fixed, test `P9` |
| P10 | info | `verify.ts:282,413`: duplicate `election-open/close` markers (m-of-n coordinator signed) are L, and the first one wins deterministically | Whether coordinator marker equivocation should be F is for the spec owner (QV-18) | open (design) |
| P11 | low | `verify.ts:537`: `tally.decrypters` was never compared, and `buildTally` listed every trustee that sent shares | Must equal the recomputed `T_valid` (F `E_DEC_PROOF`). `buildTally` emits `T_valid` | fixed, test `P11` |
| C1 | low | `crypto/src/share-cipher.ts:47`: identity `E_j` was accepted, so the key could be derived from public data | `E_IDENTITY` | fixed, test `C1` |
| C2 / CP-02 | low | see CP-02 | Spec deviation. Report only | open (spec) |
| C3 | info | `proofs.ts:50,67,85`: PoK, share-key and DH-reveal nonces come from the plain CSPRNG | Matches QV-16 §5.7.2 ("CSPRNG (or hedged)") and is listed as OQ-7. Hedging needs registry labels | open (design, OQ-7) |
| C4 | low | `elgamal.ts:21`: `r = l` passed, giving `A = O` | Require `0 < r < l` | fixed, test `C4` |
| C5 | low | `json.ts:193,209`: `canonicalize` serialised Map/Uint8Array/Date and NFD strings or lone-surrogate keys that `parseQvJson` rejects | Plain objects only, with NFC and surrogate checks on strings and keys | fixed, test `C5` |
| C6 | low | `proofs.ts:189`: a non-integer `L` threw `RangeError` out of `limitVerify` | Return false | fixed, test `C6` |
| C7 | low | `feldman.ts:44,56`: `lagrangeAtZero([0],0)` returned 1, and `feldmanVerifyShare(f(0),A,0)` returned true | Reject index < 1 | fixed, test `C7` |
| C8 | info | `proofs.ts:94,231`: `dhVerify` accepted `Ej = S = O` | Reject identity `Ej/R/S` (dh) and `Yj` (dec). Callers already decode these as non-identity, so this is defence in depth | fixed, test `C8` |
| C10 | low | `bundle-cipher.ts:19,74`: header `logN` up to 22 (~4 GiB scrypt) before authentication | `BUNDLE_MAX_LOGN` lowered from 22 to 20 (~1 GiB), plus an optional `maxLogN` on open. The floor stays 18 (QV-17-REQ-021). Behaviour change: bundles sealed at 21 or 22 are refused; none exist in the repo | fixed, test `C10`; trustee could pass `maxLogN` (follow-up, out of scope) |
| C11 | info | `crypto/src/index.ts:4` (`rng.ts`): `streamRng`, `constantRng` and `vecrng` are exported from the main entry | Moving them to a `/testing` subpath would break tests in cli, server, trustee, verifier and web (out of scope). Not changed | open |

Commands run:

* `npm test -w @quietvote/crypto`: 57 pass, 0 fail.
* `node packages/protocol/test/vecgen/write.ts`, then `npm test -w @quietvote/protocol`: 187 pass, 0 fail (including `vectors.test.ts`,
  28 pass).
* `npx tsc -p tsconfig.json --noEmit`: clean.
* Other packages were run but not edited: board 48/0, trustee 53/0, web 105/0, server 136/0 (`e2e.test.ts` hit ECONNRESET once while run
  concurrently and passed when re-run alone).
* cli has 2 failures and verifier has 9. Cause: `packages/verifier/canary/corpus.json` is stale. It predates the QV-ADR-015 election-open
  binding fields, so its control bundle fails `E_MARKERS`. This was already the case before this triage.
* Five verifier log-layer tests fail for the same reason: `verifier/test/helpers/sim.ts:221` emits an unbound election-open. That is
  unrelated to this triage.
* A corpus built in memory from the regenerated vectors (`buildCorpus()` + `runSelfTest`) passes: 36/36 rejected, control accepted. Fix
  (verifier scope): `node packages/verifier/scripts/build-corpus.ts`.
* The vector regeneration rewrote `test-vectors/`. Only the `chk.tally.decrypt` statuses of affected reports are expected to differ. This
  review did not run git, so the coordinator should review that diff.
