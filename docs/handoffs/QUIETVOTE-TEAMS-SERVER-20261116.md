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
