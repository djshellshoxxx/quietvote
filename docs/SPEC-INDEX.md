# QuietVote Specification Index

This is the entry point for product and engineering specifications. Specs are intentionally incomplete until decisions are reviewed and acceptance criteria are testable.

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
| QV-01 | [Capability map](01-capability-map.md) | Modules, interfaces, proposed order | QV-00 | Framework |
| QV-02 | [Product requirements](02-product-requirements.md) | User journeys, MVP boundary, functional requirements | QV-00, QV-01 | Framework |
| QV-03 | [Governance and policy](03-governance-and-policy.md) | Group rules, decision lifecycle, dispute policy | QV-02 | Framework |
| QV-04 | [Identity and eligibility](04-identity-eligibility.md) | Membership, eligibility proofs, duplicate prevention, recovery | QV-03 | Framework |
| QV-05 | [Ballot protocol](05-ballot-protocol.md) | Ballot secrecy, vote methods, tally and verification | QV-03, QV-04, QV-07 | Framework |
| QV-06 | [Privacy and data lifecycle](06-privacy-data-lifecycle.md) | Data inventory, minimization, retention, deletion | QV-04, QV-05, QV-07 | Framework |
| QV-07 | [Threat model and security](07-threat-model-security.md) | Adversaries, assets, abuse cases, security controls | QV-00 | Framework |
| QV-08 | [Architecture and deployment](08-architecture-deployment.md) | System components, hosting, self-hosting, trust boundaries | QV-01–QV-07 | Framework |
| QV-09 | [API and data contracts](09-api-data-contracts.md) | Interfaces, schemas, events, versioning | QV-03–QV-08 | Framework |
| QV-10 | [User experience](10-user-experience.md) | Member, organizer, auditor flows and content | QV-02–QV-06 | Framework |
| QV-11 | [Testing and assurance](11-testing-assurance.md) | Verification strategy, protocol review, release gates | QV-03–QV-09 | Framework |
| QV-12 | [Operations and administration](12-operations-administration.md) | Provisioning, support, incident response, upgrades | QV-08, QV-11 | Framework |
| QV-13 | [Accessibility and localization](13-accessibility-localization.md) | Accessibility, language, device and network support | QV-10 | Framework |
| QV-14 | [Business and sustainability](14-business-sustainability.md) | Funding model, pricing, governance, sustainability | QV-00, QV-08, QV-12 | Framework |
| QV-16 | [Cryptographic protocol](16-crypto-protocol.md) | Byte-level ballot, DKG, proof, tally and verifier protocol | QV-04, QV-07 | Draft |
| QV-17 | [Key ceremony and trustees](17-key-ceremony-trustees.md) | Trustee roles, DKG ceremony, share custody | QV-16 | Draft |
| QV-18 | [Bulletin board and transparency](18-bulletin-board-transparency.md) | Merkle log, witnesses, receipts, mirrors | QV-16 | Draft |
| QV-19 | [Client and supply chain](19-client-supply-chain.md) | Web client, reproducible builds, release integrity | QV-08, QV-16 | Draft |
| QV-20 | [Voting methods](20-voting-methods.md) | Encodings, proofs and tallies per method | QV-16 | Draft |
| QV-21 | [Research notes](research/) | Security, protocol, legal and landscape research (R-01…R-04) | — | Active |
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
| QV-15 | [Decision log](decision-log.md) | Durable record of accepted decisions | All | Active |

## Proposed completion order

1. Review the project charter and capability boundaries.
2. Complete product requirements and governance policy.
3. Resolve identity, eligibility, threat model, and privacy requirements together.
4. Select a ballot protocol only after the threat model and eligibility model are explicit.
5. Specify architecture, interfaces, data contracts, and user journeys.
6. Define testing and assurance gates before implementation.
7. Complete operational, accessibility, and sustainability requirements before launch.

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
