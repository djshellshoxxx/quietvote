# Auditor and Verifier Guide

> **Draft – unaudited software.** The independent verifier is not yet built. This describes the intended checks.

Anyone can verify an election without trusting the operator, provided they run an honest verifier build and have the public data.

## What you can check

- **Manifest and rules:** the election manifest is signed and binds the rules, roll, trustees and joint public key.
- **Roll:** the roll commitment matches the published roll.
- **Ballots:** each counted ballot is signed by a roll key and its proofs are valid. The latest valid ballot per key counts.
- **Log integrity:** inclusion and consistency proofs on the Merkle log show that entries were not dropped, reordered or altered. See [[Bulletin Board Summary]].
- **Tally:** the aggregate is correct, and the decryption proofs from the trustees are valid. See [spec 05](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md) section 7.

The full list of checks is in [spec 16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md) (Appendix C) and [spec 18](https://github.com/djshellshoxxx/quietvote/blob/main/docs/18-bulletin-board-transparency.md) section 13.

## Tools (planned)

- `qv-verify`, a command-line verifier.
- An offline **verifier page** for checking a published bundle in a browser.
- The export format is a bundle file (`.qvb`). See [spec 18](https://github.com/djshellshoxxx/quietvote/blob/main/docs/18-bulletin-board-transparency.md) section 12.

## Limits of verification

- A passed check shows only what was checked. Nobody has to check, so verification is a capability, not a guarantee ([[Privacy and Guarantees]], non-claim N-5).
- Verification needs at least one honest verifier build. Compare build hashes with the published release ([spec 19](https://github.com/djshellshoxxx/quietvote/blob/main/docs/19-client-supply-chain.md)).
- Verification cannot show that the roll reflects the true membership.
