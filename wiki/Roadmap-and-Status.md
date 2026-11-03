# Roadmap and Status

> **Draft – unaudited software.** Pre-implementation. Not for real elections.

## Current status

| Item | State |
|---|---|
| Stage | Framework and pre-implementation; specs are drafts |
| Specifications | Written but unresolved in places. Acceptance criteria are not complete. |
| Code | Early scaffold. `crypto` and `board` have some code. Other packages are placeholders. |
| Tests | One smoke test. Test vectors not yet written. |
| Typecheck | Currently failing on `packages/board/src/bytes.ts` (see [[Getting Started Dev]]) |
| Audit | None. Planned in spec 11 section 9. |
| Release | None |
| Licence | Proposed, not yet in a LICENSE file |

Read the [README](https://github.com/djshellshoxxx/quietvote/blob/main/README.md) for the project's own status statement.

## Indicative phases (from the roadmap)

The project roadmap ([docs/plan/ROADMAP.md](/plan/ROADMAP.md)) is a draft with indicative dates and effort estimates. Summary:

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

- No CI workflows, ESLint config, DCO file or LICENSE file yet.
- The backlog (`docs/plan/BACKLOG.md`) is referenced by the spec index but is not in the repo.

Full list: [[Specification Index]].
