# Glossary

Simple meanings for hard words. Formal definitions are in the specs.

- **Aggregate tally (total):** the combined count of all counted ballots. Trustees open only this.
- **ADR:** architecture decision record, a short note about one design choice. See the [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md).
- **Ballot:** one voter's choices, locked, proven and signed.
- **Benaloh audit:** an optional check that a locked ballot holds the choices you picked. Audited ballots are not counted.
- **Bulletin board (log):** a public list of election data that only grows. See [[Bulletin Board Summary]].
- **Cast-as-intended:** the locked ballot holds the choice the voter made.
- **Recorded-as-cast:** the ballot appears in the log as it was sent.
- **Tallied-as-recorded:** the total is counted from the ballots in the log.
- **Chaum–Pedersen / CDS proofs:** math proofs. They show that a ballot is filled in correctly, or that a decryption is correct, without revealing the secret.
- **DCO:** Developer Certificate of Origin, a sign-off line on each code change. See [[Contributing]].
- **Distributed key generation (DKG):** how trustees make a shared key together, so no single person makes it.
- **Election manifest:** a signed document that ties together the rules, the roll, the trustees and the public key.
- **ElGamal (exponential):** the lock method used. It lets locked ballots be added together.
- **Eligibility roll:** the list of voter keys allowed to vote.
- **Inclusion proof:** a proof that one entry is in the log.
- **Merkle log:** a list where any change or removal can be spotted.
- **Non-claim:** something QuietVote does not promise. See [[Privacy and Guarantees]].
- **Phase 1 / 2 / 3:** the three stages of the identity and privacy design. Simpler name: versions 1, 2 and 3. See [[What is QuietVote]].
- **Quorum:** the minimum number of people who must take part for a vote to count.
- **Receipt:** proof given to a voter that their ballot was recorded.
- **Revoting:** voting again. The latest valid ballot counts.
- **Signed tree head (STH):** a signed snapshot of the log at one moment.
- **Steward:** an organizer who manages the rules, the roll and the votes.
- **Threshold (t of n):** how many trustees (*t*) must work together, out of all trustees (*n*), to open the total.
- **Trustee:** a person who holds one piece of the key.
- **Verifier (checker):** a program that checks a vote on its own.
- **Witness / mirror:** outside parties that sign or copy the log's state. This helps catch a server that shows different versions of the log to different people.
