# QV-08 — Architecture and Deployment

**Module ID:** `platform-interfaces`  
**Status:** Framework  
**Objective:** Select system boundaries and deployment models that satisfy product, security, privacy, and operational requirements.

## 1. Purpose, actors, and scope

This spec names QuietVote's components, trust boundaries, and deployment models, and states what each model can and cannot guarantee. It does not choose a ballot protocol or cryptographic construction (QV-05, QV-16). The goal: a group can verify eligibility rules, prevent duplicate voting, and audit a tally, while individual choices stay private from other members (README).

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Member | Cast one private ballot in a decision they are eligible for | Holds a valid credential; decision is open | Encrypted ballot recorded; receipt issued |
| Organizer | Define, freeze, and open a decision | Organization account with strong authentication (QV-16 §3) | Signed manifest published; decision opened |
| Registrar | Confirm the eligible set | Designated under the group's rules (QV-03) | Eligibility commitment published |
| Trustee | Hold a key share and take part in the tally | Designated; key ceremony complete (QV-16 §4) | Aggregate decrypted with verifiable proofs |
| Observer | Check the public record independently | Public read access only | Pass or fail result with reasons |
| Hosting operator | Run the service instance | Operates infrastructure under the chosen model | Service available; no plaintext ballot choices by design (QV-16 §2) |
| Self-host admin | Install, upgrade, and back up a self-hosted instance | Infrastructure access | Instance running per runbook |
| Support staff | Resolve account problems | Support role with logged access | Issue resolved without access to ballot choices |

### In scope
- Client types, application services, and component responsibilities.
- Data placement, trust boundaries, and data flows.
- Hosted, self-hosted, and federated deployment models, each with its own threat model.
- Tenant isolation, backup, restore, upgrade, and migration at architecture level.

### Out of scope (non-goals)
- Ballot protocol, voting methods, and cryptographic primitives (QV-05, QV-16).
- Member screens and copy (QV-10).
- Choice of hosting vendor or client framework.
- Public governmental, legally binding shareholder, or certified elections (README).
- Any claim of anonymity, coercion resistance, or availability for a model without QV-07 and QV-11 evidence.
- Tokens or public ledgers as a core component (QV-16 §1).
- Offline voting in the first release (OD-08-03).

## 2. Assumptions and constraints

- Groups are voluntary organizations running internal decisions.
- No ballot protocol is chosen. Components must fit the candidate designs in QV-16 without depending on one.
- Operators are not trusted with ballot secrecy. They can observe network and timing metadata (QV-16 §6).
- Client cryptography runs on devices QuietVote does not control.
- [UNVERIFIED] No hosting platform has been evaluated against the isolation needs in QV-08-REQ-011.

## 3. Architecture

### 3.1 Components

Architecture areas the owner listed, now assigned:

- Client types: browser/PWA proposed; native app not in first release (OD-08-12).
- Application services and trust boundaries: §3.2.
- Storage for membership, ballot artifacts, results, and audit records: separate stores per row below.
- Cryptographic operations and key custody: key inventory required (QV-08-REQ-007); design in QV-16.
- Identity and eligibility integration: registrar-issued credentials; identity provider not selected (OD-08-10).
- Notifications and time handling: QV-09 notification contract; UTC storage (QV-08-REQ-014).
- Hosted multi-tenant isolation: required for any multi-tenant model (QV-08-REQ-011).
- Self-hosted installation and upgrade path: QV-08-REQ-010, QV-08-REQ-013.
- Backup, restore, export, deletion, and migration: QV-08-REQ-012; deletion rules in QV-06.
- Optional federation or distributed storage: not in initial releases (OD-08-05).

| Component | Holds | Must not hold | Failure behavior |
|---|---|---|---|
| Participant client | Member credential secret; ballot ciphertext until receipt | Any choice sent to a server in plaintext | Shows "not recorded" on any failure; receipt only after commit (REQ-017) |
| Application API | Organizations, manifests, roles, lifecycle state | Ballot choices; credential secrets | Action fails as a whole; no partial lifecycle change |
| Eligibility service | Roster or commitment per policy; issuance records | Ballot choices; ballot contents | Issuance fails closed; no credential without a committed set |
| Ballot service | Ciphertexts, validity proofs, decision-scoped nullifiers | Account IDs; roster data; plaintext choices | Rejects while unavailable; identical retry is idempotent |
| Trustee tools | Own key share | Other trustees' shares; plaintext ballots | Tally stalls below threshold; no partial result published |
| Public record store | Manifest, ballot evidence, tally, log checkpoints | Roster; identity-to-ballot mapping | Append-only; corruption detected, not silently repaired |
| Independent verifier | Downloaded public record | Credentials; keys | Reports failed check with reason |
| Operations tooling | Health metrics, deploy records | Joined identity and submission timelines (QV-08-REQ-005) | Alerts on service health only |

Data classes handled: organization configuration, roster, credential material, ballot records, tally evidence, audit events, operational logs, and notification data. Each lives only in the stores listed above.

### 3.2 Trust boundaries

| Boundary | Controls | Residual exposure |
|---|---|---|
| B1 Device to network | Client encrypts before sending; TLS (QV-16 §3) | Device or screen compromise; coercion (QV-16 §6) |
| B2 Eligibility to ballot | Separate stores and roles; ballot path checks proofs against the published commitment (REQ-003, REQ-004) | Same operator sees both if not separated; timing correlation |
| B3 Services to public record | Signed manifest and checkpoints; standalone verifier | Public artifacts are permanent; a log can show different views to different parties (QV-16 §3) |
| B4 Operator and admin access | Strong authentication for admins; least privilege; access logs (QV-16 §3) | An authorized operator can change running code |
| B5 Trustees | Threshold decryption; verifiable shares | Collusion at or above threshold; key loss |
| B6 Self-host infrastructure | Hardening baseline (REQ-010) | Misconfiguration; the host admin can reach all instance data |

### 3.3 Data flow

1. The client fetches the signed manifest and eligibility commitment from the public record.
2. The client creates the membership proof and nullifier locally, encrypts the choice, and sends ciphertext, proofs, and nullifier to the ballot service over TLS.
3. The ballot service verifies proofs and the nullifier, commits the record, and returns a receipt.
4. Committed ciphertexts are aggregated. Trustees decrypt only the aggregate. Artifacts are published.
5. Observers read only the public record.

## 4. Deployment models

| Model | Benefits to evaluate | Risks/costs to evaluate | Decision |
|---|---|---|---|
| Maintainer-hosted SaaS | Low setup burden, controlled upgrades | Operator trust, recurring cost, availability | Proposed: first pilot only, as a single-tenant instance run by the maintainer (QV-16 §8, stage 4). Multi-tenant SaaS waits for a reviewed tenant threat model (OD-08-01). |
| Organization self-hosted | Local control, custom policy | Admin skill, updates, backups, misconfiguration | Proposed: not in the first pilot. Offer after install, upgrade, backup, and restore drills pass (QV-08-REQ-010, -012, -013). |
| Federated/community-run | Multiple operators, resilience | Consistency, discovery, abuse handling | Proposed: not supported in initial releases. Evaluate under QV-18 once the needs are written down (OD-08-05). |

Do not equate self-hosting or decentralization with anonymity, security, or reliable operation. Each supported model needs its own deployment threat model that names what its operator can see (QV-08-REQ-015).

## 5. Architecture deliverables

- Context, container, and deployment diagrams: outstanding.
- Data-flow and trust-boundary diagrams: text form in §3.2–3.3; drawn versions outstanding.
- Component responsibility and failure modes: done (§3.1).
- Tenant isolation and authorization model: requirements set (REQ-006, REQ-011); design outstanding.
- Encryption and key-management design: key inventory required (REQ-007); protocol details in QV-16.
- Availability, recovery, and migration targets: outstanding (OD-08-07).
- Dependency and technology decision records: register required (REQ-016); no technology decisions recorded yet.
- Deployment threat model for each supported model: required (REQ-015).

## 6. User journeys and failure behavior

| Journey | Normal path | Failure behavior |
|---|---|---|
| Provision instance | Operator deploys per runbook; creates first organizer with strong authentication | Deploy aborts on failed health check; no organization created from partial data |
| Open a decision | Organizer freezes and signs the manifest; decision opens | Signing key unavailable: decision stays in draft; no partial open |
| Vote | Member proves eligibility, encrypts, submits, receives receipt | Service down: "not recorded"; retry with the same ballot bytes while window is open; no receipt without commit |
| Tally | Trustees decrypt the aggregate; artifacts published | Below threshold: stall and notify; no partial tally |
| Verify | Observer runs verifier on the public record | Failed check reported with reason; no silent pass |
| Deletion request | Deletion applied per QV-06 matrix | Data in backups removed on backup expiry (OD-08-08); requester told what may persist |
| Upgrade (self-host) | Back up, apply version, migrate | Migration fails: roll back per runbook; no upgrade during an open window (REQ-013) |
| Restore | Admin restores per-store backups into a clean instance | Not returned to service until verifier passes (REQ-012) |

## 7. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Operator links login and ballot timing from logs | Curious or compromised operator | Likely link between member and choice | Log allow-list; no joined fields; privacy test (REQ-005) | Timing visible from network observation remains |
| Hosted operator swaps manifest or trustee key | Compromised operator | Changed rules or key; wrong tally | Signed manifest; verifier; public checkpoints | Undetected if no independent witness compares checkpoints |
| Cross-tenant read through an API bug | Malicious tenant user | Data leak across organizations | Server-side tenant scoping; tests (REQ-006) | Defects in shared code |
| Misconfigured self-host exposes admin interface | Internet attacker; careless admin | Account takeover; data access | Secure default configuration; hardening baseline (REQ-010) | Local admin error |
| Backup combines eligibility and ballot data | Backup theft | Linkage between roster and ballots | Separate backups per store; encryption (REQ-012) | Backup key compromise |
| Denial of service during open window | Attacker flooding submission | Ballots not accepted | Decision-level limits (OD-08-11); client retry | No availability guarantee; targets unset (OD-08-07) |
| Operator changes deployed code to capture choices | Operator with deploy rights | Secrecy lost for affected ballots | Access control and logs (B4); verifier cannot detect a change that alters only secrecy | High; architecture alone does not mitigate this |
| Compromised third-party dependency | Supply-chain attacker | Any | Pinned versions; dependency register (REQ-016) | Unknown vulnerabilities |
| Ballots silently dropped | Operator or fault | Choice not counted | Receipts with inclusion proofs; verifier checks (QV-09) | Receipt holder must check; receipts may be shown to others (QV-16 §6) |

## 8. Dependencies and interfaces

- **Upstream:** QV-01 (boundaries), QV-03 (registrar and policy), QV-04 (eligibility), QV-05 (ballot method), QV-06 (retention and deletion), QV-07 (threats), QV-16 (cryptography).
- **Downstream:** QV-09 (contracts), QV-10 (screens), QV-11 (verification), QV-12 (operations), QV-13 (localization and time display), QV-14 (hosting cost).
- **Third parties:** hosting platforms, notification providers, identity providers (none selected; OD-08-10), and cryptographic libraries (none selected; pinned per QV-16 §7). All listed in the REQ-016 register.
- **Failure isolation:** notification and other non-ballot failures must not block voting.
- **Versioning:** a ballot is accepted only by a service whose protocol version matches the decision's signed manifest.

## 9. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-08-REQ-001 | The system shall define each component in §3.1 with its responsibility, data it may hold, data it must not hold, and failure behavior. | Must | Every component row is complete; reviewer confirms no component receives plaintext choices or roster data it does not need. | Architecture review |
| QV-08-REQ-002 | The ballot service shall not hold account IDs, member identity data, or roster records. | Must | Ballot store schema has no account or member field; schema test fails if one is added. | Schema test; privacy test |
| QV-08-REQ-003 | Eligibility and ballot data shall be held in separate stores, with separate access roles and separate backups. | Must | Deployment config lists separate stores and roles; a test role with ballot-store access cannot read the roster store. | Config review; access test |
| QV-08-REQ-004 | The ballot path shall verify membership proofs against the published eligibility commitment and shall not call the eligibility service during submission. | Should | Trace of a submission shows no call to the eligibility service; submission succeeds with that service stopped. | Integration test |
| QV-08-REQ-005 | Logs, metrics, and traces shall not contain both an account identifier and a ballot-submission event, or both an IP address and a ballot-submission event. | Must | Log schema scan finds no such combinations; rate-limit counters are exempt only as set by OD-08-11. | Privacy test; log review |
| QV-08-REQ-006 | Authorization shall be enforced server-side per organization and role. No request shall read another organization's data. | Must | Cross-organization reads of proposals, rosters, audit events, and records are denied with no data returned. | Integration test; security review |
| QV-08-REQ-007 | A key inventory shall list every key class (manifest signing, election encryption, trustee, checkpoint signing, administrative) with holder, storage location, rotation, and retirement rule. | Must | Inventory complete; no key class lacks a holder or retirement rule. | Review by cryptography reviewer (QV-16 §9) |
| QV-08-REQ-008 | Manifests shall be immutable after a decision opens. Any change shall create a new signed version recorded in the public record. | Must | Modification after open is rejected; a changed manifest yields a new signed version; verifier flags unsigned changes. | Integration test; verifier test |
| QV-08-REQ-009 | Public records and exports shall not contain the member roster or any mapping from identity to ballot. | Must | Export of a test decision scanned for roster fields and identity-to-ballot links finds none. | Privacy test; review |
| QV-08-REQ-010 | Self-hosted installs shall ship with a secure default configuration and a written hardening baseline. | Must | Fresh install with default configuration passes the baseline checklist; admin interface requires strong authentication. | Install test; hardening review |
| QV-08-REQ-011 | Hosted deployments shall isolate tenant data in storage, keys (OD-08-06), and access roles. | Must | Separate tenant storage; cross-tenant tests pass (REQ-006); key scope documented. | Architecture review; integration test |
| QV-08-REQ-012 | Backups shall be encrypted, kept per store, and restorable. A restored instance shall pass verifier checks before returning to service. | Must | Restore drill yields an instance that passes verifier checks; no store is restored from another store's backup. | Recovery drill (QV-12) |
| QV-08-REQ-013 | Upgrades shall have documented steps and rollback. No upgrade shall run during an open decision window unless the protocol version is unchanged. | Must | Upgrade and rollback rehearsed on a non-production instance; upgrade is blocked during an open window in test. | Upgrade drill; integration test |
| QV-08-REQ-014 | Timestamps shall be stored in UTC and shown with a stated time zone. | Must | Stored records use UTC; notices and receipts show the zone label (OD-08-04). | Unit test; UX review (QV-10) |
| QV-08-REQ-015 | Each supported deployment model shall have its own threat model naming operator access to identity, ballots, metadata, and keys. | Must | One threat model section per supported model; no model is listed as supported without one. | Security review (QV-07) |
| QV-08-REQ-016 | Third-party components (cryptographic libraries, identity providers, hosting, notifications) shall be listed in a dependency register with version, license, and maintenance status. | Must | Register lists every component with all fields; no production dependency is unpinned. | Review; dependency check in CI [UNVERIFIED tooling] |
| QV-08-REQ-017 | A ballot shall not be reported as recorded until the record is committed. When the ballot service fails, the member shall see a "not recorded" state. | Must | Fault injection between commit and response: client shows a retryable "not recorded" state; no receipt is shown without a committed record. | Fault-injection test |
| QV-08-REQ-018 | Availability, recovery-time, and recovery-point targets shall be set by the project owner before any dependent spec is Approved. | Must | Targets recorded in §11 and decided (OD-08-07). | Owner review in decision log |
| QV-08-REQ-019 | Each model's description shall state the limits in QV-16 §6 and shall not claim anonymity, coercion resistance, or security beyond QV-07 evidence. | Must | Each model description contains the §6 limits; each claim has a claim-ledger entry (QV-16 §7). | Claim review |

## 10. Verification

- **Architecture review:** §3 and §4 reviewed with QV-07 and QV-16 reviewers.
- **Privacy tests:** schema, log-join, and export scans (REQ-002, -005, -009).
- **Integration tests:** tenant isolation, manifest immutability, ballot path without the eligibility service (REQ-004, -006, -008).
- **Fault injection:** ballot path failures (REQ-017).
- **Recovery and upgrade drills:** for each supported model (REQ-012, -013).
- **Release-blocking:** failure of REQ-002, -005, -006, -009, or -017 blocks any release. A gap in REQ-007 blocks any pilot that accepts ballots.
- **Independent review:** cryptography and security review before dependent specs move to Approved (QV-11).

## 11. Open decisions

| ID | Question | Options | Recommendation | Owner |
|---|---|---|---|---|
| OD-08-01 | What is the first supported deployment model? (original open question) | Maintainer-run single-tenant pilot; multi-tenant SaaS; organization self-hosted; federated | Proposed: maintainer-run single-tenant pilot for low-stakes internal use only | Project owner |
| OD-08-02 | What are the minimum supported hardware and OS targets? (original) | Name one server OS and container runtime now; set minimums from pilot measurement; support many platforms | Proposed: one documented target; minimums from pilot measurement, not estimated here | Project owner with operations lead (QV-12) |
| OD-08-03 | Is offline participation required? (original) | Required; not required; offline preparation with later online submission | Proposed: not required in first release. Any offline mode needs its own QV-07 review because it changes timing and device risk | Project owner, with QV-10 and QV-13 input |
| OD-08-04 | How are date and time boundaries shown across time zones? (original) | Viewer's local time; organizer's zone; both with labels | Proposed: store UTC; show the organizer's stated zone and UTC offset in notices and receipts | Project owner, with QV-13 input |
| OD-08-05 | What is the operating model for seed nodes, if any? (original) | None; project-run; community-run | Proposed: none in initial releases; revisit under QV-18 | Project owner |
| OD-08-06 | Are election and tenant keys shared across organizations in hosted mode? | One operator-wide key set; per-organization key sets | Proposed: per-organization key sets, validated against QV-16 before pilot | Project owner with cryptography reviewer |
| OD-08-07 | Which availability, recovery-time, and recovery-point targets apply? | Set now; set after pilot measurement | Proposed: set after pilot measurement and before any Approved status (REQ-018) | Project owner |
| OD-08-08 | How long are backups kept, and how do deletions reach backups? | Per-record deletion in backups; fixed backup expiry; a mix | Proposed: fixed backup expiry stated in QV-06, with requesters told when deleted data may persist | Project owner, with privacy review (QV-06) |
| OD-08-09 | How is login-to-ballot timing correlation handled? (from QV-16 §9) | No mitigation beyond log separation; batched or delayed submission windows; delayed receipts | Proposed: log separation only for pilot; record residual risk in QV-07 and in the member notice | Project owner, with QV-07 reviewer |
| OD-08-10 | Is an external identity provider used? | None (registrar issues credentials); federated login via an identity provider | Proposed: none for pilot; revisit under QV-04 | Project owner |
| OD-08-11 | Which keys do ballot-path rate limits use? | Network address; decision; individual proof | Proposed: decision-level limits first; any address-based limit kept out of ballot logs (REQ-005) | Project owner, with QV-07 reviewer |
| OD-08-12 | Which client types are supported at launch? | Responsive web only; web plus native app; web plus mobile web | Proposed: responsive web (PWA-capable) only; native app deferred until QV-13 device review | Project owner, with QV-10 and QV-13 input |
