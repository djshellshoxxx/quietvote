# Changes

**QuietVote has never made a release.** There is no version history to report, no tag, no signed artifact and no release manifest. The root `package.json` is `private`. QuietVote is an unaudited prototype and is not for real elections. Nothing in this file is a statement that any change was reviewed, audited or approved by an independent party.

## What this file holds

[QV-27](docs/27-project-governance-release.md) section 7.3 item 5 requires each release to carry a changelog with: user-facing changes, protocol/schema/API version effects, deprecations, upgrade notes, known issues, and verification instructions and hashes. [QV-30](docs/30-engineering-standards.md) section 11 requires breaking changes to be noted in the changelog, and [QV-34](docs/34-test-vectors-conformance.md) (QV-34-REQ-016) requires a change note here for any change to a `stable` test vector. The specifications do not name a stricter format, so this file uses plain headings per release, with the section 7.3 item 5 headings inside each. The first heading is always `Unreleased`.

## Unreleased

Only changes that are verifiably present in the repository tree are listed. This section is not a version history.

### Protocol, schema and API version effects

- Recorded PUBLIC exports add election migration 11 without changing the checksums of migrations 1–10. Signed export, acknowledgement and deletion-notice endpoints are additive. ARCHIVED deletion now enforces the accepted final-export condition before erasing the DEK or files; other terminal states retain their existing deletion behavior. Public archive and cryptographic wire encodings are unchanged.
- Pinned membership adds election-database migration 10 and the optional signed creation field `pinned_roll`, plus `PUT /api/v1/elections/:id/pinned-roll` for authenticated provisioning/recovery. Existing manifest, invitation proof-of-possession, log and archive encodings, test vectors and domain-separation labels are unchanged. The experimental API remains `/api/v1/`.
- Registration read models now distinguish an absent active member from an imported member whose registration history is unavailable. Imported members return `registered:null, registration_known:false`; active absent members return `registered:false, registration_known:true`. API consumers must handle the nullable imported value and the roll status `unregistered` rather than infer enrollment from membership.

### Deprecations

- None recorded. `DEPRECATIONS.md` does not exist yet (required by QV-27-REQ-001; not created by the change that added this file).

### Added

- Verbatim vendoring of the existing Noble 2.4.0 production dependencies, hash-bound source archives and expanded files, explicit verified installation, tamper regressions and CI/build checks. Registry audit metadata, dependency versions and cryptographic behavior are unchanged. See the [provenance and verification receipt](docs/reports/vendored-crypto-20261119.md).
- Immutable recorded PUBLIC export snapshots, explicit signed delivery acknowledgement, an explicit 30-day deletion-notice alternative, bounded storage and durable export-job/response recovery. Full and partial downloads never acknowledge delivery. See the [implementation and verification note](docs/reports/recorded-public-exports-20261118.md).
- Governance placeholder files with an explicit empty state: [MAINTAINERS.md](MAINTAINERS.md), [docs/RELEASE-KEYS.md](docs/RELEASE-KEYS.md), [docs/LICENSE-NOTE.md](docs/LICENSE-NOTE.md) and this file. They record that no maintainers group, release keys, release or counsel-reviewed licence note exists (decision QV-ADR-027, register item N-08b).
- Authenticated complete pinned membership across server storage/admission, browser publication, CLI creation/recovery and private backup comparison, implementing accepted D-99 option A. The full roll can be committed even when some members never register; quorum and privacy denominators still include those members. See the [implementation and verification note](docs/reports/pinned-membership-implementation-20261118.md).

### Changed

- `CONTRIBUTING.md`, `SECURITY.md` and `wiki/Contributing.md` wording was corrected so it no longer implies an enforced DCO check or a working security contact. See those files.
- Inline `claims-lint-ignore` markers were added to preserved historical quotes, citation titles and negated statements so the claims lint (`scripts/lint-claims.mjs`) is not silenced by weakening it. The banned-phrase list and the script are unchanged.

### Known issues

- Open owner decisions and blocked work are tracked in [docs/plan/](docs/plan/), not here.

### Upgrade notes and verification

- After each `npm ci --ignore-scripts`, run `npm run vendor:install` to install the verified crypto snapshot. `npm run vendor:check` verifies installed bytes and actual package resolution. Lifecycle scripts remain disabled; a fresh dependency restore invalidates the previous installation receipt.
- Election migration 11 creates empty recorded-export storage on existing development databases and preserves existing operation receipts while permitting export audit actions. An existing ARCHIVED election must generate and acknowledge a final PUBLIC snapshot, or record its final snapshot's deletion notice and wait 30 days, before deletion. No export or acknowledgement is fabricated for pre-upgrade data.
- There is no released version or release artifact to upgrade or verify. See [docs/RELEASE-KEYS.md](docs/RELEASE-KEYS.md).
- Existing development data receives the additive migration 10. A historical pinned election with an incomplete uncommitted list requires a signed attachment of the full canonical member list matching its manifest. A committed list is reconstructed only when its root and size verify; missing absent-member keys are never guessed from registered voters. An unpublished draft can receive its first immutable list before publishing the matching manifest.
- Retain an independent minimum private backup to protect the authenticated full membership during restore, including after management receipts expire. A public backup report alone does not contain that private membership binding. Commands, compatibility boundaries and verification results are recorded in the [implementation note](docs/reports/pinned-membership-implementation-20261118.md) and [API contract](docs/09-api-data-contracts.md#711-authenticated-complete-pinned-membership).

## History before 2026-11-11

No version was ever released, so no version history is reconstructed here. The development record to date is in the dated handoff documents under [docs/handoffs/](docs/handoffs/) (for example [the 2026-11-09 integration checkpoint](docs/handoffs/QUIETVOTE-MILESTONE-20261109.md) and [the 2026-11-09 next-phase note](docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md)), the decision log in [docs/decision-log.md](docs/decision-log.md) and the audit and report material under [docs/audit/](docs/audit/) and [docs/reports/](docs/reports/). Those documents are working records, not release notes.
