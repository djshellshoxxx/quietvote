# QV-19 — Revocable Delegation, Exit, and Governance Forks

**Module ID:** `delegation-exit`  
**Status:** Proposed specification; requires project-owner review  
**Related specs:** QV-02, QV-03, QV-04, QV-06, QV-07, QV-08, QV-09, QV-16–QV-18

## 1. Objective

Specify optional, bounded delegation of participation rights and practical group exit/export/fork. A member may delegate authority within a defined scope and expiry; a group may export its rules and public decision records or establish a new governance branch under revised rules.

These functions record authorization and procedure. They do not resolve ownership of external assets, funds, domains, or legal entities.

## 2. Delegation principles and candidate MVP

- Delegation is opt-in, scoped, time-limited, and revocable.
- It does not transfer membership or account ownership.
- The member sees the exact scope, policy version, and expiry before confirmation.
- Do not silently allow redelegation; initial version should be direct-only.
- Delegation is disabled until the group enables it under a published policy.
- At most one unit of voting weight per eligible member unless group policy explicitly says otherwise.
- A direct ballot may supersede a delegation only under rules published before the decision.
- Do not make broad, indefinite delegation a default.

A delegation record should bind delegator eligibility, delegate, topic/decision, policy version, time window, direct-vote override, and consent. Exact visibility to members/organizers remains a policy choice.

## 3. Lifecycle

Candidate states: `draft → active → revoked | expired | consumed`.

Specify create, consent, notice, revoke, cutoff, freeze, and tally transitions. After the cutoff the system must not silently alter the state used for tallying. Policy changes apply to future delegations or require affected members to reconfirm. Define direct-vote interaction and the handling of simultaneous delegation and ballot submission.

**Transitive delegation** adds paths, cycles, conflict resolution, and influence concentration. Defer it. Any later design must define cycle handling, chain limit, redelegation authority, multiple paths, direct-vote precedence, and privacy-safe concentration monitoring.

## 4. Privacy and cryptographic role

Organizations choose and disclose whether delegator/delegate identities, relationships, topic, expiry, received weight, or decision-specific use are visible. Candidate modes: transparent, pseudonymous, or private relationships.

Signed versioned delegation statements can prove a member authorized a scope. Anonymous credentials can prove eligibility; decision-scoped nullifiers can help prevent duplicate weight; signed policy manifests bind the tally rules. An append-only event record can prove state transitions without publishing member-to-delegate links.

Cryptography cannot show a member acted freely or establish fair group rules. Private delegation may reduce social pressure but also make oversight harder. Measure small-group and timing inference risks.

## 5. Exit, export, and fork

### Member or group exit
Define individually exportable records, organization-level records, treatment of open decisions, deletion from backups, continued verification of archived decisions, and revocation of roles/credentials.

### Portable export bundle
Candidate contents: group identifier and public keys, signed policy versions, public proposals and rule history, closed decision manifests and published results, public audit artifacts, verifier version, data dictionary, format version, and integrity manifest.

Exclude by default: member identities, private ballots, identity mappings, secret keys, credentials, private messages, and active delegation. Encrypted ballot artifacts may still expose metadata or support correlation; explain inclusion and purpose.

### Governance fork
A fork creates a new group identity, policy branch, and decision history. It must preserve source history unchanged, identify source policy and changes, require consent for any transferred personal data, never copy credentials/keys/active delegation automatically, reissue roles under new rules, label imported history, and make no claim of inheriting external property or legal authority.

| Data | Default fork handling |
|---|---|
| Public rules and signed rule history | May copy with source attribution and integrity proof |
| Public proposals and closed results | May copy only if source policy permits |
| Member identity and eligibility | Exclude unless policy and each member permit |
| Private ballots or identity mappings | Exclude |
| Keys, credentials, and active delegation | Never copy; reissue under new group identity |
| Open decision | Do not transfer automatically; close/cancel under source rules |
| External funds, accounts, contracts, property | Outside QuietVote |

## 6. Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| QV-19-REQ-001 | Delegation is optional and enabled by explicit group policy. | Disabled groups cannot create a delegation; UI explains policy. |
| QV-19-REQ-002 | Every delegation has explicit scope, policy version, and expiry. | Confirmation and signed record show these fields. |
| QV-19-REQ-003 | Active delegation can be revoked before published cutoff. | Revocation is applied before cutoff and rejected afterward with reason. |
| QV-19-REQ-004 | Delegated authority cannot exceed configured member weight. | Replay, concurrency, duplicate credentials, and direct-vote cases follow the manifest without double count. |
| QV-19-REQ-005 | Initial version prohibits transitive delegation. | API and UI reject redelegation of received weight. |
| QV-19-REQ-006 | Policy changes do not silently alter active delegation. | Existing records remain governed by accepted version or require reconfirmation. |
| QV-19-REQ-007 | Export is versioned and integrity-checkable. | Independent verifier detects altered/missing files and unsupported format versions. |
| QV-19-REQ-008 | A fork uses a new identity and preserves source history. | Imported records retain attribution; source records remain unchanged. |
| QV-19-REQ-009 | Personal data and credentials do not transfer automatically. | Export tests show identities, keys, credentials, private ballots, and mappings are absent by default. |
| QV-19-REQ-010 | UI explains limits of exit/fork. | Members understand that software cannot transfer external property, funds, contracts, or legal authority. |

## 7. Abuse cases and controls

- **Influence concentration:** consider group-set caps or alerts and disclose received weight where safe.
- **Pressure to delegate:** clear consent and private revocation; do not claim coercion resistance.
- **Cutoff dispute:** publish cutoff before opening and preserve signed state history.
- **Rule mutation:** version and sign policies; freeze active decision configuration.
- **Unauthorized data copy:** exclude personal data by default and require explicit consent.
- **Misleading fork history:** integrity manifest, source attribution, independent verification.
- **Small-group inference:** minimize public delegation detail and assess aggregate disclosure.

## 8. Phases and open decisions

**Phase A:** versioned rules, public-record export, integrity manifest, fork of public rules only.  
**Phase B:** optional one-step, direct-only delegation for one decision or narrow time/topic scope; revocation before cutoff.  
**Phase C:** research privacy-preserving delegation only if users need it; require protocol and usability review.

Questions: Is delegation in MVP? Can direct ballots override delegation? Can groups cap influence? Which privacy mode is default? How are shared records handled when members split? What export format and compatibility policy will be used? How does a group fork during an active decision? Which local laws and governance duties apply?

## 9. References

- [W3C Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/2025/REC-vc-data-model-2.0-20250515/) — a credential data model, not an anonymity guarantee.
- [W3C ActivityPub](https://www.w3.org/TR/activitypub/) — federation reference, not a governance protocol.
- [Liquid-democracy research](https://ojs.aaai.org/index.php/AAAI/article/view/33478) and [delegation dynamics study](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.02470): review for concentration and delegation-path tradeoffs.

These references inform design review; they do not establish the safety of a specific QuietVote delegation or fork protocol.
