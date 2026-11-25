# Fresh review: Python incomplete tally verdict — 2026-11-16

Reviewed source: `0a73091ab73532b17dcabbcde15a1830a1bbd1fa` on the previously
reviewed controls/parity milestone. Production Python files in this independent
worktree match that source exactly. This is an independent agent review, not
independent human cryptographic qualification.

QV-ADR-027 / PY-02 approves the `INCOMPLETE` report state for an otherwise
nonfatal election without tally evidence and CLI exit 3. The implementation
preserves fatal-finding precedence, keeps unperformed aggregate/decrypt/rules
checks `not_run`, and emits no result. A rejected or conflicting tally remains
a failure. The final verdict condition does not downgrade existing fatal findings.
No blocker was found in this narrow change; no production repair was needed.

Four independent tests in `verifier-py/tests/test_incomplete_fresh_review.py`
reuse the exact signed/witnessed size-23 checkpoint in the unchanged log corpus,
after election-close and before its tally at sequence 23. No signature or
checkpoint is manufactured for these cases:

- The authentic pre-tally prefix verifies its available board/witness evidence
  and reports `INCOMPLETE` without claiming an outcome.
- Supplying the genuine later size-24 checkpoint makes that same view a fatal
  authenticated rollback; missing tally does not downgrade it to `INCOMPLETE`.
- A nonfatal unknown non-ballot record does not fabricate a fatal tally error or
  produce a final result.
- The actual isolated Python CLI returns exit 3 for the authentic pending prefix
  and exit 1 for the same prefix with the later observed head.

Validation on the exact source: **four independent tests passed in 3.944 seconds**;
the author's six targeted PY-02 tests independently reran successfully in
**3.904 seconds**. `git diff --check` passed. The author is running the full suite;
this review does not repeat the preceding 140-test milestone or claim its result
for these changed bytes. No corpus/comparator expectations were changed here.

The approved P1 policy for absent log evidence is a separate following milestone;
it is not implemented or inferred by this narrow no-tally review. Its missing,
malformed and interrupted board paths and caller-only content-verification option
require separate qualification. Shared new no-tally conformance-vector coverage
can be integrated with that verdict-policy update; the unchanged corpus itself
is not claimed to include a newly added no-tally vector.
