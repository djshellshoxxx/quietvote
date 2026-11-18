# Keyless receipt recovery during consolidation — 2026-11-17

Baseline: `66dcfafa885bdbd82cae808c33cebe0d7f8a21ab`.
Historical source: `13b86c22f973aee91453090b2ec5bcff104e8804`, B2-12 subset.
The recorded interim policy is [B2-12 option A](../plan/DECISIONS-2026-11-04.md#b2-12--zero-seed-placeholder-key-signs-duplicate-receipts-on-keyless-runtimes).

## Reproduced defect

The current runtime substituted a zero Ed25519 seed when an imported or reloaded
archived election had no log signing key. Duplicate admission returned before
read-only phase checks, so both paths returned HTTP 200 with a newly signed
promise under the replacement key. Such a promise cannot authenticate the real
log's commitment. The historical patch had not reached the current candidate.

New actual-server regressions reproduced HTTP 200 instead of the required 503
on both paths before repair. Direct board tests also reproduced missing-key
signing exceptions, including an append that had already modified its store.

## Recovered behavior

BoardLog accepts an explicitly absent signing key. Append, duplicate receipt,
direct receipt and checkpoint requests return the existing `QV_BOARD_READ_ONLY`
Result before mutation or signature generation. Its private signing helper
requires the already checked key; no replacement key is constructed.

ElectionRuntime passes through the absent key and maps receipt refusal to the
existing `503 LOG_UNAVAILABLE` response. Authentic stored checkpoints, proofs,
exports and audits remain available. Existing keyed idempotency is unchanged.
The board API uses error Results rather than the historical patch's throwing
`getReceipt` contract, consistent with its existing error model.

Only B2-12 was recovered from the historical commit. The old control-schema-5
rollback migration and partial control-reason enum were not imported. No receipt
encoding, crypto primitive, election acceptance rule or database schema changed.

## Verification

Node 24.22.1 on the managed Linux environment:

| Check | Result |
|---|---|
| New keyless regression files before production repair | 5 reported failures; both real HTTP paths returned 200 |
| Same files after repair | 5 passed, 0 failed/skipped |
| Full board workspace | 78 passed, 0 failed/skipped |
| Full server workspace | 290 passed, 0 failed/skipped |
| Root typecheck | Passed |
| Diff whitespace check | Passed |

The focused test count includes the parent server test and its two subtests and
overlaps the workspace suites; do not add the totals as distinct cases.
Tests verify no new log row/checkpoint is written, no receipt is returned,
stored checkpoints verify under the original log key rather than the zero-seed
key, and stored inclusion proofs remain available. Existing archive crash
recovery, imports and keyed receipt regressions pass in the full workspace runs.

This establishes local implementation behavior. A later combined candidate
still needs its own CI receipt. Original-promise persistence for replay remains
separate work. An already loaded archived runtime retains its actual in-memory
key until eviction; immediate in-memory destruction is not claimed here.
