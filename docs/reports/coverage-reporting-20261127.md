# Report-only coverage and workspace test option forwarding

Date: 2026-11-27 (America/Vancouver). Base: PR #78,
`c110e06bc584e642e9130a82f7a16493ad8b12e3`.
Experimental. This is tooling groundwork, not an audit or satisfaction of the
coverage, mutation, review or release gates.

## Accepted scope and result

[Process inventory T7](inventory-20261111/process.tasks.md#t7-coverage-report-report-only)
calls for a dependency-free Node coverage report with per-workspace line/branch
measurements and the crypto shortfall from its specified 100% target. The
implementation collects native Node test events, renders bounded deterministic
reports, and adds an explicit optional CI measurement of one workspace. It does
not add or lower a coverage threshold.

The related requirements remain broader:
[QV-11-REQ-003](../11-testing-assurance.md) also requires mutation evidence;
[QV-30-REQ-013](../30-engineering-standards.md) requires enforcement of its stated
thresholds. Native structural counters do not establish correctness or either
requirement's complete acceptance criteria.

The implementation plan was:

1. Capture integer Node 22/24 coverage counters alongside the existing spec
   reporter, with a completed native test summary.
2. Count executable production sources by workspace, reject ambiguous or partial
   evidence, and report measured percentages and crypto shortfalls without a
   threshold gate.
3. Preserve the actual npm/test status, prechecks, test glob and forwarded test
   options; validate with real spawned runners and malformed evidence fixtures.
4. Measure the production-cost crypto path before selecting CI integration.
   Because full instrumentation is not qualified, keep it in an explicit,
   separate optional measurement job.

## Test option defect found during integration

The original eight workspace scripts put `test/**/*.test.ts` before npm's
forwarded arguments. Node treats runner options placed after that positional
glob as trailing file arguments. In a distinguishing execution outside the
parent test runner, an explicit preceding concurrency of four remained four
despite a trailing `--test-concurrency=2`. The shared launcher puts the forwarded
options before the unchanged glob; the same four files then run with maximum
concurrency two. A separate reviewer also reproduced ignored name-pattern and
concurrency arguments on Node 24.22.3.

This makes the existing Windows Node 24 CLI/server concurrency cap effective
without changing the condition, its intended value, native operation deadlines
or failure handling. The distinguishing local probe ran on Linux; this report
does not claim a completed native Windows run of the new launcher.

All eight package changes affect only the test command. The web i18n precheck
remains in the npm script. The launcher preserves npm lifecycle hooks, inherited
stdio, the exact test glob, child exit codes and unhandled termination signals.
Actual fixtures distinguish precheck failure, unsupported options, successful
coverage, and an npm posttest hook that exits 7 after the native tests succeeded.
No dependencies, package versions or lockfile entries change.

## Evidence rules

The collector uses Node's integer `totalLineCount`, `coveredLineCount`,
`totalBranchCount` and `coveredBranchCount`; it does not parse formatted native
tables or average file percentages. It requires one complete coverage event and
one final native test summary. Counts are summed before percentages are derived.

The repository inventory covers executable files under each workspace's `src`
and `bin`. Test/fixture/benchmark directories and suffixes, declarations and
dependencies are excluded. Absolute paths must belong to the exact checkout;
POSIX and Windows paths are handled explicitly. Missing source files, unexpected
source files, duplicate records, unsupported runtimes, invalid counts, incomplete
JSON, nonregular files, symlinks and bounded-read failures are visible as
unavailable evidence. Missing counters are never silently converted to zero or
treated as a fully measured workspace. Zero denominators remain unavailable.
Diagnostic paths are JSON-quoted to prevent control characters from creating
extra terminal lines.

A failed or cancelled invocation is unavailable even when surviving workers
imported every production file. A killed worker can omit counters, so complete
file inventory is insufficient. CI also supplies the measurement step's actual
`outcome`, not its `continue-on-error` conclusion. A failed npm posttest hook,
cancelled/skipped measurement or unknown outer outcome cannot qualify native
success as available coverage. The JSON report preserves native and outer
outcomes as distinct facts.

`--report-only` is mandatory for the rendering command. An evidence failure
returns an unavailable report and exit 0 only in this explicit mode. Invocation
errors return 2. The native test process retains its actual exit or signal. The
collector itself does not start subprocesses or write arbitrary files.

These counters describe the executed invocation. Importing all source files
does not execute all tests, and uncalled functions can hide branch paths in the
native denominator. Reports state this limitation and do not represent these
measurements as the QV-11/QV-30 gate evidence.

## CI and local use

Ordinary PR and matrix test jobs remain uninstrumented. They keep their existing
shards, Node/OS branches, test loop, failure accumulation and deadlines. The
existing repository tooling step discovers the new built-in tests.

The optional coverage job runs only for `workflow_dispatch` with an allowed
`coverage_workspace` choice. The default is `none`; one of the eight workspaces
can be selected. This deliberately avoids silently running the entire matrix
again. The job uses Ubuntu and Node 24, existing SHA-pinned checkout/setup-node
actions, `contents: read`, a 20-minute job bound and a 15-minute optional
measurement bound. Its failure is non-gating. The instrumented test step keeps
its real exit; an `always()` step reports available or unavailable evidence.
Hosted overhead and optional-job execution remain unqualified in this receipt.

Inputs enter shell commands through environment variables and fixed validation,
not expression interpolation into shell code. The measurement and report steps
use the same temporary path. Independent review caught an initial use of
`runner.temp` in job-level `env`, where that context is unavailable. It was moved
to both step-level `env` blocks. Regression assertions reject that invalid job
context and require the matching step paths. The reviewer used GitHub's
[context availability table](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).

For a local optional measurement, this shell wrapper retains the actual test
exit while rendering its report. Run it from the repository root:

```sh
(
  qv_coverage_file="$(mktemp)" || exit 1
  qv_test_status=0
  QV_COVERAGE_OUTPUT="$qv_coverage_file" npm test -w @quietvote/crypto || qv_test_status=$?
  qv_measurement=failure
  if [ "$qv_test_status" -eq 0 ]; then qv_measurement=success; fi
  node scripts/coverage-report.mjs --report-only --input "$qv_coverage_file" \
    --workspace crypto --measurement-outcome "$qv_measurement"
  exit "$qv_test_status"
)
```

Omit `--workspace` to print all workspace rows from a single evidence file;
workspaces absent from that invocation remain explicitly unavailable. Separate
runs are not merged. `--json` emits a structured report; `--root` supports fixture
or checkout selection. Supported measurement outcomes are `success`, `failure`,
`cancelled`, `skipped` and `unknown`.

## Validation and retained limitations

| Evidence | Result and scope |
|---|---|
| Final corrected Node 24.22.3 reporter, launcher, workflow and action-pin tests | 39 passed, 0 failed, 0 skipped; 5.791 seconds. Actual spawned TypeScript coverage, test/nonzero/signal propagation, npm pre/postchecks, distinguishing concurrency probe and failed-outer-outcome regression included. |
| Earlier Node 22.20.0 reporter/launcher/workflow run | 26 passed, 0 failed, 0 skipped; 5.329 seconds. This exercised actual native Node 22 events and option forwarding before the later failed-run/outer-outcome and optional-job refinements. The Node 22 binary was unavailable after execution-host recovery; this is not a final-source Node 22 qualification claim. |
| Pinned vendor bytes | 2 packages, 132 verbatim files checked successfully before isolated crypto execution. |
| Actual crypto transcript invocation | 8 passed, 0 failed, 0 skipped. Its evidence contains 17/17 production source files with native measured line coverage 48.51% and branch coverage 92.54%; native shortfalls 51.49 and 7.46 percentage points. This is the transcript invocation, not the complete crypto suite. |
| Full instrumented crypto, isolated with concurrency 1 | 108 tests reported, 107 passed and 1 failed; exit 1; 22.903 seconds. The current report classifies its percentages and crypto shortfalls as unavailable. |
| Instrumented cipher-file diagnostic | The native runner reported its worker's `SIGKILL`, with no numeric child exit code; 20.754 seconds. The empty native table's displayed percentages are not usable coverage. |
| Pre-outage uninstrumented attempt | Saved log is zero bytes. No usable outcome is inferred from the lost execution session. |
| Recovered, uninstrumented cipher-file baseline | 11 passed, 0 failed, 0 skipped; exit 0; 3.326 seconds. Existing production `2^18` round-trip passed in 3.051 seconds with its unchanged 120-second case deadline. Wrapper wall time 3.402 seconds; child peak RSS 353404 KiB. |

The recovered environment exposed neither `/usr/bin/time` nor cgroup memory
event/limit files. The saved diagnostic records that absence. The evidence
establishes a killed instrumented worker and a later successful uninstrumented
baseline; it does not establish OOM, the precise kill cause, a comparable
completed-run overhead ratio or hosted-matrix performance. The earlier
instrumented runs and the empty interrupted log remain retained; they were not
relabelled as successful checks. No production KDF cost, test assertion,
deadline or gate was reduced to obtain these results.

No full suite matrix was rerun for this tooling change. Source integration and
hosted Node 22/24/native-platform validation remain the root integration's work.

## Frozen source binding

The final 39-test invocation used these Git blob IDs:

| File | Git blob |
|---|---|
| `scripts/coverage-report.mjs` | `82573ffb59fad2d1ff328d77dca726ff5036c428` |
| `scripts/coverage-report.test.mjs` | `1342a58dab43f8f4ed355270b49e76735ec8aa52` |
| `scripts/test-workspace.mjs` | `f5c9fbc93934a78f2545422a2b2804387d5f52c9` |
| `scripts/test-workspace.test.mjs` | `381c8f69e0f77cf7812d79998afa255c316e8428` |
| `.github/workflows/ci.yml` | `7e5c36aa3d551426f2aa3b1196df314c355f977b` |
| `.github/scripts/check-workflow-coverage.test.mjs` | `87b540fcc5d43ddb18bf2c1e0dc07fc15a753cf8` |

The handoff receipt records all eight changed manifest blobs and SHA-256 digests
for the local passing, failed and unavailable logs. Those local logs are evidence
of the stated executions, not a claim that hosted CI or the assurance gates have
passed.


## Composed-source Node 22 qualification

After the final source handoff, integration restored Node 22.20.0 and ran the
same final reporter, launcher, action-pin and workflow-coverage batch. All 39
cases pass with zero skips in 3.139 seconds. This closes the final-source local
Node 22 tooling check; it does not qualify a whole instrumented workspace or a
hosted platform matrix. The complete uninstrumented server suite then passed
646 cases with one existing platform skip through the corrected launcher;
[the R28 receipt](../audits/CONTINUATION_R28_20261127.md) records that distinct gate.
