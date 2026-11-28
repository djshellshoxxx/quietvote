# @quietvote/server

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

## Executable and local operations

Prepare dependencies from the repository root with `npm ci --ignore-scripts` followed by `npm run vendor:install`. Before starting a checked-out candidate, `npm run vendor:check` verifies the installed cryptographic bytes and resolution against the recorded vendor snapshot.

Run `node packages/server/bin/qv-server.ts --config /absolute/path/server.json`
from the repository root. Use `--check-config` for strict configuration validation
without data/key creation. See [launcher configuration and deployment examples](../../deploy/README.md)
for the complete contract, health checks, graceful shutdown and known operational limits.

Node supervisors can spawn the executable with an IPC channel and send the exact
string `qv-server:shutdown` after its listening event. The launcher drains the
existing service lifecycle, releases the data-directory lock, disconnects IPC and
exits normally. This also supports Windows, where `child.kill('SIGTERM')` forcibly
terminates a child without running its JavaScript signal handler. Other IPC
messages are ignored; no network shutdown endpoint is exposed. POSIX signal
shutdown remains supported and tested separately.

## Startup database migrations

Startup validates the known database identities and migration history before
upgrading an established database. It retains a verified SQLite snapshot beside
each database, then applies all pending steps in one transaction while preserving
old board data and checkpoint roots. A failed migration retains its completed
pre-upgrade backup. Unknown or inconsistent schemas refuse startup.

A read-only preflight holds a pending upgrade if either stored projection, or
durable opening records, indicates voting may still be open. Prefer upgrading
after voting has ended. An operator deliberately upgrading a known, readable
open election can request the one-time override:

```sh
qv-server --config /absolute/path/server.json --force-migrate-open
```

The flag does not bypass unreadable/mismatched storage, backup or preservation
checks, and is not a saved JSON setting. `--check-config` only validates the
configuration; it does not inspect or migrate databases. Historical terminal
archives require the explicit command below.

Migration snapshots retain at least 30 days, with the newest usable live snapshot
preserved. Deleted-election snapshots also retain the 90-day deletion grace.
Unknown/partial/linked snapshots are not removed by this policy. Ordinary
off-site backup encryption, scheduling and custody are separate responsibilities.
Historical `qv-backup verify|restore` operates on explicit private copies and
retains its independently supplied rollback floors. See the
[migration implementation and evidence](../../docs/reports/migration-safety-20261127.md).

## Explicit archive schema migration

Stop every QuietVote process using the data directory, then run the server-owned
maintenance executable for one native `ARCHIVED` election or `IMPORTED` mirror:

```sh
qv-migrate-archive --data-dir /absolute/path/data \
  --election 0123456789abcdef0123456789abcdef --json
```

In a source checkout the equivalent is
`node packages/server/bin/qv-migrate-archive.ts --data-dir DIR --election ID`.
The portable CLI also forwards `qv migrate-archive ...` to the installed
`qv-migrate-archive` on PATH. Both use the same server command and exit statuses:
0 for a completed migration or an already-current archive, 1 for a maintenance
failure, and 2 for invalid usage. A missing delegate executable returns CLI exit 4.

The command implements the explicit-copy path in
[QV-28 §13](../../docs/28-data-model-storage.md#13-migration-strategy).
It holds the existing data-directory lock, checks the known migration lineage and
actual schema, verifies registry/lifecycle bindings, and retains a native SQLite
backup of the original committed state. It uses `VACUUM INTO` to prepare a private
copy beside the source, applies only the shipped migrations to that copy, compares
the board and all old stored fields, seals the copy, then atomically replaces the
archive. A current-schema archive is a no-op. Active elections, damaged or unknown
schemas, and conflicting independent recovery anchors are refused.

`verification_scope: "storage_preservation"` describes the report's scope. Existing
native recovery anchors remain unchanged; a genuinely absent historical anchor
stays absent and is reported as `runtime_anchor: "absent"`. Imported mirrors report
`"not_owned"`. A preserved anchor can be an older valid prefix and is never advanced
by this command. The command does not perform a full election-signature, freshness
or finality audit, does not establish new authority, and does not load the KEK.
It does not migrate `control.sqlite` or rewrite its security/recovery records.

### Failure and interruption recovery

The original snapshot is retained under
`<election>.sqlite.pre-migrations/v<old>-<time>-<suffix>/database.sqlite`, together
with its manifest. Success and failures after backup completion report that exact
path; ordinary command cleanup does not remove the retained original. Existing
backup retention and custody policy still applies to these copies.

A failure with `publication: "not_published"` means replacement has not been
attempted. The original logical state remains installed, although a completed
source checkpoint may have moved committed WAL pages into the main file. Once
replacement is attempted, failures conservatively report `"possibly_published"`:
inspect the installed archive and retained original before recovery or retry.
Never assume an error after rename means the old file is still installed.

A killed process can leave the existing maintenance lock and a private
`.qv-archive-migration-*` staging directory beside the archive. Confirm that every
process using the data directory has stopped before handling that stale lock.
Keep the retained backup and inspect the installed file; the command never adopts
an abandoned copy or automatically steals a lock. After the confirmed stale lock
is removed, rerunning validates the installed archive and either migrates the old
version or reports the complete new version as already current. Do not manually
discard a nonempty WAL file.

Linux Node 24 tests cover process-exit and injected I/O failure boundaries; they
are not power-loss qualification. Directory fsync is performed on POSIX. Windows
reports `directory_sync: "unsupported"` after migration, and native Windows
durability, locking, replacement and interactive termination need separate
qualification. Read-only SQLite handles may create locking SHM or empty WAL files;
the protected database state and existing committed WAL data remain the comparison
boundary. Historical fixtures use every unchanged embedded migration prefix,
rather than binaries from past releases. See the
[source and validation report](../../docs/reports/archive-migration-20261127.md).
