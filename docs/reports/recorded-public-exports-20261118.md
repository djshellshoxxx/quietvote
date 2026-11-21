# Recorded PUBLIC exports and ARCHIVED deletion — N-32(b)

## Scope and provenance

This implements the accepted N-32(b) slice from [QV-ADR-027](../decision-log.md) and the [decision register](../plan/DECISIONS-2026-11-04.md#n-32--stateparameter-gaps-challenged-max_total_hours-resume-new-close-ipv6-56-archive-export-ack). The historical source is PR #27, particularly `07fd61c`; the [residual review](consolidation-pr27-residuals-20261117.md#2-recorded-public-exports-and-acknowledgement-are-genuinely-missing) explains why its old migration and download-time acknowledgement could not be copied into the current implementation.

The implementation is based on PR #70's pinned-membership head `8b417c6c8b86a7a9a9454468bf16bec0baa8517b`. Election migration **11** is additive: migrations 1–10 keep their existing checksums. No control migration, cryptographic domain separator, signed public record, archive encoding, or vector expectation changes in this slice. The control migration reserved for the separate runtime-anchor work remains independent.

The implemented surface is the signed management API described in [QV-09 §10.1](../09-api-data-contracts.md#101-recorded-public-exports-and-archived-deletion). It adds a recorded PUBLIC snapshot, a separate acknowledgement and a separate deletion notice. Existing ad hoc public exports remain available. Operator/contact exports, recipient encryption and a new browser or CLI management flow are outside this slice.

## Exact snapshots and explicit acknowledgement

`POST /api/v1/elections/{id}/exports` accepts only `{kind:"public"}` and requires the existing QV-Sig authentication and idempotency key. Organization scope is checked before accessing recorded exports; instance administrators use their existing management authority. The request atomically reserves a job and its replay response through the current job/idempotency mechanism.

The job holds the election mutex and writes the snapshot and its metadata in one synchronous election-database transaction. `export_record` binds its job and export IDs to the exact QVB bytes, SHA-256 digest, byte length, tree size, root, creation time and download expiry. The bytes are stored, not reconstructed on later requests. New witness cosignatures, clock changes and restart therefore cannot change a previously recorded artifact. Only public data reaches this archive; the existing public bundle writer remains the format implementation.

Before delivery, acknowledgement, notice or destructive authorization, the server checks the stored length and SHA-256 and parses the strict archive framing. Its `bundle.json` must identify the same origin, tree size and root as the record. Damaged evidence cannot authorize deletion. A healthy replacement can supersede damaged earlier evidence without requiring deletion of the election or bypassing the gate.

Acknowledgement is a signed `POST` to the record's `acknowledgement_url`, with the exact `{tree_size,root_hash,sha256}`. Both hashes use lowercase 64-character hex. A mismatch is `422 EXPORT_BINDING_MISMATCH`; the record remains unacknowledged. Acknowledgement is the authorized caller's statement that it retained and checked this snapshot. It is not independent proof that an off-site copy exists. Metadata reads, full downloads, range requests and abandoned responses do not set it. Repeated calls preserve the first server-clock timestamp, enforced by the database as well as the route.

Downloads are authenticated, `no-store`, byte-range capable, and have a SHA-256 ETag. Generation consumes class X; retrieval and acknowledgement consume class M. A completed generation therefore does not require another X allowance to retrieve its result. Download URLs expire at exactly seven days; the explicit acknowledgement and notice metadata have separate persistence semantics.

## Deletion condition

For **ARCHIVED**, deletion requires a healthy recorded snapshot matching the current final tree size and root, plus either:

- An explicit acknowledgement whose first timestamp has elapsed; or
- A signed deletion notice for that same final snapshot, followed by **30 days**. The exact boundary is inclusive.

The deletion notice is an explicit authorized management action with the same exact artifact binding as acknowledgement. It is accepted only for an ARCHIVED election's final tree. Export creation, the age of an export, and download admission are not notices. A repeated notice keeps its first timestamp. The server records this notice; it does not claim to send email or establish third-party delivery.

Both organizer and administrator deletion routes preflight this condition before accepting destructive work. `ElectionPool.remove` repeats the lifecycle and artifact checks under the election mutex immediately before `markDeleted`. The current registry state and replayed log state must both remain deletable. Only then may the existing tombstone and wrapped-DEK removal commit, followed by resumable database/WAL/SHM cleanup.

An acknowledged snapshot from an earlier tree cannot authorize deletion of the final ARCHIVED tree. Direct pool calls cannot bypass the condition. Existing tombstone retries still complete interrupted file cleanup. DRAFT/CANCELLED/ABORTED/IMPORTED retain their previous deletion policy; reconciling the broader terminal-state wording of QV-28 §11.2 is a separate task. This implementation does not claim backup purging, SSD overwrite guarantees, or recall of exported copies.

## Recovery, capacity and upgrades

The durable snapshot is the completion receipt for its export job. If the election transaction commits but control-job completion fails, startup or an authorized job read verifies the existing snapshot and reconciles that exact job to `done`. The original export ID and bytes are retained. The job result and `export.create` audit commit together. An interrupted job with no committed snapshot stays failed; replaying its original idempotency key returns the original job rather than silently generating another artifact.

Acknowledgement and notice update the election-owned operation receipt in the same transaction as their first timestamp. The current response bridge recovers the audit and replay response after a lost control-cache completion. Migration 11 preserves historical operation receipts while allowing the two new audit actions. It creates empty export storage on pre-upgrade databases and fabricates no historical export, acknowledgement or notice.

Resource limits are explicit: at most **32 records** and **128 MiB** of recorded bytes per election, with a **32 MiB** source-size preflight before archive construction. New generation lazily prunes expired records, preserving a healthy current-tree acknowledged artifact or, if there is none, a healthy artifact with the earliest current-tree notice. An artifact retained for deletion evidence can outlive its seven-day download URL. A failed insertion rolls back pruning, preserving previously committed evidence. These are recorded-export limits; they do not change the ad hoc export path's existing behavior.

## Verification receipt

Local validation on Linux, Node **24.22.3**, completed on 2026-11-19. These results apply to this feature's final source before the broader consolidation is assembled; they are not Windows/macOS or combined-head qualification.

```sh
node --test --test-concurrency=1 --test-reporter=spec packages/server/test/recorded-exports.test.ts
```

Result: **9 passed, 0 failed, 0 skipped**, 20.9 seconds. Coverage includes authenticated organization boundaries, private-data canaries, exact bytes after cosigning/restart, idempotent creation, wrong hash/root/size, full/ranged/cancelled download behavior, first timestamp immutability, both deletion APIs and direct pool refusal, damaged evidence and healthy replacement, stale snapshots, explicit notice, exact grace/expiry boundaries, lost job completion, lost acknowledgement completion, bounded storage/pruning and a real schema-10 reconstruction upgraded to 11 with historical checksums and receipts preserved.

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/server/test/delete-authoritative-state.test.ts \
  packages/server/test/delete-recovery.test.ts \
  packages/server/test/registration-review.test.ts \
  packages/server/test/registration.test.ts \
  packages/server/test/backup-security-floor.test.ts \
  packages/server/test/supplemental-event-recovery.test.ts \
  packages/server/test/webhook-bridge-recovery.test.ts
```

Result: **38 passed, 0 failed, 0 skipped**, 60.1 seconds. Historical downgrade fixtures remove the new table when recreating their actual old schemas. The authoritative-state regression now verifies admin preflight rejection before a job is queued, retaining the existing checks that the file, live state and readable election survive refusal.

Local `npm run typecheck` was terminated with exit **137**, without a TypeScript diagnostic. It is **not** recorded as a pass. Typecheck and cross-platform/full-browser qualification remain gates for the assembled candidate. PR #70's earlier successful hosted run is baseline evidence only; it does not qualify these new files. The independent final review remains part of integration, and this report does not claim external audit or release approval.
