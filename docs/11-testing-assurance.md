# QV-11 — Testing and Assurance

**Module ID:** `operations-assurance`  
**Status:** Framework  
**Owner:** Project owner (no named role in repo)  
**Last reviewed:** Not yet reviewed  
**Related specs:** Depends on QV-03–QV-09, QV-16. Verifies QV-10, QV-12, QV-13. Decisions recorded in QV-15.  
**Objective:** Define evidence required to trust behavior, privacy claims, tally correctness, and releases.

## 1. Objective

This spec sets the evidence that must exist before QuietVote makes a claim to a group or ships a release. It does not define the tests themselves. Those follow from the protocol and designs once selected (QV-05, QV-16).

Needed by: the project owner (release decisions), implementers, independent reviewers, and organizers who rely on published claims.

## 2. Scope

### In scope
- Test layers and invariants that protect ballot, tally, privacy, and release claims
- Release gates, review sign-offs, and evidence bundles
- Test vectors, protocol-version fixtures, and verifier cross-checks
- A claim ledger linking each user-facing claim to its evidence

### Out of scope
- Choosing a voting protocol or cryptographic construction (QV-05, QV-16)
- Backup, incident, and operating procedures (QV-12)
- Test tools, CI vendor, and code structure (decided at implementation)
- Certification for public or legally binding elections (not targeted, per README)
- Non-goal: proving QuietVote anonymous, secure, or verifiable. This spec only defines the evidence needed before such claims may be made.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Project owner | Decide whether a release meets its gates | Evidence bundle assembled | Release decision recorded in QV-15 |
| Implementer | Show each requirement is met | Spec approved | Tests cite requirement IDs (REQ-008) |
| Independent reviewer | Find where design or code fails its claims | Frozen protocol candidate and build | Written findings; blockers resolved or waived |
| Privacy and security tester | Try to break a claim or abuse case | Test environment with synthetic data | Reproducible findings |
| Organizer | Rely on statements made before a ballot | Published claim ledger | Knows what is verified and what is not |

Release journey: build, rebuild check (REQ-014), evidence bundle (REQ-016), independent review (REQ-013), owner decision, release notes that list only verified claims.

Failure behavior: a failing test for a Must requirement blocks release. A reviewer blocker stops any pilot until it is resolved or waived in QV-15.

## 4. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-11-REQ-001 | The project shall keep a claim ledger; each user-facing privacy, security, or integrity claim shall link to its assumptions, threat-model reference, and evidence IDs. | Must | Every claim in release materials has a complete ledger row; a claim with a missing field fails the release gate. | Review |
| QV-11-REQ-002 | The system shall publish a ballot definition that matches the rules participants accepted. | Must | For each decision, the hash shown at acceptance equals the published hash in all test runs. | Test; Demonstration |
| QV-11-REQ-003 | The system shall count only submissions that meet the eligibility policy selected for that decision. | Must | Fixtures with ineligible, expired, and revoked credentials (per QV-04) produce zero counted ballots. | Test (property) |
| QV-11-REQ-004 | The system shall apply the duplicate-submission rule stated in the decision's policy. | Must | For each duplicate fixture, exactly the policy-defined outcome occurs and no member is counted twice. | Test (property) |
| QV-11-REQ-005 | The published result shall equal the defined tally algorithm applied to the accepted record. | Must | An independently written verifier and the system produce identical tallies on the full fixture set. | Test (differential); Independent review |
| QV-11-REQ-006 | Audit artifacts, exports, logs, and error reports shall not expose information beyond the approved privacy model (QV-06). | Must | A scan of every artifact type in a release finds no field joining member identity with ballot choice; scan results are archived with the release. | Test (privacy); Review |
| QV-11-REQ-007 | Closing, cancellation, and recount shall not silently rewrite history. | Must | Modifying a closed record fails; each cancel or recount appears as a new signed entry; prior records still verify. | Test (integration); Security test |
| QV-11-REQ-008 | Every test shall cite the requirement IDs it verifies. | Must | The test report maps every test to at least one QV ID; unmapped tests fail the pipeline check. | Inspection |
| QV-11-REQ-009 | Test vectors and protocol versions shall be versioned; any change shall have a QV-15 entry. | Must | A vector change with no matching QV-15 entry fails review. | Review |
| QV-11-REQ-010 | Ballot submission shall be fault-tested under the load profile set in QV-12 (OD-12-6). | Must | After injected crashes, retries, and network loss, reconciliation finds every acknowledged ballot counted exactly once and no unacknowledged ballot counted. | Test (fault injection; load) |
| QV-11-REQ-011 | Accessibility and localization tests shall cover every member and organizer journey (QV-10) in each supported language. | Must | Recorded results exist per journey, assistive technology, and language; a missing entry blocks release. | Test; Review |
| QV-11-REQ-012 | Test data shall be synthetic. Production member data shall not be used in any test environment. | Must | The fixture generator is documented; release review confirms no production data was imported. | Inspection; Audit |
| QV-11-REQ-013 | No ballot-secrecy, anonymity, or full-verifiability claim shall be released before independent protocol and cryptographic review is recorded. | Must | A linked review report exists, with findings resolved or waived in QV-15. | Review (independent) |
| QV-11-REQ-014 | Release artifacts shall be rebuildable from the tagged source. | Must | A rebuild from the tag reproduces the published hashes; a mismatch blocks release. | Test; Demonstration |
| QV-11-REQ-015 | Security tests shall cover each QV-07 abuse case for authorization, abuse controls, and recovery. | Must | Each QV-07 case maps to a passing test or to a residual risk accepted in QV-15. | Security test; Review |
| QV-11-REQ-016 | Every release shall have an evidence bundle. A Must requirement without passing evidence shall block release unless a waiver is recorded in QV-15. | Must | The bundle lists each Must ID with an evidence link or waiver. | Review |

## 5. Data and privacy

- Data inputs: synthetic rosters, credentials, ballots, and rule sets; test results; reviewer findings.
- Data outputs: test reports, evidence bundles, claim ledger, verifier results. None may contain member identifiers.
- Data controller/operator: Project owner for project test data. Hosted operators (QV-12) for any live environment.
- Retention and deletion: synthetic fixtures may be deleted at any time. Evidence retention is proposed in OD-11-6.
- Linkability risks: fixtures that reuse one credential secret across decisions could make test activity linkable. Logs that join credential IDs with ballot records are prohibited (REQ-006).
- Visibility by member, organizer, operator, and observer: members see none of these artifacts. Organizers see the claim ledger and public results. Operators see test evidence and release bundles. Observers see only public verification artifacts.
- Privacy properties claimed: none. This spec defines tests; it does not claim any property holds.
- Privacy properties explicitly not claimed: any property of a live deployment, unless verified and listed in the claim ledger.

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Verifier repeats system logic | Implementer error shared by both | Tally error passes all checks | Independently written verifier (REQ-005) | Shared misreading of the spec |
| Vectors drift from spec | Untracked edits | False assurance | Versioned vectors with QV-15 entries (REQ-009) | Reviewer must still check |
| Production data used in tests | Copied for realism | Member privacy breach | Synthetic data only (REQ-012) | Human error |
| Claim exceeds evidence | Marketing or documentation | Members misled | Claim ledger gate (REQ-001) | Statements outside release materials |
| Pipeline alters evidence or records | Compromised build or tester | Silent history change | Rebuild check (REQ-014); append-only records (REQ-007) | Signing key compromise (see QV-12-REQ-006) |
| Lost or duplicated submission | Crash, retry, or network loss | Miscount | Fault-injection reconciliation (REQ-010) | Faults not modeled |

## 7. Interfaces and dependencies

- Upstream dependencies: QV-03 (rules), QV-04 (eligibility fixtures), QV-05 (method and tally), QV-06 (privacy model), QV-07 (abuse cases), QV-08 (environments), QV-09 (contracts), QV-16 (protocol candidate).
- Downstream consumers: QV-10, QV-12 (backup and restore evidence), QV-13, QV-14 (claims), QV-15 (decisions and waivers).
- API/event/schema contracts: vector and verifier output formats are not yet defined. QV-09 owns them (OD-11-4).
- Versioning and compatibility: each evidence bundle records the spec, protocol, and build versions tested. Vectors for existing records are kept.
- Failure and retry behavior: proposed: a flaky test counts as failing until fixed or waived in QV-15.

## 8. UX, accessibility, and localization

- Key screens or interactions: member submission, receipt, verification steps, organizer ballot setup (QV-10).
- Plain-language explanations: privacy notices and verification steps are tested for comprehension at the usability prototype stage (QV-16 §8).
- Keyboard/screen-reader requirements: tested under REQ-011; the standard is set in QV-13.
- Low-bandwidth and device constraints: a device and network test matrix is required (OD-11-5).
- Localization requirements: every supported language is covered by REQ-011.

## 9. Operations

- Configuration: test environments are built from versioned config and hold no production secrets.
- Monitoring and audit: evidence bundles and waivers are kept in an append-only record.
- Backup, recovery, and deletion: restore evidence is required before release (QV-12-REQ-004). Evidence retention is proposed in OD-11-6.
- Incident response: a weakness found in a released version is classified and handled under QV-12-REQ-009. An open blocker stops further release.
- Support and escalation: reviewer findings go to the project owner. Unresolved blockers stop release.

## 10. Testing and verification

### Test layers (owner-written)
- Unit tests for rule validation and tally algorithms
- Property and invariant tests for eligibility and ballot lifecycle
- Integration tests for identity, storage, and cryptographic boundaries
- End-to-end tests for member and organizer journeys
- Accessibility and localization tests
- Concurrency, load, and fault-injection tests
- Privacy tests for logs, analytics, exports, and error reports
- Security tests for authorization, abuse controls, and recovery
- Independent protocol and cryptographic review
- Reproducible build and release verification

### Required invariants (owner-written)
- Published ballot definition matches the rules participants accepted. (REQ-002)
- Only eligible submissions count under the selected policy. (REQ-003)
- Duplicate submissions follow the specified rule. (REQ-004)
- Published result matches the defined tally algorithm. (REQ-005)
- Audit artifacts do not expose protected information beyond the approved model. (REQ-006)
- Closing, cancellation, and recount behavior cannot silently rewrite history. (REQ-007)

Define precise properties and test fixtures once the protocol is selected.

### Release gates (owner-written)
Specify blocking defect levels, review sign-offs, test evidence, migration checks, backup/restore evidence, and response plans for discovered weaknesses. No privacy or security marketing claim may exceed verified properties.

Proposed gate criteria:
- Every Must requirement has passing evidence or a QV-15 waiver (REQ-016).
- A failing test for REQ-002 to REQ-007 or REQ-010 blocks release.
- Independent review is recorded before any privacy or security claim (REQ-013).
- Backup/restore evidence and migration checks are attached (QV-12-REQ-004, QV-12-REQ-005).

### Verification by layer (template)
- Unit tests: rule validation and tally functions (REQ-005).
- Integration tests: identity, storage, and cryptographic boundaries (REQ-002, REQ-007, REQ-010).
- End-to-end tests: member and organizer journeys (REQ-011).
- Security and privacy tests: REQ-006, REQ-012, REQ-015.
- Independent review or audit: REQ-013. Reviewer choice is OD-11-3.
- Release-blocking criteria: see Release gates above.

## 11. Constraints and assumptions

- Constraint: no protocol is selected, so ballot-secrecy test oracles cannot be written yet.
- Constraint: no code exists, so load, fault, and reliability tests cannot run.
- Assumption [UNVERIFIED]: synthetic fixtures are enough to exercise eligibility rules.
- Assumption [UNVERIFIED]: an independent verifier can be written from the spec alone.

## 12. Open questions

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| What coverage or mutation-testing targets are meaningful? | Project owner | Before first implementation milestone | Pending; see OD-11-1 |
| Which tests must run on every change versus pre-release? | Project owner | Before first implementation milestone | Pending; see OD-11-2 |
| Who reviews the cryptographic design independently? | Project owner | Before protocol selection (QV-16) | Pending; see OD-11-3 |
| How are test vectors and protocol versions maintained? | Project owner | Before protocol selection (QV-16) | Pending; see OD-11-4 |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## Open decisions

| ID | Question | Options | Recommendation (proposed) | Owner |
|---|---|---|---|---|
| OD-11-1 | Coverage or mutation-testing targets? | Numeric coverage target; mutation score; requirement-level evidence only | Requirement-level evidence (REQ-008) now; no numeric target until code exists | Project owner |
| OD-11-2 | Which tests run on every change? | All tests on every change; fast suite per change with heavy suites pre-release | Unit, property, and integration tests per change; fault injection, load, differential verifier, and rebuild checks pre-release | Project owner |
| OD-11-3 | Who reviews the cryptographic design? | External academic reviewers; audit firm; community panel | At least one external reviewer with protocol expertise, chosen before protocol freeze. No reviewer named yet. | Project owner |
| OD-11-4 | Where are vectors and protocol versions kept? | In-repo with version tags; separate public vector repository | In-repo, versioned, changed only with a QV-15 entry (REQ-009) | Project owner |
| OD-11-5 | Which accessibility standard and device/network matrix? | Named external standard; project checklist; device list | Defer standard and matrix to QV-13; matrix must exist before release | Project owner (via QV-13) |
| OD-11-6 | How long are evidence bundles kept? | While version supported; permanently; fixed period | While the version is supported; deletion only by a recorded QV-15 decision | Project owner |
| OD-11-7 | Who may waive an unmet Must requirement? | Owner alone; owner plus independent reviewer; no waivers | Owner records waiver with reviewer note. No waiver for REQ-001, REQ-006, or REQ-013. | Project owner |
| OD-11-8 | Module ID shared with QV-12 (`operations-assurance`) | Rename QV-11; rename QV-12; keep shared | Unique IDs: `testing-assurance` for QV-11, `operations-administration` for QV-12 | Project owner |
