# QV-12 — Operations and Administration

**Module ID:** `operations-assurance` (duplicate of QV-11; see OD-11-8)  
**Status:** Framework  
**Owner:** Project owner (no named role in repo)  
**Last reviewed:** Not yet reviewed  
**Related specs:** Depends on QV-08, QV-11. Affects QV-03, QV-06, QV-07, QV-09, QV-14, QV-16. Decisions recorded in QV-15.  
**Objective:** Specify safe administration, support, reliability, and incident handling for each deployment model.

## 1. Objective

Set the rules for running QuietVote so that administration cannot silently change a closed decision, operations do not expose ballot choices, and an outage or error can be recovered without rewriting history.

Deployment models are not approved (QV-08; decision log). The README names two candidates: a hosted service and a self-hosted deployment. Requirements apply to each model QV-08 approves. Where a model is not yet approved, the requirement states the condition.

Needed by: the project owner, hosted operators, self-hosting groups, support staff, and auditors.

## 2. Scope

### In scope
- Organization onboarding and offboarding, admin roles, and ballot lifecycle
- Backup, restore, export, migration, key rotation, updates, and rollback
- Abuse reports, disputes, support, and incident handling
- Operational logs, metrics, and access to operational records
- Availability and support commitments

### Out of scope
- Cryptographic protocol design and key-generation method (QV-16)
- Ballot-protocol verification and release evidence (QV-11)
- Funding, pricing, and support tiers (QV-14)
- Choice of hosting provider or infrastructure tools (decided at implementation)

Non-goals:
- Operations do not make QuietVote anonymous or verifiable. Their job is to avoid adding linkage and to keep records recoverable.
- The operator is not a trusted party for ballot secrecy. Operator visibility is stated in QV-16 §6.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Group organizer/admin | Configure ballots and manage roles | Organization onboarded | Ballot runs as configured |
| Hosted operator | Keep service available and recoverable | Hosted instance live | Requirements met; incidents recorded |
| Self-hosting group | Run its own instance | Installed per QV-08 | Instance supported within stated scope |
| Support staff | Answer requests; escalate | Role-limited access | Issue resolved or escalated without ballot data |
| Auditor/observer | Check operational records | Access granted | Records confirm process was followed |

### Operating procedures (owner-written)
- Organization onboarding and offboarding (REQ-001)
- Admin role assignment and recovery (REQ-002)
- Ballot scheduling, time-zone handling, pause, close, and cancellation (REQ-003)
- Backup, restore, migration, and export (REQ-004, REQ-005)
- Credential/key rotation (REQ-006)
- Software updates and rollback (REQ-007)
- Abuse reports, disputes, and support escalation (REQ-008, REQ-013)
- Security incident and privacy incident response (REQ-009)
- Service retirement and organization exit (REQ-001)

Failure behavior: if the service is unavailable near a deadline, the close time does not change silently. Handling is set in OD-12-2. A recovery action without an approved authority is refused (REQ-002, OD-12-3).

## 4. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-12-REQ-001 | The operator shall onboard each organization with named admins and the decision rules it accepts. Offboarding shall offer an export and state in writing what is retained. | Must | No ballot can be created before an onboarding record exists. The export verifies with the independent verifier (QV-11). A deletion report lists retained items. | Test; Demonstration |
| QV-12-REQ-002 | Admin role assignment, change, and recovery shall be logged with actor, time, and role, and shall need the approval set in OD-12-3. | Must | In a security test, a single admin cannot alter a closed ballot record or act as a member. Every role change has a log entry. | Test (security); Review |
| QV-12-REQ-003 | Ballot schedule, pause, close, and cancel shall store the organizer's time zone and the resulting UTC instant, and shall not alter accepted ballots. | Must | A ballot scheduled across a daylight-saving change closes at the recorded instant (tested in at least one zone east and one west of UTC). A paused ballot accepts no new ballots. A cancellation publishes a signed notice and keeps prior records. | Test (integration) |
| QV-12-REQ-004 | Ballot records, manifests, and logs shall be backed up and restore-tested. | Must | A restore reproduces the pre-backup checkpoint hash. Restore evidence is attached to each release (QV-11-REQ-016). Targets per OD-12-5. | Test; Demonstration |
| QV-12-REQ-005 | Exports shall include the manifest, records, and verification instructions in a versioned format. Exports shall contain no field outside the QV-06 model. | Must | Export imports into a fresh instance with the same checkpoint. A schema scan finds no out-of-model field. | Test; Review |
| QV-12-REQ-006 | Signing and trustee keys shall be rotatable without invalidating earlier signed records. | Must | A rotation drill leaves earlier records verifiable with retained historical keys. The rotation procedure is documented. | Test (drill); Review |
| QV-12-REQ-007 | Updates shall not change the rules or protocol version of an open ballot. A rollback shall be tested and shall leave accepted records unchanged. | Must | An update attempted during an open ballot is refused or deferred. A rollback drill leaves the checkpoint hash unchanged. | Test |
| QV-12-REQ-008 | Abuse reports and disputes shall have an owner, a status, and a recorded resolution. Intake shall not ask for a ballot choice or a ballot receipt. | Must | Intake form review finds no ballot-choice or receipt field. Each report reaches a resolved state with a log entry. | Review; Test |
| QV-12-REQ-009 | Security and privacy incidents shall be classified, assigned an owner, and closed under a written incident plan that includes affected-group notice. | Must | A tabletop exercise covering classification, notice, and closure is completed before any pilot. Notice obligations under applicable law [UNVERIFIED: not analyzed]. | Demonstration; Review |
| QV-12-REQ-010 | Logs, metrics, and traces shall not record ballot choice or join login identity, IP address, and ballot-submission time (QV-16 §5). | Must | Schema review and a scan of sample logs find no such join. Alerts use service-health signals only. | Review; Test (privacy) |
| QV-12-REQ-011 | Access to operational records shall be role-restricted, logged, and subject to a defined retention period per record class. | Must | Unauthorized access attempts are denied and logged in test. Each record class has a retention setting (OD-12-8). | Test |
| QV-12-REQ-012 | The operator shall publish an availability target and a written procedure for outages near close. | Must | Target and procedure exist before any ballot opens. A drill exercises an outage near close. No close time changes without a logged action. | Review; Demonstration |
| QV-12-REQ-013 | Support response targets shall be published for each support tier. | Should | Published targets exist. Response times are tracked in an internal log. | Review |
| QV-12-REQ-014 | Each self-hosted release shall publish install, upgrade, backup, and support scope. | Should (Must if QV-08 approves self-hosting) | The document exists with all four headings before a self-hosted release. | Inspection |

### Observability boundaries (owner-written)
Define what metrics and logs are needed for reliability without creating ballot-choice or identity linkages. Set access controls, retention, redaction, and review procedures for operational records.

Enforced by REQ-010 and REQ-011. Logs and backups must not be a path to linkage. Backups count as operational records.

### Reliability targets (owner-written; not set in this spec)
- Availability during open ballots
- Submission acknowledgment latency
- Recovery point and recovery time objectives
- Maximum supported group size and concurrent ballots
- Support response targets
- Upgrade and compatibility policy

Do not choose numerical targets until deployment assumptions and user needs are known. Each item is decided in OD-12-5, OD-12-6, OD-12-7, or QV-14, and recorded in QV-15 before any ballot opens.

## 5. Data and privacy

- Data inputs: organization admin contacts, roles, ballot configuration, operational logs, support requests, backups.
- Data outputs: exports, deletion reports, abuse-report resolutions, operational reports. None may contain ballot choices.
- Data controller/operator: the hosted operator for a hosted instance. Each self-hosting group for its own instance. Controller status under applicable law [UNVERIFIED: not analyzed].
- Retention and deletion: set per record class in OD-12-8. Backups follow the same classes.
- Linkability risks: logs, backups, and support tickets can each join identity with timing. REQ-010 and REQ-011 limit this. Backup copies can outlive deletion (see Section 9).
- Visibility by member, organizer, operator, and observer: members see their own status and resolutions. Organizers see admin records for their organization. Operators see only role-permitted records. Observers see public records only.
- Privacy properties claimed: the operator's design does not record ballot choices in operational records (to be verified under REQ-010).
- Privacy properties explicitly not claimed: that the operator cannot observe network or submission timing metadata (QV-16 §6); that deleted data is absent from every backup.

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Admin alters a closed ballot's settings | Malicious or compromised admin | Rules changed after close | Append-only logs; approval rule (REQ-002, OD-12-3) | Collusion between approvers |
| Support staff receives a ballot choice | Member volunteers it in a ticket | Privacy breach; coercion risk | Intake excludes choice fields (REQ-008); redaction procedure | Member disclosure outside the system |
| Operational logs join identity and submission time | Misconfigured logging | Linkage; coercion risk | Logging review and scan (REQ-010) | Logs created by new features |
| Restore reverts a closed ballot | Restore error or attacker | History rewrite or lost ballots | Checkpoint verification after restore (REQ-004) | Records accepted after backup but before loss |
| Outage near deadline | Infrastructure failure or denial of service | Members cannot vote | Availability procedure (REQ-012); OD-12-2 | Outage exceeds procedure |
| Admin credential stolen | Phishing or malware | Privileged actions | Strong account protection (QV-16 §3) | Compromise of the admin's device |
| Signing key leaked | Key compromise | Forged manifests or checkpoints | Rotation and revocation (REQ-006) | Records signed before revocation |
| Bad update changes an open ballot | Faulty or malicious release | Invalid result | Update freeze during open ballots (REQ-007) | Defects that do not touch rules |

## 7. Interfaces and dependencies

- Upstream dependencies: QV-08 (deployment models), QV-11 (verifier, release evidence), QV-06 (retention and privacy model), QV-07 (abuse cases), QV-03 (decision rules and dispute policy), QV-16 (keys, logs, operator visibility).
- Downstream consumers: QV-14 (support and hosting cost), QV-10 (admin and member status screens), QV-13 (support languages), QV-15 (decisions).
- API/event/schema contracts: export format and checkpoint format are owned by QV-09. Not yet defined.
- Versioning and compatibility: exports carry a format version. Upgrade policy is OD-12-7.
- Failure and retry behavior: a failed action is logged and not silently retried in a way that changes records. A member sees the outcome and the close time in plain language.

## 8. UX, accessibility, and localization

- Key screens or interactions: admin ballot setup, pause and cancel confirmations, role changes, member status, dispute intake (QV-10).
- Plain-language explanations: cancel and pause screens state what happens to accepted ballots, in plain words.
- Keyboard/screen-reader requirements: admin and member operations accessible under QV-13.
- Low-bandwidth and device constraints: status and outage notices work without scripts or large assets. Proposed; confirm in QV-13.
- Localization requirements: member-facing operational messages are localized under QV-13.

## 9. Operations

- Configuration: each environment is configured from versioned settings. Secrets are kept out of logs and exports.
- Monitoring and audit: health monitoring only (REQ-010). Admin actions and recovery decisions are logged (REQ-002).
- Backup, recovery, and deletion: backups are tested (REQ-004). Deletion covers live stores and states which backups are retained and for how long (REQ-001, OD-12-8).
- Incident response: under REQ-009. Affected groups are notified under the written plan.
- Support and escalation: abuse and dispute items escalate to the owner named in REQ-008. Security incidents escalate to the project owner.

### Reliability targets
Status: not set (see OD-12-5 and OD-12-6).

## 10. Testing and verification

- Unit tests: configuration validation and time-zone handling (REQ-003).
- Integration tests: onboarding, role changes, ballot lifecycle, export and import (REQ-001 to REQ-005).
- End-to-end tests: organizer setup through close and export. Member status and dispute journeys (QV-11-REQ-011).
- Security/privacy tests: role abuse, log scan, intake review (REQ-002, REQ-008, REQ-010).
- Independent review or audit: operator and logging design review, as in QV-11-REQ-013 where it affects privacy claims.
- Release-blocking criteria: a failing restore check, a privacy-scan failure, or a missing availability procedure blocks the related release or pilot. QV-11 gate rules apply.

## 11. Constraints and assumptions

- Constraint: no deployment model is approved, so hosting-specific requirements are conditional.
- Constraint: no code exists. Backup, restore, and drill procedures cannot yet be run.
- Assumption [UNVERIFIED]: a hosted operator can keep ballot records separate from identity records in practice.
- Assumption [UNVERIFIED]: self-hosting groups can run the documented procedures without project staff.

## 12. Open questions

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| Who operates a hosted instance and who may inspect its logs? | Project owner | Before QV-08 deployment model is approved | Pending; see OD-12-1 |
| What happens if the service is unavailable near a deadline? | Project owner | Before any pilot | Pending; see OD-12-2 |
| Who can authorize recovery, recount, or invalidation? | Project owner | Before any pilot | Pending; see OD-12-3 |
| What is the support model for self-hosted organizations? | Project owner | Before any self-hosted release | Pending; see OD-12-4 |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## Open decisions

| ID | Question | Options | Recommendation (proposed) | Owner |
|---|---|---|---|---|
| OD-12-1 | Who operates a hosted instance and who may read its logs? | Project maintainers only; named operator roles; group-appointed reviewer | Named operator roles, log access per REQ-011. Ballot choices are excluded from logs under every option. | Project owner |
| OD-12-2 | What happens to a ballot if service is down near close? | Auto-extend close; close on schedule and count only acknowledged ballots; organizer-declared extension logged before new close | Close on schedule and count acknowledged ballots only. Extend only by a logged organizer action that the group rules (QV-03) permit, announced before the new close. | Project owner, with QV-03 decisions |
| OD-12-3 | Who may authorize recovery, recount, or invalidation? | One organizer; two distinct admins; organizer plus independent observer | Two distinct approvers, each signed and logged. Invalidation also requires QV-03 rules. | Project owner |
| OD-12-4 | What support model applies to self-hosted groups? | Community support only; paid tiers (QV-14); project-supported releases | Community support within REQ-014 scope. Tiers and response targets decided in QV-14 and REQ-013. | Project owner |
| OD-12-5 | Which numeric reliability targets apply (availability, acknowledgment latency, recovery point and time objectives)? | Set now; set after deployment model and pilot evidence; leave to each operator | Set none now, because no deployment model or usage evidence exists. Record chosen targets in QV-15 before any ballot opens. | Project owner |
| OD-12-6 | What maximum group size and concurrent ballots apply? | Fixed limits; limits per hosting tier; no limit | Defer until QV-08 architecture and QV-11 load evidence exist. Also sets the load profile for QV-11-REQ-010. | Project owner |
| OD-12-7 | What upgrade and compatibility policy applies? | No upgrades during open ballots; security-only patches during open ballots; any compatible patch | No rule or protocol change during open ballots. Security patches only after a review recorded in QV-15. | Project owner |
| OD-12-8 | How long are logs and backups kept? | Fixed period per record class; minimum needed for operations; indefinite | Minimum needed for operations, set per record class before any pilot. This spec sets no period. | Project owner |
| OD-12-9 | Module ID shared with QV-11 | See OD-11-8 | Unique module ID `operations-administration` | Project owner |
