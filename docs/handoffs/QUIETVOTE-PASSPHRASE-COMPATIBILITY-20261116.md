# QVKEY1 compatibility milestone — 2026-11-16

Starting integration source: `bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912`.
Implementation: `9bb0556` on `codex/qv-passphrase-compatibility`.
Independent-review cleanup correction: `9e4c74f`.

## Authority and contract

[QV-ADR-027](../decision-log.md)
approves the recommended defaults in the November 4 decision register, including
[B3-25](../plan/DECISIONS-2026-11-04.md).
The recommendation says shared canonical input first, then a distinct legacy input
on unlock. Its approval permits implementation; earlier consolidation notes that
kept this feature unresolved are historical, not a new permission requirement.
Independent security review before release is a different gate.

`protocol/src/key-passphrase.ts` now supplies both clients with the exact existing
web canonical rule and one shared list. Recognition trims and lower-cases the
input and splits on whitespace or ASCII hyphens. At least six recognized list
words become lower-case words separated by one ASCII space. Other input retains
its NFKC spelling, including case and whitespace. Recognition still precedes the
NFKC fallback so old web containers keep the same KDF input.

CLI and web wrap with that canonical form. Unlock first tries it, then the original
input normalized only by NFKC when distinct. Both previous writers are covered:
the first candidate is the old web function, the second is the old CLI function.
No third guess or repeat of an identical candidate is made. Parameter/schema
validation happens before derivation; high-cost web cancellation precedes either
attempt. Wrong-password work is bounded to two Argon2id derivations. Temporary
password/raw-KEK buffers and wrap plaintext are wiped on failure as well as success.

The `QVKEY1` shape remains version 1 and unlock does not rewrite ciphertext.
Retain the original spelling for legacy CLI files: a phrase saved without its
original case or separators cannot recreate the earlier NFKC-only KDF input.
Future list changes must preserve legacy recognition. Trustee `QVTB` containers
are a separate format and are unchanged by this QVKEY1 compatibility repair.

## Compatibility evidence

`packages/cli/test/fixtures/qvkey1-legacy.json` contains three fixed synthetic
containers written by the pre-change implementations at the starting source:
CLI mixed-case/separator list words, web list words and CLI arbitrary Unicode.
The file's SHA-256 is
`ff1edf18ff3c1cf82168072e6dbb2ba3901c6acdcf8227ee67c7b8eae5f5541d`.
Tests pin those bytes; they do not regenerate old ciphertext with the new code.
The fixture source, synthetic seed, original input and production Argon2id floor
parameters are recorded in the fixture. No production secrets are used.

Seven new cases in `packages/cli/test/keyfile-compatibility.test.ts` cover immutable
legacy unlock in both clients, new cross-client wrapping/unlocking, preserved
arbitrary Unicode semantics, explicit legacy-spelling limits, one/two/no-KDF
boundaries, cancellation and temporary-buffer erasure. The cross-client ciphertext
comparison uses real Argon2id and AES-GCM. Injected deterministic KDF calls are
limited to control-flow/cleanup probes.

## Validation and fresh review

At `9bb0556`, the affected CLI test run passed **36/36** in 108.5 seconds,
including the seven new compatibility cases and the existing CLI/keygen/audit
regressions. The complete web unit suite passed **312/312** in 80.3 seconds.
Neither run failed or skipped a test. Typecheck, production build, i18n, dependency
boundaries and links passed. The existing two D-97 dependency deviations remain
reported; no new dependency violations or dependencies were added.

Production compressed JavaScript is **198.0 KiB total / 95.3 KiB entry**;
the 200/110 KiB gates are unchanged. The [machine-readable receipt](../reports/passphrase-compatibility-20261116-validation.json)
records source/tree, runtime, commands, counts and scope. These are local code
checks; hosted browser and later combined-source qualification are separate.

The fresh `key_compatibility_review` agent found an adjacent signer-import cleanup
gap: failed WebCrypto import left the temporary PKCS8 seed copy unwiped before
falling back to the noble signer. Their `9e4c74f` moves that erasure into `finally`
and retains the failure regression. Six independent probes cover legacy
ciphertexts under independently specified old KDF inputs, read-only organizer
unlock, expensive-KDF prompt count, invalid metadata, AES import/encryption
cleanup and signer-import failure. The reviewer reports those six plus the 14
existing key tests passing, with typecheck/build passing.

The compatibility author independently reviewed `9e4c74f` and executed the
failed-WebCrypto-import regression: **1/1 passed**, no failure/skip. The correction
preserves the working fallback signer and erases its transient import copy on
both outcomes. No scoped blocker remains. This is reciprocal agent review,
not the project's required external cryptographic/security approval.

## Next integration

Integrate the signed implementation once, followed by this validation handoff and
any independently reviewed correction. Re-run exact-candidate hosted checks after
combining other protocol/CLI/web changes. Preserve existing independent-security,
browser, native accessibility and release-governance gates; this feature does not
qualify the entire project.
