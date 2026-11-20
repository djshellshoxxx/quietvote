# QV-18 REQ-026: durable per-origin checkpoint pin — R15 design boundary (draft)

Status: **draft implementation boundary; NOT a deployed retention or freshest-state feature**.
Source: docs/18-bulletin-board-transparency.md sections 4.3, 7, 9.5 and 14; QV-18-REQ-026.
Predecessor: docs/audits/CONTINUATION_R13_R14_20261120.md.

## Trust and format

A client independently pins the election identity (the canonical quietvote/v1/<32-hex-id> origin) and the exact Ed25519 log public key. These are **inputs** from verified election context or an operator pin, never learned solely from a fetched checkpoint, advertised server head, local JSON, URL or read key. Server URLs and mirrors do not define distinct logs: a different key for the same origin is a conflict requiring explicit operator resolution, not a silent new namespace.

The strict initial local record is bounded to **64 KiB** of canonical QV-JSON with exactly four fields:

- format: qv-checkpoint-pin/v1
- origin: independently expected election origin
- log_key: lower-case hex of independently expected 32-byte log public key
- checkpoint_note: full original C2SP signed note

Tree size and root are derived solely from the verified signed note, not separately trusted JSON values. Reject unknown fields, wrong origin/key, invalid signatures, missing notes, invalid sizes, malformed/oversized content. The log signature proves signed checkpoint content; it does **not** prove the file is the latest local observation or that wall-clock freshness, witness quorum, authority or counting is assured.

The pure implementation in packages/cli/src/checkpoint-pin.ts accepts only an externally supplied candidate signed note and an optional previously retained complete record. It proposes INITIAL, UNCHANGED or ADVANCED bytes; **it performs no filesystem access, network request or durable write**. A previously missing record may be treated as initial only after the storage layer proves its absence. An existing record is always authenticated again under independent anchors.

## Monotonic transition

At a locked snapshot, a smaller signed size is REFUSED_ROLLBACK; equal sizes require identical signed roots and retain the old bytes/cosignatures; different equal-size roots are REFUSED_FORK. Growth is impossible without an exact old/new RFC 9162 consistency path: a missing/malformed/invalid proof is REFUSED_CONSISTENCY and preserves the old record. Candidate proofs/notes cannot be obtained from an unsigned advertisement alone. A missing optional signed checkpoint remains INCOMPLETE without advancement. An included receipt from an older successful check must not overwrite the newer pin.

The production command's already-implemented **supplied-receipt** consistency does not satisfy this durability rule: on every stateful check the client must re-read the newest locally retained pin under the lock, obtain and verify a proof relative to **that** head, and condition its eventual write on that latest checked snapshot. A proof calculated against an earlier in-memory snapshot cannot authorize an update after another process advances the record.

## Required custody provider before command integration

1. Derive a collision-resistant deterministic path under a per-user private, trusted namespace from the pair (canonical origin, independently expected log-key bytes); do not permit path input derived from a server response. Define same-origin/key-transition behavior and recoverability explicitly.
2. Acquire a kernel-enforced **exclusive cross-process** lock on a stable trusted directory/inode, before reading the current pin and until publication and sync complete. A lock timeout/error must refuse; a stale path must not be blindly removed using a timer. Protect the namespace against symlinks, hardlinks, owner swaps and writable/ACL-authorized ancestors.
3. Read a bounded owner-private regular file through a verified descriptor. Distinguish genuinely absent, corrupted, denied access and uncertain I/O. The latter three do not initialize empty state. Do not automatically reset a corrupt or inaccessible pin.
4. After verifying the candidate under independent anchors and obtaining any required exact-size consistency proof, recheck current state **under the same lock**; require a new comparison if it changed. Write to a private same-filesystem staging file, verify held identity and restrictive effective permissions, flush content, atomically rename, then require directory fsync (or provider-equivalent durable commit). A failed durability barrier reports AMBIGUOUS_COMMIT and requires re-reading; it must not claim success.
5. After crash, parse and authenticate the published complete record. Recover abandoned staging/locks **only** using explicit identity-bound recovery with no automatic stale-lock deletion; never replace or erase a newer authenticated head. Store complete evidence without a downgrade from missing witness cosignatures. Preserve any externally saved receipt.
6. Windows owner/DACL checks require supported native handle-identity and lock tests. On POSIX, mode/sticky checks alone are **not** an ACL custody guarantee (notably macOS). Require a reviewed native ACL/namespace provider or fail closed on unsupported filesystems. Existing private-files.ts and posix-staging.ts are useful foundations, but their current directory-fsync best-effort and ACL boundary do not establish this contract.

## Observable outcomes and acceptance

Expose an explicit distinction between INITIAL_UNANCHORED, UNCHANGED, ADVANCED, INCOMPLETE, REFUSED_ROLLBACK, REFUSED_FORK, REFUSED_CONSISTENCY, REFUSED_CUSTODY, REFUSED_CORRUPT and AMBIGUOUS_COMMIT. Each failure must leave the prior trusted observation recoverable or explicitly report an uncertain publication; none claims authenticated freshness, witness policy or FINAL status. A missing or deleted pin is not evidence there was never a prior observation.

Required tests: deterministic signed initial/equal/growing cases with real RFC consistency proof; adversarial equal-size fork, stale success, key/origin substitution, corrupt/oversize/unknown record, unsigned claimed head, missing note and bad path; separate two-process lock interleavings (old successful worker loses to newer); crash before temp sync, after temp sync, before/after rename and during directory barrier; native Windows Node 22/24 and macOS/Linux ACL namespace fixtures. Keep actual native results distinct from source review or author-designed tests.

## Explicit open gates

No native ACL-capable provider, stable kernel lock/custody contract or strict crash-durability evidence has been accepted here. The spec does not adopt network freshness/renewal, origin key rotation governance, witness policy, server authority, browser IndexedDB equivalence or deletion recovery. Wire neither --pin-state nor automatic updates into online receipt-check until the custody layer and independent runtime tests establish those conditions.
