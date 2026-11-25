# Independent recovery follow-up

Status: **completed narrow engineering review; no new confirmed defect found in
the reviewed repair**. The focused tests below passed on the exact combined
source. This is not formal GitHub approval, an external audit or release approval.

## Source and independence

- Reviewed combined source: `ba728be0140751bc77d464db32c5f9dc110dd007`.
- Exact source tree: `bf64cc5646a8eebc57fceae891a60d716399959b`.
- Repair reviewed: `65b47fb284c08f2c8fee5317a249ff6d372b0333`.
- Isolated reviewer branch: `worker/quietvote-final-recovery-review`.

The reviewer authored no production implementation or test changes. The review
used a new isolated worktree at the combined source above. The only resulting
repository change is this report; its own report-only commit is not part of the
source-tree identifier. The earlier [core review](INDEPENDENT_REVIEW.md) is
preserved with its original scope and evidence limits.

The initial follow-up attempt was interrupted by an unavailable execution
environment and produced no completed test evidence. After recovery, the reviewer
checked the partial worktree operation, completed isolation at the expected head,
and reran the checks recorded here. This receipt replaces that interrupted status
only for this recovery scope. Frontend, timezone, separate-origin, storage and CSP
qualification belong to the separate surface review and final hosted CI.

## Condition and guard review

The production delta changes only the recovery predicate and comments in
`packages/server/src/pool.ts`, `ElectionPool.recoverStored`. There are no additional
server production changes between the repair and the reviewed combined head.

Previously every owned election lacking a runtime anchor requested startup
replay, including an untouched zero-entry draft. The new condition preserves the
existing explicit append-completion trigger and requests anchor recovery as
follows:

| Owned-election condition | Startup replay behavior |
| --- | --- |
| Unfinished append completion | Requested regardless of the anchor predicate. |
| Missing anchor and nonempty log | Requested; the independent floor must be recovered. |
| Existing anchor whose size differs from the stored log | Requested, including a newer floor ahead of an empty rollback. |
| Missing anchor, empty log, no append completion | Deferred until runtime acquisition. |
| Existing same-size anchor, no append completion | Unchanged by this repair; runtime acquisition still checks identity, root and quarantine. |

Deferring runtime acquisition does not create signing authority. The reviewer
checked the unchanged `ElectionRuntime.refreshRollbackGuard`, signing callbacks,
`assertHealthy`, configured-peer acquisition, and mutex-protected deletion path.
The repair does not mark reopened drafts as freshly created, remove an independent
floor, clear quarantine, fabricate checkpoint evidence or bypass the archive
export condition. Durable response receipts and export-job recovery still run in
the stored-database visit even when runtime opening is deferred.

The four added startup regressions exercise the distinction directly:

- Empty drafts remain unopened during response recovery, with and without
  configured peers. In the no-peer case, later ordinary acquisition and manifest
  submission still succeed and establish the floor.
- A reopened empty draft with configured peers cannot produce a checkpoint,
  admit a manifest or be removed. The wrapped election key remains present, and
  no peer request is made without a stored signed checkpoint.
- A nonempty log with no append completion and no anchor still opens during
  startup, restores its exact root/size floor, and permits a byte-identical retry
  without appending another record.
- An empty election-file rollback behind a retained newer floor still opens,
  quarantines, preserves that floor, and refuses signing and deletion while
  retaining its database and wrapped key.

The fixture repairs are consistent with the implemented contracts. Admin status
now expects the existing control migration 8. The deletion diagnostic uses a real
persisted election in CEREMONY, evicts it, and exercises authoritative replay. It
retains the status/code/permitted-state message assertions and additionally checks
that the registration, wrapped key, file and log survive with no cleanup queued.
The original create-crash assertion that response-only recovery leaves zero open
runtimes remains intact. No skip, timeout increase or production guard relaxation
was introduced to obtain the passing result.

## Independently executed checks

Linux, Node **24.22.3**, unchanged repository lockfile. An offline dependency
installation lacked the cached Playwright-core tarball; ordinary
`npm ci --ignore-scripts --no-audit --no-fund` then completed successfully. The
explicit vendor installation verified both pinned packages and all **132**
verbatim files. Tests began only after successful dependency/vendor setup. The
Node slot was coordinated with the surface reviewer, and the two test commands
ran sequentially with `--test-concurrency=1`.

| Exact test-file group | Result |
| --- | --- |
| `admin.test.ts`, `operation-response-recovery.test.ts`, `pool-delete-diagnostic.test.ts` | **22 passed, 0 failed, 0 skipped, 0 cancelled; exit 0.** |
| `runtime-anchor.test.ts`, `delete-runtime-lifecycle.test.ts`, `archive-rollback-delete.test.ts`, `delete-recovery.test.ts` | **18 passed, 0 failed, 0 skipped, 0 cancelled; exit 0.** |

All paths in that table are under `packages/server/test/`. Reproduction commands:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/server/test/admin.test.ts \
  packages/server/test/operation-response-recovery.test.ts \
  packages/server/test/pool-delete-diagnostic.test.ts

node --test --test-concurrency=1 --test-reporter=spec \
  packages/server/test/runtime-anchor.test.ts \
  packages/server/test/delete-runtime-lifecycle.test.ts \
  packages/server/test/archive-rollback-delete.test.ts \
  packages/server/test/delete-recovery.test.ts
```

The second group rechecks independent-anchor identity/root conflicts, durable
floor persistence, direct and duplicate signing, configured-peer refusal, keyless
mirrors, runtime retirement before queued writers, normal reopening, tombstone
cleanup and the combined archived-export/rollback deletion guard. These results
overlap earlier receipts and must not be summed as unique repository-wide tests.
The repair author's pre-fix red baseline is recorded separately in the
[hosted repair report](../reports/hosted-ci-repair-20261119.md); it was not rerun or
claimed as this reviewer's experiment.

Logs are retained in the session evidence as
`final-recovery-review-repaired-files.log` and
`final-recovery-review-guards.log`, with setup logs sharing that prefix. The
worktree remained at the exact source/tree above through both completed runs.

## Qualification limits

This follow-up verifies the narrow recovery repair and the listed adjacent
guards. It does not replace the earlier core review, the separate final surface
review or CI on the final published head. No full-root typecheck, broad imports
suite, production-browser journey, deployment or release was performed here.
The earlier imports SIGKILL and local Chromium launch limitations remain explicit
in their original receipts; this passing focused run does not turn them into
passes. Repository-required formal approvals and the designated security-reviewer
requirement remain outstanding obligations outside this engineering receipt.
