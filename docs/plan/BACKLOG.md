# QV-23 — Backlog / To-do

**Status:** Draft · **Date:** 2026-10-21 · **Parent:** [ROADMAP](ROADMAP.md) (QV-22)

## How to read this

- **ID** `T-nnn` is stable; never reuse. Epics reserve ID ranges so new tasks can be appended.
- **Spec** = specification / requirement traceability (`QV-xx` doc, `§` section, `REQ`, `ADR`, `G#` gate, `S#` success gate, `R#` review engagement). Tests and PRs reference the task ID and spec IDs (QV-24).
- **Pri:** `P0` blocks critical path or a gate; `P1` required for the named phase exit; `P2` should; `P3` could/later.
- **Size:** S ≤ 2 days · M ≤ 2 weeks · L > 2 weeks (split before starting).
- **Phase** is the earliest roadmap phase in which the task must finish (P0…P7, `L` = later track).
- **Owner role** (not a person): `PO` project owner · `Steward` · `Proto` protocol/crypto lead · `Eng-C` crypto/protocol engineer · `Eng-S` board/server engineer · `Eng-W` web engineer · `Eng-R` release/infra engineer · `UX` · `A11y` · `QA` · `Sec` security lead · `Legal` counsel · `Ops` · `Comms` community/launch · `Docs`.
- **Status:** `[x]` done (evidence below), `[~]` partly done, `[ ]` open. Done state is derived from repo contents at 2026-10-21.

### Done-state evidence (repo audit, 2026-10-21)

| Evidence | Location |
|---|---|
| Specs QV-00…QV-34 drafted (mostly Draft/Framework), SPEC-INDEX, decision log with ADR-000…013, authoring brief, template, 4 research notes | `docs/` |
| Monorepo scaffold: npm workspaces, strict `tsconfig`, `typecheck`/`test`/`check` scripts, AGPL licence field, 8 package skeletons | `package.json`, `tsconfig*.json`, `packages/*` |
| `crypto`: SHA-256 helper and Ed25519 sign/verify wrappers on `@noble`; 1 smoke test | `packages/crypto/src/{hash,ed25519}.ts`, `test/smoke.test.ts` |
| `board`: byte helpers, errors, Merkle tree (append, root, inclusion, consistency verify), signed-note checkpoint + cosign + witness policy, entry header model & size caps — **no tests** | `packages/board/src/*` (≈790 lines) |
| README, CONTRIBUTING, SECURITY | repo root |
| Empty stubs only (no implementation): `protocol`, `server`, `web`, `cli`, `trustee`, `verifier`; `test-vectors/` and `scripts/` are empty; no CI config | `packages/*/src/index.ts` |

---

## E01 — Spec closure, decisions and governance (P0)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-001 | Draft specs QV-00…QV-34 and SPEC-INDEX | SPEC-INDEX | P0 | L | — | Docs | [x] |
| T-002 | Record baseline ADR-000…013 (provisional) | decision-log | P0 | M | — | PO | [x] |
| T-003 | Research notes R-01…R-04 | QV-21 | P1 | L | — | Proto | [x] |
| T-004 | Owner review of ADR-001…013; record Accepted/Superseded in decision log | decision-log | P0 | M | T-002 | PO | [ ] |
| T-005 | Resolve "by M0" items in OPEN-DECISIONS.md and record as ADRs | OPEN-DECISIONS | P0 | M | T-004 | PO | [ ] |
| T-006 | Move MVP-critical specs Draft→Review→Approved (QV-00,02,03,04,05,07,08,09,16,18,20) | SPEC-INDEX "implementation-ready" | P0 | L | T-005 | PO/Proto | [ ] |
| T-007 | Spec consistency pass: cross-spec ID/field/error-code reconciliation, close dangling refs | QV-24 | P0 | M | T-006 | Docs | [ ] |
| T-008 | Freeze QV-16 wire formats v0 (encodings, domain-separation labels, registry) | QV-16, ADR-004 | P0 | L | T-005 | Proto | [ ] |
| T-009 | Populate traceability matrix (requirement → design → test → evidence) and script to check coverage | QV-24, QV-30-REQ-027 | P1 | M | T-006 | QA | [ ] |
| T-010 | Spec status/claims register (claims vs assurance level) and banned-phrase list | QV-11 G13, QV-30-REQ-034 | P1 | S | T-006 | Comms | [ ] |
| T-011 | Governance docs live: maintainers, decision process, DCO, CoC (Contributor Covenant 2.1 + neutrality clause) | QV-27 §5,6,11 | P1 | M | T-004 | Steward | [~] |
| T-012 | Release-key policy decision (2-of-3 maintainer sigs) and key-custody plan | QV-27, QV-19, QV-OQ-12-1 | P1 | S | T-005 | Steward | [ ] |
| T-013 | Name/trademark/fork policy | QV-27 §10, QV-OQ-14-5 | P2 | S | T-011 | Legal | [ ] |
| T-014 | Contributor onboarding: good-first-issues, architecture tour, ADR process | QV-27, CONTRIBUTING | P2 | S | T-011 | Docs | [~] |
| T-015 | Public call for protocol review (academic e-voting groups), publish specs under CC BY-SA | QV-11 §9.1 | P1 | S | T-006 | Comms | [ ] |

## E02 — `packages/crypto` (P1)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-021 | SHA-256 wrapper (`hash.ts`) | ADR-003 | P0 | S | — | Eng-C | [x] |
| T-022 | Ed25519 sign/verify wrapper (strict, no ZIP-215) | QV-16, QV-16-OQ-5 | P0 | S | — | Eng-C | [x] |
| T-023 | Smoke test for hash/ed25519 | QV-11 L0 | P1 | S | T-021 | QA | [x] |
| T-024 | Expand Ed25519 tests: RFC 8032 vectors, malleability, small-order, non-canonical encodings | QV-11 §6.1 | P0 | M | T-022 | QA | [ ] |
| T-025 | ristretto255 group wrapper (encode/decode strict, identity rejection, scalar canonical checks) | ADR-004, QV-16 | P0 | M | T-008 | Eng-C | [ ] |
| T-026 | Domain-separated, length-prefixed transcript hashing (Fiat–Shamir) + label registry | QV-16, QV-11 §6.1 | P0 | M | T-008 | Eng-C | [ ] |
| T-027 | Hash-to-scalar / hash-to-group (RFC 9380 or spec'd), second generator H derivation (nothing-up-my-sleeve) | QV-16 | P0 | M | T-025 | Eng-C | [ ] |
| T-028 | Exponential ElGamal encrypt/decrypt-to-point, rerandomize | ADR-004 | P0 | M | T-025 | Eng-C | [ ] |
| T-029 | Schnorr proof of knowledge / possession | QV-16 | P0 | S | T-026 | Eng-C | [ ] |
| T-030 | Chaum–Pedersen (equality of DL) proof + verify | ADR-004 | P0 | M | T-026 | Eng-C | [ ] |
| T-031 | CDS disjunctive 0/1 proof + verify | ADR-004, QV-16 | P0 | M | T-030 | Eng-C | [ ] |
| T-032 | Contest-limit (sum) proof, incl. slack/placeholder design | QV-16, QV-20 | P0 | M | T-031 | Eng-C | [ ] |
| T-033 | Feldman VSS / Pedersen-with-PoK DKG primitives, share verification | QV-17, QV-16 | P0 | L | T-029 | Eng-C | [ ] |
| T-034 | Threshold decryption share + decryption proof + Lagrange combine | ADR-004 | P0 | M | T-030,T-033 | Eng-C | [ ] |
| T-035 | ECIES-style `enc_share` (ristretto/X25519, domain separated) | QV-17 Q1 | P0 | M | T-025 | Eng-C | [ ] |
| T-036 | Merkle-leaf/commitment helpers shared with board (single source) | QV-18 | P1 | S | T-021 | Eng-C | [ ] |
| T-037 | KDF: Argon2id (or scrypt fallback) wrapper for key files / trustee backups | QV-19 OQ, QV-16-OQ-5 | P1 | M | — | Eng-C | [ ] |
| T-038 | CSPRNG interface with injectable deterministic mode for vectors only | QV-11 §5.2 | P0 | S | — | Eng-C | [ ] |
| T-039 | Constant-time discipline review + secret-zeroization policy; branded secret types | QV-30, QV-19-REQ-009 | P1 | M | T-025 | Sec | [ ] |
| T-040 | Property tests INV-* for proofs (completeness, soundness smoke, binding to statement) | QV-11 §7.1 | P0 | M | T-031 | QA | [ ] |
| T-041 | Negative tests ATK §6.1 (proof malleability, wrong transcript, identity points) | QV-11 §6.1 | P0 | M | T-031 | QA | [ ] |
| T-042 | Benaloh challenge primitives (commit, spoil reveal of randomness) | ADR-004 | P0 | M | T-028 | Eng-C | [ ] |
| T-043 | Hedged nonce labels for DKG PoK/complaint proofs | QV-17-OQ-7 | P2 | S | T-033 | Eng-C | [ ] |
| T-044 | Optional ML-DSA-44 cosignature verify (build flag, dependency exception) | QV-18 Q4 | P3 | M | — | Eng-C | [ ] |
| T-045 | Benchmarks: cast→receipt, proof gen/verify, tally 5,000×10 | S12 | P1 | M | T-032 | Eng-C | [ ] |

## E03 — `packages/protocol` (P1)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-046 | Canonical encoding (deterministic bytes, strict parse, reject trailing/dup/unknown fields) | QV-16, QV-09 | P0 | M | T-008 | Eng-C | [ ] |
| T-047 | Protocol/version identifiers and algorithm agility registry | ADR-013, QV-16 | P0 | S | T-008 | Eng-C | [ ] |
| T-048 | `GroupRules` schema, validator, templates (≥3), plain-language summary | QV-03 §3,§10, QV-02-REQ-002/003 | P0 | M | T-046 | Eng-C | [ ] |
| T-049 | Election manifest schema + signing + hash; roll Merkle root commitment | QV-03, QV-04, ADR-005 | P0 | M | T-046 | Eng-C | [ ] |
| T-050 | Voter roll model: key enrollment, proof-of-possession, label hash with per-group salt | QV-04, QV-02-REQ-011 | P0 | M | T-049 | Eng-C | [ ] |
| T-051 | Invitation token generation/redeem logic (≥128-bit, expiry, single use) | QV-02-REQ-010 | P1 | S | T-050 | Eng-C | [ ] |
| T-052 | Election lifecycle state machine (DRAFT→READY→OPEN→CLOSED→TALLIED→FINAL, extension/stall rules) | QV-03 §6, OQ-8 | P0 | M | T-049 | Eng-C | [ ] |
| T-053 | Ballot construction per method (yes/no, single, approval, k-of-n) | QV-20, QV-05 | P0 | L | T-032 | Eng-C | [ ] |
| T-054 | Ballot validation (proofs, roll membership, signature, author key, size caps) | QV-05, QV-16 | P0 | M | T-053 | Eng-C | [ ] |
| T-055 | Latest-valid-ballot-per-voter (revote) selection rule with deterministic ordering | QV-05, ADR-005 | P0 | M | T-054 | Eng-C | [ ] |
| T-056 | Homomorphic aggregation + aggregate hash binding | QV-16, QV-17 Q | P0 | M | T-055 | Eng-C | [ ] |
| T-057 | Tally computation and result object per method; quorum and simple/supermajority thresholds | QV-03 §7, QV-20 | P0 | M | T-056 | Eng-C | [ ] |
| T-058 | Tie-break rules declared in manifest (deterministic; beacon disabled v1) | ADR-006, QV-20-OQ-4 | P1 | S | T-057 | Eng-C | [ ] |
| T-059 | Receipt/tracking-code derivation (20 base32 + checksum; full hash retained) | QV-10 OQ, QV-16 | P1 | S | T-054 | Eng-C | [ ] |
| T-060 | Benaloh cast-or-audit protocol messages (spoiled ballot entries) | ADR-004, QV-16 | P0 | M | T-042,T-054 | Eng-C | [ ] |
| T-061 | Decryption-oracle control (min aggregated ballots, ATK-035) | Q-11-2 | P0 | S | T-057 | Proto | [ ] |
| T-062 | Trustee protocol messages: DKG round 1/2/complaints/justification | QV-17, QV-16 | P0 | L | T-033 | Eng-C | [ ] |
| T-063 | Trustee decryption share entry + combination + result entry | QV-16, QV-17 | P0 | M | T-034 | Eng-C | [ ] |
| T-064 | Challenge/dispute entries and rule path (log-based) | QV-03 §8, QV-02 | P1 | M | T-052 | Eng-C | [ ] |
| T-065 | Steward actions: roll amendment, extension, pause with visible log entries | QV-04 §6, QV-03 | P1 | M | T-052 | Eng-C | [ ] |
| T-066 | Proposal history hash chain (amendments, review period) | QV-02 §4 | P1 | M | T-048 | Eng-C | [ ] |
| T-067 | Error-code catalog (E_*) shared with API | QV-09 | P1 | S | T-046 | Eng-C | [ ] |
| T-068 | Export/import bundle format (public bundle, operator bundle) | QV-18 §12, QV-09 Q4 | P0 | M | T-046 | Eng-C | [ ] |
| T-069 | Property/invariant tests INV-* for lifecycle, tally, revote, eligibility (S2 10,000 randomized elections) | QV-11 §7, S2 | P0 | L | T-057 | QA | [ ] |
| T-070 | Adversarial tests §6.2–6.3 (ballot, voter, trustees, DKG) | QV-11 §6 | P0 | L | T-063 | QA | [ ] |
| T-071 | Phase 2 extension points (token author field) designed, not built | ADR-005 | P3 | S | T-049 | Proto | [ ] |

## E04 — `packages/board` (bulletin board library; P2)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-076 | Byte helpers and error types | QV-18 | P0 | S | — | Eng-S | [x] |
| T-077 | Merkle tree: append-only, root, inclusion and consistency verification (RFC 9162 style) | QV-18, ADR-007 | P0 | L | — | Eng-S | [x] |
| T-078 | Signed-note checkpoint (STH), cosignature lines, witness policy evaluation | QV-18, ADR-007 | P0 | M | T-077 | Eng-S | [x] |
| T-079 | Entry header model, type list, size caps, origin validation, author KeyId | QV-18, QV-16 | P0 | M | T-076 | Eng-S | [x] |
| T-080 | Unit tests for Merkle (RFC 9162/known-answer, odd sizes, tamper), checkpoint, entry parsing | QV-11 §6.4, L1 | P0 | M | T-077,T-078,T-079 | QA | [ ] |
| T-081 | Cross-check Merkle against independent reference (Go `sumdb`/`tlog` vectors) | QV-34 | P1 | S | T-080 | QA | [ ] |
| T-082 | `BoardStore` interface + SQLite adapter (`node:sqlite`), WAL, durability-before-ack | QV-28, ADR-003, QV-11 ADR-P11-4 | P0 | L | T-079 | Eng-S | [ ] |
| T-083 | Append pipeline: validate → assign index → persist → STH; idempotent re-submission | QV-18, QV-09 | P0 | M | T-082,T-054 | Eng-S | [ ] |
| T-084 | STH issuance, maximum merge delay `mmd` (60 s), signing-key-loss behaviour (stop issuing) | QV-18, ADR-P11-4 | P0 | M | T-083 | Eng-S | [ ] |
| T-085 | Inclusion/consistency proof serving; tiles optional | QV-18, QV-18-Q6 | P1 | M | T-083 | Eng-S | [ ] |
| T-086 | Witness cosign request/response hooks; policy file; one volunteer witness | QV-18, QV-32 | P1 | M | T-084 | Eng-S | [ ] |
| T-087 | Mirror/monitor client (fetch, verify consistency, gossip checkpoint) | QV-18, QV-32 | P1 | M | T-085 | Eng-S | [ ] |
| T-088 | Equivocation detection tests (split-view, rollback, reorder) | QV-11 §6.4 | P0 | M | T-087 | QA | [ ] |
| T-089 | Retention/deletion schedule for non-public data; log is permanent for public entries | QV-06, QV-28 | P1 | M | T-082 | Eng-S | [ ] |
| T-090 | Chaos tests CH-xx for board (crash mid-append, disk full, clock skew) | QV-11 §8.6 | P1 | M | T-083 | QA | [ ] |
| T-091 | Optional OpenTimestamps anchoring witness | ADR-012, QV-OQ-7 | P3 | M | T-084 | Eng-S | [ ] |
| T-092 | Fuzz harnesses: entry parser, checkpoint parser, proof verifiers | QV-11 §7.2 | P1 | M | T-080 | QA | [ ] |

## E05 — `packages/server` (P2)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-096 | HTTP server skeleton (no third-party framework or minimal), routing, TLS-behind-proxy config | ADR-003, ADR-009, QV-08 | P0 | M | — | Eng-S | [ ] |
| T-097 | OpenAPI 3.1 + JSON Schema 2020-12 generation; contract tests | QV-09 Q2 | P0 | M | T-046 | Eng-S | [ ] |
| T-098 | Group create/rules endpoints; server never receives group secret | QV-02-REQ-001/002 | P0 | M | T-048,T-096 | Eng-S | [ ] |
| T-099 | Invitation + enrollment endpoints; no PII | QV-02-REQ-010/011, QV-04 | P0 | M | T-051,T-096 | Eng-S | [ ] |
| T-100 | Election create / manifest publish / state transitions with authZ (steward signatures) | QV-03, QV-09 | P0 | L | T-052,T-083 | Eng-S | [ ] |
| T-101 | Ballot submission endpoint: validation, rate limit, receipt (signed inclusion promise) | QV-05, QV-29 | P0 | L | T-083,T-054 | Eng-S | [ ] |
| T-102 | Spoiled-ballot / Benaloh endpoints | ADR-004 | P0 | M | T-060,T-101 | Eng-S | [ ] |
| T-103 | Trustee coordination endpoints (post messages, fetch, status) | QV-17, QV-09 | P0 | M | T-062,T-096 | Eng-S | [ ] |
| T-104 | Tally orchestration: close → aggregate → collect shares → publish result | QV-05, QV-17 | P0 | M | T-063,T-100 | Eng-S | [ ] |
| T-105 | Public read API: log, entries, proofs, STH, roll, results, bundles | QV-09, QV-18 | P0 | M | T-085 | Eng-S | [ ] |
| T-106 | Challenge/dispute and steward-action endpoints | QV-03 §8 | P1 | M | T-064,T-065 | Eng-S | [ ] |
| T-107 | Export bundle endpoint and import for restart elsewhere (no live migration of OPEN) | QV-18 §12, ADR-001(4) | P0 | M | T-068 | Eng-S | [ ] |
| T-108 | Idempotency-Key support | QV-09 Q7 | P1 | S | T-096 | Eng-S | [ ] |
| T-109 | Abuse controls: PoW/anti-spam token, per-IP-less rate limiting, body caps, slow-loris limits | QV-29, QV-26 | P0 | M | T-101 | Eng-S | [ ] |
| T-110 | Privacy-by-default logging: no IP/UA persisted; redaction; canary test | S10, QV-06, QV-31, QV-19-REQ-009 | P0 | M | T-096 | Eng-S | [ ] |
| T-111 | Privacy-preserving metrics (aggregate counters only) | QV-31 | P2 | M | T-110 | Eng-S | [ ] |
| T-112 | Scheduler: window close, retention deletion, STH heartbeat | QV-03, QV-06 | P1 | M | T-100 | Eng-S | [ ] |
| T-113 | Optional webhooks (steward-supplied URL only, P0/P1 data) | QV-02-REQ-075, QV-09 | P2 | M | T-100 | Eng-S | [ ] |
| T-114 | Mirror-forward submission path (censorship fallback) | QV-07 R-08, OQ-1 | P2 | M | T-101 | Eng-S | [ ] |
| T-115 | Security headers, strict CSP, no third-party resources, SRI, Trusted Types serving | ADR-009, QV-19 | P0 | M | T-096 | Eng-S | [ ] |
| T-116 | Link read-key rotation | QV-09 Q8 | P3 | S | T-105 | Eng-S | [ ] |
| T-117 | API integration tests (L4), authZ matrix, idempotency, replay | QV-11 §8.1 | P0 | L | T-101 | QA | [ ] |
| T-118 | Load tests: 2,000 voters, burst at close, 5,000 ballots tally | QV-11 §8.5, S12 | P1 | M | T-104 | QA | [ ] |
| T-119 | Server storage migrations framework + upgrade/downgrade drill | QV-28, G10 | P1 | M | T-082 | Eng-S | [ ] |
| T-120 | Tor onion-service profile (listen config, no external fetch) | ADR-009, QV-26 | P1 | M | T-096 | Ops | [ ] |
| T-121 | `node:sqlite` stability watch and contingency memo | QV-08 OQ, ADR-003 | P2 | S | T-082 | Eng-S | [ ] |

## E06 — `packages/trustee` (P3)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-126 | Trustee CLI: key generation, encrypted share store, SAS word list | QV-17, QV-17 Q4 | P0 | M | T-035,T-037 | Eng-C | [ ] |
| T-127 | DKG client (rounds, complaint handling, abort/restart) | QV-17, T-062 | P0 | L | T-062,T-103 | Eng-C | [ ] |
| T-128 | Ceremony transcript verifier and public attestations | QV-17 | P0 | M | T-127 | Eng-C | [ ] |
| T-129 | Decryption-share production with proof after verifying aggregate and policy | QV-17, T-061 | P0 | M | T-063 | Eng-C | [ ] |
| T-130 | Air-gapped mode: offline bundle in/out (file/QR), recovery sheet (plain-text) | QV-17, Q-13-7 | P1 | M | T-127 | Eng-C | [ ] |
| T-131 | Share backup, key destruction after audit window (default 30 d) | QV-17 Q7, ADR-013 | P1 | M | T-127 | Eng-C | [ ] |
| T-132 | Organization-trustee (HSM/service) disclosure support | QV-17 Q6 | P3 | S | T-129 | Eng-C | [ ] |
| T-133 | Trustee recruitment & training guide; dry-run ceremony script | QV-17, QV-12 | P1 | M | T-127 | Docs | [ ] |
| T-134 | Ceremony chaos tests (trustee dropout, malicious dealer, replay) | QV-11 §6.3, §8.6 | P0 | M | T-127 | QA | [ ] |
| T-135 | Browser trustee UI (deferred Phase 2) | QV-01 OQ | P3 | L | T-127 | Eng-W | [ ] |

## E07 — `packages/verifier` (P4; reference verifier P3)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-141 | Verifier core: bundle parse (strict), log consistency/inclusion/STH/witness check | QV-05, QV-18 | P0 | L | T-068,T-080 | Eng-C | [ ] |
| T-142 | Election verification: manifest, roll, ballot proofs, latest-ballot rule, aggregate, decryption proofs, tally | QV-05, QV-16 | P0 | L | T-141,T-057 | Eng-C | [ ] |
| T-143 | Verifier output report (deterministic hash, machine+human readable) | S1 | P0 | M | T-142 | Eng-C | [ ] |
| T-144 | Verifier performance: 5,000×10 in ≤ 60 s | S12 | P1 | M | T-142 | Eng-C | [ ] |
| T-145 | Standalone offline "verifier page" (single file, no network) | ADR-010, QV-19 | P0 | L | T-142 | Eng-W | [ ] |
| T-146 | Verifier minimal-dependency policy (reads spec only; shares no code with `protocol` where feasible) | QV-11 R7, G4 | P1 | M | T-142 | Proto | [ ] |
| T-147 | Recruit independent second-verifier author/team (non-core, different language, e.g. Python/Rust) | S1, R7, QV-11-OQ-9 | P0 | M | T-008 | PO | [ ] |
| T-148 | Second verifier implementation passing QV-34 profile vectors + reference bundles | G4, S1, R7 | P0 | L | T-147,T-212 | external | [ ] |
| T-149 | Differential testing harness: both verifiers vs mutated bundles | G4, QV-11 | P0 | M | T-148 | QA | [ ] |
| T-150 | Reference election bundles (valid, tampered, equivocating, malformed) | QV-34 | P0 | M | T-141 | QA | [ ] |
| T-151 | Monitor mode: continuous log audit and alerting | QV-18, QV-32 | P2 | M | T-141 | Eng-S | [ ] |
| T-152 | Verifier fuzzing | QV-11 §7.2 | P1 | M | T-141 | QA | [ ] |

## E08 — `packages/cli` (P3)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-161 | CLI framework (no heavy deps), config, key file handling, exit codes | QV-30, S13 | P1 | M | T-037 | Eng-C | [ ] |
| T-162 | `qv group/create`, `qv rules`, steward signing (group key client-side) | QV-02-REQ-001/002 | P0 | M | T-098,T-161 | Eng-C | [ ] |
| T-163 | `qv enroll` (invite → keypair → PoP) + key backup confirm | QV-02-REQ-011 | P0 | M | T-099 | Eng-C | [ ] |
| T-164 | `qv election create/open/close/tally` for organizers | QV-03, QV-09 | P0 | M | T-100 | Eng-C | [ ] |
| T-165 | `qv vote` (encrypt, prove, sign, submit, receipt) | QV-05 | P0 | M | T-101 | Eng-C | [ ] |
| T-166 | `qv audit` — Benaloh challenge from CLI | QV-16 OQ (v0.5) | P0 | M | T-102 | Eng-C | [ ] |
| T-167 | `qv verify` wrapping reference verifier; `qv receipt check` | S1, QV-18 | P0 | S | T-143 | Eng-C | [ ] |
| T-168 | `qv trustee …` subcommands delegating to trustee package | QV-17 | P1 | S | T-126 | Eng-C | [ ] |
| T-169 | `qv export/import`, `qv monitor` | QV-18 §12 | P1 | M | T-107 | Eng-C | [ ] |
| T-170 | CLI e2e tests (scripted whole election incl. trustees) | QV-11 L5 | P0 | M | T-165,T-168 | QA | [ ] |
| T-171 | CLI packaging: signed single-file builds, reproducible | QV-19, G8 | P1 | M | T-170 | Eng-R | [ ] |

## E09 — `packages/web` (P3)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-176 | Web architecture: no-framework or minimal, esbuild, strict CSP, Trusted Types, i18n hooks | QV-19, ADR-003/009/010 | P0 | M | T-115 | Eng-W | [ ] |
| T-177 | Browser crypto bundle (shared `crypto`/`protocol`), WebCrypto policy, worker for proofs | QV-19, S12 | P0 | L | T-053 | Eng-W | [ ] |
| T-178 | Key management: generate, passphrase-encrypt (Argon2id), backup/export, import, WebAuthn option | QV-02-REQ-011, QV-19, QV-09 Q6 | P0 | L | T-037,T-176 | Eng-W | [ ] |
| T-179 | Enrollment flow (invite→key→PoP) with backup confirmation | QV-02, QV-10 | P0 | M | T-178,T-099 | Eng-W | [ ] |
| T-180 | Voter flow: read election, ballot UI per method, review, cast, receipt | QV-10, QV-05 | P0 | L | T-177,T-101 | Eng-W | [ ] |
| T-181 | Benaloh audit UX ("Test" always offered, equal prominence) incl. Election-ID compare | QV-10 Q-10-2/5, ADR-004 | P0 | M | T-180,T-102 | Eng-W | [ ] |
| T-182 | Receipt check & inclusion proof UI; checkpoint pin file | QV-10, QV-18 Q2 | P0 | M | T-180 | Eng-W | [ ] |
| T-183 | Organizer UI: group, rules templates, roster, election setup, manifest review | QV-10, QV-02 | P0 | L | T-176,T-100 | Eng-W | [ ] |
| T-184 | Trustee-facing status pages (browser trustee deferred) | QV-10, QV-17 | P1 | M | T-183 | Eng-W | [ ] |
| T-185 | Observer/auditor UI: log browser, results, verify-in-browser | QV-10 | P1 | M | T-145 | Eng-W | [ ] |
| T-186 | Results and challenge UI with accessible table equivalents | QV-13 Q-13-2 | P1 | M | T-185 | Eng-W | [ ] |
| T-187 | Guarantee strings & privacy notices from claims register; banner by assurance level | QV-10 `qv.privacy.review`, G13 | P0 | M | T-010 | UX | [ ] |
| T-188 | Persistent single-steward warning | QV-02-REQ-004 | P1 | S | T-183 | Eng-W | [ ] |
| T-189 | Client reproducible build + SRI + signed release manifest + import-map integrity fallback | ADR-010, QV-19, G8 | P0 | L | T-176 | Eng-R | [ ] |
| T-190 | Lint rules: ban innerHTML/eval/localStorage secrets/postMessage * etc. | QV-30, QV-19 | P0 | S | T-176 | Eng-W | [ ] |
| T-191 | Service-worker/pinned-client option (installable) | ADR-010 | P2 | M | T-189 | Eng-W | [ ] |
| T-192 | Browser matrix + low-end device performance tests | QV-13 Q-13-3, S12 | P1 | M | T-180 | QA | [ ] |
| T-193 | Playwright e2e: enroll→vote→audit→verify | QV-11 §8.2 | P0 | L | T-182 | QA | [ ] |
| T-194 | Offline/poor-network behaviour, timeouts (E-NET-TIMEOUT 20 s), retries without double-cast | QV-10 Q-10-7 | P1 | M | T-180 | Eng-W | [ ] |
| T-195 | Proposal drafting & review UI (link-out discussion, hash-chained history) | QV-02 §4, T-066 | P2 | M | T-183 | Eng-W | [ ] |

## E10 — Test vectors and conformance (QV-34) (P1)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-211 | Vector file format, MANIFEST, signing, naming (`QV-TST-*`) | QV-34, QV-30 OQ | P0 | M | T-008 | QA | [ ] |
| T-212 | Vector profile P1 (crypto, proofs, DKG, encodings, tally) generated from reference + hand-checked | QV-34, G3 | P0 | L | T-211,T-034 | Eng-C | [ ] |
| T-213 | Independent derivation of selected vectors (Python script / other lib) to avoid self-confirmation | QV-34, QV-11 | P0 | M | T-212 | Proto | [ ] |
| T-214 | Negative vectors (invalid proofs, bad encodings, malicious DKG) | QV-34, §6 | P0 | M | T-212 | QA | [ ] |
| T-215 | Log/board vectors (Merkle, STH, consistency, witness policy) | QV-34, QV-18 | P0 | M | T-080 | QA | [ ] |
| T-216 | Conformance runner CLI for third-party implementers | QV-34 | P1 | M | T-212 | Eng-C | [ ] |
| T-217 | Vector regression CI job + vector change governance | G3 | P1 | S | T-212,T-223 | QA | [ ] |
| T-218 | Reference election bundles (small/medium/10k) | QV-34, T-150 | P1 | M | T-150 | QA | [ ] |

## E11 — CI/CD and supply chain (P1)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-223 | CI pipeline: typecheck, test, lint on PR (GitHub Actions) | QV-30, Q-11-3, G1 | P0 | M | — | Eng-R | [ ] |
| T-224 | Lockfile pinning, exact versions, direct-dependency budget check (≤ 12 prod deps) | S13, QV-30, ADR-003 | P0 | S | T-223 | Eng-R | [~] |
| T-225 | SAST + secret scanning + dependency audit; no High/Critical gate | G2 | P0 | M | T-223 | Eng-R | [ ] |
| T-226 | Licence check (AGPL compat) + SBOM (CycloneDX/SPDX) | G2, QV-25 | P1 | M | T-223 | Eng-R | [ ] |
| T-227 | DCO bot / sign-off check | ADR-011, QV-27 | P1 | S | T-223 | Eng-R | [ ] |
| T-228 | Coverage floors + mutation testing job (≥90% crypto/protocol/verifier) | G1, G6, ADR-P11-5 | P1 | M | T-223 | QA | [ ] |
| T-229 | Fuzz infra (nightly; self-hosted runner), weekly hour target | G6, Q-11-3 | P1 | M | T-092 | Eng-R | [ ] |
| T-230 | Reproducible build scripts (client and CLI) + 2-builder verification job | G8, QV-19-REQ-023 | P0 | L | T-189 | Eng-R | [ ] |
| T-231 | Release signing (Sigstore/cosign or minisign; 2-of-3), signed release manifest with client hash | QV-19 §13, QV-27 §7 | P0 | M | T-012,T-230 | Eng-R | [ ] |
| T-232 | Release process: channels (nightly/rc/stable), changelog template, version axes | QV-27 §7 | P1 | M | T-231 | Steward | [ ] |
| T-233 | Branch protection, required reviews, signed commits for maintainers | QV-27 §5.3 | P1 | S | T-011 | Steward | [ ] |
| T-234 | Dependency update policy + vendor audit for `@noble/*` versions | QV-30, ADR-003 | P1 | S | T-224 | Sec | [ ] |
| T-235 | Spec/doc link checker, traceability checker in CI | QV-30-REQ-027 | P1 | S | T-009,T-223 | QA | [ ] |
| T-236 | Release dossier generator (evidence artifacts) | QV-11 §10 | P1 | M | T-232 | QA | [ ] |
| T-237 | Banned-phrase / claims lint on UI strings and docs | G13, QV-11 G7 | P1 | S | T-010 | Comms | [ ] |
| T-238 | Provenance/SLSA-style attestations | QV-19 | P2 | M | T-231 | Eng-R | [ ] |

## E12 — Testing and assurance (cross-cutting) (P1–P5)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-241 | Test-ID scheme and traceability links format | QV-24, QV-30 OQ | P1 | S | T-009 | QA | [ ] |
| T-242 | Attack matrix ATK-xxx implementation tracker (§6) with exemptions | G5 | P0 | M | T-241 | QA | [ ] |
| T-243 | Property-based testing library choice (no/low deps) and INV catalog | QV-11 §7.1 | P1 | S | T-223 | QA | [ ] |
| T-244 | Randomized 10,000-election S2 harness | S2 | P0 | M | T-069 | QA | [ ] |
| T-245 | Privacy tests: canary scans for secrets/IPs in logs, DB, exports | G11, S10, QV-11 §8.4 | P0 | M | T-110 | QA | [ ] |
| T-246 | Chaos suite CH-01…CH-31 | G10, QV-11 §8.6 | P1 | L | T-090,T-134 | QA | [ ] |
| T-247 | Security test suite: authZ, injection, CSRF/CSP, rate limit | QV-11 §8.3 | P1 | M | T-117 | Sec | [ ] |
| T-248 | Backup/restore/upgrade drills (RTO 1 h, RPO 15 min) | S9, G10 | P1 | M | T-119,T-250 | Ops | [ ] |
| T-249 | Evidence dossier for each milestone | QV-11 §10 | P1 | M | T-236 | QA | [ ] |
| T-250 | Backup tooling (`VACUUM INTO` or replication) decision and implementation | QV-OQ-12-4 | P1 | M | T-082 | Ops | [ ] |
| T-251 | Literature attack triage process (30 days) | ADR-P11-3 | P2 | S | T-242 | Sec | [ ] |

## E13 — Security work (P1–P6)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-263 | Threat-model review and refresh against frozen QV-16 | QV-07, R5 | P0 | M | T-008 | Sec | [ ] |
| T-264 | SECURITY.md and disclosure policy live; security contact tested | QV-33, G14 | P0 | S | — | Sec | [~] |
| T-265 | Security advisory template + embargo process | QV-33, G14 | P1 | S | T-264 | Sec | [ ] |
| T-266 | Audit-prep pack for R1 (spec, threat model, ATK list, vectors, questions) | R1, QV-11 §9.3 | P0 | M | T-008,T-263 | Proto | [ ] |
| T-267 | Issue R1 RFP (published criteria, publication terms), select reviewers | R1, Q-11-1 | P0 | M | T-266, T-342 | PO | [ ] |
| T-268 | R1 review engagement; triage findings into ATK rows and vectors | R1 | P0 | L | T-267 | Proto | [ ] |
| T-269 | Audit-prep pack for R2 (code freeze, build, docs, known issues) | R2 | P0 | M | M4 | Sec | [ ] |
| T-270 | R2 implementation audit; fix, R8 re-test | R2, R8, G9 | P0 | L | T-269 | Sec | [ ] |
| T-271 | R3 web/server pentest + annual repeat | R3 | P1 | M | T-269 | Sec | [ ] |
| T-272 | R4 reproducible build/supply-chain review | R4 | P1 | M | T-230 | Sec | [ ] |
| T-273 | Bug bounty: scope, safe-harbor text, fund, platform (self-run) | R9, Q-11-6, QV-33 | P1 | M | T-264, T-343 | Sec | [ ] |
| T-274 | Election-pause/emergency criteria and runbook | QV-11 §12, QV-12 | P1 | S | T-263 | Sec | [ ] |
| T-275 | Key-handling review: trustee shares, voter keys, release keys | QV-17, QV-19 | P1 | M | T-127 | Sec | [ ] |
| T-276 | Coercion/receipt-freeness non-claim review of UI and docs | ADR-008, QV-R-03 | P1 | S | T-187 | Sec | [ ] |
| T-277 | Metadata privacy review (timing, IPs, Tor profile, anonymity sets) | QV-26 | P1 | M | T-120 | Sec | [ ] |
| T-278 | Public disclosure of audit reports in full; coverage statement | QV-11 §9.1/9.3 | P1 | S | T-270 | Sec | [ ] |
| T-279 | Machine-checked verifier exploration (EasyCrypt/Coq) | Q-11-4 | P3 | L | T-142 | Proto | [ ] |

## E14 — Legal, compliance and licensing counsel (P0–P7)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-281 | Retain counsel (OSS/privacy/export) | QV-25 | P0 | M | T-340 | PO | [ ] |
| T-282 | AGPL-3.0-or-later + CC BY-SA licence headers/files, doc-snippet dual licence ruling | ADR-011, QV-OQ-25-1 | P1 | S | T-281 | Legal | [ ] |
| T-283 | DCO and pseudonymous-contributor policy ruling | QV-OQ-25-2 | P1 | S | T-281 | Legal | [ ] |
| T-284 | Export-control (BIS/EAR) assessment and precautionary notice decision | QV-OQ-25-4 | P1 | S | T-281 | Legal | [ ] |
| T-285 | GDPR role mapping (group = controller; operator processor), DPIA template for EU groups | QV-25, QV-06 §8 | P1 | M | T-281 | Legal | [ ] |
| T-286 | Art. 9 (special category) stance for voting data; privacy notice texts | QV-OQ-25-3 | P1 | S | T-285 | Legal | [ ] |
| T-287 | Terms of use / disclaimer (no statutory elections), generic bylaw clause | QV-03 §10, QV-02 §9 | P1 | M | T-281 | Legal | [ ] |
| T-288 | Safe-harbor language for bounty and researchers | QV-33, Q-11-6 | P1 | S | T-281 | Legal | [ ] |
| T-289 | Fiscal host agreement / legal home selection | QV-27 §15, QV-OQ-14-1 | P0 | M | T-281 | Steward | [ ] |
| T-290 | Trademark and name clearance | QV-OQ-14-5 | P2 | S | T-013 | Legal | [ ] |
| T-291 | Hosted-operator exposure/jurisdiction legal review (precondition to hosting) | QV-14 §7, QV-OQ-14-2, QV-OQ-25-5 | P2 | M | T-281 | Legal | [ ] |
| T-292 | Third-party licence audit (word lists e.g. EFF, noble) | QV-25, QV-19 | P2 | S | T-226 | Legal | [ ] |

## E15 — Operations and self-host packaging (P2–P7)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-293 | Self-host package: container image + systemd unit, ≤10 commands, ≤30 min (S8) | S8, QV-08, QV-12 | P0 | L | T-100 | Ops | [ ] |
| T-294 | Config reference, secure defaults, TLS reverse-proxy guide (Caddy/nginx) | QV-12 | P1 | M | T-293 | Ops | [ ] |
| T-295 | Onion-service deployment guide and test | ADR-009, QV-26 | P1 | M | T-120 | Ops | [ ] |
| T-296 | Self-host sysadmin trials n≥5 | S8 | P1 | M | T-293 | QA | [ ] |
| T-297 | Operator runbooks: upgrade, backup, restore, incident, key loss | QV-12, G10 | P1 | M | T-248 | Ops | [ ] |
| T-298 | Observability stack docs (privacy-preserving) | QV-31 | P2 | S | T-111 | Ops | [ ] |
| T-299 | Operator-exit/export drill by external group | QV-14 §7 rule (b) | P2 | M | T-107 | Ops | [ ] |
| T-300 | On-call capacity plan (precondition for hosting) | QV-12 §11 | P3 | M | — | Ops | [ ] |
| T-301 | Hosted-instance architecture & capped beta (post-1.0) | QV-14 stage 3 | L | L | M8 | Ops | [ ] |
| T-302 | Upgrade policy & LTS (18 months) | QV-27 §7.4 | P2 | S | T-232 | Steward | [ ] |
| T-303 | Public witness operator arrangement (project-run + volunteer) | QV-OQ-4 (QV-07), QV-18 Q7 | P2 | M | T-086 | PO | [ ] |

## E16 — Accessibility and localization (P3–P7)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-309 | i18n framework (MF1, extraction, pluralization, RTL layout) | QV-13, QV-02 §8 | P0 | M | T-176 | A11y | [ ] |
| T-310 | WCAG 2.2 AA component checklist/lint + axe in CI | QV-13, G12 | P0 | M | T-176 | A11y | [ ] |
| T-311 | Keyboard + screen-reader pass on core voter flow (self-audit) | S11, R8 v0.9 | P1 | M | T-180 | A11y | [ ] |
| T-312 | RTL layout test, Tier-1 locale set, first-community language | QV-13, Q-13-1 | P1 | M | T-309 | A11y | [ ] |
| T-313 | Plain-language copy review & reading-level pass | QV-10, QV-13 | P1 | M | T-187 | UX | [ ] |
| T-314 | Translation workflow & style guides per locale | QV-13 Q-13-4 | P2 | M | T-309 | A11y | [ ] |
| T-315 | Low-end device + poor network profile tests | Q-13-3 | P1 | M | T-192 | QA | [ ] |
| T-316 | R5 external WCAG audit + AT user testing | R5, S11 | P1 | M | T-311 | A11y | [ ] |
| T-317 | Accessible trustee recovery sheet formats | Q-13-7 | P2 | S | T-130 | A11y | [ ] |

## E17 — UX research (P0–P6)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-319 | Research plan, consent protocol, no-PII data handling | QV-10 §13, QV-00 A1/A2 | P0 | S | — | UX | [ ] |
| T-320 | Interview 8–10 OSS foundation/collective organizers (validate A1 target group, pricing hypotheses) | QV-00, QV-OQ-14-3 | P0 | M | T-319 | UX | [ ] |
| T-321 | Paper/clickable prototype tests of voter flow incl. audit step | QV-10, S5 | P1 | M | T-320 | UX | [ ] |
| T-322 | Usability round 1 (n≥10) on v0.5 | S5 | P1 | M | M3 | UX | [ ] |
| T-323 | Comprehension quiz ("who sees my vote", "can I change it") n≥20 | S6 | P1 | M | T-187 | UX | [ ] |
| T-324 | Key-backup comprehension and recovery study (A2) | QV-00 A2, QV-04 §6 | P1 | M | T-178 | UX | [ ] |
| T-325 | Trustee ceremony usability | QV-17 | P1 | M | T-127 | UX | [ ] |
| T-326 | R6 independent usability/privacy-comprehension study | R6 | P2 | M | T-323 | UX | [ ] |
| T-327 | Voter reminder/notification design (no stored contact data) | QV-02 §7, Q-10-6 | P2 | S | T-320 | UX | [ ] |

## E18 — Documentation (P2–P7)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-329 | README, CONTRIBUTING, SECURITY basics | QV-27 | P1 | S | — | Docs | [x] |
| T-330 | Protocol explainer for non-cryptographers + non-claims page | ADR-008, QV-00 §5 | P1 | M | T-010 | Docs | [ ] |
| T-331 | Organizer guide (run an election end to end) | QV-10, QV-12 | P1 | M | M3 | Docs | [ ] |
| T-332 | Voter help content and FAQ (in-app) | QV-10 | P1 | M | T-180 | Docs | [ ] |
| T-333 | Trustee guide + ceremony script | T-133 | P1 | M | T-127 | Docs | [ ] |
| T-334 | Auditor/observer guide: independently verify an election | S1 | P1 | M | T-145 | Docs | [ ] |
| T-335 | API reference (generated) + implementer guide for third-party clients/verifiers | QV-09, QV-34 | P1 | M | T-097 | Docs | [ ] |
| T-336 | Architecture docs for contributors | QV-08, QV-30 | P2 | M | M2 | Docs | [ ] |
| T-337 | Package READMEs per workspace kept current | QV-30 | P2 | S | — | Docs | [~] |
| T-338 | Policy templates documentation (QV-03 §10) | QV-02-REQ-003 | P2 | S | T-048 | Docs | [ ] |
| T-339 | Residual-risk disclosures (client delivery problem, compromised devices) | ADR-010 | P1 | S | T-187 | Docs | [ ] |

## E19 — Funding, community and launch (P0–P7)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-340 | Choose fiscal host; open donation channel; transparency ledger | QV-14 §8, QV-27 §12 | P0 | M | T-005 | Steward | [ ] |
| T-341 | Project site/landing: mission, non-claims, status (L-0 banner) | QV-00, G13 | P1 | M | T-010 | Comms | [ ] |
| T-342 | Grant strategy & applications for R1/R2 (NLnet-style, civic-tech/privacy funders) | QV-14 §4, Q-11-1 | P0 | L | T-340 | Steward | [ ] |
| T-343 | Fund bounty pool ($10–25k/yr target) | R9, QV-14 | P2 | M | T-342 | Steward | [ ] |
| T-344 | Funder-independence rules (cap single funder 40%), disclosure page | QV-14 §3/§8, QV-27 §12 | P1 | S | T-340 | Steward | [ ] |
| T-345 | Pilot pipeline: recruit friendly dry-run group + 5 pilot groups (≥3 with ≥100 voters) | S4, QV-02 R10 | P1 | L | T-320 | Comms | [ ] |
| T-346 | Pilot agreement template (experimental software, non-claims, support) | QV-25, T-287 | P1 | S | T-287 | Legal | [ ] |
| T-347 | Pilot support playbook and feedback loop | QV-12 | P1 | M | T-345 | Ops | [ ] |
| T-348 | Willingness-to-pay validation with 10 pilot orgs; LOIs | QV-OQ-14-3 | P2 | M | T-345 | Steward | [ ] |
| T-349 | Support-contract offering definition (stage 3) | QV-14 §4 | P3 | M | T-348 | Steward | [ ] |
| T-350 | Community channels, code of conduct panel, contributor recognition | QV-27 §11 | P2 | S | T-011 | Comms | [ ] |
| T-351 | Launch plan v0.9 and 1.0 (announcement, reproducible-build call-out, review report publication) | QV-27, QV-11 | P2 | M | M6 | Comms | [ ] |
| T-352 | Transparency report format | QV-14 stage 3 | P3 | S | — | Steward | [ ] |
| T-353 | Recruit ≥3 external contributors; maintainers beyond founder (steward sunset plan) | S14, QV-27 §5.4 | P1 | M | T-014 | Steward | [ ] |

## E20 — Later tracks (post-1.0; research spikes may start earlier)

| ID | Task | Spec | Pri | Size | Deps | Owner | Status |
|---|---|---|---|---|---|---|---|
| T-356 | Phase 2: blind-token issuance (RFC 9474) design + spec update | ADR-005, QV-04 §10 | L | L | M8 | Proto | [ ] |
| T-357 | Phase 2: unlinkable ballot protocol, nullifier/token redemption, anonymity-set guidance | QV-16, QV-26 | L | L | T-356 | Eng-C | [ ] |
| T-358 | Phase 2 review (R1-class) and audit | QV-11 §9.1 | L | L | T-357 | Sec | [ ] |
| T-359 | Phase 3 spike: ZK Merkle membership + nullifiers prototype | ADR-005, QV-21 | L | L | — | Proto | [ ] |
| T-360 | Ranked choice: pairwise matrix tally + Schulze/Ranked Pairs proofs | ADR-006, QV-20 | L | L | M8 | Eng-C | [ ] |
| T-361 | Weighted votes / delegation | ADR-006 | L | L | T-360 | Eng-C | [ ] |
| T-362 | Verifiable mixnet for write-ins (research) | ADR-004, QV-20 | L | L | — | Proto | [ ] |
| T-363 | Federation: witness network, mirror directory, gossip protocol | QV-32, QV-18 | L | L | T-086 | Eng-S | [ ] |
| T-364 | P2P operation research | QV-32 | L | L | — | Proto | [ ] |
| T-365 | SSO/OIDC adapter (optional identity mode D) | QV-04, QV-02 §6 | L | M | M8 | Eng-S | [ ] |
| T-366 | Post-quantum/everlasting privacy research | ADR-013 | L | L | — | Proto | [ ] |
| T-367 | Mobile app wrappers | QV-02 §6 | L | L | M8 | Eng-W | [ ] |
| T-368 | Dogfood governance votes with QuietVote | QV-27 §15 | L | S | M7 | Steward | [ ] |

## Summary by status (at 2026-10-21)

| Epic | Done | Partial | Open |
|---|---|---|---|
| E01 | 3 | 2 | 10 |
| E02 | 3 | 0 | 22 |
| E03 | 0 | 0 | 26 |
| E04 | 4 | 0 | 13 |
| E05 | 0 | 0 | 26 |
| E06 | 0 | 0 | 10 |
| E07 | 0 | 0 | 12 |
| E08 | 0 | 0 | 11 |
| E09 | 0 | 0 | 20 |
| E10 | 0 | 0 | 8 |
| E11 | 0 | 1 | 15 |
| E12 | 0 | 0 | 11 |
| E13 | 0 | 1 | 16 |
| E14 | 0 | 0 | 12 |
| E15 | 0 | 0 | 11 |
| E16 | 0 | 0 | 9 |
| E17 | 0 | 0 | 9 |
| E18 | 1 | 1 | 9 |
| E19 | 0 | 0 | 14 |
| E20 | 0 | 0 | 13 |
| **Total** | **11** | **5** | **277** |

Honest read: specification is wide but mostly Draft; implementation covers hashing, Ed25519 and the board Merkle/checkpoint/entry primitives, all without tests. Recount when closing tasks.
