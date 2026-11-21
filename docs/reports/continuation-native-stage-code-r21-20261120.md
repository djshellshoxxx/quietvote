# R21 native-operation composition code audit

Date: 2026-11-20. Worker: `code_audit_r21`.

## Conclusion and reviewed source

The final R20 composition preserves the bounded pending-operation diagnostic and
its independently authored test coverage. This fresh source review found no
additional scoped standards or specification defect requiring a production change.
The native delay remains unexplained. Compilation acceptance for this exact
composition is separately attributed to the R21 functional worker below.

| Reviewed identity | Exact value |
| --- | --- |
| Isolated checkout | `0484cc929d8c7d19b24f8e68da2589ca001f7802` |
| Complete checkout tree | `ed271d29ce2369cbadaf9ee1b01634553662cb88` |
| Fixed diff base | `5b40432285694aa004976943180fa04176eddd16` |
| Base complete tree | `a9978c1f482dddfc8fbe5609784898b7f009d1e6` |
| Actual production patch | `696ad8851a697a0e3f50c78d0df2f9c2f49c723c` |
| Both TypeScript bridge blobs | `27334887c532dafe01f4b9820ea057619751d60d` |
| Both unchanged PowerShell blobs | `12e703315de1fd0a5d7c8459f2ea18cc9fc55599` |
| New isolated mock fixture blob | `d58bb43d6392023caf296172dbea8525d42d58f4` |
| New outer test wrapper blob | `6c83341cb3b6d90e9d5b38bb565181af73b1fd44` |

The review used `git diff 5b40432285694aa004976943180fa04176eddd16...0484cc929d8c7d19b24f8e68da2589ca001f7802`
in a separate worktree. Local board and crypto aliases resolve into that worktree;
only external dependencies are shared. The production delta consists of the two
mirrored bridges and the enrollment fixture label. The remaining delta adds two
test files and the completed R20 reports/handoff. This worker changes only this
report and read the [R20 handoff](../audits/CONTINUATION_R20_20261120.md) and its
[code](independent-native-stage-code-r20-20261120.md),
[bug](independent-native-stage-bugs-r20-20261120.md) and
[security](independent-native-stage-security-r20-20261120.md) reports.

## Standards assessment

The standards axis used [CONTRIBUTING](../../CONTRIBUTING.md),
[governance](../../GOVERNANCE.md) and [QV-30](../30-engineering-standards.md),
especially the secret-handling, error, test and review requirements. Standards and
specification were assessed separately within this worker; no additional internal
reviewer or formal appointed approval is implied.

**Zero scoped standards findings.** The new error property is checked against a
fixed runtime tuple and retains no request object, supplied path, private bytes,
raw process error or native output. The timeout closure captures the scalar
operation; this is a diagnostic-data boundary, not a JavaScript erasure guarantee.
The existing human error message is unchanged. The
[enrollment fixture](../../packages/server/test/registration-review.test.ts) adds
only the finite operation or fixed `UNCLASSIFIED` fallback to its existing label.
Its cause remains the existing sanitized Windows error.

The package-local mirrors are intentional under their explicit source comment;
both TypeScript files and both PowerShell files are byte-identical. The change
adds no dependency, runtime flag, native command, protocol operation or generalized
logging facility. All six composed commits after the fixed base have Codex author,
matching DCO and requirement references. Historical DCO and promotion decisions
remain outside this source audit.

## Specification assessment

**Zero remaining scoped specification findings.** The
[bridge](../../packages/cli/src/windows-private-files.ts) now distinguishes which
existing acknowledgement was pending when its deadline expired. Its finite domain
is `service`, `read`, `write`, `reserve`, `bound`, `save` and `close`. An unknown
runtime constructor value becomes `undefined` and is not copied into the message.

| Boundary | Composed-source conclusion |
| --- | --- |
| Attribution | The operation is captured when `send` reaches its serial queue head. Non-deadline failures may still have no operation. |
| Deadline | `TIMEOUT_MS` remains 15,000, with the same start point and cancellation paths. |
| First failure | `abort` returns when a failure already exists; later close/error events cannot overwrite that recorded failure. |
| Native refusals | Parsed native refusal handling and synchronous classification are unchanged. The new property does not replace native refusal codes. |
| Queue and replay | Outer dispatch ordering, per-stream serialization and service acquisition are unchanged. No issued request is automatically retried. |
| Cleanup and bounds | Timer clearing, reply bounds, pipe destruction, process termination and bounded close completion are unchanged. |
| Custody | Native request encoding, invocation and PowerShell bytes are unchanged. Source equality does not establish platform qualification. |

The dispatcher awaits `service` before sending an ordinary `write`. A service
label identifies the awaited handshake; a write label identifies a pending write
reply. Neither diagnoses the source of the delay. In particular, a write timeout
does not establish that publication failed or that replay is safe. The new property
documents that limitation explicitly. Cleanup behavior is unchanged; this review
does not claim that the first-error guard changes every caller's existing cleanup
error propagation.

## Independent test composition and execution limits

The original test commit `5f8b0b4f33a99910f092d4b842524392152a00ad` and integration
`8cdc6edf17724f0b215f780f3b60f04cfa38d341` have the same complete tree,
`c56e6894dbef0f77a5c454ffce30434ad454930b`. The
[wrapper](../../packages/cli/test/private-file-operation-diagnostics.test.ts)
keeps module mocking in an isolated child, removes inherited test-runner context,
serializes the three child cases and applies a bounded outer deadline. The
[fixture](../../packages/cli/test/fixtures/windows-private-operation-diagnostics.mjs)
uses simulated pipes and a mock clock; it performs no native protected operation.

Source review confirms two cases separately withhold service and write replies,
check pending status at 14,999 ms and TIMEOUT at 15,000 ms, retain the expected
operation, exclude the private marker and raw cause, and assert one helper attempt,
one termination and destroyed pipes. A third case confirms ordinary service/write
acknowledgements complete once. Platform, environment and module mock restoration
are scoped to the child fixture. The surrounding diagnostic, lifecycle and
transport wrappers preserve their existing compatibility checks.

The R20 bug report owns the actual Linux/Node 24.22.3 receipt: four outer wrappers
passed, with 17 simulated child cases inside them. These are not 21 distinct tests.
This worker read that receipt and test source but executed no product test,
compiler, Windows operation or vulnerability reproduction. Root's four reported
compiler attempts ended with exit 137 and empty diagnostic logs; that is neither
a passing compilation nor a diagnosed TypeScript error. Those terminations remain
unexplained.

Before this report closed, the coordinator relayed the R21 functional worker's
independent full-root compilation on the exact reviewed commit/tree: Node 24.22.3,
TypeScript 5.9.3, a 768 MiB heap, `--noEmit --extendedDiagnostics`, exit 0 after
8.578314 seconds, 678 files. The compiler reported 502,788 K memory; child maximum
RSS was 716,884 KiB. This was that worker's first and only full-root attempt and
passes the compilation gate for this composition. It is not execution by this
source reviewer, an explanation of root's earlier terminations, or native Windows
qualification. Earlier R18/R19 compiler results are not substituted for it.

## Publication ancestry and next actual native action

An independent read-only Git-data lookup verified prepared commit
[`7df51f39449c04771eff336d0a39bb16651bd9eb`](https://github.com/djshellshoxxx/quietvote/commit/7df51f39449c04771eff336d0a39bb16651bd9eb),
tree `a9978c1f482dddfc8fbe5609784898b7f009d1e6`, parent
`5485deb10d24ca0e64628746e954676a60919c50`, and its matching author/DCO and Refs.
That tree equals the local fixed base. The captured live
[draft PR 71](https://github.com/djshellshoxxx/quietvote/pull/71) still names
`5485deb10d24ca0e64628746e954676a60919c50` as head and
`019f4e789be2ff38a5fb2d348c3b225cc87cf296` as base. Prepared commit existence is
not branch publication. This worker changed no remote ref.

The coordinator should preserve the prepared R19 ancestor in the final reviewed
publication, verify the complete tree and fresh expected branch head, and then
read the new actual Windows Node 22/24 results for that composition. Each receipt
must identify its checked-out merge/parents and source tree. The prior R18 Windows
Node 22 success and Node 24 voter-key TIMEOUT, independently logged by the R20 bug
worker, precede this operation field and cannot qualify it. If another deadline
occurs, record its finite operation before choosing further work; retain the
deadline, custody and no-replay boundaries without a supported causal diagnosis.

The [unfinished-work ledger](../audits/UNFINISHED_WORK.md) still governs durable
checkpoint custody, origin-level key association, stable cross-process locking,
newest-state validation, mandatory file/directory durability, ambiguous-commit
recovery and supported-platform evidence. This diagnostic composition completes
none of those requirements. The stopped investigation was not resumed.

Verification here consists of exact commit/tree/blob checks, local alias
resolution, source/diff review, mirror comparison, DCO/Refs inspection, whitespace
checking and report-link validation. Main promotion, release and deployment remain
separate gates.

Refs: QV-18-REQ-026; QV-30 section 6 S9; QV-30 section 7.
