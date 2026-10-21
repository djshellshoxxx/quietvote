# Roadmap and Status

> **Draft – unaudited software.** Not for real elections.

## Current status

| Item | State |
|---|---|
| Stage | Pre-release. Specifications are drafts; implementation code exists in all eight packages |
| Specifications | All QV-00 to QV-35 are Draft. No spec is in Review or Approved. Owner review is not recorded |
| Code | Eight packages with implementation code and a `test/` folder each. Known gaps are in each `packages/*/NOTES.md` |
| Tests | Test folders exist in every package. Results are not restated here; re-run `npm test` |
| Typecheck | Failed on the 2026-10-21 re-run of the working tree (errors in `packages/server` and `packages/board` tests). Tracked as TODO N-01; a note on commit `c8348f4` records a pass, so confirm the current state |
| Test vectors | `test-vectors/v1` exists with status `candidate`; the manifest is unsigned |
| CI | One workflow: typecheck and test matrix. Claims lint runs but does not block. No lint, SAST, SBOM or reproducible-build step yet |
| Audit | None. Planned in spec 11 section 9 |
| Release | None |
| Licence | AGPL-3.0-or-later (`LICENSE`; decision QV-ADR-011). The documentation licence still needs counsel review (D-74) |

Read the [README](https://github.com/djshellshoxxx/quietvote/blob/main/README.md) for the project's own status statement. The consolidated open-work list is [docs/plan/TODO.md](https://github.com/djshellshoxxx/quietvote/blob/main/docs/plan/TODO.md).

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

Dates are not commitments.

## Planned release criteria

- **v0.9:** pilot release (spec 02 section 10).
- **v1.0:** general release.
- Both require the assurance gates in spec 11 section 11 and independent review. Nothing becomes ready until those gates pass.

## Phases

- **Phase 1:** secret ballot with public participation. The planned MVP.
- **Phase 2:** unlinkable ballots via blind tokens.
- **Phase 3:** registrar-free anonymous membership (research).
- Later: ranked methods, weighting, delegation, maintainer-hosted service, federation.

## Known gaps in the repo

- The typecheck is failing on the last re-run (see above).
- No ESLint configuration yet.
- No release signing, reproducible-build check or SBOM.
- The claims lint is non-blocking in CI.

Full list: [[Specification Index]].
