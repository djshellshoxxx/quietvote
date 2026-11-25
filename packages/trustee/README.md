# @quietvote/trustee

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

Run `qv-trustee help` for command options. Unsupported options, repeated options,
and unexpected positional arguments return exit 2 before a command opens a
bundle or prompts for its passphrase. Supply passphrases through a protected
`--passphrase-file` or the hidden prompt. `finalize` reports its local result;
packet-producing commands such as `confirm` accept `--out`.

## Relay a trustee output to the server

After generating a ceremony output, export its signed bulletin-board envelope on
the offline trustee machine. Move only the resulting public JSON file to the
connected relay machine:

```sh
qv-trustee commit --bundle trustee.qvtb --passphrase-file passphrase.txt
qv-trustee export-entry --bundle trustee.qvtb --passphrase-file passphrase.txt \
  --round r1-commit --out commit-entry.json
qv online election-submit --server https://vote.example --id ELECTION_ID \
  --file commit-entry.json
```

`export-entry` supports `r1-commit`, `r1-dealing`, `r2-shares`, `r3-complaints`,
`r4-keyconf`, and `tally-share`. It exports one record; `--index N` selects a
zero-based complaint index. An honest verification round may have no complaints,
in which case there is no complaint entry to export. Missing outputs return
`OUTPUT_NOT_READY` (exit 40). Unknown rounds and invalid indices return exit 2.

The command reads only this bundle's previously generated outputs. It does not
accept an arbitrary record, destination origin, secret key or ciphertext to
sign. The election origin comes from the joined manifest. Tally export requires
a successful `tally-release` first, including its election-evidence and release
ledger checks. It maps those saved proofs to the server's existing `dec-shares`
record without performing another decryption or changing the release ledger.
It does not export spoil shares, drill records or compromise reports.
An output saved privately for crash recovery is not automatically releasable:
the normal command must reach its release state first. In particular,
`r1-dealing` cannot be exported after `commit` until `reveal` succeeds.

Existing output files are never overwritten. An aborted, disqualified or
destroying bundle cannot export. A bundle changed by another process must be
reopened. Each fresh export creates a new envelope nonce; keep the original
file and check server state after an ambiguous submission before retrying.
Receipt verification and coordinator packet generation remain separate work.

The executable integration test uses three actual `qv-trustee` processes across
commands, production randomness and the default bundle KDF. The test harness
still prepares coordinator records, registrations and ballots. The shipped
`qv election prepare` command now creates ceremony `.qvl` files and complete
JSON `log_evidence` inputs from downloaded `.qvb` archives. See the
[CLI guide](../cli/README.md#prepare-public-archives-for-trustees). This is trustee executable coverage, not complete acceptance
of an election using only shipped clients.

If `backup` returns `BACKUP_NOT_REMOVED` (exit 60, including with `--json`), the
backup failed and automatic rollback could not safely remove the destination.
An encrypted copy may remain there without being registered in the live bundle,
so a later `destroy` cannot be relied on to find it. Check the reported path and
remove that copy manually; preserve an unrelated file that replaced it. Resolve
the original lock or write failure, then reopen the live bundle before retrying.
Only remove a stale `.lock` after checking that no trustee process is using it.

Deletion does not guarantee erasure on flash or SSD storage. This recovery path
does not bypass the backup fingerprint, canonical-path or file-identity checks.
On POSIX systems, automatic cleanup also requires trusted directory ownership
and protected mode/sticky permissions throughout the path. If those permissions
have become unsafe since backup creation, cleanup leaves the file unchanged and
reports it for manual recovery. The documented native ACL limitation remains;
ordinary POSIX mode checks do not establish protection against overriding ACLs.
