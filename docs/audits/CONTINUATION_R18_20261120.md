# QuietVote R18 — bounded Windows native-helper diagnostic follow-up — 2026-11-20

## Exact source and CI evidence

Starting from R17 draft PR #71 head `995b31f804f5905f1df29f4f453ab3a404518dc0`, complete tree `79f4fa63e9094b61b6c370de0f225455ff507fd4`, main `019f4e789be2ff38a5fb2d348c3b225cc87cf296`. Re-read the published R18 commit and tree to establish its actual identity. No native fetch or denied shell-network operation was used.

R17 [full CI](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888) **completed FAILURE**, with **25/27** jobs successful. Only server+web Windows 2025, Node 22 job `136561521896` and Node 24 job `136561521857`, failed. Both fail exactly `packages/server/test/registration-review.test.ts:152`, `review: shipped CLI enrollment rejects forged success and sanitizes extra response data`: async `HeldStream.send` reached its existing **15,000-ms native request deadline** and `HeldStream.abort` reported `WindowsPrivateFileError` code `UNAVAILABLE`, diagnostic undefined. Neither log proves native helper startup cost, compilation cost, permission refusal, test process contention or a cleanup race. The same test's adjacent validation fixture passed on both Windows jobs. R17 [claims](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131414) and [visual](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131331) completed success; R17's other 25 CI jobs were successful. Existing R17 pure checkpoint-pin guards have hosted CLI+board execution, but remain **unconnected to persistence**.

## Narrow source change and qualification boundary

The Windows native service's asynchronous deadline previously used `abort()`, losing the available `TIMEOUT` diagnostic even though the synchronous API classifies deadlines. Change the deadline callback to `abort('TIMEOUT')` and preserve the `UNAVAILABLE` code and every fail-closed abort/kill, stream cleanup, no-retry behavior and **unchanged 15-second timeout**. Apply the same byte-identical change to the CLI and trustee mirror copies. This is a bounded error-classification correction only; it does not cure the underlying delay or relax native owner/DACL, identity, path, size or custody rules.

The existing server enrollment acceptance test gets a private-fixture phase wrapper around only its two legitimate native fixture writes, using bounded phase names `voter-key` and `invite` and the already-sanitized native `code/diagnostic`. It does not print a file path, file contents, invite value or seed. Original assertions, acceptance conditions, timeout thresholds and external test behavior remain unchanged. This must not be described as an independently executed new test group or a confirmed fix for CI.

## Next genuine workers and checks

1. **Independent code audit:** check both native mirrors and test-only wrapper for exact parity, TIMEOUT vs PROCESS semantics, promise settling and no accidental retry; record tested commit/tree and isolated package resolution.
2. **Independent functional bug hunt:** on Windows Node 22 and 24, run the exact `registration-review` file and a focused native-service smoke with timing of service handshake versus authenticated write, under idle and normal CI contention. Record actual phase and duration without logging private input. Reproduce enough to distinguish cold PowerShell Add-Type, process scheduling, native ACL I/O and cleanup. Preserve 15,000 ms deadline unless objective evidence supports a separately reviewed change.
3. **Independent defensive source review:** validate no path/secret leakage, owner/DACL and same-handle validation, fail-closed semantics, and the fact this helper is **not** a QV-18 REQ-026 checkpoint-storage custody provider.

No genuine separate workers were dispatched or independently accepted in this connector-only publication; authored changes require real execution and designated reviewer approval. A hosted rerun is CI, not three reviewers. Avoid repeating unchanged broad suites without a concrete reason. R17 failed CI and any subsequent fresh checks are source-specific and must never be conflated.

## Unfinished QV-18 REQ-026 and formal gates

The pure signed checkpoint pin helper and manual receipt checker do not persist latest-per-origin state. Native owner/ACL namespace custody, stable kernel-held cross-process locks, locked newest-state re-proof, private atomic file-and-directory durability and crash-safe ambiguous-commit recovery remain open on Windows, macOS and Linux. Do not connect a stateful CLI, replace newer trusted evidence, advance on missing/invalid proof or claim freshness, witness, authority or FINAL guarantees. Keep open the appointed security review, provenance/DCO owner decisions including `8f865fb`/`a5e5d19`, governance, membership, challenge and ratification gates. Preserve main, original source branches, paused background/gossip investigation, releases and deployments. No force ref or comments.
