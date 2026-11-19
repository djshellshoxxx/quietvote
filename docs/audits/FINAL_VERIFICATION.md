# Final verification receipt

Status: **production source assembled; hosted qualification and publication receipt pending**.

Final production composition before report-only changes:
`363f7ed38001090d0a7e00a549288b525aaf8bda`. This is a local engineering
provenance identifier; the publication receipt must bind the external commit to
the exact local tree before it is treated as the candidate tested by CI.

## Evidence rules and environment

Local runs use Linux and Node 24.22.3, the existing lockfile and Python verifier
standard-library environment. Worker receipts qualify their own source only.
No started check is counted as passed. Exit 137 without diagnostics is incomplete;
a failed browser launch has not executed assertions. Existing skips and unsupported
capabilities remain visible.

## Completed local evidence before final composition

| Scope | Observed result |
| --- | --- |
| Catalog-only new control reasons | 5 focused CLI/server tests passed; distinguishing HTTP test fails before repair. |
| Quota wording | 2 copy tests and 25 related web/catalog/error tests passed. |
| Sealing worker and ballot flow | 21 passed; construction/late-event regressions fail before repair. |
| Trustee-index nonce repair | 103 crypto tests, 423 TS vector checks and 27/27 shared verifier cases pass; zero shared-case disagreement. |
| SPA cooperative verification | 3 real-app/task-harness and 6 standalone tests pass. New SPA tests fail against the earlier application. |
| Independent announcement finding | 13 distinguishing regressions fail on 21f5c90; all 15 new announcement tests, including two positive controls, and 3 prior SPA tests pass after repair. Scoped web typecheck passes. |
| Production web build after SPA repair | Existing budgets pass: 197.6 kB aggregate JS gzip, 97.8 kB entry gzip. |
| Combined controls/recovery | 26/26 tests passed on 0cb0fb8: controls, catalog reasons, runtime anchors, recorded exports and the combined rollback/deletion gate. Four delete-recovery checks also pass. |
| Independent deletion finding | 3 new deterministic lifetime regressions fail on 21f5c90; all pass after repair within a 19/19 combined deletion/runtime-anchor run. |
| Control sequence feature | 438/438 complete vector checks, 32/32 content-only comparisons, 14 Python control tests and 48 legacy Python log vectors pass on fc0a0c3. Protocol/server/CLI/web package typechecks pass individually. |
| Combined core web build | Build 4d9953275d63 passes at 198.5 kB aggregate JS gzip and 98.5 kB entry gzip. Final UI additions require a new measurement. |
| Recorded public exports | 9 feature and 38 compatibility tests pass on worker source, plus pinned-schema upgrade. |
| Runtime anchors | 37 runtime/backup/offline, 20 board and 32 gossip/event tests pass on worker source. Additional checks overlap; do not sum as unique tests. |
| Vendored dependency boundary | 22 focused, 71 tooling and 17 workflow/pin tests pass; full and production-only installation and resolution checks pass. Advisory audit reports zero vulnerabilities. |
| Final device/storage composition | Independent reviewer reports 30/30 focused checks on fbf9c1f; the original opening-retry probe passes separately. New production browser journey remains mandatory. |
| Final source size | 204,577 aggregate JavaScript gzip bytes (limit 204,800), 101,529 entry bytes (limit 112,640). Existing limits and assertions are unchanged. |
| Restore-floor fixture integration | Missing runtimeAnchors field was corrected in the older test fixture; three fixture checks and the scoped server typecheck pass. No production migration was altered. |

## Local gates not established

- Several full TypeScript and translation checks were terminated with exit **137**
  without checker diagnostics. These are not passes.
- Chromium fails at its process-singleton socket with EPERM before assertions.
  Required hosted browser CI must execute the journeys.
- An earlier long Python run has partial progress without an observed final result;
  it is excluded from pass totals.
- The independent full import-file run was terminated by SIGKILL without an
  assertion failure. Three focused normal/legacy-control/incomplete import cases
  pass after the deletion fix; this does not substitute for the full hosted suite.

## Historical hosted qualification

PR #70 head 8b417c6c8b86a7a9a9454468bf16bec0baa8517b passed the full 27-job CI
matrix plus visual/claims checks. That source already repaired the historical
Windows pinned-roll fixture; this session did not invent another fix. PR #69 had
two cancelled macOS cells and was not treated as a full pass. A targeted retry was
requested during this session.

The supported matrix covers Node 22/24 on Linux, macOS and Windows, workspace
shards, typechecking/supply chain, vectors/Python/build and production browser/CSP/
automated accessibility. Exact final run URLs, head/tree identifiers and totals
must be appended after completion. Historical evidence does not qualify the new tree.

## Independent audit and promotion

A fresh worker reviewed the core assembled source and returned the deletion
finding; its correction was independently revalidated. A second fresh reviewer
covered the build/UI delta and independently confirmed both surface fixes.
[INDEPENDENT_REVIEW](INDEPENDENT_REVIEW.md) records the core source and evidence;
[INDEPENDENT_BUILD_REVIEW](INDEPENDENT_BUILD_REVIEW.md) records the final
production source, build identity, exact sizes and completed surface gates.
These engineering reviews are separate from
formal GitHub approvals required by CONTRIBUTING, GOVERNANCE and QV-30 sections
9.2/10. Final merge status belongs in [CONSOLIDATION_REPORT](CONSOLIDATION_REPORT.md).
