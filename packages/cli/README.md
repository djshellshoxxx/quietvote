# @quietvote/cli

`qv`: zero-dependency command line over `crypto`, `protocol`, `board` and `verifier`. Run `node packages/cli/bin/qv.ts --help`.
Commands: `verify`, `selftest`, `keygen`, `ballot encrypt|audit`, `board verify`, `election inspect`, `election spoil-collect`, `vectors check`.
Exit codes: 0 ok, 1 failure, 2 usage, 3 incomplete/partial, 4 bad input, 70 internal. Design notes: `packages/verifier/NOTES.md`.

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

Keep the exact passphrase used to create a CLI key, including capitalization, spaces and hyphens. For a word passphrase generated
by the web client, enter the displayed lower-case words with one space between words in the CLI. The web client accepts case and
separator variants that the CLI does not; those variants are not portable between clients (B3-25 remains unresolved).

`board verify --witness-policy` applies to standalone board bundles; election bundles use their manifest policy and refuse that option.

## `qv election spoil-collect` (coordinator, offline)

```
qv election spoil-collect --election <bundle> --code <64-hex> --packet <file> [--packet <file>]... [--manifest-hash <hex>] [--post-body-out <dir>] [--json]
```

Combines the `spoil-share` packets produced by `qv-trustee spoil-release` for one trustees-mode spoiled ballot and prints the decoded
selections. Exit 0 on success, 1 if the code is not a verified trustees-mode spoil (unknown, cast, re-wrapped) or fewer than `t`
shares verify, 2 usage, 4 unreadable input. `--post-body-out` writes each verified record as `<dir>/<code8>-<j>.json` (the signed
record, the request body to POST to the coordinator's spoil-shares endpoint, e.g. with `curl --data-binary @file`).
