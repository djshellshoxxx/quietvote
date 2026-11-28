# Migration invariants: streaming protected-history guard

Date: 2026-11-27 (America/Vancouver). Base: PR77, `6764bf231801a782a57b2778a344c6ab26063e9b`.

## Contract and scope

[QV-28-REQ-010 and §13](../28-data-model-storage.md) require migrations to preserve existing `log_entry`, `checkpoint`, and `merkle_node` rows and verify the log commitments before and after migration. The actual shipped protected fields are defined in [electiondb.ts](../../packages/server/src/electiondb.ts). The optional `merkle_node` table is specified in QV28 §8.2; the shipped schema does not currently create it. [The board Merkle implementation](../../packages/board/src/merkle.ts) uses the RFC 9162 leaf and internal-node domains.

This change supplies [migration-invariants.ts](../../packages/server/src/migration-invariants.ts) and its [dedicated tests](../../packages/server/test/migration-invariants.test.ts). It does not alter migration SQL, schemas, the migration runner, backup handling, or application behavior on its own. The separate migration integration calls this guard while holding a stable transaction and supplies backup/rollback behavior.

## Implemented behavior

`captureMigrationInvariants(db)` checks the source history and returns a frozen summary. `assertMigrationInvariants(db, before)` captures the current history against the old column projection and refuses any change to protected rows. Neither function depends on `db.ts`, starts a transaction, or writes to the database.

- Log sequence numbers must be integers contiguous from zero. Each stored leaf must equal SHA-256 of the byte `0x00` followed by its actual stored header. A frontier of at most one hash per level recomputes the full RFC 9162 root.
- Every checkpoint must have a nonnegative, unique size within the log and the correct root at that exact prefix. Size zero uses the empty-tree root. A latest checkpoint may lag the full log; matching it against a later root would reject a valid snapshot. A nonempty checkpoint table requires a log table.
- Optional cached nodes must identify complete subtrees, have valid coordinates and 32-byte hashes, and match independently recomputed nodes. Sparse valid caches are accepted. Point lookups and a matched-row count reject incorrect, orphan, incomplete, and duplicate nodes without retaining the cache.
- Every existing column value in every protected row enters a canonical SHA-256 row-stream digest. Each value has a SQLite storage-class tag and an unsigned 64-bit byte length; integers use exact signed 64-bit bytes and REAL values use IEEE 754 bytes. TEXT is read as bytes, preserving malformed UTF-8 and content after embedded NUL. Row counts and the full log summary are also compared. Bodies, body digests, nonce keys, timestamps, signed note text, and witness flags are therefore protected even when their modification leaves the Merkle root unchanged.
- A previously present table or column cannot disappear. Ordinary main-schema tables are required; views and temporary shadow objects are refused. An initially absent table may be created only while empty. Added columns are allowed while all preexisting values remain identical. Recapturing after each successful migration makes those new columns part of the next baseline.
- Existing historical redactions remain valid inputs: a NULL body and its stored redaction metadata are preserved exactly. The migration guard does not authorize new redaction, restoration, or timestamp changes during migration.

SQL row iterators retain one row at a time, including its body, plus the logarithmic Merkle frontier and constant-size summaries. The guard does not use `all()` or retain a log-sized array of bodies, leaves, checkpoints, or cached nodes. Optional node validation uses indexed point reads on the specified `(level,idx)` primary key. Iterators close on both success and failure so the caller can roll back or continue DDL safely.

## Acceptance evidence

The dedicated tests compute expected roots with an independent recursive largest-power-of-two split; they do not use the production frontier or BoardStore Merkle helpers. Fixtures mirror protected storage fields but deliberately omit append-only triggers, because a migration that removes a trigger must still be caught by the independent guard.

The 65 focused cases cover:

- Every checkpoint from zero through the final prefix for 13 log sizes, including powers of two and uneven trees through 257 leaves.
- Lagging checkpoints, empty logs, missing checkpoints, malformed leaves, gaps, duplicate sequences, wrong empty roots, invalid historical prefixes, and checkpoints beyond the log.
- Coordinated header/leaf/checkpoint rewrites that remain internally consistent, plus mutations to all remaining log fields and checkpoint notes, timestamps, and witness flags.
- Existing redactions, attempted additional redaction, restoration, deleted rows, added rows, table/column removal or renaming, view replacement, temporary shadows, new empty tables, and compatible schema expansion.
- Valid sparse caches and wrong, duplicate, orphan, incomplete, negative, oversized-coordinate, or malformed cached nodes.
- SQLite storage-type distinctions, integers beyond JavaScript's safe number range, malformed UTF-8, embedded NUL, NULL versus an empty BLOB, and ambiguous unframed field concatenations.
- A 2,049-row fixture with 16 KiB bodies and a checkpoint at prefix 1,023, with `StatementSync.all()` disabled. Its snapshot remains under 2,000 serialized bytes. Failed capture also releases its iterators before rollback and subsequent DDL.

Validation on Linux, Node 24.22.3:

- `node --test --test-reporter=spec packages/server/test/migration-invariants.test.ts`: 65 passed, zero failed/skipped, 0.92 seconds.
- Final `node --test --test-reporter=spec packages/server/test/migration-invariants.test.ts packages/server/test/unit.test.ts`: 71 passed, zero failed/skipped, 1.18 seconds.
- `npm run typecheck`, `npm run vendor:check` (two pinned packages, 132 files), and `git diff --check`: passed.

## Limits

This guard protects existing stored values and Merkle consistency. It is not a replacement for board signature/proof verification, signed checkpoint-note parsing, foreign-key/projection consistency checks, schema-version/checksum checks, or a migration backup. It does not claim byte-identical SQLite files, preservation of incidental page/index layout, or protection against an unrelated writer outside the caller's stable transaction. Added schema structure is permitted; protected row contents are the invariant.

The bounded streaming test prevents use of bulk row loading and exercises sizeable bodies. It is not a native-memory benchmark, a power-loss test, or a substitute for the migration runner's separate historical-fixture and backup/rollback tests.
