# Independent code review, third handoff — November 19, 2026

## Result and exact source

No concrete blocker was found in the selected runtime-startup and navigation
changes. Independent targeted verification of the composed candidate passed
**42/42 tests**, with zero failures, skips or cancellations. This is a scoped
engineering review; it does not provide formal approval or full product
qualification.

| Identity | Value |
| --- | --- |
| Reviewed candidate | `17a4a8c8b4cc4ac1b0343d881595401e21866f8b` |
| Complete candidate tree | `f6f820130e92510b84b4282d4c5f9143aa63fc4c` |
| Published comparison base | `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab` |
| Startup-cleanup contribution | `b7c3da0` |
| Navigation contribution | `fa0757934795a15697bc695e563a8fa0534c6e18` |

The review used a separate worktree and made no production or test changes. Its
only contribution is this report. The POSIX cleanup and CLI signing-key changes
in the same candidate belong to the separate security-review lane.

## Reviewed boundaries

### Runtime startup cleanup

[The pool](../../packages/server/src/pool.ts) now adds a newly opened runtime to
its cache only after startup recovery returns. An exception in that phase closes
the runtime before propagating failure. The existing opening promise continues
to reserve capacity until it settles; cleanup does not replace the published
admission reservation, eviction tracking, writer-drain or retryable-capacity
behavior. Tally-recovery rejection still follows its pre-existing logging and
retry-on-cosignature policy.

The distinguishing regression deliberately injects a recovery exception. It
checks the runtime's closed database and poisoned state, absence from the cache,
and successful subsequent acquisition of a different handle. That fault
injection establishes the cleanup boundary, not the frequency or cause of a
natural startup failure.

### Navigation and view cleanup

[The router](../../packages/web/src/ui/app.ts) records the current URL when a
route starts, processes every `popstate`, and ignores a `hashchange` that merely
repeats the current URL. An actual changed URL still starts a new route. The
existing route epoch prevents an older pending load from replacing the newest
view. The review checked that synchronous navigation cleanup and the published
clearing-confirmation implementation remain intact.

The retiring view's `keyLock` callback runs after its route epoch is invalidated
and before its controls are detached. The callback clears the appropriate voter,
admin or organizer fields and invalidates pending view work. It does not invoke
the application-wide voter-signer lock. The exercised key-to-vote and pending
ballot retry cases continue to work. This establishes explicit field cleanup;
it does not establish erasure of all copies of a JavaScript string.

## Independent verification

Environment: Node 24.22.3, isolated worktree on the exact candidate above.
Dependencies were prepared with `npm ci --ignore-scripts --no-audit --no-fund`
and `npm run vendor:install`; the latter verified two pinned packages and 132
verbatim files. No dependency versions or lockfiles changed.

The following unmodified suites ran together with
`node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec`:

- `packages/server/test/pool-capacity.test.ts`
- `packages/server/test/pool-recovery-cleanup.test.ts`
- `packages/web/test/split-origin-ui.test.ts`
- `packages/web/test/session-storage-ui.test.ts`
- `packages/web/test/admin-ui.test.ts`
- `packages/web/test/organizer-timezone-ui.test.ts`

Result: **42 passed, 0 failed, 0 skipped, 0 cancelled**, exit 0, **35.533 seconds**.
The tests covered capacity reservation and eviction, failure cleanup, paired and
queued navigation events, changed hashes during pending reads, retired password
fields, successful unlock/cast, board scoping, retained retry bytes, late receipt
handoff, administrator operations and organizer publication. Counts overlap prior
workers' runs and must not be added into a unique project-test total.

The organizer publication case that exhausted its turn-count helper in the
predecessor's 37/38 batch passed in this independent combined run. This result
does not erase that earlier failure or establish why it occurred. No timeout,
assertion or turn-count limit was changed. `git diff --check` passed.

## Limits and successor handoff

This lane did not rerun whole-repository TypeScript, production browser journeys,
native Windows behavior or macOS ACL cases. The authors' scoped typechecks and
build measurements remain their own source-bound evidence. Current-source hosted
qualification and the repository's formal review/provenance gates remain open.

The separately stopped background-gossip investigation was not resumed, and its
untracked test was neither inspected nor used. This report supplies no finding
or runtime qualification for that scope.

The next reviewer should use the published composed head, verify that these
reviewed source files are unchanged or review their later deltas, and inspect
actual hosted browser/typecheck/native results. Investigate the organizer wait
only if another exact-source failure provides new evidence; do not weaken its
checks to obtain a pass. Keep the independently successful targeted result
separate from incomplete or historical qualification.
