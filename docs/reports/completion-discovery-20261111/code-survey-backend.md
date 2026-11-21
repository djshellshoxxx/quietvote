# QuietVote backend and operator tooling: code survey

Scope: `packages/server`, `packages/cli`, `packages/trustee` at HEAD ab84f16 (read-only, static reading only; nothing executed).
Paths below are relative to `/home/user/quietvote/packages/` unless a full path is given.
Label key: VERIFIED = read in code. SUSPECTED = reasoned from code, not executed. UNVERIFIED = could not confirm.

## 0. Headline findings

1. `qv` (cli) and `qv-trustee` are OFFLINE file tools. Neither imports `node:http`/`fetch` (grep of cli/src, trustee/src returned nothing). Neither can call the server API. Operators move files by hand (`.qvl`, `.qvp`, bundles) or use the web package (not surveyed here).
2. The server package has NO executable entry point. `server/src/index.ts:1-9` only exports `buildServer`. There is no `bin`, no `process.env`/`argv` read anywhere in `server/src` (grep), no Dockerfile/systemd/compose file in the repo (find, depth 3). All config comes through the `ServerOptions` object (`server/src/config.ts:25-`). `buildServer` is called only from `server/test/helpers/world.ts` and `web/e2e/verifier.ts` (grep).
3. Election lifecycle (manifest, roll_commit, open, close, pause, resume, cancel, tally_result, audit_close) has NO dedicated HTTP endpoint. Each is a signed board entry POSTed to `POST /api/v1/elections/:id/log/entries` (`server/src/app.ts:630`). The server validates coordinator multisig inside `ElectionRuntime.validate` (`server/src/election.ts:783-884`). No CLI/trustee command builds or signs those coordinator entries. Test helpers do it (`server/test/helpers/world.ts:179-330`).
4. No restore path exists in code. Backup is an admin job that writes snapshots under `<dataDir>/backups/<jobId>` (`server/src/admin.ts:92-123`). `.qvx` operator restore is "not implemented" (`server/NOTES.md:167`).
5. 56 HTTP routes. 22 use signed-request auth, 1 self-auth, 33 are unauthenticated at the HTTP layer (public reads plus 5 POSTs that authenticate by payload signature or invite code). Zero `sig` routes lack an authz check (section 2).

## 1. Per-package inventory

Runtime dependencies (all three packages): `package.json` lists only workspace deps with range `"*"` (NOT pinned): server `board, crypto, protocol` (`server/package.json:14-18`); cli `board, crypto, protocol, verifier` (`cli/package.json:21-26`); trustee `board, crypto, protocol` (`trustee/package.json:17-21`). The only third-party runtime code is in `crypto`: `@noble/curves 2.4.0`, `@noble/hashes 2.4.0` (exact pins, `crypto/package.json`). Server storage uses the built-in `node:sqlite` (experimental in Node 22, requires SQLite >= 3.37, `server/src/db.ts:57`). Root dev deps pinned: `typescript 5.9.3`, `@types/node 22.18.0`, `playwright 1.57.0` (`/home/user/quietvote/package.json`). Node `>=22.18` (engines). Lockfile `package-lock.json` exists; not inspected.

### server
Purpose: single-process HTTP API plus per-election SQLite append-only transparency log ("bulletin board"), invites/registration, webhooks, SSE, gossip, import/export, admin jobs. `server/NOTES.md:5`.
src (lines): app.ts 931, election.ts 1350, electiondb.ts 502, http.ts 484, imports.ts 470, controldb.ts 448, webhooks.ts 311, gossip.ts 285, config.ts 274, admin.ts 279, ssrf.ts 272, ext-routes.ts 216, sse.ts 206, util.ts 135, ratelimit.ts 136, jobs.ts 132, pool.ts 120, db.ts 119, tar.ts 111, auth.ts 101, logger.ts 80, problem.ts 68, retention.ts 66, lifecycle.ts 61, static.ts 59, export.ts 81, range.ts 46, records.ts 48, kek.ts 35, verify-worker.ts 29, env.ts 24, index.ts 9. Total about 7.9k src lines. Also `bench/import-verification.ts` 65, NOTES.md 323, README.md 3 (stub).
Tests: 18 files in `server/test/`, about 163 `test(` cases (regex count; loop-generated cases undercounted). Plus helpers `helpers/world.ts`, `full.ts`, `sse.ts`. Largest: events.test.ts (25), ssrf (18), negative (16), imports (15), range (12), audit (11), gossip (11).
Skipped: conditional `t.skip('openssl not available')` at `server/test/ssrf.test.ts:185,202,210,217,227,236,246,257` (real-TLS transport tests; skip when no openssl). No `.todo`.
TODO/FIXME/XXX in src: none (only grep hit is a doc-comment example in trustee passphrase.ts:7).

### cli (`qv`)
Purpose: offline, zero-third-party CLI: verify bundles, voter keygen, ballot encrypt/audit, board verify, spoil-collect, test-vector conformance. `cli/README.md:3`.
src (lines): cmd-vectors 286, cmd-spoil 201, cmd-ballot 124, cmd-board 118, common 117, main 107, keyfile 103, cmd-keygen 94, args 74, io 56, cmd-election 48, cmd-verify 25, index 2; bin/qv.ts 5. NOTES.md 125.
Tests: 5 files, about 47 cases (cli.test.ts 17, audit-regressions 12, audit 9, spoil-collect 8, board-policy-regressions 1). Skipped: `cli/test/audit.test.ts:57` (`{ skip: !POSIX }`, file-mode test). TODO markers: none.

### trustee (`qv-trustee`)
Purpose: air-gapped trustee tool: encrypted key bundle, DKG ceremony rounds, tally/spoil share release, backup/restore, destroy, transcripts. `trustee/NOTES.md:3`.
src (lines): trustee.ts 1098, cli.ts 303, transcript.ts 220, ceremonylog.ts 193, bundle.ts 172, fsutil.ts 148, passphrase.ts 64, machine.ts 45, ledger.ts 30, fingerprint.ts 28, errors.ts 19, index.ts 10. NOTES.md 197. `bin` points at `src/cli.ts` directly (`trustee/package.json:7-9`).
Tests: 11 files, about 81 cases (harness in `test/helpers/harness.ts` 454 lines). No skips/todos. TODO markers: none. Known unimplemented per NOTES: age compatibility, hardware tokens, SLIP-0039, dice entropy (`trustee/NOTES.md:13-17`).

## 2. SERVER route table (56 routes)

Authorization mechanics (VERIFIED):
- Router: `route.auth` is `none | sig | self` (`http.ts:49`). For `sig` routes the HTTP layer calls `authenticate()` at `http.ts:370-371` (QV-Sig Ed25519 over method, target, audience, ts, nonce, body hash; +-120 s window; nonce replay table; `auth.ts:62-84`). A second per-key bucket `M:<keyId>` follows (`http.ts:372`).
- Scope checks inside handlers: `orgOf` (`app.ts:111-116`: instance_admin or same-org, else 404), `orgElection` (`app.ts:100-105`), `ownerOnly` (`app.ts:801-803`), inline `org_owner|instance_admin` tests, `authorizeAdmin` (`admin.ts:19-23`: role `instance_admin` and `orgId===null`).
- Roles: `org_owner`, `org_organizer`, `instance_admin` (`app.ts:262`, `controldb.ts:25`). Admin keys come only from the `adminKeys` option; "no API creates admin keys" (`admin.ts:13-17`; owner decision D-84 pending).
- Rate limit: class bucket before body read (`http.ts:313`): R read 120/min, P proof 600/min, W write-pre 30/min, A auth 10/min, M manage 60/min, X export 2/h, G gossip 30/min (`config.ts:112-122`). Buckets are HMAC of IPv4 /24 or IPv6 /64, key rotated every 24 h, in memory (`ratelimit.ts:106-127`).
- Idempotency: `idem()` helper (`app.ts:117-137`): Idempotency-Key header (8-128 printable) REQUIRED; request hash binds method+target+body; replay returns stored response with `Idempotent-Replay: true`; mismatch 422; 24 h TTL (`controldb.ts:425`). Listed "idem" below means the handler wraps it.
- Body validation: strict JSON (`parseQvJson`) plus schema builders `fObj/fStr/...` with unknown fields rejected (`http.ts:381-389`, `util.ts`). Body caps per route via `maxBody`.

`R` = public read, subject to link-election read key (`readable()` `app.ts:89-99`, header `qv-read-key`) when `access=link`.

| # | Method path | Handler | Who may call / where enforced | Idempotency | Rate class | Body validation |
|---|---|---|---|---|---|---|
| 1 | GET /healthz | app.ts:189 | public (none) | n/a | R | none |
| 2 | GET /readyz | app.ts:190 | public; does a control-DB write tx | n/a | R | none |
| 3 | GET /api/v1/instance | app.ts:201 | public | n/a | R | none |
| 4 | GET /api/v1/instance/release | app.ts:213 | public | n/a | R | none |
| 5 | POST /api/v1/orgs | app.ts:223 | self-auth: proof of possession by new key (`app.ts:236`); registration mode open/token/closed (`app.ts:226-233`); default mode is `open` (`config.ts:208`) | idem (`app.ts:237`) | A | fObj name, owner_key, token; max 4096 |
| 6 | GET /api/v1/orgs/:org | app.ts:245 | sig; any org key or admin via `orgOf` (app.ts:248) | n/a | M | none |
| 7 | GET /api/v1/orgs/:org/keys | app.ts:252 | sig; `orgOf` (app.ts:254) | n/a | M | none |
| 8 | POST /api/v1/orgs/:org/keys | app.ts:256 | sig; owner/admin (`app.ts:260`); new key PoP (`app.ts:268`) | none (duplicate key gives 409) | M | fObj; max 4096 |
| 9 | DELETE /api/v1/orgs/:org/keys/:keyid | app.ts:275 | sig; owner/admin (`app.ts:279`); cannot remove last owner (`app.ts:282`) | none (naturally idempotent? second call 404) | M | none |
| 10 | GET /api/v1/orgs/:org/elections | app.ts:287 | sig; `orgOf` (app.ts:289) | n/a | M | query limit/cursor/state (state not validated to enum, parameterised SQL) |
| 11 | POST /api/v1/orgs/:org/elections | app.ts:299 | sig; `orgOf` (any org key incl. organizer) | idem (app.ts:304) | M | fObj title, access; max 4096 |
| 12 | GET /api/v1/elections/:id | app.ts:320 | public R | n/a | R | none |
| 13 | PUT /api/v1/elections/:id/draft | app.ts:335 | sig; `orgElection` (app.ts:338); DRAFT only (app.ts:339) | none (PUT, naturally idempotent) | M | any JSON object, NO schema, max 256 KiB (app.ts:341) |
| 14 | GET .../manifest | app.ts:346 | public R | n/a | R | none |
| 15 | GET .../state | app.ts:355 | public R | n/a | R | none |
| 16 | GET .../ceremony | app.ts:356 | public R | n/a | R | none |
| 17 | GET .../ceremony/inbox/:j | app.ts:379 | public R (j regex only) | n/a | R | none |
| 18 | GET .../tally | app.ts:396 | public R | n/a | R | none |
| 19 | POST .../spoil-shares | app.ts:421 | none at HTTP; payload is trustee-signed, verified against manifest key (`election.ts:1237`), trustee must be a decrypter (`election.ts:1238`) | duplicate identical = 200, different = 409 (`election.ts:1250-1252`) | W + per-trustee `ss:` | schema check; max 1 MiB |
| 20 | GET .../spoil-shares | app.ts:434 | public R | n/a | R | strict query allowlist |
| 21 | GET .../tally/draft | app.ts:449 | public R; runs tally build (cached, 16 entries `election.ts:1304`) | n/a | R | `decrypters` regex |
| 22 | DELETE /api/v1/elections/:id | app.ts:462 | sig; `orgElection` + owner/admin (`app.ts:464-466`); state guard in `pool.remove` (`pool.ts:104-110`) | none | M | confirm == title; max 1024 |
| 23 | POST .../invites | app.ts:479 | sig; `orgElection` (any org key) | idem, code redacted on replay (`app.ts:515`) | M | fObj count or items (<=1000), max 256 KiB |
| 24 | GET .../invites | app.ts:518 | sig; `orgElection` | n/a | M | query only; `include_label=true` decrypts labels |
| 25 | DELETE .../invites/:invite | app.ts:534 | sig; `orgElection` | none (natural) | M | none |
| 26 | POST .../registrations | app.ts:545 | none at HTTP; authorised by single-use invite code + PoP over key (`app.ts:561-565`) | replay of same invite+key returns 201 (`app.ts:568-569`) | A + failure counter `reg:<bucket>` 5 per 10 min (`config.ts:122`, `app.ts:553`) | fObj; max 4096 |
| 27 | GET .../roll | app.ts:581 | public R (lists voter_kid, pk, status) | n/a | R | cursor checked |
| 28 | GET .../voters/:kid | app.ts:595 | public R | n/a | R | kid regex |
| 29 | GET .../voters/:kid/ballots | app.ts:604 | public R | n/a | R | cursor int |
| 30 | GET .../trustees | app.ts:615 | public R | n/a | R | none |
| 31 | POST .../log/entries | app.ts:629 | none at HTTP ("entries authenticate themselves", app.ts:632). Authorised in `precheck`/`validate`: author key resolved from roll/manifest (`election.ts:590-617`, `election.ts:1021-1037`), per-type multisig (`election.ts:783-884`) | duplicate bytes = 200 + same receipt; nonce reuse = 409 (`election.ts:597-601`) | W (pre-parse) + per-key `wk:` 10/min burst 5 + ballot interval 10 s and 30/h (`election.ts:606-616`) | b64u header/body; header<=2800, body<=1.4M; canonical JCS check (`election.ts:766-774`) |
| 32 | GET .../log/entries | app.ts:646 | public R | n/a | R | strict ints, type enum, author regex; byte-bounded pages |
| 33 | GET .../log/entries/:seq | app.ts:689 | public R | n/a | R | seq regex |
| 34 | GET .../log/entries/by-leaf/:leaf | app.ts:698 | public R | n/a | R | leaf regex |
| 35 | GET .../log/checkpoint | app.ts:709 | public R | n/a | R | none |
| 36 | GET .../log/checkpoints | app.ts:720 | public R | n/a | R | ints |
| 37 | GET .../log/proof/inclusion | app.ts:731 | public R | n/a | P | ints/hash |
| 38 | GET .../log/proof/consistency | app.ts:756 | public R | n/a | P | ints |
| 39 | GET .../log/witnesses | app.ts:769 | public R | n/a | R | none |
| 40 | POST .../log/cosignatures | app.ts:777 | none at HTTP; each line must verify against witness policy keys (`election.ts:1131-1140`) | accepted lines idempotent (SUSPECTED) | G | fObj <=16 lines; max 16 KiB |
| 41 | GET .../events | app.ts:795 | public R (SSE, `sse.open`) | Last-Event-ID | R + per-bucket stream cap 4, total 1024 | query/header |
| 42 | POST /api/v1/orgs/:org/webhooks | app.ts:804 | sig; `orgOf` + `ownerOnly` (`app.ts:807-808`); SSRF policy `ssrf.ts` | idem; secret and url redacted from stored replay (`app.ts:829-834`) | M | fObj url<=2048, events enum |
| 43 | GET /api/v1/orgs/:org/webhooks | app.ts:837 | sig; `orgOf` + `ownerOnly` | n/a | M | none |
| 44 | DELETE /api/v1/orgs/:org/webhooks/:wh | app.ts:845 | sig; `orgOf` + `ownerOnly` | none | M | none |
| 45 | GET .../export.qvb | app.ts:888 | public R (link key if link) | ETag/If-None-Match, Range | X 2/h | none |
| 46 | GET .../export.json | app.ts:898 | public R | ETag, Range | X | none |
| 47 | POST /api/v1/gossip/checkpoints | ext-routes.ts:37 | none at HTTP; note must be signed by this election's log key (`ext-routes.ts:54`), link elections need read key (`ext-routes.ts:52`) | n/a | G | fObj note; max 16 KiB |
| 48 | GET .../log/evidence | ext-routes.ts:62 | public R | n/a | R | none |
| 49 | GET /api/v1/jobs/:job | ext-routes.ts:78 | sig; creator or instance_admin (`ext-routes.ts:81`) | n/a | M | none |
| 50 | POST /api/v1/imports | ext-routes.ts:89 | sig; same-org or admin (`ext-routes.ts:95`), preflight auth before body (`http.ts:183`) | idem (`ext-routes.ts:106`) | X | raw tar, Content-Length required, default cap 64 MiB, hard 1 GiB (`config.ts:127`); query allowlist |
| 51 | GET /api/v1/admin/status | ext-routes.ts:124 | sig; `authorizeAdmin` (`ext-routes.ts:126`) | n/a | M | none |
| 52 | GET /api/v1/admin/elections | ext-routes.ts:131 | sig; `authorizeAdmin` | n/a | M | strict query |
| 53 | POST /api/v1/admin/backups | ext-routes.ts:149 | sig; `authorizeAdmin` | idem | M | fObj scope; max 1024 |
| 54 | POST .../admin/elections/:id/self-audit | ext-routes.ts:163 | sig; `authorizeAdmin` | idem | M | none |
| 55 | POST .../admin/elections/:id/quarantine/clear | ext-routes.ts:179 | sig; `authorizeAdmin` | idem | M | fObj ack, verified_against |
| 56 | DELETE /api/v1/admin/elections/:id | ext-routes.ts:191 | sig; `authorizeAdmin`; state in DRAFT/ARCHIVED/CANCELLED/ABORTED/IMPORTED (`admin.ts:25`) | idem | M | confirm == title |

Counts: sig 22 (#6-11,13,22-25,42-44,49-56 = 22), self 1 (#5), none 33. Routes with no visible authz check among `sig`/`self`: 0. The 33 `none` routes are all either intentionally public reads or payload/invite-authenticated writes (#19, 26, 31, 40, 47); there is no route where an authz decision is absent by oversight that I could see. OPTIONS and a static-file fallback (`http.ts:263-292`) exist outside the table.

Gaps in the table worth knowing: no endpoint to change/list/revoke instance admins, to list org members' roles beyond `keys`, to download or schedule backups, to restore, to purge/redact a ballot, or to read the operator audit table (`operator_audit`, `controldb.ts:48`). Organizer-role keys (non-owner) can create elections, edit drafts, issue/revoke invites and import, but not manage keys/webhooks/delete (verified by test `server/test/audit.test.ts:249`).

## 3. SERVER persistence, operations, privacy

Engine/driver: SQLite via `node:sqlite` `DatabaseSync` (`server/src/db.ts:2`). Layout: one `control.sqlite` plus one file per election `elections/<2hex>/<id>.sqlite` (`pool.ts:67`). Pragmas: WAL, `synchronous=FULL` for election DBs, `NORMAL` for control, foreign keys, `secure_delete`, `trusted_schema=OFF`, `busy_timeout=5000` (`db.ts:57-70`, `electiondb.ts:264`, `controldb.ts:191`). `application_id` checked.

Migrations: forward-only, checksummed, inside `tx` (`db.ts:84-107`). Election DB versions 1-5 (`electiondb.ts:9,64,78,104,120`); control DB versions 1-4 (`controldb.ts:16,55,66,86`). A checksum mismatch refuses start. No down migrations and no migrate CLI: migration runs implicitly on open (`db.ts:73`).

Tables (election DB): `schema_migration, meta, election, log_entry, checkpoint, voter_invite, voter, ballot_index, ballot_ref, projection_state, redaction, event, gossip_seen, equivocation_evidence, spoil_share` (`electiondb.ts:12-115`). Control DB: `schema_migration, instance_meta, org, account_key, election_registry, idempotency, replay_nonce, operator_audit, webhook, webhook_outbox, job` (`controldb.ts:19-104`). Tables are STRICT with CHECKs.

Storage-layer duplicate protection (VERIFIED): `log_entry` has `UNIQUE(author,type,author_nonce)`, `UNIQUE(nonce_key)`, `UNIQUE(leaf_hash)` (`electiondb.ts:24-27`); `voter.pk` UNIQUE and `voter_kid` PK; `voter_invite.code_hash` UNIQUE (`electiondb.ts:43`); `ballot_index.voter_kid` PK (a counter row, `electiondb.ts:51`). There is NO unique constraint that limits a voter to one counted ballot: revotes are allowed up to `max_per_voter` (default hard bound 20). The one-vote-per-voter rule is enforced in memory by the replayed projection (`election.ts:477-491`: `supersedes` must equal the voter's last admissible ballot; `casts` counter; `codeOwner` for duplicate ballot codes), serialised by a per-election mutex (`election.ts:651`).

Transactions:
| Operation | Atomic? | Where |
|---|---|---|
| Ballot/any log append | YES: leaf append, projection (`recordBallot`, `commitRoll`), checkpoint, entry+checkpoint events in one `BEGIN IMMEDIATE` (`election.ts:671-683`). On failure after in-memory tree moved, runtime is `poisoned` and reloaded (`election.ts:693-696`, test `audit.test.ts:175`) | |
| Phase event + registry state sync after append | NO: separate tx after the append; failure swallowed ("recoverable from the log", `election.ts:700-708`) | |
| Invite redemption | YES: `consumeInvite` + `addVoter` in one `edb.tx` (`app.ts:574-577`); pre-checks (state, quota) run outside the tx | |
| Invite issue | Single call `addInvites` (assumed one tx; UNVERIFIED), wrapped by idem record | `app.ts:513` |
| Org create | YES `control.tx` (`app.ts:239`) | |
| Election create | Partial: registry insert, then election DB file init; on failure `markDeleted` (`pool.ts:92-102`). Not one transaction across the two DB files | |
| Open / close / pause / resume | These are ordinary log appends (atomic as above). `election_close` then calls `maybeAggregateLocked()` AFTER the append commit (`election.ts:702`), a second append | |
| Tally publication | `tally_result` is a log append (atomic). Server-posted `tally_aggregate` is a separate append, only triggered at close or when cosignatures are attached (`election.ts:702`, `election.ts:1163`) | |
| Deletion | NO: `markDeleted` (DEK nulled, state DELETED) -> evict -> `rmSync` of db/-wal/-shm -> audit row, each separate (`pool.ts:104-114`) | |
| Import | Staged: build DB file in place, replay, then single `control.tx` inserts registry row (`imports.ts:454-458`); orphan files cleaned on failure and at next import (`imports.ts:395-402`). Registry insert is the commit point | |
| Retention purge of invite label/contact | single UPDATE (`electiondb.ts:427-435`) | |
| Backup | per-file `node:sqlite backup()` online snapshot plus `quick_check`; directory removed on failure (`admin.ts:92-121`); not one cross-DB snapshot, so control and election files are captured at slightly different times | |

Logging (VERIFIED): `Logger` emits only an allowlist `ts(minute-rounded), level, event, route(template), status, dur_bucket, code, component, build, msg, epoch_no, tree_size`; everything else is dropped and counted (`logger.ts:30-60`). No IP, UA, request id, election id, seq, entry type, byte count. Ballot appends are logged with `coarse=true` (no tree_size) (`election.ts:~698`). Default sink is stderr (`config.ts:206`). 500s log only error class name (`http.ts:~437`). Tests: `negative.test.ts:139`, `b2-fixes.test.ts:100,125`. No ballot content, voter key or secret was seen in any log call (grep of `logger.event` call sites was not exhaustive: UNVERIFIED for webhooks.ts/gossip.ts/sse.ts log lines).
Privacy at rest: roll, voter pk and the voter->ballot index are public by design (routes 27-29). Invite->voter link is deliberately not stored (`electiondb.ts:436`), voter `registered_at` rounded to the hour (`app.ts:576`).

Secrets at rest: per-election DEK wrapped under an instance KEK (AES-256-GCM, `kek.ts:23-35`); log/server signing keys sealed under the DEK (`pool.ts:84-85`); invite label/contact sealed under the DEK (`app.ts:508-509`). KEK file `<dataDir>/kek/kek.bin`, 0600, auto-created if missing (`kek.ts:9-14`). Webhook url/secret encrypted (`controldb.ts:60`).

Retention/deletion: invite label/contact NULLed 7 d after registered/revoked/expired or after election_open (`electiondb.ts:427-435`, `config.ts:204`), by lazy purge on invite access (`app.ts:107-110`) and hourly sweep (`retention.ts`, default 3 600 000 ms). Election delete = crypto-erase (DEK nulled) then unlink (`pool.ts:104-114`); only for DRAFT/ARCHIVED/CANCELLED/ABORTED/IMPORTED. SSE event rows pruned 30 d after ARCHIVED (`election.ts:234-241`). Job rows dropped 7 d after finish (`config.ts:208`). Idempotency 24 h; replay nonces until ts+125 s. NOT implemented: backup retention ("12 months", `NOTES.md:289-290`), ballot redaction endpoint (table `redaction` exists), scheduled integrity checks (`NOTES.md:97`).

Backup/restore: `POST /admin/backups` (scope all or one election) writes `<dataDir>/backups/<jobId>/*.sqlite` + `manifest.json` with sha256 (0600). KEK is explicitly NOT included (`admin.ts:116`). Backups are unencrypted, on the same volume, no download/list/expire endpoint. No restore code (grep "restore" hits only error text, `admin.ts:250,263`, and webhooks internals). A restore must therefore be a manual file copy plus KEK.

Health: `GET /healthz` (static ok), `GET /readyz` (writes to control DB, 503 on failure, `app.ts:190-199`), `GET /api/v1/admin/status` (admin: counts, disk free, backup time, migration version, quarantine list). Election-level `integrity` in `/state` (`app.ts:180`). Self-audit job per election (route 54).

Configuration (all via `ServerOptions`, no env/CLI): `dataDir` (required), `publicUrl` default `http://localhost` (signature audience, `auth.ts:56`), `host` default `127.0.0.1`, `port` default 0, `registrationMode` default `open`, `registrationTokens`, `adminKeys` default empty, `allowedOrigins`, `staticDir`, `releaseSeedHex`, `bucketHeader`, `witnesses`, plus about 60 bounded limits (`config.ts:25-122`, hard bounds `config.ts:96-110`, enforced by `bound()` which refuses start). Gossip peers validated by SSRF policy at start.

Start/stop: only programmatic: `buildServer(opts)` then `.start()` -> `http.listen()` (`app.ts:915-920`); `.stop()` drains (`app.ts:921-929`). No signal handling, no CLI wrapper (UNVERIFIED that web/scripts do not provide one; `web/e2e/verifier.ts` uses it for tests).

TLS/proxy: server speaks plain HTTP (`node:http`, `http.ts:2`); "TLS termination" is listed as not implemented (`NOTES.md:97`). HSTS header is emitted only when `publicUrl` starts with https (`http.ts:128,150`). Client network bucket comes from the socket peer address, or from `bucketHeader` if configured (`http.ts:242`). Behind a reverse proxy without `bucketHeader`, all clients collapse into the proxy's bucket. With `bucketHeader` set on an exposed server the header is client-controlled. A trusted-proxy IP allowlist does not exist.
Container/service files: NONE found (no Dockerfile, systemd unit or compose file within depth 3 of the repo root; `docs/08-architecture-deployment.md` not cross-read for intended packaging: UNVERIFIED).

## 4. CLI commands

### `qv` (`cli/bin/qv.ts`, dispatch `cli/src/main.ts:14-30`)
Exit codes (`cli/src/io.ts:56`): 0 ok/PASS, 1 failure, 2 usage, 3 incomplete/partial, 4 unreadable input, 70 internal. Parser: long options only, unknown options rejected, value flags cannot swallow `--x`, empty value rejected (`args.ts:22-60`). `--help` is handled per command; `--version`.

| Command | Purpose | Flags | --json | File:line |
|---|---|---|---|---|
| `verify <bundle>` | full verification V1..V14 after canary self-test | `--json --skip-selftest --manifest-hash` | yes | cmd-verify.ts:7 |
| `selftest` | canary only | `--json` | yes | cmd-verify.ts:19 |
| `keygen` | create voter key (QVKEY1 Argon2id by default) | `--out(req) --seed-file --seed-stdin --passphrase-file --passphrase-stdin --no-passphrase --kdf-memory-kib --kdf-iterations --force --json` | yes | cmd-keygen.ts:44 |
| `ballot encrypt` | build cast or spoil envelope file offline | `--election --key --out(req) --select(multi) --intent --supersedes --audit-out --manifest-hash --publish-reveal --passphrase-* --json` | yes | cmd-ballot.ts:37 |
| `ballot audit` | verify a spoiled ballot's reveal on a second device | `--election --ballot --manifest-hash --json` | yes | cmd-ballot.ts:98 |
| `board verify <file>` | verify board bundle or election bundle log | `--log-key --manifest-hash --author-key(multi) --witness-policy --pin-file --json` | yes | cmd-board.ts:9 |
| `election inspect <bundle>` | describe, not verify | `--json` | yes | cmd-election.ts:7 |
| `election spoil-collect` | combine trustee spoil-share packets, decode a spoil | `--election --code --packet(multi) --manifest-hash --post-body-out --json` | yes | cmd-spoil.ts:113 |
| `vectors check [dir]` | conformance of test-vector corpus | `--strict --json` | yes | cmd-vectors.ts:184 |

Secrets: voter seed via `--seed-file`/stdin/random (never argv); passphrase via `--passphrase-file` (first line), `--passphrase-stdin`, or hidden TTY prompt (`common.ts:99-116`, `io.ts:21-47`). Argv carries only file paths. Key files written 0600 with O_EXCL, `--force` refuses symlinks (`cmd-keygen.ts:26-41`, `common.ts:86-101`). `--no-passphrase` writes the raw seed in clear (warns, `cmd-keygen.ts:75`). Audit file (spoil only) holds selections plus randomness, 0600 (`cmd-ballot.ts:68`). Envelope output 0644, never overwrites (`wx`). No env vars read by cli (grep). Passphrase never printed. JSON outputs contain public key/ballot code/paths only.
There is no command that talks to a server, creates elections, invites or registers, submits ballots, builds coordinator entries, or exports/imports/backs up server data.

### `qv-trustee` (`trustee/src/cli.ts`, usage text `cli.ts:30-48`)
Exit codes (`errors.ts:4`): 0 ok, 2 usage, 10 declined, 20 verification failed, 30 network (defined, unused: no network code), 40 state conflict, 50 locked (bad passphrase/tamper), 60 refused for safety. `--json` supported on all commands (success `{ok:true,...}` to stdout; errors `{ok:false,code,kind,message}` to stderr, `cli.ts:~265`). Arg parser accepts ANY `--name value` pair (no flag allow-list, `cli.ts:50-66`): a misspelled option is silently ignored.
Secrets: bundle passphrase from `--passphrase-file` or env `QV_TRUSTEE_PASSPHRASE_FILE` (a path, not the secret) else hidden prompt; backup passphrase from `--backup-passphrase-file` or `QV_TRUSTEE_BACKUP_PASSPHRASE_FILE` (`cli.ts:102-113`). Files must be mode 0600 or the tool refuses (`fsutil.ts:59`). Never on argv. `keygen --generate-passphrase` PRINTS the new passphrase to stderr (`cli.ts:~165`): intended ("write it on paper") but lands in any captured stderr/CI log. Override phrases (`--override-unwitnessed`, `--override-no-ledger`) are fixed public strings on argv.

| Command | Purpose | Key flags | File:line |
|---|---|---|---|
| keygen | new sealed identity bundle; prints sign_pk | `--bundle --generate-passphrase` | cli.ts:~160 |
| join | accept manifest after manifest-hash check | `--bundle --manifest --manifest-hash --ceremony-id` | cli.ts:~172 |
| import | import public log slice `.qvl` | `--bundle --log` | cli.ts:~178 |
| commit / reveal / shares / drill | DKG round packets, fire drill | `--bundle --out` | cli.ts:~183 |
| verify | check round data, emit complaints | `--bundle --out` | cli.ts:~187 |
| finalize | derive key locally, print check words/hex | `--bundle` | cli.ts:~194 |
| confirm | key confirmation after out-of-band comparison | `--compared-with --words --out` | cli.ts:~199 |
| tally-release | verify election bundle, recompute aggregate, emit signed tally-share | `--election --claimed --override-unwitnessed --out` | cli.ts:~205 |
| spoil-release | emit spoil shares for <=64 codes | `--election --codes --override-unwitnessed --out` | cli.ts:~215 |
| status | show state | `--bundle` | cli.ts:~222 |
| abort / restart | abort ceremony / new key after abort | `--reason` | cli.ts:~226 |
| backup / restore | sealed backup to a second path / restore with release ledger | `--to --from --ledger --override-no-ledger --backup-passphrase-file` | cli.ts:~234 |
| destroy | erase bundle+backups after audit-close, writes attestation | `--audit-close --confirm "<title>"` | cli.ts:~247 |
| report-compromise | signed compromise report | `--severity suspected|confirmed` | cli.ts:~252 |
| export-transcript / cosign-transcript / verify-transcript | air-gap ceremony transcript | `--mode --in --out --witness-key NAME=HEX` | cli.ts:~259 |

Safety properties seen: output path may not alias the bundle, backups, ledger, lock or any existing file (`guardOut`, `cli.ts:117-125`); atomic temp+fsync+rename writes (`fsutil.ts:7-35`); lock file `<bundle>.lock` with O_EXCL, stale lock after crash must be removed by hand (`fsutil.ts:130-137`); public release ledger sidecar `<bundle>.releases` blocks double release after restoring an old bundle (`ledger.ts:1-12`). Trustee emits `.qvp` packets; turning them into log entries (`dkg_*`, `key_confirm`, `decryption_share`) and POSTing them is left to another tool (web `api/client.ts` mentions `log/entries`: other agent's scope, UNVERIFIED).

## 5. Operator workflow parity matrix (draft)

"Server" column = API route(s) by number from section 2. Web UI column intentionally left blank.

| Workflow | Server API endpoint | CLI (`qv`) | Trustee CLI | Web UI | Test evidence | Gap notes |
|---|---|---|---|---|---|---|
| create election | POST /orgs/:org/elections (#11); PUT .../draft (#13) | none | none | | server/test/e2e.test.ts:12 (via helpers world.ts) | org creation (#5) and election shell only; draft is unvalidated JSON |
| configure rules/options | PUT .../draft (#13) only | none | none | | none specific | rules live in the signed manifest, not server config; no validation until manifest post |
| build manifest | POST log/entries type `manifest` (#31) | none (`election inspect` reads only) | `join` consumes manifest | | server/test/helpers/world.ts:214-240; e2e.test.ts:19 | no tool to author/sign the manifest outside test helpers (coordinator multisig) |
| key ceremony / DKG | GET ceremony, inbox (#16,17); POST log/entries dkg_* (#31) | none | keygen, join, import, commit, reveal, shares, verify, finalize, confirm, drill, abort, restart, transcripts | | trustee/test/ceremony.test.ts:17-252; server helpers/world.ts:243 | bridge between `.qvp` packets and log entries not in these packages |
| issue invites | POST/GET/DELETE .../invites (#23-25) | none | n/a | | negative.test.ts:215; b2-fixes.test.ts:158 | codes shown once; `deliver:true` rejected "not configured" (app.ts:489) |
| voter registration | POST .../registrations (#26); GET roll (#27) | `keygen` makes the key | n/a | | negative.test.ts:215; e2e.test.ts:19-24 | PoP signature must be produced by a client; CLI cannot register |
| commit roll | POST log/entries `roll_commit` (#31) | none | none | | election.ts:1002-1012 validation; e2e.test.ts:12 | coordinator-signed; no operator tool |
| open | POST log/entries `election_open` (#31) | none | none | | negative.test.ts:243,271 | no scheduler (NOTES.md:42); waits on witness quorum if configured |
| cast | POST log/entries `ballot` (#31); GET voters/:kid (#28) | `ballot encrypt --intent cast` (file only) | n/a | | cli/test/cli.test.ts:257; e2e.test.ts:27-33 | CLI output is an envelope, not a board entry; no submit step |
| spoil / audit | POST log/entries `ballot_audit` (#31); POST/GET spoil-shares (#19,20) | `ballot encrypt --intent spoil`, `ballot audit`, `election spoil-collect` | `spoil-release` | | cli/test/cli.test.ts:200; cli/test/spoil-collect.test.ts; trustee/test/spoil.test.ts; server/test/spoil-shares.test.ts | spoil-collect only writes bodies to POST with curl (README) |
| revote | log/entries `ballot` with `supersedes` (#31) | `ballot encrypt --supersedes <hex>` | n/a | | e2e.test.ts:27-33 | `max_per_voter` hard bound 20 |
| pause / resume | log/entries `notice` pause/resume (#31) | none | none | | e2e.test.ts:44-48 | coordinator-signed; `max_halts` only; `max_total_hours` not implemented (NOTES.md:44) |
| close | log/entries `election_close` (#31) | none | none | | negative.test.ts:183 | not before voting_close; server posts `tally_aggregate` itself |
| trustee decryption shares | log/entries `decryption_share` (#31); GET tally (#18) | none | `tally-release` | | trustee/test/tally.test.ts:21-163; e2e.test.ts:58-67 | trustee packet to log entry conversion outside these packages |
| tally | GET tally/draft (#21); log/entries `tally_result` (#31) | none | n/a | | e2e.test.ts:70-76 | coordinator signs draft; no CLI |
| publish result | log/entries `tally_result`, then `audit_close` (#31); GET tally (#18) | none | n/a | | e2e.test.ts:77-78 | `audit_close` only after audit window (default 7 d, `config.ts` auditWindowSec) |
| verify result | GET export.qvb/json (#45,46) | `verify`, `board verify`, `election inspect`, `selftest`, `vectors check` | `verify-transcript` | | cli/test/cli.test.ts:52,307,338,360; e2e.test.ts:85-89 | well covered |
| export bundle | GET export.qvb / export.json (#45,46), Range, ETag | none (consumes bundles) | none | | server/test/range.test.ts | rate class X 2/h per bucket; no authenticated bypass |
| import bundle | POST /imports (#50) + GET /jobs/:job (#49) | none | none | | server/test/imports.test.ts:64-535; b2-fixes.test.ts:42 | produces read-only IMPORTED mirror only |
| backup | POST /admin/backups (#53) | none | `backup` (trustee bundle only) | | server/test/admin.test.ts:107; trustee/test/lifecycle.test.ts:80; custody.test.ts | server backup has no download/retention/encryption; KEK excluded |
| restore | none | none | `restore` (trustee only) | | trustee/test/lifecycle.test.ts:80 | SERVER RESTORE ABSENT (NOTES.md:167) |
| delete / retention purge | DELETE /elections/:id (#22); DELETE /admin/elections/:id (#56); invite sweep (internal) | none | `destroy` (trustee key material) | | server/test/admin.test.ts:226; b2-fixes.test.ts:158,179; trustee/test/lifecycle.test.ts:165 | no ballot redaction API; backups keep purged data |
| health / diagnostics | /healthz, /readyz (#1,2); GET admin/status, admin/elections, self-audit (#51,52,54); log/evidence (#48) | none | `status` (trustee state) | | server/test/admin.test.ts:65,168 | no metrics endpoint (docs/31 not cross-read: UNVERIFIED) |
| migrations | implicit on DB open (`db.ts:73-107`) | none | none | | server/test/unit.test.ts (content not read: UNVERIFIED) | no explicit migrate/status command; admin/status shows version only |
| quarantine clear | POST admin/.../quarantine/clear (#55) | none | none | | server/test/admin.test.ts:168 | requires fresh re-audit |

## 6. Risks spotted while reading (all SUSPECTED, nothing executed)

1. No server entry point or deployable (`server/src/index.ts:1-9`; no `process.env` in src). Operators must write their own bootstrap, TLS proxy, key/KEK handling and signals. Production start-up path is unverified; tests only.
2. Insecure defaults: `registrationMode` defaults to `open` (`config.ts:208`) so any caller can create orgs (10/min per bucket); `adminKeys` empty means no admin and no admin API; `publicUrl` defaults to `http://localhost` (audience for every signed request, `auth.ts:56`); no TLS in-process (`http.ts:2`, NOTES.md:97).
3. Rate-limit buckets behind a proxy: peer address is the proxy unless `bucketHeader` is set (`http.ts:242`); then one client can lock out invite registration (`app.ts:553`, failure counter `ratelimit.ts:60-79`) or exhaust the 30/min pre-write bucket for everyone. If `bucketHeader` is set on a directly exposed server, the header is attacker-chosen, so limits are bypassable. Limiter and failure counters are in memory and reset on restart.
4. Backup/restore gap with KEK: backups exclude the KEK (`admin.ts:116`) and `loadOrCreateKek` silently creates a NEW random KEK if `kek.bin` is absent (`kek.ts:11`). A restore onto a fresh volume would start, but every `dek_wrapped`, `log_sk_enc`, `srv_sk_enc`, invite label and webhook secret would fail to unwrap. Opening an election would fail late rather than at start. No restore code or runbook in code. Backups sit unencrypted on the data volume with no expiry (`admin.ts:92-93`, NOTES.md:289-290).
5. KEK stored beside the data it protects (`<dataDir>/kek/kek.bin`, `kek.ts:9-19`). Anyone with a volume snapshot (including the backups dir) can unseal log signing keys and invite PII. Envelope encryption only helps if the KEK is kept elsewhere.
6. Tally aggregate trigger has no retry: `maybeAggregateLocked` runs only right after `election_close` commits (`election.ts:702`) and after a cosignature attach (`election.ts:1163`). A crash between the close commit and the aggregate append, or an aggregate that is blocked for a witness quorum that arrives by another path, can leave the election CLOSED with no aggregate and no startup resumption (no call at open, grep). Trustee tally-release then cannot proceed. UNVERIFIED whether the pool reload resyncs this.
7. Non-atomic deletion: `markDeleted` (DEK erased, state DELETED) precedes eviction and file unlink, with no tx spanning control DB and file (`pool.ts:104-114`). A crash leaves a DELETED registry row with an undeleted (but un-unsealable) DB file and the retry path `if (!reg) return` / state check will not clean it (the state is no longer in the allowed list, so a repeat call gets 409). The owner-route DELETE also has no idempotency key (`app.ts:462`) and no audit row (only `pool.remove` writes `system` audit, `pool.ts:113`).
8. Idempotency in-progress marker survives a crash: `storeIdem(...status 0)` is persisted before the work (`app.ts:127`) and cleaned only in the catch block (`app.ts:133-135`). After a hard kill the same Idempotency-Key returns 409 `IDEMPOTENCY_IN_PROGRESS` for up to 24 h (`controldb.ts:425`). For invite issue the codes are also never replayed (`app.ts:515`), so a lost response means orphaned issued invites.
9. One-vote-per-voter and revote-limit are in-memory projection rules (`election.ts:477-491`), not DB constraints (`electiondb.ts:51-58`). Correct under a single process with the per-election mutex, but a second process opened on the same `dataDir`, or a bug in replay, would not be stopped at the storage layer (only `UNIQUE(author,type,nonce)` and `leaf_hash`). Single-process deployment is not enforced anywhere (no lock file on dataDir, grep).
10. Post-commit work outside the append transaction: `apply()`, `syncState()` (registry `state`, `phase_seq`) and the phase event run after the append commits (`election.ts:684-708`); the phase-event tx failure is swallowed. A crash between leaves the control registry `state` (used by `/orgs/:org/elections`, admin list, delete guard `pool.ts:105`) stale relative to the log. The delete guard reads the registry state, not the replayed state, so a stale `DRAFT` could permit deleting an election that already has a manifest. UNVERIFIED how/when the registry is re-synced at reload.
11. Public unauthenticated CPU-heavy reads: `GET .../tally/draft` builds a full tally (proof checks per spoil/trustee) cached by trustee subset with only 16 entries (`election.ts:1279-1304`), keyed by attacker-chosen `decrypters` subsets (`app.ts:453-458`, up to 32 ids); rate class R is 120/min per bucket. `ensureAnalysis` loads every ballot body into memory after close (`election.ts:~1052-1068`) with log cap default 1 GiB (`config.ts:155`). Verification runs on the event loop under the election mutex (NOTES.md:96).
12. Authorization granularity: any `org_organizer` key can issue/revoke invites and `include_label=true` decrypts labels (invite PII) for any organizer (`app.ts:526`), create elections and import bundles; the instance admin passes `orgElection` for every org (`app.ts:102`) including invite and draft writes. `PUT /draft` accepts arbitrary JSON up to 256 KiB with no schema and is stored in plaintext (`app.ts:341-342`), a place PII could land unnoticed.
13. Trustee CLI arg parsing accepts unknown options silently (`cli.ts:50-66`): a typo like `--passphrase-flie` falls through to the TTY prompt (or hangs in automation) and `--out` typos write nothing. `verify-transcript --witness-key` does `wk.split('=')[1]!` with no check (`cli.ts` last case) so a missing `=` yields an undefined key; only one witness key can be given. `keygen --generate-passphrase` prints the secret to stderr (intended, but captured by log collectors).
14. Trustee stale lock: a crash leaves `<bundle>.lock` and all commands refuse with BUNDLE_LOCKED until a human deletes it (`fsutil.ts:136`). The release ledger sidecar is plaintext and can be deleted or rolled back by anyone with filesystem access (`ledger.ts:5-9`, acknowledged limit); `--override-no-ledger` bypasses it by typed phrase.
15. CLI reads whole files into memory with no size bound (`common.ts:9-15` `readFileSync`; bundles, keys, packets), and `keygen --force` does lstat then unlink then exclusive create (`cmd-keygen.ts:26-41`): the exclusive create refuses a swapped-in symlink, so the TOCTOU is benign, but unbounded input to `verify`/`election inspect` on a hostile bundle is a memory risk (the server import path has caps; the CLI does not).

## 7. UNVERIFIED / not examined

- Content of `docs/*` specs and whether code matches them; only code and package NOTES were read (NOTES used as context, not as proof).
- `webhooks.ts`, `sse.ts`, `gossip.ts`, `ssrf.ts`, `tar.ts`, `verify-worker.ts`, `export.ts` logic was skimmed only for headers/routes, not audited line by line.
- Whether the web package or scripts provide a server launcher, entry-signing, packet-to-entry bridging, or any restore tooling.
- Whether `addInvites` is a single transaction; whether registry state resyncs on reload (risk 10); startup behaviour after a crash between close and aggregate (risk 6).
- Test pass/fail status: no tests were run (constraint); counts are static regex counts.
