# QuietVote server teams milestone — 2026-11-16

Base: published PR #51, `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Lane: `codex/qv-teams-server`. No push, merge, protocol policy or comparison change.

## Milestone 1: durable webhook forwarding

Election event rows now forward to the control webhook outbox with a persistent per-election cursor.
All matching hook inserts, existing queue pruning and cursor advancement share one transaction. Only
committed jobs reach memory or transport. Failed forwarding leaves its source row pending. Startup scans
live elections; subsequent runtime access and appends retry retained failures. Retention cannot prune
source events while forwarding fails. Successful delivery deletion cannot cause replay on another restart.

Additive control schema 7 and election schema 6 preserve prior migration checksums. The election upgrade
floor avoids replaying pre-upgrade events whose delivery history was never recorded. Existing retry rows
continue normally. No durable cursor has been retroactively invented for old events.

Executed on Linux, Node 24.22.1:

- `node --max-old-space-size=512 --test --test-concurrency=1 packages/server/test/webhook-bridge-recovery.test.ts`: 4 pass.
- Same runner with `webhooks-persist.test.ts outbox-rollback.test.ts delete-recovery.test.ts`: 10 pass.
- Same runner with `events.test.ts shutdown-drain.test.ts offline-backup.test.ts`: 46 pass.
- `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit`: pass before new regression file; rerun on final milestone required.
- `git diff --check`: pass.

Fault injection covers source commit with lost forwarding, second-hook insert rollback, cursor-write rollback,
and migration from pre-bridge schemas. Tests restart real SQLite-backed servers and require startup forwarding
without a client request. Existing retry, cap, shutdown, deletion and backup tests retain their assertions.

## Remaining

- Full server and integrated suite qualification and fresh-agent review.
- Management responses can still become interrupted after committed work; follow-up control-only atomic
  response storage is next. Existing no-duplication/interrupted guard stays intact.
- Supplemental phase/witness events that never reached the election event table are not reconstructed.
- Recovery selects currently enabled hooks, excludes hooks created after the event timestamp, and preserves
  existing cap/body/terminal-failure losses. It does not promise an immutable subscription snapshot or delivery.
- A transient forwarding failure without any subsequent runtime access waits until restart. Missing/corrupt
  election storage emits a static diagnostic and is not silently reported as recovered.
- External crash/power-loss/filesystem/browser/platform qualification remains unexecuted.

## Milestone 2: atomic control-management responses and fresh-review corrections

Bridge milestone commit: `7c11dc4`. A fresh review found no immediate cursor/fanout flaw and requested
pending-retry migration coverage. Added a regression that leaves three attempt-2 rows across simulated
legacy migration, then proves original IDs/bodies resume once without old-event replay.

The first whole-server run exposed an unintended startup behavior change: opening full runtimes healed
a stale registry before the existing deletion guard test could exercise its job. Corrected startup to scan
only event storage, checking canonical existing regular paths and matching election/org rows, and close
each DB immediately. It does not decrypt keys, replay the protocol, recover a tally or change lifecycle
projections. The stale-registry guard test now passes with its original assertions.

Organization/webhook creation and import/backup/self-audit/delete job admission now save redacted
idempotency receipts atomically with control mutations. Transport/execution begins after durable commit.
Fault injection proves pre-commit receipt failure rolls back and post-commit completion loss replays the
original identifier. Webhook creation replay still omits URL and secret. Existing election interrupted
response regressions remain unchanged and pass.

Fresh cross-lane review identified that a webhook could be deleted without its restore-floor audit
if audit writing failed. Deletion + audit now commit together; optional Idempotency-Key also caches 204
in that transaction. Existing clients are not required to add that header. Regression proves audit failure
preserves the hook and lost post-commit completion replays 204 without another tombstone.

Executed after corrections:

- Bridge recovery + stale-registry guard + management response tests: 10 pass (before added deletion test).
- Management response + existing idempotency + events suite: **33 pass, 0 fail/skip** (includes deletion test).
- Final package typecheck: pass. `git diff --check`: pass.
- Earlier 60 focused passes remain supporting evidence; counts overlap and must not be summed as a project total.
- First full server run is still in progress at this checkpoint and used a superseded startup implementation
  for early tests; it reported the stale-registry failure above. It is **not** final-candidate qualification.

Next fresh agent can continue with transactional completion intents for supplemental phase/witness events,
and explicit cross-database operation journals for election/invitation/quarantine response recovery. Neither
is silently claimed complete. Suggested phase design: persist a sequence-bound completion intent with the
log append, delete it in the transaction that records the phase event, and resolve retained intents while
replaying the log; do not regenerate previously pruned historical events. This is a proposal, not implemented.

Final focused bridge/retry/rollback/deletion/shutdown run: **22 pass, 0 fail/skip**.
Fresh agent `fresh_server_review` independently reviewed the current changes and ran bridge recovery +
management-response recovery: **10 pass, 0 fail/skip**. It found no unresolved blocker in this slice.
This remains AI review, not external security acceptance. The first full run still has the superseded
startup failure and must not be described as final-candidate green.

## Milestone 3: supplemental event completion after process exit

Election schema 7 adds `append_completion(seq, ts)`. Every new append saves its sequence-bound intent
with its log/checkpoint/entry events. Projection completion saves phase/alert rows and deletes that intent
in one transaction. Runtime replay resolves only retained intents at the corresponding log sequence,
using the original append timestamp; completed, pruned and pre-upgrade history is never regenerated.
The in-memory quarantine alert marker advances only after durable event commit.

Witness cosignature changes and their witness/checkpoint event rows now share one election transaction.
Event insertion failure rolls back the signature too, and publication occurs only after commit. A process
exit after that commit leaves complete event rows for the existing webhook bridge.

Executed on Node 24.22.1, single test concurrency:

- Supplemental recovery + existing outbox rollback: **6 pass, 0 fail/skip**.
- Existing events + webhook bridge migration/retry/recovery: **30 pass, 0 fail/skip**.
- Server package typecheck: pass. `git diff --check`: pass.

The supplemental regressions include child processes exiting immediately after SQLite append/cosignature
commit, then opening the same persisted databases in a new process. The test removes the stale directory
lock only after its sole owning child has exited. Additional faults cover phase insert/intent deletion
rollback, cosignature/event rollback, replay deduplication, historical pruning, and schema upgrade.

Coordination: the response-recovery lane owns startup integration. It must scan canonical existing election
DBs with matching registry/election/org identifiers and reopen **only** those with `hasAppendCompletions()`.
This milestone itself reconstructs on runtime replay; it does not claim startup reconstruction without that
integration. It deliberately avoids reopening every election or healing unrelated lifecycle projections.
The v8 operation-receipt migration belongs to that separate lane. Existing bridge migration regressions
now drop schema-v7 objects when simulating the pre-v6 database; future schema fixtures must do likewise.

Final review correction: archive event retention now waits for pending append completions before pruning.
Replay also resumes the existing `audit_close` finalization (erase stored signing keys and set the board
store read-only) before deleting that sequence's completion intent. Key erasure and read-only state commit
together. This closes a pre-existing crash gap after durable `audit_close`; it changes neither admission,
authorization nor archive policy. It does not claim secure physical-media erasure or zeroization of runtime
copies beyond the existing archive behavior.

The updated supplemental file passed **6 tests** including the new real child-process exit immediately
after `audit_close` commit. A further targeted test passed after exiting inside the key-erasure transaction:
SQLite rolled that incomplete transaction back, and reopening completed erasure before resolving the intent.
That is **7 distinct supplemental tests** exercised across those two runs, not a whole-project count.
The archive regressions assert both stored signing-key blobs become NULL, the store remains read-only,
checkpoint signing is refused, and the recovered ARCHIVED phase does not duplicate on another restart.
Final server package typecheck and `git diff --check` pass.
