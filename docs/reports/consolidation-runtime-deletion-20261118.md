# Runtime retirement during deletion

The fresh independent review reproduced a deletion/write ordering defect in the
assembled candidate. With a DRAFT election, a mutex barrier made deletion queue
first and a manifest append queue second. Both operations succeeded: deletion
tombstoned the registry and erased its wrapped key, then the queued append issued
an included receipt before eviction removed the underlying file.

The repair retires the cached handle inside the same deletion mutex, immediately
after the durable tombstone. Signing gates also consult the live registry; pool
acquisition cannot return a tombstoned cached runtime. Closing a handle poisons
only that in-memory instance before resource teardown and is idempotent. Ordinary
eviction does not persist quarantine, so a healthy reopened runtime still works.

`packages/server/test/delete-runtime-lifecycle.test.ts` preserves three deterministic
regressions: queued append after deletion, direct/duplicate signing and acquisition
after a tombstone, and closed-handle refusal with a successful normal reopen.
All three fail on the prior candidate `21f5c90` for the intended assertions or
closed-store access. They pass with the repair.

The combined local run passed **19/19** checks covering these regressions,
authoritative-state deletion, cleanup recovery, the acknowledged-archive rollback
case and runtime anchors. The keyless-import anchor regression also passes.
The full import suite and cross-platform qualification remain hosted CI gates.
This closes a runtime lifetime defect; it makes no guarantee about erasing every
copy of JavaScript key material from process memory.
