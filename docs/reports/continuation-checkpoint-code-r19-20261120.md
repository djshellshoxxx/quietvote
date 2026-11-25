# R19 independent checkpoint and consistency code review

Date: 2026-11-20. Worker: `code_audit_r19`.

## Source and independence

This fresh worker began only after the three R18 workers completed. The
[R18 handoff](../audits/CONTINUATION_R18_INDEPENDENT_20261120.md) was read first.
The isolated checkout started at `76143eb84ac3be9033f745c020686f873112d68d`,
complete tree `06b67b275c2164ff14676bbe151894c1cd4d9da6`. Its board and crypto
package aliases resolve within this checkout; only external dependencies are
shared with the coordinator.

The integrated pin repair is `ba9f181b53ea2aa1fe7e12b1e2592e8065e44e90`. Its
helper blob remains `835d5e5b491dbcf902c0a513ba0089ccca2b1fe8` in this review.
The review then advanced by local fast-forward to the coordinator's shared
verifier repair `561fb1ff4b625c2911b64e1d08dd1f9f2ed91c7b`, complete tree
`fce62a6f6a008d78eb410c81848554bc4a989ff7`, Merkle source blob
`cf48bb436c5ee2b9ca01d65ed679858a591f2680`. That exact repair was inspected
before completing this report.

The fixed comparison for the integrated pin/test/draft delta is
`git diff c1f413ce14cf750199fea019d6c11948e1ed8f8b...HEAD`; the separately scoped
shared-verifier comparison is `git diff 76143eb...561fb1f`. This report changes
no production source. It is a code review, not an appointed security approval.

## Standards

Reviewed [CONTRIBUTING](../../CONTRIBUTING.md),
[QV-30 engineering standards](../30-engineering-standards.md), and
[governance](../../GOVERNANCE.md), while keeping the standards and specification
conclusions separate. No additional workers were spawned inside this review.

No new code-style, package-boundary, dependency or error-handling defect was
found in the scoped repairs. Both use existing board functions and public-data
comparisons. QV-30 section 6 S4 explicitly permits ordinary equality for public
Merkle hashes. Neither repair adds a primitive, hash domain, signed encoding,
vector format, dependency, filesystem operation or network operation. The pin
helper continues to return named `Result` refusals; the board verifier retains
its boolean interface. The small branches state the invariants directly.

The reviewed production, ordinary-test and draft-clarification commits carry
Codex author identity, matching DCO sign-off and requirement references.
Historical provenance decisions and formal sensitive-change approvals remain
outside this report. Source review and accepted-case compatibility checks also
do not replace the complete testing and release gates in QV-30 sections 8–10.

## Specification

### Integrated checkpoint helper

The [pin helper](../../packages/cli/src/checkpoint-pin.ts) closes the two R18
findings in the actual integrated source:

| Obligation | Reviewed implementation |
| --- | --- |
| Returned unchanged bytes have independent ownership | `new Uint8Array(oldBytes)` copies a normal Uint8Array or Buffer input; it does not dispatch to Buffer's shared-view `slice`. |
| Every accepted size-zero note has the specified root | `verifiedNote` checks `emptyRoot()` for zero; both retained records and candidate notes use that function. |
| Equal-size notes require equal roots | The unchanged branch compares roots directly, after both notes have been checked. |
| Existing evidence remains intact | Equal-size proposals preserve the complete prior serialized record, including its original note and held cosignature lines. |
| Growth remains authenticated and monotonic | Smaller sizes refuse; growth retains bounded exact old/new consistency verification. |

The ordinary independent tests in
[checkpoint-pin-review.test.ts](../../packages/cli/test/checkpoint-pin-review.test.ts)
cover Buffer ownership, valid empty retention and growth, multi-hash 1-to-3-to-7
growth, and exact retention of a generated witness line. Their actual R18
execution belongs to the [bug worker's receipt](independent-checkpoint-bugs-r18-20261120.md),
not to this source-only review. Retaining that line does not establish witness
policy, quorum or freshness.

The canonical record and `Result` boundaries remain intact. The input reader
checks bounds, parses strict QV-JSON, requires exactly the four expected fields
under independent origin/key anchors, and compares the canonical bytes. The
[QV-JSON parser and serializer](../../packages/crypto/src/json.ts) share their
depth, string and number domain; parsed records contain ordinary arrays and
null-prototype objects. Candidate serialization is caught and converted to a
named refusal. This is a conclusion about ordinary parsed data and the declared
API domain, not a claim about arbitrary JavaScript getters or proxies.

### Shared zero-to-zero consistency correction

[QV-18 REQ-002 and section 7.3](../18-bulletin-board-transparency.md) already
require the standard empty root, an empty proof from size zero, and equal roots
at equal sizes. The earlier shared verifier's zero-size fast path did not apply
the last condition to zero-to-zero. The actual
[Merkle repair](../../packages/board/src/merkle.ts) retains the existing empty
proof and empty old-root checks and adds equality when the second size is zero.

| Relation | Resulting source rule |
| --- | --- |
| Zero to zero | Empty proof, canonical empty old root, and identical new root. |
| Zero to a positive size | Existing empty-prefix rule; the new equality condition does not constrain growth. |
| Equal positive sizes | Existing empty-proof and equal-root branch, unchanged. |
| Positive-size growth | Existing RFC consistency algorithm, unchanged. |

The size ordering and hash-shape guards still run first. The change does not
merely move equal-size handling ahead of zero handling, which would omit the
canonical-empty-root requirement. No new protocol policy or encoding is selected.

The following caller effects were inspected without executing malformed inputs:

- [Board pin advancement](../../packages/board/src/log.ts) uses the shared
  verifier for its old/new relation, so the zero-to-zero condition now propagates
  there. This does not establish filesystem custody or requalify every aspect of
  that older helper's trusted-pin contract.
- [Inconsistency evidence](../../packages/board/src/equivocation.ts) requires
  strictly increasing checkpoint sizes before using the shared verifier; that
  permitted path remains unchanged. Its separate fork check already compares
  equal-size roots directly.
- [CLI later-proof checking](../../packages/cli/src/receipt-proof.ts) operates
  on included receipts and requested sizes of at least one; the newly constrained
  zero-to-zero branch is outside that ordinary workflow.
- [Web receipt comparison](../../packages/web/src/flow/receipt.ts) already
  compares equal-size roots directly and calls the shared verifier for growth.
- The new pin helper already checks empty-root and same-size semantics directly;
  it continues to call the shared verifier for growth.

The stopped background-runtime/gossip investigation and its files were excluded
from this review. The listed callers are the scope inspected, not an assertion
that every application path was independently qualified.

### Storage remains incomplete

The [storage draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md) now
explicitly requires an origin-level retained key association before a missing
pair-specific path can imply first use. That clarifies its existing same-origin
key-conflict rule; it does not supply a registry, lock order or recovery design.

The pin module remains unconnected to CLI and browser callers in the inspected
source. Native ACL/namespace custody, stable exclusive cross-process locking,
newest-state revalidation, strict file and directory durability, ambiguous-commit
handling and supported-platform evidence remain open. REQ-026 is not completed
by these pure verification repairs.

## Verification and handoff

This worker verified the exact source/tree/blob identities, isolated dependency
resolution, scoped diffs, existing caller conditions, commit author/DCO/Refs,
and report links and whitespace. No product tests, compiler, native Windows
execution, vulnerability reproduction or intrusive probe were run by this worker.
Ordinary R19 conformance execution and any hosted Windows outcome must be cited
from their own exact-source receipts. Positive-case checks establish compatibility
within their scope; they are not claimed as dynamic proof of every refusal.

No additional scoped code finding remains after reviewing `561fb1f`. The next
review should bind the final composed source to its hosted result, keep the
Windows timeout's diagnostic attribution distinct from a root-cause repair,
and require a separately reviewed native provider before adding stateful pin
integration. Main promotion, release and historical DCO decisions remain separate.

Refs: QV-18-REQ-002, QV-18-REQ-026, QV-18 section 7.3, QV-30 sections 6–10.
