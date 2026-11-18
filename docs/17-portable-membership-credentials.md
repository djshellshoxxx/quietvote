# QV-17 — Portable Privacy-Preserving Membership Credentials

**Module ID:** `identity-eligibility`  
**Status:** Proposed draft; protocol and issuer model are not approved  
**Related specs:** QV-03, QV-04, QV-05, QV-06, QV-07, QV-16

## 1. Objective

Define an optional way for a member to prove eligibility for a group decision without presenting a legal name or stable public account identifier alongside their ballot. Credentials should support group-defined rules while minimizing unnecessary disclosure.

A credential does not establish that a group's membership policy is fair, its roster is complete, or a participant is free from coercion.

### 1.1 Assumptions (to validate)

- A1: Group membership rules are defined and frozen before a decision opens (QV-03, currently Framework).
- A2: A registrar can confirm membership by a method not yet selected (OD-06).
- A3: A reviewed proof and credential implementation with public test vectors exists for the chosen scheme. [UNVERIFIED: no implementation surveyed; see OD-01.]
- A4: The member's device is not compromised while the secret is used. This is a design assumption only; QV-16 §6 lists device compromise as residual risk.
- A5: Ballot choice secrecy comes from QV-05 and QV-16, not from this module.

## 2. Scope, actors, and non-goals

### In scope
- Optional eligibility proof for a group decision, under a group-selected participation mode.
- Credential issuance, decision-scoped nullifiers, revocation, and recovery rules.
- User notices about who can observe identity, ballot, and metadata.

### Out of scope
- Ballot encryption, tally, and ballot validity proofs (QV-05, QV-16).
- Roster governance and identity-verification methods (QV-03, QV-04).
- Cross-group federation and delegation (QV-18, QV-19), except the format question in OD-07.
- Public governmental elections or legally binding shareholder votes (README scope).

### Non-goals
- Anonymity, untraceability, or coercion resistance as a general claim.
- A global member identifier or any cross-group identity.
- A requirement for a token, blockchain, or smart contract (QV-16 §1).

### Actors and journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Member | Prove eligibility and submit one accepted ballot without publishing a name or account ID | Enrolled; holds credential secret; notice shown | Accepted ballot record with nullifier; no direct identifier |
| Group administrator | Set rules, freeze snapshot, select participation mode | Group policy approved (QV-03) | Signed decision manifest with snapshot commitment |
| Registrar | Confirm membership; register commitments | Authority granted by group policy (OD-03) | Versioned eligible set |
| Eligibility service operator | Run issuance and snapshot publication | Operator role and terms not defined (OD-14) | Commitments and snapshot published; no ballot choices received |
| Ballot verifier | Check proof, scope, nullifier, and snapshot | Frozen snapshot and manifest available | Accept, or reject with a fixed reason code |
| Observer / independent verifier | Check record consistency | Public record | Verification result |
| Recovery agent (candidate) | Help a member regain credential access | Only if OD-11 selects it | Replacement credential under defined checks |

## 3. Participation modes

Evaluate three modes, which may be offered as group policy choices:

1. **Named:** identity is visible as defined by group policy.
2. **Pseudonymous:** group administrators may know member identity, but members use a persistent group-local alias.
3. **Proof-based eligibility:** the member proves membership to the ballot verifier without a legal name or stable account ID in the ballot record.

Before enrollment and each ballot, explain which mode is active, what the group administrator and service operator can observe, what metadata may be retained, and remaining privacy limits. Do not describe a mode as anonymous without naming the adversary and evidence.

| Mode | Administrator / registrar can see | Verifier / public record can see | Explicitly not claimed |
|---|---|---|---|
| Named | Identity, as group policy defines | Identity with ballot, as group policy defines | Any ballot secrecy beyond QV-05 |
| Pseudonymous | Member's real identity | Persistent group-local alias | Anonymity from administrators; alias unlinkable across decisions |
| Proof-based | Identity at enrollment (per OD-06) | Proof, nullifier, encrypted ballot; no legal name or stable account ID | Anonymity from registrar, operator, or network observers; coercion resistance |

## 4. Candidate credential flow and trust boundaries

The following is a design to evaluate, not an adopted protocol:

1. A member generates and retains a secret.
2. An authorized group registrar confirms membership and registers a corresponding commitment in a versioned eligible set.
3. The group publishes a commitment to the frozen eligibility snapshot, such as a Merkle root, without publishing the roster.
4. For a specific ballot, the holder proves in zero knowledge that their commitment belongs to the eligible set.
5. The proof includes a ballot-scoped nullifier. The verifier rejects a second accepted submission with the same nullifier for that ballot.
6. The member submits the proof and encrypted ballot. Public records contain no legal name or stable account ID.

Semaphore documents a membership-proof and scope-specific-nullifier pattern. It is useful to study, not a complete voting protocol and not a requirement to use a blockchain. Evaluate anonymous credentials, W3C BBS selective-disclosure credentials, and blind-signature credentials as alternatives. Credential formats do not automatically provide ballot uniqueness, revocation, or a secure voting system.

Trust boundaries:

| Boundary | Trusted for | Not trusted for (residual exposure) |
|---|---|---|
| Member device | Holding the secret; producing the proof | Malware, device compromise, screen observation (QV-16 §6) |
| Registrar | Deciding membership; one commitment per confirmed member | Issuing duplicates or an unfair roster; cryptography cannot detect this |
| Eligibility service | Publishing commitments and snapshot | Learning ballot choices (must not); timing correlation with ballots |
| Ballot service | Verifying proof and nullifier atomically | Not an anonymity guarantee; sees submission metadata |
| Trustees (QV-16 §4) | Threshold decryption of the aggregate | Collusion at or above the threshold |
| Public record / verifier | Checking proofs, scope, snapshot, and consistency | Cannot show the roster is fair or that a device displayed the intended ballot |

## 5. Requirements

All requirements are normative. Privacy claims and explicit non-claims are in §6.5.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-17-REQ-001 | The system shall disclose the participation mode and privacy consequences before enrollment and before each ballot. | Must | Usability testing confirms participants can identify who sees their identity, ballot, and metadata. | Usability test (QV-13); review of notice copy |
| QV-17-REQ-002 | The system shall verify eligibility against the decision's approved snapshot. | Must | Proofs for members outside the snapshot fail; valid proofs pass against matching public parameters. | Unit and integration tests with test vectors; independent review |
| QV-17-REQ-003 | The system shall reject a second accepted proof with the same decision-scoped nullifier (scope granularity per OD-08). | Must | Replay and concurrent submissions cannot increase the accepted count twice. | Concurrency and replay tests; review of uniqueness check |
| QV-17-REQ-004 | In proof-based mode, the system shall keep legal name and stable account ID out of public ballot records. | Must | Exported records contain no direct member identifier or undocumented join key. | Automated export scan; schema review (QV-09) |
| QV-17-REQ-005 | The system shall prevent default cross-decision linking by protocol-visible identifiers. | Must | Independent review confirms unlinkability within the selected protocol's assumptions; tests show nullifiers for one credential differ across decisions. | Expert review (OD-01); scope-binding tests |
| QV-17-REQ-006 | The system shall bind each proof to group, decision, ballot, rule version, and eligibility snapshot. | Must | Cross-group, cross-ballot, or stale-snapshot substitution is rejected. | Negative tests with substituted public inputs |
| QV-17-REQ-007 | The system shall define issuance, expiry, revocation, and recovery procedures, and recovery shall not silently create double participation. | Must | Lifecycle tests show a recovered or replaced credential cannot yield a second accepted ballot in the same decision. | Lifecycle tests; procedure review (QV-12) |
| QV-17-REQ-008 | The system shall publish a notice covering registrar/verifier collusion and timing, network, service-log, and small-group risks. | Must | Notice covers each risk category in §6.5 and §7. | Document review by privacy reviewer; usability test |
| QV-17-REQ-009 | The system shall not publish the eligibility roster, any credential secret, or any identity-to-ballot mapping. | Must | Export and public-record scans find none of these; snapshot publication contains only the commitment. | Automated export test; review |
| QV-17-REQ-010 | The system shall fix the participation mode, rule version, and snapshot in the signed decision manifest before voting opens. | Must | Changing any of these after opening fails verification; changes follow the QV-03 amend/cancel/restart policy. | Manifest verification test |
| QV-17-REQ-011 | The system shall generate credential secrets on the member's device with a cryptographically secure random source and shall not transmit them to any service. | Must | Network capture and server logs contain no secret material; code review confirms the generation path. | Security test; code review |
| QV-17-REQ-012 | The system shall return rejection reasons from a fixed set of codes that do not identify roster entries, commitments, or nullifiers of other members. | Should | Response inspection shows no field beyond the fixed codes. | API contract test (QV-09) |
| QV-17-REQ-013 | The system shall record issuance, revocation, and recovery events with actor and manifest version, and shall not store a join key between these events and ballot records. | Must | Audit export contains the events; a join test finds no shared identifier with ballot records. Timestamp granularity per OD-12. | Schema review; join test |
| QV-17-REQ-014 | The system shall version all proof, commitment, and nullifier formats and reject unknown versions. | Must | Unknown versions are rejected; test vectors are published per version. | Test vectors (QV-11) |
| QV-17-REQ-015 | The system shall not transfer a credential to another group without the member's recorded acceptance of the issuer, credential semantics, and privacy model. | Must | Transfer without recorded acceptance fails; transfer screen shows issuer and semantics. | Integration test; UX review (conditional on OD-07) |

## 6. Credential lifecycle, data, and privacy

### 6.1 Enrollment and issuance
Define how membership is verified, how secrets are created, what the issuer signs or commits, and what issuance records are retained. Cryptography cannot stop a dishonest registrar from issuing multiple credentials or choosing an unfair roster. Issuance requests must be idempotent so a retry does not create a second commitment. Method: OD-06; roles: OD-03.

### 6.2 Renewal and eligibility changes
Specify validity periods, role changes, group transfers, and whether eligibility is frozen at ballot opening or evaluated at submission. A decision must reference one exact eligibility version. Post-open changes follow a visible amend/cancel/restart policy. Freeze point: OD-09.

### 6.3 Revocation
Compare freezing eligibility for each ballot, epoch-based credentials, and reviewed non-revocation proofs. Revocation lists may reveal or link members; document what the issuer and verifier learn, when changes take effect, and whether old participation can be linked. If safe mid-ballot revocation is not possible, specify a cancel/restart process. Method: OD-10.

### 6.4 Recovery
The member should control the credential secret. Specify identity checks, lost-device handling, revocation and replacement, whether a replacement can vote in an open decision, and risks of cloud backups or guardian-assisted recovery. Explain what a recovery agent can learn. Model: OD-11; secret storage: OD-13.

### 6.5 Data and privacy

- **Data inputs:** group roster (registrar), member identity evidence (per OD-06), credential secret (device), registration commitment, proof, nullifier, encrypted ballot (QV-05), issuance and recovery events, network and timing metadata.
- **Data outputs:** snapshot commitment, accepted proof and nullifier, encrypted ballot, audit events, verifier results.
- **Controller/operator:** not decided. Legal role assignment needs review (OD-14).
- **Retention and deletion:** not set. Commitments, nullifiers, and events may be needed for audit; periods and deletion from backups are OD-14. Public records are intended to be permanent.
- **Linkability risks:**
  - A stable commitment in the eligibility service, combined with registration and ballot timing (see §4).
  - Nullifier reuse across decisions if scope is wrong (OD-08).
  - Revocation or recovery events that reference credentials (OD-10, OD-11).
  - Snapshot size, publication timing, and small-group counts (OD-05).
  - Network address, login, and device signals at ballot time.
  - Permanent public records combined with later disclosures.
- **Visibility by member, organizer, operator, and observer:**

| Data | Member | Organizer / registrar | Service operator | Public observer |
|---|---|---|---|---|
| Legal identity | Own | Yes at enrollment (per OD-06) | Not intended | No (proof-based mode) |
| Credential secret | Yes | No | No | No |
| Commitment | Own | Yes | Yes | No (only the root) |
| Roster | Own inclusion check, if OD-04 allows | Yes | Yes | No |
| Nullifier | Own | No | Yes | Yes |
| Encrypted ballot | Own | No (QV-05) | Yes (ciphertext) | Yes (ciphertext) |
| Submission timing / network | Own | No | Yes | Not intended (QV-06) |

- **Privacy properties claimed and explicitly not claimed:**

| Property | Claimed, under stated conditions | Explicitly not claimed |
|---|---|---|
| P-1 No direct identifier in public ballot record | Records contain no legal name or stable account ID, under REQ-004, in proof-based mode | Hidden from registrar, operator, or network observers; no protection from inference in small groups |
| P-2 Repeat-ballot detection within a decision | A second accepted ballot in one decision is rejected, under REQ-003 and correct scope | Anonymity; any statement about other decisions |
| P-3 Eligibility without roster disclosure | Membership in the committed set is shown without publishing the roster (REQ-009) | Roster fairness or completeness; absence of duplicate issuance |
| P-4 Ballot choice secrecy | Only as defined by QV-05 and QV-16 under their threat model | Any property of the credential alone; coercion resistance |
| P-5 Cross-decision unlinkability | Not claimed by default. A candidate only if OD-01 review confirms it and tests pass | Unlinkability against network, timing, device, issuer, or log observers |

### Data rules
- Scope proofs to one group and one decision by default.
- Do not publish a global member identifier across groups.
- Do not use a plain hash of email, username, or legal identity as a pseudonymous identifier.
- Do not publish roster, secret, or identity-to-ballot mapping.
- A stable identifier in an eligibility service can still correlate with later ballot timing; service separation alone does not eliminate this risk.
- Credential transfer to another group requires explicit acceptance of issuer, credential semantics, and privacy model.

## 7. Abuse cases and mitigations

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Registrar issues multiple credentials or changes roster unfairly | Registrar or insider | Duplicate participation or unfair eligibility | Publish policy and snapshot commitment; issuer controls and challenge process (OD-03, OD-04) | Cryptography cannot detect a dishonest registrar; collusion defeats uniqueness |
| Issuer and ballot service correlate timing | Operator with access to both logs | Identity-to-participation inference | Minimize joined logs; role separation; batching/delay assessed (OD-12) | Timing correlation remains; no delay policy selected |
| Nullifier stable across decisions | Wrong scoping or deterministic derivation | Cross-ballot linking | Scope-binding tests; reject global nullifiers (REQ-003, REQ-005) | Depends on OD-01 and OD-08 |
| Credential theft or shared device | Malware, device sharer, phishing | Impersonation or disclosure | Secure storage (OD-13); revocation; recovery; clear notices | Compromise of an unlocked device defeats the control |
| Public revocation leaks membership | Public observer | Identity or status exposure | Review revocation scheme before release (OD-10) | Some status change may be visible; scheme not selected |
| Small-group tally reveals choices | Observer or participants | Inference despite encrypted ballot | Minimum publication rules (OD-05); inference notice | Small groups remain inferable |
| Coercion or observed voting | Coercer | Choice disclosure outside the protocol | No coercion-resistance claim (§8) | Not mitigated by this module |
| Broken proof parameters or library | Implementation or supply-chain error | Forged eligibility or invalid proofs | Reviewed libraries; public test vectors; independent review (OD-01) | Flaws remain undetected until review |
| Replay or substitution of a valid proof | Attacker holding a captured proof | Unauthorized or double participation | Bind public inputs (REQ-006) | Depends on correct binding |
| Recovery abuse | Attacker using social engineering | Takeover; possible second credential | Identity checks and recovery model (OD-11); admin notice of replacement | Weak identity checks defeat recovery; recovery is an attack target |
| Denial of service on registrar, eligibility, or ballot service | Attacker | Members cannot enroll or vote | Availability design (QV-12); no silent fallback | Availability not assured; no targets set |
| Stale snapshot used after roster change | Operator or admin error | Ineligible participation | Snapshot bound per decision (REQ-006) | The snapshot itself may be unfair |
| Recovery creates second credential during open decision | Member error or attacker | Double participation | REQ-007; replacement rule (OD-11) | Depends on recovery model |

## 8. Claim ledger

| Candidate statement | Required conditions | Limitation |
|---|---|---|
| “This proof establishes eligibility without including your name.” | Correct proof implementation and group-approved eligibility snapshot | Registrar still decides who is eligible; metadata may reveal participation |
| “This credential can vote once per decision.” | Correct scope, atomic uniqueness checking, and no duplicate credential issuance | A dishonest issuer or collusion can defeat this |
| “Activity is unlinkable across decisions.” | Unlinkable proof scheme, distinct scopes, no stable identifiers, and limited metadata correlation | Network timing, device signals, issuer behavior, and logs may link activity |
| “Your ballot choice is secret.” | Separate QV-05 ballot encryption and tally protocol meet the defined threat model | A credential alone does not hide a choice or prevent coercion |
| “Recovery does not add a second vote.” | REQ-007 tests pass and the replacement rule (OD-11) is decided | Recovery identity checks may be exploited; not yet shown |

## 9. Release gates and open questions

Before approval, select the exact proof and credential protocol, issuer model, scope, revocation method, and recovery model. Publish test vectors for issuance, proof generation/verification, nullifier uniqueness, revocation, and failures. Review issuer-verifier correlation and all user-facing claims independently.

Open questions: Which protocol has sufficiently mature implementations? Is proof-based eligibility required in the MVP or should the MVP use pseudonymous accounts? Who operates the registrar? Can members challenge a roster? What minimum group size limits inference? Can members enroll without giving the host a persistent email address? Is any cross-group credential format needed?

Each question is recorded as a decision in §15: maturity → OD-01; MVP mode → OD-02; registrar → OD-03; roster challenge → OD-04; group size → OD-05; persistent email → OD-06; cross-group format → OD-07. No question is answered in this document.

## 10. Journeys and failure behavior

### 10.1 Enrollment
- The member sees the mode and notice, is verified by the method in OD-06, and generates a secret on the device.
- Failed identity check: no commitment is registered; the member sees a reason category; no partial record is kept.
- Device lost before snapshot freeze: re-enrollment under §6.4 (OD-11).
- Retried registrar request: issuance is idempotent; no second commitment (REQ-007 test).

### 10.2 Voting
- Notice shown; the device generates the proof and encrypted ballot; the member submits.
- Proof generation fails: nothing is submitted; the member sees an error. [UNVERIFIED: depends on client design.]
- Response lost after submission: the client resubmits the same proof and must not derive a new nullifier. The member needs a status check showing whether this decision was accepted, without revealing the choice. The privacy effect of that check is part of OD-12.
- Second submission with the same nullifier: rejected; the first accepted record is unchanged (REQ-003).
- Snapshot or rule-version mismatch: rejected with a fixed reason code (REQ-006, REQ-012).
- Verifier unavailable: not accepted. Any queueing window is undefined.

### 10.3 Revocation or recovery during an open decision
- Governed by OD-09 to OD-11. Default: a later revocation or recovery does not alter a submitted ballot or tally (QV-04, "Recovery and changes").
- If mid-ballot revocation is unsafe, the cancel/restart policy in §6.3 applies.

### 10.4 Independent verification failure
- The verifier rejects the record: the decision is flagged, the result is not presented as verified, and the QV-03 challenge process applies.

### 10.5 UX and accessibility
- Key screens: mode selection, enrollment, pre-vote notice, proof status, recovery.
- Notices state who sees the member's name, ballot, and metadata, what remains unknown, and what happens on device loss.
- Keyboard and screen-reader support for every step (QV-13 to confirm). No status conveyed by color alone.
- Proof-generation time and memory on target devices: no budget set; measurement required (OD-15).
- Translations must preserve each privacy claim and non-claim; localization follows QV-13.

## 11. Dependencies, interfaces, and operations

- **Upstream:** QV-03 (rules, amend/cancel policy); QV-04 (membership and recovery policy); QV-06 (retention, deletion); QV-07 (threat model); QV-16 (protocol candidates, trustees).
- **Downstream:** QV-05 (ballot acceptance checks proof and nullifier); QV-09 (contracts); QV-10 (notice and recovery flows); QV-11 (test vectors); QV-12 (issuer operations, incidents); QV-18 and QV-19 (cross-group transfer, export).
- **Interface contracts (to specify in QV-09; no format selected):** registration request and commitment; snapshot commitment; proof public inputs (group, decision, ballot, rule version, snapshot); nullifier; rejection codes; revocation status; recovery events.
- **Versioning:** every artifact carries a protocol version; unknown versions are rejected (REQ-014). Encodings and domain separation follow QV-16 §7.
- **Failure and retry:** issuance and submission are idempotent; rejection codes are fixed (REQ-012).
- **Configuration:** participation mode, snapshot policy, registrar identity, and revocation policy are per-decision settings in the manifest.
- **Monitoring and audit:** service health only. No logs joining login, IP address, timestamp, and ballot submission (QV-16 §5). Audit events per REQ-013.
- **Backup, recovery, deletion:** backups hold commitments and events; deletion from backups is OD-14. Recovery exercises per QV-16 §8.
- **Incident response:** a suspected duplicate acceptance freezes result publication for that decision and triggers independent re-verification. Procedure to be defined in QV-12.
- **Support:** lost-credential requests go only to the recovery process (OD-11). Support staff do not hold secrets.

## 12. Verification

- **Unit tests:** proof verification pass and fail cases; nullifier derivation per decision; version parsing.
- **Integration tests:** snapshot match and mismatch; atomic nullifier check under concurrency; idempotent issuance; recovery lifecycle.
- **End-to-end tests:** enroll, see notice, vote, and pass independent verification; duplicate attempt rejected; revoked credential handled per OD-10.
- **Security/privacy tests:** export scans for identifiers, roster, and secrets (REQ-004, REQ-009, REQ-011, REQ-013); nullifier comparison across decisions for one credential; replay and substitution (REQ-006); rejection-code enumeration (REQ-012); timing-join review (OD-12).
- **Independent review:** external cryptography review of protocol and implementation (OD-01); privacy review of notices and claim ledger; participant usability tests (REQ-001). No reviewer is engaged yet. [UNVERIFIED: availability.]
- **Release-blocking criteria:** any failing Must requirement; OD-01, OD-02, OD-03, OD-08, OD-10, and OD-11 unresolved for any live use; any §8 claim without evidence. Live use is limited to voluntary internal pilots (QV-16 stage 4).

## 13. References

- [Semaphore proofs](https://docs.semaphore.pse.dev/guides/proofs) and [protocol overview](https://docs.semaphore.pse.dev/): membership proof and scope-specific nullifier pattern.
- [W3C Data Integrity BBS Cryptosuites](https://www.w3.org/TR/vc-di-bbs/): selective disclosure and unlinkable derived proofs; verify current status and maturity.
- [W3C Verifiable Credential Data Integrity](https://www.w3.org/TR/vc-data-integrity/): credential proof framework.
- [RFC 9474 — RSA Blind Signatures](https://www.rfc-editor.org/rfc/rfc9474.html): a protocol reference, not a complete credential or voting system.

These sources are research inputs, not selected dependencies or proof that QuietVote's complete credential flow is secure.

## 14. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Not reviewed. External cryptography review required for OD-01 before any approval. |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 15. Open decisions

No option below is selected. Items marked **expert review required** need external cryptography or privacy review before a decision. All items are Open.

**OD-01 — Credential and proof protocol.** Expert review required.
- Candidates: (a) Semaphore-style membership proof with scope nullifier (§4); (b) BBS selective-disclosure credentials (§13); (c) blind-signature credentials (§13); (d) other anonymous-credential schemes. [UNVERIFIED: no survey done.]
- Trade-offs: (a) matches decision-scoped nullifiers, but examples often assume smart contracts (QV-16 §3). (b) Unlinkable derived proofs, but standard status and implementation maturity must be checked. (c) Issuance and nullifier handling need extra design; the RFC is a protocol reference only.
- Needed: maturity and license survey; public test vectors; external review.
- Owner: Project owner with external cryptography reviewer (to be engaged). Target: before protocol prototype (QV-16 stage 3).

**OD-02 — Participation modes in MVP.**
- Candidates: (a) named only; (b) pseudonymous only; (c) proof-based only; (d) all three, selectable per decision.
- Trade-offs: (a) lowest build risk, no eligibility privacy. (b) Simpler; administrators know identities. (c) Strongest eligibility privacy; needs OD-01 and OD-03; highest cost. (d) Most flexible; more notices, test surface, and risk of mode confusion.
- Needed: QV-02 MVP boundary; QV-04 mode comparison; usability tests (QV-13).
- Owner: Project owner. Target: QV-02 review.

**OD-03 — Registrar and issuer model.** Expert review required.
- Candidates: (a) group administrator issues; (b) hosted service operator issues; (c) independent third party; (d) multiple registrars with threshold agreement.
- Trade-offs: (a) simplest; administrator sees all. (b) Operator sees roster and timing; collusion risk. (c) Adds cost and dependency. (d) Less single-party trust; adds coordination and key complexity.
- Needed: collusion analysis across issuer, verifier, and operator; QV-03 authority rules.
- Owner: Project owner. Target: before QV-17 leaves Draft.

**OD-04 — Roster challenge process.**
- Candidates: (a) none; organizer decides; (b) member checks own commitment only; (c) challenge window decided under QV-03 dispute policy; (d) confidential independent audit of roster.
- Trade-offs: (a) no disclosure, no recourse. (b) Limited disclosure, cannot detect omissions of others. (c) Visible recourse; may reveal roster changes. (d) Adds auditor trust and confidentiality constraints.
- Needed: QV-03 dispute policy; privacy review of challenge data.
- Owner: Project owner with QV-03 owner. Target: QV-03 review.

**OD-05 — Minimum group size and small-group tally rules.** Expert review required.
- Candidates: (a) fixed minimum (value not selected); (b) organizer sets minimum above a policy floor; (c) suppress small-group results; (d) publish with inference notice only.
- Trade-offs: (a) simple; no basis for a value yet. (b) Flexible; misuse risk. (c) Protects choices; can block results. (d) Transparent; leaves inference risk.
- Needed: inference analysis using realistic group sizes.
- Owner: Privacy reviewer (to be engaged) with project owner. Target: before QV-05 tally design is approved.

**OD-06 — Enrollment without a persistent email or identifier.** Expert review required.
- Candidates: (a) in-person or invite-code enrollment, no contact stored; (b) organizer-vouched enrollment; (c) one-time verification, contact discarded; (d) persistent contact stored.
- Trade-offs: (a) limits contact linkage; adds friction. (b) Relies on organizer trust. (c) Discarding must be verified; retained hashes are not pseudonymous (§6.5). (d) Enables recovery and notices; creates linkage.
- Needed: threat analysis of the enrollment channel.
- Owner: Project owner with privacy reviewer. Target: QV-04 review.

**OD-07 — Cross-group credential format.**
- Candidates: (a) none; group-local credentials only; (b) portable credential with issuer acceptance (REQ-015); (c) shared-ballot credential for federation (QV-18).
- Trade-offs: (a) smallest scope. (b) Adds issuer trust and semantic mismatch. (c) Needs credential standards and extra linkage review. QV-19 says credentials never copy automatically; reconcile with (b).
- Needed: QV-18 use-case selection; QV-19 export rule.
- Owner: Project owner. Target: QV-18 review.

**OD-08 — Nullifier scope: decision or ballot.** Expert review required.
- Candidates: (a) per decision; (b) per ballot within a decision; (c) per group epoch.
- Trade-offs: (a) matches REQ-003, QV-16, and QV-19. (b) Matches §4 step 5 but needs "ballot" and "decision" defined. (c) Fewer identifiers; wider linking across decisions in the epoch. This draft uses both terms; resolve here.
- Needed: definitions of decision and ballot in QV-03 and QV-05.
- Owner: Project owner with QV-05 owner. Target: QV-05 review.

**OD-09 — Eligibility freeze point.**
- Candidates: (a) frozen at ballot opening; (b) evaluated at submission; (c) epoch-based validity.
- Trade-offs: (a) stable; misses changes. (b) Changes during voting; status timing can leak. (c) Renewal and expiry; epoch linkage.
- Needed: QV-03 amend/cancel rules.
- Owner: Project owner. Target: QV-03 review.

**OD-10 — Revocation method.** Expert review required.
- Candidates: (a) no mid-ballot revocation; cancel/restart; (b) epoch-based credentials; (c) reviewed non-revocation proofs; (d) public revocation list.
- Trade-offs: (a) simplest; no status leak. (b) Renewal load; epoch linkage. (c) Complex; needs review. (d) Can leak membership (§7).
- Needed: issuer-verifier analysis; external review.
- Owner: Project owner with external cryptography reviewer. Target: before protocol prototype.

**OD-11 — Recovery model.** Expert review required.
- Candidates: (a) no recovery; re-enroll through registrar; (b) registrar reissues after identity check; (c) member-held encrypted backup; (d) cloud backup; (e) guardian-assisted recovery.
- Trade-offs: (a) safest; costly for members. (b) Depends on registrar checks; double-participation risk. (c) Member-controlled; lost device loses access. (d) Provider access risk. (e) Guardians learn the identity-to-credential link.
- Needed: decision on replacement during open decisions; QV-04 recovery policy; recovery exercise (QV-16 §8).
- Owner: Project owner with privacy and security reviewers. Target: QV-04 review.

**OD-12 — Issuer-verifier correlation controls.** Expert review required.
- Candidates: (a) role separation of logs; (b) batching or delay; (c) coarse timestamps in audit and public records; (d) accept residual risk with notice.
- Trade-offs: (a) fewer joins; needs operational separation. (b) Delay hurts usability and does not hide long-term patterns. (c) Less precise audit. (d) Honest; leaves inference risk.
- Needed: timing-inference assessment; operator separation design (QV-12).
- Owner: Project owner with external reviewer. Target: QV-07 review.

**OD-13 — Credential secret storage and backup.** Expert review required.
- Candidates: (a) device-only secure storage; (b) platform-authenticator-backed storage; (c) encrypted cloud backup; (d) passphrase-derived secret.
- Trade-offs: (a) lost device loses credential. (b) Depends on platform. (c) Backup provider can link accounts. (d) Passphrase strength limits.
- Needed: QV-07 threat model; client platform decision (OD-15).
- Owner: Project owner with security reviewer. Target: QV-07 review.

**OD-14 — Retention, deletion, and legal roles.** Expert review required.
- Candidates: (a) keep commitments and nullifiers for audit; (b) delete after close, keep audit summary; (c) retention by decision type. Also assign controller and operator roles.
- Trade-offs: Audit versus deletion; backup deletion; permanent public records (§6.5).
- Needed: QV-06 retention periods (none set); legal review of roles.
- Owner: Project owner with legal reviewer (to be engaged). Target: QV-06 review.

**OD-15 — Client and device support for proof generation.**
- Candidates: (a) desktop and recent mobile browsers; (b) also native apps; (c) server-assisted proof generation.
- Trade-offs: (a) limits reach. (b) More build and review effort. (c) Exposes secret inputs to the server unless designed otherwise; not recommended without review.
- Needed: performance measurement on target devices [UNVERIFIED: none measured]; QV-13 device constraints.
- Owner: Project owner with UX and accessibility owner. Target: QV-13 review.
