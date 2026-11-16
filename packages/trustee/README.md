# @quietvote/trustee

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

Run `qv-trustee help` for command options. Unsupported options, repeated options,
and unexpected positional arguments return exit 2 before a command opens a
bundle or prompts for its passphrase. Supply passphrases through a protected
`--passphrase-file` or the hidden prompt. `finalize` reports its local result;
packet-producing commands such as `confirm` accept `--out`.

If `backup` returns `BACKUP_NOT_REMOVED` (exit 60, including with `--json`), the
backup failed and automatic rollback could not safely remove the destination.
An encrypted copy may remain there without being registered in the live bundle,
so a later `destroy` cannot be relied on to find it. Check the reported path and
remove that copy manually; preserve an unrelated file that replaced it. Resolve
the original lock or write failure, then reopen the live bundle before retrying.
Only remove a stale `.lock` after checking that no trustee process is using it.

Deletion does not guarantee erasure on flash or SSD storage. This recovery path
does not bypass the backup fingerprint, canonical-path or file-identity checks.
