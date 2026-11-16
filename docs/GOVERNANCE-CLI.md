# Offline signed-rule CLI

`qv governance` prepares, co-signs, exports and verifies the experimental
[`qv-governance/1` profile](GOVERNANCE-CORE.md). It operates on local files.
A `VERIFIED` report covers a pinned signed rule history; it does not authorize a
suite-v1 election, proposal, membership change, timeout or dispute.

All commands print JSON. New files use mode 0600 and never overwrite an existing
file. Public inputs must be bounded regular files: 128 KiB for a policy/body or
signed envelope, 4 MiB for a history. The core additionally limits bodies to
64 KiB, histories to 128 envelopes/64 versions, and signatures to 16 per envelope.
Symlinks and FIFOs are refused where the host supports `O_NOFOLLOW`/`O_NONBLOCK`.
Key and passphrase files are at most 64 KiB; on POSIX they must have no group or
other permissions. Protected keys use the existing QVKEY1 format and normalization.
Seeds and passphrases never belong in command arguments or command output.

## Prepare and review a genesis body

Create identity/steward keys with `qv keygen`, keeping each private key on its
owner's device. The foundation policy requires two of three steward signatures
in addition to the identity signature. The identity may also be a steward; one
signature can satisfy both roles, but it counts only once among the stewards.

```sh
qv policy-draft template foundation --out policy.json
qv governance prepare genesis --policy policy.json --identity-key IDENTITY_PUBLIC_KEY \
  --steward-key STEWARD_A_PUBLIC_KEY --steward-key STEWARD_B_PUBLIC_KEY \
  --steward-key STEWARD_C_PUBLIC_KEY --out genesis-body.json
```

Review the exact body, group identity and returned `rules_hash` before signing.
Distribute the identity public key and genesis hash through an independent
channel. A supplied file cannot select its own trust pins. Preparation produces
an unsigned body only; it does not create keys or invent steward identities.
The policy's declared steward count must match the provided distinct keys.

## Sign on separate devices

Each signer independently supplies the agreed identity, genesis and candidate
hashes. The candidate `--rules-hash` equals `--genesis-hash` for version 1.

```sh
qv governance sign --body genesis-body.json --identity-key IDENTITY_PUBLIC_KEY \
  --genesis-hash GENESIS_HASH --rules-hash GENESIS_HASH \
  --key identity.key --passphrase-file passphrase.txt --out identity-signed.json
qv governance sign --record identity-signed.json --identity-key IDENTITY_PUBLIC_KEY \
  --genesis-hash GENESIS_HASH --rules-hash GENESIS_HASH \
  --key steward-a.key --passphrase-file passphrase.txt --out a-signed.json
qv governance sign --record a-signed.json --identity-key IDENTITY_PUBLIC_KEY \
  --genesis-hash GENESIS_HASH --rules-hash GENESIS_HASH \
  --key steward-b.key --passphrase-file passphrase.txt --out genesis-signed.json
```

`--passphrase-stdin` or a hidden interactive prompt can replace the passphrase
file. Every existing signature must have the correct digest and an authorized,
distinct signer in ascending order. A duplicate signer is refused. The body
hash excludes signatures, so co-signing preserves the agreed candidate hash.
Exit 0 means the requested signature was written. Inspect `quorum`: `false`
means additional signatures are required. `election_authorized` remains false.

## Assemble and verify history

```sh
qv governance export --record genesis-signed.json --identity-key IDENTITY_PUBLIC_KEY \
  --genesis-hash GENESIS_HASH --out history.json
qv governance verify history.json --identity-key IDENTITY_PUBLIC_KEY --genesis-hash GENESIS_HASH
```

`export` requires complete signature quorums; it does not merge incomplete
signature sets. Use `sign --record` to add signatures first. Repeated `--record`
options append complete envelopes, or `--history` extends a previously verified
history. Identical valid replays remain idempotent; forks, skipped versions,
bad signatures and mismatched pins are rejected. An invalid export writes no
output. The existing core report keeps active and candidate rule hashes distinct.

## Prepare a candidate amendment

```sh
qv governance prepare amendment --policy changed-policy.json --history history.json \
  --identity-key IDENTITY_PUBLIC_KEY --genesis-hash GENESIS_HASH \
  --decision-class rules --out amendment-body.json
qv governance sign --body amendment-body.json --history history.json \
  --identity-key IDENTITY_PUBLIC_KEY --genesis-hash GENESIS_HASH --rules-hash CANDIDATE_HASH \
  --key steward-a.key --passphrase-file passphrase.txt --out amendment-a.json
qv governance sign --record amendment-a.json --history history.json \
  --identity-key IDENTITY_PUBLIC_KEY --genesis-hash GENESIS_HASH --rules-hash CANDIDATE_HASH \
  --key steward-b.key --passphrase-file passphrase.txt --out amendment-signed.json
qv governance export --history history.json --record amendment-signed.json \
  --identity-key IDENTITY_PUBLIC_KEY --genesis-hash GENESIS_HASH --out candidate-history.json
```

Omitting `--steward-key` during amendment preparation retains the current set;
supplying it replaces the complete set. Protected changes require
`--decision-class entrenched`. Signatures always use the preceding active
steward set and threshold. Replacement keys cannot authorize themselves, and an
identity key outside the old steward set is not an amendment override.

The candidate hash is computable before its ratifying election. Any later
`ratification.manifest_hash` pointer belongs outside the signed body. A pointer
does not prove a final passed vote. This CLI has no flag that pretends to supply
ratification proof; candidate amendments export successfully with **exit 3 and
`INCOMPLETE`**, preserving the active genesis version. Preparing/signing a further
amendment against an unratified history is refused. Independently verified
governed-election binding and ratification remain the next integration milestone.

## Exit status

| Exit | Meaning |
|---|---|
| 0 | Preparation/signing completed, or signed-rule history is VERIFIED |
| 1 | Verification, authority, pin or chain failure |
| 2 | Invalid command usage |
| 3 | Valid candidate export/history with missing ratification evidence |
| 4 | Unreadable, oversized or malformed input/output |

These scopes are separate from the public election verifier's PASS/FAIL/INCOMPLETE
report and its append-only/witness requirements.
