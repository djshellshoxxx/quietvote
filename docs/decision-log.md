# QuietVote Decision Log

Record decisions that affect product scope, privacy guarantees, protocols, architecture, deployment, or project governance. Keep rationale and rejected alternatives so later contributors can understand the tradeoffs.

## Decision template

### QV-ADR-NNN — [Short title]

- **Status:** Proposed / Accepted / Superseded / Rejected
- **Date:** YYYY-MM-DD
- **Decision owner:** [role/person]
- **Context:** [Problem and constraints]
- **Decision:** [What is selected]
- **Alternatives considered:** [Options]
- **Consequences:** [Benefits, costs, privacy/security effects]
- **Requirements affected:** [IDs]
- **Review trigger:** [What evidence would reopen this]

---

## Initial decisions

ADRs 001–013 below are the **baseline engineering decisions** made so specification and build work can proceed in parallel. They are **Accepted (provisional)**: the project owner delegated drafting authority; each stays provisional until an owner review is recorded here. Any spec that contradicts a baseline ADR must either follow it or propose a superseding ADR.

### QV-ADR-000 — Create a specification-first framework

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decision owner:** Project owner
- **Context:** The project is newly created and needs a structured way to settle product and engineering questions before implementation.
- **Decision:** Establish a documentation index, capability map, charter, and module specification framework before writing application code.
- **Alternatives considered:** Begin implementation from a high-level concept; write a single monolithic specification.
- **Consequences:** The repository begins with explicit open questions and proposed module boundaries. No implementation decisions are implied. The capability map requires review before module specs become approved.
- **Requirements affected:** None yet.
- **Review trigger:** Project owner review of the capability boundaries and initial target users.


---

## Baseline decisions (provisional)

### QV-ADR-001 — Project stance: minimal-trust, exit-friendly, no mandatory identity
- **Status:** Accepted (provisional) · **Date:** 2026-10-21 · **Owner:** Project owner
- **Context:** The project is a disruptive, crypto-libertarian tool: no gatekeepers, no required KYC, no single operator able to see or alter outcomes.
- **Decision:** Design principles: (1) verify, don't trust — every outcome independently verifiable by any observer; (2) no operator is in the secrecy or integrity trust base, only the availability trust base; (3) no mandatory identity beyond a group-chosen credential; no KYC by default; (4) full data export and operator exit at any time; (5) no token, no on-chain dependency; (6) honest guarantees — claims never exceed the threat model.
- **Consequences:** "Anarchist/libertarian" positioning is a *design stance* (censorship resistance, self-sovereignty), not a licence to overclaim security.
- **Requirements affected:** QV-00, QV-07, QV-08, QV-14.

### QV-ADR-002 — Delivery model: self-hostable first, hosted later
- **Decision:** MVP is a single self-hostable server (an *untrusted bulletin board and coordinator*) plus a browser client and an independent CLI verifier. A maintainer-hosted instance may be added later on the same code; hosted operator is treated as untrusted for secrecy/integrity.
- **Alternatives:** SaaS-first (rejected: concentrates trust/legal exposure); P2P-first (deferred: consistency, abuse and UX cost; see QV-32).

### QV-ADR-003 — Stack
- **Decision:** TypeScript (strict) on Node.js 22 LTS; npm workspaces monorepo; `@noble/curves` and `@noble/hashes` (independently audited, zero-dep) for all primitives; `node:sqlite` for server storage; esbuild for client bundling; `node:test` for tests. No cryptographic primitive is hand-implemented. Minimal dependency count is a release criterion.

### QV-ADR-004 — Group and ballot cryptography
- **Decision:** Prime-order **ristretto255** group. Ballots: **exponential ElGamal** with per-selection encryption; **Chaum–Pedersen / Cramer–Damgård–Schoenmakers (CDS) disjunctive proofs** that each selection encrypts 0 or 1, plus a proof that selection count satisfies the contest limit; **homomorphic aggregation**; **t-of-n threshold decryption** with a **Pedersen/Feldman verifiable DKG** (trustees); **Chaum–Pedersen decryption proofs**; Fiat–Shamir with domain-separated, length-prefixed hashing of the *full statement*; **Benaloh challenge** (cast-or-audit) for cast-as-intended. Lineage: Helios / ElectionGuard. Final byte-level protocol: QV-16.
- **Alternatives:** Verifiable mixnets (rejected for MVP: operational complexity, needed for ranked/write-in later); MPC tally; homomorphic with Paillier (larger, slower).
- **Review trigger:** Independent cryptographic review (QV-11) before any non-experimental claim.

### QV-ADR-005 — Eligibility and ballot authentication (phased)
- **Decision:** **Phase 1 ("secret ballot, public participation")**: voter roll = list of voter Ed25519 public keys committed (Merkle root) in the signed election manifest; each ballot is signed by the voter key; latest valid ballot per voter counts (revoting allowed). Participation is visible, choices are not. **Phase 2**: unlinkable ballots via blind-signed single-use tokens (RFC 9474). **Phase 3**: registrar-free anonymous eligibility via ZK Merkle-membership with nullifiers (Semaphore-style). Anonymous-participation claims are made only from Phase 2/3 and only as specified.

### QV-ADR-006 — Voting methods
- **Decision:** MVP: yes/no, single-choice, approval, k-of-n multi-select, with quorum and threshold (simple/supermajority) rules. Phase 2: ranked (pairwise-matrix homomorphic tally → Schulze/Ranked Pairs), weighted votes, delegation. Write-ins excluded from MVP. Tie-break rules are declared in the manifest.

### QV-ADR-007 — Bulletin board and transparency
- **Decision:** Append-only, Merkle-tree (RFC 9162-style) log of all election artifacts, with signed tree heads, inclusion/consistency proofs, and optional third-party witness cosigning and public mirrors. Server cannot silently drop, reorder or alter entries without detection by any monitor or voter holding a receipt.

### QV-ADR-008 — Trust model and non-claims
- **Decision:** Trust base: threshold of trustees for secrecy (any t-1 collusion learns nothing); nobody for integrity (universally verifiable); server for availability only. **Explicitly not claimed:** coercion-resistance/receipt-freeness against a strong adversary (mitigated partially by revoting), protection from compromised voter devices, long-term secrecy against quantum adversaries, anonymity of participation in Phase 1, resistance to network-level metadata analysis without Tor.

### QV-ADR-009 — Transport and metadata
- **Decision:** TLS-only; no third-party resources, fonts, analytics or CDNs; strict CSP; optional Tor onion-service deployment is a first-class supported target; server logs retain no IPs by default.

### QV-ADR-010 — Client trust (web-delivery problem)
- **Decision:** Browser client is the weakest link (code served by the operator). Mitigations: reproducible builds with published hashes; subresource integrity; signed release manifest; an independent CLI verifier and a standalone "verifier page" that can be run offline; optional installable/pinned client; voters can run Benaloh audits with a second device. Documented as residual risk.

### QV-ADR-011 — Licence
- **Decision:** AGPL-3.0-or-later for all code (forces hosted forks to publish modifications); specs and docs CC BY-SA 4.0. Contributions under DCO sign-off.

### QV-ADR-012 — No token, no chain
- **Decision:** No native token, no blockchain dependency. Optional anchoring of tree heads to external public timestamping (e.g. OpenTimestamps, a public chain) is an *optional witness*, never a dependency.

### QV-ADR-013 — Post-quantum and long-term privacy
- **Decision:** v1 is classical-security. Harvest-now-decrypt-later risk against ballot secrecy is documented; mitigations are short-lived election keys, destruction of key shares after the audit window, and a research track (QV-21) for lattice-based/ everlasting-privacy commitments. Algorithm agility via versioned protocol identifiers.


---

## Proposed ADRs (pending owner review)

Collected 2026-10-21 by the consistency editor from every spec's "Proposed ADRs" section (`grep QV-ADR-P`). All are **Proposed** and non-binding until the owner records review here, except where a reconciliation ADR below (QV-ADR-014 onward) has provisionally resolved a conflict. "Conflicts-with" lists the other decisions that the row disagrees with or overlaps; `→ QV-ADR-nnn` means the conflict is resolved provisionally in the next section. R-03 and R-04 originally reused `P03-n`/`P04-n`, colliding with QV-03/QV-04; they are renamed `P-R03-n`/`P-R04-n` (R-02: `PR02-n` → `P-R02-n`) (see `docs/plan/CONSISTENCY-REPORT.md`).

| ID | One-line decision | Source | Conflicts-with |
|---|---|---|---|
| QV-ADR-P00-1 | First target group is OSS foundations / online collectives. | QV-00 | — |
| QV-ADR-P00-2 | Numeric success gates S1–S14 adopted as release thresholds. | QV-00 | — |
| QV-ADR-P01-1 | Adopt M1–M11 module set and DAG with import-lint enforcement; verifier independent of server code. | QV-01 | — |
| QV-ADR-P02-1 | Withdrawal of cast ballots is not supported; revoting only. | QV-02 | QV-16 revoting/blank (consistent) → QV-ADR-016 |
| QV-ADR-P02-2 | Pull-based notifications, no stored contact data by default. | QV-02 | — |
| QV-ADR-P03-1 | Close is defined by log index of `election.close`, not wall-clock claims by the operator. | QV-03 | — |
| QV-ADR-P03-2 | Entrenchment: protected rule fields require ≥ 3/4 and ≥ 60% quorum. | QV-03 | — |
| QV-ADR-P03-3 | Dispute arbiters by verifiable sortition seeded from drand; fallback to named arbiters in small groups. | QV-03 | — |
| QV-ADR-P03-4 | Manifest binds ballots through `manifest_id` inside the signed envelope. | QV-03 | — |
| QV-ADR-P04-1 | Use Web Crypto AES-256-GCM + Argon2id (`@noble/hashes`) for key files | QV-04 | ADR-003 (consistent) |
| QV-ADR-P04-2 | Per-group key derivation by HKDF from a master seed; optional member vouching (`enrollment.vouches`) added to the rules schema. | QV-04 | — |
| QV-ADR-P04-3 | Roll amendments (lost-key recovery) require k stewards + public delay + old-key veto + per-election cap. | QV-04 | — |
| QV-ADR-P04-4 | Phase 3 first prototype is a linkable ring signature over existing voter keys (no new enrollment, no setup); SNARK route only if requirements fail. | QV-04 | P-R01-3 |
| QV-ADR-P04-5 | Phase 2 token reissue is unsupported until a safe design is reviewed. | QV-04 | — |
| QV-ADR-P05-1 | Receipts are SCT-like signed promises with `mmd` = 60 s; inclusion proof is the evidence of recording. | QV-05 | QV-07 REQ-041 MMD 300 s → reconciled in report |
| QV-ADR-P05-2 | Verifier check IDs V1–V14 are the normative common vocabulary across specs and tests. | QV-05 | — |
| QV-ADR-P05-3 | Spoiled (audited) ballots are published openings; UI instructs test selections only. | QV-05 | P16-8, P-R01-5 → QV-ADR-020 |
| QV-ADR-P06-1 | Persist no IP/UA by default; rate limiting uses in-memory HMAC buckets keyed by a daily-rotated secret. | QV-06 | — |
| QV-ADR-P06-2 | Log carries enumerated reason codes only; free text lives in deletable C1 stores. | QV-06 | — |
| QV-ADR-P06-3 | Add `elections.min_counted_ballots` (privacy floor for decryption) and `disclosure.log_read_during_open` to the QV-03 rule schema. | QV-06 | P26-4 (floor 3/ack<10); QV-03 default 1 → QV-ADR-021 |
| QV-ADR-P06-4 | Label hashes in the log are salted with a per-group deletable salt. | QV-06 | — |
| QV-ADR-P07-1 | Control entries and extended election state machine | QV-07 | QV-03 §5.2 lifecycle; QV-09/QV-28 enums; QV-18 phases → QV-ADR-022 |
| QV-ADR-P07-2 | Assurance labels and witness tiers | QV-07 | — |
| QV-ADR-P07-3 | Single-trustee degraded mode permitted only with explicit banner | QV-07 | — |
| QV-ADR-P07-4 | Release integrity: 2-of-3 signed manifests plus reproducible builds | QV-07 | — |
| QV-ADR-P07-5 | No passwords; key-based authority only | QV-07 | — |
| QV-ADR-P08-1 | Node baseline moves to 24 LTS. | QV-08 | ADR-003 (Node 22) → QV-ADR-014; P-R02-1; QV-28 REQ-021; QV-30 engines |
| QV-ADR-P08-2 | Split-origin client as a supported posture | QV-08 | — |
| QV-ADR-P08-3 | Per-tenant SQLite file isolation | QV-08 | — |
| QV-ADR-P08-4 | Signed-request authentication, no sessions | QV-08 | — |
| QV-ADR-P09-1 | Self-authenticating writes: state changes only via signed log entries. | QV-09 | — |
| QV-ADR-P09-2 | No cookies, bearer-in-header, no ambient authority. | QV-09 | — |
| QV-ADR-P09-3 | Public API == internal API; OpenAPI generated from JSON Schemas. | QV-09 | — |
| QV-ADR-P09-4 | Entries transported as canonical bytes (never re-serialized JSON). | QV-09 | QV-16 hex-in-JCS vs QV-09 b64u → QV-ADR-019 |
| QV-ADR-P10-1 | Adopt 100-bit Crockford-base32 grouped display for Election ID and Ballot code, full hash always available | QV-10 | — |
| QV-ADR-P10-2 | Verifier ships a built-in known-bad canary sample (QV-34 §9) and UIs must offer a self-test | QV-10 | — |
| QV-ADR-P10-3 | Spoiled (test) ballots are posted to the board by default (voter may opt out) and cannot later be cast | QV-10 | P-R01-5 → QV-ADR-020 |
| QV-ADR-P10-4 | `translate="no"` on review/receipt regions plus banner on detected auto-translation | QV-10 | — |
| QV-ADR-P10-5 | Mandatory `qv.privacy.review` line sourced from signed release manifest | QV-10 | — |
| QV-ADR-P11-1 | Adopt assurance-level ladder L-0…L-3 with claim restrictions (§11.2) | QV-11 | — |
| QV-ADR-P11-2 | Independent second verifier required (gate G4) before Beta | QV-11 | — |
| QV-ADR-P11-3 | Attack matrix (§6) is a living normative list; literature triage within 30 days | QV-11 | — |
| QV-ADR-P11-4 | Board acknowledges ballots only after durable commit; on signing-key loss it stops issuing STH (integrity over availability) | QV-11 | — |
| QV-ADR-P11-5 | Mutation score ≥ 90% for crypto/protocol/verifier | QV-11 | — |
| QV-ADR-P12-1 | No web admin UI in MVP; CLI + signed records only. | QV-12 | — |
| QV-ADR-P12-2 | Operator cannot extend/pause/invalidate; only manifest-authorised org-admin-signed log entries. | QV-12 | P07-1 (consistent) → QV-ADR-022 |
| QV-ADR-P12-3 | Restored-behind-witness logs fail closed with receipt-based resubmission. | QV-12 | — |
| QV-ADR-P12-4 | Upgrades never cross protocol versions for an open election. | QV-12 | — |
| QV-ADR-P13-1 | WCAG 2.2 AA target + listed AAA; no CAPTCHAs; AT test matrix | QV-13 | — |
| QV-ADR-P13-2 | Initial locales en, es, fr, de, pt-BR, ar (+ tiers, gating) | QV-13 | — |
| QV-ADR-P13-3 | Guarantee-class strings have no fallback; locale dropped if unreviewed | QV-13 | — |
| QV-ADR-P13-4 | Election content translations live in signed manifest (hash-covered) | QV-13 | — |
| QV-ADR-P13-5 | No-JS casting via CLI-produced ballot-file upload | QV-13 | — |
| QV-ADR-P14-1 | Rejected: open core, data monetisation, token funding. | QV-14 | — |
| QV-ADR-P14-2 | Hosting gate: audit published + exit tested + legal review + on-call. | QV-14 | — |
| QV-ADR-P14-3 | Governance of funds: 40 % cap, annual ledger, ring-fenced audit fund. | QV-14 | — |
| QV-ADR-P16-1 | Canonical serialization: RFC 8785 JSON (QV-JSON profile) for artifacts; framed binary for Fiat–Shamir | QV-16 | QV-09 B64u/hex encodings; P09-4 → QV-ADR-019 |
| QV-ADR-P16-2 | DKG: Feldman VSS with commit-then-reveal, per-coefficient PoK and DH-reveal complaints | QV-16 | — |
| QV-ADR-P16-3 | Selection limit via placeholder ciphertexts and a Chaum–Pedersen sum proof | QV-16 | — |
| QV-ADR-P16-4 | Threshold decryption without compensated shares | QV-16 | — |
| QV-ADR-P16-5 | Hash split and suite id: SHA-256 for identifiers, SHA-512 for scalars; suite string hashed into every frame | QV-16 | — |
| QV-ADR-P16-6 | DKG share transport: ephemeral-static ristretto DH + HKDF-SHA-256 + AES-256-GCM | QV-16 | — |
| QV-ADR-P16-7 | Revoting: BB-sequence ordering with `supersedes` hash chain, `max_per_voter` | QV-16 | QV-20 §7 voter-chosen `seq` → QV-ADR-016 |
| QV-ADR-P16-8 | Hedged deterministic ballot randomness `ξ` and two spoil modes (reveal mandatory, trustee-decrypt optional) | QV-16 | P05-3, P10-3, P-R01-5, QV-18 `ballot_audit` → QV-ADR-020 |
| QV-ADR-P16-9 | Strict Ed25519 verification (RFC 8032, no ZIP-215 leniency) and proof-binding to voter `binder` | QV-16 | QV-34 Q-34-1 (agrees); QV-ADR-018 |
| QV-ADR-P16-10 | Phase hooks via `AuthScheme` and `binder` | QV-16 | — |
| QV-ADR-P17-1 | True DKG by default; dealer mode only as disclosed option. | QV-17 | — |
| QV-ADR-P17-2 | No trustee replacement or resharing after `election_open` in v1. | QV-17 | — |
| QV-ADR-P17-3 | Trustee client releases shares only for locally derived aggregate ciphertexts (REQ-040). | QV-17 | P-R01-4 (consistent) |
| QV-ADR-P17-4 | Age as trustee bundle format. | QV-17 | — |
| QV-ADR-P18-1 | Roll commitment via `roll_commit` bound by `election_open`. | QV-18 | ADR-005 wording; QV-16 §5.6.1 `roll` in manifest → QV-ADR-015 |
| QV-ADR-P18-2 | One log, one signing key per election; key deleted at archive. | QV-18 | — |
| QV-ADR-P18-3 | Cutoff by sequence number, not timestamp. | QV-18 | — |
| QV-ADR-P18-4 | Header-only hashing (`body_digest`) to permit redaction. | QV-18 | — |
| QV-ADR-P19-1 | Persist only an Argon2id/AES-GCM-wrapped seed; use non-extractable `CryptoKey` for session signing where available. | QV-19 | — |
| QV-ADR-P19-2 | Dual release authenticity: Sigstore keyless and offline 2-of-N maintainer signatures, plus two-builder reproducibility. | QV-19 | — |
| QV-ADR-P19-3 | No service worker in v1; split-origin as the recommended high-assurance web posture. | QV-19 | — |
| QV-ADR-P19-4 | Production dependency allowlist (`@noble/curves`, `@noble/hashes` only) with ≤ 3 package ceiling. | QV-19 | P-R02-2 → QV-ADR-024 |
| QV-ADR-P19-5 | Per-election voter keys by default. | QV-19 | — |
| QV-ADR-P20-1 | Slack-selection encoding for min/max limits. | QV-20 | P16-3 (QV-16 prevails; min>0 reserved) |
| QV-ADR-P20-2 | Ranked ballots via encrypted pairwise bits with per-triple weak-order pattern proofs. | QV-20 | P-R01-6 (n≤12 cap) → QV-ADR-023 |
| QV-ADR-P20-3 | Delegation is public, static, Phase 1 only. | QV-20 | — |
| QV-ADR-P20-4 | Verifiers check `M·G` instead of solving dlog. | QV-20 | — |
| QV-ADR-P20-5 | Declared tie-break kinds including beacon-random. | QV-20 | — |
| QV-ADR-P24-1 | Traceability as plain-text, script-generated artifacts in git | QV-24 | — |
| QV-ADR-P25-1 | DCO + no CLA; no proprietary dual-licensing. | QV-25 | P-R03-6 (same decision) |
| QV-ADR-P25-2 | Snippets in docs dual-licensed CC BY-SA 4.0 / AGPL-3.0-or-later. | QV-25 | — |
| QV-ADR-P25-3 | Software has no phone-home; maintainers are not controllers for self-hosted deployments. | QV-25 | — |
| QV-ADR-P25-4 | Experimental banner until audit gate passes. | QV-25 | — |
| QV-ADR-P26-1 | Application binds to a Unix socket in onion profiles so IPs are never visible to application code. | QV-26 | — |
| QV-ADR-P26-2 | Epoch-batched, hash-sorted appends and client random delay as Phase 2/3 defaults. | QV-26 | — |
| QV-ADR-P26-3 | No JS-free voting fallback (rejected); document Tor Browser Standard level as the supported maximum. | QV-26 | — |
| QV-ADR-P26-4 | Small-group floor of 3 and mandatory acknowledgement under 10. | QV-26 | P06-3 → QV-ADR-021 |
| QV-ADR-P27-1 | Maintainer-seat and security-reviewer-seat employer cap; 2/3 decision rule; steward sunset. | QV-27 | — |
| QV-ADR-P27-2 | Release channels: nightly / rc / stable / lts / security; no `stable` before external audit. | QV-27 | — |
| QV-ADR-P27-3 | Coordinated disclosure with 90-day default, open `security-announce` list with no paid tier. | QV-27 | — |
| QV-ADR-P27-4 | Permissive-code, protective-name trademark policy; neutral holder. | QV-27 | — |
| QV-ADR-P27-5 | Funding independence rules and public ledger. | QV-27 | — |
| QV-ADR-P27-6 | Verification support for released protocol versions is perpetual. | QV-27 | — |
| QV-ADR-P28-1 | One SQLite database per election plus a control DB | QV-28 | — |
| QV-ADR-P28-2 | Log-is-truth; projections rebuildable; DB triggers enforce append-only as defence in depth | QV-28 | — |
| QV-ADR-P28-3 | Application-level envelope encryption with built-in `node:crypto` ChaCha20-Poly1305; no SQLCipher dependency. | QV-28 | ADR-003 (consistent); AES-GCM P04-1/P16-6 |
| QV-ADR-P28-4 | Do not persist the invite↔voter linkage | QV-28 | — |
| QV-ADR-P30-1 | Lockstep product version with independent `qv-proto/<n>`; protocol versions immutable and verifiers support all released versions forever. | QV-30 | — |
| QV-ADR-P30-2 | Only `packages/crypto` may import `@noble/*`; secrets via branded types. | QV-30 | — |
| QV-ADR-P30-3 | Two-approval rule, including a security reviewer, for crypto/protocol/policy/CI paths. | QV-30 | — |
| QV-ADR-P30-4 | Traceability gate: Must requirements without tests block release. | QV-30 | — |
| QV-ADR-P31-1 | Default-deny telemetry schema enforced in CI. | QV-31 | — |
| QV-ADR-P31-2 | No client telemetry; no outbound telemetry by default. | QV-31 | — |
| QV-ADR-P31-3 | Tracing and automatic crash reporting disabled in the reference build. | QV-31 | — |
| QV-ADR-P32-1 | Federation adds transport/replication only; validity and tally rules unchanged. | QV-32 | — |
| QV-ADR-P32-2 | Witness cosigning with manifest-declared k-of-m is the first federation feature (F1). | QV-32 | — |
| QV-ADR-P32-3 | No ballot P2P gossip; head-gossip among monitors only. | QV-32 | — |
| QV-ADR-P32-4 | Nostr/IPFS only as optional dumb-pipe adapters; no key reuse; Merkle log remains source of truth. | QV-32 | — |
| QV-ADR-P34-1 | Vector trees are versioned per protocol version and immutable once stable; generated deterministically from public seed with HKDF address scheme | QV-34 | — |
| QV-ADR-P34-2 | `stable` requires independent reproduction by a second implementation | QV-34 | — |
| QV-ADR-P34-3 | Verifier ships a signed canary bundle; self-test mandatory in UI | QV-34 | — |
| QV-ADR-P-R01-1 | Adopt the transcript rules of §4.2 as normative for QV-16, including per-proof DSTs, injective length-prefix encoding, and mandatory negative vectors | R-01 | P16-1 (QV-16 prevails) |
| QV-ADR-P-R01-2 | DKG = Feldman-style with PoP, public complaint adjudication via DLEQ-revealed ECDH secret, transcript certification, liveness check… | R-01 | P16-2 (QV-16 prevails) |
| QV-ADR-P-R01-3 | Phase 3 candidate = ristretto255 one-out-of-many membership + scope-bound DLEQ nullifier, not Semaphore/Groth16; gated on a funded review | R-01 | P04-4 (ring signature vs one-out-of-many) |
| QV-ADR-P-R01-4 | Trustees shall independently recompute and sign the tally-input hash and decrypt only that aggregate | R-01 | P17-3 (consistent) |
| QV-ADR-P-R01-5 | Benaloh spoiled-ballot openings are not published or decrypted by trustees; only the voter's verifier sees them | R-01 | P16-8, P05-3, P10-3 → QV-ADR-020 |
| QV-ADR-P-R01-6 | Ranked method = pairwise bits + forbidden-3-cycle proofs, capped at n ≤ 12, gated on external review | R-01 | P20-2 → QV-ADR-023 |
| QV-ADR-P-R01-7 | Long-term privacy plan = short-lived keys now; Pedersen-commitment everlasting-privacy design in QV-21; hybrid Ed25519 + ML-DSA signing for the… | R-01 | — |
| QV-ADR-P-R02-1 | Runtime target: move baseline from Node 22 to the newest LTS before v1 | R-02 | ADR-003; P08-1 → QV-ADR-014 |
| QV-ADR-P-R02-2 | Vendor and hash-pin the cryptographic dependencies | R-02 | P30-2, P19-4 (lockfile-only) → QV-ADR-024 |
| QV-ADR-P-R02-3 | Trustees run offline CLI tooling only; browser-resident secret shares prohibited | R-02 | QV-17 (browser trustee client) → QV-ADR-024 |
| QV-ADR-P-R02-4 | Threshold-signed, expiring, transparency-logged release manifests | R-02 | — |
| QV-ADR-P-R02-5 | ASVS 5.0.0 L2 baseline with named L3 items as the application-security acceptance standard | R-02 | — |
| QV-ADR-P-R03-1 | Result-disclosure policy is part of the signed manifest and enforced by trustees and verifier. | R-03 | — |
| QV-ADR-P-R03-2 | No telemetry, no IP retention; test-enforced. | R-03 | P06-1, P31-2 (overlap) |
| QV-ADR-P-R03-3 | Cast-ballot randomness is never retained or exportable by the client. | R-03 | — |
| QV-ADR-P-R03-4 | Legal-scope statement: not for statutory union/co-op/corporate/government elections; model-bylaw guidance provided. | R-03 | — |
| QV-ADR-P-R03-5 | Open-source export notification under EAR §740.13(e) at first public release (subject to counsel confirmation). | R-03 | — |
| QV-ADR-P-R03-6 | DCO-only, no CLA; consequence: no relicensing/dual-licensing without unanimous contributor consent. | R-03 | P25-1 (same decision) |
| QV-ADR-P-R03-7 | No warrant canary as a control; publish legal-request policy and transparency report. | R-03 | — |
| QV-ADR-P-R03-8 | Onion profile defaults to vanguards-full for long-lived instances. | R-03 | — |
| QV-ADR-P-R04-1 | Position QuietVote as a secret-ballot companion to deliberation tools with documented export/import hooks (Loomio/Decidim/Discourse). | R-04 | — |
| QV-ADR-P-R04-2 | Provide a clearly labelled demo instance earlier than the production hosted offering. | R-04 | ADR-002 → QV-ADR-017 |
| QV-ADR-P-R04-3 | First pilots: co-ops and open-source foundations; mutual-aid as privacy beta cohort; unions only for non-statutory votes. | R-04 | — |
| QV-ADR-P-R04-4 | Commit to an organizer "paperwork pack" (notice, minutes, election record) as MVP-adjacent deliverable. | R-04 | — |
| QV-ADR-P-R04-5 | Assurance plan benchmarks Belenios's formal-analysis practice (symbolic/computational proofs of privacy and verifiability) as a Phase gate. | R-04 | — |

---

## Reconciliation decisions

The ADRs below resolve cross-spec conflicts found during the 2026-10-21 consistency pass. Rule applied: **choose the safest option** (the one that preserves secrecy and verifiability and leaves the most reversible path), and let QV-16 (crypto) and these ADRs outrank other specs on byte-level and protocol questions. All are **Accepted (provisional)** pending owner review, like ADR-001–013. Common fields: Date 2026-10-21; Owner: Project owner (drafting delegated).

### QV-ADR-014 — Node baseline: run on Node 22 and 24, CI on both
- **Status:** Accepted (provisional). **Amends:** ADR-003 ("Node.js 22 LTS"). **Sources:** P08-1, P-R02-1, QV-28-REQ-021, QV-30.
- **Context:** Specs disagree (`engines` `>=22.13` in QV-08/QV-30, `>=22.16` in QV-28; R-02 and QV-08 want 24 as primary; 22 enters EOL 2027-04-30 `[UNVERIFIED]`). `node:sqlite` is Stability 1.1 on 22.x.
- **Decision:** All packages shall build and pass tests on **Node 22 (≥ 22.16) and Node 24 LTS**; CI runs the full suite on both (plus 26 as allow-failure once released). `engines: ">=22.16"`. Development and the SEA release binary use Node 24 LTS. Minimum is raised to 24 when 22 reaches EOL. CI fails on EOL or advisory-affected patch versions. The `node:sqlite` stability risk is **documented as a known risk** (QV-28 §constraints): all access goes through the `BoardStore`/`Store` interface so a fallback adapter can be added without touching callers; no use of unstable-only APIs beyond `DatabaseSync` and module-level `backup()`.
- **Alternatives:** Node 24 only (cuts off distros still shipping 22; rejected); 22 only (EOL within about 6 months of v1; rejected).
- **Consequences:** Two-version CI matrix; test vectors must be bit-identical on both.
- **Requirements affected:** QV-08 §6/OQ, QV-28-REQ-021, QV-30-REQ-031, QV-12 §hardware. **Review trigger:** `node:sqlite` stable status, or a critical Node advisory.

### QV-ADR-015 — `roll_commit` entry amends ADR-005 roll commitment
- **Status:** Accepted (provisional). **Amends:** ADR-005 wording. **Sources:** P18-1, QV-16 §5.6.1, QV-04.
- **Context:** ADR-005 says the voter-roll Merkle root is "committed in the signed election manifest". QV-18 commits it by an organizer-signed `roll_commit` entry bound by `election_open`; QV-16's manifest example embeds `roll.root`/`roll.size`.
- **Decision:** The roll root is committed by the organizer-signed `roll_commit` log entry, and the signed `election_open` entry binds `(manifest_hash, joint_key_seq, roll_commit_seq)`. The manifest carries `roll.scheme`, `roll.weights` and **optionally** `roll.root`/`roll.size` (static-roll mode); if present they shall equal the `roll_commit` values and the election is rejected otherwise. Verifiers take the root from `roll_commit` and shall reject any counted ballot whose voter key is not in it. A roll cannot change after `election_open` except through the roll-amendment mechanism of QV-04 (steward threshold, public delay, old-key veto). The ballot `ctx` is not changed (it is fixed by the DKG before the roll exists); roll binding is enforced by `election_open` and verifier check V2/V5.
- **Alternatives:** Roll in manifest only (forces roll before DKG; delays trustee ceremony and breaks late registration); bind roll root into `ctx` (safer but forces a roll before key confirmation; flagged for the external cryptographic review as an option).
- **Requirements affected:** QV-16 §5.6.1, QV-18-REQ-023, QV-04, QV-09. **Review trigger:** reviewer prefers roll root in `ctx`.

### QV-ADR-016 — Revoting, append-only log, and revote-count visibility
- **Status:** Accepted (provisional). **Refines:** ADR-005, ADR-007, ADR-008. **Sources:** P16-7, P02-1, QV-20 §7, QV-06 R3, R-03 OQ.
- **Context:** Latest-ballot-wins revoting conflicts with (a) QV-20's voter-chosen `seq` ordering and (b) pressure to hide per-voter revote counts, which an append-only public log cannot do without losing verifiability.
- **Decision:** (1) Order is the **bulletin-board sequence number plus the QV-16 `supersedes` hash chain** (QV-16 §5.14); a voter-chosen `seq` is not used. (2) Every cast and superseded ballot stays on the log forever; nothing is deleted or rewritten (redaction applies only to deletable C1 side data, never to ballot entries). (3) Per-voter revote counts are **visible in Phase 1** and documented as a non-claim (coercion/hesitation signal); mitigations are the manifest `ballots.max_per_voter` cap (QV-16 §5.6.1; organizers should set it low), `elections.revoting = single` for groups that prefer no revoting, and UI disclosure. (4) Hiding counts (final-ballot commitments, unlinkable Phase 2 tokens) is a research item for Phase 2 and shall not be claimed earlier. (5) Withdrawal of cast ballots is not supported; a blank ballot is the withdrawal substitute.
- **Alternatives:** Hidden counts by log redaction (breaks universal verifiability; rejected); server-assigned order only (operator can reorder; rejected).
- **Requirements affected:** QV-20-REQ-010, QV-05 V6, QV-06, QV-02. **Review trigger:** Phase 2 token design.

### QV-ADR-017 — Hosted demo instance versus ADR-002
- **Status:** Accepted (provisional). **Refines:** ADR-002. **Source:** P-R04-2, P14-2.
- **Decision:** A maintainer-run **demo instance** is permitted before the hosted production offering under strict limits: separate domain and signing keys from any production deployment; permanent "DEMO — not for real votes" banner and `Experimental` assurance label (P07-2); elections auto-expire and are wiped within 7 days; no real voter data, no email, no contact data collected; same code as self-host; operator remains untrusted. Hosted **production** service stays gated by P14-2 (published audit, tested exit, legal review, on-call).
- **Alternatives:** No demo (poor first contact; R-04); full hosted launch (concentrates trust and legal exposure; rejected by ADR-002).
- **Requirements affected:** QV-08, QV-12, QV-14, QV-25. **Review trigger:** demo abused for real votes.

### QV-ADR-018 — Strict Ed25519 verification
- **Status:** Accepted (provisional). **Source:** P16-9, QV-34 Q-34-1.
- **Decision:** All Ed25519 signatures (voter, trustee, organizer, log) are verified **strictly per RFC 8032** (reject `S ≥ ℓ`, reject non-canonical and small-order `A` and `R`; no ZIP-215 leniency; no batch verification that changes the accepted set). Voter keys failing the checks are rejected when the roll is built. The same acceptance set is a conformance requirement for QV-34 and every verifier.
- **Alternatives:** ZIP-215 (verifier-agreement across libraries but accepts malleable forms; rejected). **Requirements affected:** QV-16-REQ-016, QV-34, QV-04. **Review trigger:** none expected.

### QV-ADR-019 — Canonical encoding
- **Status:** Accepted (provisional). **Source:** P16-1, P09-4, QV-09 §encoding.
- **Decision:** (1) Protocol artifacts are **QV-JSON (RFC 8785 JCS profile, QV-16 §5.5)**; every binary value *inside* a JCS body is a fixed-length lower-case **hex** string. (2) Log entry headers and bodies are transported and hashed as their **exact canonical bytes** (never re-serialized JSON); the API/JSON transport wrapper carries those bytes as base64url (no padding), and `Hash32` values in API envelopes are base64url of the 32 raw bytes. (3) Fiat–Shamir transcripts and nonce derivation use QV-16 binary frames, never JSON. (4) Mixed encodings in one object are forbidden: the encoding follows the layer (body = hex, transport wrapper = b64u).
- **Alternatives:** Deterministic CBOR (weaker tooling); b64u inside bodies (two encodings per artifact).
- **Requirements affected:** QV-09, QV-18, QV-28, QV-34. **Review trigger:** cross-implementation byte-equality failures in QV-34.

### QV-ADR-020 — Spoiled-ballot signing and disclosure
- **Status:** Accepted (provisional). **Amends:** P16-8 ("reveal mandatory"). **Sources:** P16-8, P05-3, P10-3, P-R01-5, QV-18 `ballot_audit`.
- **Context:** QV-16 publishes the spoil reveal (selections and randomness); R-01 warns that publishing or trustee-decrypting spoiled ballots leaks plaintext and creates a receipt-like artifact.
- **Decision:** (1) A spoil is always signed by the voter under the distinct label `sig-spoil` over `(ctx, ballot_code, reveal_digest)` (QV-16 §5.12.2); it can never be replayed as a cast. (2) The spoiled ballot's ciphertexts, proofs, signature and `reveal_digest` are **posted** (`ballot_audit` entry) so audit statistics are observable (UX P10-3). (3) The `reveal` (`xi`, selections) is **not published by default**: the voter's client hands it to the voter's second device/CLI verifier out of band. Publishing it on the log is an explicit per-ballot opt-in with a plain warning that the selections become public. (4) Trustee-side decryption of spoiled ballots (QV-16 §5.13.4) is **off** in suite v1 unless the manifest enables it; trustees never decrypt cast ballots. (5) UI tells voters to audit with test selections only.
- **Alternatives:** Always publish (QV-16 original; leaks real selections of careless auditors); never post (hides audit statistics).
- **Requirements affected:** QV-16 §5.12–5.13/App. C step 15, QV-05 V8, QV-10, QV-18, QV-19. **Review trigger:** external review.

### QV-ADR-021 — Minimum ballot count in the decryptable aggregate
- **Status:** Accepted (provisional). **Sources:** P06-3, P26-4, QV-03 §3.2.
- **Context:** QV-03/QV-06 default `min_counted_ballots` was 5 (N ≥ 8) else 1; QV-26 wants a floor of 3 with acknowledgement below 10. A 1- or 2-ballot aggregate reveals individual votes.
- **Decision:** Manifest field `min_counted_ballots` (integer): **hard floor 3** (manifest validator rejects lower), default **5** when roll ≥ 8 else 3 with `W-SMALL-ROLL`; values below **10** require an explicit organizer acknowledgement flag (`privacy_ack`) shown to voters. Trustee clients shall refuse to release decryption shares for an aggregate with fewer counted voters (`FAILED(PRIVACY_MIN)`); verifiers treat a result published below the manifest floor as INVALID. Unanimous or lopsided results still reveal the group's choice; that is a documented non-claim.
- **Requirements affected:** QV-03 §3.2/§5.2, QV-06-REQ-010, QV-16 §5.6.1/§5.15, QV-17-REQ-040, QV-26. **Review trigger:** pilot feedback.

### QV-ADR-022 — PAUSED / INVALIDATED / STALLED states and control entries adopted
- **Status:** Accepted (provisional). **Adopts:** P07-1; **aligns:** P12-2, QV-03 §5.2, QV-09, QV-28. **Sources:** QV-07 §5.
- **Decision:** Adopt the extended state machine and signed control entries `PAUSE`, `RESUME`, `INVALIDATE`, `SECURITY_NOTICE` (log type names `pause`, `resume`, `invalidate`, `security_notice`). Authority: steward k-of-m (and trustees t-of-n for PAUSE/INVALIDATE only if the manifest delegates); the **operator may only hold or notify**, never pause, extend or invalidate (P12-2). Canonical state names and aliases: `READY` = QV-03 `SCHEDULED`; `PAUSED` = QV-03 `HALTED`; `TALLYING`; `STALLED`; `TALLIED` (QV-18/QV-09) = QV-03/QV-07 `PUBLISHED`; `CHALLENGED`; `INVALIDATED` = QV-03 `ANNULLED`; `ABORTED` = QV-03 `FAILED` before open; `RESOLVED`/`FINAL` remain governance sub-states of `AUDIT`; `SETUP_KEYED` is a log-phase detail inside QV-03 `CEREMONY`. QV-03 caps (`max_halts`, `max_total_hours`) apply to PAUSED. `STALLED` after `stalledMax` (default 30 days) permits steward `INVALIDATE` and rerun. QV-09 `phase` enum and QV-28 `state` CHECK carry the full set.
- **Requirements affected:** QV-03, QV-07-REQ-082/083, QV-09, QV-18 grammar, QV-28. **Review trigger:** governance disputes over who may invalidate.

### QV-ADR-023 — Ranked-choice composition gated on external review
- **Status:** Accepted (provisional). **Sources:** P20-2, P-R01-6, ADR-006.
- **Decision:** Ranked ballots (encrypted pairwise bits + per-triple weak-order/3-cycle proofs, Schulze/Ranked Pairs) remain **Phase 2 and disabled** in releases until (a) an independent cryptographic review of the composition and (b) QV-34 vectors from a second implementation exist. The manifest validator rejects `method: ranked` unless the release carries the `ranked-reviewed` flag. Candidate cap n ≤ 12 and strict orders by default (ties opt-in n ≤ 7). No mixnet fallback is introduced.
- **Requirements affected:** QV-20 §8, QV-16 method table, QV-11 gates. **Review trigger:** review completed or failed.

### QV-ADR-024 — Vendored `@noble/*` and offline-only trustee tooling
- **Status:** Accepted (provisional). **Sources:** P-R02-2, P-R02-3, P30-2, P19-4, P-R03.
- **Decision:** (1) `@noble/curves` and `@noble/hashes` are **vendored in-repo verbatim** (published tarball contents) under `vendor/` with a `VENDOR.lock` of SHA-256 hashes; updates only by reviewed PRs showing the upstream diff and audit-coverage note; `packages/crypto` is the only importer (P30-2). The production dependency allowlist remains these two packages (P19-4). (2) **Trustee secret material is handled only by offline CLI tooling** (`qv-trustee`, air-gapped `qv-ceremony`); browser-resident trustee shares or signing keys are prohibited. The remote-origin web client may display ceremony status and prepare invitations but never holds trustee secrets; a guided UI is allowed only when served on localhost by the offline `qv-trustee` binary.
- **Alternatives:** Lockfile pinning only (supply-chain account-takeover class); browser trustee client (no constant-time/zeroization in JS).
- **Requirements affected:** QV-17 (§client/REQ), QV-19, QV-30, QV-08 D2. **Review trigger:** reviewer finds vendoring burden unsustainable, or WebCrypto gains Ed25519/ristretto support.
