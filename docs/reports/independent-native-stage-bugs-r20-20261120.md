# R20 independent native-operation diagnostic bug hunt

Date: 2026-11-20. Worker: `bug_hunt_r20`.

## Exact scope and source

All three R18 and all three R19 workers completed before this fresh round. This
worker started from root `5b40432285694aa004976943180fa04176eddd16`, complete tree
`a9978c1f482dddfc8fbe5609784898b7f009d1e6`, in a separate checkout. The local board
and crypto workspace aliases resolved inside that checkout; only external
dependencies were shared.

The task is to test the new bounded native-operation diagnostic, not to reproduce
or explain Windows startup latency on Linux. I read the existing
[synchronous diagnostic harness](../../packages/cli/test/private-file-diagnostics.test.ts),
[transport harness](../../packages/cli/test/private-file-transport.test.ts),
[lifecycle harness](../../packages/cli/test/private-file-lifecycle.test.ts), their
isolated child fixtures and the [native bridge](../../packages/cli/src/windows-private-files.ts).
The debugging skill's native reproduction phase is not applicable to this Linux
run: actual hosted Windows logs provide the failure evidence, and the mock-child
tests qualify only the separately testable attribution change. No native protected
operation, exploit, vulnerability reproduction or stopped investigation was run.

## Independently retrieved hosted evidence

I retrieved the actual logs for both Windows server/web jobs in
[scheduled R18 CI 44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714).
Each log explicitly records checkout of synthetic merge
`c76c7665092f9e4287e2c44819d4f82a31ef59ce`. An independent Git-data read verifies
its parents as main `019f4e789be2ff38a5fb2d348c3b225cc87cf296` and scheduled R18
`5485deb10d24ca0e64628746e954676a60919c50`, with complete tree
`c3e04b91ff324addde7551a777f4a93c8906e817`.

| Actual job | Server suite | Web suite | Enrollment observation |
| --- | --- | --- | --- |
| [Windows Node 22, 136629081428](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714/job/136629081428) | 352 passed, 0 failed, 7 skipped; 359 total | 441 passed, 0 failed, 0 skipped | The formerly failing shipped-CLI enrollment review case passed in 6,998.9224 ms. |
| [Windows Node 24, 136629081415](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714/job/136629081415) | 351 passed, 1 failed, 7 skipped; 359 total | 441 passed, 0 failed, 0 skipped | The enrollment review case failed in 16,410.7866 ms: `native fixture voter-key refused (UNAVAILABLE/TIMEOUT)`. |

The Node 24 stack reaches the existing `HeldStream.send` deadline. The finite
fixture label identifies the first voter-key fixture; it does not distinguish
the service acknowledgement from the subsequent write acknowledgement inside
that fixture. A passing Node 22 run does not establish why Node 24 timed out, and
these R18 jobs do not contain or qualify the later R20 operation field.

## Actual production patch inspected

Root repair `696ad8851a697a0e3f50c78d0df2f9c2f49c723c` was cherry-picked locally
as `a02000f5284fe9f4c06dac5c8e40442343978a35`. Both have complete production tree
`e692d9072a09f215960d0fa32687658f27604e5a`.

The patch adds the closed `service/read/write/reserve/bound/save/close` operation
set, narrows internal message types, captures only the scalar operation when a
request reaches the serial queue head, and carries it through a deadline error.
The error constructor filters the supplied operation against that fixed set.
The existing error message remains unchanged; the enrollment fixture wrapper
appends the finite operation field to its existing label.

The 15-second deadline, native protections, first-failure guard, no-retry behavior,
queueing and cleanup remain unchanged in the inspected diff. CLI and trustee
bridge copies have identical Git blobs. The PowerShell implementation is unchanged.
An operation label identifies the acknowledgement being awaited; it does not prove
that native execution began, that a write did not publish, or that startup is the
cause. Event-loop scheduling and native completion remain separate observations.

## Independent ordinary tests

Test commit `5f8b0b4f33a99910f092d4b842524392152a00ad` adds only the
[new outer wrapper](../../packages/cli/test/private-file-operation-diagnostics.test.ts)
and [isolated child fixture](../../packages/cli/test/fixtures/windows-private-operation-diagnostics.mjs).
Its complete tree is `c56e6894dbef0f77a5c454ffce30434ad454930b`. These exact test
bytes were executed against the production tree above before their separate
test commit; no test assertion was changed after the successful run.

The fixture uses the project's existing test-only child-process module-mock
approach and simulated pipe events. Two cases use the Node test clock to withhold
an ordinary acknowledgement, once for `service` and once for `write`. Each checks:

- The operation is still pending at 14,999 ms and reports TIMEOUT at 15,000 ms.
- The error names the expected pending operation and retains UNAVAILABLE/TIMEOUT.
- The service-only timeout never issues a write; the write timeout issues it once.
- One helper is created, one termination occurs, and all terminal pipes are destroyed.
- The fake path/input marker is absent from serialized and inspected errors, and
  no raw child error is retained as a cause.

A third case supplies normal service/write acknowledgements and observes one
successful completion with no prior termination. These are diagnostic transport
simulations, not ACL, filesystem, native-process latency or crash-durability tests.

Executed on Linux, Node 24.22.3:

```sh
node --test --test-reporter=spec \
  packages/cli/test/private-file-operation-diagnostics.test.ts \
  packages/cli/test/private-file-diagnostics.test.ts \
  packages/cli/test/private-file-transport.test.ts \
  packages/cli/test/private-file-lifecycle.test.ts
```

Result: **4 outer wrappers passed, 0 failed, 0 skipped; 488.517842 ms**.
The wrappers verify their nested child-suite totals: 3 new operation cases,
8 existing synchronous diagnostic cases, 3 transport cases and 3 lifecycle cases.
That is **17 simulated child cases within 4 wrappers**, not 21 distinct tests.
The existing suites supply compatibility evidence for native refusal precedence,
transport drainage, independent queued operations and no write replay. They are
not counted as newly authored cases. Node 22 execution and native Windows
qualification remain hosted gates; this worker did not run them locally.

## Completion and next handoff

The operation-attribution checks pass against the actual patch. I found no new
functional defect in that bounded simulation. The original Windows delay remains
unresolved; root's compiler and fresh source audits are separately attributed.
Whitespace checking passed, and both new test files are committed with matching
Codex author/DCO and requirement references.

The fresh worker should verify final composed bridge/test identities, then read
the actual new Windows result and exact runner checkout. If a deadline recurs,
record whether it waited for `service` or `write` before choosing a next probe.
Do not label a write timeout as proof that nothing was written, and do not replay
the request. Retain the deadline and native protections unless independently
measured evidence supports a separately reviewed change. Checkpoints still need
the unimplemented custody, cross-process lock, newest-state validation, strict
durability and recovery contract described in the
[R18–R19 handoff](../audits/CONTINUATION_R18_R19_20261120.md).

Refs: QV-18-REQ-026; QV-30 section 7.
