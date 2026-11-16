# QVKEY1 compatibility — fresh review, 2026-11-16

Reviewed implementation: `9bb0556e4a1fcc09f130473f95e27e7816ad38a7`, based on
`bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912`. Independent reviewer repair and
regressions: `9e4c74feb31a83ad8a69b8004042038c3793107c`.

## Decision and compatibility scope

[QV-ADR-027](../decision-log.md) accepts the recommended B3-25 default in
[the decision register](../plan/DECISIONS-2026-11-04.md): a shared canonical
function, canonical wrapping and a bounded legacy fallback on unlock. The
recommendation explicitly puts canonical input first; the preceding option
description's opposite ordering is not the selected recommendation.

The new shared function preserves the existing web rule exactly: recognize six
or more list words before NFKC fallback, folding only those list phrases. Other
inputs retain NFKC-only case and spacing. Each unwrap uses one canonical
candidate and at most one distinct legacy NFKC candidate. It does not enumerate
capitalization or separator variants to guess the original legacy CLI password.
QVKEY1 version and authenticated container fields remain unchanged. Trustee
QVTB uses a different container and is outside this change.

Both readers validate metadata and cost limits before KDF work. The web cost
confirmation applies before either candidate. A KDF/provider import failure does
not enter the password fallback. An authenticated plaintext that fails key-ID or
public-key consistency is rejected without a second spelling attempt. The
read-only organizer path keeps `rewrap: false`; successful legacy fallback does
not modify its stored ciphertext.

## Finding and repair

The adjacent `tryWebCrypto` signer adapter retained a PKCS8 buffer containing
the unwrapped seed when Ed25519 key import failed and the supported noble
fallback was selected. The buffer was wiped only on successful import. This
was inherited code, not introduced by normalization.

An injected failing-import regression captured that precise byte buffer and
failed on the reviewed source. The repair allocates it outside the `try` and
wipes it in `finally`, preserving fallback signing and locking behavior.
The compatibility implementation already added equivalent `finally` cleanup
for raw AES key import and container-encryption plaintext; independent probes
confirm those error paths too.

## Executed evidence

| Check | Result and scope |
|---|---|
| PKCS8 failure probe before repair | One test failed on the retained seed bytes, as expected. |
| Six independent review probes plus existing `key.test.ts` | 20 passed, 0 failed/skipped, 5.716 seconds on the repair tree. |
| Root TypeScript typecheck | Passed. |
| Production web build | Passed; reported gzip total 198.0 kB, entry 95.3 kB, standalone verifier 186.9 kB. Existing 200/110 limits unchanged. |
| Diff check | Passed. |

The six probes are retained in `packages/web/test/key-compatibility-review.test.ts`:

1. Decrypt all three pinned old ciphertexts using independently stated old
   Argon2id input bytes and real AES-GCM, without calling the new canonicalizer
   or either container reader; verify the seed and derived public key.
2. Unlock the original CLI spelling through the organizer flow, verify a real
   signature, assert no storage write or changed ciphertext, and check locking.
3. Refuse invalid metadata before confirmation or KDF; allow expensive-cost
   confirmation once, and bound failed distinct candidates to two derivations.
4. Fail AES import without fallback and wipe password and derived-key buffers.
5. Fail encryption and wipe its plaintext while preserving the caller-owned
   seed, which the wrapping API does not own.
6. Fail WebCrypto signer import, wipe its temporary PKCS8 buffer, and retain a
   functional fallback signer whose nonce material is wiped on lock.

The cost/error-injection probes use a fast test KDF to observe calls and byte
ownership; the legacy-ciphertext and organizer-unlock probes use real Argon2id.
No vector, fixture, browser expectation, bundle budget or production KDF floor
was weakened. No further blocker was found within this review scope. The
author's broader CLI/web validation remains a separate source-specific receipt;
this review does not claim a repeated complete suite or browser/OS qualification.

## Integration handoff

Integrate `9bb0556` once, then `9e4c74f` once. The repair's independent author
review is recorded in the passphrase milestone handoff; any cherry-picked
aliases are dependencies rather than separate implementations. Preserve the
review tests and include the final combined source in hosted qualification.
Agent review does not replace independent cryptographic/security review.
