# Fresh recovery review and second-crash repair — 2026-11-16

Reviewed server append/event/archive work at `aae6196` and operation-response work finalized
as `36ff4a7`. This worker reviewed the other authors' changes, then authored the
replay/projection correction `f190a6b`. The correction therefore needs another worker's review;
this record is internal engineering evidence, not an external audit or release approval.

## Findings and dispositions

1. **Replay could forget unfinished projections after a second crash.** Replay deleted each
   append intent before its final election/registry synchronization. Two real process-exit
   regressions failed: after another startup, a manifest election remained `DRAFT` rather than
   `SETUP`, and an archived election remained `AUDIT` rather than `ARCHIVED`; both had no intent
   left to trigger selective startup recovery. `f190a6b` retains the sequence-specific transitions
   until final projection synchronization succeeds, then commits each event/intent pair. It does
   not synchronize historical intermediate states. A failed projection sync leaves the intents.

2. **Registry state and retention timestamps had separate commit boundaries.** A crash after
   writing `ARCHIVED` but before `archived_at` could leave the timestamp absent because later
   synchronization skips an already matching state. `f190a6b` makes state/title/lifecycle timestamp
   changes one control transaction. A real process-exit regression stops after the state SQL and
   verifies the next startup produces both the archived projection and retention timestamp.

3. **A retained operation receipt could conceal an unusable control generation or conflicting
   completion.** Independent floor probes showed that a pending marker with a changed expiry,
   or a conflicting completed body, passed restore-floor comparison when the receipt remained.
   The exact-generation bridge could not recover the former. The response owner corrected this
   in `36ff4a7`: a recoverable floor receipt requires its exact pending marker or the equivalent
   completed result. Both negative probes now pass.

4. **Delayed successful promotion could falsely fail receipt omission.** A completed response
   legitimately extends the control-cache expiry beyond the original receipt generation. The
   original floor comparison refused an otherwise equivalent completed cache without the
   redundant receipt. The response owner's correction accepts that equivalence. The independent
   positive probe failed before correction and now passes.

## Reviewed invariants

- Append, entry/checkpoint event rows and completion intent share an election transaction.
  Supplemental rows and intent removal also share a transaction. Original intent timestamps
  survive replay; completed, pruned and pre-upgrade history is not reconstructed.
- The new repair retains individual `from`/`to` phase values for multiple pending sequences.
  A fault after control synchronization commits still retains their intents; retry writes each
  original transition once, without replacing intermediate phases with the final phase.
- Archive key erasure and board read-only state commit together before intent completion.
  Tests cover exits immediately after `audit_close` commit and inside key erasure. This is stored
  key removal under the existing archive behavior, not a claim of physical-media erasure.
- Witness cosignatures and witness/checkpoint events share the same election transaction;
  rollback and post-commit process exit preserve their pairing. Retention waits for pending
  append completions and unsuccessful durable webhook forwarding.
- Operation receipts bind principal, idempotency key, method, path, request hash and the original
  marker expiry. Only an unexpired pending/interrupted exact generation can promote. Promotions
  with a control audit commit that audit and the replay cache together.
- Link-election read keys and invitation codes/labels/contact values are absent from durable
  replay receipts. Retries recover only the original redacted identifiers and results.
- Pre-commit receipt failure rolls back election-owned effects. Internal uncertain outcomes stay
  interrupted; a proven committed receipt can recover without repeating the effect. Initialization
  cleanup preserves a committed or unreadable election rather than guessing it did not commit.
- Startup uses canonical existing regular election paths with matching registry/election/org
  identities and opens full runtimes only for retained append intents. Missing, symlinked or
  mismatched storage leaves responses pending; it does not fabricate a successful recovery.

## Executed evidence

Linux, Node v24.22.1, isolated worktree. Counts describe their individual commands and overlap.

| Source and command | Result |
|---|---|
| `aae6196`: `node --max-old-space-size=512 --test --test-concurrency=1 packages/server/test/supplemental-event-recovery.test.ts packages/server/test/outbox-rollback.test.ts` | 8 pass |
| Initial response snapshot: independent `operation-floor-review.test.ts` | 3 expected failures exposing the floor findings above |
| Initial response snapshot: independent append/archive double-crash cases | 2 expected failures exposing lost lifecycle projections |
| Repaired snapshot: supplemental, outbox, operation-response, backup-floor and both independent review test files | 27 pass; historical snapshot before final response additions |
| `36ff4a7` plus `f190a6b`: `node --max-old-space-size=512 --test --test-concurrency=1 packages/server/test/operation-response-recovery.test.ts packages/server/test/replay-completion-review.test.ts packages/server/test/operation-floor-review.test.ts` | 17 pass, 0 fail/skip |
| Same final source: `node --max-old-space-size=512 node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit` | pass |
| `git diff --check` | pass |

The independent floor regressions are retained in `operation-floor-review.test.ts`; the repeated
crash and control-sync regressions are retained in `replay-completion-review.test.ts` and its helper.
Each child-process test removes a stale fixture lock only after that fixture's sole owner has exited.
Root integration still owns final whole-workspace tests, protocol vectors, verifier comparison,
browser journeys and tooling checks. No remote publication or held protocol-policy change occurred.
