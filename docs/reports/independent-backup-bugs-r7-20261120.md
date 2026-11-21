# Independent backup CLI functional review — R7

Date: November 20, 2026. This is a fresh worker's bounded functional review,
following the [R6 bug-hunt handoff](independent-bug-hunt-r6-20261120.md).

## Reviewed source

- Composition: `c7e32321c0a39aa24397401f5506f85bcd89d1f7`.
- Tree: `8932dc23872ff92aa33e5836e902edc531aca8d4`.
- Feature commit: `ff61e15c59c4186158ee5407f521f73172cf38d0`.
- Platform: Linux, Node `v24.22.3`.

The isolated worktree installed its own dependencies with
`npm ci --ignore-scripts --no-audit --no-fund` and `npm run vendor:install`.
The latter verified two pinned packages and installed 132 verbatim files.
Workspace imports therefore resolve to this reviewed checkout, not to another
worker's changing source. The only committed change from this review is this
report; application, test, fixture and workflow source remain unchanged.

## Result

**No new functional defect was confirmed in the scoped adapter.** Twelve
independent normal-path checks passed. These checks add observations beyond the
author's existing three feature tests; this worker did not repeat the full CLI
suite, root typecheck or hosted checks.

The review applied the diagnosing-bugs discipline to an independent checking
harness. There was no reported or observed failure to minimize, so failure
reproduction, ranked cause hypotheses and a repair were unnecessary. No defect
is inferred merely from an untested scenario.

## Distinguishing checks

| Check | Actual observation |
| --- | --- |
| Empty-instance full backup | Against a real `World` HTTP server with no organization/election, the signed CLI request used a protected admin key and a private passphrase file. It returned a valid job; that job reached `done`, and its manifest contained exactly `control.sqlite`. Paths containing spaces worked. No stdin or interactive prompt was consumed. |
| Unknown election | A normal election-scoped request for an absent canonical identifier returned exit 1 and HTTP 404 with no stdout. The control database still contained exactly the original one job. |
| Job inspection | `job-inspect` reported the completed real job with exit 0 and state `done`; an unknown valid job identifier returned exit 1 and HTTP 404, with no stdout. |
| Four valid receipt states | In the actual CLI dispatcher with a stubbed transport, `queued`, `running`, `done` and `failed` job responses each used exactly one stdin read, zero prompts and one POST. Each returned exit 0 with the corresponding state, and omitted extra `result`, `error` and `result_ref` fields from creation output. |
| Wrong passphrase | An incorrect passphrase for the protected fixture consumed stdin once, returned exit 4, emitted no stdout and sent no HTTP request. |
| Invalid options | Timeout values `0` and `120001`, a duplicated scope option and an unknown option each returned usage exit 2 before stdin, prompts or HTTP submission. |

The table groups twelve separately asserted scenarios: three actual-server
checks, four receipt-state checks, one wrong-passphrase check and four invalid
option checks. The valid-state transport responses are controlled fixtures;
this review did not force a real backup job to fail or claim to have tested
that server failure path.

The temporary harness invoked the real `run` dispatcher, the existing QVKEY1
wrapper/private fixture writer, and the existing HTTP server/job helpers. It
counted IO and requests explicitly and inspected the actual server manifest and
job count. Only descriptive pass labels were printed; no credentials or signed
headers were captured in the receipt.

```text
node /tmp/quietvote-backup-bugs-r7.mts /workspace/scratch/bd1570487e31/QuietVote-bugs-r7
12/12 independent normal-path checks passed
```

The audit harness was temporary and removed after execution. Its SHA-256 was
`488bfb20e6d62b405ec4e163d2ead4dd7f2afc193f347b8121adf6b78d6dbb64`.
Its fixtures and server instance were closed and removed in `finally` blocks.
No temporary test was added to the repository.

## Contract interpretation and documentation

The [adapter](../../packages/cli/src/cmd-online-backup.ts) delegates signing,
credential loading, timeout and mutation-outcome handling to the existing
[HTTP request helper](../../packages/cli/src/cmd-online.ts). Its response binding
matches the [implemented route](../../packages/server/src/ext-routes.ts): backup
kind, a canonical job identifier and the requested election identifier, with no
election field for full scope. The server's progress representation is a fraction
from zero to one, matching the adapter's accepted range.

Creation exit 0 is a valid job receipt, not a successful recovery verdict. The
[CLI documentation](../../packages/cli/README.md#server-local-backup-jobs)
states that distinction and directs the operator to `job-inspect`. Generic job
inspection reports server state; it does not independently verify snapshot
contents or turn a failed job into an exit-code failure. These are the existing
documented semantics, not defects introduced by this adapter.

The existing [offline recovery guide](../OFFLINE-BACKUP-RESTORE.md) supplies the
full-snapshot, original-KEK, minimum-history-floor and new-destination procedure.
Election-only snapshots do not replace those inputs. A small nonblocking
documentation improvement is to link that guide directly from the CLI README
and add `online backup-create` to its existing API-request step. This suggestion
was handed to the integration owner; this worker did not modify either file.

Separately inspected follow-up `10ea307850493bf7a1cbccd225979f823e608d64`
qualifies explicit retry by the same administrator within the existing 24-hour
idempotency window and adds SPDX comment headers to the new source/test files.
That diff changes no executable behavior. The twelve executions remain bound to
the reviewed source above; they are not a new test run of the follow-up tree.
The proposed recovery-guide links remain the integration owner's separate edit.

## Report verification

- `git diff --check`: passed.
- `node scripts/check-links.mjs`: 2,251 links in 367 files, none broken.
- `node scripts/lint-claims.mjs`: zero findings across 346 files and 45 rules.

These documentation checks were run with this report on the isolated reviewed
source. They do not replace integration checks after other reports are composed.

## Limits and fresh-worker handoff

The observations above qualify only the exact source and platform recorded
here. They do not establish Windows/macOS native behavior, hosted qualification
of a later publication, external retention, encryption, independent freshness,
recovery-time objectives or release readiness. No browser retry, native probe,
vulnerability reproduction or stopped background-runtime investigation was
performed. Formal review/provenance gates remain unchanged.

A fresh worker should bind the eventual published tree to its actual hosted
checks, including Windows Node 22/24 CLI execution. Review any integration edits
against this source before carrying the observations forward. If response,
credential or option handling changes, rerun the affected normal-path checks;
otherwise avoid repeating unchanged local suites solely for another receipt.
