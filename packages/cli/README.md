# @quietvote/cli

`qv`: command line over `crypto`, `protocol`, `board`, `verifier` and shared board authentication framing. Run `node packages/cli/bin/qv.ts --help`.
Commands: `verify`, `selftest`, `keygen`, `ballot encrypt|audit`, `board verify`, `election inspect`, `election prepare`, `election sign-record|export-entry`, `election spoil-collect`, `vectors check`, `online instance|admin-status|election-create|election-inspect|election-draft|election-submit|election-tally-draft|election-export`.
Exit codes: 0 ok, 1 failure, 2 usage, 3 incomplete/partial, 4 bad input, 70 internal. Design notes: `packages/verifier/NOTES.md`.

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

New QVKEY1 keys use the same passphrase normalization in the CLI and web client: phrases of at least six embedded-list words
accept case, whitespace and hyphen variants; other phrases retain NFKC-normalized spelling. Keep the exact spelling used for
older CLI-created keys, including capitalization, spaces and hyphens. Both clients can unlock those files using a distinct
legacy NFKC fallback (at most two KDF attempts). The container stays version 1; no key file is rewritten merely by unlocking.

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
shares; the offline `election sign-record` and `election export-entry` commands prepare coordinator and voter packets below. The server checks
signatures, protocol validity and allowed state transitions. It can relay manifest, ceremony, open, ballot,
close and tally packets; it does not generate protocol signatures or choose trustee/coordinator quorums.
A returned receipt means server acceptance, not independent receipt or result verification. Retain returned
receipts and use the existing board/election verifiers with independent trust anchors.

All online commands print JSON. A non-2xx response exits 1 with its status and bounded error code. Server 5xx responses, malformed successful responses and network
failure during a mutation also exit 1 and explicitly report an unknown outcome; inspect state before retrying.
Commands never retry a mutation automatically. Downloads use mode 0600, never overwrite an existing path,
and are labelled `verified: false` until checked separately.

Remaining workflow gaps: organization account enrollment, independent tally-draft checking, automatic receipt-proof checks, and
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

## Coordinator signatures and voter packet files

These commands reuse protocol record signatures and board entry framing. Obtain the manifest hash and election
origin independently. Review the lifecycle body before signing; `draft-record` can derive ceremony/roll/open/close bodies from an authenticated public archive,
while each coordinator still reviews and signs explicitly. Body schemas and signature framing are
checked locally; server admission and independent verification remain separate checks.

```sh
# Each coordinator signs on their own machine with their own key. Transfer public record files only.
qv election sign-record --manifest manifest.json --manifest-hash ANNOUNCED_HASH \
  --body marker-body.json --key coordinator1.key --passphrase-file passphrase.txt --out first.json
qv election sign-record --manifest manifest.json --manifest-hash ANNOUNCED_HASH \
  --record first.json --key coordinator2.key --passphrase-file passphrase.txt --out quorum.json
qv election export-entry --origin quietvote/v1/INSTANCE_ELECTION_ORIGIN --type ceremony_start \
  --file quorum.json --key coordinator1.key --passphrase-file passphrase.txt --out packet.json
qv online election-submit --server https://vote.example --id ELECTION_ID --file packet.json

# ballot encrypt already signs the protocol envelope; add the voter's outer board signature for relay.
qv election export-entry --origin quietvote/v1/INSTANCE_ELECTION_ORIGIN --type ballot \
  --file encrypted-ballot.json --key voter.key --passphrase-file passphrase.txt --out ballot-packet.json

# Download the existing server proposal, then sign and wrap it. The proposal is not independently checked here.
qv online election-tally-draft --server https://vote.example --id ELECTION_ID \
  --decrypters 1,2 --out tally-body.json
qv election sign-record --manifest manifest.json --manifest-hash ANNOUNCED_HASH \
  --body tally-body.json --election public-election.json --key coordinator1.key \
  --passphrase-file passphrase.txt --out signed-tally.json
qv election export-entry --origin quietvote/v1/INSTANCE_ELECTION_ORIGIN --type tally_result \
  --file signed-tally.json --key coordinator1.key --passphrase-file passphrase.txt --out tally-packet.json
```

`sign-record` accepts a raw manifest or manifest record, and requires the external manifest pin. Supported bodies
are `manifest`, `marker`, `roll-commit`, existing server `control` actions and `tally`. Manifest, ceremony marker and roll signatures use the manifest
hash, as do control actions. Open/close markers and tally signatures use the context derived from `--election` after the existing manifest
and DKG checks pass. A tally has one coordinator signature as required by existing server policy; other supported
records accumulate distinct authorized coordinator signatures through `--record`. Exit 0 means the signature file
was written; `quorum: false` explicitly means more signers are needed. Prior signatures must all verify. Signers may
use different passphrases because each invocation unlocks only one key.

`export-entry` accepts an existing board entry type and a JSON record, canonicalizes the body and creates the
`{header, body}` base64url packet accepted by `online election-submit`. It checks framing and per-type size limits;
it does not validate the inner record, authorize its outer author or assert an election transition. For manifest
publication the outer key is the organizer, even when coordinator keys signed the inner record. For tally publication
the existing server policy requires the outer coordinator to match the tally signer. No organizer authority is added
to the trustee verifier. All new outputs are exclusive mode-0600 files. Manifest, body, record and entry inputs are regular files capped
at 1 MiB. The public `--election` context bundle is a regular-file snapshot capped at 64 MiB; FIFOs and devices
are refused before reading. Bundle loading used by ballot, audit and election inspection commands shares this cap.

The executable CLI acceptance test provisions protected keys with production KDF settings, drives coordinator
signature accumulation, distinct-organizer manifest publication, ceremony markers, roll commitment, open/close,
three voter encryptions, tally proposal download/signing and final pinned verification through child processes and
the real HTTP server. Operator enrollment, registration under the held B3-01 contract and trustee cryptography remain
fixture setup. This is complementary to the trustee executable test; it does not claim a complete all-client
registration journey or remove independent review gates.

## Generate coordinator lifecycle proposals

```sh
# Export a fresh public snapshot before each transition. Keep earlier snapshots for comparison.
qv online election-export --server https://vote.example --id ELECTION_ID --out phase.qvb
qv election draft-record phase.qvb --manifest-hash ANNOUNCED_HASH --kind dkg-open --out body.json
# Review body.json, then use sign-record, export-entry and online election-submit above.
```

`--kind` supports the existing sequence `dkg-open`, `dkg-r1-open`, `dkg-r1-close`,
`dkg-r2-close`, `dkg-r3-close`, `dkg-final`, `roll-commit`, `election-open`, `election-close`.
The JSON summary gives the required outer `entry_type`; the four intermediate DKG markers use `notice`.
Only the next transition is generated. Existing, skipped, out-of-order or terminal transitions are refused.
No command signs a generated body, submits it, retries a mutation or changes a scheduled opening/closing time.
The server still enforces its current admission and time rules when the separately signed packet is submitted.

This command uses the same bounded archive, manifest pin and authenticated board checks as `prepare`.
It verifies coordinator and trustee record signatures, recomputes DKG qualification/joint key using the
existing protocol implementation, and requires `t` timely verified trustee key confirmations before
producing `dkg-final`. Roll/open/close proposals recheck that outcome. Open references are derived from
authenticated sequence positions and close requires a valid context-signed, history-bound open marker.
Changed hashes, invalid proofs, malformed input, archive symlinks and existing outputs are refused by the
shared archive/output boundaries. Every new output is an exclusive mode-0600 file.

A roll not pinned in the manifest is still an **uncommitted proposal** from the supplied snapshot;
`roll_source: uncommitted-proposal` makes that explicit. Review its membership before signing.
This does not change the held B3-01/D-99 registration contract or establish that the snapshot is the
latest independent view. The summary retains `witness_quorum_verified: false`, `freshness_verified: false`,
`signed: false` and `admitted: false`. Existing separate-organizer archive refusal remains in force.
For open/close signing, also download the content JSON export for the existing `sign-record --election`
context check; the unsigned proposal itself is derived from the authenticated `.qvb` history.

### Voter enrollment and legacy invitation preview

```sh
qv online enroll --server https://board.example --id <32-hex-api-id> --key voter.qvkey --invite-file invite.txt --passphrase-file pass.txt --json
qv online registration-preview --server https://board.example --id <32-hex-api-id> --key organizer.qvkey --audience qv:INSTANCE_ID@https://board.example --passphrase-file pass.txt --json
```

`invite.txt` is a bounded regular UTF-8 file containing one canonical issued 16-byte base64url token. Tokens and passphrases are not accepted in command arguments. Enrollment checks the requested election ID/origin and `hashed-pop-v1` scheme before reading the token or private key, signs the invite/election/key binding, and reports success only for the expected voter identity. Unknown/legacy schemes refuse; network ambiguity is not automatically retried. The preview is read-only and cannot revoke or migrate old invitations.

The shipped executable enrollment test covers a real server before manifest publication. It does not resolve D99 pinned-roll membership, group labels, or the deliberately absent invite-to-voter linkage.

Issue count-only invitations through the same signed management endpoint used by
the web organizer:

```sh
qv online invites-create --server https://board.example --id <32-hex-api-id> --count 3 --out private-invites.json --key organizer.qvkey --passphrase-file pass.txt --audience qv:INSTANCE_ID@https://board.example --idempotency-key issue-batch-0001 --json
```

The command checks the election ID, origin and modern registration scheme, then
reserves a new output with mode `0600` before making one POST. Existing files,
directories and symlinks are never overwritten. The initial file contains a
pending-operation marker. The file's identity and private, single-link descriptor
are checked after key unlock immediately before sending, and again before success
is reported. A replaced pathname is never overwritten or reported as the output.
A successful HTTP response, bounded to 256 KiB, is
saved and flushed to that private descriptor before validation. Success requires
the requested count of distinct IDs and canonical 16-byte bearer codes. Only
the file path, election ID, count and invitation IDs reach stdout; tokens stay
in the private JSON file. The file is a secret-bearing artifact for the organizer
to distribute through their chosen channel, not a public election export.

A network failure, oversized response or HTTP rejection leaves the pending
marker. Malformed or redacted successful responses remain in the private file
and return failure instead of pretending the codes were recovered. Inspect the
file and server state before retrying: the server deliberately omits codes from
idempotent replay, and a new idempotency key can issue another batch. No retry is
automatic. Reservation and `fsync` reduce avoidable local loss; storage failures,
power loss and loss of the one response cannot guarantee recovery of raw codes.
If the reservation becomes unlinked, multiply linked or publicly readable before
the response is saved, bearer bytes are not written there. If a still-private
reserved file was renamed, it retains the response but the command reports the
lost pathname binding instead of a misleading success.

The combined executable election now invokes both `invites-create` and `enroll`
for all voters. Organization bootstrap and public manifest choices remain its
fixtures. This does not implement legacy invitation conversion, delivery services,
pinned-roll admission or group/label membership policy.
