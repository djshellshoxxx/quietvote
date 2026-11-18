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

### Candidate use cases

Potential use cases include co-ops deciding on a shared purchasing policy, worker collectives coordinating a proposal, or independent online communities agreeing to an opt-in action. The first use case is open (OD-01).

**Initial scope recommendation (not approved):** Start with portable signed decision records and manual exchange/import. Consider automated federation only after users show that export/import is insufficient (OD-20). Do not require a public directory, token, smart contract, or global membership registry.

### In scope
- Opt-in shared decisions across more than one independent group, where each group runs its own local ballot.
- Signed group profiles, decision manifests, group acceptances, group-level results, and verification evidence.
- Manual exchange and import of these records (Phase 1).
- Export of a group's federation records in documented formats.

### Out of scope (non-goals)
- Merging membership databases, or any mandatory central group registry.
- Disclosure of rosters or member-level ballots between groups.
- Public directory, token, smart contract, or global membership registry.
- Token-weighted influence, universal administrator, or custody of funds.
- Shared member-level ballots before Phase 3.
- Public government elections and legally binding corporate elections.
- Anonymity or coercion-resistance claims beyond the reviewed outcome of QV-16 and QV-17.
- Software resolution of external property, legal authority, or cross-group disputes. The software records them.

### Phases

- **Phase 0:** complete local manifests, eligibility, signed results, and exports.
- **Phase 1:** portable records and independent verification through manual exchange.
- **Phase 2:** opt-in federation with invitations, manifest acceptance, group-level results, and explicit combination.
- **Phase 3:** only if needed, assess shared ballots with anonymous eligibility proofs and a reviewed tally protocol.

Gate criteria between phases are open (OD-20).

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Group administrator | Propose a shared decision and accept it for the group | Group profile published; federation enabled for the group (REQ-009) | Signed acceptance of the exact manifest hash, or a recorded decline |
| Group member | Understand what the group is joining and vote locally | Group has accepted; local ballot open | Knows the terms; ballot stays within the group |
| Invited group's administrator | Review an invitation and accept or decline | Invitation received with manifest | Acceptance or decline recorded; no acceptance without action (REQ-010) |
| Independent verifier (member, observer, or auditor) | Recompute the combined result | Manifest and group artifacts obtained | Same result as publishers, or a recorded mismatch |
| Relay or coordinator operator | Move records between groups | Role not defined (OD-09) | Records delivered, or delivery marked incomplete; no authority over content |
| Observer | Check the public record | Public fields defined (OD-12) | Sees only public fields |

**Normal opt-in journey (Phase 2 design):**
1. A group administrator drafts a manifest (Section 7).
2. Each invited group reviews the manifest and its own terms locally.
3. Each group's authorized key holder accepts the exact manifest hash or declines. Either is recorded.
4. Each group runs its own local ballot under its own eligibility rules. No roster leaves the group (REQ-002).
5. Each group publishes its group-level result and verification evidence.
6. Verifiers recompute the combined result from the manifest and group artifacts (REQ-004).
7. Conflicts, withdrawals, and missing artifacts are shown as recorded, not resolved silently (Section 7).

Phase 1 follows the same steps with records moved by hand.

## 4. Requirements

Requirements marked **Opt-in** apply only to groups that choose federation. Other requirements apply to any shared decision. Priority uses Must, Should, and Could.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-18-REQ-001 | **Opt-in:** Each group shall sign acceptance of the exact shared manifest. | Must | A verifier rejects a manifest whose hash differs from the hash the group signed, or whose signature fails against the group's published key. A group without a valid acceptance is listed as not accepted. | Test (hash and signature mutation tests); conformance tests across independent verifiers |
| QV-18-REQ-002 | **Opt-in:** Groups shall retain local eligibility authority. Federation workflows shall not require upload of complete member rosters. | Must | Exchange and export schemas contain no roster or member-list field; a payload containing one fails schema validation. | Test (schema conformance); review (export privacy review) |
| QV-18-REQ-003 | **Opt-in:** Shared proposal and rule changes shall be versioned and visible. | Must | Each manifest has a version and content hash. Any change to proposal text or rules produces a new hash. A change after opening is accepted only through the amendment process the manifest declares; otherwise the verifier rejects it. | Test (manifest mutation tests); usability test (participants find the version) |
| QV-18-REQ-004 | **Opt-in:** Result combination shall be reproducible. | Must | An independent verifier, given only the manifest and exported group artifacts, produces the same combined result and per-group breakdown as the publisher. | Test (cross-implementation test vectors) |
| QV-18-REQ-005 | **Opt-in:** Withdrawal and nonparticipation shall follow the declared policy. | Must | After a withdrawal recorded before the declared cutoff, the verifier recomputes quorum and result using only manifest rules, and the output flags the withdrawal. | Test (withdrawal and quorum tests) |
| QV-18-REQ-006 | **Opt-in:** Member-level ballots shall not be disclosed to other groups by default. | Must | Federation exports contain no field that maps a member identifier to a choice. An automated field scan of exports finds none. | Review (export privacy review); test (field scan) |
| QV-18-REQ-007 | **Opt-in:** No operator shall be able to substitute the shared manifest or a group result without detection. | Must | A modified manifest or result fails signature checks. Two validly signed, different records for one decision are both retained and flagged as a conflict. | Test (conflicting-view simulation; signature tests) |
| QV-18-REQ-008 | **Opt-in:** Federation records shall be portable. | Must | A group can export profiles, accepted manifests, results, and evidence in documented, versioned formats. Re-importing an export into an independent verifier gives the same verification result. | Test (export/import round trip); review (format documentation) |
| QV-18-REQ-009 | Federation shall be disabled by default, and single-group voting shall run with no federation component. | Must | With federation disabled, a group creates, runs, and tallies a local ballot with no calls to federation endpoints, confirmed by a test run with those endpoints blocked. | Test (integration with federation endpoints blocked) |
| QV-18-REQ-010 | **Opt-in:** A group shall join a shared decision only through an explicit, recorded acceptance by an authorized key holder. | Must | No group signature on a manifest exists without a matching acceptance record. An invitation alone is recorded as not accepted. | Test (state transition tests); review (acceptance flow) |
| QV-18-REQ-011 | **Opt-in:** Each shared decision shall declare opening, closing, and time-zone rules in its manifest. | Must | A manifest without an explicit closing instant or time-zone rule is rejected before opening. Interfaces show every time with its time zone. | Test (schema conformance); usability test |
| QV-18-REQ-012 | **Opt-in:** Each manifest shall declare ballot method, ballot structure, eligibility cutoff reference, quorum, and result-combination rule before opening. | Must | Opening is refused when any field is missing, and the verifier flags a manifest with a missing field. | Test (schema conformance; opening-gate test) |
| QV-18-REQ-013 | **Opt-in:** Dissenting group results shall be shown separately when the manifest permits or requires it. | Should | Where the manifest requires a per-group breakdown, the interface and export show each group's result. A combined-only output fails verification. | Test (verifier test); usability test |
| QV-18-REQ-014 | **Opt-in:** Conflicting signed records shall be preserved and surfaced, not silently resolved. | Must | Two validly signed, different records for the same decision are both stored. Decision status shows "conflict" until resolved under the declared rule. No record is deleted. | Test (conflicting-view simulation); review |
| QV-18-REQ-015 | **Opt-in:** A shared decision shall be cancelled only through the declared cancellation process, and cancellation shall be signed and visible. | Must | Cancellation without the declared process is rejected. A signed cancellation record appears in history. No result is published for a cancelled decision. | Test (state transition tests) |
| QV-18-REQ-016 | **Opt-in:** Key rotation and retirement shall be recorded and verifiable. | Must | A rotation record references the prior key. Signatures made after a key's declared retirement point are rejected. Full key history is retrievable. | Test (signature and key-rotation tests); expert review |
| QV-18-REQ-017 | **Opt-in:** Relay or endpoint outages shall not change a decision outcome silently. | Must | In an outage simulation near closing, affected groups show "delivery incomplete." The result changes only under a rule declared in the manifest, and the change is recorded. | Test (partial-outage simulation) |
| QV-18-REQ-018 | **Opt-in:** Records shall carry protocol and serialization versions, and unknown versions shall be rejected. | Must | A parser rejects a record with an unknown version, shows a visible error, and does not partially process it. | Test (conformance tests) |
| QV-18-REQ-019 | **Opt-in:** Per-group results shall be withheld or merged when group size falls below the publication rule in the manifest. | Must | A small-group fixture shows withholding or merging as declared. No output reveals one member's choice under the rule. The rule's value is set by OD-14. | Test (small-group fixtures); review (privacy review) |
| QV-18-REQ-020 | **Opt-in:** Federation records shall contain only data needed to conduct and verify the decision. | Must | Every record field appears in the data inventory approved under QV-06. Undocumented fields fail schema validation. | Review (data inventory review); test (schema conformance) |
| QV-18-REQ-021 | **Opt-in:** Members shall be able to see, before their group accepts, what the group is joining and on what terms. | Should | Before the acceptance action, the interface shows the manifest hash, terms, withdrawal rule, and combination rule in plain language. Comprehension tests pass against criteria set before testing. | Test (comprehension testing); review |
| QV-18-REQ-022 | **Opt-in:** Group and decision identifiers shall not be derived from member identifiers. | Must | Identifier generation is documented. No member identifier appears in any group or decision identifier in exported records. | Review (design review); test (identifier scan of exports) |

## 5. Data and privacy

- **Data inputs:** group profile fields; proposal text and manifest fields (Section 7); acceptance, withdrawal, cancellation, key-rotation, and conflict records; each group's aggregate result and verification evidence.
- **Data outputs:** signed manifests and acceptances; group results; verification evidence; exports (REQ-008); the public record, as defined under OD-12.
- **Data controller/operator:** each group controls its own member data and eligibility. The relay or coordinator role is undecided (OD-09). This spec assumes that operator holds no member data. That assumption must be validated.
- **Retention and deletion:** Published signed records are designed to be immutable and may not be erasable after publication (see QV-06). Retention periods, deletion of local copies, and handling of copies held by other groups are open (OD-19).
- **Linkability risks:** stable group identifiers across decisions; repeated participation patterns; timing and traffic volume; group size revealed by counts; small aggregates; exports that let a recipient link a group's records.
- **Visibility by member, organizer, operator, and observer:**
  - Members: their own group's records, and the manifest of each decision their group joined.
  - Group administrators: their group's local data and records. They do not receive other groups' member-level data.
  - Relay or coordinator operator: transport metadata (sending group, time, size) and any content not encrypted. The manifest is visible to all participants.
  - Observers: only fields declared public under OD-12.
- **Privacy properties claimed (design targets, not verified):** no roster or member-level ballot leaves a group by default (REQ-002, REQ-006); signed records make changes detectable (REQ-007).
- **Privacy properties explicitly not claimed:** anonymity of members or groups; protection from timing or traffic observers; coercion resistance; that a group signature proves legitimate authority or member consent; fairness of the combination rule; that published records can be fully erased.

## 6. Security and abuse cases

This section covers only the cases listed. Compromised member devices, coercion, the legitimacy of group rules, and the correctness of cryptographic components are assessed under QV-07 and QV-16.

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Operator suppresses or delays one group's messages | Relay or coordinator operator | One group excluded or outcome delayed | Multiple relays (candidate, OD-08); signed artifacts; visible delivery status (REQ-017) | Suppression is visible only if another path shows the record exists. No delivery guarantee. |
| Different proposal or result views sent to different groups | Operator or compromised relay | Groups decide on different texts or totals | Signed manifest hashes; conflict preservation (REQ-014) | Detection requires comparison between groups; undetected if no comparison occurs |
| Signing key theft, or weak recovery used to impersonate a group | Attacker with key access; weak recovery process | False acceptance or result under a group's identity | Key rotation records (REQ-016); group-local acceptance; custody and recovery design (OD-06) | Signatures prove key use, not authorization. Compromise time may not be establishable from signatures. |
| Participation patterns reveal interests or relationships | Observer; relay operator | Group-level interests or partnerships exposed | Minimal public metadata (REQ-020); public/private record choice (OD-12) | Public participation is visible by design |
| Timing and traffic volume identify which group acted | Network observer; relay operator | Group activity linked to timing | None specified. Batching or delay to be evaluated. | Exposed; no timing protection is claimed |
| Small aggregate results reveal individual choices | Other groups; observers | A member's choice inferred in a small group | Publication rule (REQ-019, OD-14) | Inference remains possible above the rule's threshold |
| Majority imposes a result on a dissenting or nonparticipating group | Participating groups | Unfair outcome for a minority | Declared quorum and combination rule (REQ-005, REQ-012); dissent display (REQ-013) | Software cannot make a rule fair; the rule must be accepted in advance (OD-03) |
| Local members challenge a representative's decision to federate | Dissenting members | Legitimacy dispute | Group-local ratification (OD-11); visible terms (REQ-021) | Challenge process undefined |
| Manifest or record mutation, or replay | Attacker with relay access | Altered terms or reused records | Hash and signature checks (REQ-001, REQ-007); version checks (REQ-018) | Depends on signature scheme choice (OD-05) |

## 7. Interfaces, contracts, and dependencies

### API and schema contracts

- **Group profile** (signed, versioned): group identifier, public keys, protocol versions, exchange endpoint or method, administrative authorization policy, public governance documents, and contact and dispute channels. It must not require publishing member identities.
- **Decision manifest** (signed, immutable): unique decision identifier; participating group identifiers; proposal text or content hash plus retrievable text; exact rule versions accepted by each group; ballot method and structure; local eligibility cutoff or policy reference; group-level quorum and combination rule; opening and closing conditions with time-zone semantics; data each group shares or publishes; amendment, challenge, recount, withdrawal, and cancellation rules; protocol and serialization versions.
- **Acceptance record:** a group signature over the exact manifest hash. A signature proves acceptance by a key, not that the key holder had legitimate authority or that members consented.
- **Group result artifact:** the group's aggregate result and verification evidence. Evidence form follows QV-16.
- **Withdrawal, cancellation, conflict, and key-rotation records:** schemas to be defined under QV-09.

### Local participation

Each group keeps its eligibility process local. The initial model is that each group runs its own local ballot and publishes an aggregate result with verification evidence. A shared-ballot design using privacy-preserving credentials adds a stronger credential and protocol requirement (OD-02).

### Result combination

The manifest defines the rule: one-group-one-vote, member-weighted, quorum-gated, or another explicit rule. Candidate methods:
- Combine group-level aggregate results using a public deterministic rule.
- Verify each group's signed tally artifacts independently.
- Later, evaluate encrypted combination of group totals or shared encrypted ballots.

Show dissenting group results separately when policy permits. A single total must not conceal disagreement. Treatment of abstentions, unequal group sizes, nonparticipation, and withdrawal is open (OD-03, OD-04).

### Failure and retry behavior

| Scenario | Required behavior | Evidence preserved |
|---|---|---|
| Group signing key compromised during an open decision | Group revokes the key through the rotation process. Decision is flagged. Continuation or restart follows the manifest rule (OD-16). | Rotation record; signatures as recorded; flag |
| Relay unavailable near closing | Closing follows manifest time rules. Affected groups show "delivery incomplete." No silent extension or exclusion. | Delivery attempts and status |
| Relay censors or delays a group's records | Non-delivery is detected only where another path shows the record. The decision shows the gap. | Records held and received |
| Conflicting records for one decision | Both retained. Status "conflict." Resolution follows the declared rule and member process. | Both signed records |
| Malformed or conflicting manifest | Opening refused. Malformed record rejected with a visible error. | Rejected record and reason |
| Group withdraws | Withdrawal recorded. Quorum and result recomputed under the declared rule. The manifest states whether the result changes after cutoff. | Withdrawal record; before and after results where policy requires |
| Challenged local result | Local record remains. Federation record references the challenge. Combined-result handling follows OD-16. | Challenge record |
| Lost local evidence | Group cannot silently reconstruct it. Copies held by other groups remain. The gap is recorded. | Gap record |
| Group fork (competing keys claim one group identity) | Both key histories preserved. Members informed. Software does not choose a canonical group. | Both key histories |
| Group split into separate groups | New group identity. Source history unchanged. No automatic inheritance (QV-19 fork rules). | Source records unchanged |
| Several groups unreachable | Handled by the declared nonparticipation rule (REQ-005). Decision reports which groups responded. | Participation status per group |

### Upstream dependencies
- QV-03: decision lifecycle, quorum, dispute, and rule acceptance. Its roles matrix is incomplete.
- QV-04: each group's local eligibility and cutoff.
- QV-06: data inventory and retention. Its inventory is incomplete (blocks REQ-020).
- QV-07: threat model for relays, keys, and recovery.
- QV-16: signature, verification, and log designs.
- QV-17: credential formats, needed only for Phase 3.

### Downstream consumers
- Each group's local ballot system.
- Independent verifier.
- Group export and exit (QV-19).
- Relay or coordinator hosting (QV-08, OD-09).
- Support and incident handling (QV-12).

### Versioning and compatibility

Every record carries protocol and serialization versions (REQ-018). Unknown versions are rejected. Compatibility and version-support policy is open (OD-21).

## 8. UX, accessibility, and localization

- **Key screens:** group profile and terms; manifest review and acceptance; invitation and decline; per-group results and dissent view; conflict and withdrawal notices; export and import.
- **Plain-language explanations:** an acceptance means the group's key accepted this exact text, not that every member agreed (REQ-021). The combined result follows a stated rule. Software cannot make that rule fair.
- **Keyboard and screen-reader requirements:** acceptance and results views operable by keyboard and readable by assistive technology. Hashes and identifiers shown in a form that can be compared character by character.
- **Low-bandwidth and device constraints:** manifests and records retrievable as plain text. Manual exchange (Phase 1) works without a connection to federation endpoints.
- **Localization requirements:** manifest language is part of the signed text (OD-18). Interface text and explanations are translated before any group accepts, without changing meaning.

## 9. Operations

- **Configuration:** federation off by default (REQ-009). Per-group settings for exchange method (OD-08) and key storage (OD-06).
- **Monitoring and audit:** record every acceptance, decline, withdrawal, cancellation, conflict, and key rotation in signed history. Monitor delivery status per group. Logs must not join member identity to participation timing (see QV-16).
- **Backup, recovery, and deletion:** signing keys and history backed up under the custody design (OD-06). Deletion limits follow Section 5 and OD-19.
- **Incident response:** key-compromise procedure to revoke, rotate, record, and notify participants of affected decisions. Not yet written. Expert review required.
- **Support and escalation:** group administrators first. Disputes route through the QV-03 process. Operator escalation through QV-12.

## 10. Testing and verification

- **Unit tests:** manifest canonicalization and hashing; signature verification; schema validation; state transitions for acceptance, withdrawal, and cancellation.
- **Integration tests:** two-group exchange by manual import (Phase 1); quorum and withdrawal recomputation; federation-disabled path (REQ-009); version rejection (REQ-018).
- **End-to-end tests:** invitation through verified result, and partial outage near closing (Phase 2 only).
- **Security/privacy tests:** manifest and result mutation; replay; conflicting views; key rotation and retired-key rejection; export field scan; small-group suppression; identifier scan.
- **Independent review or audit:** expert cryptography and protocol review before Phase 2 release (OD-05, OD-06, OD-07). Privacy review of exports (REQ-006, REQ-020). Comprehension testing of acceptance and results (REQ-021).
- **Release-blocking criteria:** all Must requirements verified. Federation off by default. OD-02, OD-05, OD-07, OD-08, and OD-09 closed, or deferred with rationale in the decision log, before Phase 2 release. Interoperable test vectors pass on more than one independent verifier implementation.

## 11. Constraints and assumptions

**Constraints**
- No new cryptographic primitives; use reviewed, version-pinned implementations (QV-16).
- No token, smart contract, public ledger, public directory, or global membership registry is required.
- Each group keeps its own roster. The federation layer receives no roster.

**Assumptions requiring validation**
- Groups can keep signing keys secure enough for the decision's stakes [UNVERIFIED].
- Groups are willing to share aggregate results and evidence with other groups.
- Participants understand that a signed acceptance is not member consent.
- Group clocks are close enough for deadlines [UNVERIFIED].
- Manual exchange is sufficient for early use (recommendation; not validated).

**Reference inputs** (not selected dependencies)
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/) and [DID Core](https://www.w3.org/TR/did-core/) for identity and credential interoperability concepts.
- [W3C ActivityPub](https://www.w3.org/TR/activitypub/) for federation concepts. It is not a governance or voting protocol.
- [RFC 9162 — Certificate Transparency v2.0](https://www.rfc-editor.org/rfc/rfc9162.html) for append-only logs and consistency proofs. A single log can still equivocate without monitoring.
- Key-management and signature references cited in QV-16 (FIPS 186-5; NIST SP 800-57 Part 1 Rev. 5).

## 12. Open questions

Each open question is tracked as a decision in Section 14.

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| Which candidate use case is first? (OD-01) | Project owner | Before Phase 1 design | Pending |
| Local-result aggregation or shared member ballot? (OD-02) | Project owner; expert reviewer | Before Phase 2 design | Pending |
| Weighting, quorum, and withdrawal treatment? (OD-03, OD-04) | Project owner | Before Phase 2 design | Pending |
| Public or private records? (OD-12) | Project owner | Before Phase 1 build | Pending |
| Group discovery and invitation? (OD-10) | Project owner | Before Phase 2 design | Pending |
| Group identity, signatures, and key recovery? (OD-05, OD-06) | Expert reviewer; project owner | Before Phase 1 build | Pending |
| Local ratification of federation? (OD-11) | Project owner | Before Phase 2 design | Pending |
| Dissent representation and cross-jurisdiction constraints? (OD-13, OD-15) | Project owner; legal review | Before Phase 2 design | Pending |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | — |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 14. Open decisions

Each entry lists the question, candidates, trade-offs, what is needed to decide, and the owner. Every entry requires expert review before it is closed.

### OD-01 — First use case
- **Question:** Which candidate use case should the first shared decision support?
- **Candidates:** (a) shared purchasing policy for co-ops; (b) coordinated proposal for worker collectives; (c) opt-in action for independent online communities.
- **Trade-offs:** (a) involves money-related rules that may fall outside software scope; (b) likely needs strong local ratification; (c) membership rules may be least defined.
- **Needed to decide:** user research with prospective groups; policy review under QV-03; entry in the decision log.
- **Owner:** Project owner. Expert review required (product and policy).

### OD-02 — Local-result aggregation or shared member ballot
- **Question:** Do groups exchange aggregate results only, or do members cast a shared ballot?
- **Candidates:** (a) aggregate results with verification evidence (initial model); (b) shared ballot with privacy-preserving credentials (Phase 3).
- **Trade-offs:** (a) keeps rosters local and is simpler, but reveals group-level totals; (b) reduces group-level exposure but needs credential and protocol review (QV-16, QV-17).
- **Needed to decide:** protocol comparison under QV-16; threat-model review under QV-07.
- **Owner:** Project owner; expert reviewer. Expert review required.

### OD-03 — Result-combination rule and weighting
- **Question:** How are group results combined?
- **Candidates:** one-group-one-vote; member-weighted; quorum-gated; another explicit rule.
- **Trade-offs:** member weighting favors large groups and reveals group size; one-group-one-vote can outweigh member counts; quorum gates add stall risk.
- **Needed to decide:** agreement from each prospective group before a decision is opened; fairness review.
- **Owner:** Project owner. Expert review required.

### OD-04 — Quorum, abstention, nonparticipation, and withdrawal
- **Question:** How do quorum and results treat abstentions, unequal group sizes, nonparticipation, and withdrawal?
- **Candidates:** exclude non-responding groups from the total; count them as no; hold the decision until a quorum responds.
- **Trade-offs:** exclusion lets a few groups decide; counting as no lets a minority block; holding risks indefinite stall.
- **Needed to decide:** QV-03 quorum policy; worked examples with the chosen weighting.
- **Owner:** Project owner. Expert review required.

### OD-05 — Signature scheme for group keys, manifests, and results
- **Question:** Which signature scheme signs profiles, manifests, acceptances, and results?
- **Candidates:** elliptic-curve signatures; RSA-based signatures; other signature families (maturity for this use [UNVERIFIED]).
- **Trade-offs:** key and signature size; verifier library support; ease of independent implementation; long-term verifiability.
- **Needed to decide:** cryptographic review; test vectors; the FIPS 186-5 reference from QV-16.
- **Owner:** Expert reviewer (cryptography); project owner. Expert review required.

### OD-06 — Group key custody, rotation, and recovery
- **Question:** Who holds group signing keys, and how are they rotated and recovered?
- **Candidates:** single key held by an administrator; threshold signing by several members; hardware-backed keys; rotation with cross-signing by the prior key.
- **Trade-offs:** single keys are simple and fragile; threshold signing spreads trust and adds coordination cost; recovery paths can be exploited (REQ-016).
- **Needed to decide:** key-management design under QV-07 and SP 800-57 guidance cited in QV-16; recovery exercises.
- **Owner:** Expert reviewer (cryptography); project owner. Expert review required.

### OD-07 — Ordering and agreement for shared records
- **Question:** Is any ordering, log, or consensus mechanism needed for shared records?
- **Candidates:** none (groups compare manifest hashes directly); append-only signed log with independent witnesses (RFC 9162 pattern); single coordinator ordering; multi-party agreement protocol (applicability [UNVERIFIED]); distributed ledger.
- **Trade-offs:** no mechanism leaves equivocation undetected unless groups compare; a log needs monitors; a coordinator is a single point of control; a ledger adds permanence and metadata exposure, and is not required.
- **Needed to decide:** threat-model review of equivocation; monitor and witness design; metadata analysis for any ledger.
- **Owner:** Expert reviewer; project owner. Expert review required.

### OD-08 — Transport and exchange method
- **Question:** How do records move between groups?
- **Candidates:** manual file exchange (Phase 1); group-hosted endpoints pulled by peers; relay or inbox service (ActivityPub-style concept); multiple independent relays; peer-to-peer.
- **Trade-offs:** manual exchange is slow but avoids operators; endpoints expose group availability; relays enable censorship and metadata exposure; multiple relays add cost.
- **Needed to decide:** threat-model review; availability targets under QV-08; transport security under QV-16.
- **Owner:** Project owner; expert reviewer. Expert review required.

### OD-09 — Relay and coordinator role and trust model
- **Question:** Does any party coordinate federation, and what may it see or do?
- **Candidates:** no coordinator; coordinator designated per decision; several operators; QuietVote-hosted operator; group-run operators.
- **Trade-offs:** no coordinator maximizes control but may stall delivery; a hosted operator is convenient but sees metadata; several operators spread trust and raise coordination cost.
- **Needed to decide:** QV-08 hosting models; QV-07 operator trust assumptions; metadata review.
- **Owner:** Project owner. Expert review required.

### OD-10 — Group discovery and invitation
- **Question:** How do groups find one another?
- **Candidates:** invitation only; a self-published group profile in an optional directory; no directory.
- **Trade-offs:** invitation only limits discovery but reduces exposure; a directory helps discovery but publicizes group existence and interests.
- **Needed to decide:** privacy review of group-existence disclosure; user research.
- **Owner:** Project owner. Expert review required.

### OD-11 — Local ratification of federation participation
- **Question:** How do a group's members approve its federation?
- **Candidates:** administrator decision; member vote under QV-03 policy; hybrid with a notice period.
- **Trade-offs:** administrator decision is fast but invites legitimacy challenges; a member vote is slower and needs its own privacy design.
- **Needed to decide:** QV-03 decision lifecycle; challenge process definition.
- **Owner:** Project owner. Expert review required.

### OD-12 — Public and private record scope
- **Question:** Which federation records are public?
- **Candidates:** fully public; visible to participating groups only; tiered, with manifests and results public and evidence restricted.
- **Trade-offs:** public records aid verification and cannot be withdrawn once published; restricted records limit observers and weaken independent checks.
- **Needed to decide:** QV-06 retention analysis; verification requirements from QV-11.
- **Owner:** Project owner. Expert review required.

### OD-13 — Dissent representation
- **Question:** When is a dissenting group's result shown separately?
- **Candidates:** always; only when the manifest requires it; only in aggregate form with suppression.
- **Trade-offs:** always-shown reveals minority positions and small-group detail; manifest-driven display depends on policy; aggregate form hides disagreement.
- **Needed to decide:** usability testing; small-group analysis (OD-14).
- **Owner:** Project owner. Expert review required.

### OD-14 — Small-group publication rule
- **Question:** Below what group size are per-group results withheld or merged?
- **Candidates:** a fixed rule set by QuietVote; a rule set per manifest; no per-group publication at all.
- **Trade-offs:** a fixed rule is predictable but may fit no group; per-manifest rules vary in protection; no publication limits transparency.
- **Needed to decide:** inference analysis under QV-06 and QV-07; the threshold value itself, not yet chosen.
- **Owner:** Project owner; expert reviewer. Expert review required.

### OD-15 — Cross-jurisdiction constraints and scope fit
- **Question:** Do shared decisions across groups in different jurisdictions carry legal duties, and do they fit the README's initial scope of internal decisions?
- **Candidates:** restrict federation to one jurisdiction; allow cross-border with published terms; defer federation until scope is extended.
- **Trade-offs:** restriction limits use cases; cross-border terms add legal exposure; deferral delays Phase 2.
- **Needed to decide:** legal review; project-owner decision on scope.
- **Owner:** Project owner; legal review. Expert review required.

### OD-16 — Amendment, challenge, recount, cancellation, and conflict rules
- **Question:** What process governs changes, challenges, and conflicts in shared decisions?
- **Candidates:** the group-local process only; a manifest-declared process agreed in advance; cancel and restart for any change after opening.
- **Trade-offs:** local-only process cannot resolve cross-group conflicts; declared process is predictable but must be fixed before opening; restart is clear but costly.
- **Needed to decide:** QV-03 amend and dispute policy; worked failure scenarios from Section 7.
- **Owner:** Project owner. Expert review required.

### OD-17 — Time semantics across groups
- **Question:** How are opening and closing instants defined across time zones and clocks?
- **Candidates:** one shared instant in UTC; local time per group with a declared reference; a closing instant plus grace rule.
- **Trade-offs:** a shared instant is unambiguous but needs clear display; local times feel natural but invite disputes; grace rules delay results.
- **Needed to decide:** QV-08 time-handling decision; clock-accuracy assumption (Section 11).
- **Owner:** Project owner. Expert review required.

### OD-18 — Multilingual manifests
- **Question:** What does the signed hash cover when a manifest exists in several languages?
- **Candidates:** one signed manifest per language; one canonical language with non-binding translations; one signed manifest with all languages inside.
- **Trade-offs:** per-language signing is exact but multiplies acceptances; canonical-language signing is simple but may disadvantage readers; combined signing is complex.
- **Needed to decide:** QV-13 localization requirements; comprehension testing.
- **Owner:** Project owner. Expert review required.

### OD-19 — Retention and deletion of federation records
- **Question:** How long are federation records and copies kept, and what can be deleted?
- **Candidates:** retain signed records permanently; retain for a declared period; delete local copies only.
- **Trade-offs:** permanent records support verification but resist erasure; declared periods support deletion but may break later verification.
- **Needed to decide:** QV-06 retention review; legal review (OD-15).
- **Owner:** Project owner. Expert review required.

### OD-20 — Gate criteria for automated federation
- **Question:** What evidence shows that export and import are insufficient and automated federation is justified?
- **Candidates:** user-reported need recorded in the decision log; measured failure of manual exchange in pilots; no gate, with manual exchange as default.
- **Trade-offs:** a stated gate prevents premature automation but is hard to measure; no gate risks building before need is shown.
- **Needed to decide:** pilot design; measurable criteria (none defined yet).
- **Owner:** Project owner. Expert review required.

### OD-21 — Compatibility and version-support policy
- **Question:** How long are old protocol versions supported, and how are they migrated?
- **Candidates:** support the current version only; support one prior version for a declared period; permanent read support for signed records.
- **Trade-offs:** current-only is simple but can strand records; prior-version support adds maintenance; permanent read support adds verifier burden.
- **Needed to decide:** QV-09 versioning policy; export format review (REQ-008).
- **Owner:** Project owner; expert reviewer. Expert review required.
