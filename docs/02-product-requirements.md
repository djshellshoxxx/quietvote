# QV-02 — Product Requirements

**Module ID:** `product-policy`  
**Status:** Framework  
**Owner:** Project owner (to be recorded)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-00 and QV-01 (depends on); QV-03–QV-07, QV-10, QV-13 (depend on this)  
**Purpose:** Turn the charter into a bounded MVP and testable user requirements.

## Objective

Define a proposed first release in which an organizer publishes a decision's rules, each eligible member casts one private ballot, and the group receives a published tally with verification evidence and a challenge route. This document states what the product must do. It does not choose the identity model (QV-04), the ballot protocol (QV-05), or any cryptographic construction.

## Scope

### In scope
- Group setup and membership administration
- Proposal and ballot drafting, preview, and publication of rules
- Eligibility check, private ballot submission, and acceptance receipt
- Result publication with verification evidence, and challenge intake
- Audit log of lifecycle events, and export of decision records

### Out of scope (non-goals)
- Public governmental elections and legally certified corporate elections (per charter)
- Any claim of anonymity, coercion resistance, or protection against endpoint compromise, colluding administrators, or hosting-operator access, beyond what QV-05 and QV-07 later demonstrate
- Tokens, blockchain, payments, or custody of funds
- Identity-document verification
- Portable credentials, federation, delegation, and forks (QV-17–QV-19) in the MVP

## User groups to validate

- Member eligible to participate
- Organizer who configures a decision
- Observer or auditor who checks the process and result
- Organization administrator who manages membership and policy
- Service operator, if hosted operation is selected

For each group, document goals, constraints, technical access, privacy needs, and consequences of exclusion.

## Actors

| Actor | Goals | Constraints | Technical access | Privacy needs | Consequence of exclusion |
|---|---|---|---|---|---|
| Member | Vote privately; confirm acceptance; understand rules | May use a phone or assistive technology; may lose access | Own ballot and receipt; published rules and results | Choice hidden from everyone else | Member's input is missing from the decision |
| Organizer | Draft, preview, open, and close a decision | Trusted with rule text and timing, not with choices | Draft, schedule, aggregate submission status | Must not see who chose what | Decisions cannot be run |
| Administrator | Manage membership and group policy | Often also a member | Membership list and policy settings; no ballot access | Whether admins see who has voted is open (D-02-10) | Membership errors go uncorrected |
| Observer / auditor | Check process and tally | Usually external to the group | Published rules, evidence, audit log | No individual choices | Result cannot be checked |
| Service operator (hosted only) | Keep the service running | Operates infrastructure it does not own | Infrastructure access; ballot access not assumed (QV-07) | No ballot access by default | Service unavailable |

## Candidate user journeys

1. An organization configures its rules and membership source.
2. An organizer drafts a proposal and ballot, previews the rules, and opens voting.
3. A member verifies eligibility, reviews the privacy notice, and submits a ballot.
4. A member confirms whether their ballot was accepted without revealing its choice.
5. An observer checks the published result and available audit evidence.
6. An organizer closes or cancels a decision and handles a challenge.
7. An organization exports records or leaves the service.

### Alternate paths and failure behavior

| Journey | Alternate path or failure | Required behavior |
|---|---|---|
| 1. Configure | Membership source is empty or unreadable | Decision cannot be opened; admin sees which source failed |
| 2. Draft and open | A required rule field is empty | Opening is blocked; error names the field (QV-02-REQ-005) |
| 3. Vote | Eligibility is not confirmed | Member sees a plain reason and the QV-04 recovery path; no ballot is stored |
| 3. Vote | Storage fails at submission | Failure message; no receipt; no partial ballot (QV-02-REQ-009) |
| 3. Vote | Member leaves mid-ballot | Unsent choice is discarded; nothing is submitted |
| 4. Confirm | Receipt is not shown | Member sees "not confirmed" and can check status; one submission is counted at most (QV-02-REQ-007) |
| 5. Observe | Result not yet published | Observer sees current stage and expected publication step only |
| 6. Close or cancel | Transition not allowed by the rule version | Action rejected with reason; state unchanged |
| 6. Challenge | Challenge filed after window | Rejected; message gives window end time |
| 7. Export | Export fails part-way | Export is not marked complete; retry is offered |
| Any | Member loses access during an open decision | Recovery per QV-04 until close; no ballot counted from an unverified session (QV-02-REQ-020); no automatic extension (D-02-7) |

## Requirement areas

- Organization creation and configuration
- Membership and roles
- Proposal lifecycle and amendments
- Ballot construction and preview
- Opening, closing, pausing, canceling, and extending a decision
- Vote submission and confirmation
- Tally methods and result publication
- Audit evidence and challenges
- Notifications and reminders
- Data export, retention, and deletion
- Hosted and self-hosted administration

## MVP boundary worksheet

| Capability | MVP? | Rationale | Dependencies |
|---|---|---|---|
| Basic majority ballot | Proposed: Yes | Simplest method to specify, verify, and explain; covers single-question decisions | QV-03–QV-05 |
| Ranked-choice ballot | Proposed: No | Adds counting rules and ballot-validity proofs; defer until the basic flow is verified | QV-05 |
| Anonymous eligibility credential | Proposed: No | Needs QV-04 design and QV-16/QV-17 review; MVP uses group-known membership with a private ballot | QV-04, QV-16, QV-17 |
| Publicly verifiable tally | Proposed: Yes, at the level QV-05 supports | Required by the verifiable-outcomes principle; the claimed level is stated on each result | QV-05, QV-07 |
| Self-hosted deployment | Proposed: No (defer) | Operator support and upgrade paths are not yet specified | QV-08, QV-12 |
| Hosted multi-organization service | Proposed: No | Tenant isolation and shared-operator trust need QV-07 and QV-08 review first | QV-08, QV-12 |
| Hosted single-organization instance | Proposed: Yes (see D-02-1) | Limits the MVP to one target group and one trust model | QV-08, QV-12 |

## Requirements

Priority: Must = needed for the MVP; Should = planned for the MVP unless cut at review; Could = later.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-02-REQ-001 | The system shall create an organization with a name, a purpose statement, and at least one administrator. | Must | Creation without an administrator is rejected; the creator is recorded as administrator. | Integration test |
| QV-02-REQ-002 | The system shall let an administrator add, remove, and change the role of members, recording actor and time for each change. | Must | Each change appears in the audit log; a removed member cannot submit to decisions opened after removal. | Integration test; security test |
| QV-02-REQ-003 | The system shall save each proposal edit as a new numbered version. | Must | Saving creates version n+1; earlier versions stay readable with timestamps. | Unit test |
| QV-02-REQ-004 | The system shall show an organizer a preview of the member view, including every rule field listed in QV-03. | Must | Preview fields match the published member view field for field in an automated comparison. | E2E test; usability review |
| QV-02-REQ-005 | The system shall refuse to open a decision while any required rule field is empty. | Must | Opening with an empty field returns an error naming the field; state is unchanged. | Unit test |
| QV-02-REQ-006 | The system shall show each eligible member the question, options, close time in the member's local time zone, change rules, and reveal rules before the ballot is shown. | Must | Ballot is not reachable until the rules view is shown; displayed close time matches the UTC value in test time zones. | E2E test |
| QV-02-REQ-007 | The system shall accept no more submissions per eligible member than the published rule allows, and reject others with a plain-language message. | Must | Under the one-submission rule, a second submission is rejected and the tally is unchanged. | Integration test |
| QV-02-REQ-008 | The system shall give a member a receipt after an accepted submission, showing decision name, time accepted, and a receipt code, and no ballot choice. | Must | Receipt text and stored receipt contain no option text; receipt code appears in the accepted-ballot list if QV-05 publishes one. | Security/privacy test; E2E test |
| QV-02-REQ-009 | If a submission cannot be stored, the system shall show a failure message, issue no receipt, and store no partial ballot. | Must | Fault injection at the storage step yields no receipt and no partial record; retry is allowed while the decision is open. | Integration test |
| QV-02-REQ-010 | The system shall not provide any organizer, administrator, observer, or operator view, export, or log that links a member identity to a ballot choice. | Must | Automated scan of all views, exports, and logs available to those roles finds no member-to-choice linkage. | Security/privacy test; independent review |
| QV-02-REQ-011 | The system shall publish, for each closed decision, option counts, participation count, quorum status, and the rule version applied, with no individual ballot data. | Must | Published result contains all listed fields; a test confirms no per-ballot values. | E2E test |
| QV-02-REQ-012 | The system shall state on each result the verification level that the published evidence supports, using the levels defined in QV-05. | Must | Each result shows exactly one level label from the QV-05 list. | Review |
| QV-02-REQ-013 | The system shall accept a member's challenge to a published result within the challenge window, and record it with timestamp and reason text. | Must | Challenge inside the window is recorded and linked to the decision; challenge after the window is rejected. | Integration test |
| QV-02-REQ-014 | The system shall allow an organizer to close early or cancel an open decision only where the rule version permits it, recording actor, time, and reason. | Must | Canceled decision publishes no tally; a disallowed early close returns an error. | Integration test |
| QV-02-REQ-015 | The system shall let an organizer extend an open decision's close time, recording the change and notifying each eligible member. | Should | A shortening attempt is rejected; a notice is sent to each eligible member. | Integration test |
| QV-02-REQ-016 | The system shall send each eligible member an opening notice and one reminder before close, with no ballot content in the message. | Should | Notices reach each eligible member; message body contains no option text; reminder timing is set by the organizer. | Integration test |
| QV-02-REQ-017 | The system shall export an organization's decision records (rule versions, results, audit log) in a documented machine-readable format. | Must | Export contains every version, result, and audit entry; it validates against the published schema. | Integration test |
| QV-02-REQ-018 | The system shall let an organization leave the service and request deletion of its data under QV-06 retention rules, and report what was deleted and what is retained. | Must | Deletion report lists each data category with status; each retained category shows its reason. | Integration test; review |
| QV-02-REQ-019 | The system shall keep all member flows operable by keyboard alone and labeled for screen readers, to the standard selected in QV-13. | Must | Automated accessibility scan and a manual keyboard run of the member flow report no blocking issues. | Usability review; E2E test |
| QV-02-REQ-020 | The system shall let a member who loses access during an open decision recover eligibility through the QV-04 process before close, and shall not count a ballot from an unverified session. | Must | A ballot from an unverified session is rejected; a recovered member can submit once before close. | Security/privacy test |
| QV-02-REQ-021 | The member flow shall work on a phone-width screen with no horizontal page scroll. | Should | At phone width, all member steps complete with no horizontal scroll. | E2E test |

## Acceptance criteria

Write criteria in observable form. Examples to refine, not approved requirements:

- An eligible member can submit no more ballots than the published rule allows. → QV-02-REQ-007
- A member can understand the ballot, closing time, and privacy limits before submitting. → QV-02-REQ-006
- A group can reproduce or verify the published tally using the documented evidence. → QV-02-REQ-011, QV-02-REQ-012
- The system exposes no ballot-choice-to-member mapping through ordinary organizer views. → QV-02-REQ-010

Specify edge cases, failure behavior, and exact test methods before approval. The alternate-path table above is the starting set.

## Data handled and trust boundaries

- **Member data:** name or pseudonym as group policy allows; membership status; eligibility result; notice contact.
- **Decision data:** proposal versions, rule versions, options, open and close times.
- **Ballot data:** choice in the form set by QV-05; receipt code. Choices must not appear in plain text in logs or exports.
- **Result data:** option counts, participation count, quorum status, evidence per QV-05.
- **Audit data:** lifecycle, membership, rule, and challenge events. Must not contain choices.
- **Trust boundaries:**
  - Member device to service: untrusted input; the server validates everything.
  - Organizer and administrator roles: no ballot access (QV-02-REQ-010).
  - Hosting operator: trusted to run the service; ballot access is assessed in QV-07, not assumed absent.
  - Observer: published artifacts only.
- **Privacy claims:** only QV-02-REQ-010 and QV-02-REQ-008 are claimed here. No anonymity claim is made.

## Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Duplicate submission | Member votes twice, including from two sessions | Tally skewed | One-submission rule (QV-02-REQ-007); eligibility check on each submit | Depends on QV-04 duplicate prevention |
| Ineligible voter | Outsider with a shared link | Tally skewed | Eligibility check before ballot is shown (QV-04) | Shared credentials are not prevented by MVP design |
| Rule change after opening | Organizer or admin | Unfair outcome | Versioned rules; no edits after open (QV-03-REQ-005) | Depends on implementation test coverage |
| Organizer reads choices | Organizer with database, log, or export access | Choice exposure; coercion risk | QV-02-REQ-010; operator access reviewed in QV-07 | Infrastructure access is not fully controlled by the application |
| Coercion or vote buying | Group member or third party | Members pressured to vote a way | None in MVP; stated as a limit to members | Not addressed; must be disclosed in the privacy notice |
| Flooding the ballot endpoint | Attacker | Decision blocked | Rate limiting to be specified in QV-08 | Open |
| Challenge abuse | Member files many challenges | Result delayed | Per-decision limit on challenges (D-03-2) | Open |
| Leaked notice content | Mail interception or provider access | Privacy loss | No option text in notices (QV-02-REQ-016) | Recipients' mail systems can still see the notice |
| Fake voting page | External attacker | Members submit to a fake site | Official domain and visible identity (QV-07) | Members may not recognize a convincing copy |
| Recovery abuse | Attacker posing as a member who lost access | Impersonation | QV-04 recovery checks (QV-02-REQ-020) | Depends on QV-04 design |

## Dependencies

- **Upstream:** QV-00 (charter), QV-01 (capability map).
- **Downstream:** QV-03 (rules), QV-04 (eligibility), QV-05 (ballot and tally), QV-06 (retention), QV-07 (threats), QV-08 (deployment), QV-09 (contracts), QV-10 (experience), QV-13 (accessibility).
- **Optional:** QV-17 (portable credentials) only if the anonymous-credential capability is later selected.

## Verification

- Each requirement has a verification method in the table above. Every Must requirement is release-blocking.
- QV-02-REQ-008, QV-02-REQ-010, and QV-02-REQ-020 require security/privacy tests and an independent review before any privacy or verifiability claim is published.
- Test reports reference requirement IDs, per the traceability rule in the spec index.
- Accessibility checks use the standard selected in QV-13.

## Open questions

- What is the first target organization type?
- Which single decision flow makes a useful MVP?
- What participation and quorum rules must be supported?
- Can ballots be changed or withdrawn before close?
- What happens if a member loses access during an active decision?
- What must the audit record contain, and who can inspect it?
- What are the minimum accessibility and language requirements?

Mapping to decisions: Q1 → D-02-2; Q2 → D-02-4; Q3 → D-02-5; Q4 → D-02-6; Q5 → D-02-7; Q6 → D-02-8; Q7 → D-02-9.

## Open decisions

| ID | Question | Options | Proposed recommendation | Owner |
|---|---|---|---|---|
| D-02-1 | Deployment model for the first release? | Hosted single-organization; self-hosted; both | Proposed: hosted single-organization instance; defer self-hosted | Project owner |
| D-02-2 | First target organization type? | Cooperative; member association; union; online community | Proposed: member association (one type only) | Project owner |
| D-02-3 | Membership source for the MVP? | Admin-managed list; invite link; self-signup | Proposed: admin-managed list; no self-signup | Project owner |
| D-02-4 | Decision flow for the MVP? | Single-choice question; yes/no; multi-question ballot | Proposed: one single-choice question per decision | Project owner |
| D-02-5 | Participation and quorum rules required? | Optional quorum per decision; mandatory quorum; none | Proposed: optional per-decision quorum (see D-03-4) | Project owner |
| D-02-6 | Can ballots change or be withdrawn before close? | No change; revocable until close (needs QV-05 support) | Proposed: no change in MVP | Project owner |
| D-02-7 | What happens if a member loses access during an open decision? | Recover before close; extend close time; drop the vote | Proposed: recover through QV-04 before close; no automatic extension | Project owner |
| D-02-8 | What must the audit record contain and who can inspect it? | Admin-only; organizers and admins; all members for own events | Proposed: lifecycle, rule-version, membership-change (actor and time), and challenge events; inspectable by admins and observers, and by each member for their own events; never choices | Project owner |
| D-02-9 | Minimum accessibility and language requirements? | One language at launch; several languages at launch | Proposed: one interface language at launch, chosen by the owner; accessibility standard set in QV-13 | Project owner |
| D-02-10 | Do administrators see who has voted? | Yes (participation list only); aggregate counts only | Proposed: yes, participation list only, never choices; the list is not linked to ballot contents | Project owner |

Approval: this document stays at Framework until the project owner's review is recorded in the decision log.
