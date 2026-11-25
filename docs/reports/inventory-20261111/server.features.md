# Server area feature inventory (snapshot the ab84f16 snapshot)

Scope: `packages/server` against QV-08, QV-09, QV-12, QV-28, QV-29, QV-31. QuietVote is unaudited and not for real elections. Requirement IDs are in `server.reqs.jsonl` (125 rows). Test paths are under `packages/server/test/` unless stated. Effort estimates are rough engineering hours for one developer, excluding external review.

Notes that apply across rows:
- The server is a library (`buildServer(opts).start()`); there is no `bin/`, no CLI entry point, no env-var parsing, no container or service files. Rows marked Complete describe the HTTP/library behaviour only.
- B3-01 (registration wire contract) is treated as HELD per the brief. Note: `docs/decision-log.md` QV-ADR-028 records it as accepted on 2026-11-04, while the server still expects the raw invite code (see `test/consolidation.test.ts`). The coordinator should reconcile this.

## Feature table

| Feature | Spec ref | Implementation status | Verified by (test files) | Remaining requirements | Known defects (NOTES/audit IDs) | Dependencies | Security implications | Est. remaining effort | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|---|
| Organization registration (open/token/closed) | QV-09 s3, REQ-018 | Complete | helper-driven in all suites (`helpers/world.ts`); no per-mode test | Per-mode tests (REQ-018) | none known | control.sqlite | Token compare uses ctEq; open mode lets anyone create orgs (quota only) | 2-3 h | Test each of open/token/closed: allowed/denied with codes |
| Signed organizer/admin requests (QV-Sig) | QV-08-REQ-019, QV-09-REQ-006 | Complete (spec text pending D-84) | negative, audit, security-review (SR-1) | Rewrite QV-09 s3.2 to QV-Sig; web still calls /auth/* | B2-05 (control freshness, open); SR-1 fixed | control.replay_nonce | Audience-bound, nonce persisted, +-120 s | 2-4 h (docs) | Spec and web match the implemented scheme; replay/stale tests stay green |
| Org key management | QV-08, QV-09 s4 | Complete | audit.test (authz) | none | none | auth | Owner-only; PoP on added key | 0 | Existing tests |
| Election create and draft | QV-09 s6.1 | Complete | e2e, helpers | Spec says DELETE preconditions incl. export-ack (see retention) | instance_admin can create/edit in any org (suspected defect D2) | pool, DEK/KEK | Per-election log key and server key generated and sealed | 2-3 h (admin scoping) | instance_admin cannot create/edit elections in other orgs unless explicitly allowed |
| Manifest publish, ceremony (DKG) coordination | QV-18 s5, QV-09 s6 | Complete | e2e (3-of-5), negative (election_open binding) | Trustee invites/redeem not implemented (trustees bound by manifest keys) | none known | board, protocol | Entry authors are manifest keys; coordinator m-of-k | 0 | Existing e2e green |
| Trustee coordination views | QV-09 s7 | Partial | e2e | `trustee_invite`/`redeem`/`trustee_accept` absent | NOTES "Entry authors" | manifest trustees | Public inbox of encrypted shares only | 8-16 h (if kept in scope) | Owner decision needed on keeping trustee invites; otherwise amend spec |
| Invites (issue, list, revoke) | QV-09 s3.3, QV-29-REQ-008 | Partial | negative (invite codes), b2-fixes (B2-11) | 160-bit codes, <=30-day cap, default TTL, oracle policy (B2-10 approved A) | B2-10, B2-11 residual; invite_id derivation lowercases base64url (app.ts:497) | election DB, DEK | Codes stored only as SHA-256; label/contact sealed, purged after 7 d | 4-6 h | Codes 160-bit; expiry capped; unknown and used give same code; tests |
| Voter registration + proof of possession | QV-09 s3.3, QV-04-REQ-005 | Blocked-decision (B3-01 HELD) | consolidation.test (records observed 401 for web contract) | Wire contract unresolved (web hashed invite vs server raw code) | B3-01 | invites | PoP not bound to invite in current server contract | unknown (blocked) | Real web-to-server registration journey passes while committed-roll refusal is kept |
| Roll commit and roll endpoints | QV-18, QV-29-REQ-009 | Complete | e2e, consolidation (B2-09) | none | none | registrations | Roll must equal server's approved set; min_counted floor | 0 | Existing tests |
| Open/close markers, phase gating, witness gate | QV-18 s5.4, QV-08-REQ-017 | Complete | negative (witness gating, election_open binding, late ballot) | Advisory auto open/close scheduler not built (D-91: not MVP) | none | witnesses | Time check uses server clock + manifest skew | 0 (scheduler deferred by default) | Existing tests |
| Pause/resume/invalidate controls | QV-07 s15, QV-29-REQ-021 | Partial | e2e (indirect) | Freshness binding (B2-05 approved B), max_total_hours, RESUME new close time, CHALLENGED producer, control reason enum | B2-05, B2-16 (free-text reason in public log) | protocol records | Replayable m-of-k control bodies | 16-30 h | control_seq enforced by server+verifiers; replay test fails old body |
| Ballot admission pipeline + receipts | QV-29-REQ-001, QV-08-REQ-008/022 | Complete | negative, e2e, audit (append integrity) | kill -9 durability test; perf test | none known | board, protocol | Cheap checks (size, bucket, sig, roll, phase, per-key rate) precede proofs | 6-10 h (fault tests) | Crash-injection test never issues receipt for lost entry |
| Duplicate / idempotent submission | QV-08-REQ-009, QV-09-REQ-008 | Complete | negative (entry replay, idempotency keys) | Keyless runtime receipts (B2-12) | B2-12: archived/imported runtime signs replay receipts with zero-seed key (election.ts:127-129) | board | Public key of zero seed is known | 3-5 h | Replay on keyless runtime returns 503/409, never a signed receipt |
| Revote / supersede and caps | QV-29-REQ-006, QV-16 | Complete (tests thin) | e2e (revotes), world helper | Tests for REVOTE_LIMIT, E_SUPERSEDES, E_DUP_CODE, concurrent same-voter casts | none known | manifest max_per_voter | Per-voter chain enforced under election mutex | 4-6 h | Tests prove limit overrun and forked supersedes are rejected before proof verification |
| Spoil / audit endpoints and trustee-mode spoil shares | QV-ADR-020 | Complete | spoil-shares.test, e2e | D-88 default says off in suite v1 (flag-gated) | CP-01/TR-01 alias rejection done | trustees | Spoil reveal verified at admission | 0 | Existing tests |
| Tally orchestration (server aggregate, draft, tally record) | QV-18, QV-16 | Complete | e2e, consolidation (B2-01) | none | none known | trustee shares | Server key authorised only for tally_aggregate | 0 | Existing tests |
| Results publication and archive | QV-18 s5.4 | Complete | e2e | TALLIED folded into AUDIT; CHALLENGED never produced | NOTES Time/State | audit_close | Keys erased at ARCHIVED | 0-4 h | Decision on CHALLENGED |
| Public read API (log, proofs, checkpoints, state, roll) | QV-09 s7-8 | Complete | negative, audit, range | contract tests / OpenAPI (REQ-001/002) | SRV-003/004 fixed | board | Link elections require QV-Read-Key and are no-store | 12-20 h (schemas + drift CI) | Generated OpenAPI; CI drift check |
| Live events (SSE) | QV-09-REQ-010 | Complete | events.test (12 SSE tests), sse-lifecycle.test | 30-day outbox pruning untested | NOTES: pruning not covered | outbox table | P0-only payloads | 1-2 h | Time-travel test for pruning |
| Export (.qvb / export.json) + Range | QV-09-REQ-016, QV-28-REQ-014 | Complete (public bundle) | range.test, e2e | Operator bundle, snapshot/p99 load test | none known | board | Anonymous read; cache 128 MiB LRU | 6-10 h | Operator bundle plus latency test |
| Import as read-only mirror | QV-08-REQ-011 | Complete | imports.test, import-availability.test, import-worker.test, b2-fixes | .qvx operator restore; at_size | residual main-thread tar/log work (NOTES 2026-11-09) | worker thread | Strict tar parser; verification before publish | 8-16 h | Restore path with rollback guard |
| Webhooks (signed, SSRF-guarded, persisted retries) | QV-09 s6.3, REQ-014 | Complete | events.test, ssrf.test, webhooks-persist.test | Decide outbox body storage (QV-28-REQ-019) | webhook_outbox.body stores P0 payload (flagged) | KEK | SSRF re-validated per attempt; redirects never followed | 2-4 h | Owner choice implemented |
| Witness cosignatures, gossip, equivocation quarantine | QV-18 s9, QV-08-REQ-025/027 | Complete (server side) | gossip.test, events.test, consolidation (B2-04) | Witness polling, 60 s poll, `qv mirror` | none known | peers | Quarantine persists; clear needs witness evidence | 10-16 h | Rollback detected without peers |
| Rate limiting / abuse controls | QV-29 | Partial | negative, unit, audit (SRV-002) | PoW, L0-L3, QUOTA_GRANT, 5% disk, IPv6 /56, nightly abuse suite, aggregate counters | N-32(a) IPv6 /56 approved not done | limiter | In-memory only; onion clients share a bucket | 40-80 h | Each QV-29 Must demonstrated by test |
| Logging and telemetry privacy | QV-31, QV-08-REQ-028 | Partial | b2-fixes, negative | Metrics, /health/*, retention, field-allowlist CI, support bundle | B2-16 free-text control reason | logger | Allowlist, minute timestamps | 20-40 h | Canary test across logs and metrics |
| Storage, migrations | QV-28 s2-5, QV-08-REQ-031 | Partial | unit (triggers), admin | Pre-migration backup, migration tests, columns.json, rebuild-projections | none known | db.ts | WAL/FULL, STRICT, triggers | 16-28 h | Golden-DB migration test with root before/after |
| Retention and deletion | QV-28 s11 | Partial | b2-fixes (invites), admin (delete) | Export-ack + 30-day grace (N-32b approved), backup retention | NOTES: owner deletes IMPORTED without export | pool | Crypto-erase by dropping wrapped DEK | 6-10 h | Time-travel tests per section 11 |
| Backup / restore | QV-28-REQ-011/012, QV-12-REQ-005 | Partial | admin.test (backups) | Restore command, rollback guard (B2-07 approved B+A), age encryption, DR drill | B2-07 | admin | Backups unencrypted; KEK excluded | 30-60 h | Drill restores, refuses older state without flag |
| Health checks | QV-08-REQ-032, QV-31-REQ-005 | Partial | none direct | /integrity, /metrics, readyz semantics, tests | spec names conflict (/healthz vs /health/live) | none | Uniform responses | 4-8 h | Contract tests; failure injection |
| TLS, packaging, deployment | QV-08-REQ-012-015,033 | Missing | none | Entry point, binary, OCI, systemd, TLS termination, config reference | NOTES: TLS termination not implemented | none | Without TLS, HSTS only when https_ flag set | 40-80 h | Container smoke test |
| Admin API (status, list, backup, self-audit, quarantine clear, delete) | QV-09 s10, QV-12 | Complete (D-84 note) | admin.test, gossip.test, security-review | Scheduler, support bundle | SR-2/SR-3 fixed | adminKeys | Registered admin keys, no-store, no CORS | 4-8 h | Existing plus scheduler |
| Instance info, release manifest, static serving | QV-09 s5 | Complete | negative, audit (SRV-006), consolidation (B3-03) | none | none | statics | CSP; /api never answered by SPA | 0 | Existing |
| Link-access read keys | QV-09 s3 | Complete | negative, audit (SRV-003), events | Read-key rotation (D-53) | none | election row | Hash-only storage; no-store responses | 0-3 h | Rotation test |
| Encryption at rest (KEK/DEK) | QV-28 s9 | Partial | events (webhook sealed), b2-fixes | KEK custody outside data dir; erase-proof test | KEK at `<data>/kek/kek.bin` (D9) | kek.ts | Disk or backup copy of data dir yields KEK | 6-12 h (needs owner key-custody choice) | Documented custody and erase test |
| Operations (doctor, alerts, runbooks, SLO status) | QV-12 | Missing | none | doctor, alerts, runbooks, /status, game-days | none | metrics | n/a | 40-80 h | Per QV-12 acceptance rows |

## (a) HTTP API surface (registered in code)

Source: `packages/server/src/app.ts` and `packages/server/src/ext-routes.ts` (route registration via `add({method,path,cls,auth})`). Auth column: none = unauthenticated (entries or records authenticate themselves, or public read); voter-signature = the posted entry is signed by the voter key (no HTTP-level auth); organizer QV-Sig = `Authorization: QV-Sig` by any org key; owner QV-Sig = QV-Sig and role check in handler; admin = QV-Sig by registered `instance_admin` key (also accepted by org routes). `/api/v1` prefix omitted from the text only where noted. Link elections additionally need `QV-Read-Key` on read routes.

| Method | Path | Auth | Source |
|---|---|---|---|
| GET | /healthz | none | app.ts:189 |
| GET | /readyz | none | app.ts:191 |
| GET | /api/v1/instance | none | app.ts:202 |
| GET | /api/v1/instance/release | none | app.ts:214 |
| POST | /api/v1/orgs | self-signed (QV-Sig by new key, proof of possession; registration mode applies) | app.ts:224 |
| GET | /api/v1/orgs/:org | organizer QV-Sig | app.ts:246 |
| GET | /api/v1/orgs/:org/keys | organizer QV-Sig | app.ts:253 |
| POST | /api/v1/orgs/:org/keys | owner QV-Sig | app.ts:257 |
| DELETE | /api/v1/orgs/:org/keys/:keyid | owner QV-Sig | app.ts:276 |
| GET | /api/v1/orgs/:org/elections | organizer QV-Sig | app.ts:288 |
| POST | /api/v1/orgs/:org/elections | organizer QV-Sig (Idempotency-Key) | app.ts:300 |
| GET | /api/v1/elections/:id | none | app.ts:321 |
| PUT | /api/v1/elections/:id/draft | organizer QV-Sig | app.ts:336 |
| GET | /api/v1/elections/:id/manifest | none | app.ts:347 |
| GET | /api/v1/elections/:id/state | none | app.ts:355 |
| GET | /api/v1/elections/:id/ceremony | none | app.ts:357 |
| GET | /api/v1/elections/:id/ceremony/inbox/:j | none | app.ts:380 |
| GET | /api/v1/elections/:id/tally | none | app.ts:397 |
| POST | /api/v1/elections/:id/spoil-shares | none (trustee-signed record) | app.ts:422 |
| GET | /api/v1/elections/:id/spoil-shares | none | app.ts:435 |
| GET | /api/v1/elections/:id/tally/draft | none | app.ts:450 |
| DELETE | /api/v1/elections/:id | owner QV-Sig (confirm = title) | app.ts:463 |
| POST | /api/v1/elections/:id/invites | organizer QV-Sig (Idempotency-Key) | app.ts:480 |
| GET | /api/v1/elections/:id/invites | organizer QV-Sig | app.ts:519 |
| DELETE | /api/v1/elections/:id/invites/:invite | organizer QV-Sig | app.ts:535 |
| POST | /api/v1/elections/:id/registrations | none (invite code + key PoP; B3-01 held) | app.ts:546 |
| GET | /api/v1/elections/:id/roll | none | app.ts:582 |
| GET | /api/v1/elections/:id/voters/:kid | none | app.ts:596 |
| GET | /api/v1/elections/:id/voters/:kid/ballots | none | app.ts:605 |
| GET | /api/v1/elections/:id/trustees | none | app.ts:616 |
| POST | /api/v1/elections/:id/log/entries | none at HTTP level; entry self-authenticates (voter / trustee / coordinator / organizer signature) | app.ts:630 |
| GET | /api/v1/elections/:id/log/entries | none | app.ts:647 |
| GET | /api/v1/elections/:id/log/entries/:seq | none | app.ts:690 |
| GET | /api/v1/elections/:id/log/entries/by-leaf/:leaf | none | app.ts:699 |
| GET | /api/v1/elections/:id/log/checkpoint | none | app.ts:710 |
| GET | /api/v1/elections/:id/log/checkpoints | none | app.ts:721 |
| GET | /api/v1/elections/:id/log/proof/inclusion | none | app.ts:732 |
| GET | /api/v1/elections/:id/log/proof/consistency | none | app.ts:757 |
| GET | /api/v1/elections/:id/log/witnesses | none | app.ts:770 |
| POST | /api/v1/elections/:id/log/cosignatures | none (witness signature checked) | app.ts:778 |
| GET | /api/v1/elections/:id/events (SSE) | none | app.ts:796 |
| POST | /api/v1/orgs/:org/webhooks | owner QV-Sig (Idempotency-Key) | app.ts:805 |
| GET | /api/v1/orgs/:org/webhooks | owner QV-Sig | app.ts:838 |
| DELETE | /api/v1/orgs/:org/webhooks/:wh | owner QV-Sig | app.ts:846 |
| GET | /api/v1/elections/:id/export.qvb | none | app.ts:889 |
| GET | /api/v1/elections/:id/export.json | none | app.ts:899 |
| POST | /api/v1/gossip/checkpoints | none (signed note) | ext-routes.ts:38 |
| GET | /api/v1/elections/:id/log/evidence | none | ext-routes.ts:63 |
| GET | /api/v1/jobs/:job | QV-Sig (creator or admin) | ext-routes.ts:79 |
| POST | /api/v1/imports | org or admin QV-Sig (signature over whole tar body) | ext-routes.ts:90 |
| GET | /api/v1/admin/status | admin | ext-routes.ts:125 |
| GET | /api/v1/admin/elections | admin | ext-routes.ts:132 |
| POST | /api/v1/admin/backups | admin (Idempotency-Key) | ext-routes.ts:150 |
| POST | /api/v1/admin/elections/:id/self-audit | admin | ext-routes.ts:164 |
| POST | /api/v1/admin/elections/:id/quarantine/clear | admin | ext-routes.ts:180 |
| DELETE | /api/v1/admin/elections/:id | admin | ext-routes.ts:192 |

Not registered (specified but absent): `/auth/challenge`, `/auth/session`, `/metrics`, `/status`, `/health/live`, `/ready`, `/integrity`, trustee invite/redeem routes, `GET /elections/:id/draft`. Static SPA files are served by `static.ts` when `staticDir` is set (never for `/api` paths).

## (b) Deployment/ops surface that exists today

- Start: only programmatically, `buildServer(opts)` then `.start()` / `.stop()` in `packages/server/src/app.ts:62-931`, exported from `packages/server/src/index.ts`. Used by tests (`test/helpers/world.ts`) and `packages/web/e2e/verifier.ts`. No `bin/`, no `serve` command in `packages/cli`, no signal handlers (grep for SIGTERM/SIGINT in src returns nothing), no `.listen` outside `http.ts:473`.
- Config: `ServerOptions` object only (`packages/server/src/config.ts:20-145`), resolved with compiled-in hard bounds (`HARD`, config.ts:166) that refuse start when exceeded. No environment variables are read (`src/env.ts` is a typed services interface, not env parsing). Defaults: host `127.0.0.1`, port 0, `publicUrl` `http://localhost`, registration `open`, maxBallotBytes 128 KiB, per-election log cap 1 GiB, min free disk 500 MiB, invite retention 7 d.
- Health: `GET /healthz` (static ok) and `GET /readyz` (control DB write probe) at `app.ts:189-200`. No `/metrics`.
- TLS: none. NOTES list "TLS termination" as not implemented; `Strict-Transport-Security` is emitted only when the listener is configured https (`http.ts:150`); public URL is configuration only.
- Data layout: `<dataDir>/control.sqlite`, `<dataDir>/elections/<aa>/<election_id>.sqlite` (0700 dirs), `<dataDir>/kek/kek.bin` (32-byte KEK, 0600, same volume), `<dataDir>/backups/<job>/` (0700/0600, SHA-256 manifest).
- Backup: `POST /api/v1/admin/backups` (SQLite online backup + `quick_check` per copy, `admin.ts:75-81`). No restore tool, no encryption, no retention pruning, no scheduler.
- Retention: hourly sweep timer (`retention.ts`) for invite label/contact purge; lazy purge on invite routes.
- Containers / service files: none (no Dockerfile, compose file, systemd unit, or release job in repo; `.github/workflows/` has `ci.yml`, `claims-lint.yml`, `pseudo-locale-visual.yml` only).
- CI: `.github/workflows/ci.yml` runs server+web tests on Node 22 and 24 (Linux on PRs; 3-OS matrix on main/nightly).
- Engines: `packages/server/package.json` and root `>=22.18` (D-86 pending against QV-ADR-014 `>=22.16`).
- Server tests: 18 test files in `packages/server/test/` (about 160 test cases by `test(` count); bench: `packages/server/bench/import-verification.ts` only.
