# QV-18 — Federation Between Independent Groups

**Module ID:** `federated-governance`  
**Status:** Proposed framework; no federation protocol or governance model is approved  
**Related specs:** QV-03, QV-06, QV-07, QV-08, QV-09, QV-16, QV-17

## 1. Objective

Let independent voluntary groups coordinate a shared decision without merging their membership databases or yielding control to a central platform. Each group chooses whether to participate, which local rules apply, what it shares, and whether it accepts an outcome.

Federation is optional. Ordinary single-group voting must not depend on it. Requirements that depend on federation are marked **Opt-in**.

Principles:
- Participation, withdrawal, and exit are voluntary and governed by visible rules.
- Each group controls its own membership and credentials.
- Every shared decision identifies its participants, policy versions, ballot method, and result-combination rule.
- Share only data required to conduct and verify the decision.
- Preserve dissent, failures, and forks; do not silently select a canonical group or result.
- Federation distributes control but does not automatically hide metadata, prevent collusion, or make rules fair.

## 2. Scope

**Candidate use cases:** co-ops deciding on a shared purchasing policy, worker collectives coordinating a proposal, or independent online communities agreeing to an opt-in action. The first use case is open (OD-01).

**Initial scope recommendation (not approved):** Start with portable signed decision records and manual exchange/import. Consider automated federation only after users show that export/import is insufficient (OD-18). Do not require a public directory, token, smart contract, or global membership registry.

### In scope
- Opt-in shared decisions across more than one independent group, each running its own local ballot.
- Signed group profiles, decision manifests, acceptances, group-level results, and verification evidence.
- Manual exchange and import (Phase 1), then opt-in federation (Phase 2).

### Out of scope (non-goals)
- Merging membership databases, or any mandatory central group registry.
- Disclosing rosters or member-level ballots between groups.
- Token-weighted influence, a universal administrator, or custody of funds.
- Public government elections and legally binding corporate elections.
- Anonymity or coercion-resistance claims beyond what QV-16 and QV-17 establish after review.
- Software resolution of external property, legal authority, or cross-group disputes.

### Phases
- **Phase 0:** complete local manifests, eligibility, signed results, and exports.
- **Phase 1:** portable records and independent verification through manual exchange.
- **Phase 2:** opt-in federation with invitations, manifest acceptance, group-level results, and explicit combination.
- **Phase 3:** only if needed, assess shared ballots with anonymous eligibility proofs and a reviewed tally protocol.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Group administrator | Propose and accept a shared decision | Federation enabled for the group (REQ-009) | Signed acceptance of the exact manifest hash, or recorded decline |
| Group member | Know the group's terms and vote locally | Group accepted; local ballot open | Ballot stays within the group |
| Invited group's administrator | Accept or decline an invitation | Manifest received | Recorded decision; no acceptance without action |
| Verifier (member, observer, auditor) | Recompute the combined result | Manifest and group artifacts obtained | Same result as publishers, or a recorded mismatch |
| Relay or coordinator operator | Move records between groups | Role undecided (OD-09) | Records delivered or marked incomplete; no authority over content |

**Opt-in journey (Phase 2 design):**
1. Administrator drafts a manifest.
2. Each invited group reviews the manifest and its own terms.
3. Each group's authorized key holder accepts the exact hash or declines; either is recorded.
4. Each group runs its local ballot. No roster leaves the group (REQ-002).
5. Each group publishes its group-level result and evidence.
6. Verifiers recompute the combined result (REQ-004).
7. Conflicts, withdrawals, and gaps are shown as recorded (Section 7).

Phase 1 follows the same steps with records moved by hand.

## 4. Requirements

Requirements marked **Opt-in** apply only to groups that choose federation. Priority uses Must, Should, and Could.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-18-REQ-001 | **Opt-in:** Each group shall sign acceptance of the exact shared manifest. | Must | Verifier rejects a manifest whose hash or signature does not match the group's signed acceptance. | Test (hash and signature mutation); cross-verifier conformance |
| QV-18-REQ-002 | **Opt-in:** Groups shall retain local eligibility authority. Federation shall not require upload of complete member rosters. | Must | Exchange and export schemas have no roster or member-list field; payloads containing one fail validation. | Test (schema conformance); review (export privacy) |
| QV-18-REQ-003 | **Opt-in:** Shared proposal and rule changes shall be versioned and visible. | Must | Each change produces a new version and hash. Post-opening changes outside the declared amendment process are rejected. | Test (manifest mutation) |
| QV-18-REQ-004 | **Opt-in:** Result combination shall be reproducible. | Must | An independent verifier, given only the manifest and exported artifacts, produces the same result and per-group breakdown. | Test (cross-implementation test vectors) |
| QV-18-REQ-005 | **Opt-in:** Withdrawal and nonparticipation shall follow the declared policy. | Must | After a withdrawal recorded before cutoff, quorum and result are recomputed by manifest rules and the output flags the withdrawal. | Test (withdrawal and quorum) |
| QV-18-REQ-006 | **Opt-in:** Member-level ballots shall not be disclosed to other groups by default. | Must | Exports contain no field mapping a member identifier to a choice. | Review (export privacy); test (field scan) |
| QV-18-REQ-007 | **Opt-in:** No operator shall substitute the manifest or a group result without detection. | Must | Modified manifests or results fail signature checks. Two validly signed, different records are both kept and flagged. | Test (conflicting-view simulation) |
| QV-18-REQ-008 | **Opt-in:** Federation records shall be portable. | Must | Profiles, manifests, results, and evidence export in documented, versioned formats and re-verify identically in an independent verifier. | Test (export/import round trip); review (format docs) |
| QV-18-REQ-009 | Federation shall be disabled by default. Single-group voting shall run with no federation component. | Must | With federation endpoints blocked, a local ballot is created, run, and tallied with no federation calls. | Test (integration, endpoints blocked) |
| QV-18-REQ-010 | **Opt-in:** A group shall join only through explicit, recorded acceptance by an authorized key holder. | Must | No group signature on a manifest exists without an acceptance record. An invitation alone is recorded as not accepted. | Test (state transitions); review |
| QV-18-REQ-011 | **Opt-in:** Manifests shall declare opening, closing, and time-zone rules, plus ballot method, eligibility cutoff reference, quorum, and combination rule, before opening. | Must | Opening is refused if any field is missing. Interfaces show every time with its time zone. | Test (schema and opening gate); usability test |
| QV-18-REQ-012 | **Opt-in:** Conflicting signed records shall be preserved and surfaced, not silently resolved. | Must | Both records remain. Status shows "conflict" until resolved under the declared rule. Nothing is deleted. | Test (conflicting-view simulation); review |
| QV-18-REQ-013 | **Opt-in:** Cancellation shall occur only through the declared process, and shall be signed and visible. | Must | Undeclared cancellation is rejected. A cancelled decision publishes no result. | Test (state transitions) |
| QV-18-REQ-014 | **Opt-in:** Key rotation and retirement shall be recorded and verifiable. | Must | A rotation record references the prior key. Signatures made after the retirement point are rejected. | Test (key-rotation); expert review |
| QV-18-REQ-015 | **Opt-in:** Outages shall not change an outcome silently. | Must | In a near-closing outage simulation, affected groups show "delivery incomplete." Any outcome change follows a manifest rule and is recorded. | Test (outage simulation) |
| QV-18-REQ-016 | **Opt-in:** Records shall carry protocol and serialization versions. Unknown versions shall be rejected. | Must | An unknown version produces a visible error and no partial processing. | Test (conformance) |
| QV-18-REQ-017 | **Opt-in:** Per-group results shall be withheld or merged below the manifest's publication rule. | Must | Small-group fixtures show withholding or merging as declared. The rule value is set by OD-13. | Test (small-group fixtures); privacy review |
| QV-18-REQ-018 | **Opt-in:** Records shall contain only data needed to conduct and verify the decision. | Must | Every field appears in the QV-06 data inventory. Undocumented fields fail validation. | Review (QV-06 inventory); test (schema) |
| QV-18-REQ-019 | **Opt-in:** Members shall see what their group is joining, and on what terms, before acceptance. | Should | The acceptance screen shows the manifest hash, terms, withdrawal rule, and combination rule in plain language. | Comprehension test (criteria set before testing) |
| QV-18-REQ-020 | **Opt-in:** Group and decision identifiers shall not be derived from member identifiers. | Must | No member identifier appears in exported identifiers. | Review (design); test (identifier scan) |
| QV-18-REQ-021 | **Opt-in:** A per-group breakdown shall be shown when the manifest requires it. | Should | A combined-only output fails verification when the manifest requires a breakdown. | Verifier test; usability test |

## 5. Data and privacy

- **Data inputs:** group profiles; proposal text and manifest fields; acceptance, withdrawal, cancellation, key-rotation, and conflict records; each group's aggregate result and evidence.
- **Data outputs:** signed manifests and acceptances; group results; evidence; exports (REQ-008); the public record (OD-12).
- **Data controller/operator:** each group controls its own members and eligibility. The relay or coordinator role is undecided (OD-09). This spec assumes that operator holds no member data, which must be validated.
- **Retention and deletion:** signed published records are designed to be immutable and may not be erasable (see QV-06). Retention and handling of copies held by other groups are open (OD-17).
- **Linkability risks:** stable group identifiers; repeated participation patterns; timing and traffic volume; group size revealed by counts; small aggregates; exports that let a recipient link records.
- **Visibility:** members see their group's records and the manifests of decisions their group joined. Administrators see their own group's data, not other groups' member-level data. The operator sees transport metadata (sending group, time, size) and any unencrypted content. The manifest is visible to all participants. Observers see only fields declared public (OD-12).
- **Privacy properties claimed (design targets, not verified):** no roster or member-level ballot leaves a group by default (REQ-002, REQ-006); changes are detectable (REQ-007).
- **Privacy properties explicitly not claimed:** anonymity of members or groups; protection from timing or traffic observers; coercion resistance; that a group signature proves legitimate authority or member consent; fairness of the combination rule; full erasure of published records.

## 6. Security and abuse cases

This section covers only the cases listed. Compromised devices, coercion, legitimacy of group rules, and correctness of cryptographic components are assessed under QV-07 and QV-16.

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Operator suppresses or delays one group's messages | Relay or coordinator operator | Group excluded or outcome delayed | Multiple relays (OD-08); visible delivery status (REQ-015) | Visible only if another path shows the record. No delivery guarantee. |
| Different proposal or result views sent to different groups | Operator or compromised relay | Groups decide on different texts or totals | Signed manifest hashes; conflict preservation (REQ-012) | Needs cross-group comparison to detect |
| Signing-key theft or weak recovery used to impersonate a group | Key thief; weak recovery process | False acceptance or result under a group's identity | Rotation records (REQ-014); custody design (OD-06) | Signatures prove key use, not authorization; compromise time may be unknowable |
| Participation patterns reveal interests or relationships | Observer; operator | Group interests or partnerships exposed | Minimal public metadata (REQ-018); OD-12 | Public participation is visible by design |
| Timing and traffic volume identify which group acted | Network observer; operator | Group activity linked to timing | None specified; batching or delay to be evaluated | Exposed; no timing protection claimed |
| Small aggregates reveal individual choices | Other groups; observers | A member's choice inferred | Publication rule (REQ-017, OD-13) | Inference possible above the rule's threshold |
| Majority imposes a result on a dissenting or nonparticipating group | Participating groups | Unfair outcome for a minority | Declared quorum and combination rule (REQ-005); breakdown (REQ-021) | Software cannot make a rule fair; rule must be accepted in advance (OD-03) |
| Local members challenge a representative's decision to federate | Dissenting members | Legitimacy dispute | Group-local ratification (OD-11); visible terms (REQ-019) | Challenge process undefined |

## 7. Interfaces, contracts, and dependencies

**Group profile** (signed, versioned): group identifier, public keys, protocol versions, exchange endpoint or method, administrative authorization policy, public governance documents, contact and dispute channels. It must not require publishing member identities.

**Decision manifest** (signed, immutable): unique decision identifier; participating group identifiers; proposal text or hash plus retrievable text; exact rule versions accepted by each group; ballot method and structure; eligibility cutoff reference; quorum and combination rule; opening and closing conditions with time-zone semantics; data each group shares; amendment, challenge, recount, withdrawal, and cancellation rules; protocol and serialization versions.

**Acceptance record:** a group signature over the exact manifest hash. It proves acceptance by a key, not legitimate authority or member consent.

**Group result artifact:** aggregate result and verification evidence (form per QV-16). **Withdrawal, cancellation, conflict, and key-rotation records:** schemas to be defined under QV-09.

**Local participation:** each group runs its own ballot and publishes an aggregate result with evidence. A shared-ballot design needs stronger credentials and protocols (OD-02).

**Result combination:** the manifest defines the rule. Candidates: combine group aggregates by a public deterministic rule; verify each group's signed tally independently; later, evaluate encrypted combination. Dissenting results are shown separately when policy permits, and a single total must not hide disagreement. Abstentions, unequal group sizes, nonparticipation, and withdrawal are open (OD-03, OD-04).

**Failure and retry behavior:**

| Scenario | Required behavior | Evidence preserved |
|---|---|---|
| Group key compromised during an open decision | Revoke and rotate; flag the decision; continuation or restart follows OD-15 | Rotation record; signatures as recorded |
| Relay unavailable near closing | Closing follows manifest rules; affected groups show "delivery incomplete"; no silent extension | Delivery attempts and status |
| Relay censors or delays a group's records | Gap shown where another path reveals the record | Records held and received |
| Conflicting records for one decision | Both kept; status "conflict"; resolved per declared rule | Both signed records |
| Malformed or conflicting manifest | Opening refused; record rejected with visible reason | Rejected record and reason |
| Group withdraws, or quorum changes | Recomputed under declared rule; manifest states whether result changes after cutoff | Withdrawal record; before and after results where policy requires |
| Challenged local result | Local record kept; federation record references challenge | Challenge record |
| Lost local evidence | Not silently reconstructed; other groups' copies kept; gap recorded | Gap record |
| Group fork (competing keys for one identity) | Both key histories kept; members informed; no canonical group chosen by software | Both key histories |
| Group split | New identity; source history unchanged; no automatic inheritance (QV-19) | Source records unchanged |

**Upstream dependencies:** QV-03 (lifecycle, quorum, disputes; roles matrix incomplete), QV-04 (local eligibility and cutoff), QV-06 (data inventory; incomplete, blocks REQ-018), QV-07 (relay, key, and recovery threats), QV-16 (signatures, verification, logs), QV-17 (credentials, Phase 3 only).

**Downstream consumers:** local ballot systems; independent verifier; group export and exit (QV-19); relay hosting (QV-08); support and incidents (QV-12).

**Versioning and compatibility:** every record carries protocol and serialization versions (REQ-016). The compatibility policy is open (OD-18).

## 8. UX, accessibility, and localization

- **Key screens:** group terms; manifest review and acceptance; invitations and declines; per-group results and dissent view; conflict and withdrawal notices; export and import.
- **Plain-language explanations:** acceptance means the group's key accepted this exact text, not that every member agreed. The combined result follows a stated rule that software cannot make fair (REQ-019).
- **Keyboard and screen-reader:** acceptance and results views operable by keyboard and readable by assistive technology. Hashes shown in a form that can be compared character by character.
- **Low-bandwidth and device:** manifests and records retrievable as plain text. Phase 1 manual exchange works without federation endpoints.
- **Localization:** manifest language is part of the signed text (OD-16). Interface text is translated before any group accepts, without changing meaning.

## 9. Operations

- **Configuration:** federation off by default (REQ-009); per-group exchange method (OD-08) and key storage (OD-06).
- **Monitoring and audit:** record every acceptance, decline, withdrawal, cancellation, conflict, and rotation in signed history. Monitor delivery per group. Do not join member identity to participation timing (QV-16).
- **Backup, recovery, and deletion:** keys and history backed up under OD-06. Deletion limits per Section 5 and OD-17.
- **Incident response:** key-compromise procedure to revoke, rotate, record, and notify affected participants. Not yet written. Expert review required.
- **Support and escalation:** group administrators first; disputes through QV-03; operator escalation through QV-12.

## 10. Testing and verification

- **Unit tests:** manifest hashing; signature verification; schema validation; acceptance, withdrawal, and cancellation transitions.
- **Integration tests:** two-group manual import; quorum and withdrawal recomputation; federation-disabled path (REQ-009); version rejection (REQ-016).
- **End-to-end tests:** invitation through verified result, and partial outage near closing (Phase 2 only).
- **Security/privacy tests:** manifest and result mutation; replay; conflicting views; retired-key rejection; export field scan; small-group suppression; identifier scan.
- **Independent review or audit:** expert cryptography and protocol review before Phase 2 (OD-05, OD-06, OD-07); export privacy review (REQ-006, REQ-018); comprehension testing (REQ-019).
- **Release-blocking criteria:** all Must requirements verified; federation off by default; OD-02, OD-05, OD-07, OD-08, and OD-09 closed or deferred with rationale in the decision log; interoperable test vectors pass on more than one independent verifier.

## 11. Constraints and assumptions

**Constraints:** no new cryptographic primitives (QV-16); no token, smart contract, public ledger, public directory, or global registry required; each group keeps its own roster.

**Assumptions requiring validation:**
- Groups can keep signing keys secure enough for the decision's stakes [UNVERIFIED].
- Groups are willing to share aggregate results and evidence.
- Participants understand that a signed acceptance is not member consent.
- Group clocks are close enough for deadlines [UNVERIFIED].
- Manual exchange suffices for early use (recommendation; not validated).

**Reference inputs** (not selected dependencies): [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/) and [DID Core](https://www.w3.org/TR/did-core/) for identity and credential concepts; [W3C ActivityPub](https://www.w3.org/TR/activitypub/) for federation concepts (not a governance or voting protocol); [RFC 9162 — Certificate Transparency v2.0](https://www.rfc-editor.org/rfc/rfc9162.html) for append-only logs (a single log can still equivocate without monitoring); signature and key-management references cited in QV-16.

## 12. Open questions

Each question is tracked as a decision in Section 14.

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| First use case (OD-01) | Project owner | Before Phase 1 design | Pending |
| Aggregate results or shared ballot (OD-02) | Project owner; expert reviewer | Before Phase 2 design | Pending |
| Weighting, quorum, withdrawal (OD-03, OD-04) | Project owner | Before Phase 2 design | Pending |
| Public or private records (OD-12) | Project owner | Before Phase 1 build | Pending |
| Keys, identity, recovery (OD-05, OD-06) | Expert reviewer; project owner | Before Phase 1 build | Pending |
| Discovery and invitation (OD-10) | Project owner | Before Phase 2 design | Pending |
| Local ratification (OD-11) | Project owner | Before Phase 2 design | Pending |
| Dissent, legal constraints (OD-13, OD-14) | Project owner; legal review | Before Phase 2 design | Pending |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 14. Open decisions

Every item below requires expert review before it is closed. Owners are roles; no person is assigned.

| ID | Question | Candidates | Trade-offs | Needed to decide | Owner |
|---|---|---|---|---|---|
| OD-01 | Which use case is first? | Shared purchasing (co-ops); coordinated proposal (worker collectives); opt-in action (online communities) | Purchasing may touch money rules outside scope; proposals need strong ratification; communities may have weakest membership rules | User research; QV-03 policy review | Project owner. Expert review required. |
| OD-02 | Aggregate results or shared member ballot? | Aggregate results with evidence; shared ballot with anonymous credentials | Aggregates keep rosters local but expose group totals; shared ballots need credential and protocol review | QV-16 protocol comparison; QV-07 threat review | Project owner; expert reviewer. Expert review required. |
| OD-03 | Combination rule and weighting | One-group-one-vote; member-weighted; quorum-gated; other | Member weighting favors large groups and reveals size; quorum gates can stall | Agreement from each prospective group before opening; fairness review | Project owner. Expert review required. |
| OD-04 | Quorum, abstention, nonparticipation, withdrawal | Exclude non-responders; count as no; hold until quorum | Exclusion lets few groups decide; "no" lets a minority block; holding risks stall | QV-03 quorum policy; worked examples | Project owner. Expert review required. |
| OD-05 | Signature scheme for profiles, manifests, acceptances, results | Elliptic-curve; RSA-based; other families (maturity [UNVERIFIED]) | Signature size; verifier support; independent implementation; long-term verification | Cryptographic review; test vectors; FIPS 186-5 (QV-16) | Expert reviewer (cryptography). Expert review required. |
| OD-06 | Key custody, rotation, and recovery | Single administrator key; threshold signing; hardware-backed keys; cross-signed rotation | Single keys are fragile; thresholds add coordination; recovery can be exploited | Key design under QV-07 and SP 800-57 (QV-16); recovery drills | Expert reviewer. Expert review required. |
| OD-07 | Ordering or agreement for shared records | None (direct hash comparison); signed log with witnesses (RFC 9162 pattern); coordinator ordering; multi-party agreement (applicability [UNVERIFIED]); ledger | No mechanism leaves equivocation undetected unless groups compare; logs need monitors; coordinators control order; ledgers add permanence and metadata exposure | Equivocation threat review; monitor design; metadata analysis | Expert reviewer. Expert review required. |
| OD-08 | Transport and exchange method | Manual files; group endpoints pulled by peers; relay or inbox (ActivityPub-style); several relays; peer-to-peer | Manual is slow but avoids operators; endpoints expose availability; relays enable censorship and metadata exposure | Threat review; QV-08 availability; QV-16 transport | Project owner; expert reviewer. Expert review required. |
| OD-09 | Relay or coordinator role and trust | No coordinator; per-decision coordinator; several operators; QuietVote-hosted; group-run | No coordinator may stall delivery; hosted operator sees metadata; several operators raise coordination cost | QV-08 hosting models; QV-07 trust assumptions | Project owner. Expert review required. |
| OD-10 | Group discovery and invitation | Invitation only; optional self-published directory; no directory | Invitation limits discovery and exposure; directory publicizes existence and interests | Privacy review; user research | Project owner. Expert review required. |
| OD-11 | Local ratification of federation | Administrator decision; member vote under QV-03; hybrid with notice | Administrator decision is fast but invites challenge; member vote is slower and needs its own privacy design | QV-03 lifecycle; challenge process | Project owner. Expert review required. |
| OD-12 | Public or private record scope | Fully public; participating groups only; tiered | Public records aid verification but cannot be withdrawn; restricted records weaken independent checks | QV-06 retention analysis; QV-11 verification needs | Project owner. Expert review required. |
| OD-13 | Dissent display and small-group publication rule | Always show; manifest-driven; aggregate with suppression; threshold value (not chosen) | Always-shown reveals minority positions; manifest-driven depends on policy; suppression hides disagreement | Usability testing; inference analysis under QV-06 and QV-07 | Project owner; expert reviewer. Expert review required. |
| OD-14 | Cross-jurisdiction constraints and fit with README scope | Restrict to one jurisdiction; cross-border with published terms; defer until scope extended | Restriction limits use; cross-border adds legal exposure; the README limits initial scope to internal decisions | Legal review; project-owner scope decision | Project owner; legal review. Expert review required. |
| OD-15 | Amendment, challenge, cancellation, conflict, and time semantics | Group-local process only; manifest-declared process; cancel and restart after opening; UTC instant or local times with declared reference | Local process cannot resolve cross-group conflicts; declared process must be fixed before opening; restart is costly; UTC is unambiguous but needs display | QV-03 amend and dispute policy; QV-08 time handling | Project owner. Expert review required. |
| OD-16 | Multilingual manifests | One signed manifest per language; canonical language with non-binding translations; one manifest with all languages | Per-language signing is exact but multiplies acceptances; canonical text may disadvantage readers | QV-13 localization; comprehension testing | Project owner. Expert review required. |
| OD-17 | Retention and deletion of federation records | Permanent signed records; declared retention period; local copies only deletable | Permanent records aid verification but resist erasure; declared periods may break later verification | QV-06 retention review; legal review (OD-14) | Project owner. Expert review required. |
| OD-18 | Gate for automated federation and compatibility policy | Gate by logged user need or measured manual-exchange failure; current version only; one prior version; permanent read support | A gate is hard to measure; current-only can strand records; prior versions add maintenance | Pilot design; QV-09 versioning; export review (REQ-008) | Project owner; expert reviewer. Expert review required. |
