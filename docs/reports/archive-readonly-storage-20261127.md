# Archive readers and explicit maintenance

Date: 2026-11-27 (America/Vancouver). Status: candidate implementation and local evidence; AI-assisted, unaudited.

## Accepted scope and source decision

[Server inventory task 9](inventory-20261111/server.tasks.md) requires actual SQLite read-only handles for ARCHIVED and
IMPORTED elections while retaining reads, export, SSE, deletion and retention. The underlying contract is
[QV-28-REQ-015 and QV-28 §13](../28-data-model-storage.md), with imported mirror behavior also specified in §12.
The isolated worktree started at `d38c55c3d6f0d8254967efea066cd282c4012553`. Its prerequisite `db.ts` came unchanged from
the separate migration-safety work (blob `e2f5f9890ad3a98c4ea2171c82ba40693e92e2ec`). That primitive validates identity,
schema version and prior checksums before persistent writes; read-only and non-migrating maintenance require current schema.

Previously, runtime construction always opened a writer. The board's read-only metadata prevented appends but did not make
the native SQLite connection read-only. Changing only that constructor would break durable replay, archive finalization,
export acknowledgements, late witness cosignatures, integrity evidence and privacy retention, all of which have accepted
writers after the public log stops accepting records.

## Implemented boundary

| Path | Access and retained behavior |
| --- | --- |
| Normal terminal load | Read-only probe of stored lifecycle/imported fields, then validated native reader; stale registry state cannot select an automatic terminal migration. |
| Clean terminal replay | Rebuild in-memory state and compare durable projections without rewriting the election database. |
| Interrupted recovery | Before publication to the pool, open an explicit non-migrating writer and reuse full replay; erase archive keys and persist projections before deleting completion intents. |
| Live archive | Complete existing durable work and receipt construction, then retire the writer once. A failed reader acquisition closes/invalidates the runtime for safe reload. |
| Terminal maintenance | Separate, named, synchronous writer; the normal reader remains the same native connection. No schema migration is enabled. |
| Import | Writable private staging, verification/publication under existing rules, then a read-only cached mirror. |
| Online backup | Independent current-schema reader stays open across the awaited native copy, including a concurrent live archive transition. |
| Receipt recovery and retention | Receipt enumeration is read-only; expiry deletion is an explicit retention operation. |

Maintenance covers recorded public exports, acknowledgements and deletion notices; permitted native witness updates;
gossip/quarantine evidence; identical pinned-roll retry journaling and invite revocation; invite/event/receipt retention.
Existing state, authentication, integrity, archive-export and independent rollback-floor gates remain in force.

A genuine trustee-signed spoil-share test against an imported incomplete election exposed an internal-error path after
native read-only access was enabled: the candidate without an imported guard returned HTTP 500. The narrow correction
returns the existing `409 STATE_CONFLICT` before any write. The same test confirms no share row is inserted, the reader is
unchanged, and the public tree is unchanged. Native-election validation, proof checks, schema grammar and rate policy are
unchanged. This is a local synthetic fixture, not a claim about a deployed instance.

## Verification

The new files contain 11 tests: four connection/maintenance unit tests, five archive/import/backup lifetime tests, and two
real-HTTP maintenance tests. Their distinguishing checks include direct SQL write refusal during and after maintenance,
reader identity, maintenance rollback/cleanup, unchanged actual DB bytes and inherited WAL bytes on clean reads, interrupted
acknowledgement bridging, failed witness-event atomicity, explicit lazy event purge, deletion, and the incomplete import.

Focused runs used Node 24.22.3 with an independent `npm ci --ignore-scripts` and verified vendored dependencies:

- Boundary and recovery group: 22/22 passed, including both archive key-erasure crash points and a second crash while
  recovering lifecycle projections. This run preceded the additional reader-acquisition failure regression.
- New maintenance plus existing recorded-export checks: 11/11 passed. The two existing archived snapshot-corruption
  injections now request an explicit writer; every original damage, binding, acknowledgement and deletion assertion remains.
- Existing admin, gossip, runtime-anchor, archive rollback/delete, retention-health and backup-streaming checks: 36/36 passed.
- Final archive file: 5/5 passed, checking failure invalidation as well as the earlier native/import/backup cases.
  Scoped strict TypeScript passed for all new files and the adjusted recorded-export test; vendor and link checks passed.

There are 68 distinct tests across these groups; repeated cases are not additional independent coverage. The final
failure-path change closes the runtime only if retirement throws. Integration with the separately evolving migration
guards and the full server suite remains the integrator's verification step.

## Limits and explicit next work

Historical terminal schemas fail closed before persistent mutation. This reader slice does not provide a historical
compatibility reader. The separately completed [explicit archive command](archive-migration-20261127.md) implements
QV-28 §13's verified private copy and atomic replacement. Normal terminal reads remain outside that upgrade path.

Read-only SQLite can create locking side files and retain existing committed WAL frames; the byte-preservation test
compares actual DB and WAL contents rather than demanding side-file absence. The tests are local Linux evidence, not
Windows/macOS CI. Rebuilding a keyless `BoardLog` for rare terminal checkpoint maintenance reuses the established verifier
and may cost linear work in log size. Maintenance is an internal caller discipline, not a JavaScript sandbox or protection
against an operator who directly opens the underlying file. No public protocol, wire format, schema SQL, authority,
cryptographic acceptance policy, deadline, concurrency policy or retry policy was changed.
