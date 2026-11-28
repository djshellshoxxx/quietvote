# Trustee native startup observation — 2026-11-27

**Status: diagnostic evidence collection, not a timeout repair.**

Base: PR77 `6764bf231801a782a57b2778a344c6ab26063e9b`.
Date is America/Vancouver. No production code, native helper, protocol,
dependency, deadline, retry policy, custody check or CI concurrency changes.

## Observed failure and unresolved cause

The PR75 Windows Node 22 trustee CI log records Node 22.23.5, 113 passing tests,
six failures and 11 platform skips. All six failures are
`WindowsPrivateFileError`, `UNAVAILABLE`, `TIMEOUT`, operation `service`, with
test durations between 15.210 and 15.481 seconds. They are the first two tests
in each of `audit.test.ts`, `board-export.test.ts` and `ceremony.test.ts`.
Subsequent tests, including real native keygen/read/backup/restore and ACL
refusals, pass in the same job.

`src/windows-private-files.ts` awaits the service acknowledgement before sending
the private read/write request. `src/windows-private-files.ps1` executes
`Add-Type` before reading the service request. The log therefore identifies a
startup-handshake timeout but cannot distinguish process startup, helper
compilation/loading, input parsing or Node callback delay. Its output has no
native startup-phase or heartbeat observations. Startup contention is a
hypothesis, not an established cause.

Both helper files are unchanged from PR75 head
`5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7` to this base:

| File | Git blob |
|---|---|
| `packages/trustee/src/windows-private-files.ts` | `2fcb780bfd6407cb8595650fe9849df430cf0378` |
| `packages/trustee/src/windows-private-files.ps1` | `12e703315de1fd0a5d7c8459f2ea18cc9fc55599` |

## Bounded observation

The test harness can observe only the first honest `Trustee.keygen` call in a
selected fixture, and enables that observation only on Windows. Six existing
tests supply a closed label and their `TestContext.diagnostic` sink:

| Fixed label | Existing test |
|---|---|
| `audit-cast-rewrap-keygen` | TR-01 cast rewrapped as spoil |
| `audit-before-open-keygen` | TR-02 tally release before importing open |
| `board-export-keygen` | Generated board outputs and stale bundles |
| `board-tally-export-keygen` | Ledger-backed tally export |
| `ceremony-honest-keygen` | Honest 3-of-5 ceremony |
| `ceremony-bad-share-keygen` | Bad share 2 to 4 and honest complaint |

`test/helpers/native-fixture-observation.ts` follows the existing server fixture
observer's monotonic-clock and 100 ms unreferenced-heartbeat pattern. It emits
exactly `phase`, `elapsed_ms`, `heartbeat_samples` and
`largest_callback_gap_ms`. The maximum gap includes the interval after the last
callback, including an operation that ends before any callback runs. It stops
the heartbeat before emitting and preserves the exact returned object or
thrown value even if the diagnostic sink fails. Unknown runtime labels bypass
observation. Results and exceptions are never inspected or serialized.

There is one diagnostic per selected fixture on Windows, rather than one per
trustee. No paths, seeds, passphrases, private payloads or arbitrary exception
text enter the observation. Existing test exceptions still reach the runner
unchanged. There are no timing assertions, extra waits, retries or altered test
outcomes.

The measured interval is the whole first keygen, including its ordinary work;
it does not isolate PowerShell or `Add-Type` timing or prove that the helper was
cold. A future native run can distinguish a responsive Node loop from large
callback gaps. Separate fixed native phase evidence would still be required
to attribute a responsive-loop timeout to a particular helper startup stage.

## Local verification

Environment: Linux, Node 24.22.3. `npm ci --ignore-scripts` and
`npm run vendor:install` completed; no dependency changes.

- Targeted run: **10/10 pass**, comprising the six existing affected fixtures
  and four observer checks; 7.70 seconds, no failures or skips in that selection.
- Observer checks cover exact success/error identity, asynchronous and
  synchronous refusal, callback and terminal gaps, cleanup before emission,
  failed diagnostic sinks, closed field/label output and private canaries.
- `npm run typecheck`: pass.
- `npm run vendor:check`: pass; two pinned packages, 132 verbatim files.
- `git diff --check`: pass.

The targeted command was:

```sh
node --test --test-reporter=spec \
  --test-name-pattern='^TR-01:|^TR-02:|^board export signs|^board tally export|^honest 3-of-5:|^malicious DKG: bad share|^trustee timing|^a failed trustee' \
  packages/trustee/test/audit.test.ts \
  packages/trustee/test/board-export.test.ts \
  packages/trustee/test/ceremony.test.ts \
  packages/trustee/test/native-fixture-observation.test.ts
```

The full trustee and server suites were not rerun for this diagnostic-only
slice. Native Windows execution is unavailable locally. These results qualify
the observer and existing Linux fixture behavior; they neither reproduce nor
repair the six native timeouts. Native qualification remains open.

References: QV-30 §6 S9 (no secrets in diagnostics), §8 (test evidence);
`packages/server/test/helpers/native-fixture-observation.ts` (existing pattern);
`packages/trustee/src/windows-private-files.ts` and `.ps1` (actual handshake);
local retained CI evidence `r25-windows22-trustee-ci.log`.
