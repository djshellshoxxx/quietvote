# @quietvote/board: implementation notes and spec choices

Where QV-18 is ambiguous or depends on QV-16 (not yet written), the safest reading was chosen.

1. **Header encoding is board-local.** QV-16 `enc` does not exist yet. `encodeHeader` is a canonical length-prefixed
   binary encoding (u16 version, u16-length strings, fixed 32/16-byte fields, u64 ints). The decoder rejects trailing
   bytes and re-encodes to prove canonicality. Swap in QV-16 `enc` later; leaf hashes will change (pre-release).
2. **KeyId** = SHA-256("QV-KEYID-v1" 0x00 alg 0x00 pk) (32 bytes). `body_digest` = SHA-256("qv/body/v1" 0x00 body).
   Signed message = "QV-ENTRY-v1" 0x00 || header-without-sig (covers origin and body_digest). Only `ed25519` authors are accepted.
3. **Author authorization is injected** (`resolveAuthorKey`), because keys live in the QV-16-encoded manifest/roll.
   The server fails closed without a resolver. `verifyLog` without a resolver returns at most PARTIAL and warns.
4. **Trust anchors are caller-supplied.** `verifyLog` prefers `opts.logPublicKey` / `opts.witnessPolicy`; bundle copies are
   used only with a "self-attested" warning. `manifestHash` (= manifest header `body_digest`) is reported and can be pinned.
5. **Phase grammar** is the lifecycle subset checkable without QV-16 (`grammarStep`): manifest only at seq 0; once-only
   types; ordering prerequisites; ballots only between open and close; `election_cancel`/`ceremony_abort` are terminal.
   Per-trustee cardinality and body validity are the protocol layer's job.
6. **Witness gating (§9.4)**: `election_open` needs a quorum-witnessed checkpoint with size in (seq(roll_commit), seq(open)];
   `election_close` needs one in [seq(close), seq(tally_aggregate)] (hard failure only if an aggregate exists);
   `tally_result` unwitnessed is a warning ("NOT WITNESSED"). Quorum 0 without `noneAcknowledged` is a failure.
   Waivers are recognised only through the caller-supplied `isWitnessWaiver` predicate (body is QV-16 encoded); waived gates
   become warnings. Unsupported cosignature algorithms (ML-DSA-44) never count toward quorum.
7. **Strict verification choices**: every bundle checkpoint must carry a valid log signature and match the recomputed
   prefix root (any failure is FAILED, not skipped); a checkpoint covering the full log must exist (no unauthenticated tail);
   two signed roots for one size is a fork; per-witness cosignature timestamps must be monotone; a body-less entry must be
   listed in `redactions`; receipts not honoured by the log are `broken_promise` failures.
8. **Consistency from size 0** is an empty proof with the empty-tree root (QV-18 §7.3); equal sizes need an empty proof and equal roots.
9. **Receipts** are deterministic (Ed25519), so `BoardLog` recomputes them from `sequenced_at`; no receipt table is needed.
10. **Bundle** is an in-memory object plus a JSON-object form (`bundleToJson`/`bundleFromJson`, strict). The deterministic
    tar container, `SHA256SUMS`, and `.ots` anchors belong to the CLI/server. Tree-head thinning policy is exporter-side.
11. **BoardStore is synchronous** so SQLite (`node:sqlite`) can wrap each call in one transaction. `appendEntry` must be
    atomic and gapless. `BoardLog` is single-writer; run one per election.
12. **Not implemented here** (server/network concerns): tlog-witness HTTP flow, rate limits, retention jobs, gossip transport,
    `witness_conflict` and `missing_consistency` evidence (needs transcripts); the `fork`, `inconsistent`, `broken_promise`
    checkers are in `equivocation.ts`. `created_at` skew is enforced at admission only (offline verifiers ignore it).

13. **Grammar vs protocol log (QV-ADR-015, QV-16 §5.15, QV-17 §tally).** The board required `roll_commit` before `election_open` and
    `tally_aggregate` before `tally_result`/`decryption_share`; the protocol log emits neither in those cases and every tallied log failed
    `QV_BOARD_GRAMMAR`. Spec reading: ADR-015 makes the manifest `roll.root` an alternative to `roll_commit` (static-roll mode; if both
    exist they must match, enforced by the protocol layer `E_ROLL`), and QV-16/QV-17 have verifiers and trustees recompute the aggregate
    (`tally_aggregate` "if present"). Board changed: `GrammarState.staticRoll` is set from the manifest body (JCS JSON `roll.root` is a string;
    anything unparsable means "not static", i.e. `roll_commit` stays required); `election_open` then does not need `roll_commit`
    (`joint_key` is still required); `decryption_share` and `tally_result` need `election_close` only; a `tally_aggregate` after
    `tally_result` is refused. Witness gates: `election_open` lower bound is `roll_commit` else `joint_key`; `election_close` is now a hard
    gate up to `tally_aggregate`, or up to `tally_result` when no aggregate exists. `grammarStep` has a third optional `body` argument.
    Server (not edited here) should pass nothing new: `BoardLog.append` supplies the body itself.

14. **Audit hardening (docs/audit/board-cli.md, 2026-10-21; AI-assisted, not independent).**
    - `BoardLog` (constructor and `selfAudit`) now also recomputes `H(0x00 || headerBytes)` for every stored entry and compares it with the stored
      leaf hash and `seq`; a mismatch quarantines the log (BC-06). Before, only the stored leaf hashes were re-hashed into the tree.
    - `attachCosignatures` accepts exactly one signature line per input string; strings with embedded newlines are skipped, so unauthenticated
      lines cannot be persisted next to a valid cosignature (BC-07).
    - `witnessStatus` counts one witness per distinct public key: a key listed under two names yields one valid cosignature (BC-08).
    - `checkBrokenPromise` and `verifyLog` are total on hostile receipts / a null bundle (return a Result / FAILED) (BC-09, BC-10).
    - Known property, not changed: `verifyInclusion` does not bind the claimed `size` beyond tree shape; size and root are bound by the signed
      checkpoint, so always verify against a checkpoint's (size, root) pair.
    Update after QV-ADR-015 landed in protocol: the protocol log now always emits a `roll-commit` and its `election-open` binds
    `(manifest_hash, joint_key_seq, roll_commit_seq)`. The static-roll waiver above stays accepted by the board (spec-permitted) but is
    unused by the protocol sim; `tally_aggregate` remains optional.

14. **Audit fixes (behaviour changes).**
    1. `importBundle` (REQ-033) now requires caller-trusted `logPublicKey`, `witnessPolicy` and `resolveAuthorKey` (missing => `QV_BOARD_BAD_BUNDLE` /
       `QV_BOARD_AUTHOR_UNRESOLVED`) and an integrity `VERIFIED` verdict. `PARTIAL` (e.g. redacted bodies) is refused unless `allowPartial: true`;
       `allowPartial` never waives the trust anchors. New type `ImportOptions extends VerifyOptions`. Callers that passed only a subset must pass all three.
    2. Phase gating in `grammarStep` (docs/18 §5.2/§5.4): S-phase types (`trustee_accept/decline`, `ceremony_start`, `dkg_*`, `key_confirm`, `joint_key`,
       `keycheck`, `roll_commit`) are refused after `election_open`; `ceremony_abort` only with `ceremony_start` seen and no `joint_key` (CEREMONY);
       `election_cancel` refused after `election_close` (SETUP incl. CEREMONY/SETUP_KEYED, READY, OPEN are allowed). `staticRoll`/optional `tally_aggregate` unchanged.
    3. `BoardLog.redact` only for `ballot`, `ballot_audit`, `dkg_*` bodies (docs/18 §11.1); other types return `QV_BOARD_GRAMMAR`. Previously redacting the
       manifest made replay see a null body, `staticRoll` false, and quarantine the log. `StoredEntry.staticRoll` (optional, manifest only) is persisted at
       append/import time and used on replay instead of re-deriving from the body; stores that do not persist it fall back to the body.
    4. `redact` returns `QV_BOARD_QUARANTINE` on a quarantined log and `QV_BOARD_READ_ONLY` on a read-only (imported) one.
    5. `BoardLog` load and `selfAudit` recompute `hashLeaf(headerBytes)` and the body digest/length instead of trusting stored leaf hashes; any mismatch
       quarantines (load) or returns false (audit). `MemoryBoardStore` copies entries/roots in and out (`getEntry`, `leafHashes`, `appendEntry`, checkpoints).
    6. `witnessStatus` counts distinct public keys: the same key listed under two witness names counts once (first valid line in note order wins).
    7. `attachCosignatures` splits multi-line elements, accepts one signature line per candidate, updates the "before" set as lines are accepted, so a
       witness is attached at most once per call and junk lines cannot ride along.
    8. `attachCosignatures` (online) rejects cosignatures with `ts > clock() + 300` (docs/18 §9.3), also for the returned `witnessed` flag.
    9. `BoardLog.append` converts a throwing `store.appendEntry` into `QV_BOARD_INTERNAL`; tree and grammar stay unchanged.
    10. `checkFork`, `checkInconsistent`, `checkBrokenPromise` are total: receipt numbers must be safe non-negative integers, any throw becomes an error Result.
    11. `MemoryBoardStore.putCheckpoint` compares full roots with `bytesEqual` and requires 32-byte roots.
    12. `isPow2` (merkle.ts, now exported for tests) uses exact arithmetic; `Math.log2(2**52+1)` rounds to 52.
    Not implemented on purpose: `broken_promise` second branch (F11) and origin base32-vs-hex spec wording (F13) are spec questions, left as is.
