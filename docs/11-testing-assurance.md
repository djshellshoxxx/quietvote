# QV-11 — Testing and Assurance

**Module ID:** `operations-assurance`  
**Status:** Draft  
**Owner:** Assurance lead (proposed); independent reviewers per §9  
**Last reviewed:** 2026-10-21  
**Related specs:** QV-05, QV-16 (protocol; ADR-004), QV-34 (vectors/conformance), QV-07 (threats), QV-09 (API), QV-10 (UX tasks), QV-13 (a11y/i18n tests), QV-12 (operations, drills), QV-06 (privacy tests); ADR-003, 004, 007, 008, 010, 013

## 1. Objective

Define the evidence required before anyone is told "this works", "this is private" or "this tally is correct". The doctrine (ADR-001, ADR-008): **claims never exceed verified properties**, and the strongest evidence for a verifiable-voting system is not our own tests but (a) public verifiability by independent implementations and (b) independent expert review. Our tests exist to keep the implementation matching the spec, to catch known attack classes cheaply, and to produce auditable artifacts that others can reproduce.

## 2. Scope

### In scope
Test strategy and pyramid; property-based, fuzz and mutation testing; adversarial/negative cryptographic tests; vector conformance (with QV-34); integration, e2e (Playwright), load, security, privacy, chaos/failure tests (board, trustees); independent review plan and budget; release gates; evidence artifacts; vulnerability handling criteria.

### Out of scope
Formal machine-checked verification of the protocol (research track, QV-21; ElectionGuard has had machine-checked verifier work published — see References — we consider it a Could); legal certification; hardware/physical security.

## 3. Actors

| Actor | Goal | Outcome |
|---|---|---|
| Developer | Fast feedback | PR gating on layers L0–L3 |
| Assurance lead | Maintain strategy, evidence | Release dossier |
| Independent reviewer | Break the design/implementation | Public report |
| Maintainer / release manager | Decide ship/no-ship | Gate checklist signed |
| Security reporter | Disclose vulnerabilities | Triage, fix, advisory |
| Self-hoster / observer | Judge maturity | Reads evidence + claim level |

## 4. Requirements

| ID | Requirement | Pri | Acceptance criteria | Verif. |
|---|---|---|---|---|
| QV-11-REQ-001 | The project shall maintain the test layers in §5 with CI enforcement per the "when it runs" column. | M | CI config reviewed; required checks on protected branch. | R |
| QV-11-REQ-002 | Every normative requirement `QV-nn-REQ-nnn` marked Must shall have ≥ 1 automated test (or documented manual procedure) referencing its ID. | M | Traceability script lists untested Musts; zero at release. | T |
| QV-11-REQ-003 | Cryptographic code shall have 100% line and branch coverage and a mutation score ≥ 90% (§7.3). | M | Coverage + Stryker report in evidence. | T |
| QV-11-REQ-004 | All attacks in §6 shall have an implemented automated negative test (or an explicit documented exemption signed by the protocol owner) before the corresponding feature is enabled by default. | M | Attack matrix 100% implemented/exempted. | T, R |
| QV-11-REQ-005 | The reference implementation shall pass 100% of QV-34 vectors in its profile; an independent implementation shall pass P1-verifier before gate G4. | M | Conformance reports. | T |
| QV-11-REQ-006 | Property-based tests shall cover the invariants INV-01…INV-20 (§7.1) with ≥ 1,000 cases per property in PR runs and ≥ 100,000 in nightly runs, seeds logged and replayable. | M | CI logs. | T |
| QV-11-REQ-007 | All parsers of untrusted input (manifest, ballot, proof, bundle, receipt, API bodies, locale catalogs, CSV roll import) shall have coverage-guided fuzz harnesses run ≥ 10 min per PR (smoke) and ≥ 8 h weekly; crashes/hangs/memory blowups are release-blocking. | M | Fuzz job artifacts; corpus committed. | T |
| QV-11-REQ-008 | End-to-end tests shall cover every journey in QV-10 (organizer, voter, trustee, observer) in Chromium, Firefox and WebKit via Playwright, including failure paths and the no-JS read-only paths. | M | Playwright suite green. | T |
| QV-11-REQ-009 | Chaos/failure tests in §8.6 shall pass before every minor release; results are recorded. | M | Report in dossier. | T |
| QV-11-REQ-010 | Load tests per §8.5 shall meet stated targets before every minor release on reference hardware. | M | k6/autocannon report. | T |
| QV-11-REQ-011 | Privacy tests (§8.4) shall demonstrate no IPs, ballot contents, key material, voter identifiers-with-choice, or election text in logs, error reports, metrics, backups outside policy (QV-06). | M | Log-scan test passes with canary strings. | T |
| QV-11-REQ-012 | Builds shall be reproducible (bit-for-bit across two independent environments) and release artifacts signed (ADR-010). | M | `repro-check` job; signature verification. | T |
| QV-11-REQ-013 | No release shall advertise claims above its **assurance level** (§11.2). A release-notes lint rejects banned phrases (QV-10 §7.5) and requires the assurance-level banner. | M | Lint job. | T |
| QV-11-REQ-014 | An independent cryptographic/protocol review (§9) shall be completed, with all High/Critical findings fixed and re-tested, before any non-experimental claim or any use in elections where the group's decisions are consequential beyond "low stakes". | M | Published report + retest letter. | R |
| QV-11-REQ-015 | Vulnerability handling per §12 shall be documented and exercised (tabletop) at least yearly. | M | Exercise record. | R |
| QV-11-REQ-016 | Test code is code: reviewed, versioned, and not allowed to weaken production (no test-only hooks in release builds; QV-34-REQ-013). | M | Release-build hook-absence test. | T |
| QV-11-REQ-017 | Flaky tests are tracked; a test quarantined > 14 days blocks release unless waived by the assurance lead in writing. | S | Flake dashboard. | R |

## 5. Test strategy and pyramid

### 5.1 Layers

| Layer | Content | Tools (ADR-003 stack) | Runs | Share of tests (target) |
|---|---|---|---|---|
| **L0 Static** | TypeScript strict, ESLint (security + custom rules: no `Math.random`, no `==` on secrets, constant-time compare helper only, banned physical CSS props, i18n lint), `tsc --noEmit`, dependency-count budget check, license check (AGPL compatibility), secret scan (gitleaks), Semgrep rules for crypto misuse | tsc, eslint, semgrep, gitleaks | Every commit/PR | — |
| **L1 Unit** | Pure functions: encoders, hashing wrappers, scalar/point wrappers, proof prove/verify, Merkle, tally math, rules, time-zone resolution, message compile | `node:test`, `node:assert`, `c8`/Node coverage | Every commit | ~55% |
| **L2 Vectors** | QV-34 known-answer + negative + mutation corpus | conformance runner | Every PR | ~10% (high value) |
| **L3 Property** | Invariants INV-xx with generated inputs; metamorphic tests | `fast-check` with `node:test` | PR (1k cases), nightly (100k) | ~10% |
| **L4 Integration** | Server + SQLite (`node:sqlite`) + board; API contract tests against QV-09 schemas; client modules against in-memory board; DKG with n in-process trustees; CLI voter/verifier against server | node:test, supertest-like fetch | PR | ~15% |
| **L5 E2E** | Playwright journeys (QV-10), a11y (axe), i18n (RTL, pseudo-locales), no-JS, offline/fault injection, multi-browser | Playwright, `@axe-core/playwright` | PR smoke (Chromium voter flow) + nightly full | ~7% |
| **L6 Non-functional** | Fuzz, load, chaos, security scans/pentest, privacy scans, mutation | jazzer.js `[UNVERIFIED tool/version]`, k6/autocannon, Stryker `[UNVERIFIED node:test integration]`, OWASP ZAP baseline | Nightly/weekly/pre-release | ~3% |
| **L7 External** | Independent review, audits, bounty, third-party verifier conformance | people | Per §9 | — |

Pyramid principle: push every cryptographic correctness question down to L1–L3 (fast, deterministic); keep L5 for wiring and UX. Anything that found a bug in production-like conditions becomes an L1–L3 regression test first.

### 5.2 Determinism and test hygiene
- No wall-clock, no network, no ambient randomness in L1–L4: inject `Clock` and `Entropy` (test-only; QV-34 REQ-013). Property-test seeds printed on failure and stored as regression vectors.
- Test keys derive from public seeds (QV-34 §8); no production keys in repo.
- Coverage targets: crypto + protocol + verifier packages 100% line/branch; server/domain ≥ 90%; client UI logic ≥ 80%; overall ≥ 85%. Coverage is a floor, not evidence of correctness (mutation testing complements).

### 5.3 Traceability
`tools/trace`: scans `// @req QV-nn-REQ-nnn` annotations in tests and the specs' REQ tables; outputs a matrix (requirement → tests → last pass → evidence). Missing Must coverage fails the release job. Specs referencing vectors mention the vector set ID.

## 6. Adversarial and negative cryptographic tests (the attacks-to-test list)

Rule: each row is an **implemented test with a name `attack/ATK-nnn-*`**, mapped to vector sets (QV-34 §7) where deterministic, and to property/fuzz tests otherwise. "Expected" is the behavior of the *verifier/board/client* under attack. Sources are cited in References; attack names come from published literature.

### 6.1 Proof system and hashing

| ID | Attack | Source / class | Test | Expected |
|---|---|---|---|---|
| ATK-001 | **Weak Fiat–Shamir**: challenge hashes only commitment, not statement; adversary picks statement after seeing challenge | Bernhard–Pereira–Warinschi 2012 (Helios) | Construct forged CDS/CP/PoK transcript valid under weak hashing; run against implementation | Rejected: challenge recomputed over **full statement** (election id, public keys, ciphertexts, commitments) |
| ATK-002 | **Frozen Heart**: omitted public values (e.g. PoK public key, generators) from challenge hash | Trail of Bits 2022 (PlonK, Bulletproofs, Girault) | For each hash call site, parameterized test removes each input in turn and asserts a forged-proof generator exists *only* in the weak variant; call-site inventory lint requires explicit statement list | Verifier rejects; inventory test fails if a new proof lacks a statement-completeness test |
| ATK-003 | Missing domain separation (cross-protocol / cross-election proof reuse) | General; Helios ballot-copy | Replay proof across proof types and elections | Rejected (`ERR_ELECTION_BINDING`/`ERR_PROOF_STATEMENT`) |
| ATK-004 | Ambiguous concatenation | General | `("ab","c")` vs `("a","bc")`; max-length fields; length overflow | Distinct hashes; overflow rejected |
| ATK-005 | Proof malleability: non-canonical scalar (s+ℓ), alternate encodings | General | Mutate responses/challenges | Rejected (`ERR_SCALAR_RANGE`) |
| ATK-006 | **Ballot stuffing via invalid selection**: encrypt 2 or −1 (≡ ℓ−1) with simulated 0/1 proof | Helios/ElGamal voting | Craft ciphertexts; omit/forge CDS; vary branches; sub-challenge sum not equal hash | Rejected |
| ATK-007 | Disjunctive proof flaws: both branches simulated; sub-challenges not verified to sum; branch swap | CDS94 | Vectors + property | Rejected |
| ATK-008 | Contest-limit off-by-one / modular wrap (sum ≡ k mod ℓ with large negatives) | Tally integrity | Selections sum k+1, k−1, ℓ+k; exactly-k vs at-most-k | Per rules; wrap impossible because each selection is proven 0/1 |
| ATK-009 | **Invalid group elements**: non-canonical ristretto encodings, identity as ciphertext component or public key, wrong length | RFC 9496 negative encodings | Decode fuzz + vectors | `ERR_POINT_ENCODING`; identity pk rejected |
| ATK-010 | Ed25519: small-order keys/R, non-canonical S, cofactor-related malleability, signature replay | Ed25519 implementation divergences (Wycheproof, Chalkias et al. `[UNVERIFIED]`) | Vectors with `policy` tag | Rejected per strict policy (Q-34-1) |
| ATK-011 | **Second generator / commitment trapdoor**: Pedersen commitment generator h with known discrete log to g; trapdoor lets a prover cheat undetectably | Swiss Post/Scytl shuffle-proof trapdoor (Lewis, Pereira, Teague 2019) | Check h derived by hash-to-group from a documented nothing-up-my-sleeve seed; reproduce in independent code; test fails if any generator is a literal constant without derivation record | Derivation reproducible; test fails otherwise |
| ATK-012 | Verifier incompleteness: some proof never checked (e.g., decryption proof skipped for one trustee, or ballots beyond N) | Universal verifiability failures in the literature | Mutation corpus: each mutant must fail ≥ 1 check (QV-34 §9.3); **coverage-of-checks audit**: instrument verifier to assert every proof object in the bundle was verified | No mutant passes; "unverified proof object" count must be 0 |
| ATK-013 | Parser differentials between implementations (dup JSON keys, number forms, NFC/NFD, unknown fields) | Canonicalization attacks | Differential fuzz reference vs second impl; vectors | Identical accept/reject |

### 6.2 Ballot, voter, and client

| ID | Attack | Source / class | Test | Expected |
|---|---|---|---|---|
| ATK-020 | **Ballot copying / replay** (copy another voter's ballot to reveal vote through the tally) | Cortier–Smyth 2011 (Helios) | Submit copied/modified ballot as another voter; mauled proofs | Rejected: voter id + election id bound into proof challenge and signed envelope; duplicate ciphertext detection |
| ATK-021 | Cross-election replay | General | Ballot from election A to B | `ERR_ELECTION_BINDING` |
| ATK-022 | Vote by non-roll key / Merkle second-preimage on roll tree | Merkle weaknesses | Internal node as leaf; wrong index | `ERR_NOT_IN_ROLL` |
| ATK-023 | Revote abuse: client-supplied timestamp/sequence, out-of-order arrival, equal timestamps, ballot after close | Rules | Rule property tests (INV-07) + races | Order determined by board log index and board time only |
| ATK-024 | **Malicious client adapts after commitment** (Benaloh): shows code for honest ballot, casts different one | Benaloh 2006 | Instrumented hostile client: sends different ciphertext than displayed; audit path | Audit of the displayed code reveals mismatch; UI e2e asserts code shown before choice and no network ciphertext before Cast (QV-10-REQ-007) |
| ATK-025 | Spoiled ballot later cast; cast ballot later claimed spoiled | Benaloh | Board accepts spoiled flag only for non-cast codes, never reversal | `ERR_SPOILED_AND_CAST` |
| ATK-026 | **Weak RNG / nonce reuse / predictable randomness** in encryption | General; browser RNG failures | Inject constant/low-entropy RNG: client must refuse; duplicate-nonce detector in board; test that `crypto.getRandomValues` is only source; ciphertext equality across voters flagged | Client aborts on health-check failure; board rejects repeated `c1` |
| ATK-027 | Served client tampering (operator modifies JS) | ADR-010 web-delivery problem | Serve modified bundle: hash/SRI/E-CLIENT-HASH check; verify reproducible build equality | Detected by hash check; documented residual if user does not verify |
| ATK-028 | Ciphertext/proof size or timing side-channel reveals selection | Metadata | Fixed-size ballots (padded encodings); compare request sizes and server verification time across selections | Size identical; timing difference not statistically significant (t-test, α = 0.01) |
| ATK-029 | Phishing/lookalike client & fake verifier | UX | e2e for Election-ID mismatch; canary self-test; verifier without anchor | Warnings/failures per QV-10 §11 |

### 6.3 Trustees, DKG and decryption

| ID | Attack | Source / class | Test | Expected |
|---|---|---|---|---|
| ATK-030 | **Rogue-key / key cancellation**: last trustee publishes `h = g^x · (Π other h_i)^-1` to control the joint key | Known multi-party key attack | Adversarial trustee in DKG harness; PoK/PoP requirement | Rejected: PoK of each share's secret bound to transcript |
| ATK-031 | **DKG bias** (Pedersen DKG output distribution can be biased by a rushing adversary) | Gennaro–Jarecki–Krawczyk–Rabin 1999 `[UNVERIFIED in session]` | Adversary that withholds/chooses last contribution; measure joint-key distribution irrelevance to security; test that the protocol includes commit-then-reveal/complaint phases per QV-16 | Secrecy unaffected per QV-16 argument; test asserts complaint handling and qualified-set agreement |
| ATK-032 | Inconsistent shares (different shares sent to different parties); false complaints | VSS | Malicious dealer; false accuser | Dealer disqualified / accuser penalized per QV-16; qualified set identical on all honest nodes |
| ATK-033 | Duplicate / zero trustee index; Lagrange with repeated indices | Implementation | Combine with duplicates, index 0, index ≥ n | `ERR_DUP_INDEX`/reject |
| ATK-034 | **Invalid partial decryption** (wrong share, other ciphertext) with valid-looking proof | CP proof misuse | Wrong base, wrong statement | Rejected; trustee disqualified from combine; others suffice if ≥ t |
| ATK-035 | **Decryption oracle / single-ballot decryption**: coerce trustees to decrypt an individual ballot disguised as "the tally" (e.g., aggregate over a set of size 1, or subset selected by adversary) | Tally isolation | Request partial decryption of (a) single ballot ciphertext, (b) aggregate over subset ≠ declared set, (c) aggregate before tally freeze | Trustee client refuses unless ciphertext = recomputed aggregate over the **frozen board set** and ballot count ≥ minimum cardinality policy; QV-10-REQ-018, E-TRU-TALLYMISMATCH |
| ATK-036 | Tally overflow / dlog wrap; non-integer result (indicates cheating) | Math | Counts > bound; point ∉ {g^m} | `ERR_TALLY_OVERFLOW` / `ERR_TALLY_NONINTEGER`; never silently mod |
| ATK-037 | t−1 trustees learn nothing (statistical test of shares/partials) and t learn tally only | Threshold security | Simulate t−1 shares: check that joint key and share distribution are consistent (simulator-based test) | No distinguishing advantage in test harness (sanity, not proof) |
| ATK-038 | Trustee key loss / reuse across elections | Ops | Reused key rejected in new ceremony (fresh keys per election) | `ERR_KEY_REUSE` |

### 6.4 Bulletin board / log

| ID | Attack | Source / class | Test | Expected |
|---|---|---|---|---|
| ATK-040 | **Split view / equivocation**: two different valid STHs for same size to different parties | CT/gossip literature | Hostile board serving two roots; client+mirror cross-check | `ERR_EQUIVOCATION`, `E-BOARD-FORK` |
| ATK-041 | Truncation / rollback of log (restoring older DB) | Operator attack | Restore backup; monitor holding newer STH | Detected: tree size regress `ERR_TREE_REGRESS` |
| ATK-042 | Silent omission of a ballot after receipt issued | Operator attack | Remove entry; receipt holder checks inclusion | `E-BOARD-INCL-FAIL` |
| ATK-043 | Reordering, insertion in the middle, modification | Log integrity | Mutations | Consistency proof fails |
| ATK-044 | Merkle leaf/node second preimage; odd-size tree edge cases | RFC 6962/9162 | Domain-separated hashing (0x00/0x01 prefixes in RFC 9162 construction) tests, sizes 1..257 | Rejected |
| ATK-045 | Time manipulation: backdated ballots, closing-time race, client clock | Rules | Fake-clock server tests; skew e2e | Board time authoritative; late ballots rejected; `E-VOT-CLOSED` |
| ATK-046 | Concurrent duplicate submissions (race) violating one-counted-ballot | Concurrency | 1,000 parallel submissions from one voter | Exactly one counted; log order total; no deadlock |
| ATK-047 | Witness collusion / absence | Transparency | Witness refuses; invalid cosign | Verifier reports `not_run`/fail, never silent pass |

### 6.5 Eligibility, Phase 2, privacy, web

| ID | Attack | Source / class | Test | Expected |
|---|---|---|---|---|
| ATK-050 | Token double-spend / nullifier reuse; blind signature "one-more" forgery; registrar-board timing linkage | Phase 2 (RFC 9474) | Reuse token; batch token requests; timing correlation analysis in simulation | Reuse rejected; linkage risk documented/mitigated by delay/batching |
| ATK-051 | Log/metric/error-report leakage of IPs, ballots, keys, election text | QV-06 | Canary strings through all code paths; grep logs, metrics, crash dumps, backups | Zero hits |
| ATK-052 | Small-electorate/unanimity re-identification | UX/privacy | Property: warn when n < threshold or unanimous | Warning copy `qv.privacy.nc6` appears |
| ATK-053 | XSS / HTML injection / markdown abuse via organizer text; bidi spoofing; URL schemes | Web | Payload corpus into manifest fields; CSP violation reporting off (no external) but enforced | Escaped; CSP blocks; bidi controls rejected |
| ATK-054 | CSRF, clickjacking, CORS misconfig, open redirect, cache poisoning | Web | ZAP baseline + custom tests | None |
| ATK-055 | DoS: giant ballots, deeply nested JSON, BigInt parse bombs, proof-verification amplification, connection flooding, slowloris | Availability | Fuzz + load; limits per QV-09 | Bounded CPU/memory; early reject before expensive verification (signature/size first); rate limits |
| ATK-056 | Dependency / supply-chain compromise; typosquat; lockfile drift; install scripts | Supply chain | `npm ci --ignore-scripts`; lockfile integrity; dependency-count budget; SBOM diff; provenance verification | Build fails on unexpected change |
| ATK-057 | Exported data contains PII or secrets | QV-06 | Export scan | None beyond policy |
| ATK-058 | Placeholder/padding leakage (ElectionGuard 2.0 removed placeholder selections as design simplification — lesson: variable-structure ballot encodings leak) | ElectionGuard release notes (search 2026-10-21) | Compare ballot structure across contests/selections | Structure depends only on public ballot definition |

Exemptions require protocol-owner signature and expiry date. New literature (post-publication attacks) must be triaged within 30 days and added to this table.

## 7. Property-based, fuzz and mutation testing

### 7.1 Invariants (INV) for property tests

| ID | Property |
|---|---|
| INV-01 | `decrypt(encrypt(m; r)) = m` for all valid m, any r; `enc(a)⊕enc(b)` decrypts to a+b (homomorphism) |
| INV-02 | Honest `prove` ⇒ `verify` true (completeness) for PoK, CP, CDS, limit proofs, any statement |
| INV-03 | Any single-field mutation of an honest proof/statement ⇒ `verify` false (soundness smoke) |
| INV-04 | Any t-subset of trustee shares yields identical joint decryption; any (t−1)-subset yields none (sim-based) |
| INV-05 | DKG: honest run yields joint key equal to Π h_i, all honest trustees agree on qualified set |
| INV-06 | Merkle: for random trees/sizes, inclusion/consistency proofs verify; any tamper fails |
| INV-07 | Latest-ballot-per-voter: result independent of arrival interleaving given a fixed log order; each voter contributes ≤ 1 ballot |
| INV-08 | Tally = Σ over counted ballots; order-independence; dropping/adding a ballot changes tally iff it is counted |
| INV-09 | Only roll members' ballots counted; changing the roll changes the manifest hash |
| INV-10 | Manifest hash covers every field including language maps, times, rules; changing any changes Election ID (display ID may collide only per 100-bit rule — property asserts full-hash change) |
| INV-11 | Canonical encoding round-trip; same value ⇒ same bytes across runs, platforms, and locales |
| INV-12 | Time: `opens_at ≤ t < closes_at` acceptance monotone; DST-boundary resolution round-trips |
| INV-13 | Idempotent submit: replaying identical request yields same receipt, one log entry |
| INV-14 | Receipt validity: any receipt for an included ballot verifies against all later consistent STHs |
| INV-15 | Rules: winner computed equals independent naive reference implementation (differential) |
| INV-16 | Ballot size/shape depends only on public ballot definition (ATK-028/058) |
| INV-17 | Verifier never reports `pass` for a check whose inputs were absent (`not_run`) |
| INV-18 | Locale: message compile of every key with random args never throws, never yields empty string; plural categories covered per locale |
| INV-19 | No secret-typed value (branded type) reaches a logger/serializer (type + runtime guard tests) |
| INV-20 | Board durability: any acknowledged append survives crash-recovery at any injected failure point (§8.6) |

Metamorphic tests: permuting voters, relabeling options, scaling electorate size, re-encrypting ballots with new randomness must leave results invariant.

### 7.2 Fuzzing
Targets (harness per target in `fuzz/`): manifest parser/validator, ballot decoder, proof decoders, bundle reader, receipt decoder, Merkle proof decoders, canonical JSON, base32/hex decoders, HTTP API routes (QV-09 schema-guided), CSV/roll import, message catalog compiler, ICS generator. Coverage-guided (jazzer.js) plus grammar/schema-aware generation for structured inputs. Oracles: no crash/hang/OOM; no accepted input that violates schema; **differential** oracle vs second implementation or naive model where available (ATK-013). Corpus seeded from QV-34 vectors; new crashes minimized and added as vectors/regression tests. Time budget: PR smoke 10 min total; weekly 8 h; pre-release 48 h on the protocol/verifier targets.

### 7.3 Mutation testing
- Tooling: StrykerJS (mutators for arithmetic, conditionals, equality, string, array) `[UNVERIFIED: node:test runner support — use command runner fallback]`.
- Scope and thresholds: crypto + protocol + verifier packages: **score ≥ 90%**, survivors triaged (equivalent mutant justification recorded); rules/tally ≥ 85%; server domain ≥ 75%; UI not mandated.
- Cadence: nightly on changed packages (incremental); full run pre-release. Surviving mutants in security-critical comparisons (`===` on lengths, `<` vs `<=` in time/threshold checks, off-by-one in Lagrange/threshold) are release-blocking until killed by a new test.
- Targeted **hand mutation** ("break the verifier on purpose"): for each check in QV-34 §9.1 a test deletes/neutralizes the check's core condition and asserts at least one vector/mutant fails — guards against vacuous test suites.

## 8. Integration, E2E, load, security, privacy and chaos testing

### 8.1 Integration (L4)
- Contract tests: every API endpoint vs QV-09 schema (request/response/errors), including rejection ordering (cheap checks before expensive proof verification).
- In-process multi-party: n trustees (3, 5, 7) + organizer + 50 voters via real modules without browser; DKG, voting with revotes and spoiled ballots, tally, publish, verify with both reference and second verifier.
- Storage: SQLite schema migrations up/down (QV-12), WAL checkpoints, backup/restore equivalence, transaction isolation for append.
- Export/import round trip: export bundle → fresh instance → identical verification report (ADR-001 exit-friendliness).

### 8.2 End-to-end (Playwright)
- Browsers: Chromium, Firefox, WebKit; plus mobile emulation (Pixel-class, iPhone-class) and Tor Browser smoke in nightly `[UNVERIFIED tooling]`.
- Journeys: all of QV-10 (O1–O10, V1–V10, T1–T8, A1–A4) with success and every error in QV-10 §8.1 reachable via fault injection (network offline, timeouts, board stale/fork, clock skew).
- Security-in-UI assertions: no selections visible after seal (QV-10-REQ-005); no ciphertext sent before Cast (REQ-007); no third-party requests; CSP present; build hash in footer equals release manifest.
- Accessibility (QV-13): axe on each state; keyboard-only; 320 px; forced-colors; RTL (`ar`, `ar-XB`); no-JS read-only paths.
- Visual regression per locale pseudo-locales; screenshot baselines reviewed by humans.
- Multi-actor orchestration: Playwright contexts for organizer, 5 voters, trustees running a full election in < 10 min of test time.
- Flake policy: retries ≤ 1 and reported; a retry-needed test is flagged.

### 8.3 Security tests
- SAST (Semgrep, CodeQL `[VERIFIED: semgrep and codeql-action READMEs, 2026-10-21]`), dependency audit (`npm audit`, OSV scanner), license check, SBOM (CycloneDX/SPDX) generation and diff, secret scanning.
- DAST: OWASP ZAP baseline against a test instance each release; custom tests for authZ matrix (organizer/trustee/voter/observer/anonymous × endpoint).
- Headers/TLS: CSP strict (no inline, no remote), HSTS, `Referrer-Policy: no-referrer`, COOP/COEP as applicable, cache policy, `Permissions-Policy`; Tor onion profile (no TLS expectation; headers retained).
- Annual (and pre-1.0) third-party penetration test of the web client + server (§9).

### 8.4 Privacy tests (QV-06)
- Canary injection: unique strings embedded as selections, passphrases, names, IPs, user agents, locale; run full flows; scan logs, DB (outside intended tables), crash dumps, metrics, backups, exports, error-report payloads, browser storage after Clear-device. Any hit fails.
- Linkability tests: verify organizer/observer views and exports contain no choice-to-voter mapping; metadata audit (timing, ordering) documented per Phase.
- Default log policy test: no IP logging by default (ADR-009); configuration test with logging enabled shows explicit warning.

### 8.5 Load and performance
Reference hardware: 2 vCPU / 4 GB VM (typical self-host) `[calibrate]`; reference client: low-end Android profile (QV-13 §7).

| Scenario | Profile | Target (initial; recalibrate after first run, never silently relax) |
|---|---|---|
| Steady voting | 10,000 eligible voters, 60% turnout over 7 days | CPU < 20% avg; 0 errors |
| Closing spike | 3,000 ballots in final 10 min (5/s avg, bursts 50/s) | p95 ballot POST (incl. proof verification) ≤ 800 ms; p99 ≤ 2 s; zero loss; log append ordering preserved |
| Flood | 500 req/s invalid/oversized junk | Cheap rejection; legitimate ballot p95 ≤ 2× baseline |
| Verifier at scale | 10,000 ballots × 10 selections | Reference verifier completes ≤ 15 min on 4-core laptop (worker threads); memory ≤ 1 GB; resumable |
| Tally | 10,000-ballot aggregate + t partial decrypt | ≤ 5 min |
| Client seal | 20 selections, low-end phone | ≤ 8 s (QV-13-REQ-042) |
| Public record browsing / export | 10,000 entries | Paged; export streaming; memory bounded |
| Soak | 24 h at 1 ballot/s | No memory growth > 10%; no fd leak |

Tools: k6 or autocannon (HTTP), custom scripts using real ballot generator (deterministic seeds). Results recorded with commit hash and hardware.

### 8.6 Chaos and failure tests — board and trustees

Method: fault-injection harness (process kill -9, disk quota, fs sync errors via LD_PRELOAD or tmpfs limits, `tc netem` or proxy for latency/loss/partition, clock steppers, container pause). Each scenario states the invariant to hold.

**Board / server**

| ID | Scenario | Expected behavior / invariant |
|---|---|---|
| CH-01 | `kill -9` mid-append (between DB write and STH signing) at every instrumented step | After restart: no acknowledged ballot lost (INV-20); no unacknowledged ballot half-recorded; log contiguous; STH reflects exactly committed entries |
| CH-02 | Power loss simulation (drop un-fsynced writes) | Same; acknowledgement only after durable commit (SQLite WAL `synchronous=FULL` for append path) |
| CH-03 | Disk full during append and during export | Clean refusal `503` with retry guidance; no corruption; recovery after space freed; voters see `E-NET-TIMEOUT`-class state with idempotent retry |
| CH-04 | DB corruption / restore from older backup | Rollback detected by monitors/receipt holders (ATK-041); operator runbook demands announcing; election flagged |
| CH-05 | Clock steps backward/forward ±1 h, NTP jump | Monotonic log timestamps enforced; close boundary evaluated by monotonic-safe board time; alarms |
| CH-06 | Network partition client↔board mid-submit; duplicate delivery; response loss | Idempotent retry; exactly one entry; client ends in `ACCEPTED_RECORDED` or `PENDING_UNCONFIRMED` truthfully |
| CH-07 | Concurrent writers (two server processes accidentally on same DB) | Lock prevents; or detected and refuses; no fork |
| CH-08 | Signing key unavailable / HSM or keyfile missing | Board continues accepting? Decision: stops issuing STH and flags (availability sacrificed for integrity); verifiers show stale head |
| CH-09 | Witness/mirror unavailable or lying | Verifier reports `chk.board.witness` accurately (`not_run`/fail) |
| CH-10 | Resource exhaustion (CPU saturation, memory cap OOM-kill) | Graceful degradation (reject early), restart safe |
| CH-11 | TLS cert expiry / onion service restart | Clear client error; mirrors; no data loss |
| CH-12 | Server upgrade/migration mid-election (QV-12) | Rolling procedure preserves log; verifier passes before/after; schema change cannot alter historical entries |
| CH-13 | Malicious operator (red-team script) tries drop/reorder/rewrite/withhold | All integrity attacks detected by verifier/monitors; withholding is availability-only |

**Trustees**

| ID | Scenario | Expected |
|---|---|---|
| CH-20 | Trustee offline during ceremony round 1/2 | Ceremony stalls with clear status; abort/replace path before Scheduled; no partial key published |
| CH-21 | Trustee unavailable at decryption: exactly n−t offline | Tally succeeds with t |
| CH-22 | n−t+1 offline | `E-DEC-STALLED`; no partial result leakage; resumes when trustees return; documented escalation (organizer may declare election failed; never fabricate result) |
| CH-23 | Trustee loses device after ceremony; has backup | Restore works (restore test); contributes |
| CH-24 | Trustee loses device, no backup | Counts as unavailable; availability budget consumed; incident recorded |
| CH-25 | Trustee submits garbage/invalid partial | Rejected with proof failure; excluded; election proceeds if ≥ t valid |
| CH-26 | Trustee submits partial for wrong ciphertext / early (pre-freeze) | Rejected; early requests refused by client; board refuses to accept pre-freeze partials |
| CH-27 | Two trustees coerced to decrypt early (< t) | Nothing revealed; tests simulate t−1 shares |
| CH-28 | t trustees collude to decrypt individual ballot (out of model) | Cryptographically possible — test documents non-claim; verifies *detectability limits* (no log trace) and that UI copy `qv.privacy.nc1` is present |
| CH-29 | Trustee network flaps during partial submission | Idempotent; duplicates ignored |
| CH-30 | Replacement trustee after ceremony | Not allowed; election must re-run ceremony (new election) — test that API refuses |
| CH-31 | Trustee key destruction after audit window | Post-destruction decryption impossible; archive verification still passes |

Pass criteria: all invariants hold; every failure has a documented user-visible state (QV-10 §8) and operator runbook entry (QV-12). Results (logs, timelines) archived in evidence.

## 9. Independent review and audit plan

### 9.1 Principles
- **Independence:** reviewers have no financial or authorship ties to the code; conflicts disclosed; reports published **in full** (with embargo for unfixed Critical/High up to 90 days).
- **Scope before claim:** no external statement about security/privacy beyond the assurance level reached (§11.2).
- **Spec first, then code:** protocol design review precedes implementation audit; both repeated after major changes (changes to QV-16 wire formats, new voting method, Phase 2/3).
- **Cheap external eyes early:** public specs (CC BY-SA) and a call for review to academic e-voting/cryptography groups; invite hostile reading.

### 9.2 Engagements

| # | Engagement | Scope / artifacts handed over | Reviewer profile | When | Est. effort / cost (USD, planning ranges) `[ASSUMPTION: market estimates, not quotes]` |
|---|---|---|---|---|---|
| R1 | **Protocol & cryptographic design review** | QV-16, QV-05, ADR-004/005/007/013, threat model QV-07, QV-34 methodology | Applied cryptographers with e-voting/Helios/ElectionGuard-class experience (academic groups or boutique crypto auditors) | After QV-16 reaches Review; before heavy implementation | 2 reviewers × 3–5 weeks: $40k–90k |
| R2 | **Implementation audit (crypto + verifier + board)** | Source of crypto/protocol/verifier/board packages, vectors, build config | Cryptography-focused code auditors | Beta (feature-complete for Phase 1) | 2 auditors × 4–6 weeks: $60k–130k |
| R3 | **Web client & server penetration test** | Client delivery chain (ADR-010), CSP, API, authZ, DoS, deployment guide, Tor profile | AppSec firm | Beta and annually | 2 testers × 2–3 weeks: $20k–45k |
| R4 | **Reproducible-build & supply-chain review** | Build scripts, release signing, SBOM, dependency policy | Supply-chain security reviewer | Before 1.0 | 1 reviewer × 1–2 weeks: $8k–20k |
| R5 | **Accessibility audit (WCAG 2.2 AA) + AT user testing** | Full voter/organizer/trustee/observer flows (QV-13) | Accredited accessibility auditors incl. AT users | Before 1.0, then each major | $8k–25k |
| R6 | **Usability / privacy-comprehension study** | QV-10 §13 | UX research, independent | Pre-1.0 | $10k–25k |
| R7 | **Independent second implementation** (verifier) | QV-16, QV-34 only | Different team/language | Before gate G4 | 4–8 person-weeks: $15k–40k (or volunteer) |
| R8 | **Re-test of fixes** | Findings from R1–R3 | Same reviewers | After remediation | 15–25% of original |
| R9 | **Bug bounty** (continuous) | Whole system, safe-harbor policy | Community | From Beta | Fund $10k–25k/year; payouts $200–5,000 (critical crypto/secrecy up to $10k with fund) |

**Planning total to a first non-experimental (1.0) claim:** roughly **$190k–$440k** (R1–R8 + first-year bounty). **Minimum viable credible package** if funds are scarce: R1 + R2 (+R8) + R7 volunteer + R3-lite ≈ **$130k–$280k**. Everything below that must ship labeled "experimental, not independently reviewed" (§11.2). Funding source and sequencing: QV-14.

Examples of the kinds of reviewers to approach (not endorsements; availability unknown): university e-voting cryptography groups and independent security-audit firms with published cryptography audits; selection by RFP with published criteria. `[UNVERIFIED: specific firms]`

### 9.3 Review process
1. RFP with scope, threat model, success criteria, publication terms.
2. Kickoff: threat model walkthrough; access to vectors, test list (§6), CI evidence.
3. Interim findings channel (private, 24 h response on Critical).
4. Report → severity (CVSS-like plus **voting impact**: Secrecy, Integrity, Availability, Verifiability, Eligibility) → fix → re-test → public report + "fixed in" version list.
5. Findings feed new ATK-xxx rows and vectors; reviewers get asked: "what attack from the literature did we miss?"
6. **Coverage statement** in report: what was *not* reviewed.

### 9.4 Release impact
High/Critical open = release-blocking. Medium acceptable with documented mitigation and date. Findings of class "claim contradicts implementation" = Critical.

## 10. Evidence artifacts (release dossier)

For each release `evidence/<version>/` (immutable, hash-listed in `EVIDENCE.json`, signed by release key; large files by hash + storage pointer):

| Artifact | Content | Source |
|---|---|---|
| `build/` | Reproducible-build comparison (two builders' hashes), SBOM, provenance attestation (in-toto/SLSA style `[UNVERIFIED version]`), dependency list + count vs budget | CI |
| `tests/unit-coverage.json`, `tests/mutation.html` | Coverage per package, mutation scores + survivor triage | CI |
| `tests/properties.log` | Seeds, case counts, failures | CI |
| `tests/fuzz-summary.json` | Hours, execs, new coverage, crashes (0 required) | CI |
| `vectors/` | QV-34 tree root, reference report, independent implementation report(s) | conformance |
| `attacks/matrix.md` | ATK table with test names, pass status, exemptions | trace |
| `e2e/` | Playwright report (traces for failures), browsers/versions | CI |
| `a11y/` | axe results, manual AT matrix results, ACR/VPAT, user-testing summary | QV-13 |
| `ux/` | Usability + comprehension results vs thresholds (QV-10 §13) | UX |
| `load/` | Reports with hardware profile | perf |
| `chaos/` | CH-xx results and timelines | chaos |
| `security/` | SAST/DAST/dependency results, pentest report links, open-findings register | security |
| `privacy/` | Canary scan results, data inventory diff | privacy |
| `review/` | External report links, fix/retest letters | reviewers |
| `claims/` | Assurance level, claim text review, banner strings, banned-phrase lint | release mgr |
| `ops/` | Backup/restore drill results, upgrade/migration test, runbook version | QV-12 |
| `trace/` | Requirement → test matrix | trace |
| `signoff.md` | Gate checklist with named approvers and dates | release mgr |

## 11. Release gates

### 11.1 Gate list (blocking unless waived in writing by project owner with public note)

| Gate | Name | Criteria | Applies to |
|---|---|---|---|
| G1 | Green CI | L0–L5 pass; no quarantined tests > 14 d; coverage floors met | all releases |
| G2 | Security hygiene | SAST/DAST/dependency/secret scans: no High/Critical unresolved; SBOM and license check; dependency budget not exceeded | all |
| G3 | Vector conformance | Reference passes 100% of QV-34 profile vectors; MANIFEST signature valid | all |
| G4 | Independent implementation | An independent P1-verifier passes 100% and has verified the release's reference election bundles | Beta+, any protocol change |
| G5 | Attack matrix | §6 matrix 100% implemented or exempted; no exemption expired | Beta+ |
| G6 | Mutation & fuzz | Mutation thresholds; fuzz clean (0 open crashes); weekly fuzz hours met | Beta+ |
| G7 | UX & copy | Usability thresholds (QV-10 §13) and privacy comprehension (Q1/Q2 ≥ 90%) met for changed flows; guarantee strings approved by protocol owner; banned-phrase lint | any change to voter flow or copy |
| G8 | Reproducible build & signing | Two builders agree; signatures verify; client build hash in release manifest | all |
| G9 | Independent review | R1 complete; R2 complete and all High/Critical fixed and re-tested | **required for any non-experimental claim / 1.0** |
| G10 | Operational readiness | Backup/restore drill, upgrade drill, chaos suite (CH-01…CH-31) pass; runbooks current (QV-12) | Beta+ |
| G11 | Privacy | Canary scans clean; data inventory matches QV-06; default logging policy tested | all |
| G12 | Accessibility & i18n | QV-13 §6.4 release-blocking issues zero; Tier-1 locale gates passed for offered locales | all |
| G13 | Claims review | Marketing/docs/UI claims match assurance level; non-claims (ADR-008) present | all |
| G14 | Vulnerability readiness | Disclosure policy published; security contact tested; advisory template | all |

### 11.2 Assurance levels and permitted claims

| Level | Name | Gates met | Permitted language | Required banner (QV-10 `qv.privacy.review`) |
|---|---|---|---|---|
| L-0 | Experimental | G1–G3, G8, G11–G14 | "Experimental software for low-stakes decisions among people who accept the risk." No claims of anonymity/integrity guarantees | "has not yet been independently reviewed" |
| L-1 | Beta | + G4, G5, G6, G10 | "Designed to provide…; verifiable by independent tools"; still no "secure" | same, plus beta notice |
| L-2 | Reviewed | + G9 (R1+R2) | "Independently reviewed by {reviewer}, {date}, report linked; findings fixed" and properties as stated in ADR-008 scope | Review line with link |
| L-3 | Hardened | + R3, R4, R5, one year bounty without open Critical, ≥ 3 real elections completed with independent observers | "Production-ready for voluntary-organization decisions within stated limits" | Review line + date |

Never claimed at any level: coercion resistance, protection from compromised devices, quantum-resistant secrecy, anonymity of participation in Phase 1 (ADR-008).

### 11.3 Defect severity and blocking
- **Blocker (Sev-0):** any violation of secrecy, integrity, eligibility or verifiability invariants; verifier accepts a mutant; data loss of acknowledged ballot; privacy leak in logs.
- **Sev-1:** inability for AT users to complete voter flow; wrong result display; trustee UI allowing unsafe decrypt; claim mismatch.
- **Sev-2:** degraded UX, performance target miss < 2×, non-critical error copy.
- Release blocked by any Sev-0/Sev-1 open; Sev-2 allowed with ticket and date.

### 11.4 Migration and backup checks
Pre-release: apply N→N+1 migration on archived real-shaped election data; verifier before/after identical results; backup/restore drill with checksum compare; export/import round-trip (§8.1).

## 12. Vulnerability handling and election pause criteria (answers QV-07 open question)

| Class | Example | Action for in-flight elections |
|---|---|---|
| **V-Integrity-Detectable** | Server bug creates inconsistent log | Verifiers flag it; organizer advised to **pause/keep open** until fixed; election remains valid if verification passes after fix |
| **V-Integrity-Undetectable** (verifier/proof soundness bug) | Missing proof check (ATK-012) | **Stop**: advisory to treat results of affected versions as unverified; re-verify with fixed verifier; elections whose bundles fail re-verification are declared invalid by organizers |
| **V-Secrecy-Forward** (affects future ballots) | Weak RNG in client | Pause opening new elections / advise voters not to cast until patched client; ballots cast with vulnerable client considered at risk |
| **V-Secrecy-Retroactive** | Key leakage, DKG flaw | Advise affected elections; cannot undo; transparency advisory; rotate; document harm |
| **V-Availability** | DoS | Mitigate; no integrity impact |
| **V-Client-Delivery** | Compromised build | Revoke release signature; publish known-good hashes; clients show `E-CLIENT-HASH` |

Process: private report channel (PGP/age key + plain email), acknowledgment ≤ 3 business days, triage ≤ 7 days, fix target Critical ≤ 14 days, coordinated disclosure ≤ 90 days, CVE/GHSA advisory, public post-mortem; safe-harbor statement for good-faith research; tabletop exercise yearly (QV-11-REQ-015).

## 13. Data and privacy (testing-specific)
Test data is synthetic (QV-34); no real voter data in CI; fuzz corpora scanned for secrets; Playwright traces/screenshots contain only synthetic data and are retained ≤ 30 days; usability recordings per QV-10 §13.1; chaos logs sanitized.

## 14. Security and abuse cases (test infrastructure)

| Case | Cause | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Tests weakened or bypassed to ship | Pressure | False assurance | Protected branches, required checks, traceability, signed gates | Social |
| Test-only hooks shipped | Build error | Deterministic randomness in prod | Release-build hook-absence test (QV-34-REQ-013) | — |
| CI compromise forges evidence | Supply chain | Fake dossier | Reproducible builds by 2 builders; signed evidence; external verification of reports | Collusion |
| Vacuous tests | Poor test design | False confidence | Mutation testing; hand-mutation of checks | — |
| Reviewer capture | Funding conflict | Rubber stamp | Independence rules; publish reports; multiple reviewers | — |

## 15. Interfaces and dependencies
Upstream: QV-16/QV-05 (properties), QV-34 (vectors), QV-09 (schemas), QV-10/13 (journeys, a11y/i18n), QV-12 (drills), QV-07 (threat inputs). Downstream: release process, QV-14 (budget).

## 16. Operations
CI: GitHub Actions or self-hosted `[decision with QV-12]`; nightly/weekly schedules; artifact retention 1 year; evidence archived with release; reference test hardware inventory kept; fuzz infrastructure on a dedicated runner.

## 17. Constraints and assumptions
- Budget ranges are planning estimates; real quotes needed.
- Small team: automation must be cheap to run; layers L6 are scheduled not per-PR.
- Tools marked `[UNVERIFIED]` need validation with the final stack before commit (ADR-003 minimal dependencies applies to dev dependencies too: justify each).

## 18. Proposed ADRs

| ID | Proposal | Rationale |
|---|---|---|
| QV-ADR-P11-1 | Adopt assurance-level ladder L-0…L-3 with claim restrictions (§11.2) | Enforces "honest guarantees" operationally |
| QV-ADR-P11-2 | Independent second verifier required (gate G4) before Beta | Cross-implementation validation of the spec |
| QV-ADR-P11-3 | Attack matrix (§6) is a living normative list; literature triage within 30 days | Keeps pace with new attacks |
| QV-ADR-P11-4 | Board acknowledges ballots only after durable commit; on signing-key loss it stops issuing STH (integrity over availability) | Chaos-test invariants INV-20 |
| QV-ADR-P11-5 | Mutation score ≥ 90% for crypto/protocol/verifier | Guards against vacuous tests |

## 19. Open questions

| Question | Owner | Target | Proposed default |
|---|---|---|---|
| Q-11-1 Which reviewers; funding for R1/R2 | Project owner (QV-14) | Before Beta | RFP; apply for grants; see budget |
| Q-11-2 Minimum acceptable electorate/trustee cardinality for the decryption-oracle control (ATK-035) | QV-16 author | Protocol freeze | ≥ 2 ballots in aggregate; policy configurable up |
| Q-11-3 CI platform and fuzz infrastructure | Eng | M2 | GitHub Actions + one self-hosted runner for fuzz |
| Q-11-4 Do we pursue machine-checked verification (e.g., EasyCrypt/Coq) of the verifier? | Research (QV-21) | 2027 | Could; not blocking |
| Q-11-5 Formal coverage for Phase 2/3 tests | Protocol | Phase 2 | Add ATK-05x/06x rows then |
| Q-11-6 Bounty platform & legal safe-harbor text | Project owner | Beta | Self-run with policy file |

## 20. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Draft authored 2026-10-21 |

## References (accessed 2026-10-21; `[UNVERIFIED]` = from author knowledge, not confirmed in session)
- Trail of Bits, "The Frozen Heart vulnerability in Girault's proof of knowledge", 2022-04-14: https://blog.trailofbits.com/2022/04/14/the-frozen-heart-vulnerability-in-giraults-proof-of-knowledge/ (rule: hash all public statement values and prover commitments; affected PlonK, Bulletproofs implementations); and "A mistake in the bulletproofs paper could have led to the theft of millions of dollars", 2023-08-02: https://blog.trailofbits.com/2023/08/02/a-mistake-in-the-bulletproofs-paper-could-have-led-to-the-theft-of-millions-of-dollars/
- Bernhard, Pereira, Warinschi, "How not to Prove Yourself: Pitfalls of the Fiat-Shamir Heuristic and Applications to Helios", ASIACRYPT 2012 (summary via search listing; eprint 2016/771 lists related work) — weak vs strong Fiat–Shamir; consequences for Helios tallying and result tampering.
- Cortier & Smyth, "Attacking and fixing Helios: An analysis of ballot secrecy", CSF 2011 / J. Computer Security 21(1), 2013: https://members.loria.fr/VCortier/files/Publications/b2hd-Helios-CSF11.html
- Lewis, Pereira, Teague, "Ceci n'est pas une preuve: The use of trapdoor commitments in Bayer-Groth proofs and the implications for the verifiability of the Scytl-SwissPost Internet voting system", 12 Mar 2019: https://sarahjamielewis.com/evoting/UniversalVerifiabilitySwissPost.pdf (trapdoor in commitment scheme of shuffle proof; Swiss authorities withdrew system for May 2019 votes — per news summary in University of Melbourne newsroom item).
- Gennaro, Jarecki, Krawczyk, Rabin, "Secure Distributed Key Generation for Discrete-Log Based Cryptosystems", EUROCRYPT 1999 `[UNVERIFIED]`.
- Benaloh, "Simple Verifiable Elections", EVT 2006; Cramer–Damgård–Schoenmakers, "Proofs of Partial Knowledge…", CRYPTO 1994; Chaum–Pedersen, CRYPTO 1992.
- ElectionGuard specifications (versions 0.85 … 2.1 listed; 2.0 major refactor eliminated placeholder selections; 2.1 changed challenged-ballot opening to release nonces) via search results 2026-10-21: https://electionguard.vote/spec/ (primary site not fetchable in session); Machine-checked universal verifiability of ElectionGuard (ANU repository listing) https://openresearch-repository.anu.edu.au/items/9557a547-813f-4e65-84a6-0dbeae696f84; MITRE ElectionGuard pilot requirements https://www.electionguard.vote/images/MITRE-EG-CP-requirements.pdf; E-Vote-ID 2024 "Verifying ElectionGuard – a theoretical and empirical analysis" https://dl.gi.de/items/3bd629bb-cf25-48c9-988d-a9461ce060ef/full
- RFC 9162 (CT 2.0), RFC 6962, RFC 9496, RFC 8032, RFC 9474.
- Tooling notes (fast-check, Stryker, jazzer.js, Playwright, axe-core) `[UNVERIFIED in session]`; Deque note on axe-core and WCAG 2.2: https://www.deque.com/blog/wcag-2-2-removes-4-1-1-parsing-and-how-axe-core-is-impacted/ (via search listing).
