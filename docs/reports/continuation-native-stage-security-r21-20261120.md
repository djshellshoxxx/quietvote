# R21 native-operation security composition review

Date: 2026-11-20. Worker: `security_audit_r21`.

## Source identity and review boundary

This is a fresh defensive source review after the three R20 workers completed.
I read the [R20 handoff](../audits/CONTINUATION_R20_20261120.md), its independent
[code](independent-native-stage-code-r20-20261120.md),
[bug](independent-native-stage-bugs-r20-20261120.md) and
[security](independent-native-stage-security-r20-20261120.md) reports, then inspected
the actual composed production diff, surrounding bridge control flow, native
service dispatcher and ordinary mock test source in an isolated checkout.

| Reviewed object | Exact identity |
| --- | --- |
| Combined review commit | `0484cc929d8c7d19b24f8e68da2589ca001f7802` |
| Complete review tree | `ed271d29ce2369cbadaf9ee1b01634553662cb88` |
| Production repair | `696ad8851a697a0e3f50c78d0df2f9c2f49c723c`, tree `e692d9072a09f215960d0fa32687658f27604e5a` |
| Both CLI/trustee TypeScript bridges | `27334887c532dafe01f4b9820ea057619751d60d` |
| Both unchanged PowerShell helpers | `12e703315de1fd0a5d7c8459f2ea18cc9fc55599` |
| Operation-test wrapper | `6c83341cb3b6d90e9d5b38bb565181af73b1fd44` |
| Operation-test child fixture | `d58bb43d6392023caf296172dbea8525d42d58f4` |
| Enrollment test | `7b2191f0268c3cb803d58aa6697c58d8463560e8` |

The production comparison starts at R19 `5b40432285694aa004976943180fa04176eddd16`.
Both mirrors match byte for byte. The new test files match root's test integration
`8cdc6edf17724f0b215f780f3b60f04cfa38d341` without further edits. The checkout's
board/crypto aliases resolve within this checkout. This worker changes only this
report and ran no product tests, compiler, native protected operation or probe.

## Composition result

**No new scoped security defect identified in the composed diagnostic change.**
The conclusion concerns the inspected source and test design; it does not qualify
native timing, custody or persistent storage.

The [bridge](../../packages/cli/src/windows-private-files.ts) declares the seven
existing operation names in one closed tuple: service, read, write, reserve,
bound, save and close. The public optional `WindowsPrivateFileError.operation`
is checked against that tuple at runtime; an unknown supplied value becomes
undefined. Its finite boundary therefore does not depend solely on TypeScript.
No new protocol operation or helper command is introduced.

At the serial queue head, `message.op` is copied to the scalar `operation` used
by the timeout callback.
The new error property adds no request object, private pathname, payload, argv,
child exception or raw stdout/stderr to diagnostic state. The existing error
message and finite code handling are unchanged. This is a statement about the
added diagnostic state, not a claim that JavaScript closures, strings or garbage
collection provide secret erasure guarantees.

The [enrollment fixture](../../packages/server/test/registration-review.test.ts)
uses literal voter-key/invite phases and the existing classified bridge error.
It appends the runtime-filtered operation or fixed UNCLASSIFIED fallback to its
finite label. The fixture's asynchronous writer imports the same CLI bridge as
its `instanceof` check. Its cause is that sanitized bridge error; the patch does
not attach the request contents or an underlying child-process exception.

| Existing boundary | Independent source conclusion |
| --- | --- |
| First failure | `abort` still returns when `this.failure` exists; a later close/error event cannot replace the timeout operation. |
| Native refusal | Parsed native refusal codes and synchronous refusal precedence are unchanged; the new field does not reclassify them. |
| Deadline | `TIMEOUT_MS` remains 15,000 ms, armed at the same per-stream queue-head point. |
| Ordering | Global operation ordering and each stream's serial promise chain are unchanged. |
| Reply handling | Output bounds, single-frame parsing and response validation are unchanged. |
| Cleanup | Timer cancellation, buffered-state clearing, pipe destruction, process termination and bounded close completion remain unchanged. |
| Replay | The dispatcher does not retry an issued operation after refusal, including an uncertain write. |
| Native custody | The PowerShell blob, owner/DACL/identity checks, held-handle operations and publication implementation are unchanged. This diff supplies no new qualification of those checks. |

## Meaning of service and write

`dispatch` awaits the initial `service` reply before calling `stream.send(message)`.
In the enrollment fixture a service timeout therefore occurs before that ordinary
write is sent. The unchanged [PowerShell dispatcher](../../packages/cli/src/windows-private-files.ps1)
acknowledges service before entering its request loop and acknowledges write only
after its write call returns.

A write timeout identifies a pending acknowledgement after the service handshake.
It does not establish whether the native write ran or published, so it cannot
authorize replay. Neither field establishes the reason for the delay, native
startup duration, a durable commit, platform custody or checkpoint completion.
The new property's source comment states the write uncertainty explicitly.

## Test evidence and unresolved qualification

I read the [new wrapper](../../packages/cli/test/private-file-operation-diagnostics.test.ts)
and [mock child](../../packages/cli/test/fixtures/windows-private-operation-diagnostics.mjs)
as source. They use simulated pipes and a mock clock, check pending status at
14,999 ms and timeout at 15,000 ms, distinguish service-only from service/write
requests, and check single helper/termination, destroyed pipes, private-marker
omission and a normal successful acknowledgement sequence. They restore mocked
module/platform/environment state; the cases are isolated from ordinary native
execution. Their assertions support the intended transport behavior without
making a native latency or ACL claim.

The R20 bug report records execution on Linux/Node 24.22.3: four outer wrappers
passed, with 17 simulated child cases and zero failures/skips. Those are prior
worker results, not executions by this reviewer; outer and child totals must not
be added together. The R20 handoff records full and CLI compiler attempts ending
with exit 137 and no diagnostics, with cause unestablished. During this review the
coordinator relayed `bug_hunt_r21`'s successful independent full-root compilation
on the exact combined commit/tree above: Node 24.22.3, TypeScript 5.9.3, 768 MiB
heap, `--noEmit --extendedDiagnostics`, exit 0, 8.578314 seconds, 678 files,
502788K reported compiler memory and 716884 KiB child maximum RSS. This is that
worker's result, not a compiler execution by this reviewer. It qualifies this
source's compilation; earlier R18/R19 passes do not. The earlier terminations'
cause remains unresolved.

The independently retrieved hosted results recorded by the R20 bug worker apply
to scheduled R18 `5485deb10d24ca0e64628746e954676a60919c50`: Windows Node 22 passed,
while Node 24 timed out at the voter-key fixture. They predate this operation
field and do not natively qualify it. This worker did not retrieve or execute
those jobs. Prepared R19 remote `7df51f39449c04771eff336d0a39bb16651bd9eb` had not
been branch-published at assignment; publication and fresh native results must
remain separately source-bound.

## Standards, checks and handoff

The bounded diagnostic addition is consistent with the no-secrets-in-errors rule
S9 in [QV-30](../30-engineering-standards.md). Production and test integration
commits have matching Codex author/DCO and requirement references, checked against
[CONTRIBUTING](../../CONTRIBUTING.md). This review does not supply appointed
security-reviewer approval, main-promotion approval or historical DCO attestations.
Exact commit/tree/blob checks, mirror comparisons, source/diff review, report-link
validation and whitespace checks are the verification performed by this worker.

The [unfinished-work ledger](../audits/UNFINISHED_WORK.md) still requires the
complete REQ-026 storage transaction: origin-level key association before treating
pair-path absence as first use; native ACL/namespace custody; stable kernel-held
cross-process locking; newest-state reread and consistency proof under that lock;
atomic private publication with mandatory file and directory durability; explicit
ambiguous-commit recovery; and actual supported-platform qualification. The
diagnostic patch does not complete any of these contracts.

A fresh worker should bind the final published tree to these bridge/test blobs,
retain the independently attributed compiler receipt, then inspect the next
source-bound Windows result. Preserve pending-operation attribution without
treating it as a root-cause diagnosis, increasing deadlines or replaying an
uncertain write.

Refs: QV-18-REQ-026; QV-30 section 6 S9; QV-30 section 7.
