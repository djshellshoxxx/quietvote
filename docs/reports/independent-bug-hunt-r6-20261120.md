# QuietVote independent bug hunt R6: hosted qualification and backup handoff

Date: 2026-11-20 UTC. Fresh worker: `bug_hunt_r6`. This is an independent
functional review of draft PR #71, not an appointed release or security approval.

Reviewed head: `a5e5d19b6213dd4477b849deda7a3c837ea7fce0`.
Reviewed tree: `a5aa203ca47b10e0aa1fb63d3fc913933cc0e053`.

## Source binding and completed hosted results

The commit-associated workflow query reports [CI run 44762725138](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138)
completed successfully. Its latest-attempt jobs response contains 27 jobs and
27 successful conclusions. [Claims lint 44762725009](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725009)
and [pseudo-locale visual checks 44762725141](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725141)
also report completed success for this head.

The three independently downloaded job logs below identify the actual checkout
as GitHub's PR merge commit `ad918eeefd7dd20d26db1a3b55cd750f3c0b8994`.
Fetching that exact Git object established its parents as main
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` and the reviewed head above. Its tree
is exactly `a5aa203ca47b10e0aa1fb63d3fc913933cc0e053`; `git diff --stat` between
the candidate and merge commit is empty. These are therefore tests of the same
source tree, rather than an assumption based only on a green PR status.

| Hosted job | Observed runtime and command | Observed result |
| --- | --- | --- |
| [Windows CLI + board, 136379171083](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138/job/136379171083) | Windows 2025 image `20261116.315.1`, Node `v24.22.3`; CLI's existing npm script receives `--test-concurrency=2`; the following board command has no added flag. | CLI: 151 tests, 145 passed, 0 failed, 6 skipped, 0 cancelled. Board: 78 tests, all passed, 0 skipped/cancelled. |
| [Windows server + web, 136379171373](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138/job/136379171373) | Windows 2025 image `20261116.315.1`, Node `v24.22.3`; server's existing npm script receives `--test-concurrency=2`; web retains its existing command. | Server: 359 tests, 352 passed, 0 failed, 7 skipped, 0 cancelled. Web: 441 tests, all passed, 0 skipped/cancelled. |
| [Production browser, 136379169863](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138/job/136379169863) | Ubuntu 24 image `20261116.133.1`, Node `v24.22.3`; existing required-journey runner. | All nine journey groups execute and the step/job succeeds: `run`, `help`, `a11y`, `verifier`, `spoil-shares`, `server`, `registration`, `device-settings`, `split-origin`. |

The browser log specifically records 49/49 automated accessibility checks,
29/29 verifier checks, all four server integration cases, the registration case
and the split-origin case. The device-settings journey includes explicit
page-session storage through SPA retry navigation and its disclosed reload loss.
The split-origin completion names registration, scoped same-ID storage/cache,
read-key refusal, SSE resume, cast/receipt, organizer creation/publication and
strict serving policies. Automated accessibility checks remain distinct from
assistive-technology testing or a conformance certification.

## What the Windows observation establishes

The previous [fan-out isolation report](windows-node24-native-fixture-ci-cap-20261120.md)
records 25 successful jobs and two failed Windows Node 24 jobs on the preceding
source. This fresh review confirms a completed passing run of the changed
source, including the unchanged real-clock executable election case and the
server suite containing the enrollment-review fixture.

It does not identify why a native helper previously exceeded its deadline or
prove that the concurrency cap prevents all recurrences. One completed passing
run is source-specific qualification, not a reliability estimate or a native
PowerShell, ACL, compilation or startup root-cause diagnosis. Native deadlines,
original assertions, platform coverage and fail-closed behavior were not changed
by this review. The listed skips are not counted as executed tests.

## Accepted operational gap and existing restore boundary

The reviewed source has `online admin-status` and signed `online job-inspect`,
but no command in `packages/cli/src/main.ts` that creates an administrator backup.
The API contract in [QV-09 section 10](../09-api-data-contracts.md#10-export-import-jobs-admin)
and `packages/server/src/ext-routes.ts` already define signed
`POST /api/v1/admin/backups` with an explicit idempotency key and either
`{scope:"all"}` or `{scope:"election", election_id}`. The server creates a job;
its existing admin authorization and validation remain authoritative.

This supports a narrow online backup-creation adapter using the existing request
framing and job-inspection command. The integration owner is implementing that
adapter separately. This report does not review or qualify code written after
the head recorded above.

Restore is already supplied separately by `packages/server/bin/qv-backup.ts`
and [the offline recovery guide](../OFFLINE-BACKUP-RESTORE.md). That tool verifies
full `qv-backup/v1` snapshots and restores into a new directory with the original
KEK and an explicit minimum-backup floor. Election-only snapshots are not full
recovery inputs. A new online command should link to that workflow and preserve
this distinction. Job acceptance or completion alone does not establish
independent recovery verification, external retention or freshness.

The CLI README's broad remaining-gap wording should be narrowed when the
adapter is integrated: an absent online creation command is not evidence that
the separately shipped offline restore executable is absent. Remote encrypted
backup transport, scheduling, retention and production recovery objectives are
separate from the adapter and remain subject to their existing evidence limits.

## Fresh-worker handoff

Review the next composed source, with a new exact commit/tree receipt. The most
useful bounded functional checks are:

1. Create an `all` backup through the actual signed CLI/server path, inspect its
   job with `job-inspect`, and check the completed server-local snapshot manifest.
   An explicit replay of the same request/idempotency key should identify the
   same job rather than creating another backup.
2. Exercise the normal election-scope path and check the request shape against
   the existing API. Require the election identifier for election scope and
   refuse it for all scope; local usage errors should precede key loading and
   network submission.
3. Keep protected-key stdin/file behavior, existing response bounds and the
   unknown-mutation-outcome/no-automatic-retry behavior intact. Check that help
   and examples connect creation, job inspection and separate offline recovery
   without claiming an accepted job is already a verified recovery artifact.
4. Assign subsequent hosted checks only to their actual source tree. If native
   helper availability fails again, retain the existing deadlines and assertions
   and use benign timing evidence before making a causal claim or another change.

No additional local runtime suite was necessary for this read-only CI
qualification and command-inventory finding. No new normal-path runtime defect
is confirmed in this bounded pass. No local Chromium run, stopped
background-runtime investigation, vulnerability reproduction, branch publication,
release or deployment was performed.
