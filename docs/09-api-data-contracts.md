# QV-09 — API and Data Contracts

**Module ID:** `platform-interfaces`  
**Status:** Framework  
**Objective:** Define stable contracts between clients, services, identity sources, ballot components, and audit tools.

## 1. Purpose and scope

Contracts define what each party may send, receive, and learn. They are where the privacy rules in QV-06 and QV-08 become testable. This spec sets the contract inventory and global rules; each contract's field schema is written from these rules and tested (QV-09-REQ-005).

### In scope
- Organization, membership, decision, eligibility, ballot, tally, audit, administrative, and notification contracts.
- Global rules for authentication, errors, idempotency, versioning, audit events, and examples.
- The ballot path in detail (§5).

### Out of scope (non-goals)
- Screen flows and copy (QV-10).
- Contents of ciphertexts and proofs. QV-05 and QV-16 define them; this spec treats them as opaque, versioned values.
- Internal service calls that stay inside one trust boundary. These are specified only where they cross a boundary (QV-08 §3.2).
- Public API commitments beyond the published record (OD-09-02).

## 2. Actors and access

| Actor | Authentication | May call | Must not be able to call or learn |
|---|---|---|---|
| Member | Credential proof on the ballot path; account login only for non-ballot pages | Submit ballot; get own receipt; read manifest and commitment; challenge | Other members' receipts; any choice; the roster |
| Organizer | Account with strong authentication (QV-16 §3) | Create, freeze, and open decisions; publish commitment; export per policy | Ballot choices; any ballot-to-member mapping |
| Registrar | Account with registrar role | Import roster; publish commitment | Ballot records |
| Trustee | Trustee key | Submit decryption shares | Other trustees' shares; plaintext ballots |
| Observer | None | Read published record, checkpoints, and public export | Non-public data |
| Support staff | Support account; access logged | Account status and recovery flows, per policy | Ballot choices or any ballot linkage |
| Integration | Service identity | Only the fields in its contract | Ballot content; roster unless its contract says so |

## 3. For every contract, specify

Each contract must state the ten items below. Global rules that apply to all contracts are set here; a contract may add to them but not weaken them.

- **Actor and authorization:** the roles in §2. Authorization is checked server-side on every request (QV-09-REQ-003).
- **Request and response schema:** versioned and machine-readable (OD-09-01). Unknown fields are rejected on the ballot path (QV-09-REQ-002).
- **Data classification and privacy effect:** see the data model in §6 and the notes in §4.
- **Idempotency and replay:** each state change carries a natural key (nullifier, batch hash, artifact hash, or expected state version) or an idempotency key. A replay returns the original result and creates no second audit event (QV-09-REQ-006).
- **Error codes and retry guidance:** every error has a stable code, a `retryable` flag, and a localizable message key (QV-13). Errors never reveal whether an identifier is eligible, has voted, or exists, except to that member (QV-09-REQ-004, -014).
- **Rate and abuse limits:** declared per contract. Values are open (OD-09-04). Ballot-path limits must not key on member identity.
- **Versioning and compatibility:** additive changes are compatible. Removing, renaming, or changing meaning requires a new major version (QV-09-REQ-007).
- **Audit events:** one event per state change, with event type, decision ID, actor role, UTC time, and sequence number. Events never carry ballot choices. Ballot-path events carry no account ID or IP address (QV-09-REQ-008).
- **Authentication and key requirements:** per §2 and the key inventory (QV-08-REQ-007).
- **Examples:** at least one request and response example per contract, run as an automated test (QV-09-REQ-010).

Timestamps are UTC with an explicit `Z` suffix. All calls use TLS (QV-16 §3).

## 4. Contract inventory

| Contract | Actor and authorization | Request to response (summary) | Data class and privacy effect | Idempotency | Audit event |
|---|---|---|---|---|---|
| Create or update organization | Org admin | Profile and policy to organization record | Organization configuration; no member data | Expected version on update | `org.updated` |
| Import membership roster | Registrar | Records to import summary (counts by status) | Personal data; eligibility store only; never sent to ballot path | Batch hash | `roster.imported` (no names) |
| Assign role | Org admin | Member and role to grant | Role data; least privilege | Natural key | `role.granted` |
| Create or edit decision | Organizer | Rules, options, method, cutoff to draft | Rules; visible per policy | Draft version | `decision.edited` |
| Freeze and sign manifest | Organizer with signing key | Draft to signed manifest version | Public once opened | Manifest hash | `manifest.signed` |
| Open or close decision | Organizer; scheduled close | State change | Public state | Expected state version | `decision.opened` / `decision.closed` |
| Read manifest and checkpoints | Anyone | Decision ID to manifest and checkpoint | Public record | Read-only | None |
| Publish eligibility commitment | Registrar | Commitment root to accepted version | Commitment is public; no member list | Root hash | `commitment.published` |
| Issue credential | Member, through registrar flow | Issuance request to credential material on device | Links member to eligibility store only; not part of ballot data. Form of material per QV-16 (not chosen) | Issuance request ID | `credential.issued` (no member link in public log) |
| Submit ballot | Member, with validity and membership proof | See §5.1 | Ciphertext, proof, and nullifier; no identity | Nullifier plus identical bytes | `ballot.accepted` (decision ID and record position only) |
| Get receipt and inclusion proof | Member holding receipt | Receipt ID to receipt and proof | Must not identify the member or reveal the choice. May be shown to others (QV-16 §6) | Read-only | None |
| Publish tally and decryption proofs | Tally service; trustees | Artifacts to accepted version | Aggregate only | Artifact hash | `tally.published` |
| Submit decryption share | Trustee | Share and proof to accepted | Derived from trustee secret; no ballots | Trustee, decision, and share index | `share.accepted` |
| Export audit bundle | Observer or auditor, per policy | Decision ID to bundle | Public record only unless policy allows more | Read-only | `export.created` |
| Request recount | Organizer or auditor, per policy | Decision ID and reason to recount job | Uses public artifacts; any decryption needs trustee quorum | Decision and reason key | `recount.requested` |
| Submit challenge | Member or observer | Receipt or record reference and type to challenge ID | Creates a record; cannot alter ballots; minimal reporter data | Reference and type | `challenge.opened` |
| Support lookup | Support staff | Account ID to status | Must not return receipts, record items, or ballot linkage | Read-only | `support.accessed` |
| Notification event | System to provider | Recipient, template ID, and decision ID to delivery status | No choice. Reminders must not reveal participation (OD-09-06) | Event ID | `notification.sent` |

## 5. Ballot path

### 5.1 Submit ballot

- **Caller:** member client. No account token is used on this path (QV-08-REQ-002).
- **Request fields:** `decision_id`, `protocol_version`, `nullifier`, `ciphertext` (opaque), `validity_proof` (opaque), and membership proof (opaque).
- **Forbidden fields:** account ID, member name, plaintext choice, and any stored IP address. Transport-level address handling is set by OD-08-11.
- **Response:** `receipt_id`, `decision_id`, `status` (`accepted` or `rejected`), and `record_position` once committed.
- **Idempotency:** the same decision and nullifier with identical bytes returns the original receipt. Different bytes for a used nullifier return `NULLIFIER_USED` with no further detail. The client must keep the same bytes for retries.
- **Errors:**

| Code | Meaning | Retryable |
|---|---|---|
| `DECISION_NOT_OPEN` | Window closed or not yet open | No |
| `MANIFEST_VERSION_MISMATCH` | Client protocol does not match manifest | No, until client updated |
| `PROOF_INVALID` | Proof failed verification | No |
| `NULLIFIER_USED` | Nullifier already recorded | No |
| `RATE_LIMITED` | Limit reached | Yes, after delay in response |
| `UNAVAILABLE` | Service cannot commit | Yes, with same bytes |

- **Audit:** `ballot.accepted` with decision ID and record position only.
- **Privacy effect:** the record holds ciphertext and nullifier, not identity. Timing correlation with login remains (OD-08-09).

### 5.2 Get receipt

The receipt holds `receipt_id`, `decision_id`, `record_position`, an inclusion proof, and a checkpoint reference. It must not hold an account ID or any value that identifies the member. Whether a member can show a receipt to others is a QV-16 §6 limit and must be stated to the member.

### 5.3 Eligibility check

Not a public endpoint. The ballot service verifies membership proofs against the published commitment (QV-08-REQ-004). Any later service-to-service check must be added here as a new contract and reviewed under QV-08 §3.2.

## 6. Data model worksheet

| Entity | Stable ID | Relationships | Lifecycle | Visibility | Retention and deletion | Portable (proposed) |
|---|---|---|---|---|---|---|
| Organization | Server-generated opaque ID | Roles, decisions | Active, then closed, then deleted per QV-06 | Org members and admins | Per QV-06 | Yes, configuration only |
| MemberCredential | Opaque ID; never used on ballot path | Organization; eligibility set | Issued, then used or expired, then revoked | Member; registrar per policy | OD-09-05 | No (OD-09-07) |
| Role | Opaque ID | Organization; member | Granted, then revoked | Org admins | Kept as audit history | With organization |
| Proposal | Opaque ID | Organization; ballot definition | Draft, frozen, open, closed, tallied | Per decision policy | Per QV-06 | Yes, signed record |
| BallotDefinition | Hash of signed manifest | Proposal | Frozen at open (QV-08-REQ-008) | Public once open | Kept with record | Yes, signed record |
| EligibilitySet | Commitment root | Organization; decision | Committed, then frozen | Root public; roster per policy | Roster deleted per QV-06 | Root only |
| BallotSubmission | Receipt ID; nullifier | Decision only. No reference to member or account | Accepted, then counted | Ciphertext public; scoped to decision | Kept as record; backup rule OD-08-08 | Yes, signed record |
| Tally | Artifact hash | Decision | Published | Public | Kept as record | Yes |
| AuditArtifact | Artifact hash | Decision | Created, then published | Per policy | Kept as record | Yes |
| Challenge | Opaque ID | Receipt or record item | Opened, then resolved | Reporter and organizer; outcome public | Per QV-06 | No (first release) |
| Event | Sequence number per decision | Decision; actor role | Append-only | Org admins; auditors per policy | Per audit policy | Yes, within export bundle |

## 7. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-09-REQ-001 | Every contract in §4 and §5 shall state all ten items in §3. | Must | Review checklist shows no empty item; every §4 row is covered by §3 or a per-contract entry. | Document review; contract test |
| QV-09-REQ-002 | Ballot-path contracts shall reject any request that carries an account ID, member name, plaintext choice, or field not in the schema. | Must | Schema validation test rejects each forbidden field; schema contains none of them. | Contract test; unknown-field fuzzing |
| QV-09-REQ-003 | Authorization shall be checked server-side on each request against the caller's role and the decision state. | Must | Actor-by-contract matrix test passes; no contract is callable by an unlisted actor. | Integration test |
| QV-09-REQ-004 | Error responses shall not disclose eligibility, participation, or existence of a member to any caller other than that member. | Must | For eligible and ineligible identifiers, outside callers receive identical status codes and response structure. | Security and privacy test |
| QV-09-REQ-005 | Each contract schema shall be written in the format chosen under OD-09-01 and validated in CI. | Must | CI fails on a schema that does not parse or an example that does not validate. | CI check |
| QV-09-REQ-006 | State-changing calls shall be idempotent by their natural key. A replay shall return the original result and create no second audit event. | Must | Replayed request returns the same response and one event; same key with conflicting content is rejected. | Integration test |
| QV-09-REQ-007 | Breaking changes shall require a new major version. Contract tests shall compare each version with the previous one. | Must | Test flags removal or type change; additive change passes. | Contract test |
| QV-09-REQ-008 | Every state change in §4 shall emit an audit event. Events shall not contain ballot choices, and ballot-path events shall not contain account IDs or IP addresses. | Must | Per-contract test confirms the event; field scan finds no forbidden field. | Privacy test; review |
| QV-09-REQ-009 | Integration and notification payloads shall contain exactly the fields listed in their contract and no ballot content. | Must | Captured payloads to a test provider match the contract field list exactly. | Integration test |
| QV-09-REQ-010 | Each contract shall have at least one request and response example that runs as an automated test. | Must | CI runs all examples; a failing example blocks merge. | CI check |
| QV-09-REQ-011 | The public record and verifier input shall be a versioned bundle that the standalone verifier can process without access to internal APIs. | Must | Verifier run on an exported bundle, with no network access to internal services, reaches the expected result. | End-to-end test (QV-11) |
| QV-09-REQ-012 | Rate limits shall be declared for each contract. Ballot-path limits shall not key on member identity. | Should | Each contract has a declared limit (values per OD-09-04); review confirms no member-keyed limit on the ballot path. | Review; integration test |
| QV-09-REQ-013 | Each entity in §6 shall define its stable ID rule, visibility, retention, and deletion rule. | Must | Worksheet has no empty cell. | Document review |
| QV-09-REQ-014 | Error codes shall be stable and documented. No code shall be removed within a major version. | Must | Code list diff shows no removal within a major version. | Contract test |
| QV-09-REQ-015 | Challenge and recount requests shall be recorded as events and shall not modify submitted ballot records. | Must | Challenge leaves all record hashes unchanged; event exists. | Integration test |
| QV-09-REQ-016 | Support lookup responses shall not include receipts, record items, or any value linking a member to a ballot. | Must | Support response schema has no such fields; test confirms. | Contract test; review |

## 8. Verification

- **Contract tests:** schema validity, examples, and breaking-change detection (REQ-005, -007, -010).
- **Authorization matrix:** actor-by-contract (REQ-003).
- **Privacy tests:** forbidden-field rejection, audit field scan, notification payload match, support response check (REQ-002, -008, -009, -016).
- **Replay tests:** idempotency and conflicting replays (REQ-006).
- **Error disclosure:** eligible and ineligible identifiers compared (REQ-004).
- **Verifier end to end:** standalone verifier on an exported bundle (REQ-011).
- **Release-blocking:** failure of REQ-002, -003, -004, -008, or -009 blocks release.
- **Independent review:** ballot-path contracts reviewed with protocol reviewers before any dependent spec is Approved (QV-11, QV-16 §7).

## 9. Open decisions

| ID | Question | Options | Recommendation | Owner |
|---|---|---|---|---|
| OD-09-01 | Which schema format and versioning policy apply? (original open question) | Machine-readable JSON over HTTPS; OpenAPI-described JSON; a binary format | Proposed: JSON over HTTPS with a machine-readable schema, so independent verifiers are easy to build | Project owner, with engineering lead (role not yet assigned) |
| OD-09-02 | Is the API public, internal, or both? (original open question) | Internal for members, organizers, and admins; public read-only for records and verifiers; fully public | Proposed: internal for application use; public read-only for published records and checkpoints | Project owner |
| OD-09-03 | How long are old major versions supported? | Fixed period set by owner; until all decisions using them close; indefinitely | Proposed: until every decision using the version has closed, plus an owner-set period | Project owner |
| OD-09-04 | What are the rate and abuse limit values? | Set numbers now; set after load and abuse testing | Proposed: no values until tested in QV-11; keyed by decision and endpoint, not member, on ballot path | Project owner, with QV-07 reviewer |
| OD-09-05 | How long are membership, credential, and challenge records kept? | Until decision closes; per organization policy; deleted on request | Proposed: per organization policy within QV-06 limits; deletion matrix written with QV-06 | Project owner, with privacy review |
| OD-09-06 | Can reminders reveal who has not voted? | Reminders only to members who have not voted; reminders to all eligible members; no reminders | Proposed: reminders to all eligible members, so the provider cannot infer participation | Project owner, with QV-06 review |
| OD-09-07 | Which records are portable between deployments? (original open question) | None; signed public record and verifier bundle only; roster and credentials too | Proposed: signed public record and verifier bundle only; roster and credentials not portable in first release | Project owner, with QV-08 review |
| OD-09-08 | How can integrations avoid receiving identity or ballot data they do not need? (original open question) | Field allow-list per contract; per-integration review; trust the integration | Proposed: field allow-list per contract, reviewed for each integration before connection | Project owner, with QV-06 review |
