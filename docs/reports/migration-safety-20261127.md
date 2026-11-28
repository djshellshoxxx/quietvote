# Database migration safety — 2026-11-27

## Scope and completion plan

This continuation implements the storage migration work in the accepted server
inventory and QV-28. It is composed on PR77, after the read-only archive work.
The work was divided into independently checked steps:

1. Validate database identity and the complete known migration prefix before
   permitting persistent changes.
2. Take and verify a durable, private SQLite backup before an established
   database is upgraded.
3. Apply the pending migration chain in one transaction and preserve existing
   board bytes, checkpoint roots and typed table values.
4. Refuse automatic archive upgrades and upgrades during potentially open
   elections; expose a one-time, explicit open-election override.
5. Recover legitimate empty initialization cuts without treating unknown
   databases as fresh instances.
6. Enforce the migration-backup retention floor and preserve the newest
   usable live backup.
7. Upgrade disposable offline backup/restore copies explicitly, retaining the
   existing independently supplied rollback floors.
8. Exercise real process termination before migration commit and historical
   schema upgrades. The separate archive command qualifies copy-and-replace
   of a terminal archive; ordinary runtime opens remain read-only.

The implemented migration path does not establish fresh election evidence,
full signature verification, independent cryptographic review, native Windows
directory durability, or permission to use QuietVote for consequential voting.

## Validated opening and atomic migrations

`packages/server/src/db.ts` now checks the SQLite application ID, contiguous
known migration ledger, SQL checksums, ledger cardinality and `user_version`
before applying persistent connection settings. Read-only and explicitly
nonmigrating writers require the current schema. Local connection safeguards
apply in both modes. A nonempty uninitialized file cannot be claimed as a new
QuietVote database.

An established election with pending migrations must contain ordinary
`election`, `log_entry` and `checkpoint` tables. This check is separate from the
generic invariant collector: a collector that supports a fresh control database
must not accidentally authorize missing board tables in an election database.

All pending steps execute in one outer `BEGIN EXCLUSIVE` transaction. The
prefix is revalidated after obtaining that lock. Each SQL statement is prepared
by SQLite, using its actual `sourceSQL` boundary; triggers and quoted semicolons
work without a home-grown SQL splitter. Only the required schema/data statement
families are allowed. Migration SQL cannot issue its own transaction control,
`PRAGMA` or attachment statement. The transaction must still be active after
every statement. Ledger/version updates, foreign-key checks and preservation
checks remain inside the same transaction. A failure rolls back the entire
pending chain. The shipped historical SQL bytes and their checksums are
unchanged.

The stream-based preservation implementation and its independent review are
documented in [migration-invariants-20261127.md](migration-invariants-20261127.md).
It checks contiguous board sequence numbers, each stored checkpoint prefix,
the existing sparse Merkle cache, and old typed table columns and rows. It
preserves signed 64-bit integers, REAL values, raw TEXT bytes and BLOB bytes.
It permits additive columns while protecting all old values. A lost table,
view replacement, temporary shadow, missing old column or changed old value
refuses the migration. Merkle accumulation uses logarithmic working space.

## Durable backup before upgrade

`migration-backup.ts` creates private temporary directories beneath the
database's `.pre-migrations` directory. POSIX directories use mode 0700 and
files mode 0600. Existing roots must be real directories rather than symlinks.
The backup worker opens the source read-only and actually awaits Node's SQLite
backup operation. It checks application ID and source version, destination
integrity and version, seals the result as a self-contained database, flushes
it, and hashes it with a bounded streaming buffer.

The parent validates the worker's bounded receipt, creates an exclusive
`qv-migration-backup/v1` manifest, flushes files and directories, and renames the
completed directory into its final version/time name. The backup root and its
parent are flushed on the supported POSIX path. A complete backup remains if a
later SQL step fails; owned incomplete output is cleaned up. The worker uses
fixed arguments, no shell, a bounded output buffer and a five-minute deadline.
Arbitrary worker error text is not exposed as an operator diagnostic.

These are migration snapshots, not a general backup encryption or scheduling
system. Windows directory flushing is explicitly unqualified; ordinary file
flushes are not represented as equivalent native directory durability.

## Startup policy and legitimate initialization cuts

Startup takes the data-directory lock before read-only preflight. It inspects
the control database and every undeleted, nonimported registry target without
opening an election writer. Paths must remain inside the canonical directory;
database identities and migration prefixes must be recognized.

If any upgrade is pending, an OPEN projection in either database holds the
upgrade. The preflight also inspects ordered durable board records: a recorded
`election_open` without a later `election_close` or `election_cancel` holds the
upgrade even when a crash left both projections at READY. PAUSED and
post-opening INVALIDATED states are treated conservatively. These are safe
migration holds, not a new authenticated lifecycle interpretation.

An unreadable or inconsistent required election prevents a pending upgrade,
including when the force option is supplied. A current-schema instance can
still recover its existing missing-DRAFT-file case. An application-ID-zero,
version-zero SQLite file is accepted as an initialization cut only when its
schema is exactly empty and it belongs to control initialization or a registered
DRAFT election. Real cuts immediately before the first application-ID write
are tested. Unknown IDs, nonzero versions and nonempty files remain refusals.

`qv-server --force-migrate-open` is a one-time startup option. It is forwarded
to the control and election open paths and bypasses only the known, readable
opening hold. It is not an inherited launcher JSON setting. ARCHIVED and
IMPORTED databases never receive an automatic in-place schema upgrade; they
require the explicit terminal-archive workflow. Native archive primary handles
and imported mirrors remain read-only during normal operation.

## Retention without losing the last usable live snapshot

`migration-backup-retention.ts` recognizes only completed version/time folders
with exactly the database and a bounded, strictly parsed manifest. It checks
the expected application ID, source basename, versions, timestamp, size and
digest shape. Unknown, partial, linked, extra-file and foreign-metadata folders
are preserved rather than guessed at or removed.

Completed snapshots have a minimum 30-day lifetime. Live databases retain the
newest snapshot; older recognized snapshots can expire only after the floor.
Before removing any older live snapshot, the implementation opens the newest
database without following a symlink and streams its full digest against its
manifest. A corrupt or unreadable newest snapshot prevents that cleanup. This
check was added after independent review reproduced the risk from a
same-length corrupt newest file.

Deleted elections retain snapshots through the 90-day deleted-election grace
period and each snapshot's own 30-day minimum. The sweeper locates these using
paged tombstones without recreating a deleted database. Imported mirror
cleanup does not acquire a writer. Count-only status/audit output records the
number of pruned migration snapshots. Ordinary backups, exports, rollback
floors and unknown files are outside this deletion policy. No physical erasure
claim is made. An old control snapshot can still contain wrapped key material;
the independent rollback floors remain necessary.

## Historical offline verification and restore

`offline-backup.ts` upgrades only copies in its disposable verification
directory or newly created restore target. These explicit copies use the same
catalog, backup, transaction and preservation checks, with the deliberate open
and terminal-archive overrides needed for an offline copy. Supplied backup
sources and live databases are never upgraded by this operation.

Tests construct actual historical DDL from the catalog prefix, rather than
merely lowering `user_version`. They cover a historical OPEN control/election
pair and historical ARCHIVED plus verified IMPORTED election copies. Source
files remain unchanged; restored schema versions, board roots, checkpoints,
read-only terminal runtime and keyless terminal custody are checked. The
existing independently supplied minimum-checkpoint floors still reject an
older backup when a newer floor is required.

## Recorded verification

Focused batches overlap and must not be added as distinct-test totals:

| Root integration check | Observed result |
|---|---|
| Opening, historical migrations and invariant batches | 107/107 pass, 6.80 s |
| SQL statement boundaries and initial startup policy | 32/32 pass, 8.44 s |
| Composed archive reads, maintenance, exports, lifecycle and pause | 24/24 pass, 53.59 s |
| Historical offline copies, existing rollback floors and offline CLI drills | 28/28 pass, 13.71 s |
| Real termination before commit, missing tables and expanded preflight | 27/27 pass, 4.20 s |
| Reviewed retention including corrupt newest snapshot | 10/10 pass, 1.06 s |
| Full TypeScript check after storage composition | Pass |

The crash test waits for the child to apply all pending SQL while still inside
the outer transaction, then terminates the child with `SIGKILL`. Reopening
shows the original version and data, no pending-step table and a valid retained
pre-upgrade backup. A normal retry then upgrades successfully. The blocking
hook exists only in the test process, not as a production fault switch.

The first complete server run was **not green**: 567 reported tests, 565 passes,
one platform skip and one file-process failure in `imports.test.ts`, after its
first ten assertions passed. The spec output did not identify a functional
exception or a process signal. The unchanged file then passed all 16 tests in
an isolated run (43.69 s). The failed run is retained; resource contention is
not asserted as its cause. The final composed suite, including the explicit
archive command and later ballot-limit tests, passed **634 tests, zero failures
or cancellations, and one existing Windows-only skip** (635 total; 202.99 s)
with local test-file concurrency bounded to two. Production deadlines, retries,
CI concurrency and security checks are unchanged. The final root typecheck and
explicit server-bin/browser-entrypoint typecheck also pass.

## Remaining qualifications

Explicit terminal-archive copy-and-replace, source WAL handling and publication
fault tests are completed in the separate
[archive command report](archive-migration-20261127.md). This report does not
substitute for those checks. Native Windows ACL/custody and directory-flush qualification, the
observed native startup timeouts, independent security review, protocol contract
holds and release approvals remain open. Historical storage preservation does
not establish election freshness or a final, trusted result.

Primary implementation references: `packages/server/src/db.ts`,
`migration-backup.ts`, `migration-backup-worker.mjs`, `migration-policy.ts`,
`migration-invariants.ts`, `migration-backup-retention.ts`, `retention.ts` and
`offline-backup.ts`; corresponding named server tests; QV-28 and the accepted
server inventory. Node API reference:
[SQLite backup documentation](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#sqlitebackupsource-db-path-options).
