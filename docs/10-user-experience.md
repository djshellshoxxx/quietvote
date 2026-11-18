# QV-10 — User Experience

**Module ID:** `experience-accessibility`  
**Status:** Framework  
**Objective:** Make rules, privacy limits, participation, and verification understandable to members and administrators.  
**Owner:** Project owner (to be recorded in the decision log)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-02, QV-03, QV-04, QV-05, QV-06, QV-07, QV-09, QV-11, QV-13, QV-16

## 1. Objective

Make rules, privacy limits, participation, and verification understandable to members and administrators. A member with no cryptography background should be able to decide whether to vote, cast a ballot, see what the system recorded, and know what the system cannot hide.

This spec defines screens, states, and plain-language content. It does not define governance rules (QV-03), eligibility (QV-04), or ballot cryptography (QV-05, QV-16).

**Users:** members (eligible participants), organizers (configure decisions), administrators (membership and recovery), observers and auditors (check process and results).

## 2. Scope

### In scope
- Member flows: join, eligibility check, rules review, ballot submission, confirmation and status, results and audit view, challenge or report, recovery entry points.
- Organizer flows: create, review, preview, open, close, and archive a decision (interface side only).
- Observer views of results and audit evidence.
- Plain-language content: rule notices, privacy notice, glossary, error and dispute messages.
- Behavior during connectivity loss and service unavailability.

### Out of scope
- Rule content and governance policy (QV-03); membership and recovery mechanics (QV-04); ballot protocol and proofs (QV-05, QV-16); API contracts (QV-09).
- Accessibility conformance and languages (owned by QV-13; this spec references it).
- Visual branding and client platform choice (QV-08).

### Explicit non-goals
- Making ballots anonymous, untraceable, or coercion-resistant. UI text must not claim more than QV-05 and QV-07 establish.
- Persuading or pressuring participation: no turnout nudges, streaks, or prompts naming members who have not voted.
- Showing one member's ballot status or choice to another member.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Member | Vote privately on a decision | Eligible under QV-04; can sign in or hold a credential | Ballot accepted, or a clear reason it was not |
| Prospective member | Join a group and understand its privacy model | Invitation or join link (mechanism open, QV-04) | Informed join or decline |
| Organizer | Configure and run a decision | Organizer role granted under QV-03 | Decision opened and closed with visible rules |
| Administrator | Manage membership and recovery | Administrator role | Change or recovery completed and logged |
| Observer or auditor | Check process and result | Access granted under QV-03 and QV-07 | Result verified, or a challenge filed |
| Member who lost access | Regain access | Recovery path defined in QV-04 | Access restored, or a clear next step |

### Journeys and failure behavior

- **J1 Join and learn the privacy model.** Member reads the group's privacy notice before joining. Failure: notice does not load; joining is blocked, not skipped.
- **J2 Receive and verify eligibility.** Member is told whether they are eligible and what that covers. Failure: ineligible; show the reason and contact path, with no detail about other members.
- **J3 Review proposal and rules.** Member reads the proposal version, options, method, cutoff, deadlines in local time, thresholds, change policy, and reveal policy (QV-03). Failure: rules do not load; ballot cannot be opened.
- **J4 Submit ballot.** Member reviews a text version of every selection, submits, and sees a state from the table below.
- **J5 Check acceptance (if QV-05 supports it).** Member enters a reference and sees whether it appears in the published record. Failure: not yet published; show a pending state and when to check again, not a ballot error.
- **J6 View results and audit evidence.** Member or observer sees the result, the rule version, tally evidence, and a plain-language explanation. Failure: evidence unavailable; result is marked unverified, never shown as verified.
- **J7 Challenge or report.** Member or observer files a challenge in a QV-03 category and receives a reference number. Failure: submission not confirmed; form says it was not sent and keeps text only in the open page.
- **J8 Organizer creates, previews, opens, closes, archives.** Organizer previews the member view before opening. Failure: opening blocked until preview is viewed and rules validate. Closing at the deadline is automatic under QV-03 and visible to all.
- **J9 Recover access.** Member starts recovery from sign-in or voting screens. Failure: recovery incomplete; ballot stays unsubmitted and no partial session is shown as active.

### Submission and decision states

| State | Text shown to member (plain language) | Member can | Notes |
|---|---|---|---|
| Not sent | "Your ballot has not been sent." | Edit and submit, if still open | Connection lost before server acknowledgment |
| Sending | "Sending your ballot. Keep this page open." | Wait | — |
| Accepted | "Your ballot was accepted. This message does not show your choice." | Check acceptance (J5), if supported | No choice repeated by default (OD-10-06) |
| Not accepted: ineligible | "Your ballot was not accepted because your eligibility could not be confirmed." | Contact organizer; start recovery | Reason never reveals other members' status |
| Not accepted: invalid | Names the rule not met, in text | Edit and resubmit before close | — |
| Already voted | "You have already voted in this decision. Your earlier ballot stands unless the rules allow changes." | Nothing, unless QV-03 allows changes | Shows only to the member themselves |
| Unknown outcome | "We could not confirm whether your ballot was recorded. Do not submit again yet." | Check status | Resubmission disabled until status resolves |
| Closed | "Voting closed at the deadline shown. Your ballot was not submitted." | View rules and results | — |
| Paused, cancelled, or under challenge | Decision status and reason | As allowed by QV-03 | — |

## 4. Requirements

Accessibility and language requirements for these flows are in QV-13. Priorities use Must, Should, Could.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-10-REQ-001 | The system shall show the proposal version, options, voting method, eligibility cutoff, opening and closing times, thresholds, change policy, and reveal policy before a member can submit. | Must | Submit control is unreachable until the rules summary has been displayed. Times show in member's local zone with zone name. | E2E test; usability test |
| QV-10-REQ-002 | The system shall state, before submission, each privacy limit that applies to the decision, in plain language. The notice shall explain the difference between "private from other members" and "hidden from organizers or operators." | Must | Every limit in the decision's configured list appears on the notice. Both phrases appear with their glossary meanings. | Content review; comprehension test (OD-10-08) |
| QV-10-REQ-003 | Member-facing text shall not describe a decision as "anonymous," "untraceable," or "coercion-proof" unless the claim ledger (QV-16 §7) records evidence for that claim. | Must | Automated text check finds no such term without a ledger reference. | Text lint; claim-ledger review |
| QV-10-REQ-004 | The system shall show a text review of every selection before submission. | Must | Review lists each option and the member's selection, including unselected options where the method requires. | E2E test |
| QV-10-REQ-005 | The confirmation shall not show or repeat the member's selection unless the member opens a view they choose. | Must | Test data: confirmation page, notifications, emails, and error reports contain no choice value. | E2E test; privacy test (QV-11) |
| QV-10-REQ-006 | The system shall display each state in the states table with its listed text, and keep sending, not sent, accepted, not accepted, already voted, unknown outcome, and closed clearly distinct. | Must | Each state is reachable in a test fixture and displays the matching text. | Unit and E2E tests |
| QV-10-REQ-007 | When a submission outcome is unknown, the system shall not allow a second submission for that decision until the status check resolves. | Must | Fault injection that drops the response after the server records a ballot shows "Unknown outcome" and disables submit. No second ballot is recorded. | Fault-injection test (QV-11); relies on QV-09 idempotency |
| QV-10-REQ-008 | The system shall show "Not sent" or "Unknown outcome" whenever the connection drops before server acknowledgment, and never "Accepted" without acknowledgment. | Must | Simulated loss mid-submit yields the correct state in every run. | Network-fault E2E test |
| QV-10-REQ-009 | If QV-05 provides inclusion checks, the system shall let a member check acceptance using a reference that does not reveal the choice. | Should (Must if QV-05 provides inclusion evidence) | Valid reference returns "found." Unknown reference returns "not found" with no data about other ballots. Reference contains no choice value. | Integration test; review |
| QV-10-REQ-010 | The system shall show every change to proposal text, rules, or eligibility to members and observers, with time and actor role, and shall flag changes made after opening. | Must | Test change appears in the change log with time and role. A change after opening is blocked or flagged as QV-03 requires. | Integration test; QV-03 review |
| QV-10-REQ-011 | The system shall show deadline changes, pauses, extensions, and cancellations with the rule that caused them. | Must | Each event in the fixture shows its rule reference and time. | E2E test |
| QV-10-REQ-012 | During a service outage, the system shall show service status and the decision deadline, and shall not present the ballot as sent. | Must | Simulated outage shows the banner, the unchanged deadline, and a "Not sent" or "Unknown outcome" state. | Fault-injection test |
| QV-10-REQ-013 | The system shall provide a challenge or report form for each decision, with categories defined in QV-03, and return a reference number. | Must | Submission returns a reference. Form content excludes choice values unless the member types them. | E2E test; privacy test |
| QV-10-REQ-014 | Recovery entry points shall appear on sign-in and voting screens. Recovery responses shall not reveal whether an account or identifier exists. | Must | Responses for existing and non-existing identifiers match in text and layout. | Security test; review |
| QV-10-REQ-015 | Organizers shall view the member view of a decision before opening it. | Must | Opening is blocked until the preview is displayed. Preview text matches member view in an automated comparison. | E2E test |
| QV-10-REQ-016 | Observers shall see results and audit evidence without any member's choice or any ballot-to-member link. | Must | Observer views in test data contain no per-member choice values or linking fields. | Security and privacy test |
| QV-10-REQ-017 | Each failure, dispute, and closed state (failed, challenged, paused, cancelled, closed, archived) shall have a designed screen with plain-language text. | Must | A design artifact exists for each state and renders in a fixture. | Design review; E2E test |
| QV-10-REQ-018 | Member-facing text shall use glossary terms (section 8) and pass a comprehension check before release. | Must | Lint finds no undefined governance term. Comprehension threshold (OD-10-08) is met. | Text lint; comprehension test |
| QV-10-REQ-019 | If OD-10-09 requires member acceptance of rules, the system shall record acceptance against the rules version. | Should | Acceptance event references the rules version identifier and time. | Integration test |
| QV-10-REQ-020 | Every flow in this spec shall meet QV-13 requirements. | Must | QV-13 verification passes for J1–J9. | QV-13 verification |

## 5. Data and privacy

- **Data inputs:** member selections (page memory until submitted); eligibility result; language and time-zone preference; rule and proposal version identifiers; challenge text and category; organizer preview actions.
- **Data outputs:** ballot submission (format per QV-05); status responses; challenge reference; error reports, if any.
- **Data controller/operator:** Not set. Depends on hosted or self-hosted operation (QV-08).
- **Retention and deletion:** Selections are not stored in the browser by default (OD-10-07). Language and time-zone preferences are proposed for browser storage only. Error reports contain no selections, ballot references, or URLs with identifiers. Challenge records follow QV-06 retention.
- **Linkability risks:** timing between sign-in and submission; page-view analytics; error reports with decision IDs; notification and email content; shared-device history; browser extensions.
- **Visibility by member, organizer, operator, and observer:** Member sees own status and own choice only if they open that view. Organizer sees rules, preview, and aggregate status as QV-03 allows. Observer sees results and audit evidence, never choices. Operator sees service-level logs only (QV-12). Administrator sees membership and recovery records, never choices.
- **Privacy properties claimed:** The interface does not show a member's choice in confirmations, notifications, or error text by default. It shows status, not ballot content.
- **Privacy properties explicitly not claimed:** The interface cannot prevent shoulder surfing, screen recording, malicious browser extensions, device compromise, or coercion. It does not make any ballot anonymous (QV-07; QV-16 §6).

## 6. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Altered rules shown | Compromised client or page; organizer editing after open | Member votes on different terms | Show rules version identifier; verify against signed manifest (QV-16 §2); change log (REQ-010) | Client compromise (QV-16 §6) |
| Confirmation reveals choice | Observer or coercer watching the screen | Coercion or disclosure | No choice in confirmations or notifications by default (REQ-005) | Member may be forced to show the screen |
| Choice left on shared device | Next user of the same browser | Disclosure | No draft persistence by default (OD-10-07); clear page state on submit and timeout | Browser history, caches, extensions |
| Phishing of recovery | Attacker copying recovery screens | Account takeover | Recovery only from in-app entry points; notices state what recovery never asks for (proposed copy) | Phishing outside the app |
| Account enumeration | Attacker probing recovery or status pages | Learns who is a member | Uniform recovery and status text (REQ-014) | Timing differences not covered here |
| Timing correlation | Analytics, page-view logs, notifications | Links sign-in to submission | No third-party analytics on voting screens (proposed; QV-06 review); no per-member events | Operator logs (QV-06, QV-12) |
| Pressure through interface | Organizer or peers | Reduced voluntariness | Non-goal; no per-member participation display unless QV-03 allows it | Off-platform pressure (QV-07) |
| Small-group linkage | Observer with aggregate results | Infers a member's choice | Audit view applies a minimum-count rule from QV-06 [UNVERIFIED value] | Rare choices in small groups |
| Challenge form leaks choice | Member pastes choice into report | Disclosure to reviewers | Warning text; no choice fields by default (REQ-013) | Member's own disclosure |
| Error report leaks selections | Client error handler | Disclosure to operator | Redaction; selection values excluded from reports (REQ-005 test) | Unexpected stack-trace content |

## 7. Interfaces and dependencies

- **Upstream dependencies:** QV-03 (states, rules, roles, change and reveal policy); QV-04 (eligibility states, recovery); QV-05 (submission outcome, inclusion check); QV-06 (notice content, retention); QV-07 (abuse cases, claims); QV-08 (client type, offline participation); QV-16 (claim ledger, rules manifest).
- **Downstream consumers:** QV-11 (UX test suites); QV-12 (support procedures); QV-13 (accessibility checks on these screens).
- **API/event/schema contracts:** Each state in section 3 maps to a machine-readable code defined in QV-09. Member text is keyed by code, not by string, so translations stay consistent (QV-13). Rule text is served with a version identifier and hash.
- **Versioning and compatibility:** Notices, glossary, and rule text are versioned. The UI shows the version the member viewed.
- **Failure and retry behavior:** The client retries a submission only if QV-09 guarantees that a repeated submission is recorded once. Otherwise it shows "Unknown outcome" and retries only the status check. If the status check fails, the state stays "Unknown outcome" and no automatic resubmission occurs.

## 8. UX, accessibility, and localization

- **Key screens or interactions:** sign-in and eligibility; decision list; rules and privacy notice; ballot form; review; confirmation and status; recovery; challenge form; results; audit view; organizer editor and preview.
- **Plain-language explanations:** Glossary (part of this spec): decision, proposal, ballot, eligibility, deadline, quorum, tally, audit evidence, verification, private from other members, hidden from organizers and operators. Each term has a one-sentence definition reviewed by a non-specialist (REQ-018).
- **Keyboard/screen-reader requirements:** QV-13-REQ-002 to -005. Ballot options announce name and selected state.
- **Low-bandwidth and device constraints:** Design for small touch screens first. Core ballot flow does not depend on large assets (QV-13-REQ-014, -015).
- **Localization requirements:** QV-13. Glossary translation follows OD-13-06.

## 9. Operations

- **Configuration:** Notice templates, glossary, and state text are versioned content, changed only through review.
- **Monitoring and audit:** Aggregate counts of states shown (for example, the Unknown outcome rate), per QV-12. No per-member state logs.
- **Backup, recovery, and deletion:** No ballot drafts are stored, so none are backed up. Challenge records follow QV-06.
- **Incident response:** Wrong rules or notice text is a content incident. Before opening, the decision is not opened (QV-03). After opening, handling follows QV-12.
- **Support and escalation:** Help and recovery links appear in every failure state. Self-hosted groups must supply their own support contact (QV-08).

## 10. Testing and verification

- **Unit tests:** Rendering of every state and notice; glossary lint.
- **Integration tests:** State codes map to QV-09 responses; change log; rule version display.
- **End-to-end tests:** J1–J9 in each supported browser (QV-13). Use dummy votes and simulated records only until the protocol review is complete (QV-16 §8).
- **Security/privacy tests:** Choice values absent from confirmations, notifications, error reports, and challenge output; uniform recovery responses; observer views contain no choices.
- **Usability and research artifacts** (original list, now required before first release):
  - Target-user interviews and findings (not in repo)
  - Task flows and wireframes (not in repo)
  - Privacy comprehension test (not in repo)
  - Usability test plan and measured tasks, with thresholds per OD-10-08 (not in repo)
  - Content glossary for governance and cryptography terms (section 8 is the starting list)
  - Error-state and dispute-state designs (see REQ-017)
- **Independent review:** Plain-language and privacy-claim review of member text by someone outside the design work [UNVERIFIED reviewer role].
- **Release-blocking criteria:** Any Must requirement failing; any member text claiming more than QV-07 or QV-16 support; a choice shown by default on confirmation; resubmission allowed in "Unknown outcome"; any state from section 3 missing; any failing QV-13 check on a flow.

## 11. Constraints and assumptions

- **Constraint:** No ballot protocol is selected (QV-16 §9). Verification and status copy is conditional on QV-05.
- **Constraint:** MVP boundary is open (QV-02). Screens are specified for the full capability set; the MVP subset is marked when QV-02 decides.
- **Assumption to validate:** Members use phones or laptops, and connectivity may be intermittent (README principle 6). Not yet validated.
- **Assumption to validate:** Groups may use real names or pseudonyms under group policy (charter assumption 3). Not yet validated.
- **Assumption to validate:** Members are non-specialists (OD-10-01).

## 12. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 13. Open decisions

Each decision lists the original question, options, a recommendation, and an owner.

### OD-10-01 — Member's minimum technical skill
- **Question:** What is the member's minimum technical skill?
- **Options:** (a) Design for a member with no cryptography or command-line knowledge; (b) design for technically experienced members.
- **Recommendation:** Proposed: (a). Alternative: (b) only if QV-00 selects a technical target group.
- **Owner:** Project owner

### OD-10-02 — Device and connectivity conditions
- **Question:** Which device and connectivity conditions are common?
- **Options:** (a) Phone-first with intermittent connectivity; (b) desktop-first; (c) equal priority.
- **Recommendation:** Proposed: (a) as the design baseline, until research confirms it. Alternative: (c).
- **Owner:** Project owner

### OD-10-03 — Cryptographic detail in main flow versus audit view
- **Question:** How much cryptographic detail belongs in the main flow versus an audit view?
- **Options:** (a) Plain main flow, with detail in an audit view linked from confirmation; (b) detail in main flow; (c) no detail in the UI.
- **Recommendation:** Proposed: (a). Alternatives: (b) for technical groups; (c) is weaker for verification.
- **Owner:** Project owner, with QV-16 reviewer for technical accuracy

### OD-10-04 — Real-name or pseudonymous display
- **Question:** Should users choose real-name or pseudonymous display per group or per decision?
- **Options:** (a) Group setting, fixed before the decision opens; (b) member chooses per decision; (c) member chooses per account.
- **Recommendation:** Proposed: (a), so rules stay visible before voting (QV-03). Alternative: (b) if QV-03 permits changes before open.
- **Owner:** Project owner, after QV-03 and QV-04 decisions

### OD-10-05 — Ballot change or withdrawal before close
- **Question:** Can ballots be changed or withdrawn before close (QV-02 open question)?
- **Options:** (a) One-time submission; (b) revocable until close; (c) organizer sets per decision.
- **Recommendation:** Proposed: (a) as the default UI until QV-03 selects otherwise. Alternatives: (b) or (c), with changes shown per REQ-010.
- **Owner:** Project owner, with QV-03

### OD-10-06 — Confirmation content and inclusion reference
- **Question:** What does the confirmation show, and can it support an inclusion check without revealing the choice?
- **Options:** (a) Status plus non-revealing reference usable for an inclusion check; (b) status only; (c) receipt that encodes the choice (not recommended: usable for coercion).
- **Recommendation:** Proposed: (a) if QV-05 supports inclusion evidence; otherwise (b).
- **Owner:** Project owner, with QV-05 owner

### OD-10-07 — Draft persistence and offline voting
- **Question:** Are drafts saved, and can a member vote offline?
- **Options:** (a) No draft persistence; a closed page loses the draft; (b) encrypted local draft with explicit opt-in and a shared-device warning; (c) offline ballot queue.
- **Recommendation:** Proposed: (a) until QV-08 decides on offline participation. Alternative: (b).
- **Owner:** Project owner, with QV-08 owner

### OD-10-08 — Comprehension and usability thresholds
- **Question:** What thresholds define success for comprehension and measured tasks? (charter success measures are open)
- **Options:** (a) Set numeric thresholds now; (b) set them after the first research round; (c) leave them to QV-11.
- **Recommendation:** Proposed: (b). Define measured tasks now; record thresholds in QV-11 with the research result.
- **Owner:** Project owner

### OD-10-09 — Member acceptance of rules
- **Question:** Must a member accept the rules before a ballot? (Needed for REQ-019.)
- **Options:** (a) Required acceptance, recorded against the rules version; (b) notice only, no acceptance record.
- **Recommendation:** Proposed: (a). Alternative: (b) if QV-03 treats the notice as sufficient.
- **Owner:** Project owner, with QV-03
