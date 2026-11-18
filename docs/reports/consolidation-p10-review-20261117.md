# P10 authenticated election marker conflicts — independent review

Reviewed exact commit `a0f6c2565256b036eb1d8835998c6717a0284ceb`, tree `266c5a41a87802fc3d512982002f01eb93a03516`, parent `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`, in `session-evidence/quietvote-p10` on 2026-11-18 UTC. The worktree was clean before and after review. No product source or remote metadata was modified by this workstream.

## Finding

**No blocking issue found in the reviewed P10 delta.** Both implementations authenticate the existing coordinator threshold before comparing canonical election-marker bodies. Identical authenticated bodies remain nonfatal duplicates and retain the first marker; differing authenticated bodies fail the time-window check, stop dependent computation, and cannot publish a result. Invalid or unauthorized signatures cannot occupy the phase or create the new fatal conflict. The original DKG-marker duplicate path is unchanged.

This is source review and focused execution, not a formal GitHub approving review, CODEOWNER approval, designated security-reviewer-group approval, full integration review, or election qualification. Canonical `72bccc6` retains the old behavior until a candidate is integrated through its required gates. The separate P11 candidate is not part of this tree.

## Approved behavior and documentation

`docs/plan/DECISIONS-2026-11-04.md:85–93` recommends P10 option A: a differing authenticated duplicate is fatal `E_MARKERS`, while an identical repeat remains class L. It explicitly covers both election-open and election-close and calls for Python parity. `docs/decision-log.md:334–342`, QV-ADR-027, records owner acceptance of the register recommendations and permits implementing commits to clarify specifications and errata. It explicitly preserves the independent security-review gates.

The new QV-16 §5.14.3 paragraph and corresponding current classification/errata text accurately state that adopted behavior. They qualify the earlier general “first valid marker wins” wording, rather than silently replacing the behavior of every duplicate or DKG marker. Comparison is of canonical bodies, excluding signature-envelope ordering. The documentation correctly specifies schema and threshold validation before comparison, failure of `chk.time.window`, preservation of completed manifest/trustee results, and no dependent ballot/tally/rule results.

The tests use the existing closed-schema `qmask` field to produce two distinct validly signed bodies. They do not adopt the decision register's illustrative `opens_at` as a new wire field. No schema extension or invented marker field is introduced.

## Source reasoning

**TypeScript.** `packages/protocol/src/verify.ts:317–329` admits only schema-valid election-open/close records into the later-marker path; the separate pre-key DKG marker path is unchanged. At lines 466–478, `verifyMultiSig` is evaluated first. Only successful records enter the map or reach the equality/conflict branch. `packages/protocol/src/records.ts:31–42` still counts distinct allowed keys whose signatures verify in the supplied scope; this function is unchanged.

The equality at `verify.ts:471` compares `H(jcs(...))`, where `H` is `bytesToHex` at line 45. It is an exact encoding of canonical bytes, not a hash-based equality shortcut. It ignores object insertion order and all signature-array content while retaining every schema-valid body field. The first stored record remains unchanged on an identical repeat.

On conflict, the default finding class is F; lines 474–476 set `chk.time.window` to fail and immediately return through the ordinary finalizer. Ballot processing begins only at line 523. Consequently the blank dependent checks remain `not_run`, counted-ballot output and results have not been created, and completed manifest/trustee checks retain their values. The finalizer may still examine independent supplied log evidence, but it neither clears the fatal finding nor resets the failed window; fatal findings take precedence over content-only and incomplete-log verdicts.

**Python.** `verifier-py/qv_verifier/election.py:372–408` filters QV-JSON, protocol and schema failures before records reach marker processing. Lines 490–503 restrict this change to election-open/close and call `_coordinator_ok` before either insertion or comparison. The existing signature verifier requires distinct allowed coordinator keys; the threshold logic is unchanged. `qvjson.jcs` byte equality uses only the body, with no signature-order dependency.

At lines 497–500, a mismatch adds a fatal finding on `chk.time.window` and calls the existing `_stop`. Its completed-check tracking preserves manifest and trustee results; earlier failed checks are not relabeled. Ballot processing and result generation are never reached. The report construction gives fatal findings precedence, including in content-only mode. The separate log verifier appends findings and does not erase the core fatal finding or create outcome results.

No cryptographic equation, nonce registry, wire schema, threshold verifier, dependency, workflow, historical audit record, comparator exclusion or expected vector result changed. The entire `test-vectors` tree is identical to the parent (`70c3d44d5d49785d78caff57ea9c7952f5bda6bf`), as is `packages/crypto` (`c32598e04712215fc84fe1fcc2be6fa899f2b434`). This establishes absence of vector weakening in the diff; it is not a claim that this review reran every vector.

## Independently executed verification

All execution below used the exact reviewed head, serially. No product file, assertion, expected result or timeout was edited.

| Check | Independent result | Evidence |
|---|---|---|
| TypeScript selected protocol tests, Node 24.22.1 | **11/11 passed**, zero failures or skips | `p10-typescript-focused.log`, `p10-typescript-receipt.json` |
| Python selected tests, Python 3.12.14 | **15/15 passed**, zero failures | `p10-python-focused.log`, `p10-python-receipt.json` |
| Diff validation and worktree state | Passed; clean | `p10-review-receipt.json` |

The TypeScript selection contains all seven new P10 tests, three existing non-ballot-classification controls and the existing P3 identical/conflicting tally regression. The new tests cover honest content-only results and the default missing-log gate; identical open/close bodies with reversed object-key and signature-array order; different authenticated bodies in both first/second positions and both verification modes; and invalid authorized signatures or valid outsider signatures before and after the valid marker.

The Python selection contains all four new P10 test methods, existing non-ballot-noise, forged DKG/roll-marker and missing-close controls, and the report dependency/early-stop tests. Its new conflict method executes all eight combinations of marker name, conflicting-body position and verification mode. Both languages assert failed window status, fatal `E_MARKERS`, retained completed checks, unrun ballot/tally/rule checks, and no results. The unchanged honest results, invalid-signature behavior, malformed-record classification and missing-marker incompleteness remain covered.

Exact commands, source/tree, timestamps and clean-worktree observations are recorded in the receipts. Log SHA-256 values are:

- TypeScript: `63785f20ae66a796dc423c4b47616fed757221266ad0d294f52310b5bc8432dc`
- Python: `73ed845c729f7c335b7321bcad1d118115eaf6224c645cc2254559c89acb1efd`

## Limits and remaining gates

The new authentication fixtures use a one-of-one threshold, testing an invalid allowed-key signature and a valid outsider signature. They do not exhaustively retest all multi-coordinator thresholds; the general threshold functions are unchanged and were inspected. The focused runs cover absent board evidence in default/content-only modes, while supplied-log finalization was reviewed in source rather than exercised across every log case.

I did not rerun the full protocol/Python suites, full repository typecheck, vector runners or strict cross-language comparator. Those are separate root-workstream gates. The reported full-typecheck attempts killed with exit 137 are not passing results; the implementing agent's successful protocol-project typecheck is narrower. No combined-source candidate is covered by this receipt.

The local commit's DCO trailer matches its author, and the independent review found no required source correction within scope. The required human/security approvals remain outstanding and are not supplied by this review or the owner's prior design decision.

Published candidate: [PR #64](https://github.com/djshellshoxxx/quietvote/pull/64), head `4b88209afb5a6c8fba1df06e0af8d1c1ac21d15f`. This is an unmerged candidate; the review and executions above remain bound to their explicitly recorded local commit and tree.

## Publication note

Session-evidence paths and bare execution-log names identify intermediate evidence outside this repository. This report preserves their exact source, commands, results and available hashes; they are not repository download links. New candidate PRs and current hosted-CI status are recorded in the [current reconciliation](consolidation-current-recheck-20261117.md). Original canonical statuses remain bound to their stated SHA.
