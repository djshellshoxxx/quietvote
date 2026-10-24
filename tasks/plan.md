# Ordinary help and presentation work — 2026-10-24

## Baseline and scope

Repository: `djshellshoxxx/quietvote` only. The saved `work` branch was clean at
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` (documentation-only main). Read-only
remote inspection confirmed the supplied heads. No AGENTS.md or CLAUDE.md exists
in the selected baseline or its workspace ancestors.

Work branch: `feature/ordinary-ux-20261024`, starting at web-triage
`e9d4cd3416371c2c825ee855c5f84f39c4a53b2d`. This includes the complete implementation
and web changes. Its common ancestor with the sibling crypto branch is
`7b4826a2681224c86605ad71a62fbd7877343b66`; neither head contains the other.
QA head `563eec8659184e32771244088d59acc5035fa798` adds only handoff documentation
beyond the web branch's ancestry. No sibling security changes will be merged.
Existing specs, package notes, TODOs and handoffs were inspected as context;
their historical test counts are not evidence for this work.

## Finite implementation

1. Navigation worker: a small click predicate and unit tests so internal links
   preserve modified and non-primary clicks. Integrator wires it into the shell.
   Acceptance: primary unmodified clicks use SPA navigation; Ctrl/Meta/Shift/Alt,
   non-primary and already-cancelled clicks retain browser handling.
2. Integrator: complete existing Help display controls with the catalog's existing
   theme labels, restore selected state on revisit, and implement explicit dark
   and light palettes. Preferences last for the current page session. Acceptance:
   light/dark/automatic and contrast controls accurately reflect the document
   attributes after navigating away and back; automatic follows the device.
3. Documentation worker: add an accessibility/help guide and draft-translation
   workflow notes, with wiki entry links. Acceptance: documented controls match
   implementation; no translation is marked reviewed and no new assurance claims.
4. Integrator: review changes, run fresh ordinary focused regression tests and
   repository typecheck, record exact commands/results, commit locally, and write
   a handoff with final branch/HEAD, changed paths and remaining limits.

Dependencies: tasks 1 and 3 can run independently; integration follows task 1;
verification follows all changes. One integrator and two inexpensive workers.
Use Git workflow, planning, parallel-agent and incremental implementation skills.

## Boundaries

No nonce/crypto review, role/trust-anchor/export review, browser-verifier tranche,
security-critical verification, authority or trust changes. No browser election
flow, real elections or user data. No companion repository changes. No pushes,
PR mutations, uploads, deployment, releases or credentials. Existing guarantee
copy and translation review gates remain outside this change. Tests are ordinary
regressions, never independent security acceptance. Local files and commits are
ephemeral until separately approved publication.
