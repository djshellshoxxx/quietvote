# Offline verifier archive adapter — 2026-11-27

## Scope and basis

Base: PR #78, `c110e06bc584e642e9130a82f7a16493ad8b12e3`.
This is a bounded implementation of [board/verifier inventory task 3](inventory-20261111/board-verifiers.tasks.md),
not full `.qvb` compatibility or an assurance promotion. No dependency, wire
format, cryptographic construction, trust authority, signing key, verdict rule or
self-test expectation changes.

[QV-18 §12–13](../18-bulletin-board-transparency.md#12-export--import-format-qvb-quietvote-bundle-v1)
defines the checksummed tar container and offline verification. The existing
[server writer](../../packages/server/src/export.ts) emits `bundle.json`,
entry JSONL, checkpoint notes, witness policy, redactions and a filtered
`election.json`. [CLI preparation](../../packages/cli/src/cmd-prepare.ts)
already checks this framing/binding. The verifier previously treated every byte
input as QV-JSON; the exact PR #78 loader accepts the fixture's full JSON but
rejects its archive as `not valid QV-JSON: bad number`.

## Implementation

[The shared loader](../../packages/verifier/src/bundle.ts) recognizes tar byte
input while preserving ordinary JSON, including a regression where JSON contains
`ustar` at the tar magic offset. It reuses
[`readChecksummedArchive` / `readTarStrict`](../../packages/board/src/archive.ts)
without extraction. Parsing bounds are 64 MiB total, 10,000 entries, 10,032 files,
and 64 KiB per descriptor. JSONL splitting stops at the entry limit before
creating an unbounded line array.

Every required file is checksummed. Entry rows must be gapless and contain exactly
the existing three members; checkpoint filenames must match parsed sizes. The
descriptor/policy log key must match the manifest copy. Entry zero must equal the
canonical manifest; every record in the filtered content copy must match its
board body at a unique integer sequence. The resulting election log contains
every board body, including derived records. No record is filtered to obtain a
more favorable report. The same shared loader serves `qv-verify` and `qv verify`;
only the standalone usage string also changes.

Embedded server/organizer keys remain untrusted. The caller's independent manifest
pin and extra-author options work unchanged and never grant another protocol
role. Other checksummed archive attachments are **unassessed**, including receipt
files, `.ots` proofs, optional detached signatures and convenience copies. Their
presence is not receipt evidence, a signature assessment or provenance. No
compressed transport is read.

## Evidence and remaining compatibility limits

[Verifier tests](../../packages/verifier/test/archive.test.ts) use real signed
records, witnessed checkpoints and threshold tally proofs. They check full
report/hash parity, caller pin behavior, supplemental-author refusals, missing
tally behavior, a failed canary load, malformed framing/checksums/JSON/sequence
and binding mutations, and actual command execution. The subprocess preload
blocks ordinary DNS (including promises/resolvers), HTTP, HTTPS, fetch, TLS and
socket connectors; eight deliberate positive controls confirm those hooks are
reachable. This is bounded in-process connector coverage, not an operating-system
network sandbox or proof against arbitrary native code. No third-party system is
contacted. Verification leaves the source archive byte-identical.

[The server regression](../../packages/server/test/verifier-archive.test.ts)
drives a real three-trustee, threshold-two election with three voters through HTTP
and a final archive export. Its manifest binds the actual log origin. The HTTP
bytes equal the actual server writer; loader content equals the full-board JSON,
not the filtered convenience file. Reports match with and without independently
held supplemental author keys. The test requires the existing encoding failures
on the aggregate and both decryption records to remain present. Its zero-witness
policy is explicit and is not described as full-evidence PASS.

**Redacted-container support is incomplete.** [QV-16 §5.5, normative item 1](../16-crypto-protocol.md#55-canonical-serialization-and-versioning)
forbids null in signed protocol artifacts; [QV-18 §12](../18-bulletin-board-transparency.md#12-export--import-format-qvb-quietvote-bundle-v1)
explicitly permits `body_b64u:null` in the outer entry JSONL, while §11.2 and §13
require partial claims after body redaction. These are distinct layers: the
accepted outer-container contract already describes the nullable field, so
implementing that narrow reader need not relax signed QV-JSON or invent a policy.
This increment retains the existing strict parser refusal (`FAIL`, including
content-only mode) and does not claim partial redacted verification.

Reusable pieces for that follow-up are the board's
[`bundleFromJson`](../../packages/board/src/bundle.ts), which already accepts
null bodies in parsed objects, and `verifyLog`, which reports partial integrity
and counts missing bodies. The repository has no duplicate-rejecting nullable
text parser found in the production TypeScript paths. Management clients such as
[`cmd-online-exports.ts`](../../packages/cli/src/cmd-online-exports.ts) use
ordinary `JSON.parse` for nullable unsigned responses, but that is not a strict
duplicate-key adapter. The protocol/body parser
[`parseQvJson`](../../packages/crypto/src/json.ts) and Python counterpart both
intentionally forbid null. The server importer and CLI preparation explicitly
require unredacted input; reusing their behavior does not finish the separate
offline redaction contract.

## Validation

Local Node 24.22.3, Linux. The final source-bound run passed **50/50 tests**, zero
skipped, in **93.578 seconds**: all 49 verifier tests plus the dedicated server
export regression (12 new acceptance tests and 38 existing regressions). The
actual command cases use `--skip-selftest` explicitly; the same run separately
passes the existing canary/self-test regressions. Full-repository typechecking
passed with a 768 MiB heap after copying the existing pinned TypeScript/esbuild
development packages into this isolated checkout. Vendor verification passed
for two pinned packages/132 verbatim files. Dependency boundaries report no new
violations (the two existing D-97 deviations remain). Link checking passed for
2,947 links in 446 files; structural traceability and `git diff --check` passed.

The exact PR #78 loader baseline rejected the new fixture archive while accepting
its JSON form; the final loader accepts both. Parser/format mutations and the
real export exercise actual implementations. Native Windows/macOS, a full server
suite, external review and release readiness are not claimed by this increment.
