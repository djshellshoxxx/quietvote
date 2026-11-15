# QuietVote Blue-Team Deep Security Review — Sensitive Components
Date: 2026-11-15
Branch reviewed: `integration/quietvote-completion`

## Scope
This pass concentrated on the cryptographic core and election-verification trust boundary: Ristretto255/scalar handling, proof construction and verification, ElGamal, Feldman commitments, DKG share encryption, passphrase-encrypted secret bundles, transcript framing, manifest validation, ballot/log verification, and the independent verifier composition.

This was a source-level review of the branch, not a runtime penetration test. No cryptographic test suite, fuzzing, timing analysis, memory-forensics test, live deployment, or end-to-end election ceremony was executed. Findings below distinguish concrete implementation behavior from assurance gaps. No application code was changed.

## Executive summary
The core uses several sound defensive patterns: strict canonical scalar and point decoding, non-identity checks at important DKG boundaries, domain-separated transcript labels, non-zero scalar sampling with bounded retries, proof challenge binding to election context, authenticated encryption for DKG shares, and a verifier that can accept an out-of-band pinned manifest hash.

Two additional hardening issues were identified in secret-bundle handling. The most important deployment concern is that the encrypted bundle's unauthenticated work-factor byte can request up to scrypt N=2^20 (roughly 1 GiB of working memory) before authentication. A second issue is that sealing only wipes sensitive temporary byte arrays on the success path, not on exceptions.

These do not replace the previously recorded blockers. In particular, the previously reported manifest trust-anchor, independent verifier parity, and cast/spoil conflict issues remain separate release concerns until explicitly retested and closed.

## Findings

### BT-14 — Medium: attacker-controlled scrypt work factor can cause memory exhaustion before authentication
**Location:** `packages/crypto/src/bundle-cipher.ts`, `openWithPassphrase()`, `BUNDLE_MAX_LOGN`

The bundle header contains `logN`. The opener reads this unauthenticated byte and runs scrypt before it can authenticate the wrapped file key or payload. The accepted maximum is 20, i.e. N=1,048,576 with r=8. The implementation's own comment estimates approximately 1 GiB of scrypt memory at this setting.

An attacker who can cause a trustee/operator process to open a crafted bundle can therefore make the process allocate very large amounts of memory before the passphrase or bundle authenticity is established. The upper bound prevents unbounded work-factor values, but it is still high enough to create a practical denial-of-service risk on ordinary hosts or concurrent workers. A valid magic/header and minimum file length are sufficient to reach the KDF; authentication happens later.

**Impact:** process memory pressure, worker termination, or host-level resource exhaustion during import/recovery workflows. This is a conditional attack path: it depends on an attacker being able to supply or influence a bundle that the process attempts to open.

**Recommendations:**
- Use a deployment-configured maximum work factor substantially below 20, chosen from measured memory budgets; do not rely on the library default maximum for untrusted inputs.
- Enforce upload/file-size limits, per-identity rate limits, and bounded concurrent decrypt operations before KDF execution.
- Consider an explicit caller-required `maxLogN` rather than defaulting untrusted opens to the global maximum.
- Add tests proving over-policy headers are rejected before scrypt is invoked, plus concurrency/resource-budget tests.

**Evidence status:** Source-confirmed behavior. Exploitability depends on the bundle ingestion call path and its access controls, which were not exercised in this pass.

### BT-15 — Low/Medium: secret-buffer wiping in bundle sealing is skipped on exceptional exits
**Location:** `packages/crypto/src/bundle-cipher.ts`, `sealWithPassphrase()`

The function derives and holds `pw` (normalized passphrase bytes), `wrapKey`, `fileKey`, and `pk` (payload key) in ordinary `Uint8Array` buffers. These are wiped only after both AES-GCM encryptions complete successfully. If scrypt, key import, wrapping encryption, or payload encryption throws, control exits before the wipe statements. The corresponding open path correctly uses `finally` for its derived wrapping key/passphrase and for file/payload keys after payload decryption.

**Impact:** on exceptional paths, sensitive temporary key material remains in JavaScript-managed memory until reclaimed or overwritten. JavaScript cannot guarantee physical zeroization, but deterministic cleanup still reduces exposure windows and should be consistent.

**Recommendations:**
- Put every allocated sensitive buffer under a `try/finally` cleanup boundary, including partially initialized buffers.
- Keep the existing `wipe()` behavior but test injected failures at each awaited crypto operation.
- Document the limits of best-effort zeroization in the runtime.

**Evidence status:** Source-confirmed control-flow issue. No memory dump or exploit was performed.

## Sensitive-area review notes

### Cryptographic primitives and encodings
- Ristretto point decoding enforces 32-byte length, library decoding, round-trip canonical encoding, and optional identity rejection.
- Scalar decoding rejects values at or above the group order rather than reducing attacker-supplied encodings.
- Random non-zero scalar generation uses 64-byte wide reduction and a bounded 64-attempt retry loop. The production RNG uses `crypto.getRandomValues`; deterministic and constant RNGs are explicitly described as test-only.
- Scalar inversion is explicitly documented as not constant-time and is described as being used on public data. This assumption should remain true at every call site; future use with secret scalars would need a constant-time implementation.
- The custom ElGamal wrapper rejects zero/out-of-range randomness. This is useful, but the complete ballot path still needs adversarial tests for aggregate identity and boundary cases.

### Proofs and threshold key setup
- Schnorr, DLEQ/Chaum–Pedersen, CDS 0/1, selection-limit, and partial-decryption proofs use domain-separated challenge labels and bind relevant election/contest/option context.
- Verification routines reject malformed scalar ranges and catch expected crypto decoding errors as verification failures.
- DKG share encryption rejects an identity recipient public key and binds manifest hash, dealer/recipient indices, and ephemeral public key into both HKDF info and AEAD AAD.
- The DKG adjudicator and the trustee share-storage/import workflows remain high-value targets for a separate test-driven review. In this pass, source coverage was incomplete for the full trustee command path and no live multi-trustee ceremony was run.
- Best-effort memory cleanup of derived DKG share keys and secret scalar objects should be reviewed across all callers; JavaScript bigint and noble point objects cannot be reliably zeroized.

### Manifest and election verification
- Manifest validation checks trustee index ordering, duplicate/strict public keys, coordinator key validity, witness key uniqueness, attainable witness quorum, timestamps, contest rules, and minimum-count privacy acknowledgement.
- The verifier supports an externally pinned manifest hash and explicitly records whether the hash came from the caller or bundle. This is the correct trust model; a bundle's self-declared hash is not an independent authenticity anchor.
- The verifier's report composition maps missing board exports to `not_run` / caveats rather than claiming that board ordering and omission checks were performed. The earlier review's concern about callers treating an incomplete report as a clean pass remains a release-gating assurance issue: downstream UI/automation must fail closed on `INCOMPLETE`, `not_run`, or absent trust anchors.
- The verifier currently maps V13 steward/operator controls to `not_run`; this is explicitly acknowledged in source. Do not represent V1–V14 as a complete operational audit until that control layer exists.
- The previously reported reverse-order cast/spoil ciphertext conflict must be retested against the exact branch being released, including both record orderings and re-wrapped ballot codes.

## Recommended next tests (highest value)
1. Instrument scrypt invocation and prove hostile `logN` values above the deployment policy are rejected before memory allocation; run bounded-concurrency stress tests.
2. Inject failures at each await in `sealWithPassphrase` and verify all allocated byte buffers are wiped in finally blocks.
3. Property/fuzz tests for canonical point/scalar parsing, proof statement mutations, transcript field swapping, malformed lengths, and integer boundary values.
4. End-to-end DKG ceremony tests with malicious dealers, duplicate/out-of-order indices, missing share rows, invalid complaint proofs, and trustee restart/recovery.
5. Differential verification: same adversarial election bundle through protocol verifier, TypeScript CLI verifier, Python verifier, and board-log verifier; compare verdict and every check status.
6. Negative tests for verifier trust anchors: absent pinned manifest hash, absent board export, zero witness quorum, self-attested witnesses, stale checkpoints, and V13 not-run.
7. Secret-handling tests for trustee bundle import/export, key rotation, wrong election AAD, interrupted writes, backup restore with separately retained KEK, and permissions on all secret files.

## Disposition
**Not cleared for production elections.** This pass found two additional secret-bundle hardening issues and identified important assurance gaps in the sensitive cryptographic and verification paths. The source contains good cryptographic hygiene, but source inspection alone cannot establish protocol correctness or operational security. Close the existing high-severity findings, fix BT-14/BT-15, and obtain independent cryptographic review plus end-to-end ceremony and recovery testing before handling binding elections.
