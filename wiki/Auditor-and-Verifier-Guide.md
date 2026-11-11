# Auditor and Verifier Guide

> **Experimental and unaudited; not for real elections.** The specification-focused `main` branch is not a released voting service. The unmerged [prototype in draft PR #30](https://github.com/djshellshoxxx/quietvote/pull/30) contains TypeScript and Python verification implementations plus a browser/offline workflow. Passing their tests does **not** certify ballot privacy, eligibility, tally correctness or the trustworthiness of the code you run.

Independent verification is a design goal, not a claim that the current prototype can safely verify a binding election. Start with [[User Guide]] for limitations or [[Developer Guide]] for developer commands and current CI evidence.

## Intended verification evidence

- **Manifest and rules:** check signed election context, keys, rules and declared voter-roll commitment. An independent auditor must separately establish whether the roll represents eligible people.
- **Ballot records and signatures:** check the published entries, authorization context and ballot/proof conditions using an appropriately verified implementation.
- **Bulletin-board integrity:** compare signed log/checkpoint evidence and independently obtained checkpoints to detect missing, reordered or equivocated records where that evidence is available. See [[Bulletin Board Summary]].
- **Tally evidence:** independently verify tally and trustee proof obligations against the accepted election rules, rather than trusting a result display. See [spec 16 Appendix C](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md) and [spec 18 §13](https://github.com/djshellshoxxx/quietvote/blob/main/docs/18-bulletin-board-transparency.md).

These are **proposed capabilities** with unresolved approval and external-review gates. In particular, B3-01 registration and D-92–D-94 full verifier-report semantics remain held for owner/protocol review. Do not equate matching top-level verdicts with identical verifier reports.

## Prototype tools (draft PR #30, not merged)

- `qv-verify` TypeScript command-line checker in [packages/verifier](https://github.com/djshellshoxxx/quietvote/tree/ab84f16136184cb1fa0fa67b41e113424e134ba8/packages/verifier).
- A separate Python verifier in [verifier-py](https://github.com/djshellshoxxx/quietvote/tree/ab84f16136184cb1fa0fa67b41e113424e134ba8/verifier-py).
- Browser/offline checking components in [packages/web](https://github.com/djshellshoxxx/quietvote/tree/ab84f16136184cb1fa0fa67b41e113424e134ba8/packages/web).
- A draft-only read-only mismatch diagnostic CLI in [PR #32](https://github.com/djshellshoxxx/quietvote/pull/32). Its output **does not replace** the strict comparator or grant permission to relax expected reports.

At the recorded [PR #38 hosted CI](https://github.com/djshellshoxxx/quietvote/actions/runs/42883444584), the strict TypeScript/Python comparison agreed on **27/27 top-level verdicts** but only **24/27 complete reports**. Its job **failed**, as required by the existing gate. Other passing tests are not authority to accept the three differences or deploy.

## Limits and operator checks

- The evidence can be incomplete or self-attested; supply and independently verify expected log keys, checkpoints, election context and the software build. An untrusted bundle alone does not establish authenticity.
- A verifier cannot establish real-world voter eligibility, freedom from coercion, a clean voting device, correct served browser code or secrecy against a colluding trustee threshold. See [[Privacy and Guarantees]].
- Do not infer release provenance from an unverified binary or a displayed build hash. Review [spec 19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md) and actual independently verifiable artifacts when they exist.
- External cryptographic/protocol review, human accessibility and translation acceptance, and owner sign-off remain missing. The current prototype is suitable only for nonbinding experiments.
