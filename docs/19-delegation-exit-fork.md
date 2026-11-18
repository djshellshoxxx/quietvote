# QV-19 — Revocable Delegation, Exit, and Governance Forks

**Module ID:** `delegation-exit`  
**Status:** Proposed specification; requires project-owner review  
**Related specs:** QV-02, QV-03, QV-04, QV-05, QV-06, QV-07, QV-08, QV-09, QV-16, QV-17, QV-18

## 1. Objective

Specify optional, bounded delegation of participation rights and practical group exit/export/fork. A member may delegate authority within a defined scope and expiry; a group may export its rules and public decision records or establish a new governance branch under revised rules.

These functions record authorization and procedure. They do not resolve ownership of external assets, funds, domains, or legal entities.

Who needs it: members who cannot take part in a narrow decision; members leaving a group who need their own records; members who disagree with a group's rules and want to continue under different ones.

## 2. Scope

### Principles and candidate MVP

- Delegation is opt-in, scoped, time-limited, and revocable. It does not transfer membership or account ownership.
- Delegation is disabled until the group enables it under a published policy. Broad, indefinite delegation is never a default.
- The member sees the exact scope, policy version, and expiry before confirmation.
- No silent redelegation. Initial version is direct-only.
- At most one unit of voting weight per eligible member unless group policy explicitly says otherwise.
- A direct ballot may supersede a delegation only under rules published before the decision (OD-02).

A delegation record binds delegator eligibility, delegate, topic or decision, policy version, time window, direct-vote override setting, and consent. Visibility of these fields is a policy choice (OD-04).

### In scope

- Direct, single-step delegation for one decision or a narrow topic/time scope.
- Delegation states and transitions (Section 3).
- Member exit: individual export and revocation of roles and credentials.
- Group export: portable public-record bundle with integrity manifest.
- Governance fork of public rules and public history under a new group identity.

### Out of scope and non-goals

- Transitive delegation, chains, and redelegation of received weight. Deferred; any later design must define cycle handling, chain limit, redelegation authority, multiple paths, direct-vote precedence, and privacy-safe concentration monitoring.
- Transfer of membership, accounts, funds, domains, contracts, property, or legal entities.
- Legal authority, and binding corporate or public election use.
- Coercion resistance, guaranteed free choice, or any claim that a delegate votes as the delegator would.
- Automated federation (QV-18) and shared cross-group ballots.
- Selection of signature schemes, export format standards, or cryptographic primitives (Section 14).
- Ballot encoding and tally methods (QV-05).

### Phasing (candidate)

- **Phase A:** versioned rules, public-record export, integrity manifest, fork of public rules only.
- **Phase B:** optional one-step, direct-only delegation for one decision or narrow time/topic scope; revocation before cutoff.
- **Phase C:** privacy-preserving delegation, only if users need it, after protocol and usability review.

## 3. Actors and user journeys

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Delegator (member) | Give a narrow decision right to a delegate; revoke it | Policy enables delegation; delegator eligible | Delegation active, then revoked, expired, or consumed |
| Delegate (member) | Cast weight delegated for one decision | Delegation active; delegate eligible | Accepted ballot consumes the delegation |
| Leaving member | Keep own records; end delegations | Member leaving or has left | Own records exported; delegations given or received ended |
| Organizer | Publish policy and cutoff; produce export | Policy authority under QV-03 | Signed policy version; cutoff set; bundle produced |
| Verifier | Check export or tally snapshot | Bundle or snapshot available | Pass, or fail with reason |
| Fork founders | Create a new group from source public records | Fork policy allows it | New identity; imported history labelled |
| Dissenting member | Stay in source group or leave | Source history intact | Own choice; source history preserved |

### Delegation transitions (candidate)

Delegation changes (create, confirm, revoke, end-on-exit) are accepted only before cutoff. Cutoff is a point in time, not a state. Ballots using a frozen delegation are accepted in the voting window against the snapshot (REQ-014). Consumption is appended to the record and does not change the snapshot.

| From | Event | To | Condition |
|---|---|---|---|
| (none) | Delegator creates | draft | Policy enables delegation (REQ-001) |
| draft | Delegator confirms | active | Consent recorded; before cutoff and expiry (REQ-018) |
| draft | Delegator abandons | removed | Per OD-07; drafts never affect a tally |
| active | Delegator revokes | revoked | Before cutoff (REQ-003) |
| active | Member exit (either side) | revoked | REQ-020 |
| active | Expiry instant reached | expired | REQ-016 |
| active | Decision closes unconsumed | expired | Candidate; see OD-06 |
| active | Delegate's accepted ballot | consumed | Within voting window; uses snapshot (REQ-013, REQ-015) |
| active | Delegator's direct ballot | per OD-02 | Only if policy enables override (REQ-017) |

### Failure behavior

| Failure or race | Required behavior |
|---|---|
| Revocation near cutoff | Applied only if recorded before cutoff in event order; otherwise rejected with reason (REQ-003). |
| Revocation vs. delegate ballot | One outcome by recorded order; weight counted at most once (REQ-015). |
| Lost response | Client shows "pending" until confirmed; retry with same request ID creates no duplicate (REQ-027). |
| Policy changes after activation | Delegation keeps its accepted version (REQ-006). |
| Delegate leaves | Delegations to them end; delegators notified (REQ-019, REQ-020). |
| Backup restored | State matches event record; no pre-cutoff revocation reverts (REQ-026). |
| Export incomplete | Bundle marked partial with missing items listed (REQ-021). Failed verification is never a partial pass (REQ-007). |
| Fork during open decision | Open decision not transferred; closed or cancelled under source rules (REQ-022). |
| Fork dispute | Both histories verifiable; no canonical group designated (REQ-023). |
| Signing key compromise | QV-12 incident response. Snapshot not silently replaced; corrections are visible signed amendments. |

## 4. Requirements

The system shall meet each requirement. "Must (when enabled)" applies only where group policy enables the feature.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-19-REQ-001 | The system shall allow delegation only in groups whose signed, published policy enables it. | Must | Create requests in disabled groups are rejected with a policy reason. | Test; UX review |
| QV-19-REQ-002 | The system shall bind every delegation to an explicit scope, policy version, and expiry. | Must | Records missing any field are rejected. Confirmation and signed record show all three. | Test (schema/API); UX review |
| QV-19-REQ-003 | The system shall let the delegator revoke an active delegation before cutoff. | Must | Revocation recorded before cutoff sets state to revoked and removes its weight. Same request after cutoff is rejected with reason. | Integration test at cutoff boundary |
| QV-19-REQ-004 | The system shall count each eligible member's weight at most once per decision unless policy says otherwise. | Must | For every replay, concurrency, duplicate-credential, and direct-vote case in the test manifest, counted weight matches expected value and never exceeds configured weight. | Model-based and property tests; independent recount |
| QV-19-REQ-005 | The system shall reject redelegation of received weight. | Must | API rejects any request that reassigns received weight; UI offers no such control. | Test; inspection |
| QV-19-REQ-006 | The system shall not change an active delegation's effect when a later policy version is published. | Must | Active record keeps its accepted version. Adopting a new version requires reconfirmation. | Test with policy-change fixture |
| QV-19-REQ-007 | The system shall version every export and make it integrity-checkable. | Must | Verifier fails on each altered, missing, or extra file in fixtures and passes the unmodified bundle. Unknown format version returns "unsupported". | Fixture tests; independent verifier review |
| QV-19-REQ-008 | The system shall give a fork a new identity and leave source history unchanged. | Must | Source records are hash-identical before and after fork. Imported records show source group ID and hash. | Test; integrity comparison |
| QV-19-REQ-009 | The system shall not transfer personal data, keys, credentials, active delegations, private ballots, or identity mappings by default. | Must | Export and fork fixtures containing these produce bundles without them. Personal data moves only with each member's recorded consent (OD-12). | Automated field scan; review |
| QV-19-REQ-010 | The system shall explain the limits of exit and fork to members. | Must | Limits notice precedes export, exit, and fork confirmation. Participants in moderated testing identify each limit in Section 5.4. | Usability test; review |
| QV-19-REQ-011 | The system shall permit only the transitions listed in Section 3. | Must | Model-based test covers every state-event pair. Only listed transitions succeed; each rejection is logged with reason. | Model-based test |
| QV-19-REQ-012 | The system shall treat revoked, expired, and consumed as terminal. | Must | Revoke, activate, or consume on a terminal delegation fails; history unchanged. | Test |
| QV-19-REQ-013 | The system shall count weight only from delegations active in the frozen snapshot, and count a consumed delegation once. | Must | Fixture with one record per state yields expected weight; consumed weight appears once. | Test |
| QV-19-REQ-014 | The system shall freeze active delegations and weights at cutoff in a signed snapshot. | Must | Snapshot hash recorded at cutoff. Replaying later events yields identical tally input; later events are audit-only. | Test; independent recount |
| QV-19-REQ-015 | The system shall resolve a revocation and a delegate ballot on the same delegation by recorded event order. | Must | For every generated interleaving, outcome matches recorded order; weight counted at most once. | Concurrency test with interleaving generator |
| QV-19-REQ-016 | The system shall move an active delegation to expired at its expiry instant. | Must | Ballots at or after expiry are rejected; those before are accepted. Clock source per OD-06. | Test with controlled clock |
| QV-19-REQ-017 | Where policy enables override, the system shall give a delegator's accepted direct ballot precedence over delegated weight for that decision. | Must (when enabled) | For every ordering of direct ballot, delegate ballot, and revocation, counted weight matches policy rule with no double count. | Ordering-matrix test |
| QV-19-REQ-018 | The system shall record delegator consent before a draft becomes active. | Must | Activation without a consent record is rejected. Record holds scope, policy version, expiry, and revocation limits. | Test |
| QV-19-REQ-019 | The system shall notify the delegator when a delegation expires, is consumed, or ends through a delegate's exit. | Should | Each such transition produces one notice revealing no other member's data. | Test; review |
| QV-19-REQ-020 | The system shall end, before cutoff, active delegations given or received by a member who exits. | Must | After exit, no active delegation references that member. Affected delegators are notified (REQ-019). | Test |
| QV-19-REQ-021 | The system shall mark any incomplete export as partial and list each missing item. | Must | Fault injection (missing artifact, failed write) yields partial bundle with complete missing list. Verifier never reports complete. | Fault-injection test; verifier test |
| QV-19-REQ-022 | The system shall not transfer an open decision to a fork. | Must | No open ballot appears in the fork. Source decision shows closure or cancellation under source rules. | Test; review |
| QV-19-REQ-023 | The system shall not designate a canonical group in a fork dispute. | Must | Verifier passes on both histories. Fork links to source history. Neither is hidden. | Test; inspection |
| QV-19-REQ-024 | The system shall limit a member exit export to that member's own records and public records. | Must | Field scan finds no other member's identity, private ballot, or identity mapping. | Fixture scan |
| QV-19-REQ-025 | The system shall state in the exit notice which copies of a member's data can and cannot be deleted. | Should | Notice lists each copy class (live, backup, archived bundle) per QV-06. | Review; usability test |
| QV-19-REQ-026 | The system shall not let backup restore revert a transition accepted before cutoff. | Must | Restored state matches event record; pre-cutoff revocations stay revoked. | Restore test |
| QV-19-REQ-027 | The system shall apply a repeated create, confirm, revoke, or consume request with the same request ID once. | Must | Repeats produce one state change and no duplicate weight. | Test with retries and injected lost responses |

## 5. Data and privacy

- Data inputs: delegator and delegate group-local identifiers; eligibility status (QV-04); scope (decision ID, optional topic and time window); policy version; expiry; consent record; override setting; state events with timestamps; export and fork selections.
- Data outputs: delegation statement (visible per policy); state event record; cutoff snapshot with aggregate weights; export and fork bundles (Sections 5.2, 5.4).
- Data controller/operator: the group is intended as controller of its members' data. Role of the hosting operator is [UNVERIFIED] and open (OD-15).
- Retention and deletion: not set; follows QV-06 once set. Drafts removed per OD-07. Append-only events may conflict with deletion (OD-14).
- Linkability risks: delegator–delegate pairs; consumption ties a delegate's ballot to the delegator's weight; expiry and timing reveal activity; small groups; event history in exports and backups; logs joining login and state events (QV-16 Section 6).
- Visibility by member, organizer, operator, and observer: not set (OD-04). Proposed minimum: members see their own records; observers see signed snapshots, aggregates, and public records only.
- Privacy properties claimed: explicit consent; revocation before cutoff; recorded consent and state changes; personal data excluded from exports by default (REQ-009).
- Privacy properties explicitly not claimed: anonymity of delegator–delegate relationships; hiding delegations from the operator or organizers; coercion resistance; that a delegate's vote reflects the delegator's free choice; erasability of published records.

### 5.1 Delegation and cryptographic role

Organizations choose whether delegator/delegate identities, relationships, topic, expiry, received weight, or decision-specific use are visible (transparent, pseudonymous, or private relationships; OD-04).

Candidate components, none selected: signed, versioned delegation statements; anonymous eligibility credentials (QV-17); decision-scoped nullifiers against duplicate weight; signed policy manifests binding tally rules; an append-only event record proving transitions without publishing member-to-delegate links (QV-16).

Cryptography cannot show that a member acted freely or that rules are fair. Private delegation may reduce social pressure but makes oversight harder. Small-group and timing inference must be measured.

### 5.2 Portable export bundle

Candidate contents: group identifier and public keys; signed policy versions; public proposals and rule history; closed decision manifests and results; public audit artifacts; verifier version; data dictionary; format version; integrity manifest.

Excluded by default: member identities, private ballots, identity mappings, secret keys, credentials, private messages, and active delegations. Encrypted ballot artifacts may expose metadata or support correlation; any inclusion states its purpose.

### 5.3 Member exit

Individually exportable records (REQ-024); organization-level records; open decisions (REQ-022); deletion from backups and continued verification of archived decisions (REQ-025, OD-14); revocation of roles and credentials (REQ-020).

### 5.4 Governance fork

A fork creates a new group identity, policy branch, and decision history. It preserves source history unchanged, identifies source policy and changes, requires consent for transferred personal data, never copies credentials, keys, or active delegation, reissues roles under new rules, labels imported history, and claims no external property or legal authority.

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
- **Member device:** holds consent and keys; compromise is outside this module's guarantees.
- **Delegation and ballot service:** orders events; must not alter a frozen snapshot.
- **Organizer:** a signed policy shows who set rules, not that they are fair.
- **Hosting operator:** can access stored data unless QV-16 controls apply; not assessed here.
- **Verifier:** a bundle is only as checked as the verifier implementation.
- **Forked group:** new key holders; inherits no authority.

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Influence concentration | Delegate gathers many delegators | Outsized weight | Group-set cap or alert (OD-03); disclose received weight where safe | Coordinated direct voting may still concentrate influence |
| Pressure to delegate | Other members or delegates | Delegation not freely chosen | Explicit consent; private revocation; no default | Coercion not prevented; no claim made |
| Cutoff dispute | Organizer or member | Disputed timing | Publish cutoff before opening; signed history (REQ-014) | Clock source open (OD-06) |
| Rule mutation | Organizer | Rules changed mid-delegation | Signed, versioned policies (REQ-006) | Future policy can still change under group rules |
| Replay or concurrent submission | Attacker or client retry | Double weight | Event order; one count per member (REQ-004, REQ-015, REQ-027) | Depends on unselected nullifier scheme (QV-17) |
| Unauthorized data copy | Bug or operator | Personal data leaves in export | Exclusion by default; field scan (REQ-009) | Scans catch only listed patterns |
| Partial export shown as complete | Fault or altered bundle | Misleading history | Partial flag and missing list (REQ-021) | Altered bundle may strip flag; OD-10 |
| Misleading fork history | Fork founders | Belief in inherited authority | Attribution, integrity manifest, limits notice (REQ-008, REQ-010) | Founders may still claim lineage informally |
| Fork during active decision | Founders or dissenters | Conflicting outcomes | REQ-022; cancel under source rules | Source rules may not allow cancellation (OD-13) |
| Competing keys in fork dispute | Either group | Confusion about authority | No canonical designation (REQ-023) | Software surfaces conflict, does not resolve it |
| Small-group inference | Observer with side information | Choice or delegation inferred | Minimal public detail; aggregate review | Not eliminated in small groups |
| Signing key compromise | Attacker with key | Forged statements or exports | QV-12 response; visible amendments | Key recovery method not defined (OD-08) |

## 7. Interfaces and dependencies

- Upstream dependencies: QV-03 (policy versions, cutoff, lifecycle, disputes); QV-04 (eligibility, roles); QV-06 (retention, export, deletion); QV-07 (threat model); QV-16 (signatures, append-only record, manifests; none selected); QV-17 (scope-bound identifiers, if used for weight caps).
- Downstream consumers: QV-05 (tally must define how delegated weight enters); QV-08, QV-09 (hosting, contracts); QV-10 (UX); QV-11 (test gates); QV-12 (incident response, backups); QV-18 (fork of federated records only after QV-18 approval).
- API/event/schema contracts: not yet defined. Required: delegation record (REQ-002), state event, cutoff snapshot, export manifest (file list, hashes, format version, verifier version, data dictionary). Formats open (OD-08, OD-09).
- Versioning and compatibility: policy and export format versions are required fields; unsupported versions are rejected (REQ-007). Policy open (OD-09).
- Failure and retry: create, confirm, revoke, and consume are idempotent by request ID (REQ-027). Unacknowledged requests are not applied.

## 8. UX, accessibility, and localization

- Key screens or interactions: policy status; delegation create and confirm; revoke; status; exit notice; export; fork creation with limits notice.
- Plain-language explanations: what a delegate can do; what expiry means; when revocation stops working; that delegation does not transfer membership; what export excludes; that software cannot transfer property or legal authority (REQ-010).
- Keyboard/screen-reader requirements: all steps keyboard-operable; scope, expiry, and policy version stated as text; status changes announced. Detail per QV-13.
- Low-bandwidth and device constraints: confirmation and status work on small screens and slow connections. Export download is retryable; method open (OD-09) [UNVERIFIED feasibility].
- Localization requirements: policy text, limits, and export notices provided in each language the group uses (QV-13).

## 9. Operations

- Configuration: per-group delegation switch and policy version; cutoff; expiry options; visibility (OD-04); caps (OD-03); override (OD-02).
- Monitoring and audit: append-only state log. Monitoring tracks counts and errors, not per-member delegation links; concentration alerts use aggregates only (QV-16 Section 5).
- Backup, recovery, and deletion: backups hold the event record; restore per REQ-026; deletion per QV-06 and OD-14.
- Incident response: suspected compromise of a delegation or export signing key is handled under QV-12. Corrections are new signed, visible amendments.
- Support and escalation: members can view delegation status and request exports. Support access per QV-06. Disputes per QV-03.

## 10. Testing and verification

- Unit tests: state machine (REQ-011, REQ-012); scope and expiry validation (REQ-002); weight rules (REQ-004); redelegation rejection (REQ-005).
- Integration tests: cutoff and revocation race (REQ-003, REQ-015); override ordering (REQ-017); snapshot freeze (REQ-014); policy binding (REQ-006); backup restore (REQ-026); export fault injection (REQ-021); retries (REQ-027).
- End-to-end tests: delegate, revoke, and consume flow in a test group; exit with export and independent verification; fork with labelled history.
- Security/privacy tests: export and fork field scans (REQ-009, REQ-024); replay and duplicate-credential cases (REQ-004); log-join review; small-group inference review on dummy data.
- Independent review or audit: cryptography review of signatures, export integrity, and clock/order decisions (OD-06, OD-08 to OD-10, OD-14), expert review required; legal review (OD-15), expert review required; comprehension testing (REQ-010).
- Release-blocking criteria: all Must requirements verified; delegation disabled by default; verifier passes unmodified fixtures and fails each mutation; privacy scans clean; OD-01 to OD-03, OD-06, and OD-08 closed, or deferred with the feature disabled.

## 11. Constraints, assumptions, and references

Constraints:
- No protocol, signature scheme, export format, or primitive is selected.
- Initial scope is internal decisions in voluntary organizations (README).
- No license is selected; reuse of code or the verifier is not granted (README).

Assumptions requiring validation:
- Members understand scope and expiry (REQ-010).
- Single-decision scope meets most real use (OD-01).
- Per-decision eligibility can be checked through QV-04 for weight rules.
- A source group's policy governs whether its public records may be copied.
- Delegation's benefits outweigh concentration risks. No evidence for this is in the repository.

References (research inputs for design review only; not endorsements or evidence that a QuietVote protocol is safe):
- [W3C Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/): a credential data model, not an anonymity guarantee.
- [W3C ActivityPub](https://www.w3.org/TR/activitypub/): federation reference, not a governance protocol.
- [Liquid-democracy research](https://ojs.aaai.org/index.php/AAAI/article/view/33478) and [delegation dynamics study](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.02470): concentration and delegation-path tradeoffs.

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
| Project owner | Pending | — | No review recorded. Owner not named in this file. |
| Cryptography expert reviewer | Pending | — | Required for OD-06, OD-08 to OD-10, OD-14. Not yet engaged. |
| Legal reviewer | Pending | — | Required for OD-12, OD-15. Role not defined in repository [UNVERIFIED]. |

Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 14. Open decisions

No option is selected. Each item requires expert review before a decision, and the named owner decides.

### OD-01 — Delegation in MVP
- **Question:** Is delegation in the first release, or Phase B and later?
- **Candidates:** (a) exclude; (b) Phase B only, direct-only, single decision; (c) MVP with direct-only, single-decision delegation.
- **Trade-offs:** (a) lowest risk; (b) small first release; (c) early testing, more privacy and UX load before pilots.
- **Needed to decide:** QV-02 MVP boundary; user research on need.
- **Owner:** Project owner. Expert review required (product, UX).

### OD-02 — Direct ballot override and superseded state
- **Question:** Can a direct ballot override a delegation, and how is the delegation recorded?
- **Candidates:** (a) no override; (b) direct ballot always overrides; (c) override only where policy declares it. Record as revoked, consumed, or a new superseded state.
- **Trade-offs:** (a) simplest, members cannot change course; (b) strongest autonomy, more ordering and pressure risk; (c) flexible, more policy text. A new state changes REQ-011.
- **Needed to decide:** QV-03 rules on changeable votes; ordering test matrix; state label.
- **Owner:** Project owner. Expert review required.

### OD-03 — Influence cap and concentration disclosure
- **Question:** Does the system cap received weight or alert on concentration, and what is disclosed?
- **Candidates:** (a) no cap; (b) group-set cap on received weight; (c) cap on number of delegators; (d) organizer alert on aggregates; (e) public disclosure of received weight.
- **Trade-offs:** caps limit capture but can be gamed; alerts protect privacy but may not stop capture; disclosure aids oversight but exposes small-group relationships.
- **Needed to decide:** concentration analysis across group sizes; small-group inference review.
- **Owner:** Project owner. Expert review required (privacy).

### OD-04 — Default visibility mode
- **Question:** Which delegation details are visible by default?
- **Candidates:** (a) transparent; (b) pseudonymous; (c) private relationships (aggregates and own weight only).
- **Trade-offs:** (a) aids oversight, exposes pressure; (b) hides identity from peers, not organizers; (c) reduces pressure, reduces oversight, timing inference remains.
- **Needed to decide:** QV-06 visibility rules; QV-17 mode alignment; usability test per notice.
- **Owner:** Project owner. Expert review required (privacy, UX).

### OD-05 — Delegate acceptance
- **Question:** Must a delegate accept before weight is assigned?
- **Candidates:** (a) no acceptance; (b) explicit acceptance per delegation; (c) standing acceptance under group policy.
- **Trade-offs:** (a) unwanted weight possible; (b) safest, adds a step and a state; (c) cheaper, less per-decision consent.
- **Needed to decide:** group policy decision; Section 3 change if (b).
- **Owner:** Project owner. Expert review required (UX).

### OD-06 — Expiry, cutoff, and time authority
- **Question:** How do expiry, decision close, and cutoff relate, and whose clock decides?
- **Candidates:** expiry may not pass cutoff; expiry independent of cutoff; expiry ends at decision close. Clock: service time, signed timestamps from independent witnesses, or group-declared time source.
- **Trade-offs:** each changes boundary behavior; service clock is simple but a trust point; witnessed time adds infrastructure.
- **Needed to decide:** QV-16 log and checkpoint decision; time-zone semantics (QV-18 manifest); boundary tests.
- **Owner:** Cryptography expert reviewer, with project owner. Expert review required.

### OD-07 — Draft abandonment
- **Question:** What happens to an unconfirmed draft?
- **Candidates:** (a) delegator deletes it; (b) it expires at a point to be set; (c) it is kept as history.
- **Trade-offs:** (a) privacy-friendly; (b) limits stale drafts, adds clock dependency; (c) aids audit, may leak intent.
- **Needed to decide:** QV-06 retention rules.
- **Owner:** Project owner. Expert review required (privacy).

### OD-08 — Signature and attestation scheme
- **Question:** Which scheme signs delegation statements, policy manifests, state events, and snapshots?
- **Candidates:** general-purpose digital signatures (scheme not selected); credential-based selective disclosure (QV-17; maturity [UNVERIFIED]); signed append-only log checkpoints (QV-16); hybrids.
- **Trade-offs:** schemes differ in key management, unlinkability, verifier complexity, and maturity. A signature proves key attribution only.
- **Needed to decide:** QV-16 selection; test vectors; key rotation and recovery design.
- **Owner:** Cryptography expert reviewer. Expert review required.

### OD-09 — Export format and compatibility policy
- **Question:** Which export format, data dictionary, and compatibility rules apply?
- **Candidates:** (a) project-defined documented format; (b) existing interchange format (none selected; each needs review); (c) plain files with manifest.
- **Trade-offs:** (a) full control, maintenance cost; (b) interoperability, may not fit privacy or size needs; (c) easy to inspect, weak schema guarantees.
- **Needed to decide:** verifier specification; deprecation window policy (not set).
- **Owner:** Cryptography and format expert reviewer. Expert review required.

### OD-10 — Integrity proof for exports and fork history
- **Question:** How is the export integrity manifest proven and kept consistent across copies?
- **Candidates:** signed hash manifest; signed Merkle root with inclusion proofs (QV-16); independent witnesses.
- **Trade-offs:** a manifest proves file integrity, not that nothing was omitted; log proofs detect omission but add infrastructure; witnesses need independent operators.
- **Needed to decide:** QV-16 decision; threat model for omitted records.
- **Owner:** Cryptography expert reviewer. Expert review required.

### OD-11 — Partial export policy
- **Question:** Can a partial export be issued, and under what label?
- **Candidates:** (a) refuse until complete; (b) issue as partial with missing list (REQ-021); (c) issue only completed decisions.
- **Trade-offs:** (a) safest, may block leaving members; (b) usable, risk of misreading; (c) clean subsets, omits open history.
- **Needed to decide:** policy for leaving members; UX copy.
- **Owner:** Project owner. Expert review required (UX, legal).

### OD-12 — Shared records and member consent on fork or split
- **Question:** Which records may move to a fork or split membership, and who consents?
- **Candidates:** (a) public records only; (b) public records plus personal data with each member's consent; (c) transfer defined by source policy.
- **Trade-offs:** (a) lowest privacy risk, less continuity; (b) continuity, consent burden; (c) flexible, source policy may be unclear.
- **Needed to decide:** Section 5.4 table decisions; per-member consent flow; legal review.
- **Owner:** Project owner; legal reviewer. Expert review required.

### OD-13 — Fork during an active decision and source disputes
- **Question:** How does a fork treat an open decision, and how are competing histories shown?
- **Candidates:** (a) block fork until source closes or cancels; (b) fork proceeds and source decision is cancelled under source rules; (c) fork proceeds and source decision continues.
- **Trade-offs:** (a) avoids conflicting outcomes, may delay; (b) clear, needs source rules allowing cancellation; (c) parallel decisions may confuse members.
- **Needed to decide:** QV-03 cancellation and amendment rules.
- **Owner:** Project owner. Expert review required (governance).

### OD-14 — Deletion, backups, and archived decisions
- **Question:** How do deletion requests interact with append-only records, backups, and archives?
- **Candidates:** (a) keep public records; delete only personal data; (b) keep signed hashes after deleting content; (c) encrypt personal data under keys that can be destroyed (primitive not selected).
- **Trade-offs:** (a) simple, may retain personal data; (b) preserves verification, hashes may stay linkable; (c) may support deletion, adds key-management risk. Permanence must be explained.
- **Needed to decide:** QV-06 retention; QV-12 backup policy.
- **Owner:** Cryptography expert reviewer with legal reviewer. Expert review required.

### OD-15 — Legal and governance duties
- **Question:** Which local laws and governance duties apply to delegation records, exports, and forks?
- **Candidates:** (a) per-deployment legal review before enabling; (b) initial use limited to named jurisdictions; (c) group-level terms only.
- **Trade-offs:** (a) safest, slowest; (b) bounded, limits adoption; (c) cheap, may not satisfy applicable law.
- **Needed to decide:** legal review (no legal reviewer role defined in repository [UNVERIFIED]); QV-03 duties; data-controller role (Section 5).
- **Owner:** Legal reviewer. Expert review required.
