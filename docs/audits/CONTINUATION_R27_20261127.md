# R27 — migration safety, terminal storage and checked receipt standing

Date: November 27, 2026 (America/Vancouver).

Baseline: published R26 commit `6764bf231801a782a57b2778a344c6ab26063e9b`,
tree `ff5a3f9d93dc387bbec37cfd6bd3a11bd94b9077`, in
[draft PR #77](https://github.com/djshellshoxxx/quietvote/pull/77).
The continuation branch is `codex/quietvote-lifecycle-storage-20261127`.
Its publication receipt records the exact staged/remote tree, parent and DCO.
The preceding stack and main remain unmerged.

This is source-specific engineering evidence. Separate agent checks do not
substitute for appointed security review. QuietVote remains unaudited and not
for real elections; native qualification, protocol decisions and formal promotion
gates remain explicit below.

## Plan and completed increments

Current source was checked against the accepted product, server and web
inventories rather than treating their older absence notes as current facts:

1. Exercise egress, lifecycle rejection and pause/resume limits through the actual
   server; add bounded acceptance where production already meets the rules.
2. Open terminal databases with native read-only connections while preserving
   explicitly authorized maintenance and interrupted recovery.
3. Validate historical migration identity, retain a real backup, apply the pending
   chain atomically and preserve existing board/storage data.
4. Add startup preflight, the one-time OPEN override, backup-retention floors and
   historical offline-copy compatibility; exercise real process termination.
5. Complete explicit archived/imported copy-and-replace migration and installed
   CLI entrypoints without enabling migration during ordinary reads.
6. Guard device clearing, extend voting-method/accessibility browser acceptance,
   and unify typed/file/saved receipts under strict closed-snapshot checks.
7. Reproduce and repair the initial/reconnected SSE gap with real server events.
8. Complete bounded ballot-admission tests and add test-only Windows timing
   observation without changing native custody or deadlines.

Slices were composed after source review and focused tests. Confirmed
key-operation and append-outbox gaps are being addressed in isolated follow-ons;
they are not included in this source receipt.

## Migration and backup preservation

Database opening validates the application ID, complete contiguous migration
ledger, checksums, cardinality and schema version before persistent changes.
Only an exactly empty unclaimed database can initialize as fresh. Native
read-only or explicitly non-migrating handles require the current schema.

Established election upgrades require ordinary election, entry and checkpoint
tables. The pending chain runs under one exclusive transaction. SQLite's actual
prepared-statement boundaries distinguish quoted semicolons and trigger bodies;
transaction, pragma and attachment directives refuse. Every step checks foreign
keys, the ledger, original typed rows/cells, contiguous board leaves and every
stored checkpoint prefix. Merkle accumulation uses logarithmic working space.
Added columns and empty new tables are permitted without accepting lost rows,
changed old cells, views or temporary shadow tables as preservation.

Before pending SQL, a worker awaits the native SQLite backup and validates its
identity, integrity and version. Private files/directories, bounded metadata,
full-file hashing, flushes and rename publish the completed backup. Failure
retains the old schema and any successfully published backup. Existing migration
SQL remains unchanged.

Under the data-directory lock, startup preflights control and registered live
databases. A pending upgrade is held if projection or durable history may
represent OPEN, including conservative PAUSED/post-open invalidation cases.
`--force-migrate-open` bypasses a known opening hold, not unreadable or invalid
identity/history. Actual empty initialization cuts remain recoverable; nonempty
unclaimed databases refuse.

Completed migration snapshots remain for at least 30 days. Deleted-election
snapshots also observe the existing 90-day deletion grace. A live database keeps
its newest usable complete backup; deletion of older snapshots first requires
the newest file's full hash to verify. Unknown, partial, linked or malformed
directories are preserved. This is migration retention, not general backup
encryption, scheduling or off-site custody.

Historical offline verification/restore upgrades only a disposable copy or new
destination. Real old-schema fixtures preserve their source and independently
supplied rollback floors. A child killed after all pending SQL but before COMMIT
leaves the old schema/data and a valid backup; a normal retry succeeds. The fault
barrier exists only in the test helper. Details and overlapping scoped runs:
[migration safety](../reports/migration-safety-20261127.md) and
[invariants](../reports/migration-invariants-20261127.md).

## Terminal readers and explicit archive migration

Current-schema ARCHIVED/IMPORTED runtimes use native SQLite readers. A read-only
stored-state probe prevents stale registry state from selecting automatic
migration. Clean replay compares projections without rewriting archive data.
Interrupted recovery uses an explicit writer before pool publication. Live
archive completion finishes its existing custody/projection/event/receipt order,
then retires the writer; failed reader acquisition invalidates that runtime.

Named synchronous maintenance preserves recorded exports/acknowledgements,
native witness updates, integrity evidence and privacy retention while keeping
the normal reader stable. Backup owns its reader across the awaited native copy.
An imported incomplete election refuses trustee spoil shares with the existing
`STATE_CONFLICT` response before writing. Retention, not receipt reading, purges
expired operation receipts.

The new `qv-migrate-archive` server binary and `qv migrate-archive` delegation
provide the explicit historical terminal upgrade. They lock the data directory,
validate terminal/control/path binding and independent anchors, retain a checked
original backup, migrate a private same-filesystem copy, and compare the board
plus all old non-board typed storage. After sealing, flushing and rechecking
copy and source, the command checkpoints unchanged source WAL and atomically
replaces the source. Busy/nonempty WAL, drift, anchor conflict or preservation
failure refuses.

Failure output distinguishes pre-publication failure from an ambiguous
publication boundary and preserves the known backup path in text/JSON. The tool
does not silently steal stale locks or adopt abandoned staging. Existing secret
erasure stays erased; no KEK or author authority is created. Windows directory
flush limitations remain explicit. Storage preservation is not full election
verification or freshness.

The shared installed-command launcher retains trustee delegation's literal
arguments, inherited streams, native exit/signal handling and bounded
cancellation. Windows npm shims must match their associated package executable;
unrecognized wrappers refuse. No server import/dependency is added to the CLI.
Reports: [reader boundary](../reports/archive-readonly-storage-20261127.md) and
[archive command](../reports/archive-migration-20261127.md).

## Receipt standing and live updates

Typed, uploaded and saved receipts share one operation and code-bound panel.
Inclusion remains available without a voting key, login or additional manifest
anchor. Optional standing requires the full independently obtained rules hash,
any independently supplied author keys, all existing strict snapshot checks,
no fatal/alarm finding, the inclusion head's exact origin/size/root and its
manifest-pinned witness quorum. Replacement follows the actual checked same-voter
predecessor chain. Cached live indexes no longer supply automatic counting claims.

Input changes, cancellation, navigation and pagehide invalidate work and old
status. Snapshot download caps actual streamed bytes at 64 MiB, enforces a
deadline through the body, validates UTF-8 and supports cancellation without
retry. Error bodies/arbitrary diagnostics do not become status copy. The input
uses ordinary voter wording while retaining the full independent hash/checks.
All 63 English guarantee entries are preserved. Five catalogs remain unreviewed
machine drafts; only English is offered.

This completes the supported closed-snapshot portion, not the entire standing
contract. Ordinary final-server exports still fail the strict canonical check
for authenticated derived records. A real-server regression retains inclusion
and that refusal even with independent author pins. Pre-close standing remains
unverified pending an adopted prefix-evidence contract. No record, check or close
marker is discarded/invented. See [status evidence](../reports/product-receipt-standing-20261127.md).

Actual-server tests reproduced missed appends between load and subscription,
and during reconnect before any event ID arrived. `LiveElection` now schedules
its existing signed-record refresh whenever a stream opens. Verification,
coalescing, cursor replay and close behavior remain. Node/browser acceptance
covers both gaps, retained IDs, pruned-outbox HTTP 410/reset, cleanup and a signed
tally updating an already-open Results view with its verification refusal intact.
See [live-update evidence](../reports/web-live-server-20261127.md).

## Additional acceptance and device behavior

| Area | Distinguishing evidence and boundary |
|---|---|
| Device clearing | One flight spans confirmation, storage and completion. Repeated actions do not duplicate them; cancel/error allows explicit retry. Storage generation, signer invalidation and honest failure copy remain. |
| Approval/k-of-n | Built-app counters, overvote refusal, selection/replacement and review pass. Unique selected labels disappear from the entire DOM after sealing/casting; no POST occurs before Cast, then one valid ballot is posted. This is not memory-erasure evidence. |
| Election accessibility | Six views check landmarks, native keyboard paths/disclosures, 320/768/1280px reflow and 2,040 text-colour samples across five themes. These heuristics do not establish WCAG or native assistive-technology conformance. |
| Product egress | Actual server behind pre-import Node network guards completes a real lifecycle with no unexpected outbound attempts. DNS/TLS/HMAC webhook controls and redirect/rebinding refusals run locally. This is not an OS network sandbox. |
| Lifecycle and halts | Independent graph checks 266 state/event and 494 state/type pairs plus 1,500 seeded steps. Fifty HTTP rejection pairs cover 15 phases. Real pause/resume exercises 13 authority/limit refusals without consuming counters or extending signed close time. |
| Ballot limits | Five tests cover quota-before-proof, both cast/spoil exclusion directions, overlapping same-predecessor casts under the mutex, and 100 distinct hashed-PoP submissions for one invitation. Five temporary mutation controls fail as intended; production bytes are restored. |

Reports: [egress](../reports/product-egress-20261127.md),
[lifecycle](../reports/product-lifecycle-20261127.md),
[pause/resume](../reports/product-pause-resume-20261127.md) and
[limits](../reports/server-ballot-limits-20261127.md).

## Composed-source verification

Node 24.22.3/Linux, existing pinned dependencies. No skipped or partial attempt
is a pass; overlapping focused groups are not added to these totals.

| Check | Observed result |
|---|---|
| Complete server | 634 passed, zero failed/cancelled, one existing Windows-only skip; 635 total, 202.988 s; local file concurrency 2 |
| Complete web | 510 passed, zero failed/skipped/cancelled; 97.208 s; local file concurrency 2 |
| Installed archive/trustee CLI adapters | 19 passed, zero failed/skipped; 6.507 s |
| Repository TypeScript | Passed |
| Explicit strict server-bin/all browser-entrypoint TypeScript | Passed with existing compiler options |
| Repository tooling | 71 passed, zero failed/skipped |
| Action pins, workflow coverage and browser runner | 21 passed, zero failed/skipped; three workflow pin scans pass |
| Dependencies/lockfile/vendor/i18n | Passed; two existing D-97 findings remain visible; 35 registry entries, eight workspace links, two vendor packages/132 files |
| Claims/links/trace structure | Passed; zero claims findings, 2,933 links checked after report/ledger updates. Historical trace classifications are not a completion metric. |
| Changed-file secret scan | detect-secrets 1.5.0 scans 111 files; one reviewed static-prefix finding, no actual credential identified; isolated synthetic private-key-header control detected |
| Complete browser runner | All 16 required journeys pass in one execution, exit 0, no skips |
| Production build | `5803cbe2f1e9`; 193,744 / 204,800 aggregate JavaScript gzip bytes |
| Entry/offline verifier | Entry 56,899 gzip /173,442 raw bytes; verifier 202,554 /409,600 bytes |

Local browsers used available Chromium 143.0.7499.0 through a scratch wrapper
that avoids a separate GPU process and bounds its JavaScript heap. The system
launcher lacked its expected executable. Repository browser arguments,
deadlines, assertions, KDF costs and CI commands are unchanged. Hosted pinned
browser and native-platform checks remain separate.

The first server run had 565 passes, one platform skip and an unexplained
`imports.test.ts` file-process failure. The unchanged file passed 16/16 alone,
then the complete suite above passed. The first web run had 474 passes and three
failures: two new-copy/reference failures and an unexplained i18n-lint process
failure. Copy, draft translations and generated reference were corrected;
unchanged isolated i18n lint passed 28/28, followed by the complete web pass.
No resource-cause diagnosis is inferred from these observations.

The secret scan's sole finding is the unchanged public `whsec_` format prefix
beside `randomBytes(32)` in `webhooks.ts`; source comparison confirms this is
generation code, not a stored credential. No suppression or plugin setting was
added. The first external control-file invocation detected nothing and is not
accepted as a control pass. A newly created isolated dummy PEM header, scanned
from its own temporary directory with the same plugins/options, is detected by
the Private Key detector. The scan is finite pattern evidence, not an assurance
that every possible secret encoding has been excluded.

The ad hoc entrypoint check first lacked Node types because its temporary config
lived outside the checkout. Supplying that checkout's type root exposed one older
test-server `RequestInit.body` typing error. Empty bodies now use accepted `null`;
the strict check passes and the main browser journey passed again on that
test-only correction. Application source was unchanged during the 16-journey run.

Workspace exhaustion occurred while creating a later isolated checkout. Only
regenerable dependencies and redundant completed checkouts were removed; source
snapshots were first preserved as Git trees under local checkpoint refs. Reports
and test logs were retained; the new checkout then succeeded. No production
behavior or validation assertion changed.

## Native observation, follow-ons and held contracts

The older #75 Windows Node 22 trustee/crypto job had six first-key startup ACK
timeouts while later custody cases and crypto passed. Test-only observation now
records finite elapsed/heartbeat intervals for selected first-key fixtures,
preserving outcomes without serializing secret results or raw errors. Four
observer tests and six selected fixture tests pass locally. This is diagnostics,
not a repair or explanation of the native timeout. See [observation evidence](../reports/trustee-native-observation-20261127.md).

Separate current-source reproductions identify duplicate voter-key derivations
and non-atomic supplemental phase events. Their fixes and accepted DCO/SBOM
tooling are follow-ons, outside this source receipt. Other accepted process
tasks remain under review.

Unadopted derived-record/author rules, pre-close standing, signed renewable
clocks, governance/remedies, automatic receipt custody, incompatible invitation
width requirements, native ACL/durability, accessibility/translation review,
independent crypto review and release provenance remain held. Main promotion
still needs the required formal human approvals, including designated security
review, and owner resolution of historical provenance gaps. This increment
does not establish completion of all QuietVote features or release gates.
