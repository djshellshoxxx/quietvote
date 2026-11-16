# @quietvote/cli

`qv`: command line over `crypto`, `protocol`, `board`, `verifier` and shared board authentication framing. Run `node packages/cli/bin/qv.ts --help`.
Commands: `verify`, `selftest`, `keygen`, `ballot encrypt|audit`, `board verify`, `election inspect`, `election prepare`, `election spoil-collect`, `vectors check`, `online instance|admin-status|election-create|election-inspect|election-draft|election-submit|election-export`.
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

## Online organizer and packet relay

`qv online` calls the actual server API. `--server` must be an HTTPS origin; HTTP is accepted only for
`localhost`, `127.0.0.1`, or `[::1]` development. Redirects are refused. Every request has a deadline
(`--timeout-ms`, default 20000, maximum 120000) and responses are capped at 64 MiB.

```sh
qv online instance --server https://vote.example --json
qv online election-create --server https://vote.example \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.key \
  --passphrase-file passphrase.txt --org ORG_ID --title 'Annual meeting' \
  --access public --idempotency-key annual-meeting-2026 --json
qv online election-inspect --server https://vote.example --id ELECTION_ID --json
qv online election-draft --server https://vote.example --id ELECTION_ID --file draft.json \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.key --passphrase-file passphrase.txt
qv online election-submit --server https://vote.example --id ELECTION_ID --file signed-entry.json
qv online election-export --server https://vote.example --id ELECTION_ID --format json --out election.json
qv verify election.json --manifest-hash ANNOUNCED_MANIFEST_HASH --json
```

Use the instance ID and configured public URL obtained from the operator for `--audience`. The transport origin
may differ from that audience during local forwarding. Management requests reuse the server's signed-request
framing and accept the existing protected QVKEY1 key format. Seeds and passphrases never belong in arguments.
Create requires an explicit access choice and stable idempotency key. Reusing the same key/body avoids duplicate
creation; changing the body requires a new key. A successful link-access creation returns its read key once;
protect the command output. Read commands accept `--read-key-file` for that key instead of placing it in arguments.

`election-submit` relays a JSON object containing only `header` and `body`, each base64url-encoded board-entry
bytes. `qv-trustee export-entry` now creates this format for persisted trustee ceremony outputs and gated tally
shares; coordinator and voter envelope preparation still requires separate tooling. The server checks
signatures, protocol validity and allowed state transitions. It can relay manifest, ceremony, open, ballot,
close and tally packets; it does not generate protocol signatures or choose trustee/coordinator quorums.
A returned receipt means server acceptance, not independent receipt or result verification. Retain returned
receipts and use the existing board/election verifiers with independent trust anchors.

All online commands print JSON. A non-2xx response exits 1 with its status and bounded error code. Server 5xx responses, malformed successful responses and network
failure during a mutation also exit 1 and explicitly report an unknown outcome; inspect state before retrying.
Commands never retry a mutation automatically. Downloads use mode 0600, never overwrite an existing path,
and are labelled `verified: false` until checked separately.

Remaining workflow gaps: organization account enrollment, registration (owner-held B3-01), integrated generation
of coordinator lifecycle packets, automatic receipt-proof checks, and
backup/restore commands. This command group supplies transport adapters; it does not resolve those gaps.

The online integration test exports an actual successful three-voter election and runs both the TypeScript CLI
and Python's existing `vectors` CLI on it, comparing all shared report fields. Python currently has no direct
`verify <bundle>` CLI or caller-supplied manifest-pin option, and does not implement board append-only,
witness or receipt-sample checks. The JSON export has no board evidence; those checks remain `not_run`, and
matching reports do not establish board/witness assurance. That test uses the server `World` harness for
trustee cryptography. A separate trustee executable test now drives production `qv-trustee` commands through
the real HTTP server and `qv online` relay, keeping trustee secrets out of the parent harness. See the
[trustee README](../trustee/README.md) for the remaining preparation and all-client acceptance boundaries.

## Prepare public archives for trustees

```sh
qv online election-export --server https://vote.example --id ELECTION_ID --out public.qvb
qv election prepare public.qvb --manifest-hash ANNOUNCED_HASH --format ceremony --out ceremony.qvl
qv-trustee import --bundle trustee.qvtb --log ceremony.qvl
qv election prepare public.qvb --manifest-hash ANNOUNCED_HASH --out release-input.json
qv-trustee tally-release --bundle trustee.qvtb --election release-input.json
```

Obtain the manifest hash through an independent channel. The preparer accepts regular files up to 64 MiB,
at most 10000 board entries and 10032 archive members. It checks strict tar framing, all listed checksums,
the manifest signature and pinned hash, entry authorization/signatures, origin bindings, the complete
Merkle tree and log-signed checkpoints. It writes a new mode-0600 file exclusively; existing paths and
symlink destinations are refused. Archive member names are never extracted to the filesystem.

Ceremony output carries all public records in the existing `.qvl` format. Election output carries
`log_evidence` and every public board body, including server aggregate records omitted by content-only
JSON exports. Preparation does not assert that an election passed protocol verification or met its
witness quorum; the trustee performs those checks before releasing. The JSON summary reports both checks
as false. A manifest envelope authored by a separate organizer remains refused under the current trustee
verification policy; the preparer does not change that policy. These generated trustee input files are
not accepted as `qv verify` bundles, whose top-level schema excludes `log_evidence`.

## Operator gossip health

```sh
qv online admin-status --server https://vote.example \
  --audience qv:INSTANCE_ID@https://vote.example --key admin.key --passphrase-file passphrase.txt
```

The server requires an instance-admin key. The `gossip` member reports durable contact timestamps,
consecutive failures, stale peers and scheduler health using hashed peer identifiers. These operational
indicators are not election-integrity or witness-independence verdicts.
