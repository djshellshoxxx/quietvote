# Responsive offline verifier implementation — 2026-11-09

Workstream B, based on `35b5d4d6161c5ea0cd99ec4746cb9a4bb11a3f6e` (tree
`02d2fe5210585b0b4631f6f684985b53d14b7a56`), branch `codex/qv-next-offline-20261109`.
This is scheduling/UI implementation under B3-26 option A and QV-ADR-027, not protocol qualification or external review.
Source provenance is the signed commit introducing this report; exact integration/publication provenance belongs to the lead receipt.

## Contract and implementation

`VerifyElectionOptions.cooperative` is optional: `{ signal?: AbortSignal, checkpoint(progress): void | Promise<void> }`.
Progress contains only stage and completed/total work units. It contains no report, evidence, passing checks or resumable state.
The caller's callback is awaited and owns task scheduling. Cancellation is checked before and after each callback, including
before the final report returns. It rejects with `name: AbortError`; a thrown/rejected callback rejects with
`name: VerificationSchedulingError`. Neither returns a partial or successful report. Default hostile-input handling remains total.
Caller-owned object inputs and optional log evidence must remain immutable until settlement; text parsing creates private input.

The existing synchronous `analyzeBallotLog` API and opt-in cooperative path drain one shared generator. Crypto, envelope order,
finding order, revote/spoil bookkeeping and report generation remain shared. Safe boundaries occur before each envelope and
signed-record/key-confirmation/marker operation, every 32 cheap bookkeeping items, and around major stages. Existing default
`verifyElection`/`verifyElectionText` signatures remain compatible through an optional options member. No dependency, vector,
registration contract, D-92–D-94 interpretation, protocol version, network behavior or CSP directive changes.

The standalone page snapshots the file and anchor for each run, displays labelled stage progress separately from the verdict,
yields tasks at stage changes and after approximately 16 ms of work, and offers cancellation/retry. File/anchor edits and
`pagehide` invalidate previous and pending results. Scope identity guards reads, callbacks, catch and finally so old work cannot
replace a newer result or re-enable its controls. Cancellation returns keyboard focus to Run checks. No Worker is introduced.

The slice exceeds the preferred 400-line size because it contains the shared interface, the page lifetime changes and both
retained deterministic and required-browser failure regressions; it does not expand to unrelated verifier semantics.

## Evidence

Environment: Linux, Node **24.22.1**, Chromium **156.0.8078.79**, repository Playwright **1.57.0**.
The worktree has its own lockfile-installed dependencies (`npm ci --ignore-scripts --no-fund`); no shared root node_modules link.
Raw logs and reproducible timing script are outside the repository under `../evidence/offline-*`.

| Command / experiment | Result |
|---|---|
| Baseline `node --test packages/protocol/test/cooperative.test.ts` before implementation | Three behavioral failures: hook never called, pre-abort accepted, callback failure ignored. `offline-red.log` |
| `npm run typecheck` | Passed after implementation and final test additions |
| `npm test -w @quietvote/protocol -w @quietvote/verifier -w @quietvote/web` | 213 + 25 + 214 = **452 passed**, no failures/skips; includes first four cooperative tests. Later two cooperative tests are separately checked below |
| `node --test packages/protocol/test/cooperative.test.ts` | Six retained tests: 30 corpus/malformed/unsupported cases with exact `JSON.stringify` report equality; cancellation before parse/during suspended ballots/before return; independent retry; early/late callback failures; default hostile getter; explicit honest/adversarial log evidence; 80-envelope synthetic equality and ordered per-ballot yielding |
| `node --test packages/web/test/offline-verifier.test.ts` | **4 passed**, zero skips: real verifier with deterministic task queue, cancellation/retry, stale successful/rejected reads, old finally isolation, file/anchor/page lifetime invalidation, current read-error recovery |
| `node --test packages/web/test/build.test.ts` | **4 passed**, zero skips; deterministic build, closed CSP hashes, no verifier network APIs, DOM/eval checks |
| `npm run build -w @quietvote/web` | Passed: all JavaScript 197.0 kB gzip, entry 97.4 kB gzip, verifier.html 180.8 kB |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts` | **Failed before assertions**: Chromium process singleton `socket() failed: Operation not permitted (1)`. No browser skip or browser pass claimed |
| `git diff --check` | Passed |

The required browser suite retains real generated-policy and server-policy checks and adds mobile/desktop progress,
cancel/retry, keyboard focus, verification-without-network, delayed read success/rejection and pagehide invalidation journeys.
Their local launch failure means exact-candidate hosted browser results remain a qualification dependency. The deterministic DOM
checks are separate evidence, not browser or assistive-technology qualification.

A bounded scheduling experiment appended **80 real signed proof envelopes** outside the original voting window to the
`tiny-yesno-3v` fixture (182,804 JSON bytes). The candidate default run took **2,768.7 ms with zero timer heartbeats**. The cooperative
run took **3,132.4 ms with 210 timer heartbeats/checkpoints**; the largest observed uninterrupted interval was **85.4 ms**, in one
ballot operation. Both returned exactly the same **8,261 report bytes**. The existing verdict is PASS with explicit failed
window/check findings; this experiment does not reinterpret that behavior. These are one-run observations on a shared host,
not hard latency guarantees. Independent review also compares candidate reports with the original baseline implementation.

## Remaining synchronous work and limits

| Work | Remaining limit |
|---|---|
| File read / strict JSON parsing | File read cannot be interrupted by this API; stale completion is discarded. Parsing is synchronous within the existing 64 MiB page bound |
| Manifest/roll, log structure, witnessing/receipts | Synchronous validation/hashing remains; optional log evidence is not supplied by the standalone page |
| DKG adjudication | Internals remain synchronous/await native crypto as before; checkpoints surround the stage |
| Individual ballot/signature/proof | Atomic synchronous operation; cancellation takes effect at the next boundary |
| Counting sort/root, aggregate, tally decryption/rules | Existing whole-stage operations remain synchronous |
| Cancellation and retry | No continuation/resume; retry starts new private verifier state. This API is cooperative, not preemptive CPU isolation |
| Page lifetime | `pagehide` invalidation is covered deterministically; actual browser/BFCache/background-tab qualification remains separate |

Threat-model effect: improved local availability during envelope verification and protection against stale UI verdicts. No
verification strength, authority policy, cryptographic construction or secrecy claim changes. Callback code is caller-supplied
application code, not bundle data. Malformed/unsupported input retains its exact existing report; unsupported Python capabilities
are not counted as agreements. The strict TS/Python baseline remains held pending D-92–D-94 decisions, with independent review
and integration receipts responsible for the exact candidate comparison. QuietVote remains an unaudited prototype, not for real elections.
