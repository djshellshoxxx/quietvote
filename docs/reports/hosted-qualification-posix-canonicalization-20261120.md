# PR #71 — current-head CI diagnosis and POSIX cleanup alias repair

Date: 2026-11-20 (America/Los_Angeles). Reviewed published input: `cd21427345add073d591e58736ad540aa62b159d`, tree `8df96dfcacf5683fff728fc8c8cb0078266bcc45`.

## Hosted qualification observed before this change

On the input head, GitHub Actions [matrix 44665627729](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627729) exposed two ordinary failures. Browser job [136054077407](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627729/job/136054077407) passed the general journey, Help, registration and other completed steps but failed the mandatory split-origin journey at `packages/web/e2e/split-origin.ts:105`: 30-second wait for exact text `You are on the voter list.` after same-document invitation removal and unlocking. This is the same observed wait as the earlier published browser failure. No cause is established from the timeout alone; assertions, CSP, timeouts and route semantics remain unchanged.

macOS Node 24 trustee/crypto job [136054077882](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627729/job/136054077882) recorded 125 passed, one failed, three skipped in its trustee suite. The failure at `packages/trustee/test/private-files.test.ts:57` was `false !== true` for the legitimate cleanup under a trusted sticky ancestor. The adjacent unsafe-ancestor refusal and absolute-cwd checks passed. Both Windows 22 and 24 server/web jobs, both Windows 22 and 24 CLI/board jobs, Linux server/web jobs, and the type/supply-chain gate reported success on this same head. [Claims 44665627826](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627826) and [visual 44665627774](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627774) succeeded. Remaining queued/in-progress matrix cells are not passes.

The earlier `7452d2c` workflows were superseded/cancelled. Their cancellation is not qualification, and neither this report nor its successor reassigns source-specific prior passes.

## Bounded source correction

`shred` previously called `resolve(path)`, then refused if `realpath(path) !== path`, **before** applying `protectedPosixPath`. On a system where a trusted ancestor aliases its physical path, the names differ even when the final file is regular, owner-private and safely staged. macOS commonly exposes paths under a `/var` alias. This explains a reproducible source-level false refusal and is consistent with the hosted macOS failure; the runner's exact directory symlinks were not separately inspected.

The correction canonicalizes the parent through `protectedPosixPath` **before the first asynchronous filesystem call**, preserving its trusted-owner/mode/sticky checks and anchoring the resulting absolute physical path. The existing `lstat`, single-link, final-component `realpath`, held-descriptor, fingerprint and pre-unlink identity checks remain; a symlinked leaf is still rejected. Windows is unchanged. No native ACL interpretation is added.

A new durable POSIX test drives publication and cleanup through a trusted symlinked *ancestor*, then separately verifies that a symlinked *leaf* returns false without invoking overwrite randomness. The existing unsafe-ancestor refusal and relative-cwd regressions are retained. A separate Linux Node 22 filesystem-invariant probe (not an execution of repository source) demonstrated that the old alias equality comparison rejects a trusted ancestor alias while the canonical physical parent matches its real file. This is supporting diagnosis, not a source-test pass.

## Review lanes and next fresh-worker handoffs

**Code audit (source-only, same execution):** reviewed the ordered namespace and identity checks in `fsutil.ts` and the shared `posix-staging.ts`. The new path is checked synchronously under the previously adopted trust model, with no credential, network, retry or other flow changes.

**Functional bug hunting (hosted logs plus source inspection):** selected the above reproducible cross-platform alias case; added the distinguishing regression. Native macOS and full trustee tests must still execute against the resulting new head. The unchanged browser split-origin wait requires its own source-bound investigation and actual browser evidence; do not mask it with a reload, assertion removal or longer wait.

**Defensive security review (source-only):** confirms no relaxation of final-component alias refusal or private-file bounds. Native POSIX/macOS ACL grants beyond inspected mode/sticky bits remain explicitly unresolved. No intrusive testing or stopped background-runtime/gossip investigation was undertaken.

These three scopes are **not independent fresh-worker attestations**; separate agent workers could not be launched in this invocation. A successor should obtain independent code, ordinary-bug and defensive security reviews of the exact new source and report their own executed tests separately. First inspect new-head hosted macOS cleanup and split-origin browser jobs; apply only supported corrections. The prior `ssrf.ts` incomplete-response regression now has same-head Linux/Windows server/web job successes, but other platform cells must be reported by their actual conclusions. Do not reimplement complete enrollment/export CLI or adopt unresolved governance, membership, finality, signed freshness, native ACL or crypto-provider contracts.

Formal appointed-reviewer approvals and historical DCO provenance remain external gates. This checkpoint is not a release, main merge, or deployment.
