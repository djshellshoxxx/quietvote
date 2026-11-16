# Python QV-18 capability handoff — 2026-11-16

## Completed boundary

Signed-off commit `71970b6` implements `benaloh.private_audit` using the existing independent
Python arithmetic. `python3 -I -m unittest` in `verifier-py` ran **71 tests, OK**; the focused
private-audit discovery ran **13 tests, OK**. The complete vector sweep reported **282 total,
234 PASS, 0 FAIL, 48 NOT-IMPLEMENTED** and all **79** manifest-listed file hashes matched.
The five private-audit cases now pass. Valid alternative CDS and limit proofs were independently
constructed in tests: envelope verification accepts them, but private auditing rejects them
because the complete deterministic ballot body does not reproduce byte for byte.

No QV-18 implementation files were created. This handoff is the deliberate fresh-worker boundary.
The 48 `log.verify_election` cases remain unsupported. D-92 through D-96, vectors and the shared
comparator are unchanged. No remote write was performed.

## Inputs and implementation sources

Use QV-18 (`docs/18-bulletin-board-transparency.md`) together with the current byte-format choices
in `packages/board/NOTES.md` and protocol contracts **X-21 through X-34** in
`packages/protocol/NOTES.md`. The independent verifier must not import, invoke or translate the
TypeScript implementation. This worker read those notes and the corpus, not the log implementation.

The complete corpus is `test-vectors/v1/elections/log-layer-4v/vectors.json`: **48 cases**, backed by
an honest bundle/export, an adversarial bundle/export and 11 notice scenarios. Each input is
`{bundle: {path}, board: {path, replace?}, receipts?, observed?, witnesses?}`; paths are relative to
the supplied `v1` root and `replace` shallow-replaces top-level export fields. There is no supplied
consistency path: the full tree is available, so checkpoint consistency is checked by recomputing
each prefix root. Receipts do contain RFC 9162 inclusion paths.

Keep D-89 open: use the existing corpus origin `quietvote/v1/base32(election_id)` (26 lowercase,
unpadded base32 characters), not QV-18's older 32-character hex wording. `bb.log_id` is lowercase
hex SHA-256 of the UTF-8 origin. A witness waiver is surfaced prominently and **never** changes
the manifest's quorum, trusted keys, phase gates or closing time.

## Existing Python seams

* `election.verify_bundle(bundle)` already implements the protocol computation and produces the
  full 14-check report, counts, findings with `fatal`, codes and notes. Without board evidence,
  board and receipt checks remain `not_run`. It currently has no board-evidence option.
* `merkle.py` supplies leaf hashing, internal hashing and full/prefix root recomputation. It has
  no inclusion/consistency-proof verifier yet. `ed25519.py` supplies strict signature verification.
* `runner.py` runs registered operations as `run_op(op, input)` without the vector-root context.
  `test_vectors_cli.py` does the same. Add explicit bounded file-reference resolution for this
  operation rather than assuming the checkout or process working directory; reject traversal and
  symlink escapes outside the supplied vector root. Support direct in-memory verification too.
* The runner's existing generic negative comparison checks the error code but not `failed_checks`.
  Full log tests must independently assert exact failed-check sets, `verdict:` tags and `surfaces:`
  caveat tags. Do not weaken the shared comparator or claim conformance from error-code matches.
* `tests/test_private_audit.py` explicitly asserts the log operation is absent from `OPS`. Change
  that only when the complete operation is implemented and all contract checks are accounted for.

## Exact transport observations

These observations were checked against the corpus and existing Python signature verification;
they are not new normative decisions. Add explicit format tests and record unresolved choices.

The export has `format: "qv-bundle/v1"`, `origin`, `created_at`, `tree_size`, `root_b64`, `generator`,
`spec`, `entries`, `checkpoints`, `receipts`, `policy`, `redactions`. Entries are
`{seq, header_b64u, body_b64u}`; body can be null when a matching redaction is listed. Export policy
is never a witness trust anchor. Current exports deliberately carry quorum zero in this untrusted
policy while the signed manifest requires two witnesses.

The observed binary header is big-endian: `u16(v)`, `u16-length(origin UTF-8)`,
`u16-length(type UTF-8)`, `author[32]`, `u16-length(author_alg UTF-8)`, `author_nonce[16]`,
`u64(created_at)`, `u64(body_len)`, `body_digest[32]`, `u16(ref_count)`, refs, `u16(sig_len)`, sig.
All corpus refs are empty; test nonempty refs independently against the documented u64 convention.
All corpus author signatures are 64-byte Ed25519 signatures. For the honest first header, strict
Python verification succeeds over `b"QV-ENTRY-v1\0" + header_without_signature_length_and_signature`;
including the two-byte signature length fails. The header leaf includes the complete signature.

Board-local key ID is `SHA256(b"QV-KEYID-v1\0" + alg + b"\0" + pk)`; body digest is
`SHA256(b"qv/body/v1\0" + body_bytes)`. Enforce canonical header decoding, strict base64/base64url,
length limits, no trailing bytes, safe nonnegative integers, valid origin and algorithm, earlier
references, header signatures, authorization, nonce uniqueness and phase grammar.

Checkpoint text is exactly `origin + LF + decimal_size + LF + standard_base64_root + LF`, then
one additional LF and signed-note lines. Each line is `— name base64(payload) LF`. Log payload:
`keyhash[4] || sig[64]`; Ed25519 cosignature payload: `keyhash[4] || u64(timestamp) || sig[64]`.
The key hash is `SHA256(name + LF + one_byte_type + pk)[:4]`, type `0x01` for the log and `0x04`
for witnesses. Log signs the three-line checkpoint text including its final LF. Witness signs
`"cosignature/v1\ntime <decimal timestamp>\n" + checkpoint_text` (actual LF bytes).

Receipt JSON flattens `sequenced_at` and `checkpoint_deadline`, unlike the symbolic nested promise
in QV-18 §7.1. Strict Python verification of an honest corpus receipt succeeds over
`b"QV-RECEIPT-v1\0" + u16(len(origin_utf8)) + origin_utf8 + u64(seq) + leaf_hash[32] +
u64(sequenced_at) + u64(checkpoint_deadline)`. Domain separators above mean actual NUL bytes.

## Verification requirements to preserve

1. Bind every board entry to the exact JCS protocol record at the same sequence, including
   manifest at zero; no extra or omitted entries. A redacted body still needs its committed
   digest/length to match the supplied protocol record. Map types and resolve header authors as
   X-22 specifies. Check exact roots, every export checkpoint signature and the full-size head.
2. Sort checkpoint processing by size rather than trusting file order. Only valid log-signed
   heads are evidence. Export-invalid heads fail; unsigned/malformed externally observed heads
   are warnings. Same-size conflicting signed roots or a different signed prefix are forks;
   a signed observed head larger than the held tree is rollback.
3. Witness keys come from the hash-pinned manifest, falling back only to explicit caller anchors.
   Count distinct valid public keys once. Unknown/impostor/duplicate/tampered signatures do not
   satisfy quorum. A witness with timestamps decreasing as size grows is excluded, with an ALARM;
   it must neither supply quorum nor alone force a fatal verdict.
4. Open gate: witnessed size in `[max(seq(dkg-final), seq(roll-commit)) + 1, seq(open)]`. Tally gate:
   witnessed size in `[seq(close), seq(tally)]`. Earliest witnessed head covering each marker
   (`size > seq`) must have at least quorum timestamps meeting the manifest bounds (open lower
   bound; close lower and upper bounds). Missing covering heads are fatal once a tally exists.
   Latest/tally witnessing is otherwise a surfaced caveat. Quorum zero stays `not_run` with
   `NOT WITNESSED` and unwitnessed-time caveats.
5. Verify receipt promise, inclusion path against its signed head, and prefix membership in the
   held tree. Authenticated broken promises are fatal. Malformed/forged promises fail only the
   sample check (class I, verdict can remain PASS). Claimed voter/code mismatch or two claimants
   are ALARM `E_LOG_RECEIPT_CLASH`, not proof of operator wrongdoing.
6. Control entries use the closed record `{body: {proto, type:"control", action, reason?}, sigs}`.
   Their header author must be a manifest coordinator and they need coordinator threshold
   signatures on `sig-record(manifest_hash, "control", body)`. Honor exact action-to-header mapping
   in X-31. Unknown fields/actions/body forms fail closed. Authenticated extensions after close
   fail the time check; earlier extensions, pause/resume and waivers are caveats only.

## Concrete unresolved reporting contract

`election.py` currently emits **fatal `E_SCHEMA`** for a control/unknown record rejected by
`_record_schema_ok` (around lines 338–347). The corpus's two positive notice cases
`notice-waiver-reported` and `notice-extension-reported` require **verdict PASS** with
`chk.encoding.canonical = fail`; protocol NOTES explicitly describes **class L `E_VERSION`** for
these unknown QV-16 records. Thus straightforward composition with the existing Python report
cannot pass both cases without changing finding semantics. This is the existing B1-02/SG7
unknown-record parity gap documented in `verifier-py/NOTES.md`, not a missing crypto primitive.

Do not mask that finding, special-case vector IDs, rewrite expectations, or advertise full support
for all 48 cases. Root directed the fresh worker to implement the complete stable non-control
board/witness/receipt path while returning explicit per-input NOT-IMPLEMENTED for control/notice
inputs whose classification conflicts. This is permitted only with transparent capability reporting;
the existing core finding semantics must remain unchanged. The owner still needs to authorize the
precise unknown/control-record classification before that final group can become supported.
D-92 through D-96 remain untouched. No semantic change was made in this milestone.
