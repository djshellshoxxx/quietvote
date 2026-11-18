# QV-05 — Ballot Protocol

**Module ID:** `ballot-engine`  
**Status:** Framework  
**Owner:** Project owner (role; individual not yet named)  
**Last reviewed:** Not yet reviewed  
**Objective:** Define ballot formats, vote submission, tallying, and what participants can independently verify.  
**Related specs:** QV-03, QV-04, QV-07, QV-16 (upstream); QV-06, QV-08, QV-09, QV-10, QV-11 (downstream)

## 1. Objective

Define ballot formats, vote submission, tallying, and what participants can independently verify.

- **Who needs it:** organizers who run member decisions, members who vote, and observers or auditors who check procedure and result.
- **Why:** a group needs a result it can verify without learning how any named member voted (README principles 1 and 2).

## 2. Scope

### In scope
- Ballot definition, versioning, and the manifest that freezes a ballot before it opens.
- Vote encoding, submission, receipt, tally, and result evidence for MVP-selected methods.
- Verification artifacts, and the hooks that challenge and recount procedures use (procedure itself is in QV-03).
- Evaluation of candidate protocols and selection criteria (candidates are in QV-16).

### Out of scope
- Eligibility, identity, and credential issuance (QV-04, QV-17).
- Rule-setting, quorum values, dispute and appeal procedure (QV-03).
- Delegation model detail (QV-19) and federated decisions (QV-18).
- Hosting and storage topology (QV-08), retention periods (QV-06), screen design (QV-10).

### Explicit non-goals
- No claim of anonymous voting, coercion resistance, or vote-buying resistance (see section 4.1).
- No ranked-choice tally in the MVP.
- No token, blockchain, or bespoke cryptographic primitive (QV-16 sections 1 and 7).
- No choice of cryptographic construction in this document. Candidates only; expert review required.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Organizer | Freeze and open a ballot; close it | Rules set under QV-03; roster frozen under QV-04 | Signed manifest published before opening |
| Member | Cast one valid private ballot | Eligible; ballot open; reviewed client | Receipt; choice not visible to other members |
| Observer / auditor | Check inclusion, eligibility evidence, and tally | Access to group-visible or public evidence | Pass/fail report with a reason for each check |
| Trustee (guardian) | Contribute a decryption share, if the chosen protocol uses trustees | Key setup complete; independent of other trustees (OD-05-10) | Share with verifiable proof; aggregate only |
| Ballot service operator | Run submission and storage | Operational access separated from ballot content | Stores ciphertext and proofs; holds no plaintext choice |

### Journeys
1. **Setup:** organizer picks method, options, and limits; system builds the manifest and its hash; organizer signs; manifest is published before opening.
2. **Cast:** member opens ballot, reads rules and privacy notice, selects, reviews, confirms; client encrypts and submits; receipt is issued.
3. **Verify:** observer downloads the record, checks manifest signature, inclusion, validity evidence and tally, and gets a report.
4. **Challenge:** member or observer disputes inclusion or tally within the window set by QV-03; any recount or correction is recorded as a signed event.

### Failure behavior
- Client cannot encrypt or produce a validity proof: submission is blocked; nothing is sent; plain-language error.
- Submission lost before receipt: member may retry; a retry must not create a second counted ballot (QV-05-REQ-005).
- Eligibility or validity check fails at the service: ballot is not stored; member sees a failure category, never choice content.
- Trustee unavailable or share invalid: tally is held; no partial decryption; status is shown.
- Service outage while a ballot is open: stop or resume rule per QV-03 (OD-05-6).

## 4. Requirements

Requirements use IDs QV-05-REQ-NNN. Each has a verification method. Items marked "if chosen" depend on an open decision.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-05-REQ-001 | The system shall publish a signed ballot manifest (options, method, limits, eligibility cutoff, open/close conditions, protocol version) before opening, and shall reject any change to it after opening. | Must | Manifest hash shown at opening equals the published hash; edit attempts after opening are refused and logged; no record changes after opening. | Integration test; lifecycle review |
| QV-05-REQ-002 | The system shall bind every encoded ballot and proof to its decision ID and protocol version. | Must | A ballot valid for decision A is rejected for decision B in all test vectors. | Test vectors; security test |
| QV-05-REQ-003 | The system shall support only the MVP methods approved in section 4.2 and shall refuse creation of any other method. | Must | Creating a ranked or delegated ballot in MVP returns a refusal; supported list equals approved list. | Unit test; review |
| QV-05-REQ-004 | The client shall reject invalid selections (count out of range, unknown option) before encryption, and the service shall reject any ballot whose validity proof fails. | Must | Invalid test ballots are rejected at both layers; error names the rule broken, not the choice. | Unit and integration tests |
| QV-05-REQ-005 | The system shall count at most one ballot per eligible member per decision, including retries, multiple devices, and concurrent submissions. | Must | Duplicate attempts produce exactly one stored counted ballot; the first accepted ballot is kept. | Integration and adversarial tests; QV-04 cross-check |
| QV-05-REQ-006 | The system shall reject any ballot that lacks a valid eligibility proof against the frozen roster. | Must | Ineligible test identities and members removed after cutoff produce no stored ballot. | Negative tests |
| QV-05-REQ-007 | The client shall encrypt each selection before transmission, so the service receives only ciphertext and proofs. | Must | Captured traffic and storage dumps of test ballots contain no plaintext choice; no decryption key exists on service hosts. | Security test; architecture review |
| QV-05-REQ-008 | The system shall not store or log data that joins a stable member ID to ballot ciphertext, plaintext, or submission metadata. | Must | Schema and log review finds no join key; a new join fails the build. | Privacy test; review with QV-06 |
| QV-05-REQ-009 | After confirmed submission, the system shall issue a receipt that lets the member find their ballot in the record and contains no choice data. | Must | Receipt in test resolves to the stored ballot; receipt fields contain no choice. | End-to-end test; usability test |
| QV-05-REQ-010 | The system shall make the tally recomputable from the public or group record by the standalone verifier. | Must | Verifier reproduces the published result on the test decision; a seeded tally error is reported as mismatch. | Independent verifier run on test vectors |
| QV-05-REQ-011 | The system shall publish evidence for ballot validity, inclusion, and tally that the verifier checks. | Must | Verifier passes the valid test record and fails each seeded fault (altered ballot, dropped ballot, altered tally). | Fault-injection tests |
| QV-05-REQ-012 | The system shall publish signed log checkpoints that independent monitors can compare. | Should (Must for high-assurance claims) | Consistency proof between two checkpoints verifies; a divergent view is detected in test. | Test; monitor exercise |
| QV-05-REQ-013 | If a threshold protocol is chosen, no trustee or group of trustees below threshold shall decrypt, and decryption output shall contain only the aggregate. | Must (if chosen) | Test shows output holds only the aggregate; sub-threshold attempts fail. | Protocol review; test |
| QV-05-REQ-014 | The system shall never change an accepted ballot or tally without a visible, signed correction event. | Must | A recount produces a new signed record; the prior record stays retrievable and marked superseded. | Integration test; process review |
| QV-05-REQ-015 | When any step fails, the system shall record no partial or unverifiable count and shall show the failure state defined in QV-03. | Must | Fault injection at each lifecycle step leaves no partial count; displayed state matches the QV-03 table. | Fault-injection tests |
| QV-05-REQ-016 | The client shall show the decision's rules and privacy limits before the member can confirm. | Must | Confirm step is unreachable without the rules screen shown (test); text present in every supported language. | UX review; accessibility test (QV-13) |
| QV-05-REQ-017 | The system shall use a reviewed, pinned cryptographic implementation and platform secure randomness; no bespoke primitives. | Must | Dependency manifest shows pinned versions; code review finds no custom primitive; randomness comes from the platform CSPRNG. | Code review; dependency check |
| QV-05-REQ-018 | The system shall publish interoperable test vectors and a standalone verifier before any pilot. | Must | An independent implementation passes all vectors. | Test |
| QV-05-REQ-019 | The system shall not state ballot secrecy or full verifiability in user-facing text until independent protocol review and implementation audit are on file. | Must | Release check finds no such claim without a linked review record. | Review (QV-11) |

### 4.1 Guarantees to define separately

For each guarantee, specify the adversary, assumptions, and evidence:

- Ballot secrecy from other members
- Ballot secrecy from organizers and platform operators
- Eligibility enforcement
- Duplicate-vote prevention
- Cast-as-intended, recorded-as-cast, and tallied-as-recorded verification
- Tally correctness and reproducibility
- Integrity under server or administrator compromise
- Coercion resistance and vote buying (likely unsupported unless proven)
- Availability and graceful failure
- Revoting or ballot replacement behavior

Avoid using “anonymous” as a blanket guarantee. State what is protected from whom and under which assumptions.

| Guarantee | Adversary | Assumptions | Evidence required before any claim |
|---|---|---|---|
| Secrecy from members | Curious or colluding members | Client not compromised; encryption scheme reviewed | Protocol review; secrecy tests; expert review |
| Secrecy from organizers and operators | Organizer; operator with full storage access | No service key can decrypt; trustee threshold not met by operator (OD-05-2) | Key-separation review; architecture review |
| Eligibility enforcement | Ineligible participant | Frozen roster committed under QV-04 | Negative tests (REQ-006) |
| Duplicate-vote prevention | Member submitting twice | Decision-scoped one-use credential or nullifier (QV-16 section 3) | Duplicate-submission tests (REQ-005) |
| Cast, record, and tally verification | Operator altering record; client showing wrong ballot | Independent verifier; checkpoints witnessed | Fault-injection tests (REQ-011, REQ-012) |
| Tally correctness | Operator or trustees producing false tally | Honest trustee threshold | Verifier recomputes tally (REQ-010) |
| Integrity under compromise | Compromised operator or admin | Signed manifest; witnessed checkpoints | Tamper tests; checkpoint monitors |
| Coercion resistance, vote buying | Coercer, buyer | None claimed | Not claimed; limits stated to users |
| Availability and graceful failure | Attacker causing outage | Not guaranteed | Load tests; fail-closed tests (REQ-015) |
| Revoting or replacement | Member under pressure | Rule set by QV-03 | One test per policy option |

### 4.2 Voting methods to evaluate

- Single-choice / yes-no
- Multiple selection
- Approval voting
- Ranked-choice
- Weighted voting
- Delegation or proxy voting
- Quorum and supermajority rules

For each method, define encoding, invalid-ballot handling, tally algorithm, tie behavior, audit procedure, and known limitations. Select the MVP methods explicitly.

| Method | Encoding | Invalid ballot | Tally | Tie | Audit and limits | MVP |
|---|---|---|---|---|---|---|
| Single-choice / yes-no | One selection from options (yes/no = two options) | Zero or more than one selection rejected | Count per option | Recorded as tie; outcome per QV-03 (OD-05-8) | Aggregate check; small-group counts may reveal choices (OD-05-9) | Proposed: yes |
| Approval | Yes/no per option | Outside documented limits rejected | Count per option | As above | As above | Proposed: yes |
| Multiple selection | Yes/no per option with min/max | Outside min/max rejected | Count per option | As above | As above | Proposed: yes, as approval variant |
| Ranked-choice | Ordered ranks | Duplicate or missing ranks per rule | Elimination rounds; not additive | Rule required | Needs a different or extended protocol (QV-16 section 4) | No |
| Weighted voting | Weight from eligibility data | Weight out of range | Weighted sum | As above | Weights may reveal membership tiers; privacy review needed | No; evaluate later |
| Delegation / proxy | Delegation record | Invalid or revoked delegation | Per QV-19 | Per QV-19 | Governed by QV-19 | No |
| Quorum / supermajority | Not an encoding; counts only | Not applicable | Participation count and threshold check | Per QV-03 | Thresholds set by QV-03 | Counts only |

### 4.3 Protocol lifecycle

Specify ballot definition/versioning, eligibility setup, open/close events, ballot submission, receipt behavior, tally computation, result publication, verification, challenge/recount, and archive. Identify which artifacts are public, group-visible, participant-only, or secret.

| Artifact | Visibility (proposed) |
|---|---|
| Signed ballot manifest and its hash | Public; hash published before opening |
| Eligibility commitment (roster root) | Group-visible; roster itself not published (QV-16 section 9) |
| Encrypted ballot records | Group-visible; no member ID attached; public only if OD-05-3 chooses it |
| Member receipt | Participant-only |
| Individual plaintext choice | Held only by the member's client until submission; not stored by any service |
| Aggregate tally and proofs | Public |
| Trustee key shares | Trustee only |
| Signed log checkpoints | Public |

## 5. Data and privacy

- Data inputs: manifest; eligibility proof and decision-scoped nullifier; encrypted ballot with validity proof; trustee shares and proofs.
- Data outputs: receipt; ballot record; tally and evidence; verifier report.
- Data controller/operator: proposed: the group is controller for decision data; the hosted operator is processor. To be confirmed in QV-06.
- Retention and deletion: set in QV-06. Published records cannot be fully deleted once released (QV-16 section 6).
- Linkability risks: submission timing against login; nullifier scoping across decisions; small-group counts; receipts shown to others; metadata seen by operators or network observers.
- Visibility by member, organizer, operator, and observer: members see own receipt and the record; organizers see manifest, roster commitment, and tally; operators see ciphertext and metadata only; observers see evidence the group allows.
- Privacy properties claimed: none yet. Proposed claim, pending REQ-007 and review: the service and operators cannot read individual choices.
- Privacy properties explicitly not claimed: anonymity; untraceability; protection from a compromised device; coercion resistance; protection of timing metadata.

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Changing rules or eligibility after a ballot opens | Compromised or coercive organizer | Unfair or invalid result | Frozen signed manifest (REQ-001); roster commitment at open | Compromised organizer signing key |
| Impersonating a member or recovering their account | Impostor, phisher | Ballot cast in another member's name | Recovery never alters cast ballots (QV-04); duplicate control (REQ-005) | Social engineering of recovery |
| Linking a ballot to a member through timing or metadata | Operator, network observer | Choice revealed | No joinable data (REQ-008); public record after close (OD-05-12) | Timing correlation not removed |
| Suppressing or selectively delaying votes | Operator, network attacker | Biased or lower participation | Receipts; inclusion checks; witnessed checkpoints (REQ-009, REQ-012) | Drop before receipt cannot be proven |
| Publishing a false or incomplete tally | Operator; trustees colluding | False result | Verifier recomputes tally (REQ-010); threshold decryption (REQ-013) | Collusion at or above threshold |
| Re-identifying a person from a small group or rare choice | Members, observers | Choice inferred | Small-group suppression (OD-05-9) | Residual in very small groups |
| Replaying a ballot across decisions | Attacker | Cross-decision forgery or linkage | Domain separation (REQ-002) | Depends on correct encoding |
| Malformed ballot exploiting a parser | Attacker | Crash or invalid tally | Strict schema; fuzzing (QV-07 REQ-010) | Implementation defects |

## 7. Interfaces and dependencies

- Upstream dependencies: QV-03 (rules, lifecycle, failure states); QV-04 (roster, eligibility proofs); QV-07 (threat model); QV-16 (candidate design).
- Downstream consumers: QV-06 (retention, visibility); QV-08 (architecture); QV-09 (ballot, manifest, receipt, and tally schemas); QV-10 (ballot UX); QV-11 (test gates).
- API/event/schema contracts: manifest, encrypted ballot, validity proof, receipt, checkpoint, and tally evidence formats. Not yet specified; required in QV-09.
- Versioning and compatibility: protocol version in every manifest and ballot. Incompatible changes need a new version and a decision log entry.
- Failure and retry behavior: submission is idempotent per eligibility proof and decision. Submissions after close are rejected. Trustee failure holds the tally (section 3).

### Threat-model dependencies

Protocol selection must follow decisions in QV-03, QV-04, and QV-07. Include a cryptographic review plan and reference primary protocol literature before implementation. Record algorithm and library choices in an ADR; do not invent cryptography.

## 8. UX, accessibility, and localization

- Key screens or interactions: rules review; selection; review and confirm; receipt; verification page; failure status.
- Plain-language explanations: each screen states what is private, from whom, and what is not protected.
- Keyboard/screen-reader requirements: all steps keyboard-operable; confirmation and failure states announced; no meaning by color alone (QV-13).
- Low-bandwidth and device constraints: proof generation and verification must run on the target device classes; limits set after prototype testing (QV-13).
- Localization requirements: rules and privacy notice translated before a decision opens in that language. Group-authored option text is not translated by the system.

## 9. Operations

- Configuration: protocol version, trustee set, open/close conditions. Immutable after opening.
- Monitoring and audit: service health only; no logs that join identity with ballots.
- Backup, recovery, and deletion: encrypted ballots backed up under QV-06 rules; published evidence is not deleted.
- Incident response: per QV-07 REQ-012; pause or invalidation authority set in QV-03.
- Support and escalation: support staff have no ballot access.

## 10. Testing and verification

- Unit tests: encoding, validity checks, manifest hashing, nullifier logic.
- Integration tests: client-to-service submission; idempotent retries; duplicate attempts; trustee failure.
- End-to-end tests: full dummy decision with independent verifier; receipt lookup (QV-16 section 8 stages 1–2 onward).
- Security/privacy tests: fault injection; plaintext storage scans; join detection; fuzzing of parsers.
- Independent review or audit: cryptographic protocol review and implementation audit before high-assurance claims (QV-05-REQ-019).
- Release-blocking criteria: REQ-001, 005, 007, 008, 010, 011, 015 pass for any pilot; REQ-018 and REQ-019 for any claim beyond pilot.

## 11. Constraints and assumptions

- Constraint: no token or blockchain requirement (QV-16 section 1).
- Constraint: no bespoke cryptography (QV-16 section 7).
- Assumption requiring validation: a group roster can be frozen at opening (QV-04).
- Assumption requiring validation: trusted-organizer model is acceptable for the first release (OD-05-1).
- Assumption requiring validation: target devices can run proof generation within acceptable time [UNVERIFIED].

## 12. Open questions

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| Is a trusted organizer acceptable for the first release? | Project owner | Before QV-05 approval | Pending; proposal OD-05-1 |
| Must the server be unable to decrypt individual ballots? | Project owner; protocol reviewer | Before QV-05 approval | Pending; proposal OD-05-2 |
| Is public verifiability required, or is group-only verification enough? | Project owner | Before QV-05 approval | Pending; proposal OD-05-3 |
| How can a member confirm inclusion without revealing their choice? | Protocol reviewer; UX | Before pilot | Pending; proposal OD-05-4 |
| What is the acceptable complexity for members and observers? | Project owner; UX | Usability prototype (QV-16 section 8) | Pending; proposal OD-05-5 |
| What failure should stop the ballot versus allow a documented fallback? | Project owner | Before QV-05 approval | Pending; proposal OD-05-6 |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## Open decisions

| ID | Question | Options | Proposed (recommendation) and alternatives | Owner |
|---|---|---|---|---|
| OD-05-1 | Is a trusted organizer acceptable for the first release? | (a) Organizer trusted for rules and roster only; (b) organizer also trusted with ballots | Proposed: (a). No ballot access by design. Alternative (b) only if stated as a limit in user notices. | Project owner |
| OD-05-2 | Must the ballot service be unable to decrypt individual ballots? | (a) Yes, via threshold trustees; (b) service-held key | Proposed: (a). Alternative (b) only for a labeled prototype, never for a real decision. | Project owner; protocol reviewer |
| OD-05-3 | Public verifiability or group-only verification? | (a) Public record of encrypted ballots and evidence; (b) group-only record | Proposed: (b), with public release per decision as an opt-in, because public records are permanent (QV-16 section 6). Alternative: (a) for public decisions. | Project owner |
| OD-05-4 | How does a member confirm inclusion without revealing their choice? | (a) Receipt checked against record; (b) group-only verifier lookup; (c) no individual check | Proposed: (a), with a stated limit that a receipt can be shown to a coercer. Expert review of receipt design required. Alternative: (b). | Protocol reviewer; UX |
| OD-05-5 | What complexity is acceptable for members and observers? | (a) Members get receipt plus plain check; observers get full verifier; (b) one flow for both | Proposed: (a). Validate in usability prototype. | Project owner; UX |
| OD-05-6 | Stop or fallback when a step fails during an open ballot? | (a) Stop and resume only as QV-03 defines; (b) alternative channel | Proposed: (a). No alternative channel in MVP. Any fallback is a signed event and a decision log entry. | Project owner |
| OD-05-7 | Which methods are MVP? | (a) Single-choice/yes-no; (b) plus approval; (c) plus multiple selection; (d) plus ranked-choice | Proposed: (a), (b), and (c) as an approval variant. Exclude (d) (QV-16 section 4). | Project owner |
| OD-05-8 | Default tie behavior | (a) Record tie, outcome per QV-03; (b) automatic re-vote; (c) chair decides | Proposed: (a). Alternative (b) if QV-03 allows. Not (c): it adds an unlisted actor. | Project owner with QV-03 owner |
| OD-05-9 | Publication of small-group counts | (a) Publish all counts; (b) suppress counts that could reveal one member's choice | Proposed: (b), rule set in QV-03; threshold set after QV-06 review. | Project owner; QV-06 owner |
| OD-05-10 | Trustee model | (a) No trustees (service key); (b) threshold guardians | Proposed: (b). Threshold and guardian count set only after protocol review; guardians independent of each other and the organizer. | Project owner; protocol reviewer |
| OD-05-11 | Which protocol family for the first pilot? | (a) Belenios-style; (b) ElectionGuard-style; (c) custom composition of reviewed primitives | Proposed: evaluate (a) and (b) against QV-16 criteria; no selection before expert review. Not (c). | Project owner; protocol reviewer |
| OD-05-12 | Timing correlation in the public record | (a) Publish each ballot on receipt; (b) publish after close, unordered | Proposed: (b). Login and submission times stay out of the public record. Residual risk recorded in QV-07. | Project owner; QV-07 owner |
