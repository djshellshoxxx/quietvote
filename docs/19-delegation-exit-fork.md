# QV-19 — Revocable Delegation, Exit, and Governance Forks

**Module ID:** `delegation-exit`  
**Status:** Proposed specification; requires project-owner review  
**Related specs:** QV-02, QV-03, QV-04, QV-05, QV-06, QV-07, QV-08, QV-09, QV-16, QV-17, QV-18

## 1. Objective

Specify optional, bounded delegation of participation rights and practical group exit/export/fork. A member may delegate authority within a defined scope and expiry; a group may export its rules and public decision records or establish a new governance branch under revised rules.

These functions record authorization and procedure. They do not resolve ownership of external assets, funds, domains, or legal entities.

Who needs it: members who cannot take part in a narrow decision and want a trusted person to act for them; members who leave a group and need their own records; members who disagree with a group's rules and want to continue under different ones.

## 2. Scope

### Principles and candidate MVP

- Delegation is opt-in, scoped, time-limited, and revocable.
- It does not transfer membership or account ownership.
- The member sees the exact scope, policy version, and expiry before confirmation.
- Do not silently allow redelegation; initial version should be direct-only.
- Delegation is disabled until the group enables it under a published policy.
- At most one unit of voting weight per eligible member unless group policy explicitly says otherwise.
- A direct ballot may supersede a delegation only under rules published before the decision (OD-02).
- Do not make broad, indefinite delegation a default.

A delegation record binds delegator eligibility, delegate, topic or decision, policy version, time window, direct-vote override setting, and consent. Visibility of these fields is a policy choice (OD-04).

### In scope

- Direct, single-step delegation for one decision or a narrow topic/time scope (Phase B candidate).
- Delegation states and transitions (Section 3).
- Member exit: individually exportable records and revocation of roles and credentials.
- Group export: portable bundle of public records with an integrity manifest (Phase A candidate).
- Governance fork of public rules and public decision history under a new group identity.

### Out of scope and non-goals

- Transitive delegation, delegation chains, and redelegation of received weight. Deferred. Any later design must define cycle handling, chain limit, redelegation authority, multiple paths, direct-vote precedence, and privacy-safe concentration monitoring.
- Transfer of membership, account ownership, funds, domains, contracts, property, or legal entities.
- Legal authority, and binding corporate or public election use (outside QuietVote's initial scope per README).
- Coercion resistance, guaranteed free choice, or any claim that a delegate votes as the delegator would.
- Automated federation (QV-18) and shared cross-group ballots.
- Selection of signature schemes, export format standards, or cryptographic primitives (Section 14).
- Ballot encoding and tally methods (QV-05).

### Phasing (candidate)

- **Phase A:** versioned rules, public-record export, integrity manifest, fork of public rules only.
- **Phase B:** optional one-step, direct-only delegation for one decision or narrow time/topic scope; revocation before cutoff.
- **Phase C:** research privacy-preserving delegation only if users need it; require protocol and usability review.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Delegator (member) | Give a narrow decision right to a chosen delegate, or revoke it | Group policy enables delegation; delegator eligible for the decision | Delegation active, then revoked, expired, or consumed |
| Delegate (member) | Cast weight delegated to them for one decision | Delegation active; delegate eligible | Delegate's accepted ballot consumes the delegation |
| Leaving member | Keep own records; end delegations | Member is leaving or has left | Own records exported; active delegations given or received ended |
| Organizer | Publish policy and cutoff; produce export | Policy authority under QV-03 | Signed policy version; cutoff set; bundle produced |
| Observer or verifier | Check export or tally snapshot | Bundle or snapshot available | Pass, or fail with reason |
| Founders of a fork | Create a new group from source public records | Fork policy allows it | New group identity; imported history labelled |
| Dissenting member | Stay in source group or leave | Source history intact | Own choice; source history preserved |

### Delegation transitions (candidate)

Delegation changes (create, confirm, revoke, end-on-exit) are accepted only before the cutoff. "Cutoff" is a point in time, not a state. Ballots that use a frozen delegation are accepted in the voting window against the snapshot (REQ-014). Consumption is appended to the record and does not change the snapshot.

| From | Event | To | Condition |
|---|---|---|---|
| (none) | Delegator creates | draft | Group policy enables delegation (REQ-001) |
| draft | Delegator confirms | active | Consent recorded; before cutoff and expiry (REQ-018) |
| draft | Delegator abandons | removed | Per OD-07; a draft never affects a tally |
| active | Delegator revokes | revoked | Before cutoff (REQ-003) |
| active | Member exit (either side) | revoked | REQ-020 |
| active | Expiry instant reached | expired | REQ-016 |
| active | Decision closes unconsumed | expired | Candidate; see OD-06 |
| active | Delegate's accepted ballot | consumed | Within voting window; uses snapshot (REQ-013, REQ-015) |
| active | Delegator's direct ballot | per OD-02 | Only where policy enables override (REQ-017) |

### Failure behavior

| Failure or race | Required behavior |
|---|---|
| Revocation arrives near cutoff | Applied only if recorded before cutoff in the append-only event order; otherwise rejected with reason. No partial state (REQ-003). |
| Revocation and delegate ballot race | One outcome, matching recorded event order; weight counted at most once (REQ-015, REQ-004). |
| Response lost in transit | Client shows "pending" until the system confirms. Retrying with the same request ID creates no duplicate (REQ-027). A revocation is not treated as applied until recorded. |
| Policy changes after activation | Existing delegation keeps its accepted version (REQ-006). |
| Delegate leaves group | Delegations to that delegate end; delegators are notified (REQ-020, REQ-019). |
| Backup restored | State must match the event record; no pre-cutoff revocation reverts (REQ-026). |
| Export interrupted or incomplete | Bundle marked partial, with missing items listed (REQ-021). |
| Export verification fails | Verifier rejects the bundle; no partial pass (REQ-007). |
| Fork during open decision | Open decision not transferred; closed or cancelled under source rules (REQ-022). |
| Fork dispute | Both histories retained and verifiable; no canonical group designated (REQ-023). |
| Signing key compromise during open decision | Handled under QV-12 incident response. Snapshot is not silently replaced; any correction is a visible, signed amendment. |

## 4. Requirements

The system shall meet each requirement below. Priority reflects the candidate MVP; "Must (when enabled)" applies only where the group policy enables the feature.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-19-REQ-001 | The system shall allow delegation only in groups whose published, signed policy enables it. | Must | Create requests in disabled groups are rejected with a reason that cites policy. UI states policy status. | Test; UX review |
| QV-19-REQ-002 | The system shall bind every delegation to an explicit scope, a policy version, and an expiry. | Must | Records missing any of the three are rejected. Confirmation screen and signed record show all three. | Test (schema/API); UX review |
| QV-19-REQ-003 | The system shall let the delegator revoke an active delegation before the published cutoff. | Must | Revocation recorded before cutoff sets state to revoked and removes weight from tally input. The same request after cutoff is rejected with reason. | Integration test at cutoff boundary |
| QV-19-REQ-004 | The system shall count each eligible member's weight at most once per decision unless policy sets another weight. | Must | For every replay, concurrency, duplicate-credential, and direct-vote case in the test manifest, counted weight equals the expected value. Counted weight never exceeds configured weight. | Model-based and property tests; independent recount |
| QV-19-REQ-005 | The system shall reject redelegation of received weight. | Must | API rejects any request that reassigns received weight. UI offers no such control. | Test; inspection |
| QV-19-REQ-006 | The system shall not change the effect of an active delegation when a later policy version is published. | Must | Active record keeps its accepted policy version. Adopting a new version requires reconfirmation. | Test with policy-change fixture; review |
| QV-19-REQ-007 | The system shall version every export and make it integrity-checkable. | Must | Verifier fails on each altered, missing, or extra file in fixtures, and passes on the unmodified bundle. Unknown format version returns "unsupported", not success. | Fixture tests; independent verifier review |
| QV-19-REQ-008 | The system shall create a new identity for a fork and preserve source history unchanged. | Must | Source records are hash-identical before and after fork. Each imported record shows source group ID and source hash. | Test; integrity comparison |
| QV-19-REQ-009 | The system shall not transfer personal data, keys, credentials, active delegations, private ballots, or identity mappings by default. | Must | Export and fork fixtures containing these produce bundles without them. Personal data moves only with each affected member's recorded consent (OD-12). | Automated field scan; review |
| QV-19-REQ-010 | The system shall explain the limits of exit and fork to members. | Must | Limits notice appears before export, exit, and fork confirmation. In moderated testing, participants identify each limit in Section 5.4. | Usability test; review |
| QV-19-REQ-011 | The system shall allow only the transitions listed in Section 3 for delegations. | Must | Model-based test covers every state-event pair. Only listed transitions succeed. Each rejection is logged with reason. | Model-based test |
| QV-19-REQ-012 | The system shall treat revoked, expired, and consumed as terminal states. | Must | Revoke, activate, or consume on a terminal delegation fails. Its history is unchanged. | Test |
| QV-19-REQ-013 | The system shall count weight only from delegations that are active in the frozen snapshot, and count a consumed delegation once, through the delegate's accepted ballot. | Must | Fixture with one record in each state yields the expected weight. Consumed weight appears once. | Test |
| QV-19-REQ-014 | The system shall freeze the active delegation set and weights at cutoff in a signed snapshot. | Must | Snapshot hash is recorded at cutoff. Replaying later events yields identical tally input. Later events appear only as audit entries. | Test; independent recount |
| QV-19-REQ-015 | The system shall resolve a revocation and a delegate ballot for the same delegation by recorded event order. | Must | For every generated interleaving, outcome matches recorded order and weight is counted at most once. | Concurrency test with interleaving generator |
| QV-19-REQ-016 | The system shall move an active delegation to expired at its expiry instant. | Must | Ballots using the delegation at or after expiry are rejected; those before are accepted. Boundary tests pass. Clock source per OD-06. | Test with controlled clock |
| QV-19-REQ-017 | Where policy enables override, the system shall give a delegator's accepted direct ballot precedence over delegated weight for that decision. | Must (when enabled) | For every ordering of direct ballot, delegate ballot, and revocation, counted weight matches the policy rule with no double count. State label per OD-02. | Ordering-matrix test |
| QV-19-REQ-018 | The system shall record delegator consent before a draft becomes active. | Must | Activation without a consent record is rejected. Record holds scope, policy version, expiry, and revocation limits. | Test |
| QV-19-REQ-019 | The system shall notify the delegator when a delegation expires, is consumed, or is ended by a delegate's exit. | Should | Each such transition produces one notice. Notice reveals no other member's data. | Test; review |
| QV-19-REQ-020 | The system shall end active delegations given or received by a member when that member exits, before the cutoff. | Must | After exit, no active delegation references the exiting member. Affected delegators are notified (REQ-019). | Test |
| QV-19-REQ-021 | The system shall mark any export that is incomplete as partial and list each missing item. | Must | Fault injection (missing artifact, failed write) yields a partial bundle with a complete missing list. Verifier reports partial, never complete. | Fault-injection test; verifier test |
| QV-19-REQ-022 | The system shall not transfer an open decision to a fork. | Must | No open ballot appears in the fork. Source decision shows closure or cancellation under source rules. | Test; review |
| QV-19-REQ-023 | The system shall not designate a canonical group in a fork dispute. | Must | Verifier passes on both source and fork histories. Fork record links to source history. Neither history is hidden. | Test; inspection |
| QV-19-REQ-024 | The system shall limit a member exit export to that member's own records and public records. | Must | Field scan finds no other member's identity, private ballot, or identity mapping. | Fixture scan |
| QV-19-REQ-025 | The system shall state, in the exit notice, which copies of a member's data can and cannot be deleted. | Should | Notice lists each copy class (live, backup, archived bundle) per QV-06. | Review; usability test |
| QV-19-REQ-026 | The system shall not let backup restore revert a state transition accepted before cutoff. | Must | Restored state matches the event record. Pre-cutoff revocations stay revoked. | Restore test |
| QV-19-REQ-027 | The system shall apply a repeated create, confirm, revoke, or consume request with the same request ID once. | Must | Repeats produce one state change and no duplicate weight. | Test with retries and injected lost responses |

## 5. Data and privacy

- Data inputs: delegator and delegate group-local identifiers; eligibility status (QV-04); scope (decision ID, optional topic and time window); policy version; expiry; consent record; direct-override setting; state events with timestamps; export and fork selections.
- Data outputs: delegation statement (visible per policy); state event record; cutoff snapshot with aggregate weights; export bundle (Section 5.2); fork bundle.
- Data controller/operator: the group is intended to be the controller of its members' data. Legal characterization of the hosting operator's role is [UNVERIFIED] and open (OD-15).
- Retention and deletion: not set. Follows QV-06 periods once set. Drafts removed per OD-07. Append-only event entries may conflict with deletion (OD-14).
- Linkability risks: delegator–delegate pairs; consumption ties a delegate's ballot to the delegator's weight; expiry and timing reveal activity; small groups; event history in exports and backups; service logs that join login and state events (QV-16 Section 6).
- Visibility by member, organizer, operator, and observer: not set (OD-04). Proposed minimum: members see their own records; observers see only signed snapshots, aggregates, and public records.
- Privacy properties claimed: delegation requires explicit consent and can be revoked before cutoff; consent and state changes are recorded; personal data is excluded from exports by default (REQ-009).
- Privacy properties explicitly not claimed: anonymity of delegator–delegate relationships; hiding delegations from the operator or organizers; coercion resistance; that a delegate's vote reflects the delegator's free choice; erasability of public records after publication.

### 5.1 Delegation and cryptographic role

Organizations choose and disclose whether delegator/delegate identities, relationships, topic, expiry, received weight, or decision-specific use are visible. Candidate modes: transparent, pseudonymous, or private relationships (OD-04).

Candidate components, none selected: signed, versioned delegation statements (scope authorization); anonymous credentials for eligibility (QV-17); decision-scoped nullifiers to prevent duplicate weight; signed policy manifests binding tally rules; an append-only event record proving state transitions without publishing member-to-delegate links (QV-16).

Cryptography cannot show that a member acted freely or that group rules are fair. Private delegation may reduce social pressure but makes oversight harder. Small-group and timing inference risks must be measured.

### 5.2 Portable export bundle

Candidate contents: group identifier and public keys; signed policy versions; public proposals and rule history; closed decision manifests and published results; public audit artifacts; verifier version; data dictionary; format version; integrity manifest.

Excluded by default: member identities, private ballots, identity mappings, secret keys, credentials, private messages, and active delegations. Encrypted ballot artifacts may expose metadata or support correlation; any inclusion must state its purpose.

### 5.3 Member exit

Individually exportable records (REQ-024); organization-level records; handling of open decisions (REQ-022); deletion from backups and continued verification of archived decisions (REQ-025, OD-14); revocation of roles and credentials (REQ-020).

### 5.4 Governance fork

A fork creates a new group identity, policy branch, and decision history. It preserves source history unchanged, identifies source policy and changes, requires consent for any transferred personal data, never copies credentials, keys, or active delegation, reissues roles under new rules, labels imported history, and makes no claim to inherit external property or legal authority.

| Data | Default fork handling |
|---|---|
| Public rules and signed rule history | May copy with source attribution and integrity proof |
| Public proposals and closed results | May copy only if source policy permits |
| Member identity and eligibility | Exclude unless policy and each member permit |
| Private ballots or identity mappings | Exclude |
| Keys, credentials, and active delegation | Never copy; reissue under new group identity |
| Open decision | Do not transfer automatically; close or cancel under source rules |
| External funds, accounts, contracts, property | Outside QuietVote |

## 6. Security and abuse cases

Trust boundaries:
- **Member device:** holds consent and any keys. Compromise is not covered by this module's guarantees.
- **Delegation and ballot service:** orders events and must not alter a frozen snapshot.
- **Organizer:** sets policy and cutoff. A signed policy shows who set the rules, not that they are fair.
- **Hosting operator:** can access stored data unless QV-16 controls apply. Not assessed here.
- **Verifier:** the bundle is only as checked as the verifier implementation.
- **Forked group:** new key holders; inherits no authority from the source.

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Influence concentration | Delegate gathering many delegators | Outsized decision weight | Group-set cap or alert (OD-03); disclose received weight where safe | Coordinated direct voting may still concentrate influence; disclosure may leak in small groups |
| Pressure to delegate | Other members or delegates | Delegation not freely chosen | Explicit consent; private revocation; no default | Coercion not prevented; no claim made |
| Cutoff dispute | Organizer or member | Disputed scope or timing | Publish cutoff before opening; signed state history (REQ-014) | Clock source open (OD-06) |
| Rule mutation | Organizer | Rules changed mid-delegation | Versioned, signed policies; accepted version kept (REQ-006) | Future policy can still change under group rules |
| Replay or concurrent submission | Attacker or client retry | Double weight | Event order; one count per member per decision (REQ-004, REQ-015, REQ-027) | Depends on the unselected nullifier scheme (QV-17) |
| Revocation race at cutoff | Member near deadline | Unclear outcome | Deterministic ordering; "pending" status (Section 3) | Ordering authority open (OD-06) |
| Unauthorized data copy | Bug or operator | Personal data leaves in export | Exclusion by default; field scan (REQ-009) | Scans catch only listed patterns |
| Partial export shown as complete | Fault or altered bundle | Misleading history | Partial flag and missing list (REQ-021) | An altered bundle may strip the flag; integrity proof open (OD-10) |
| Misleading fork history | Fork founders | Members believe fork inherits authority or history | Attribution, integrity manifest, limits notice (REQ-008, REQ-010) | Founders can still claim lineage informally |
| Fork during active decision | Founders or dissenters | Two conflicting outcomes | REQ-022; cancel under source rules | Source rules may not provide cancellation (OD-13) |
| Competing keys in fork dispute | Either group | Confusion over which group is authoritative | REQ-023; no canonical designation | Software surfaces the conflict but does not resolve it |
| Small-group inference | Observer with side information | Individual choice or delegation inferred | Minimal public delegation detail; aggregate disclosure review | Inference not eliminated in small groups |
| Signing key compromise | Attacker with key | Forged statements or exports | QV-12 response; visible signed amendments | Key recovery method not defined (OD-08) |

## 7. Interfaces and dependencies

- Upstream dependencies: QV-03 (policy versions, cutoff, decision lifecycle, dispute rules); QV-04 (eligibility and roles); QV-06 (retention, export, deletion); QV-07 (threat model); QV-16 (signatures, append-only record, manifests; none selected); QV-17 (scope-bound identifiers, if weight caps use them).
- Downstream consumers: QV-05 (tally must define how delegated weight enters the tally); QV-08 and QV-09 (hosting and contracts); QV-10 (UX); QV-11 (test gates); QV-12 (incident response and backups); QV-18 (fork of federated records only after QV-18 approval).
- API/event/schema contracts: not yet defined. Required: delegation record (REQ-002), state event, cutoff snapshot, export manifest (file list, hashes, format version, verifier version, data dictionary). Formats are open (OD-08, OD-09).
- Versioning and compatibility: policy version and export format version are required fields. Unsupported versions are rejected (REQ-007). Compatibility policy open (OD-09).
- Failure and retry behavior: create, confirm, revoke, and consume are idempotent by request ID (REQ-027). Unacknowledged requests are not applied (Section 3).

## 8. UX, accessibility, and localization

- Key screens or interactions: policy status; delegation create and confirm; revoke; delegation status; exit notice; export; fork creation with limits notice.
- Plain-language explanations: what a delegate can do; what expiry means; when revocation stops working; that delegation does not transfer membership; what export excludes; that software cannot transfer property or legal authority (REQ-010).
- Keyboard/screen-reader requirements: all steps operable by keyboard. Scope, expiry, and policy version are stated as text, not only visually. Status changes are announced. Detailed requirements per QV-13.
- Low-bandwidth and device constraints: confirmation and status work on small screens and slow connections. Export download must be retryable; method open (OD-09) [UNVERIFIED feasibility].
- Localization requirements: policy text, limits notices, and export notices are provided in each language the group uses (QV-13).

## 9. Operations

- Configuration: per-group delegation switch and policy version; cutoff; expiry options; visibility mode (OD-04); cap settings (OD-03); override setting (OD-02).
- Monitoring and audit: the state-transition log is append-only. Monitoring tracks counts and errors, not per-member delegation links. Concentration alerts use aggregates only (QV-16 Section 5 applies).
- Backup, recovery, and deletion: backups hold the event record. Restore follows REQ-026. Deletion follows QV-06 and OD-14.
- Incident response: suspected compromise of a delegation or export signing key is handled under QV-12. Corrections are new signed, visible amendments, never edits.
- Support and escalation: members can view their delegation status and request exports. Support access follows QV-06. Disputes follow the QV-03 process.

## 10. Testing and verification

- Unit tests: state machine (REQ-011, REQ-012); scope and expiry validation (REQ-002); weight rules (REQ-004); redelegation rejection (REQ-005).
- Integration tests: cutoff boundary and revocation race (REQ-003, REQ-015); direct-override ordering (REQ-017); snapshot freeze (REQ-014); policy binding (REQ-006); backup restore (REQ-026); export fault injection (REQ-021); retries (REQ-027).
- End-to-end tests: delegate, revoke, and consume flow in a test group; exit with export and independent verification; fork with labelled imported history.
- Security/privacy tests: export and fork field scans (REQ-009, REQ-024); replay and duplicate-credential cases (REQ-004); log-join review; small-group inference review on dummy data.
- Independent review or audit: cryptography review of signatures, export integrity, and clock/order decisions (OD-06, OD-08 to OD-10, OD-14), expert review required; legal review (OD-15), expert review required; comprehension testing (REQ-010).
- Release-blocking criteria: all Must requirements verified; delegation disabled by default; verifier passes unmodified fixture bundles and fails each mutation; export and fork privacy scans clean; OD-01 to OD-03, OD-06, and OD-08 closed, or deferred with the feature disabled.

## 11. Constraints, assumptions, and references

Constraints:
- No protocol, signature scheme, export format, or primitive is selected.
- The initial scope is internal decisions in voluntary organizations (README).
- No license is selected. Reuse of code or the verifier is not granted (README).

Assumptions requiring validation:
- Members understand scope and expiry in usability testing (REQ-010).
- Single-decision scope meets most real use (OD-01).
- Eligibility can be checked per decision through QV-04 for weight rules.
- A source group's policy governs whether its public records may be copied in a fork.
- Delegation's benefits outweigh its concentration risks. No evidence for this is in the repository.

References (research inputs for design review only; they are not endorsements or evidence that a QuietVote protocol is safe):
- [W3C Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/): a credential data model, not an anonymity guarantee.
- [W3C ActivityPub](https://www.w3.org/TR/activitypub/): federation reference, not a governance protocol.
- [Liquid-democracy research](https://ojs.aaai.org/index.php/AAAI/article/view/33478) and [delegation dynamics study](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.02470): review for concentration and delegation-path tradeoffs.

## 12. Open questions

| Question | Owner | Target review | Resolution |
|---|---|---|---|
| Is delegation in MVP? (OD-01) | Project owner | Before QV-02 MVP boundary approval | Pending |
| Can direct ballots override delegation? (OD-02) | Project owner; expert review | Before Phase B | Pending |
| Can groups cap influence? (OD-03) | Project owner; privacy review | Before Phase B | Pending |
| Which privacy mode is default? (OD-04) | Project owner; privacy and UX review | Before Phase B | Pending |
| How are shared records handled when members split? (OD-12) | Project owner; legal review | Before Phase A fork work | Pending |
| What export format and compatibility policy? (OD-09) | Format expert review | Before Phase A export work | Pending |
| How does a group fork during an active decision? (OD-13) | Project owner | Before Phase A fork work | Pending |
| Which local laws and governance duties apply? (OD-15) | Legal review | Before any Phase A release | Pending |

## 13. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | No review recorded. Owner is not named in this file. |
| Cryptography expert reviewer | Pending | — | Required for OD-06, OD-08 to OD-10, OD-14. Not yet engaged. |
| Legal reviewer | Pending | — | Required for OD-12, OD-15. Role not defined in repository [UNVERIFIED]. |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 14. Open decisions

No option below is selected. Every item is open and requires expert review before a decision. Owners decide with the listed review.

### OD-01 — Delegation in MVP
- **Question:** Is delegation part of the first release, or only Phase B and later?
- **Candidates:** (a) exclude from MVP; (b) Phase B only, direct-only, single decision; (c) MVP with direct-only, single-decision delegation.
- **Trade-offs:** (a) lowest risk and test burden; (b) keeps first release small; (c) tests the feature early, but adds privacy and UX load before pilots.
- **Needed to decide:** QV-02 MVP boundary; user research on need.
- **Owner:** Project owner. Expert review required (product and UX).

### OD-02 — Direct ballot override and superseded state
- **Question:** Can a delegator's direct ballot override a delegation, and how is the delegation recorded?
- **Candidates:** (a) no override; delegation binds until revoked; (b) direct ballot always overrides; (c) override only where policy declares it. Recorded as revoked, consumed, or a new superseded state.
- **Trade-offs:** (a) simplest, no ordering issues, but members cannot change course; (b) strongest autonomy, more ordering and pressure risk; (c) flexible, more policy text. A new state changes REQ-011.
- **Needed to decide:** QV-03 rules on changeable voting; ordering test matrix; state label choice.
- **Owner:** Project owner. Expert review required.

### OD-03 — Influence cap and concentration disclosure
- **Question:** Does the system cap received weight or alert on concentration, and what is disclosed?
- **Candidates:** (a) no cap; (b) group-set cap on received weight; (c) group-set cap on number of delegators; (d) organizer alert using aggregates only; (e) public disclosure of received weight.
- **Trade-offs:** caps limit capture but add rules that can be gamed; alerts protect privacy but may not stop capture; public disclosure aids oversight but exposes relationships in small groups.
- **Needed to decide:** concentration analysis across group sizes; small-group inference review.
- **Owner:** Project owner. Expert review required (privacy).

### OD-04 — Default visibility mode
- **Question:** Which delegation details are visible by default?
- **Candidates:** (a) transparent (delegator, delegate, and scope visible); (b) pseudonymous (aliases); (c) private relationships (aggregates and the delegate's own weight only).
- **Trade-offs:** (a) aids oversight, exposes pressure; (b) hides identity from peers but not organizers; (c) reduces pressure, reduces oversight, and timing inference remains.
- **Needed to decide:** QV-06 visibility rules; alignment with QV-17 modes; usability test of each notice.
- **Owner:** Project owner. Expert review required (privacy and UX).

### OD-05 — Delegate acceptance
- **Question:** Must a delegate accept before weight is assigned?
- **Candidates:** (a) no acceptance; (b) explicit acceptance per delegation; (c) standing acceptance under group policy.
- **Trade-offs:** (a) simplest, but unwanted weight is possible; (b) safest, adds a step and a state; (c) cheaper, less per-decision consent.
- **Needed to decide:** group policy decision; §3 change if (b).
- **Owner:** Project owner. Expert review required (UX).

### OD-06 — Expiry, cutoff, and time authority
- **Question:** How do expiry, decision close, and cutoff relate, and whose clock decides?
- **Candidates:** expiry may not pass cutoff; expiry independent of cutoff; expiry ends at decision close. Clock: service time, signed timestamps from independent witnesses, or the group's declared time source.
- **Trade-offs:** each option changes boundary behavior; a single service clock is simple but is a trust point; witnessed time adds infrastructure.
- **Needed to decide:** QV-16 log and checkpoint decision; time-zone semantics per QV-18 manifest; boundary tests.
- **Owner:** Cryptography expert reviewer, with project owner. Expert review required.

### OD-07 — Draft abandonment
- **Question:** What happens to a draft that is never confirmed?
- **Candidates:** (a) delegator deletes it; (b) it expires at a point to be set; (c) it is kept as history.
- **Trade-offs:** (a) privacy-friendly; (b) limits stale drafts, adds a clock dependency; (c) aids audit, may leak intent.
- **Needed to decide:** QV-06 retention rules.
- **Owner:** Project owner. Expert review required (privacy).

### OD-08 — Signature and attestation scheme
- **Question:** Which scheme signs delegation statements, policy manifests, state events, and snapshots?
- **Candidates:** general-purpose digital signatures (scheme not selected); credential-based selective disclosure (QV-17 research; maturity [UNVERIFIED]); signed append-only log checkpoints (QV-16). Hybrids possible.
- **Trade-offs:** schemes differ in key management, unlinkability, verifier complexity, and maturity. A signature proves key attribution only.
- **Needed to decide:** QV-16 selection; test vectors; key rotation and recovery design.
- **Owner:** Cryptography expert reviewer. Expert review required.

### OD-09 — Export format and compatibility policy
- **Question:** Which export format, data dictionary, and compatibility rules apply?
- **Candidates:** (a) project-defined documented format; (b) an existing interchange format (none selected; each needs review); (c) plain files with a manifest.
- **Trade-offs:** (a) full control, maintenance cost; (b) interoperability, may not fit privacy or size needs; (c) easy to inspect, weak schema guarantees.
- **Needed to decide:** independent verifier specification; deprecation window policy (not set).
- **Owner:** Cryptography and format expert reviewer. Expert review required.

### OD-10 — Integrity proof for exports and fork history
- **Question:** How is the export integrity manifest proven and kept consistent across copies?
- **Candidates:** signed hash manifest; signed Merkle root with inclusion proofs (QV-16); either signed by the group key; independent witnesses.
- **Trade-offs:** a signed manifest proves file integrity but not that nothing was omitted; log proofs detect omission but add infrastructure; witnesses reduce equivocation but need independent operators.
- **Needed to decide:** QV-16 decision; threat model for omitted records.
- **Owner:** Cryptography expert reviewer. Expert review required.

### OD-11 — Partial export policy
- **Question:** Can a partial export be issued, and under what label?
- **Candidates:** (a) refuse until complete; (b) issue partial with missing list (REQ-021); (c) issue only completed decisions.
- **Trade-offs:** (a) safest, may block leaving members; (b) usable, risk of misreading; (c) clean subsets, omits open history.
- **Needed to decide:** policy for leaving members; UX copy.
- **Owner:** Project owner. Expert review required (UX and legal).

### OD-12 — Shared records and member consent on fork or split
- **Question:** Which records may move to a fork or a split membership, and who consents?
- **Candidates:** (a) public records only; (b) public records plus personal data with each member's consent; (c) transfer defined by source policy.
- **Trade-offs:** (a) lowest privacy risk, less continuity; (b) continuity, consent burden; (c) flexible, but source policy may be unclear.
- **Needed to decide:** fork data table decisions (Section 5.4); per-member consent flow; legal review.
- **Owner:** Project owner; legal reviewer. Expert review required.

### OD-13 — Fork during an active decision and source disputes
- **Question:** How does a fork treat an open decision, and how are competing histories shown?
- **Candidates:** (a) block fork until the source closes or cancels the decision; (b) fork proceeds and source decision is cancelled under source rules; (c) fork proceeds and source decision continues unchanged.
- **Trade-offs:** (a) avoids conflicting outcomes, may delay; (b) clear, needs source rules that allow cancellation; (c) two parallel decisions may confuse members.
- **Needed to decide:** QV-03 cancellation and amendment rules.
- **Owner:** Project owner. Expert review required (governance).

### OD-14 — Deletion, backups, and archived decisions
- **Question:** How do deletion requests interact with append-only records, backups, and archived bundles?
- **Candidates:** (a) keep public records indefinitely; delete only personal data; (b) keep signed hashes after deleting content; (c) encrypt personal data under keys that can be destroyed (primitive not selected).
- **Trade-offs:** (a) simple, may retain personal data; (b) preserves verification, hashes may remain linkable; (c) may support deletion, adds key-management risk. Permanence must be explained to members.
- **Needed to decide:** QV-06 retention; QV-12 backup policy.
- **Owner:** Cryptography expert reviewer with legal reviewer. Expert review required.

### OD-15 — Legal and governance duties
- **Question:** Which local laws and governance duties apply to delegation records, exports, and forks?
- **Candidates:** (a) per-deployment legal review before enabling; (b) initial use restricted to named jurisdictions; (c) group-level terms only.
- **Trade-offs:** (a) safest, slowest; (b) bounded, limits adoption; (c) cheap, may not satisfy applicable law.
- **Needed to decide:** legal review (no legal reviewer role is defined in the repository); QV-03 duties; data-controller role (Section 5).
- **Owner:** Legal reviewer [UNVERIFIED role]. Expert review required.
