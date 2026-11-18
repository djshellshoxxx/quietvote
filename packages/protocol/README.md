# @quietvote/protocol

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
