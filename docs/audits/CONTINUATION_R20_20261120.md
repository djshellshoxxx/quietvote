# R20 native-operation attribution and fresh-worker handoff

Date: 2026-11-20. All three R20 workers completed after the six completed
[R18/R19 workers](CONTINUATION_R18_R19_20261120.md). R20 follows an actual new
Windows failure; it is not a repeated empty audit cycle.

## New native evidence

Both scheduled R18 Windows server/web jobs in CI
[44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714)
finished before their diagnostic source was superseded:

| Job | Server | Web | Enrollment case |
| --- | --- | --- | --- |
| Node 22, `136629081428` | 352 passed, zero failed, seven skipped | 441 passed | Passed in 6,998.9224 ms |
| Node 24, `136629081415` | 351 passed, one failed, seven skipped | 441 passed | Voter-key fixture reached UNAVAILABLE/TIMEOUT in 16,410.7866 ms |

Root and the R20 bug worker independently retrieved the actual logs. Both logged
synthetic merge `c76c7665092f9e4287e2c44819d4f82a31ef59ce`, tree
`c3e04b91ff324addde7551a777f4a93c8906e817`, with main and scheduled R18
`5485deb10d24ca0e64628746e954676a60919c50` as parents. The new fixture label
localizes the failure to the first private fixture; it does not distinguish the
service handshake from the subsequent write. The earlier timeout's cause is
still unproven. R18 claims and visual checks succeeded; aggregate CI is separate.

## Bounded implementation

Root patch `696ad8851a697a0e3f50c78d0df2f9c2f49c723c`, complete tree
`e692d9072a09f215960d0fa32687658f27604e5a`, adds only finite pending-operation
attribution and its fixture display. Message operations are the existing closed
set: service, read, write, reserve, bound, save and close. The exported error
constructor runtime-checks its new optional operation field. The deadline callback
uses the scalar operation selected when the request reaches the queue head.

The existing error message, 15-second deadline, first-failure guard, queues,
explicit native-refusal precedence, bounds, native custody, termination, cleanup
and no-retry behavior are unchanged. Both bridge copies are identical at blob
`27334887c532dafe01f4b9820ea057619751d60d`; both unchanged PowerShell copies are
blob `12e703315de1fd0a5d7c8459f2ea18cc9fc55599`. No path, private bytes, whole
request or raw process error is added to diagnostic state.

A service label identifies an awaited handshake. A write label does not establish
whether native publication occurred and cannot authorize retry. Neither label
establishes the reason for the delay or completes checkpoint persistence.

## Completed independent workers and actual execution

- [Code audit](../reports/independent-native-stage-code-r20-20261120.md), original
  report `fc13be85d3405b790aa9cfc4b4949b86277659eb`, reviewed the actual patch.
- [Bug hunt](../reports/independent-native-stage-bugs-r20-20261120.md), original
  report `248b44b31339ffc8147f8114fa519d4c43614ce1`, independently checked the
  native logs and executed the deterministic mock acceptance.
- [Security source review](../reports/independent-native-stage-security-r20-20261120.md),
  original report `cbcec06733417315a3084bc18f1083e588f952d4`, reviewed the actual
  patch and found no further scoped correction necessary.

Test commit `5f8b0b4f33a99910f092d4b842524392152a00ad` and root integration
`8cdc6edf17724f0b215f780f3b60f04cfa38d341` have identical complete tree
`c56e6894dbef0f77a5c454ffce30434ad454930b`. The bug worker's four outer wrappers
passed, zero failures/skips, on Linux/Node 24.22.3. They contain 17 simulated
child cases: three new service/write-deadline/success cases and 14 existing
synchronous-diagnostic, lifecycle and transport cases. Do not add nested and
outer counts. The new cases stay pending at 14,999 ms and refuse at 15,000 ms,
preserving single attempt, first timeout, pipe cleanup and private-data omission.
These simulations are not native Windows execution or latency qualification.

## Compiler execution limitation

Two full-root compiler attempts (768 and 512 MiB heaps) and two CLI compiler
attempts (384 MiB, including a foreground attempt) ended with exit 137 and empty
diagnostic logs. The cause has not been established; none is a passing compiler
result or a TypeScript error diagnosis. Root aliases still resolve inside the
root checkout. Runtime status/diagnostic tools were unavailable on the selected
computer. Earlier successful R18/R19 compiler checks do not qualify this delta.
Fresh R21 should resolve the bounded compilation gate in an available environment
and preserve the exact outcome if the local executor continues terminating it.

## Fresh R21 handoff and publication

Review the composed bridge/test source, constructor allowlist and both mirror
identities; keep the executed mock evidence separate from native results. Read
the next actual Windows source-bound result before selecting further diagnostics
or a repair. Do not raise deadlines or weaken custody based on the current labels.

R19 commit `7df51f39449c04771eff336d0a39bb16651bd9eb`, tree
`a9978c1f482dddfc8fbe5609784898b7f009d1e6`, was prepared and verified as a child
of scheduled R18 but was not branch-published while the diagnostic jobs ran.
The final composed publication should preserve that reviewed commit and its
actual remote ancestry, with a fresh expected-head lease and full-tree check.
All source and worker commits carry matching DCO and Refs. Main, releases,
deployment, original branches and historical DCO decisions remain unchanged.
The stopped investigation was not resumed. Remaining durable custody, locking,
newest-state verification, mandatory directory durability, ambiguous-commit
recovery and formal promotion gates are still explicit in the unfinished ledger.

Refs: QV-18-REQ-026, QV-30 section 7.
