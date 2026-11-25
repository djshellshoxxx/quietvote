# R21 independent functional composition and compiler receipt

Date: 2026-11-20. Worker: Codex, independent R21 bug-hunt worker.

## Conclusion

The exact R21 input composition passed a full-root TypeScript check on this
worker's first and only compilation attempt. The command returned zero with no
compiler errors. This closes the local compilation gate left unresolved in the
[R20 continuation](../audits/CONTINUATION_R20_20261120.md) for the source below.

The earlier root attempts ended with exit 137 and empty logs. This successful
run does not establish why those processes were terminated. In particular, the
recorded peak resident memory is an observation from this run, not evidence of
the cause of an earlier termination.

## Source and dependency identity

| Item | Observed value |
| --- | --- |
| Input commit | `0484cc929d8c7d19b24f8e68da2589ca001f7802` |
| Input tree | `ed271d29ce2369cbadaf9ee1b01634553662cb88` |
| Isolated branch | `codex/quietvote-bug-hunt-r21-20261120` |
| Isolated checkout | `/workspace/scratch/bd1570487e31/quietvote-bug-hunt-r21` |
| Node | `v24.22.3` |
| TypeScript | `5.9.3` |
| Working tree before compilation and report | Clean |

All eight `node_modules/@quietvote` aliases resolve to this checkout's own
`packages/<name>` directories: board, cli, crypto, protocol, server, trustee,
verifier and web. External dependencies use the already installed dependency
tree. No dependency installation, compiler configuration change, or permission
change was needed.

The unchanged [root configuration](../../tsconfig.json) includes package source
and test directories and extends [the shared strict configuration](../../tsconfig.base.json).
The check retains the repository's existing `skipLibCheck` setting and performs
no emission. It does not type-check the JavaScript mock fixtures.

## Executed compilation

From the isolated checkout:

```sh
node --max-old-space-size=768 node_modules/typescript/bin/tsc \
  -p tsconfig.json --noEmit --extendedDiagnostics
```

A Python standard-library subprocess wrapper recorded elapsed time and child
resource usage, captured both output streams, and imposed a 55-second timeout.
The command ran in the foreground; the timeout was not reached. There was one
full-root compiler invocation, with no retry or smaller fallback compilation.

| Receipt field | Result |
| --- | --- |
| Observation timestamp | `2026-11-20T23:51:33.622448+00:00` |
| Compiler exit status | `0` |
| Wrapper timeout | `false` |
| Wrapper elapsed time | `8.578314` seconds |
| Child user CPU time | `13.503851` seconds |
| Child system CPU time | `1.353138` seconds |
| Child `ru_maxrss` on Linux | `716884` KiB |
| Compiler-reported total time | `8.22s` |
| Compiler-reported memory | `502788K` |
| Files | `678` |
| TypeScript source lines | `77092` |
| Types / instantiations | `119464` / `112526` |
| Captured output | `945` bytes of extended diagnostics; no compiler errors |

The temporary command log was `/tmp/quietvote-r21-bug-typecheck.log` and its
structured receipt was `/tmp/quietvote-r21-bug-typecheck-metrics.json`. The
source identity, command and material result are retained here so the conclusion
does not depend on those temporary files surviving.

## Composition review

An explicit `git diff --exit-code` comparison against R20 production commit
`696ad8851a697a0e3f50c78d0df2f9c2f49c723c` returned zero for the CLI bridge,
trustee bridge and server registration-review test. Both PowerShell helper
blobs also match the R20 receipt. The files retain these identities:

| Files | Git blob |
| --- | --- |
| CLI and trustee `windows-private-files.ts` | `27334887c532dafe01f4b9820ea057619751d60d` |
| CLI and trustee `windows-private-files.ps1` | `12e703315de1fd0a5d7c8459f2ea18cc9fc55599` |
| Operation-diagnostics test wrapper | `6c83341cb3b6d90e9d5b38bb565181af73b1fd44` |
| Operation-diagnostics mock fixture | `d58bb43d6392023caf296172dbea8525d42d58f4` |

The four private-file test wrappers and their four referenced fixtures are
unchanged from independent R20 test commit
`5f8b0b4f33a99910f092d4b842524392152a00ad`; both explicit comparisons returned
zero. This includes the [operation-diagnostics wrapper](../../packages/cli/test/private-file-operation-diagnostics.test.ts)
and its [mock fixture](../../packages/cli/test/fixtures/windows-private-operation-diagnostics.mjs).

Source inspection of the [CLI bridge](../../packages/cli/src/windows-private-files.ts)
and identical [trustee bridge](../../packages/trustee/src/windows-private-files.ts)
confirms that the added property retains only an allowlisted operation name.
The asynchronous request captures that name when it reaches the serial queue
head. The existing 15-second deadline passes it to the terminal failure path,
whose first-failure guard still prevents replacement of an earlier failure.
The label describes the reply being awaited. A `write` label does not determine
whether publication occurred and does not justify replaying the operation.

This worker made no production changes and identified no additional functional
defect in this bounded composition review.

## Evidence boundaries and remaining work

| Gate | Evidence and status |
| --- | --- |
| R21 local full-root compilation | Executed by this worker on the exact input commit above; passed. |
| Linux simulated bridge behavior | Inherited R20 result: four outer wrappers containing 17 nested simulated cases passed. The source and fixtures are unchanged; this worker did not rerun them. |
| Native Windows behavior | Existing hosted R18 evidence remains separate: Node 22 enrollment passed; Node 24 enrollment failed with `UNAVAILABLE/TIMEOUT`. Those logs predate the operation property. |
| Durable ballot-history persistence | REQ-026 remains open; this compiler receipt supplies no persistence qualification. |

The [R20 bug report](independent-native-stage-bugs-r20-20261120.md) contains the
executed mock command and native job receipts. Its hosted run was
`44835016714`, testing synthetic merge
`c76c7665092f9e4287e2c44819d4f82a31ef59ce`, not this R21 input. This worker did
not independently rerun or retrieve native Windows execution. The native
timeout's stage and cause therefore remain unresolved by the evidence here.

The next meaningful native gate is a hosted check whose tested source includes
the operation diagnostic, with its exact tested commit and result recorded.
Compilation and simulated transport cases cannot qualify native ACL or
namespace custody, atomic publication, latency, or crash behavior. Durable
history work and its cross-platform requirements remain tracked in
[unfinished work](../audits/UNFINISHED_WORK.md).

This report changes no publication status, governance approval, or historical
DCO attestation. It is a report-only handoff with a fresh local compiler receipt.

Refs: QV-18 REQ-026; QV-30 section 7.
