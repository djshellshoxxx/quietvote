# R22 completed source correction and consolidation reconciliation

Date: November 24, 2026 (America/Los_Angeles). This continuation resumes the
uncommitted response-framing correction recorded in PR #71. Three distinct
workers completed independent code review, ordinary functional compatibility
checks, and compatibility/safety source review in separate detached worktrees.
Their scope and the coordinator's checks are distinguished below.

## Source and implemented change

- Published starting head: `918dc4b63bfe8bd8d9a3abe9db9949dad2f78630`.
- Reviewed local implementation commit: `13a140d012b2d318c16f5133054231deb1ecc6de`.
- Complete implementation tree: `30b4d46e5491454be805fd7a18714c924c725a7a`.
- Both TypeScript bridges: `2fcb780bfd6407cb8595650fe9849df430cf0378`.
- Both unchanged PowerShell helpers: `12e703315de1fd0a5d7c8459f2ea18cc9fc55599`.

The CLI and trustee package-local bridges now apply JSON's existing whitespace
grammar consistently after a completed response frame. Ordinary CRLF and
fragmented frames retain their behavior. The production change is one line per
mirror. No native helper, response schema, dependency, cryptographic construction,
vector, workflow, custody check, response bound, deadline or replay policy changes.

A dedicated unit-test child imports each actual bridge. Ten scenarios per module
cover normal framing, fragmented input, invalid framing, explicit native refusal,
pending-operation suppression after refused startup, one process attempt, single
termination and pipe cleanup. The wrapper requires all 20 child cases to pass
with no skips. These simulations do not invoke PowerShell or qualify Windows.

## Completed independent review set

All three receipts bind the implementation commit/tree above. The reviewers did
not modify production source or remote state, and their worktrees were clean.

| Worker | Separate checkout | Work performed | Result and limit |
| --- | --- | --- | --- |
| `native_code_review` | `qv-code-review` | Reviewed the exact four-file diff, both mirrors, new fixture/wrapper, buffering, lifecycle, DCO and requirement references. | No blocking source finding; no application or native runtime execution claimed. |
| `remote_status` | `qv-functional-check` | Ran the normal five-file private-file compatibility suite on Node 22.18.0 and 24.22.3 after isolated dependency/vendor setup. | Each runtime: 27 discovered, 14 passed, zero failed, 13 Windows-only skips on Linux. The existing lifecycle wrapper contains three child cases; these are not added to outer totals. |
| `branch_inventory` | `qv-safety-review` | Reviewed framing compatibility, unchanged native bytes/custody/deadlines, bounded errors, no retry, first failure, termination and test isolation. | No blocking source finding; no application or native runtime execution claimed. |

The functional worker's first attempts lacked workspace dependencies and could
not import one trustee test file. `npm ci --ignore-scripts`, `vendor:install`
and `vendor:check` resolved setup before the successful results above. One earlier
worker attempt was interrupted by automatic safety checking; it is not counted
as completed review. The completed functional task was restricted to ordinary
package compatibility and cleanup checks, with no baseline defect recreation.

These are independent engineering receipts, not the formal repository approvals
or appointed-security-reviewer acceptance required for main promotion.

## Coordinator validation

- Locked dependencies installed with lifecycle scripts disabled; both vendored
  dependencies and their 132 files verified. Python's verifier has no external
  dependencies.
- Full-root TypeScript compilation passed on Node 24.22.3.
- Five focused unit wrappers passed on Node 22.18.0 and Node 24.22.3, with zero
  failures or skips: response framing, transport, lifecycle, synchronous
  diagnostics and operation diagnostics. The response-framing wrapper contains
  20 child cases; the other wrappers retain 17 existing child cases. Nested and
  outer totals are not added together.
- Direct comparisons confirm identical TS mirrors and unchanged PS mirrors.
- Whitespace and author-matching DCO/requirement references passed.
- Full trustee workspace on Node 24.22.3/Linux: 130 discovered, 127 passed,
  zero failed, three Windows-only skips; 271.596 seconds elapsed.
- Documentation: 2,754 links in 421 files, none broken; requirement-reference
  validation passed; claims lint found zero findings across 400 files/45 rules.

The full CLI workspace was also started. Its existing real-clock election journey
deliberately waits ten minutes for voting to close. It was still running when
this receipt was prepared, so no full CLI pass is asserted here; its final result
and source-specific hosted checks are tracked in [PR #71](https://github.com/djshellshoxxx/quietvote/pull/71).
Hosted qualification applies only to the subsequently published source; an older
head's pass does not qualify this change.

## Branch disposition

The [updated inventory](BRANCH_INVENTORY.md#november-24-2026-live-reconciliation)
records a fresh check of all 75 live remote tips. Sixty-eight tips are already
contained in the starting candidate; seven retain their existing documented
disposition. No additional modern branch needs integration. PRs #72/#73 and the
other ten open, non-#27 source PR heads are already preserved in #71 ancestry.
The original branches remain untouched.

## Actual Windows evidence and remaining work

Starting-source [CI 44840974368](https://github.com/djshellshoxxx/quietvote/actions/runs/44840974368)
finished with 26 successful jobs and one failure. Both native server/web job logs
identify synthetic merge `9dcceafbae75bc08d97ec2713c71eba650d5cf07`, whose tree
matches the starting head.

| Job | Observed starting-source result |
| --- | --- |
| Windows Node 22, `136649045275` | Server 352 passed, zero failed, seven skipped; web 441 passed. Enrollment fixture passed in 5,523.7887 ms. |
| Windows Node 24, `136649045685` | Server 351 passed, one failed, seven skipped; web 441 passed. First enrollment fixture reached `UNAVAILABLE/TIMEOUT/service` after 16,548.7526 ms. |

The production browser journeys, claims and visual workflows passed on that
starting source. The old browser session/enrollment failures are not current
failures on that checkpoint.

This parser correction does not explain or repair the native startup timeout.
The fixed 15-second deadline remains. `Add-Type` preceding service acknowledgment
is a source-order observation, not an established timing cause. Do not increase
deadlines, weaken custody, replay a possibly issued write or reinterpret Linux
unit tests as native qualification.

Any further focused startup measurement must respect the previously documented
source bindings and disclose that identical service/close acknowledgments do not
prove close correlation. No external diagnostic package was imported or claimed
qualified in this continuation.

[Unfinished work](UNFINISHED_WORK.md) remains authoritative. QV-18 REQ-026 still
requires origin-level key association, native namespace/ACL custody, kernel-held
cross-process locking, newest-state proof, file and directory durability, and
explicit ambiguous-commit recovery. Formal reviews, historical DCO decisions and
unresolved governance/freshness/wrapping/display-zone contracts remain open.
The separately stopped background-runtime investigation remains stopped.

## Publication boundary

The final reviewed composition is prepared for a non-force successor on the
existing draft branch after re-reading its expected head. Publication must compare
the complete remote tree and changed blobs with the locally reviewed composition.
The actual publication, later full CLI result and source-specific hosted CI status
are recorded in PR #71. Draft publication is not main promotion. No main merge,
release, deployment or branch deletion is part of this R22 correction.
