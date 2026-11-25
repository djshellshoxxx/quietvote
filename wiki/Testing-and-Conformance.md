# Testing and Conformance

> **Draft – unaudited software.** Only part of the test suite described here exists.

Sources: spec [11 Testing and assurance](https://github.com/djshellshoxxx/quietvote/blob/main/docs/11-testing-assurance.md) and spec [34 Test vectors](https://github.com/djshellshoxxx/quietvote/blob/main/docs/34-test-vectors-conformance.md).

## Test layers (target)

| Layer | What it covers | When it runs |
|---|---|---|
| L0 Static | Strict TypeScript, linting rules (for example, no `Math.random`, constant-time comparisons for secrets) | Every change (per spec 11) |
| L1 Unit | Encoders, hashing wrappers, proofs, Merkle tree, tally arithmetic | Every change |
| L2 Vectors | Known-answer, negative and mutation vectors | Every pull request |
| L3 Property | Invariants with generated inputs | PR (smaller set) and nightly (larger) |
| L4 Integration | Server, storage, board, trustees, CLI end to end | See spec 11 section 5.1 |

Adversarial cryptographic tests (spec 11 section 6), fuzzing and mutation testing (section 7), load and chaos testing (section 8) are also specified.

## Conformance

- **Test vectors:** language-neutral JSON files in `test-vectors/`, shared with the spec and with independent verifiers. The directory currently holds `MANIFEST.json`, a `schema/` directory and `v1/` vectors; coverage is not complete.
- **Verifier conformance:** canary and mutation checks to prove the verifier rejects bad inputs.
- **Cross-implementation suite:** so that a second implementation can prove it matches.

Any change to encodings, domain strings or vectors is a protocol change.

## Release gates and assurance

- Release gates: spec 11 section 11.
- Independent review and audit plan: spec 11 section 9 and spec 07 section 14.
- Release evidence (dossier): spec 11 section 10.

No audit has been performed. See [[Roadmap and Status]].

## Running tests today

See [[Getting Started Dev]]. Test counts change per commit and are not recorded here; run `npm run check` or see CI.
