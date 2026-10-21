# QV-01 — Capability Map

**Status:** Proposed framework; capability boundaries and order require project-owner review.  
**Purpose:** Establish stable module IDs and one-way dependencies before detailed module specs are approved.

## Proposed modules

| Module ID | Responsibility | Depends on |
|---|---|---|
| `product-policy` | User needs, product boundary, group policy and decision lifecycle | — |
| `identity-eligibility` | Membership, eligibility, participation uniqueness, recovery | `product-policy` |
| `ballot-engine` | Ballot definition, vote submission, tally, verification evidence | `product-policy`, `identity-eligibility`, `security-privacy` |
| `security-privacy` | Threat model, data minimization, privacy guarantees, security controls | `product-policy` |
| `experience-accessibility` | Member, organizer, and observer workflows; accessibility | `product-policy`, `identity-eligibility`, `ballot-engine` |
| `platform-interfaces` | Architecture, API, storage contracts, integrations | `identity-eligibility`, `ballot-engine`, `security-privacy` |
| `operations-assurance` | Deployment, administration, test strategy, incident response | `platform-interfaces`, `security-privacy` |
| `sustainability` | Pricing, project governance, funding, long-term maintenance | `product-policy`, `operations-assurance` |

## Proposed build/specification order

1. `product-policy`
2. `security-privacy` and `identity-eligibility` (with explicit boundary contracts)
3. `ballot-engine`
4. `experience-accessibility` and `platform-interfaces`
5. `operations-assurance`
6. `sustainability`

The order above is for specification work. It does not authorize implementation. The security and privacy module is cross-cutting; changes to other modules require review for threat-model effects.

## Boundary questions

For each module, identify:

- Data it owns and data it must not receive
- Inputs, outputs, and failure states
- Which actors it trusts
- Which guarantees it depends on from other modules
- Logs or audit artifacts it may produce
- How an interface can change without breaking other modules

## Approval gate

Before detailed module requirements are marked approved, the project owner should review:

- Whether module boundaries reflect independent capabilities
- Whether dependency direction is acyclic
- Whether ballot integrity and privacy responsibilities are correctly separated
- Whether deployment and sustainability belong in the product's first specification cycle

Record the accepted map and changes in [the decision log](decision-log.md).
