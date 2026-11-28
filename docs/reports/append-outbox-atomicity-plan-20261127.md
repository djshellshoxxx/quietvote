# Append outbox atomicity: reproduced gap and proposed increment

Date: 2026-11-27 (America/Vancouver). This records the reproduction and plan
reviewed before production edits. The approved implementation and final evidence
are recorded in [the execution report](append-outbox-atomicity-20261127.md).
The frozen archive-migration worktree is unchanged.

## Accepted contract and observed gap

[Server inventory task 5](inventory-20261111/server.tasks.md#5-move-phasealert-outbox-rows-into-the-append-transaction-qv-28-req-005)
and [QV-28-REQ-005](../28-data-model-storage.md) require append, checkpoint,
projection and phase/alert outbox rows to commit or roll back together. Publication
must follow commit. Existing recovery prevents permanent supplemental event loss
but does not make the original append transaction atomic.

The current `processLocked` commits the board, `project`, entry/checkpoint events
and `append_completion` intent first. It then raises the independent runtime
anchor, awaits `apply`, finalizes archive erasure if needed, synchronizes state,
and tries `completeAppendEvents` in another transaction. Its failure is logged and
swallowed before returning an included receipt.

The new `append-outbox-atomicity.test.ts` inserts a real manifest through HTTP and
throws after phase insertion but before its transaction commits. The baseline
result is:

| Observation | Baseline | Required for this failed append |
|---|---:|---:|
| HTTP status | 201 | 500 |
| Durable log entries | 1 | 0 |
| Durable checkpoints | 1 | 0 |
| Pending completion intents | 1 | 0 |
| Persisted state / tree size | SETUP / 1 | DRAFT / 0 |
| Durable events | entry, checkpoint | none |
| Live / webhook callbacks | entry, checkpoint | none |
| Independent runtime anchor size | 1 | 0 |

The expected 500 follows the existing handler for the injected internal error;
the acceptance requirement is complete rollback and absence of publication.

The existing `outbox-rollback.test.ts` passes on the same snapshot because it
explicitly expects the successful entry and only prevents publishing a rolled-back
phase event ID. The new acceptance test fails with the complete structured
observation above. No endpoint discovery, external target or production data was
used.

## Proposed minimal correction

1. **Share a synchronous lifecycle projection.** Extract the existing mapping
   from admitted entry type/control action to lifecycle event and use the current
   pure `transition` function to derive the next state and `phase_seq`. Both live
   replay/application and the append transaction use that mapping, so no separate
   lifecycle policy is introduced. Preserve control authentication and sequence
   validation, including invalidation/pause/resume behavior.
2. **Commit append-generated rows together.** Within the existing synchronous
   `edb.tx`, commit the entry, Merkle/checkpoint data, current `project` effects,
   next persisted state/title/tree size, phase row and any append-generated
   quarantine alert. Do not mutate the `ElectionState` projection before commit. Keep
   event publication and the alerted-memory flag outside a successful transaction.
3. **Retain explicit completion intent semantics.** Add one new, forward-only
   migration column: `append_completion.events_committed`, integer 0/1 with default
   0. Existing pending intents retain their legacy meaning. New appends insert
   their intent with flag 1 in the same transaction as all generated event rows.
   This avoids inferring completion from possibly absent/pruned event rows, adding
   an undocumented metadata format, or silently changing old intent semantics.
4. **Preserve post-commit ordering.** Raise the independent control-database anchor
   only after the election commit. Then run existing asynchronous `apply`/DKG,
   archive key destruction and registry synchronization. Clear the intent only
   after those succeed. New flagged intents need no event regeneration; legacy
   flag-0 intents retain existing timestamped phase/alert reconstruction. Physical
   reader retirement still follows completion, with the existing failure closure.
   Standalone quarantine/witness events retain their existing maintenance transactions.
5. **Keep ordinary failures fail closed.** A first-transaction event/projection
   failure propagates and rolls back every append row. Preserve the existing
   poisoned-runtime handling when the in-memory Merkle tree ran ahead. Failures
   after a real commit retain their intent and source rows for recovery; they
   must not expose unanchored publication or fabricate a duplicate event.

An asynchronous callback must not be placed inside `edb.tx`: its helper commits
synchronously when the callback returns, and waiting with a shared SQLite handle
would introduce unrelated interleavings. The only awaited operation inside
`apply` is DKG adjudication at the `dkg-r3-close` marker; that marker has no phase
transition. Keeping that computation in the existing post-commit/replay path
preserves its behavior without holding a SQLite transaction across `await`.

## Compatibility and bounded scope

The proposed flag is a storage-only schema increment; all existing SQL bytes stay
unchanged. The inventory must gain the C3 operations column. Existing migration
backups/invariant checks, OPEN upgrade refusal and explicit terminal migration
rules remain applicable. Older binaries will refuse the newer schema rather than
interpret new pending intents using the old generation behavior.

New-schema archive recovery can encounter an already-persisted `ARCHIVED` state
while key destruction or registry synchronization is still pending. Task9's
read-only probe plus explicit recovery writer already handles that combination;
tests must retain the intent until key destruction and final projections finish.
The change does not attempt a cross-database atomic commit: the independent
anchor and control registry continue to use their existing durable recovery order.

No protocol, public record encoding, author-pin, verifier or acceptance-policy
decision appears necessary. The storage flag and the shared transition extraction
are the substantive review choices before production edits. A row-presence-only
deduplication shortcut is not recommended because it cannot distinguish all
legacy/no-phase/pruned histories explicitly.

## Required distinguishing verification

- Make the new first-transaction failure test pass, including unchanged anchor and
  no live/webhook publication; cover a fault before phase insertion and one after
  all event inserts but before commit.
- Cover real `election_open`, pause/resume, close, tally and audit-close transitions
  with exactly one durable phase event and existing SSE resume semantics.
- Keep real asynchronous DKG processing and restart replay unchanged; do not hold
  the election transaction while awaiting adjudication.
- Migrate an actual prior-schema pending intent to flag 0 and reconstruct its
  event exactly once with the original timestamp. Completed/pruned historical
  events must remain absent.
- Crash after a new append commit: phase events already exist; startup finishes
  projections/anchor/key destruction and deletes its flag-1 intent without
  regenerating events. Retain second-crash and registry-failure coverage.
- Inject independent-anchor persistence failure and require no callback/receipt
  escape until recovery. Retain archive key erasure, physical reader retirement
  and retention guards.
- Run the focused outbox, supplemental recovery, replay-completion, runtime-anchor,
  archive maintenance and lifecycle tests, plus affected schema/data-inventory
  checks. Update old supplemental-failure tests to exercise the correct legacy
  boundary explicitly instead of weakening their recovery assertions.

## Snapshot identity

Detached base `6764bf231801a782a57b2778a344c6ab26063e9b`; current root server
source/tests were copied into `quietvote-outbox-atomic` for isolated reproduction.
Independent `npm ci --ignore-scripts --offline` and pinned vendor installation
completed successfully. Source blobs examined:

| File | Git blob |
|---|---|
| `packages/server/src/election.ts` | `76ec0bf99cf31e737ecb15e22abc23e691403378` |
| `packages/server/src/electiondb.ts` | `5f383c1b4d93907b7c8ae8a37da96cd7e0b01e09` |
| `packages/server/src/controldb.ts` | `fc565f2e4415ab785079183733a769ee81df1cdb` |
| `packages/server/src/db.ts` | `274b44cdb460bac3fd2fe267baa16a2c78ed6861` |
| `packages/server/src/pool.ts` | `5445b6fa568cb1a1216d8738f6438595fef6fdbf` |
| `packages/server/src/lifecycle.ts` | `d188582e116ee8e2b9c49c44fd62f1e62ec22f51` |
| Existing `outbox-rollback.test.ts` | `886f30a5be969de2166392678b7aa548d1521ffc` |
| New `append-outbox-atomicity.test.ts` | `b216358af73ac9863151916c865722163ceb81f4` |
