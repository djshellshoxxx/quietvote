# trustee-cli: command-line surface (from code, snapshot `the ab84f16 snapshot`)

Method: read the argument parsers (`packages/cli/src/*.ts`, `packages/trustee/src/cli.ts`, `packages/verifier/src/main.ts`,
`verifier-py/qv_verifier/cli.py`, `scripts/*`, root and per-package `package.json`). Ran: `node packages/cli/bin/qv.ts --help` (exit 0),
`qv nosuch` (exit 2), `node packages/trustee/src/cli.ts help` (exit 0, usage on stderr), `node packages/verifier/src/bin.ts --selftest` (exit 0),
`qv-trustee verify-transcript --in {}` (exit 20). QuietVote is unaudited and not for real elections.
Test paths: C: = `packages/cli/test/`, T: = `packages/trustee/test/`.

## A. Binaries declared in package.json "bin" (3) plus one Python module

| Binary | Declared in | Entry |
|---|---|---|
| `qv` | `packages/cli/package.json` | `packages/cli/bin/qv.ts` |
| `qv-trustee` | `packages/trustee/package.json` | `packages/trustee/src/cli.ts` (main guard, not a `bin/` dir) |
| `qv-verify` | `packages/verifier/package.json` | `packages/verifier/src/bin.ts` |
| `python -I -m qv_verifier` | none (module) | `verifier-py/qv_verifier/__main__.py` |

No other `packages/*/bin/*` exist. `packages/server` has no executable entry (library `buildServer` in `src/app.ts`; `listen` only inside `src/http.ts`).

## B. `qv` (exit codes: 0 ok/PASS, 1 failure, 2 usage, 3 INCOMPLETE/PARTIAL, 4 unreadable or malformed input, 70 internal)

Global: `qv --version|version`, `qv help|--help` (prints usage; no args prints usage to stderr, exit 2). `--help` after any subcommand prints the global help, not per-command help.

| Command | Synopsis | Does | Secrets/keys | Exit codes used | `--json` | Covered by test |
|---|---|---|---|---|---|---|
| `qv verify` | `verify <bundle> [--json] [--skip-selftest] [--manifest-hash HEX]` | Runs canary self-test, then verifies election bundle V1..V14 | none | 0,1,2,3,4 | yes | C:cli.test.ts (verify tests) |
| `qv selftest` | `selftest [--json]` | Runs only the canary self-test | none | 0,1,2 | yes | C:cli.test.ts ("selftest command") |
| `qv keygen` | `keygen --out F [--seed-file F\|--seed-stdin] [--passphrase-file F\|--passphrase-stdin] [--no-passphrase] [--kdf-memory-kib N] [--kdf-iterations N] [--force] [--json]` | Creates a voter key file (QVKEY1, Argon2id) | yes: seed, passphrase (never argv; hidden prompt) | 0,2,4 | yes | C:cli.test.ts, C:audit.test.ts (BC-03,BC-05, secrets), C:audit-regressions.test.ts (F2,F8,F9) |
| `qv ballot encrypt` | `ballot encrypt --election B --key F --out F [--select c=o[,o]]... [--intent cast\|spoil] [--supersedes HEX] [--audit-out F] [--publish-reveal] [--manifest-hash HEX] [--passphrase-file F\|--passphrase-stdin] [--json]` | Builds and signs a ballot envelope offline; spoil writes an audit file | yes: voter key + passphrase | 0,1 (key not on roll, pin mismatch),2,4 | yes | C:cli.test.ts, C:audit.test.ts (BC-04), C:audit-regressions.test.ts (F6,F7) |
| `qv ballot audit` | `ballot audit --election B --ballot F [--manifest-hash HEX] [--json]` | Checks a spoiled ballot's reveal against its ciphertext | none (audit file holds reveal randomness) | 0,1,2,4 | yes | C:cli.test.ts, C:audit-regressions.test.ts (F3) |
| `qv board verify` | `board verify <board\|election bundle> [--log-key HEX] [--manifest-hash HEX] [--author-key HEX]... [--witness-policy F] [--pin-file F] [--json]` | Verifies log integrity, checkpoint, witnesses | none | 0,1,2,3,4 | yes | C:cli.test.ts, C:audit.test.ts (BC-01/02), C:board-policy-regressions.test.ts, C:audit-regressions.test.ts (F1,F11) |
| `qv election inspect` | `election inspect <bundle> [--json]` | Prints manifest summary (not a verification) | none | 0,1 (hash differs / invalid manifest),2,4 | yes | C:cli.test.ts, C:audit-regressions.test.ts (F12) |
| `qv election spoil-collect` | `election spoil-collect --election B --code HEX --packet F [--packet F]... [--manifest-hash HEX] [--post-body-out DIR] [--json]` | Combines trustee spoil-share packets offline, decodes selections, writes server POST bodies | none (public packets) | 0,1,2,4 | yes (also failure JSON `{ok:false,...}`) | C:spoil-collect.test.ts |
| `qv vectors check` | `vectors check [dir] [--strict] [--json]` | Checks the `test-vectors` corpus: manifest hashes, vectors, mutants, canary | none | 0,1,4 | yes | C:cli.test.ts, C:audit-regressions.test.ts (F4,F5) |

Generic robustness coverage: C:audit.test.ts (random argv fuzz never exits 70; secrets never echoed), C:cli.test.ts (args, help, real-process run).

## C. `qv-trustee` (offline; exit codes: 0 ok, 2 usage/no such file, 10 declined, 20 verification failed, 30 network (declared, unused), 40 state conflict/locked bundle, 50 bad passphrase/locked vault, 60 refused for safety)

Global options: `--json` (success `{ok:true,...}` on stdout; failure `{ok:false,code,kind,message}` on stderr). Passphrase: `--passphrase-file F` or `QV_TRUSTEE_PASSPHRASE_FILE` (must be mode 0600 on POSIX), otherwise hidden prompt. Backup passphrase: `--backup-passphrase-file` / `QV_TRUSTEE_BACKUP_PASSPHRASE_FILE`. Unknown command: usage on stderr, exit 2; no command or `help`: exit 0. Every command except `verify-transcript` needs the bundle passphrase and therefore touches the secret share.

| Command | Synopsis | Does | Secrets | Test via CLI entry (`main`) | Test via library API |
|---|---|---|---|---|---|
| `keygen` | `--bundle F [--generate-passphrase]` | New identity, sealed bundle; prints public signing key | passphrase (generated one printed to stderr) | T:cli.test.ts, T:hardening.test.ts (T11) | T:lifecycle.test.ts |
| `join` | `--bundle F --manifest F --manifest-hash HEX [--ceremony-id ID]` | Binds bundle to election after checking hash, signatures, listed key | passphrase | T:cli.test.ts (exit 20), T:hardening.test.ts | T:ceremony.test.ts |
| `import` | `--bundle F --log F.qvl` | Validates and merges a public log slice; fork = exit 20 | passphrase | T:cli.test.ts | T:ceremony.test.ts, T:audit.test.ts |
| `commit` / `reveal` / `shares` / `verify` / `drill` | `--bundle F [--out F.qvp]` | DKG rounds 1a, 1b, 2, complaints, fire drill; emit packet | share secret | `commit`, `reveal` in T:cli.test.ts; others none | T:ceremony.test.ts, T:tally.test.ts (drill) |
| `finalize` | `--bundle F` | Derives key, qualified set, check words | share secret | none | T:ceremony.test.ts |
| `confirm` | `--bundle F --compared-with 2,3 [--words "..."] [--out F]` | Signs key confirmation after SAS comparison | share secret | none | T:ceremony.test.ts |
| `tally-release` | `--bundle F --election F.json [--claimed F] [--override-unwitnessed PHRASE] [--out F]` | Verifies full log, recomputes aggregate, releases signed share | share secret | T:hardening.test.ts (T11 error paths) | T:tally.test.ts, T:audit.test.ts |
| `spoil-release` | `--bundle F --election F.json --codes HEX[,HEX] [--override-unwitnessed PHRASE] [--out F]` | Releases spoil shares (trustees mode only) | share secret | none | T:spoil.test.ts |
| `status` | `--bundle F` | Prints state and counters | passphrase | T:cli.test.ts, T:hardening.test.ts | T:lifecycle.test.ts |
| `abort` / `restart` | `--bundle F --reason T` / `--bundle F` | Abort ceremony (wipes round secrets) / new signing key | passphrase | none | T:ceremony.test.ts, T:hardening.test.ts (T10) |
| `backup` / `restore` | `--bundle F --to F2 [--backup-passphrase-file F]` / `--from F2 --bundle F [--ledger F.releases] [--override-no-ledger PHRASE]` | Sealed backup copy / restore with release-ledger check | share secret, two passphrases | `backup` in T:cli.test.ts, T:hardening.test.ts; `restore` none | T:lifecycle.test.ts, T:custody.test.ts, T:hardening.test.ts (T2) |
| `destroy` | `--bundle F --audit-close F --confirm "<election title>"` | Overwrites bundle and registered backups, writes attestation and tombstone | share secret | none | T:lifecycle.test.ts, T:custody.test.ts |
| `report-compromise` | `--bundle F --severity suspected\|confirmed [--out F]` | Signed compromise report | signing key | T:hardening.test.ts (T6) | T:lifecycle.test.ts |
| `export-transcript` / `cosign-transcript` | `--bundle F --out F [--mode airgap-dkg]` / `--bundle F --in F --out F` | Build / co-sign ceremony transcript | signing key | none | T:lifecycle.test.ts |
| `verify-transcript` | `--in F [--witness-key NAME=HEX]` | Verifies a transcript (exit 20 if not ok) | none | none (ran manually: exit 20 on `{}`) | T:lifecycle.test.ts |

## D. Other binaries

| Binary and command | Synopsis | Does | Secrets | Exit codes | JSON | Test |
|---|---|---|---|---|---|---|
| `qv-verify` | `<bundle.json> [--json] [--skip-selftest] [--manifest-hash HEX]` / `--selftest` | Standalone verifier front-end | none | 0 PASS, 1 FAIL, 2 usage, 3 INCOMPLETE, 4 input | yes | `packages/verifier/test/verifier.test.ts` (`verifierMain`) |
| `python -I -m qv_verifier vectors` | `vectors <dir> [--quiet] [--report FILE]` | Runs a test-vector tree with the Python verifier | none | 0 pass, 1 fail, 2 bad dir | `--report FILE` JSON | `verifier-py/tests/test_vectors_cli.py` |

## E. Scripts (no "bin"), for completeness

| Command | What it does | Exit codes | Tested |
|---|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | tsc | n/a |
| `npm test` / `npm run check` | per-package `node --test`; check adds typecheck | node | n/a |
| `npm run vectors:check` | `node packages/cli/bin/qv.ts vectors check` | as `qv vectors check` | C:cli.test.ts |
| `npm run lockfile:lint` (`scripts/lockfile-lint.mjs`) | Supply-chain lint of `package-lock.json` | 0/1 | not found |
| `npm run verifiers:compare` (`scripts/compare-verifiers.ts`) | TS vs Python differential; exits 1 by design while D-92..D-96 are held | 0/1 | n/a |
| `node scripts/lint-claims.mjs [--quiet]` | Banned-phrase lint of docs | 0/1/2 | not found |
| `node scripts/licence-snapshot.mjs [--stdout]` | Writes `docs/reports/dependency-licence-snapshot.md` | not read | not found |
| `npm run build -w @quietvote/web` (`src/build/cli.ts [outdir]`) | Builds static site, prints size budget | node | web tests |
| `npm run e2e -w @quietvote/web` (`e2e/run.ts`) | Browser e2e (`QV_REQUIRE_BROWSER`, `QV_CHROMIUM`) | node | n/a |
| `npm run i18n:check\|i18n:extract -w @quietvote/web` (`scripts/i18n-check.ts [--json]`) | Catalog lint | 2 usage | `packages/web/test/i18n-cli.test.ts` |
| `packages/server/bench/import-verification.ts [root]` | Benchmark | not read | n/a |

Counts: 3 declared bins + 1 Python module. `qv`: 9 leaf commands (verify, selftest, keygen, ballot encrypt, ballot audit, board verify, election inspect, election spoil-collect, vectors check) plus version/help. `qv-trustee`: 22 command names. `qv-verify`: 2 modes. Python: 1 subcommand. Total leaf commands today: 9 + 22 + 2 + 1 = 34.
`qv-trustee` commands exercised through the CLI entry (`main`) in tests: 9 of 22 (keygen, join, import, commit, reveal, status, backup, report-compromise, tally-release error paths only); the other 13 are covered only through the library API.

## F. Workflows with NO CLI today

Reference list: `packages/cli/NOTES.md` has no "Commands" section in this snapshot (grep found none), although `docs/plan/TODO.md` N-39 and T-162..T-169 cite one. Backlog IDs from `docs/plan/TODO.md`. Routes are in `packages/server/src/app.ts` and `ext-routes.ts` (all under `/api/v1`). "Auth" = QV-08 signed request (`auth.ts:signRequest`), D-84 approved to QV-08 signed requests in `DECISIONS-2026-11-04.md`. The CLI has no HTTP client, no signing client, and does not depend on `@quietvote/server` today.

| Missing workflow | Backlog | Server route that exists | Blocked by HELD decision? |
|---|---|---|---|
| start/run the server (`qv-server`), config, listen | none | library only (`buildServer`, `http.ts:473 listen`) | no |
| db init / migrate | none | migrations run on open (`db.ts`, `controldb.ts`, `electiondb.ts`); no command | no |
| group/org create, keys, steward signing (`qv group`, `qv rules`) | T-162 | `POST /orgs`, `GET /orgs/:org`, `GET|POST /orgs/:org/keys`, `DELETE /orgs/:org/keys/:keyid` | no |
| election create (`qv election create`) | T-164 | `POST /orgs/:org/elections`, `PUT /elections/:id/draft` | no |
| election open / close, ceremony markers, roll commit | T-164 | `POST /elections/:id/log/entries` (marker and control entries multi-signed by coordinators) | no |
| election tally (post aggregate, result) | T-164 | `GET /elections/:id/tally`, `GET /tally/draft`, `POST /log/entries` (`tally_result`) | no |
| election cancel / delete | T-164 | `DELETE /elections/:id`; cancel via `POST /log/entries` (`election_cancel`) | no |
| invite issue/list/revoke | T-163 (organizer side) | `POST|GET /elections/:id/invites`, `DELETE /invites/:invite` | no (server side); the web side of the contract is B3-01 |
| enroll (invite to keypair to proof of possession) | T-163 | `POST /elections/:id/registrations` | **yes, B3-01 (HELD)**: hashed invite plus invite-bound PoP (web) vs raw code (server) |
| vote submit (`qv vote`) | T-165 | `POST /elections/:id/log/entries` (ballot entry) | submit itself no; voter must be on roll first, so end to end depends on B3-01 |
| receipt check (`qv receipt check`) | T-167 | `GET /log/proof/inclusion`, `GET /log/entries/by-leaf/:leaf`, `GET /voters/:kid/ballots`, `GET /log/checkpoint` | no |
| export / import | T-169 | `GET /export.qvb`, `GET /export.json`, `POST /imports` (signed) | no |
| monitor / gossip | T-169 | `GET /log/checkpoint(s)`, `GET /log/proof/consistency`, `GET /log/witnesses`, `POST /log/cosignatures`, `POST /gossip/checkpoints`, `GET /events` (SSE), `GET /log/evidence` | no |
| health check | none | `GET /healthz`, `GET /readyz`, `GET /instance`, `GET /admin/status` | no |
| backup (server) | none | `POST /admin/backups` | no |
| restore (server) | none | none found | no (needs design) |
| admin: self-audit, quarantine clear, list elections, jobs | none | `POST /admin/elections/:id/self-audit`, `POST /quarantine/clear`, `GET /admin/elections`, `GET /jobs/:job` | no |
| webhooks | none | `POST|GET /orgs/:org/webhooks`, `DELETE /orgs/:org/webhooks/:wh` | no |
| `qv trustee ...` passthrough | T-168 | n/a (spawns `qv-trustee`; N-39c option A approved in `DECISIONS-2026-11-04.md`) | no |
| trustee network outbox (post DKG records, fetch inbox, post tally share) | T-126 gap, trustee NOTES "Not done" | `GET /ceremony`, `GET /ceremony/inbox/:j`, `POST /log/entries`; tally share record shape differs (see tasks D-C) | no, but protocol-shape question |
| spoil share post | none | `POST|GET /elections/:id/spoil-shares`; `spoil-collect --post-body-out` writes bodies but nothing posts them | no |
| CLI e2e and signed packaging | T-170, T-171 | n/a | no |
