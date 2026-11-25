# Bounded native helper diagnostics — November 19, 2026

Worker: `/root/bug_hunt_r3`, fresh successor to the hosted-failure diagnosis.

Starting source: published `8b7aa031bd98330d5dd3340bcbdac478d6f9d0ab`.

## Finding and purpose

The Windows registration fixture's first private-file write previously failed with `UNAVAILABLE` on both supported Node versions. The retained logs established absent or malformed helper stdout, but could not distinguish an explicit process timeout, a launch failure, or another process failure. The approximately 16.4-second durations did not establish the cause. See the [preceding native continuation](../audits/SECURITY_CYCLE1_20261119.md).

The synchronous bridge previously discarded the process error metadata and reparsed only stdout. This supplement retains a bounded classification on the existing error, so a future hosted failure can provide useful evidence without retaining native paths, arguments, stderr, input, or the raw process error. This is a diagnostic improvement; it does not claim to fix or explain the historical Windows failure.

The public refusal code remains `UNAVAILABLE` for transport failures. A new `diagnostic` field and fixed suffix on the existing refusal message contain only the following classifications:

| Diagnostic | Evidence required |
| --- | --- |
| `TIMEOUT` | The process error explicitly carries `ETIMEDOUT`. Elapsed time is never used. |
| `STARTUP` | The process error carries a recognized launch code: `ENOENT`, `EACCES`, `ENOEXEC`, or `ENOTDIR`. Other codes are not guessed to be launch failures. |
| `PROCESS` | The invocation throws without an explicit native refusal, but the preceding categories do not apply. A success-looking stdout frame cannot convert a failed invocation into success. |
| `RESPONSE` | A returned frame fails the existing JSON or reply-schema validation. |

An explicit native refusal takes precedence and retains its existing public code, including a native `UNAVAILABLE`. Unknown native codes still become `UNAVAILABLE` without being echoed. The raw process error is not assigned as a cause or retained as a property.

These annotations cover synchronous process failures and shared reply parsing/schema validation. Other existing refusal paths remain unannotated; this is not exhaustive native-stage telemetry.

The classifier uses the documented result metadata from [`execFileSync`](https://nodejs.org/download/release/v22.18.0/docs/api/child_process.html#child_processexecfilesyncfile-args-options). It does not infer a native ACL failure or a deployment configuration change from process timing.

Both package-local TypeScript bridge copies remain byte-identical. The PowerShell/C# helper, permissions and identity checks, 15-second operation deadline, output limits, synchronous API, async operation queue, child-close wait and no-replay policy remain unchanged. No CI assertion or timeout was relaxed.

## Source-bound local verification

Environment: Linux, Node 24.22.3. Dependencies came from the unchanged lockfile using `npm ci --ignore-scripts --offline --no-audit --no-fund`, followed by `npm run vendor:install`.

| Check | Observed result |
| --- | --- |
| Eight new benign process-result cases on the unchanged published bridge | **3 passed, 5 failed**. The five failures distinguish the missing diagnostics; existing native-refusal compatibility cases already passed. |
| The same unchanged eight cases after the repair | **8/8 passed**, zero failures/skips/cancellations. Each case also checks one invocation and absence of the private fixture marker in the returned error. |
| Normal runner: diagnostic, transport and lifecycle wrappers, CLI private files, trustee private files | **13/13 passed**, zero failures/skips/cancellations; 2.756 seconds. Wrapper-internal cases overlap this count and are not added to it. |
| Strict TypeScript check of both bridge copies and the new wrapper, using unchanged compiler options | **Passed**, no diagnostics, 256 MiB heap. |
| Dependency boundary check | **Passed**, no new violations; the two existing D-97 declarations remain. |
| Installed vendor integrity | **Passed**, two pinned packages and 132 verbatim files. |
| Whitespace/diff check | **Passed**. |

The test fixture simulates benign Node process results through the existing test-only module-mock pattern. It does not execute a native helper, change production flags, or qualify Windows behavior.

Fresh security worker `/root/security_audit_r3` performed a separate source review of the production delta and test source without execution and reported no concrete blocker. The reviewed mirrored bridge blob is `6e72bd8941939833354c3f73e24b30463bff5fc8`. That source review is separate from the author-run tests above and does not supply a formal sensitive-change approval.

## Successor handoff

Run the unchanged Windows Node 22/24 jobs on the final published composition and use any newly reported diagnostic as evidence for the next investigation. `PROCESS` is deliberately broad; do not label it a timeout or launch failure. Do not increase the operation deadline or relax native custody checks on this report's evidence alone.

Current-source native qualification, the POSIX/macOS ACL override boundary, formal sensitive-change review and release provenance remain open. The separately stopped background-gossip investigation was not resumed. This worker made no remote mutation, main merge, deployment or release.
