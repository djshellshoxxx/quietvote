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
