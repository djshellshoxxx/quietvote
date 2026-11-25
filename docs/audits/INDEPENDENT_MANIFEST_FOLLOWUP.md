# Independent adopted manifest policy follow-up

## Result and exact scope

**PASS for this narrow engineering follow-up; no blocking defect identified.**
Reviewed and tested on 2026-11-19 by the independent reviewer that assessed N-27's
decision authority, without implementing the production correction. This receipt
does not replace the earlier core or recovery reviews.

| Binding | Exact value |
| --- | --- |
| Integrated source reviewed and tested | `a030b013c9227c83b0e1f6738b67373632119d8d` |
| Source tree, before this report | `c1b4eda66cab54a7bb7557bad6095201a527ca3e` |
| Integrated parent used for the comparison | `bf79ef73b497150ec485894426a03f3e21e27669` |
| Worker source incorporated by the integration | `338b95088ecf4e5411ee76ced41d4ac5b23e1a8d` |
| Production correction | `6158f61e001013ddfe928d4d353ba25e618f08a9` |
| Specification and positive-control follow-up | `8c94e5f241a1ed8dae3c908c21e65fe2728d4cf2` |
| Isolated reviewer branch | `worker/quietvote-independent-manifest` |
| Python used for independent executions | `3.12.14` |

The integrated diff contains two production files,
[`manifest.py`](../../verifier-py/qv_verifier/manifest.py) and
[`rules.py`](../../verifier-py/qv_verifier/rules.py), four test/fixture files and
six documentation files. There are zero deleted files. TypeScript production,
`test-vectors/`, the shared verifier comparator, dependency manifests and lockfile
are unchanged by this integration. The reviewed files match the worker source.
The reviewer changed only this report in the isolated checkout and did not
install dependencies or occupy the Node execution slot.

## Authority, behavior and boundary review

[ADR-027](../decision-log.md#qv-adr-027--owner-approval-of-the-2026-11-04-decision-register-categories-ad)
adopts the register's recommended defaults; [N-27](../plan/DECISIONS-2026-11-04.md)
selects option A, reserving the eligible/roll contest threshold beyond suite v1.
Both were adopted in `761da0a45c538aa2232ee5511eb84e3fc1ca4e21`.
The October 21 eligible-base prose predates that decision. Its retention during
the November 16 tie reconciliation did not select N-27 options B or C. The active
QV-16, QV-20, QV-03 mapping note, errata and Python capability notes now reflect
that adopted restriction. The broader group-rule examples remain identified as
outside the suite-v1 threshold contract.

The correction preserves `counted`: it was already accepted by the TypeScript
schema at the adoption commit, N-27 says "No change" and "freezes surface", and
the approved tie corpus explicitly covers a counted basis. It also preserves
valid blank ballots and the distinct participation-quorum `basis:roll` contract.
This does not create a third abstain option in yes/no ballots.

| Reviewed boundary | Independent conclusion |
| --- | --- |
| Manifest threshold `basis:roll` | Refused through the existing Python `E_MANIFEST` path. TypeScript's existing `E_SCHEMA` enum diagnostic remains distinct; equivalent admission is not universal diagnostic equality. |
| Direct/public `rules.evaluate` | Refuses the reserved yes/no threshold with `E_RULES` before evaluating quorum, including an unmet fraction or count quorum. |
| Adapter continuity | A JSON Lines request producing `E_RULES` is followed successfully by a supported request. Public manifest dispatch refuses all three invalid manifest forms. |
| Supported threshold arithmetic | `yes+no` excludes blanks from its denominator; `counted` includes counted blank ballots. All-blank and exact threshold/tie outcomes remain covered. |
| Roll participation quorum | Supported and evaluated using participation against the roll; a blank voter can satisfy it. Insufficient participation still produces `no-quorum` for supported thresholds. |
| Single-choice admission | At least two options follows from QV-16 section 5.6.1's `L=1` and `L<|options|`; section 5.19.3 fixes one winner. Missing `winners` and explicit `winners:1` remain accepted. |
| Other methods and ignored rule fields | Approval and k-of-n multi-winner declarations remain accepted. All three non-yes/no methods still accept a syntactically supported but unused rule field in Python manifest validation and ignore a rule in direct outcome evaluation. The early evaluator guard is restricted to yes/no; it does not impose a new field-presence policy. |

An explicit threshold rule that is present in a manifest still undergoes the
existing rule-schema validation, including its now restricted basis. The
preserved ignored-rule behavior does not make a reserved basis a valid manifest
field. Direct outcome helpers are not claimed to perform complete manifest
validation; the three method-admission cases are checked through the validator,
public manifest operation and dispatch.

## Independently observed verification

| Execution/check | Actual result |
| --- | --- |
| Focused Python batch: new adopted-policy file, manifest compatibility, tie methods, existing `TestManifest` and `TestRules` | **22/22 test methods passed**, exit 0, zero errors, failures or skips; 0.840 seconds reported by unittest. |
| Regression sensitivity against the pre-correction production modules | The current six-method policy file produced **12 assertion/subtest failure entries**, zero errors and zero skips, exit 1. Five methods failed; the supported-arithmetic control passed. This is an expected baseline failure, not a candidate failure. |
| Five reviewer-authored boundary scenarios, independent of the shared policy fixture | **5/5 passed**, exit 0: reserved versus supported threshold below a count quorum, then supported-rule manifest admission and ignored-rule evaluation for single-choice, approval and k-of-n. |
| Integrated patch hygiene | `git diff --check` passed; the complete name/status inventory contains no deletion or change to the frozen vector corpus. |

The baseline experiment loaded only `manifest.py` and `rules.py` from parent
`bf79ef73b497150ec485894426a03f3e21e27669` into their module namespaces in a fresh
Python process, before importing the current tests. It did not edit a repository
file, change an expected result, or claim to execute the parent's entire tree.
The old code accepted each prohibited manifest and returned an outcome for the
reserved threshold, including through unmet quorum and JSON Lines. The current
file passes in the focused candidate batch. This independently demonstrates that
the regressions distinguish the repaired behavior.

The new paired fixtures contain ten manifest cases and seven arithmetic cases
with explicit expected decisions/outcomes. Their expectations are not calculated
by either verifier. I inspected both consumers and confirmed the replaced old
roll-threshold positive assertion now explicitly expects the adopted refusal;
the adjacent counted and roll-quorum assertions remain. Counts above overlap and
must not be summed into a unique-test total.

### Focused reproduction

From the bound source's repository root, no third-party Python packages are
required:

```sh
python3 -I -B - <<'PY'
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'verifier-py'))
names = [
    'tests.test_adopted_manifest_policy',
    'tests.test_manifest_compatibility',
    'tests.test_manifest_tie_methods',
    'tests.test_protocol.TestManifest',
    'tests.test_protocol.TestRules',
]
result = unittest.TextTestRunner(verbosity=2).run(
    unittest.defaultTestLoader.loadTestsFromNames(names))
raise SystemExit(not result.wasSuccessful())
PY
```

### Local evidence identifiers

Execution transcripts are retained under
`/workspace/scratch/047a2f51fffd/quietvote-evidence/`. They are local supplemental
evidence; the committed source, fixture and reproduction command above remain
the durable reproduction basis.

| Evidence file | SHA-256 |
| --- | --- |
| `final-review-manifest-focused-python.log` | `86d85a433e645d0dc9fe2edf1c0f236852e1f50cc260ca5d32f7a260c7681e26` |
| `final-review-manifest-baseline-sensitivity.log` | `7e18cd7467a544c68be14f083fde503f2f2f88b18797f3349f19f3df9682c757` |
| `final-review-manifest-independent-boundaries.json` | `4b8b47976cb7b59735e4a26527ad61686ccbad0ed72cb218a350362421b4f6d6` |

## Limits and review status

The author's [receipt](../reports/adopted-manifest-policy-20261119.md) reports
17 TypeScript cases, scoped protocol typechecking, 290 Python vectors and
84 matching corpus hashes. Those are **author results**, not independently
re-executed results in this follow-up. TypeScript production is unchanged; I
inspected the paired tests and ran the focused Python boundary checks instead of
repeating a Node batch during the shared-resource queue. This report makes no
new full-suite, full-import, browser, cross-verifier or final hosted-CI claim.

Unratified bounds, witness policies, remaining method-specific field-presence
questions and trustee-spoil capability are outside this correction. Unrelated
session storage, catalog and native Windows ACL work is not assessed here.
This is independent engineering evidence, not a formal GitHub approving review,
a designated security review, a complete external audit, or release approval.
