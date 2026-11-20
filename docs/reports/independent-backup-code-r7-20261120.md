# Independent backup adapter code review, round 7

Review date: November 20, 2026. This fresh worker follows the completed
[round 6 code review](independent-ci-code-review-r6-20261120.md). Standards and
contract assessments below remain separate from the parallel bug and security
reviews.

## Exact source and scope

- Reviewed local commit: `c7e32321c0a39aa24397401f5506f85bcd89d1f7`.
- Reviewed tree: `8932dc23872ff92aa33e5836e902edc531aca8d4`.
- Feature commit: `ff61e15c59c4186158ee5407f521f73172cf38d0`.
- Fixed comparison point: `a5e5d19b6213dd4477b849deda7a3c837ea7fce0`.
- Production comparison: `git diff a5e5d19...HEAD -- packages .github/workflows package-lock.json`.

Only the CLI README, command map/help, new backup adapter and its test change
under `packages`. No server, shared transport, dependency, workflow, protocol
or native private-file implementation changes. The feature is 219 insertions
and four deletions across four files. Additional reports are documentation.

The contract is the existing signed administrator
[`POST /admin/backups`](../09-api-data-contracts.md#10-export-import-jobs-admin),
its handler in [ext-routes.ts](../../packages/server/src/ext-routes.ts), the
[server job mapper](../../packages/server/src/jobs.ts), and the existing
[offline recovery entry point](../../packages/server/src/offline-backup.ts).

## Standards assessment

The adapter is a small, single-purpose module. It reuses current argument,
private-key, signing, timeout and output facilities. It introduces no generic
framework, dependency, new public schema or unrelated refactor. Existing
commands retain their dispatch and options. The implementation follows the
established CLI error classes and management-JSON convention; this review does
not certify every proposed repository-wide lint or generated-reference
requirement as implemented.

**Resolved low-severity finding:** the two new TypeScript files originally
lacked `// SPDX-License-Identifier: AGPL-3.0-or-later`, required by
[QV-30 section 12](../30-engineering-standards.md#12-docs-as-code). The coordinator
added the standard header in the separately checked follow-up below.

All six commits newly reachable from the fixed comparison point have a
`Signed-off-by` line matching their actual author, and each subject is at most
72 characters. This includes the preserved PR #72 commit. It does not supply
or imply sign-off for `a5e5d19` or older history, whose provenance gate remains.

## Contract assessment

The implementation matches the existing operation:

- Scope is explicit. Election scope requires the canonical election ID; full
  scope refuses an ID. Invalid options stop before credential loading or HTTP.
- The fixed request path, body and required idempotency key match the server.
  Server administrator authorization remains authoritative.
- The shared transport unlocks once, signs the exact bytes, wipes the seed,
  refuses redirects and retains bounded timeout and no-retry behavior.
- The 64 KiB response cap suits job metadata. Responses must identify a backup
  job with the requested election binding, an existing state, bounded progress
  and a parseable creation date. Selected output omits links, paths and extra
  fields. Malformed successful replies remain ambiguous outcomes.
- Exit zero means a valid submission response. Existing `job-inspect` reads
  server state. Documentation separates this from independent verification,
  local download, off-site retention, KEK retention or restoration.
- Full and election-only snapshots retain their distinct recovery meaning.
  Existing `qv-backup` verify/restore commands are documented, not duplicated.

**Resolved operational documentation finding:** the original README said a
repeat using the same scope, election and idempotency key identifies the
original request, without principal or expiry boundaries.
[QV-09 section 4.4](../09-api-data-contracts.md#44-idempotency), the API's replay
check and `ControlDb.storeIdem` define a 24-hour binding scoped to the principal.
The coordinator qualified that guidance in the follow-up below. No transport
or server change was required. No runtime contract defect or unsupported
protocol behavior was found in this scope.

## Independent verification

This isolated worktree used `npm ci --ignore-scripts --no-audit --no-fund`, then
`vendor:install`: two pinned packages and all 132 vendored files installed.
No shared-worktree module resolution was used.

Documentation validation on this report composition found 2,252 links across
367 files with none broken. Claims lint found zero findings across 346 files
and 45 unchanged rules. Whitespace checks passed.

A small ordinary compatibility exercise generated responses with the actual
server `jobView` function, then passed them through the actual CLI dispatcher:
both full/election scope crossed with queued, running, done and failed states.
All **eight cases passed**, including fractional running progress and optional
server result/error fields being omitted from the creation receipt. Exactly
one request occurred per case, to the documented path with the expected body.
`online backup-create --help` also dispatched successfully without a request.
These supplement the author's real-server tests; their counts must not be
added to hosted matrix totals as unique product scenarios.

PR #72 commit `9d3292bf945a283e7ec3b549a603692a902dc0c9` is an ancestor of the
reviewed composition. Its three added reports and both existing report
introductions remain byte-identical to that source, preserving their historical
`8f865fb` qualifications. The coordinator will label those introductions as
historical while linking the new source receipts.

## Separately verified correction

Follow-up commit `10ea307850493bf7a1cbccd225979f823e608d64`, tree
`3e6aa1caaf0701d562b1fc18793667beafc2515a`, was inspected after the initial review.
The three-file diff adds the SPDX headers and states that replay requires the
same administrator within the existing 24-hour window. It explicitly says
reusing the key after that window may create a new job and preserves outcome
reconciliation guidance. Both findings are closed by source inspection.
The follow-up has an author-matching DCO trailer. No executable statement or
test assertion changed, so the eight compatibility checks were not repeated.

This worker did not rerun the full CLI suite, typecheck, native Windows checks
or browser journeys. Older all-green hosted results qualify `a5e5d19`, not this
new adapter. The final published composition requires its own hosted evidence.
No stopped investigation, native probe, Chromium retry or vulnerability
reproduction was performed.

## Successor handoff

Preserve the source-specific feature, bug and security receipts, and inspect
the final composition's hosted matrix. Further work should come from the
accepted unfinished-work ledger. This adapter does not complete off-site
backup/recovery orchestration or unresolved protocol/native ACL contracts.
This worker made no main merge, publication, release or formal approval.

Standards: one source-header finding, resolved. Contract: one idempotency
guidance finding, resolved. No blocking runtime finding in either assessment.
