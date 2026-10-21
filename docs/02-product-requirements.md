# QV-02 — Product Requirements

**Module ID:** `product-policy`
**Status:** Draft
**Owner:** Product lead (project owner until appointed)
**Last reviewed:** 2026-10-21
**Related specs:** QV-00 (charter, targets), QV-01, QV-03 (rules/lifecycle), QV-04 (identity), QV-05 (protocol), QV-06 (privacy), QV-10 (UX), QV-20 (voting methods)

## 1. Objective

Turn the charter into a bounded MVP: personas, end-to-end journeys, functional requirements with stable IDs and testable acceptance criteria, an explicit MVP/later split, non-goals, and release criteria. Target group: OSS foundations and online collectives, 30–2,000 voters (QV-00 §3.1). Delivery: self-hosted server + browser client + CLI verifier (ADR-002).

## 2. Scope

**In scope (MVP):** group creation, invitation-based key enrollment, proposals with amendment/review period, election setup with signed manifest, trustee ceremony, encrypted ballots for four methods, receipts, revoting, quorum/threshold, tally and verification, challenge workflow, export, self-hosting.
**Out of scope:** see §9 (non-goals).

## 3. Personas

| Persona | Who | Goals | Constraints | Technical access | Privacy needs | Consequence of exclusion |
|---|---|---|---|---|---|---|
| **Member — "Marcus"** | Contributor/member of an online collective, 35, phone-first, moderate tech skill | Vote in minutes, trust the result, not be profiled | Limited patience for key management; may use shared/older device | Mobile browser, sometimes desktop | Wants choice secret from peers and admins; accepts pseudonym | Disenfranchised, legitimacy of vote undermined |
| **Steward/Organizer — "Priya"** | Foundation secretary/board admin; runs elections yearly | Configure rules once, run a clean election, defend the result | Not a cryptographer; volunteer time | Desktop; can follow a runbook | Does not want to hold sensitive data she cannot protect | Falls back to a spreadsheet/vendor |
| **Operator/Sysadmin — "Dev"** | Volunteer who hosts the instance | Install in < 30 min, patch, back up, not be liable for member data | Part-time | Linux shell | Wants to hold minimal data (nothing secret) | Instance abandoned |
| **Trustee — "Lin"** | Trusted member (≥ 3 per election, ideally from different sub-communities) | Take part in key ceremony, decrypt result | Must keep a key share safe for election duration | Desktop, CLI | Holds share; must not be coerced into solo decryption | Election cannot complete (liveness) |
| **Auditor/Observer — "Amara"** | Member, journalist, or outside reviewer | Independently confirm the tally and process | Needs no account; may be adversarial | CLI or verifier page | Should learn nothing beyond the public record | Result is "trust us" |
| **Challenger — "Sam"** | Member who believes the result or their own ballot is wrong | File a dispute with evidence | Time-bound (challenge window) | Browser | May be minority view; must be protected from retaliation (no choice disclosure) | Disputes go off-platform |
| **Assistive-tech user** | Screen-reader/keyboard/low-vision/cognitive-load users | Vote independently | WCAG 2.2 AA (QV-13) | AT + browser | As Marcus | Exclusion by design |

## 4. User journeys

Notation: **A** = alternate/error path.

### J1 — Create group and publish rules (Priya)
1. Priya runs `qv init` (or setup wizard) → generates group signing key (Ed25519), stored with passphrase; downloads recovery file.
2. Chooses a policy template (QV-03 §10) or enters rules; previews human-readable summary + canonical JSON + hash.
3. Adds co-steward(s) (≥ 2 recommended; warning if 1).
4. Publishes `GroupRules v1` to the log. **A:** invalid rule combination (e.g., threshold > 100%) → validation error with field path. **A:** single steward → persistent banner "single point of failure".

### J2 — Invite and enroll members (Priya, Marcus)
1. Priya imports a list of invitee contact handles *or* generates N anonymous invitation links/codes (no contact data required by the system).
2. Marcus opens link; client generates voter key; shows "Back up your key" step (download key file / print QR / passphrase-encrypted); he must complete a restore-check (re-enter 3 words of passphrase or scan QR) before proceeding.
3. Marcus chooses a display label (pseudonym allowed) and submits pubkey + proof of possession.
4. Steward approval (policy `enrollment.approval`: auto | steward) → member added to roster; entry logged.
**A:** expired/used invitation → clear error + request-new-invite path. **A:** lost key file → J7.

### J3 — Draft and review a proposal (Proposer, members)
Proposer drafts text (Markdown subset, ≤ 20,000 chars), selects contest(s) and method; proposal enters review period (min per policy); amendments produce new hashed versions; members comment off-platform (MVP: link to external discussion URL) — platform stores only a hash-chained proposal history. **A:** edit attempted after READY → refused; must withdraw and re-propose.

### J4 — Set up and open an election (Priya, Lin)
1. Steward selects proposal(s) → election draft (method, dates, quorum, threshold, roll snapshot, trustees n/t).
2. Trustee ceremony (QV-16): trustees enroll, run DKG, each confirms key-check; joint public key published.
3. Manifest generated, shown in plain-language "Rules at a glance" page; steward signs; log entry; state → SCHEDULED/OPEN at open time.
**A:** trustee unavailable at ceremony → re-plan with different trustees (new DKG; nothing is reused). **A:** manifest hash mismatch between preview and signed → hard stop.

### J5 — Cast a ballot (Marcus)
1. Opens election page; reads Rules at a glance (closing time in local TZ and UTC, who is eligible, can I change my vote, what is public).
2. Authenticates by presenting voter key (key file / unlocked browser store); eligibility check against roll proof.
3. Selects choices; review screen; optionally **Audit this ballot** (Benaloh: spoil and reveal, then re-encrypt) or **Cast**.
4. Client encrypts, proves, signs, submits; receives signed receipt (tracking code + log inclusion promise); later gets inclusion proof against an STH.
**A:** invalid selection count → inline error before encryption. **A:** network drop mid-submit → idempotent retry with same ballot id. **A:** second ballot → treated as revote (if allowed) and receipt says "replaces previous ballot"; if not allowed → `E_ALREADY_VOTED`. **A:** closed → `E_CLOSED`.

### J6 — Confirm my ballot was counted (Marcus)
Member opens "My receipt": client fetches inclusion proof and latest STH, verifies consistency from the STH on their receipt; shows green/red with plain-language explanation; can export receipt. **A:** missing → "Report missing ballot" prepares a dispute packet (J8).

### J7 — Lose or change device (Marcus)
Restore from key file/QR on the new device; or, if lost, request recovery: steward issues replacement credential per QV-04 §6 (only before close unless policy allows), logged and visible. **A:** key compromised → rotate (signed by old key) or steward revoke + re-enroll.

### J8 — Close, tally, publish (Priya, Lin, Amara)
At close, no more ballots accepted; M7 aggregates; ≥ t trustees post partial decryptions with proofs; tally and outcome computed per manifest; report published; status PUBLISHED; challenge window starts. **A:** < t trustees respond within decrypt deadline → extend once by policy, else `FAILED_DECRYPT` with documented fallback (QV-03 §5.4). **A:** proof failure → `HALTED` for investigation.

### J9 — Independently verify (Amara)
Downloads export bundle (or points CLI to URL), runs `qv verify bundle.qv`; outputs PASS/FAIL per check (manifest signature, roll root, DKG transcript, every ballot's proofs and signature, log consistency, aggregation, decryption proofs, outcome rules) plus a report hash. **A:** FAIL on any check → report names the entry and rule.

### J10 — Challenge and recount (Sam)
Within the challenge window, files a challenge with an enumerated ground (QV-03 §8); the verifier is the first-line "recount" (deterministic); the dispute panel resolves; all steps logged; outcome either stands, is annulled, or a re-run is ordered. Sam's vote content is never required as evidence.

### J11 — Export and exit (Priya, Dev)
Full export bundle (open format) of all groups, elections, logs; import into a fresh instance; verifier passes on both. Operator can be swapped without changing election verifiability.

## 5. Functional requirements (MVP)

Priority: Must / Should / Could. Verification: T = automated test, R = review/inspection, D = demonstration, U = usability test. "Rule path" refers to `GroupRules` fields in QV-03 §3.

### 5.1 Group and policy

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-001 | The system shall create a group with a group signing key generated client-side or via CLI; the server shall never receive the secret key. | Must | Given group creation, server DB and logs contain no private key bytes (marker test); group public key appears in the log. | T |
| QV-02-REQ-002 | The system shall let a steward publish a `GroupRules` document validated against the QV-03 schema and logged with its hash. | Must | Valid doc → log entry with `rules_hash`; invalid doc → `E_RULES_INVALID` with JSON-pointer to first 10 errors. | T |
| QV-02-REQ-003 | The system shall provide at least three policy templates (QV-03 §10) selectable at creation. | Should | Templates load, validate, and render a plain-language summary. | T |
| QV-02-REQ-004 | The system shall support ≥ 1 and recommend ≥ 2 stewards, and shall show a persistent warning when only one exists. | Must | One-steward group displays warning on steward and election pages. | T/D |
| QV-02-REQ-005 | Group rule changes shall take effect only for elections whose manifest is created after the change is FINAL (QV-03 §6). | Must | Changing rules while an election is OPEN does not alter that election's manifest or tally. | T |

### 5.2 Membership and roles

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-010 | The system shall issue single-use invitations (≥ 128-bit random, default expiry 14 days) without requiring any personal data. | Must | Invite reuse → `E_INVITE_USED`; expired → `E_INVITE_EXPIRED`; entropy test ≥ 128 bits. | T |
| QV-02-REQ-011 | The enrollment flow shall generate a voter Ed25519 keypair client-side, require a key-backup confirmation step, and submit only the public key, label, and proof of possession. | Must | Network capture shows no secret key; skipping the backup check is impossible without an explicit "I understand I may lose access" acknowledgement. | T/U |
| QV-02-REQ-012 | Enrollment approval shall be configurable (`auto` or `steward`) and every state change (invited, enrolled, suspended, revoked, rotated) shall be logged without secrets. | Must | Each transition produces a log entry with actor and time. | T |
| QV-02-REQ-013 | The system shall support roles: Member, Steward, Proposer (any member by default), Trustee (per election), Observer (public). Roles are defined by signed rules, not server-side flags. | Must | Role checks derive from manifest/rules; tampering with the DB flag does not grant action (signature required). | T |
| QV-02-REQ-014 | A steward shall be able to suspend or revoke a member effective for elections whose roll snapshot is created later; suspension shall not alter an open election's roll except via QV-04 §6.4 roll amendment. | Must | Revoking during an OPEN election leaves the snapshot unchanged; amendment path required. | T |
| QV-02-REQ-015 | Labels shall be unique within a group, 1–64 Unicode characters, and may be pseudonymous; the system shall not require or request real names. | Must | Duplicate label rejected; no field named name/email required. | T |
| QV-02-REQ-016 | The system shall support member self-initiated key rotation with a certificate signed by the old key (QV-04 §6.2). | Must | Rotated key votes count once as the same voter; old key ballots rejected after rotation. | T |

### 5.3 Proposals and amendments

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-020 | A permitted proposer shall be able to create a proposal (title ≤ 200 chars, body ≤ 20,000 chars Markdown subset, no scripts, no remote images). | Must | Disallowed markup stripped/rejected; body hash recorded. | T |
| QV-02-REQ-021 | Proposal edits after submission shall create a new version, hash-chained to the prior one; prior versions remain viewable. | Must | Version N+1 references hash of N; history page lists all. | T |
| QV-02-REQ-022 | A proposal shall enter a review period of at least `proposals.min_review_hours` before it can be attached to an election. | Must | Attempt to schedule earlier → `E_REVIEW_PERIOD`. | T |
| QV-02-REQ-023 | The proposal text hash used in the manifest shall be that of the latest version at manifest signing; later edits shall not affect an open election. | Must | Editing after SCHEDULED is rejected; manifest `proposal_hash` immutable. | T |
| QV-02-REQ-024 | A proposer shall be able to withdraw a proposal prior to OPEN; withdrawal is logged. | Should | State = WITHDRAWN, cannot be scheduled. | T |

### 5.4 Election setup and ceremony

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-030 | The system shall build an `ElectionManifest` (QV-03 §4) including rules hash, proposal hashes, contests, method params, open/close times, roll root, trustee set (n,t), joint public key, and protocol ID; a steward quorum shall sign it. | Must | Manifest verifies offline; changing any field changes `manifest_id`. | T |
| QV-02-REQ-031 | The system shall guide trustees through the DKG (QV-16) with per-step status, timeouts, and a key-check value each trustee confirms. | Must | Ceremony of 3-of-5 completes in CLI test harness; a trustee mismatch aborts with named participant. | T/D |
| QV-02-REQ-032 | The system shall require 2 ≤ t ≤ n ≤ 15, t > n/2 (default 2-of-3); it shall warn if any trustee is also the operator or a steward (independence declaration). | Must | n=3,t=1 rejected; operator-trustee overlap shows warning stored in manifest `warnings[]`. | T |
| QV-02-REQ-033 | The system shall present a "Rules at a glance" page generated from the manifest only (not from separate data) listing eligibility, method, times (local+UTC), quorum, threshold, revoting, what is public, and verification instructions. | Must | Page content derived purely from manifest hash; snapshot test; plain-language review passes (QV-10). | T/U |
| QV-02-REQ-034 | The system shall open and close the election automatically at the manifest times and shall record the opening and closing log entries. | Must | Ballots before open → `E_NOT_OPEN`; after close → `E_CLOSED`; entries logged. | T |
| QV-02-REQ-035 | Roll snapshot (Merkle root over voter leaves) shall be fixed in the manifest at signing. | Must | Enrollment after signing does not alter roll root of that election. | T |

### 5.5 Casting, receipts, revoting

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-040 | The client shall encode, encrypt, prove, sign, and submit a ballot for each supported method; plaintext selections shall never leave the browser. | Must | Network capture and server memory dump of test run contain no selection plaintext; server verifies all proofs. | T |
| QV-02-REQ-041 | The server shall reject ballots with invalid proofs, wrong election/manifest, ineligible signer, or malformed encoding with a specific error code (QV-05 §9). | Must | Fuzz/negative corpus: 100% rejected, zero state change. | T |
| QV-02-REQ-042 | On acceptance the server shall return a signed receipt containing ballot hash (tracking code), log index promise, and timestamp; an inclusion proof against a signed tree head shall be obtainable within `log.sth_interval` (default ≤ 60 s). | Must | Receipt verifies; inclusion proof verifies within 60 s in tests. | T |
| QV-02-REQ-043 | If `revoting = allowed`, the latest accepted ballot per voter by log order shall count; if `single`, a second ballot shall be rejected. | Must | Three ballots same voter → only 3rd counted (allowed) / `E_ALREADY_VOTED` (single). | T |
| QV-02-REQ-044 | The client shall offer a Benaloh cast-or-audit challenge before every cast; audit shall reveal the ballot's plaintext and randomness, mark it spoiled in the log, and force a fresh encryption for the real cast. | Must | Audit of correct client verifies; audit of a deliberately faulty test client is detected by the independent checker. | T/D |
| QV-02-REQ-045 | Submissions shall be idempotent on `ballot_id`; retries shall not create duplicates or consume a second revote. | Must | Replayed submit returns the original receipt. | T |
| QV-02-REQ-046 | The ballot screen shall display a pre-cast privacy statement (QV-06 §10 text) including Phase-1 limit: "others can see that you voted, not how". | Must | Text present, localised, covered by UX test S6. | U |
| QV-02-REQ-047 | The system shall make no ballot-choice-to-member mapping available through any organizer, steward, operator or API view. | Must | API/DB schema review; no endpoint or column joins voter id to decryptable data; red-team test attempts. | T/R |

### 5.6 Tally, results, verification

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-050 | After close, the system shall compute homomorphic aggregates per selection from the valid counted ballots only (QV-05 §7). | Must | Aggregate equals brute-force sum on test elections incl. revotes and rejects. | T |
| QV-02-REQ-051 | At least t trustees shall be able to post partial decryptions with Chaum–Pedersen proofs; the system shall reject a decryption share with an invalid proof. | Must | Bad-share test rejected and named; t valid shares → tally. | T |
| QV-02-REQ-052 | The outcome (turnout, quorum met, per-option counts, pass/fail, ties) shall be computed per the manifest rules with integer arithmetic only and published with a report. | Must | Reference vectors for each rule (QV-03 §7.4) match. | T |
| QV-02-REQ-053 | The CLI `qv verify` and the verifier page shall verify an entire election from an export bundle offline and emit per-check PASS/FAIL plus a report hash. | Must | Corrupting any single byte of any artifact causes FAIL with located check. | T |
| QV-02-REQ-054 | The system shall publish by default: manifest, roll root & leaf set (labels optional per rule), DKG transcript, all ballot entries (ciphertext, proofs, signer), spoiled-ballot openings, STH chain, decryption shares & proofs, tally, report. | Must | Export bundle contains each artifact; checklist test. | T |
| QV-02-REQ-055 | Results shall not be visible (no partial tally) before close; no decryption key exists that can open individual ballots. | Must | Pre-close API never returns aggregates; attempt to request decryption pre-close refused by trustees' tooling (`E_NOT_CLOSED`). | T |
| QV-02-REQ-056 | Turnout and quorum evaluation shall use only the roll snapshot size and count of voters with a counted ballot. | Must | Vector tests. | T |

### 5.7 Disputes and halt

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-060 | During the challenge window any roll member shall be able to file a challenge selecting an enumerated ground (QV-03 §8) with attachments ≤ 1 MB. | Must | Challenge appears in log (hash of body); out-of-window → `E_WINDOW_CLOSED`. | T |
| QV-02-REQ-061 | A "missing ballot" report shall be able to be generated from the voter's receipt without revealing the choice. | Must | Packet contains receipt + STH + failed inclusion proof only. | T |
| QV-02-REQ-062 | Stewards (per policy threshold) or trustees (≥ t) shall be able to HALT an OPEN election with a coded reason; halts are logged, time-limited, and extend the close time by the halted duration (QV-03 §9). | Must | State machine tests; abuse caps enforced. | T |
| QV-02-REQ-063 | Dispute resolution outcomes (stands / annulled / rerun) shall be recorded as signed log entries by the arbiter set. | Must | Outcome entry required before state FINAL if any challenge was filed. | T |

### 5.8 Export, retention, administration

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-070 | A steward or operator shall be able to export all group data as an open-format bundle at any time, and import it into a clean instance. | Must | Export→import→verify yields identical report hash. | T |
| QV-02-REQ-071 | Any member shall be able to export their own record (enrollment, receipts, rotation certs, personal settings). | Must | Export file validates against schema. | T |
| QV-02-REQ-072 | The system shall enforce the retention schedule in QV-06 §5 via automated jobs and log each deletion run. | Must | Time-travel test: items past retention gone; log entry exists. | T |
| QV-02-REQ-073 | The server shall not persist client IPs or user agents by default; operator may enable temporary abuse-control counters in memory only. | Must | Persistence audit test; config default asserted. | T |
| QV-02-REQ-074 | The system shall deploy by documented procedure in ≤ 10 commands on a clean supported Linux host and expose `/healthz` and `/metrics` without PII. | Should | Trial with 5 sysadmins; median ≤ 30 min (QV-00 S8). | D |
| QV-02-REQ-075 | Optional notifications (invite, open, reminder, closing soon, results) shall use steward-supplied webhooks or a configurable SMTP relay; no addresses shall be stored beyond the send job. | Could | Contact data deleted after send; tested. | T |
| QV-02-REQ-076 | All pages shall be served without third-party resources and under a strict CSP (ADR-009). | Must | CSP scan and external-request test = 0 third-party. | T |

### 5.9 Non-functional guardrails

| ID | Requirement | Pri | Acceptance criteria | Ver |
|---|---|---|---|---|
| QV-02-REQ-080 | The system shall support ≥ 2,000 voters, ≥ 10 contests, ≥ 10 selections each within QV-00 S12 performance bounds. | Must | Benchmark report. | T |
| QV-02-REQ-081 | Core voter flow shall be WCAG 2.2 AA conformant and fully keyboard-operable (QV-13). | Must | Audit with 0 blockers. | R/U |
| QV-02-REQ-082 | The product shall ship user-facing text for "what we do not protect" (QV-06 §10 non-claims) and shall not use the words "anonymous" or "untraceable" for Phase 1. | Must | String lint for forbidden terms in Phase-1 UI/docs. | T/R |
| QV-02-REQ-083 | Release builds shall be reproducible and accompanied by a signed release manifest listing artifact hashes (ADR-010). | Must | Two independent builds produce identical hashes. | T |

## 6. MVP vs later

| Capability | MVP? | Phase / rationale | Dependencies |
|---|---|---|---|
| Yes/no, single-choice, approval, k-of-n | **MVP** | ADR-006 | QV-20, QV-05 |
| Quorum + simple/supermajority thresholds | **MVP** | Required by target groups | QV-03 |
| Revoting (policy-configurable) | **MVP** | Mitigates coercion partially | QV-05 |
| Voter-key enrollment, public participation (Phase 1) | **MVP** | ADR-005 | QV-04 |
| Publicly verifiable tally + CLI verifier + verifier page | **MVP** | Core promise | QV-05, QV-11 |
| Trustee DKG + threshold decryption | **MVP** | ADR-004 | QV-16 |
| Benaloh cast-or-audit | **MVP** | ADR-004 | QV-16 |
| Self-hosted deployment, Tor onion option | **MVP** | ADR-002/009 | QV-08 |
| Challenge workflow (basic, log-based) | **MVP** | Legitimacy | QV-03 |
| Full export/import | **MVP** | ADR-001 exit | QV-09 |
| Witness cosigning, public mirrors | **MVP (Should)** hooks; services later | ADR-007 | QV-08 |
| Anonymous eligibility via blind tokens | **Phase 2** | ADR-005 | QV-04 §9 |
| Ranked (Schulze/Ranked Pairs), weighted, delegation | **Phase 2** | ADR-006 | QV-20 |
| ZK membership with nullifiers | **Phase 3 (research)** | ADR-005 | QV-04 §10, QV-21 |
| Maintainer-hosted instance | **Later** | ADR-002 | QV-12, QV-14 |
| Write-ins | **Later** | Requires mixnet | QV-20 |
| Mobile apps, SSO/OIDC adapter | **Later / Could** | Optional identity adapter | QV-04 |
| P2P operation | **Research** | QV-32 | — |

## 7. Notifications and reminders (decision)

MVP is pull-based plus optional webhooks (REQ-075). No email addresses stored by default, because contact data is the largest re-identification vector in a small group (QV-06 §9).

## 8. Open questions resolved from the framework

| Question | Resolution |
|---|---|
| First target organization type | OSS foundations/online collectives (QV-00) |
| Which single decision flow is the MVP | Board/steering election by approval or single-choice, plus yes/no ratification |
| Participation and quorum rules | Quorum as % of roll snapshot; thresholds simple (>50%) and supermajority (≥ p/q); QV-03 §7 |
| Can ballots be changed or withdrawn before close | Changeable by revoting if the manifest says so; withdrawal not supported (a "blank" ballot may be cast instead) |
| Member loses access during an active decision | QV-04 §6: restore from backup; else steward-approved roll amendment with visible log entry |
| What must the audit record contain / who inspects | REQ-054; everyone (public by default; group may restrict reading to roll members but not the verifiability) |
| Minimum accessibility and language requirements | WCAG 2.2 AA; English + UI i18n framework from day one; at least one RTL-capable layout test (QV-13) |

## 9. Non-goals

- Legal compliance for statutory or certified elections; government use.
- Anonymity of participation in Phase 1 (explicit non-claim).
- Coercion resistance / vote-buying prevention.
- Secure voting from compromised devices.
- Identity proofing, KYC, de-duplication of natural persons beyond what the steward attests.
- Discussion forum/chat (links out only).
- Token-based voting, on-chain recording, funds custody.
- Hosted multi-tenant SaaS in MVP.

## 10. Release criteria (MVP = v0.9 pilot, v1.0 general)

| # | Criterion | v0.9 | v1.0 |
|---|---|---|---|
| R1 | All Must requirements in §5 pass their verification | ✔ | ✔ |
| R2 | QV-00 gates S2, S5, S6, S8, S10, S12 met | ✔ | ✔ |
| R3 | Independent crypto review: 0 open critical/high (S3) | scoped review under way | ✔ required |
| R4 | Second independent verifier implementation passing shared vectors (S1) | one + conformance vectors | ✔ |
| R5 | Threat model (QV-07) reviewed; all "High" residual risks documented in UI/docs | ✔ | ✔ |
| R6 | Reproducible build verified by ≥ 2 builders | ✔ | ✔ |
| R7 | Backup/restore/export drill (S9) | partial | ✔ |
| R8 | WCAG audit (S11) | self-audit | external audit |
| R9 | Claims review: all public text matches QV-00 §5 and QV-06 §10 | ✔ | ✔ |
| R10 | Pilot with ≥ 1 external group | ✔ | S4 |

## 11. Data and privacy

Data inputs: invitation codes, voter public keys, labels, encrypted ballots, proofs, trustee messages. Outputs: public log, export bundle, report. Controller: the group (QV-06 §8); operator is processor-like. Visibility: see QV-06 §3 and QV-05 §5. Not claimed: participation privacy (Phase 1), coercion resistance.

## 12. Open questions

| Question | Owner | Target | Proposed default |
|---|---|---|---|
| Should proposals support attachments (PDF)? | Product | v0.5 | No; link out with hash |
| Maximum group size for MVP guaranteed support | Architecture | v0.5 | 2,000 voters |
| Should the roll show labels publicly or only keys? | Product/Privacy | v0.5 | Group choice, default labels visible to members only; keys always public in the log |
| Anonymous-invite flow vs contact-based import | UX | v0.5 | Both; contact data never stored |

## 13. Approval

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

## Proposed ADRs

- **QV-ADR-P02-1 — Withdrawal of cast ballots is not supported; revoting only.** Rationale: withdrawal is a participation-visible signal and complicates tally logic; revoting plus a "blank" choice covers it.
- **QV-ADR-P02-2 — Pull-based notifications, no stored contact data by default.**
