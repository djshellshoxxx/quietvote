# Maintainers

**Status: empty. No maintainers group has been established.** QuietVote is an unaudited prototype and is not for real elections.

## What this file must hold

[QV-27](docs/27-project-governance-release.md) section 5.2 and requirement QV-27-REQ-001 require this file to list the project's maintainers and their affiliations (voluntarily declared; employer affiliations are required to be disclosed publicly for conflict handling). QV-27-REQ-002 requires at least 3 maintainers, and at least 2 owners per package in [.github/CODEOWNERS](.github/CODEOWNERS), before a 1.0 release. QV-27-REQ-003 asks that no single employer holds a majority of maintainer or security-reviewer seats.

## Current state

| Item | State |
|---|---|
| Maintainers | None listed. No person has been nominated or approved under the process in QV-27 section 5.1. |
| Owners per package | Not met. `.github/CODEOWNERS` contains one placeholder owner for every path (`*`); it is explicitly a placeholder and is not a maintainers group. |
| Security reviewers | None designated. |
| Affiliations | Nothing declared, because no maintainers exist yet. |
| Release signing keys | None generated or registered. See [docs/RELEASE-KEYS.md](docs/RELEASE-KEYS.md). |

The placeholder owner in `.github/CODEOWNERS` is the only name the repository gives for decisions today. This file does not confirm that this person has accepted any maintainer role, and no maintainer is named here.

## Before this file can be filled in

1. The project owner decides who is nominated, following the nomination and approval rules in QV-27 section 5.1. Nobody is listed here on the basis of this file alone.
2. Each nominee declares their affiliation (or states they decline to) and agrees to the maintainer security hygiene in QV-27 section 5.3.
3. `.github/CODEOWNERS` is replaced with real maintainer and security-reviewer groups (docs/30 sections 9.2 and 10).
4. Only then are names, affiliations and links added below. Release-key fingerprints go in [docs/RELEASE-KEYS.md](docs/RELEASE-KEYS.md), never here.

## Maintainers

_None. Do not infer maintainers from commit history._
