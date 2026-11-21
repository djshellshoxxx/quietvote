# Voter Guide

> **Draft user journey — unaudited prototype, not for real elections or binding decisions.** The steps below describe proposed behavior, **not** verified production capabilities or privacy guarantees. The current prototype is in [unmerged draft PR #30](https://github.com/djshellshoxxx/quietvote/pull/30); the registration contract B3-01 and verifier-report decisions D-92–D-94 remain on hold.

## Before a nonbinding test vote

1. **Invitation and eligibility (proposed):** An organizer would invite eligible members, and the registration flow would associate a voter key with the election roll. The browser/server registration contract is **not yet approved**. See [identity specification 04](https://github.com/djshellshoxxx/quietvote/blob/main/docs/04-identity-eligibility.md), section 5.
2. **Key custody (proposed):** The key would be needed to prove eligibility. Loss or compromise can prevent participation or disclose information. Recovery remains under development; see spec 04, section 6. Never use real voter identities or real key material for a prototype test.
3. **Read election rules:** Quorum, decision threshold, revoting conditions and eligibility policy must be explicit. Those rules are draft requirements, not yet approved operating policy. See [governance specification 03](https://github.com/djshellshoxxx/quietvote/blob/main/docs/03-governance-and-policy.md).

## Casting a test ballot — intended flow

1. Open a **local nonbinding test election** while its configured voting window is open and choose a test option.
2. The proposed client encrypts the choice, constructs proofs and signs the submission. **Encryption or the appearance of a successful UI action is not proof of ballot confidentiality, accepted registration, or correct tallying.** The protocol and delivered-client trust model still require independent review.
3. Retain any generated receipt/evidence. Check actual inclusion against the published log; a displayed receipt or success message alone does **not** prove inclusion or a counted vote.
4. **Revoting is policy-dependent.** The draft describes latest-valid-ballot handling, but do not assume an election permits revoting until the applicable rule and implementation are independently qualified.

## After the test

- Compare the receipt with published log evidence using [[Auditor and Verifier Guide]]. The strict TypeScript/Python verifier currently disagrees on three full reports despite agreeing on 27 verdicts; this is an **unresolved failed CI gate**, not something a voter can waive.
- The proposal includes optional second-device ballot challenges (Benaloh-style audits). An audit challenge is intended to **not** be counted as a vote; independent protocol review and user acceptance are still required. See draft [cryptographic specification 16](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/16-crypto-protocol.md) and [client/supply-chain specification 19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md).

## Safety and privacy limitations

- Use only fake identities and test elections. Do not put real election, trustee or voter secrets into this prototype.
- A compromised device, coercion, observation of voting or malicious client code can reveal or change a choice. Ballot confidentiality and end-to-end tally correctness are **not established** by current draft tests.
- Version 1 is designed to make participation visible; who participated may be public. Never infer that ballot choices are secret simply because a screen shows encryption.
- For limitations and the unfinished state of evidence, read [[Privacy and Guarantees]], [[Security Model and Threats]], [[Accessibility and Help]] and [[Roadmap and Status]].
