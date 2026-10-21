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
