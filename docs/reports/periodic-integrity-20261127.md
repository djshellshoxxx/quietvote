# Periodic integrity work — 2026-11-27

## Accepted scope and observed gap

Base: published PR #79 commit `f7e055d839a369f27a1be2c7a2653340a74a4862`.
This implements board/verifier inventory task 9's bounded scheduler acceptance,
using [QV-18-REQ-053/054](../18-bulletin-board-transparency.md) and the existing
configuration and audit contracts.

On the baseline, configured startup anchor acquisition already ran through
`ElectionRuntime.open`/`refreshRollbackGuard`, and `GossipService` already had an
optional interval. Its real-timer test observed outgoing rounds; direct tests
covered ahead-peer quarantine. However, `selfAuditWork` was submitted only by the
manual administrator route. There was no six-hour scheduler, as the package NOTES
explicitly acknowledged.

A new regression against the unchanged baseline advanced a mocked interval to
exactly six hours after real server startup. It failed at the specific missing
job admission: **0 jobs instead of 1**. No six-hour sleep was used.

## Implementation

[`self-audit.ts`](../../packages/server/src/self-audit.ts) adds an 82-line scheduler.
Four assembly lines in [`app.ts`](../../packages/server/src/app.ts) import,
construct, start and stop it. The six-hour interval is an internal constant;
there is no new configuration option, persistent schema or SQL migration.

The first sweep is eligible six hours after successful server startup. A sweep is
one durable `self_audit` job, admitted through the existing `JobRunner` and sharing
its FIFO execution with backups, imports and operator audit jobs. At most one
periodic sweep is queued or running. This prevents overlap and an accumulating
periodic backlog while another job is busy.

The sweep pages non-deleted registry entries in groups of 100 and yields between
elections. It invokes the existing `selfAuditWork`, preserving its snapshot
logic, quarantine/alert behavior and imported-mirror policy. An election
that becomes unavailable is reported with a fixed code and does not starve later
entries. Any such failure makes the durable job `SELF_AUDIT_INCOMPLETE`; mismatch
counts and checked/unavailable counts remain available. Raw exception text is
absent from logs and job errors.

Shutdown stops new admission before `JobRunner.stop` cancels and drains queued or
running work. Cancellation is checked again after asynchronous runtime acquisition,
before starting audit work. Storage and the data-directory lock keep their existing
shutdown ownership ordering. The scheduler never clears quarantine or reacquires a
signing key.

The supported offline restore already invokes `auditLog` for every restored runtime
before publication in [`offline-backup.ts`](../../packages/server/src/offline-backup.ts).
That gate is retained. No new immediate-startup audit policy was substituted for it.

## Deterministic acceptance and retained smoke evidence

[`self-audit-scheduler.test.ts`](../../packages/server/test/self-audit-scheduler.test.ts)
adds nine cases covering:

- No scheduling during construction; exact six-hour admission after startup,
  repeated cycles and no attempts against closed storage after stop.
- A real stored-body bit flip detected by the timed audit, a durable alert and
  quarantine, rejected append, unchanged checkpoint and a quarantine incident that
  survives restart even after the damaged bytes are restored.
- FIFO serialization behind another job and no duplicate queued/running sweeps.
- Queued cancellation, cancellation during runtime acquisition, and shutdown drain.
- Redacted admission failure with next-interval retry; unavailable-election
  isolation and a durable incomplete result followed by a successful later sweep.
- Pagination across 101 controlled registry identities, including a concurrent
  deletion. This is a scheduler seam test, not a 101-database load test.
- A real archived election and a real imported mirror checked on the interval,
  retaining read-only connections, absent signing keys, identical checkpoints and
  unchanged actual database and WAL bytes.

[`gossip.test.ts`](../../packages/server/test/gossip.test.ts) retains its existing
real-timer smoke and adds two mocked-interval cases. They pin the accepted disabled
default, then exercise the actual timer with a configured 60-second interval. An
authenticated ahead-peer note persists the independent rollback anchor, quarantine
and alert, refuses another append and leaves the checkpoint unchanged. The test
never calls `runOnce`; stopping the service drains the timer-admitted exchange.

## Evidence and limits

Linux, Node **24.22.3**, one test file at a time:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/server/test/self-audit-scheduler.test.ts \
  packages/server/test/gossip.test.ts \
  packages/server/test/jobs-start-transition.test.ts \
  packages/server/test/shutdown-drain.test.ts
```

**30/30 passed**, including all existing gossip, job-start-transition and shutdown
tests in that selection. The focused scheduler/gossip selection contributes nine
new audit tests, two new gossip tests and twelve retained gossip tests. The
baseline failure is recorded separately from the successful implementation run.

The scoped server TypeScript check passed with a 768 MiB heap:

```sh
node --max-old-space-size=768 node_modules/typescript/bin/tsc \
  -p packages/server/tsconfig.json --noEmit
```

Repository link checking passed for **3,013 links in 459 files**; whitespace checks
passed as well.

The worktree's dependency lockfile matched the installed tree used for its isolated
setup; vendor checking passed for both pinned packages and 132 verbatim files.
No dependency or lockfile changed. Existing `gossip.ts`, `config.ts`, `jobs.ts`,
`admin.ts`, `offline-backup.ts`, `election.ts` and `db.ts` have no diff.

This completes the six-hour full-log-audit increment. It does **not** claim
QV-28-REQ-020's scheduled SQLite integrity/quick checks, hourly checks or unclean-start
guarantees. It also leaves `gossipIntervalMs: 0` unchanged and therefore does not
claim default 60-second polling for all of REQ-053. Native-platform durability,
hosted CI, signed-time decisions, witness policy and human review gates remain
separate qualifications. The existing real gossip timer smoke is local evidence;
the new six-hour acceptance uses deterministic timer advancement.
