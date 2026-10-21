# Cryptographic Protocol Summary

> **Draft – unaudited software.** The protocol is implemented in part and has not been independently reviewed. Do not treat any of this as a security claim.

Authoritative source: spec [16 Crypto protocol](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md) (byte-level). Research: [R-01](https://github.com/djshellshoxxx/quietvote/blob/main/docs/research/R-01-cryptographic-protocol-research.md).

## Building blocks (decision QV-ADR-004)

- **Group:** prime-order ristretto255.
- **Encryption:** exponential ElGamal, one ciphertext per selection, so ballots can be summed.
- **Threshold key:** created by a distributed key generation (Feldman-style verifiable secret sharing, per spec 16). No trusted dealer. Trustees hold shares. See [spec 17](https://github.com/djshellshoxxx/quietvote/blob/main/docs/17-key-ceremony-trustees.md).
- **Well-formedness proofs:** CDS disjunctive proofs (each selection is 0 or 1), plus proofs that the total respects the contest limit.
- **Decryption proofs:** Chaum–Pedersen proofs that trustees decrypted correctly.
- **Signatures:** Ed25519 for voter keys, trustee keys and log entries.
- **Hashing:** SHA-256 and SHA-512. Domain separation strings are fixed in the spec.
- **Cast-or-audit:** the Benaloh challenge.

Libraries: `@noble/curves` and `@noble/hashes`. No primitive is hand-implemented. The spec invents no new primitives.

## Ballot flow

1. Encode the choices.
2. Encrypt each selection.
3. Produce proofs.
4. Sign with the voter key.
5. Submit to the board. The receipt covers the log entry.

## Tally

Ciphertexts are summed by anyone. At least *t* trustees publish decryption shares with proofs. The result is checked by the verifier.

## Later phases

- Phase 2: blind-signed single-use tokens (RFC 9474) for unlinkable ballots.
- Phase 3: zero-knowledge membership with nullifiers (research).
- Post-quantum secrecy is out of scope for v1 (QV-ADR-013).

Code status (2026-10-21): `packages/crypto` and `packages/protocol` implement the building blocks above, with unit and negative tests. Those tests do not replace an independent review, and no real ceremony has been run. See [[Repository and Packages]].
