# QuietVote Specification Index

This is the entry point for product and engineering specifications. Specs are intentionally incomplete until decisions are reviewed and acceptance criteria are testable.

Current implementation evidence is in the [consolidation ledger](plan/CONSOLIDATION.md)
and [restart handoff](handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md). These and
[HANDOFF](HANDOFF) are status records, not approved specifications or an independent
audit. In this integrated tree QV-16 is `16-crypto-protocol.md`; the retained
`15-cryptography-and-technical-design.md` is non-authoritative source material.

## Status key

- **Framework** — document structure and questions exist; requirements are not complete.
- **Draft** — requirements are written but unresolved assumptions remain.
- **Review** — ready for project-owner review.
- **Approved** — accepted as the implementation contract.
- **Implemented** — code exists and verification evidence is recorded.
- **Deferred** — intentionally postponed with rationale.

## Specification map

| ID | Document | Scope | Depends on | Status |
|---|---|---|---|---|
| QV-00 | [Project charter](00-project-charter.md) | Mission, users, boundaries, success | — | Draft |
| QV-01 | [Capability map](01-capability-map.md) | Modules, interfaces, proposed order | QV-00 | Draft |
| QV-02 | [Product requirements](02-product-requirements.md) | User journeys, MVP boundary, functional requirements | QV-00, QV-01 | Draft |
| QV-03 | [Governance and policy](03-governance-and-policy.md) | Group rules, decision lifecycle, dispute policy | QV-02 | Draft |
| QV-04 | [Identity and eligibility](04-identity-eligibility.md) | Membership, eligibility proofs, duplicate prevention, recovery | QV-03 | Draft |
| QV-05 | [Ballot protocol](05-ballot-protocol.md) | Ballot secrecy, vote methods, tally and verification | QV-03, QV-04, QV-07 | Draft |
| QV-06 | [Privacy and data lifecycle](06-privacy-data-lifecycle.md) | Data inventory, minimization, retention, deletion | QV-04, QV-05, QV-07 | Draft |
| QV-07 | [Threat model and security](07-threat-model-security.md) | Adversaries, assets, abuse cases, security controls | QV-00 | Draft |
| QV-08 | [Architecture and deployment](08-architecture-deployment.md) | System components, hosting, self-hosting, trust boundaries | QV-01–QV-07 | Draft |
| QV-09 | [API and data contracts](09-api-data-contracts.md) | Interfaces, schemas, events, versioning | QV-03–QV-08 | Draft |
| QV-10 | [User experience](10-user-experience.md) | Member, organizer, auditor flows and content | QV-02–QV-06 | Draft |
| QV-11 | [Testing and assurance](11-testing-assurance.md) | Verification strategy, protocol review, release gates | QV-03–QV-09 | Draft |
| QV-12 | [Operations and administration](12-operations-administration.md) | Provisioning, support, incident response, upgrades | QV-08, QV-11 | Draft |
| QV-13 | [Accessibility and localization](13-accessibility-localization.md) | Accessibility, language, device and network support | QV-10 | Draft |
| QV-14 | [Business and sustainability](14-business-sustainability.md) | Funding model, pricing, governance, sustainability | QV-00, QV-08, QV-12 | Draft |
| QV-16 | [Cryptographic protocol](16-crypto-protocol.md) | Byte-level ballot, DKG, proof, tally and verifier protocol | QV-04, QV-07 | Draft |
| QV-17 | [Key ceremony and trustees](17-key-ceremony-trustees.md) | Trustee roles, DKG ceremony, share custody | QV-16 | Draft |
| QV-18 | [Bulletin board and transparency](18-bulletin-board-transparency.md) | Merkle log, witnesses, receipts, mirrors | QV-16 | Draft |
| QV-19 | [Client and supply chain](19-client-supply-chain.md) | Web client, reproducible builds, release integrity | QV-08, QV-16 | Draft |
| QV-20 | [Voting methods](20-voting-methods.md) | Encodings, proofs and tallies per method | QV-16 | Draft |
| QV-21 | [Research notes](research/) | Index of research: [R-01 cryptographic protocol](research/R-01-cryptographic-protocol-research.md), [R-02 application/platform security](research/R-02-application-platform-security-research.md), [R-03 metadata, coercion, privacy, legal](research/R-03-metadata-coercion-privacy-legal-research.md), [R-04 landscape and prior art](research/R-04-landscape-prior-art.md) | — | Active (Draft; `[UNVERIFIED]` items in [VERIFICATION-TODO](plan/VERIFICATION-TODO.md)) |
| QV-22 | [Roadmap](plan/ROADMAP.md) | Phases, milestones, work breakdown | All | Draft |
| QV-23 | [Backlog / to-do](plan/BACKLOG.md) | Prioritised task list with spec traceability | QV-22 | Draft |
| QV-24 | [Traceability matrix](24-traceability-matrix.md) | Requirement → design → test → evidence | All | Draft |
| QV-25 | [Legal, compliance, licensing](25-legal-compliance-licensing.md) | Licences, GDPR roles, export, terms | QV-14 | Draft |
| QV-26 | [Network and metadata privacy](26-network-metadata-privacy.md) | Transport, Tor, timing, anonymity sets | QV-07, QV-08 | Draft |
| QV-27 | [Project governance and release](27-project-governance-release.md) | Maintainers, releases, deprecation | QV-14 | Draft |
| QV-28 | [Data model and storage](28-data-model-storage.md) | Schema, retention, export | QV-09 | Draft |
| QV-29 | [Abuse and DoS prevention](29-abuse-dos-prevention.md) | Spam, flooding, moderation | QV-07 | Draft |
| QV-30 | [Engineering standards](30-engineering-standards.md) | Repo layout, CI, coding rules | QV-08 | Draft |
| QV-31 | [Telemetry and observability](31-telemetry-observability.md) | Privacy-preserving metrics and logs | QV-12 | Draft |
| QV-32 | [Federation and decentralization](32-federation-decentralization.md) | Relays, witnesses, P2P roadmap | QV-18 | Draft |
| QV-33 | [Vulnerability disclosure](33-vulnerability-disclosure.md) | Coordinated disclosure, bounty, [SECURITY.md](../SECURITY.md) | QV-07 | Draft |
| QV-34 | [Test vectors and conformance](34-test-vectors-conformance.md) | Known-answer vectors, cross-implementation suite | QV-16 | Draft |
| QV-35 | [Independent second verifier](35-second-verifier.md) | Requirements for the second, independently written verifier (`verifier-py/`), gate G4 | QV-11, QV-16, QV-34 | Draft |
| QV-15 | [Decision log](decision-log.md) | Durable record of accepted decisions; baseline ADR-001–013, proposed ADRs, reconciliation ADR-014–024 | All | Active |
| — | [Authoring brief](AUTHORING-BRIEF.md) | Rules shared by spec and research authors | — | Active |
| — | [Spec template](templates/SPEC-TEMPLATE.md) | Template for new specs | — | Active |
| — | [Consistency report](plan/CONSISTENCY-REPORT.md) | Cross-spec contradictions found, fixes made, residual issues (2026-10-21 pass) | All | Active |
| — | [Verification TODO](plan/VERIFICATION-TODO.md) | All `[UNVERIFIED]` citation clusters by source domain | All | Active |
| — | [Consolidated TODO](plan/TODO.md) | Every open task, decision and errata item with package, priority, status and source | All | Active (2026-10-21) |

**Authority order for conflicts:** QV-16 (cryptographic bytes) and the reconciliation ADRs (QV-ADR-014–024 in the decision log) outrank other specs; QV-18 outranks others on log mechanics; baseline ADR-001–013 are binding unless amended. Statuses were updated on 2026-10-21: every written spec is **Draft**; none is Review or Approved.

## Exploratory ideas

[IDEAS.md](../IDEAS.md) holds non-binding concepts for future consideration. Ideas are not part of the MVP until selected, specified, threat-modeled, and recorded in the decision log.

### Retained pre-renumbering drafts

The following files were added on `main` before the current specification map was established: `15-cryptography-and-technical-design.md`, `17-portable-membership-credentials.md`, `18-federated-governance.md`, and `19-delegation-exit-fork.md`. They are retained as source material, but their former QV numbers overlap with the current index. Treat them as non-authoritative until their useful content is reconciled into the current specifications or `IDEAS.md`; do not cite their old QV IDs as active requirements.

Reconciliation status (2026-10-21): the topics of these drafts are covered at idea level in [IDEAS.md](../IDEAS.md) §1 (portable credentials), §6 (exit, export, forks), §7 (delegation) and §8 (federation). Clause-by-clause reconciliation into the current specs is not done and is tracked as TODO item N-19 in [plan/TODO.md](plan/TODO.md) (owner: Docs; priority P2).

## Proposed completion order

1. Review the project charter and capability boundaries.
2. Complete product requirements and governance policy.
3. Resolve identity, eligibility, threat model, and privacy requirements together.
4. Select a ballot protocol only after the threat model and eligibility model are explicit.
5. Specify architecture, interfaces, data contracts, and user journeys.
6. Define testing and assurance gates before implementation.
7. Complete operational, accessibility, and sustainability requirements before launch.
8. Review optional credential, federation, delegation, and fork modules after the core model is agreed.

This is a proposed sequence, not approval to implement. Security and privacy review must recur as designs change.

## Definition of implementation-ready

A specification can move to **Approved** when it includes:

- Objective, actors, assumptions, scope, and explicit non-goals
- Requirements with stable IDs and testable acceptance criteria
- User journeys and failure behavior where applicable
- Data handled, trust boundaries, and privacy implications
- Dependencies and interface contracts
- Security and abuse cases relevant to the capability
- Testing and verification evidence required
- Unresolved decisions either closed or explicitly deferred
- Project-owner review recorded in the decision log

## Traceability

Requirements should use IDs such as `QV-05-REQ-001`. Tests, implementation tasks, and release notes should reference the IDs they satisfy. Update this index when documents are added, renamed, approved, or deferred.
