# QuietVote backup hashing milestone — 2026-11-16

Base: PR #51 code and evidence at `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Branch: `codex/qv-teams-backup-hash`.

## Completed

The online backup producer previously loaded every SQLite snapshot into a single
Buffer to compute its manifest checksum. Snapshot size therefore dictated peak
allocation and could prevent large instances from producing backups.

`packages/server/src/admin.ts` now streams the checksum in 64 KiB chunks. The
producer awaits the digest before recording a file in the manifest. Stream errors
close the descriptor and reach the existing failed-backup cleanup path. Iteration
yields between chunks; snapshot format, SHA-256 bytes and authorization are unchanged.

`packages/server/test/backup-streaming.test.ts` executes the real producer against
a SQLite snapshot larger than 1 MiB while refusing whole-file snapshot reads. It
checks each manifest digest independently. A second regression injects a read
failure after opening the snapshot and checks closure, partial-directory removal,
and absence of a successful backup timestamp/audit record.

## Validation

- Both new regressions fail against the original `5566c88` producer and pass
  against this change. No existing assertion changed.
- `NODE_OPTIONS=--max-old-space-size=512 npm run typecheck`: pass.
- `node --test --test-concurrency=1 packages/server/test/backup-streaming.test.ts packages/server/test/admin.test.ts`:
  9 passed, 0 failed, 0 skipped on Linux / Node 24.22.1.
- No whole-project, hosted CI or native Windows/macOS qualification claimed.

## Recovery review handoff

The same review reproduced a separate minimum-history defect: restoring an older
snapshot against a newer floor with a revoked organization key succeeds and makes
that credential active again when the public tree has not grown. The integrator
is implementing private security-state floor comparisons in a separate lane.
This checksum change does not repair that defect and must not be presented as
complete recovery qualification.

Other private high-water records requiring comparison include terminal invitations,
erased contact/label fields, disabled/deleted webhooks, unexpired replay and
idempotency records, and suspended/deleted organizations. Private floor metadata
must not appear in CLI JSON reports. Latest independent witness/WAL activation,
offsite encryption/transport/retention and native restore qualification remain
outside this hashing milestone.

Next reviewer: examine the async stream error/cleanup path and run the two focused
regressions on the integrated candidate. Reuse the recorded test evidence unless
integration changes the producer or its dependencies.
