# Privacy and Guarantees

> **Draft – unaudited software, not for real elections yet.** These are design goals, not proven promises. Please read the "does NOT protect" list below.

This page explains what QuietVote tries to protect, who can learn what, and what it does **not** promise. The exact wording is in spec [05 section 5](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md) and spec [07 section 11](https://github.com/djshellshoxxx/quietvote/blob/main/docs/07-threat-model-security.md).

## What the design tries to do (version 1)

- **Secret choices.** No single party can read a ballot. This holds only if fewer than *t* trustees team up, the voter's device is honest, and the app code is genuine.
- **Anyone can check.** Anyone can check who is eligible, that ballots are in the log, and that the count is right.
- **Recorded as cast.** A voter with a receipt can check that their ballot is in the log.
- **Cast as intended.** Voters can optionally check a ballot on a second device, to confirm it holds their real choice.
- **One vote per key.** The latest valid ballot from each voter key counts.
- **Tampering shows up.** If the server drops or changes entries, watchers and receipt holders can notice. The design does not stop this, and it does not promise the server will always be up.

## Who can learn what (version 1, simple version)

| Who | What they can learn |
|---|---|
| Other members | Who has voted. Not how. |
| Stewards | The roll and labels. Not choices. |
| The operator (server) | What is in the log. Not choices. It is trusted to stay online, not to keep secrets. |
| Public watchers | Everything in the log, including locked ballots. Not choices. |
| Fewer than *t* trustees | Nothing about the count or the ballots. |
| *t* or more trustees | They can open the total. They could also open single ballots. |

The full table, including compromised devices and bad app builds, is in spec 05 section 5.2.

## What QuietVote does NOT protect

QuietVote does **not** promise any of these:

- **Someone watching you vote, or forcing you to vote a certain way.** A person who watches you, or who gets your key, may learn how you voted. Voting again only helps a little.
- **Who voted (in version 1).** Other members can see that your key voted. Only versions 2 and 3 are designed to hide this.
- **A hacked phone, computer, browser or browser extension.** A compromised device can change or reveal your choice. QuietVote cannot detect this.
- **Safety if the web app is bad.** The operator sends the browser code to you, so the protection is only partial. Reproducible builds, integrity checks and the command-line tool help.
- **Safety if enough trustees team up.** If *t* trustees work together, or are forced to, secrecy fails.
- **Long-term secrecy.** Version 1 uses today's (classical) cryptography. It is not built to resist future quantum computers.
- **Hidden network use.** Your network traffic may show that you used QuietVote. Only Tor helps, and even Tor does not hide you from someone who can see the whole internet.
- **A guaranteed service.** The operator can delay or block a vote.
- **Proof of who you are.** The system checks that a registered key signed a ballot. It does not check who the person is. Stewards must keep the roll correct.
<!-- claims-lint-ignore -->
- **Bug-free software.** No known bugs is not proof of safety.
- **Legal or official e-voting approval.**

The status of each claim, and the wording that must not be used, is in the [claims register](https://github.com/djshellshoxxx/quietvote/blob/main/docs/claims/claims-register-v0.md).

Sources: spec [07 section 11](https://github.com/djshellshoxxx/quietvote/blob/main/docs/07-threat-model-security.md) (N-1 to N-14) and [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md) QV-ADR-008.
