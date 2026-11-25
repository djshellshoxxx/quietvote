# QuietVote R16 incremental custody-boundary checkpoint — 2026-11-20

## Source and exact scope

Started from draft PR #71 head `4c1b0558283d22eb8c6873460ff2e6a594a5ce5f`, complete tree `38ac43bd2f972ec90019b5edbf2bbc1f78bbb09d`; main was `019f4e789be2ff38a5fb2d348c3b225cc87cf296`. Read R15 handoff/specification, the pure pin implementation and six authored test groups, QV-JSON parser, signed-checkpoint parser, CLI private-file/namespace code, server lock and receipt proof. No native Git fetch or network shell was used. Preserve concurrent ownership and confirm the live head before any further ref update.

The pure record reader previously accepted alternate noncanonical byte spellings after strict JSON parsing; unlike the draft storage format, its equality check covered field semantics rather than canonical file bytes. It now refuses a byte sequence unless it equals `jcs(parsedRecord)`, while preserving the original authenticated record on refusal. A new authored regression covers valid but noncanonical whitespace and confirms no transition from it. This is an **author-written test, not a recorded execution**.

The candidate note path could also reach `jcs(next)` with auxiliary signature-line text that the checkpoint parser allows but canonical QV-JSON cannot serialize; unhandled exceptions would violate the Result contract. Serialization now returns a named `QV_BOARD_BAD_CHECKPOINT` refusal. The note's UTF-16-length precheck avoids constructing an oversized UTF-8 buffer for a clearly oversized input. These are source-derived defensive corrections only; no security exploitation or intrusive testing was performed.

The patch is confined to `packages/cli/src/checkpoint-pin.ts`, `packages/cli/test/checkpoint-pin.test.ts` and this handoff. It does **not** connect the CLI, read/write files, mutate a board, persist a pin, provide source-specific test qualification, or claim newest/freshest observations.

## Storage boundary / reviews still required

- **Code audit worker (fresh, separate):** inspect canonical file semantics, both named refusal paths, return-byte ownership, QV-18 bounds and independently run isolated package TypeScript/test groups from this exact tree.
- **Functional worker (fresh, separate):** execute normal INITIAL, UNCHANGED, verified growth and multi-hash growth; then confirm stale/corrupt/noncanonical data is preserved and receipt-check is unchanged, with original test assertions intact.
- **Defensive source worker (fresh, separate):** check origin/log key substitution, record corruption, signed note representability, stale-success concurrency, ACL/namespace trust and crash barriers. Defensive/benign review only.

**No independent worker is claimed dispatched or completed here.** Finish a genuine complete three-lane set with source-bound test receipts before any fresh handoff set. Keep isolated `@quietvote/*` resolution inside each checkout; shared `node_modules` aliases may point outside it.

The current `private-files.ts` has a best-effort directory-fsync catch and no cross-process lock for this use. POSIX `posix-staging.ts` explicitly cannot establish effective native ACL grants; server `data-lock.ts` directory locking is not a reviewed kernel-held checkpoint custody protocol. Windows private-file helper is not an integrated durable pin writer or qualified cross-process lock. None satisfies the strict owner+ACL, stable cross-process exclusive custody, re-read/proof-at-current-head, atomic publication, mandatory file/directory durability and crash-recovery contract. **Do not wire `--pin-state` or claim completed QV-18 REQ-026** before those capabilities and native Windows/macOS/Linux ACL, process and crash fixtures exist. Refuse uncertain custody and preserve older trusted state; never overwrite newer retained observations with stale successful checks.

## Hosted qualification and governance

At the R16 pre-write inspection, R15-source runs [CI 44791956917](https://github.com/djshellshoxxx/quietvote/actions/runs/44791956917), [claims 44791956905](https://github.com/djshellshoxxx/quietvote/actions/runs/44791956905) and [visual 44791957280](https://github.com/djshellshoxxx/quietvote/actions/runs/44791957280) remained `queued`, not passing. The R15 synthetic PR merge commit `2c76b40906b93e4136c48f5d2bee3f17e89f7b38` had parents main `019f4e7` and head `4c1b055`, with tree exactly `38ac43bd2f972ec90019b5edbf2bbc1f78bbb09d`; this identifies merge source, **not run results**. Any new R16 checks must be qualified against their own actual tested tree.

No main merge, release, deploy, forced ref update, historical DCO signature, reopened paused investigation, original-branch change, comments or new PR. Still blocked: designated security reviewer/formal approvals, owner historical DCO decisions (including `8f865fb` and `a5e5d19`), ratification/governance, membership, challenges/FINAL, authenticated freshness, witness/authority policy and native ACL/freshness contracts. See `docs/audits/UNFINISHED_WORK.md` and R15 for the rest.

## Next action

Verify new ref/commit/tree/authorship and actual CI synthetic merge source; independently test the focused new parser behavior with real isolated packages. Then implement only a native-supported fail-closed custody provider with exclusive lock, re-read and verified consistency relative to retained latest, atomic sync/recovery, before connecting any CLI stateful feature. If only external gates/queued checks remain, record them without repeated polling or artificial features.
