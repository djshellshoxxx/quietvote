
## 2026-11-04: C8 parity for cp-dec-spoil (AI-assisted, unaudited)
* `spoilDecVerify` now refuses an identity key share `Y_j`, as `decVerify` already did (C8). Found by the adversarial review of the
  CP-08 mutation tests: with `s_j = 0` a prover gets `Y_j = M = identity` and the proof verified. Honest shares are never the identity
  (DKG output), so honest behaviour is unchanged. Regression: `test/audit.test.ts` "C8: cp-dec-spoil refuses an identity key share",
  which fails with the guard removed. Crypto change: needs the two-approval crypto review (docs/30). verifier-py derives `Y_j` from the
  DKG without an explicit identity check for either proof type; parity there is not yet assessed.
