# Server: bounded decision-free tasks and suspected defects

Snapshot: `the ab84f16 snapshot`. Priorities: eligibility/authorization, duplicate-vote prevention, atomicity/data integrity, privacy of stored data and logs. None of these tasks touches the HELD registration contract B3-01 (request body, PoP bytes and invite hash format of `POST .../registrations` stay unchanged) or D-92..D-96. Where a task follows an approved item in `docs/plan/DECISIONS-2026-11-04.md` (approved as QV-ADR-027), that is cited as the reason no new owner decision is needed. QuietVote is unaudited and not for real elections.

## Tasks (most important first)

### 1. Never sign receipts on keyless runtimes (B2-12, interim option A)
- Files: `packages/server/src/election.ts` (constructor lines 127-129 use a zero-seed `secretKey` when `logSk` is absent; `outcomeFor` at ~633-637), `packages/server/src/app.ts:630-646`; add test in `packages/server/test/audit.test.ts` or a new `keyless.test.ts`.
- Change: when the runtime has no log key (ARCHIVED after key erase, IMPORTED mirror), `outcomeFor` and any receipt path throw `LOG_UNAVAILABLE` 503 (or 409) instead of signing; duplicates included.
- Acceptance check: archive an election (or import a bundle) then re-POST an existing stored entry: response is 503/409, no `receipt` member, and no signature verifies under the all-zero Ed25519 seed. Existing e2e and import tests still pass.
- Hours: 3-5.
- No owner decision: DECISIONS-2026-11-04 B2-12 recommends "A as interim minimum", approved by QV-ADR-027; "zero-seed signing is always wrong" per the register.

### 2. Stop instance_admin keys minting invites or editing elections in other orgs (QV-12-REQ-003)
- Files: `packages/server/src/app.ts:100-105` (`orgElection` returns the runtime for any `instance_admin`), `:111-115` (`orgOf`), invite routes `:480-545`, `PUT .../draft` `:336`, `POST /orgs/:org/elections` `:300`.
- Change: restrict `instance_admin` bypass to read, delete (with confirm), import and the `/admin/*` routes; invite, draft and election-create routes require an org key of that org. Add tests in `packages/server/test/admin.test.ts` or `audit.test.ts`.
- Acceptance check: a registered admin key calling `POST /elections/:id/invites`, `PUT .../draft` and `POST /orgs/:org/elections` for another org gets 403/404; org owner still works; admin delete, status, backup, import still work.
- Hours: 3-5.
- No owner decision: QV-12-REQ-003 (Must) says no operator code path may add voters or alter an election; the change only removes an unspecified over-privilege.

### 3. Tests that prove duplicate-vote and revote limits (QV-29-REQ-006, QV-29-REQ-008)
- Files: new `packages/server/test/ballot-limits.test.ts` reusing `test/helpers/world.ts`/`full.ts`.
- Cases: (a) cast beyond `max_per_voter` answers 429 `REVOTE_LIMIT` before any proof verification (`env.stats.proofVerifications` unchanged); (b) second identical cast with new author nonce is `E_SUPERSEDES`; (c) another voter replaying a stored envelope is `E_DUP_CODE`/`E_VOTER_NOT_ELIGIBLE`; (d) spoil of a cast code and cast of a spoiled code are rejected; (e) two simultaneous casts by one voter yield exactly one append; (f) 100 parallel `registrations` with one invite code yield exactly one voter and 99 failures (invite redemption atomicity, `app.ts:566-569`).
- Acceptance check: `node --test packages/server/test/ballot-limits.test.ts` green; each case fails if the corresponding check in `election.ts:1034-1049` or `consumeInvite` is removed (mutate locally, do not commit).
- Hours: 5-8.
- No owner decision: tests only; no behaviour change. Registration cases use the currently implemented raw-code contract and make no claim about B3-01.

### 4. Raw-file sentinel scan of stored data for P2/P3 plaintext (QV-28-REQ-006/008/009)
- Files: new `packages/server/test/storage-privacy.test.ts` using `helpers/world.ts`.
- Cases: create invites with sentinel label and contact (emails), register a voter, create a webhook with sentinel URL; read every file under the data dir (including `-wal`, `-shm`) and assert the sentinels are absent; after the retention purge assert absence again (secure_delete); after `DELETE` of a DRAFT election assert sealed fields cannot be unsealed with the KEK (wrapped DEK gone) and the files are removed; scan `logs` for sentinels and invite codes.
- Acceptance check: test green; mutating `seal(...)` calls at `app.ts:496-497` to store plaintext makes it fail.
- Hours: 3-5.
- No owner decision: closes a missing acceptance test of an existing Must; no behaviour change.

### 5. Move phase/alert outbox rows into the append transaction (QV-28-REQ-005)
- Files: `packages/server/src/election.ts:657-700` (phase and alert rows are written in a second `edb.tx` after `apply`/`syncState`; failure is swallowed at ~684), `packages/server/src/electiondb.ts` (event insert). Extend `packages/server/test/audit.test.ts#append integrity` style fault injection.
- Change: compute the post-append state inside the same transaction (or defer commit until state is derived) so entry, checkpoint, phase and alert rows commit or roll back together; keep publish-after-commit.
- Acceptance check: a fault injected after the entry row (before phase row) leaves no entry, no checkpoint and no event; an election_open append always has its `phase` event (SSE resume test in `events.test.ts` still green).
- Hours: 4-7.
- No owner decision: NOTES document the gap as a deviation from the spec text (QV-28-REQ-005 Must); no wire change.

### 6. Disk-full and log-size guard tests plus the 5% rule (QV-28-REQ-016, QV-29-REQ-018)
- Files: `packages/server/src/election.ts:706-714`, `packages/server/src/config.ts:231` (`minFreeBytes`), new test `packages/server/test/disk-guard.test.ts` (tests currently set `minFreeBytes: 0` in `helpers/world.ts:97`).
- Change: add a fractional free-space check (free < 5% of volume) and a test seam for `statfsSync`; no change to the existing absolute floor.
- Acceptance check: with the seam reporting low space an append returns 507 `LOG_FULL`, reads and exports still return 200, the log verifies after space returns; `maxLogBytes` overrun returns 507 with the board unchanged.
- Hours: 3-5.
- No owner decision: spec states both numbers (500 MiB and 5%) explicitly.

### 7. IPv6 rate-limit buckets at /56 (N-32(a), QV-29-REQ-003)
- Files: `packages/server/src/ratelimit.ts:100-135` (`v6Prefix64`; the inline comment says "coarser than the spec's /56" but /64 is finer, so one /56 holder gets 256 buckets), `packages/server/test/audit.test.ts#SRV-002`, `packages/server/NOTES.md` line "Bucket for IPv6 is /64".
- Change: group on the first 56 bits and fix comment and NOTES; keep address expansion for compressed forms.
- Acceptance check: two addresses in the same /56 but different /64 share a bucket; addresses in different /56 do not; compressed and expanded spellings agree.
- Hours: 2-3.
- No owner decision: DECISIONS-2026-11-04 N-32 option A approves (a) as "pure spec-following engineering"; QV-29-REQ-003 and docs/09 fix /56.

### 8. Invite hardening: 160-bit codes, 30-day cap, default TTL, uniform unknown/used (B2-10 option A)
- Files: `packages/server/src/app.ts:493-515` (invite generation, `randomBytes(16)`, optional `expires_at`), `:549-575` (failure codes), `packages/server/test/negative.test.ts#invite codes`.
- Change on issuing side only: 20 random bytes, default `expires_at` 14 days, reject `expires_at` beyond 30 days, unknown code answers like used. Do not change the registration request fields, the `QV-INVITE-v1` hash input or the PoP bytes (B3-01 stays untouched; keep code length within the existing 22-64 char validator).
- Acceptance check: tests for code length, TTL default/cap, identical status+code for unknown vs used, idempotent same-key retry still returns the voter id.
- Hours: 4-6.
- No owner decision: B2-10 option A approved in QV-ADR-027 (TTL from QV-02-REQ-010, 160 bits from QV-29-REQ-008).

### 9. Open archived and imported election databases read-only (QV-28-REQ-015)
- Files: `packages/server/src/election.ts:171-186` (`ElectionRuntime.open` always opens read-write), `packages/server/src/electiondb.ts:262-264` (`readOnly` param exists), `packages/server/src/pool.ts:50-66`; tests in `packages/server/test/e2e.test.ts` (archived section) and `imports.test.ts`.
- Change: pass `readOnly: true` when registry state is ARCHIVED/IMPORTED (after `finalizeArchive` re-open) and skip migrate/pragma writes accordingly; keep retention sweep and delete working.
- Acceptance check: a direct SQL write against the opened handle of an archived or imported election throws; reads, export, SSE, delete and retention purge continue to work.
- Hours: 4-6.
- No owner decision: spec says "shall be read-only unless a maintenance command is invoked"; no wire or schema change.

### 10. Pre-migration backup and migration tests (QV-08-REQ-031, QV-28-REQ-010)
- Files: `packages/server/src/db.ts:94-110` (`migrate`), `packages/server/src/controldb.ts:14`, `packages/server/src/electiondb.ts:7`; new `packages/server/test/migrations.test.ts`.
- Change: before applying any pending migration to an existing DB, take an online `backup` next to it; assert log root and checkpoint rows are identical before and after. Tests build DBs at each prior `user_version` (fixtures generated from the earlier migration SQL in code) and open them with the current code.
- Acceptance check: opening a version-N DB creates a backup file, ends at the latest version, `log_entry`/`checkpoint` rows unchanged, checksum mismatch still refuses start.
- Hours: 5-8.
- No owner decision: both spec rows are Must and fully specified; no schema or format change.

## Suspected defects (not fixed; each needs a failing test before fixing)

| # | file:line | Description | One-line repro idea |
|---|---|---|---|
| D1 | `packages/server/src/election.ts:127-129`, `:633-637`; `packages/board/src/log.ts:141` | Keyless runtimes (archived, imported) sign duplicate/replay receipts with a zero-seed key (B2-12). | Import a bundle, POST a stored entry's bytes; verify the receipt signature under the zero-seed public key. |
| D2 | `packages/server/src/app.ts:100-105,111-115,480` | `instance_admin` passes org checks, so an admin key can create elections, edit drafts and mint invites in any org (QV-12-REQ-003). | Sign `POST /elections/:id/invites` with a registered admin key for an election of another org; expect 201. |
| D3 | `packages/server/src/app.ts:552-575` | Registration answers differ for unknown/revoked (422 INVITE_EXPIRED), used (409 INVITE_USED) and existing key (409), giving an invite-state oracle (B2-10). | Register with a fresh random code vs a used code and compare status/code. |
| D4 | `packages/server/src/app.ts:493-497` | Invite codes are 128-bit (spec QV-29-REQ-008: 160-bit); `invite_id` is base64url lowercased and padded with `a`, reducing id entropy (ids are not secret). | Issue invites and check decoded code length (16 bytes). |
| D5 | `packages/server/src/ratelimit.ts:111,132` | IPv6 buckets use /64 not /56 and the inline comment claims the opposite; one /56 holder gets 256 buckets (N-32a). | Send from two /64s inside one /56 and observe separate buckets. |
| D6 | `packages/server/src/kek.ts:8-18`; `packages/server/src/app.ts:66` | The KEK file lives in the same data dir as the databases, so a data-dir copy (or any backup of it) carries the key that unseals DEKs, labels, contacts, webhook secrets and log keys; envelope encryption gives no at-rest protection against disk theft. Custody is an owner/ops decision, so only flagged. | Copy the data dir to a new host; unseal an invite `label_enc` with the copied `kek.bin`. |
| D7 | `packages/server/src/controldb.ts` (webhook_outbox), `packages/server/NOTES.md` line "Flagged, not changed" | `webhook_outbox.body` stores the public P0 payload in the control DB, contrary to QV-28-REQ-019 (owner choice pending). | Create a hook, trigger a delivery to a failing endpoint, read `webhook_outbox.body`. |
| D8 | `packages/server/src/election.ts:171-186`, `packages/server/src/pool.ts:50-66` | Archived/imported DBs are opened read-write; `finalizeArchive` makes them read-only only in application logic (QV-28-REQ-015). | Open an archived election runtime and run `edb.db.exec('INSERT ...')`. |
| D9 | `packages/server/src/election.ts:657-690` | Phase/alert events written in a separate transaction after the append; a crash between loses a phase event (documented) and an `apply`/`syncState` failure after commit returns an error for a durable entry. | Inject a throw in `syncState` after the append transaction and observe error response with entry present. |
| D10 | `packages/server/src/election.ts:591-606` | The idempotent-replay branch compares only header bytes, before any signature/body check; a request with a stored header and a garbage body returns 200 with the original receipt. Impact low (receipts are public). Unverified whether the header commits to the body hash. | Re-POST a stored header with an arbitrary body and compare to the 200 duplicate response. |
| D11 | `packages/server/src/election.ts:608-621` | Per-key ballot interval and hourly tokens are consumed before phase/validation checks, so a malformed or wrong-phase attempt by a roll key burns that voter's 10 s interval (self-DoS only). | Send an invalid ballot then a valid one within 10 s from the same key; second returns 429. |
| D12 | `packages/server/src/pool.ts:104-114` | `remove` drops the wrapped DEK, then deletes files; a crash between leaves orphan sealed files with no registry row (harmless to secrecy, but not cleaned up). | Throw inside `rmSync` after `markDeleted` and list the data dir. |
| D13 | `packages/server/src/app.ts:189-200` | `/readyz` only probes control DB writability; it does not reflect quarantined or unopenable elections, disk-full, or backup age (QV-31-REQ-005 semantics). | Quarantine an election, then call `/readyz`; expect 200. |
| D14 | `packages/server/src/http.ts:242`, `packages/server/src/ratelimit.ts:127-132` | Behind loopback (onion service) every client resolves to one bucket (`127.0.0`), so unauthenticated limits are shared across all users unless `bucketHeader` is set. | Two clients via 127.0.0.1 exhaust one shared `writePre` bucket. |
