# Python incomplete-tally milestone — 2026-11-16

Implementation source: `0a73091ab73532b17dcabbcde15a1830a1bbd1fa`.
This lane starts from integration source `2634571` plus the approved legacy-control
milestone `d30d010` (local dependency alias `2bc409b`). Integrate the implementation
commit once after those dependencies; the alias is not another control change.

## Decision and scope

[QV-ADR-027](../decision-log.md) explicitly adopted the approved register's
PY-02 option A: INCOMPLETE is a protocol report state with CLI exit 3. The earlier
D-96 text was a proposal, not an approval revocation. QV-16 Appendix C and QV-34
now specify the existing TypeScript precedence, so this implementation does not
invent a new outcome policy.

- Any fatal finding yields FAIL.
- Otherwise, `chk.tally.decrypt: not_run` yields INCOMPLETE; otherwise PASS.
- No tally leaves aggregate, decryption and rule checks `not_run`, retains already
  verified counts/context and completed checks, and emits no results.
- A rejected or conflicting tally retains its applicable errors. Invalid
  manifest or board evidence still yields FAIL despite missing tally evidence.
- The actual Python `verify` executable returns PASS=0, FAIL=1, INCOMPLETE=3.
  Explicit unsupported-capability reports also retain exit 3 and their distinct
  JSON `status` field.

This is the narrow PY-02 migration. It does not alter the separate P1/TSV-05
missing-log default or introduce a bundle-controlled opt-out. That broader
interface/caller migration is assigned to a subsequent team. No vector file,
expected report or strict comparator condition changed here.

## Validation

The six new regressions first reproduced two baseline failures: absent tally was
reported FAIL with a fabricated `E_SCHEMA`, and the actual CLI returned 1 rather
than 3. After the fix, all six passed in 3.815 seconds. They cover absent tally,
preserved verified checks/counts, no rule evaluation/results, fatal manifest and
board precedence, rejected/unsupported tally bodies, conflicting tallies, and
actual CLI exits for pending, complete and invalid inputs.

An independent invocation of the existing TypeScript API on the same honest
fixture with only its tally removed returns INCOMPLETE, the same 4/1/4 counts,
three tally/rule checks `not_run`, and no results.

On the implementation source above, all validation commands returned exit 0:

| Check | Result |
|---|---|
| Full Python unit/regression suite | 140 tests passed; 111.01 seconds wall time |
| Unchanged Python vector CLI sweep | 282 PASS, 0 FAIL, 0 NOT-IMPLEMENTED; 55.58 seconds |
| Unchanged strict cross-verifier comparison | 27/27 detailed reports and verdicts agree; 22.38 seconds |
| Markdown links and diff checks | Passed |

The corpus is byte-identical to integration source `2634571`. The
[machine-readable receipt](../reports/python-incomplete-20261116-validation.json)
records the source/tree and commands. These results are a lane receipt, not a
claim about a later combined candidate.

Fresh independent review on the exact code is recorded in signed commit
`1add533382707ca7c904f99e2e471033dab95c6c`. Its four additional tests passed in
3.944 seconds: an authenticated pre-tally log remains INCOMPLETE; a genuine
larger observed signed head makes a truncated export FAIL for rollback; actual
CLI exits remain 3/1; nonfatal log noise does not invent an outcome. The reviewer
also reran the six owned tests successfully. No scoped blocker or production
repair was found. Integrate that review commit separately; external protocol
review remains distinct from agent review.

## Fresh-agent continuation

1. Review the three production changes and the rejected-tally/fatal precedence.
2. Add authenticated log evidence to the no-tally case, preserving exact body/log
   binding; test that a valid log does not manufacture a tally and a signed fork
   remains fatal. The reviewer owns these independent probes.
3. Integrate the narrow milestone before the separately approved missing-log
   default/caller opt-out migration. Do not use that migration to weaken a
   malformed supplied board into absent evidence.
4. Record exact combined-source qualification; this lane's pass does not cover
   later changes to caller defaults or other election semantics.
