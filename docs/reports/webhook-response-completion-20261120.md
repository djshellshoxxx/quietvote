# Webhook response-completion repair and review handoff — 2026-11-20

## Source and qualification boundary

This follow-up begins at published PR #71 head `7452d2cf697e690a663fcb8e5facd2d8cb63dd3c`, full tree `c607921caf3b1e45bfab838a7aae2c9461825765`. The original three current-head workflows (matrix 44664046341, claims/docs 44664046344, visual 44664046354) were **queued**, not passes, when inspected. No initial hosted failure on that source had yet been confirmed. The preceding browser and Windows history belongs to older heads.

Only the common HTTP response transport in `packages/server/src/ssrf.ts` and its existing `packages/server/test/ssrf.test.ts` were changed. This work does **not** resume, inspect or integrate the previously stopped background-runtime/gossip investigation or its untracked test. It does not change target validation, DNS pinning, TLS certificate checking, redirect policy, timeouts, status-code classification or the intentional `maxResponseBytes: 0` behavior.

## Source-focused code audit

The existing `WebhookService.run` in `packages/server/src/webhooks.ts` treats a returned HTTP 2xx status as successful delivery, deletes the durable outbox row and resets failure tracking. Prior common transport returned `{ status: 200, truncated: false }` on both response-stream `error` and `close`, even if an explicit Content-Length was not received. Therefore a *premature* response close could be misclassified as completed webhook delivery, rather than a retryable transport error. This finding is source-local to the response-completion behavior; it is not a finding about the external target policy.

The repair rejects response-stream errors and incomplete closes. On a complete response, the existing end/close path still resolves, and the existing explicit size-limit truncation result remains. No new automatic mutation replay was added: the webhook service's existing durable retry policy handles transport errors.

## Ordinary functional bug-hunt and benign verification

A local isolated copy of the upstream transport function, under Node `22.16.0` and OpenSSL `3.5.5`, was exercised against a loopback self-signed TLS test server. That server sent HTTP 200 with a declared 20-byte body, a shorter partial body, then closed its connection. The **pre-repair excerpt returned HTTP 200** for both `captureBody: false` and `true`; the **repaired excerpt rejected** both as `aborted`. A complete response still succeeded. All assertions in this isolated reproduction passed.

These are tests of an isolated excerpt, **not** an execution of QuietVote's checked-out source or its full repository tests. The committed native TLS test exercises both capture modes in the existing server test file, without changing any existing assertion or wait; it must execute on a supported runner. No repository test, full TypeScript gate, hosted browser journey or platform matrix is claimed as passing for these changed files.

## Defensive security review

This correction avoids counting a prematurely interrupted HTTPS response as a completed webhook exchange. The existing HTTPS-only policy, exact certificate/hostname verification, pinned IP lookup and no-follow redirects remain unchanged. The service already maps unrecognized transport errors to its finite `transport_error` outcome and applies its existing retry cap. No new URL parsing, credential logging, response-body exposure, hostile target request, intrusive probe or protocol exception was introduced.

## Explicit next-review handoffs

- **Fresh code auditor:** review the exact published transport/test blobs and verify the `res.complete` condition after `end` and `close`, plus the existing `maxResponseBytes: 0` and oversized-response semantics. Check downstream call sites without reviving the stopped investigation.
- **Fresh bug hunter:** run the newly committed native TLS test on the current PR head, alongside unchanged `ssrf` and webhook-delivery suites. Repair only reproduced functional failures and record the source, command, platform and results.
- **Fresh defensive security reviewer:** inspect error and certificate-boundary handling at the new incomplete-close path, preserving DNS pinning and SSRF rules. This is a source-focused review; it does not substitute for the repository's appointed formal security approval.

Then inspect **actual current-head** matrix results (especially browser job 136049024267; Windows server/web jobs 136049024412 and 136049024557; type/supply-chain job 136049024341), docs/claims and visual checks. Do not count queued or cancelled jobs as passing. Do not change browser assertions, CSP, deadlines or native permission checks to force a pass.

The ledger's governance/ratification, group membership, challenge/finality, renewable signed freshness, crypto-provider and POSIX/macOS ACL contracts remain unresolved; this repair does not select them. A main merge still requires two formal sensitive-change approvals including an appointed security reviewer and the separate historical DCO provenance decision. No main merge, deployment, release, original-branch deletion or historical sign-off is attempted.
