# QV-03 — Governance and Policy

**Module ID:** `product-policy`  
**Status:** Framework  
**Owner:** Project owner (to be recorded)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-02 (depends on); QV-04, QV-05, QV-06, QV-07 (depend on this)  
**Objective:** Specify which governance rules a group may configure, how they are made visible, and how disputes are handled.

## Scope

### In scope
- Versioned rule set for each decision, visible before it opens
- Decision lifecycle and allowed transitions
- Roles and authority for each action
- Challenge, recount, and dispute handling for published results

### Out of scope (non-goals)
- Vote method and cryptographic protocol (QV-05)
- Membership and identity rules (QV-04)
- Legal validity of any decision; QuietVote is scoped to internal decisions in voluntary organizations
- Group bylaws or constitutions beyond the configurable settings listed here
- Deciding disputes over group outcomes; QuietVote keeps the record and runs the configured process, but does not decide the outcome

## Decision lifecycle to specify

Proposed stages: draft → review → scheduled/open → closed → tallying → published → challenged/resolved → archived. Confirm or replace this lifecycle. Define valid transitions, authorized roles, deadlines, and immutable records for each transition.

Proposed additions: **Canceled** is a terminal state reachable from Review, Scheduled, and Open. **Paused** is not in the MVP (D-03-7).

### Transitions

| From | To | Trigger | Allowed role | Immutable record | Failure behavior |
|---|---|---|---|---|---|
| Draft | Review | Organizer submits a complete rule version | Organizer | Version ID, actor, time | Incomplete rule fields block submission |
| Review | Scheduled | Review period has ended; organizer sets open time | Organizer | Version ID, open and close times | Blocked if any required field is empty |
| Review | Draft | Organizer withdraws for edits | Organizer | Reason | New version required before resubmission |
| Scheduled | Open | Open time reached | System | Version ID, eligibility snapshot hash | If the snapshot fails, state stays Scheduled and an admin is alerted; no partial open |
| Open | Open (extended) | Close time moved later | Organizer | Old and new close time, reason | Shortening is rejected |
| Open | Closed | Close time reached; or early close if the rule version permits | System; organizer for early close | Close time, actor if manual | Submissions after close are rejected |
| Open | Canceled | Cancellation with reason | Organizer; admin for emergency termination | Actor, reason | No tally is published |
| Closed | Tallying | Automatic | System | Tally start time | Retried; no ballot changes are possible |
| Tallying | Published | Tally and evidence complete | System | Result hash, evidence references | Stays in Tallying and alerts an admin; no partial publication |
| Published | Challenged | Member files a challenge in the window | Member or observer | Challenge record | Late challenge is rejected |
| Challenged | Resolved | Reviewer decides | Reviewer (see dispute rule) | Decision and reason | Outcome is "confirmed" or "corrected"; a correction creates a new published result version |
| Published or Resolved | Archived | Challenge window ends with no open challenge | System | Archive time | Open challenge blocks archiving |
| Canceled | Archived | Retention period ends | Admin | Archive time | None |

## Policy topics

- Who may create proposals and ballots
- Required review and amendment periods
- Eligibility snapshot or eligibility-at-vote-time rule
- Quorum and participation thresholds
- Vote method, tie handling, abstention, and invalid ballot handling
- Whether voting is one-time, revocable, or changeable before close
- Extensions, pauses, cancellation, and emergency termination
- Result disclosure and audit windows
- Challenge, recount, and appeal procedure
- Member notice and consent to published rules
- Group-specific policy versus platform-enforced constraints

### Proposed positions

| Topic | Proposed position | Alternatives | Decision |
|---|---|---|---|
| Who creates proposals and ballots | Organizers, granted by an admin, create and edit. Members may propose text only if group policy enables it (default off). | Members may always propose; admins only | D-03-1 |
| Review and amendment periods | Organizer sets the review length per decision. The platform enforces a minimum set by the owner. Numeric minimum: not set; [UNVERIFIED] no basis in repo. | Fixed platform value; no minimum | D-03-2 |
| Eligibility rule | Snapshot at open time. Members who join after open cannot vote. | Eligibility at vote time (more exposure to late changes) | D-03-3 |
| Quorum and thresholds | Optional per decision; set before open; evaluated against the snapshot. Below quorum is reported as "quorum not met", never as passed. | Mandatory quorum by group type; no quorum | D-03-4 |
| Ties, abstention, invalid ballots | Single-choice majority. A tie is reported as a tie; no automatic tiebreak. Abstentions count toward participation, not option totals. Invalid ballots are rejected at submission and not counted. | Casting vote for a chair (requires disclosure); re-vote | D-03-5 |
| Vote changes before close | None in MVP; one submission per eligible member. | Revocable until close (requires QV-05 support) | D-03-6 (same as D-02-6) |
| Extensions, pauses, cancellation, termination | Organizer may extend before close, never shorten. Cancel before close with reason. Pause not in MVP. Emergency termination by admin only, with reason; no tally is published. | Pause with recorded end time; no emergency stop | D-03-7, D-03-8 |
| Result disclosure and audit windows | At close: counts, participation, quorum status, rule version, evidence level. No individual ballots. Challenge window per decision, subject to the minimum in D-03-2. | Results only after the window ends | D-03-2 |
| Challenge, recount, appeal | Member or observer challenges with reason within the window. Recount re-runs the tally from published evidence; it is not a re-vote. The reviewer is an admin not involved in the decision; one appeal to a second reviewer named in group policy. | External arbitrator named by the group | D-03-11 |
| Member notice and consent | Members see the rule version before their first submission and record acknowledgment of that version ID. | Acknowledge once per organization | Proposed as stated (QV-03-REQ-004) |
| Group vs platform | Platform enforces invariants: no edits after open, role separation, append-only audit log, no organizer ballot access. Groups configure timing, quorum, review, and challenge rules within those limits. | Groups configure invariants | Proposed as stated |

## Rule transparency requirements

Before a ballot opens, participants should be able to inspect:

- The proposal text and its version
- Who is eligible and the eligibility cutoff
- Voting method and any weighting
- Opening and closing conditions in the member's local context
- Quorum and pass/fail thresholds
- Whether votes may be changed
- What is revealed during and after voting
- Available verification and dispute process

Define how QuietVote records acceptance of rules and protects against silent changes after opening.

Proposed: each rule version gets an ID; members record acceptance of that ID before first submission; any change after open is a new amendment visible to all members, and only where D-03-9 and QV-03-REQ-005 allow it.

## Roles and authority matrix

Roles are separate. A person who holds more than one role keeps the most restrictive rule for ballot access.

| Action | Member | Organizer | Admin | Observer | Platform operator |
|---|---|---|---|---|---|
| View published rules | Yes | Yes | Yes | Yes | Yes |
| Create/edit proposal | Propose text only if policy enables it | Yes, in Draft and Review only; each save is a new version | No | No | No |
| Set group policy and membership | No | No | Yes; cannot change ballot options or rule text after open | No | No |
| Open/close ballot | No | Schedule and early close if the rule version permits | Emergency termination only | No | No |
| View individual choice | Own submission status; own choice only if QV-05 supports it | No | No | No | No |
| Read ballot contents, any form | No | No | No | No | No (not assumed; QV-07 to confirm) |
| Verify tally evidence | Yes | Yes | Yes | Yes | Yes |
| File challenge | Yes, in window | No | No | Yes, in window | No |
| Resolve challenge | No | No, not for own decisions | Yes, if not involved in the decision | No | No |
| Export/delete records | Own participation data, per QV-06 | Export decision records | Export and deletion, per QV-06 | No | Runs export and deletion on instruction; no independent authority |

## Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-03-REQ-001 | The system shall version every rule set, and shall make a published version immutable. | Must | Editing a published version is rejected; any change creates a new version ID. | Unit test |
| QV-03-REQ-002 | The system shall allow only the transitions in the transitions table, and reject and log every other transition. | Must | A test enumerates every state pair; only listed transitions succeed. | Unit test; integration test |
| QV-03-REQ-003 | The system shall require all rule fields listed under Rule transparency before a decision can open. | Must | Opening with any field empty is rejected and names the field. | Unit test |
| QV-03-REQ-004 | The system shall record each member's acceptance of a rule version before their first submission. | Must | Submission without a recorded acceptance is rejected; the record references the version ID. | Integration test |
| QV-03-REQ-005 | The system shall not change ballot options, rule text, or close time (except by extension) after a decision opens. | Must | Each such edit attempt is rejected for every role; test covers organizer and admin. | Integration test; security test |
| QV-03-REQ-006 | The system shall fix the eligible list at open time as the snapshot, and not let members added after open submit. | Must | A member added after open cannot submit; a member in the snapshot can. | Integration test |
| QV-03-REQ-007 | The system shall compute quorum and thresholds only from the rule version and snapshot, and report "quorum not met" when quorum fails. | Must | Test cases below, at, and above quorum produce the expected status; no winner is reported below quorum. | Unit test |
| QV-03-REQ-008 | The system shall report ties and abstentions as defined in the policy, and shall show counts for every option. | Must | A tied result shows status "tie" and no winner; abstentions do not change option totals. | Unit test |
| QV-03-REQ-009 | The system shall record actor and reason for each cancellation or termination, and publish no tally for a canceled or terminated decision. | Must | Canceled decision has no tally value in any published view; audit entry exists. | Integration test |
| QV-03-REQ-010 | The system shall allow an organizer to extend close time, never shorten it, and notify eligible members of the change. | Should | Shortening is rejected; each eligible member receives a notice. | Integration test |
| QV-03-REQ-011 | The system shall accept challenges only within the challenge window, keep the result marked "challenged" until resolution, and archive only when no challenge is open. | Must | Challenge at the window boundary behaves as specified; archive is blocked while a challenge is open. | Integration test |
| QV-03-REQ-012 | The system shall prevent a reviewer from resolving a challenge on a decision they organized or were named in. | Must | Organizer attempt to resolve own decision is rejected; audit entry recorded. | Security test |
| QV-03-REQ-013 | The system shall support a recount that re-runs the tally from published evidence and reports whether it matches the published result. | Must | Recount on unchanged evidence returns an identical result; altered evidence returns a mismatch. | Integration test |
| QV-03-REQ-014 | The system shall enforce the authority matrix in this document for every role and action. | Must | A permission test covers every cell; each denied action returns an error and writes no state. | Security test |
| QV-03-REQ-015 | The system shall label each rule field as group-configured or platform-enforced on the rules view. | Should | Every field on the rules view carries one label; no unlabeled fields. | Review; E2E test |

## Data and trust boundaries

- **Data handled:** rule versions, acceptance records, eligibility snapshot hash, challenge records, resolution decisions, audit events. No ballot choices.
- **Trust boundaries:** the organizer is trusted with rules and timing, not with choices. The admin controls membership and policy but not ballots. The platform operator is not assumed to have ballot access; QV-07 decides.
- **Privacy:** acceptance and challenge records are visible to the group. Whether non-members see them is open (D-03-10).

## Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Silent rule change after open | Organizer or admin | Unfair outcome | Immutable versions; QV-03-REQ-005 | Depends on implementation coverage |
| Late member added to electorate | Admin after open | Skewed result | Snapshot at open (QV-03-REQ-006) | Only if D-03-3 is changed |
| Challenge flooding | Member or observer | Result delayed indefinitely | Per-decision challenge limit (D-03-2) | Limit not yet set |
| Organizer resolves own challenge | Organizer | Self-review | QV-03-REQ-012 | Relies on correct role assignment |
| Stalled tally | Failure in tally step | Result withheld | Stays in Tallying; admin alerted | Withholding is visible but not prevented |
| Selective cancellation | Organizer | Unwanted result avoided | Cancellation needs reason; recorded; visible to members (QV-03-REQ-009) | Organizer can still cancel for stated reasons |

## Dependencies

- **Upstream:** QV-02 (product requirements).
- **Downstream:** QV-04 (eligibility snapshot), QV-05 (vote method and changes), QV-06 (retention), QV-07 (threats), QV-09 (contracts for lifecycle events), QV-11 (test gates).

## Verification

- Every requirement has a method above. Lifecycle and authority tests (QV-03-REQ-002, QV-03-REQ-014) are release-blocking.
- Policy wording is reviewed with a non-technical organizer before the rules view is finalized.
- Recount (QV-03-REQ-013) is tested against recorded evidence from a dry-run decision before release.

## Open questions

- What voting and quorum rules are mandatory for the first release?
- Which policy settings are unsafe or too complex to expose?
- Can group administrators change eligibility after opening?
- How are minority reports, abstentions, and tied results handled?
- Who decides a dispute, and can that decision be appealed?

Mapping to decisions: Q1 → D-03-4, D-02-5; Q2 → D-03-5, D-03-7; Q3 → D-03-9; Q4 → D-03-5; Q5 → D-03-11.

## Open decisions

| ID | Question | Options | Proposed recommendation | Owner |
|---|---|---|---|---|
| D-03-1 | Who may create proposals and ballots? | Organizers only; members if policy allows; any member | Proposed: organizers granted by an admin; members may propose text only if policy enables it | Project owner |
| D-03-2 | What are the minimum review period and challenge window, and the challenge limit? | Fixed platform minimum set by owner; group-only values; no minimum | Proposed: platform-enforced minimum set by owner; numeric values not set here [UNVERIFIED: no basis in repo] | Project owner |
| D-03-3 | Eligibility snapshot or eligibility at vote time? | Snapshot at open; eligibility at vote time | Proposed: snapshot at open | Project owner |
| D-03-4 | Is quorum mandatory? | Optional per decision; mandatory by group type; none | Proposed: optional per decision; below quorum reported as "not met" | Project owner |
| D-03-5 | Tie, abstention, and invalid-ballot handling | Tie reported with no tiebreak; casting vote; re-vote | Proposed: tie reported; no automatic tiebreak; abstentions count toward participation only; invalid ballots rejected and not counted | Project owner |
| D-03-6 | Can members change or withdraw a vote before close? | No change; revocable until close (needs QV-05 support) | Proposed: no change in MVP (same question as D-02-6) | Project owner |
| D-03-7 | Is pausing in the MVP? | Not in MVP; pause with recorded end time | Proposed: not in MVP | Project owner |
| D-03-8 | Who may terminate a decision in an emergency, and how is it handled? | Admin only; any organizer; two-person rule | Proposed: admin only, with reason; members notified; no tally published | Project owner |
| D-03-9 | Can admins change eligibility after opening? | No changes; removals only; additions and removals | Proposed: no additions after open; removals only with a recorded reason that appears in the result; quorum still computed on the snapshot | Project owner |
| D-03-10 | Who may see acceptance and challenge records? | Group members only; observers; public | Proposed: group members and observers; not public | Project owner |
| D-03-11 | Who decides disputes, and is there an appeal? | Admin not involved, plus one appeal to a second reviewer; external arbitrator; group vote | Proposed: uninvolved admin decides; one appeal to a second reviewer named in group policy; QuietVote records but does not decide outcomes | Project owner |

Approval: this document stays at Framework until the project owner's review is recorded in the decision log.
