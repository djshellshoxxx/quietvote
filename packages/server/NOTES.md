# @quietvote/server: implementation notes, errata, gaps

Zero third-party dependencies (node:http, node:sqlite, node:crypto) plus workspace packages crypto/board/protocol.
`package.json` does not list the workspace deps (adding them needs a lockfile refresh; same as protocol NOTES). Board and
protocol packages were NOT modified.

## Design summary
* `http.ts` routing, limits (Content-Length + streamed counter, 413/414/415, header/headers/request timeouts, keep-alive,
  max connections), security headers, CORS (public GET `*`, others only `allowedOrigins`), problem+json, ETag/304.
  `auth.ts` signed requests (below). `ratelimit.ts` in-memory token buckets keyed by HMAC(epoch key, address prefix).
* `controldb.ts` / `electiondb.ts` per QV-28: control.sqlite + one STRICT, trigger-protected DB per election;
  `SqliteBoardStore` implements the board's `BoardStore`. `election.ts` = admission validator + board service + lifecycle
  projection (rebuilt by replay on open, no proof re-verification) + trustee coordinator views + tally relay.
  `export.ts`/`tar.ts` = `.qvb` (deterministic tar) and `export.json` (protocol `ElectionBundle`, feeds `verifyElection`).
* Admission order (QV-29-REQ-001): size -> bucket limit -> header decode/origin -> idempotent replay -> entry signature +
  authorization -> per-key limits -> phase gate -> (under the election mutex) strict canonical JSON + schema -> cheap chain
  checks -> proofs (`stats.proofVerifications` counts them; tests prove bad-sig/non-roll requests never reach it) -> append,
  projections and checkpoint in ONE sqlite transaction. A checkpoint is signed after every append (receipts are `included`).

## Mapping of protocol records to board entry types (spec gap: QV-18 §5.2 does not say)
manifest->`manifest`; marker dkg-open->`ceremony_start`; markers r1-open..r3-close->`notice`; dkg-final->`joint_key`;
dkg-commit+dkg-dealing->`dkg_round1`; dkg-shares->`dkg_round2`; complaint->`dkg_complaint`; keyconf->`key_confirm`;
roll-commit->`roll_commit`; election-open/close->`election_open`/`election_close`; cast->`ballot`; spoil->`ballot_audit`;
tally->`tally_result`. Bodies are the JCS bytes of the protocol record and must be canonical (E_NONCANONICAL otherwise).
Server-level records (`records.ts`, not in the protocol verifier, excluded from `export.json`, present in `.qvb`):
`control` (pause/resume/invalidate/security-notice in `notice`; audit-close->`audit_close`; cancel->`election_cancel`;
abort->`ceremony_abort`), `tally-aggregate` (server key, `tally_aggregate`), `dec-shares` (trustee, `decryption_share`).

## Spec ambiguities / errata
* **Auth**: QV-08 (signed requests, `Authorization: QV-Sig keyid,ts,nonce,sig`, +-120 s, nonce cache) was implemented, NOT QV-09's
  challenge/session bearer (no `/auth/*`, no sessions). Signed message adds the audience (`qv:<instance>@<publicUrl>`).
  Org registration is signed by the new key itself (proof of possession). Replay nonces persist in `control.replay_nonce`.
* **election_id**: API uses the 32-hex manifest `election_id` (QV-09 `ElectionId`); board origin = `quietvote/v1/` + base32(16 bytes)
  (26 chars, matching the board regex; QV-28's `quietvote/v1/<election_id>` would not parse). Org/invite ids are 26-char base32.
* **Entry authors**: manifest by an org organizer key; coordinator records by manifest coordinator keys (m-of-k signatures inside
  the record AND the entry author must be one signer); DKG/shares by the manifest trustee `sign_pk`; ballots by roll keys.
  Trustee invites/`redeem`/`trustee_accept` are not implemented: trustees are bound by manifest keys.
* **Server key**: each election has a second Ed25519 key (`srv_pk`, in `GET /elections/{id}`) authorised only for
  `tally_aggregate`; the server posts it automatically after `election_close` (and after a witness quorum if required).
  If counted ballots < floor, no aggregate is posted (`tally.blocked`). The tally record is built by `GET /tally/draft`,
  signed by a coordinator and posted; the server re-derives it and rejects any difference.
* **Time**: ballots need `voting_open - clock_skew <= now < voting_close` (server clock, QV-18 §5.3 step 8) in addition to
  OPEN; `election_open` needs `now >= voting_open - skew`. Advisory scheduler (auto open/close) NOT implemented (no closer key in manifest).
* **TALLIED** is folded into AUDIT immediately (checkpoint exists at once). STALLED is derived (TALLYING > `stalledMaxSec`).
  CHALLENGED exists in the enum but no entry produces it. `max_total_hours` pause cap and RESUME-with-new-close-time not implemented; `maxHalts` is.
* **Roll**: voters auto-approved on registration (no approval policy in the manifest); roll_commit must equal the server's
  approved set and its size must be >= the effective `min_counted_ballots`. Invite->voter link is not stored; replay of
  `(code, same pk)` returns the voter id. Idempotent replay of `POST invites` returns invite ids with `code_withheld:true`
  (codes are never stored). Registration PoP message: `"QV-REG-v1\0" election_id "\0" pk`.
* Spoil `trustees` mode (QV-ADR-020) is accepted only if the manifest enables it, but the trustee spoil-decryption relay is not built.
* `reveal` verification (`verifySpoilReveal`) is done at admission (costly); rejected with E_SPOIL_MISMATCH.
* Bucket for IPv6 is /64 (spec says /56); archive deletes erase the DEK and files but do not require an acknowledged export.
* `max_per_voter`/`max_spoils` overruns answer 429 `REVOTE_LIMIT` with `retryable:false` (QV-09 table).

## Event stream and webhooks (QV-09 §9, §6.3; QV-09-REQ-010/014)
* **Outbox**: election DB migration 2 adds the QV-28 `event` table (types `entry|checkpoint|phase|witness|alert`, P0 data only, no entry bodies).
  `entry` + `checkpoint` rows are written in the SAME transaction as the append; `phase`/`alert` rows right after (a crash in between can lose a
  phase row, never an entry; clients can always resync from the log). `witness` rows are written when a valid new cosignature is attached.
  Rows are published to live subscribers only after commit. Failed/rejected writes emit nothing.
* **SSE** (`sse.ts`): `GET /api/v1/elections/{id}/events`, class R, public (link elections need `QV-Read-Key`). Resume via `Last-Event-ID` header
  (wins) or `?last_event_id=`; malformed -> 400; id beyond the last issued, or older than the retained window -> `410 EVENT_GONE`. Without an id the
  stream starts at "now". Each client owns a cursor into the outbox and is fed in batches (`sseBatch`), so per-client memory is one batch plus the socket
  buffer; a socket that stays backpressured for `sseSlowClientMs` or queues more than `sseMaxBufferBytes` is dropped (reconnect resumes). Heartbeat
  comment every `sseHeartbeatMs` (default 15 s, hard max 20 s); no event for `sseIdleCloseMs` (10 min) -> closed. Caps: `maxSseStreams` per network
  bucket (429 + Retry-After), `maxSseTotal` per process (503 BUSY). Streams end when the runtime is evicted/deleted or the server stops.
  Outbox is pruned 30 days after ARCHIVED (checked lazily on connect). The outbox is not otherwise size-capped (3 rows per entry).
* **Webhooks** (`webhooks.ts`, `ssrf.ts`): `POST/GET /orgs/{org}/webhooks`, `DELETE /orgs/{org}/webhooks/{id}` (owner, signed, POST needs Idempotency-Key).
  Body `{url, events[], election_id?}`; response includes the signing secret exactly once (`whsec_...`); URL and secret are sealed under the KEK in
  `control.webhook`; the idempotency cache drops `secret` and `url`. Quota `maxWebhooksPerOrg` (10). Delivery: `POST` JSON with `QV-Webhook-Id`
  (stable across retries), `-Event`, `-Timestamp`, `-Signature: v1=hex(HMAC-SHA256(secret, "<ts>.<id>.<body>"))`. 2xx = delivered; 408/429/5xx/network/
  DNS failure = retry with exponential backoff (`webhookBackoffBaseMs` x2^n, cap `webhookMaxBackoffMs`, `webhookMaxAttempts` incl. first); other 4xx and
  3xx are permanent (redirects are NEVER followed). `webhookDisableAfter` consecutive failed deliveries disable the hook. Bounds: per-attempt deadline
  (`webhookTimeoutMs`, hard max 30 s), response read up to `webhookMaxResponseBytes` then dropped, body <= `webhookMaxBodyBytes`, queue+retry-wait
  <= `webhookMaxQueue` (oldest dropped), `webhookMaxInflight` concurrent sends. The queue is in memory: a restart drops pending retries.
* **SSRF policy**: https only; no credentials; ports 443/8443 only; no `localhost`, single-label, `.local/.internal/.lan/...` names; IP literals in any
  spelling are canonicalised by the URL parser then range-checked (v4: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24,
  192.168/16, 198.18/15, test nets, multicast, 240/4; v6: only 2000::/3 minus Teredo/ORCHID/documentation, IPv4-mapped/NAT64/6to4 judged by the embedded
  v4). Names are resolved and EVERY address must be public. The check runs at registration and again before every attempt; the socket then connects
  to the validated address (lookup is overridden: no second resolution, TLS still verifies the certificate and SNI against the URL host).
* Not covered / limits: no per-election event size cap; webhook delivery state is not persisted; `webhookResolver`/`webhookTransport` options exist
  only as test seams. Real-TLS transport tests need `openssl` (skipped without it). The 30-day post-ARCHIVED pruning (`pruneEventsIfExpired`) is not covered by a test (only the resulting 410 on a pruned window is).

## Not implemented (known gaps)
OpenAPI/JSON-Schema generation (imports, jobs, `/admin/*`, gossip and single-range `Range` are implemented, see the last section),
proof-of-work challenges and L0-L3 load levels (queue shedding via `maxVerifyQueue` -> 503 BUSY exists), worker-thread proof
verification (verification runs on the event loop under a per-election mutex), `merkle_node` table and `rebuild-projections`
command (tree is rebuilt from leaf hashes at open), encrypted backups, scheduled integrity checks, TLS termination, per-org quotas
beyond election/voter counts, `witness` / `event` tables (cosignature lines live in the stored checkpoint note).

## Webhook retry state persistence (QV-09 §6.3; supersedes the "in memory / not persisted" statements above)
* **Outbox**: control.sqlite migration 3 adds `webhook_outbox` (one row per pending delivery: `delivery_id`, `webhook_id`, `event_type`,
  `body` = the public P0 payload the receiver gets, `attempt`, `next_at` in ms). The row is written before the delivery is queued and is removed
  on success, on a terminal failure, when the hook is disabled or deleted, or when pruned. The control DB still holds no URL or secret in
  this table (those stay sealed in `webhook`).
* **Restart**: `WebhookService` reloads the outbox in its constructor. Rows due now are queued at once; the rest get a timer for their persisted
  `next_at`. A retry is persisted (`attempt+1`, new `next_at`) before its timer is set, including when the process is stopping.
* **Crash semantics**: at-least-once. A delivery in flight at crash time is re-sent with the same attempt number, the same `QV-Webhook-Id` and body,
  and a fresh timestamp/signature. Receivers dedupe on `QV-Webhook-Id`.
* **Failure counts**: `webhook.failures` (migration 3) persists the consecutive terminal-failure count, so `webhookDisableAfter` counts across restarts.
  A successful delivery resets it. Disabling a hook also removes its pending rows.
* **Cap and policy** (`webhookMaxQueue`, default 1000, existing config option, no new option): queued plus retry-waiting rows per process are capped.
  Admitting a delivery beyond the cap prunes the OLDEST queued/waiting rows (stats.dropped, timer cancelled); the newcomer is kept. In-flight
  deliveries are never pruned and not counted (unchanged from the in-memory behaviour, which the bounded-queue test relies on). Lowering the cap
  across a restart prunes the oldest persisted rows at startup. Worst case on disk is about 1000 rows x body (<= webhookMaxBodyBytes, 8 KiB default).
* **Still not persisted**: stats counters (in memory, reset on restart); the SSE outbox is unchanged (pruned by its own rules).
* **Tests**: `test/webhooks-persist.test.ts` (direct `WebhookService` over a real `ControlDb`, restarted on the same directory): retry resumes at its
  persisted attempt/time with identical id and body; a restart before the due time waits; cap pruning of queued and waiting rows and of persisted
  rows at a lower cap; failure count across restart and disable purging rows.

## Gossip, imports, jobs, /admin, Range (QV-09 §8/§10, QV-18 §9.5/§12, QV-28 §8.1/§11)
Files: `gossip.ts`, `imports.ts`, `jobs.ts`, `admin.ts`, `ext-routes.ts`, `range.ts`; control.sqlite migration 4 (`job`, `election_registry.quarantine`),
election DB migration 3 (`gossip_seen`, append-only `equivocation_evidence`); `tar.ts` gained `readTarStrict`. Tests: `gossip.test.ts`, `imports.test.ts`,
`admin.test.ts`, `range.test.ts` (helpers in `test/helpers/full.ts`: a full small election, hostile-tar builder, bundle rewriter).

**D-84 (OWNER DECISION PENDING).** `/admin/*` follows QV-08 (signed `QV-Sig` requests; key registered as `instance_admin`, seeded from `adminKeys`), the
recommended default, not QV-09 §3.2's session bearer (there is still no `/auth/*`). The whole admin authorization decision is ONE function:
`authorizeAdmin(c)` in `admin.ts` (the request signature is verified earlier by the HTTP layer for every `auth: 'sig'` route). If the owner picks the
bearer model, only that function and the token check in `http.ts` change. Admin responses are `no-store` and never CORS-readable; every admin POST/DELETE
requires `Idempotency-Key`.

**Gossip (`POST /gossip/checkpoints`, class G).** Body `{note}` only (`16 KiB` request, note <= 8192 chars, printable ASCII + em dash + LF, <= 24 lines,
<= 20 signature lines). Origin -> election (`quietvote/v1/<26 base32>` decoded back to the 128-bit id); unknown/odd origins 404, `link` elections require
`QV-Read-Key` (stricter than QV-09's "anon": otherwise the endpoint would leak existence and tree size). A note only counts if the origin's LOG KEY signed
it (else 422). Judgement is always recomputed from our own tree, so a peer cannot make us quarantine ourselves with a bogus proof: `same`, `peer_behind`
(answer carries a consistency proof, std base64, and the latest note), `peer_ahead` (rollback), `diverged` (fork / inconsistent). Evidence is built from
local data (`fork`: our stored note + theirs, checked with `checkFork`; `inconsistent`: ours-furnished proof that cannot verify; additive kind `rollback`).
Evidence rows are append-only (max 64 per election, deduped by SHA-256 of the signed texts); `gossip_seen` is keyed by SHA-256 of the signed TEXT (extra
signature lines cannot multiply rows), max `gossipSeenMax` rows (5000), 30 d. A live log that meets evidence is quarantined (`forcedQuarantine`, persisted in
`election.quarantine` as `{code,incident,min_size}`, alert event `equivocation|rollback`, registry flag for `/admin/status`); appends then answer 503
`QUARANTINED`, reads continue. An IMPORTED mirror records `fork` evidence (integrity `compromised`) but is never quarantined for `peer_ahead`.
Additive: `GET /elections/{id}/log/evidence`; response members `relation`, `tree_size`; problem members `evidence`, `incident`.
**Outbound** (`GossipService`, config `gossipPeers` https base URLs, `gossipIntervalMs` 0=off, `gossipTimeoutMs`): peers are checked with `parseTargetUrl` when
the config is resolved (a bad peer refuses start) and with `validateTarget` (every resolved address must be public) before EVERY send; the socket is pinned to
the validated address, no redirects, answer capped at 32 KiB, JSON parsed strictly. Only `public` elections that left DRAFT are pushed (just the public note).
A peer's answer (`latest_note`, or `evidence.notes` of a 409) is only used as input to the same signature check + local judgement. Test seams:
`gossipResolver`, `gossipTransport`. `ssrf.ts` transport got `captureBody` (bounded). Not done: querying witness monitoring endpoints (QV-18 §9.5 step 2),
a 60 s REQ-053 poll of witnesses (only gossip peers feed the rollback guard), mirrors as witnesses.

**Imports (`POST /imports`, class X, `application/x-tar`).** Request: signed (QV-08) over the whole body; headers (shape, +-120 s, key known) are pre-checked
BEFORE the body is read; `Content-Length` mandatory (chunked -> 411) and <= `maxImportBytes` (default 64 MiB, hard 1 GiB; `limits.max_import_bytes` in
`/instance`); at most `maxImportUploads` (2) bodies held in memory (503 BUSY); `Idempotency-Key` required; query `org_id` (default: caller's org; admins must
name one; other orgs' keys get 404), `access=public|link` (link: fresh read key returned ONCE in the 202 body, only its hash stored), `manifest_hash`
(out-of-band H_m); unknown params 400. Org election quota applies (429). Result: `202` + `Location: /api/v1/jobs/{id}` + Job. At most `importQueueMax` (2) jobs
queued/running, further 503 BUSY. Verification (job; yields to the event loop): strict tar (regular files only, checksummed headers, safe names, no prefix/links/
dup/trailing data, `maxImportEntries` files) -> every file in `SHA256SUMS` and vice versa -> `bundle.json` -> `entries.jsonl` (exact 3-key lines, gapless seq,
bodies required, <= `maxImportEntries`) -> checkpoint files (name = size) -> `verifyElection(election.json)` (all protocol records, proofs, tally) -> manifest
binds origin (`originOf(election_id)`), `bb.log_pk` = bundle log key, entry 0 = canonical manifest record -> `verifyLog` with a resolver derived from the
manifest (coordinators, trustees, roll voters, `tally_result` by its own `sig.key`; organizer and server keys from `bundle.json`, id-bound to the header) for
EVERY entry signature/authorisation, tree, checkpoint signatures/prefix roots, witness gates (manifest witnesses, else instance `witnesses`) -> election.json log
== entry bodies byte for byte, nothing hidden. Exact failing `{rule, detail, seq?}` in `Job.error`. Commit: election DB written first (one tx), registry row
last, then a replay self-test through the pool; any failure removes the files. Result state `IMPORTED` (registry `imported=1`, no DEK, no signing keys,
store read-only, voters/ballot index rebuilt, `TERMINAL`); `verdict` PASS or INCOMPLETE (no tally yet). **Spec deviations/limits:** (a) `bundle.json` now carries
`server_pk_b64u` and `organizer_pk_b64u` (entry authors that the header only names by id; self-attested but id-bound and signature-checked; the manifest hash /
`log_pk` remain the trust anchors); bundles from other producers without them are refused. (b) Bundles with redactions are refused (replay needs bodies).
(c) Receipts, anchors and `bundle.json.sig` in a bundle are checksummed but ignored. (d) `.qvx` operator restore and `?at_size=` are not implemented.
(e) Witness status of an imported log is shown against the instance's configured witnesses, not the manifest's. (f) The 15 s default `requestTimeoutMs` bounds
an upload; raise it (hard max 120 s) for large bundles. (g) Unlike QV-28 §11.4, org owners may delete an IMPORTED mirror without a prior export.

**Jobs.** `GET /jobs/{id}` (signed): creator key or instance admin, else 404. In-process FIFO runner (`jobs.ts`), one job at a time, state in `job`
(retention `jobRetentionMs` 7 d); inputs live in memory, so queued/running jobs are marked failed `INTERRUPTED` at the next start. Errors are reduced to
`{code, detail, ...}` (no stacks). Admin jobs (backup/self-audit/delete) are capped at 4 queued+running (503 BUSY + Retry-After).

**/admin.** `GET /admin/status` (`migrations.control` and `.version` both report the control DB schema version: QV-09 does not define `version`),
`GET /admin/elections` (registry columns only, `state`/`cursor`/`limit`), `POST /admin/backups` (SQLite online `backup` into `<data>/backups/<job>/`, 0700/0600,
`PRAGMA quick_check` of each copy, `manifest.json` with SHA-256, never the KEK; NOT encrypted at rest beyond the already-sealed fields; no retention/pruning yet),
`POST /admin/elections/{id}/self-audit` (leaf hashes, body digests, root, every checkpoint signature/root; mismatch quarantines a live log; no scheduler, REQ-054's
6 h cycle is not implemented), `POST .../quarantine/clear` (needs `ack` = incident id, `verified_against` = `witness:<configured name>` entries, a fresh replay + full
audit, log size >= the largest size our key signed for, a stored checkpoint of at least that size cosigned by each named witness; `fork`/`inconsistent`
evidence is permanent -> 409 `COMPROMISED`; this uses stored cosignatures, it does not query witnesses live), `DELETE /admin/elections/{id}` (`confirm` = title; same state
preconditions as the org delete: DRAFT, ARCHIVED, CANCELLED, ABORTED, IMPORTED; the export-acknowledged / 30-day-grace rule of QV-28 §11.2 is still not enforced).
Idempotency lookup precedes precondition checks on the admin POST/DELETE routes, so a replay after completion returns the stored job.

**Range.** `export.qvb` / `export.json` set `Accept-Ranges: bytes`; exactly one range -> 206 + `Content-Range`; multi-range, malformed, `a>b`, `-0`, start >= length,
>128-char header, empty body -> 416 `Content-Range: bytes */len` (RFC 9110 allows rejecting; nothing is ever expanded); unknown unit ignored; `If-Range` only with the
current strong ETag; `If-None-Match` -> 304 first. ETag is now `"<size>:<root16>:<gen>"` (gen bumps on cosignature intake). Built `.qvb` bytes are cached per election
(10 min, 128 MiB total LRU) so ranged/resumed downloads are cheap; the class-X rate limit still counts every request, including range requests.

**Other changes.** `election.ts` (minimal edits): `forcedQuarantine`, `imported`, `markQuarantine`/`clearForcedQuarantine`/`raiseAlert`, `syncQuarantineFlags`, IMPORTED
state mapping, `quarantineReason` used by the admission phase gate. `problem.ts`: `extra.headers`/`extra.body`. `http.ts`: `body: 'tar'` routes, `Reply.ranges`.
`/instance`: `limits.max_import_bytes`, features `gossip imports range-export admin`. State view `integrity` can now be `compromised`.

**Open questions for the owner.** D-84 (above). Should `link` elections accept anonymous gossip (QV-09 says anon; implemented stricter)? Should the bundle format carry the
organizer/server keys officially (QV-18 §12 file list)? Should the verifier's `bind()` accept the organizer key for the manifest entry (per `logcheck.ts` `bind()` it allows only coordinator
keys for the manifest entry, while this server has an org organizer key sign it; not run end to end, which is why the importer verifies the board layer itself instead of passing `{log}` to `verifyElection`)? Retention/encryption of backups?

## Security review 2026-10-21 (AI-assisted, not an independent audit)
Report: `docs/reports/security-review-2026-10-21.md`. Regression tests: `test/security-review.test.ts` (SR-1..SR-4; SR-5 is in `packages/protocol`).
* **SR-1 (`auth.ts`)**: the `(key, nonce)` replay record now lives until `max(now, ts) + 120 + 5 s` (was `now + 125 s`, which let a future-dated request be
  replayed after its nonce expired while its `ts` was still inside the window).
* **SR-2 (`admin.ts` `clearQuarantine`)**: fork evidence, the current incident id and the rollback minimum size are re-checked on the freshly re-opened runtime
  after the last `await`; evidence that arrives through gossip during the clear can no longer be cleared away.
* **SR-3 (`admin.ts` `auditLog`)**: the self-audit compares against the in-memory root at the audited size and checks checkpoints signed during the audit
  against the in-memory tree, so appends during a yielding audit no longer cause a false quarantine.
* **SR-4 (`ssrf.ts`)**: host names with empty labels (`localhost..`, `a..b`) are refused statically.
* **Flagged, not changed**: `control.webhook_outbox.body` keeps the public P0 delivery payload in the control DB, a literal deviation from QV-28-REQ-019 (owner
  decision: store only `(election_id, event_id)` and rebuild at send time, or record an erratum). See the report for unconfirmed suspicions (SSE slot release
  when the client vanishes before attach, pre-auth upload reservation, duplicate witness keys in `cfg.witnesses`).
* **Webhook receivers** should reject deliveries whose `QV-Webhook-Timestamp` is outside their own window (e.g. +-5 min), compare the `v1=` signature in
  constant time, dedupe on `QV-Webhook-Id`, and take the event type from the signed body (the `QV-Webhook-Event` header is not signed).
