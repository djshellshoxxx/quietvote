# QV-04 — Identity and Eligibility

**Module ID:** `identity-eligibility`  
**Status:** Framework  
**Owner:** Project owner (proposed; confirm)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-03 (policy), QV-05 (ballot), QV-06 (privacy), QV-07 (threat model), QV-16 (cryptography), QV-17 (portable credentials)

## 1. Objective

Define how a group establishes eligibility and prevents duplicate participation while limiting unnecessary identity disclosure.

- **Who needs it:** organizers (set who may vote), members (prove eligibility), observers (check counts, if policy allows), administrators (manage membership).
- **Why:** a ballot is only as credible as its roster and its one-participation-per-member rule. Identity checks are also the likeliest place for privacy loss.
- **Assumption:** the group defines who is a member (QV-03). This module cannot prove a roster is fair or complete.

## 2. Scope

### In scope
- Membership source, roster changes, and roles
- Eligibility checks and the per-decision eligibility snapshot
- Participation uniqueness per decision
- Identity modes a group may select
- Recovery, credential rotation, suspension, and revocation
- Audit records of identity actions (no ballot content)

### Out of scope
- Ballot encoding, encryption, and tallying (QV-05, QV-16)
- Detailed portable-credential protocol (QV-17)
- Voting rules, quorum, and disputes (QV-03)
- Government-grade identity proofing [UNVERIFIED: whether any target group needs it]

### Explicit non-goals
- Does not make ballots anonymous. Hiding display names is not anonymity.
- Does not prevent coercion, vote buying, or a member showing their own vote.
- Does not select a cryptographic construction.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Group administrator | Maintain roster, roles, suspensions | Group exists; admin role granted | Changes apply to future actions and are logged |
| Member | Confirm eligibility; vote once per decision | On the snapshot; working credential | One accepted participation per decision |
| Organizer | Freeze eligibility for a decision | Decision drafted | Snapshot version attached to decision |
| Observer | Check eligibility counts (if allowed) | Granted by group policy | Counts and snapshot reference; no identities |
| Service operator | Run identity infrastructure | Hosted or self-hosted (QV-08) | Access limited per QV-06 |

Journeys and failure behavior:

- **J1 Join.** Admin adds or invites a member; member accepts; credential issued per identity mode. Failure: invitation expires, so re-invite. Unknown person, so no credential is issued.
- **J2 Check before voting.** Member sees rules, cutoff, and own status. Failure: status cannot be confirmed, so show "not confirmed" and block submission. Never guess eligibility.
- **J3 Vote.** Member proves eligibility and submits. Failure: proof rejected, so show the reason and store nothing. Duplicate, so reject and reveal nothing about the earlier choice. Network loss, so a retry returns the original receipt and never counts twice.
- **J4 Lost device or credential.** Member starts recovery (Section 7). Failure: identity check fails, so no credential changes.
- **J5 Suspension.** Admin suspends a member. Failure: admin error is reversed by a logged action. Accepted ballots are unchanged.

## 4. Identity modes to compare

- Named account managed by the organization
- Pseudonymous account
- Invitation or group-issued credential
- External identity provider
- Privacy-preserving proof of membership
- Hybrid mode selected by each organization

For each mode, document setup friction, linkability, recovery, administrator visibility, collusion assumptions, and operating cost. Do not claim anonymity merely because display names are hidden.

| Mode | Setup friction | Linkability (ballot to person) | Recovery | Administrator visibility | Collusion assumption | Operating cost |
|---|---|---|---|---|---|---|
| Named account | Low | High unless ballot records are separated | Admin reset | Full identity | Admin is trusted with roster and any linkage | Low |
| Pseudonymous account | Medium | Medium; admin may hold alias-to-person map | Admin reset | Alias-to-person map | Admin and alias holder collude | Low to medium |
| Invitation or group-issued credential | Low | Medium; issuer knows recipient | Re-issue by admin | Issuer knows recipient | Issuer and verifier collude | Low |
| External identity provider | Medium | High; provider sees login times | Provider-managed | Depends on claims passed | Provider and operator correlate login and ballot times | Medium; external dependency |
| Proof of membership (QV-17) | High | Designed to be low; not yet shown | Hardest; see QV-17 | Registrar knows enrollment | Registrar and verifier collude | High |
| Hybrid | Varies | Varies per decision | Varies | Varies | Union of component assumptions | Highest |

Proposed: offer named and invitation-based modes first (OD-04-2, OD-04-9).

## 5. Eligibility lifecycle

Specify how membership is created, verified, suspended, revoked, renewed, and snapshotted for a ballot. Define whether eligibility is fixed when a decision opens or evaluated at submission time.

- **Proposed states:** `invited → active → suspended ⇄ active → revoked`, plus renewal for time-limited memberships. Each transition is made by a role set in QV-03 and logged.
- **Proposed snapshot rule:** eligibility is fixed when the decision opens, and the snapshot version is shown before voting. Alternative: evaluate at submission time. That reflects current membership but lets roster edits during voting change the eligible set (OD-04-4).

## 6. Duplicate-vote prevention

Document the mechanism ensuring one permitted participation per eligible member, including how it behaves if a member changes devices, loses a credential, or submits from multiple sessions. State what metadata the mechanism exposes.

Required properties (not a mechanism choice):
- Each check is scoped to one decision.
- Concurrent submissions from one member count at most once.
- No stable identifier is reused across decisions.
- Retries of the same submission return the original receipt.

Device changes and extra sessions go through recovery (Section 7), never a second valid credential. QV-16 lists decision-scoped nullifiers and one-use credentials as candidates; none is selected.

**Metadata exposed:** that a participation occurred, its time, and any identifier the chosen mechanism publishes. [UNVERIFIED until a mechanism is chosen]

## 7. Recovery and changes

Specify account or credential recovery, member role changes, lost-device handling, credential rotation, suspected compromise, and handling of a recovery during an open ballot. Describe any possibility that recovery links a person to a ballot.

- Recovery requires the identity check set by group policy (OD-04-6). Every recovery is logged.
- The old credential is revoked before a replacement is issued. Only one credential is valid at a time.
- Recovery never edits a submitted ballot or the tally. An accepted ballot from a later-compromised credential stands and is flagged for review under QV-03. It is not silently removed.
- Recovery during an open decision is allowed only if the member has no accepted ballot for it (OD-04-5).
- Role changes apply to future actions only.
- **Linkage risk:** a recovery event that shares a time, session, or identifier with a ballot submission links a person to participation. Recovery records are kept separate from ballot records, and recovery staff never see ballot content.

## 8. Data handled and trust boundaries

- **Inputs:** member identifier and contact method; invitations; role and status changes; credential material (per mode); recovery evidence.
- **Outputs:** eligibility answer per member; snapshot version and reference; observer counts; audit entries.
- **Controller/operator:** [UNVERIFIED: depends on hosting model, QV-08 and QV-14]
- **Trust boundaries:** (1) admin authority over the roster, which cryptography cannot remove; (2) member device holding the credential; (3) identity provider or registrar feeding the service; (4) recovery staff and member; (5) observers, who receive counts only.
- Field-level inventory and visibility: QV-06 Sections 4 and 5.

## 9. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Admin adds unlisted members or removes opponents during voting | Malicious or coerced admin | Unfair eligible set | Snapshot at open; logged changes; QV-03 challenge process | Admin roster authority remains |
| Member votes twice from two devices or sessions | Member | Extra weight | Decision-scoped uniqueness; atomic check | Depends on mechanism (QV-16) |
| Account takeover or recovery impersonation | Phisher, social engineer | Vote cast as another person | Recovery check (REQ-012); member notified of recovery | Check strength open (OD-04-6) |
| Credential theft from shared or infected device | Malware, shared device | Impersonation | Revocation and recovery; passkeys or MFA for admins (QV-16) | Compromised device remains a risk |
| Bulk or fake memberships | Sybil attacker; misused invitation | Fake participation | Invitation-based enrollment; admin review; rate limits | Admin-issued invitations can be misused |
| Login and ballot timing correlation | Operator, network observer | Identity-to-ballot inference | Separated records; short-retention logs (QV-06) | Not eliminated |
| Recovery event linked to ballot | Recovery staff with log access | Participation linkage | Separate records; no ballot access | Timing may still correlate |
| Membership probing | Outsider | Learns who is a member | Uniform responses (REQ-009); rate limits | Response timing |
| Recovery yields extra vote | Member | Duplicate participation | Old credential revoked first (REQ-006) | Depends on atomic revocation |

## 10. Dependencies and interfaces

- **Upstream:** QV-03 (snapshot, roles, challenges), QV-07 (threat model), QV-16 (candidate mechanisms)
- **Downstream:** QV-05 (ballot acceptance), QV-06 (retention), QV-09 (contracts), QV-10 (UI)
- **Contracts (detailed in QV-09):** eligibility query returns eligible, not eligible, or not confirmed; snapshot reference (ID, version, commitment); audit event (actor, action, time, target; no ballot fields).
- **Versioning:** a snapshot is immutable once its decision opens.
- **Failure:** if eligibility cannot be confirmed, the ballot is not accepted (fail closed). Retries are idempotent (Section 6).

## 11. UX, accessibility, and localization

- Rules, cutoff, and snapshot version are shown before submission (QV-10).
- Plain-language note on what admins and the operator can see for the chosen mode (QV-06 notice).
- Recovery works with screen readers and does not depend on one device.
- Language support: [UNVERIFIED; set in QV-13]

## 12. Operations and audit

- **Configuration:** identity mode, snapshot rule, and recovery policy, per group.
- **Audit:** log admin and identity actions (actor, action, time, target). Never log ballot content or choices.
- **Backup and deletion:** per QV-06. Revoked credentials are kept only as the audit policy requires.
- **Incident:** suspected identity-store compromise triggers a QV-07 review and possible decision pause.
- **Support:** support staff have no ballot access. Recovery authority is limited by OD-04-6.

## 13. Requirements and tests

Owner-stated invariants:

- Eligibility rules are visible before voting.
- Ineligible members cannot submit a valid ballot.
- A member cannot exceed the permitted ballot count.
- Recovery does not silently alter a submitted ballot or tally.
- Administrative actions are logged without exposing ballot choices.
- All requirements identify an adversary model and verification method.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-04-REQ-001 | The system shall show eligibility rules, the cutoff, and the snapshot version to a member before the member can submit. | Must | Submit control stays disabled until the rules view has been opened; view includes all three items | UI test; usability review |
| QV-04-REQ-002 | The system shall reject submissions from identities not in the decision's snapshot, or whose status is suspended or revoked. | Must | Not-in-snapshot, suspended, revoked, and unknown test identities are each rejected; accepted count unchanged | Integration test; security test |
| QV-04-REQ-003 | The system shall not accept more ballots from one member for one decision than the published rule allows, including under concurrent or retried submissions. | Must | Parallel submissions from one member yield at most the permitted count; a retry returns the original receipt | Concurrency test; independent review |
| QV-04-REQ-004 | If eligibility cannot be confirmed, the system shall not accept the ballot. | Must | Simulated eligibility outage yields rejection and no stored ballot | Failure-injection test |
| QV-04-REQ-005 | The system shall fix the eligible set when a decision opens and record later roster changes without changing the snapshot. | Must (pending OD-04-4) | After opening, add and remove leave the snapshot version unchanged; each change appears in the audit log | Integration test; review |
| QV-04-REQ-006 | Recovery shall revoke the prior credential before issuing a replacement, so one credential is valid at a time. | Must | After recovery, the old credential is rejected and the new one is accepted once | Lifecycle test |
| QV-04-REQ-007 | Recovery and credential replacement shall not modify any submitted ballot or the tally. | Must | Stored ballot and tally records are byte-identical before and after recovery | Integration test |
| QV-04-REQ-008 | The system shall log identity and admin actions with actor, action, time, and target, and shall exclude ballot content. | Must | Each action type produces an entry; log schema has no ballot fields; log scan finds no choices | Schema test; log scan; review |
| QV-04-REQ-009 | An eligibility lookup shall return the same response shape and status for eligible, ineligible, and unknown identities. | Should | Three test responses match in shape and status code; timing gap listed as residual risk | Security test |
| QV-04-REQ-010 | If group policy allows observer verification, the observer view shall show counts and snapshot reference only. | Should | Observer export contains no member identifiers | Export test; review |
| QV-04-REQ-011 | Before enrollment, the system shall state the identity mode and what administrators and the operator can see. | Must | Enrollment screen names the mode and the QV-06 visibility list | Usability test |
| QV-04-REQ-012 | Recovery shall require the identity check set by group policy. Recovery without it shall be refused and logged. | Must | Attempts without the required check are refused and logged | Integration test; security test |

## 14. Open questions

- Who is authoritative for a group's membership?
- Can a group offer different identity modes?
- Is anonymous participation a group setting, participant choice, or both?
- How are lost credentials recovered without enabling impersonation?
- Must observers be able to verify eligibility counts independently?

## 15. Open decisions

| # | Question | Options | Recommendation | Owner |
|---|---|---|---|---|
| OD-04-1 | Who is authoritative for membership? | Group admin roster; external identity provider; registrar service | Proposed: group admin roster; identity provider as optional source | Project owner |
| OD-04-2 | Can a group offer different identity modes? | One mode per group; per-decision choice; hybrid | Proposed: one mode per group, set before enrollment; hybrid deferred | Project owner |
| OD-04-3 | Is anonymous participation a group setting, participant choice, or both? | Group setting; participant choice; both | Proposed: group setting only, so members know what the group sees | Project owner with QV-03 |
| OD-04-4 | Is eligibility fixed at open or checked at submission? | Snapshot at open; check at submission | Proposed: snapshot at open | Project owner |
| OD-04-5 | Can a member recover during an open decision? | Allow if no accepted ballot; block until close; allow with admin approval | Proposed: allow only if no accepted ballot exists, with old credential revoked first | Project owner |
| OD-04-6 | How is recovery identity checked, and by whom? | Admin confirms out of band; self-service via pre-registered backup; support staff | Proposed: admin confirms out of band for named and invitation modes; support staff never see ballots | Project owner |
| OD-04-7 | Can a member be suspended during an open decision, and what happens to accepted ballots? | Block new submissions only; also retract accepted ballots | Proposed: block new submissions only; accepted ballots stand and are reviewable under QV-03 | Project owner |
| OD-04-8 | Must observers verify eligibility counts independently? | Counts plus snapshot reference; per-member proof; none | Proposed: counts plus snapshot reference | Project owner |
| OD-04-9 | Is proof-based eligibility in the MVP? | Yes; no, named and invitation modes only | Proposed: no; defer until QV-16 and QV-17 review | Project owner |
