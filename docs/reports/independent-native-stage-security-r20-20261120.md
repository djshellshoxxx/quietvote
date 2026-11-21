# R20 independent native-stage security source review

Date: 2026-11-20. Worker: `security_audit_r20`.

## Conclusion and exact scope

The actual R20 patch adds bounded attribution of the asynchronous native request
whose reply deadline expired. The source preserves the existing refusal and
custody behavior. No additional scoped source correction is required by this
review. This is an observability change; it does not establish or repair the
underlying Windows delay, qualify native filesystem behavior, or complete durable
checkpoint storage.

| Source identity | Independently checked local value |
| --- | --- |
| Starting composition | `5b40432285694aa004976943180fa04176eddd16` |
| Starting complete tree | `a9978c1f482dddfc8fbe5609784898b7f009d1e6` |
| Actual reviewed repair | `696ad8851a697a0e3f50c78d0df2f9c2f49c723c` |
| Repair complete tree | `e692d9072a09f215960d0fa32687658f27604e5a` |
| Both CLI/trustee TypeScript bridge blobs | `27334887c532dafe01f4b9820ea057619751d60d` |
| Both unchanged PowerShell bridge blobs | `12e703315de1fd0a5d7c8459f2ea18cc9fc55599` |

The worker created an isolated checkout at the starting composition and advanced
it to the actual repair before reviewing the diff. Its `@quietvote/board` and
`@quietvote/crypto` aliases resolve inside that checkout; only external dependencies
are shared. The root described remote R19 commit `7df51f39449c04771eff336d0a39bb16651bd9eb`
as prepared but not yet branch-published at assignment. This report binds to the
local source identities above and does not assert a later branch-update outcome.

The [R18–R19 handoff](../audits/CONTINUATION_R18_R19_20261120.md) records the
completed preceding rounds. The root supplied the new R18 Windows result as
investigation context: Node 24 job `136629081415` in CI `44835016714` failed at the
first `voter-key` fixture with `UNAVAILABLE/TIMEOUT`; Node 22 job `136629081428`
passed on the same diagnostic source. This worker did not independently fetch
those logs or execute native operations. A fixture label alone does not identify
whether the service handshake or subsequent write was pending.

## Trust boundary and assets

The [TypeScript bridge](../../packages/cli/src/windows-private-files.ts) sends
requests to a fixed native helper. Requests may contain a supplied path and
base64 private bytes. Those values, raw process exceptions, command arguments,
stdout and stderr must not become diagnostic metadata. The new observable fact
is only the internally selected operation name. This follows the no-secret-in-error
rule in [QV-30 section 6, S9](../30-engineering-standards.md).

The review covers the exact CLI/trustee bridge diff and the enrollment test's
finite error-label change. It also reads the existing response/refusal handling,
queue and cleanup code, [PowerShell service protocol](../../packages/cli/src/windows-private-files.ps1),
and the existing diagnostic, transport and lifecycle test wrappers as source.
The stopped background-runtime/gossip investigation and its files are excluded.

## Actual patch assessment

| Requirement | Source assessment |
| --- | --- |
| Finite internal attribution | `Message.op` is narrowed to the private tuple `service`, `read`, `write`, `reserve`, `bound`, `save`, `close`. The new error field uses that same domain. |
| Runtime output boundary | The exported error constructor checks `OPERATIONS.includes(operation)` before retaining the value. Unknown runtime values become `undefined`; the constructor does not stringify or copy them into its message. |
| Request-data separation | At the serial queue head, the deadline callback receives the scalar operation identifier. The patch does not add the request object, path, data, process error or native output to the error or pending diagnostic state. This is not a JavaScript secret-erasure guarantee. |
| Existing error identity | `WindowsPrivateFileError` retains its class, finite code handling and existing message. The new `operation` property is additive. The native refusal parser and synchronous error classifier are unchanged. |
| First failure and code precedence | `abort` still returns immediately when a failure already exists. Explicit parsed native refusals are still rejected through their existing path, without a new diagnostic wrapper replacing their code. |
| Deadline and queue behavior | `TIMEOUT_MS` remains 15,000. The outer operation queue, per-stream serial queue, request ordering, service acquisition and retirement are unchanged. No issued operation is retried. |
| Termination, bounds and cleanup | Response bounds, waiting-timer clearing, stream destruction, child termination, bounded close and cleanup refusal are unchanged. The new field does not authorize proceeding after refusal. |
| Native file protections | PowerShell bytes are unchanged, as are native request contents and invocation. The patch does not alter owner, DACL, identity or namespace checks. Source equality does not independently qualify those checks on a platform. |
| Safe fixture label | The [enrollment wrapper](../../packages/server/test/registration-review.test.ts) appends the finite operation or fixed `UNCLASSIFIED` label. It retains only the existing sanitized `WindowsPrivateFileError` as cause; it does not add the fixture path or key contents. |
| Package parity | CLI and trustee TypeScript bridges are byte-identical at the reviewed repair. Their PowerShell copies also remain byte-identical and unchanged. |

The new field is set by the asynchronous reply-deadline path. Other failures may
legitimately have no operation attribution. The change does not claim a complete
native tracing system or relabel every process/response/native refusal.

## What a stage can establish

The PowerShell service acknowledgement occurs after helper initialization and
reading the initial service request. The TypeScript dispatcher awaits that reply
before sending the ordinary file request. A `service` timeout therefore identifies
the pending handshake. It does not distinguish compiler startup, scheduling,
process I/O or another source of delay.

A `write` timeout identifies an issued write request awaiting its reply. The
operation may already have affected the filesystem; the label must not become an
automatic retry decision or a claim that publication did not occur. Reservation,
save and close labels likewise describe an awaited operation, not a durable commit
outcome or detailed native substage. The existing no-retry behavior is preserved.

## Verification performed and limits

This worker read the applicable security-and-hardening skill, repository
contribution/governance rules and relevant engineering secret-handling rule.
Verification consists of exact commit/tree/blob inspection, isolated package
resolution, the complete three-file repair diff, relevant source paths, native
mirror comparison, report link validation and whitespace/trailer checks.

No product test, compiler, mock-child scenario, Windows runtime, protected-file
operation or vulnerability reproduction was executed by this worker. The functional
worker owns ordinary deterministic diagnostic tests; root owns compilation and
integration. A Linux mock-child result cannot establish PowerShell startup latency,
native owner/DACL behavior, filesystem durability or the cause of the observed CI
failure. Actual native evidence must identify the checked-out merge/tree and the
result for this new source.

## Fresh-worker handoff

Review the final composed bridge blob and the functional worker's actual test
receipt. On the next native Windows failure, record the finite operation label
before choosing further work. Preserve the deadline, refusal code, no-retry rule,
cleanup and native protections; do not convert attribution into a root-cause or
successful-publication claim.

Durable QV-18 REQ-026 remains separate: a supported custody provider still needs
origin-level key association, native ACL/namespace custody, a stable cross-process
lock, newest-state verification under that lock, mandatory file and directory
durability, explicit ambiguous-commit recovery and supported-platform evidence.
The [storage draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md) remains an
unimplemented boundary. This source review supplies no appointed human approval,
main promotion, release qualification or historical DCO attestation.

Refs: QV-18-REQ-026, QV-30 section 6 S9, QV-30-REQ-018, QV-30-REQ-019.
