# QV-17 — Portable Privacy-Preserving Membership Credentials

**Module ID:** `identity-eligibility`  
**Status:** Proposed draft; protocol and issuer model are not approved  
**Related specs:** QV-03, QV-04, QV-05, QV-06, QV-07, QV-16

## 1. Objective

Define an optional way for a member to prove eligibility for a group decision without presenting a legal name or stable public account identifier alongside their ballot. Credentials should support group-defined rules while minimizing unnecessary disclosure.

A credential does not establish that a group's membership policy is fair, its roster is complete, or a participant is free from coercion.

### 1.1 Assumptions (to validate)

- A1: Group membership rules are frozen before a decision opens (QV-03, still Framework).
- A2: A registrar can confirm membership by a method not yet selected (OD-06).
- A3: A reviewed proof implementation with public test vectors exists for the chosen scheme. [UNVERIFIED: not surveyed.]
- A4: The member's device is not compromised while the secret is used. Design assumption only; QV-16 §6 lists this as residual risk.
- A5: Ballot choice secrecy comes from QV-05 and QV-16, not this module.

## 2. Scope, actors, and non-goals

**In scope:** optional eligibility proof for a group decision under a group-selected mode; issuance, decision-scoped nullifiers, revocation, and recovery; notices about who can observe identity, ballot, and metadata.

**Out of scope:** ballot encryption, tally, and ballot validity (QV-05, QV-16); roster governance and identity verification (QV-03, QV-04); federation and delegation (QV-18, QV-19), except OD-07; public governmental or legally binding shareholder elections.

**Non-goals:** anonymity, untraceability, or coercion resistance as a general claim; a global or cross-group member identifier; any requirement for a token, blockchain, or smart contract (QV-16 §1).

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Member | Submit one accepted ballot without publishing a name or account ID | Enrolled; holds secret; notice shown | Accepted record with nullifier; no direct identifier |
| Group administrator | Set rules, freeze snapshot, choose mode | Policy approved (QV-03) | Signed decision manifest |
| Registrar | Confirm membership; register commitments | Authority from group policy (OD-03) | Versioned eligible set |
| Eligibility service operator | Run issuance and snapshot publication | Role not defined (OD-14) | Commitments published; no ballot choices received |
| Ballot verifier | Check proof, scope, nullifier, snapshot | Frozen snapshot and manifest | Accept, or reject with fixed reason code |
| Observer | Check record consistency | Public record | Verification result |

## 3. Participation modes

Evaluate three modes, which may be offered as group policy choices:

1. **Named:** identity is visible as defined by group policy.
2. **Pseudonymous:** group administrators may know member identity, but members use a persistent group-local alias.
3. **Proof-based eligibility:** the member proves membership to the ballot verifier without a legal name or stable account ID in the ballot record.

Before enrollment and each ballot, explain which mode is active, what the group administrator and service operator can observe, what metadata may be retained, and remaining privacy limits. Do not describe a mode as anonymous without naming the adversary and evidence.

| Mode | Administrator / registrar sees | Verifier / public record sees | Explicitly not claimed |
|---|---|---|---|
| Named | Identity, per group policy | Identity with ballot, per policy | Ballot secrecy beyond QV-05 |
| Pseudonymous | Member's real identity | Group-local alias | Anonymity from administrators; alias unlinkable across decisions |
| Proof-based | Identity at enrollment (OD-06) | Proof, nullifier, encrypted ballot | Anonymity from registrar, operator, or network observers; coercion resistance |

## 4. Candidate credential flow and trust boundaries

The following is a design to evaluate, not an adopted protocol:

1. A member generates and retains a secret.
2. An authorized group registrar confirms membership and registers a corresponding commitment in a versioned eligible set.
3. The group publishes a commitment to the frozen eligibility snapshot, such as a Merkle root, without publishing the roster.
4. For a specific ballot, the holder proves in zero knowledge that their commitment belongs to the eligible set.
5. The proof includes a ballot-scoped nullifier. The verifier rejects a second accepted submission with the same nullifier for that ballot.
6. The member submits the proof and encrypted ballot. Public records contain no legal name or stable account ID.

Semaphore documents a membership-proof and scope-specific-nullifier pattern. It is useful to study, not a complete voting protocol and not a requirement to use a blockchain. Evaluate anonymous credentials, W3C BBS selective-disclosure credentials, and blind-signature credentials as alternatives. Credential formats do not automatically provide ballot uniqueness, revocation, or a secure voting system.

| Boundary | Trusted for | Not trusted for (residual) |
|---|---|---|
| Member device | Holding the secret; producing proofs | Malware, compromise, screen observation |
| Registrar | Deciding membership; one commitment per member | Duplicates or unfair roster; cryptography cannot detect this |
| Eligibility service | Publishing commitments and snapshot | Learning choices (must not); timing correlation |
| Ballot service | Atomic proof and nullifier check | Anonymity; sees submission metadata |
| Trustees (QV-16 §4) | Threshold decryption of aggregate | Collusion at or above threshold |
| Public record / verifier | Checking proofs, scope, snapshot | Fairness of roster; that a device showed the intended ballot |

## 5. Requirements

All requirements are normative. Privacy claims and non-claims are in §6.5.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-17-REQ-001 | The system shall disclose the participation mode and privacy consequences before enrollment and before each ballot. | Must | Usability testing confirms participants can identify who sees their identity, ballot, and metadata. | Usability test (QV-13); copy review |
| QV-17-REQ-002 | The system shall verify eligibility against the decision's approved snapshot. | Must | Proofs for members outside the snapshot fail; valid proofs pass against matching public parameters. | Test vectors; independent review |
| QV-17-REQ-003 | The system shall reject a second accepted proof with the same decision-scoped nullifier (scope per OD-08). | Must | Replay and concurrent submissions cannot increase the accepted count twice. | Concurrency and replay tests |
| QV-17-REQ-004 | In proof-based mode, the system shall keep legal name and stable account ID out of public ballot records. | Must | Exported records contain no direct member identifier or undocumented join key. | Export scan; schema review (QV-09) |
| QV-17-REQ-005 | The system shall prevent default cross-decision linking by protocol-visible identifiers. | Must | Independent review confirms unlinkability within the selected protocol's assumptions; nullifiers for one credential differ across decisions. | Expert review (OD-01); scope tests |
| QV-17-REQ-006 | The system shall bind each proof to group, decision, ballot, rule version, and eligibility snapshot. | Must | Cross-group, cross-ballot, or stale-snapshot substitution is rejected. | Negative tests |
| QV-17-REQ-007 | The system shall define issuance, expiry, revocation, and recovery procedures, and recovery shall not silently create double participation. | Must | A recovered or replaced credential cannot yield a second accepted ballot in the same decision. | Lifecycle tests; QV-12 review |
| QV-17-REQ-008 | The system shall publish a notice covering registrar/verifier collusion and timing, network, service-log, and small-group risks. | Must | Notice covers each category in §6.5 and §7. | Privacy review; usability test |
| QV-17-REQ-009 | The system shall not publish the eligibility roster, any credential secret, or any identity-to-ballot mapping. | Must | Export and public-record scans find none; snapshot publishes only the commitment. | Automated export test |
| QV-17-REQ-010 | The system shall fix participation mode, rule version, and snapshot in the signed manifest before voting opens. | Must | Changing any of these after opening fails verification; changes follow QV-03 amend/cancel/restart. | Manifest verification test |
| QV-17-REQ-011 | The system shall generate credential secrets on the member's device with a cryptographically secure random source and never transmit them. | Must | Network capture and server logs contain no secret material. | Security test; code review |
| QV-17-REQ-012 | The system shall return rejection reasons only from a fixed set of codes that do not identify other members' roster entries, commitments, or nullifiers. | Should | Response inspection shows no field beyond the fixed codes. | API contract test (QV-09) |
| QV-17-REQ-013 | The system shall record issuance, revocation, and recovery events with actor and manifest version, and shall not store a join key to ballot records. | Must | Audit export contains the events; join test finds no shared identifier with ballots. | Schema review; join test |
| QV-17-REQ-014 | The system shall version all proof, commitment, and nullifier formats and reject unknown versions. | Must | Unknown versions are rejected; test vectors published per version. | Test vectors (QV-11) |
| QV-17-REQ-015 | The system shall not transfer a credential to another group without the member's recorded acceptance of issuer, credential semantics, and privacy model. | Must | Transfer without recorded acceptance fails. | Integration test (conditional on OD-07) |

## 6. Credential lifecycle, data, and privacy

### 6.1 Enrollment and issuance
Define how membership is verified, how secrets are created, what the issuer signs or commits, and what issuance records are retained. Cryptography cannot stop a dishonest registrar from issuing multiple credentials or choosing an unfair roster. Issuance must be idempotent so a retry creates no second commitment. Method: OD-06; roles: OD-03.

### 6.2 Renewal and eligibility changes
Specify validity periods, role changes, group transfers, and whether eligibility is frozen at ballot opening or evaluated at submission. A decision must reference one exact eligibility version. Post-open changes follow a visible amend/cancel/restart policy. Freeze point: OD-09.

### 6.3 Revocation
Compare freezing eligibility for each ballot, epoch-based credentials, and reviewed non-revocation proofs. Revocation lists may reveal or link members; document what the issuer and verifier learn, when changes take effect, and whether old participation can be linked. If safe mid-ballot revocation is not possible, specify a cancel/restart process. Method: OD-10.

### 6.4 Recovery
The member should control the credential secret. Specify identity checks, lost-device handling, revocation and replacement, whether a replacement can vote in an open decision, and risks of cloud backups or guardian-assisted recovery. Explain what a recovery agent can learn. Model: OD-11; storage: OD-13.

### 6.5 Data and privacy

- **Data inputs:** roster and membership evidence (registrar); credential secret (device); commitment; proof; nullifier; encrypted ballot (QV-05); issuance and recovery events; network and timing metadata.
- **Data outputs:** snapshot commitment; accepted proof, nullifier, and ciphertext; audit events; verifier results.
- **Controller/operator:** not decided (OD-14).
- **Retention and deletion:** not set (OD-14). Commitments, nullifiers, and events may be needed for audit. Public records are intended to be permanent.
- **Linkability risks:** stable commitments combined with registration and ballot timing (§4); nullifier reuse if scope is wrong (OD-08); revocation or recovery events referencing credentials (OD-10, OD-11); snapshot size and small-group counts (OD-05); network, login, and device signals at ballot time.

| Data | Member | Organizer / registrar | Service operator | Public observer |
|---|---|---|---|---|
| Legal identity | Own | Yes, at enrollment (OD-06) | Not intended | No (proof-based) |
| Credential secret | Yes | No | No | No |
| Commitment | Own | Yes | Yes | No (root only) |
| Nullifier | Own | No | Yes | Yes |
| Encrypted ballot | Own | No (QV-05) | Yes (ciphertext) | Yes (ciphertext) |
| Submission timing / network | Own | No | Yes | Not intended (QV-06) |

| Property | Claimed, under conditions | Explicitly not claimed |
|---|---|---|
| P-1 No direct identifier in public ballot record | Records contain no legal name or stable account ID (REQ-004, proof-based mode) | Hidden from registrar, operator, or network observers; protection in small groups |
| P-2 Repeat-ballot detection within a decision | Second accepted ballot in one decision is rejected (REQ-003, correct scope) | Anonymity; any statement about other decisions |
| P-3 Eligibility without roster disclosure | Membership in committed set shown; roster not published (REQ-009) | Roster fairness or completeness; absence of duplicate issuance |
| P-4 Ballot choice secrecy | Only as QV-05 and QV-16 define under their threat model | Any property of the credential alone; coercion resistance |
| P-5 Cross-decision unlinkability | Not claimed by default; candidate only if OD-01 review and tests confirm | Unlinkability against network, timing, device, issuer, or log observers |

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
| Registrar issues multiple credentials or changes roster unfairly | Registrar or insider | Duplicate participation or unfair eligibility | Publish policy and snapshot commitment; challenge process (OD-03, OD-04) | Cryptography cannot detect a dishonest registrar; collusion defeats uniqueness |
| Issuer and ballot service correlate timing | Operator with both logs | Identity-to-participation inference | Minimize joined logs; role separation (OD-12) | Timing correlation remains |
| Nullifier stable across decisions | Wrong scoping or deterministic derivation | Cross-ballot linking | Scope tests; reject global nullifiers (REQ-003, REQ-005) | Depends on OD-01 and OD-08 |
| Credential theft or shared device | Malware, device sharer, phishing | Impersonation or disclosure | Secure storage (OD-13); revocation; recovery; notices | Unlocked compromised device defeats the control |
| Public revocation leaks membership | Public observer | Identity or status exposure | Review scheme before release (OD-10) | Status change may be visible |
| Small-group tally reveals choices | Observer or participants | Inference despite encryption | Publication rules (OD-05); inference notice | Small groups remain inferable |
| Coercion or observed voting | Coercer | Choice disclosure outside protocol | No coercion-resistance claim (§8) | Not mitigated here |
| Broken proof parameters or library | Implementation or supply-chain error | Forged eligibility or invalid proofs | Reviewed libraries; test vectors; review (OD-01) | Flaws undetected until review |
| Replay or substitution of a valid proof | Holder of a captured proof | Unauthorized or double participation | Bind public inputs (REQ-006) | Depends on correct binding |
| Recovery abuse | Social engineering | Takeover; possible second credential | Identity checks; replacement rule (OD-11); admin notice | Weak checks defeat recovery |
| Denial of service on registrar, eligibility, or ballot service | Attacker | Members cannot enroll or vote | Availability design (QV-12); no silent fallback | Availability not assured |
| Stale snapshot used after roster change | Operator or admin error | Ineligible participation | Snapshot bound per decision (REQ-006) | Snapshot itself may be unfair |

## 8. Claim ledger

| Candidate statement | Required conditions | Limitation |
|---|---|---|
| “This proof establishes eligibility without including your name.” | Correct proof implementation and group-approved eligibility snapshot | Registrar still decides who is eligible; metadata may reveal participation |
| “This credential can vote once per decision.” | Correct scope, atomic uniqueness checking, and no duplicate credential issuance | A dishonest issuer or collusion can defeat this |
| “Activity is unlinkable across decisions.” | Unlinkable proof scheme, distinct scopes, no stable identifiers, and limited metadata correlation | Network timing, device signals, issuer behavior, and logs may link activity |
| “Your ballot choice is secret.” | Separate QV-05 ballot encryption and tally protocol meet the defined threat model | A credential alone does not hide a choice or prevent coercion |
| “Recovery does not add a second vote.” | REQ-007 tests pass; replacement rule (OD-11) decided | Recovery identity checks may be exploited; not yet shown |

## 9. Release gates and open questions

Before approval, select the exact proof and credential protocol, issuer model, scope, revocation method, and recovery model. Publish test vectors for issuance, proof generation/verification, nullifier uniqueness, revocation, and failures. Review issuer-verifier correlation and all user-facing claims independently.

Open questions: Which protocol has sufficiently mature implementations? Is proof-based eligibility required in the MVP or should the MVP use pseudonymous accounts? Who operates the registrar? Can members challenge a roster? What minimum group size limits inference? Can members enroll without giving the host a persistent email address? Is any cross-group credential format needed?

Each question is recorded as a decision in §15: maturity → OD-01; MVP mode → OD-02; registrar → OD-03; roster challenge → OD-04; group size → OD-05; persistent email → OD-06; cross-group format → OD-07. None is answered in this document.

## 10. Journeys and failure behavior

- **Enrollment:** The member sees the mode and notice, is verified (OD-06), and generates a secret on the device. Failed check: no commitment is registered and the member sees a reason category. Lost device before snapshot freeze: re-enrollment under §6.4. Retried request: idempotent; no second commitment.
- **Voting:** The device generates the proof and encrypted ballot; the member submits. If proof generation fails, nothing is submitted. If the response is lost, the client resubmits the same proof and never derives a new nullifier. A status check shows whether this decision was accepted without revealing the choice; its privacy effect is part of OD-12. A second submission with the same nullifier is rejected and the first record is unchanged (REQ-003). Snapshot or rule-version mismatch is rejected with a fixed code (REQ-006, REQ-012). If the verifier is unavailable, nothing is accepted; any queueing window is undefined.
- **Revocation or recovery during an open decision:** Governed by OD-09 to OD-11. Default: a later revocation or recovery does not alter a submitted ballot or tally (QV-04, "Recovery and changes"). If mid-ballot revocation is unsafe, the §6.3 cancel/restart policy applies.
- **Verification failure:** If the independent verifier rejects the record, the decision is flagged, the result is not presented as verified, and the QV-03 challenge process applies.
- **UX and accessibility:** Key screens are mode selection, enrollment, pre-vote notice, proof status, and recovery. Notices state who sees the member's name, ballot, and metadata, what remains unknown, and what happens on device loss. Keyboard and screen-reader support for every step (QV-13 to confirm); no status by color alone. Proof time and memory budgets are not set (OD-15). Translations must keep every privacy claim and non-claim intact.

## 11. Dependencies, interfaces, and operations

- **Upstream:** QV-03 (rules, amend/cancel); QV-04 (membership, recovery); QV-06 (retention); QV-07 (threat model); QV-16 (protocol candidates, trustees).
- **Downstream:** QV-05 (acceptance checks proof and nullifier); QV-09 (contracts); QV-10 (notice and recovery flows); QV-11 (test vectors); QV-12 (issuer operations); QV-18 and QV-19 (transfer, export).
- **Interface contracts (to specify in QV-09; no format selected):** registration request and commitment; snapshot commitment; proof public inputs (group, decision, ballot, rule version, snapshot); nullifier; rejection codes; revocation status; recovery events.
- **Versioning and failure:** every artifact carries a protocol version; unknown versions are rejected (REQ-014). Encodings and domain separation follow QV-16 §7. Issuance and submission are idempotent (REQ-012).
- **Configuration:** mode, snapshot policy, registrar identity, and revocation policy are per-decision settings in the manifest.
- **Monitoring and audit:** service health only. No logs joining login, IP address, timestamp, and ballot submission (QV-16 §5). Audit events per REQ-013.
- **Backup, recovery, deletion:** backups hold commitments and events; deletion from backups is OD-14. Recovery exercises per QV-16 §8.
- **Incident response:** a suspected duplicate acceptance freezes result publication for that decision and triggers independent re-verification. Procedure to be defined in QV-12.
- **Support:** lost-credential requests go only to the recovery process (OD-11). Support staff hold no secrets.

## 12. Verification

- **Unit:** proof pass and fail cases; nullifier derivation per decision; version parsing.
- **Integration:** snapshot match and mismatch; atomic nullifier check under concurrency; idempotent issuance; recovery lifecycle.
- **End-to-end:** enroll, see notice, vote, pass independent verification; duplicate rejected; revoked credential handled per OD-10.
- **Security/privacy:** export scans for identifiers, roster, and secrets (REQ-004, REQ-009, REQ-011, REQ-013); nullifier comparison across decisions; replay and substitution (REQ-006); rejection-code enumeration (REQ-012); timing-join review (OD-12).
- **Independent review:** external cryptography review of protocol and implementation (OD-01); privacy review of notices and claims; participant usability tests (REQ-001). No reviewer is engaged yet.
- **Release-blocking:** any failing Must requirement; OD-01, OD-02, OD-03, OD-08, OD-10, and OD-11 unresolved for any live use; any §8 claim without evidence. Live use limited to voluntary internal pilots (QV-16 stage 4).

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

None is selected. Items marked **expert review** need external cryptography or privacy review before a decision. All are Open.

**OD-01 — Credential and proof protocol** (expert review)
- Candidates: (a) Semaphore-style membership proof with scope nullifier; (b) BBS selective-disclosure credentials; (c) blind-signature credentials; (d) other anonymous-credential schemes [UNVERIFIED: not surveyed].
- Trade-offs: (a) fits decision-scoped nullifiers; examples often assume smart contracts. (b) Unlinkable derived proofs; maturity unchecked. (c) Issuance and nullifier handling need extra design.
- Needed: maturity and license survey; test vectors; external review. Owner: project owner with external cryptography reviewer (to be engaged). Target: before protocol prototype (QV-16 stage 3).

**OD-02 — Participation modes in MVP**
- Candidates: (a) named only; (b) pseudonymous only; (c) proof-based only; (d) all three, selectable per decision.
- Trade-offs: (a) lowest risk, no eligibility privacy. (b) Simpler; administrators know identities. (c) Strongest privacy; needs OD-01 and OD-03; highest cost. (d) Flexible; more notices and mode-confusion risk.
- Needed: QV-02 MVP boundary; usability tests (QV-13). Owner: project owner. Target: QV-02 review.

**OD-03 — Registrar and issuer model** (expert review)
- Candidates: (a) group administrator; (b) hosted service operator; (c) independent third party; (d) multiple registrars with threshold agreement.
- Trade-offs: (a) simplest; administrator sees all. (b) Operator sees roster and timing. (c) Cost and dependency. (d) Less single-party trust; coordination complexity.
- Needed: collusion analysis across issuer, verifier, and operator; QV-03 authority rules. Owner: project owner. Target: before QV-17 leaves Draft.

**OD-04 — Roster challenge process**
- Candidates: (a) none; organizer decides; (b) member checks own commitment only; (c) challenge window under QV-03 dispute policy; (d) confidential independent audit.
- Trade-offs: (a) no recourse. (b) Cannot detect others' omissions. (c) Visible recourse; may reveal roster changes. (d) Adds auditor trust.
- Needed: QV-03 dispute policy; privacy review of challenge data. Owner: project owner with QV-03 owner. Target: QV-03 review.

**OD-05 — Minimum group size and small-group rules** (expert review)
- Candidates: (a) fixed minimum (value not selected); (b) organizer sets minimum above a policy floor; (c) suppress small-group results; (d) publish with inference notice.
- Trade-offs: (a) no basis for a value yet. (b) Misuse risk. (c) Can block results. (d) Leaves inference risk.
- Needed: inference analysis at realistic group sizes. Owner: privacy reviewer (to be engaged) with project owner. Target: before QV-05 tally design is approved.

**OD-06 — Enrollment without persistent email or identifier** (expert review)
- Candidates: (a) in-person or invite-code enrollment, no contact stored; (b) organizer-vouched; (c) one-time verification, contact discarded; (d) persistent contact stored.
- Trade-offs: (a) limits linkage; adds friction. (b) Relies on organizer trust. (c) Discarding must be verified; retained hashes are not pseudonymous. (d) Enables recovery; creates linkage.
- Needed: threat analysis of the enrollment channel. Owner: project owner with privacy reviewer. Target: QV-04 review.

**OD-07 — Cross-group credential format**
- Candidates: (a) none; (b) portable credential with issuer acceptance (REQ-015); (c) shared-ballot credential for federation (QV-18).
- Trade-offs: (a) smallest scope. (b) Issuer trust and semantic mismatch; conflicts with QV-19 "never copy" wording. (c) Needs credential standards and linkage review.
- Needed: QV-18 use case; QV-19 export rule. Owner: project owner. Target: QV-18 review.

**OD-08 — Nullifier scope: decision or ballot** (expert review)
- Candidates: (a) per decision; (b) per ballot within a decision; (c) per group epoch.
- Trade-offs: (a) matches REQ-003, QV-16, QV-19. (b) Matches §4 step 5; needs terms defined. (c) Wider linking across decisions in the epoch. This draft uses both terms.
- Needed: definitions of decision and ballot in QV-03 and QV-05. Owner: project owner with QV-05 owner. Target: QV-05 review.

**OD-09 — Eligibility freeze point**
- Candidates: (a) frozen at ballot opening; (b) evaluated at submission; (c) epoch-based validity.
- Trade-offs: (a) stable; misses changes. (b) Changes during voting; status timing can leak. (c) Renewal load; epoch linkage.
- Needed: QV-03 amend/cancel rules. Owner: project owner. Target: QV-03 review.

**OD-10 — Revocation method** (expert review)
- Candidates: (a) no mid-ballot revocation; cancel/restart; (b) epoch-based credentials; (c) reviewed non-revocation proofs; (d) public revocation list.
- Trade-offs: (a) no status leak. (b) Renewal load; epoch linkage. (c) Complex. (d) Can leak membership (§7).
- Needed: issuer-verifier analysis; external review. Owner: project owner with external cryptography reviewer. Target: before protocol prototype.

**OD-11 — Recovery model** (expert review)
- Candidates: (a) no recovery; re-enroll via registrar; (b) registrar reissues after identity check; (c) member-held encrypted backup; (d) cloud backup; (e) guardian-assisted recovery.
- Trade-offs: (a) safest; costly for members. (b) Double-participation risk. (c) Lost device loses access. (d) Provider access. (e) Guardians learn the identity-to-credential link.
- Needed: decision on replacement in open decisions; QV-04 policy; recovery exercise. Owner: project owner with privacy and security reviewers. Target: QV-04 review.

**OD-12 — Issuer-verifier correlation controls** (expert review)
- Candidates: (a) log role separation; (b) batching or delay; (c) coarse timestamps; (d) accept residual risk with notice.
- Trade-offs: (a) needs operational separation. (b) Hurts usability; does not hide long-term patterns. (c) Weaker audit. (d) Leaves inference risk.
- Needed: timing-inference assessment; operator design (QV-12). Owner: project owner with external reviewer. Target: QV-07 review.

**OD-13 — Credential secret storage and backup** (expert review)
- Candidates: (a) device-only storage; (b) platform-authenticator-backed storage; (c) encrypted cloud backup; (d) passphrase-derived secret.
- Trade-offs: (a) lost device loses credential. (b) Platform dependency. (c) Backup provider can link accounts. (d) Passphrase strength limits.
- Needed: QV-07 threat model; client platform (OD-15). Owner: project owner with security reviewer. Target: QV-07 review.

**OD-14 — Retention, deletion, and legal roles** (expert review)
- Candidates: (a) keep commitments and nullifiers for audit; (b) delete after close, keep audit summary; (c) retention by decision type. Also assign controller and operator roles.
- Trade-offs: audit versus deletion; backup deletion; permanent public records.
- Needed: QV-06 retention periods (none set); legal review of roles. Owner: project owner with legal reviewer (to be engaged). Target: QV-06 review.

**OD-15 — Client and device support for proof generation**
- Candidates: (a) desktop and recent mobile browsers; (b) also native apps; (c) server-assisted proof generation.
- Trade-offs: (a) limits reach. (b) More build and review effort. (c) Exposes secret inputs to the server unless designed otherwise; not recommended without review.
- Needed: performance measurement on target devices [UNVERIFIED: none measured]; QV-13 device constraints. Owner: project owner with UX and accessibility owner. Target: QV-13 review.
