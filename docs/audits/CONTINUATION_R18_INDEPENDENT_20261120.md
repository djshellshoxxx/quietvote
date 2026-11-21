# R18 independent checkpoint review and repair

Date: 2026-11-20. This interactive worker round is distinct from the scheduled
[R18 Windows diagnostic checkpoint](CONTINUATION_R18_20261120.md).

## Exact source consolidation

Published R17 `995b31f804f5905f1df29f4f453ab3a404518dc0` was materialized locally as
`e31825ee9f79d44e66d966f4aed68b811bc7a24b`. All six incoming blob hashes and the
complete tree `79f4fa63e9094b61b6c370de0f225455ff507fd4` were verified. Concurrent
scheduled R18 `5485deb10d24ca0e64628746e954676a60919c50` was then incorporated as
local equivalent `c1f413ce14cf750199fea019d6c11948e1ed8f8b`; all four changed blobs
and complete tree `c3e04b91ff324addde7551a777f4a93c8906e817` matched. These local
commits are source equivalents, not claims of identical remote ancestry.
Publication must preserve the actual latest remote parent with a fresh lease.

## Completed workers and repair

All three genuinely separate R18 workers completed before a fresh R19 set:

- [Code audit](../reports/independent-checkpoint-code-r18-20261120.md), original
  signed report `df158839893eaf3fab817e7f88e4edbaf0dd2979`.
- [Bug hunt](../reports/independent-checkpoint-bugs-r18-20261120.md), original
  signed report `f1a889d68e1aec62215ba9ad142bda1429c01fee` and independent tests
  `2ac3d6dc53794a6d3676391570b54646ff68aa7b`.
- [Defensive security review](../reports/independent-checkpoint-security-r18-20261120.md),
  original signed report `dc1fff84851244e89ca6fe16a5e02f86362b4433`.

The code and security workers independently identified two defects in the
unconnected pin helper: Buffer inputs could share returned storage, and size-zero
notes/equal-size comparison did not fully enforce the specified empty-root rule.
Root repair `ba9f181b53ea2aa1fe7e12b1e2592e8065e44e90`, tree
`e820a5b81fca362bf28a49b4916b1344ca193f41`, copies bytes with a Uint8Array
constructor, checks the empty root whenever size is zero, and compares equal-size
roots directly. The code worker reviewed that actual repair. The R18 security
report reviews the earlier source and diagnostic delta; fresh R19 security review
must close its findings against the integrated repair.

The [storage draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md) now makes
the existing same-origin key-conflict requirement explicit before a pair-specific
missing pathname can be treated as first use. It does not adopt a provider.

## Actual execution

The independent bug worker executed four ordinary groups on production tree
`e820a5b81fca362bf28a49b4916b1344ca193f41`: Buffer copy ownership, valid empty
initial/idempotent/0-to-2 transition, real multi-hash 1-to-3-to-7 growth, and exact
retention of an original note containing a generated witness line. All four passed,
zero failures or skips. Test commit `2ac3d6d` has complete tree
`e7db62be8310e383c85d7e7473df74f4fc63c6a0`; root integration `47cecd7` has that same
tree. Workspace aliases resolved inside the worker checkout.

Root executed three selected existing ordinary helper groups successfully and
completed full TypeScript checking both before and after integrating the new
test file. These are Linux/Node 24.22.3 results, not native custody qualification.
The worker reports distinguish their source reads, authored tests and execution.

## Hosted evidence and next scope

The independent bug worker retrieved actual R17 Windows job logs. CI
[44815131888](https://github.com/djshellshoxxx/quietvote/actions/runs/44815131888)
finished with 25 of 27 jobs successful; both Windows server jobs reached the
15-second async private-helper deadline during enrollment fixture preparation.
Each server suite had 351 passes, one failure and seven skips; both web suites
passed 441 tests. The tested synthetic merge `44df7ddd7e616d1774e4a5586ec40415f6518b4e`
has main/R17 parents and complete tree `79f4fa63e9094b61b6c370de0f225455ff507fd4`.
Node 24 already limited test concurrency to two. The underlying delay is unresolved.

Scheduled R18 preserves finite TIMEOUT and voter-key/invite fixture labels without
altering custody, deadlines or retries. Both bug and security workers reviewed
that source delta. Its CI [44835016714](https://github.com/djshellshoxxx/quietvote/actions/runs/44835016714)
had all 27 jobs queued at the last R18 observation. A pending diagnostic run is
neither a pass nor a latency repair.

Fresh R19 must review the combined helper/test/doc changes, inspect any actual
Windows result, and address the separately scoped shared consistency verifier's
zero-to-zero equal-root rule. Use ordinary conformance tests and source review;
no vulnerability reproduction or stopped investigation is part of this scope.

Durable REQ-026 remains open: native ACL/namespace custody, origin-level key
association, cross-process locking, newest-state revalidation, mandatory file and
directory durability, explicit ambiguous-commit recovery and supported-platform
qualification are still required. No stateful CLI, freshness, authority, witness
policy or counting assurance was added. Main promotion and historical DCO
decisions remain separate; no merge to main, release or deployment occurred.

Refs: QV-18-REQ-002, QV-18-REQ-026.
