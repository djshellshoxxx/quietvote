# Roadmap and Status

> **Draft – unaudited software.** Not for real elections.

## Current status

| Item | State |
|---|---|
| Stage | Early implementation; specs are drafts |
| Specifications | Written but unresolved in places. Acceptance criteria are not complete. |
| Code | Workspaces with code and tests: `board`, `cli`, `crypto`, `protocol`, `server`, `trustee`, `verifier`, `web`. Unaudited and incomplete. |
| Tests | Counts change per commit; see CI (`npm run check`). Test vectors exist under `test-vectors/` (see [[Testing and Conformance]]). |
| Typecheck | As of commit `c8348f4`: `npm run typecheck` passes. Other sessions are changing the code; rerun to confirm (see [[Getting Started Dev]]). |
| Audit | None. Planned in spec 11 section 9. |
| Release | None |
| Licence | AGPL-3.0-or-later (see `LICENSE`) |

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

- No ESLint config yet. A CI workflow (`.github/workflows/ci.yml`), `DCO` and `LICENSE` files exist.
- One failing test at the commit above (see Tests).

Full list: [[Specification Index]].
