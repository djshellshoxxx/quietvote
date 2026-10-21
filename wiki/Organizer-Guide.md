# Organizer Guide

> **Draft – unaudited software, not for real elections yet.** Stewards (organizers) have real duties. Read this together with [[Privacy and Guarantees]].

Stewards set the group's rules, keep the roll (the list of who can vote), and run each vote. See spec [03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md) section 12 and spec [04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md).

## Your jobs

- **Keep the roll correct.** QuietVote checks that a registered key signed a ballot. It cannot check that a key belongs to one real, right person. Stewards must check this (spec 04 section 3.4).
- **Have at least two stewards.** One steward is a single point of failure. The system shows a warning if there is only one.
- **Pick trustees carefully.** The threshold sets how many trustees must work together to open the total. Suggested: 3 trustees with threshold 2 for groups up to 50 people. Use 5 trustees with threshold 3 for groups of 50 to 500. See spec [17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md) section 5.
- **Publish the rules before a vote opens.** Rule changes only apply to votes created after the rules are final (spec [02](https://github.com/djshellshoxxx/quietvote/blob/main/docs/02-product-requirements.md) REQ-005).

## Running a vote

1. Create the group and publish its rules. Use a template if one fits (spec 03 section 10).
2. Invite and sign up members.
3. A proposal moves through four stages: draft, review, ready, and attached to a vote. See the diagram in spec 03 section 5.
4. Trustees run the key ceremony. See the [[Trustee Guide]].
5. Open the vote, let it close, then publish the result. Anyone can check it. See the [[Auditor and Verifier Guide]].

## Types of vote

Version 1 supports:

- Yes or no
- Pick one
- Approval (pick every option you accept)
- Pick *k* out of *n* options

Quorum, thresholds and tie-break rules must be set in advance. Ranked choice, weighted votes and delegation come in later versions. Write-in votes are not supported in the first version. See spec [20](https://github.com/djshellshoxxx/quietvote/blob/main/docs/20-voting-methods.md) and decision log QV-ADR-006.

## When things go wrong

Disputes, recounts and emergency stops are covered in spec 03 sections 8 and 9.
