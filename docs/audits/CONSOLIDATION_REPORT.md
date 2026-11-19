# QuietVote comprehensive consolidation

Status: this report records the completed local implementation composition and
the exact scope of its engineering evidence. The current published head,
local-to-remote tree comparison and hosted results are recorded in
[PR #71](https://github.com/djshellshoxxx/quietvote/pull/71) and
[its checks](https://github.com/djshellshoxxx/quietvote/pull/71/checks).
Historical checkpoint results below must not be assigned to a different head.
No main merge, deployment, release, force push
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
count, not 65 separate feature implementations or remote merges. Of these,
**63 original tips were not contained in initial main**; the other two are main
and its identical alias. A further tip is
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

The later local composition at `ba728be0140751bc77d464db32c5f9dc110dd007`
(tree `bf64cc5646a8eebc57fceae891a60d716399959b`) adds lossless catalog
compaction d86a89d, organizer timezone input c4b4555/92db0be, separate-origin
operation b746513, actual publication/router/redirect regressions
1c0edda/af23745, hosted failure repairs 65b47fb, and invitation/IPv6 compatibility
341c8f1. This source has its own independent follow-up receipts and is published
as described below; the first publication's hosted results do not qualify it.

## Counting the completed implementation

The count of **12 implemented feature slices** uses explicit user-facing or
operational boundaries: catalog-only control reasons; signed control sequences;
independent runtime anchors; recorded public exports and deletion handoff;
cooperative SPA verification; verified vendor consumption; device/receipt
preferences; optional local rules acknowledgment; and method-correct undervote
notices; organizer timezone/DST input; separate-origin browser/API operation; and
explicit page-session storage after actual browser-storage refusal.
These are additions completed during this operation, not a count of every
feature inherited from the recovered platform.

**18 new defect families** were corrected in the current local composition: trustee-index nonce binding;
sealing-worker exception/settlement handling; misleading quota copy;
rollback/acknowledged-archive deletion composition; queued-writer deletion
lifetime; obsolete verifier announcements; settings request-success before commit;
stale settings read/modify/write; permanently cached failed IndexedDB opening;
organizer calendar/gap/historical-offset resolution; CORS resume/header exposure;
current hexadecimal invitation paste routing; and eager startup recovery of
untouched empty drafts; already-adopted Python manifest/rules constraints; and
late returned CAST receipts lost after internal navigation; Windows client
private-file permission handling; inherited trustee atomic publication/custody;
and live enrollment log binding with cached-draft navigation lifetime.
Four historical fix families are also recovered from #57, #61, #63 and #64.
This yields **22 substantive repaired or recovered defect families** in the local
composition. Native private-file implementation is integrated with a bounded
independent source receipt; native Windows and overriding POSIX/macOS ACL
qualification remain explicit limits. Test-fixture
integration corrections are additional maintenance, not inflated product-bug
counts. Compatibility corrections found while developing the new origin feature
(IPv6 self origins and post-cast fragment retention) are included in that feature,
not counted as additional historical bugs. Security findings associated with feature completion overlap this count;
the feature and defect totals must not be added as a unique-work metric.

These are implementation counts, not a claim that every final hosted or external
qualification gate has passed. Session signing/clearing fixes and the corrected
loss-versus-erasure disclosure are included within that feature rather than
inflated into additional historical bug families. Shared-worker packaging is a
build correction supporting the session feature, not another user feature.

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

The timezone and separate-origin integration is tested through the actual
organizer publication handler: the existing signed UTC fields, API-origin HTTP
signature audience, returned log origin and board-scoped organizer key all agree.
Independent router tests exercise same-ID elections on separate boards, read-key
changes, actual casting and scoped receipts, and reject cross-board signer reuse.
The deployment retains its original CSP and bundle-size limits; lossless catalog
representation creates room without deleting draft messages or changing review flags.

Hosted server failures on the first publication exposed one production recovery
regression and two stale integration fixtures. The repair preserves the original
lazy-startup assertion and adds boundary cases for nonempty missing anchors and
empty rollback behind a newer floor. It does not relax first-acquisition signing
or deletion gates. See [the repair receipt](../reports/hosted-ci-repair-20261119.md).

The later live-enrollment repair preserves the server summary's original log
claims and checks them against the derived manifest before a view can use the
context. Missing/mismatched metadata refuses the context. Drafts without a bound
context refresh on navigation, and stale route completions cannot replace an
active cached load or orphan its live stream. The two origin-fixture corrections
retain all assertions and timeouts; the native split-origin journey explicitly
retains same-document navigation. These related lifecycle corrections count as
one substantive family. See [the source-bound report](../reports/hosted-browser-repair-20261119.md).

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
PR #69 had two cancelled macOS cells. Targeted retries completed successfully:
[run 44294076403, attempt 3](https://github.com/djshellshoxxx/quietvote/actions/runs/44294076403)
now has all 27 latest jobs successful on its exact unchanged head. No assertion or
timeout was weakened. New combined-source checks remain required independently.

The initial live recheck found zero inline review threads on all 11 open PRs;
there were no outstanding inline conversations to silently mark resolved.

All 11 existing open PRs (#27, #43, #57, #60, #61, #63, #64, #65, #66, #69 and #70)
received a source-preservation/status comment linking to [PR #71](https://github.com/djshellshoxxx/quietvote/pull/71).
They remain available for provenance and formal review. None is marked formally
approved or merged by this report.

## Final qualification and merge gate

See [FINAL_VERIFICATION](FINAL_VERIFICATION.md) for actual checks and
[SECURITY_REVIEW](SECURITY_REVIEW.md) for trust boundaries. The core gaps and
concrete decisions still needed are in [UNFINISHED_WORK](UNFINISHED_WORK.md).
No claim of 100% product completion is made.

The fresh core reviewer reports its exact scope in
[INDEPENDENT_REVIEW](INDEPENDENT_REVIEW.md). A separate fresh surface reviewer
identified and revalidated the announcement and IndexedDB retry fixes; its final
build/surface receipt is [INDEPENDENT_BUILD_REVIEW](INDEPENDENT_BUILD_REVIEW.md).
The later composition is covered by [INDEPENDENT_RECOVERY_FOLLOWUP](INDEPENDENT_RECOVERY_FOLLOWUP.md)
and [INDEPENDENT_UI_FOLLOWUP](INDEPENDENT_UI_FOLLOWUP.md), each bound to ba728be
and its exact tree. [INDEPENDENT_MANIFEST_FOLLOWUP](INDEPENDENT_MANIFEST_FOLLOWUP.md)
qualifies the adopted Python corrections. The subsequent session/shared-worker
composition, privacy copy and late-receipt repair are covered by
[INDEPENDENT_SESSION_BUILD_FOLLOWUP](INDEPENDENT_SESSION_BUILD_FOLLOWUP.md), bound
to cde2db27 and tree 80a9f1fc. Its 116-case batch, strict scoped checks and two
byte-identical builds do not qualify the separate native private-file branch or
native browser execution. Native file handling is covered by the attributed
author checks and bounded [independent source receipt](INDEPENDENT_TRUSTEE_PUBLICATION_SOURCE.md).
The live-enrollment and navigation follow-up is covered by
[INDEPENDENT_LIVE_TRANSITION_FOLLOWUP](INDEPENDENT_LIVE_TRANSITION_FOLLOWUP.md).
Agent reports supply
engineering evidence and do not impersonate formal repository reviewers.

Main remains at 019f4e789be2ff38a5fb2d348c3b225cc87cf296. Sensitive protocol,
vector and workflow changes require two formal approvals including a designated
security reviewer under repository policy. MAINTAINERS lists none appointed;
agent review cannot supply that appointment or approval. Historical missing DCO
trailers also remain a provenance decision. The absence of an enforced GitHub
ruleset does not waive the written review requirement.

## Publication receipt

[PR #71](https://github.com/djshellshoxxx/quietvote/pull/71) targets main from
`codex/quietvote-comprehensive-consolidation`. The first published commit is
`ddf58d6168e2b8bc5069689400538be8e9b85180`, whose tree
`8dbfbe91c7d3551fa70700ee8723ecb280ca2096` exactly matches local candidate
`be098bee3498ca0de742008c3067f0727862b117`. This was checked through the remote Git
object API and again after fetching the branch and comparing both trees.

Publication used a new commit with the existing membership head and five explicit
original source parents. It does not claim that new local engineering commit
identifiers are identical to the publishing connection's commit identifier. Their
source tree and review provenance are preserved by the equality receipt and the
reports. Original remote commits retain their own authors and trailers.

A post-publication inventory found 73 remote branches: all 72 original branches
plus the requested candidate. The ancestry check on the actual published commit
again found 65 original tips contained. No original branch was deleted or moved.

Exact-head hosted qualification is tracked on
[the PR checks page](https://github.com/djshellshoxxx/quietvote/pull/71/checks).
The initial full matrix is run 44493061333, visual checks are run 44493050632, and
claims/documentation checks are run 44493050749. Queued jobs are not passes. See
[FINAL_VERIFICATION](FINAL_VERIFICATION.md) for the eventual qualification receipt
and [CONTINUATION](CONTINUATION.md) for the preserved remaining steps.


The second publication is `bcd411572cbf1e56218b3d601b18dbd6d1d52b4e`, a normal
successor whose only parent is the first published commit. Its complete tree
`9ca302d9a3d336f47dbed68a6aa02179897c063a` exactly matches local report-bearing
candidate `8b5395ae389bed53964da6f71d3fde2ee384246a`. API and fetched-tree
comparisons both confirm equality. Production is unchanged from independently
reviewed ba728be; intervening changes are reports and status documentation.
Second-head full CI is [44509755234](https://github.com/djshellshoxxx/quietvote/actions/runs/44509755234),
claims/docs are [44509755400](https://github.com/djshellshoxxx/quietvote/actions/runs/44509755400),
and visual checks are [44509755222](https://github.com/djshellshoxxx/quietvote/actions/runs/44509755222).
These runs record the second head's result, including the failed ninth browser
journey. The PR remained a draft while the subsequent engineering lanes ran.

## Later implementation composition and publication binding

Local source composition `3bf601dd47dd6913c65270aa7fb388aa65b933ee`, tree
`ad31966891f042b3119b815539adefc8bb4066a7`, contains the adopted Python policy,
explicit session workflow, shared-worker packaging, returned receipt handoff,
native private-file handling and hosted browser/lifecycle corrections.

The complete web source/test/e2e directories, crypto/protocol source, package
manifests/lock and vendor lock compare exactly with the reviewed web source
`d5435026d6b8c68ff8bf5d4edd76e645ef919724`. The complete CLI/trustee directories
and changed server registration fixture compare exactly with private-file source
`239dfaf9ddedf5c0f3288ed566e6a81be54d4e45`. These are composition checks, not a
substitute for executing the full published tree. Subsequent audit additions do
not change those implementation components.

The PR description records the next publication's exact local target, remote
commit, tree equality and current run URLs. Publication uses a normal successor
of the then-current candidate with an expected-head lease; every original remote
tip is rechecked. Current-head hosted results and formal reviews are separate
gates. A historical checkpoint's pending status below does not override the
current PR's live qualification record, and a passing older head does not qualify
a later source change.
