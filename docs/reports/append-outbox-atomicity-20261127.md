# Atomic append outbox: implementation and local evidence

Date: 2026-11-27 (America/Vancouver). This is the bounded server inventory task 5
increment on the R27 server prerequisites identified in the
[approved reproduction and plan](append-outbox-atomicity-plan-20261127.md).
It is an isolated source handoff for review; it has not been committed or published
from this worktree.

## Requirement and distinguishing result

[QV-28-REQ-005](../28-data-model-storage.md) and
[server inventory task 5](inventory-20261111/server.tasks.md#5-move-phasealert-outbox-rows-into-the-append-transaction-qv-28-req-005)
require the entry, Merkle/checkpoint data, projection and append-generated outbox
rows to share a transaction. Recovering missing phase rows after a later restart
did not satisfy that requirement.

The original real-HTTP manifest test injected an exception after the phase SQL
insert and before commit. On the baseline it received HTTP 201, retained one
entry/checkpoint/intent, advanced the independent anchor to size 1, and published
entry/checkpoint callbacks without a phase row. On the corrected source the same
fault returns the existing internal-error response, HTTP 500, and the observed
counts are zero entries, checkpoints, intents and events. The persisted state is
DRAFT/tree size 0, the independent anchor remains size 0, and neither live nor
webhook callbacks run. The original acceptance assertion failed before the
production edit.

A separate local test reproduced an adjacent boundary: a transaction wrapper can
throw after its real COMMIT. In that case the entry and complete outbox are
durable, but the independent anchor has not yet advanced. The old tree-size-only
poison check left that handle usable. The corrected catch also retires a handle
after an append receipt was produced. Recovery raises the anchor before an
outcome becomes available and retains the exact original event IDs.

## Implemented boundary

| Stage | Durable effects and ordering |
|---|---|
| Existing synchronous election transaction | Append and Merkle update, existing ballot/roll projections, persisted lifecycle/title/tree size, checkpoint, entry/checkpoint/phase/append-generated alert rows, and a flag-1 completion intent commit or roll back together. |
| After election commit | Persist the independent control-database runtime anchor before publishing callbacks or exposing an append outcome. |
| Existing asynchronous application | Apply the admitted record to memory; DKG adjudication still awaits outside every election transaction. Finish archive key destruction and synchronize the control registry. |
| Completion | Remove the retained intent only after application, archive work and registry synchronization. A flag-1 intent does not create events again. |
| Publication and retirement | Publish committed rows through the existing live/webhook bridge. Archive writer retirement still follows completion; its existing failure closure remains. |

`lifecycleEventForEntry` extracts the existing entry/control-action mapping. Both
the persisted projection and in-memory application use this mapping and the
unchanged `transition` table. Admission, control quorum authentication, sequence
checks, protocol records and proof verification remain in their existing paths.
The original positions of the lifecycle changes within `apply` are retained.

The election transaction does not span `await`. The DKG test runs a genuine
three-trustee ceremony, observes the committed entry and flag-1 intent through a
separate read-only connection at adjudication, asserts transaction depth zero,
then runs the original cryptographic computation and checks restart state and
event IDs.

The alert fault test reaches the existing append-time quarantine writer by
injecting a test-only reason after checkpoint-event insertion. It then throws
after the real alert SQL insert and proves the entire append rolled back. This
does not claim a normally admitted append can bypass the quarantine gate.
Standalone witness and quarantine maintenance transactions are unchanged.

## Versioned recovery and migration compatibility

Election migration 12, `atomic_append_events`, adds the local operational column
`append_completion.events_committed`, constrained to 0 or 1 and defaulting to 0.
The 11 prior migration descriptors, including their SQL strings, compare
byte-for-byte equal to the frozen baseline catalog. No prior migration is edited.

| Intent | Recovery meaning |
|---|---|
| Existing or explicitly legacy flag 0 | Preserve the existing sequence-specific phase/alert reconstruction at the original intent timestamp; then remove the intent after projections are durable. |
| New flag 1 | The append already committed every generated outbox row. Finish projection/key/registry recovery and remove the intent without generating any event. This applies to phase-free appends and to deliberately pruned rows too. |

The legacy process-crash fixture builds an actual database with
`MIGRATIONS.slice(0, 11)`, retaining genuine signed board rows, the old ledger,
pre-completion projection and original intent timestamp. Startup upgrades it and
recovers its missing phase exactly once. This is not a current schema with only a
lowered version number. A separate registry-failure fixture explicitly models
legacy stale projections, while the new-intent fixture retains already-committed
phase IDs. Normal event retention continues to refuse pruning while an intent is
pending; the no-regeneration test deliberately removes rows at the fixture level
to distinguish the flag's meaning.

The new column has a C3 operations classification in `docs/data-inventory.json`.
The real schema inventory is now 230 columns across 36 tables, including SQLite
sequence tables. Prior-schema tests cover all seven historical control schemas
and all eleven historical election schemas with genuine signed board history,
checkpoint/root preservation and retained pre-migration snapshots.

Existing startup policy still refuses a pending upgrade during OPEN without its
explicit override. Older terminal archives require the explicit maintenance
command; they are not silently upgraded. Native and imported schema-11 archive
fixtures both migrate successfully through the private-copy command while
preserving old columns and control bytes. Older binaries refuse schema 12 rather
than interpret flag-1 intents using legacy event generation.

## Verification performed

Node 24.22.3 on the Linux workspace; independent `npm ci --ignore-scripts --offline`
and pinned vendor installation completed before testing. The following are 111
distinct passing tests across the focused runs, not a claim that a new full
repository suite was run here:

| Coverage | Result |
|---|---|
| Final atomicity, rollback, supplemental recovery, replay completion and runtime-anchor files | 30/30, one serial frozen-source run. Includes before-commit rollback, after-COMMIT failure, actual schema-11 legacy recovery, new-intent no-regeneration, second crashes, independent-anchor failure before/after its commit, archive key erasure and asynchronous DKG. |
| Archive maintenance/read-only, data inventory, SSE/webhooks, lifecycle model, migration preflight, prior-schema migrations, pause/resume and SSE cleanup | 78 distinct tests passed. The initial serial run passed 77/78; the remaining read-only refusal fixture assumed schema 11 was current. After changing only its deliberately unsupported ledger marker to remove all versions above 10, that test passed in isolation. |
| Recorded-export schema-10 upgrade | 1/1 selected test passed after its historical fixture also removed the new column/ledger row; existing operation receipts and old checksums remain equal. The other recorded-export cases were not rerun for this fixture-only change. |
| Explicit schema-11 terminal migration | 2/2 selected native/imported archive tests, preserving exact old data and control state. |
| Targeted TypeScript check | Passed at a 768 MiB heap limit, including all three changed production files, changed test entrypoints and their imports. An earlier test-only empty-array narrowing diagnostic was corrected before this successful run. |
| Existing migration catalog comparison | All 11 prior descriptors/SQL strings unchanged; exactly one new version, 12. |
| Repository hygiene | Vendor and lockfile checks passed; dependency-layer check found no new violations and retained its existing D-97 deviations. Markdown links passed after copying eight unchanged R27 documentation prerequisites referenced by the copied server notes/README and their reports. Whitespace check passed. |

The final 30-test command was:

```sh
node --test --test-reporter=spec --test-concurrency=1 \
  packages/server/test/append-outbox-atomicity.test.ts \
  packages/server/test/outbox-rollback.test.ts \
  packages/server/test/supplemental-event-recovery.test.ts \
  packages/server/test/replay-completion-review.test.ts \
  packages/server/test/runtime-anchor.test.ts
```

The adjacent 78-test files were `archive-maintenance`, `archive-readonly`,
`data-inventory`, `events`, `lifecycle-model`, `migration-preflight`, `migrations`,
`pause-resume` and `sse-lifecycle` under `packages/server/test/`. Selected follow-ups
used the names `terminal state is probed`, `schema10 upgrade` and
`archive schema 11`. No test deadline, file concurrency policy or retry behavior
in the repository was changed.

This evidence exercises process exits and SQL/transaction failure injection. It
does not certify filesystem behavior under physical power loss, native Windows
locking/fsync behavior, or a newly composed full-suite/native-CI result. The
independent control database and election database remain separate transactions
with the existing anchor and recovery ordering; cross-database atomicity is not
claimed. No protocol/verifier trust, freshness or finality claim is introduced.

## Frozen implementation identity and integration ownership

The isolated worktree is based on
`6764bf231801a782a57b2778a344c6ab26063e9b` plus the frozen R27 prerequisites listed
in the plan. A diff against that Git commit includes earlier work owned by the
parent. Integrate only the following files or the bounded changed hunks against
the parent's R27 snapshot; do not overwrite newer migration/backup helpers.

| Owned source or test | Git blob |
|---|---|
| `packages/server/src/election.ts` | `eece3c7af64e255d170072b7e2403722c621bb89` |
| `packages/server/src/electiondb.ts` | `0d0dab292b636d80e03ec5d6f634aa9efd6336c8` |
| `packages/server/src/lifecycle.ts` | `38c4928889f501da2559bc370eb0aa466916c477` |
| `docs/data-inventory.json` | `ab43065295b400a44776e93339d023e80d8095df` |
| `packages/server/test/append-outbox-atomicity.test.ts` | `dcc69c62c3262365137f1094ba519402a3ae74d8` |
| `packages/server/test/helpers/legacy-append-fixture.ts` | `f8b6b80b8c588382387ce5447eaaa633036dbb52` |
| `packages/server/test/helpers/supplemental-crash.ts` | `db63146e107460a3bbe15d12d20fb66491bbd6ae` |
| `packages/server/test/outbox-rollback.test.ts` | `0eb62e8b0bcaa3bb9f074d5bd649f394d5f8b5f9` |
| `packages/server/test/supplemental-event-recovery.test.ts` | `000f5aeb821b8f71d585c340ec8b30d8ea68bded` |
| `packages/server/test/replay-completion-review.test.ts` | `c298d7a2a29748a2498167c87f9b15f0caa3c591` |
| `packages/server/test/runtime-anchor.test.ts` | `e35f7df554887c0d0e6b0c9c8899debc04e8b7e9` |
| `packages/server/test/migration-preflight.test.ts` | `b2a4c578367dea04174dbb267c2248ef24ccdce8` |
| `packages/server/test/archive-readonly.test.ts` | `8d51439c81abc58e6d9f92f97eb437967fef8cf3` |
| `packages/server/test/recorded-exports.test.ts` | `2a15d80324a41041221475826bf805484530b76f` |

Documentation ownership is the new section in `packages/server/NOTES.md`, the
approved-plan record and this report. In `migration-preflight.test.ts`, ownership
is only the two-projection crash-fixture block; in `archive-readonly.test.ts`, one
ledger-marker line; in `recorded-exports.test.ts`, the schema-10 fixture changes.
Other copied R27 source/test files, including database opening, backup,
preflight-policy, archive migration and pool helpers, are prerequisites and have
not been edited by this increment. The copied R27 server README and archive,
egress, lifecycle, pause/resume, migration-safety, migration-invariants and
read-only-storage reports are likewise
unchanged documentation prerequisites, not new ownership deltas.

## Integration review follow-up

The [independent post-commit review](outbox-postcommit-review-20261127.md)
subsequently found two reproducible recovery failures on the frozen source
above. A post-anchor application, archive-erasure or registry-sync exception
must retire the cached runtime before its committed phase events can be
forwarded. The integrated correction adds that failure closure; the final
`election.ts` blob is `de9fc2149b93db13210483d929bda4764512e0cb`.
Both unchanged distinguishing tests pass after the correction. The strengthened
regressions and adjacent recovery/archive cases pass 25/25, with no skips.
The original author evidence above remains attached to its original source;
full composition and hosted qualification are recorded separately in R28.
