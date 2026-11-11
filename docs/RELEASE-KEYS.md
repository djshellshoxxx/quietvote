# Release keys

**Status:** empty state (QV-ADR-027 N-08b, 2026-11-04). QuietVote is unaudited and not for real elections.

This file is required by [QV-27-REQ-001](27-project-governance-release.md) and referenced by [docs/19](19-client-supply-chain.md) (maintainer release signatures) and [docs/27 §5.2](27-project-governance-release.md#52-structure).

## Current state

- **No release keys exist.** No maintainer has been appointed (see [MAINTAINERS.md](../MAINTAINERS.md)), and no key ceremony for release keys has been held.
- **No QuietVote release has been signed.** No release has been published. docs/19 §10.1 outlines a signed release manifest, but no manifest schema, signing tool or manifest exists yet.
- **This file lists no fingerprints.** Treat any key, fingerprint or signature presented as a "QuietVote release key" as unverified. Nothing in this repository vouches for it.
- The PGP and age entries in [SECURITY.md](../SECURITY.md) are placeholders for vulnerability reporting. They are not release keys.

## What a future entry must contain

Entries are added only once the requirements below are met. They are taken from docs/19 and docs/27 and are not yet in effect.

- A detached signature scheme as specified in docs/19 §10.2 (Ed25519; minisign-compatible or `ssh-keygen -Y sign` format), with releases signed by **at least 2** registered release maintainers.
- For each key: the key holder (as listed in MAINTAINERS.md), the algorithm, the full public key, its fingerprint, the date it was created, the date it was registered and the commit that registered it, and how it is stored (docs/27 §5.3: hardware-backed and kept offline).
- Key continuity: rotation and revocation entries, which also appear in the next signed release manifest (docs/27 §5.3, which refers to docs/19 §12). A revoked key stays listed with its revocation date and reason, and is never removed.
- Mirrors of the public parts at the locations named in docs/19 §10.2 (signed tags, website, prior release manifests) once those exist.

| Key holder | Algorithm | Fingerprint | Public key | Created | Registered (commit) | Storage | Status |
|---|---|---|---|---|---|---|---|
| _none_ | | | | | | | |
