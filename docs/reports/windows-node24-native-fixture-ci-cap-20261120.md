# QuietVote PR #71 — Windows Node 24 private-file test fan-out isolation

Date: 2026-11-20 UTC. Reviewed source before this change: `6c2f5502a08e17c1ecd27e9b3120375c2aa266d4`, tree `3cb355bdeacc73bc10b8df0eb209d5cc741787e8`; target draft branch `codex/quietvote-comprehensive-consolidation`.

## Observed completed CI at exact head

[27-job CI matrix 44745637619](https://github.com/djshellshoxxx/quietvote/actions/runs/44745637619) completed with **25 successful jobs and two failed Windows Node 24 jobs**. The mandatory [browser journey 136320191391](https://github.com/djshellshoxxx/quietvote/actions/runs/44745637619/job/136320191391) passed; Windows Node 22 server/web, both macOS Node 24 trustee/crypto and Windows Node 24 trustee/crypto passed. Claims and pseudo-locale visual workflows also completed successfully.

- [CLI+board 136320191536](https://github.com/djshellshoxxx/quietvote/actions/runs/44745637619/job/136320191536): CLI **142 passed, three failed, six skipped**; board **78 passed**. Failures: `all-clients-executable.test.ts:25` and `audit.test.ts:78` each reached the synchronous Windows PowerShell helper's unchanged 15-second deadline while creating legitimate test fixtures. `audit-regressions.test.ts:33` received a CLI exit 4 / `UNAVAILABLE` when attempting the normal private keygen `--force`. The output does not independently identify that third refusal as a deadline expiration.
- [Server+web 136320191553](https://github.com/djshellshoxxx/quietvote/actions/runs/44745637619/job/136320191553): server **351 passed, one failed, seven skipped**; web **441 passed**. The same enrollment-review test failed despite its new async fixture path; `HeldStream.abort` ran after a timer fired and reported `UNAVAILABLE` without a finite diagnostic, so its precise native failure cause remains unproven.

Repeated independent tests now show native helper availability/startup under Windows Node 24 test-file fan-out as an actionable CI risk; they do **not** establish a native ACL, product logic, or PowerShell compilation root cause.

## Narrow engineering change and verification boundaries

The existing GitHub Actions workspace loop still executes every workspace and retains `rc=1` propagation. Only for `windows-2025`, Node 24, and the `cli` or `server` workspace, it passes `--test-concurrency=2` into the **unchanged npm test script**, limiting simultaneous test files. Other operating systems, Node 22, board/web suites, all assertions and all test cases retain the original command. The check-workflow-coverage test adds explicit source-level regression assertions for this branch and full-shard execution.

The observed failure is sufficiently tied to concurrent short-deadline native fixture operations to justify **bounded test isolation as an experiment**, not to claim a verified root-cause fix. The 15,000 ms native operation deadlines, Windows DACL/owner/same-handle checks, fail-closed errors, no automatic replay, CSP and browser assertions are unchanged. No runtime library, protected native script, dependency, release or deployment file is changed. A local Node 22 smoke of npm's appended `--test-concurrency=2` argument passed; no repository or native Windows test was executed locally because the GitHub checkout is unavailable from the execution host.

## Scoped review and fresh-worker handoffs

**Code audit (source-only):** Examine `.github/workflows/ci.yml` test loop and both workspace `package.json` scripts. Confirm one `npm test` invocation, preserved exit-status aggregation, unchanged native helper files and that only the Windows Node 24 CLI/server branches carry the appended flag. This is not independent worker attestation.

**Functional bug hunt (source-only):** Compare four failures above against current-head Windows Node 24 rerun logs. Determine whether reducing test-file fan-out avoids native startup starvation and whether any genuine 15-second service failure persists. If failures remain, isolate startup/compile/queue latency with benign, nonsecret timing receipts before another change; do not extend deadlines or skip tests. Do not claim the current patch passed until new-head CI completes.

**Defensive security review (source-only):** Confirm no changes to protected file writes, owner and DACL checks, native held-handle safety, process stderr secrecy, error handling, or operation replay. Keep POSIX/macOS ACL grants beyond effective mode/sticky bits open. Appointed sensitive-change reviewers must still formally approve this candidate.

These scopes were investigated in a single tool session; **separate fresh agent processes could not be launched**. Successors should independently execute these scopes, record exact source/runner versions, and integrate only supported findings. Do not inspect or resume the previously stopped background-runtime/gossip investigation.

**Promotion gates:** historical/recent DCO provenance decision; two appointed formal approvals including security reviewer; unadopted governance, membership, challenges/FINAL and signed-freshness contracts; POSIX/macOS ACL; worker integrity and wrapping-provider constraints. No main merge, release, deployment, force-push, original-branch deletion or paid-service change.
