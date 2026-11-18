# B3-14 conditional guarantee copy: independent read-only review

Initially reviewed the eight-file working-tree delta in `session-evidence/quietvote-revote-copy`, based on published W15 `754c586aa65735d50514b543a62a5e3c96a4d138`. **Final binding: commit `676376024b33bbbee6a34dc11f9e169d7d49d4c6`, tree `66472438d182cf27a1e0b69deec4d5bd299363ef`.** All seven recorded app/catalog SHA-256 hashes match both the committed blobs and the clean worktree. Prior executed DOM evidence therefore binds the exact final implementation without a rerun. The only added file after the probe is the implementation note; its scope and residual qualifications are consistent with this review. Exact hashes and binding metadata are in `b3-copy-render-results.json`. This review did not modify product or test files or remote state.

## Finding

No blocking wording or render issue found within the approved B3-14 scope. English g4 now makes revoting permission conditional on the election allowing it. Nc3 retains the limitation concerning coercion/observation, describes revoting only as something that **may** help, and conditions that possibility on permission and the open voting window. It no longer claims that revoting is an available protection in every election.

The generic guarantee panel can truthfully display this conditional text without another set of catalog keys. The ballot page still selects its specific note from the authenticated manifest: max_per_voter=1 displays “This election allows one ballot per person”; the revoting case displays the existing revote note. The conditional generic text does not override or contradict that single-ballot note.

English source, generated COPY.md and the QV-10 normative table agree. All five draft catalogs convey the same conditional permission/potential-help structure in source inspection; their native-review maps remain empty. This is not a native-language review or approval.

## Executed semantic check

The scratch probe executes the actual `startApp` controller with the small-DOM pattern already used by `packages/web/test/author-pins-ui-fresh-review.test.ts`. It uses existing `FakeBoard`, protocol simulation and `MemoryStorage` helpers, with real signed manifests/derived election contexts for max_per_voter **1** and **8**. Key unlocking is mocked to avoid unrelated KDF work, and live transport startup is disabled. No product source was patched or instrumented.

| Manifest limit | Rules panel | Unlocked ballot panel | Selected note | Opposite note | POSTs |
|---|---|---|---|---|---:|
| 1 | New g4 and nc3 present | New g4 and nc3 present | oneBallot | Absent | 0 |
| 8 | New g4 and nc3 present | New g4 and nc3 present | revoteNote | Absent | 0 |

Runtime locale eligibility remains exactly `["en"]`. Each non-English draft review map contains zero records. The old “Voting again later is the only protection offered” phrase is absent from the rendered rules panel.

Command, exit **0**:

```text
node --experimental-test-module-mocks session-evidence/analysis/branch_inventory/b3-copy-render.mjs
```

Artifacts are `b3-copy-render.mjs`, `b3-copy-render.log` and `b3-copy-render-results.json` in this directory. No browser, assistive-technology, KDF, casting, full localization or native-review qualification is inferred. Build/budget and catalog gates belong to the implementing agent's separate receipts.

The previously noted REVOTE_LIMIT message/general quota behavior is unchanged and remains separate from this narrow generic-panel copy correction. No new keys, runtime branch or authorization change was reviewed as part of this delta.

Published candidate: [PR #65](https://github.com/djshellshoxxx/quietvote/pull/65), head `0653163a3cee2b230398a572723a028c0dda6d7d`. It is stacked on [PR #60](https://github.com/djshellshoxxx/quietvote/pull/60), whose app-only UTF-8 build change provides the required budget headroom. Its focused target remains the #60 branch until that dependency merges, then canonical. PR #43 remains the sole cumulative integration. The review above remains bound to its recorded local commit/tree; neither candidate is represented as merged.

## Publication note

Session-evidence paths and bare execution-log names identify intermediate evidence outside this repository. This report preserves their exact source, commands, results and available hashes; they are not repository download links. New candidate PRs and current hosted-CI status are recorded in the [current reconciliation](consolidation-current-recheck-20261117.md). Original canonical statuses remain bound to their stated SHA.
