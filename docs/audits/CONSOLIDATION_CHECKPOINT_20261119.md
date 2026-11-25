# QuietVote consolidation checkpoint — November 19, 2026

This continuation independently rechecked the active candidate and the remaining
branch work. It introduces no production-code or test-behavior change.

## Exact reviewed source

- Pull request: [#71](https://github.com/djshellshoxxx/quietvote/pull/71).
- Source branch: `codex/quietvote-comprehensive-consolidation`.
- Source commit: `8f865fb3cf9c5d203e532abb19848cd46050db9a`.
- Source tree: `5da32edc203087e96a81e1f0b6ae311758b19fa2`.
- Main: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.

The PR description still named `7452d2cf` at discovery. Its historical results
must not be assigned to the newer source. This checkpoint records the reviewed
source directly; it is not a claim that main was merged or that pending checks
completed.

## Branch consolidation result

All 73 remote branch tips were examined. **66 tips are ancestors of the current
candidate**, including the candidate itself: 65 of the original 72 branches.
All modern feature branches represented by PRs #43, #57, #60, #61, #63, #64, #65,
#66, #69 and #70 are already preserved. Their open PR state does not establish
missing source work.

Seven tips remain outside ancestry, with the existing deliberate dispositions:

| Branch | Preserved tip | Disposition |
| --- | --- | --- |
| `chatgpt/quietvote-visual-ci-repair-20261102` | `980a5cd72c9b05bc8ce28a588376462ce85f8206` | Patch-equivalent signed replacement is already present. |
| `claude/laughing-volta-61srfa` | `2aaf0a01816afb256a804c23dd45de86eca2a993` | Historical mixed PR #27; useful behavior was recovered selectively, while contract-dependent and rejected work remains preserved. |
| `claude/docs-screenshots` | `e671fd1d9d19127ded0e0ea85e16d97d9d1bff2d` | Obsolete README/specification status proposal. |
| `claude/sharp-archimedes-tu76rh` | `9a03414e0e826db292f9dd5728e4d3d2f0682784` | Historical audit receipt, superseded by current reconciliation. |
| `docs/readme-and-wiki` | `29313c369aeda4f1ab2503ca3437c5bd22025a09` | Superseded parallel wiki. |
| `nodata/affectionate-archimedes-0pr6w5` | `3350a1a4566eda73d6cfb331956bc05c9841518c` | Obsolete specification commits with conflicting identifiers/contracts. |
| `nodata/trusting-bohr-vnoa7n` | `c2196a9c3ce48314a079c8ba8c1636ca2b142189` | Historical documentation synchronization; applicable correction is already present. |

No additional modern branch requires merging. PR #27's older missing-export,
runtime-anchor, public-reason and requirement-list claims are superseded by
current implementations. The existing [inventory](BRANCH_INVENTORY.md) and
[consolidation report](CONSOLIDATION_REPORT.md) retain original provenance.

## Fresh local review and verification

Environment: Linux, Node 24.22.3. The unchanged lockfile was installed with
`npm ci --ignore-scripts --no-audit --no-fund`; `npm run vendor:install` verified
the two pinned packages and 132 verbatim files.

| Scope | Observed result |
| --- | --- |
| Repository tooling | `npm run tools:test`: 71 passed, zero failures, skips or cancellations. |
| Dependency boundaries | Passed with the two existing documented D-97 deviations; no new violations. |
| Lockfile integrity | Passed: 35 registry entries and eight workspace links. |
| Installed vendor integrity | Passed: two pinned packages, 132 verbatim files. |
| Traceability link validation | Passed. This validates the existing mapping and does not establish requirement completion. |
| Documentation links | 2,171 links in 354 files; none broken before this report was added. |
| Claims lint | Zero findings; 333 files and 45 unchanged rules checked before this report was added. |
| Independent browser/application review | 41 unchanged focused tests passed, zero failures/skips/cancellations, in 24.716 seconds. Source review found no additional confirmed defect. |
| Independent CLI/server review | 22 unchanged focused tests passed, zero failures/skips/cancellations, in 16.639 seconds. Source review found no concrete integration blocker in its selected scope. |

The browser/application review covers actual application code using deterministic
DOM/network adapters: draft refresh, form retirement, paired navigation events,
membership after unlocking, casting, board-scoped keys and receipts, session
storage and late receipts. The captured native-test element handle waits for
the specific previous form to detach; finite failure diagnostics contain only
booleans, counts and HTTP statuses.

The CLI/server review covers organization creation/inspection, recorded public
exports, signed request compatibility, pool capacity, startup recovery and
shutdown draining. Its command was:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 --test-reporter=spec \
  packages/cli/test/organizations.test.ts \
  packages/cli/test/organization-boundaries.test.ts \
  packages/cli/test/recorded-exports.test.ts \
  packages/cli/test/request-auth-compat.test.ts \
  packages/server/test/pool-capacity.test.ts \
  packages/server/test/pool-recovery-cleanup.test.ts \
  packages/server/test/shutdown-drain.test.ts
```

These scoped results are not a full-suite count or native-platform acceptance.
The [browser/application review](../reports/independent-split-origin-review-20261119.md)
and [CLI/server review](../reports/independent-cli-pool-review-20261119.md) retain
their commands, findings and limits. Original reviewer report commits are
`06035f22335276ef18cf7b2990aa3c24bff4ded7` and
`955866f5df38225f8836d8c7a4ae948e39ef3f52`; their unchanged reports were composed
as `665db70` and `47ef441` on the documentation continuation branch. Only
documentation is changed from the reviewed source.

## Hosted observations and browser limitation

At 2026-11-20 06:10 UTC (November 19, 2026 in America/Los_Angeles), the
[27-job matrix](https://github.com/djshellshoxxx/quietvote/actions/runs/44678662762)
for source `8f865fb` had nine successful jobs and 18 queued, with no observed
current-source failure. Successful cells included typecheck/supply
chain; Linux Node 22 server/web; Linux Node 24 trustee/crypto; macOS Node 22
CLI/board; macOS Node 24 protocol/verifier; Windows Node 22 CLI/board; and Windows
Node 24 CLI/board and server/web, plus macOS Node 22 trustee/crypto. This is an
observation, not a final receipt.

The production browser job `136096515552` and macOS Node 24 trustee job
`136096515808` were queued. The macOS Node 22 trustee job passed.
[Claims/documentation](https://github.com/djshellshoxxx/quietvote/actions/runs/44678662770)
had claims passing and documentation queued.
[Pseudo-locale visual checks](https://github.com/djshellshoxxx/quietvote/actions/runs/44678662760)
passed.

Local Chromium stopped before assertions because the managed environment denied
its required socket. Automatic approval review rejected the request to run that
same browser command outside the restriction (`sandbox_approval: false`). No
bypass or native-browser pass is claimed. The required hosted browser result
remains necessary to qualify the prior split-origin membership wait.

The earlier `cd21427` matrix preserves two actual failures: the split-origin
membership-message timeout and macOS ordinary private-file cleanup. Current
source contains their respective form-retirement and canonical-parent changes;
pending current-source results must establish their native behavior. The
intermediate `fc0e1fb` matrix was cancelled and supplies no passing evidence.

## Provenance and promotion gates

The existing `8f865fb` commit lacks a `Signed-off-by` trailer. Its predecessors
`fc0e1fb` and `cd21427` contain trailers. The DCO gap therefore includes recent
work and must not be described as exclusively ancient history. This continuation
does not rewrite that commit or supply another author's attestation.

PR #71 had zero formal review submissions and zero inline review threads when
checked. CONTRIBUTING, GOVERNANCE and QV-30 require two formal approvals for
sensitive promotion, including an appointed security reviewer. MAINTAINERS does
not record that appointment. Engineering agents do not supply those approvals.

Continue with current-source hosted results, reconcile any concrete failed job,
and resolve provenance/formal-review requirements before main promotion.
[UNFINISHED_WORK](UNFINISHED_WORK.md) retains unresolved contracts and external
qualification requirements. This checkpoint does not change those decisions,
deploy, release, delete source branches, or claim full feature completion.

The reports are published separately so a documentation-only update does not
restart PR #71's pending full-platform qualification. Integrate the documentation
after that qualification is recorded, retaining its source-specific results.
