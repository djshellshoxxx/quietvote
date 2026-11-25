# Runtime rollback anchor recovery

This engineering change recovers the accepted local high-water portion of B2-07 and adds bounded acquisition through the existing public gossip protocol. It is a selective reconstruction of PR #27 commit `13b86c22f973aee91453090b2ec5bcff104e8804` against pinned-membership source `8b417c6c8b86a7a9a9454468bf16bec0baa8517b`. No original migration bytes are rewritten.

## Implemented boundary

Control migration **8** adds `runtime_anchor`, keyed by election ID and bound to its origin and log public key. It retains the greatest observed tree size/root and a persistent conflict bit. Smaller writes cannot lower it; an equal-size different root or changed log identity is an explicit conflict. The row survives election deletion with the registry tombstone. Imported keyless mirrors never create an own-key anchor.

The control database now uses SQLite `synchronous=FULL`. This is necessary because a control WAL using NORMAL could lose its last anchor after a power failure even though the election checkpoint had already been released. Both databases retain WAL and the existing checked migration mechanism.

An append commits its entry, checkpoint, event rows and recovery intent in the election database first. The runtime then commits the independent anchor before publishing any live event or returning a receipt. An anchor-write failure, including an uncertain failure after COMMIT, poisons the handle and returns `503 LOG_UNAVAILABLE`. The durable append and its intent remain for replay; retry must not append it again. Recovery advances the anchor before the durable event bridge is allowed to expose that history.

At reopen, the complete local tree must reproduce the anchor's prefix/root and key identity. A missing prefix or conflicting root quarantines the election while evidence reads remain available. The signing gate covers direct BoardLog operations, ordinary appends, duplicate receipt regeneration, and server-produced tally aggregates. The historical duplicate fast path cannot sign before startup checks. Quarantine stored in control metadata is retained when an election file is replaced. Admin clear cannot bypass a mismatched or conflicted independent anchor.

The private restore floor includes the anchor table, in addition to the existing complete-log prefix and private security-state checks. A disposable verification copy may initialize a migrated anchor, but that does not disguise the absence or lowering of the anchor in the original candidate snapshot.

## External acquisition and exact limitations

For reopened, public, owned elections with configured `gossipPeers`, startup queries each unique configured peer using the existing `/api/v1/gossip/checkpoints` contract. The existing HTTPS/DNS/IP pinning, public-address checks, no-redirect transport, response cap and log-signature authentication remain in force. Queries run in one parallel round bounded by `gossipTimeoutMs`, including a resolver or test transport that does not honor its own deadline. Late responses do not mutate election state.

Every configured peer must return authenticated own-log checkpoint evidence. Missing, invalid, oversized, failed or timed-out replies leave signing disabled with `503 LOG_UNAVAILABLE`; they do not fabricate equivocation. A later submission retries acquisition. A valid newer or inconsistent own-log head is persisted outside the election database and triggers quarantine. Peer metadata and unauthenticated notes never become a trusted floor.

Only elections freshly created by this process may publish their first entry without prior peer history. A reopened empty draft has no stored signed note that the existing gossip contract can query. When peers are configured it therefore remains read-only, rather than signing a new empty checkpoint to obtain permission to sign. Restoring a newer verified backup or supplying a future explicitly designed checkpoint-discovery contract is required in that case.

The following limits remain explicit:

- `witnesses` configuration supplies witness names and keys, but no checkpoint retrieval URLs or API contract. Separate witness-only polling is not implemented by inventing an endpoint. Witnesses that also expose the configured gossip contract can participate as peers.
- Link elections do not disclose their identity or signed notes to configured public gossip peers. They retain the local floor and independently supplied offline restore floor. Private authenticated peer discovery needs its own configuration/transport contract.
- A coherent rollback of every local file is detectable only if an independently retained backup floor or reachable peer holds newer signed history. Empty/stale peer sets cannot manufacture missing evidence.
- Requiring configured peers to answer makes their availability a condition for resumed signing. Evidence reads continue; startup does not silently downgrade to local-only signing when a configured peer fails.

## Regression evidence

Focused regression coverage exercises the real schema-7 to schema-8 upgrade and unchanged prior checksums; FULL durability; monotonic and same-size conflict behavior; single-election and whole-disk rollback; duplicate and direct signature refusal; failures before and after anchor COMMIT; exactly-once append/event recovery; invalid and unavailable peers; link privacy; pre-manifest rollback; imported mirrors; and private restore-floor retention.

Local source verification passed 20/20 board log tests; 32/32 existing gossip, private restore, supplemental-event and webhook recovery tests; and 37/37 expanded runtime-anchor, backup-security-floor and offline-backup tests. These groups overlap and are not presented as a combined unique-test count. After the final admin-clear guard change, the two gossip rollback/clear tests passed again. The consolidation candidate must repeat its own gates after composition; source-run results do not establish hosted qualification. Local full TypeScript checks were killed by the execution environment with exit 137 and no compiler diagnostics; that is not a typecheck pass.

No release, deployment, external review approval, or cryptographic security certification is supplied by this report.
