# Roadmap and Status

> **Draft – unaudited software.** Not for real elections.

## Current status

| Item | State |
|---|---|
| Stage | Pre-release. Specifications are drafts; implementation code exists in all eight packages |
| Specifications | All QV-00 to QV-35 are Draft. No spec is in Review or Approved. Owner review is not recorded |
| Code | Eight packages with implementation code and a `test/` folder each. Known gaps are in each `packages/*/NOTES.md` |
| Tests | Test folders exist in every package. Results are not restated here; re-run `npm test` |
| Typecheck | The older 2026-10-21 working-tree failure is historical. Draft PR #30 reports a passing candidate typecheck and 24 passing matrix jobs on its pinned head; this is not a main-branch or release result. Inspect the [latest PR evidence](https://github.com/djshellshoxxx/quietvote/pull/30). |
| Test vectors | `test-vectors/v1` exists with status `candidate`; the manifest is unsigned |
| CI | Draft PR #30 carries multiple CI workflows, including matrix suites, claims lint and browser visual checks. Its last recorded CI workflow had **one failed strict TS/Python verifier gate** while other jobs passed. Do not call the candidate green overall. |
| Audit | None. Planned in spec 11 section 9 |
| Release | None |
| Licence | AGPL-3.0-or-later (`LICENSE`; decision QV-ADR-011). The documentation licence still needs counsel review (D-74) |

Read the [README](https://github.com/djshellshoxxx/quietvote/blob/main/README.md) for the project's own status statement. The consolidated open-work list is [docs/plan/TODO.md](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/plan/TODO.md).

## Indicative phases (from the roadmap)

The project roadmap ([docs/plan/ROADMAP.md](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/plan/ROADMAP.md)) is a draft with indicative dates and effort estimates. Summary:

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

- Main and draft PR #30 have different source trees. Draft PR #30's reported typecheck passed; its strict TS/Python comparison still fails on held semantic differences.
- No ESLint configuration yet.
- No release signing, reproducible-build check or SBOM.
- Claims lint runs separately; non-blocking behavior must not be interpreted as claims approval.

Full list: [[Specification Index]].
