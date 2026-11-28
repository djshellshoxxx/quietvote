# Larger Merkle and serialized append acceptance

Date: 2026-11-27 (America/Vancouver). Base: PR #78,
`c110e06bc584e642e9130a82f7a16493ad8b12e3`.
Experimental. Tests and documentation only; no production behavior, protocol
vector, trust anchor, receipt policy or assurance label changes.

## Plan and result

[Board/verifier inventory tasks 4 and 5](inventory-20261111/board-verifiers.tasks.md)
identified two bounded gaps: the Merkle reference checks stopped at 200 leaves,
and the board had only a small injected-store-failure fixture rather than a
1,000-request append workload. Both acceptance slices are now implemented and
passing. No production defect appeared in the exercised contracts.

The plan was to retain all existing small-tree checks, extend independent
reference evidence through 1,025 without generating every larger size pair,
then exercise the public synchronous append API with deterministically
interleaved callers, duplicates and an atomic storage exception. The actual
store/sequence contract determined the concurrency and failure model.

The governing source is the bulletin-board specification's
[QV-18-REQ-002/004/005](../18-bulletin-board-transparency.md), not the unrelated
federated-governance document that shares the QV-18 number. These finite tests
support those requirements; they do not establish the complete database
transaction/crash acceptance of REQ-005 or independent cryptographic assurance.

## Merkle checks

The existing roots, sampled inclusion checks and all consistency verification
pairs through size 200 remain unchanged. The new immutable-range reference
uses `node:crypto` SHA-256 directly; it calls no production Merkle or hash helper.
It memoizes every requested subtree range to avoid repeatedly hashing the same
leaves for thousands of proofs. Its partition calculation is limited to the
fixture's exact integer sizes through 1,025.

The reference is anchored against the existing eight CT roots and compared with
the existing uncached recursive implementation at the larger boundary roots
and selected inclusion/consistency paths. The production tree is compared with
that independently computed reference as follows:

| Check | Coverage |
|---|---|
| Growing roots | Every size 1 through 1,025 immediately after append; append return values must be the expected zero-based indices. |
| Historical roots | Every prefix 1 through 1,025 after the tree has reached its final size; empty-root handling is also checked. |
| Inclusion paths | 11,083 additional paths over every prefix 201 through 1,025. Non-boundary prefixes sample the start, end, middle and partition-adjacent positions. |
| Consistency paths | 11,908 additional pairs over every larger prefix, including empty/equal trees, preceding size, midpoint and partition-adjacent old sizes. |
| Exhaustive larger boundaries | All inclusion positions and all old consistency sizes at 255, 256, 257, 511, 512, 513, 1,023, 1,024 and 1,025. |
| Negative paths | Selected final-size inclusion and consistency proofs reject a one-bit corruption; the existing malformed-proof and random corruption checks remain. |

Every selected proof must equal the reference byte for byte and verify against
the independently computed root(s). The larger pair space is sampled as stated;
this is not an exhaustive comparison of every pair through 1,025 or every
possible tree size. Frozen vectors remain unchanged.

## Append workload and failure behavior

`BoardLog.append` is synchronous and the production contract is one sequencer
per election. The fixture starts 1,000 pending async callers, releases them in a
deterministic shuffled order in batches, and yields between batches. Duplicate
requests from earlier batches run between newly released submissions; an
assertion requires that this interleaving actually occurs. This is serialized
public-API acceptance, not parallel OS writers or multiple `BoardLog` writers.

Five setup entries establish the board's open phase. The 1,000 ballot-type
entries use genuine signed headers, eight registered deterministic author keys,
distinct nonces and the normal resolver; the signature escape hatch is not
used. Bodies are board-layer test payloads, not QV-16 proved/encrypted ballots.

The store throws once, before committing the entry offered at sequence 512.
That call must return `QV_BOARD_INTERNAL` and leave tree size/root, stored leaf
hashes, checkpoint and nonce index unchanged. No receipt or entry may appear at
the rejected sequence. The other callers continue; the failed entry is retried
with identical bytes after their initial submissions finish.

The resulting 1,005 committed entries, including setup, have exactly sequences
0 through 1,004. The fixture verifies every stored header/body/leaf and nonce
lookup, every signed promise, and every root captured after a committed append
against the independent reference. It also checks 35 interleaved duplicate
responses, the final signed checkpoint, its consistency with the setup
checkpoint, and inclusion receipts at boundary positions. A replacement
sequencer reconstructs the same root from the store, passes `selfAudit`, and
recognizes a duplicate without adding another entry.

A separate fixture fails persistence of `election_close`. An intervening ballot
must still be admissible at the unchanged next sequence, proving the failed
close did not advance the grammar. The exact close bytes then succeed once;
later new ballots are rejected by the existing phase rule. Replay and duplicate
close handling preserve the resulting eight-entry tree.

The injected store obeys its existing atomic contract by failing before commit.
These checks do not test a store that violates that contract, a power loss,
`kill -9`, fsync, SQLite transaction rollback, multi-process contention,
server HTTP admission, witness quorum, tally correctness or receipt freshness.
No such claims follow from the in-memory replay.

## Validation and source binding

All runs used Node 24.22.3 with the pinned two crypto packages and all 132
verbatim vendor files verified. The injected clock, request ordering and keys
are deterministic; the added cases use no sleeps or coverage instrumentation.

| Validation | Result |
|---|---|
| Focused Merkle and append files | 14 passed, 0 failed, 0 skipped; 10.554 seconds. |
| Strict board TypeScript project | Exit 0, including the new tests/reference helper and imported source. |
| Full board suite, one sequential test job | 82 passed, 0 failed, 0 skipped; 55.578 seconds. |

The full run used `node --test --test-concurrency=1 --test-reporter=spec
'test/**/*.test.ts'` from `packages/board`. This local scheduling choice does not
change a package script or CI concurrency policy. No broader workspace suite,
hosted Node 22/native-platform run or formal audit is claimed by this receipt.

| Source | Exact Git blob |
|---|---|
| New append acceptance test | `b916c3b969d234ffc530be8ded98701564cb3bf7` |
| Extended Merkle test | `15fd2e0e1fb4cab151a912c5cd61fe173f5ccb8e` |
| New independent reference helper | `f50d763387b8b007c6bc9aaa7b0605c7613e2f00` |
| Unchanged `src/log.ts` | `ed275638f1868e0d44ea1723d364ca97dc36632c` |
| Unchanged `src/store.ts` | `6d352e0c4c90052f6b30304f828557d79a2c5e43` |
| Unchanged `src/merkle.ts` | `cf48bb436c5ee2b9ca01d65ed679858a591f2680` |

The handoff receipt binds these source blobs to the local focused/full test logs
and the completed typecheck exit status. Root integration owns composed-source
and hosted validation.
