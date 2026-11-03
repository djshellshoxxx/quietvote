# @quietvote/cli

`qv`: zero-dependency command line over `crypto`, `protocol`, `board` and `verifier`. Run `node packages/cli/bin/qv.ts --help`.
Commands: `verify`, `selftest`, `keygen`, `ballot encrypt|audit`, `board verify`, `election inspect`, `vectors check`.
Exit codes: 0 ok, 1 failure, 2 usage, 3 incomplete/partial, 4 bad input, 70 internal. Design notes: `packages/verifier/NOTES.md`.

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.
