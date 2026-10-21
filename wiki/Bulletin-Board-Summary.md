# Bulletin Board Summary

> **Draft – unaudited software.**

Authoritative source: spec [18 Bulletin board](https://github.com/djshellshoxxx/quietvote/blob/main/docs/18-bulletin-board-transparency.md). Decision: QV-ADR-007.

## What it is

An **append-only log** of everything that determines an election's outcome. It is hosted by an untrusted server. The design is a Merkle tree in the style of RFC 9162.

Entries include the manifest, ceremony messages, roll commitment, ballots, audits, close, tally, decryption shares, result and key-destruction attestations.

## Threats it addresses

- Dropping, reordering, altering or back-dating an entry.
- **Equivocation:** showing different histories to different people.

Detection is the goal, not prevention. Monitors, witnesses, mirrors and receipt holders catch misbehavior.

## Mechanisms

- **Signed checkpoints:** signed tree heads over the log.
- **Proofs:** inclusion (is this entry in the log?) and consistency (did the log only grow?).
- **Receipts:** given to voters so they can check their ballot later.
- **Witnesses and gossip:** third-party cosigning and comparison of checkpoints.
- **Export:** a bundle file (`.qvb`) and an offline verification algorithm (`qv verify`). See spec 18 sections 12 and 13.

## Code status

`packages/board` has the Merkle tree, entry encoding and inclusion verification. Storage and server integration are not built. See [[Repository and Packages]].
