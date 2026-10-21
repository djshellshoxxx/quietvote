# QV-06 — Privacy and Data Lifecycle

**Module ID:** `security-privacy` (cross-cutting; enforced in M8, M9, M10)
**Status:** Draft
**Owner:** Privacy lead (project owner until appointed)
**Last reviewed:** 2026-10-21
**Related specs:** QV-00 (§5 privacy properties), QV-03 (disclosure and retention fields), QV-04, QV-05 (§5 who-learns-what), QV-07, QV-08, QV-12; ADR-001, 005, 007, 008, 009, 013

*This document is an engineering specification, not legal advice. Statements about GDPR concepts are orientation for groups and implementers; the controlling legal analysis belongs to each group and its counsel.*

## 1. Objective

Inventory every personal and decision data item QuietVote creates, classify it, justify and minimise it, define retention and deletion, define how subject rights requests are handled given an **append-only public log**, mitigate re-identification in small groups, and fix the exact privacy claims (and non-claims) the project may make.

## 2. Scope

**In scope:** server, client, trustee, steward and export data; metadata and logs; backups; notifications; telemetry; subject-rights handling; small-group risks; claims.
**Out of scope:** data held by groups outside QuietVote (member lists, chat), operator's host-level logs outside the application (documented as operator responsibility in QV-12), legal advice.

## 3. Data inventory and classification

### 3.1 Classes

| Class | Meaning | Examples |
|---|---|---|
| **C0 Public-permanent** | Readable by any observer once published; designed to be non-erasable (append-only log, ADR-007) | Voter public keys, ciphertext ballots, STHs, tally |
| **C1 Group-visible** | Visible to roll members (or stewards), not published to the world by default | Labels, proposal bodies, challenge bodies |
| **C2 Participant-only** | Visible to the data subject only | Receipts, local preferences |
| **C3 Secret** | Confidential keys/credentials | Trustee shares, voter keys, invite codes |
| **C4 Transient** | In memory only, never persisted | IP address during a request, session nonces |

### 3.2 Inventory

Columns: Linkability = what the item can be linked to by whom.

| ID | Data item | Purpose | Source | Class | Who can see it | Linkability | Retention (§5) | Deletion behaviour |
|---|---|---|---|---|---|---|---|---|
| D01 | Voter public key `pk` (roll, ballot signer) | Eligibility, ballot authentication | Voter client | C0 | Anyone with log access (members-only during open if `log_read_during_open = members`) | pk ↔ ballots, timing, ballot count (public); pk ↔ person only via label/steward knowledge | Permanent in log | Cannot be erased from log; mitigations §7.3 |
| D02 | Display label (pseudonym) | Humans recognise members; roll review | Voter at enrollment | C1 | Roll members (default), stewards, operator | label ↔ pk; label ↔ person socially | While member + 12 months after leaving (rule) | Deleted from mutable store; salted label hash remains in log (see §7.3) |
| D03 | Salted label hash in `member.enrolled` (`SHA-256(group_salt ‖ label)`) | Tamper-evidence of enrollment | Derived | C0 | Public | Not dictionary-guessable without the group salt (C1) | Permanent | Not erasable |
| D04 | Invite code hash | Single-use enrollment | Steward-generated | C3 | Operator DB | none after use | Delete 30 d after redemption/expiry | Hard delete |
| D05 | Invite code (plaintext) | Delivered to invitee | Steward UI | C3 | Steward, invitee | — | **Never stored server-side**; shown once | n/a |
| D06 | Contact handle used to send an invite | Delivery | Steward off-platform (or webhook) | C3 | Steward / webhook target | person | Not stored by QuietVote; webhook transient ≤ 24 h | Auto-purge |
| D07 | Voter master seed / secret key | Sign and (Phase 2) derive tokens | Voter client | C3 | Voter only | — | Device lifetime | Voter deletes; no escrow |
| D08 | Key backup file / paper code | Recovery | Voter | C3 | Voter | — | Voter-controlled | Voter |
| D09 | Enrollment PoP, approver signatures | Audit | Client / stewards | C0 | Public | pk ↔ steward ids | Permanent | Not erasable |
| D10 | Member status transitions (suspend/revoke/rotate/amend) | Audit | Stewards / voter | C0 | Public | pk ↔ reason code (no free text in log) | Permanent | Not erasable; reason codes enumerated to avoid sensitive text |
| D11 | Proposal text and versions | Deliberation | Proposers | C1 (hash C0) | Roll members (default) | proposer pk | Group lifetime | Body deletable after FINAL + retention; hash stays |
| D12 | Group rules, manifest | Rules transparency | Stewards | C0 | Public | steward keys | Permanent | Not erasable |
| D13 | Ballot envelope (ciphertext, proofs, sig, `ballot_id`) | Casting and verification | Voter client | C0 | Public | pk, time (coarse), count; content hidden unless ≥ t trustees collude | Permanent | Not erasable |
| D14 | Receipt, tracking code, inclusion proofs | Individual verification | Server → voter | C2 | Voter (local) | ballot_id ↔ pk (already public) | Voter-controlled | Voter deletes |
| D15 | Spoiled ballot openings | Cast-as-intended audit | Voter | C0 | Public | pk? Audit requests need not be signed by voter key (`ballot.spoiled` unauthenticated except rate limit) | Permanent | Not erasable; contains test selections only |
| D16 | Trustee key share | Threshold decryption | DKG | C3 | Trustee | trustee pk | Until FINAL + audit window (default 30 d), then destroy | Secure erase + signed attestation |
| D17 | DKG transcript (public commitments, encrypted shares) | Verify joint key | Trustees | C0 | Public | trustee pks | Permanent | Not erasable |
| D18 | Decryption shares + proofs | Verify tally | Trustees | C0 | Public | trustee pk | Permanent | Not erasable |
| D19 | Aggregate, tally, report | Result | System | C0 | Public | — | Permanent | Not erasable |
| D20 | Challenge body and attachments | Disputes | Members | C1 (hash C0) | Roll members, arbiters | challenger pk/label | FINAL + 12 months | Body deleted; hash and decision remain |
| D21 | Signed tree heads, witness cosigs | Log integrity | Log | C0 | Public | — | Permanent | Not erasable |
| D22 | IP address, TLS metadata, User-Agent | Transport | Network | C4 | Operator process memory | person (via ISP) | **Not persisted** | n/a |
| D23 | Rate-limit counters | Abuse control | Server | C4 | Operator process | `HMAC(daily_key, IP)` bucket, in memory | ≤ 10 min, memory only | Auto-expire |
| D24 | Application logs (route, status, latency, request-id, error class) | Operations | Server | C3 (operator-only) | Operator | no IPs, no pk, no ballot_id | 14 days | Rotation |
| D25 | Aggregate metrics (counts, histograms) | Health | Server | C3 | Operator | none (no per-user labels) | 90 days | Rotation |
| D26 | Session nonces / CSRF tokens | Request integrity | Server | C4 | Server | — | ≤ 1 h memory | Auto-expire |
| D27 | Backups of DB | Recovery | Operator job | C3 (encrypted) | Operator | contains D01–D03, D09–D13, D20 etc. | 30 days rolling | Expiry; restore must re-run retention jobs |
| D28 | Export bundle | Exit, audit, verification | Operator / steward | C0 + C1 (group choice) | Whoever receives it | as source | Recipient-controlled | Recipient |
| D29 | Client local storage (key wrap, receipts, UI prefs) | UX | Client | C2/C3 | Voter | — | Until cleared | Voter / browser |
| D30 | Steward/group signing key | Sign rules/manifest | Steward | C3 | Steward holders | steward pk | Steward-controlled | Rotation by rules vote |
| D31 | Crash/diagnostic reports | Debugging | Client | C4 | **None by default** (opt-in local-only copy-paste) | — | Not collected | n/a |
| D32 | Notification webhook URLs / SMTP addresses (optional feature) | Reminders | Steward config | C3 | Operator | person if addresses | Until the send job completes + 24 h | Auto-purge |

### 3.3 What is deliberately *not* collected
Real names, email addresses, phone numbers, government IDs, IP addresses (persisted), device fingerprints, browser user-agents, analytics identifiers, location, third-party cookies. There are no third-party scripts, fonts, analytics or CDNs (ADR-009; QV-02-REQ-076).

## 4. Minimisation principles and design rules

1. **Separation:** identity-like data (labels, contacts) lives in mutable C1/C3 stores; the log carries only keys and hashes. Ballot content is never stored in plaintext anywhere.
2. **No ballot-to-person mapping** exists in any store; the only linkage is `pk ↔ ciphertext` (public, in Phase 1) which is unlinkable to content without ≥ t trustees.
3. **Coarse time:** log entries for ballots carry timestamps rounded to the minute; STH carries a precise server time for close verification only (QV-03 §5.5).
4. **No free-text on the log:** member-status entries carry enumerated reason codes only; free text lives in C1 stores (challenge bodies, evidence) and is deletable.
5. **Short-lived crypto material:** per-election trustee shares and (Phase 2) registrar keys are destroyed after the audit window (ADR-013).
6. **Purpose limitation:** operational data (D24, D25) is not used for any purpose beyond operation; no telemetry leaves the server (no phone-home).
7. **Defaults are the safest values;** relaxation requires explicit steward choice recorded in rules/manifest.

## 5. Retention schedule (profile `default-v1`)

Retention clocks reference election lifecycle (QV-03 §5): **FINAL** = `election.final` entry.

| Data | Retention | Trigger | Mechanism | Verification |
|---|---|---|---|---|
| Log artifacts (C0 items D01, D03, D09, D10, D12, D13, D15, D17–D19, D21) | Permanent while the group exists; copies in export/mirrors persist outside operator control | — | Append-only; `archive` marks read-only | Log never shrinks (consistency) |
| Labels (D02) | Membership + 12 months | Revoked/left | Retention job overwrites then deletes row | Job log entry (hash only) |
| Invite code hashes (D04) | 30 days | Redeemed or expired | Job | Test |
| Proposal bodies (D11) | FINAL + 24 months (group may choose permanent) | FINAL | Job deletes body, keeps hash | Test |
| Challenge bodies (D20) | FINAL + 12 months | FINAL | Job | Test |
| Trustee shares (D16) | FINAL + 30 days (audit window), or earlier if `ANNULLED/CANCELLED` | Event | Trustee CLI `qv trustee destroy`; signed attestation logged | Attestation count = n |
| Phase 2 registrar key | End of issuance window + 24 h | Event | Registrar tool + attestation | Same |
| Operational logs (D24) | 14 days | Time | Rotation | Test |
| Metrics (D25) | 90 days | Time | Rotation | Test |
| Rate counters, sessions (D23, D26) | ≤ 10 min / ≤ 1 h; memory only | Time | TTL | Test (restart clears) |
| Backups (D27) | 30 days rolling | Time | Rotation | Restore drill (QV-12) |
| Notification contacts (D06, D32) | Delivery + 24 h | Send complete | Job | Test |
| Receipts (D14) / local data (D29) | Voter-controlled | — | Client "clear data" | — |

Groups may only choose **shorter** retention for mutable C1/C3 items or **longer** for proposals (platform floor/ceiling in QV-03 `retention_profile`). A rules change that shortens retention is a `rules` decision; one that lengthens retention beyond the profile is `entrenched` (QV-03 §6.2) because it reduces privacy.

## 6. Disclosure controls (summary of rule fields)

| Control | Values | Default | Effect |
|---|---|---|---|
| `disclosure.roll_labels` | members / public / hidden | members | Who sees labels (keys always logged) |
| `disclosure.log_read_during_open` | public / members | public | `members`: log readable only with a roll-key-signed request while OPEN; becomes public at CLOSED. Reduces outside inference about turnout; independent monitors lose live visibility (trade-off) |
| `disclosure.result_detail` | full_counts (MVP) / outcome_and_turnout (Phase 2, needs comparison proofs) | full_counts | |
| `elections.min_counted_ballots` | integer ≥ 3 (QV-ADR-021) | 5 if roll ≥ 8 else 3 with warning | If fewer counted voters at close, trustees do not decrypt (`FAILED(PRIVACY_MIN)`), preventing a one- or two-person tally from revealing individual votes |
| `elections.revoting` | allowed / single | allowed | `allowed` exposes revote counts (D13) |

(Fields `elections.min_counted_ballots` and `disclosure.log_read_during_open` are proposed additions to QV-03 §3.2; see Proposed ADRs.)

## 7. Deletion, export, and subject-rights handling

### 7.1 Actors under privacy law (orientation)
- **Group (stewards on its behalf)** determines purposes (running its decisions) → acts as **controller** of roll/label/proposal data.
- **Operator** running the server for the group → **processor** if a separate person/entity from the group; if the stewards operate it themselves, same party.
- **QuietVote project / maintainers**: supply software only; with self-hosting they receive **no data** and are neither controller nor processor. A future maintainer-hosted offering makes the maintainer a processor and requires a data-processing agreement (QV-14).
- Voters are **data subjects**; trustees and stewards are also data subjects for their own keys/labels.

### 7.2 Request handling process

| Right (GDPR article, for orientation [1]) | MVP handling | Where | Target time |
|---|---|---|---|
| Access (Art. 15) | Member self-export (QV-02-REQ-071) covers D02, D09, D10, D14 for their pk; steward can query C1/C3 stores by label | Self-service | immediate; manual ≤ 30 days |
| Rectification (Art. 16) | Label change (C1 store + new `roll.labels` artifact); pk cannot be changed in log (use rotation) | Self-service | immediate |
| Erasure (Art. 17 [1]) | §7.3 | Steward/operator + member | ≤ 30 days |
| Restriction / objection (Arts. 18, 21) | Member can suspend self (stops future snapshot inclusion) | Self-service | immediate |
| Portability (Art. 20 [1]) | Export in JSON/NDJSON (open format) | Self-service | immediate |
| Automated decisions (Art. 22) | Not applicable: no profiling or automated decisions about people | — | — |

Requests are made to the **group's** contact (rules `contact`); the product provides the tools; the product cannot identify a requester beyond the key/label.

### 7.3 Erasure and the append-only log (honest limits)

1. **Mutable stores** (labels D02, proposal/challenge bodies D11/D20, invite hashes, notification data) are deleted on request/by schedule, with overwrite where the storage permits, and the job is logged (hash only).
2. **The immutable log** (D01, D03, D09, D10, D13) cannot be edited; doing so would break the tamper-evidence that is the product's purpose. What it contains is a **public key** and a **label hash**, not a name. Once the label mapping (D02) and any off-platform member list are deleted and the member rotated/revoked, the remaining public key is no longer linked to a person by QuietVote data; but it can remain *pseudonymous personal data* if someone else can link it (e.g. via knowledge of the group), and an unsalted label hash would allow dictionary re-linking if the label was guessable. Mitigation: the label hash uses a **per-group random salt held in the C1 store** and deleted with the label (`label_hash = SHA-256(salt ‖ label)`), so deleting the mapping and salt makes the hash non-reversible by dictionary.
3. **Ballot content** is never stored in an identifiable form, so there is nothing to erase in plaintext; the ciphertexts remain and become permanently undecryptable once shares are destroyed (an *effective* form of deletion of content after FINAL + audit window).
4. **What we cannot promise:** deletion from other people's copies (exports, mirrors, witnesses). The notice (§10.3) says so before enrollment.
5. **Legal sufficiency** of this approach is a decision for the controller; the platform records the above in the privacy notice template and offers a "retire membership" flow (revoke + delete mapping + rotate to an unused key) that implements steps 1–2.
6. GDPR Art. 17(3) provides exceptions (e.g. legal claims, legal obligation); applicability depends on the group and jurisdiction `[UNVERIFIED — controller to confirm with counsel]`.

### 7.4 Organisation exit
Export (QV-02-REQ-070) produces the open-format bundle (C0 + C1 per `export.include_c1`, default yes for stewards). Importing elsewhere preserves verifiability. After a confirmed export, the operator deletes the instance data: DB, backups (within 30 days), and logs. Shred procedure in QV-12.

## 8. Roles, access, and operator constraints

| Role | Can access | Cannot access |
|---|---|---|
| Member | Own C2; C1 per policy; all C0 | Others' C2, C3 |
| Steward | C1, C3 for invites; enrollment state | Ballot content; trustee shares; voter keys |
| Trustee | Own share | Others' shares; voter keys |
| Operator | C0, C1 stored on server, C3 (invite hashes, ops logs), backups | Plaintext ballots; shares; voter keys; persisted IPs |
| Observer | C0 | C1–C3 |

Operator access is organisational; database encryption at rest is operator-configurable (default: filesystem-level, recommended) and is **not** relied upon for secrecy of ballots (they are already encrypted end-to-end).

## 9. Small-group re-identification risks and mitigations

Risks: (R1) exact totals reveal votes when N or turnout is small or results unanimous; (R2) public participation + timing reveals who voted when ("I just voted" correlations); (R3) revote counts reveal hesitation/pressure; (R4) labels or key reuse enable cross-group correlation; (R5) contact data for invites correlates people; (R6) rare ballot patterns (approval vectors) are fingerprints — but vectors are never published individually, only sums; (R7) split tallies across contests with few voters; (R8) collusion of the few: trustees ≥ t = a large share of a small group.

| # | Mitigation | Applies to | Status |
|---|---|---|---|
| M1 | `W-SMALL-ROLL` warning at manifest creation when N < 8 (QV-03 §4); UI shows "with this few voters, the published totals could reveal individual votes" | R1 | MVP |
| M2 | `min_counted_ballots`: refuse to decrypt below threshold (default 5 for N ≥ 8) | R1 | MVP |
| M3 | Pre-vote notice of unanimity disclosure: if everyone votes the same way, the result reveals everyone's vote | R1 | MVP |
| M4 | Optionally hide fine timing: ballot timestamps rounded to 1 min; receipts not published | R2 | MVP |
| M5 | `log_read_during_open = members` option | R2 | MVP |
| M6 | Labels default random pseudonyms (suggested generator); `unique_only` policy; real names discouraged | R4 | MVP |
| M7 | Per-group HKDF keys (QV-04-REQ-002) | R4 | MVP |
| M8 | No stored contacts; invites via links | R5 | MVP |
| M9 | Trustee selection guidance: trustees not > ⌊n/2⌋ from the same sub-group; n ≥ 3 | R8 | MVP |
| M10 | `outcome_and_turnout` result detail with comparison proofs | R1, R7 | Phase 2 |
| M11 | Participation privacy via blind tokens / ring signatures | R2, R3 | Phase 2/3 |
| M12 | Group guidance: avoid contests where the outcome would be unanimous or near-unanimous among few | R1 | Docs |

## 10. Privacy claims, non-claims, and notice

### 10.1 Claims permitted (Phase 1), each with test or review

| Claim | Condition | How tested |
|---|---|---|
| "Nobody, including the server operator and stewards, can read an individual ballot without cooperation of at least *t* trustees." | Honest client build; trustees not colluding | Crypto review (QV-11); code review: no plaintext path |
| "Everyone can verify the count." | Verifier run | Verifier tests |
| "Others can see **that** a member voted and how many times, not **how**." | Phase 1 | UI/doc text check |
| "QuietVote does not store your IP address, name or email by default." | Default config | Persistence audit (S10) |
| "The operator cannot change the rules of a running vote undetected." | Verifiers run | V1, V13 |

### 10.2 Non-claims (must appear in docs and UI where relevant)
- No anonymity of participation in Phase 1 (G-R1); no unlinkability of ballot to voter key.
- No protection against coercion or vote buying (G-C1); receipts and audit openings may be abused.
- No protection if the voter's device or the delivered JavaScript is compromised.
- No protection against ≥ t colluding trustees (G-S3).
- No long-term/post-quantum secrecy (G-L1, ADR-013).
- No network-level anonymity without Tor; ISP and network observers see that you connected.
- No guarantee that a person has only one key (steward trust, QV-04 §3.4).
- No erasure from the append-only log or from copies held by others.
- Small electorates and unanimous results can reveal votes through totals.
- No legal validity statement for any jurisdiction.

Forbidden words for Phase 1 marketing/UI: "anonymous", "untraceable", "unhackable", "tamper-proof" (use "tamper-evident"), "coercion-proof", "military-grade". Enforced by string lint (QV-02-REQ-082).

### 10.3 Privacy notice checklist and draft text (shown before enrollment and before the first ballot)

1. What we collect: your public voting key and the label you choose. Not your name, email or IP address.
2. Who can see it: everyone who can read the election log sees your key, when you voted (to the minute) and how many ballots you submitted; members see your label.
3. How your vote is protected: encrypted on your device; only a threshold of *t* of *n* trustees together could open individual ballots; the published result is the sum.
4. What cannot be hidden: that you voted (Phase 1); your choice if the group is very small or unanimous; anything if your device or the app code is compromised.
5. How long: table of §5 in two lines.
6. Your rights: how to export, change label, retire membership; what cannot be deleted (log) and why.
7. Who to ask: group contact `[rules.contact]`.
8. Verify, don't trust: how to run the verifier.

## 11. Requirements

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-06-REQ-001 | The system shall maintain this inventory as machine-readable `data-inventory.json` in the repo and fail CI if a schema column/field is not listed with a class. | Must | Adding an unlisted DB column fails CI | T |
| QV-06-REQ-002 | The server shall not persist IP addresses, User-Agent, or Referer in any store, log, metric label or backup by default. | Must | Persistence audit: marker IP/UA sent in 1,000 requests never appears in DB, logs, metrics, backups | T |
| QV-06-REQ-003 | No plaintext ballot, trustee share, voter secret key, or invite code shall be written to any server-side store. | Must | Marker scan of DB, logs, core dumps (test mode) | T |
| QV-06-REQ-004 | Retention jobs shall implement §5 for profile `default-v1`, run at least daily, log a content-free summary entry, and be idempotent. | Must | Time-travel test across all rows; second run no-op | T |
| QV-06-REQ-005 | Restoring a backup shall automatically trigger retention jobs before the service accepts writes. | Must | Restore of 31-day-old backup leaves no expired rows after startup | T |
| QV-06-REQ-006 | Trustee tooling shall implement share destruction with a signed attestation entry; manifest/verifier shall flag missing attestations after FINAL + audit window. | Must | Attestation count n; verifier warning otherwise | T |
| QV-06-REQ-007 | The log shall contain no free-text personal data; member-status reasons shall be enumerated codes. | Must | Schema validation rejects free text in log entry types | T |
| QV-06-REQ-008 | Label hashes shall use a per-group random salt held outside the log (§7.3). | Should | Deleting salt makes label dictionary check impossible in test | T |
| QV-06-REQ-009 | Ballot entry timestamps shall be rounded to 60 s granularity; STH retains exact time. | Should | Test | T |
| QV-06-REQ-010 | The system shall implement `elections.min_counted_ballots` and `W-SMALL-ROLL`. | Must | Trustee tool refuses decrypt below threshold; election ends `FAILED(PRIVACY_MIN)` | T |
| QV-06-REQ-011 | The system shall implement `log_read_during_open = members`, requiring a signed read request by a roll key and returning the full log to authorized members only. | Should | Unauthenticated read refused during OPEN; public at CLOSED | T |
| QV-06-REQ-012 | The system shall provide member export, label change, and "retire membership" flows (§7). | Must | Flows complete; mapping rows deleted; log entries only keys/hashes | T |
| QV-06-REQ-013 | The privacy notice (§10.3) shall be shown and its version recorded locally before enrollment and first cast; the text shall be generated from rules (retention, contact). | Must | UI test; version string in client store | U/T |
| QV-06-REQ-014 | All public claims shall be checked against §10.1/§10.2 before each release (claims checklist). | Must | Signed checklist in release notes | R |
| QV-06-REQ-015 | There shall be no outbound network connections from the server except those configured (webhook/SMTP/witness), and no telemetry. | Must | Egress test with network sandbox | T |
| QV-06-REQ-016 | Backups shall be encrypted at rest using an operator key; the key and backup rotation shall be documented. | Should | Backup file not readable without key | T/R |
| QV-06-REQ-017 | The export bundle shall exclude C3 items and (when configured) C1 items. | Must | Bundle scan | T |

## 12. Security and abuse cases

| Case | Attacker | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| DB dump by operator or thief | O, X | Roll, labels, invite hashes, ops logs exposed | Minimisation (no names/IPs), encryption at rest, short retention | Labels may identify people socially |
| Subpoena/compulsion of operator | State | Disclose stored data | Operator holds no secrets enabling ballot decryption; no IPs stored | Keys, labels and participation exist; trustees can be compelled |
| Log mining by outsiders | X | Infer who voted when | M4, M5, rounding | Phase 1 non-claim |
| Label dictionary attack on hash | X | Re-identify | Salted hash (REQ-008) | If salt kept |
| Metrics label leaking identity | Dev error | Privacy bug | Inventory CI (REQ-001), review | Human error |
| Backup resurrects deleted data | Ops | Violates deletion promise | REQ-005 | Operator copies of backups elsewhere |
| Support staff access | Operator | Over-collection | No support tooling with data access in MVP | — |

## 13. Interfaces and dependencies
Upstream: QV-03 (retention/disclosure fields), QV-04 (data created at enrollment), QV-05 (artifacts). Downstream: QV-08/09 (schema, endpoints), QV-10 (notice screens), QV-12 (jobs, drills), QV-11 (audit tests).

## 14. Open questions

| Question | Owner | Target | Proposed default |
|---|---|---|---|
| Should ballot entries omit voter pk during OPEN (members see only a rolling count)? | Protocol | v0.5 | No; verifiability needs pk; use `log_read_during_open` |
| Is a per-group random label salt compatible with third-party verification of `member.enrolled`? | Protocol | v0.5 | Verifier only needs hash existence, not label; OK |
| Minimum `min_counted_ballots` default (5)? | Privacy | pilot | 5 |
| Data protection impact assessment template for EU-based groups | Legal advisor | v0.9 | Provide template |
| Pseudonymous-data status under local law | Groups' counsel | — | Out of scope |

## 15. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## References (accessed 2026-10-21)

1. Regulation (EU) 2016/679 (GDPR): Art. 15 access, Art. 17 erasure, Art. 20 portability confirmed by search results summarising Chapter III (e.g. https://docs.tibco.com/pub/logcsgdpr/3.9.0/doc/html/GUID-BD1BAC43-264E-4C07-A8C4-4688FBA1758F.html); primary text at https://eur-lex.europa.eu/eli/reg/2016/679/oj — Art. 5(1)(e), 16, 18, 21, 22 and 17(3) cited from the author's knowledge `[UNVERIFIED against primary text in this session]`.
2. RFC 9162, Certificate Transparency Version 2.0, https://www.rfc-editor.org/rfc/rfc9162.html (append-only log; why entries cannot be edited).
3. QV-05 §5 for who-learns-what; QV-03 §3 for rule fields.

## Proposed ADRs

- **QV-ADR-P06-1 — Persist no IP/UA by default; rate limiting uses in-memory HMAC buckets keyed by a daily-rotated secret.**
- **QV-ADR-P06-2 — Log carries enumerated reason codes only; free text lives in deletable C1 stores.**
- **QV-ADR-P06-3 — Add `elections.min_counted_ballots` (privacy floor for decryption) and `disclosure.log_read_during_open` to the QV-03 rule schema.**
- **QV-ADR-P06-4 — Label hashes in the log are salted with a per-group deletable salt.**
