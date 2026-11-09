# Governance

This is a short summary. The full draft model, including roles, decision process, release management, and security response, is in [docs/27-project-governance-release.md](docs/27-project-governance-release.md).

**Status:** the detailed governance model is a draft and is not yet an approved project contract. It requires review by the project owner before it takes effect.

## Summary

- **Maintainers** merge changes and make release decisions. The current placeholder owner is listed in [.github/CODEOWNERS](.github/CODEOWNERS).
- **Security-sensitive changes** (cryptography, protocol, dependency policy, CI, governance) need more than one approving review, as set out in [docs/30-engineering-standards.md](docs/30-engineering-standards.md) §9.2 and §10.
- **Decisions** are recorded in [docs/decision-log.md](docs/decision-log.md). Specification changes go through the spec-change issue template.
- **Contributions** are accepted under AGPL-3.0-or-later with a Developer Certificate of Origin sign-off, not a CLA. See [CONTRIBUTING.md](CONTRIBUTING.md) and [DCO](DCO).
- **Vulnerabilities** are handled privately, as described in [SECURITY.md](SECURITY.md).
- **Conduct** is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
