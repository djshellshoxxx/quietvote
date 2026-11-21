# QV-00 — Project Charter

**Module ID:** `product-policy` (charter)
**Status:** Draft
**Owner:** Project owner (decisions delegated to spec authors; owner review pending)
**Last reviewed:** 2026-10-21
**Related specs:** QV-01, QV-02, QV-03, QV-04, QV-05, QV-06, QV-07, QV-08, QV-14, [decision log](decision-log.md) (ADR-001…013 are binding)

## 1. Objective

QuietVote is a private, verifiable decision-making tool for voluntary groups. A group defines its rules in a signed, public manifest; members cast end-to-end encrypted ballots; anyone can verify that every counted ballot came from an eligible member, that no ballot was dropped or altered, and that the published tally is the correct sum — while no single party, including the server operator, can learn how an individual voted.

Stance (QV-ADR-001): **minimal-trust, exit-friendly, no mandatory identity, no token, no chain.** Verify, don't trust. The operator is trusted for availability only. This is a *design stance* (censorship resistance, self-sovereignty), never a licence to overclaim; every guarantee is bounded by the threat model (QV-07) and the non-claims in §5.

## 2. Problem statement

Group decision tools fall into three failure classes:

1. **Open polls** (chat reactions, forum polls, spreadsheet votes): no secrecy, trivially stuffed, social pressure distorts results.
2. **Platform-operated "secret" ballots** (SaaS polling/e-voting): the operator can see, alter, or drop ballots; verification is "trust us"; identity is collected and retained.
3. **Research-grade verifiable voting** (Helios-lineage, ElectionGuard): strong properties but built for one-off public elections, heavy to operate, rarely suited to a recurring decision cycle inside a small voluntary group.

QuietVote targets the gap: *recurring internal decisions in voluntary groups that want a secret ballot and an independently checkable result without trusting a vendor*, deployable by a technically capable volunteer in under an hour.

## 3. Users and first target group

### 3.1 Decision: first target group (resolves open decision #1)

**Chosen: online collectives and open-source foundations/projects with 30–2,000 eligible voters** (e.g. project steering/board elections, governance-document ratifications, membership votes of a software foundation or a distributed online community), with **small worker/consumer co-ops with a technically capable member** as the secondary target.

| Criterion | OSS foundations / online collectives | Co-ops & member associations | Unions / mutual-aid | Rationale |
|---|---|---|---|---|
| Technical capability to self-host (ADR-002) | High | Low–medium | Low | MVP is self-host only; needs a sysadmin |
| Tolerance for key-based identity, CLI verifier | High | Low | Low | Phase 1 uses voter keypairs |
| Existing demand for verifiable/secret ballots | High (board/steering elections, Helios/Condorcet-style tools already used) | Medium (often run by paper or a vendor) | High but legally constrained | |
| Legal/regulatory friction | Low (bylaws permit electronic votes; no statutory form) | Medium–high (statutes may prescribe ballot form, proxy rules) | High | Out-of-scope: legally certified votes | <!-- claims-lint-ignore -->
| Pseudonymity acceptable | Yes, often desired | Rarely (members are named) | Sometimes | Matches ADR-001 no-KYC |
| Willingness to be early/critical adopters, file issues, review code | High | Low | Low | Feeds QV-11 review |
| Typical electorate size | 30–2,000 | 50–5,000 | 100–50,000 | Fits MVP performance targets |

**Justification.** The first release has a single self-hosted deployment, key-based identity, an offline verifier, and honest-but-demanding guarantees. The group type that can absorb those costs, will scrutinise the design, and faces the least legal friction is the OSS/online-collective segment. Co-ops come second, after the hosted option and UX hardening. **Rejected for MVP:** public elections, shareholder votes, large unions (certification, accessibility and legal burdens outside scope; see §7).

**Initial deployment setting:** self-hosted single server run by (or on behalf of) one group, reachable over TLS and optionally a Tor onion service (ADR-002, ADR-009).
**Primary user research evidence:** none yet; M0 task (see §9) is 8 structured interviews with maintainers/officers of ≥5 such groups before QV-02 is moved to Review.

### 3.2 Roles (summary; detail in QV-02/QV-03)

Member (voter), Steward (group administrator holding the group signing key), Proposer, Trustee (holds a share of the election decryption key), Auditor/Observer (anyone), Operator (runs the server; untrusted for secrecy/integrity).

## 4. Product principles

- Rules are public, signed, and hash-committed **before** voting opens; they cannot change silently.
- Identity and ballot content are separated as far as each phase allows; no identity beyond a group-chosen credential.
- Every claim is stated as "who can learn what / who can do what, assuming what" — see QV-05 §5, QV-06 §10.
- Full export and operator exit at any time; the data a verifier needs is the data a member can download.
- Boring, widely used primitives only (libraries with published third-party audit reports) (ADR-003/004); no invented cryptography.
- Plain-language explanation of limits is part of the product, not fine print.

## 5. Mandatory, optional, and unsupported privacy properties (resolves open decision #5)

| Property | Status | Notes |
|---|---|---|
| Ballot secrecy from operator, stewards, other members (given < t colluding trustees, honest client device) | **Mandatory (all phases)** | ADR-004/008 |
| Universal verifiability (eligibility, inclusion, tally) | **Mandatory** | ADR-007 |
| Cast-as-intended (Benaloh audit) | **Mandatory to offer**, voter-optional to use | ADR-004 |
| Individual verifiability (receipt/inclusion proof) | **Mandatory** | |
| Participation privacy (who voted is hidden) | **Unsupported in Phase 1**; optional from Phase 2/3 | ADR-005 |
| Unlinkability of ballot to voter key | **Unsupported in Phase 1**; Phase 2/3 only | ADR-005 |
| Coercion resistance / receipt-freeness | **Unsupported** (partially mitigated by revoting) | ADR-008 |
| Protection from compromised voter device or malicious browser build | **Unsupported**, mitigated by ADR-010 | |
| Long-term (post-quantum) secrecy | **Unsupported in v1**, tracked by QV-21 | ADR-013 |
| Network metadata protection | **Optional** via Tor; not claimed otherwise | ADR-009 |

## 6. Candidate scope and ADR resolution of open decisions

### 6.1 In scope for MVP (v0.x → v1.0)

Group + manifest creation; invitation and key enrollment; proposals with amendment periods; four voting methods (ADR-006); quorum/threshold rules; trustee ceremony (DKG, threshold decryption); append-only signed log with receipts; offline CLI verifier + verifier page; dispute/challenge workflow; full export; self-hosted deployment.

### 6.2 Open decisions from the framework charter, resolved

| # | Question | Decision | Basis |
|---|---|---|---|
| 1 | First target group | OSS foundations / online collectives (§3.1) | This doc |
| 2 | Hosted vs self-hosted at first release | **Self-hosted only** for MVP; maintainer-hosted instance later on same code, operator untrusted | ADR-002 |
| 3 | Participation: account / invite / credential | **Invite-based key enrollment** (voter Ed25519 key, no passwords/accounts); optional blind-token (P2) and ZK membership (P3) | ADR-005; QV-04 |
| 4 | Voting methods in MVP | yes/no, single-choice, approval, k-of-n; quorum + simple/supermajority | ADR-006; QV-20 |
| 5 | Mandatory/optional/unsupported privacy properties | §5 | ADR-005, 008 |
| 6 | Minimum viable audit record | Signed manifest, roll Merkle root, DKG transcript, all ballot entries with proofs, signed tree heads, decryption proofs, tally, verifier output hash — all exportable | ADR-007; QV-05 |
| 7 | Licence and governance | AGPL-3.0-or-later code; CC BY-SA 4.0 docs; DCO; (project governance model: see QV-14) | ADR-011 |
| 8 | Success thresholds for first release | §8 | This doc |

## 7. Boundaries

### Out of scope (until reconsidered by ADR)
- Government/public elections; legally certified corporate/shareholder or statutory union elections. <!-- claims-lint-ignore -->
- On-chain voting, tokens, DAOs-as-default, custody of funds (ADR-012).
- Mandatory identity-document verification / KYC.
- Claims of coercion resistance, endpoint-compromise protection, or protection against every administrator threat.
- Hosted multi-tenant SaaS in MVP; P2P/serverless operation (QV-32 research).
- Write-in ballots, ranked/weighted/delegated methods in MVP (Phase 2).

### Legal posture
QuietVote makes no representation that an electronic vote satisfies any group's bylaws or statute; groups are responsible for adopting QuietVote's procedure in their own governing documents (QV-03 template clause provided).

## 8. Success measures with numeric targets (resolves open decision #8)

Targets apply at the stated gate. "Pilot" = real elections by external groups.

| # | Measure | Target | Method | Gate |
|---|---|---|---|---|
| S1 | Independent verification | Tally reproduced by independent verifier for **100%** of pilot elections; ≥ **2** independently written verifier implementations (CLI + verifier page, one by a non-core contributor) | Verifier output hash compared | v1.0 |
| S2 | Eligibility/duplicate enforcement | **0** counted ineligible or duplicate ballots across ≥ **10,000** randomized property-test elections plus all pilots | QV-11 property tests, verifier | v0.9 |
| S3 | Cryptographic review | Independent review completed; **0** open critical/high findings before any secrecy claim is published | External report | v1.0 |
| S4 | Pilot adoption | ≥ **5** external groups complete ≥ 1 real election within 6 months of v0.9; ≥ **3** with ≥ 100 eligible voters | Pilot log | v1.0 |
| S5 | Voter completion | ≥ **90%** of invited voters in usability tests who start a ballot cast it; median enroll→cast time ≤ **5 min** (first election), ≤ **2 min** (return voter, 5-contest ballot) | Moderated tests, n ≥ 20 | v0.9 |
| S6 | Comprehension | ≥ **85%** correctly answer "who can see how I voted?" and "can I change my vote?" after reading the notice | Quiz, n ≥ 20 | v0.9 |
| S7 | Cast-as-intended uptake | ≥ **5%** of pilot ballots audited via Benaloh challenge (indicator of understanding/trust) | Log of audited ballots | monitor |
| S8 | Self-host effort | Median time from clean Linux host to working instance ≤ **30 min**; ≤ **10** documented commands | n ≥ 5 sysadmin trials | v0.9 |
| S9 | Recovery | Restore from backup RTO ≤ **1 h**, RPO ≤ **15 min**; export of closed election re-verifies **100%** | Drill | v1.0 |
| S10 | Privacy minimisation | **0** IP addresses or user agents persisted by default; **100%** of items past retention deleted by schedule (QV-06) | Automated audit test | v0.9 |
| S11 | Accessibility | **0** WCAG 2.2 AA blocker/critical failures on core voter flow; full keyboard + screen-reader completion | QV-13 audit | v1.0 |
| S12 | Performance | Cast→receipt p95 ≤ **3 s** on mid-range phone; tally of 5,000 ballots × 10 selections verified by CLI in ≤ **60 s** | Benchmarks | v0.9 |
| S13 | Dependency hygiene | ≤ **12** direct production dependencies in the whole monorepo; **0** unpinned | Lockfile audit | v1.0 |
| S14 | Sustainability | ≥ **3** external contributors with merged changes and ≥ **1** funded maintainer-month per quarter within 12 months | QV-14 | post-1.0 |

## 9. Assumptions requiring validation

| # | Assumption | Validation | Owner | Status |
|---|---|---|---|---|
| A1 | Target groups value secret + verifiable ballots enough to adopt a self-hosted tool | 8 interviews, 5 pilot LOIs | Project owner | Open |
| A2 | Members will manage a voter key file (or accept browser-held keys) | Usability tests S5 | UX (QV-10) | Open |
| A3 | A ≥ 3-trustee ceremony is organisable in small groups | Pilot observation | QV-12 | Open |
| A4 | "Participation visible, choice secret" (Phase 1) is acceptable for the first target group | Interview question; fallback Phase 2 earlier | QV-04 | Open |
| A5 | Pseudonymous labels are acceptable to groups' bylaws | Pilot | QV-03 | Open |
| A6 | Spec can keep marketing claims aligned with §5 | Claims review checklist (QV-06 §10) | Project owner | Open |

## 10. Risks (project-level)

| Risk | Impact | Mitigation |
|---|---|---|
| Overclaiming security | Loss of trust, harm to members | §5 table, claims checklist, audit gate S3 |
| Browser-delivered code subverted | Voter privacy/integrity | ADR-010 controls; residual documented |
| Trustee ceremony too heavy | Adoption failure | Guided CLI/UI ceremony; 2-of-3 default; QV-12 runbooks |
| Single maintainer burn-out | Project stall | QV-14 governance; small dependency set |
| Legal reading of e-votes in bylaws | Disputed results | Template clause; explicit non-goal |

## 11. Approval

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Delegated drafting; owner review to be recorded in decision log |

## Proposed ADRs

- **QV-ADR-P00-1 — First target group is OSS foundations / online collectives.** Rationale §3.1. Review trigger: interview evidence contradicts A1.
- **QV-ADR-P00-2 — Numeric success gates S1–S14 adopted as release thresholds.** Review trigger: pilot data.
