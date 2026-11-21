# QuietVote crash recovery follow-up — 2026-11-16

Base: `0f98f88`. Lane branch: `codex/qv-crash-20261116`.
This is bounded engineering work, not an audit or release approval. No
cryptography, registration bytes, authorization policy or verifier verdict was
changed. Main, release and deployment were not updated by this lane.

## Corrections

- `43a2749`: control schema v6 adds a durable election cleanup cursor. Tombstone,
  wrapped-DEK removal and cursor insertion commit together. Startup resumes
  interrupted DB/WAL/SHM removal before accepting work; persistent unlink failure
  refuses startup and releases directory ownership. Completion audit/cursor
  removal commit together. Migration queues historical DELETED rows. Existing
  election-state deletion guards remain in effect.
- `97a3212`: orphaned idempotency status=0 markers become interrupted outcomes
  under exclusive startup ownership. A matching retry receives existing
  `409 STATE_CONFLICT`, reason `IDEMPOTENCY_INTERRUPTED`, `retryable: false`.
  Internal failures after mutation, including lost response-cache writes,
  preserve the reservation. Previously the catch path dropped that marker and
  allowed same-key duplication. Request hashes and original expiry remain;
  active overlaps and completed replay retain their existing behavior.
- `0c907ec`: supplemental phase/alert events enter the publication array only
  after their transaction commits. Previously rollback after insertion could
  deliver phantom IDs to SSE/webhook callbacks, then reuse those IDs later.
  The new regression failed with that extra phase event before the change.

The management idempotency refusal path still releases a key on an ApiError
below status 500 before successful completion. Inspected current callsites:
organization key conflict precedes createOrg transaction; election quota precedes
registry insertion; invite quota precedes the single addInvites transaction;
webhook target/election/quota checks precede insertion; job runner refusal
precedes job creation; quarantine-clear ApiErrors precede the clear action.
Invite retention purge and runtime replay can independently perform maintenance.
New callsites must preserve this refusal-before-requested-mutation invariant.

## Executed evidence

Linux, Node v24.22.1. Commands are relative to the lane repository root.

| Command | Result |
|---|---|
| `node --test packages/server/test/delete-recovery.test.ts packages/server/test/admin.test.ts packages/server/test/delete-authoritative-state.test.ts` | 10 pass, 0 fail; actual HTTP deletion job, partial unlink failure, failed/successful restart, audit idempotence, historical migration and stale-registry guard |
| `node --test packages/server/test/idempotency-recovery.test.ts packages/server/test/audit.test.ts packages/server/test/negative.test.ts` | 30 pass, 0 fail; actual HTTP lost cache/audit response, no duplicate create, orphaned startup reservation, normal active overlap, mismatch and completed replay |
| `node --test packages/server/test/outbox-rollback.test.ts packages/server/test/events.test.ts packages/server/test/tally-crash-window.test.ts` | 13 pass, 1 file-level failure; events worker ended after ten passing cases without a diagnostic cause; no cause asserted |
| `node --max-old-space-size=512 --test packages/server/test/events.test.ts` | Isolated rerun: 25 pass, 0 fail |
| Outbox and tally cases in the mixed invocation | All three passed; the unrelated file-level failure means the combined command did not pass |
| `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit` | Pass on final lane source through `0c907ec` |
| `npm run typecheck` before final two fixes | Killed, exit 137, during shared-host contention; not a pass |
| `git diff --check` | Pass before each implementation commit |

These results are overlapping focused evidence, not a whole-workspace total.
The integrator must review and qualify the final combined candidate.

## Remaining boundaries

- Entry/checkpoint outbox rows already commit atomically with log append.
  Supplemental phase/alert generation still follows the append transaction and
  may be absent after a crash. Recovery of missing supplemental events and
  durable bridging to the control-database webhook outbox remain separate work.
- Management idempotency now reports uncertainty honestly; it does not reconstruct
  an original lost response or provide a distributed exactly-once transaction.
  Reconcile resources/jobs before submitting a new key after interruption.
- Deletion eligibility, export acknowledgement, backup purge/retention policy and
  SSD overwrite guarantees are unchanged. Interrupted deletion jobs may remain
  failed even when startup completes their file cleanup; inspect the tombstone
  and cleanup/audit state. Backups and exported copies are not recalled.
- Runtime phase projection, state healing and existing cryptographic replay
  contracts remain unchanged. Power-loss, nonlocal filesystem and platform-wide
  operational qualification were not established by these tests.

## Backup integration review follow-up

Independent source review found that the incoming backup verifier initially
validated paths only for live registry rows. Combining historical DELETED rows
with v6 cleanup could therefore feed a traversal path into startup unlink. The
backup worker was asked to validate all registry paths. Defense in depth was
also added directly at the unlink boundary: `cleanupDeleted` requires the exact
canonical generated path for the election ID before touching any file. The new
direct-corruption regression preserves external DB/WAL/SHM sentinel files,
refuses startup and resumes correct cleanup after operator metadata repair.
