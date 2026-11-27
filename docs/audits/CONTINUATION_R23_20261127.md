# R23 — service health and offline trustee CLI completion

Date: November 27, 2026 (America/Los_Angeles).

## Current source and analysis

Work resumes the actual consolidated implementation in draft PR #71 at
`45c1048e759df5a783edbf253bda268e36377dea`, rather than the older main baseline
`019f4e789be2ff38a5fb2d348c3b225cc87cf296`. A fresh local ancestry check of all
75 fetched remote branch tips found 68 contained in that candidate. The other
seven match the historical [branch dispositions](BRANCH_INVENTORY.md); no legacy
branch is merged wholesale or counted as newly completed work.

The baseline's [CI run 45540836480](https://github.com/djshellshoxxx/quietvote/actions/runs/45540836480)
finished with 26 successful jobs and one failure. Windows Node 24 server/web
[job 138958664532](https://github.com/djshellshoxxx/quietvote/actions/runs/45540836480/job/138958664532)
records the first enrollment-key fixture reaching `UNAVAILABLE/TIMEOUT/service`.
This continuation does not change that native helper or claim to fix its startup
timeout. Existing formal reviews, provenance and protocol decisions remain
separate from implementation checks.

## Completed implementation slices

1. **Service health:** `qv health <server-origin>` implements the read-only task
   in the [CLI inventory, item 5](../reports/inventory-20261111/trustee-cli.tasks.md).
   It reuses the existing online transport, makes exactly three unsigned GETs,
   caps responses at 64 KiB, validates expected success bodies, retains partial
   failures and distinguishes availability from election verification. Six tests
   cover the real shipped CLI/server plus ordinary refusal, schema, response-size,
   redirect, deadline, connection and usage cases.
2. **Trustee delegation:** T-168 implements accepted ADR-027/N-39c option A.
   It starts the separate offline command, preserves argument boundaries and
   native streams, returns child exit codes, and handles missing programs and
   cancellation. POSIX resolves the chosen PATH executable; Windows recognizes
   a native executable or the supported npm Node launcher, verifies the launcher's
   target against its associated package bin, and starts a separate Node process.
   Eleven tests cover process behavior, real installed trustee help/usage, npm
   layouts, ordinary startup failure and cancellation. Custom Windows launchers
   are refused; no shell or in-process trustee import is introduced.

Design/size note: these are two independent modules with separate commits and
tests. Their shared edit is limited to help and dispatch. Most of the change is
acceptance coverage; combining the two reviewed modules does not alter protocol,
signature, custody, verifier-report, dependency or migration semantics.

| Milestone | Commit or tree |
| --- | --- |
| Health source/test commit | `3a7787551ab45fa7f29e035d4baa7d393c8dc44a` |
| Isolated trustee source/test commit | `6dec330e3d5b869a00493825488009c969397ff5` |
| Combined implementation commit | `8dd8c0e1656a691da66c36f22629c491dfa4e7e3` |
| Combined implementation tree | `198c99618ba3a8ddf0f77351b143887b76643032` |

Later commits containing this receipt and user documentation are distinguished
from the implementation tree. New commits carry author-matching DCO sign-offs;
inherited unsigned history is not retrospectively attested.

## Independent engineering review

The health reviewer separately inspected code, ordinary functionality and
privacy/error boundaries, then ran its six tests, TypeScript and dependency
checks successfully. No blocking finding remained.

The trustee reviewer initially identified insufficient Windows launcher/target
association, missing parent-cancellation forwarding and implicit empty-PATH
current-directory selection. The implementation and distinguishing tests were
corrected before integration. The independent reviewer reran all eleven tests
on Linux/Node 24.22.3 and reviewed the final main dispatcher after conflict
resolution. Both command imports, help entries and dispatch mappings are
preserved. A separate source reviewer also checked package-layout selection.

These are engineering reviews, not the appointed security-reviewer approvals
required for main promotion.

## Verification and limits

| Check | Observed result |
| --- | --- |
| Health suite, Linux/Node 24.22.3 | 6 passed, zero failed/skipped; author and independent runs |
| Trustee suite, Linux/Node 24.22.3 | 11 passed, zero failed/skipped; author and independent runs |
| Combined new suites, Linux/Node 22.18.0 at `8dd8c0e` | 17 passed, zero failed/skipped |
| Combined TypeScript compilation | Passed |
| Dependency boundary check | Passed with two inherited D-97 deviations reported; no new violations |
| Actual npm launcher generation from current trustee source | Target resolution and real help execution passed on Linux; not native Windows qualification |
| Full CLI workspace on Linux/Node 24.22.3 | Running when this draft receipt was prepared; final result belongs in the PR/receipt update |
| New-source native platform CI | Pending draft publication; baseline results do not qualify the new commands |

The supported npm launcher fixture was generated using the installed npm
11.19.1 cmd-shim. Windows resolver checks executed on Linux; actual Windows/macOS
and hidden-input terminal qualification are separate. POSIX signal-specific tests
are explicitly skipped on Windows, whose process-signal semantics differ.

## Remaining work and next handoff

The [unfinished-work ledger](UNFINISHED_WORK.md) remains authoritative. Durable
receipt/checkpoint retention still needs origin-level key association, native
ACL/namespace custody, kernel-held cross-process locking, newest-state proof
verification, durable atomic publication and ambiguous-commit recovery. The
Windows startup timeout and POSIX/macOS effective-ACL gap also remain open.

The offline ballot-status item is still missing. Its implementation must not
treat the protocol report's preliminary `countedBallots` array as completed tally
verification: that array is populated before later tally checks. Any future
counting status must bind an independent manifest pin and the same snapshot's
required ballot/tally/log/witness evidence; absence means absent from that
snapshot, and exclusion is not automatically supersession.

Governed manifest/ratification, proposal lifecycle, group rotation/recovery,
challenges/FINAL, signed freshness and worker-integrity design remain dependent
on their documented contracts. DCO automation and publication scanning remain
separate unfinished tooling tasks. The previously stopped background-runtime
investigation remains stopped.

Publication is a separate draft continuation targeting the consolidated branch.
No main merge, release, deployment, source-branch deletion or automatic merge is
performed. Preserve both reviewed source commits and re-read remote ownership
before the next continuation.
