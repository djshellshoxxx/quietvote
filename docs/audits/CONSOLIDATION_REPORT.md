# QuietVote comprehensive consolidation

Status: production candidate assembled; independent findings repaired and
revalidated; final hosted qualification is pending. No main merge, deployment, release, force push
or remote branch deletion has occurred in this operation.

## Scope and source preservation

The operation began at main commit
019f4e789be2ff38a5fb2d348c3b225cc87cf296 and uses the requested branch
`codex/quietvote-comprehensive-consolidation`. The inventory covers 72 original
remote branches, all 70 historical pull requests, three additional historical PR
heads and 479 workflow runs. No non-PR open issue or release was found in that
inventory. [BRANCH_INVENTORY](BRANCH_INVENTORY.md) records the complete table,
ancestry, patch equivalence, conflicts and dependency graph.

After source composition, **65 of the original 72 branch tips are ancestors** of
the candidate. This includes main and its identical alias; it is a preservation
count, not 65 separate feature implementations or remote merges. A further tip is
patch-equivalent to its signed replacement. Useful #27 behavior is reconstructed
selectively. The seven non-ancestor tips are retained and classified below.

| Source | Preserved source commit | Integration treatment |
| --- | --- | --- |
| Canonical #43, integration/quietvote-completion | 810e7375ef3697a88fe903840f33494453e6777e | Preserve canonical merge history explicitly. |
| Platform #69 | b239bc5a53098341ae634aca924dd8ccb8e2e719 | Inherit reviewed platform fixes, lazy integrity, copy/URL repairs and CI portability work. |
| Pinned membership #70 | 8b417c6c8b86a7a9a9454468bf16bec0baa8517b | Inherit authenticated full roll, registration separation, legacy attachment and restore floors. |
| Nonce construction #57 | fd23cb3a481328a2b6315ae34cc2ee589b31aead | Merge source; correct the newly found trustee-index omission separately. |
| Python tie validation #61 | 04171611e8c8d836ede49c30f0c6f0acc9d0da05 | Merge the narrow method restriction. |
| Python tally metadata #63 | 0042967a76ef871d01f3726d1ff9331293e9a255 | Merge published decrypter-set validation. |
| Marker conflicts #64 | 4b88209afb5a6c8fba1df06e0af8d1c1ac21d15f | Merge authenticated equivocation handling and paired regressions. |
| Mixed historical #27 | 2aaf0a01816afb256a804c23dd45de86eca2a993 | Reconstruct accepted residual behavior against current schemas; do not merge 30 conflicting paths wholesale. |

New signed local changes include catalog-only reasons b8a1801, quota feedback
cc521ea, worker lifecycle 8c55bbe, trustee-index nonce correction 0d274b3,
cooperative SPA verification b4cc7ab, recorded export/deletion ef2fd51 and runtime
anchors 8601976, monotonic controls fc0a0c3, vendoring 5f6bcd5, and device/rules/
undervote UI 24300ca with storage retry repair d56bc9c. Root integration 43a0919
closes the combined rollback/deletion guard gap; 60c5bff retires queued writers
before deletion releases its mutex; bd89f60 binds delayed verifier announcements
to their run. These are local engineering provenance identifiers;
the publication receipt must identify the externally published commit and prove
that its tree matches the tested source.

## Counting the delivered work

The count of **nine completed feature slices** uses explicit user-facing or
operational boundaries: catalog-only control reasons; signed control sequences;
independent runtime anchors; recorded public exports and deletion handoff;
cooperative SPA verification; verified vendor consumption; device/receipt
preferences; optional local rules acknowledgment; and method-correct undervote
notices. These are additions completed during this operation, not a count of every
feature inherited from the recovered platform.

**Nine new defect families** were corrected: trustee-index nonce binding;
sealing-worker exception/settlement handling; misleading quota copy;
rollback/acknowledged-archive deletion composition; queued-writer deletion
lifetime; obsolete verifier announcements; settings request-success before commit;
stale settings read/modify/write; and permanently cached failed IndexedDB opening.
Four historical fix families are also recovered from #57, #61, #63 and #64.
This yields **13 substantive repaired or recovered defect families**. Test-fixture
integration corrections are additional maintenance, not inflated product-bug
counts. Security findings associated with feature completion overlap this count;
the feature and defect totals must not be added as a unique-work metric.

## Conflict resolution and behavior preservation

The four protocol repair candidates merged cleanly with the membership baseline.
Canonical integration ancestry was retained without replacing its content. Runtime
anchors and export/deletion work both changed pool removal: the resolution keeps
export/lifecycle checks under the mutex, adds runtime-health refusal first, retains
the created-here cleanup and preserves both startup recovery hooks. A regression
proves an old acknowledged archive cannot override a newer independent floor.

Election migration 11 and control migration 8 are additive. Historical SQL and
migration hashes remain unchanged. Tests reconstructing old schemas now remove
the newly added tables too; production migrations were not made permissive to
hide fixture errors. Existing cleanup tombstones, operation receipts, event outbox,
private backup floors and imported mirrors remain explicit validation targets.

The nonce correction regenerates deterministic proof bytes. Expected outcome rows
retain their original meaning. The content-only shared verifier comparison excludes board/witness/receipt
checks; it does not turn exclusions into agreements or imply Python lacks those
separately implemented capabilities.

## Retained branches outside candidate ancestry

| Branch | Reason for retention/exclusion |
| --- | --- |
| chatgpt/quietvote-visual-ci-repair-20261102 | Patch-equivalent signed replacement is already preserved. |
| claude/laughing-volta-61srfa | #27 combines useful residuals with obsolete migrations/UI. Selected behavior is rebuilt; unported contract-dependent work remains documented. |
| claude/docs-screenshots | Historical presentation/status material; not authoritative current implementation evidence. |
| claude/sharp-archimedes-tu76rh | Historical audit/doc proposal is preserved for provenance; current reconciliation supersedes status claims. |
| docs/readme-and-wiki | Superseded parallel wiki draft; current wiki structure retained. |
| nodata/affectionate-archimedes-0pr6w5 | Unique documentation conflicts with existing requirement identifiers/provenance. No retrospective author sign-off is invented. |
| nodata/trusting-bohr-vnoa7n | Obsolete documentation proposal; retain source without reviving stale status. |

All original remote branches remain. Contained branches also remain because branch
deletion was not authorized. No unrelated history was rewritten.

## Historical PR investigation

PR #51 is a closed, superseded source already preserved through later integration.
Its former restoration/browser failures were investigated as history, not assumed
current defects. PR #70's exact current head already passed its complete hosted
matrix, including Windows; no test was skipped or weakened to manufacture a fix.
PR #69 had two cancelled macOS cells. The completed first retry left one cancelled
trustee/crypto cell; that remaining job was explicitly retried after the run ended.
New combined-source checks are still required regardless of those baseline results.

The initial live recheck found zero inline review threads on all 11 open PRs;
there were no outstanding inline conversations to silently mark resolved.

The existing 11 open PRs will receive a current consolidation reference and source
status after publication. They are not marked formally approved by this report.

## Final qualification and merge gate

See [FINAL_VERIFICATION](FINAL_VERIFICATION.md) for actual checks and
[SECURITY_REVIEW](SECURITY_REVIEW.md) for trust boundaries. The core gaps and
concrete decisions still needed are in [UNFINISHED_WORK](UNFINISHED_WORK.md).
No claim of 100% product completion is made.

The fresh core reviewer reports its exact scope in
[INDEPENDENT_REVIEW](INDEPENDENT_REVIEW.md). A separate fresh surface reviewer
identified and revalidated the announcement and IndexedDB retry fixes; its final
build/surface receipt is [INDEPENDENT_BUILD_REVIEW](INDEPENDENT_BUILD_REVIEW.md).
Agent reports supply
engineering evidence and do not impersonate formal repository reviewers.

Main remains at 019f4e789be2ff38a5fb2d348c3b225cc87cf296. Sensitive protocol,
vector and workflow changes require two formal approvals including a designated
security reviewer under repository policy. MAINTAINERS lists none appointed;
agent review cannot supply that appointment or approval. Historical missing DCO
trailers also remain a provenance decision. The absence of an enforced GitHub
ruleset does not waive the written review requirement.

The final publication/CI/review receipt will replace this in-progress section with
exact commit/tree identifiers, PR URL and outstanding promotion blockers.
