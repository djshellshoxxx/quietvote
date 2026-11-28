# @quietvote/verifier

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

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

## Offline archive input

Both entry points accept the existing uncompressed reference-server `.qvb`
container, as well as election-bundle JSON:

```sh
qv-verify election.qvb --manifest-hash INDEPENDENT_MANIFEST_HASH --json
qv verify election.qvb --manifest-hash INDEPENDENT_MANIFEST_HASH --json
```

The loader uses the shared board tar/checksum reader without extracting files or
contacting a server. It binds `election.json` to the manifest and entry bodies in
`log/entries.jsonl`, then verifies **every present board body**, including derived records
omitted from the server's convenience `election.json`. Its comparison target is
the JSON election bundle containing all board records and the full `board`
export. Existing cryptographic checks, self-test, verdicts, exit codes and caller
trust options apply unchanged. Checksums alone do not authenticate an election.
Embedded server, organizer and witness keys do not become independently trusted
caller keys; supplemental authors still need the existing explicit pin option.

Archive parsing is limited to 64 MiB, 10,000 entries, 10,032 files, and 64 KiB per
descriptor (`bundle.json`, witness policy and redaction list). The current reader
requires the reference-server `election.json` member. It does not decompress
`.tar.zst`. Other checksummed members, including receipt and
OpenTimestamps attachments, optional signatures and convenience copies, are
**unassessed**: they do not become receipt claims, trusted keys or verified
anchors. Receipts supplied through the existing verifier caller options retain
their existing checks.

Redacted `body_b64u: null` fields are accepted only at the outer board entry body
position in JSONL or election JSON. Every row, retained header and redaction
record remains in board evidence. Signed protocol bodies still use strict QV-JSON
and reject null. A missing manifest body is bound to the supplied convenience
manifest using the retained header's length and digest; this structural comparison
does not replace signature verification or the independent manifest pin.

Existing partial-verification rules apply unchanged. Redactions degrade board
integrity to `PARTIAL` when the remaining board checks succeed, and V4 cannot
pass. Missing protocol records or other failed checks may still make the overall
verdict `FAIL`; a missing manifest body alone can yield `INCOMPLETE`. Content-only
mode cannot promote supplied partial board evidence to `PASS`. The archive and
equivalent full-board JSON produce the same assessment. Ordinary final server
exports retain their existing derived-record encoding failures and authority
limitations, so this is not a claim of full `.qvb` compatibility. See the
[redacted-container report](../../docs/reports/verifier-redacted-container-20261127.md).
