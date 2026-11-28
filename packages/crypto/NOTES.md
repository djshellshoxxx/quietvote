
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


## QV-17 REQ-012 supplemental entropy — 2026-11-27

`additionalEntropyRng` implements the optional HKDF mixing accepted by N-28 in
`docs/plan/DECISIONS-2026-11-04.md`. For each at-most-8,160-byte expansion block,
IKM is a fresh 32-byte draw from the required caller-supplied platform RNG, salt
is SHA-256 of the additional input, and info is the fixed UTF-8 local label
`QuietVote trustee additional entropy v1` followed by a big-endian u64 counter.
This local wrapper adds no wire encoding, protocol transcript/domain, test-vector
format or dependency. The trustee CLI uses it only with an explicit dice file.

Missing/throwing/malformed/all-zero source output refuses; no fallback uses the
additional input alone. The zero check scans the entire source buffer and is not
a general RNG health test. A request is bounded to 1 MiB; HKDF's expansion limit
is honored by separate blocks, each with a new platform draw. The caller-owned
additional input is unchanged. Source and expansion byte arrays are wiped after
use; `destroy()` wipes the retained salt and prevents further draws. Wiping is
best effort in JavaScript. Native Node `hkdfSync` independently checks a multi-block
known composition in the tests. Formal crypto/security approvals remain required
before main promotion.

## Strict nullable outer containers — 2026-11-27

`parseJsonContainer(input, allowNullAt)` is a separate entry point for QV-18's
unsigned outer container fields. It shares the existing parser engine and
requires a trusted schema predicate that returns exactly `true` for each null
position. Paths distinguish numeric array indexes from string object keys;
callbacks receive copies of the path so they cannot alter traversal state.
The verifier authorizes only its outer board entry body fields. This API is not
for signed artifacts.

`parseQvJson(input)`, its `QvJson` type and `canonicalize` keep the original no-null
domain. Duplicate-key, UTF-8/BOM, NFC, surrogate, safe-integer and depth checks are
shared unchanged. Tests cover rejected lookalikes/nesting, required predicates,
exact-true semantics, path mutation, both public APIs and existing parser rules.
No canonical bytes, protocol domain, test-vector expectation or dependency was
changed. This is a parsing boundary change, not an external security review;
the existing crypto review requirements remain in force. See the
[source-bound report](../../docs/reports/verifier-redacted-container-20261127.md).
