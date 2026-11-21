
## 2026-11-04: C8 parity for cp-dec-spoil (AI-assisted, unaudited)
* `spoilDecVerify` now refuses an identity key share `Y_j`, as `decVerify` already did (C8). Found by the adversarial review of the
  CP-08 mutation tests: with `s_j = 0` a prover gets `Y_j = M = identity` and the proof verified. Honest shares are never the identity
  (DKG output), so honest behaviour is unchanged. Regression: `test/audit.test.ts` "C8: cp-dec-spoil refuses an identity key share",
  which fails with the guard removed. Crypto change: needs the two-approval crypto review (docs/30). verifier-py derives `Y_j` from the
  DKG without an explicit identity check for either proof type; parity there is not yet assessed.

## T-028 rerandomization helper — 2026-11-16

`elgamalRerandomize(K, ciphertext, r)` completes the previously missing narrow
library operation in T-028. It adds an encryption of zero using the existing
`elgamalEncrypt` and `ctAdd` primitives. The caller supplies fresh, canonical,
nonzero scalar randomness; no RNG is selected internally. A non-identity public
key is required. If old randomness plus the supplied randomness cancels modulo
the group order, the helper refuses the identity-A result instead of returning
an exposed plaintext point. The caller may draw new randomness and retry.
The neutral ciphertext is accepted and becomes an ordinary encryption of zero.

This helper does not preserve ciphertext-bound proofs or signatures and is not
wired into any ballot, tally, server or verifier acceptance path. Existing
submitted ballots cannot be rerandomized through this addition. The regression
suite checks message preservation, scalar wraparound, unchanged inputs, invalid
randomness, identity/cancellation refusal and rejection of a reused CDS proof.
Protocol/crypto review before merge remains outstanding; internal tests do not
replace that review. No wire format, transcript, vector or dependency changed.
## ADR-024 vendoring — 2026-11-19

Both existing `@noble/curves` and `@noble/hashes` 2.4.0 tarballs and all 132 published files now live under `vendor/`. The root `VENDOR.lock` binds upstream SHA-512 SRI and archive/file SHA-256 hashes. Explicit `npm run vendor:install` verifies and copies those bytes into normal npm dependency directories; registry lock/audit metadata and public imports are unchanged. CI runs it after every dependency restore, and production web builds verify the installed copies. No upstream source or cryptographic behavior changes. See the [verification and provenance receipt](../../docs/reports/vendored-crypto-20261119.md).
