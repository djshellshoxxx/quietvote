# QV-16 — Cryptography and Technical Design

**Module ID:** `ballot-engine` / cross-cutting  
**Status:** Framework with candidate architecture; no protocol or implementation choice is approved  
**Owner:** Project owner (role). Cryptography and security reviewers: not yet named.  
**Last reviewed:** Not reviewed. Drafted 2026-11-18; no review recorded.  
**Related specs:** Depends on QV-03–QV-09. Required by QV-05, QV-08, QV-11, QV-17, QV-18, QV-19 (see [specification index](SPEC-INDEX.md)).  
**Purpose:** Explain how cryptography and supporting technology could make private, auditable group decisions possible, and identify what must be decided and reviewed before implementation.

## 1. What “crypto” means in QuietVote

QuietVote needs **cryptography**: encryption, digital signatures, zero-knowledge proofs, and verifiable data structures. It does not inherently need a cryptocurrency, token, smart contract, or public blockchain.

The core product should not require users to buy or hold a token. A blockchain is not a substitute for a correct voter roster, secure client, sound voting protocol, or good governance. Public immutable ledgers can permanently expose timing and participation metadata. Any distributed ledger or token should require a specific, documented benefit and a separate threat/privacy review.

The aim is to reduce the amount any single party must be trusted with, while clearly documenting what trust remains.

## 2. Objective, actors, and scope

**Objective.** Define the candidate cryptographic design for private, verifiable group decisions. Set testable requirements for any design that is adopted, and list the choices that need expert review. This spec does not select a protocol, primitive, library, or parameter set.

### Actors

| Actor | Goal | Preconditions | Main outcome |
|---|---|---|---|
| Organizer | Define and open a decision | Rules set under QV-03; admin account with strong authentication (REQ-017) | Signed manifest; decision opens |
| Registrar | Confirm the eligible set | Designated by the group | Roster commitment published |
| Member | Cast a private ballot and check it was recorded | Eligible credential; reviewed client | Ballot accepted or rejected, with reason |
| Guardian (trustee) | Hold a key share and take part in the tally | Independent of other guardians | Aggregate decrypted with proofs |
| Service operator | Run intake, storage, eligibility, and logs | Access limited to its own store (REQ-019) | Operates without plaintext choices |
| Verifier (member, observer, auditor) | Check the record independently | Access to public record | Pass or fail, with the failing check named |
| Protocol and implementation reviewer | Assess design and code | Spec, code, test vectors | Findings (§16) |

### In scope

The candidate flow (§3), trust boundaries and adversaries (§4), candidate components (§5–§7), privacy and security limits (§8), data, assumptions, abuse and failure cases (§9–§12), dependencies (§13), requirements (§14), verification (§16), and open decisions (§21).

### Non-goals

- Choosing a protocol, primitive, library, or parameter set. Each choice is an open decision (§21).
- Tokens, cryptocurrency, smart contracts, or a public blockchain (§1).
- Ranked-choice or other non-additive tallies as an MVP capability (§6).
- Coercion resistance, untraceability, or unconditional anonymity (§8).
- Roster fairness, legitimacy of group rules, and endpoint security. These belong to QV-03, QV-04, and QV-07.
- Legally binding elections, public government elections, or shareholder votes (outside the README scope).

## 3. Candidate system model

This is a design direction to investigate, not a final architecture.

1. **Group defines and freezes the decision.** The organizer selects the rule set, ballot, voting method, eligibility cutoff, opening/closing conditions, and disclosure policy. The exact election manifest is versioned and digitally signed.
2. **Group establishes eligibility.** A group-designated registrar confirms the eligible set. The service commits to the frozen roster, for example with a Merkle-tree root, or issues one-use credentials. A proof can establish that a participant belongs to the committed set without publishing the roster. Cryptography cannot establish that the group’s roster is fair, complete, or politically legitimate.
3. **Member proves eligibility.** A member uses a private credential secret to prove membership and produce a decision-scoped nullifier. The nullifier lets verifiers reject a second ballot for the same decision without using a stable public member ID. It must be scoped so that activity across different decisions cannot be linked by default.
4. **Client constructs and encrypts the ballot.** A reviewed client encodes the choice, encrypts it to a per-decision election key, and produces a proof that the ballot satisfies the published rules (for example, selection limits). The client presents the human-readable ballot and privacy notice before submission.
5. **System accepts and records the ballot.** Eligibility proof, nullifier, encrypted ballot, and validity proofs are checked. The accepted record is added to an auditable bulletin board. The public record must not pair a legal identity or stable account ID with ballot ciphertext.
6. **Independent parties check the record.** Participants and observers can verify signatures, ballot validity, inclusion in the record, and consistency of published checkpoints using an independently implemented verifier.
7. **Tally is computed.** For supported additive methods, encrypted selections may be combined without decrypting each ballot. A threshold of separately operated trustees then decrypts only the aggregate and supplies verifiable decryption proofs. Other ballot methods may require a mixnet or a different protocol.
8. **Result and evidence are published.** The group receives the result, the manifest version, tally evidence, and procedures for challenges/recounts. The verifier checks that the evidence matches the published rules.

Failure behavior at each step is in §12.

## 4. Trust boundaries and adversaries

### Trust boundaries

| Boundary | What crosses it | Trust assumed | Not trusted |
|---|---|---|---|
| B1. Member device | Choice, credential secret, receipt | Device not compromised during use (A-1) | Browser extensions, other apps, screen |
| B2. Client ↔ eligibility service | Credential request, eligibility proof | Registrar sets the roster as intended (A-3) | Service learning any choice (none is sent) |
| B3. Client ↔ ballot service | Encrypted ballot, validity proof, nullifier | Transport protected by TLS (A-7) | Service with respect to choice content |
| B4. Services ↔ public record | Accepted ballots, manifest, checkpoints | Nothing; all content is verified | Operator consistency (monitors required, REQ-021) |
| B5. Guardians ↔ tally | Decryption shares and proofs | Threshold of guardians honest and independent (A-4) | Tally operator; any coalition below threshold |
| B6. Verifier ↔ record | All published data | Verifier code is independent and reviewed | Main application UI |
| B7. Operator access ↔ data stores | Queries, logs, admin actions | Identity and ballot stores are separated (REQ-019) | Any single operator holding both |

### Adversaries

“Intended coverage” is a design goal. It is not an achieved property.

| ID | Adversary | Capability assumed | Intended coverage |
|---|---|---|---|
| ADV-1 | Curious service operator | Reads stored data and logs | Ballot content: yes, if stores are separated and encrypted. Metadata: no |
| ADV-2 | Colluding operator and registrar | Joins eligibility and submission data | No, unless OD-03 closes the linkage |
| ADV-3 | Network or hosting observer | Sees traffic metadata | Content only (TLS). Timing: no |
| ADV-4 | Compromised device or malware | Sees choice, screen, credential | No |
| ADV-5 | Coercer or vote buyer | Demands proof of choice or abstention | No (§8) |
| ADV-6 | Colluding guardians | Pool their shares | Below threshold: intended. At or above threshold: no |
| ADV-7 | Malicious or mistaken organizer or registrar | Changes roster or rules | Rule change after opening: detectable if monitored (REQ-021). Roster fairness: no |
| ADV-8 | Member holding a credential | Votes more than once; shares credential | One ballot per credential: intended. Credential sharing: no |
| ADV-9 | Log operator | Shows different views to different people | Only with independent monitors (OD-06) |
| ADV-10 | Availability attacker | Blocks intake, guardians, or publication | No |
| ADV-11 | Observer of published tallies | Infers a choice from small groups | No, unless OD-19 closes it |
| ADV-12 | Cryptanalysis or implementation bug | Breaks a primitive or code | No. Reviews reduce the risk; they do not remove it |

## 5. Candidate cryptographic components

| Need | Candidate technique | How QuietVote could use it | Important limit / decision |
|---|---|---|---|
| Authenticate configuration and actions | Digital signatures | Sign the election manifest, rule changes, trustee contributions, tally, and transparency checkpoints | A signature proves integrity and key attribution; it does not prove the signer’s action was fair or authorized |
| Keep a vote secret while tallying | Public-key ballot encryption | Encrypt each selection before it leaves the participant's client | Client compromise, coercion, side channels, or a bad protocol can still reveal or alter choices |
| Prove ballot validity without revealing choice | Zero-knowledge proof | Prove encrypted choices satisfy the ballot's constraints (e.g., a selection is allowed and within the maximum) | Proof systems are easy to implement incorrectly; use a reviewed scheme and audited libraries |
| Prove group membership privately | Anonymous credential or ZK membership proof | Show eligibility in the frozen member set without publishing the member's identity | The membership issuer/registrar still decides who is in the set; credential revocation and recovery are hard |
| Enforce one vote per member per decision | Decision-scoped nullifier / one-use credential | Reject repeated submissions while avoiding a globally stable voter identifier | A wrongly scoped or deterministic identifier can make votes linkable across decisions |
| Aggregate compatible ballots | Homomorphic encryption | Combine ciphertexts for additive tallies, then decrypt only the aggregate | Fit depends on voting method; this is not a general ranked-choice tally |
| Support more complex ballot types | Verifiable mixnet or another reviewed protocol | Shuffle and re-randomize encrypted ballots before tallying to break order/linkage | Additional complexity, trustee assumptions, and protocol-specific verification; separate design and audit needed |
| Make history tamper-evident | Append-only Merkle log with signed checkpoints | Publish decision manifests and ballot evidence with inclusion/consistency proofs | A log can equivocate by showing different views; independent monitors/witnesses must compare checkpoints |
| Protect data in transit | TLS and secure transport configuration | Protect service communications against ordinary network interception and tampering | TLS does not hide endpoint identity from the service or all traffic metadata |
| Protect administrative accounts | Passkeys/WebAuthn or strong MFA | Harden organizer, administrator, and operator accounts | This secures the account; it does not make a ballot anonymous |
| Protect stored data | Encryption at rest and separated data stores | Reduce exposure from lost media/backups; separate identity, eligibility, ballots, and operations | Server-side encryption does not protect against a compromised running service or authorized operator |

All choices in this table are candidates. Expert review required before any is selected (§21).

### Candidate precedents to study

- **Helios and Belenios:** research/deployed examples of end-to-end verifiable online voting. Belenios 3.0 specifies encrypted ballots, zero-knowledge well-formedness proofs, signed ballots, and homomorphic or mixnet tally modes [UNVERIFIED — not checked against the cited specification in this pass]. Study their threat models and user verification steps; do not copy components without reviewing fit and licensing.
- **ElectionGuard:** a published design and implementation ecosystem for encrypted selections, validity proofs, homomorphic aggregation, and verifiable decryption. Its stated operating assumptions and use cases must be checked against QuietVote's online, voluntary-group setting.
- **Semaphore:** a useful reference for the group-membership proof plus scope-specific nullifier pattern. It is not a complete election protocol and its examples often assume smart contracts [UNVERIFIED]; QuietVote must not inherit a blockchain requirement by default.
- **W3C BBS Data Integrity Cryptosuite:** a candidate standardization path for selective disclosure and unlinkable derived proofs. Its current W3C status and implementation maturity must be rechecked before selection.

## 6. Candidate ballot strategy by complexity

### First protocol to evaluate

Limit an initial high-assurance pilot to simple additive choices such as yes/no, single selection, or approval, if the research review confirms the protocol matches the intended trust model. Homomorphic tallying can add encrypted selections and decrypt the aggregate, avoiding disclosure of individual choices to tally trustees. This is a candidate only. Expert review required (OD-01, OD-08).

### Ranked or otherwise complex ballots

Ranked-choice elimination and other non-additive rules require a different or extended tally protocol. Options to study include verifiable mixnets and threshold/MPC designs. Treat them as separate capabilities with their own threat analysis, proof review, performance budget, and tests. Do not promise ranked voting just because the interface can collect rankings.

### Trustee / guardian model

Consider a per-decision threshold key held by independent guardians, so fewer than a configured threshold cannot decrypt the tally. Specify:
- How many guardians and what threshold are needed
- Who selects and replaces guardians
- How key generation, verification, backup, and retirement work
- What happens when guardians are unavailable or collude
- How decryption shares are independently verified
- Whether guardians learn only the aggregate or anything more

A key ceremony does not remove trust; it distributes it. An organization could choose trusted members as guardians, but they must be meaningfully independent. Expert review required (OD-09).

## 7. How supporting technology fits

These are components to evaluate, not a final technology stack.

- **Participant application:** a browser/PWA or other client renders the ballot, creates proofs, encrypts the selection, and gives clear confirmation. A client-side crypto failure or compromised device is a major residual risk.
- **Eligibility service:** manages membership or credential issuance; should not receive ballot choices. Its access and metadata must be separated from ballot submission.
- **Ballot service:** validates proofs, checks the decision-scoped nullifier, and stores encrypted ballots. It should not need plaintext choices.
- **Trustee tools:** allow independent guardians to participate in key generation and threshold tallying without sending secret shares to one central operator.
- **Public election record:** carries the signed manifest, commitments, encrypted ballots or permitted evidence, proofs, tally artifacts, and signed log checkpoints. It must not publish the member roster or identity-to-ballot mapping.
- **Independent verifier:** a small, open-source program that downloads the record and checks rule hashes, signatures, proofs, tally, and log consistency without trusting the main UI.
- **Storage:** relational storage can support accounts and organization policy; immutable/versioned object storage can distribute election records. Define what can be deleted and what is intentionally retained for audit.
- **Operations:** monitoring should focus on service health, not individual voting behavior. Avoid analytics and logs that join login identity, IP address, timestamp, and ballot submission.

An initial implementation may be a modular web application rather than a decentralized network. Self-hosting, federation, or peer-to-peer replication should be added only where the threat model shows they improve user control without leaking more metadata or making recovery unworkable.

## 8. Privacy and security limits that must be explicit

QuietVote should never promise “untraceable,” “coercion-proof,” or unconditional anonymity without evidence for the exact deployment.

The documentation and user-facing notice must discuss:
- The organizer's roster and eligibility decisions
- Service operators' access to network and timing metadata
- Correlation between login and ballot-submission times
- Small-group tallies that reveal a member's likely choice
- Browser/device compromise, malware, screen observation, or coercion
- Trustee collusion and key loss
- Denial of service or selective censorship
- The possibility that public audit artifacts are permanent
- Whether a ballot confirmation could be shown to a coercer

Cryptographic verification shows properties of the recorded protocol execution; it does not prove a device displayed the intended ballot, a member voted freely, or the organization selected a fair roster.

### Properties: intended claim and explicit non-claim

Each intended claim holds only if the related open decisions close, the design is reviewed, and the verification in §16 passes. **None of these properties is achieved today.**

| Property | Intended claim | Explicitly not claimed |
|---|---|---|
| Ballot secrecy from other members | No member learns another member's choice from the public record | Secrecy from a compromised device, a coercer, or small-group inference |
| Ballot secrecy from organizer and operators | No single operator or organizer decrypts an individual ballot | Secrecy from client compromise or timing correlation (ADV-1, ADV-3) |
| Public unlinkability | The public record never pairs a ciphertext with an identity or stable ID (REQ-006) | Unlinkability against an operator holding both login and ballot logs |
| Cross-decision unlinkability | Nullifiers for different decisions are not linkable from public data (REQ-005, OD-05) | Unlinkability through roster, timing, or participation patterns |
| One ballot per eligible credential | A second accepted ballot from the same credential in the same decision is rejected (REQ-005) | Prevention of credential sharing, coerced voting, or a valid credential used by an ineligible person |
| Roster membership | Only ballots proven against the frozen roster commitment are accepted (REQ-006) | Roster fairness, completeness, or legitimacy |
| Ballot validity | Accepted ballots satisfy the published rules (REQ-004) | That the device encoded the choice the member saw |
| Tally verifiability | A standalone verifier can check the tally against recorded ballots and published rules (REQ-010) | That every cast ballot was recorded (censorship), or that the verifier is free of bugs |
| Tamper evidence | Changes to published records are detectable when monitors compare checkpoints (REQ-021) | Detection by a member who has no monitor and trusts the log operator |
| Coercion resistance | None | All of it (§8) |
| Availability | None | Ballot intake, tally release, or publication under attack |
| Participation privacy | None | Whether a member took part may be visible from the roster or the record |

## 9. Data handled

- **Data controller/operator:** the group is the controller for its own members. The operator is either the hosted service or the group's self-hosted deployment (QV-08). Final roles belong to QV-06.
- **Linkability risks:** login and submission timing (OD-07); roster combined with small-group tallies (OD-19); credential reuse across decisions (OD-05); operator logs that join IP address, account, and time.
- **Retention and deletion:** open (OD-17). Requirement REQ-022 applies before any pilot.
- **Visibility:** see the table below.
- **Privacy properties claimed and not claimed:** see §8.

| Data | Where created or stored | Member sees | Organizer sees | Operator sees | Public observer sees | Retention |
|---|---|---|---|---|---|---|
| Legal identity and contact data | Member; eligibility store | Own | Per QV-04 policy | Yes (eligibility store) | No | OD-17 |
| Roster (member list) | Registrar; eligibility store | Own membership | Yes | Yes (eligibility store) | No, unless OD-02 makes it public | OD-17 |
| Roster commitment (root) | Published | Yes | Yes | Yes | Yes | Permanent once published (§8) |
| Credential secret | Member's device only | Yes | No | No | No | Member-controlled |
| Manifest and rules | Signed; published | Yes | Yes | Yes | Yes | Permanent once published |
| Plaintext choice | Client only, transiently | Own | No | No | No | Not stored by services (REQ-003) |
| Encrypted ballot and validity proof | Ballot store; public record if OD-06 permits | Own receipt only (OD-12) | No | Ciphertext only | Ciphertext only, if published | OD-17 |
| Nullifier | Ballot store; public record | No | No | Yes | Yes, if published | OD-17 |
| Guardian key share | Guardian only | Guardian's own | No | No | No | Lifecycle per OD-09 |
| Decryption shares and tally | Tally operator; public record | Result | Result | Per proofs | Result and proofs | Permanent once published |
| Operational logs (addresses, timestamps, account IDs) | Operations | No | No | Yes | No | OD-07; must not join (REQ-007) |
| Admin credentials | Operations | No | Own | Yes | No | Account lifecycle (QV-12) |

## 10. Assumptions

Each assumption must be validated before the claims that depend on it are made.

- **A-1** Member device and browser are not compromised during voting. Not verifiable; stated as a limit (§8).
- **A-2** The chosen primitives stay secure at the chosen parameters. Validate by expert review (OD-01, OD-13). [UNVERIFIED]
- **A-3** The registrar sets the roster as the group intends. Cryptography cannot check this. Validate by the QV-03 process and audit.
- **A-4** At least the threshold number of guardians are honest and independent. Validate by the guardian selection process (OD-09). Independence is not testable cryptographically.
- **A-5** Eligibility and ballot operators do not collude, or the design resists their collusion (OD-03). Validate by separation controls (REQ-019) and review.
- **A-6** The OS and browser CSPRNG is correct. Validate by platform review. [UNVERIFIED]
- **A-7** TLS configuration comes from a reviewed baseline. Validate by configuration scan (REQ-018).
- **A-8** Members can understand the notice. Validate by usability tests (QV-13).
- **A-9** Groups are large enough for the disclosure rule (OD-19). Validate with the rule and review.
- **A-10** The verifier implementation is independent and correct. Validate by an independent implementation and test vectors.
- **A-11** Permanent publication of the record is acceptable to the group. Validate by QV-06 review.

## 11. Abuse cases

| Case | Attacker or cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Second ballot by one member | Member holding a credential | Extra weight | One ballot per decision via nullifier (REQ-005) | Credential sharing; mis-scoped nullifier (OD-05) |
| Choice tied to member after publication | ADV-2, or an operator holding both stores | Choice disclosed | Store separation (REQ-019); no identity in record (REQ-006) | Collusion (OD-03) |
| Login-to-submission timing correlation | ADV-1, ADV-3 | Choice inferred | Log minimization (REQ-007); OD-07 | Not solved; no claim made |
| Invalid ballot (over-selection, malformed) | Malicious client | Tally distorted | Validity proofs and strict parsing (REQ-004, REQ-011) | Proof-system or parser bugs |
| Manifest or rule swap | Operator | Rules changed after opening | Hash binding and freeze (REQ-001, REQ-002) | Undetected without monitors (REQ-021) |
| Log equivocation | Log operator | Different members see different records | Signed checkpoints and monitors (REQ-021) | No monitor, no detection (OD-06) |
| Decryption of individual ballots | Guardians or tally operator | Choices disclosed | Threshold; aggregate-only decryption (REQ-008, REQ-009) | Collusion at or above threshold |
| Ballot replayed in another decision | Attacker | Vote counted in wrong decision | Domain tags and decision IDs (REQ-011) | Encoding mistakes |
| Malware exfiltrates credential | ADV-4 | Impersonation; extra vote | None specified yet | High; credential storage design is open |
| Admin account phished | Attacker | Rule change; data access | Phishing-resistant authentication (REQ-017) | Compromised admin device |
| Small-group tally reveals choice | ADV-11 | Choice disclosed | Disclosure rule (OD-19) | Likely for small groups |
| Denial of service on intake or tally | ADV-10 | Decision fails or is delayed | Rate limits and failure policy (§12) | Not protected |
| Altered verifier distributed | Attacker | Members trust a wrong result | Publish verifier source and hashes (QV-12) | Members may not check hashes |

## 12. Failure behavior

| Failure | Required behavior | Ref |
|---|---|---|
| Ballot fails proof, manifest, or encoding check | Reject; store nothing; return a reason that reveals no choice | REQ-004 |
| Connection drops after submission | Client resends the same sealed ballot; one ballot is recorded | REQ-023 |
| Nullifier already used | Reject the second ballot; never overwrite the first | REQ-005 |
| Eligibility service unavailable | No credentials issued; voting window follows QV-03; no silent extension | QV-03 |
| Fewer guardians than threshold | No tally release; no partial decryption; decision shows “tally pending” | REQ-008 |
| Guardian share fails its proof | Share excluded and the exclusion published; tally needs threshold valid shares | REQ-009; OD-09 |
| Key ceremony incomplete | Decision cannot open | REQ-015 |
| Verifier finds a mismatch | Result labelled “not verified”, naming the failed check | REQ-016 |
| Checkpoints inconsistent | Publication halts; monitors compare; procedure per QV-12 | REQ-021 |
| Manifest signing key compromised | New decisions frozen; compromise disclosed; re-signing per OD-14 | OD-14 |
| Cryptographic library vulnerability | Affected decisions halted; pinned update after review; vectors rerun | REQ-013 |
| Member loses credential | No recovery by default; options per OD-18 | OD-18 |

## 13. Dependencies and interfaces

- **Upstream:** QV-03 (rule set, cancel and dispute policy), QV-04 (eligibility and recovery), QV-06 (retention and visibility), QV-07 (adversary scope).
- **Downstream:** QV-05 (protocol choice), QV-08 (components, separation, hosting), QV-09 (formats), QV-11 (release gates), QV-17–QV-19 (credential, federation, and delegation modules reuse the nullifier and credential concepts).
- **External:** reviewed cryptographic implementations (none selected; licence undecided per README); external reviewers (not yet identified); hosting provider (QV-08).
- **API, event, and schema contracts:** manifest, ballot envelope, proofs, nullifier, checkpoint, decryption share, and tally evidence. No formats are defined yet. QV-09 defines them under REQ-011 and OD-16.
- **Versioning and compatibility:** every structure carries a protocol version. A breaking change needs a new version and a decision-log entry (QV-15).
- **Failure and retry behavior:** §12.

## 14. Requirements

These requirements apply to any design that is adopted. They remain candidate until the open decisions in §21 close. No test exists yet; each acceptance criterion is a plan.

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-16-REQ-001 | The system shall publish a signed election manifest (rules, ballot, method, cutoff, open/close, disclosure rule) before a decision opens, and shall bind every ballot, proof, and tally artifact to its hash. | Must | A verifier rejects a manifest with one changed byte. A ballot citing another manifest hash is rejected in test. | Unit test; verifier vectors; review |
| QV-16-REQ-002 | The system shall freeze the manifest at opening. Later changes shall be refused, or made only by a signed, visible cancel-and-restart (OD-20). | Must | A rule-change request after opening returns an error and writes nothing. A restart links to the cancelled manifest. | Integration test; QV-03 review |
| QV-16-REQ-003 | The client shall encrypt each selection before submission. No plaintext choice shall reach or be stored by eligibility or ballot services. | Must | Network capture in test shows no plaintext choice. API schemas have no plaintext-choice field. Store dump contains none. | Security/privacy test; code and schema review |
| QV-16-REQ-004 | The ballot service shall reject any ballot whose validity proof, manifest reference, or encoding fails to verify, and shall store nothing for it. | Must | 100% of invalid and malformed vectors are rejected. None is stored or published. | Negative vectors; fuzzing |
| QV-16-REQ-005 | The system shall accept at most one ballot per eligible credential per decision, using a decision-scoped nullifier. | Must | A second submission is rejected. The same credential in two decisions yields different nullifiers. No nullifier equals a stable member ID in fixtures. | Integration test; independent cryptographic review (OD-05) |
| QV-16-REQ-006 | The public record shall not contain the roster, a legal identity, a stable account ID, or any field pairing a ciphertext with a participant identifier. The eligibility check shall not reveal which roster entry matched. | Must | Schema review. Automated scan of a generated record fixture finds none of these field classes or roster indexes. | Review; automated scan |
| QV-16-REQ-007 | Ballot submission logs shall omit account IDs and client network addresses, and shall keep timestamps only at the granularity set by OD-07. | Must | Log-sample inspection finds no account ID or address. Log schema test passes. | Operational test; review |
| QV-16-REQ-008 | Tally decryption shall require the threshold of guardians set in the manifest (OD-09). No tally shall be released with fewer valid shares. | Must | With t-1 valid shares no decryption occurs. With t valid shares, the aggregate and its proofs verify. | Unit and integration tests; review |
| QV-16-REQ-009 | The tally shall decrypt only aggregates. Decryption shares and the aggregate shall carry verifiable proofs. No per-ballot decryption path shall exist. | Must | The verifier accepts valid shares and rejects one altered share. Code review finds no per-ballot decryption. | Tests; code review |
| QV-16-REQ-010 | The system shall provide a standalone, open-source verifier that checks manifest hash and signatures, ballot proofs, inclusion, checkpoint consistency, and tally against published rules, without the main application. | Must | The verifier passes published vectors. It detects an altered manifest, a dropped ballot, an altered tally, and an altered checkpoint. | Vectors; independent implementation; review |
| QV-16-REQ-011 | Every signed, hashed, or proved structure shall carry a protocol version and a decision-scoped domain tag, and shall use a specified canonical encoding. | Must | A message from decision A is rejected in decision B. Unversioned or non-canonical input is rejected. Two independent parsers agree on vectors. | Specification review; vectors; fuzzing |
| QV-16-REQ-012 | Security values (keys, nonces, credential secrets, proof randomness) shall come only from an OS or browser CSPRNG. None shall derive from user input or timestamps. | Must | Code review finds no other source. Static check flags non-CSPRNG calls [planned]. | Code review; static analysis |
| QV-16-REQ-013 | The system shall use only reviewed, pinned cryptographic implementations and shall contain no custom primitives. | Must | The lock file pins exact versions. The build fails on an unpinned cryptographic dependency [planned]. Review confirms no custom primitives. | Review; CI check |
| QV-16-REQ-014 | Before submission, the client shall show the human-readable ballot and the notice in §8. The notice shall state whether a receipt can be used to prove a choice (OD-12). | Must | Each §8 item appears in the notice text. Usability test confirms comprehension goals. | Content review; usability test (QV-13) |
| QV-16-REQ-015 | A decision shall not open until the manifest is signed, the roster commitment is published, and the key ceremony is complete and verified. | Must | Opening with any missing step is refused in test. | Integration test |
| QV-16-REQ-016 | If any verification fails, the result shall show “not verified” and name the failed check. No result shall show “valid” in that state. | Must | A tampered record shows “not verified” with the check named. No output reads “valid”. | Test; UX review |
| QV-16-REQ-017 | Organizer, administrator, and operator accounts shall use phishing-resistant or multi-factor authentication (OD-15). Password-only login shall not reach admin roles. | Must | Password-only login to an admin role is refused in test. | Security test |
| QV-16-REQ-018 | All client-to-service and service-to-service traffic shall be encrypted in transit. Plaintext listeners shall not be deployed. | Must | An endpoint scan finds no plaintext listener. Configuration matches the reviewed baseline named in QV-08. | Configuration scan; deployment test |
| QV-16-REQ-019 | Identity, eligibility, ballot, and operations data shall be held in separate stores with separate access credentials. | Should | An operator with ballot-store credentials cannot read identity tables in test. The access matrix is reviewed. | Security test; review |
| QV-16-REQ-020 | Each user-facing privacy or security claim shall have a claim-ledger entry linked to its assumptions, evidence, and limits. A release shall be blocked if any claim lacks an entry. | Must | The ledger exists. The release checklist includes the check. A sampled claim traces to evidence. | Document review (release gate) |
| QV-16-REQ-021 | The system shall publish manifest hashes, checkpoints, and tally evidence so that changes to earlier entries are detectable by independent monitors. | Should (Must if the public record is used, OD-06) | A monitor comparing two checkpoints detects a modified earlier entry in test. | Test; independent monitor |
| QV-16-REQ-022 | The system shall publish a retention and deletion schedule for each data class in §9 before any live pilot. | Must | Schedule is published. Deletion job is tested in staging. | Review (QV-06); operational test |
| QV-16-REQ-023 | Ballot submission shall be idempotent: a client retry shall not create a second recorded ballot for the same credential and decision. | Must | A retry after a dropped connection results in one accepted ballot. | Integration and failure test |

## 15. Implementation rules

- Do not design new cryptographic primitives or write bespoke cryptographic algorithms.
- Use a reviewed, actively maintained implementation and pin its version.
- Specify encodings, domains, and protocol versioning to prevent cross-election replay and ambiguous parsing.
- Use OS/browser cryptographically secure randomness; never seed security values from user input or timestamps.
- Separate identity, eligibility, ballot, and operations data; document any joining keys and access paths.
- Make election configuration immutable after open, or define a cancel/restart process with visible signed history.
- Publish interoperable test vectors and a standalone verifier.
- Require independent protocol review and implementation audit before claims of strong ballot secrecy or full verifiability.
- Keep a claim ledger linking each user-facing claim to assumptions, verification evidence, and known limits.

## 16. Verification

- **Test vectors:** publish vectors for every record type: manifest, ballot envelope, validity proof, nullifier, checkpoint, decryption share, and tally evidence. An independent implementation must reproduce them. Whether existing projects' vectors can be reused, and under what licence, is [UNVERIFIED].
- **Negative vectors:** one for each mutation class in REQ-010, and each rejection case in REQ-004, REQ-005, and REQ-011.
- **Property and fuzz tests:** ballot validity, nullifier uniqueness, threshold behavior, and parser fuzzing of manifest, ballot, and verifier inputs.
- **Protocol review:** external cryptographers review the specification before any live use. Expert review required.
- **Implementation audit:** independent audit of client cryptographic code, ballot service, guardian tools, and verifier. Auditors must not have written the code they review.
- **Usability tests:** comprehension of the notice, the receipt, and the “not verified” state, per QV-13.
- **Operational tests:** store separation (REQ-019), log minimization (REQ-007), and ceremony gating (REQ-015), tested in staging.
- **Release-blocking criteria:**
  - Every open decision in §21 is closed, or accepted by the project owner and recorded in the decision log.
  - Protocol review is complete, with findings resolved or accepted.
  - Implementation audit has no unresolved blocking findings.
  - The verifier passes all vectors.
  - The claim ledger is complete (REQ-020).
  - Recovery and key-loss exercises are complete (QV-12).
  - The retention schedule is published (REQ-022).

## 17. Suggested delivery stages

1. **Specification:** user research, threat model, policy model, and protocol comparison; no real ballots.
2. **Usability prototype:** dummy votes and simulated records only; test comprehension and accessibility.
3. **Protocol prototype:** use a known scheme and test vectors in a closed environment; independent review before any live use.
4. **Low-stakes pilot:** voluntary internal decisions only, with clear limits and a documented fallback.
5. **Broader deployment:** only after security review, recovery exercises, operational readiness, and release gates are met.

## 18. Operations, UX, and accessibility

- **Configuration:** manifest fields (rules, method, threshold, disclosure rule, cutoff) are set before opening and frozen (REQ-002).
- **Monitoring and audit:** service health only. No per-member behavior analytics, and no joins of login, address, timestamp, and submission (REQ-007).
- **Backup, recovery, and deletion:** guardian and signing-key backup and retirement (OD-09, OD-14); data deletion per OD-17 and REQ-022.
- **Incident response:** key compromise, log equivocation, and verifier-mismatch procedures (§12). Owned by QV-12.
- **UX and accessibility:** notice and receipt design (REQ-014, OD-12); keyboard and screen-reader support, low-bandwidth use, and translated notices per QV-13. Proof sizes and client cost are [UNVERIFIED]; measure them in the prototype stages (§17).

## 19. Primary references

- Belenios, [protocol specification](https://www.belenios.org/specification.pdf) and [security documentation index](https://www.belenios.org/documentation.html)
- Helios, [system overview](https://www.iacr.org/elections/eVoting/about-helios.html)
- ElectionGuard, [design specification](https://electionguard.vote/spec/) and [verifiability concepts](https://electionguard.vote/concepts/Verifiability/)
- Semaphore, [proofs](https://docs.semaphore.pse.dev/guides/proofs) and [protocol overview](https://docs.semaphore.pse.dev/)
- W3C, [Data Integrity BBS Cryptosuites v1.0](https://www.w3.org/TR/vc-di-bbs/)
- IETF RFC Editor, [RFC 9162 — Certificate Transparency v2.0](https://www.rfc-editor.org/rfc/rfc9162.html)
- NIST, [FIPS 186-5 — Digital Signature Standard](https://csrc.nist.gov/pubs/fips/186-5/final) and [SP 800-57 Part 1 Rev. 5 — Key Management](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)

References are starting points for review, not endorsements or automatic adoption. Check the current version, status, assumptions, implementation maturity, and licensing during protocol selection. Links and standard status were not checked in this drafting pass [UNVERIFIED].

## 20. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Not reviewed. |
| Cryptography reviewer | Pending | — | Role not yet named. Expert review required. |
| Security and privacy reviewer | Pending | — | Role not yet named. |

Drafting change, 2026-11-18: added objective, actors, trust boundaries, adversaries, properties, data, assumptions, abuse and failure cases, requirements, verification, and open decisions. This is not a review. Changes to approved requirements must be recorded in the decision log and traced to affected modules and tests.

## 21. Open decisions

No choice in this table has been made. Every item requires expert review before a choice is made. Owners are roles; the project owner assigns named people.

| ID | Question | Candidates and trade-offs | Needed to decide | Owner |
|---|---|---|---|---|
| OD-01 | Which existing protocol best fits the first voting methods and threat model? | (a) Additive homomorphic threshold tally, as in ElectionGuard-style designs: simple tally, limited to additive methods. (b) Mixnet tally, as in Belenios-style designs: wider ballot types, more trustee and proof complexity. (c) Adopt an existing system as-is: fastest, but fit and licence unchecked. Expert review required. | QV-07 threat model; QV-02 method list; protocol review | Project owner; cryptography reviewer |
| OD-02 | Is the group roster public, private, or only committed by a root hash? | (a) Public list: transparent, reveals participation. (b) Root only: private, but public completeness checks are limited. (c) Root plus registrar-held list with per-member audit: more checks, more trust in the registrar. Expert review required. | QV-03 policy; QV-06 analysis | Project owner; privacy reviewer |
| OD-03 | Who issues credentials, and can the issuer and ballot operator collude to link participation? | (a) Registrar issues one-use credentials. (b) Blind issuance, so the issuer cannot link credentials to members; more complexity. (c) Member derives credential from the committed roster; no issuer at vote time. Each leaves a different collusion surface. Expert review required. | Collusion model (QV-07); QV-04 issuance design | Security reviewer; QV-04 owner |
| OD-04 | Are members required to use a pseudonymous credential, or can groups choose other modes? | (a) Real-name eligibility proof. (b) Per-group pseudonym. (c) Per-decision credential. (d) Group chooses mode. Trade-off: member control against administrative complexity and clear notice of each mode. Expert review required for any mode using proofs. | QV-03 and QV-04 decisions; claim review | Project owner |
| OD-05 | What is the nullifier construction and scope? | (a) Nullifier derived from credential secret and decision ID: simple, but can link across decisions if mis-scoped. (b) Per-decision one-use token issued in advance: less linkage, needs issuance. (c) Epoch-scoped nullifier. Expert review required. | OD-03 decided; cross-decision linkage analysis | Cryptography reviewer |
| OD-06 | Is a public bulletin board necessary, and who runs independent witnesses? | (a) No public log: only signed manifest and tally. (b) Log run by QuietVote: simple, operator can equivocate. (c) Multi-witness log with independent monitors: detects equivocation, needs witnesses. Published ciphertexts are permanent. Expert review required. | QV-08 hosting; named independent monitors | Project owner; security reviewer |
| OD-07 | How will QuietVote prevent timing correlation between identity verification and ballot submission? | (a) Fixed submission windows with batching. (b) Delayed publication of accepted ballots. (c) Separate login from submission. (d) Accept and disclose the risk. Each costs latency or usability; batching does not remove correlation in small groups. Expert review required. | QV-07 metadata scope; log retention decision | Security reviewer; privacy reviewer |
| OD-08 | Which voting methods are safe to claim for the MVP? | (a) Yes/no. (b) Single choice. (c) Approval. (d) Ranked, deferred. Additive methods fit the homomorphic tally; ranked needs a separate protocol. Expert review required for each tally. | QV-02 MVP boundary; OD-01 | Project owner |
| OD-09 | What trustee threshold and guardian independence are acceptable? | (a) n-of-n: any unavailable guardian blocks the tally. (b) t-of-n with t above a majority: more availability, same confidentiality. (c) Guardians appointed by the organizer: weaker independence. Lower thresholds weaken confidentiality. Expert review required. | Group size distribution; QV-03 guardian selection rules | Project owner |
| OD-10 | Which client platform and cryptographic libraries meet review and accessibility needs? | (a) Browser client with a reviewed library. (b) Native app. (c) Both. Trade-off: reach and low-bandwidth use against device-compromise surface and key storage limits. Library maturity and licence are [UNVERIFIED]. Expert review required. | QV-10 and QV-13 requirements; library review; licence decision (README) | Project owner; cryptography reviewer |
| OD-11 | What exact adversaries are outside the first release's protection? | (a) Exclude coercion, device compromise, and collusion at or above threshold. (b) Also exclude metadata adversaries. Wider exclusions narrow what can be claimed. Expert review required for the claim wording. | QV-07 completed | Project owner |
| OD-12 | Can a receipt prove a choice to a coercer, and what does the member receive? | (a) Acknowledgement only. (b) Receipt showing an inclusion proof for the ciphertext; whether it reveals a choice depends on its content. (c) Re-voting allowed; adds complexity and metadata. Expert review required. | OD-06; QV-10 UX test | Project owner; cryptography reviewer |
| OD-13 | Which proof systems are used for validity and membership? | (a) Sigma-protocol-style proofs made non-interactive. (b) General-purpose zero-knowledge systems, with or without trusted setup. Trade-off: setup assumptions, proof size, verifier cost [UNVERIFIED], and audit maturity. Expert review required. | OD-01; prototype-stage performance budget | Cryptography reviewer |
| OD-14 | How are signing and guardian keys managed? | (a) Software keys in a managed key service. (b) Hardware security module for the manifest signing key. (c) Multi-party signing key. Trade-off: operating cost, custody concentration, and loss or compromise recovery. Expert review required. | QV-08 hosting; QV-12 operations | Security reviewer; operations owner |
| OD-15 | Which authentication method do organizer and admin accounts use? | (a) Passkeys (WebAuthn). (b) TOTP. (c) Both, with recovery. Trade-off: phishing resistance against lost-device handling. Expert review required. | QV-12 recovery design | Security reviewer |
| OD-16 | What canonical encoding and serialization are used? | (a) Deterministic binary encoding fixed in the spec. (b) Deterministic text encoding. (c) General serialization with strict canonicalization rules. Trade-off: parse-ambiguity risk against tooling and interoperability. Expert review required. | QV-09 contracts | Cryptography reviewer; QV-09 owner |
| OD-17 | What are the retention and deletion rules for each data class? | (a) Retain everything. (b) Retain the public record permanently and delete identity data after a set period. (c) Group chooses the period. Trade-off: audit against erasure; published records cannot be recalled. Expert review required. | QV-06 analysis; group policy | Privacy reviewer; project owner |
| OD-18 | How is a lost credential handled? | (a) No recovery; member excluded. (b) Registrar re-issues; can link to earlier participation unless designed otherwise. (c) Guardian-assisted recovery (see QV-17). Trade-off: access against linkage and fraud. Expert review required. | QV-04 and QV-17 decisions | QV-04 owner; security reviewer |
| OD-19 | What disclosure rule applies to small groups? | (a) Minimum group size before publishing a tally. (b) Minimum count per option. (c) Publish only to members. Thresholds rarely guarantee secrecy. Expert review required. | QV-06 analysis; group policy | Project owner; privacy reviewer |
| OD-20 | How are rule changes and cancellations handled after opening? | (a) No change after opening. (b) Cancel and restart with signed history. (c) Amend via a versioned manifest. Trade-off: flexibility against integrity. Expert review required. | QV-03 dispute policy | Project owner |
