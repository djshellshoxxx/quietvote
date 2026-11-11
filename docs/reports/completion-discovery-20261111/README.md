# Completion-cycle discovery reports — 2026-11-11

**Status label: AI-assisted static survey and digest. It is not an independent professional
review. QuietVote remains unaudited and not for real elections.**

These files were produced on 2026-11-11 by read-only survey agents working on the cumulative
implementation tip `ab84f16136184cb1fa0fa67b41e113424e134ba8`
(`codex/quietvote-milestone-20261109`). They are inputs for planning, kept so the next session
does not have to repeat the reading. Summary and next steps are in
[the handoff](../../handoffs/QUIETVOTE-COMPLETION-20261111.md).

## How to read them

- The surveys **read** code and documents. They did not run tests, builds or browsers.
  Every defect they describe is labelled SUSPECTED and has not been reproduced.
  Do not cite one as a confirmed finding before a failing test demonstrates it.
- Where a report says UNVERIFIED, the author could not check the statement.
- Line numbers refer to `ab84f16` and will drift.
- Planning ledgers under `docs/plan/` are partly stale. The digests record which entries the
  code contradicts.
- The reports quote repository records about owner decisions. Those quotes do not decide
  anything. Section 5 of the handoff lists what the owner still has to settle.

## Files

| File | Content |
|---|---|
| [feature-inventory.md](feature-inventory.md) | Voting model as specified, with citations; v1 feature list by spec and requirement range; scope deferred from v1; spec gaps noticed. |
| [open-work-plan-ledgers.md](open-work-plan-ledgers.md) | Deduplicated open work from `docs/plan/*`, errata and handoffs: decision-free engineering, owner decisions, external gates, environment-limited items, stale ledger entries. |
| [open-work-audit-ledger.md](open-work-audit-ledger.md) | Every audit-ledger finding that is not plainly fixed, checked against the code, with class and suggested regression test. |
| [code-survey-core.md](code-survey-core.md) | `crypto`, `protocol`, `board`, `verifier`, `verifier-py`: lifecycle, voting methods, tally and verification, test-coverage map for critical invariants, suspected risks. |
| [code-survey-backend.md](code-survey-backend.md) | `server`, `cli`, `trustee`: all 56 HTTP routes with authorization, persistence and transactions, CLI commands, operator workflow parity matrix, suspected risks. |
| [code-survey-web.md](code-survey-web.md) | `web`: routes, voter and organizer journeys as coded, cast-state handling, security posture, accessibility and localization, suspected defects. |
| [zero-codex-pr-review.md](zero-codex-pr-review.md) | Static review of PRs #32 to #41 before they were merged into `integration/quietvote-completion`. |
| [zero-codex-red-green.tsv](zero-codex-red-green.tsv) | Executed check: each PR's new regression test fails on `ab84f16` and passes on the PR head. |
| [qualification-ab84f16.tsv](qualification-ab84f16.tsv) | Local qualification of the milestone tip: step, exit status, seconds. |
| [qualification-31f13e4.tsv](qualification-31f13e4.tsv) | The same steps on the integration head after the ten merges. |

Both qualification runs used Linux, Node 22.23.4, npm 10.9.9, Python 3.13.18 and
`npm ci --ignore-scripts --no-fund`. Exit status 1 for `50-compare-verifiers` and
`63-claims-lint` is the known, deliberately preserved state. Browser journeys and
Windows/macOS were not run locally.
