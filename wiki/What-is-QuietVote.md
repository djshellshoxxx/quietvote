# What is QuietVote?

> **Draft – unaudited software, not for real elections yet.**

## The problem

Group votes often go wrong in three ways.

1. **Open polls** (chat reactions, shared spreadsheets) show how each person voted. They are also easy to fake with extra votes.
2. **Vendor "secret ballot" tools** ask you to trust the company. The company can see, change or delete ballots.
3. **Research-grade verifiable voting** is very strong, but it is heavy to run for a regular group decision.

QuietVote aims for a secret ballot that a group can check without trusting one company. A volunteer with some technical skill should be able to set it up.

## How it works, in brief

- The group publishes its **rules** and its **roll** (the list of who can vote) before a vote opens.
- Members send **sealed ballots**. A sealed ballot is a vote locked up with math. It comes with proofs that it is filled in correctly and signed by an allowed voter key.
- Ballots go on a **public log**. The log only grows, and anyone can read it. Each voter gets a receipt to check that their ballot is in it.
- A group of **trustees** shares the key that opens the total. Only the **total** (the tally) can be opened. No single party can read one person's choice.
- Anyone can count again from the public data, using an independent checker.

Details for developers: [[Cryptographic Protocol Summary]] and [[Bulletin Board Summary]]. The full design is in spec [05 Ballot protocol](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md).

## Scope

- **Meant for:** internal decisions in voluntary groups. The first target is online collectives and open-source foundations with about 30 to 2,000 voters.
- **Not meant for:** public government elections, legally binding company shareholder votes, or any setting that needs official certification. See spec [00 Charter](https://github.com/djshellshoxxx/quietvote/blob/main/docs/00-project-charter.md) section 7 and non-claim N-9 in [[Privacy and Guarantees]].

## Versions (simple)

| Version | Who can see who voted? | Notes |
|---|---|---|
| 1 (planned first version) | Others can see **that** you voted, not **how** | Choices stay secret. The count can be checked. |
| 2 (later) | No. Ballots can not be linked to voters | Uses single-use tokens. See spec [04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 9. |
| 3 (research) | No. Anonymous membership | No central list-keeper. See spec 04 section 10. |

More on versions: spec [04 Identity and eligibility](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md).
