# Server import availability and atomic publication — 2026-11-09

AI-assisted implementation/review evidence, not external audit or election-readiness approval.
Baseline: `35b5d4d6161c5ea0cd99ec4746cb9a4bb11a3f6e`; workstream branch `codex/qv-next-server-20261109`.
This report belongs to its containing commit; the integration handoff records that commit/tree after independent review.

## Design and scope

The worst remaining CPU stage in the measured small import was synchronous board verification. Extend the existing worker entry
with a board operation and retain the single FIFO job runner: protocol and board workers never overlap within a job, and each is
joined before settlement. No new dependency, queue, pool, authority rule, protocol acceptance, registration or vector change.
The larger diff includes fault/behavior tests and a bounded diagnostic, with only a small production scheduling/publication change.

Per-sequence author keys come from the unchanged manifest/roll resolver. `verifyLog` still validates header origin, author-id/key
binding, signature, grammar, nonce uniqueness, body digest, tree, checkpoints and witness policy. Decoded dedicated entry buffers
transfer out and back; the parent then performs the unchanged byte-exact log/protocol correspondence check. Archive input is retained
once, and the existing election JSON copy transfers instead of undergoing an additional structured-clone byte copy.

Replay self-test runs against a staged database and synthetic registry metadata before any real registry row exists. Close that
runtime, check cancellation, then atomically recheck quota/duplicate identity, publish the registry row and append its audit event.
Rejected staging removes the database and sidecars. Cleanup failure remains fail-closed with a distinct `IMPORT_CLEANUP` 503;
files can remain inaccessible until a retry can remove them. Successful replay is not cached; the first read replays normally.

## Red/green and focused qualification

Node `v24.22.1`, Linux; isolated worktree installed with `npm ci --ignore-scripts --no-fund` and its own workspace links.
Four behavioral regressions failed on the baseline:

1. A scheduled event-loop turn had not run when board verification reported completion.
2. A typed cancellation at the staging tick left the SQLite file behind.
3. Registry lookup saw the mirror while injected replay was still able to fail; baseline failure then left a deleted tombstone.
4. Concurrent native creation during the staging yield made organization count 3 despite a configured cap of 2.

The same cases pass after repair. New tests also cover worker crash, early exit, timeout, cancellation, awaited termination on
success, exact passing/failing board reports, transferred-byte return, concurrent duplicate imports, audit rollback, cleanup failure
and retry, disconnected authorized partial uploads, queued cancellation and deferred replay beyond the former shutdown cutoff.
A fake clock advances the cutoff test; it does not sleep for five seconds. The real existing import corpus preserves exact rejection
rules/sequence numbers for hostile tar/checksums, bodies, authors, checkpoints, policy, hidden/swapped records and quotas, plus PASS,
INCOMPLETE, read-only mirrors, link access, idempotency, restart interruption and bounded admission.

Commands and receipts (raw logs retained separately in the execution evidence directory):

```sh
npm run typecheck
node --test --test-reporter=spec packages/server/test/import-availability.test.ts packages/server/test/import-worker.test.ts packages/server/test/imports.test.ts packages/server/test/b2-fixes.test.ts packages/server/test/security-review.test.ts
git diff --check
node packages/server/bench/import-verification.ts /path/to/baseline-checkout
node packages/server/bench/import-verification.ts
```

Final focused result: **43/43 passed**, zero failed, skipped or cancelled (36.83 s). Typecheck and `git diff --check` passed.
Receipts: `server-availability-red.log`, `server-import-focused-final.log`, `server-typecheck.log` and
`server-benchmark-{before,after}-final.jsonl`. Baseline benchmarking used a dedicated detached checkout at the baseline SHA with its
own install; the mutable integration checkout was excluded from the final comparison. Broader frozen-candidate and hosted
qualification belong to the integration lead; this slice does not claim those checks.

## Bounded measurements and remaining stages

The checked-in diagnostic runs one complete synthetic four-voter bundle (160,768 bytes), then 128 and 512 valid signed board entries.
Runs are sequential. It records wall time, main-thread active time, 5 ms timer delay and whole-process RSS high-water. These are
single local samples, not latency percentiles, maximum-size stress tests, per-worker allocation accounting or performance guarantees.
Worker startup increases wall time while reducing event-loop occupancy. Final sequential samples:

| Workload | Before wall / active / max timer lag (ms) | After wall / active / max timer lag (ms) |
|---|---:|---:|
| Complete bundle verification, before database staging | 1008.37 / 211.13 / 188.41 | 1194.54 / 27.42 / 5.66 |
| Signed board, 128 entries | 367.56 / 369.21 / 364.08 | 519.11 / 4.65 / 0.78 |
| Signed board, 512 entries | 1451.01 / 1451.21 / 1446.06 | 1602.07 / 8.65 / 0.81 |
| Database staging + replay + publication, small bundle | 36.88 / 36.98 / 26.73 | 36.07 / 36.14 / 25.80 |

Whole-process high-water RSS: baseline 176.74 MiB; candidate 179.20 MiB after the small import, 179.79 MiB after 128 board
entries and 182.02 MiB after 512. Active time includes the final diagnostic timer turn and can slightly exceed measured work wall time.
For the small bundle, measured main-thread stage time was: archive/checksums 2.33→1.76 ms; descriptors/entries 9.23→8.78 ms;
protocol-phase parent activity 7.25→10.58 ms; header preparation plus board verification 189.71→4.51 ms. The last stage's wall time
rose from 189.71 to 362.30 ms with worker startup. These samples support reduced event-loop occupancy, not faster import completion.

| Stage | Execution and remaining limit |
|---|---|
| Upload/hash/authentication | Main thread; existing byte/upload/request timeout caps unchanged. |
| Tar, checksums, descriptors and strict JSON/base64 decode | Main thread; existing archive, file, entry and voter caps; stage/batch yields unchanged. |
| Election proofs | Worker; existing timeout applied to this phase; one transferred dedicated JSON copy. |
| Header/key preparation | Main thread; existing bounded entry-batch yields. |
| Board signatures/tree/checkpoints/witnesses | Worker; same timeout also bounds this phase; entry bytes transferred, then returned. |
| Exact log/protocol correspondence and aggregate body cap | Main thread; existing batch yields/checks unchanged. |
| SQLite staging and replay | Main thread; cancellation checked at staging and publication boundaries. Replay has no separate timeout. |
| Publication | Non-yielding control transaction rechecks quota/identity and inserts row+audit only after replay. |

The default 120-second verification budget applies **per worker phase**, so two successful phases can approach 240 seconds plus
remaining stages. Existing queue/upload/byte caps remain the memory/admission controls; no process-wide heap ceiling is newly
claimed. Import shutdown aborts workers promptly but waits for replay/cleanup instead of closing its database after five seconds.
Accepted jobs survive submitting-client disconnect; partial upload disconnect releases capacity. No user cancellation API was added.

Threat impact: lower attacker-controlled event-loop occupancy, explicit joined worker lifecycle, and no newly visible import before
replay succeeds. Validation strength, trust anchors, author authority and protocol verdicts are unchanged. Availability still depends
on synchronous parsing/staging/replay, configured caps, filesystem health and ordinary process supervision. Persistent unlink failure
cannot promise zero orphan files; it now produces an explicit failed job without publication.
