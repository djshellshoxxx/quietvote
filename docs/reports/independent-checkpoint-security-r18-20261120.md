# R18 independent checkpoint security source review

Date: 2026-11-20. Worker: `security_audit_r18`.

## Reviewed source and scope

- Published source: `995b31f804f5905f1df29f4f453ab3a404518dc0` (R17).
- Complete source tree: `79f4fa63e9094b61b6c370de0f225455ff507fd4`.
- Local equivalent: `e31825ee9f79d44e66d966f4aed68b811bc7a24b`, independently read in this worker's isolated worktree with the same tree.
- The exact remote helper, authored tests, R15 storage draft, board checkpoint/Merkle implementation, QV-JSON and Ed25519 implementation, private-file helpers and Windows native bridge were read. Local source was read again after the coordinator established the complete-tree equivalence.

This is a defensive source review, separate from the R18 code and bug workers. No vulnerability reproduction, intrusive probe or native security test was executed. The eight existing checkpoint-pin test groups were read, not counted as this worker's runtime evidence. Neither native Windows nor macOS ACL, process locking or crash durability has been qualified by this review. No production code, dependency, protocol vector or specification contract was changed by this worker.

The [checkpoint helper](../../packages/cli/src/checkpoint-pin.ts) is unconnected to CLI, server or browser callers in the reviewed source. Searching those source directories found its definitions and internal use only. Its result is a proposal, not a durable update or proof of the latest observation. The findings below therefore describe defects and limits of the unconnected helper; they do not demonstrate a persisted-state failure.

## Trust boundary

The assets are the independently selected election origin and log key, the previously trusted local observation, and an accurate statement of which verification has occurred. Candidate notes and consistency paths are externally supplied. A file's existence, pathname or self-described key does not authenticate the user's last observation.

The source correctly separates these concerns in several places:

- Anchors require a canonical QuietVote origin and a strict, 32-byte Ed25519 point. Stored origin and key must match those independent inputs.
- The record has exactly four fields, a fixed version marker and a 64 KiB ceiling. QV-JSON parsing rejects duplicate keys and invalid encodings; the helper also compares the canonical encoding with the supplied bytes.
- Sizes and roots come from the signed note, not redundant record fields. The note must match the independent origin and log signature; sizes above the helper's bound are refused.
- Positive-size growth requires a bounded, well-shaped path and existing RFC consistency verification. Rollback refuses; missing or corrupt previous bytes are not interpreted as an absent pin.
- Equal-size output deliberately keeps the prior complete signed note, including held cosignatures. Growth does not claim to preserve earlier witness evidence.
- `INITIAL` reports `NOT_CHECKED` consistency. The comments and [R15 storage draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md) explicitly withhold custody, freshness, authority, witness and durable-retention claims.

The parser produces ordinary null-prototype QV-JSON objects, so the reader's subsequent canonicalization operates on the validated value domain. Candidate serialization is caught and converted into a named refusal. These are source conclusions, not a general claim that all arbitrary JavaScript object behaviors are covered by the exported types.

## Findings requiring correction in the pure helper

### S18-1: unchanged output is not always an independent copy

The reviewed `UNCHANGED` branch calls the supplied byte object's `slice()` method. The accepted `Uint8Array` type includes Node `Buffer`, whose `slice()` creates a shared view. The project's [private-file reader](../../packages/cli/src/private-files.ts) returns a Buffer-backed `subarray`, and the Windows reader similarly returns decoded Buffer bytes. This makes the concern relevant to ordinary future file snapshots, even though the new helper currently has no caller integration.

Use a type-independent byte copy, such as constructing a new `Uint8Array` from the accepted snapshot. Preserve the prior note byte-for-byte. The authored test covers a plain `Uint8Array`; a normal Buffer-backed snapshot is a meaningful additional positive-path isolation case. The coordinator owns this repair and its verification.

### S18-2: zero-size checkpoint semantics need an explicit boundary

The [checkpoint parser](../../packages/board/src/checkpoint.ts) admits zero, while the pin helper checks only the upper size bound and signature. A signed zero-size note must also carry the specified empty-tree root. The existing [consistency verifier](../../packages/board/src/merkle.ts) handles `first === 0` before equal sizes and checks the old empty root in that branch; the helper cannot rely on that branch alone to establish its stated equal-root invariant.

Enforce the empty-tree root when verifying every zero-size candidate or stored note, and explicitly compare the roots in the helper's equal-size branch. This follows the existing [QV-18 requirements](../18-bulletin-board-transparency.md), REQ-002 and section 7.3, without introducing a new protocol rule. Valid empty initial, unchanged and subsequent growing checkpoints should retain their existing meanings. A broader board-verifier correction would require its own scoped review; this report does not attest that such a change has occurred.

## Windows diagnostic improvement, with unchanged protection

The [TypeScript native bridge](../../packages/cli/src/windows-private-files.ts) already has a finite diagnostic classification for synchronous helper failures. Its asynchronous `HeldStream.abort()` instead constructs a generic `UNAVAILABLE` error, including when invoked by the 15-second response deadline. This loses the distinction between startup, response decoding, process termination and an observed deadline.

A narrowly scoped reason-and-phase improvement can support the next native CI investigation:

1. Derive both values from closed, internal enumerations. Phase may distinguish service startup, reservation and ordinary operations; never copy arbitrary operation strings into diagnostics.
2. Preserve explicit native refusal codes and the first established failure. Do not replace an owner, ACL, identity or cleanup refusal with a generic process classification.
3. Retain no child error object, command path, argv, stdin, stdout, stderr, supplied pathname or private bytes. Existing stderr suppression remains in place.
4. Keep the deadline, reply bounds, queue ordering, stream termination, held-handle lifetime, native checks and cleanup requirements unchanged. Do not automatically retry an issued operation, especially a write whose publication status may be uncertain.
5. Label a deadline as an observed deadline. It alone does not establish whether native startup, scheduling, event-loop delay or another cause prevented completion.

The coordinator supplied the two R17 Windows CI failures as investigation context. This worker reviewed the corresponding source boundary but did not independently retrieve those logs or claim a root cause. The bug worker owns that evidence. Changes to the CLI bridge must preserve its required byte equality with the trustee copy; the [native PowerShell implementation](../../packages/cli/src/windows-private-files.ps1) need not change for diagnostic classification alone.

### Separate source review of scheduled R18 diagnostics

While this independent worker round was running, the scheduled continuation published `5485deb10d24ca0e64628746e954676a60919c50`. The coordinator materialized it as local equivalent `c1f413ce14cf750199fea019d6c11948e1ed8f8b`, tree `c3e04b91ff324addde7551a777f4a93c8906e817`. This worker read the local equivalent's exact diff from R17 and confirmed that tree ID. The scheduled continuation and this independent security worker are separate scopes despite their shared R18 label.

The scheduled production change passes the internal literal `TIMEOUT` to `abort()` when the existing deadline expires. It preserves the first-failure guard, 15-second deadline, queue and termination behavior; there is no native DACL, owner, identity, filesystem, retry or reply-bound change. The CLI and trustee bridge copies are byte-identical at that source, checked by comparing their Git blob contents.

The server test adds finite `voter-key` and `invite` fixture labels. Its wrapper exposes only the sanitized native error's finite code/diagnostic and retains that sanitized error as the cause; it does not retain the underlying child-process error or fixture input. This is a suitable diagnostic-only change under the source boundary reviewed here. It does not add full native operation-phase attribution, identify the timeout's underlying cause, or establish native runtime success. The checkpoint helper is unchanged in that scheduled commit, so S18-1 and S18-2 remain findings against its reviewed source.

## Durable storage remains an open feature

The current native helpers are useful foundations, but none supplies the complete transaction contract in the draft:

| Obligation | Reviewed state / required next evidence |
|---|---|
| Origin and key binding | A pair-derived filename alone cannot enforce the draft's same-origin key-conflict rule. A reviewed origin-scoped binding and coordination mechanism is needed before interpreting a different key's absent file as first use. |
| Namespace custody | [POSIX staging](../../packages/cli/src/posix-staging.ts) explicitly assumes owner/mode/sticky permissions and does not inspect native ACL grants. Its scope must not be widened by calling it a durable pin provider. |
| Cross-process transaction | No stable kernel-held exclusive pin lock is supplied. The current in-process native service queue does not serialize separate CLI processes or protect a complete read/proof/write transaction. |
| Latest-state comparison | A future provider must obtain and re-read the latest trusted observation while holding the lock; a proof based on an earlier snapshot cannot authorize a later write. |
| File and directory durability | POSIX private-file publication treats directory fsync as best effort. Windows uses a protected DACL, held identity, native rename and `Flush(true)` on the file, but this is not evidence of the required durable directory transaction. |
| Ambiguous publication | An unsuccessful barrier after publication needs an explicit `AMBIGUOUS_COMMIT` result and authenticated reread. Generic failure or a successful pure proposal cannot establish whether a durable advance occurred. |
| Absence and recovery | Denied, corrupt, removed and uncertain state must not silently reset prior trust. Crash cleanup must preserve newer authenticated state and use identity-bound recovery. |
| Platform qualification | Actual supported Windows Node 22/24, macOS and Linux custody/locking/durability evidence remains required. Source review and ordinary Linux tests cannot supply it. |

The origin/key issue is a design obligation already implied by the draft, not a demonstrated defect in a shipped storage implementation. No provider has been adopted by this report. In particular, adding a stateful `--pin-state` flag around the current private-file writer would not complete REQ-026.

## Recommended next slice and fresh-worker handoff

Complete and verify the two pure-helper corrections first. A diagnostic-only native bridge repair is also a bounded improvement while the existing Windows CI failure is investigated. Both can be reviewed without choosing a weaker storage provider or inventing a new authentication policy.

The fresh security worker should inspect the actual integrated diff and complete source tree, confirm the copy and zero-root rules, review finite diagnostic values and both bridge copies, and distinguish newly observed native results from previous passing jobs. Check that no CLI persistence connection, retry, deadline increase, ACL relaxation, storage reset or new assurance language appeared during integration.

Only a separately reviewed custody provider, origin-scoped key binding, lock protocol, strict publication outcome and platform evidence can move durable retention toward completion. Formal appointed reviewer approval, main-branch promotion and historical DCO decisions remain separate gates; this worker supplies none of those approvals.

## Verification performed by this worker

- Exact-ref remote source reads and local equivalent commit/tree inspection.
- Local search of CLI, server and web source for helper integration.
- Defensive source inspection of signed-note, QV-JSON, strict-key, consistency and private-file dependencies.
- Separate review of scheduled R18 diagnostics at `c1f413ce14cf750199fea019d6c11948e1ed8f8b`; byte comparison of both native bridge copies.
- Report-only change; no production execution, exploit reproduction, native probe or new test result claimed.

Refs: QV-18-REQ-002, QV-18-REQ-026, QV-30-REQ-018, QV-30-REQ-019.
