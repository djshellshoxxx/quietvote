# QuietVote PR #71 — Windows enrollment fixture startup reduction and handoff

Date: 2026-11-20 UTC. Source: PR #71 head `a30e40560cf7c4cb599864758e0645cc94773873`, tree `3dfff36252ceeaf11c1ffaecdb16ee6f0d582dbd`. Target: draft continuation branch `codex/quietvote-comprehensive-consolidation`.

## Current-head hosted qualification

[CI matrix 44731397395](https://github.com/djshellshoxxx/quietvote/actions/runs/44731397395) completed at the inspected attempt with **26 successes and one Windows Node 24 server/web failure**. The mandatory production browser journeys (job 136271892655), including split-origin, verifier CSP and accessibility tests, passed. Windows Node 22 server/web and macOS Node 24 trustee/crypto passed; claims lint and pseudo-locale visual workflows passed separately.

[Windows Node 24 server/web job 136271893401](https://github.com/djshellshoxxx/quietvote/actions/runs/44731397395/job/136271893401) retained 441/441 passing web tests. The server-side `review: shipped CLI enrollment rejects forged success and sanitizes extra response data` test failed with `WindowsPrivateFileError`, diagnostic `TIMEOUT` at `windows-private-files.ts:74`, inside the first `writePrivateFixture` call. It is an explicit `ETIMEDOUT` from `execFileSync`, not an ACL refusal or malformed server response. The failure has occurred on more than one source; no observed log establishes whether compilation, runner contention, or another native startup stage caused the delay.

A **failed-job-only rerun** was requested for the unchanged head; it is independent evidence and must not be mislabeled as passing or retroactively assigned to this new commit.

## Narrow source change

The affected server integration test previously called the synchronous private-fixture function twice before exercising the shipped CLI. On Windows, each call launched a fresh PowerShell 5.1 process, compiled the same managed native helper and required an owner-only protected write. The test now uses a dedicated **async test-fixture helper** for those two preparations on Windows. It dispatches through the existing `writeWindowsPrivateFile` service, so successive fixture writes can share one native helper process. On POSIX, it delegates unchanged to the established synchronous fixture implementation.

This changes **test fixture setup only**. The actual shipped CLI enrollment, the forged response rejection, data minimization assertions and the native private-file creation checks remain unchanged. The native 15-second per-operation deadline, no-replay policy, owner/DACL/held-handle checks, error classification and PowerShell script are unmodified. No Windows test is skipped, and there is no alternate unprotected file creation path.

The reduction from two PowerShell startup/compile sequences to a potentially shared service is a source-supported mitigation for unnecessary native process work; **it is not a proven root-cause fix**. A PowerShell startup taking longer than 15 seconds can still refuse as designed. The changed source requires new-head Windows Node 24 verification. Local native Windows execution was not available; no fresh local repository test pass is claimed.

## Scoped review and next-worker handoffs

**Code audit (source review):** The helper is test-only and uses the existing production async bridge. Both original synchronous fixture and production APIs remain available. Calls are awaited before invoking the CLI; failures still fail the test and cleanup runs under the existing `finally` blocks. No dependency/lockfile/workflow edit.

**Functional bug hunt (source review):** The observed failure is precondition setup, not forged response handling. The test still runs the same two CLI decisions, checking refusal, accepted public JSON, and absence of the extra secret and invite code. Compare the native duration on the new commit with the unchanged rerun; if the failure persists, investigate process startup and host contention under the original 15-second limit without guessing or weakening coverage.

**Defensive security review (source review):** Windows fixture file creation still enters the existing native `Write` operation with protected owner-only DACL, held handle, identity checks and fail-closed native errors. No secret bytes are written via Node `fs.writeFile` on Windows. Service lifecycle follows the already reviewed queue/close behavior. These three scopes were reviewed within one invocation, **not executed as independent worker agents** and do not substitute for an appointed reviewer.

**Next fresh workers:** independently audit test-only bridge selection and drift between CLI/trustee native sources; investigate Windows Node 24 native startup timings and any untrusted-output exposure with benign tests; verify security properties and actual native file rights; then integrate only source-supported findings with new-head CI receipts. Preserve isolated worktrees and concurrent owners. Do not inspect the previously stopped background-runtime/gossip investigation.

**Unchanged blockers:** POSIX/macOS effective ACL grants beyond mode/sticky bits, unresolved governance/ratification, group membership, challenge/finality, authenticated freshness, worker integrity, wrapping-provider and signed display-zone contracts. Main promotion still requires two formal sensitive-change approvals (including an appointed security reviewer) and the historical plus recent DCO provenance decision. This report is not such approval. No main merge, release, deployment, force-push or branch deletion.
