# Strict redacted-container parsing — 2026-11-27

## Scope and accepted contract

This succeeds the [first offline archive adapter](verifier-qvb-20261127.md)
against PR #78 `c110e06bc584e642e9130a82f7a16493ad8b12e3` plus that frozen adapter.
The baseline index tree is `83d5846d78eacb21477a868d61faeed1ea987c73`.
It completes the narrow nullable-container gap in
[board/verifier task 3](inventory-20261111/board-verifiers.tasks.md), while keeping
the existing verifier's partial and failure outcomes.

[QV-16 §5.5 item 1 / REQ-005](../16-crypto-protocol.md#55-canonical-serialization-and-versioning)
forbids null in signed protocol artifacts. Separately,
[QV-18 §12](../18-bulletin-board-transparency.md#12-export--import-format-qvb-quietvote-bundle-v1)
explicitly permits `body_b64u:null` in outer entry JSONL and requires UTF-8 without
a BOM. [QV-18 §11.2 / REQ-003 / REQ-034](../18-bulletin-board-transparency.md#112-redaction)
preserves retained header hashes and degrades claims after body redaction; §13
step 9 defines the board-level `PARTIAL` assessment. This existing container
exception does not change the signed-artifact profile or introduce a new format.

## Shared engine, separate entry points

[`crypto/src/json.ts`](../../packages/crypto/src/json.ts) adds
`parseJsonContainer(input, allowNullAt)` and separate nullable value/path types.
The trusted caller must supply a predicate, and each null is allowed only when
that predicate returns exactly Boolean `true`. Object keys are strings and array
indexes are numbers. Each callback gets a path copy, so mutating it cannot change
the parser's traversal. The existing duplicate-key, UTF-8/BOM, NFC, surrogate,
safe-integer and depth-32 rules remain in the shared engine.

`parseQvJson(input)`, its `QvJson` type and canonical serialization retain their
original no-null domain. Passing an extra predicate argument to the signed
parser cannot change that behavior. Canonical serialization still refuses
nullable container values. No canonical bytes, domain label, frozen vector or
dependency changes.

[`verifier/src/bundle.ts`](../../packages/verifier/src/bundle.ts) authorizes only
the JSONL row's exact `body_b64u` field or the exact
`board.entries[number].body_b64u` path in election-bundle JSON. Lookalike keys,
nested fields, object-shaped entry indexes, null records and null in other
metadata remain refused. Present decoded signed bodies always use `parseQvJson`.
Every board row, header, null and redaction record is retained; an absent body
cannot supply a protocol record. This adds no metadata-derived author authority
and does not reinterpret unassessed checksummed attachments.

## Two boundary regressions

The frozen first adapter's loader blob,
`c147026e81d7509cfe1d26fa3f27bbecbbb89575`, accepted checksummed JSONL and checkpoint
notes with a leading UTF-8 BOM: its default `TextDecoder` removed the BOM before
validation. Both distinguishing tests failed against that behavior, and a direct
run importing the untouched frozen loader independently confirmed acceptance of
both inputs. The successor uses the existing `decodeUtf8Strict` for both raw
members. The same resealed inputs now receive a structured `BOM not allowed`
refusal. No tar/checksum-reader code is changed in this successor.

A missing manifest body must not bypass the original manifest-copy binding.
For redacted sequence zero, the loader passes canonical convenience-manifest
bytes to the existing [`board.checkEntry`](../../packages/board/src/entry.ts)
with the retained header, expected origin, sequence zero and no author resolver.
This enforces the header's body length and digest, plus structural checks;
signature verification and caller authority remain downstream. The regression
uses a different, validly signed, same-length manifest and its matching independent
pin. Its signature passes, but archive loading refuses the mismatched header and
both text and parsed-object verification fail in normal and content-only modes.

## Partial evidence and real stored-redaction export

The [container tests](../../packages/verifier/test/archive-container.test.ts)
use signed manifests, real threshold tally evidence and witnessed checkpoints.
A correctly bound redacted manifest yields board `PARTIAL`, one redacted body,
V4 `not_run` and overall `INCOMPLETE`, identically for archive, JSON text and
parsed-object input in both modes. A redacted cast retains its header but cannot
supply the missing protocol record: the existing protocol binding rule still
makes the overall verdict `FAIL`. Missing redaction metadata also remains a
failure. No report composition or verdict rule was weakened.

The [server regression](../../packages/server/test/verifier-archive.test.ts)
drives a real three-trustee, threshold-two election with three voters through
archive export. It then advances its injected clock by 366 days, uses the
existing [`SqliteBoardStore.redactBody`](../../packages/server/src/electiondb.ts)
primitive inside an explicit retention maintenance transaction, and requests a
fresh HTTP archive after the existing artifact cache expires. The established
read-only database handle stays in place. All header bytes, checkpoint notes,
tree size and root are unchanged; the actual body is null. HTTP bytes equal the
real writer, and loaded evidence/reports equal the actual full-board JSON in
both text and object forms.

That test qualifies stored redaction and export, not a body-retention scheduler
or a public redaction workflow. Neither is implemented here. Its zero-witness
policy and existing derived-record encoding failures remain explicit, so it
does not establish a full-evidence PASS. Cold replay/import of redacted storage,
compressed transports, semantic reconciliation of derived records, and external
crypto review remain outside this increment.

## Validation

On local Linux/Node 24.22.3, the final source-bound run passed **84/84 tests**,
zero skipped, in **104.919 seconds**: all 57 verifier tests, 26 crypto parser and
adjacent regressions, and the dedicated real server export test. This includes
eight new parser tests and eight new container tests. The existing canonical-JSON
vector runner also passed its 23 frozen vectors (one selected test); no vector
expectation or file was changed. This does not claim the whole protocol suite.

Four new actual CLI invocations cover both `qv-verify` and `qv verify` on redacted
JSON and archives; they exit 3, preserve the report and leave the archive
byte-identical under the existing bounded network-connector guard. Those cases
explicitly use `--skip-selftest`; the 84-test run separately passes the existing
canary/self-test regressions. No external system is contacted, and connector
hooks are not an operating-system network sandbox.

Full-repository typechecking passed with a 768 MiB heap. Vendor checks passed
for two pinned packages/132 verbatim files. Dependency checking found no new
violations across eight packages/256 source files/1,187 imports; the two known
D-97 deviations remain. Link checking passed for 2,961 links in 447 files;
structural traceability and `git diff --check` passed. Native Windows/macOS,
full-server qualification, external crypto/security approval and release
readiness are not claimed by this increment.
