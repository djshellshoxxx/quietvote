# Voter Guide

> **Draft – unaudited software.** Steps below are a plain-language outline. Exact screens may change; see the linked specs.

## Before the vote

1. **Accept your invitation.** Your group's steward invites you. Enrollment links a **voter key** (a signing key on your device) to your place on the group's roll. See [spec 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 5.
2. **Back up your key.** Your key is what proves you are eligible. Losing it can cost you your vote unless recovery is available. Recovery and rotation options are in [spec 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 6.
3. **Read the rules.** Each decision has its own rules, quorum and threshold, which are published before the vote opens. See [spec 03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md).

## Casting a ballot

1. Open the ballot during the voting window and make your choices.
2. Your device encrypts the choices, creates proofs, and signs the ballot. Your choices are not sent in readable form.
3. You receive a **receipt**. Keep it.
4. **Revoting is allowed.** The latest valid ballot from your key is the one counted. Note that the log still shows how many times your key voted.

## After the vote

- Use your receipt to check that your ballot was recorded. This is optional but recommended.
- Optionally **audit** a ballot (the Benaloh check) from a second device to confirm it encrypts what you chose. How an audited ballot is handled is defined in [spec 16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md) and [spec 19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md).

## Good practice

- Vote on a device you trust. A compromised device can change or reveal your choice, and QuietVote cannot detect that.
- Assume that **participation is visible** in the first phase: others can see that your key voted, not what it chose.
- Do not rely on QuietVote if someone can force you to show how you voted. Coercion resistance is not provided (see [[Privacy and Guarantees]]).
