# Voter Guide

> **Draft – unaudited software, not for real elections yet.** These steps are a simple outline. Screens may change. Check the linked specs for details.

## Before the vote

1. **Accept your invitation.** Your steward invites you. Joining links a **voter key** (a secret code on your device that proves you may vote) to your name on the roll. See spec [04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md) section 5.
2. **Back up your key.** Your key proves you may vote. If you lose it, you may lose your vote unless recovery is set up. See spec 04 section 6.
3. **Read the rules.** Each vote has its own rules. These include the **quorum** (the minimum number of people who must take part) and the **threshold** (how many votes must agree). The rules are published before the vote opens. See spec [03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md).

## Casting your ballot

1. Open the ballot while voting is open. Make your choices.
2. Your device locks your choices, adds proofs, and signs the ballot. Your choices are never sent in plain, readable form.
3. You get a **receipt**. Keep it.
4. **You can vote again.** The latest valid ballot from your key is the one counted. The log still shows how many times your key voted.

## After the vote

- Use your receipt to check that your ballot is in the log. This is optional, but recommended.
- You can optionally **audit** a ballot (a Benaloh check) from a second device. This checks that the locked ballot holds the choice you made. An audited ballot is not counted.
- How audits are handled is defined in spec [16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md) and spec [19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md).

## Good habits

- **Vote on a device you trust.** A compromised device can change or reveal your choice, and QuietVote cannot detect that.
- **Assume others can see that you voted.** In version 1, they cannot see how.
- **Do not use QuietVote if someone could force you to show how you voted.** QuietVote does not stop this. See [[Privacy and Guarantees]].
