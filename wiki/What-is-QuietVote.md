# What is QuietVote

> **Draft – unaudited software.** Not for real elections.

## The problem

Group decisions usually go wrong one of three ways:

1. **Open polls** (chat reactions, spreadsheets) reveal how people voted and are easy to stuff.
2. **Vendor "secret ballot" tools** ask you to trust the vendor, who can see, change or drop ballots.
3. **Research-grade verifiable voting** is powerful but heavy to run for a recurring internal decision.

QuietVote aims for a secret ballot that a group can check without trusting one vendor, and that a technically capable volunteer can deploy.

## How it works, in brief

- The group publishes its **rules** and a **voter roll** before a vote opens.
- Members cast **encrypted ballots**. Each ballot comes with proofs that it is well formed and signed by an eligible voter key.
- Ballots go on an **append-only public log**. Any member can get a receipt and check that their ballot was recorded.
- A group of **trustees** jointly holds the decryption key. Only the combined **tally** can be decrypted, so no single party can read individual choices.
- Anyone can recompute the tally from public data with an independent verifier.

Details: [[Cryptographic Protocol Summary]] and [[Bulletin Board Summary]] (developer view), and spec [05 Ballot protocol](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md).

## Scope

- **Intended for:** internal decisions in voluntary organizations (first target: online collectives and open-source foundations with about 30 to 2,000 voters).
- **Not for:** public governmental elections, legally binding corporate shareholder votes, or settings that need certification. See spec [00 Charter](https://github.com/djshellshoxxx/quietvote/blob/main/docs/00-project-charter.md) section 7 and non-claim N-9 in [[Privacy and Guarantees]].

## Phases (summary)

| Phase | Participation | Notes |
|---|---|---|
| 1 (planned MVP) | Public: the log shows who voted, not how | Secret choices, verifiable tally |
| 2 (later) | Unlinkable ballots via single-use blind-signed tokens | Spec 04 section 9 |
| 3 (research) | Registrar-free anonymous membership | Spec 04 section 10 |

Phase details: spec [04 Identity and eligibility](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md).
