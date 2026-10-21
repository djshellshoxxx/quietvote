# Architecture Overview

> **Draft – unaudited software.** This is the target design. Only parts of it exist in code today.

Source: spec [08 Architecture and deployment](https://github.com/djshellshoxxx/quietvote/blob/main/docs/08-architecture-deployment.md) and [05 Ballot protocol](https://github.com/djshellshoxxx/quietvote/blob/main/docs/05-ballot-protocol.md).

## Principles

- **Untrusted operator.** The server is a bulletin board and coordinator. It is trusted for availability only (QV-ADR-001, 002, 008).
- **Verify, don't trust.** Every outcome must be checkable by an independent verifier.
- **Self-hostable first.** A single server, a browser client and a CLI verifier. A maintainer-hosted service may come later on the same code.
- **TLS only, no third-party resources** in the client, with a strict Content Security Policy (QV-ADR-009).

## Components

| Component | Role | Layer |
|---|---|---|
| `crypto` | Group, ElGamal, proofs, DKG/Shamir, signatures, KDF | L0 |
| `protocol` | Message schemas, canonical encoding, manifest, ballots, tally, state machine | L1 |
| `board` | Merkle log, signed tree heads, proofs, storage interface | L2 |
| `server` | HTTP service, SQLite storage, scheduler | L3 |
| `web` | Browser voter and organizer client | L3 |
| `cli` | Voter and organizer CLI (`qv`) | L3 |
| `trustee` | Trustee tool (`qv-trustee`) | L3 |
| `verifier` | Independent verifier (`qv-verify`) and offline page | L3 |

Dependencies should point downward only. This is not enforced by CI in the current repository: `packages/cli` imports `packages/verifier` in-process, which breaks the rule (see `packages/cli/NOTES.md`).

## Election flow

1. Stewards publish group rules and roll to the log.
2. Trustees run a distributed key generation, then the joint key is published.
3. Stewards sign the election manifest.
4. Voters submit encrypted, proven, signed ballots. They receive receipts.
5. The election closes. Anyone can aggregate the ciphertexts.
6. At least *t* trustees publish decryption shares with proofs. Anyone verifies the result.

## Deployment

- **Self-hosted** (single binary, Docker or systemd): first supported model.
- **Tor onion service:** first-class sidecar option.
- **Split-origin client** (web bundle served separately from the board): the strongest web-delivery option.
- **Maintainer-hosted, multi-tenant:** later.
- **Federated or peer-to-peer:** deferred. Mirrors and witnesses add read-side redundancy only.

See [[Security Model and Threats]] for the trust boundaries.
