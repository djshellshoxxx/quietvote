# Auditor and Verifier Guide

> **Draft – unaudited software, not for real elections yet.** The independent checker is not built yet. This page describes the planned checks.

Anyone can check a vote without trusting the operator. You need an honest checker program and the public data.

## What you can check

- **Manifest and rules:** The election manifest is a signed document. It ties together the rules, the roll, the trustees and the shared public key.
- **Roll:** A sealed fingerprint of the roll matches the published roll.
- **Ballots:** Each counted ballot is signed by a key on the roll, and its proofs are valid. The latest valid ballot per key counts.
- **Log integrity:** The log's proofs show that no entry was dropped, reordered or changed. See [[Bulletin Board Summary]].
- **The count:** The total is correct, and the trustees' decryption proofs are valid. See spec [05](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md) section 7.

The full list of checks is in spec [16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md) (Appendix C) and spec [18](https://github.com/djshellshoxxx/quietvote/blob/main/docs/18-bulletin-board-transparency.md) section 13.

## Tools (planned)

- `qv-verify`, a command-line checker.
- An offline **checker page** that checks a saved bundle in your browser.
- The export format is a bundle file (`.qvb`). See spec 18 section 12.

## Limits

- A passed check only proves what was checked. Nobody is forced to check, so verification is a tool, not a promise. See [[Privacy and Guarantees]] (non-claim N-5).
- You need at least one honest checker build. Compare its fingerprint (hash) with the published release (spec [19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md)).
- Checking cannot show that the roll matches the real membership.
