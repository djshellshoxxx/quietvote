# Product gap tasks (decision-free, bounded) and suspected defects

Snapshot `the ab84f16 snapshot`. None of these touch HELD B3-01 (registration wire contract) or D-92..D-96, protocol encodings, vectors, or verdict semantics. Hours are rough single-engineer estimates.

## Tasks

### T1. Render manifest warnings in the web UI (eligibility/privacy; QV-03-REQ-012, QV-02-REQ-032, QV-06-REQ-010)
- Files: `packages/web/src/ui/app.ts` (election overview and rules view, organizer preview), `packages/web/src/flow/election.ts:157` (already carries `warnings`), `packages/web/src/i18n/en.ts` plus the five catalog tables, `packages/web/test/` (new `warnings.test.ts`).
- Acceptance: for manifests with roll<8, t=1, t<floor(n/2)+1, n-t<ceil(n/3) the overview and organizer preview show a visible message per `W-*` code; test builds those four manifests through `validateManifest` and asserts each string is rendered; `npm run i18n:check -w @quietvote/web` stays green.
- Hours: 6-8.
- Why no decision: the strings are specified (docs/06:167 M1; docs/03 section 4); warning codes are already produced and frozen. Translations are added as untranslated placeholders, never marked reviewed.

### T2. Result-page disclosure warnings for small roll and unanimous options (privacy; QV-07-REQ-017)
- Files: `packages/web/src/ui/app.ts` (results view near line 707), `packages/web/src/flow/election.ts`, `packages/web/src/i18n/en.ts` and catalogs, new `packages/web/test/disclosure.test.ts`.
- Acceptance: roll<10 shows "Results may reveal individual votes"; any option with 0 or all counted votes shows the unanimous-result sentence from docs/07:539; unit test over synthetic tallies; no change to tally or verifier.
- Hours: 5.
- Why no decision: exact warning thresholds and wording are given in QV-07-REQ-017; this is display-only.

### T3. Server eligibility and duplicate-vote property test (QV-04-REQ-007/008, QV-02-REQ-041)
- Files: new `packages/server/test/eligibility-property.test.ts` using `packages/server/test/helpers/world.ts` and `full.ts`.
- Acceptance: seeded random sequences of (non-roll key, roll key with wrong ctx, bad supersedes, duplicate code, over-limit, post-close) ballots are all rejected with an expected error code and leave `GET /log/checkpoint` size and `voters/:kid` ballot_count unchanged; accepted sequences produce counted set equal to a reference "latest valid per voter" model and `verifyElection` PASS. Run with `node --test packages/server/test/eligibility-property.test.ts`.
- Hours: 8.
- Why no decision: test-only; asserts existing behaviour (election.ts:1033-1040).

### T4. Protocol-level random revote/single-mode counting property test (QV-04-REQ-008, QV-07-REQ-025)
- Files: new `packages/protocol/test/revote-property.test.ts` (reuse `test/helpers/sim.ts`).
- Acceptance: for random per-voter chains including forks, spoils-then-cast, limit overruns and max_per_voter=1, `analyzeBallotLog` counted set equals an independent reference; same corpus checked against `verifier-py` via a generated bundle in `verifier-py/tests` only if cheap, otherwise TS only.
- Hours: 6.
- Why no decision: strengthens existing coverage; no semantic change.

### T5. Idempotent resubmission survives restart (duplicate vote; QV-02-REQ-045)
- Files: new `packages/server/test/idempotency-restart.test.ts`.
- Acceptance: submit ballot, stop and reopen the server on the same data dir, replay identical bytes: original receipt returned, log size unchanged, `casts` count not incremented (a following revote still allowed up to max_per_voter).
- Hours: 4.
- Why no decision: asserts documented behaviour (election.ts:590-601, server NOTES "replay").

### T6. Machine-readable data inventory and CI column check (privacy; QV-06-REQ-001)
- Files: new `docs/data-inventory.json`, new `packages/server/test/data-inventory.test.ts`; reads columns from `packages/server/src/controldb.ts` and `electiondb.ts` schemas via `PRAGMA table_info`.
- Acceptance: every table.column in control.sqlite and the election DB appears with a class from docs/06:22-31; adding an unlisted column makes the test fail (include a negative fixture test).
- Hours: 6.
- Why no decision: classes are already tabulated in docs/06 section 3.2; this records them.

### T7. Privacy marker-scan test for server stores and export (QV-06-REQ-003/017, QV-02-REQ-047)
- Files: new `packages/server/test/privacy-markers.test.ts` (extend the pattern in `negative.test.ts#privacy`).
- Acceptance: issue invites with canary label/contact, register, vote, close, export; scan every file under the data dir, logs, `export.qvb` and `export.json` for the raw invite code, canary label/contact (after retention), secret keys and plaintext selections; none found; export contains no invite rows.
- Hours: 5.
- Why no decision: test-only on existing guarantees.

### T8. Outbound-connection guard test (privacy; QV-06-REQ-015)
- Files: new `packages/server/test/egress.test.ts`.
- Acceptance: with no webhooks and no gossip peers configured, a full e2e election makes zero outbound `net`/`tls`/`dns` calls (stub `node:net` connect and `node:dns` lookups); with one webhook configured only that validated target is contacted.
- Hours: 4.
- Why no decision: asserts documented behaviour (server NOTES "Gossip", "SSRF policy").

### T9. Lifecycle model test over the log-driven state machine (QV-03-REQ-004)
- Files: new `packages/server/test/lifecycle-model.test.ts`, reading `packages/server/src/lifecycle.ts` (`transition`, `typeAllowed`, `effectiveState`, `TERMINAL`).
- Acceptance: seeded random event sequences never reach a state outside the declared graph; terminal states accept nothing; every (state, entry type) pair rejected by `typeAllowed` is also rejected by `POST /log/entries` with `WRONG_PHASE`-class error and no append (sample 50 pairs); STALLED derived only after `stalledMaxSec` and still accepts `tally_result`.
- Hours: 6.
- Why no decision: pins current graph (lifecycle.ts:12-62); does not change CHALLENGED or extension semantics.

### T10. Pause/resume lifecycle integration test (lifecycle; QV-02-REQ-062, QV-07-REQ-081)
- Files: new `packages/server/test/pause-resume.test.ts`.
- Acceptance: coordinator m-of-k `pause` moves OPEN to PAUSED and ballots answer `WRONG_PHASE`; `resume` restores OPEN; `maxHalts`+1 pause answers 409 conflict; operator-only or single-of-m signatures are refused; `invalidate` ends in INVALIDATED. Does not assert close-time extension (not implemented, N-32).
- Hours: 5.
- Why no decision: exercises existing code only; B3-06 (web PAUSED handling) is not touched.

## Suspected defects (not fixed; repro ideas)

1. Manifest warnings computed but never shown in web. `packages/web/src/flow/election.ts:157` stores `warnings`; no reader in `packages/web/src/ui/`. Repro: publish a 5-voter, t=1 election via web; open overview and organizer preview; no W-SMALL-ROLL / W-NO-THRESHOLD text (`grep -rn "warnings" packages/web/src` shows no UI consumer). Same effect hides QV-06 M1.
2. `qv.key.mustBackup` ("Blocks the ballot until a backup exists") is defined at `packages/web/src/i18n/en.ts:138` and referenced nowhere outside catalogs. Repro: create a key in the web flow, skip download/recovery code, proceed to vote: nothing blocks (QV-04-REQ-006 / QV-02-REQ-011).
3. No default invite expiry. `packages/server/src/app.ts:491` leaves `exp = null` unless `expires_at` is supplied (spec default 14 d). Repro: `POST /elections/:id/invites {count:1}` then `GET /invites`: `expires_at: null`. Owner decision B2-10 covers expiry default; flagged, do not change without it.
4. Registration oracle: unknown/revoked/expired codes answer 422 `INVITE_EXPIRED` while a used code answers 409 `INVITE_USED` (`app.ts:564-575`), contradicting QV-04-REQ-004 uniform response; no timing test. Repro: register with a used code and an unknown code, compare status/code (B2-10 decision also covers this).
5. Manifest validation accepts n=1, t=1 and t<floor(n/2)+1 with warnings only (`packages/protocol/src/manifest.ts:144-145`, `schema.ts:222`: n,t in 1..32). QV-07-REQ-011 says reject t<2 unless single-trustee-degraded; QV-02-REQ-032 says n<=15. Repro: feed `validateManifest` a manifest with n=1,t=1: `ok` with W-NO-THRESHOLD. Fix is a protocol/verdict change, needs owner and security review.
6. Server vs protocol bound mismatch: protocol schema allows `max_per_voter` up to 1000 (`schema.ts:222`) but server rejects >20 (`election.ts:911`), so a manifest the verifier accepts cannot be admitted by the server. Repro: manifest with max_per_voter=21 through `PUT /draft`.
7. Server STATIC_CSP lacks `require-trusted-types-for 'script'` (`packages/server/src/http.ts:110`) which QV-07-REQ-052 lists; only the page meta tag and `_headers` carry it. The built `_headers` also declares `report-uri /csp-report` (`packages/web/src/build/site.ts:32`) with no server route. Repro: `curl -I` a static page; request `/csp-report`.
8. Ballot timing leak: header `created_at` is the client clock to the second (`packages/web/src/flow/entries.ts:32`) and `sequenced_at` exact (`packages/board/src/log.ts:127`); QV-06-REQ-009 wants 60 s rounding. Repro: cast two ballots 10 s apart and compare header timestamps in `GET /log/entries`.
9. Attestation not on the board: trustee `destroy` writes `*.attestation.json` locally only (`packages/trustee/src/trustee.ts:930`), though `key_destruction` entry type exists (`packages/board/src/entry.ts:13`); verifier never flags missing attestations (QV-06-REQ-006, QV-07-REQ-015). Repro: run destroy, then export the election and search for a `key_destruction` entry.
10. Pause does not extend voting close and verifier never applies pause (`packages/protocol/src/logcheck.ts:481-514`, V13 `not_run`); QV-02-REQ-062 / QV-03-REQ-009 expect extension. Known gaps N-13, N-32, X-32; listed so the status doc does not count halt as complete.
11. Math.random used where QV-07-REQ-018 bans it by lint: `packages/trustee/src/fsutil.ts:9` (temp file suffix) and `packages/web/src/net/sse.ts:241` (backoff jitter). Not secret-bearing; no lint rule exists to keep it so.
