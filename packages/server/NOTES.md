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

## Not implemented (known gaps)
SSE `/events`, webhooks, `/imports`, jobs, `/admin/*`, gossip endpoint, `Range` on export, OpenAPI/JSON-Schema generation,
proof-of-work challenges and L0-L3 load levels (queue shedding via `maxVerifyQueue` -> 503 BUSY exists), worker-thread proof
verification (verification runs on the event loop under a per-election mutex), `merkle_node` table and `rebuild-projections`
command (tree is rebuilt from leaf hashes at open), encrypted backups, scheduled integrity checks, TLS termination, per-org quotas
beyond election/voter counts, `witness` / `event` tables (cosignature lines live in the stored checkpoint note).
