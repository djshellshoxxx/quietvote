# Authenticated joint-key claim acceptance — 2026-11-27

## Accepted gap and contract

This increment addresses one remaining slice of task 2 in the [board/verifier inventory](inventory-20261111/board-verifiers.tasks.md).
[QV-34 section 9.3](../34-test-vectors-conformance.md) lists an altered joint key under the trustee-key replacement mutation class,
with `chk.keys.trustees` as the expected failed check. At PR79 commit `f7e055d839a369f27a1be2c7a2653340a74a4862`, existing manifest
tests rejected duplicate and small-order trustee signing keys, but no full-election test directly asserted the authenticated
`dkg-final` joint-key claim mismatch.

The current [protocol verifier](../../packages/protocol/src/verify.ts) recomputes the DKG outcome. When a `dkg-final` claim carrying
`qmask` differs in `qmask` or `K`, it emits `E_DKG_FINAL` with class L and fails `chk.keys.trustees`; it continues with the recomputed
outcome. This is existing behavior, not a new verdict rule. The change adds acceptance coverage without editing production source.

## Plan and implementation

The new case in [loglayer.test.ts](../../packages/protocol/test/loglayer.test.ts) reuses that file's generated four-voter election:
real trustee transcript, ballot proofs and signatures, a superseding ballot, a final tally, a bound board, and witnessed checkpoints.
It first verifies the honest control with four counted ballots, PASS and no failed named checks.

Only the claimed `K` in the existing `dkg-final` marker changes. The replacement is a different valid group point; `qmask` and all
other protocol records remain unchanged. Two variants distinguish the intended behavior:

| Variant | Authentication/evidence | Required result |
|---|---|---|
| Original control | Original valid coordinator signature and witnessed board | PASS; no failed named check; four counted ballots |
| Changed body, original signature | Explicit signature verification fails; a matching board is supplied | FAIL with L-class `E_SIG` and fatal `E_DKG_MARKERS`; no `E_DKG_FINAL` finding |
| Changed body, valid new coordinator signature | Explicit signature verification succeeds; rebuild the matching board and its signed/witnessed heads | Existing overall PASS; exactly `chk.keys.trustees` fails; exactly `E_DKG_FINAL`/L is reported |

For the authenticated mismatch, both board checks must pass. Every other named check must equal the honest control, including its
honest not_run state for absent receipt sampling. The context, cast/counted totals, exact counted ballot set and results must also
equal the control. This demonstrates that the changed published claim does not replace the key recomputed from the trustee transcript.

The new test keeps all existing log-layer, mutation and marker-equivalence tests intact. It adds no generated fixture to the frozen
vector tree and no dependency, browser entry, build configuration, protocol field or error-code change. This increment covers the
authenticated joint-key claim example only; already-covered behaviors in the other task 2 classes retain their existing tests.

## Validation and limits

The focused test passed on Node 24.22.3 in 1.842 seconds (1/1); strict protocol typechecking passed at a 384 MiB Node heap limit.
No production defect was observed, so no production fix was introduced.

The related `loglayer.test.ts`, `verify.test.ts` and `marker-equivocation.test.ts` files passed 63/63 tests at concurrency 1 in
79.976 seconds, with zero failures, cancellations or skips. This includes the existing frozen log-vector runner. Vendor integrity,
documentation links, claims lint and `git diff --check` passed. The production verifier retains Git blob
`c2ec56c54b1b8d949d9eb0a2b52e30405ae5e45b`; production protocol files, frozen vectors and package/dependency manifests have no diff
from PR79. Focused/regression logs and the exact source hashes are retained in the handoff receipt.

This increment did not rerun the full protocol workspace, Node 22/native platforms, browser journeys or production builds. The
test-only change adds no bundled runtime code and changes no build budget.

This is deterministic TypeScript acceptance coverage of the existing signed-claim contract. It does not attest to an independent
implementation, change a consumer's treatment of a failed named check, establish a fresh or final snapshot, or constitute an audit.
