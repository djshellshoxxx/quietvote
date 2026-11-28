# Explicit archive migration: implementation and local evidence

Date: 2026-11-27 (America/Vancouver). Base: PR #77,
`6764bf231801a782a57b2778a344c6ab26063e9b`, plus the separately reviewed terminal
read/maintenance split and migration-safety prerequisites listed below.

## Requirement and completed plan

[QV-28 §13](../28-data-model-storage.md#13-migration-strategy) permits an explicit
`qv migrate-archive` copy/migrate/root-check/atomic-swap path for historical
archives. REQ-010 requires checksummed transactional migration, a preceding online
backup and unchanged board rows/roots; REQ-015 reserves writable terminal storage
for explicit maintenance. This change implements that explicit path without
adding a compatibility reader or enabling automatic terminal upgrades.

The completed sequence is:

1. Acquire the existing instance lock, inspect control/source through native
   read-only handles, validate the entire known checksum prefix and actual schema,
   and bind one canonical registry entry to its native `ARCHIVED` or `IMPORTED`
   database. Current schema returns an exact no-op.
2. Retain a native SQLite backup and verify it against the source snapshot. Create
   a private same-filesystem `VACUUM INTO` candidate and apply the unchanged shipped
   migration catalog only to that candidate.
3. Compare the existing migration invariants, every original non-board row/column,
   erased fields, receipts, invitation states, pinned roll and AUTOINCREMENT
   floors. Added columns/tables retain their existing shipped defaults; the known
   pre-v6 bridge-floor insertion is the only allowed new row in an old table.
4. Checkpoint and close the candidate, switch it to DELETE journaling, fsync and
   reopen/recheck the sealed bytes. Recheck the source before its narrow final
   checkpoint; close every handle and refuse to discard nonempty WAL/journal data.
5. Attempt same-directory replacement, report possible publication from that
   attempt onward, fsync the containing directory on POSIX, and release the lock.
6. Expose the server-owned executable and the existing installed-process CLI
   pattern; preserve the trustee adapter's behavior through the shared runner.

## Authority and preservation boundary

The command's report says `verification_scope: "storage_preservation"`. It does
not claim a full election-signature audit, freshness, finality or off-site custody.
The reported tree/root identifies the preserved snapshot only. It does not load a
KEK, replay through a writable runtime, change protocol acceptance, infer public
author keys, or alter existing SQL migration bytes.

Control is not migrated or written. Registry rows, independent anchors, recovery
intents, security floors, webhook cursors and other control records remain
unchanged. An existing native anchor must be unconflicted and match this origin,
log key and a valid tree prefix. Ahead/forked/conflicted evidence refuses. A valid
older prefix is retained without advancement. Historical absence stays absent,
including a genuine control schema 7 without the later anchor table; schema 8
with that required table missing refuses. Imported mirrors cannot inherit a native
ownership anchor. The report labels these cases `preserved`, `absent` or `not_owned`.

The preserved-column checks retain invitation expiry/state, encrypted or erased
fields, replay receipts, metadata and event sequence floors. For pre-v9 databases,
the already-shipped registration migration supplies `legacy-raw-v1`; migration
does not grant those rows the modern invitation contract. The pinned-roll
corruption test restores the original immutable-trigger SQL after its candidate
fault, so rejection cannot be explained merely by a missing trigger.

## Publication and recovery

| Boundary | Installed archive and report |
|---|---|
| Before replacement attempt | Old logical state remains installed; `not_published`. A source WAL checkpoint may have changed physical main-file bytes. |
| Replacement operation throws | `possibly_published`, even when a test's injected operation happened not to rename. |
| Rename succeeded, later operation/fsync fails | Complete new archive may already be installed; `possibly_published`. |
| Process exits before/after rename | Old or complete new archive plus retained original; lock/private staging can remain. |

The retained original and manifest live in the helper's versioned
`<archive>.sqlite.pre-migrations/` directory. Both default text and JSON failure
reports include a known completed backup path; arbitrary exception text is
withheld. Ordinary cleanup removes only this invocation's private staging area,
not the retained original. A process-exit test removes the stale lock only after
its sole child owner has exited; production does not steal locks or adopt orphaned
copies. Operators must inspect the installed archive before retry/recovery.

## Verification performed

All checks below were local, on Linux with Node 24.22.3. The environment used an
independent `npm ci --ignore-scripts` and the pinned vendor installer.

| Check | Result and scope |
|---|---|
| Archive integration | 58 distinct tests pass: 57-test complete run followed by the final default-error recovery assertion and new JSON-failure assertion, 2/2. |
| Historical coverage | Each election schema 1–10, both native and imported, migrates to schema 11; then real runtime/HTTP access uses a physical read-only handle. |
| Genuine fixture | Production enrollment, proved/signed casts, trustee-mode spoil shares, close/tally/audit-close, recorded export/ack and verified QVB import. Historical databases project that data into each unchanged embedded schema prefix. |
| Exact data | Independent SQL row/column hashing compares retained backup and new archive; control and KEK file bytes are checked. Empty event rows retain a nonzero sequence floor. |
| WAL and failures | Committed election/control WAL, busy checkpoint/retry, backup/preparation failure, rename-return/fsync failure, actual child exits before/after rename, old/current no-op and lock refusal. Existing control main/WAL bytes remain unchanged. |
| Refusals | Future schema, old checksum change, missing required table, checkpoint/root damage, identity/phase mismatch, anchor conflict/ahead/fork, mirror/native ownership mismatch and candidate-only private-state changes. |
| CLI processes | 19/19 tests across new archive forwarding and existing trustee forwarding; literal arguments/streams/status, actual installed help/usage, bounded missing/failed executable errors, exact local/global npm wrapper binding and existing POSIX cancellation/listener behavior. A server integration test also performs a real migration through installed `qv`. |
| TypeScript | Scoped strict check covering the new engine/helper/bin/tests and both CLI wrappers/shared runner/main passes with a 768 MiB heap cap. An earlier overlapping run exited 137 and remains an unsuccessful resource qualification. |
| Repository checks | Vendor check passes for 2 pinned packages/132 verbatim files; lockfile lint passes; dependency check finds no new violations (2 existing D-97 deviations remain); 2,873 documentation links in 434 files have no broken targets. |

Two early process-exit assertions assumed backups were flat `.sqlite` files;
the helper actually retains versioned directories containing `database.sqlite`.
Correcting that test expectation made both crash-boundary tests pass. No production
change was made to accommodate that harness error.

This is not testing with historical released binaries, a new protocol verifier,
power-loss certification or native Windows/macOS qualification. Windows directory
fsync remains explicitly unsupported in the report. Native read-only SQLite may
create locking SHM or empty WAL files. Same-user/root compromise and noncooperating
external writers are outside the existing data-directory-lock boundary.

## Frozen implementation source

Paths are relative to the repository root; hashes are Git blob IDs.

| File | Blob |
|---|---|
| `packages/server/src/archive-migration.ts` | `7830ae893182cd86eabc2af2de5e78304be7e7fb` |
| `packages/server/src/archive-preservation.ts` | `8e17e4c01ae1f6db670a234cbb926b8cf8dbe5c3` |
| `packages/server/bin/qv-migrate-archive.ts` | `68f7f5fb4468762de8561d8ba3cd9b07a178e008` |
| `packages/server/test/archive-migration.test.ts` | `f70faabb5150549dd493a79df1d001583f084652` |
| `packages/server/test/helpers/archive-migration-fixture.ts` | `c8ca0640886d0b708a240656baf7f928b983d0da` |
| `packages/server/test/helpers/archive-migration-crash.ts` | `a3170073de43ffe11bb3f2c4e9e6578e73ca1562` |
| `packages/cli/src/installed-command.ts` | `b166525ed9e56d76cd2826e415753399cf70ebe1` |
| `packages/cli/src/cmd-migrate-archive.ts` | `f6faf40f0914f3bfea7fcd9650bc9d4a7b71fc79` |
| `packages/cli/src/cmd-trustee.ts` | `71c223f84e05cc1a588a08f044acf663c3a5aa45` |
| `packages/cli/src/main.ts` | `2fb1151a1b7ebbe20313cebb8a3de0b2066da01d` |
| `packages/cli/test/archive-migration-passthrough.test.ts` | `7582230739b74634b75dba9eb6560b6a92a7547e` |
| `packages/cli/test/trustee-passthrough.test.ts` | `b30af4b5c52bd2dca85050126e53076fbd951e6f` |

The terminal-reader prerequisites are owned by the separate Task9 handoff. The
migration helper snapshots used here are also prerequisites, not this command's
delta: `db.ts` `274b44cdb460bac3fd2fe267baa16a2c78ed6861`,
`migration-invariants.ts` `36a66df239be2dfeacc8611079f4b892a89015d3`,
`migration-backup.ts` `d6ecd98aaec6adb8e2ee20b316084fb0c165318d`,
`migration-backup-worker.mjs` `2d85ceeb2aae4c88dceae34280c70b8528a5e934`,
combined `electiondb.ts` `5f383c1b4d93907b7c8ae8a37da96cd7e0b01e09`, and
`controldb.ts` `fc565f2e4415ab785079183733a769ee81df1cdb`.
Integration must retain newer reviewed helper/policy/retention work rather than
copying these prerequisite files over it.
