# Offline server backup recovery

The shipped `qv-backup` verifies full `qv-backup/v1` server snapshots and restores
into a **new, nonexistent directory**. It never overwrites a live or existing
directory and never generates a replacement KEK. This is the local structural
recovery path for QV-28 §10 and QV-12 §8, separate from public `.qvb` import.
Election-only snapshots lack control/account/key state and are refused.

## Retain the inputs

Keep a separate, independently retained copy of the original 32-byte
`DATA_DIR/kek/kek.bin` under operator custody. On POSIX systems it must be a
regular file with mode `0600` or stricter. Neither a public export nor a database
snapshot replaces it. Do not put it in the snapshot directory.

Request `POST /api/v1/admin/backups` with `{ "scope": "all" }` using the existing
signed instance-admin API, wait for job state `done`, then preserve the whole
`result_ref` directory beneath the server data directory. Retain an independently
collected recent full backup as the minimum known history for restore, as well as
the latest witness/mirror checkpoints and receipt evidence. A backup cannot prove
that no newer history exists.

Snapshots are private local SQLite files; sealed fields remain encrypted under
the original KEK. Encrypt the complete snapshot with your separately managed
backup-encryption system before off-host transport. This command does not provide
age encryption, remote transport, scheduling or retention automation. Keep server
config (witness anchors, admin keys, public URL and registration policy) separately;
snapshots do not include it.

Each database is a consistent SQLite online snapshot. Full backups capture their
membership from the copied control registry. A disappearing election fails the
job and removes its partial snapshot. Databases are captured sequentially, not in
a global transaction. Offline verification refuses inconsistent registry/key
bindings; retry from a quiet instance if necessary.

## Verify and restore

Run from a checkout with dependencies installed, or use the installed `qv-backup`
bin. No network connection is required or initiated.

```sh
node packages/server/bin/qv-backup.ts verify \
  --backup /media/recovery/COMPLETE_JOB \
  --kek-file /media/key-custody/quietvote-kek.bin

node packages/server/bin/qv-backup.ts restore \
  --backup /media/recovery/COMPLETE_JOB \
  --kek-file /media/key-custody/quietvote-kek.bin \
  --minimum-backup /media/independent-history/RECENT_COMPLETE_JOB \
  --destination /srv/quietvote-recovered
```

The destination parent must exist. The destination itself must not exist, even
as an empty directory or symlink. Sources and the destination parent must be
privately owned by the operator; this is not a hostile-filesystem boundary.
Restore reserves a directory and holds the server's process-ownership lock
through copying. It records a `restore` operator audit event and leaves no
listeners running. On normal failure it removes partial files while holding that
lock. A crash can leave a partial directory/lock: stop every user of that volume,
preserve it for diagnosis, then retry into another new directory. Never remove a
live server's lock.

The minimum backup is verified using the same original KEK. Each election in it
must exist in the candidate with the same origin/key and identical Merkle prefix
at least as large. Smaller trees, forks and missing elections are refused before
destination creation, without an override. Deletion after the minimum backup also
causes refusal: use a newer independently retained floor recording the authorized
deletion. For an isolated drill, explicitly naming the candidate itself as
`--minimum-backup` is supported but supplies no independent/newer-history assurance.

Every tombstone in the minimum backup must remain DELETED in the candidate.
Restoring its old live snapshot or omitting that tombstone is refused, so a
restored backup cannot forget deletions needed by future recovery floors.

Restore also compares private security state from the two verified snapshots.
It refuses missing or rebound account keys, reactivated revoked credentials or
organizations, reenabled disabled webhooks, resurrection or loss of recorded
webhook deletions, and loss or rollback of unexpired replay/idempotency records.
Closed invitations cannot become usable again; erased invitation labels and
contacts cannot reappear. Rejections use `BACKUP_SECURITY_ROLLBACK` before any
destination is created. Expired replay/idempotency records may be pruned. The
private comparison data is never included in the command's JSON report.

These are conservative monotonic checks, not a merge of two snapshots. If an
intentional administrative reactivation is incompatible with an older floor,
retain a newer independently verified floor before restoring. The public
`verifyBackup` library report alone carries only the existing public-history
floor; `restore` obtains private state by independently verifying both full
snapshots. This does not establish global snapshot atomicity or discover
security changes absent from both supplied backups.

Success reports instance ID, file/envelope counts, deleted election IDs and election roots/sizes, never
keys or unsealed data. Zero authenticated envelopes means there is no encrypted
material proving which KEK was used. Exit codes: `0` success, `1` verification/I/O
failure, `2` invalid syntax. Errors are static `BACKUP_*` codes; SQLite exceptions
and secret paths are not echoed.

Checks cover bounded strict JSON, snapshot members/checksums/regular files,
SQLite integrity/foreign keys/application IDs, migration checksums/schema support,
all registry paths including tombstones, startup replay/board grammar, current
server entry-author roles/signatures, body/tree/checkpoint integrity and existing
quarantine/rollback evidence. Sealed DEKs, signing-key bindings, invite data and
webhook envelopes authenticate with the supplied KEK. Historical organizer
signatures may use subsequently revoked organization keys; this does not
authorize new submissions. All verification/migration runs on disposable copies;
source bytes are unchanged. Legacy empty WAL/bounded regular SHM sidecars are
ignored; any nonempty unmanifested WAL is refused. Redacted histories that the
current server cannot replay are refused. Cross-platform recovery is unqualified.

## Activation and drill evidence

Before serving, compare recovered roots/sizes with the **latest** independently
collected witness/mirror checkpoints and retained high-water/receipt evidence,
verify the public election export using shipped public verifiers, and restore the
retained server policy. The minimum backup is one lower bound; this offline tool
cannot discover reachable witnesses, missing WAL markers or newer receipts. It
does not complete the QV-07-REQ-045 online witness/WAL startup gate, validate every
protocol proof, qualify production RPO/RTO, or change the strict verifier
comparison release gate.

Record snapshot age, separate KEK provenance, minimum-history source, roots and
checkpoints before/after, verifier results, recovery time and activation decision.
Restore the newest candidate into an isolated directory; start the actual server
with retained policy and verify read/write operation. Then restore an older
candidate against the newer minimum: expect `BACKUP_ROLLBACK`, nonzero exit and no
destination. Delete only isolated drill copies afterward.

The automated drill uses the real restore executable, independently copied KEK,
actual HTTP restart/read/append, root/checkpoint preservation and stale/fork
refusals. It also verifies missing KEK is never regenerated and covers hostile
manifest/path/signature inputs and snapshot membership races:

```sh
node --test packages/server/test/offline-backup.test.ts packages/server/test/admin.test.ts
```

This is local Linux recovery evidence, not offsite custody, native cross-platform
qualification or independent professional security review. The change spans the
producer, verifier, recovery executable and regressions, exceeding the small-PR
size guideline; this document records its design and bounded claims.
