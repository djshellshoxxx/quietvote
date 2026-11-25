# Approved Python report dependencies — 2026-11-16

## Source and decision basis

Signed implementation commit: `4efcc58cfedaaaf6a7f2833d422bb8d838e86635`,
based on `bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912`.
This is a narrow Python report milestone, independent of the parallel log-layer
implementation. It does not replace complete-candidate qualification.

QV-ADR-027 in [the decision log](../decision-log.md) explicitly adopts the
recommendations in [the approved register](../plan/DECISIONS-2026-11-04.md).
DIFF-count-altered, DIFF-manifest-signature-removed and DIFF-result-flipped each
recommend option A. The older D-92–D-94 alternatives were proposals, not a later
recorded approval superseding QV-ADR-027. Current instructions authorize feature
completion, so these existing decisions are implemented rather than carried
forward as unresolved approval gates. QV-35-REQ-003/005 and the append-only
[errata addendum](../errata/spec-errata-log.md) record the exact scope.

## Implemented behavior

- An insufficient coordinator signature quorum stops verification before any
  untrusted log is examined. The independently checked manifest hash remains
  `pass`, the signature check is `fail`, dependent checks are `not_run`, counts
  remain zero, and context/results are absent.
- Any failed decryption check prevents rule evaluation, including a published
  count differing from the independently recovered count. The decryption error
  remains visible; rules are `not_run` and results are absent. Already completed
  checks and the separately verified spoiled-ballot evidence retain their scope.
- Published results that differ from independently evaluated results produce
  `E_RESULT`; the report does not emit the recomputed result as an outcome of a
  failed rule check. Honest results are retained.

No TypeScript arithmetic was imported or translated. No vector file, expected
report, comparator condition or excluded capability changed. These changes do
not implement unknown/control-record classes, missing-log verdict policy,
INCOMPLETE or trustee-mode spoil behavior.

## Validation

All commands below completed with exit 0 on the implementation source above.

| Check | Result |
|---|---|
| Focused `test_approved_report_parity.py` | 6 tests passed, 3.95 seconds |
| Full `python3 -I -m unittest` from `verifier-py/` | 77 tests passed, 22.36 seconds |
| Unchanged Python vector sweep | 282 total; 234 PASS, 0 FAIL, 48 NOT-IMPLEMENTED |
| Unchanged strict `npm run verifiers:compare` | 27/27 detailed reports agree; 27/27 verdicts agree; 0 disagreements |
| `npm run links:check` and `git diff --check` | Passed |

The six focused tests include the existing mutations, independently invalidated
manifest signatures with a malformed downstream log, changed counts for each
option with both honest and false result declarations, an assertion that rule
evaluation never executes on those counts, and an honest control. No new test is
skipped. The 48 unsupported log cases are the state of this lane's pre-log base;
the separate log milestone has its own source-specific receipts. Comparator
agreement excludes `chk.board.append_only`, `chk.board.witness` and
`chk.receipts.sample` under its unchanged shared-capability contract.

The [machine-readable receipt](../reports/python-report-parity-20261116.json)
records command results and source provenance. The comparator's generic line
about report differences remaining failures is unchanged; the immediately
preceding measured line reports zero differences for this run.

## Fresh-agent handoff

1. Integrate `4efcc58` once. The log author already cherry-picked it as dependency
   `1b0d67c`; that alias is not a second implementation. Its `_verify` changes do
   not overlap the log milestone's `verify_bundle` wrapper.
2. Fresh independent review is requested; no completed external review is
   claimed by this author. Check the signature boundary, count/result emission,
   and preservation of independent completed checks against QV-35.
3. Run the unchanged full Python suite, vector sweep and strict comparator on the
   combined source after log/control work. Do not infer its result from this lane.
4. Preserve unresolved issues outside these three approved dependency choices;
   maintain separate review and release evidence.
