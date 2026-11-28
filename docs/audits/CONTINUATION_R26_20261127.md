# R26 — product disclosures and server admission boundaries

Date: November 27, 2026 (America/Vancouver).

Baseline: published R25 commit `d38c55c3d6f0d8254967efea066cd282c4012553`,
tree `f3487adc90a371d6ed5800c2eca8b1e0eb4dd638`, in
[draft PR #76](https://github.com/djshellshoxxx/quietvote/pull/76).
Its GitHub commit has the expected single parent, matching author/DCO trailer,
and exact locally staged tree, including the executable trustee CLI mode. It is
not cryptographically signed. It stacks on #75; main is unmerged.

AI-assisted implementation and separate agent/root source checks are engineering
evidence, not appointed security review. QuietVote remains unaudited and not for
real elections. Each later source needs its own hosted qualification.

## Execution plan

Continue through the accepted [product](../reports/inventory-20261111/product.tasks.md)
and [server](../reports/inventory-20261111/server.tasks.md) tasks, checking their older
descriptions against current code and later adopted contracts:

1. Display existing manifest warnings without recalculating acceptance policy.
2. Add result privacy disclosures under the existing verified-results gate.
3. Inventory every current SQLite column and make missing classifications fail CI.
4. Close instance-admin organization writes, including alternate key grants.
5. Add the missing percentage disk reserve while preserving byte/log limits.
6. Cap new invitation lifetimes while retaining the later token-width contract.
7. Close the remaining output-time and bounded eligibility/replay/revote gaps.
8. Trace private markers through a real invitation-to-export lifecycle.

Each implementation is isolated, tested and checked before composition. New
browser journeys join the mandatory CI runner; failure tests preserve execution
of later journeys when an earlier one fails. No dependency, protocol record,
production KDF floor, verifier gate or locale-review policy is changed.

## Manifest warnings and result disclosures

Overview, rules and organizer preview display the validator's four existing
warnings. Known codes use fixed copy; unknown/prototype-like codes remain literal
text in a static named section. The settings-read failure path retains warnings.
The validator's existing small-roll threshold is unchanged by this UI task.

After `canShowResults` succeeds, roll sizes below 10 display the specified small-
roll disclosure. A zero-valued option or one equal to the positive verified
counted-voter total gets an option-specific notice in its table row. The required
unanimity sentence is prefixed "For this option", followed by explicit all/none
selection detail. It does not reveal other choices on a multi-option ballot.
Zero counted voters yield no participant-choice claim. The denominator is
`report.counts.counted`, not roll size, nonblank participation or summed counts.

Root checked both renderers, application wiring, copy and tests with no blocking
scoped issue. All 63 original English guarantee entries remain byte-identical.
Five catalogs remain machine drafts with empty review metadata; English is the
only offered language.

Author qualification on the frozen T1/T2 web slice:

| Check | Result |
| --- | --- |
| Full web suite | 453 passed, zero failed/skipped; 58.309 s |
| Focused warning/disclosure/catalog cases | 21 passed |
| Copy synchronization/rules | 2 passed |
| TypeScript and i18n | Passed |
| Built warning browser journey | 11 steps passed |
| Built disclosure browser journey | 7 steps passed |
| Aggregate JavaScript gzip | 191,142 / 204,800 bytes |
| Offline verifier HTML | 201,451 / 409,600 bytes |

The system Chromium launcher lacked its executable. The existing `/tmp/chromium`
143.0.7499.0 ran both journeys with browser execution required; no skip counted
as a pass. The actual built app/CSP exercised real protocol fixtures, including
unknown HTML-like warnings, single-choice/approval counts, empty elections,
missing evidence and a coordinator-signed false tally. Human accessibility and
native translation review remain separate.

## Organization authority

Shared helpers previously granted instance-admin keys organization writes.
Organization membership is now the default, with named admin read/delete
exceptions only at the intended routes. Organization-key grants/revocations are
closed alongside drafts, pinned rolls, invitations, webhooks and recorded-export
writes. Admin management reads, title-confirmed election deletion, imports, jobs
and `/admin/*` retain their accepted behavior.

The unchanged regression exposed 13 improper successes before the fix. All 18
runner tests pass afterward, including retained operations; 27 existing admin,
audit and export regressions also pass. Root source review found no blocking
scoped issue. Existing stored roles are not silently revoked, and application
permissions do not protect against a compromised host operator. See the
[route/evidence report](../reports/admin-org-role-boundary-20261127.md).

## Explicit output times

The overview previously discarded the offset and zone already computed by the
deadline formatter; accepted receipts used a bare local date string. Both now
use the existing localized templates to show the actual browser-local IANA zone
and its numeric UTC offset. Each instant gets its own offset, so winter deadlines
and summer receipts remain distinct. Deadlines retain minute precision; receipts
retain seconds from the verified signed promise. An absent or unrenderable optional
receipt time is omitted rather than replaced with epoch zero.

The shared display helper also supports a separately selected display/viewer pair
without duplicating equal zones. The current app has no authenticated election
display-zone field and does not infer or add one. There is no new saved preference,
signed field, countdown or freshness policy. Root reviewed the source and tests.
Author qualification passed 30 date/organizer cases and a built-app real ballot
journey in Berlin, New York and Kolkata. The final integrated qualification below
supersedes the isolated build's size receipt.

## Disk-space admission

A real signed append succeeded on the baseline with almost 2 GiB available but
less than 5% of the volume free. The correction uses bigint available/total block
comparisons alongside the existing absolute byte floor. Exactly 5% is permitted;
less returns `507 LOG_FULL` before append. Rounding a fractional configured byte
minimum upward preserves the original comparison against integral available bytes.

Eight focused tests cover both boundaries, large block counts, fractional minima,
exact-request recovery, continued reads/exports, intact board evidence and
log-size-before-probe ordering. Combined disk/config/SQLite regressions passed
15 tests. A separate agent found no blocking scoped source issue. Existing
`minFreeBytes: 0` disabling and failed/unsupported-statfs handling remain. This
does not qualify physical disk-full/power-loss recovery or add alert delivery.

## Database-column inventory

The [inventory](../data-inventory.json) covers 229 columns across 36 real migrated
tables, including both `sqlite_sequence` tables. Each column has a QV-06 C-class,
source-backed basis and, where needed, a mixed-container rationale. Actual public/
read-key title and roll routes determine those classifications.

Eight tests open both real databases and compare `table_xinfo` columns. Real
unlisted columns/tables, generated columns, missing/stale/duplicate entries,
unknown classes, contradictory bases and persisted C4 data all refuse. Root
reviewed the mappings and tests. This does not cover arbitrary nested JSON, other
stores or writer changes without DDL changes. QV-28's separate P-class registry,
encryption and retention enforcement are not established by C-class coverage.

## Invitation lifetime and incompatible width requirements

New explicit expiries beyond 30 days return `422 VALIDATION_FAILED` before invite
purge/creation and idempotency journaling. Exactly 30 days, the 14-day default,
malformed-date handling and explicit past-deadline behavior remain as specified.
Old longer/null deadlines retain their authority after reopen.

The baseline regression succeeded one millisecond beyond the cap. The final
five focused tests and 25 existing registration/CLI cases passed; the latter had
one existing Windows-only skip. Tests cover count/items requests, corrected
same-key retries, actual web enrollment code and both registration schemes.
Root checked the narrow source hunk and tests.

The older issuance-only 160-bit task conflicts with QV-ADR-028/QV-09's exact
16-byte contract, four client gates and legacy redemption. Issuance alone cannot
be widened without breaking artifacts. The [unadopted RFC](../rfcs/invite-token-width-contract.md)
records the compatibility options and required evidence. No token, hash, PoP,
bearer width or legacy scheme changes here.

## Eligibility, revote, restart and privacy acceptance

These tasks strengthen acceptance evidence without changing production protocol
or server behavior. Root reviewed the complete new tests and their reports.

| Task | Distinguishing evidence | Explicit boundary |
| --- | --- | --- |
| Product T3: HTTP eligibility | Three seeds, 129 actual ballot submissions; an independent admitted-head/count/selection model predicts responses. Refusals preserve checkpoints, every voter index and body-byte totals. Receipts, final board, counted codes and decrypted totals are checked. | Ordinary verifier remains `INCOMPLETE` for the zero-witness fixture. Copied bodies receive their real earlier eligibility/predecessor refusals; no artificial hash collision forces `E_DUP_CODE`. |
| Product T4: offline revote model | Six signed/proved histories at caps 1, 2 and 4; 18 comparisons with a symbolic predecessor-graph oracle, including forks, authenticated spoils, orphans, recovery and non-vacuous cross-voter reordering. | Bounded TS-only allowance in the inventory; not the separate 10,000-history cross-implementation requirement. |
| Product T5: retry after restart | A real election reopens twice. Identical wire bytes preserve the original signed promise, unchanged-tree inclusion, cast allowance and board state. Remaining revotes consume the original quota; an extra new cast refuses. | Signed receipt/board integrity, not full witnessed verification or power-loss durability. |
| Product T7: privacy lifecycle | Six invitations, real DKG/casts/public and private spoils, tally/archive, live/recorded exports and retention. Forty-two marker families scan every runtime file, live DB/WAL/SHM, logs, logical response caches and decoded export bodies. Scanner and public-opening positive controls are mandatory. | Finite literal encodings, not arbitrary transformations, memory/core dumps, external backups or physical ciphertext erasure. The intentionally persisted server KEK is not treated as a forbidden client secret. |

Reports: [eligibility](../reports/product-eligibility-20261127.md),
[revote model](../reports/revote-reference-coverage-20261127.md),
[restart and backlog](../reports/product-test-backlog-20261127.md), and
[privacy lifecycle](../reports/privacy-marker-coverage-20261127.md).

## Composition and outstanding qualification

Authority and expiry changes are composed in `app.ts`; all server-notes sections
are retained together. Root typecheck and dependency checks passed on the first
composition. The two existing D-97 findings remain visible. The full combined
server suite passed **406 tests, zero failures/cancellations, one existing Windows-
only skip** (407 total; 139.820 seconds). Later T3/T5/T7 files were added after
that run's test discovery and receive their own integrated focused runs; they are
not included in that total.

Final composed-source qualification on Node 24.22.3/Linux:

| Check | Result |
| --- | --- |
| Full server suite before later test-file additions | 406 passed, zero failures, one existing Windows-only skip; 139.820 s |
| Full web suite including output time | 465 passed, zero failed/skipped; 93.563 s |
| Added eligibility/restart/revote files | 8 passed, zero failed/skipped; 35.358 s |
| Added privacy file | 2 passed, zero failed/skipped; 8.601 s |
| Workflow coverage, pinned actions, required browser runner | 21 passed, zero failed/skipped |
| Repository typecheck | Passed with a 768 MiB V8 heap bound |
| i18n, dependencies, vendor, local links and trace structure | Passed; the two existing D-97 dependency findings remain visible |
| Changed-file secret scan | detect-secrets 1.5.0: 45 files, zero findings; synthetic private-key-header positive control detected |
| Final web build | `e730fe867741`; 191,300 / 204,800 JavaScript gzip bytes |
| Entry bundle / offline verifier | 169,322 raw / 55,709 gzip bytes; verifier HTML 201,520 / 409,600 bytes |

All twelve required browser journeys have passing results on unchanged composed
application source. The first full runner passed seven and failed five. The
failures included element timeouts and a closed/crashed page. A diagnostic rerun
of result disclosures recorded repeated Chromium GPU process exits with code 9.
Using a scratch executable wrapper adding `--disable-gpu` passed registration,
split-origin and all seven result-disclosure cases, but verifier/server still
reported page crashes or timeouts at varying steps. A final local wrapper adding
`--in-process-gpu --no-zygote --js-flags=--max-old-space-size=256` completed the
verifier's 29 checks and the server journey's four tests. This is local tooling
qualification, not proof of the underlying process-kill cause. Repository browser
policy, assertions, deadlines, crypto parameters and hosted CI commands were not
changed. No partial/failed attempt is counted as a pass.

Claims lint initially flagged an imprecise term for spoiled ballot candidates
in the revote report. The wording now says "spoiled"; no lint rule
or ignore was changed. The final zero-finding lint result is required before
publication. The first ad hoc workflow command named a nonexistent test pattern
and ran only the three browser-runner tests; the corrected explicit invocation
above ran all 21 checks, including action pins and workflow coverage.

All twelve browser journeys, including the three new warning/disclosure/time
journeys, are required by the shared CI runner. Its tests exercise early, middle
and final failures while requiring later journeys still to execute. Root's first
notes-composition helper refused a non-append-only documentation layout after
copying the already checked sources; the missing notes were then composed without
discarding existing sections. No production patch was lost or reapplied.

#76's full hosted run is [46087969999](https://github.com/djshellshoxxx/quietvote/actions/runs/46087969999).
The first smaller run was superseded by the full-matrix label. Its Windows Node 24
server/web job [140801935502](https://github.com/djshellshoxxx/quietvote/actions/runs/46087969999/job/140801935502)
completed successfully; 26 other jobs were still queued at that observation.
The older #75 run had eleven successes, one running and fifteen queued, with its
same diagnostic job still unassigned. The #76 native pass does not establish the
cause of #74's earlier startup timeout. Neither run qualifies this later source.

The [unfinished-work ledger](UNFINISHED_WORK.md) retains derived-record,
governance, freshness, durable custody, native and formal-review boundaries.
