# Release keys

**Status: empty. No release signing keys have been generated or registered, and no release has ever been made.** QuietVote is an unaudited prototype and is not for real elections.

## What this file must hold

QV-27-REQ-001 and [QV-27](27-project-governance-release.md) section 5.2 require this file to list release-key fingerprints. [QV-19](19-client-supply-chain.md) section 10.2 requires the public keys and fingerprints of the registered release maintainers (detached Ed25519 signatures over the release manifest, from at least 2 of the registered release maintainers, hardware-backed and offline) to be published here, in the repository's signed tags, on the website and in prior release manifests for key continuity. Release tags are to be signed (QV-30-REQ-020) and key rotation and revocation follow QV-19 section 12.

## Current state

| Item | State |
|---|---|
| Registered release maintainers | None. See [MAINTAINERS.md](../MAINTAINERS.md). |
| Release public keys | None. |
| Fingerprints | None. This file deliberately contains no fingerprint, example or sample value. |
| Signed tags | None. No version has been released. |
| Signing threshold | Proposed in the specification as 2 of 3 maintainers (QV-19 open question on key quorum and custody, owner decision before 1.0). Not decided. |
| Release manifests | None published, so there is no key-continuity chain. |

Pre-1.0 builds are not signed by maintainers. The history of work to date is in the handoff documents under [handoffs/](handoffs/), not in released versions.

## Before this file can be filled in

1. A maintainers group exists (see [MAINTAINERS.md](../MAINTAINERS.md)); the project owner decides who it is.
2. The owner decides the key quorum and custody (QV-19 open question).
3. Each registered maintainer generates their own hardware-backed key offline and publishes only the public part and its fingerprint, through the project's channels. No private key material is ever placed in this repository.
4. The project completes the signing ceremony in QV-19 section 13 for a first release candidate. Until a release exists, there is nothing to verify against this file.

## Keys

_None. Treat any key, fingerprint or signature claiming to be a QuietVote release key as unverified until it appears here through a reviewed change by the project owner._
