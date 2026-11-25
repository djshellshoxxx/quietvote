# R20 independent native-stage code audit

Date: 2026-11-20. Worker: `code_audit_r20`.

## Exact source and scope

| Source | Identity |
| --- | --- |
| Fixed review base | `5b40432285694aa004976943180fa04176eddd16`, tree `a9978c1f482dddfc8fbe5609784898b7f009d1e6` |
| Actual coordinator repair reviewed | `696ad8851a697a0e3f50c78d0df2f9c2f49c723c`, tree `e692d9072a09f215960d0fa32687658f27604e5a` |
| Original CLI/trustee bridge blob | `dbec7d6a4fa83008a66fce48c100ff12c14569f7` in both packages |
| Repaired CLI/trustee bridge blob | `27334887c532dafe01f4b9820ea057619751d60d` in both packages |

The worker created a separate worktree at the fixed base, verified its complete
tree and checkout-local board/crypto resolution, then advanced that isolated
branch to the exact repair commit before completing this review. The diff is
`git diff 5b40432285694aa004976943180fa04176eddd16...696ad8851a697a0e3f50c78d0df2f9c2f49c723c`.
Only the two mirrored TypeScript bridges and the enrollment fixture diagnostic
changed in that repair. This worker changes only this report.

The preceding [R18–R19 checkpoint handoff](../audits/CONTINUATION_R18_R19_20261120.md)
remains a separate completed scope. The coordinator supplied newly completed
scheduled-R18 Windows receipts as the reason for this follow-up: Node 22 job
[136629081428](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714/job/136629081428)
passed; Node 24 job
[136629081415](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714/job/136629081415)
again reached TIMEOUT in the `voter-key` fixture. The coordinator retrieved the
actual logs and source binding. This code worker did not separately retrieve
those logs or run native Windows operations, and does not infer the delay's cause.

## Diagnostic gap and actual correction

The [bridge](../../packages/cli/src/windows-private-files.ts) first waits for a
`service` acknowledgement and only then sends the ordinary `write` request.
Both waits use the same asynchronous deadline. The earlier fixture label identifies
the outer voter-key operation but cannot distinguish these two pending replies.

The reviewed repair supplies precisely that missing distinction:

- `Message.op` is constrained to the seven existing internal operations: service,
  read, write, reserve, bound, save and close. No protocol operation is added.
- `WindowsPrivateFileError.operation` is optional and checked against that same
  fixed tuple at runtime. An unknown value is discarded. No request object,
  pathname, private payload or native process object becomes an error property.
- When a send reaches its serial queue head, the timeout callback captures only
  the scalar operation. The existing deadline calls `abort('TIMEOUT', operation)`.
- The existing error name, code handling, diagnostic values and human message
  remain unchanged. The [enrollment fixture](../../packages/server/test/registration-review.test.ts)
  appends only the finite operation field or its fixed UNCLASSIFIED fallback.
- Both package-local bridge copies remain byte-identical, as their source comment
  requires. The [PowerShell service](../../packages/cli/src/windows-private-files.ps1)
  and its native file protection implementation are unchanged.

`service` means the initial acknowledgement is pending; `dispatch` has not yet
reached its ordinary `stream.send(message)` call. `write` means that handshake
completed and the write reply is pending. A missing write reply does not establish
whether the native write happened, whether publication succeeded, or why completion
was delayed. The new property documents that limit explicitly.

## Standards

Sources: [CONTRIBUTING](../../CONTRIBUTING.md), [governance](../../GOVERNANCE.md)
and [QV-30 engineering standards](../30-engineering-standards.md), especially
section 6 S9, section 7 and section 10. The standards and specification axes were
reviewed separately within this worker; they are not represented as additional
independently dispatched workers.

**No scoped standards defect found in the actual repair.** The new metadata is
bounded and excludes secret/private input and raw child-process details, consistent
with S9. The bridge continues using exceptions for I/O faults, which section 7
permits; the change introduces no new failure or retry class. The runtime allowlist
supports the declared closed type instead of relying solely on TypeScript callers.
The actual repair has matching Codex author/DCO and applicable Refs.

The two matching implementations are intentional package-local mirrors under an
explicit source requirement, so duplication is not a reason to extract a new shared
dependency in this patch. No new dependency, runtime option, protocol encoding,
native command, timer setting or generalized diagnostic framework was introduced.
Formal promotion reviews remain separate from this source audit.

## Specification and requested scope

The originating scope is the concrete existing Windows deadline failure and the
coordinator's requirement for finite pending-operation attribution. It is an
observability increment, not adoption of a new protocol or filesystem contract.

**The diagnostic gap is closed by source review; no additional scoped specification
defect was found.** The patch preserves the relevant boundaries:

| Boundary | Source conclusion |
| --- | --- |
| Deadline | The same 15,000 ms constant is used, starting at the same queue-head point. |
| First failure | `abort` still returns immediately when a failure already exists; subsequent close/error events cannot overwrite its recorded operation. |
| Native refusal precedence | Existing parsed native refusal errors and synchronous classification remain unchanged. They are not relabeled as deadline failures. |
| Queue and replay | Global operation ordering and per-stream serialization are unchanged. An issued write is not retried. |
| Cleanup | The same timer cancellation, pipe destruction, process termination and bounded close completion remain in place. |
| Custody | Native owner, DACL, identity, publication and reply bounds are unchanged. |
| Output | The fixture retains the already-sanitized Windows error as cause and prints only bounded metadata; it does not attach fixture contents or the underlying process error. |

The change does not repair or establish the cause of the measured delay. It also
does not establish native custody qualification, durable checkpoint storage,
cross-process locking, file/directory durability or ambiguous-commit recovery.
Those requirements remain in the [unfinished-work ledger](../audits/UNFINISHED_WORK.md).

## Verification performed and next handoff

This worker performed exact commit/tree/blob checks, scoped source and diff review,
local package-resolution verification, matching-author DCO/Refs inspection,
whitespace checking and report-link validation. The existing isolated
[diagnostic](../../packages/cli/test/private-file-diagnostics.test.ts),
[lifecycle](../../packages/cli/test/private-file-lifecycle.test.ts) and
[transport](../../packages/cli/test/private-file-transport.test.ts) harnesses were
read as test-design context. They were not executed by this worker. No product
test, compilation, native probe or vulnerability reproduction is claimed here.

The functional worker owns deterministic asynchronous deadline coverage and the
coordinator owns composition/typechecking. A fresh reviewer should bind those
results and the published source to this reviewed bridge blob, then inspect an
actual new native Windows result. If another timeout occurs, use its operation
field to narrow the next investigation without treating the label as a causal
diagnosis or replaying an uncertain write. Do not change deadlines or protections
without concrete supporting evidence.

Standards: zero scoped findings. Specification: zero remaining scoped findings
after review of the actual diagnostic correction; native delay cause unresolved.

Refs: QV-18-REQ-026; QV-30 section 6 S9; QV-30 section 7.
