# QV-07 — Threat Model and Security

**Module ID:** `security-privacy`  
**Status:** Framework  
**Owner:** Project owner (role; individual not yet named)  
**Last reviewed:** Not yet reviewed  
**Objective:** Define assets, adversaries, abuse cases, mitigations, residual risks, and release-blocking security evidence.  
**Related specs:** QV-00, QV-01, QV-03, QV-04, QV-05, QV-06, QV-08, QV-11, QV-16

## 1. Objective

Define assets, adversaries, abuse cases, mitigations, residual risks, and release-blocking security evidence.

- **Who needs it:** the project owner (release decisions), engineers, security reviewers, and members who rely on the stated limits.
- **Why:** every security or privacy claim must trace to a stated threat model, a control, and evidence. QuietVote must not claim more than that (README principle 7; CONTRIBUTING).

## 2. Scope

### In scope
- Threat model for the ballot, eligibility, record, and operations modules (QV-03 to QV-06, QV-08).
- Security requirements, abuse cases, trust boundaries, and release-blocking evidence.
- Controls for keys, admin accounts, dependencies, releases, and incidents.

### Out of scope
- Choice of cryptographic constructions (QV-05, QV-16; expert review required).
- Physical security of member devices; coercion outside the software.
- Legal compliance and certification (QV-00 excludes certified elections).
- Hosting provider internal controls (not reviewed here; see section 11).

### Explicit non-goals
- No claim of anonymity, untraceability, coercion resistance, or endpoint integrity.
- Not a penetration test or audit. This module defines what must be tested and reviewed.
- No claim that ballot secrecy holds against a malicious operator beyond the boundary in section 7 (OD-07-2).

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Security reviewer | Assess controls and claims | Architecture and protocol candidate available | Findings logged against QV-07 IDs |
| Release owner | Decide whether a build may ship | Traceability and evidence complete | Go/no-go recorded in decision log |
| Incident responder | Contain and communicate an incident | Incident procedure in place (REQ-012) | Decision paused, corrected, or closed, with record |
| Reporter (any person) | Report a vulnerability | Public contact published (REQ-011) | Acknowledged report, tracked to fix |
| Organizer / admin | Operate a decision safely | Least-privilege role | Actions logged without ballot content |

### Journeys
1. **Vulnerability report:** received; triaged by severity; fixed or mitigated; regression test added; disclosed.
2. **Incident:** detected; classified (integrity, secrecy, eligibility, availability, data exposure); pause or invalidation decided under QV-03; members notified; post-incident review.
3. **Release:** build; dependency and secret scans; traceability check; review evidence attached; signed release.

### Failure behavior
- Integrity or secrecy control fails during an open decision: fail closed (QV-05-REQ-015); decision paused per QV-03.
- Other control fails (e.g., logging, rate limiter): alert, log the failure, and keep the decision open unless a count or choice could be affected.

## 4. Requirements

### 4.1 Adversaries and failures to assess

- Curious or malicious group administrator
- Compromised or coercive organizer
- Malicious or compromised service operator
- Colluding participants
- Network observer
- Compromised participant device or browser
- Credential theft, phishing, or account takeover
- Denial of service, spam, or ballot flooding
- Supply-chain compromise or vulnerable dependency
- Accidental misconfiguration and human error

| Adversary | Capability and access | Motivation | Likely impact | Out-of-scope assumption |
|---|---|---|---|---|
| Curious/malicious admin | Admin UI, group settings, roster tools | See votes or shift outcome | Rule or roster change; metadata access | Admin does not hold operator database access |
| Compromised/coercive organizer | Organizer role; signing key if compromised | Influence outcome; pressure members | Invalid rules or roster; pressure outside software | Coercion outside software not mitigated |
| Malicious/compromised operator | Servers, storage, logs, network metadata | Read or alter records; censor | Choice exposure if key access; false or dropped records | Protected only as stated in section 7 |
| Colluding participants | Own ballots; shared information | Reveal others' choices; vote buying | Partial linkage; buying claims | Vote buying not prevented |
| Network observer | Traffic metadata | Timing or identity correlation | Ballot-to-member linkage | TLS does not hide metadata |
| Compromised device/browser | Client code path, screen, input | Alter or reveal a choice | Wrong or exposed ballot | Not detected in general (REQ-014) |
| Credential theft / phishing | Member or admin login | Impersonation; vote in another's name | Invalid ballot; account misuse | Social engineering of support not fully controlled |
| DoS, spam, flooding | Public endpoints; eligible credentials | Availability loss | Ballots delayed or dropped | Eligible-only flooding not fully preventable (REQ-013) |
| Supply chain / dependency | Build, packages, releases | Ship altered client or verifier | Silent compromise | Zero-day in pinned dependency |
| Misconfiguration / human error | Operators, admins | Unintended | Exposure, wrong decision settings | Reduced by process, not eliminated |

### 4.2 Requirements

Requirements use IDs QV-07-REQ-NNN. Each maps to a test or review method.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-07-REQ-001 | The project shall trace every QV-07 requirement to at least one test ID or a recorded deferral. | Must | Trace matrix covers all QV-07 IDs; release check fails if one is missing. | Review of trace matrix; CI check |
| QV-07-REQ-002 | The project shall maintain data-flow and trust-boundary diagrams (TB-1 to TB-8, section 7) for each release candidate. | Must (before pilot) | Diagrams show every flow in QV-16 section 2; security reviewer signs off. | Review |
| QV-07-REQ-003 | Dependencies shall be pinned, recorded, and scanned; adding a dependency requires a recorded review. | Must | Lockfile pins versions; CI scan runs on every build; new dependency has a review record. | CI check; review |
| QV-07-REQ-004 | Release artifacts shall be signed, and the verification steps shall be documented. | Must (before pilot) | Each release has a signature verifiable with documented steps; a person other than the builder verifies one in a release drill. | Release drill |
| QV-07-REQ-005 | Signing and trustee keys shall have documented generation, storage, rotation, and retirement. No single person shall be able to use a signing key alone. | Must | Procedure approved; key access review shows no single-person use; recovery exercise succeeds (OD-07-6). | Review; recovery exercise |
| QV-07-REQ-006 | Admin and operator logins shall require a phishing-resistant factor (QV-16 section 3). | Must | Password-only login is refused in test; factor enrollment is documented. | Authentication test |
| QV-07-REQ-007 | No role or code path shall give operators or staff plaintext ballot access. Access attempts shall be denied and logged without choice content. | Must | Access-control tests deny all ballot-content reads; log entries contain no choice data. | Access-control test; code review |
| QV-07-REQ-008 | Account or credential recovery shall never alter a cast ballot or tally, and every recovery event shall be logged. | Must | Recovery during an open decision leaves the ballot count and tally unchanged; event is logged. | Integration test |
| QV-07-REQ-009 | Logs and analytics shall not join login identity, IP address, and ballot submission time. | Must | Schema and log review finds no joinable set; automated check fails the build on a new join. | Privacy test; review with QV-06 |
| QV-07-REQ-010 | All ballot and record input shall be validated against a strict schema, and parsers shall be fuzzed before pilot. | Must (before pilot) | Fuzz run completes with no crash; malformed input is rejected with an error. | Fuzz testing |
| QV-07-REQ-011 | A public vulnerability reporting policy and contact shall exist before any external user. | Must (before external use) | Policy published; a test report receives acknowledgment through the stated path. | Review; intake test |
| QV-07-REQ-012 | An incident procedure shall cover integrity, secrecy, eligibility, availability, and data exposure, and define who may pause or invalidate a decision. | Must (before pilot) | Procedure names roles and decision authority (QV-03); a tabletop exercise is recorded. | Tabletop exercise |
| QV-07-REQ-013 | Submission and credential-use attempts shall be limited per credential under operator-configurable policy. | Must | Attempts above the configured limit are rejected, store nothing, and reveal no choice; limit is documented. | Load and security test |
| QV-07-REQ-014 | Before confirmation, the client shall state that a compromised device can alter or reveal a choice. | Must | Notice shown on every confirmation path; wording reviewed. | UX review |
| QV-07-REQ-015 | Protocol review and implementation security audit shall be on file before any high-assurance claim. | Must (before high-assurance claim) | Review reports on file and linked from the claim ledger (QV-16 section 7). | Independent review (QV-11) |
| QV-07-REQ-016 | Every security or privacy claim in user-facing text shall link to a threat, control, evidence item, and stated limit. | Must | Release check finds no unlinked claim. | Release review |
| QV-07-REQ-017 | Secrets shall not appear in source, logs, or client bundles. | Must | CI secret scan blocks a seeded test secret. | CI test |
| QV-07-REQ-018 | Notifications shall reveal no proposal content or participation status beyond what group policy allows. | Should | Notification samples reviewed; no content leakage in test. | Review; test |

### 4.3 Required security artifacts

| Artifact | Owner | Due | Satisfies |
|---|---|---|---|
| Security requirements mapped to tests | Security owner | Before pilot | REQ-001 |
| Data-flow and trust-boundary diagrams | Security owner | Before pilot | REQ-002 |
| Dependency and release integrity policy | Engineering lead | Before pilot | REQ-003, REQ-004 |
| Key management and recovery design | Security owner; project owner | Before pilot | REQ-005 |
| Incident response procedure | Security owner | Before pilot | REQ-012 |
| Independent cryptographic/protocol review | External reviewer (to be engaged) | Before any high-assurance claim | REQ-015 |
| Vulnerability reporting and remediation process | Security owner | Before any external user | REQ-011 |

## 5. Data and privacy

- Data inputs: keys and credentials; eligibility and roster data (QV-04); ballot ciphertext and proofs (QV-05); logs and metrics; release artifacts.
- Data outputs: receipts; tally evidence; incident and audit records; vulnerability reports.
- Data controller/operator: proposed: the group is controller for decision data; the hosted operator is processor. To be confirmed in QV-06.
- Retention and deletion: set in QV-06. Published evidence is not deletable.
- Linkability risks: login and submission timing; logs joining identity and ballots; small-group tallies; device telemetry.
- Visibility by member, organizer, operator, and observer: see QV-05 section 5. Operators see ciphertext and metadata only.
- Privacy properties claimed: none beyond those passing QV-07-REQ-007 and REQ-009 with evidence.
- Privacy properties explicitly not claimed: anonymity; untraceability; protection from a compromised device; coercion resistance; protection of timing metadata.

### 5.1 Assets

| Asset | Sensitivity | Held by | Notes |
|---|---|---|---|
| Ballot choices and participant-to-ballot linkability | Highest | Client (plaintext, briefly); service (ciphertext only) | Linkability is the main risk |
| Membership and eligibility records | High | Eligibility service | Must not receive choices |
| Credentials, keys, and recovery channels | Highest | Members' devices; operator key stores; trustees | Recovery must not alter ballots |
| Proposal text and decision timing | Medium | Ballot service; public record if published | Timing can reveal participation |
| Tally and audit evidence | High (integrity) | Public record | Permanent once released |
| Administrative accounts and signing keys | Highest | Operator; organizer | Single-person use prohibited (REQ-005) |
| Availability during open decisions | High | Service | Fail closed for counts |
| Build, release, and update integrity | High | CI; release channel | Signed artifacts (REQ-004) |

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Changing rules or eligibility after a ballot opens | Compromised or coercive organizer | Unfair or invalid result | Frozen signed manifest (QV-05-REQ-001); roster commitment at open | Compromised organizer signing key |
| Impersonating a member or recovering their account | Credential theft, phishing, social engineering | Ballot cast in another's name | Phishing-resistant admin login (REQ-006); recovery cannot alter ballots (REQ-008) | Recovery-path social engineering |
| Linking a ballot to a member through timing or metadata | Operator, network observer | Choice revealed | No joinable logs (REQ-009); publication after close (OD-05-12) | Timing correlation not removed |
| Suppressing or selectively delaying votes | Operator, network attacker | Biased or lower participation | Receipts and inclusion checks (QV-05-REQ-009, -011); witnessed checkpoints (QV-05-REQ-012) | Drop before receipt cannot be proven |
| Publishing a false or incomplete tally | Operator; colluding trustees | False result | Verifier recomputes tally (QV-05-REQ-010); threshold decryption (QV-05-REQ-013) | Collusion at or above threshold |
| Harassing members through proposal or notification features | Members, outsiders | Harm; disclosure of participation | Content-neutral notifications (REQ-018); rate limits (REQ-013) | Harm outside the product |
| Retaliation or coercion outside the software | Coercer, employer | Member pressured | No software control; no coercion claim; user notice (QV-16 section 6) | Unmitigated |
| Re-identifying a person from a small group or rare choice | Members, observers | Choice inferred | Small-group suppression (OD-05-9) | Residual in very small groups |
| Compromised device alters or reveals a choice | Malware, browser extension | Wrong or exposed choice | Device-risk notice (REQ-014); verifier; reviewed client | Not generally detectable |
| Denial of service or ballot flooding | Attacker; spam from eligible credentials | Ballots delayed or dropped | Attempt limits (REQ-013); fail closed (QV-05-REQ-015) | Eligible-only flooding |
| Malicious dependency or build | Supply-chain attacker | Compromised client or verifier | Pinned dependencies and scans (REQ-003); signed releases (REQ-004) | Zero-day in pinned dependency |
| Secret leaked in source or logs | Accident; attacker | Key or credential exposure | Secret scanning (REQ-017) | Secrets in runtime memory |

## 7. Interfaces and trust boundaries

| Boundary | Between | Rule |
|---|---|---|
| TB-1 | Member device and client app | Client trusted only as far as the device is uncompromised |
| TB-2 | Client and network | TLS protects content; metadata remains visible to observers |
| TB-3 | Service and eligibility service | Eligibility service receives no choices |
| TB-4 | Ballot service and storage | Storage holds ciphertext and proofs only |
| TB-5 | Operator and trustees | No trustee share reaches the operator |
| TB-6 | Record and public or verifier | Record holds no roster or identity-to-ballot mapping |
| TB-7 | Admin/operator accounts and systems | Privileged, phishing-resistant login, logged |
| TB-8 | Build/CI and release channel | Signed artifacts only |

- Upstream dependencies: QV-00 (scope); QV-03 (decision authority); QV-04 (identity and roster); QV-05 and QV-16 (protocol design).
- Downstream consumers: QV-06 (retention); QV-08 (architecture); QV-09 (contracts); QV-11 (release gates); QV-12 (operations).
- API/event/schema contracts: security-relevant fields in QV-09; not yet specified.
- Versioning and compatibility: this module's revisions are versioned; a change to a trust boundary requires a decision log entry.
- Failure and retry behavior: see section 3.

## 8. UX, accessibility, and localization

- Key screens or interactions: privacy and security notice; device-risk notice (REQ-014); receipt; incident status notices to members.
- Plain-language explanations: each notice states who can learn what, and what is not protected (README principle 3).
- Keyboard/screen-reader requirements: notices are keyboard-reachable and announced; no meaning by color alone (QV-13).
- Low-bandwidth and device constraints: notices must not depend on large assets (QV-13).
- Localization requirements: notices translated before a decision opens in that language, and checked by a fluent reviewer for accuracy of limits.

## 9. Operations

- Configuration: key policy, attempt limits, retention settings are versioned; changes are logged.
- Monitoring and audit: security events and service health; no logs that join identity with ballots (REQ-009).
- Backup, recovery, and deletion: key backup and recovery per OD-07-6; ballot backups per QV-06; published evidence not deleted.
- Incident response: REQ-012; pause or invalidation authority per QV-03.
- Support and escalation: security contact published (REQ-011); support staff have no ballot access (REQ-007).

## 10. Testing and verification

- Unit tests: input validation, authorization checks, key-handling paths.
- Integration tests: recovery during open decision; attempt limits; log schema.
- End-to-end tests: incident drill on a test decision; release verification by a second person.
- Security/privacy tests: parser fuzzing; plaintext storage scans; join detection; dependency and secret scans; tabletop exercise.
- Independent review or audit: protocol review and implementation audit before high-assurance claims (REQ-015).
- Release-blocking criteria: for any pilot, REQ-001, 003, 004, 005, 007, 008, 009, 010, 012, 013, 014, 017 pass; for high-assurance claims, REQ-015 and REQ-016 also pass.

## 11. Constraints and assumptions

- Constraint: no bespoke cryptography and no token or blockchain requirement (QV-16 sections 1 and 7).
- Constraint: no security review budget is defined; release gate depends on OD-07-4.
- Assumption requiring validation: the hosted operator is outside the ballot-secrecy boundary (OD-07-2).
- Assumption requiring validation: member devices may be compromised, and the product must say so.
- Assumption requiring validation: hosting-provider controls are adequate [UNVERIFIED]. No claim is made about them.

## 12. Open questions

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| Which attacker is the MVP required to resist? | Project owner | Before QV-07 approval | Pending; proposal OD-07-1 |
| Is the hosting operator in the trust boundary? | Project owner | Before QV-07 approval | Pending; proposal OD-07-2 |
| What is the supported threat level for coercion? | Project owner | Before QV-07 approval | Pending; proposal OD-07-3 |
| What is the security review budget and release gate? | Project owner | Before pilot | Pending; proposal OD-07-4 |
| Which vulnerabilities require pausing or invalidating an active decision? | Project owner; QV-03 owner | Before pilot | Pending; proposal OD-07-5 |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## Open decisions

| ID | Question | Options | Proposed (recommendation) and alternatives | Owner |
|---|---|---|---|---|
| OD-07-1 | Which attacker must the MVP resist? | (a) Honest-but-curious operator and admins, plus external attackers; (b) malicious operator with storage access | Proposed: (a). Malicious operator is explicitly out of scope for ballot secrecy until QV-05 OD-05-2 is resolved. Alternative (b) requires a different protocol. | Project owner |
| OD-07-2 | Is the hosting operator inside the trust boundary? | (a) Trusted for availability and metadata only; (b) untrusted; (c) trusted fully | Proposed: (a). Operator is outside the ballot-secrecy boundary (TB-5). Alternative (b) if the product is self-host only. | Project owner; QV-08 owner |
| OD-07-3 | What coercion threat level is supported? | (a) None, stated as unsupported; (b) receipt-hiding measures; (c) re-voting as deterrent | Proposed: (a) for MVP, with clear user notices. (c) depends on QV-03 revote rules and is not claimed. | Project owner; QV-03 owner |
| OD-07-4 | Security review budget and release gate | (a) Independent protocol review only for pilot; (b) review plus implementation audit for pilot | Proposed: (b) for any pilot. Full recovery exercises before broader use. Budget amount is not estimated here; owner to set. | Project owner |
| OD-07-5 | Which vulnerabilities pause or invalidate an active decision? | (a) Any confirmed integrity, secrecy, or eligibility break pauses; (b) availability issues only extend windows; (c) no pause | Proposed: (a) and (b). Invalidation follows QV-03 procedure and is a signed event. | Project owner; QV-03 owner |
| OD-07-6 | Who can recover admin signing or trustee keys? | (a) Threshold of named officers; (b) single backup holder; (c) no recovery (loss ends decision) | Proposed: (a), with officers named in QV-04 or QV-12. Alternative (c) if recovery risk is judged higher than loss risk. | Project owner; QV-12 owner |
