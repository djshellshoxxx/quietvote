# Final verification receipt

Status: **first candidate published; additional UI completion and final-head hosted qualification in progress**.

The first reviewed production composition was
`363f7ed38001090d0a7e00a549288b525aaf8bda`. Its report-only successor
`be098bee3498ca0de742008c3067f0727862b117` has the same complete tree as published
commit `ddf58d6168e2b8bc5069689400538be8e9b85180`, verified through Git object
hashes and a fetched comparison. Additional timezone, separate-origin and bundle
representation changes require a new final-source receipt and hosted checks.

The later committed engineering source is
`ba728be0140751bc77d464db32c5f9dc110dd007`, tree
`bf64cc5646a8eebc57fceae891a60d716399959b`. It includes the actual timezone and
separate-origin workflows, compact catalog representation, Home/IPv6 compatibility
and corrections for the first hosted server failures. Final follow-up reviews are
in progress; this paragraph does not qualify that source as merge-ready.

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
| First publication size | 204,577 aggregate JavaScript gzip bytes (limit 204,800), 101,529 entry bytes (limit 112,640). Existing limits and assertions are unchanged. |
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
- Docker and Podman are not installed in the local environment. Container/service
  setup changes were inspected and their vendor setup checked; no local container
  image build, service launch or deployment is claimed.

## Later implementation evidence

| Scope | Observed result and source boundary |
| --- | --- |
| Lossless catalog representation | Independent 14/14 precompile/application/lazy checks, complete formatter/source parity and scoped web typecheck pass. Build 8ff1d4c1b86d uses 200,936 aggregate and 101,260 entry gzip bytes; verifier and worker bytes are unchanged from the earlier reviewed source. |
| Organizer timezone and calendar handling | 18/18 author checks plus four unchanged independent probes pass after exact-year/historical-offset repair. These include skipped-day alternatives and explicit fold selection. |
| Combined organizer publication | 14/14 combined timezone/origin/catalog checks pass on 1c0edda. Actual publication proves the board-scoped organizer key, API signature audience, signed UTC fields and returned log origin agree. |
| Independent origin routing and redirects | Seven distinguishing actual-application/native-fetch regressions pass on the origin composition and again when adapted as durable repository tests in af23745. They fail against the pre-feature source. |
| Home/IPv6 follow-up | 21/21 focused checks plus two updated explicit malformed-origin refusals pass on 341c8f1; three new distinguishing cases fail before repair. |
| Hosted server corrections | Author red run: 17/22 pass, five fail; green run: 22/22 pass, no skips/cancellations, on 65b47fb. Original lazy-response assertion remains unchanged. |
| Latest-source typechecking | Independent scoped web typecheck and explicit strict checks of both changed browser journeys complete with exit 0 on ba728be. The broad earlier exit-137 attempts remain incomplete. |
| Independent recovery follow-up | On exact ba728be, all 22 repaired-file tests and 18 related anchor/deletion guard tests pass, exit 0, no skips. [Receipt](INDEPENDENT_RECOVERY_FOLLOWUP.md). |
| Independent UI and build follow-up | On exact ba728be, 63 focused checks plus two selected security cases pass with no skips. Two CLI builds produce identical bytes for all 15 output files: build e5d8522123ff, 203,133/204,800 aggregate gzip bytes, 103,457/112,640 entry gzip bytes, verifier 197,449 bytes. Worker/verifier hashes and default CSP headers are unchanged from the historical reviewed baseline. |

These results overlap and must not be summed as a unique-test count. Disk-capacity
failures during the first two follow-up builds were explicit ENOSPC failures;
after removing only regenerable dependencies from completed worktrees, both
bounded retries succeeded. This receipt does not qualify later session-storage
or Windows ACL implementation. The ninth split-origin browser journey has not
yet run on hosted CI.

## First published candidate: observed hosted results

The source for these results is exactly
`ddf58d6168e2b8bc5069689400538be8e9b85180`, not the later local composition.

- [Full CI run 44493061333](https://github.com/djshellshoxxx/quietvote/actions/runs/44493061333)
  passed typechecking/supply-chain gates, conformance/build and all eight original
  production browser/CSP/automated accessibility journeys. Its final result is
  21 successful jobs and six failed server/web jobs; none remain queued or running.
- Conformance executed 237 Python tests, 438/438 TypeScript vector checks,
  290/290 Python vector cases with zero unimplemented cases, and 32/32
  content-only cross-verifier agreements. Production build a4879782fa7e uses
  204,577 aggregate and 101,529 entry gzip bytes within unchanged limits.
- All six server/web jobs across Linux, Windows and macOS exhibit the same
  three server failures: stale control-schema fixture, eager empty-draft startup,
  and an incomplete deletion diagnostic fixture. Their web suite passes 379/379.
  The failures are diagnosed and corrected locally by 65b47fb; a local repair does
  not change the failed result of the older published source.
- [Claims/documentation run 44493050749](https://github.com/djshellshoxxx/quietvote/actions/runs/44493050749)
  passes both jobs; [visual run 44493050632](https://github.com/djshellshoxxx/quietvote/actions/runs/44493050632)
  passes its job.
- The initial smaller run 44493050619 was superseded by the requested full-matrix
  label. Its cancellation is not counted as a test failure or a pass.

## Historical hosted qualification

PR #70 head 8b417c6c8b86a7a9a9454468bf16bec0baa8517b passed the full 27-job CI
matrix plus visual/claims checks. That source already repaired the historical
Windows pinned-roll fixture; this session did not invent another fix. PR #69's
two cancelled macOS cells were retried without code or assertion changes.
[Run 44294076403, attempt 3](https://github.com/djshellshoxxx/quietvote/actions/runs/44294076403)
completed successfully with all 27 latest jobs on exact head
`b239bc5a53098341ae634aca924dd8ccb8e2e719`. Neither baseline qualifies the new tree.

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
