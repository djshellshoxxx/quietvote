# Independent checkpoint code audit — R18 — 2026-11-20

## Result and source boundary

The R15–R17 increment is a bounded, unconnected checkpoint proposal helper. It
does not implement durable latest-per-origin retention. This independent source
review found **two concrete correctness defects**, now corrected by source review:
the unchanged-result copy depended on the input's subclass, and the empty-tree
case did not enforce its required root. Both were handed to the coordinator,
repaired in `packages/cli/src/checkpoint-pin.ts`, and independently re-reviewed
as described below. Runtime qualification remains separately attributed.

| Identity | Value |
| --- | --- |
| Published reviewed head | `995b31f804f5905f1df29f4f453ab3a404518dc0` |
| Published comparison base | `5cead2124cf189d994f2e7637d598294609ca65a` |
| Complete reviewed tree | `79f4fa63e9094b61b6c370de0f225455ff507fd4` |
| Local equivalent reviewed commit | `e31825ee9f79d44e66d966f4aed68b811bc7a24b` |
| Local comparison base | `503c166b3a0bfe69640a47ff50a457a8492c3596` |
| Helper blob | `9375fedd39db4004efe78ad8e7ece559d2370a7b` |
| Test blob | `15e6f8ce5367755630258eeca1d9277b1b325aff` |
| Storage RFC blob | `8c1cfb5a2d3b5ddadf64d6b57dbcf3ae2fd37ee0` |

The GitHub comparison contains four commits and six added files, totaling 389
lines. The local three-dot comparison has the same six paths and line count.
The audit checkout's `@quietvote/board` and `@quietvote/crypto` resolve to its own
package sources; external dependency files are shared. No applicable local
`AGENTS.md` was present in the checkout ancestry or reviewed source/doc paths.

During this review a scheduled continuation published Windows diagnostics at
`5485deb10d24ca0e64628746e954676a60919c50`, represented locally by
`c1f413ce14cf750199fea019d6c11948e1ed8f8b`. A local diff confirms the checkpoint
helper, its tests and its RFC are unchanged by that increment. This report's
code scope remains the R15–R17 checkpoint work. The scheduled R18 handoff is
separate from this actual independent worker review.

## Standards

Standards reviewed: [CONTRIBUTING.md](../../CONTRIBUTING.md),
[QV-30 sections 5–8](../30-engineering-standards.md), and the existing board
Result and crypto QV-JSON APIs. The review also considered the code-review
skill's maintainability heuristics; no additional actionable smell was found.

No separate documented-standard breach was identified beyond the behavioral
findings in the Spec section. The helper uses existing crypto/board facilities,
adds no dependency or filesystem operation, bounds notes and records before
parsing, and returns existing named error codes for ordinary invalid input.
Its disclaimers accurately distinguish a proposal from a durable update. The
four compared published commits have matching author/DCO trailers and `Refs:`
footers. That observation is not a formal security approval or a retrospective
attestation for other commits.

The R16/R17 Result repairs are coherent by source analysis. `parseQvJson`
produces plain or null-prototype objects, dense arrays and representable QV-JSON
strings/numbers within the same depth limit used by `jcs`. Therefore the reader's
canonical reserialization operates on the parser's accepted domain. Candidate
serialization is separately caught and returns `QV_BOARD_BAD_CHECKPOINT` when
auxiliary note text cannot be represented. The UTF-16 length check precedes the
bounded UTF-8 conversion. Null/nonobject anchors are checked before property
access, and `Array.from(proof).every(...)` visits sparse slots when validating
ordinary proof arrays. The R17 test helper narrows the failed Result before
reading its error and then returns the success value.

## Spec

Requirements reviewed: [QV-18 REQ-002, REQ-026 and section 7.3](../18-bulletin-board-transparency.md),
the [R15 storage draft](../rfcs/checkpoint-pin-storage-draft-r15-20261120.md),
and the [R15](../audits/CONTINUATION_R15_20261120.md),
[R16](../audits/CONTINUATION_R16_20261120.md) and
[R17](../audits/CONTINUATION_R17_20261120.md) correction handoffs.
The storage RFC is a draft implementation boundary, not a newly approved
protocol, key-rotation policy or release decision.

### C18-01 — unchanged output is not independently owned for Buffer inputs

**Priority: medium; corrected in the reviewed follow-up.**

At reviewed `checkpoint-pin.ts:103`, `oldBytes!.slice()` invokes the input
object's method. The public parameter accepts `Uint8Array`; Node `Buffer` is a
normal accepted subtype whose `slice()` is a shared view. This means the
R15 follow-up does not universally deliver its promised independent result
bytes. The existing test covers a plain `Uint8Array` only.

This is relevant to the surrounding implementation: the POSIX
[private reader](../../packages/cli/src/private-files.ts) returns a
`Buffer.subarray`, and the Windows bridge decodes its reply with `Buffer.from`.
Both are typed as `Uint8Array`. The installed `@types/node` Buffer documentation
also explicitly documents the shared-memory behavior of `Buffer.slice`.

Recommended repair: construct a fresh base typed array with
`new Uint8Array(oldBytes!)`. Check independent storage using ordinary Buffer
input as well as plain and offset Uint8Array input. This report did not execute
a mutation demonstration. No current command persists or consumes this helper.

### C18-02 — the size-zero boundary misses the empty-root invariant

**Priority: medium; corrected in the reviewed follow-up.**

QV-18 REQ-002 defines the empty root as `H("")`; section 7.3 requires identical
roots at equal sizes. The helper admits size zero because `parseCheckpoint`
accepts zero and `verifiedNote` only adds an upper size limit. It does not check
the empty-root invariant before either returning a parsed record or proposing
an initial record.

The equal-size branch at `checkpoint-pin.ts:99` delegates root comparison to
[verifyConsistency](../../packages/board/src/merkle.ts). Its size-zero fast path
precedes its equal-size branch and checks only the first root against
`emptyRoot()`. Consequently that call alone does not establish equal roots at
zero-to-zero. This conclusion follows directly from the conditions; no
malformed signed-note experiment or vulnerability reproduction was performed.

Recommended pin-local repair: in `verifiedNote`, require
`bytesEqual(root, emptyRoot())` for size zero, returning the existing
`QV_BOARD_BAD_CHECKPOINT` refusal on invalid semantics. In the equal-size branch,
explicitly compare the two roots with `bytesEqual`. Both helpers are already
exported by the board package. Valid empty-to-empty and empty-to-nonempty
transitions provide ordinary boundary coverage. A pin-local correction does not
change the general board verifier; its broader callers are outside this audit's
implementation scope.

### Independent review of the coordinator's repair

Inspected the complete source diff of
`ba9f181b53ea2aa1fe7e12b1e2592e8065e44e90`, parent
`c1f413ce14cf750199fea019d6c11948e1ed8f8b`, tree
`e820a5b81fca362bf28a49b4916b1344ca193f41`. The resulting checkpoint helper blob
is `835d5e5b491dbcf902c0a513ba0089ccca2b1fe8`.

The change constructs `new Uint8Array(oldBytes!)`, validates the empty root in
the shared `verifiedNote` path, and compares same-size roots directly. These
changes close C18-01 and C18-02 for this helper by source review. Both candidate
and retained notes pass through the added empty-root check. Positive growth
retains the exact prior/new consistency verifier and proof bounds. No board
verifier, wire encoding, dependency, CLI command or native provider changed.
The repair has matching Codex author/DCO and requirement-reference trailers.

This worker did not run the repair's product tests or compiler; their execution
belongs to the coordinator and independent functional worker. Source closure
does not qualify native persistence or the broader board verifier.

### Confirmed boundaries and partial requirements

The four-field record is bounded to 64 KiB and compared byte-for-byte with
canonical QV-JSON. Unknown fields and substituted format/origin/key are refused.
Strict UTF-8, duplicate keys, non-NFC strings, lone surrogates and other
out-of-profile JSON are handled by the shared parser. The expected origin and
strict Ed25519 log key are supplied separately; the signed note cannot replace
those inputs. The log signature covers the checkpoint text, and root/size are
derived from that text. Key provenance still belongs to the future caller.

For positive sizes, the source refuses rollback, requires equal roots at equal
size, and verifies growth against both exact verified heads with a bounded
array of 32-byte proof hashes. Same-head repetition retains the old note and
its existing cosignatures. Growth does not inherit previous witness coverage.
Missing notes, invalid retained records and failed consistency checks do not
produce update bytes. No witness policy, freshness, authority or ballot-counting
claim is created. The only input/output ownership defect found is C18-01.

A source search found no production import or invocation of the helper outside
its own file and test. **QV-18 REQ-026 remains OPEN.** Passing a pure transition
suite cannot establish a trusted latest observation, persistence or a completed
client feature.

## Storage prerequisites and next useful engineering slice

The existing file helpers do not satisfy the draft storage boundary:

| Requirement | Source assessment |
| --- | --- |
| Trusted owner, effective ACL and namespace | POSIX staging expressly excludes ACL overrides and macOS native ACLs. Windows validates held-file owner/DACL/identity, but is not an integrated checkpoint namespace provider. |
| Stable exclusive cross-process custody | No checkpoint lock exists. The server's directory-creation lock assumes a privately writable data directory and is not a kernel-held checkpoint protocol. |
| Newest-state read and proof under custody | The helper receives bytes from its caller; it cannot authenticate their recency or ensure the lock spans read, exact proof verification and publication. |
| Strict durable publication | POSIX publication catches directory-fsync errors as best effort. Windows flushes file contents and renames by handle but has no checkpoint-specific mandatory directory barrier/outcome contract. |
| Recovery and ambiguity | There is no checkpoint recovery state machine, identity-bound cleanup protocol or `AMBIGUOUS_COMMIT` implementation. |

The draft also needs an origin-level key association: deriving a file path from
the pair `(origin, key)` cannot by itself distinguish a new log from an existing
origin presented with a different key. The provider must check that association
under custody before treating an absent pair-specific path as initial. A
missing/deleted file alone is not proof that the client never observed a head.
This is an unresolved provider design obligation, not a current storage bug in
the unconnected helper.

The immediately useful implementation slice was the two pin-local repairs above,
now implemented, with ordinary empty-tree, Buffer ownership and multi-hash
append-only coverage assigned to the independent functional worker. It uses
existing APIs and contracts and does not invent a storage provider. A
subsequent persistence slice must first establish supported native custody,
locking, mandatory durability and recovery, with platform-specific evidence;
it must not wire `--pin-state` through the current general private-file writer
and claim REQ-026 complete.

## Validation and fresh-worker handoff

This worker performed source inspection, exact Git comparison, blob/source
identity checks, package-resolution checks and documentation validation. It did
not execute a product test suite, TypeScript compiler, native Windows/macOS
fixture, exploit, intrusive probe, stale-worker interleaving or crash test.
Coordinator and functional-worker results must be reported separately with
their own source identities. Historical hosted passes are not this worker's
independent execution or evidence of storage custody.

`node scripts/check-links.mjs` completed successfully in this audit checkout:
2,585 links in 404 files, none broken. The staged report passes
`git diff --cached --check`. These checks validate this report and its links;
they are not product qualification.

The next fresh code worker should verify the coordinator's C18-01/C18-02 repair
against its exact final helper blob, check that normal transition evidence runs
from isolated workspace aliases, and preserve the open storage/key-association
gates. It should confirm result-byte ownership for both existing private-reader
output types and retain the distinction between signed consistency and local
latest-state custody. The stopped background-runtime/gossip investigation and
its old untracked test were not inspected or resumed.

Standards axis: no separate actionable finding. Spec axis: two medium-priority
correctness findings in the original R17 helper, both corrected in the reviewed
follow-up; durable persistence remains an explicitly unfinished requirement.
