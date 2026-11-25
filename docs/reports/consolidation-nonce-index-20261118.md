# Trustee index binding in decryption nonces

## Confirmed defect

The composed nonce-hardening candidate at `9f9b50349372a43986fc3362cba53205a361ef40` included the trustee index in each decryption challenge but omitted that index from the hedged nonce. Distinct trustees can hold the same secret share. A threshold-one DKG produces exactly that situation because each dealer polynomial has degree zero.

When the same share, ciphertext, context, contest, option and RNG output were used at different trustee indices, both aggregate and spoiled-ballot provers emitted the same first commitment under different challenges. Three maintained regression tests failed before the correction: aggregate proof index separation, spoiled-ballot proof index separation, and a threshold-one DKG/tally path through the normal protocol API. No operational keys or elections were used.

## Correction and compatibility

Both `decProve` and `spoilDecProve` now include `u8(j)` immediately after the option field in `cp-dec-nonce`. The spoil option field retains the existing ballot-code suffix. Exact transcript-model tests and QV-16 sections 5.4, 5.13.4 and 5.16 describe the same field order.

Verifier equations, challenge framing, wire fields, domain labels, scalar reduction and accepted proof rules are unchanged. Old correctly formed proofs remain verifiable. Fixed-RNG prover output bytes change, so the existing deterministic vector generator and canary-corpus generator were rerun; generated outputs were not edited by hand. Comparison with the baseline preserves all 281 explicit vector/mutation acceptance expectation rows, with zero removed rows and zero changed `ok`, `error`, `verdict`, `failed_checks` or `codes` values. Existing expected-report files remain unchanged.

## Validation

- Before correction: all three new index-separation regressions failed on the original composed candidate.
- After correction: 27 focused nonce/transcript/protocol tests passed, with no failures or skips.
- Complete crypto workspace: 103 tests passed, with no failures or skips.
- Deterministic vector and canary-corpus generation completed successfully.
- Full TypeScript vector checks: 423 passed on the nonce-correction slice.
- Content-only cross-verifier comparison: 27/27 cases agree, with zero differences. Board, witness and sampled-receipt checks are outside this harness's scope.

This is an AI-assisted engineering correction and reproduction. Required formal protocol/security approvals and external review of the complete proof system remain outstanding.
