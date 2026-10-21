# QV-05 — Ballot Protocol (user-facing)

**Module ID:** `ballot-engine` (M5, with M4 log and M7 tally-verifier)
**Status:** Draft
**Owner:** Protocol lead (project owner until appointed)
**Last reviewed:** 2026-10-21
**Related specs:** QV-03 (manifest, lifecycle), QV-04 (eligibility), QV-06 (data), QV-07 (threat model), **QV-16 `docs/16-crypto-protocol.md`** (byte-level cryptography — authoritative for encodings, domain strings, proof equations; written concurrently), **QV-20 `docs/20-voting-methods.md`** (voting-method encodings and tally rules — authoritative for methods); ADR-004, 005, 006, 007, 008, 010

## 1. Objective

Describe, at the level engineers, auditors and group stewards need, **what happens to a ballot from ballot definition to archive**, which artifacts are public or secret, **who can learn what**, what each participant can verify, and how failures are handled. This document deliberately does **not** fix byte formats, hash inputs, proof equations or parameter encodings — those live in QV-16 and are referenced by section name only. Where this spec and QV-16 disagree on bytes, QV-16 wins; where they disagree on guarantees or user-visible behaviour, this spec wins and QV-16 must be corrected.

## 2. Scope

**In scope:** protocol lifecycle; ballot envelope fields (logical); submission, receipts, cast-or-audit, revoting; bulletin-board artifacts and visibility; tally and verification procedure; guarantees and non-claims; error codes; failure policy; summary of voting methods.
**Out of scope:** curve/proof/KDF specifics (QV-16); method encodings in full (QV-20); identity enrolment (QV-04); UI wording (QV-10).

## 3. Protocol lifecycle

Primitives (ADR-004): ristretto255 group; exponential ElGamal per selection; CDS/Chaum–Pedersen disjunctive proofs for bit-ness and Chaum–Pedersen proofs for sums/decryption; t-of-n threshold decryption from a Pedersen/Feldman verifiable DKG among trustees; Fiat–Shamir over the full statement; Benaloh challenge. Log: RFC 9162-style Merkle log (ADR-007).

```mermaid
sequenceDiagram
  autonumber
  participant St as Stewards
  participant Tr as Trustees
  participant Log as Bulletin board (untrusted)
  participant V as Voter client
  participant Au as Verifier / Auditor
  St->>Log: GroupRules, roll snapshot, election params
  Tr->>Log: DKG messages (commitments, shares encrypted, complaints)
  Tr->>Log: joint public key + key checks
  St->>Log: signed ElectionManifest (binds rules, roll, trustees, joint key)
  Log-->>V: OPEN at open_at
  V->>V: encode + encrypt + prove + (optional audit) + sign
  V->>Log: ballot envelope
  Log-->>V: signed receipt; later STH + inclusion proof
  Log->>Log: CLOSE entry at close_at
  Au->>Au: aggregate ciphertexts (anyone can)
  Tr->>Log: partial decryptions + proofs (≥ t)
  Au->>Au: combine, solve small discrete log, apply outcome rules
  Log-->>Au: report + export bundle
  Au->>Au: verify all (V1…V14)
  Note over St,Au: challenge window → FINAL → ARCHIVE; trustees destroy key shares after audit window
```

### 3.1 Phases and artifacts

| # | Phase | What happens | Artifacts produced | Visibility |
|---|---|---|---|---|
| P0 | Definition | Ballot (contests, options, method params) is part of the manifest; versioned by `manifest_id` | Contest definitions, proposal hashes | Public |
| P1 | Eligibility setup | Roll snapshot built (QV-04 §4–5) | `roll.snapshot`, root | Public (labels per policy) |
| P2 | Key ceremony | Trustees run DKG (QV-16); each confirms a key check | DKG transcript, `joint_pk`, key-check hashes | Public (transcript); trustee secret shares **trustee-only** |
| P3 | Manifest | Stewards sign manifest | `ElectionManifest` | Public |
| P4 | Open | Scheduler appends `election.open` | Open entry | Public |
| P5 | Cast | Client builds and submits envelope; server validates and logs | `ballot` entries, receipts, STHs | Entries public; receipt voter-held |
| P6 | Audit (optional) | Voter spoils a test ballot, checks it elsewhere | `ballot.spoiled` entries (test plaintext + randomness) | Public |
| P7 | Close | `election.close` entry fixes ballot index cut-off | Close entry, STH | Public |
| P8 | Aggregate | Counted ballot set derived; ciphertexts summed per selection | `tally.aggregate` (+ included-ballot list hash) | Public |
| P9 | Decrypt | ≥ t trustees post partial decryptions with proofs | `tally.share` entries | Public |
| P10 | Result | Plaintext totals recovered; outcome per QV-03 §7 | `tally.result`, report | Public |
| P11 | Verify | Anyone runs verifier | Report hash (optionally posted) | Public |
| P12 | Challenge / recount | QV-03 §8 | `dispute.*` entries | Public |
| P13 | Archive & destruction | Retention (QV-06 §5); trustees destroy shares after audit window; bundle exported | Export bundle, destruction attestations | Public / trustee |

## 4. Ballot submission

### 4.1 Logical envelope (bytes in QV-16)

| Field | Meaning |
|---|---|
| `proto` | `qv/1` |
| `election_id`, `manifest_id` | Binds ballot to the exact rules the voter saw |
| `voter_pk` | Phase 1: roll key (Phase 2: ephemeral token key; Phase 3: absent) |
| `contests[]` | per contest: ciphertext vector (one ElGamal ciphertext per selection) + proofs (bit-ness per selection; sum constraint per method) |
| `ballot_id` | Hash of the canonical encoded ballot (the **tracking code** shown to the voter, grouped base32 with checksum) |
| `supersedes` | Optional `ballot_id` the voter intends to replace (informational; order is defined by the log) |
| `client_info` | Client build hash (for ADR-010 transparency); no user agent |
| `sig` | Voter signature over the canonical envelope with domain separation |

Size budget: ≤ 64 KiB per ballot (10 contests × 10 selections fits well within, per QV-16 estimates).

### 4.2 Server-side validation (M8 using M5 `validate`, pure and deterministic)

1. Parse and bound-check; `proto` known. 2. Election exists, state OPEN (not HALTED), manifest matches. 3. Signature valid; `voter_pk` eligible (QV-04) and not rotated/revoked. 4. All proofs verify against `joint_pk` and the method's constraint. 5. Revoting policy: `single` → `E_ALREADY_VOTED` if voter has a ballot; `allowed` → accept. 6. Idempotency: same `ballot_id` → return original receipt. 7. Append to the log; only then return success (QV-01-REQ-006).
Any failure leaves **no state change** and returns a specific code (§9).

### 4.3 Receipts
On success the server returns a signed receipt `{ballot_id, election_id, log_entry_hash, log_time, mmd}` (a promise to include the entry in an STH within the maximum merge delay `mmd`, default 60 s), analogous to a Certificate Transparency SCT. Within `mmd` the client fetches the **inclusion proof** to a signed tree head; later it fetches a **consistency proof** from that STH to the final one. A receipt without a matching inclusion proof by `mmd` is evidence of misbehaviour and is the basis of challenge G1. The client stores receipts locally and offers export; if the voter has no receipt, they cannot prove omission (documented).

### 4.4 Cast-or-audit (Benaloh)
Before casting, the client displays the tracking code of the encrypted ballot *before* asking the voter to choose between **Cast** and **Audit**. On Audit the client reveals the randomness and plaintext of that ciphertext to a verifier (a second device or the standalone verifier page), the ciphertext is marked `ballot.spoiled`, and a **fresh** encryption is produced for the real ballot. Because the client must commit to the ciphertext before the voter chooses, it cannot tell an audit from a cast; if it alters *m* ballots and each is audited independently with probability *a*, the chance that none is caught is (1 − a)^m (derivation and caveats in QV-16); the UI shall say plainly that auditing protects everyone if enough voters do it and that audited ballots do **not** count. Audit instructions tell the voter to use test selections, never their real choice, because the spoiled opening is public.

### 4.5 Revoting
If `revoting = allowed`, the latest accepted ballot per voter by log index counts; earlier ones are retained in the log and ignored. Revoting is a **partial** mitigation against coercion (a coerced vote can be replaced later) and is not a coercion-resistance claim. The number of ballots per voter is visible in Phase 1.

### 4.6 Failure and retry
Network failure after send: client retries the same `ballot_id`; the server answers with the original receipt (idempotent). A client crash before send leaves no log entry; the draft is not persisted (to avoid local plaintext). Time zones: UI always shows UTC and local close time.

## 5. Guarantees and who can learn what

### 5.1 Guarantees table (Phase 1 unless noted)

| # | Guarantee | Adversary | Assumptions | Evidence / mechanism | Not claimed |
|---|---|---|---|---|---|
| G-S1 | **Ballot secrecy** from other members, stewards, observers | Any single party or coalition without ≥ t trustee shares | ≥ n−t+1 trustees honest *or non-colluding*; DDH hard in ristretto255 (classical); voter's device and client code honest | ElGamal IND-CPA with threshold key; no single decryption key | Quantum adversary (ADR-013); compromised voter device; malicious client build |
| G-S2 | Secrecy from the **operator** | Operator + ≤ t−1 colluding trustees | As G-S1; client JS **not** replaced by operator | Operator never holds a share or plaintext | **Operator serving malicious JS** can break secrecy → ADR-010 mitigations (reproducible builds, SRI, pinned client, CLI voting) are partial |
| G-S3 | Secrecy against **t or more colluding trustees** | — | — | **None.** Ballots are public ciphertexts; t trustees can decrypt each | Stated as the trust base; AC6 independence reduces likelihood |
| G-I1 | **Eligibility** enforcement | Ineligible key holder, operator inserting ballots | Roll correct (steward-trusted, QV-04 §3.4); Ed25519 EUF-CMA | Signature + roll membership check by every verifier | Distinctness of persons |
| G-I2 | **Duplicate-vote prevention** | Member, operator | Log order public and consistent | Latest-per-voter by log index | Same person with two keys |
| G-V1 | **Cast-as-intended** | Malicious client | Voter performs audit (probabilistic) on an independent device | Benaloh challenge | Voters who never audit; coordinated client+device compromise |
| G-V2 | **Recorded-as-cast** | Operator dropping/altering a ballot | Voter keeps receipt and checks inclusion proof | Signed receipt + inclusion/consistency proofs | A voter who never checks |
| G-V3 | **Tallied-as-recorded** | Operator, stewards, trustees | Anyone runs verifier | Public aggregation; Chaum–Pedersen decryption proofs | A verifier built from compromised source |
| G-V4 | **Tally correctness / universal verifiability** | Any | At least one honest verifier build | Bundle + checks V1–V14 | — |
| G-V5 | **Integrity under server compromise** | Compromised operator/server | Honest verifiers and monitors, mirrors | Detection (not prevention) by Merkle log; liveness may fail | Silent integrity compromise is prevented; denial of service is not |
| G-A1 | **Availability** | Operator | — | None; exit via export and self-host | Availability is operator-trusted only (ADR-008) |
| G-R1 | Participation privacy | — | — | **Not provided in Phase 1.** Phase 2/3 per QV-04 §9–10 | Anonymous participation before Phase 2 |
| G-C1 | Coercion resistance / receipt-freeness | Coercer | — | **Not provided.** Tracking code and spoiled openings may serve as vote-buying evidence in some constructions; revoting only partially mitigates | Explicit non-claim (ADR-008) |
| G-L1 | Long-term secrecy | Future quantum / key compromise | — | Not provided; key shares destroyed after the audit window | ADR-013 |

### 5.2 Who can learn what (Phase 1)

Legend: ● learns it; ○ cannot (under stated assumptions); ◐ learns only with extra collusion noted.

| Information | Other member | Steward | Operator (server) | Public observer | < t trustees | ≥ t trustees | Compromised voter device | Malicious client build (via operator) |
|---|---|---|---|---|---|---|---|---|
| Voter A's choice | ○ | ○ | ○ | ○ | ○ | ● (if they take the log's ciphertext) | ● (A's own) | ● (that voter's) |
| That A voted; A's key | ● | ● | ● | ● (public log) | ● | ● | ● | ● |
| How many ballots A cast, when | ● | ● | ● | ● | ● | ● | ● | ● |
| A's IP address | ○ | ○ | ● (transient; not persisted by default) | ○ | ○ | ○ | — | ● |
| A's label ↔ key | ◐ (if labels visible to members) | ● | ● | ◐ (per `roll_labels`) | ◐ | ◐ | — | — |
| Running tally before close | ○ | ○ | ○ | ○ | ○ | ● (if they collude early; trustee tool refuses before close) | — | — |
| Final per-option totals | ● (after P10) | ● | ● | ● | ● after P10 | ● | ● | ● |
| Individual ballot revealed by audit | ● (spoiled test ballots are public) | ● | ● | ● | ● | ● | — | — |
| Whether a ballot was dropped | ◐ (receipt holder) | ◐ | ● (it did it) | ◐ (receipt holder or monitor of STHs) | ○ | ○ | — | — |
| Number of eligible/turnout | ● | ● | ● | ● | ● | ● | — | — |

**Small-group caveat.** Totals can reveal individual votes when N is small or a result is unanimous; this is a property of publishing any exact tally, not a flaw in encryption. Mitigations: QV-06 §9, manifest warning `W-SMALL-ROLL`.

## 6. Bulletin board: artifacts and verification

| Artifact | Log entry type | Producer | Visibility | Verified by |
|---|---|---|---|---|
| Group rules chain | `rules` | Stewards | Public | V1 |
| Roll snapshot / root | `roll.snapshot` | Steward/M3 | Public (labels per policy) | V2 |
| DKG transcript | `dkg.*` | Trustees | Public | V3 |
| Manifest | `election.manifest` | Stewards | Public | V1 |
| Open/close/halt | `election.*` | System/authority | Public | V7 |
| Ballot | `ballot` | Voter via server | Public | V5 |
| Spoiled ballot | `ballot.spoiled` | Voter | Public | V8 |
| Roll amendments, rotations | `member.*`, `roll.*` | Voter / stewards | Public | V2, V13 |
| Aggregate | `tally.aggregate` | Anyone (system posts) | Public | V9 |
| Decryption shares | `tally.share` | Trustees | Public | V10 |
| Result and outcome | `tally.result` | System | Public | V11–V12 |
| Disputes | `dispute.*` | Members/arbiters | Public (body hash; body exportable) | QV-03 §8 |
| Signed tree heads | (STH) | Log operator (+ witnesses) | Public | V4 |

The log offers: `append` (authenticated by entry type), `get`, `inclusionProof(entry, treeSize)`, `consistencyProof(m, n)`, `latestSTH`. Witness cosigning and mirrors are optional (ADR-007); a **monitor** (any party) polling STHs verifies consistency over time and gossips STHs out-of-band to detect split views. A single-server deployment without witnesses cannot detect a split-view attack by itself: receipt holders and mirrors are the defence — stated as residual risk.

## 7. Tally and verification procedure

### 7.1 Tally
1. **Counted set:** all `ballot` entries with index < index(`election.close`), validated; per voter pick the latest (or only) ballot; remove voters excluded by `roll.revoke`; (Phase 2/3: per token/nullifier).
2. **Aggregate:** for each contest and selection, sum ciphertexts (component-wise group addition). Post `tally.aggregate` with the Merkle root of the included `ballot_id`s so anyone can check inclusion of their own ballot in the tally.
3. **Decrypt:** each trustee (≥ t needed) computes a partial decryption of every aggregate ciphertext and a Chaum–Pedersen proof against its published verification key; posts it.
4. **Combine:** Lagrange interpolation in the exponent over any valid t-subset; recover `m·G`; find `m` by bounded discrete-log search (m ≤ N ≤ 2,000 → table lookup).
5. **Outcome:** apply QV-03 §7 (quorum, threshold, ties) with integer arithmetic.
6. **Report:** machine-readable JSON + human-readable summary; includes hash of manifest, log head, per-check results.

### 7.2 Verifier checks (normative; names used across specs)

| Check | Verifies | Fail effect |
|---|---|---|
| V1 | Rules chain and manifest signatures, thresholds, rule bounds (QV-03 §3, §13) | INVALID |
| V2 | Roll root recompute; inclusion; alias/rotation/amendment chain; steward threshold for amendments | INVALID |
| V3 | DKG transcript: commitments, complaints resolution, joint public key, each trustee's verification key | INVALID |
| V4 | STH signatures; monotone sizes; all consistency proofs; witness cosigs if declared | INVALID |
| V5 | Every ballot: signature, eligibility at its log index, proofs (bit/sum), manifest binding | Ballot rejected; report lists; *if the server accepted it and it affects counted set* → INVALID |
| V6 | Revote resolution per policy | INVALID |
| V7 | `election.open/close` times vs manifest and STH times; halts and effective close | INVALID |
| V8 | Spoiled ballots open correctly (re-encryption matches); flags any mismatch | Alarm: cheating client suspected |
| V9 | Recomputed aggregate equals `tally.aggregate` | INVALID |
| V10 | Each decryption share's Chaum–Pedersen proof | Share rejected; if < t valid → no result |
| V11 | Combined plaintext, discrete-log step correct | INVALID |
| V12 | Outcome vs QV-03 §7 and §7.4 vectors | INVALID |
| V13 | Every steward/operator action authorised by the rules in force (QV-03 AC9, AC11) | INVALID |
| V14 | Report hash; bundle completeness vs QV-02-REQ-054 | INVALID |

An `INVALID` verdict never shows a result as final; it triggers the dispute path G2 (QV-03 §5.4).

### 7.3 Individual verification paths

| Who | Path |
|---|---|
| Voter, cast-as-intended | Audit (§4.4) |
| Voter, recorded-as-cast | Receipt → inclusion proof → STH consistency to final head |
| Voter, tallied-as-recorded | Check own `ballot_id` in the included-list Merkle root; trust verifier V9–V11 |
| Observer | Run full verifier on bundle |

## 8. Voting methods summary (authoritative source: `docs/20-voting-methods.md`, QV-20)

All methods are encoded as vectors of 0/1 (or small integer) selections encrypted per selection, so the aggregate is a column sum and the tally is homomorphic (ADR-004/006). Per-method constraints are proven in zero knowledge per ballot (QV-16).

| Method | Phase | Encoding (summary) | Ballot constraint | Tally | Notes |
|---|---|---|---|---|---|
| Yes/No | MVP | selections [YES, NO]; blank = both 0 | each ∈ {0,1}; sum ≤ 1 | Column sums Y, N; A = ballots − (Y+N) via ballot count | Threshold per QV-03 §7.2 |
| Single choice | MVP | one selection per option | each ∈ {0,1}; sum = 1 (or ≤ 1 if blank allowed) | Column sums; top w win | Ties per QV-03 §7.3 |
| Approval | MVP | one selection per option | each ∈ {0,1}; `min ≤ sum ≤ max` | Column sums; top w win | |
| k-of-n multi-select | MVP | as approval | sum = k (or ≤ k) | Column sums | Board-seat style |
| Ranked (Schulze / Ranked Pairs) | Phase 2 | pairwise preference matrix entries | Consistency proof of matrix from a ranking | Sum matrices, compute on plaintext | QV-20 |
| Weighted | Phase 2 | selection × weight (roll leaf weight) | Weight from roll; range proofs | Weighted sums | Requires larger discrete-log range |
| Delegation / proxy | Phase 2 | delegation graph + ballots | TBD in QV-20 | TBD | Out of MVP |
| Write-in | Excluded | — | — | — | Needs mixnet (ADR-006) |

Invalid-ballot handling: the server rejects at submit time, so no *invalid counted ballot* exists in homomorphic methods; a ballot that violates constraints cannot produce valid proofs. A **blank** ballot is a valid ballot (turnout) with all zero selections when `blank_allowed`.

## 9. Error codes

| Code | HTTP | Meaning | Client action |
|---|---|---|---|
| `E_PROTO` | 400 | Unknown `proto` or schema violation | Update client |
| `E_ENCODING` | 400 | Malformed encoding / non-canonical point or scalar | Bug report; do not retry |
| `E_TOO_LARGE` | 413 | Over 64 KiB | — |
| `E_ELECTION_UNKNOWN` | 404 | No such election | — |
| `E_NOT_OPEN` | 409 | Election not yet open | Wait |
| `E_CLOSED` | 409 | After close | — |
| `E_HALTED` | 423 | Election halted | Wait for resume notice |
| `E_MANIFEST_MISMATCH` | 409 | `manifest_id` differs | Reload rules |
| `E_NOT_ELIGIBLE` | 403 | Key not on roll / revoked | Contact steward |
| `E_KEY_ROTATED` | 403 | Key replaced | Use new key |
| `E_SIG_INVALID` | 401 | Signature fails | Re-sign |
| `E_PROOF_INVALID` | 422 | Any proof fails (sub-codes `E_PROOF_BIT`, `E_PROOF_SUM`, `E_PROOF_DOMAIN`) | Rebuild ballot |
| `E_ALREADY_VOTED` | 409 | Revoting disabled | — |
| `E_RATE_LIMIT` | 429 | Abuse control | Backoff |
| `E_LOG_UNAVAILABLE` | 503 | Log append failed; state unchanged | Retry same `ballot_id` |

Success includes the idempotent replay of an existing `ballot_id` (200 with original receipt).

## 10. Failure policy: stop vs. continue

| Failure | Policy | Rationale |
|---|---|---|
| Log consistency proof fails (monitor/mirror/voter) | **Stop** (HALT H1) | Possible split view or tampering |
| Proof verification bug/failure for an accepted ballot | **Stop** (H2) | Integrity |
| Server unavailable | **Continue** after recovery; ballots not lost (client retains and retries); extend only via rules (QV-03 §5.5) | Availability is operator-trusted |
| < t trustees at decrypt time | `FAILED(DECRYPT)` handling (QV-03 §5.4); no steward key fallback | No master key exists |
| Client-side exception | Do not submit; show error; no plaintext persisted | Secrecy |
| Clock skew > 120 s between STH and manifest close | Verifier warns; > 120 s INVALID | V7 |
| Witness unreachable | Continue; record unwitnessed STHs | Optional feature |
| Mirror disagreement | **Stop** + investigation | Split view |

## 11. Requirements

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-05-REQ-001 | The protocol shall implement the lifecycle P0–P13 with the artifacts and visibility of §3.1. | Must | End-to-end test produces every artifact; visibility lint on API responses | T |
| QV-05-REQ-002 | Ballot validation (§4.2) shall be a pure deterministic function shared by server and verifier. | Must | Same corpus gives identical verdicts on both | T |
| QV-05-REQ-003 | Rejected ballots shall cause no state change, and accepted ballots shall be appended to the log before success is returned. | Must | Fault-injection | T |
| QV-05-REQ-004 | Receipts shall be signed and an inclusion proof shall be retrievable within `mmd` (default 60 s). | Must | Latency test; verification of proof | T |
| QV-05-REQ-005 | The client shall show the tracking code before the cast-or-audit choice and shall use a fresh encryption randomness after audit. | Must | Instrumented test shows distinct randomness; UI order test | T |
| QV-05-REQ-006 | Spoiled ballots shall be openable and verified by an independent implementation (verifier page/CLI). | Must | Cross-implementation test; tampered client detected in test | T |
| QV-05-REQ-007 | Revoting semantics shall be exactly as §4.5 and QV-04 §7. | Must | Property tests | T |
| QV-05-REQ-008 | The aggregation and included-ballot Merkle root shall be reproducible by any party from the log. | Must | Verifier recomputes on 3 independent implementations | T |
| QV-05-REQ-009 | No component shall be able to decrypt an individual ballot using fewer than t shares; trustee tooling shall refuse partial decryption before the close entry exists. | Must | Tooling test; code review of access paths | T/R |
| QV-05-REQ-010 | The verifier shall implement V1–V14 and emit per-check results, a verdict, and a report hash. | Must | Mutation test: each class of tampering fails the expected check | T |
| QV-05-REQ-011 | The verdict `INVALID` shall prevent the UI from presenting a result as final. | Must | UI test | T |
| QV-05-REQ-012 | Error codes shall match §9 and be stable across minor versions. | Must | Contract test | T |
| QV-05-REQ-013 | Documentation and UI shall present the guarantees (§5.1) and "who can learn what" (§5.2) verbatim-equivalent in plain language, including non-claims G-R1, G-C1, G-L1, G-S3. | Must | Claims checklist (QV-06 §10) | R/U |
| QV-05-REQ-014 | Method summaries in §8 shall be kept consistent with QV-20; QV-20 is authoritative for encodings. | Must | Cross-spec review at each revision | R |
| QV-05-REQ-015 | Ballot size ≤ 64 KiB and per-ballot server validation p95 ≤ 100 ms on reference hardware for 10 contests × 10 selections. | Should | Benchmark | T |
| QV-05-REQ-016 | The protocol shall support algorithm agility via `proto` versions; a verifier shall verify any past election at its recorded `proto`. | Must | Old-version bundles verify in new verifier | T |

## 12. Security and abuse cases

| Case | Attacker | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Operator drops a ballot | O | Disenfranchisement | Receipts + STH inclusion; mirrors | Voter who never checks |
| Split-view log | O | Show different logs | Witnesses, mirrors, STH gossip | Single-server MVP without witnesses |
| Malicious JS client | O | Break secrecy or cast other choice | ADR-010, Benaloh, CLI voting | Residual high for web delivery |
| Early decryption by colluding trustees | Trustees ≥ t | Early/individual results | Independence rules; tool refusal; destroy shares | Inherent |
| Ballot malleability / replay | X | Duplicate effect | Signature includes election/manifest; idempotent `ballot_id` | — |
| Proof forgery (Fiat–Shamir weak hashing) | X | Invalid ballot counted | Full-statement domain-separated hashing (QV-16) | Implementation bugs → review |
| Timing/size side channels | O, N | Infer choices from ciphertext size | Fixed-size ciphertexts per contest; constant-time primitives from noble | Network timing of submission |
| Spoiled-ballot misuse (vote-selling proof) | M | Receipt becomes sale evidence | Spoiled ballots don't count; UI discourages audit on real choice | Receipt-freeness not claimed |
| Tiny-electorate inference | any | Leak by totals | QV-06 §9 | Inherent |

## 13. Open questions

| Question | Owner | Target | Proposed default |
|---|---|---|---|
| Is Benaloh audit possible for a command-line voter (no UI second device)? | QV-16 | v0.5 | Yes, CLI `qv audit` |
| Should tracking codes be shortened for readability while keeping collision resistance? | UX/crypto | v0.5 | 20 base32 chars (100 bits) + 2 checksum chars displayed; full hash kept |
| Should aggregation be performed by trustees (signed) rather than "anyone"? | Protocol | v0.5 | Anyone; trustees sign what they decrypt, which names the aggregate hash |
| Post witness cosigning in MVP? | Architecture | v0.9 | Hooks + one public witness volunteer |
| Required `mmd` | Architecture | v0.5 | 60 s |

## 14. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## References (accessed 2026-10-21)

1. Adida, "Helios: Web-based Open-Audit Voting," USENIX Security 2008 (lineage of ADR-004) `[UNVERIFIED by fetch this session]`.
2. Benaloh, "Simple Verifiable Elections," EVT 2006 (cast-or-audit) `[UNVERIFIED by fetch this session]`.
3. RFC 9162, Certificate Transparency 2.0, https://www.rfc-editor.org/rfc/rfc9162.html (log structure, inclusion/consistency proofs, SCT-style promise).
4. ElectionGuard specification, https://github.com/microsoft/electionguard `[UNVERIFIED; version to be pinned by QV-16 author]`.
5. Cramer, Damgård, Schoenmakers, "Proofs of Partial Knowledge…" CRYPTO '94; Chaum–Pedersen "Wallet Databases with Observers" CRYPTO '92 — detailed construction in QV-16.
6. QV-16 `docs/16-crypto-protocol.md` (concurrent) and QV-20 `docs/20-voting-methods.md` (concurrent): cross-references to be reconciled at integration.

## Proposed ADRs

- **QV-ADR-P05-1 — Receipts are SCT-like signed promises with `mmd` = 60 s; inclusion proof is the evidence of recording.**
- **QV-ADR-P05-2 — Verifier check IDs V1–V14 are the normative common vocabulary across specs and tests.**
- **QV-ADR-P05-3 — Spoiled (audited) ballots are published openings; UI instructs test selections only.**
