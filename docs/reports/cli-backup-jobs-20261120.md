# Online backup job adapter — November 20, 2026

## Implemented scope and source

`qv online backup-create` now requests the existing signed administrator backup
API. It completes the missing online submission path identified independently
by the [R6 code](independent-ci-code-review-r6-20261120.md),
[bug](independent-bug-hunt-r6-20261120.md) and
[security](independent-native-security-r6-20261120.md) reviewers.

Implementation commit: `ff61e15c59c4186158ee5407f521f73172cf38d0`.
Implementation tree: `576779cb78a0486391ec79e1d1874435ad9bb59b`.
Subsequent documentation composition `c7e32321c0a39aa24397401f5506f85bcd89d1f7`
has tree `8932dc23872ff92aa33e5836e902edc531aca8d4` and identical production/tests.
Follow-up `10ea307` adds the required SPDX comments and qualifies retry guidance;
`e7fe059` connects the online command with the existing offline recovery guide.
Neither changes behavior or assertions.

No server route, authorization, backup format, recovery rule, dependency or
workflow changes. The adapter uses the existing [QV-09 contract](../09-api-data-contracts.md#10-export-import-jobs-admin)
and the existing `request` transport/key-loading implementation.

## Operator behavior

Required options are `--scope all|election`, explicit `--idempotency-key`, the
configured signature audience and administrator key. Election scope requires a
canonical 32-character lowercase hexadecimal `--id`; full scope refuses it.
Option checks precede credential loading and submission.

One signed `POST /api/v1/admin/backups` uses the existing passphrase-file/stdin
options, key-seed wiping, redirect refusal and bounded timeout. A mutation is
never retried automatically. Within the existing 24-hour receipt window, an
explicit repeat by the same administrator with identical body and idempotency
key identifies the original job. A different body conflicts; after expiry a
new job can be created. Unknown outcomes require state reconciliation.

The response is limited to 64 KiB. The command checks job ID, `backup` kind,
requested election binding, state, bounded progress and creation time before
printing selected metadata. Response links and paths never select a network
destination or local output. Invalid successful responses preserve submission
ambiguity. Exit 0 confirms a valid job response, not successful job completion.
Existing `job-inspect` reports server JSON without independently verifying the
snapshot. The [CLI guide](../../packages/cli/README.md#server-local-backup-jobs)
and [offline recovery guide](../OFFLINE-BACKUP-RESTORE.md) describe both steps.

## Author verification

Linux, Node 24.22.3 and npm 11.19.1:

- Existing dependency installation and two pinned vendored packages succeeded.
- Root `npm run typecheck` passed after implementation and test additions.
- `node --test --test-reporter=spec packages/cli/test/online-backups.test.ts`:
  three tests passed, zero failures/skips/cancellations.
- Implementation documentation check: 2,194 links in 360 files, none broken.
  Subsequent documentation additions require a separate composition check.

The real-server test invokes the actual CLI executable with a protected admin
key and stdin passphrase. It checks full/election snapshots and manifest file
lists, explicit same-job replay, changed-body conflict, job inspection and
non-admin refusal. Other tests check early option refusal, bounded and bound
job metadata, selected output, ambiguous outcomes and no automatic retry.
Fixtures use the existing asynchronous private-file writer; native protection
and deadlines remain unchanged.

The full CLI workspace passed 143 tests, with 11 platform skips and zero
failures/cancellations (154 total). The [completed R6–R8 handoff](../audits/CONTINUATION_R6_R8_20261120.md)
records this run, all nine fresh reviews and their exact source distinctions.
The earlier hosted pass below does not qualify this new command.

## Consolidation and prior hosted evidence

Documentation PR #72's original commit
`9d3292bf945a283e7ec3b549a603692a902dc0c9` is preserved as an ancestor of the
local composition. Its three source-bound report bodies remain unchanged;
their `8f865fb` results remain historical. Fresh R6 workers completed all three
assigned scopes before handing off to fresh R7 code, bug and security workers.

Published predecessor `a5e5d19b6213dd4477b849deda7a3c837ea7fce0`, tree
`a5aa203ca47b10e0aa1fb63d3fc913933cc0e053`, passed its
[27-job matrix](https://github.com/djshellshoxxx/quietvote/actions/runs/44762725138),
claims and visual workflows. R6 checked the selected logs' synthetic merge
tree and found it identical to that predecessor. New source requires its own
hosted qualification.

## Remaining boundary

The snapshot stays on the server. Submission performs no download, off-site
retention, external encryption, KEK backup or restore. Full snapshots include
control and election databases; election-only snapshots are not full-instance
recovery inputs. Existing `qv-backup verify` and `restore` require a full snapshot
and original KEK; restore also requires a verified minimum backup floor and a
new destination. This does not establish independent freshness or a completed
recovery drill.

Native ACL limits, unresolved protocol contracts, recent/historical DCO gaps,
appointed review and release requirements remain recorded in the unfinished
work and promotion ledgers. Agent reviews supply engineering evidence, not
formal sensitive-change approval.
