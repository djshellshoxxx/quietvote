# Glossary

Plain-language definitions. Formal definitions are in the specs.

- **Aggregate tally:** the combined total of all counted ballots, which is the only thing trustees decrypt.
- **Ballot:** an encrypted, proven and signed set of choices for one voter.
- **Benaloh audit:** an optional check that a ballot encrypts the choices the voter made. Audited ballots are not counted.
- **Bulletin board (log):** the public append-only record of election data. See [[Bulletin Board Summary]].
- **Cast-as-intended:** the ballot encrypts what the voter chose.
- **Recorded-as-cast:** the ballot appears in the log as submitted.
- **Tallied-as-recorded:** the tally is computed from the recorded ballots.
- **Chaum–Pedersen / CDS proofs:** zero-knowledge proofs used for well-formed ballots and correct decryption.
- **Distributed key generation (DKG):** how trustees create a shared key without a single dealer.
- **Election manifest:** the signed document that binds rules, roll, trustees and the election key.
- **ElGamal (exponential):** the encryption scheme used so that ballots can be added together.
- **Eligibility roll:** the list of voter public keys allowed to vote, committed in the manifest.
- **Inclusion proof:** proof that a specific entry is in the log.
- **Merkle log:** a tamper-evident, append-only log structure.
- **Non-claim:** something QuietVote explicitly does not promise. See [[Privacy and Guarantees]].
- **Phase 1 / 2 / 3:** staged identity and privacy designs. See [[What is QuietVote]].
- **Receipt:** proof given to a voter that their ballot was recorded.
- **Revoting:** casting a new ballot; the latest valid one counts.
- **Signed tree head (STH):** a signed snapshot of the log's state.
- **Steward:** an organizer who manages rules, the roll and elections.
- **Threshold (t of n):** the number of trustees needed to decrypt the tally.
- **Trustee:** a person who holds one key share.
- **Verifier:** software that checks an election independently.
- **Witness / mirror:** third parties that co-sign log state or copy it, to detect equivocation.
- **ADR:** architecture decision record. Recorded in the [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md).
- **DCO:** Developer Certificate of Origin, a sign-off on each commit. See [[Contributing]].
