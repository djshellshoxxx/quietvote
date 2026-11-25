# Adopted threshold and single-choice policy completion

## Source and scope

This slice implements the already adopted QV-ADR-027 / N-27 restriction and two
source-backed B1-08 single-choice admission checks. It is one verifier-admission
repair family, not three new product features or closure of all B1-08 differences.

- Base: `8a8579a7ed8e2bd5af42b77d25d51f0073f6ce35`, whose production source is
the ba728be composition covered by the independent engineering review.
- Production correction: `6158f61e001013ddfe928d4d353ba25e618f08a9`.
- Tested source with reconciled specifications and positive controls:
  `8c94e5f241a1ed8dae3c908c21e65fe2728d4cf2`.
- Complete tested tree: `2fe89273947750587d06540b16e761faa5513c1f`.

The final report commit changes only this receipt. The implementation was made
in an isolated worktree. TypeScript production, package manifests, lockfile,
frozen vector inputs/expectations and the shared verifier comparator are unchanged.

## Authority and behavior

[ADR-027](../decision-log.md) adopts the recommended defaults in the
[November 4 decision register](../plan/DECISIONS-2026-11-04.md). N-27 selects option
A, reserving the whole-roll contest threshold and explicit abstain option beyond
suite v1. That decision is in
`761da0a45c538aa2232ee5511eb84e3fc1ca4e21`. The eligible/roll threshold arithmetic
in QV-16 predates it (`2e3a4bd24715f7941447206ede55fc46da4b37b1`); the later
`42263c4f0f45e7db84a1a1d0d2a64f9747740d61` tie amendment retained the earlier roll
clause without adopting N-27 B or C. This is implementation of the adopted choice,
not a new protocol-policy decision.

The recommendation's abbreviated “yes+no only” wording is read together with its
“No change” and “freezes surface” rationale. The reference already accepted
`counted` at the adoption commit, and the later approved `E3-tie-basis-counted`
case retains it. Removing `counted` would exceed this narrow correction.

| Boundary | Implemented result | Source |
| --- | --- | --- |
| Contest threshold `rule.basis:roll` | Python manifest validation refuses it through the existing `E_MANIFEST` path. The public rules evaluator refuses it with `E_RULES`, including before an unmet-quorum shortcut can return an outcome. | ADR-027 / N-27; [manifest validator](../../verifier-py/qv_verifier/manifest.py), [rules evaluator](../../verifier-py/qv_verifier/rules.py). |
| Contest thresholds `yes+no` and `counted` | Remain supported with exact integer arithmetic. Blank votes remain outside the first denominator and inside the second. | [QV-16 section 5.19.3](../16-crypto-protocol.md), approved tie cases. |
| Participation quorum with `basis:roll` | Remains supported; counted participation is compared with the required fraction of the roll. | QV-16 section 5.19.3 item 1; [QV-20 section 6](../20-voting-methods.md). |
| Single-choice with one option | Refused. `L=1` and `L<|options|` imply at least two options. | QV-16 section 5.6.1. |
| Single-choice with declared `winners` other than 1 | Refused. The prior Python evaluator silently selected one winner despite the contradictory declaration. | QV-16 section 5.19.3 item 3. |
| Single-choice with no `winners` or explicit `winners:1` | Remains accepted. Multi-winner approval and k-of-n declarations remain accepted. | Existing method contracts and positive controls. |

The public Python JSON Lines adapter dispatches `rules.evaluate` directly, without
manifest validation. Restricting only manifest admission would have left that
operation evaluating the reserved threshold. The guard applies only to yes/no
threshold evaluation; a positive control retains the existing handling of ignored
rule fields in other methods. This change does not adopt a new field-presence
policy for those methods.

The active QV-16, QV-20, QV-03 mapping note, errata addendum and verifier capability
notes now distinguish the reserved contest threshold from the supported roll
quorum. The broader GroupRules vocabulary and its examples are retained and
labelled with the suite-v1 limit. The decision register and historical audits are
not rewritten.

## Regression evidence

Both implementations read the same ten manifest cases and seven arithmetic cases
from [adopted-manifest-policy.json](../../packages/protocol/test/fixtures/adopted-manifest-policy.json),
using the unchanged `tiny-yesno-3v` manifest. The existing diagnostic taxonomies
remain explicit: TypeScript reports `E_SCHEMA` for the reserved threshold enum;
Python retains its existing `E_MANIFEST` path. The paired checks establish the
same admission decision, not universal equality of error classifications.

Before production changes, the six-method new Python file produced 12 failures
across its parameterized assertions: all three invalid manifests were accepted by
the validator and public manifest operation/dispatch, and the reserved threshold
produced direct and JSON Lines outcomes, including under unmet quorum. The supported
arithmetic control passed. These failures were captured on the base source before
the two production files were changed. After repair, all six methods pass.

The previous positive roll-threshold assertion in `test_protocol.py` is replaced
with an explicit N-27-backed `E_RULES` refusal for the same input. Its adjacent
`counted` and roll-quorum assertions remain. No assertion is skipped or weakened
to retain the behavior that the adopted decision reserves.

| Check | Observed result |
| --- | --- |
| New Python policy/adapter regressions | 6/6 methods pass, exit 0; validator, public operation, dispatch and JSON Lines round trip are exercised. |
| Focused Python compatibility and rules batch | 22/22 tests pass, exit 0; includes the new file, manifest compatibility, tie methods, existing `TestManifest` and `TestRules` classes. |
| Paired TypeScript reference cases | 17/17 pass, exit 0, no skips or cancellations. |
| Scoped protocol TypeScript | Exit 0, no diagnostics, 256 MiB heap limit. |
| Unchanged Python vector corpus | 290/290 pass; 0 failures and 0 unimplemented operations. All 84 listed file hashes match, with 0 mismatches or missing files. |
| Frozen-source and diff checks | No change to `test-vectors/` or TypeScript production; `git diff --check` passes. |

The vector tool reports 25 skipped non-vector referenced input files (for example,
board files and bundles lacking an expected-report file). Those are not counted
as executed vectors or unimplemented operations. The tool still describes the
vector manifest as unsigned; this execution does not turn it into a release
attestation.

The runs overlap; their counts must not be summed into a unique-test total.
TypeScript used the root's already installed, verified dependencies through an
ignored worktree-local dependency link. No additional installation or lockfile
change was made for this lane.

## Reproduction

From the repository root:

```sh
node --test --test-concurrency=1 packages/protocol/test/adopted-manifest-policy.test.ts
NODE_OPTIONS=--max-old-space-size=256 node node_modules/typescript/bin/tsc -p packages/protocol/tsconfig.json --noEmit
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet
```

The focused Python run uses the same explicit test import root as discovery:

```sh
python3 -I - <<'PY'
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

## Remaining qualification and limits

This author receipt does not supply the fresh independent review or the final
combined-source hosted matrix. It does not claim a new local whole-repository
typecheck, a repeated full Python unit suite, or a new strict cross-verifier run.
Those broader gates belong to final integration.

Unratified numeric bounds, witness policies and the remaining method-specific
field-presence differences are not silently copied from the reference. Python's
explicit trustee-spoil capability boundary, governance-profile work and formal
security/provenance review requirements remain separate. This slice makes no
new production-election or cryptographic-audit claim.
