# QV-06 — Privacy and Data Lifecycle

**Module ID:** `security-privacy`  
**Status:** Framework  
**Owner:** Project owner (proposed; confirm)  
**Last reviewed:** Not yet reviewed  
**Related specs:** QV-04, QV-05, QV-07, QV-08, QV-09, QV-12, QV-16, QV-17

## 1. Objective

Inventory personal and decision data, minimize collection, and specify visibility, retention, export, and deletion.

- **Who needs it:** members (know what is held about them), organizers (know what a decision reveals), observers (know what they can check), operators (know what they must protect and delete).
- **Why:** privacy claims are only as good as the data inventory behind them. Every field, log, and backup must trace to a stated purpose.

## 2. Scope

### In scope
- Personal and decision data from identity, eligibility, ballot, audit, operations, and backups
- Visibility, retention, export, deletion, and notices
- Metadata and timing leakage

### Out of scope
- Ballot secrecy mechanics (QV-05, QV-16)
- Identity modes and eligibility rules (QV-04)
- Security controls generally (QV-07)

### Explicit non-goals and claims
- **Claimed (proposed, subject to QV-05 and QV-16 evidence):** ballot records carry no identity fields; no analytics run on ballot pages; retention and deletion are published per data class.
- **Not claimed:** anonymity, untraceability, coercion resistance, protection from a compromised device, protection from an operator with live access, or erasure of published artifacts.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Member | Understand and control own data | Enrolled or invited | Notice read; own records exported or deleted |
| Organizer | Know what a decision reveals | Decision drafted | Visibility and retention stated before opening |
| Observer | Check process and results | Granted by policy | Access to audit evidence per policy |
| Hosting operator | Keep service secure and running | Hosted or self-hosted (QV-08) | Access limited per Section 5 |
| Support staff | Resolve requests | Ticket open | Limited access; logged |

Journeys and failure behavior:

- **J1 Notice.** Member reads the privacy notice (Section 7) before participating. Failure: notice not shown, so no enrollment or ballot step.
- **J2 Export.** Member exports own records; group exports decision records. Failure: export incomplete, so the export names what is missing. Nothing is silently omitted.
- **J3 Deletion request.** Member asks for deletion. Failure: a record is held (for example, for audit), so the member sees which categories are kept and why.
- **J4 Exit.** Organization leaves the service. Failure: export fails, so exit pauses and no data is deleted.
- **J5 Suspected exposure.** Log or backup exposure suspected. Response follows QV-07; notification follows QV-12.

## 4. Data inventory

Complete one row per field or artifact, including derived data.

| Data item | Purpose | Source | Who can see it | Linkability | Retention | Deletion behavior |
|---|---|---|---|---|---|---|
| Account or credential identifier | Login, recovery, notices | Member or admin at enrollment | Member (own); admin in named mode; operator | High with ballot timing; must not appear in ballot records | Membership life plus grace period (OD-06-5) | Deleted on account removal; audit entries carry no ballot data |
| Eligibility status | Decide whether a member may submit | Group roster (QV-04) | Member (own); admin; observers see counts only | High; kept separate from ballot records | Decision life plus audit window (OD-06-5) | Removed with membership; roster kept in restricted form only |
| Decision manifest and rules | Show rules in force | Organizer, per QV-03 | Members, observers; public if group chooses | Low; names organizers in named mode | Life of decision evidence | Versioned; amended by new version, not deleted |
| Ballot ciphertext/record | Count and verify choices | Member's client | Per QV-05; no plaintext choice to organizers or operator by default | Must not link to identity or account ID | Audit window; permanent once published (QV-16) | Deleted only if the decision is cancelled and QV-05 permits; published items cannot be erased |
| Network and access metadata | Security, abuse prevention, operations | Web server, load balancer, client | Operator security staff only | High with login and submission times | Short rolling window (OD-06-3) | Automatic expiry; excluded from exports |
| Audit evidence | Show process ran as configured | System events, signed manifest, tally evidence | Members and observers per policy; operator | Must not join identity to ballot choice | Decision life; longer if published | Group copy deleted per policy; published copies permanent |
| Notification contact | Reminders, status messages | Member | Operator; organizer sees delivery counts only | High if reminders reveal participation | Until membership or contact ends | Deleted on request |
| Recovery records | Verify identity during recovery | Member and recovery staff | Recovery staff only | High if joined with ballot timing | Minimal period (OD-06-5) | Deleted after period; no ballot references |
| Telemetry and crash reports | Service health, bug fixing | Client and server | Engineering and operator | Must exclude form contents, choices, and identity-event links | Short (OD-06-3) | Automatic expiry; scrubbed before storage |
| Backups | Recovery from failure | All of the above | Operator only, restricted | Inherits sources | Backup expiry window (OD-06-4) | Deletions re-applied on restore |
| Derived tallies and counts | Show results and participation | Tally (QV-05) | Per decision rule | Small groups may reveal choices | Life of published result | Subject to suppression threshold (OD-06-7) |

## 5. Visibility and trust boundaries

| Actor | Identity records | Eligibility status | Ballot ciphertext | Ballot choice | Network metadata | Audit evidence |
|---|---|---|---|---|---|---|
| Member | Own only | Own only | Per QV-05 | Own choice, client-side | No | Per policy |
| Organizer | Named mode only | Per policy | No (encrypted) | No (QV-05) | No | Per policy |
| Observer | No | Counts only | Per QV-05 | No | No | Per policy |
| Hosting operator | Yes (stored) | Yes (stored) | Yes (encrypted) | Proposed: no | Yes, short retention | Yes |
| Support staff | Recovery only | No | No | No | No | No |
| Trustees (QV-16) | No | No | Shares only | Aggregate only | No | Share verification |

- Proposed: the hosting operator is inside the trust boundary; QV-07 confirms this (OD-06-8).
- Identity, eligibility, and ballot stores are separate systems with separate access roles.

## 6. Privacy requirements

- Collect only data tied to a documented need.
- Separate identity, eligibility, and ballot records where the protocol allows.
- Define what organizers, other members, seed/hosting operators, and support staff can see.
- Define metadata and timing leakage, including logs, backups, notifications, analytics, and crash reports.
- Publish retention periods and deletion consequences.
- Explain that immutable public artifacts may not be erasable after publication.
- Provide a data export and organization exit plan.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-06-REQ-001 | Each collected field shall map to a purpose in Section 4. | Must | Review finds no field without a row; schema tests reject fields absent from the inventory | Review; schema test |
| QV-06-REQ-002 | Ballot records shall not contain account identifiers, names, eligibility records, or network metadata. | Must | Ballot export contains none of these fields | Schema test; independent review |
| QV-06-REQ-003 | Ballot-submission logs shall not share a join key with identity or eligibility records. | Must | Schema review finds no common key; test join attempts fail | Architecture review; join test |
| QV-06-REQ-004 | Operators and support staff shall have only the access listed in Section 5. | Must | Access tests match the role matrix; out-of-role access is refused and logged | Access review; security test (QV-07) |
| QV-06-REQ-005 | No analytics or third-party scripts shall run on ballot pages. (Proposed.) | Must | Page scan of ballot and confirmation pages finds none | Automated page scan; review |
| QV-06-REQ-006 | Telemetry and crash reports shall exclude form contents, ballot choices, and identity-event links. | Must | Known test values injected into ballots and identifiers appear in no report | Security/privacy test |
| QV-06-REQ-007 | Each data class shall have a published retention period and deletion behavior before participation begins. | Must | Notice lists each class; configuration rejects a class without a period | Review; configuration test |
| QV-06-REQ-008 | Deletion shall reach live stores, exports, and backups within the backup window, and restores shall re-apply pending deletions. | Must | Test deletes a record, restores a backup, and confirms the record is absent | Integration test; recovery exercise (QV-12) |
| QV-06-REQ-009 | A deletion response shall list retained categories and the reason for each. | Must | Response lists every held category with a reason | UI test |
| QV-06-REQ-010 | The privacy notice shall cover every checklist item in Section 7 before participation. | Must | Each item is present; members in a usability test can state who sees what | Review; usability test |
| QV-06-REQ-011 | A group shall export all decision records in a documented format, and exit shall not delete data until the export is confirmed. | Must | Export round trip reproduces record classes and counts; exit is blocked when export fails | Integration test |
| QV-06-REQ-012 | Published artifacts shall carry only personal data the protocol requires, and the notice shall state they cannot be erased. | Must | Pre-publication scan finds no undeclared personal data; notice text is checked | Scan; review |
| QV-06-REQ-013 | Published tallies below the suppression threshold (OD-06-7) shall be withheld with a notice. | Should | Test with a below-threshold group shows the notice and no tally | Test |
| QV-06-REQ-014 | Reminders shall not reveal participation status to the sender. | Should | Organizer view and send logs show no per-member participation | Review; test |

## 7. Privacy notice checklist

Before participation, explain in plain language: data collected, who can see it, how ballots are protected, what cannot be hidden, how long data is retained, and how to ask questions or request deletion.

Notice text is drafted in QV-10 and must match the claim ledger (QV-16, Section 7).

## 8. Metadata and timing leakage

- **Timing:** login time versus submission time.
- **Access logs:** network address and device signals.
- **Notifications:** who received a reminder and when, which can show who has not voted.
- **Analytics and crash reports:** must not carry ballot or identity-event data.
- **Backups:** copy everything above, including what was meant to be short-lived.
- **Small groups:** tallies may reveal a likely choice.
- **Public artifacts:** timestamps and counts are permanent.

Proposed mitigations: separate retention per class; no analytics on ballot pages; uniform reminders (OD-06-6); batching or delay assessed with QV-16 issuer-timing review. Residual timing correlation is not eliminated.

## 9. Retention, export, and deletion

- **Retention:** set per data class (Section 4). Groups may shorten within platform limits (OD-06-5).
- **Deletion consequences:** removing identity records ends eligibility lookups and notices. It does not remove published ballots or public evidence. Members are told this before participating.
- **Export:** members receive their own records. Groups receive decision records (manifest, ciphertexts, audit evidence, tally) in a documented format.
- **Exit:** deletion starts only after a confirmed export. Public artifacts remain, and this is disclosed in advance.
- **Backups and logs:** deletion is honored at backup expiry or restore (QV-06-REQ-008). The technique is open pending QV-16 review (OD-06-4).

## 10. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Log join links IP or login time to a ballot | Operator; log access | Identity-to-choice inference | No join keys; separate retention (REQ-002, REQ-003) | Timing correlation remains |
| Reminders reveal who has not voted | Organizer or sender | Pressure outside the software | Uniform reminders (REQ-014, OD-06-6) | Members may still disclose |
| Deletion request used to suppress a member | Attacker impersonating member or admin | Member removed from records | Identity check on deletion; admin notice; QV-04 recovery rules | Admin deletion authority remains |
| Crash report contains choices | Client bug | Choice disclosure | Scrubbing (REQ-006) | Unknown bugs |
| Restored backup resurrects deleted data | Operator error | Privacy breach | REQ-008; restore drills | Depends on drill quality |
| Small-group tally reveals a likely choice | Observer, member | Inferred choice | Suppression threshold (REQ-013, OD-06-7) | Threshold may still leak |
| Full roster export | Admin or compromised account | Mass exposure | Role-limited export; logged | Admin authority |
| Published artifacts keep metadata | Any reader | Long-term linkage | Pre-publication scan (REQ-012) | Permanent once published |

## 11. Dependencies and interfaces

- **Upstream:** QV-04 (identity and eligibility records), QV-05 (ballot records), QV-07 (threat model), QV-16 (artifact design, claim ledger), QV-17 (credential linkability)
- **Downstream:** QV-08 (storage, hosting), QV-09 (export and deletion APIs), QV-10 (notice UI), QV-11 (privacy tests), QV-12 (deletion and backup operations)
- **Contracts (detailed in QV-09):** deletion request (scope, requester, outcome, retained categories); export manifest (record classes and counts).
- **Failure:** a failed deletion stays pending, is retried, is logged, and the member sees its state. A failed export blocks exit.

## 12. Verification

- **Unit/schema:** field-to-purpose mapping; ballot schema excludes identity fields.
- **Integration:** join attempts, deletion through backup restore, export round trip.
- **End-to-end:** notice before participation; deletion response; deletion request by a member.
- **Security/privacy:** log scans, telemetry scrubbing, page scans, access-role tests.
- **Independent review:** notice text and claim ledger.
- **Release-blocking:** any failing Must requirement; any join found between ballot and identity data.

## 13. Open questions

- Which data must persist to verify old results?
- Should audit data be group-controlled or publicly replicated?
- What is the minimum useful operational telemetry?
- How will backups and logs honor deletion commitments?
- What privacy claims can be independently tested?

## 14. Open decisions

| # | Question | Options | Recommendation | Owner |
|---|---|---|---|---|
| OD-06-1 | Which data must persist to verify old results? | Verification artifacts only; full operational record | Proposed: verification artifacts only; other records deleted at end of audit window | Project owner with QV-16 review |
| OD-06-2 | Is audit data group-controlled or publicly replicated? | Group-controlled; public replication; both | Proposed: group-controlled, with optional public release of verification evidence (noting it cannot be erased) | Project owner |
| OD-06-3 | What is the minimum useful operational telemetry, and how long are access logs kept? | Full request logs; health metrics only | Proposed: health metrics without per-member or per-decision identifiers; short-retention security logs. Durations [UNVERIFIED] | Project owner with QV-07 |
| OD-06-4 | How are backups and logs made to honor deletion? | Fixed backup expiry with deletion re-applied on restore; other technique | Proposed: fixed expiry window and re-applied deletion on restore; any other technique after QV-16 review | Project owner with QV-12 |
| OD-06-5 | What retention period applies to each data class? | Platform fixed values; group-chosen within platform limits | Proposed: platform sets a maximum per class; group may shorten. Values need legal input [UNVERIFIED] | Project owner with counsel |
| OD-06-6 | How are reminders sent? | Remind all eligible members; remind only non-voters | Proposed: remind all eligible members, without participation status | Project owner |
| OD-06-7 | What minimum group size applies to published tallies? | Fixed platform threshold; organizer sets; publish with warning | Proposed: fixed platform threshold, value set in QV-07 review | QV-07 owner |
| OD-06-8 | What access does the hosting operator have to network metadata? | No access; short-term security-only access | Proposed: security-only, short-term, never joined with ballot records | Project owner with QV-07 |
| OD-06-9 | Which privacy claims can be independently tested? | Every notice claim; only claims with test or review evidence | Proposed: only claims with evidence in the claim ledger | Project owner with QV-11 |
