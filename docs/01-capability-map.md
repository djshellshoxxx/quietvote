# QV-01 — Capability Map

**Status:** Proposed framework; capability boundaries and order require project-owner review.  
**Purpose:** Establish stable module IDs and one-way dependencies before detailed module specs are approved.  
**Owner:** Project owner — to be recorded  
**Last reviewed:** Not yet reviewed  
**Related specs:** [QV-00 charter](00-project-charter.md), [spec index](SPEC-INDEX.md), [decision log](decision-log.md)

## Objective

Split the specification work into modules, each with one stable ID, one responsibility, and one-way dependencies. Module specs (QV-02 to QV-14, QV-16) use these IDs. The map defines no behavior, selects no protocol, and does not authorize implementation.

## Actors

Actors are defined in [QV-00](00-project-charter.md). Modules do not add actor types; a new one requires a charter update.

## Scope and non-goals

- **In scope:** module boundaries, dependency direction, spec-to-module mapping, boundary contracts.
- **Not in scope:** module internals, code layout, deployment topology (QV-08), ballot protocol choice (QV-05, QV-16).
- **Not yet mapped:** optional modules QV-17, QV-18, QV-19 (see open decision 2).

## Proposed modules

| Module ID | Responsibility | Depends on |
|---|---|---|
| `product-policy` | User needs, product boundary, group policy and decision lifecycle | None |
| `identity-eligibility` | Membership, eligibility, participation uniqueness, recovery | `product-policy` |
| `ballot-engine` | Ballot definition, vote submission, tally, verification evidence | `product-policy`, `identity-eligibility`, `security-privacy` |
| `security-privacy` | Threat model, data minimization, privacy guarantees, security controls | `product-policy` |
| `experience-accessibility` | Member, organizer, and observer workflows; accessibility | `product-policy`, `identity-eligibility`, `ballot-engine` |
| `platform-interfaces` | Architecture, API, storage contracts, integrations | `identity-eligibility`, `ballot-engine`, `security-privacy` |
| `operations-assurance` | Deployment, administration, test strategy, incident response | `platform-interfaces`, `security-privacy` |
| `sustainability` | Pricing, project governance, funding, long-term maintenance | `product-policy`, `operations-assurance` |

## Module boundaries

Answers the boundary questions for each module. Interface changes follow QV-01-REQ-004.

| Module ID | Owns data | Must not receive | Trusted actors | Logs or audit artifacts | Failure states |
|---|---|---|---|---|---|
| `product-policy` | Rules, group policy, lifecycle states | Identity records; ballot selections | Organizer, for rules it records | Rule version history | Incomplete rules block opening |
| `identity-eligibility` | Membership, eligibility outcomes, duplicate-participation state | Ballot selections | Group roster; recovery authority per QV-04 | Non-revealing eligibility decisions; recovery events | Roster down: no new decisions; never default to eligible |
| `ballot-engine` | Ballots, tally, verification evidence | Identity records beyond the eligibility outcome | Eligibility outcome; QV-16 components | Submission and tally events; no plaintext ballots in logs | Failed submission: not counted. Failed evidence: unverified |
| `security-privacy` | Threat model, retention rules, privacy claims register | None at runtime | Review authority only | Review records; decision-log entries | Unreviewed boundary change blocks approval |
| `experience-accessibility` | Screens, copy, rule and privacy explanations | Identity records; ballot content beyond what a screen needs; any direct tally path | Module interfaces; holds no keys | Usage analytics only if QV-06 allows [UNVERIFIED: none defined] | Shows not-counted, unverified, and dispute states |
| `platform-interfaces` | API, storage, and event contracts | Plaintext ballot content in shared storage | Hosting boundary per QV-08 | Access logs, retained per QV-06 | Version mismatch: reject; no partial writes |
| `operations-assurance` | Runbooks, test strategy, release gates, incident records | Ballot content; identity records unless a recorded support process needs them | Operator staff per QV-12 | Admin action audit; incident records | Failed restore test blocks release |
| `sustainability` | Funding, pricing, governance decisions | Member-level data; aggregate counts only if pricing needs them | Project maintainers | Decision-log entries | Funding loss: continuity plan per QV-14 |

**Guarantees depended on:** `ballot-engine` relies on `identity-eligibility` for one eligibility outcome per member per decision, and on `security-privacy` for linkability review. `experience-accessibility` relies on `product-policy` for rule text and on `ballot-engine` for result states.

## Proposed build/specification order

1. `product-policy`
2. `security-privacy` and `identity-eligibility` (with explicit boundary contracts)
3. `ballot-engine`
4. `experience-accessibility` and `platform-interfaces`
5. `operations-assurance`
6. `sustainability`

The order above is for specification work. It does not authorize implementation. The security and privacy module is cross-cutting; changes to other modules require review for threat-model effects.

## Dependency check

- **Core map is acyclic:** the build order satisfies every dependency in the module table.
- **Cycle risk:** the spec index lists QV-06 (module `security-privacy`) as depending on QV-05 (`ballot-engine`), which depends on `security-privacy`. Treating that as a build dependency creates a cycle. See open decision 3.
- **Pairing:** `identity-eligibility` is built alongside `security-privacy`, but the table lists only `product-policy`. See open decision 4.

## Spec-to-module mapping

| Module ID | Spec IDs | Notes |
|---|---|---|
| `product-policy` | QV-02, QV-03 | Requirements and governance |
| `identity-eligibility` | QV-04; optional QV-17 | QV-17 header uses this ID |
| `ballot-engine` | QV-05, QV-16 | QV-16 is cross-cutting in its header |
| `security-privacy` | QV-06, QV-07 | Data lifecycle and threat model |
| `experience-accessibility` | QV-10, QV-13 | UX; accessibility and localization |
| `platform-interfaces` | QV-08, QV-09 | Architecture; API and data contracts |
| `operations-assurance` | QV-11, QV-12 | Testing; operations |
| `sustainability` | QV-14 | Funding and pricing |
| Not a module | QV-15 | Decision log |
| Not mapped | QV-18, QV-19 | Headers use `federated-governance` and `delegation-exit` (open decision 2) |

## Cross-module flow and failure behavior

Member vote, in order:

1. `product-policy` publishes rules; `experience-accessibility` shows them. *Failure:* no rules, no decision opens.
2. `identity-eligibility` returns an outcome; `ballot-engine` accepts a ballot only for that outcome. *Failure:* no ballot offered (QV-00 journey 2).
3. `ballot-engine` stores the ballot and produces evidence; `platform-interfaces` exposes it. *Failure:* not counted, and the member is told.
4. Observers check published evidence. *Failure:* result labeled unverified; dispute path applies.

## Trust boundaries

- **Member client:** holds the member's own choices. Outside the protected set in QV-07.
- **Organizer client:** sets rules and roster. Cannot alter submitted ballots.
- **Platform service:** hosted by the operator or self-hosted by the group (QV-08).
- **Storage:** receives only what `platform-interfaces` contracts allow.
- **Eligibility source:** roster or credential issuer, as set in QV-04.
- **Observer tools:** read published evidence only.

## Abuse cases at the map level

| Case | Cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Identity data reaches `ballot-engine` through a shared store or log | Implementation shortcut | Choices linked to members | Contracts list allowed fields (QV-01-REQ-005) | Depends on implementation review |
| `experience-accessibility` adds a direct tally path | UX shortcut | Bypasses eligibility | QV-01-REQ-006 | Depends on architecture review |
| Interface change silently breaks a privacy assumption | Module owner change | Privacy loss | QV-01-REQ-004 | Reviewers may miss effects |

## Verification

- Project-owner review against the approval gate below.
- Mechanical checks in review: no dependency cycle; every spec ID mapped or marked; no empty boundary cell.
- Each module spec states its boundary contract before moving past Draft.

## Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-01-REQ-001 | The map shall list each module with a stable ID, one responsibility, and one-way dependencies. The core dependency graph shall be acyclic. | Must | Every dependency is in the module table. The build order satisfies all of them. | Project-owner review |
| QV-01-REQ-002 | Every spec in the spec index shall map to exactly one module, or be marked not a module or not yet mapped. | Must | The mapping covers QV-02 to QV-19 with no gaps. | Cross-check against spec index |
| QV-01-REQ-003 | Each module shall state the data it owns, data it must not receive, trusted actors, guarantees it depends on, and logs it may produce. | Must | No empty cell in the boundary table. Each module spec repeats its row. | Review at each module approval |
| QV-01-REQ-004 | Any change to a module interface or data flow shall be reviewed by `security-privacy` for threat-model effects before acceptance. | Must | Each accepted change cites a security-privacy review and, if it changes a boundary, a decision-log entry. | Decision-log review; QV-07 cross-reference |
| QV-01-REQ-005 | `ballot-engine` shall not receive member identity records. It receives only the eligibility outcome defined by the `identity-eligibility` contract. | Must | QV-09 contract lists the passed fields. No identity field appears. Any field linking identity to a ballot needs a QV-07 review. | Schema and contract review; integration test (QV-11) |
| QV-01-REQ-006 | Every tally path shall go through `ballot-engine`. `experience-accessibility` shall have no direct tally path. | Must | Architecture review finds none outside `ballot-engine`. Test: tally requests without a valid ballot record are rejected. | Architecture review; security test (QV-11) |
| QV-01-REQ-007 | Optional modules (QV-17, QV-18, QV-19) shall not be approved or built until core modules QV-02 to QV-09 are approved. | Must | Their status stays Draft or Deferred until the gate is met. | Spec index review |
| QV-01-REQ-008 | Each module spec shall use the template and carry a Module ID that appears in this map. | Must | Every spec header Module ID matches a row in the module table. | Review at each spec change |
| QV-01-REQ-009 | Each module spec shall name its failure states and the failure behavior of each dependency it relies on. | Must | Each spec has a failure section. Each dependency failure in the table has a matching entry. | Review at each module approval |
| QV-01-REQ-010 | Each module shall be explicitly in or out of the first specification cycle. | Must | The decision log records the cycle for each module. | Decision-log review |
| QV-01-REQ-011 | The project owner shall accept this map before any module is marked Approved, and the acceptance shall be recorded in the decision log. | Must | Decision-log entry exists and cites this map's version. | Decision-log review |
| QV-01-REQ-012 | The map shall be re-reviewed when a module is added, merged, or split. | Should | Each change has a decision-log entry and re-runs QV-01-REQ-001 and QV-01-REQ-002. | Review at change time |

## Approval gate

Before detailed module requirements are marked approved, the project owner should review:

- Whether module boundaries reflect independent capabilities
- Whether dependency direction is acyclic
- Whether ballot integrity and privacy responsibilities are correctly separated
- Whether deployment and sustainability belong in the product's first specification cycle

Record the accepted map and changes in [the decision log](decision-log.md).

## Open decisions

1. **Scope of the first review.** Review the eight core modules now, with optional modules left Deferred?
   - Options: review core now; map optional modules now too.
   - Proposed: review core now. Optional modules stay Deferred until core is approved.
   - Owner: project owner.
2. **Unmapped module IDs.** QV-18 uses `federated-governance` and QV-19 uses `delegation-exit`. Neither is in this map.
   - Options: register both as optional modules; fold them into existing modules; rename the headers.
   - Proposed: register both as optional modules with the same one-way rules. No core module depends on them.
   - Owner: project owner.
3. **QV-06 dependency on QV-05.**
   - Options: treat it as a data-contract note (retention rules `ballot-engine` must honor); move retention rules into `ballot-engine`; split QV-06.
   - Proposed: keep QV-06 in `security-privacy`, recorded as a data-contract note, not a build dependency.
   - Owner: project owner, with the `security-privacy` reviewer.
4. **Pairing of `identity-eligibility` with `security-privacy`.**
   - Options: add `security-privacy` as a dependency; keep the paired build with a named boundary contract.
   - Proposed: keep the paired build. Name the boundary contract as an artifact in QV-04 and QV-06.
   - Owner: project owner.
5. **First-cycle scope of deployment and sustainability** (the approval-gate question above).
   - Options: both in first cycle; both deferred; deployment in, sustainability deferred.
   - Proposed: deployment (QV-08) in the first cycle, limited to what the hosting choice needs. Sustainability (QV-14) after core approval.
   - Owner: project owner.
