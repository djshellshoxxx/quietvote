# Independent bug hunt, round 4 — November 19, 2026

Worker: `/root/bug_hunt_r4`, fresh successor to the native-diagnostic implementation.

## Supplemental private-file composition

Reviewed and executed source: `434b2b5458b5894b8e3a595e416c030421d79932`.
Complete tree: `006b0302d998be1f86d1ae89d368a338be7a0352`.
The base is published candidate `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab`.

This review selected the interaction of the private-file changes and existing
publication behavior. It found no concrete blocker in that selected scope.
Finite diagnostics preserve native-refusal precedence and existing error codes.
An apparent success frame from a failed process still refuses. Native scripts,
deadlines, asynchronous queue, permission checks, child-close wait and replay
behavior are unchanged. The POSIX cleanup guard retains its documented effective
ownership/mode/sticky-permissions assumption; native ACL grants are not inspected.

### Independent execution

Environment: Linux, Node 24.22.3. The unchanged lockfile was installed with
`npm ci --ignore-scripts --offline --no-audit --no-fund`. `npm run vendor:install`
verified two pinned packages and 132 verbatim files.

Seven unchanged suites ran serially with a 256 MiB Node heap:

- CLI `private-file-diagnostics.test.ts`
- CLI `private-file-transport.test.ts`
- CLI `private-file-lifecycle.test.ts`
- CLI `private-files.test.ts`
- CLI `private-file-publication.test.ts`
- Trustee `private-files.test.ts`
- Trustee `private-file-publication.test.ts`

Result: **24 passed, 0 failed, 0 skipped, 0 cancelled; exit 0; 1.508 seconds.**
Wrapper-internal assertions overlap this count and are not added to it.
These local unit/publication results do not qualify Windows APIs or macOS ACLs.

## Hosted observation on the published base

At `2026-11-20T02:38:37Z` (November 19 in America/Los_Angeles), PR #71 still
identified `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab` as its head. Hosted checks
therefore qualify that published base, not the supplemental local tree.

- [Full matrix, run 44660024709](https://github.com/djshellshoxxx/quietvote/actions/runs/44660024709):
  two successes, five in progress and twenty queued; no completed failures.
  Typecheck/supply-chain and macOS Node 22 trustee/crypto were successful.
- [Pseudo-locale visual run 44660024674](https://github.com/djshellshoxxx/quietvote/actions/runs/44660024674):
  completed successfully.
- Both Windows server/web jobs remained queued: Node 22 `136035694239` and
  Node 24 `136035694027`. No new result established a cause or repair for the
  historical first-write failure.

Queued and running jobs are not passes. Supplemental diagnostics require their
own published-source Windows execution before informing that failure's cause.

### Later browser failure and minimal repair

At `2026-11-20T02:40:14Z`, the matrix had five successes, one failure, two jobs in
progress and nineteen queued. The additional successes were conformance/build,
macOS Node 22 server/web, and Ubuntu Node 24 protocol/verifier. Claims and visual
workflows both completed successfully on the published base.

The [browser job](https://github.com/djshellshoxxx/quietvote/actions/runs/44660024709/job/136035694068)
ran all nine required journeys. Seven completed successfully. Two failed:

- `verifier.ts:344`: the final no-CSP-error assertion recorded the browser's
  implicit `/favicon.ico` load being refused by the standalone page's
  `img-src data:` policy.
- `split-origin.ts:105`: the unchanged 30-second wait for the exact text
  `You are on the voter list.` timed out after same-document invitation removal.

The hosted checkout was PR merge commit
`53ea07da01e74fa0291e174643b5fefa293b398e`; a read-only fetch confirmed its tree
`7d2376765e900444cdebab73af85070ffbbd0aaf` equals the published `8b7aa031` tree.

The standalone verifier template now supplies one explicit self-contained SVG
icon using a data URL. This removes the need for the browser's implicit network
icon while retaining the existing data-only image policy. Script/style hashes,
network policy and all native browser assertions/timeouts are unchanged.

An added assertion inspects the actual generated `verifier.html`, requires its
explicit inline icon and retains the data-only image policy. On unchanged
production source, that test failed at the missing icon: **0/1 passed**. After
the template repair, the full build test file passed **4/4**, zero failures,
skips or cancellations, exit 0, in 2.004 seconds. This includes two identical
build outputs, asset/SRI checks, offline script/style hash checks and source
lint. Reviewed source blobs are `4cc78e29e866780cb1e71aec1a24d512fef4c974`
(`site.ts`) and `400326a1d1ed971be3d229e666a5e7c8cfa53088` (`build.test.ts`).
The generated-HTML evidence supports the repair; a fresh hosted browser run is
still required to qualify the actual browser behavior.

The supplemental router already includes the earlier same-URL event
deduplication absent from `8b7aa031`. Its unchanged application regression
explicitly models the enrollment draft becoming ready, invitation removal,
`popstate` followed by delayed `hashchange`, passphrase entry between the events,
and successful display of the same voter-list text. This covers a plausible
mechanism for the observed failure. The hosted log contains no event trace that
proves that mechanism was its cause, so no additional router change or timeout
increase is made. Current-source native qualification remains open.

## Limits and successor handoff

Whole-repository local TypeScript and local Chromium were not repeated after the
documented resource/runtime failures. The stopped background-gossip investigation
was not resumed and its untracked test was not inspected or used.

Formal sensitive-change review, native Windows qualification, POSIX/macOS ACL
custody and release evidence remain separate. This worker performed no remote
mutation, branch deletion, main merge, deployment or release.
