# Fresh Python stable log review — 2026-11-16

Reviewed implementation: `964287d7df2f44b1d1191d33459be677e558c82a`.
The separate review worktree starts at that frozen commit. This is an independent
agent review, not independent human cryptographic/security qualification.

## Findings and repairs

1. **Malformed board transport could report PASS.** A valid election/board with
   `spec: "QV-19"`, `generator: []`, a policy missing `witness_policy`, or a
   redaction record containing only `seq` passed the optional log verifier during
   review. The author repaired the v1 structural checks before freezing this
   commit. The policy copy is checked as transport data and still supplies no
   trusted witness keys, threshold or verification authority.
2. **Receipt ownership needed a ballot binding.** Header-author equality and a
   body field named `voter` alone could match a receipt claimant for otherwise
   authenticated external evidence. The author now also requires an actual
   cast/spoil ballot and the matching header type. This was a named receipt-check
   defect, not a demonstrated whole-election acceptance bypass: the existing core
   already rejected the unknown record. The repaired mismatch is a nonfatal
   claimant alarm; an untrusted claim cannot establish a fatal log contradiction.

No further blocker was found in the reviewed stable evidence scope. No production
repair was authored in this review branch.

## Independent probes

`verifier-py/tests/test_log_fresh_review.py` retains six tests. The board-only
synthetic transcript deliberately is not a complete valid election. Its known
test signing seeds permit validly re-signed adversarial headers and checkpoints;
negative tests therefore cannot pass merely because stale signatures or tree
roots were rejected.

- The repaired required metadata and redaction shapes reject malformed variants.
- A signed header with a self/forward reference fails after the tree and full-size
  checkpoint are correctly re-signed.
- Correctly authenticated non-ballot external evidence is not a voter's ballot,
  even when its author and a body field named `voter` equal the claimant.
- External fork/rollback evidence is fatal only under the manifest-pinned log
  signature; an impostor's signed note is ignored with a visible note.
- A failed manifest anchor leaves board/witness/receipt checks `not_run`.

Source review also checked canonical header/base64/note/receipt framing, strict
Ed25519 verification and record-specific author binding, nonce uniqueness,
one-to-one board/protocol views, recomputed Merkle prefixes and full-size heads,
manifest-first witness anchors, duplicate-key/time handling and time gates,
redacted-body supplementation and receipt evidence classification. The review
used QV-18, board NOTES, protocol NOTES X21–X30 and the existing transport contract.

## Scope and next milestone

This frozen milestone implements 35 log corpus cases and explicitly returns
`NOT-IMPLEMENTED` for the remaining 13 notice/control cases. That is an accurate
description of these bytes, not a conclusion that implementation must remain
blocked: root's later contract review identified the accepted QV-ADR-027 decision
register, B1-02 option A and N-12/D-87 as authorization for the existing narrow
control record/signature and non-ballot finding semantics. A fresh follow-on can
implement those cases with the report-parity worker owning `election.py` changes.

V13 terminal/window effects are separate from authenticating and surfacing control
records. The B2-05 signed `control_seq` migration is also a separate versioned
contract from the existing legacy corpus. This review does not silently choose
either extension or weaken the existing corpus/comparator expectations.

## Validation

The six fresh probes passed on the frozen implementation (6/6, 0.51 seconds).
The complete Python suite passed on the same implementation plus these six tests:
**119 tests, 0 failures/errors, 84.96 seconds, exit 0**, using
`PYTHONPATH=verifier-py python -m unittest discover -s verifier-py/tests -v`.
This includes the stable corpus cases and explicit notice capability classification
as implemented at this milestone. No vector files or comparator expectations were
changed. `git diff --check` passed.
