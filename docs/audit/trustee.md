# Audit: `@quietvote/trustee` (qv-trustee)

* **Scope:** `packages/trustee/**` (edits allowed). Reviewed for report only: `packages/crypto/src/bundle-cipher.ts`,
  `packages/crypto/src/share-cipher.ts`. Protocol functions the trustee calls (`verifyElection`, `analyzeBallotLog`,
  `trusteeDecryptTally`, `trusteeDecryptSpoiled`, `verifyEnvelope`) were read where they matter for trustee refusals. They were not audited.
* **Date:** 2026-10-21
* **Nature:** this is an AI-assisted review. It is not an independent professional audit. QuietVote is unaudited and is not for real elections.
* **Method:** manual code review against QV-17 (§6.5, §8, §11, §12, REQ-040/041), QV-ADR-020 and the package NOTES.md. Where it was feasible,
  I wrote a failing adversarial test before the fix (`packages/trustee/test/audit.test.ts`).

## Threat model (this scope)

**Assets**
* `sk_i`, the trustee's election key share. Disclosing t shares, or getting decryptions of arbitrary ciphertexts, breaks ballot secrecy.
* `sk_sign`, the trustee's Ed25519 identity. It signs DKG records, tally and spoil shares, and destruction attestations.
* DKG round secrets: the polynomial coefficients, `e` (sk_xport) and the received shares.
* The bundle passphrase and the sealed `.qvtb` file, plus its backups.
* State machine integrity. Tally release happens once per bundle, and nothing is released before the election closes.

**Trust boundaries**
* The coordinator/bridge sends the trustee `.qvl` log slices, the manifest, the election bundle (`tally-release`, `spoil-release`), spoil
  codes, the audit-close record and transcripts. All of these are untrusted input.
* The local filesystem holds the bundle, the passphrase file and the backups. Other local users are untrusted.
* The `qv-trustee` process and the operator (the trustee) are trusted. The embedding code is trusted for `witnessed`.

**Adversaries**
* A malicious coordinator holding m-of-k coordinator keys. It can sign markers, roll commits and audit-close records, and it can
  present a forked election log.
* A malicious voter, or a voting client or coercer holding a voter key. It can post valid cast or spoil envelopes.
* Malicious co-trustees, up to t-1 of them.
* A local attacker who can read or modify files but does not know the passphrase.

**Assumptions**
* The scrypt floor is 2^18. The passphrase is generated (100 bits) or estimated at 60 bits or more.
* WebCrypto AES-GCM and the noble scrypt/HKDF implementations are correct.
* JS cannot reliably wipe secrets from memory (R-02).
* Board witness and checkpoint verification is not wired in (REQ-041). `witnessed` is asserted by the caller, or replaced by a typed override.

**Failure modes considered:** decryption oracles (tally, spoil, drill), replay and rollback of the one-shot release, crash between persist and
emit, file tampering and KDF downgrade, permission leaks, secrets in logs or packets, forged or forked logs, and input shape abuse.

## Findings

| ID | Severity | Title | Evidence | Remediation | Status |
|---|---|---|---|---|---|
| TR-01 | medium | Spoil relay decrypts a **cast** ballot's ciphertexts when they are re-wrapped under a new ballot code | `packages/trustee/src/trustee.ts` `releaseSpoil` checked codes only (pre-fix: `castCodes` loop, now ~L591-626); `packages/protocol/src/ballot.ts:64` (code = H(body), includes `supersedes`), `:33` (proof binder = ctx+voter only), `packages/protocol/src/ballotlog.ts:73-91` (spoil `supersedes` unchecked) | Refuse when any A component of the spoiled ballot (sel and ph) equals an A component in any cast envelope in the log. M = s_j·A depends only on A. New code `CIPHERTEXT_WAS_CAST`. Protocol and verifier should adopt the same rule (coordinator). | **fixed**: `TR-01: a cast ballot re-wrapped as a trustee-mode spoil under a new code (same ciphertexts) is never decrypted` |
| TR-02 | low | `releaseTally` from CONFIRMED/DRILLED threw `ILLEGAL_TRANSITION` (exit 40) after the full log gate. This happened when a trustee never imported `election-open` | `trustee.ts:545-551` (`need` allows CONFIRMED/DRILLED; `machine.ts` has no CONFIRMED→TALLYING) | Pass through STANDBY, the transition `observe()` would have made. The log gate still runs first. | **fixed**: `TR-02: tally release from CONFIRMED/DRILLED ... works instead of ILLEGAL_TRANSITION` |
| TR-03 | low | One-shot tally release is not rollback- or concurrency-safe. Restoring a pre-release backup (or using a second copy), or running two processes at once on one bundle, re-arms `out.release`. A coordinator that also gets a forked election log past `verifyElection` could then obtain two decryptions over different counted sets (difference attack). | `trustee.ts:544` (guard is in-bundle state only), `trustee.ts:133` `restore`, `fsutil.ts` (no lock file) | Mitigated mainly by witness/checkpoint gating (REQ-041, not wired). Suggested: (a) an exclusive lock file per bundle; (b) a warning on `restore`/`open` of a backup whose epoch is older than the last recorded one; (c) wire REQ-041. | open |
| TR-04 | low | The election bundle presented at release is not compared with the log the trustee imported earlier, so equivocation goes undetected. `mergeEntries` runs into an empty log and its report is discarded. | `trustee.ts:505-507` (`const mr = mergeEntries(m, mh, ctx, log /* [] */, b.log); void mr;`) | Merge `b.log` into a copy of `this.d.log` and refuse on `LOG_FORK`. Also compare the roll-commit if one was imported. Cheap defense in depth against a forked election log. | open |
| TR-05 | low | The passphrase file (`--passphrase-file`, `QV_TRUSTEE_PASSPHRASE_FILE`, backup variants) is read without the group/other permission check that the bundle gets | `packages/trustee/src/cli.ts:78` | Read it through `readSecretFile` (refuse when mode & 077), or warn. Pipes (`/dev/fd/N`, mode 0600) still work. A tty `/dev/stdin` would be refused, so consider a warning rather than a refusal. | open |
| TR-06 | info | A tampered bundle header can request scrypt logN up to 22 (about 4 GiB maxmem) before authentication. This is a local DoS only. A downgrade below 18 is refused, and the header is AAD-bound. | `packages/crypto/src/bundle-cipher.ts:19,35,74` | Optionally lower `BUNDLE_MAX_LOGN` to 20 for `open`, or make it configurable. Report only (crypto is coordinator-owned). | open (report only) |
| TR-07 | info | Secret lifetime: the passphrase (`trustee.ts:97`), `sk_i` and `sk_sign` live as JS strings for the life of the `Trustee` object and cannot be wiped (documented R-02). `debugPlaintext()` (`trustee.ts:806`) is a public method that returns the full plaintext bundle. | `trustee.ts:97,806` | Drop the passphrase after deriving, or seal via a callback. Gate `debugPlaintext` behind a test-only export. | open |
| TR-08 | info | `destroy` overwrites recorded backup paths without checking that the file there is still a QV bundle (`open('r+')` follows symlinks) | `trustee.ts:700`, `fsutil.ts` `shred` | Check the magic `QVBUNDL1` and use `lstat` before overwriting. | open |
| TR-09 | info | The spoil replay guard (`SPOIL_REPLAY`) adds no confidentiality, because the share M = s_j·A is deterministic, so a re-release leaks nothing new. It only reduces availability (a lost packet cannot be re-fetched). | `trustee.ts:586-588` | Consider re-serving the stored record, which is idempotent. The NOTES already mention this. | open (design note) |

No findings in `share-cipher.ts`. The zero IV is safe because each key is single-use, derived from a fresh ephemeral DH and bound to
(mh, i, j, R). `u8` range-checks indices, R is non-identity on decrypt, and the scalar decode is canonical. Nothing else material
turned up in `bundle-cipher.ts`. A fresh file key, salt and nonces are drawn per seal, the header is bound as AAD of both layers, the passphrase is
NFKC-normalised, the scrypt salt is domain-separated, and the floor of 2^18 is enforced on open unless `allowWeak` (test-only) is set.

Areas checked with no issue found: crash-resume (persist before emit, atomic temp+fsync+rename, 0600 bundles and backups);
idempotent re-emission of every round; drill is not an oracle (ciphertext recomputed from (K, ctx)); tally recomputes aggregates and has
no ciphertext parameter; refusals happen before any decryption and do not consume the one-shot release; log import rejects forged or foreign
entries and forks; destroy requires an m-of-k audit-close and the typed title; the tombstone blocks keygen and restore; no secrets in
events, packets or CLI output (existing canary test in `lifecycle.test.ts`); a generated passphrase is uniform (`b & 31` over 256 values).

## Tests added (`packages/trustee/test/audit.test.ts`)
* TR-01: re-wrapped cast ciphertexts are refused. The test failed before the fix: the trustee released the share.
* TR-02: release from CONFIRMED. The test failed before the fix with `ILLEGAL_TRANSITION`.
* Vault header tampering (logN, salt, payload nonce, magic, truncation, logN above max): locked or format error, then the original opens.
* Malicious coordinator: a foreign election bundle, a swapped manifest_hash and junk shapes are refused, and the refusals do not consume the release.
