# QuietVote R15 checkpoint — November 20, 2026

## Actual work from live PR #71

Read the durable R13/R14 checkpoint, QV-18-REQ-026, the current receipt-proof code and existing native private-file custody providers. At the start of this increment the branch was 5cead2124cf189d994f2e7637d598294609ca65a (tree 98a21573426de26f576df58dc90d5036b6030ed0); main was 019f4e789be2ff38a5fb2d348c3b225cc87cf296. PR #73 remained merged/closed. The current-source CI, claims and visual workflows 44787380193 / 44787380201 / 44787380171 were still queued, with one CI macOS server/web job running. The 46ede0a predecessor workflows had concluded CANCELLED, not passed.

## Bounded source increment

packages/cli/src/checkpoint-pin.ts adds a **pure, unconnected** record validator and monotonic transition proposal. It independently verifies signed origin/key bound checkpoint notes, bounds/parses the strict record, refuses rollback/equal-size fork, requires RFC 9162 consistency for growth and retains old evidence on same-head repetition. A proposal is *not* storage or a successful persisted pin. packages/cli/test/checkpoint-pin.test.ts authors five focused groups, including a real Merkle consistency path and cross-election/key refusal. These are **authored tests, not claimed executed** until a source-bound run exists. The design contract is docs/rfcs/checkpoint-pin-storage-draft-r15-20261120.md.

The existing online receipt-check command, server, browser, dependencies and private-file writers are unchanged. Durable latest-observation tracking under QV-18 REQ-026 is still **OPEN**, including ACL/cross-process/crash semantics. Missing notes still mean INCOMPLETE. No release, main promotion, force update, stopped investigation or old untracked test was touched.

## Review lanes for the next fresh workers (not yet independent completed reports)

- Code audit: inspect the new parser and transition type/logic against QV-18, inspect the base tree and input bounds, run isolated TypeScript and package tests; require independent source-bound receipts.
- Functional bug hunt: execute real first/equal/1-to-2/multi-hash normal transitions; verify existing receipt-check still leaves files/network state alone; write counterexample tests only when genuine.
- Defensive source review: inspect origin/key substitution, fork/rollback, stale concurrent overwrite and corrupt-state handling; review supported native file/ACL provider without claiming POSIX mode bits cover macOS ACL grants.

Finish each independent review set before declaring completion or handing off another set. Isolated workspaces must resolve @quietvote/* packages from their own checkout, not shared node_modules aliases. Do not resume the previously stopped background-runtime/gossip investigation.

## Next accepted engineering boundary

The pure proposal must be integrated only behind a provider with trusted namespace+directory ACL checks, stable exclusive cross-process lock, descriptor-bound bounded read, atomic private staging, mandatory durable file/directory barriers and crash recovery. Perform the read / proof / re-read / commit inside the effective lock; no update based on an older successful check. If native custody cannot be proven, refuse and leave prior state intact. Document Windows/macOS normal and ACL fixture evidence separately.

Observe real CI outcomes and tested synthetic merge SHA/tree before qualification. Previous R13/R14 results remain source-specific. Main needs appointed formal security approval and owner decisions for historical DCO including 8f865fb and a5e5d19. No independent worker, native test, installed CLI storage feature or formal review is claimed by this handoff.

## Post-publication static boundary correction

A review of the pure result API found that the equal-size UNCHANGED proposal originally returned the caller's mutable Uint8Array object by reference. The proposal now returns a copy so later output mutations cannot corrupt an in-memory retained snapshot. An authored sixth test checks this input/output nonaliasing. No persistence integration or native test is implied. The draft explicitly limits witness-history retention: a larger signed head does not inherit earlier checkpoint cosignatures.
