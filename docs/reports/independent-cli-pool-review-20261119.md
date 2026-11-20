# Independent CLI and runtime review — November 19, 2026

## Result and source

No concrete integration blocker was found in the selected organization, recorded
export, runtime admission and startup-cleanup changes. The unchanged targeted
batch passed **22/22 tests**, with zero failures, skips or cancellations. This is
scoped engineering evidence, not formal sensitive-change approval or complete
product qualification.

- Reviewed commit: `8f865fb3cf9c5d203e532abb19848cd46050db9a`.
- Reviewed tree: `5da32edc203087e96a81e1f0b6ae311758b19fa2`.
- Reviewer: separate `/root/core_completion` worker and isolated worktree.
- No production files, test assertions, fixtures or timeouts were changed.

## Source review

The organization commands in
[cmd-online-org.ts](../../packages/cli/src/cmd-online-org.ts) agree with the
implemented server registration contract in
[app.ts](../../packages/server/src/app.ts). Creation uses the same owner key for
the body and request signature, requires an explicit idempotency key, preserves
the documented token-file spelling, binds the public success fields to the
request and discards extra response fields. An owner key remains scoped to one
command. The existing real executable and real server tests cover registration,
an explicit replay, inspection and creation of the first election.

The recorded-export commands in
[cmd-online-exports.ts](../../packages/cli/src/cmd-online-exports.ts) retain the
single unlock across their two signed requests. Record identity, archive length,
digest, checksums, origin and tree binding are checked before output. Explicit
acknowledgement rechecks the retained file immediately before its POST and does
not follow server-supplied links. Downloads remain separate from retention
acknowledgements and independent election verification. The nullable management
JSON profile agrees with [the server routes](../../packages/server/src/export-routes.ts).

The [runtime pool](../../packages/server/src/pool.ts) reserves capacity while a
runtime opens or drains, shares an opening promise for the same election,
finishes startup recovery before caching a new handle and closes a handle after
a startup exception. The selected tests retain the actual database, SSE pin,
writer-drain and subsequent-reacquisition assertions. No new lifecycle change was
justified by this review.

## Executed verification

Linux, Node **24.22.3**, using the unchanged lockfile. Preparation ran
`npm ci --ignore-scripts --no-audit --no-fund` and `npm run vendor:install`.
Vendor installation verified two pinned packages and 132 verbatim files.

```sh
node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec \
  packages/cli/test/organizations.test.ts \
  packages/cli/test/organization-boundaries.test.ts \
  packages/cli/test/recorded-exports.test.ts \
  packages/cli/test/request-auth-compat.test.ts \
  packages/server/test/pool-capacity.test.ts \
  packages/server/test/pool-recovery-cleanup.test.ts \
  packages/server/test/shutdown-drain.test.ts
```

Result: **22 passed, 0 failed, 0 skipped, 0 cancelled; exit 0; 16.639 seconds**.
`git diff --check` passed. These checks overlap historical author and reviewer
batches; their count is not added to a unique project-test total.

## Limits and continuation

This review did not run the full repository typecheck, complete workspace suite,
production browser journeys or native Windows/macOS qualification. The existing
shutdown suite includes its ordinary in-flight service drain tests; the earlier
stopped background-runtime investigation was not resumed and its untracked test
was neither inspected nor used.

Read the current checks for the final published composition separately. New
source requires its own applicable verification; this report qualifies only the
commit above. Existing protocol decisions, external review and provenance gates
remain as described in [the unfinished-work ledger](../audits/UNFINISHED_WORK.md).
