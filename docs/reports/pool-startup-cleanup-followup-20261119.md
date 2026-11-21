# Runtime startup cleanup follow-up — November 19, 2026

## Source and finding

This supplement is based on published candidate `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab` and retains its admission reservations, eviction tracking, writer drain and retryable capacity refusal. It carries forward the distinct recovery-failure cleanup identified in the earlier code-audit work; that earlier implementation is not replayed wholesale over the published pool.

An opened election runtime was inserted into the pool before startup event recovery finished. If `recoverEvents()` threw, the caller received a failure but the pool retained the incomplete runtime and its open database. A subsequent request could retrieve that failed startup handle.

The pool now finishes recovery before publishing the runtime in its cache. If startup throws, it closes the opened handle and propagates the original failure. The existing tally-recovery catch and retry-on-cosignature behavior remain intact.

## Distinguishing verification

The added test uses a real temporary election/database and injects a startup recovery exception. It requires the failed runtime to be poisoned and its database closed, no cached runtime to remain, and a subsequent successful acquisition to return a new runtime.

- The unchanged published implementation plus this test failed at the cleanup assertion: **0/1 passed**.
- The repaired implementation passed the unchanged regression and adjacent capacity/shutdown tests: **10/10 passed**, serially, zero failures or skips.
- A strict TypeScript check rooted at the pool and new regression, including transitive imports, passed with a 512 MiB compiler cap.
- The executed files were `pool-capacity.test.ts`, `pool-recovery-cleanup.test.ts`, and `shutdown-drain.test.ts`. This is a targeted local result, not a full server or hosted matrix qualification.

This repair does not resume the separately stopped background-gossip investigation or assert a result for that scope. Native and browser qualification and formal review gates remain separate.
