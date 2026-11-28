# @quietvote/cli

`qv`: command line over `crypto`, `protocol`, `board`, `verifier` and shared board authentication framing. Run `node packages/cli/bin/qv.ts --help`.
Commands: `health`, `trustee`, `migrate-archive`, `verify`, `verify-receipt`, `selftest`, `keygen`, `ballot encrypt|audit|status`, `board verify`, `election inspect`, `election prepare`, `election check-tally`, `election sign-record|export-entry`, `election spoil-collect`, `vectors check`, `online instance|admin-status|backup-create|org-create|org-inspect|election-create|election-pinned-roll|election-inspect|election-draft|election-submit|receipt-check|election-tally-draft|election-export`, and the recorded-export management commands below.

Experimental signed-rule workflows are available as `governance prepare`,
`governance sign`, `governance export` and `governance verify`. They require
independent identity/genesis/candidate pins, preserve partial co-signing, and
leave unratified amendments INCOMPLETE. They do not authorize existing elections.
See the [offline governance guide](../../docs/GOVERNANCE-CLI.md).

Default verification requires both `chk.board.append_only` and
`chk.board.witness` to pass. Missing or unverified log evidence yields
`INCOMPLETE` (CLI exit 3); fatal evidence still yields `FAIL` (exit 1).
A completed tally alone does not establish a witnessed election result.

For an explicitly scoped cryptographic content check, trusted callers may set
`allowNoLog: true` (Python: `allow_no_log=True`), or invoke `--content-only` on
`qv verify`, `qv-verify`, or Python `verify`. Only the actual Boolean true enables
this option. A bundle field cannot enable it. The report prominently states that
content-only PASS does not establish witnessed log integrity. The exception
allows absent evidence, or a verified append-only log whose signed manifest
explicitly requires zero witnesses. Supplied malformed, failed, skipped,
interrupted or otherwise unverified append evidence never qualifies; required
witnesses cannot be bypassed. Missing tallies remain incomplete in either mode.

For supplemental log authors, both `qv verify` and `qv-verify` accept repeated
`--extra-author-key <hex>` options (up to 32 public keys, each exactly 64 lower-case
hexadecimal digits). Obtain these keys separately from a trusted source. Keys
inside bundle metadata or unsigned server responses do not establish trust.
For example: `qv verify with-board.json --extra-author-key PUBLIC_KEY_HEX --json`.
A pin allows matching supplemental author signatures to be checked; it does not
grant coordinator, trustee, voter, or control authority and does not replace
witness evidence. `verifyWithSelfTest` accepts the same keys as its trusted caller
option `extraAuthorKeys`.

Exit codes: 0 ok, 1 failure, 2 usage, 3 incomplete/partial, 4 bad input, 70 internal. The `trustee` delegate preserves the offline trustee's own exit codes. Design notes: `packages/verifier/NOTES.md`.

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

## Service health

```sh
qv health https://vote.example --json
qv health http://127.0.0.1:8080 --timeout-ms 5000
```

This explicitly checks `/healthz`, `/readyz` and `/api/v1/instance` once each,
using unsigned GET requests. All three must report their expected success shape
for exit 0; failed, unavailable or malformed responses give exit 1, with each
endpoint's result retained. Invalid arguments give exit 2. The transport accepts
HTTPS origins or loopback HTTP, refuses redirects, and applies the existing
20-second default deadline (1..120000 ms) to each request including its body.
Each body is limited to 64 KiB. No credentials or election records are read.

JSON reports `scope: "service-health"`, `ready`, `election_verified: false` and
the three endpoint results. Availability and basic response shape do not prove
API-version compatibility, election integrity, server identity, release
authenticity or sustained uptime. Extra response fields and raw server messages
are omitted.

## Offline archive migration

```sh
qv migrate-archive --data-dir /absolute/path/data \
  --election 0123456789abcdef0123456789abcdef --json
qv migrate-archive --help
```

Stop every server process using that data directory first. This delegates to the
separately installed `qv-migrate-archive` from `@quietvote/server`, using the same
shell-free installed-command runner as `qv trustee`. Put `node_modules/.bin` on
PATH for a workspace checkout. The CLI imports no server package, loads no KEK,
and passes arguments, streams and the maintenance command's exit status through.
The server command returns 0 for success/current schema, 1 for a maintenance
failure, and 2 for invalid usage; a missing/unlaunchable delegate returns CLI exit 4.

The server command upgrades one supported native `ARCHIVED` or `IMPORTED`
database using a verified private copy and a retained original SQLite snapshot.
It reports storage preservation and the unchanged presence/absence of independent
recovery anchors. It does not create a protocol-signature, freshness or finality
verdict. A failed replacement attempt can report `possibly_published`; default
text and JSON failures identify a completed retained backup. Inspect the current
archive before recovery or retry. Cancellation can leave a stale maintenance lock
and staging directory; the wrapper's existing bounded signal forwarding cannot
promise cleanup after forced termination.

POSIX uses the installed executable's real path. Windows accepts a native
`qv-migrate-archive.exe` or the recognized standard npm wrapper only when its exact
target matches `@quietvote/server`'s declared binary. Custom wrappers refuse.
PATH directories remain trusted executable locations. Windows replacement,
directory durability and interactive termination need native qualification.
See the [server migration and recovery guide](../server/README.md#explicit-archive-schema-migration).

## Offline trustee delegation

```sh
qv trustee help
qv trustee status --bundle trustee.qvtb --passphrase-file private-passphrase.txt
```

The approved ADR-027/N-39c adapter runs `qv-trustee` from PATH in a separate
process. Arguments and native stdin/stdout/stderr pass directly to that process;
the offline trustee retains its own parsing, hidden prompts, private-file access
and exit codes. The wrapper does not import trustee code or read passphrases.
Missing/unlaunchable commands return exit 4 without printing their arguments.
When Node delivers SIGINT or SIGTERM to the wrapper, it forwards the signal and
allows one second before forcing the child to stop. This cancellation path was
tested on POSIX; Windows termination and interactive-console behavior require
separate qualification. Cancellation is a failure, including when the child exits
gracefully; inspect the trustee's existing recovery state before resuming.

For a workspace checkout, install the locked dependencies and put
`node_modules/.bin` on PATH before running the delegate. POSIX resolves the
selected executable's real path. Windows supports a native `qv-trustee.exe` or
the recognized standard npm Node launcher: its exact target must match the
associated `@quietvote/trustee` package's declared binary. Custom or differently
formatted Windows wrappers are refused; no shell is enabled as a fallback.
Explicit PATH directories are trusted executable locations. Empty entries do
not implicitly select the current directory.

The [continuation receipt](../../docs/audits/CONTINUATION_R23_20261127.md)
distinguishes local process tests from native-platform and manual terminal
qualification. This adapter does not complete trustee hardware packaging or
durable checkpoint retention.

New QVKEY1 keys use the same passphrase normalization in the CLI and web client: phrases of at least six embedded-list words
accept case, whitespace and hyphen variants; other phrases retain NFKC-normalized spelling. Keep the exact spelling used for
older CLI-created keys, including capitalization, spaces and hyphens. Both clients can unlock those files using a distinct
legacy NFKC fallback (at most two KDF attempts). The container stays version 1; no key file is rewritten merely by unlocking.

`board verify --witness-policy` applies to standalone board bundles. A clean standalone result remains `PARTIAL` (exit 3)
when either `--log-key` or `--witness-policy` is omitted, because the corresponding bundle field is self-attested.
Obtain both anchors from a trusted source, such as the independently checked manifest; copying the bundle's own policy
into a file does not establish trust. Author-key and body checks must also pass for `VERIFIED` (exit 0), and actual
verification failures remain `FAILED` (exit 1). Election bundles use their signed manifest policy and refuse the external-policy option.

## `qv election spoil-collect` (coordinator, offline)

```
qv election spoil-collect --election <bundle> --code <64-hex> --packet <file> [--packet <file>]... [--manifest-hash <hex>] [--post-body-out <dir>] [--json]
```

Combines the `spoil-share` packets produced by `qv-trustee spoil-release` for one trustees-mode spoiled ballot and prints the decoded
selections. Exit 0 on success, 1 if the code is not a verified trustees-mode spoil (unknown, cast, re-wrapped) or fewer than `t`
shares verify, 2 usage, 4 unreadable input. `--post-body-out` writes each verified record as `<dir>/<code8>-<j>.json` (the signed
record, the request body accepted by the coordinator's spoil-shares endpoint). Relay this directory with
`qv online election-spoil-post`, using the same election bundle and an independently obtained manifest hash.

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
qv online election-spoil-post --server https://vote.example --id ELECTION_ID --post-dir verified-shares \
  --election election.json --manifest-hash ANNOUNCED_MANIFEST_HASH --json
qv online election-export --server https://vote.example --id ELECTION_ID --format json --out election.json
qv verify election.json --manifest-hash ANNOUNCED_MANIFEST_HASH --json
```

Use the instance ID and configured public URL obtained from the operator for `--audience`. The transport origin
may differ from that audience during local forwarding. Management requests reuse the server's signed-request
framing and accept the existing protected QVKEY1 key format. Seeds and passphrases never belong in arguments.
Create requires an explicit access choice and stable idempotency key. Reusing the same key/body avoids duplicate
creation; changing the body requires a new key. A successful link-access creation returns its read key once;
protect the command output. Read commands accept `--read-key-file` for that key instead of placing it in arguments.

### Posting trustee spoil shares

```sh
qv online election-spoil-post --server https://vote.example --id ELECTION_ID \
  --post-dir verified-shares --election election.json \
  --manifest-hash ANNOUNCED_MANIFEST_HASH [--timeout-ms 20000] [--json]
```

Use a dedicated directory containing the signed JSON bodies written by `spoil-collect --post-body-out`.
Both `--election` and the independently obtained `--manifest-hash` are required. The command checks the
manifest and DKG context, matches the manifest's election ID to `--id`, requires trustee spoil mode, and
validates every body's schema, context, trustee signature, and point/scalar encodings before its first request.
Duplicate ballot-code/trustee pairs are refused. These checks establish the stated context and signature scope;
the server still checks share proofs, spoil eligibility, and its current lifecycle when admitting each record.

Input is limited to 1,024 regular `.json` files, 1 MiB per file and 64 MiB in total. Empty directories,
unexpected entries, symbolic links and special files are refused. The whole directory is read and checked
before posting, and the retained original bytes are sent unchanged in filename order. Inputs are never rewritten.
The POST endpoint authenticates each signed record itself, including for link-access elections: no organizer
key, audience, read key or idempotency key is needed by this command. The separate GET inspection endpoint
still requires the link read key.

Matching `201 accepted` and `200 duplicate` responses count as server acknowledgments. The command stops on
the first rejection or uncertain outcome and never retries automatically. JSON output reports every item as
`accepted`, `duplicate`, `rejected`, `unknown`, or `not_attempted`, with its code, trustee index, and exact body
SHA-256. It retains earlier acknowledgments on partial failure. Timeouts, connection loss, refused redirects,
5xx responses, and oversized, malformed or mismatched acknowledgments leave the current submission `unknown`.
Retain the exact files and inspect server state before deciding whether to retry. An explicit replay may
return `duplicate` before tally publication; once the tally is posted, the server rejects further submissions.

Exit 0 means every item was acknowledged; exit 1 includes rejection, uncertainty, and failed context/signature
checks; exit 2 is usage; exit 4 is unreadable, malformed or excessive input. A server acknowledgment does not
verify tally inclusion or the election result. Response bodies, server free text and local filenames are not
printed; the report identifies items using their validated public fields and input hashes.

### Organization registration

Register an existing protected key as an organization owner before creating its
first election. Obtain the signature audience and registration policy from the
instance operator. The adopted QV-08 request signature proves possession of the
same public key sent in `owner_key`; no browser session is needed.

```sh
qv online org-create --server https://vote.example \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.key \
  --passphrase-file passphrase.txt --name 'River Cooperative' \
  --idempotency-key register-river-2026 --json
qv online org-inspect --server https://vote.example --org ORG_ID \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.key \
  --passphrase-file passphrase.txt --json
```

Token-gated instances also require `--registration-token-file token.txt` on
`org-create`. The token must be in a bounded owner-private UTF-8 file: one line
of 1..200 characters, optionally ending in a single LF or CRLF. Spaces and other
token spelling are preserved. Token values have no command-line flag. The command
discards returned token fields and uses static creation errors. The server decides whether registration is open, token-gated or
closed; the CLI cannot override that policy.

Creation checks the returned organization ID, requested name and owner key,
then prints only those public fields. It unlocks the key once, including when a
passphrase is supplied on stdin. Keep the returned organization ID for
`election-create --org`. An explicit replay with the same idempotency key and
identical name/key/token returns the original result; changing that body under
the same key is refused. Failed or malformed responses are not retried
automatically and never echo server-supplied text that might contain the token.
Inspect server state before retrying an uncertain result.

### Pinned membership

For a pinned election, add `--pinned-roll members.json` to `online election-create`. The file must be a JSON array
of distinct, strictly ascending, lowercase hexadecimal Ed25519 public keys, each 64 characters. The client does not
sort, normalize or remove entries. It rejects malformed keys, directories, symbolic links where supported by the
platform, and oversized files before loading a signing key or making a request. The complete signed JSON request
must fit the existing 1,153,434-byte ceiling; the server also enforces its configured voter limit. No secret keys,
invitation tokens or contact details belong in this file.

The supplied list is immutable and must match the later signed manifest's roll root and size. Membership is stored
separately from enrollment: a member who never registers remains on the committed roll and in the quorum denominator.
An active election reports that member as `registered: false`; an imported archive reports `registered: null` and
`registration_known: false` because a public archive contains membership evidence without registration history.

To provision an existing unpublished draft, or recover the missing list for an already-published pinned manifest:

```sh
qv online election-pinned-roll --server https://vote.example --id ELECTION_ID \
  --pinned-roll members.json --audience qv:INSTANCE_ID@https://vote.example \
  --key organizer.key --passphrase-file passphrase.txt --idempotency-key attach-membership-2026 --json
```

For an existing pinned manifest, use its original complete list. The server checks the root and size. Identical
retries preserve the first list; a different list is refused, and published unpinned elections and imported mirrors
cannot be converted through this command. A legacy browser publish checkpoint must be inspected and recovered
explicitly with this command; the browser refuses to assume an older creation authenticated the full list.

`election-submit` relays a JSON object containing only `header` and `body`, each base64url-encoded board-entry
bytes. `qv-trustee export-entry` now creates this format for persisted trustee ceremony outputs and gated tally
shares; the offline `election sign-record` and `election export-entry` commands prepare coordinator and voter packets below. The server checks
signatures, protocol validity and allowed state transitions. It can relay manifest, ceremony, open, ballot,
close and tally packets; it does not generate protocol signatures or choose trustee/coordinator quorums.
Without `--log-key`, a returned receipt means server acceptance without independent receipt or result
verification. The optional [returned-receipt check](#check-returned-submission-evidence) below verifies
the already-returned evidence against the exact packet and an independent key pin. Retain receipts
and use the board/election verifiers with the appropriate independent trust anchors.

Online commands print JSON, except `election-spoil-post`, which prints a human-readable summary unless `--json` is supplied. A non-2xx response exits 1 with its status and bounded error code. Server 5xx responses, malformed successful responses and network
failure during a mutation also exit 1 and explicitly report an unknown outcome; inspect state before retrying.
Commands never retry a mutation automatically. Downloads use mode 0600, never overwrite an existing path,
and are labelled `verified: false` unless the optional `election-export --verify` checks below pass.

The offline [`election check-tally`](#check-an-unsigned-tally-proposal) command recomputes an unsigned
proposal against a pinned pre-publication archive. The [later receipt check](#check-a-later-receipt-proof)
below retrieves one requested proof and checks consistency against a supplied prior receipt checkpoint.
Remaining workflow gaps include automatic receipt retention, latest-checkpoint tracking and off-site backup/restore orchestration.
`backup-create` requests the existing server-local snapshot;
the separate server `qv-backup` tool verifies and restores full snapshots as described below.

### Verify a downloaded election snapshot

The existing export command can verify the exact bytes it saves:

```sh
qv online election-export --server https://vote.example --id ELECTION_ID \
  --out snapshot.qvb --verify --manifest-hash INDEPENDENT_MANIFEST_HASH --json
```

Obtain the 64-character lowercase manifest hash through an independent, trusted channel. The command
requires it with `--verify` and also checks that the authenticated manifest names the requested election
ID. A hash learned only from the download or its server does not establish that independent trust.
Without `--verify`, the command keeps its existing download behavior and reports `verified: false`.

Verification reuses the archive preparer and full election/board verifier, including its canary self-tests.
A successful result requires all relevant protocol checks, witness coverage of the exact saved snapshot
using the signed manifest's witness keys, and no authenticated outcome control whose effects remain
uninterpreted. Security notices remain visible in the report. There is no content-only mode or self-test
opt-out for this command.

| Result | Output and exit |
| --- | --- |
| Required snapshot checks pass | `verified: true`, `verification.verdict: "PASS"`; exit 0. |
| Evidence is incomplete, for example no published tally or no final-snapshot witness quorum | `verified: false`, `verification.verdict: "INCOMPLETE"`; exit 3. |
| A check fails, the independent pin or election ID disagrees, or the download is malformed | `verified: false`, `verification.verdict: "FAIL"`; exit 1. |

The file remains saved with its exact received bytes for every verification outcome. An existing file is
never overwritten, including one retained after failed verification. `verification.download_sha256`
identifies those bytes; `verification.report` contains the existing verifier's report when it could run.
The command's stricter snapshot verdict is separate from that report's verdict: a protocol-local ballot
failure or an uninterpreted outcome control can prevent a successful claim even when the underlying
verifier reports `PASS`.

For JSON, use `--format json --verify`; this requests the server's existing `export.json?board=1` route
so the file includes board evidence. If server-authored records need supplemental author keys, supply
independently obtained keys with repeated `--extra-author-key PUBLIC_SIGNING_KEY` options, at most 32.
Each key is 64 lowercase hexadecimal characters. These pins supplement the existing record-role checks;
they do not authorize a different manifest signer. This option applies only to verified JSON exports.
QVB verification retains the archive preparer's current authority rules, including refusal of a manifest
entry signed solely by a separate organizer key.

**Current server compatibility limit:** ordinary server tally exports contain board-only `tally-aggregate`
and `dec-shares` records that the protocol verifier deliberately treats as unknown. The underlying verifier
can report `PASS` while `chk.encoding.canonical` fails for those records; this command reports `FAIL` and
`verified: false`, including when independently supplied author keys resolve their board headers. The same
limit prevents offline `ballot status` from establishing a status for such an archive. QVB metadata alone
does not settle independent trust in a supplemental server author. Supporting these records end to end
requires a separate reader and author-trust contract; see the
[compatibility report](../../docs/reports/export-derived-record-compatibility-20261127.md).

The result applies to this downloaded snapshot. `freshnessVerified` and `finalityVerified` remain `false`:
the command does not establish that the server supplied the newest independently observed view or that
the election is final. A successful tally check cannot turn a provisional or old snapshot into either claim.

### Check returned submission evidence

Add an independently obtained log public key to check the immediate response when relaying a packet:

```sh
qv online election-submit --server https://vote.example --id ELECTION_ID \
  --file signed-entry.json --log-key ANNOUNCED_LOG_PUBLIC_KEY --json
```

The pin is the 64-character lowercase hexadecimal Ed25519 public key, for example `bb.log_pk`
from a manifest already checked against its independent hash. A key learned only from the response
being checked does not establish that trust. The command derives the expected log origin from the
selected election ID, decodes the exact canonical header, checks its body length/digest and computes
the expected Merkle leaf locally before POST. This binds the receipt to those packet bytes; inner
protocol validity and entry-author authority remain separate verification and server admission checks.

| Evidence returned with `--log-key` | CLI result |
| --- | --- |
| Valid log-signed promise and inclusion proof to its signed checkpoint | `verification.promise: "VERIFIED"`, `verification.inclusion: "VERIFIED"`; exit 0. |
| Valid log-signed promise, without inclusion yet | Promise `VERIFIED`, inclusion `INCOMPLETE`; exit 3. |
| Malformed, mismatched or failing returned evidence | Exit 1 with possible-acceptance guidance; no successful verification report. |

The checked response contains selected `status`, `receipt` and client-generated `verification` fields.
`receipt` uses the board library's normalized JSON representation: flat promise timestamps and standard
base64 leaf/signature, rather than the REST envelope's nested promise and base64url fields. The contained
receipt object can be supplied to `verify-receipt` after saving it separately; the whole submission
report is not that command's receipt input. Unknown additive server members are ignored and never
become client verification claims. Only the two defined `included` and `sequenced` states are interpreted;
an unknown future status cannot acquire invented receipt assurance and also exits 1 without asserting rejection.

`verification` identifies the independent key, expected origin and leaf hash, sets `scope: "receipt-only"`,
and explicitly leaves authority, witness quorum, freshness and ballot counting unverified. Included
evidence proves the bound entry's inclusion in that signed checkpoint. It does not establish that a
ballot remains the latest counted ballot, that the checkpoint is the newest independent view, or that
an election result passed. A signed promise deadline is not an authenticated current-time verdict.

Checked mode accepts a regular packet file of at most 1,153,434 bytes, validates its transport encoding,
header and body binding against existing body-type limits, and bounds the response to 64 KiB. It performs
one POST with the existing timeout and redirect rules. It does not poll for a later proof, automatically
retry, rewrite the packet or persist a checkpoint. File-read/input errors exit 4; option errors and
malformed public keys exit 2 before submission. A valid public key for the wrong log is detected by
checking the response after POST. If that check fails, acceptance remains possible: retain
the exact packet and inspect state before deciding whether to repeat those same bytes.

Omitting `--log-key` preserves the existing server-response-only mode and output shape. As with all
online commands, both default output and `--json` are JSON. An HTTP success in the legacy mode does
not acquire receipt assurance from this optional check.

### Check a later receipt proof

Use a saved normalized receipt with independent election, log-key and exact leaf expectations:

```sh
qv online receipt-check --server https://vote.example --id ELECTION_ID \
  --file receipt.json --log-key ANNOUNCED_LOG_PUBLIC_KEY \
  --leaf-hash EXPECTED_HEADER_LEAF_HEX --tree-size REQUESTED_CHECKPOINT_SIZE --json
```

Save only the contained `receipt` object from checked submission output, not the entire report or the
raw REST response. The independent key and expected leaf should be retained from the original verified
manifest and exact submitted packet; the checked submission report records the leaf it computed locally.
Do not obtain these anchors solely from the proof response being checked. `--tree-size` selects an explicit
checkpoint size from 1 through 1,099,511,627,776; a server-advertised size is only a request selector until
the returned signed evidence verifies. For a link election, supply the existing private `--read-key-file`.

Before any network request, the command verifies the saved promise and all saved inclusion evidence
under the supplied anchors. The requested size must cover its sequence and cannot precede a supplied
included checkpoint. It then makes one GET for that exact sequence and size. If the saved receipt already
has inclusion at a smaller checkpoint, a verified new inclusion also requires one consistency-proof GET
with those exact old/new sizes. At equal size, the roots must agree and no second request is made.

| Requested evidence | Result |
| --- | --- |
| Valid inclusion with no prior included checkpoint | Exit 0; inclusion `VERIFIED`, consistency `NOT_CHECKED` because no prior checkpoint was supplied. |
| Valid inclusion and consistency with the supplied prior checkpoint | Exit 0; inclusion and consistency `VERIFIED`. |
| Structurally valid proof without the API's optional signed checkpoint note | Exit 3; requested inclusion `INCOMPLETE`; the saved receipt is returned unchanged in normalized form. No consistency request is made. |
| Malformed or failing supplied response evidence, HTTP error or failed HTTP read | Exit 1; no successful proof report. A failed HTTP read does not establish that the original submission was rejected or the entry is absent. |

Both default and `--json` output contain `status`, `receipt` and client-owned `verification` with
`scope: "receipt-proof"`. `requested_tree_size` identifies the new request, `previous_tree_size` the saved
included checkpoint or null, and `receipt_tree_size` the checkpoint actually contained in the output receipt
or null. When the requested note is missing, an older valid inclusion remains in `receipt`; `INCOMPLETE`
describes the requested snapshot, not invalidation of that older evidence. Consistency is then `INCOMPLETE`
when a prior checkpoint exists, otherwise `NOT_CHECKED`. The verified promise remains visible.

On success, save the new contained receipt separately if desired; it works with the existing offline
`verify-receipt` command. Neither input files nor retained checkpoints are automatically changed. Consistency
is relative only to the supplied receipt, not necessarily the user's latest observation. This command does
not complete durable latest-checkpoint tracking. Authority, witness quorum, freshness and ballot counting
remain explicitly unverified; a selected signed snapshot is not proof of the newest state or FINAL status.

The receipt must be a regular QV-JSON file of at most 64 KiB. Each response is bounded to 64 KiB; inclusion
and consistency paths use the existing 64/63-hash limits. Requests use the existing timeout and redirect
rules, with no polling or automatic retries. Invalid options/key spelling exit 2; unreadable, malformed or
unverified saved evidence and incompatible snapshot bounds exit 4 before GET. Unknown additive REST
members cannot replace client assurance. The command makes no submission or other server mutation.

### Recorded PUBLIC export management

These commands use the existing [signed management API](../../docs/09-api-data-contracts.md#101-recorded-public-exports-and-archived-deletion).
Use the organization or administrator key and its configured signature audience.
They support the existing passphrase-file/stdin options; secrets never belong in arguments.
Download and acknowledgement each unlock the signing key once for both requests,
so a passphrase supplied on stdin is read only once per command.

1. Run `online export-create` with the election ID and an explicit idempotency key.
   The response identifies a job. `online job-inspect --job-id JOB_ID` reads that
   job; once it is `done`, `result.export_id` identifies the immutable snapshot.
   The CLI does not poll indefinitely or automatically retry a mutation.
2. `online export-list` lists the election's recorded exports.
   `online export-inspect --export-id EXPORT_ID` returns the exact byte digest,
   tree root/size, expiry, acknowledgement and notice timestamps.
3. `online export-download --export-id EXPORT_ID --out retained.qvb` downloads
   those exact bytes to a new private file. It checks byte length, SHA-256, strict
   checksummed archive framing, election origin and tree binding. Existing paths
   are refused. Server-provided URLs do not choose the request destination.
   The CLI accepts archives up to 64 MiB and 10,032 archive members; larger server
   snapshots require another bounded client. Downloading does not acknowledge retention.
4. Independently verify the election using the existing verifier and trusted
   manifest/log/witness anchors, then retain the archive. A matching server digest
   does not establish election correctness, freshness or an off-site backup.
5. `online export-acknowledge --export-id EXPORT_ID --file retained.qvb --retained`
   checks the local file against the recorded snapshot, checks it again after
   unlocking the signing key, and sends the explicit acknowledgement. Supply an
   idempotency key. `--retained` is the operator's retention statement; the CLI
   cannot prove that a backup will remain available.

For example, using the same server, audience and key for each management command:

```sh
qv online export-create --server https://vote.example --id ELECTION_ID \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.qvkey \
  --passphrase-file pass.txt --idempotency-key archive-create-0001
qv online job-inspect --server https://vote.example --job-id JOB_ID \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.qvkey --passphrase-file pass.txt
qv online export-download --server https://vote.example --id ELECTION_ID --export-id EXPORT_ID \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.qvkey --passphrase-file pass.txt --out retained.qvb
qv online export-acknowledge --server https://vote.example --id ELECTION_ID --export-id EXPORT_ID \
  --audience qv:INSTANCE_ID@https://vote.example --key organizer.qvkey --passphrase-file pass.txt \
  --file retained.qvb --retained --idempotency-key archive-acknowledge-0001
```

The separate `online export-deletion-notice` command takes `--export-id`,
`--tree-size`, `--root-hash`, `--sha256` and an idempotency key, in addition to
the election and authentication options. Copy the exact binding from the record
you intend to notify. The server accepts it only for the final ARCHIVED tree and
starts the existing 30-day grace period. It neither acknowledges retention nor
deletes the election. This is an explicit operator action; export age and
downloads never start the grace period. All deletion authority remains with the
server's existing lifecycle, snapshot and runtime-health checks.

The online integration test exports an actual successful three-voter election and runs both the TypeScript CLI
and Python's `vectors` CLI on it, comparing all shared report fields under explicit content-only scope.
The default JSON export has no board evidence, so direct verification reports INCOMPLETE; those checks
remain `not_run`, and matching content-only reports do not establish board/witness assurance. Python
also supports direct `verify` with board, witness and receipt evidence; the additive `export.json?board=1`
contains board evidence and all public records for verification. That test uses the server `World` harness for
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

## Check an unsigned tally proposal

After voting closes and the trustee shares are available, obtain the proposed tally body and a
public archive from before the tally is published. Check that exact body before signing it:

```sh
qv online election-tally-draft --server https://vote.example --id ELECTION_ID \
  --decrypters 1,2 --out tally-body.json
qv online election-export --server https://vote.example --id ELECTION_ID --out before-tally.qvb
qv election check-tally before-tally.qvb --manifest-hash ANNOUNCED_HASH \
  --draft tally-body.json --json
```

Obtain `ANNOUNCED_HASH` through an independent channel. The check requires it and reads only the
two public files. It recomputes the existing manifest/DKG, opening and closing, ballot selection,
counted root, aggregate, decryption proofs and complete valid decrypter set, result rules and
disclosed spoil checks. It uses the existing protocol verifier rather than trusting the server's
proposed totals. The candidate stays outside the authenticated log; no signature or board entry
is generated, and nothing is submitted.

The default result is `MATCH` (exit 0) only when the body matches the supplied snapshot and the
required append-only and witness checks pass. A disagreement or failed required evidence gives
`FAIL` (exit 1); unfinished verification gives `INCOMPLETE` (exit 3). The snapshot must contain a
valid close and no published tally. The checker requires the declared witness coverage of the
closed ballot set and opening/closing times. A snapshot still awaiting those required
cosignatures fails even if its draft totals are correct.

When the signed manifest explicitly sets witness quorum to zero, the normal result remains
`INCOMPLETE`. Adding `--content-only` permits a scoped `MATCH` after the supplied board and
cryptographic content checks pass. It prints the content-only and unwitnessed caveats; it cannot
waive failed evidence or a nonzero witness requirement. Read the findings, warnings and caveats
with the verdict. Existing classifications of ignored ballot envelopes and informational or alarm
findings are retained, so `MATCH` does not mean every optional check ran or every finding is absent.

Both output formats identify the pinned manifest, SHA-256 of the candidate's canonical QV-JSON
body, and the checked snapshot's origin, tree size and root. JSON also includes
`scope: "tally-draft"`, `bodyMatchesSnapshot`, `published: false` and `freshnessVerified: false`.
These fields describe the comparison's scope: the command establishes no publication, newest
snapshot, challenge resolution or FINAL status. A successful comparison is not a full-election
`PASS`. Keep the body and snapshot unchanged when reviewing and signing; the existing signing
command does not automatically run this check or consume its report.

The archive uses the same regular-file, 64 MiB, 10,000-entry and 10,032-member bounds as `prepare`;
it must contain the complete unredacted board. The draft is a regular QV-JSON file of at most
1 MiB. Files that change size while reading, and symbolic links where `O_NOFOLLOW` is supported,
are refused. The existing archive authority policy still refuses a manifest envelope authored
by a separate organizer; this command does not add organizer authority. Usage mistakes exit 2;
file-read and parsing errors exit 4. A parsed candidate that fails its tally schema or verification
yields `FAIL` (exit 1). Neither input is rewritten.

## Server-local backup jobs

An instance administrator can request the existing [backup API](../../docs/09-api-data-contracts.md#10-export-import-jobs-admin)
with an explicit scope and idempotency key:

```sh
qv online backup-create --server https://vote.example --scope all \
  --audience qv:INSTANCE_ID@https://vote.example --key admin.key \
  --passphrase-file passphrase.txt --idempotency-key backup-full-2026-11-20 --json

qv online job-inspect --server https://vote.example --job-id JOB_ID \
  --audience qv:INSTANCE_ID@https://vote.example --key admin.key \
  --passphrase-file passphrase.txt --json
```

Use `--scope election --id ELECTION_ID` for one election. Full scope refuses `--id`.
The command validates the returned job ID, backup kind and requested election binding,
then prints selected job metadata. Exit 0 confirms a valid submission response; it does
not mean the job finished. `job-inspect` reports the server's current state, including
`done` or `failed`, and does not independently verify the snapshot.

The server writes snapshots under its own `<data>/backups/<job_id>/` directory. The CLI
does not download files or follow response links. Within the server's 24-hour
idempotency window, an explicit repeat by the same administrator key with the same
scope, election and idempotency key identifies the original request. After that window,
the same idempotency key may create a new job. The command never retries automatically.
Inspect server state after an unknown outcome and preserve the original key before
deciding whether to submit again.

Full snapshots include the control database and its election databases. Election scope
contains one election database and cannot serve as a full-instance recovery input.
The snapshot excludes the instance KEK; sealed database fields still require that
original KEK. Copying, protecting and retaining the snapshot and KEK are separate
operator procedures.

The [offline backup and recovery guide](../../docs/OFFLINE-BACKUP-RESTORE.md) covers
`qv-backup verify --backup DIR --kek-file FILE` and
`qv-backup restore --backup DIR --kek-file FILE --minimum-backup DIR --destination NEW_DIR`.
Restore requires a full snapshot, its original KEK, a verified minimum backup floor
and a new destination. Requesting a job does not perform these checks or establish
off-site retention, independent freshness, or a tested recovery procedure.

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
origin independently. Review the lifecycle body before signing; `draft-record` can derive ceremony/roll/open/close and sequenced control bodies from an authenticated public archive,
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

# Download and check the exact proposal against a pinned pre-publication snapshot before signing.
qv online election-tally-draft --server https://vote.example --id ELECTION_ID \
  --decrypters 1,2 --out tally-body.json
qv online election-export --server https://vote.example --id ELECTION_ID --out before-tally.qvb
qv election check-tally before-tally.qvb --manifest-hash ANNOUNCED_HASH --draft tally-body.json --json
# Review a scoped MATCH and its findings/caveats before invoking the separate signing command.
qv online election-export --server https://vote.example --id ELECTION_ID --format json --out public-election.json
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

In the tally example, `public-election.json` supplies the signing command's separately pinned manifest/DKG
context check. The earlier `check-tally` result remains scoped to `before-tally.qvb` and the checked candidate;
the JSON download neither replaces that comparison nor proves either input is the newest independent state.

New control packets may omit `reason` or use one of the public codes in QV-07 section 15.2,
such as `AVAILABILITY`, `BOARD_ROLLBACK`, or `OTHER`. Free text is rejected before signing,
including when adding a signature with `--record`. `OTHER` is a code without an explanation field.
Existing signed historical controls remain readable by the offline verifiers and server replay.

New controls also require a signed `control_seq`. `draft-record` derives it from the authenticated
archive, and `sign-record` requires `--election current.qvb` to check that it is the next value.
An old prefix without counters starts the new sequence at one. After the first numbered control,
every control must increment it by exactly one; ballot traffic does not change the counter.

```sh
qv election draft-record current.qvb --manifest-hash ANNOUNCED_HASH \
  --kind pause --reason AVAILABILITY --out pause-body.json
qv election sign-record --manifest manifest.json --manifest-hash ANNOUNCED_HASH \
  --election current.qvb --body pause-body.json --key coordinator1.key \
  --passphrase-file passphrase.txt --out pause-first.json
qv election sign-record --manifest manifest.json --manifest-hash ANNOUNCED_HASH \
  --election current.qvb --record pause-first.json --key coordinator2.key \
  --passphrase-file passphrase.txt --out pause-quorum.json
```

Preparation and signing authenticate the archive's manifest, records and board structure. They do
not prove that it is the newest archive; summaries report `freshness_verified: false`. If another
control was accepted meanwhile, the server returns `409 STATE_CONFLICT` / `CONTROL_SEQUENCE`.
Obtain the current archive, prepare a new body and collect new signatures. Rewrapping the old
signed body does not refresh its counter. An exact packet retry keeps the existing receipt behavior.

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

## Offline ballot status

```sh
qv ballot status --election retained.qvb --manifest-hash ANNOUNCED_HASH --code BALLOT_CODE --json
```

Obtain the manifest hash independently. Both hash and code must be exactly 64
lowercase hexadecimal digits. Input must be a complete, unredacted public archive,
at most 64 MiB and 10,000 entries. No network request or file write occurs.

Status requires the manifest, trustee ceremony, board, ballot proofs, revote rules,
voting window, spoil checks and published tally to verify. The exact snapshot must
also have the pinned manifest's witness quorum. Unsupported outcome-affecting
controls leave status unverified, and protocol caveats remain visible. There is no
content-only override.

| Status | Meaning within this snapshot | Exit |
| --- | --- | --- |
| `COUNTED` | Included in the fully checked tally. | 0 |
| `SUPERSEDED` | Replaced through the verified same-voter chain by a later counted cast. | 0 |
| `SPOILED` | A spoiled test ballot; not counted. This is not a separate private-reveal audit. | 0 |
| `ABSENT` | Absent here; not proof it was never submitted or accepted elsewhere. | 1 |
| `EXCLUDED` | Recorded but neither counted nor proved superseded. | 1 |
| `UNVERIFIED` | Required evidence failed or remains incomplete. | 1 for failure; 3 for incomplete |

Malformed options exit 2; unreadable, malformed or oversized archives exit 4. Wrong
manifest pins exit 1. Archive preparation refusals do not emit a status.
JSON uses `qv-ballot-status/v1`, includes the selected code and snapshot origin/size/root,
and distinguishes the stricter command verdict from `verification.protocol_verdict`.
`counted` is null when unverified, true only for COUNTED, otherwise false within the
snapshot. It does not print voter lists or selections. Human caveats are JSON-quoted.
Even a checked archive can be old: `freshnessVerified` and `finalityVerified` are always
false. QuietVote remains unaudited and not for real elections.
