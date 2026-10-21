# QV-18 — Federation Between Independent Groups

**Module ID:** `federated-governance`  
**Status:** Proposed framework; no federation protocol or governance model is approved  
**Related specs:** QV-03, QV-06, QV-07, QV-08, QV-09, QV-16, QV-17

## 1. Objective and principles

Let independent voluntary groups coordinate a shared decision without merging their membership databases or yielding control to a central platform. Each group chooses whether to participate, which local rules apply, what it shares, and whether it accepts an outcome.

Federation is optional; ordinary single-group voting must not depend on it.

- Participation, withdrawal, and exit are voluntary and governed by visible rules.
- Each group controls its own membership and credentials.
- Every shared decision identifies its participants, policy versions, ballot method, and result-combination rule.
- Share only data required to conduct and verify the decision.
- Preserve dissent, failures, and forks; do not silently select a canonical group or result.
- Federation distributes control but does not automatically hide metadata, prevent collusion, or make rules fair.

## 2. Candidate use cases and MVP boundary

Potential use cases include co-ops deciding on a shared purchasing policy, worker collectives coordinating a proposal, or independent online communities agreeing to an opt-in action.

**Initial scope recommendation:** Start with portable signed decision records and manual exchange/import. Consider automated federation only after users show that export/import is insufficient. Do not require a public directory, token, smart contract, or global membership registry.

## 3. Proposed data model

### Group profile
A signed, versioned profile may include group identifier, public keys, protocol versions, exchange endpoint or method, administrative authorization policy, public governance documents, and contact/dispute channels. It must not require publishing member identities.

### Federated decision manifest
A shared decision uses a signed immutable manifest with:

- Unique decision identifier and participating group identifiers
- Proposal text or content hash plus retrievable text
- Exact rule versions accepted by each group
- Ballot method and ballot structure
- Local eligibility cutoff/policy reference
- Group-level quorum and outcome-combination rule
- Opening/closing conditions and time-zone semantics
- Data each group shares or publishes
- Amendment, challenge, recount, withdrawal, and cancellation rules
- Protocol and serialization versions

Each group signs acceptance of the exact manifest hash. Changes after opening require the declared amendment process or cancellation and restart. A signature proves acceptance by a key, not that the key holder had legitimate authority or members consented.

### Local participation model
Each group keeps its eligibility process local. For an initial version, each group may run its own local ballot and publish an aggregate result plus verification evidence. A later shared-ballot design may use privacy-preserving credentials, but that adds a stronger credential and protocol requirement.

### Result combination
The manifest defines whether results are one-group-one-vote, member-weighted, quorum-gated, or another explicit rule. Candidate methods:
- Combine group-level aggregate results using a public deterministic rule.
- Verify each group's signed tally artifacts independently.
- Later evaluate encrypted combination of group totals or shared encrypted ballots.

Show dissenting group results separately when policy permits; a single total must not conceal disagreement. Define treatment of abstentions, unequal group sizes, nonparticipation, and withdrawal.

## 4. Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| QV-18-REQ-001 | Each group signs acceptance of the exact shared manifest. | Verifier rejects mismatched manifest hashes or signatures. |
| QV-18-REQ-002 | Groups retain local eligibility authority. | Federation workflow does not require upload of complete member rosters. |
| QV-18-REQ-003 | Shared rule/proposal changes are versioned and visible. | Participants can identify the exact version; post-open changes follow manifest rules. |
| QV-18-REQ-004 | Result combination is reproducible. | Independent verifier computes the same result from exported group artifacts and manifest rules. |
| QV-18-REQ-005 | Withdrawal and nonparticipation follow declared policy. | Quorum and result change deterministically and visibly after withdrawal. |
| QV-18-REQ-006 | Member-level ballots are not disclosed to other groups by default. | Federation exports contain no identity-to-choice mapping. |
| QV-18-REQ-007 | No operator can silently substitute the shared manifest or result. | Signature/inconsistency tests detect substitution or conflicting views. |
| QV-18-REQ-008 | Group federation records are portable. | A group can export profiles, accepted manifests, results, and evidence in documented formats. |

## 5. Trust, privacy, and anti-capture design

Assess each group, signing-key holder, relay, credential issuer, observer, and hosting provider separately. Include:
- Federation operator suppressing or delaying one group's messages
- Different proposal or result views sent to different groups
- Key theft or weak recovery used to impersonate a group
- Group participation patterns revealing interests or relationships
- Timing and traffic volume identifying which group acted
- Small aggregate results revealing individual choices
- A majority imposing a result on a dissenting or nonparticipating group
- Local members challenging a representative's decision to federate

Candidate controls include signed manifests, independent verification, public key-rotation history, multiple relays, group-local acceptance, explicit quorum rules, no default universal administrator, and visible dissent/withdrawal records. These reduce some unilateral control but do not eliminate capture or collusion.

A blockchain is not required: signed portable records and independently operated services may be sufficient. If a ledger is proposed, document the specific need, metadata leakage, permanence, correction process, and whether participation is possible without a token.

## 6. Failure behavior

Specify service-unavailability near deadline; compromised signing key during an open vote; withdrawal or rule change; malformed/conflicting manifests; challenged local result; relay censorship; different views; lost local evidence; quorum changes; and a group fork with competing keys. Preserve signed history and surface conflict for member resolution.

## 7. Phased implementation

- **Phase 0:** complete local manifests, eligibility, signed results, and exports.
- **Phase 1:** portable records and independent verification through manual exchange.
- **Phase 2:** opt-in federation with invitations, manifest acceptance, group-level results, and explicit combination.
- **Phase 3:** only if needed, assess shared ballots with anonymous eligibility proofs and a reviewed tally protocol.

Out of scope until separately approved: token-weighted influence, a mandatory central group registry, universal administrator, custody of funds, roster disclosure, public government elections.

## 8. Open questions and assurance

Select the first use case; decide local-result aggregation versus shared member ballot; specify weighting and quorum; choose public/private records; decide group discovery; choose group identity/key recovery; define how local members ratify federation participation; determine dissent representation and cross-jurisdiction constraints.

Verification must include schema conformance across independent implementations, signature/key-rotation tests, replay and manifest mutation tests, relay-censorship and conflicting-view simulations, withdrawal/quorum tests, export privacy review, and comprehension testing.

## 9. References

- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/) and [DID Core](https://www.w3.org/TR/did-core/) for identity/credential interop concepts.
- [W3C ActivityPub](https://www.w3.org/TR/activitypub/) for federation concepts; it is not a governance or voting protocol.
- [RFC 9162 — Certificate Transparency v2.0](https://www.rfc-editor.org/rfc/rfc9162.html) for append-only logs and consistency proofs; a single log can still equivocate without monitoring.
