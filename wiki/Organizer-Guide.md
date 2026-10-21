# Organizer Guide

> **Draft – unaudited software.** Organizers (stewards) carry real responsibilities. Read this with [[Privacy and Guarantees]].

Stewards define the group's rules, manage the roll, and run each decision. The steward role is described in [spec 03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md) section 12 and [spec 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md).

## Your responsibilities

- **Keep the roll correct.** QuietVote checks that a registered key signed a ballot. It cannot check that a key belongs to the right, or only one, real person. Stewards are trusted for this ([spec 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 3.4).
- **Use at least two stewards.** One steward is a single point of failure. The system shows a warning when there is only one.
- **Choose trustees carefully.** The threshold decides how many trustees must cooperate to decrypt the tally. Guidance: 3 trustees with threshold 2 for groups up to 50 people; 5 with threshold 3 for 50 to 500. See [spec 17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md) section 5.
- **Publish rules before opening a vote.** Rule changes apply only to elections created after they are final ([spec 02](https://github.com/djshellshoxxx/quietvote/blob/main/docs/02-product-requirements.md) REQ-005).

## Running a decision

1. Create the group and publish its rules, using a policy template if one fits ([spec 03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md) section 10).
2. Invite and enroll members.
3. Proposals move through draft, review, ready and attached to an election. See the state machine in [spec 03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md) section 5.
4. Trustees run the key ceremony ([[Trustee Guide]]).
5. Open the election, let it close, then publish the result. Anyone can verify it ([[Auditor and Verifier Guide]]).

## Voting methods

Version 1 supports yes/no, single choice, approval and k-of-n selection, with quorum and thresholds, and tie-break rules declared in advance. Ranked choice, weighting and delegation are later phases. Write-ins are not supported in the MVP. See [spec 20](https://github.com/djshellshoxxx/quietvote/blob/main/docs/20-voting-methods.md) and [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md) QV-ADR-006.

## Escalations

Disputes, recounts and emergency halts are covered in [spec 03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md) sections 8 and 9.
