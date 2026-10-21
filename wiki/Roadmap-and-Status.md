# Roadmap and Status

> **Draft – unaudited software.** Early implementation. Not for real elections.

Status as of **2026-10-21**. This page reports what the repository contains and what has been run. It does not describe planned features as if they exist.

## Current status

| Item | State |
|---|---|
| Stage | Specification drafts plus early implementation. No specification is approved. |
| Code | Initial implementations in all eight packages. `crypto`, `protocol` and `board` are the most complete. `server`, `web`, `cli`, `trustee` and `verifier` are first cuts with known gaps (see below). |
| Tests | `npm test` runs each workspace's node:test suite. Counts change per commit and are not recorded here; run `npm run check` for the current result. At the time of writing, `packages/trustee` and `packages/cli` tests were failing after the election-open change (QV-ADR-015) and were being updated. See [[Testing and Conformance]]. |
| Typecheck | Passes (`npm run typecheck`, 2026-10-21). |
| Test vectors | Candidate sets in `test-vectors/v1`. No independent implementation has reproduced them yet. |
| Public claims | Claims register v0 in `docs/claims/claims-register-v0.md`. It is a working draft and has not been approved by a security reviewer. |
| Claims lint | `scripts/lint-claims.mjs` flags banned or overstated wording in documentation. It runs in CI as a non-blocking job. |
| Dependency snapshot | `docs/reports/dependency-licence-snapshot.md` lists 32 third-party packages, all with permissive licences. It is a snapshot, not legal advice. |
| Audit | None. Planned in spec 11 section 9. |
| Release | None. |
| Licence | AGPL-3.0-or-later (`LICENSE` file present). |

Read the [README](https://github.com/djshellshoxxx/quietvote/blob/main/README.md) for the project's own status statement.

## Known gaps

- **Failing tests.** Trustee and CLI tests fail until they emit/accept the QV-ADR-015 election-open fields. Check CI for the current state.
- **Layering.** `packages/cli` imports `packages/verifier` in-process. This breaks the dependency rule in spec 08 section 5.1 (D1). The rule is not checked by CI here. See `packages/cli/NOTES.md`.
- **Protocol byte details.** Some QV-16 details are still open. Deviations and spec errata are listed in `packages/protocol/NOTES.md`.
- **Browser end-to-end tests.** Playwright tests in `packages/web/e2e` are not part of `npm test`.
- **Trustee tool.** Ceremonies are tested only with simulated parties. Windows file permissions are a known gap (`packages/trustee/NOTES.md`).
- **CI gaps.** No DCO check, no ESLint configuration, and no reproducible-build check are in CI yet.
- **Independent review.** None has been done. A second independent verifier implementation does not exist.

## Indicative phases (from the roadmap)

The project roadmap ([docs/plan/ROADMAP.md](https://github.com/djshellshoxxx/quietvote/blob/main/docs/plan/ROADMAP.md)) is a draft with indicative dates and effort estimates. Summary:

| Phase | Goal |
|---|---|
| P0 | Close open decisions, freeze wire formats, set up governance and CI |
| P1 | Core cryptography and protocol packages, test vectors |
| P2 | Bulletin board, server, election lifecycle |
| P3 | CLI, trustee tool and web client |
| P4 | Independent verifier and a second implementation |
| P5 | Hardening, external cryptographic review and audit |
| P6 | Beta pilot, including at least one real external election (v0.9) |
| P7 | Version 1.0 |

Dates are not commitments. The 14-day plan is in [docs/plan/NEXT-STEPS.md](https://github.com/djshellshoxxx/quietvote/blob/main/docs/plan/NEXT-STEPS.md).

## Planned release criteria

- **v0.9:** pilot release (spec 02 section 10).
- **v1.0:** general release.
- Both require the assurance gates in spec 11 section 11 and independent review. Nothing becomes ready until those gates pass.

## Phases

- **Phase 1:** secret ballot with public participation. The planned MVP.
- **Phase 2:** unlinkable ballots via blind tokens.
- **Phase 3:** registrar-free anonymous membership (research).
- Later: ranked methods, weighting, delegation, maintainer-hosted service, federation.

Full list of claims that are not yet supported: [docs/claims/claims-register-v0.md](https://github.com/djshellshoxxx/quietvote/blob/main/docs/claims/claims-register-v0.md). Full list of specifications: [[Specification Index]].
