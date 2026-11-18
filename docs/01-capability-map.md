# QV-01 — Capability Map

**Status:** Proposed framework; capability boundaries and order require project-owner review.  
**Purpose:** Establish stable module IDs and one-way dependencies before detailed module specs are approved.  
**Owner:** Project owner — to be recorded  
**Last reviewed:** Not yet reviewed  
**Related specs:** [QV-00 charter](00-project-charter.md), [spec index](SPEC-INDEX.md), [decision log](decision-log.md)

## Objective

The capability map splits the specification work into modules. Each module has one stable ID, one responsibility, and one-way dependencies. Module specs (QV-02 to QV-14, QV-16) use the module IDs below. The map defines no behavior, selects no protocol, and does not authorize implementation.

## Actors

Actors are defined in [QV-00](00-project-charter.md): member, organizer, observer, hosted operator, self-hosting operator, and project maintainers. Modules use these actors. A new actor type requires a charter update first.

## Scope and non-goals

- **In scope:** module boundaries, dependency direction, spec-to-module mapping, and the boundary contract each module must state.
- **Not in scope:** module internals, code layout, deployment topology (QV-08), and the ballot protocol choice (QV-05, QV-16).
- **Not yet mapped:** the optional modules in the spec index. QV-17 (portable credentials), QV-18 (federated governance), and QV-19 (delegation, exit, and forks) are outside the core map. See open decision 2.

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

Answers the boundary questions for each module. Interface changes are reviewed under QV-01-REQ-004.

| Module ID | Owns data | Must not receive | Trusted actors | Logs or audit artifacts | Failure states |
|---|---|---|---|---|---|
| `product-policy` | Rule definitions, group policy, lifecycle states | Member identity records; ballot selections | Organizer for rules it records | Rule version history; lifecycle changes | Incomplete or conflicting rules block opening |
| `identity-eligibility` | Membership records, eligibility outcomes, duplicate-participation state (form set in QV-04) | Ballot selections | Group roster source; recovery authority defined in QV-04 | Eligibility decisions (non-revealing, QV-00-REQ-013); recovery events | Roster unavailable: no new eligibility decisions. Never default to eligible |
| `ballot-engine` | Ballot definitions, submitted ballots, tally, verification evidence | Member identity records beyond the eligibility outcome | Identity module for eligibility outcomes; QV-16 cryptographic components | Submission and tally events. No plaintext ballot content in logs | Submission failure: not counted (QV-00-REQ-006). Verification failure: unverified (QV-00-REQ-005) |
| `security-privacy` | Threat model, retention rules, privacy claims register | None at runtime; reviews data flows in other specs | Review authority only; no runtime trust | Review records and decision-log entries | Unreviewed boundary change blocks approval |
| `experience-accessibility` | Screens, copy, rule and privacy explanations | Raw identity records and ballot content beyond what a screen needs; no direct tally path | Module interfaces only; holds no keys or identity data | Usage analytics only if QV-06 allows. [UNVERIFIED: none defined yet] | Shows not-counted, unverified, and dispute states |
| `platform-interfaces` | API, storage, and event contracts | Plaintext ballot content in shared storage | Hosting boundary defined in QV-08 | Access logs; retention per QV-06 | Version mismatch: reject the request. No partial writes |
| `operations-assurance` | Runbooks, test strategy, release gates, incident records | Ballot content; identity records only where a recorded support process requires them | Operator staff per QV-12 | Administrative action audit; incident records | Failed restore test blocks release |
| `sustainability` | Funding, pricing, and project governance decisions | Member-level data. Aggregate counts only, if pricing needs them | Project maintainers | Decision-log entries | Funding loss: continuity plan in QV-14 |

**Guarantees depended on:**

- `ballot-engine` depends on `identity-eligibility` for one eligibility outcome per member per decision, and on `security-privacy` for a linkability review.
- `experience-accessibility` depends on `product-policy` for rule text and on `ballot-engine` for result states.
- `platform-interfaces` depends on the three modules it lists for their contracts. `operations-assurance` depends on `platform-interfaces` for runbooks.

## Proposed build/specification order

1. `product-policy`
2. `security-privacy` and `identity-eligibility` (with explicit boundary contracts)
3. `ballot-engine`
4. `experience-accessibility` and `platform-interfaces`
5. `operations-assurance`
6. `sustainability`

The order above is for specification work. It does not authorize implementation. The security and privacy module is cross-cutting; changes to other modules require review for threat-model effects.

## Dependency check

- **Acyclic for the core map:** the build order above satisfies every dependency in the module table.
- **Cycle risk:** the spec index lists QV-06 (privacy and data lifecycle, module `security-privacy`) as depending on QV-05 (`ballot-engine`). `ballot-engine` depends on `security-privacy`. If QV-06's dependency is treated as a build dependency, the graph has a cycle. Proposed handling is open decision 3.
- **Boundary contract, not dependency:** `identity-eligibility` is built alongside `security-privacy`, but the table lists only `product-policy`. The contract is open decision 4.

## Spec-to-module mapping

| Module ID | Spec IDs (spec index) | Notes |
|---|---|---|
| `product-policy` | QV-02, QV-03 | Product requirements and governance policy |
| `identity-eligibility` | QV-04; optional QV-17 | QV-17 header uses this ID |
| `ballot-engine` | QV-05, QV-16 | QV-16 is marked cross-cutting in its header |
| `security-privacy` | QV-06, QV-07 | Data lifecycle and threat model; cross-cutting review |
| `experience-accessibility` | QV-10, QV-13 | User experience and accessibility/localization |
| `platform-interfaces` | QV-08, QV-09 | Architecture, deployment options, API and data contracts |
| `operations-assurance` | QV-11, QV-12 | Testing, assurance gates, operations and administration |
| `sustainability` | QV-14 | Funding, pricing, and project governance |
| Not a module | QV-15 (decision log) | Record of decisions |
| Not mapped | QV-18, QV-19 | Headers use `federated-governance` and `delegation-exit`. See open decision 2 |

## Cross-module flow and failure behavior

Member vote, in order:

1. `product-policy` publishes the rules; `experience-accessibility` shows them. *Failure:* no rules, no decision opens.
2. `identity-eligibility` returns an eligibility outcome; `ballot-engine` accepts a ballot only for that outcome. *Failure:* no ballot is offered; the member sees the QV-00 journey 2 message.
3. `ballot-engine` stores the ballot and produces evidence; `platform-interfaces` exposes it. *Failure:* the ballot is not counted and the member is told so.
4. Observers check the published evidence. *Failure:* the result is labeled unverified and the dispute path applies.

## Trust boundaries

- **Member client** (browser or app): holds the member's own choices. Outside the protected set in QV-07.
- **Organizer client:** can set rules and roster. Cannot change submitted ballots.
- **Platform service:** hosted by the operator or self-hosted by the group. Trust assumptions are in QV-08.
- **Storage:** receives only what `platform-interfaces` contracts allow.
- **Eligibility source:** the group's roster or credential issuer, as set in QV-04.
- **Observer tools:** read published evidence only.

## Abuse cases at the map level

| Case | Cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Identity data reaches `ballot-engine` through a shared store or log | Implementation shortcut | Choices linked to members | Interface contracts list allowed fields (QV-01-REQ-005) | Depends on implementation review |
| `experience-accessibility` creates a direct tally path | UX shortcut | Bypasses eligibility | QV-01-REQ-006 | Depends on architecture review |
| Interface change silently breaks a privacy assumption | Module owner change | Privacy loss | QV-01-REQ-004 | Reviewers may miss effects |
| Optional module adds identifiers to core data | Scope creep | Exposure of member data | Optional modules gated (QV-01-REQ-007) | Gate depends on review discipline |

## Verification

- Project-owner review of this map against the approval gate below.
- Mechanical checks in review: dependency graph has no cycle; every spec ID in the spec index is mapped or marked not a module; every boundary-table cell is filled.
- Each module spec states its boundary contract before it moves past Draft.

## Requirements

Requirements use the IDs `QV-01-REQ-NNN`.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-01-REQ-001 | The map shall list each module with a stable ID, one responsibility, and one-way dependencies. The dependency graph shall be acyclic. | Must | Every dependency appears in the module table. The build order satisfies every dependency. No cycle exists in the core map. | Project-owner review |
| QV-01-REQ-002 | Every spec in the spec index shall map to exactly one module, or be marked as not a module or not yet mapped. | Must | The spec-to-module mapping covers QV-02 to QV-19 with no gaps. | Cross-check against the spec index |
| QV-01-REQ-003 | Each module shall state the data it owns, the data it must not receive, its trusted actors, the guarantees it depends on, and the logs it may produce. | Must | The boundary table has no empty cell. Each module spec repeats its row. | Review at each module approval |
| QV-01-REQ-004 | Any change to a module interface or data flow shall be reviewed by `security-privacy` for threat-model effects before it is accepted. | Must | Each accepted change lists a security-privacy review. Each boundary change has a decision-log entry. | Review of decision log; QV-07 cross-reference |
| QV-01-REQ-005 | `ballot-engine` shall not receive member identity records. It receives only the eligibility outcome defined by the `identity-eligibility` contract. | Must | The QV-09 contract lists the fields passed. No identity field appears. Any field linking identity to a ballot requires a QV-07 review. | Schema and contract review; integration test (QV-11) |
| QV-01-REQ-006 | Every path to a tally shall go through `ballot-engine`. `experience-accessibility` shall not provide a direct tally path. | Must | Architecture review finds no tally path outside `ballot-engine`. A test asserts that tally requests are rejected without a valid ballot record. | Architecture review; security test (QV-11) |
| QV-01-REQ-007 | Optional modules (QV-17, QV-18, QV-19) shall not be approved or built until the core modules QV-02 to QV-09 are approved. | Must | Their status stays Draft or Deferred until the gate is met. The spec index shows the same. | Spec index review |
| QV-01-REQ-008 | Each module spec shall use the template and carry a Module ID that appears in this map. | Must | Every spec header Module ID matches a row in the module table. | Review at each spec change |
| QV-01-REQ-009 | Each module spec shall name its failure states and the failures of each dependency it relies on. | Must | Each spec has a failure section. Each dependency failure in the table has a matching entry in the dependent spec. | Review at each module approval |
| QV-01-REQ-010 | Each module shall be explicitly in or out of the first specification cycle. | Must | The decision log records the cycle for each module. | Decision-log review |
| QV-01-REQ-011 | This map shall be reviewed and accepted by the project owner before any module is marked Approved. The acceptance shall be recorded in the decision log. | Must | Decision-log entry exists and references this map's version. | Decision-log review |
| QV-01-REQ-012 | The map shall be re-reviewed when a module is added, merged, or split. | Should | Each change to the module table has a decision-log entry and a re-run of QV-01-REQ-001 and QV-01-REQ-002. | Review at change time |

## Approval gate

Before detailed module requirements are marked approved, the project owner should review:

- Whether module boundaries reflect independent capabilities
- Whether dependency direction is acyclic
- Whether ballot integrity and privacy responsibilities are correctly separated
- Whether deployment and sustainability belong in the product's first specification cycle

Record the accepted map and changes in [the decision log](decision-log.md).

## Open decisions

1. **Scope of the first review.** Should the owner review the eight core modules now, with optional modules left Deferred?
   - Options: review core modules now; map optional modules now as well.
   - Proposed: review the core modules now. Optional modules stay Deferred until the core modules are approved.
   - Owner: project owner.
2. **Unmapped module IDs.** QV-18 uses `federated-governance` and QV-19 uses `delegation-exit`. Neither is in the map.
   - Options: register both as optional modules; fold their responsibilities into existing modules; rename the headers.
   - Proposed: register both as optional modules with the same one-way rules. No core module depends on either.
   - Owner: project owner.
3. **QV-06 dependency on QV-05.**
   - Options: treat the QV-05 reference as a data-contract note (retention rules `ballot-engine` must honor); move retention rules into `ballot-engine`; split QV-06 into two parts.
   - Proposed: keep QV-06 in `security-privacy` and record the QV-05 reference as a data-contract note, not a build dependency.
   - Owner: project owner, with the `security-privacy` reviewer.
4. **Pairing of `identity-eligibility` with `security-privacy`.**
   - Options: add `security-privacy` as a dependency; keep the paired build with a named boundary contract.
   - Proposed: keep the paired build. Name the boundary contract as an artifact in QV-04 and QV-06.
   - Owner: project owner.
5. **First-cycle scope of deployment and sustainability.** This is the approval-gate question above.
   - Options: include both in the first cycle; defer both; include deployment and defer sustainability.
   - Proposed: include deployment (QV-08) in the first cycle, limited to what the hosting choice needs. Defer sustainability (QV-14) until core modules are approved.
   - Owner: project owner.
