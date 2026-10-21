# @quietvote/trustee (`qv-trustee`): implementation notes

Implements QV-17 (normative) on top of QV-16 DKG/threshold decryption as built in `packages/protocol`; ADR-014..024 win over specs.

## Layout
`bundle.ts` encrypted vault + data model; `machine.ts` state machine; `ceremonylog.ts` log-slice validation, R1 recomputation;
`trustee.ts` all operations; `transcript.ts` build/sign/verify; `passphrase.ts`; `fingerprint.ts`; `cli.ts`. Tests: `test/*.test.ts`
(simulated n-party ceremonies with scripted malicious trustees in `test/helpers/harness.ts`).

## Air-gapped exchange (files only)
`.qvl` = public log slice `{format:"qv-ceremony-log/v1", manifest_hash, entries:[{seq,entry}]}` (bridge -> trustee, `import`);
`.qvp` = packet `{format:"qv-ceremony-packet/v1", round, from, records:[signed records]}` (trustee -> bridge). Rounds:
`commit` (r1-commit), `reveal` (r1-dealing), `shares`, `verify` (complaints), `finalize` (local), `confirm` (keyconf), `drill`, `tally-release`.
Every imported entry is validated (schema, trustee signature against the manifest key, m coordinator sigs on markers); a different
entry at a known seq is `LOG_FORK`. Each command persists to the sealed bundle BEFORE emitting output and re-emits identical bytes
when re-run, so a crash at any point is resumable (tests reopen the bundle for every command).

## Deviations / decisions
* **Bundle is age-STYLE, not age-compatible** (REQ-021 not met): new `packages/crypto/src/bundle-cipher.ts` (scrypt N=2^18 floor via
  `@noble/hashes`, random file key wrapped under the scrypt key, AES-256-GCM payload, header bound as AAD, fresh key/salt/nonces per
  seal). age proper needs ChaCha20-Poly1305/X25519 (not in the ADR-024 allowlist). Hardware-token/X25519 recipients, layering, SLIP-0039
  (REQ-024), dice entropy (REQ-012) are NOT implemented. Tests lower the KDF via `VaultDeps.logN` + `allowWeak` (test-only; also skips
  the passphrase estimator); production code never sets them.
* Generated passphrase = 20 Crockford-base32 symbols (100 bits); user-chosen < 60 estimated bits refused. 2048-word list (Q4) undecided,
  so check words are a placeholder pronounceable encoding of the first 66 bits of SHA-256(label, K, ctx, mh); hex is authoritative.
* One file holds keys AND ceremony state (QV-17 §8.1 step 2), not a separate state file. The polynomial is stored (not re-derived from a seed).
* `sk_xport` (the DKG `e`) is deleted at `confirm`; coefficients after the shares package is persisted; received shares at `finalize`.
* **REQ-040**: `releaseTally` takes only the election bundle (+ optional claimed aggregates for comparison). It runs `verifyElection`
  (tally records stripped so a bogus one cannot block trustees), re-adjudicates the DKG and checks K/ctx/Y_j equal its own, recomputes
  the counted set and aggregates, and calls `trusteeDecryptTally` (floor + claimed-mismatch refusals -> `PRIVACY_MIN` / `AGGREGATE_MISMATCH`, exit 60).
  The fire drill decrypts only a ciphertext recomputed from (K, ctx) (`drillCiphertext`), so it is not a decryption oracle either.
* **Witness gating (REQ-041)**: board checkpoint/witness verification is not wired in; if `bb.witness_quorum > 0` release requires
  `witnessed: true` from the embedding code or the typed override `RELEASE-WITHOUT-WITNESSED-CHECKPOINT`, which is logged in the bundle.
* Record types defined here, not in QV-16 (verifier ignores them as unknown): `keycheck`, `tally-share` (signed by trustee, scope ctx),
  `key-destruction`, `trustee-compromise-report`, `ceremony-transcript` signature body, and the `audit-close` body
  `{ctx, closed_at}` (coordinator m-of-k, scope ctx) consumed by `destroy`. `collectTallyShares` is the coordinator-side helper.
* State machine adds COMMITTED (QV-16 splits R1) and folds SEALED into CONFIRMED. `observe()` on import moves a trustee to DISQUALIFIED when
  a window closed without its record (log is truth). `restart` makes a fresh Ed25519 key (REQ-052).
* Destroy: audit-close verified, typed election title required, attestation signed with `sk_sign`, known backups + bundle overwritten
  and unlinked, public tombstone `<bundle>.destroyed` keeps it terminal. Flash erasure is NOT guaranteed; passphrase destruction is on the user.
* Transcript core is a pure function of manifest + public DKG log (so all trustees sign the same hash); environment/SAS/events are per-signer
  fields inside each signature. `verify-transcript` re-derives Q/K/fingerprint from the embedded log.
* `@quietvote/crypto`/`protocol` are not listed in `package.json` deps (same as protocol; avoids a lockfile refresh). I added a `bin`
  entry; refresh `package-lock.json` when convenient.
* JS limits (R-02): secrets are bigint/hex strings in memory; wiping is best effort only. The CLI prompt hides input via readline muting.

## Not done
Network/outbox, localhost UI, `qv-ceremony` image, dealer mode, `trustee_accept` PoP entry, reminders, Shamir backup of passphrase.
