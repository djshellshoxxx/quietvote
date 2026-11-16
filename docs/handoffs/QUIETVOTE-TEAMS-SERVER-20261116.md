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
