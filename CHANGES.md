# Changes

**QuietVote has never made a release.** There is no version history to report, no tag, no signed artifact and no release manifest. The root `package.json` is `private`. QuietVote is an unaudited prototype and is not for real elections. Nothing in this file is a statement that any change was reviewed, audited or approved by an independent party.

## What this file holds

[QV-27](docs/27-project-governance-release.md) section 7.3 item 5 requires each release to carry a changelog with: user-facing changes, protocol/schema/API version effects, deprecations, upgrade notes, known issues, and verification instructions and hashes. [QV-30](docs/30-engineering-standards.md) section 11 requires breaking changes to be noted in the changelog, and [QV-34](docs/34-test-vectors-conformance.md) (QV-34-REQ-016) requires a change note here for any change to a `stable` test vector. The specifications do not name a stricter format, so this file uses plain headings per release, with the section 7.3 item 5 headings inside each. The first heading is always `Unreleased`.

## Unreleased

Only changes that are verifiably present in the repository tree are listed. This section is not a version history.

### Protocol, schema and API version effects

- None recorded here. This section does not change test vectors, domain-separation labels, encodings or wire formats.

### Deprecations

- None recorded. `DEPRECATIONS.md` does not exist yet (required by QV-27-REQ-001; not created by the change that added this file).

### Added

- Governance placeholder files with an explicit empty state: [MAINTAINERS.md](MAINTAINERS.md), [docs/RELEASE-KEYS.md](docs/RELEASE-KEYS.md), [docs/LICENSE-NOTE.md](docs/LICENSE-NOTE.md) and this file. They record that no maintainers group, release keys, release or counsel-reviewed licence note exists (decision QV-ADR-027, register item N-08b).

### Changed

- `CONTRIBUTING.md`, `SECURITY.md` and `wiki/Contributing.md` wording was corrected so it no longer implies an enforced DCO check or a working security contact. See those files.
- Inline `claims-lint-ignore` markers were added to preserved historical quotes, citation titles and negated statements so the claims lint (`scripts/lint-claims.mjs`) is not silenced by weakening it. The banned-phrase list and the script are unchanged.

### Known issues

- Open owner decisions and blocked work are tracked in [docs/plan/](docs/plan/), not here.

### Upgrade notes and verification

- Not applicable: there is nothing to upgrade from and no release to verify. See [docs/RELEASE-KEYS.md](docs/RELEASE-KEYS.md).

## History before 2026-11-11

No version was ever released, so no version history is reconstructed here. The development record to date is in the dated handoff documents under [docs/handoffs/](docs/handoffs/) (for example [the 2026-11-09 integration checkpoint](docs/handoffs/QUIETVOTE-MILESTONE-20261109.md) and [the 2026-11-09 next-phase note](docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md)), the decision log in [docs/decision-log.md](docs/decision-log.md) and the audit and report material under [docs/audit/](docs/audit/) and [docs/reports/](docs/reports/). Those documents are working records, not release notes.
