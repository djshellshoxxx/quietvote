# Independent review: post-commit outbox recovery

Date: 2026-11-27 (America/Vancouver)

## Scope and source

Reviewed the 17-file append/outbox patch against PR #78 base
`c110e06bc584e642e9130a82f7a16493ad8b12e3`. All 17 before/after blobs matched
the author's frozen source manifest in a separate checkout. The review read
the complete production delta in `election.ts`, `electiondb.ts` (migration 12),
and `lifecycle.ts`, together with actual schema-11 recovery fixtures and
relevant archive, anchor, event-pruning, and replay tests.

The reviewed `election.ts` blob was
`eece3c7af64e255d170072b7e2403722c621bb89`. The integrator's narrow correction
was copied unchanged into the review checkout for verification; its blob is
`de9fc2149b93db13210483d929bda4764512e0cb`.

This is scoped engineering review and local regression evidence. It is not
independent cryptographic assurance, release sign-off, or native power-loss
qualification.

## Finding and correction

After the append transaction and independent runtime anchor were durable,
an exception from application, archive key erasure, or registry synchronization
could leave a cached runtime usable. Its new phase event was already durable.
The next ordinary pool acquisition called the event bridge on that cached
handle, before retrying unfinished application work. A byte-identical request
could return a receipt without healing that work.

The regression uses actual signed HTTP entries, SQLite transactions, and the
server's real durable webhook bridge. The transport and DNS resolver are
controlled test dependencies; no request reaches a third-party endpoint.
The only injected failures are a registry write refusal and an exception
after actual key erasure inside its transaction, which rolls that erasure back.

| Injected failure | Behavior before the correction |
|---|---|
| Registry update after first manifest | The cached handle remained unpoisoned; the phase announced SETUP while the registry was still DRAFT and the completion intent remained. |
| Archive key-erasure transaction | The cached handle remained unpoisoned; the phase announced ARCHIVED while the registry was still AUDIT, persisted keys remained, and the completion intent remained. |

Both original regression cases failed on the frozen author source. The
unchanged two-case regression then passed on the integrator's correction.
The original test blob was `1307c7d0131634ec74e02c17120e17aadb3302ab`.

The correction catches failures only around post-anchor application,
`finalizeArchive()`, and `syncRegistryState()`, marks the runtime poisoned,
and rethrows. Existing pool recovery must therefore replay and finish the
pending work before publishing events or returning a usable handle.
Best-effort completion-intent cleanup remains after successful application.

The strengthened regression requires a different recovered handle, no pending
completion intent, the healed registry state, and exactly one actual phase
delivery in each controlled scenario. At archive delivery it independently
reads the database to require both persisted signing-key fields to be null;
the recovered pooled handle must also be physically read-only.

The immediate identical retry returns 200 in both scenarios. Archive recovery
temporarily constructs its runtime while persisted keys still exist, then
finishes erasure and retires the writer. Existing `BoardLog.getReceipt()` can
use that runtime's retained in-memory signer. After eviction and a clean
keyless archive open, the same request returns 503 with `LOG_UNAVAILABLE`.
The test preserves and explicitly checks both existing behaviors; the
correction does not change in-memory key lifetime or receipt policy.

## Other reviewed properties

No additional blocking scoped finding was identified in the shared lifecycle
mapping and phase-sequence projection; synchronous append transaction versus
asynchronous DKG work; poisoning after a transaction wrapper throws following
COMMIT; anchor-before-exposure ordering; legacy flag-0 timestamp reconstruction;
flag-1 event-ID retention without regeneration of pruned history; or replay's
archive-erasure and registry synchronization before intent deletion. These are
source and bounded test conclusions, not an exhaustive proof of all failures.

## Validation

Run from the isolated review checkout with Node 24.22.3:

```sh
node --test --test-reporter=spec --test-concurrency=1 \
  packages/server/test/outbox-postcommit-review.test.ts \
  packages/server/test/append-outbox-atomicity.test.ts \
  packages/server/test/supplemental-event-recovery.test.ts \
  packages/server/test/replay-completion-review.test.ts \
  packages/server/test/archive-readonly.test.ts
node scripts/vendor.mjs check
git diff --check
```

Final strengthened source: **25/25 focused tests pass**, zero skipped,
40.891 seconds. The server package typecheck passes with the existing pinned
TypeScript compiler and Node types and a 768 MiB heap limit. Vendor validation
passes for the isolated Noble installation: two pinned packages and 132
verbatim files. `git diff --check` passes.

The final regression test blob is
`29e955ebeef69fc0b5f4ee2e0239707ae7848f42`. No production dependency, deadline,
retry, protocol, or schema change was made by this review.

Evidence logs retained with the review handoff are
`outbox-postcommit-review-before.log`,
`outbox-postcommit-review-fixed-unchanged.log`,
`outbox-postcommit-review-fixed-focused.log`, and
`outbox-postcommit-review-typecheck.log`.

The only new review-owned repository files are this report and
`packages/server/test/outbox-postcommit-review.test.ts`. The original 17-file
patch and integrator-owned production correction are prerequisites, not new
review-owned deltas. The root agent owns full-suite and cross-platform checks.
