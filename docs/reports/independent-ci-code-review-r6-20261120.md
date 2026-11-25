# Independent CI code review, round 6 — November 20, 2026

## Result and exact source

No implementation defect was found in the Windows Node 24 test-file concurrency
change. The unchanged workflow coverage tests pass **7/7**. A separate execution
of the actual Bash loop passes **72/72 orchestration scenarios**. An actual npm
workspace smoke confirms that the unchanged test script discovers all three
fixture files with the appended option and preserves a failing test's exit
status. No production source, test assertion, test selection, timeout or workflow
was changed by this review.

- Reviewed commit: `a5e5d19b6213dd4477b849deda7a3c837ea7fce0`.
- Reviewed tree: `a5aa203ca47b10e0aa1fb63d3fc913933cc0e053`.
- Change base: `6c2f5502a08e17c1ecd27e9b3120375c2aa266d4`.
- Reviewer: fresh `/root/code_audit_r6` worker, isolated worktree on
  `codex/qv-code-r6-20261120`.
- Environment: Linux, Node `24.22.3`, npm `11.19.1`, Bash `5.2.37`.
- Work was serial and used Node heap limits of 256 or 512 MiB. No repository
  dependency installation was needed for these tooling checks.

This is a bounded engineering review. It is separate from the formal approvals
required by [GOVERNANCE](../../GOVERNANCE.md) and
[QV-30](../30-engineering-standards.md), and from native-platform execution.

## Standards review

The implementation keeps one shared workspace test invocation, a narrow
conditional argument list, and the existing documented failure aggregation.
It adds no dependency or protocol behavior. The latest diff contains only
`.github/workflows/ci.yml`, its coverage test, and the
[source-bound change report](windows-node24-native-fixture-ci-cap-20261120.md).
Protected-file helpers, the 15-second native deadlines and product source are
unchanged by that commit. No code-structure finding requires a repair.

One existing provenance gate remains explicit: the reviewed `a5e5d19` commit has
no `Signed-off-by` trailer. This violates the contribution rule in
[CONTRIBUTING](../../CONTRIBUTING.md); the gap is not limited to old history.
This review does not supply its author's attestation or rewrite that commit.
The new report contribution carries its own author-matching DCO sign-off.

## Requested-behavior review

The [workflow](../../.github/workflows/ci.yml) sets the additional argument only
when all three conditions hold: `windows-2025`, Node `24`, and workspace `cli`
or `server`. It resets `args=()` inside every iteration. The paired `board` and
`web` commands therefore retain their original arguments, as do every other
operating system, Node version and workspace.

The [CLI](../../packages/cli/package.json) and
[server](../../packages/server/package.json) scripts remain
`node --test --test-reporter=spec "test/**/*.test.ts"`. The appended
`--test-concurrency=2` bounds concurrent files without replacing that glob or
introducing a test-name filter, skip, early return or changed assertion. The
workspace list and all 24 OS/Node/shard combinations remain intact.

`rc` starts at zero outside the loop; every failed npm invocation sets it to one
without breaking the loop. A later successful workspace cannot clear it. The
final `exit $rc` preserves failure after either the first or second workspace.
This behavior was executed rather than inferred solely from string assertions.

The coverage regression intentionally inspects the repository's current source
layout; it is not a general YAML or shell parser. Its existing assertions and
this independent executable smoke are complementary evidence. No unsupported
claim of a PowerShell startup or ACL root-cause fix is made.

## Executed verification

| Check | Observed result | Boundary |
| --- | --- | --- |
| Existing workflow coverage test | 7 passed; 0 failed, cancelled, skipped or todo; exit 0 | Exact repository test, unchanged. |
| Actual Bash workspace loop | 72 scenarios passed; no skipped scenario | All 24 matrix cells, each with success, first-workspace failure and second-workspace failure. npm itself was a capturing shell function. |
| Actual npm script, success fixture | All 3 separate test files ran; 3 passed, 0 skipped; exit 0 | Temporary workspace used the repository's exact CLI/server test-script string. |
| Actual npm script, failure fixture | All 3 separate test files ran; 2 passed, 1 intentionally failed, 0 skipped; npm exit 1 | The smoke harness expected and checked that failure. It is not a project-test failure. |
| PR #72 documentation diff | `git diff --check` passed | Five documentation paths; no executable input changes. |
| Report-bearing documentation links | 2,205 links in 361 files; none broken; exit 0 | Current worktree including this report. |
| Report-bearing claims lint | 0 findings; 340 files and 45 rules checked; exit 0 | Existing rules unchanged. |

Existing test command:

```sh
NODE_OPTIONS=--max-old-space-size=512 \
  node --test --test-concurrency=1 .github/scripts/check-workflow-coverage.test.mjs
```

The loop smoke extracted the `Workspace tests` Bash body directly from the
reviewed workflow, substituted each declared matrix tuple, and ran it with
`bash --noprofile --norc -eo pipefail`. Its npm function recorded every argument
and optionally returned 23 for one selected workspace. Each scenario asserted
two invocations in declared order, exact argument arrays, one finite diagnostic
for an intentional failure, and the final expected status of zero or one.
The paired workspace always ran after an earlier failure. Resetting the option
between workspaces was exercised explicitly.

The npm smoke copied the unchanged script string into a temporary package named
`@quietvote/cli`, created three independent `.test.ts` files, and invoked
`npm test -w @quietvote/cli -- --test-concurrency=2`. It checked file discovery,
pass/fail/skip totals and status for both success and one deliberate ordinary
assertion failure. Temporary files were removed in `finally`. These harness
scenarios are not added to a unique project-test total.

The coordinator supplied completed exact-source hosted qualification for
[matrix 44762725138](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138)
(all 27 jobs successful),
[claims/docs 44762725009](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725009)
and [visual 44762725141](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725141).
This worker independently checked source and local tooling, not those job logs.
The hosted runs remain evidence for their exact `a5e5d19` source; a later feature
change needs its own applicable verification.

## PR #72: unique documentation and consolidation plan

The documentation continuation is one commit,
`9d3292bf945a283e7ec3b549a603692a902dc0c9`, on
`codex/quietvote-consolidation-20261120`. Its merge base with reviewed head
`a5e5d19` is `8f865fb3cf9c5d203e532abb19848cd46050db9a`. Its delta is 320
insertions across exactly five documentation files:

| Path | Unique content |
| --- | --- |
| `docs/audits/CONSOLIDATION_CHECKPOINT_20261119.md` | 143-line source-bound checkpoint: branch inventory, 71 tooling checks, 41 application checks, 22 CLI/server checks, historical hosted observations and recent DCO provenance gate. |
| `docs/reports/independent-cli-pool-review-20261119.md` | 76-line independent organization/export/pool review; exact 8f source, commands, 22/22 result and limits. |
| `docs/reports/independent-split-origin-review-20261119.md` | 91-line independent application review; exact 8f source, 41/41 result and native-browser environmental refusal. |
| `docs/audits/CONSOLIDATION_REPORT.md` | Five-line link and status introduction for the historical checkpoint. |
| `docs/audits/CONTINUATION.md` | Five-line link and source-bound summary of the historical checkpoint. |

At this review's exact head, the three added files are absent. The other two
files are byte-identical to their `8f865fb` versions. There is therefore no
overlap conflict between that documentation delta and the changes from `8f` to
`a5`. PR mergeability against main is a different comparison and does not show
that these receipts conflict with the canonical candidate.

The coordinator can apply the single commit normally to its current continuation
branch, after rechecking those five paths for intervening edits. Preserve all
three report bodies and their `8f865fb` source qualifications. When composing
the current R6/current-CI links, change the two added "Latest independent
continuation" introductions into historical checkpoint wording. Keep later
source receipts alongside them; do not replace their historical queued statuses
with later-head passes or add their overlapping test counts into a project
total. If a concurrent edit touches either introduction, retain both sets of
links while resolving only that context.

Then run documentation links, claims lint and whitespace checks on the composed
tree. There is no missing production code in this PR. This worker did not
cherry-pick, merge, publish, close a PR or alter the coordinator's branch.

## Bounded next CLI gap

`online backup-create` is a decision-free next adapter for the already
implemented and documented `POST /admin/backups` request in
[QV-09 section 10](../09-api-data-contracts.md#10-export-import-jobs-admin).
The CLI command map has no such command at the reviewed head. The current
[CLI README](../../packages/cli/README.md) explicitly lists backup/restore
adapters among the remaining workflow gaps.

Keep its scope to the existing `scope: "all" | "election"` body, optional
`election_id` under that existing contract, signed administrator request and
explicit idempotency key. Reuse `job-inspect` for the asynchronous result. The
server already owns authorization, snapshot production and the private backup
directory. A command should validate its arguments before unlocking, unlock
once, avoid automatic mutation retries and preserve the established unknown
outcome behavior. Ordinary adapter and existing server-contract tests can check
the request and returned job without a new protocol decision.

This does not complete remote backup download, encryption/offsite retention,
restore orchestration or independent recovery verification. The server already
ships the separate local `qv-backup` entry point, so its recovery implementation
must not be described as absent or duplicated by this transport adapter. The
coordinator owns the feature implementation and its fresh review.

## Successor handoff

Standards: no implementation defect; one existing missing-DCO gate on the
reviewed commit. Requested behavior: no finding. No production fix is justified
by this audit. Preserve the exact-source test receipts and give later feature
changes their own review. The unresolved contracts, native ACL boundary and
formal promotion requirements remain in
[UNFINISHED_WORK](../audits/UNFINISHED_WORK.md).

The stopped background-runtime/gossip investigation and its old test were not
inspected or resumed. No native Chromium command was attempted. This review
neither changes nor bypasses those boundaries.
