# QV-16 — Cryptography and Technical Design

**Module ID:** `ballot-engine` / cross-cutting  
**Status:** Framework with candidate architecture; no protocol or implementation choice is approved  
**Purpose:** Explain how cryptography and supporting technology could make private, auditable group decisions possible, and identify what must be decided and reviewed before implementation.

## 1. What “crypto” means in QuietVote

QuietVote needs **cryptography**: encryption, digital signatures, zero-knowledge proofs, and verifiable data structures. It does not inherently need a cryptocurrency, token, smart contract, or public blockchain.

The core product should not require users to buy or hold a token. A blockchain is not a substitute for a correct voter roster, secure client, sound voting protocol, or good governance. Public immutable ledgers can permanently expose timing and participation metadata. Any distributed ledger or token should require a specific, documented benefit and a separate threat/privacy review.

The aim is to reduce the amount any single party must be trusted with, while clearly documenting what trust remains.

## 2. Candidate system model

This is a design direction to investigate, not a final architecture.

1. **Group defines and freezes the decision.** The organizer selects the rule set, ballot, voting method, eligibility cutoff, opening/closing conditions, and disclosure policy. The exact election manifest is versioned and digitally signed.
2. **Group establishes eligibility.** A group-designated registrar confirms the eligible set. The service commits to the frozen roster, for example with a Merkle-tree root, or issues one-use credentials. A proof can establish that a participant belongs to the committed set without publishing the roster. Cryptography cannot establish that the group’s roster is fair, complete, or politically legitimate.
3. **Member proves eligibility.** A member uses a private credential secret to prove membership and produce a decision-scoped nullifier. The nullifier lets verifiers reject a second ballot for the same decision without using a stable public member ID. It must be scoped so that activity across different decisions cannot be linked by default.
4. **Client constructs and encrypts the ballot.** A reviewed client encodes the choice, encrypts it to a per-decision election key, and produces a proof that the ballot satisfies the published rules (for example, selection limits). The client presents the human-readable ballot and privacy notice before submission.
5. **System accepts and records the ballot.** Eligibility proof, nullifier, encrypted ballot, and validity proofs are checked. The accepted record is added to an auditable bulletin board. The public record must not pair a legal identity or stable account ID with ballot ciphertext.
6. **Independent parties check the record.** Participants and observers can verify signatures, ballot validity, inclusion in the record, and consistency of published checkpoints using an independently implemented verifier.
7. **Tally is computed.** For supported additive methods, encrypted selections may be combined without decrypting each ballot. A threshold of separately operated trustees then decrypts only the aggregate and supplies verifiable decryption proofs. Other ballot methods may require a mixnet or a different protocol.
8. **Result and evidence are published.** The group receives the result, the manifest version, tally evidence, and procedures for challenges/recounts. The verifier checks that the evidence matches the published rules.

## 3. Candidate cryptographic components

| Need | Candidate technique | How QuietVote could use it | Important limit / decision |
|---|---|---|---|
| Authenticate configuration and actions | Digital signatures | Sign the election manifest, rule changes, trustee contributions, tally, and transparency checkpoints | A signature proves integrity and key attribution; it does not prove the signer’s action was fair or authorized |
| Keep a vote secret while tallying | Public-key ballot encryption | Encrypt each selection before it leaves the participant's client | Client compromise, coercion, side channels, or a bad protocol can still reveal or alter choices |
| Prove ballot validity without revealing choice | Zero-knowledge proof | Prove encrypted choices satisfy the ballot's constraints (e.g., a selection is allowed and within the maximum) | Proof systems are easy to implement incorrectly; use a reviewed scheme and libraries with published third-party audit reports |
| Prove group membership privately | Anonymous credential or ZK membership proof | Show eligibility in the frozen member set without publishing the member's identity | The membership issuer/registrar still decides who is in the set; credential revocation and recovery are hard |
| Enforce one vote per member per decision | Decision-scoped nullifier / one-use credential | Reject repeated submissions while avoiding a globally stable voter identifier | A wrongly scoped or deterministic identifier can make votes linkable across decisions |
| Aggregate compatible ballots | Homomorphic encryption | Combine ciphertexts for additive tallies, then decrypt only the aggregate | Fit depends on voting method; this is not a general ranked-choice tally |
| Support more complex ballot types | Verifiable mixnet or another reviewed protocol | Shuffle and re-randomize encrypted ballots before tallying to break order/linkage | Additional complexity, trustee assumptions, and protocol-specific verification; separate design and audit needed |
| Make history tamper-evident | Append-only Merkle log with signed checkpoints | Publish decision manifests and ballot evidence with inclusion/consistency proofs | A log can equivocate by showing different views; independent monitors/witnesses must compare checkpoints |
| Protect data in transit | TLS and secure transport configuration | Protect service communications against ordinary network interception and tampering | TLS does not hide endpoint identity from the service or all traffic metadata |
| Protect administrative accounts | Passkeys/WebAuthn or strong MFA | Harden organizer, administrator, and operator accounts | This secures the account; it does not make a ballot anonymous |
| Protect stored data | Encryption at rest and separated data stores | Reduce exposure from lost media/backups; separate identity, eligibility, ballots, and operations | Server-side encryption does not protect against a compromised running service or authorized operator |

### Candidate precedents to study

- **Helios and Belenios:** research/deployed examples of end-to-end verifiable online voting. Belenios 3.0 specifies encrypted ballots, zero-knowledge well-formedness proofs, signed ballots, and homomorphic or mixnet tally modes. Study their threat models and user verification steps; do not copy components without reviewing fit and licensing. <!-- claims-lint-ignore -->
- **ElectionGuard:** a published design and implementation ecosystem for encrypted selections, validity proofs, homomorphic aggregation, and verifiable decryption. Its stated operating assumptions and use cases must be checked against QuietVote's online, voluntary-group setting.
- **Semaphore:** a useful reference for the group-membership proof plus scope-specific nullifier pattern. It is not a complete election protocol and its examples often assume smart contracts; QuietVote must not inherit a blockchain requirement by default.
- **W3C BBS Data Integrity Cryptosuite:** a candidate standardization path for selective disclosure and unlinkable derived proofs. Its current W3C status and implementation maturity must be rechecked before selection.

## 4. Candidate ballot strategy by complexity

### First protocol to evaluate

Limit an initial high-assurance pilot to simple additive choices such as yes/no, single selection, or approval, if the research review confirms the protocol matches the intended trust model. Homomorphic tallying can add encrypted selections and decrypt the aggregate, avoiding disclosure of individual choices to tally trustees.

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

A key ceremony does not remove trust; it distributes it. An organization could choose trusted members as guardians, but they must be meaningfully independent.

## 5. How supporting technology fits

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

## 6. Privacy and security limits that must be explicit

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

## 7. Implementation rules

- Do not design new cryptographic primitives or write bespoke cryptographic algorithms.
- Use a reviewed, actively maintained implementation and pin its version.
- Specify encodings, domains, and protocol versioning to prevent cross-election replay and ambiguous parsing.
- Use OS/browser cryptographically secure randomness; never seed security values from user input or timestamps.
- Separate identity, eligibility, ballot, and operations data; document any joining keys and access paths.
- Make election configuration immutable after open, or define a cancel/restart process with visible signed history.
- Publish interoperable test vectors and a standalone verifier.
- Require independent protocol review and implementation audit before claims of strong ballot secrecy or full verifiability.
- Keep a claim ledger linking each user-facing claim to assumptions, verification evidence, and known limits.

## 8. Suggested delivery stages

1. **Specification:** user research, threat model, policy model, and protocol comparison; no real ballots.
2. **Usability prototype:** dummy votes and simulated records only; test comprehension and accessibility.
3. **Protocol prototype:** use a known scheme and test vectors in a closed environment; independent review before any live use.
4. **Low-stakes pilot:** voluntary internal decisions only, with clear limits and a documented fallback.
5. **Broader deployment:** only after security review, recovery exercises, operational readiness, and release gates are met.

## 9. Open decisions

- Which existing protocol best fits the first voting methods and threat model?
- Is the group roster public, private, or only committed by a root hash?
- Who issues credentials, and can issuer and ballot operator collude to link participation?
- Are members required to use a pseudonymous credential, or can groups choose other modes?
- Is a public bulletin board necessary, and who runs independent witnesses?
- How will QuietVote prevent timing correlation between identity verification and ballot submission?
- Which voting methods are safe to claim for the MVP?
- What trustee threshold and guardian independence are acceptable?
- Which client platform and cryptographic libraries meet review and accessibility needs?
- What exact adversaries are outside the first release's protection?

## 10. Primary references

- Belenios, [protocol specification](https://www.belenios.org/specification.pdf) and [security documentation index](https://www.belenios.org/documentation.html)
- Helios, [system overview](https://www.iacr.org/elections/eVoting/about-helios.html)
- ElectionGuard, [design specification](https://electionguard.vote/spec/) and [verifiability concepts](https://electionguard.vote/concepts/Verifiability/)
- Semaphore, [proofs](https://docs.semaphore.pse.dev/guides/proofs) and [protocol overview](https://docs.semaphore.pse.dev/)
- W3C, [Data Integrity BBS Cryptosuites v1.0](https://www.w3.org/TR/vc-di-bbs/)
- IETF RFC Editor, [RFC 9162 — Certificate Transparency v2.0](https://www.rfc-editor.org/rfc/rfc9162.html)
- NIST, [FIPS 186-5 — Digital Signature Standard](https://csrc.nist.gov/pubs/fips/186-5/final) and [SP 800-57 Part 1 Rev. 5 — Key Management](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)

References are starting points for review, not endorsements or automatic adoption. Check the current version, status, assumptions, implementation maturity, and licensing during protocol selection.
