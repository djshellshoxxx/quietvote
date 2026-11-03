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
