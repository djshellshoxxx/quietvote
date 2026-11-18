# Fresh review: Python controls and report dependencies — 2026-11-16

Reviewed implementation: `d30d010d171c93b420fd838afc076ea234f594ed`, including
the clean cherry-pick of report-parity source
`4efcc58cfedaaaf6a7f2833d422bb8d838e86635`.
All `verifier-py/qv_verifier` files in the independent review worktree are
byte-identical to the frozen control implementation. This is independent agent
review; required independent human security/protocol review remains separate.

## Contract and findings

Read QV-ADR-027 and the adopted register entries B1-02 option A and N-12/D-87.
The implementation correctly treats this milestone as the existing legacy
control-record authentication/reporting contract. It does not grant a notice
authority to replace manifest witness keys, relax quorum or change voting times.
The unknown non-ballot string-type row is rejected from core computation with a
nonfatal `E_VERSION`, while the separate log layer verifies control authority.
The remaining B1-02 known-malformed/marker-selection/duplicate rows are not
implicitly claimed complete.

Before the freeze, review identified missing limits from the adopted control
schema: action/reason bounds and the 1–8 signature count. The author repaired
them and moved the cheap per-type byte limit ahead of control signature work.
The final implementation enforces UTF-16 code-unit bounds for the existing
wire contract, exact closed fields, strict signatures and distinct signer quorum.
No production correction was authored in this review branch.

The three report-dependency repairs were also reviewed. An unauthenticated
manifest now stops dependent work; failed tally decryption prevents rule
evaluation; a failed published-result comparison emits no accepted `results`.
The guards are limited to those dependencies and preserve successful results.
No corpus or comparator expectation was changed to obtain agreement.

## Independent executable evidence

Five new tests in `verifier-py/tests/test_log_controls_fresh_review.py` use
independently generated two-of-two coordinator signatures and correctly re-signed
board headers/checkpoints. They establish that:

- one signer or repeated copies of one signer cannot satisfy two-of-two quorum;
- record signatures from another manifest do not authorize this election;
- valid coordinator record signatures do not authorize an outsider's board
  header, even when that key is explicitly supplied as an extra author;
- unknown actions/spellings and policy or future `control_seq` fields are rejected;
- valid boundary-length Unicode reasons work, while oversized reasons and zero
  or nine signatures are rejected.

These small board-only transcripts isolate header/record authorization. They are
not presented as complete valid election evidence.

A sixth new test in `test_log_fresh_review.py` supplies a real election fixture
without coordinator signature quorum and a structurally unusable board object.
Both the API and actual isolated Python CLI report only the manifest signature
failure, leave every dependent check `not_run`, emit no context/results, and
return the expected failure exit. Optional evidence cannot be trusted before
the manifest is authenticated.

The preceding six stable-log review probes were rerun with the control/parity
implementation: **12 fresh tests passed, 1.68 seconds**, with no failures.
The six report-parity tests separately passed on the combined stable-log/parity
source in **4.37 seconds**.

The complete suite on the frozen control/parity implementation plus all twelve
fresh probes passed: **140 tests, 0 failures/errors, 98.419 seconds, exit 0**,
using `PYTHONPATH=verifier-py python -m unittest discover -s verifier-py/tests -v`.
This includes every shipped log vector with no capability skip, the original
Python tests, the author's control/parity regressions and the fresh probes.
`git diff --check` passed. No production, corpus or comparator file was changed
by this review.

## Boundaries and handoff

No additional blocker was found in this scoped review. The legacy notice evidence
path and the 35 stable cases are now reviewable together; all 48 shipped log cases
are exercised by the unchanged corpus tests. Full V13 terminal/window effects,
the separately approved B2-05 versioned counter transition, the remaining B1-02
rows, external cryptographic review and operational/browser/platform qualification
are separate work. These results do not establish project or release completion.
