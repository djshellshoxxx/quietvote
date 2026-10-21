# Privacy and Guarantees

> **Draft – unaudited software.** These are design targets, not proven guarantees. Read the non-claims.

This page summarizes what QuietVote is designed to protect, who could learn what, and what it does **not** promise. Binding wording is in spec [05 section 5](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md) and spec [07 section 11](https://github.com/djshellshoxxx/quietvote/blob/main/docs/07-threat-model-security.md).

## What is designed to hold (Phase 1)

- **Ballot secrecy:** no single party can read a ballot. Secrecy holds as long as fewer than *t* trustees collude, the voter's device is honest, and the client code is genuine.
- **Universal verifiability:** anyone can check eligibility, inclusion of ballots and the tally.
- **Recorded-as-cast:** a voter with a receipt can check their ballot is in the log.
- **Cast-as-intended:** voters can optionally audit a ballot on a second device.
- **Duplicate-vote prevention:** the latest valid ballot per voter key counts.
- **Tamper detection:** a server that drops or alters entries is detectable by monitors and receipt holders. Prevention is not guaranteed; availability is not guaranteed either.

## Who can learn what (Phase 1, simplified)

| Party | Can learn |
|---|---|
| Other members | Who has voted (public), not how |
| Stewards | Roll and labels, not choices |
| Operator (server) | Log contents, not choices; trusted for availability only |
| Public observers | Everything on the log, including ciphertexts; not choices |
| Fewer than *t* trustees | Nothing about the tally or ballots |
| *t* or more trustees | Can decrypt the tally, and could decrypt individual ballots |

The full table, with a row for compromised devices and malicious client builds, is in spec 05 section 5.2.

## Honest non-claims

QuietVote does **not** claim:

- **Coercion resistance or receipt-freeness.** A coercer who watches a voter or takes their key may learn how they voted. Revoting only partly helps.
- **Participation privacy in Phase 1.** Who voted is public. Only Phase 2 and 3 are designed to change this.
- **Protection from a compromised device**, browser or extension.
- **Protection if the served web client is malicious.** The operator serves the browser code, so mitigations are partial (reproducible builds, integrity checks, CLI voting).
- **Collusion protection beyond the threshold.** If *t* trustees collude or are compelled, secrecy fails.
- **Post-quantum or long-term secrecy.** Version 1 uses classical cryptography.
- **Network metadata protection**, unless used through Tor, and even then not against a global observer.
- **Availability.** The operator can delay or deny service.
- **Identity checks.** The system verifies that a registered key signed a ballot, not who the person is. Stewards must ensure the roll is correct.
- **Bug-free software.** Absence of known vulnerabilities is not proof of security.
- **Legal or certified e-voting status.**

Sources: spec [07 section 11](https://github.com/djshellshoxxx/quietvote/blob/main/docs/07-threat-model-security.md) (N-1 to N-14) and [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md) QV-ADR-008.
