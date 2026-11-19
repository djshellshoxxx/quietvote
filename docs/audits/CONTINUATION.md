# Consolidation continuation and promotion gates

The engineering candidate is published in
[PR #71](https://github.com/djshellshoxxx/quietvote/pull/71), branch
`codex/quietvote-comprehensive-consolidation`. The first candidate is published,
later implementation remains local, and follow-up reviews and remaining feasible
engineering are ongoing. The 11 source PRs carry their preservation/status
reference. No original branch was deleted. The PR remains a draft; this is an
interruption checkpoint, not an assertion of completion or release authorization.

## Immutable source receipt

- Initial main: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- First published candidate: `ddf58d6168e2b8bc5069689400538be8e9b85180`.
- Its exact tree: `8dbfbe91c7d3551fa70700ee8723ecb280ca2096`.
- Matching local engineering candidate: `be098bee3498ca0de742008c3067f0727862b117`.
- First reviewed production composition: `363f7ed38001090d0a7e00a549288b525aaf8bda`,
  tree `bee114e8bdcf584393dbbd0ebe707b70568eb7f2`. Changes from that source to the
  first publication are audit/report documentation only.
- Later committed implementation: `ba728be0140751bc77d464db32c5f9dc110dd007`,
  tree `bf64cc5646a8eebc57fceae891a60d716399959b`. This adds compact catalog
  representation, timezone/DST input, separate-origin operation, actual
  publication/router/redirect regressions, Home/IPv6 compatibility and hosted
  server failure corrections. It requires its own publication and qualification.

Git object hashes were verified after publication, and the fetched remote tree
compares byte-for-byte equal to the local candidate. The original source parents
retain 65 of the 72 initial remote tips in ancestry. The current head and live
qualification state are on [the PR checks page](https://github.com/djshellshoxxx/quietvote/pull/71/checks).
Report-only follow-ups must identify their parent and keep the production diff
empty; any later code repair requires fresh affected tests and hosted checks.

## Remaining execution

1. Complete the independent recovery and UI follow-up reviews on the later
   committed source. Latest-source scoped web and changed-browser-journey
   typechecks have passed; final focused checks and deterministic build remain
   in progress. Preserve earlier reviews and add source-specific receipts.
2. Finish ordinary missing wiring identified by the requirements audit:
   disclosed session-only storage and native Windows private-file ACLs. Both
   already have adopted requirements and feasible implementation paths; neither
   is a new product-policy blocker. Keep their qualification separate from the
   unrelated WebCrypto-free wrapping and protocol-version decisions.
3. Commit the final reports and publish the exact complete tree as a normal
   fast-forward successor of the then-current PR head. Verify the remote tree
   against the local target; do not rewrite original source history.
4. Observe the current-head full matrix, not a historical baseline. The initial
   qualification runs are [27-job CI](https://github.com/djshellshoxxx/quietvote/actions/runs/44493061333),
   [claims and blocking documentation checks](https://github.com/djshellshoxxx/quietvote/actions/runs/44493050749),
   and [pseudo-locale visual checks](https://github.com/djshellshoxxx/quietvote/actions/runs/44493050632).
   If a later documentation update supersedes them, follow the current PR head's
   replacement runs. A queued job with no runner has executed no assertions.
5. Inspect an actual failing step and its log before changing code. Return a
   confirmed defect to its implementation scope, preserve a distinguishing
   regression, then revalidate the correction. Keep all nine browser journeys,
   original supported OS/Node matrix, budgets, assertions and security gates.
6. Once all applicable checks pass, update the verification receipt with the
   qualified commit/run identifiers and mark the PR ready for formal review.
   Full local typechecking/import execution and Chromium were constrained by the
   local environment; their incomplete runs are not substitute passes.
7. Obtain the required formal reviews: two for these sensitive paths, including
   a designated security reviewer. MAINTAINERS currently records no appointment.
   Resolve the historical missing-DCO provenance decision with the actual project
   owner/authors; do not invent old sign-offs or rewrite unrelated history.
8. Merge only when the repository's applicable review, conversation, provenance
   and check requirements permit. Otherwise retain the candidate and record the
   exact outstanding gate. No deployment, release, force push or remote branch
   deletion is authorized by this handoff.

The first full CI run passes type/supply-chain gates, conformance/build and all
eight original browser journeys. Completed server/web failures share three
server causes repaired by 65b47fb; their 379 web tests pass. Claims/docs and
visual checks also pass. These are first-head results, not qualification of the
new ninth journey or later source. Refresh final totals from the current runs.

Local execution has repeatedly disconnected and returned with files intact.
Inspect HEAD and dirty files after restoration before resuming an interrupted
patch. The externally preserved [interruption comment](https://github.com/djshellshoxxx/quietvote/pull/71#issuecomment-7006512986)
records the state before workspace recovery. Explicitly supersede its unpublished
source statement after successful publication.

## Reproducing the checked setup

Use a supported Node 22/24 environment and the existing lockfile. Install with
`npm ci --ignore-scripts`, then `npm run vendor:install`. The explicit vendor
step is required after every clean npm installation. Python verification uses
the standard library. The primary CI workflow defines the full suite;
individual successful batches and their limits are in
[FINAL_VERIFICATION](FINAL_VERIFICATION.md),
[INDEPENDENT_REVIEW](INDEPENDENT_REVIEW.md) and
[INDEPENDENT_BUILD_REVIEW](INDEPENDENT_BUILD_REVIEW.md).

[UNFINISHED_WORK](UNFINISHED_WORK.md) distinguishes the adopted implementations
from unresolved governance, signed-freshness, interface-policy and external
qualification work. Passing CI alone does not adopt those missing contracts or
qualify a production election.
