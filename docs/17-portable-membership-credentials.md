# QV-17 — Portable Privacy-Preserving Membership Credentials

**Module ID:** `identity-eligibility`  
**Status:** Proposed draft; protocol and issuer model are not approved  
**Related specs:** QV-03, QV-04, QV-05, QV-06, QV-07, QV-16

## 1. Objective

Define an optional way for a member to prove eligibility for a group decision without presenting a legal name or stable public account identifier alongside their ballot. Credentials should support group-defined rules while minimizing unnecessary disclosure.

A credential does not establish that a group's membership policy is fair, its roster is complete, or a participant is free from coercion.

## 2. Participation modes

Evaluate three modes, which may be offered as group policy choices:

1. **Named:** identity is visible as defined by group policy.
2. **Pseudonymous:** group administrators may know member identity, but members use a persistent group-local alias.
3. **Proof-based eligibility:** the member proves membership to the ballot verifier without a legal name or stable account ID in the ballot record.

Before enrollment and each ballot, explain which mode is active, what the group administrator and service operator can observe, what metadata may be retained, and remaining privacy limits. Do not describe a mode as anonymous without naming the adversary and evidence.

## 3. Candidate credential flow

The following is a design to evaluate, not an adopted protocol:

1. A member generates and retains a secret.
2. An authorized group registrar confirms membership and registers a corresponding commitment in a versioned eligible set.
3. The group publishes a commitment to the frozen eligibility snapshot, such as a Merkle root, without publishing the roster.
4. For a specific ballot, the holder proves in zero knowledge that their commitment belongs to the eligible set.
5. The proof includes a ballot-scoped nullifier. The verifier rejects a second accepted submission with the same nullifier for that ballot.
6. The member submits the proof and encrypted ballot. Public records contain no legal name or stable account ID.

Semaphore documents a membership-proof and scope-specific-nullifier pattern. It is useful to study, not a complete voting protocol and not a requirement to use a blockchain. Evaluate anonymous credentials, W3C BBS selective-disclosure credentials, and blind-signature credentials as alternatives. Credential formats do not automatically provide ballot uniqueness, revocation, or a secure voting system.

## 4. Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| QV-17-REQ-001 | Disclose participation mode and privacy consequences before enrollment and voting. | Usability testing confirms participants can identify who sees their identity, ballot, and metadata. |
| QV-17-REQ-002 | Verify eligibility against the decision's approved snapshot. | Proofs for members outside the snapshot fail; valid proofs pass against matching public parameters. |
| QV-17-REQ-003 | Reject a second accepted proof with the same decision-scoped nullifier. | Replay and concurrent submissions cannot increase the accepted count twice. |
| QV-17-REQ-004 | Keep legal name and stable account ID out of public ballot records in proof-based mode. | Exported records contain no direct member identifier or undocumented join key. |
| QV-17-REQ-005 | Prevent default cross-decision linking by protocol-visible identifiers. | Independent review confirms unlinkability within the selected protocol's assumptions and tests verify scope binding. |
| QV-17-REQ-006 | Bind each proof to group, ballot, rule version, and eligibility snapshot. | Cross-group, cross-ballot, or stale-snapshot substitution is rejected. |
| QV-17-REQ-007 | Define issuance, expiry/revocation, and recovery procedures. | Lifecycle tests confirm recovery cannot silently create double participation. |
| QV-17-REQ-008 | Document registrar/verifier collusion and metadata risks. | The notice covers timing, network, service-log, and small-group risks. |

## 5. Credential lifecycle and privacy

### Enrollment and issuance
Define how membership is verified, how secrets are created, what the issuer signs or commits, and what issuance records are retained. Cryptography cannot stop a dishonest registrar from issuing multiple credentials or choosing an unfair roster.

### Renewal and eligibility changes
Specify validity periods, role changes, group transfers, and whether eligibility is frozen at ballot opening or evaluated at submission. A decision must reference one exact eligibility version. Post-open changes follow a visible amend/cancel/restart policy.

### Revocation
Compare freezing eligibility for each ballot, epoch-based credentials, and reviewed non-revocation proofs. Revocation lists may reveal or link members; document what the issuer and verifier learn, when changes take effect, and whether old participation can be linked. If safe mid-ballot revocation is not possible, specify a cancel/restart process.

### Recovery
The member should control the credential secret. Specify identity checks, lost-device handling, revocation and replacement, whether a replacement can vote in an open decision, and risks of cloud backups or guardian-assisted recovery. Explain what a recovery agent can learn.

### Data rules
- Scope proofs to one group and one decision by default.
- Do not publish a global member identifier across groups.
- Do not use a plain hash of email, username, or legal identity as a pseudonymous identifier.
- Do not publish roster, secret, or identity-to-ballot mapping.
- A stable identifier in an eligibility service can still correlate with later ballot timing; service separation alone does not eliminate this risk.
- Credential transfer to another group requires explicit acceptance of issuer, credential semantics, and privacy model.

## 6. Abuse cases and mitigations to specify

| Scenario | Potential impact | Required response |
|---|---|---|
| Registrar issues multiple credentials or changes roster unfairly | Duplicate participation or unfair eligibility | Publish policy and snapshot commitment; define issuer controls and challenge process |
| Issuer and ballot service correlate timing | Identity-to-participation inference | Minimize joined logs, define role separation, assess batching/delay, document residual risk |
| Nullifier is stable across decisions | Cross-ballot linking | Test scope binding; reject global nullifiers |
| Credential theft/shared device | Impersonation or disclosure | Secure storage guidance, revocation, recovery, and clear notices |
| Public revocation leaks membership | Identity or status exposure | Review revocation scheme before release |
| Small-group tally reveals choices | Inference despite encrypted ballot | Define minimum publication rules and explain inference risk |
| Coercion or observed voting | Choice disclosure outside the protocol | No coercion-resistance claim without separate evidence |
| Broken proof parameters/library | Forged eligibility or invalid proofs | Reviewed libraries, public test vectors, independent review |

## 7. Claim ledger

| Candidate statement | Required conditions | Limitation |
|---|---|---|
| “This proof establishes eligibility without including your name.” | Correct proof implementation and group-approved eligibility snapshot | Registrar still decides who is eligible; metadata may reveal participation |
| “This credential can vote once per decision.” | Correct scope, atomic uniqueness checking, and no duplicate credential issuance | A dishonest issuer or collusion can defeat this |
| “Activity is unlinkable across decisions.” | Unlinkable proof scheme, distinct scopes, no stable identifiers, and limited metadata correlation | Network timing, device signals, issuer behavior, and logs may link activity |
| “Your ballot choice is secret.” | Separate QV-05 ballot encryption and tally protocol meet the defined threat model | A credential alone does not hide a choice or prevent coercion |

## 8. Release gates and open questions

Before approval, select the exact proof and credential protocol, issuer model, scope, revocation method, and recovery model. Publish test vectors for issuance, proof generation/verification, nullifier uniqueness, revocation, and failures. Review issuer-verifier correlation and all user-facing claims independently.

Open questions: Which protocol has sufficiently mature implementations? Is proof-based eligibility required in the MVP or should the MVP use pseudonymous accounts? Who operates the registrar? Can members challenge a roster? What minimum group size limits inference? Can members enroll without giving the host a persistent email address? Is any cross-group credential format needed?

## 9. References

- [Semaphore proofs](https://docs.semaphore.pse.dev/guides/proofs) and [protocol overview](https://docs.semaphore.pse.dev/): membership proof and scope-specific nullifier pattern.
- [W3C Data Integrity BBS Cryptosuites](https://www.w3.org/TR/vc-di-bbs/): selective disclosure and unlinkable derived proofs; verify current status and maturity.
- [W3C Verifiable Credential Data Integrity](https://www.w3.org/TR/vc-data-integrity/): credential proof framework.
- [RFC 9474 — RSA Blind Signatures](https://www.rfc-editor.org/rfc/rfc9474.html): a protocol reference, not a complete credential or voting system.

These sources are research inputs, not selected dependencies or proof that QuietVote's complete credential flow is secure.
