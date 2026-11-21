# R19 checkpoint and shared-verifier security source review

Date: 2026-11-20. Independent worker: `security_audit_r19`.

## Reviewed source and scope

This fresh review follows the completed [R18 independent handoff](../audits/CONTINUATION_R18_INDEPENDENT_20261120.md)
and [R18 security report](independent-checkpoint-security-r18-20261120.md).
The isolated checkout began at `76143eb84ac3be9033f745c020686f873112d68d`, complete
tree `06b67b275c2164ff14676bbe151894c1cd4d9da6`. It was then fast-forwarded to the
actual coordinator repair `561fb1ff4b625c2911b64e1d08dd1f9f2ed91c7b`, complete
tree `fce62a6f6a008d78eb410c81848554bc4a989ff7`, before reviewing that correction.
Both identities were checked locally. Board and crypto package resolution points
inside this isolated checkout; only external dependency links are shared.

This worker made a report-only change. The review covers the integrated pure pin
repair, its ordinary test source, the separately scoped shared consistency repair,
the existing finite Windows diagnostic delta and the storage draft clarification.
It does not establish a full-project audit, native execution, crash durability or
formal approval to promote sensitive changes to main. No vulnerability
reproduction, intrusive probe or runtime security test was performed.

## Closed findings against actual repairs

| Finding | Source conclusion |
| --- | --- |
| R18 S18-1: shared Buffer storage in an unchanged proposal | Closed by source review. The [pin helper](../../packages/cli/src/checkpoint-pin.ts) constructs a new Uint8Array from the retained bytes, so its result no longer relies on the input subclass's `slice` method. The original signed note remains byte-for-byte retained. |
| R18 S18-2: incomplete zero-size and equal-root semantics in the pin helper | Closed by source review. `verifiedNote` requires the standard empty root whenever the signed size is zero, for both candidate and retained records. The equal-size branch compares roots directly before returning copied retained bytes. Growth still uses the exact old/new consistency proof. |
| R19 shared consistency boundary at zero-to-zero | Closed by source review of `561fb1f`. The [shared verifier](../../packages/board/src/merkle.ts) requires an empty proof and the specified empty old root whenever the old size is zero; if the new size is also zero, it additionally requires equal roots. The positive-size algorithm and zero-to-positive semantics are unchanged. |

The reviewed helper blob is `835d5e5b491dbcf902c0a513ba0089ccca2b1fe8`.
The reviewed shared-verifier blob is `cf48bb436c5ee2b9ca01d65ed679858a591f2680`.
These are source closures, distinct from the functional worker's execution.

The shared correction follows existing [QV-18](../18-bulletin-board-transparency.md)
REQ-002, which fixes the empty-tree root, and section 7.3, which requires equal
roots at equal sizes. It does not introduce a new encoding, domain separation,
cryptographic construction or freshness rule. Keeping only an equal-size check
before the old zero-size check would not suffice: canonical empty-root validation
must also remain in the zero-sized case. The implemented condition preserves both
obligations without widening acceptance elsewhere.

The board pin-advance and equivocation functions, CLI receipt-proof functions and
web receipt comparison were inspected within this review's permitted scope.
The pin helper already applies its stronger local zero/equal checks; strictly
growing comparisons keep their prior behavior. No caller-specific production
change is required by this narrow correction. This is not a claim that every
caller or every existing parser contract has undergone a new comprehensive audit.

## Other boundaries preserved

The helper remains a pure proposal function. Independent origin/key inputs,
strict point validation, bounded canonical four-field records, signed-note
verification, refusal on an invalid retained record, explicit rollback handling
and bounded exact-size growth proofs remain in place. Its initial proposal does
not assert prior consistency. Equal-size retention preserves old cosignatures
without claiming to evaluate a witness policy or inherit witnesses on growth.

The reviewed production delta after the scheduled R18 equivalent contains only
the pin helper and shared Merkle verifier; its other package change is the
independent ordinary pin test file. It adds no stateful CLI flag, filesystem
provider, automatic reset, retry, new network action or additional assurance flag.
No output proposal establishes a durable update or latest-observation custody.

## Windows diagnostics remain diagnostic only

The scheduled R18 change was re-read from the exact `e31825e` to `c1f413c` diff,
then inspected in the final source above. Both CLI and trustee bridge blobs equal
`dbec7d6a4fa83008a66fce48c100ff12c14569f7`.

The [native bridge](../../packages/cli/src/windows-private-files.ts) passes the
internal literal `TIMEOUT` to its existing abort path when the existing deadline
fires. It preserves the first-failure guard, 15-second deadline, queue ordering,
reply bounds, stream termination and no-retry behavior. No owner, DACL, held
identity, native publication or cleanup rule was modified. The server fixture
wrapper uses the finite `voter-key`/`invite` labels and the sanitized native error's
code/diagnostic. Its retained cause is that sanitized error, not an underlying
child-process error or fixture data.

The labels can identify the fixture operation and the observed deadline. They
cannot by themselves distinguish service startup from a later native write, or
establish whether scheduling, native I/O or another cause produced the delay.
The functional worker owns actual hosted-log inspection and exact tested-tree
qualification. This report does not turn a pending run into a pass or identify
the diagnostic change as a repair of the underlying Windows failure.

## Durable storage and promotion gates remain open

The [storage draft clarification](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md)
correctly requires an origin-level retained key association before interpreting
a pair-specific absent pathname as first use. It records an existing conflict
rule; it does not adopt a registry, locking protocol or recovery design.

The reviewed [POSIX staging](../../packages/cli/src/posix-staging.ts) explicitly
does not inspect native ACL grants. The [private-file writer](../../packages/cli/src/private-files.ts)
treats directory fsync as best effort. Windows protected DACL and held-file
identity checks, together with file `Flush(true)`, do not supply the complete pin
transaction. The following evidence is still needed before a stateful integration
can claim completion of REQ-026:

- Native owner/ACL and namespace custody on each supported filesystem.
- An origin-scoped key binding and stable kernel-held cross-process lock, with
  a defined lock order and no timer-based stale-lock deletion.
- The newest retained snapshot, exact consistency proof and final revalidation
  under the same transaction lock.
- Private same-filesystem publication with mandatory file and directory durability.
- Explicit `AMBIGUOUS_COMMIT`, authenticated reread and identity-bound recovery
  that preserve a newer trusted observation through uncertain publication.
- Actual supported Linux, macOS and Windows qualification, separate from normal
  Linux proposal tests or passing unrelated hosted jobs.

Main promotion still requires the project's formal sensitive-change approvals
and appointed reviewer; historical missing DCO remains an owner provenance
decision. This worker does not supply those approvals or attestations.

## Verification and fresh-worker handoff

Performed: exact local commit/tree/blob inspection, isolated dependency-resolution
inspection, source and diff review, native bridge byte-identity comparison, report
link validation and whitespace checking. The ordinary R18 test source was read;
its recorded execution remains attributable to the independent bug worker. This
worker did not run product tests, a compiler, native fixtures or exploit cases.

The next worker should bind final publication to these reviewed helper/verifier
blobs, inspect the functional worker's actual ordinary conformance results and
refresh the specific Windows job evidence. If further diagnostic phase attribution
is needed, keep it finite, internal and free of paths or private input, with
unchanged refusal, timeout and no-retry behavior. Durable storage must proceed
through an explicitly reviewed provider and transaction design; another pure
helper review cannot substitute for that implementation or its platform evidence.

Refs: QV-18-REQ-002, QV-18-REQ-026, QV-30-REQ-018, QV-30-REQ-019.
