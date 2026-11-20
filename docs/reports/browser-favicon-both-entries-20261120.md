# QuietVote PR #71 — browser favicon regression and source-bound handoff

Date: 2026-11-20 UTC. Baseline PR #71: `5f30405ac98769bbc2b14214db683f2baf64e07e`, complete tree `a1aaf39cebd11dc8beed6580c99fd6e538809e4a`, branch `codex/quietvote-comprehensive-consolidation`, draft against main `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.

This continuation read `docs/audits/CONTINUATION_SUPPLEMENT_20261119.md`, `docs/audits/UNFINISHED_WORK.md`, `docs/reports/final-integration-checks-r5-20261119.md` and later PR #71 handoffs. The stopped background-runtime/gossip investigation and untracked test were not resumed.

## New current-source hosted facts

[Matrix #44715874335](https://github.com/djshellshoxxx/quietvote/actions/runs/44715874335) at selection contained 19 successes, two failures, two running and four queued jobs. This is a momentary count, not a completed matrix.

- [Mandatory browser job 136219168167](https://github.com/djshellshoxxx/quietvote/actions/runs/44715874335/job/136219168167): the **entire split-origin journey passed**, including enrollment, storage isolation, cast/receipt, organizer creation/publication and serving-policy checks. The separate `verifier.ts:344` global CSP assertion nevertheless failed on an unexpected `http://127.0.0.1:37733/favicon.ico` fetch under `img-src data:`. No assertion or CSP rule was relaxed. The same generated-verifier tests passed 29/29 in the preceding two browser jobs, so this is intermittent on the latest source; the exact browser timing/path initiating the implicit request has **not** been established.
- [Windows Node 24 server/web 136219168171](https://github.com/djshellshoxxx/quietvote/actions/runs/44715874335/job/136219168171): 351 server tests passed, one enrollment-review test failed, seven skipped; all 441 web tests passed. The first native Windows protected-file fixture timed out at the existing 15-second PowerShell deadline. Repetition strengthens the confirmed failure, not a conjecture about its cause. No deadline, owner/DACL/identity check, native permission refusal, replay rule or platform test was changed.
- macOS Node 24 trustee/crypto passed on this baseline; POSIX/macOS ACL grants beyond mode/sticky inspection remain unresolved.

## Scoped code, functional and defensive reviews

**Code audit (source inspection):** `packages/web/src/build/site.ts` already embeds a valid self-contained data SVG favicon in standalone `verifier.html`, but generates the main `index.html` without any favicon declaration. `verifier.ts` repeatedly navigates the same page between standalone verifier and SPA `/verify` across the same origin. An implicit favicon request after those transitions is consistent with the observed intermittent request, although this does not prove the exact request scheduling.

**Ordinary functional repair (source-only until hosted testing):** move the existing data SVG string to a single module constant, declare it in *both* generated HTML entry points, and add a build test requiring the SPA declaration and embedded SVG. Preserve the standalone verifier's previously tested icon and its generated hash/policy behavior. This directly addresses the documented missing SPA icon without introducing an external file or making the CSP broader. The existing mandatory browser assertion remains the qualification gate.

**Defensive security review (source-only):** The icon is a static, self-contained SVG with no script, event handler, external URL, or third-party request. The common app CSP already permits `data:` images; the standalone verifier retains `img-src data:`. Changes do not affect script/style SRI, Trusted Types, cryptographic verification, keys, token handling, native ACL, permission checks, timeouts or no-replay behavior.

These reviews and source assertions are within one invocation, **not three independent worker executions**. No newly executed repository unit/browser test or appointed security approval is claimed.

## Fresh-worker handoff

1. **Fresh code auditor:** inspect the exact two-template and build-test delta, especially generated `index.html` and `verifier.html`, and compare against the current published source/tree. Confirm data URL handling with unchanged CSP and output determinism.
2. **Fresh functional bug hunter:** inspect the **new-head** production browser journey. Require the global no-CSP-error assertion to pass, as well as the fully passed split-origin journey. If the intermittent favicon persists, record exact browser navigation, CSP console source, and request origin without secrets before further editing; do not suppress console checks or loosen CSP.
3. **Fresh defensive security reviewer:** independently check the generated SVG/data URL, static publication and test changes; verify that none introduce a network fetch, inline script execution or weaker policy. Retain native ACL and SRI boundaries.
4. **Windows qualification worker:** isolate the repeated Node 24 PowerShell startup/first-write timeout using native Windows fixtures under original 15-second deadline; inspect runner pressure and sync-process lifecycle separately. Do not bypass DACL checks, increase the limit without evidence, replay an uncertain operation, or claim a fix from a Linux model.
5. **Integrator:** refresh draft PR #71, branch SHA, complete tree and CI results. After qualified repairs, select an adopted and unblocked ledger item only; leave governance/ratification, group membership, challenge/finality, authenticated freshness, signed display zone, wrapping-provider conflict and the ACL grant boundary explicitly blocked. Preserve the appointed security reviewer/two formal approvals and DCO provenance decision. No main merge, deployment, release, force-push, branch deletion or historical sign-off.

The prior source's 19 successes belong exclusively to `5f30405ac98769bbc2b14214db683f2baf64e07e`; any new commit requires its own CI. This report does not retroactively attest to unsigned commits.
