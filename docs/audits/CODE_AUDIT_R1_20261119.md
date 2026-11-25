# Server code audit, first continuation round — November 19, 2026

## Source and scope

Baseline: `3f0ea6549e2fdf7ffa462de3a4978cd369655458`, the published
comprehensive consolidation candidate in PR #71. This worker inspected runtime
pool custody, registration, recorded exports, startup anchors and their existing
tests. This is a focused engineering audit, not a repository-wide or formal
security approval.

## Confirmed defects and repair

1. With `maxOpenElections=1` and an SSE subscription pinning the first election,
   acquisition of a second election opened it, selected that same new runtime
   for LRU eviction, and returned the closed handle. The distinguishing real-HTTP
   regression received `500 INTERNAL` instead of a controlled capacity refusal.
2. Simultaneous loads did not count against the configured bound until they
   finished. The distinguishing blocked-startup regression observed two opens
   with capacity one. Callers for the same election must still share its load.
3. Eviction removed a runtime from the cache before its admitted writer drained.
   A concurrent acquisition opened a second runtime for that same election,
   giving it an independent sequencing mutex. The distinguishing regression
   observed a replacement open while the original writer was still held.

The repair reserves capacity across opening, cached and draining runtimes.
Idle LRU entries are evicted before admission; saturation returns the existing
retryable `503 BUSY` response with `Retry-After: 2`. Acquisition waits for a
same-election eviction, and shutdown also drains evictions already removed from
the cache. Existing lifecycle, deletion and startup health gates remain in place.
No protocol, schema, exported record, timeout or workflow gate changes.

## Executed verification

- All three new regressions fail on the unchanged baseline with the outcomes
  described above.
- The repaired pool passed 13 checks across `pool-capacity.test.ts`,
  `shutdown-drain.test.ts`, `delete-runtime-lifecycle.test.ts` and
  `sse-lifecycle.test.ts`: no failures, cancellations or skips.
- Final focused rerun after source review passed all three pool-capacity checks,
  with no failures, cancellations or skips, on Node 24.22.3/Linux.
- `git diff --check` passes. A separate root-wide typecheck was already running
  in the integration worker; this worker did not duplicate it or claim its result.

The existing hosted Windows server failures are a separate private-file issue.
Jobs [135596405498](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405498)
and [135596405544](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405544)
each had 346 server passes, one failure and seven skips; the web suites each
passed 431 tests. Both failed in `registration-review.test.ts:161` while writing
the private identity fixture, before enrollment assertions, with
`WindowsPrivateFileError` / `UNAVAILABLE`. Their approximately 16.4-second
durations are consistent with the native helper's 15-second timeout, but do not
establish its cause. The evidence was handed to the separate native-file worker.

## Fresh-worker handoff

Independently review the pool change and challenge failed startup reservation
release, explicit eviction during startup, and shutdown after cache removal has
already begun. Reuse the committed regressions without weakening their
assertions. Qualify the composed source with the existing typecheck and hosted
matrix. The Windows fixture failure, browser journeys, formal sensitive-change
reviews, historical DCO provenance and the contract gaps in
[UNFINISHED_WORK](UNFINISHED_WORK.md) remain separate requirements; this repair
does not close them.
