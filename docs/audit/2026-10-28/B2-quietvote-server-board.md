# B2 audit: server, bulletin board, trustee tooling, CLI (QuietVote)

**AI-assisted review, not an independent professional audit.** QuietVote is labelled unaudited and not for real elections; nothing in this
report says otherwise. Absence of a finding in an area means only that this review did not find one in the time available.

## 1. Scope, SHA and what was reviewed

* Repository `djshellshoxxx/quietvote`, SHA `424110d90e23dc443aa4498a4340973d3c8cb8b6` (merged head of PR #18's branch), detached worktree
  `/home/user/audit/quietvote-b2`. Auditor ID **B2**. Date 2026-10-28.
* Code read in full: `packages/server/src/*` (http, auth, app, election, electiondb, controldb, db + inline migrations, config, admin, ext-routes,
  imports, gossip, webhooks, ssrf, sse, export, tar, static, range, pool, jobs, ratelimit, records, lifecycle, logger, kek, problem, util, env),
  `packages/board/src/*`, `packages/trustee/src/*`, `packages/cli/src/*`; tests of these packages read as evidence.
* Read where they gate server/trustee/CLI decisions (not audited, B1 scope): `protocol` `validateManifest`, `adjudicateDkg`, `aggregate`,
  `buildTally`/`decryptAggregates`, `analyzeBallotLog`, `witnessAnchors`; `crypto` `dlog`.
* Specs used: QV-09, QV-04, QV-17, QV-18, QV-06, QV-26, QV-28, QV-29, QV-31, QV-12, QV-03 §5.5, QV-16 §5.7/§5.14.3, QV-07 (A3), decision log
  ADR-014..024, `docs/plan/TODO.md` Done rows, `docs/plan/COMPLETION.md`, `docs/24-traceability-matrix.md` (it holds no per-requirement
  status yet, so Must items of the in-scope specs were checked directly).
* Prior audits checked: in-tree `docs/audit/README.md`, `web-*.md`, `docs/reports/security-review-2026-10-21.md` (SR-1..5); unmerged
  branches: server (SRV-001..014, PR #9), board-cli (BC-01..15, PR #11), trustee (TR-01..09, PR #8/#17), crypto-protocol (CP-01..08, PR #10),
  QA handoff (PR #6), spoil wiring (PR #14), dependencies (DEP-01..04). Known items are labelled `KNOWN <id>` below.

## 2. Method

1. Baseline: `npm ci --ignore-scripts`, `npm run typecheck`, per-package `node --test` for board, cli, trustee, server (all green, section 8).
2. Manual reading of every in-scope source file against the focus list (authN/authZ, invites/registration, replay/idempotency, lifecycle,
   transactions/concurrency, board append-only/STH/equivocation, linkage via logs/ordering/stored fields, DoS, validation, webhooks/SSRF,
   migrations, trustee custody and file handling, stale docs).
3. Every finding below marked CONFIRMED has a proof-of-concept test that **asserts the current (defective) behaviour** and passes at this SHA,
   so it will fail once the defect is fixed. PoC files (left in place as evidence; they are picked up by the package `test` globs):
   * `/home/user/audit/quietvote-b2/packages/server/test/b2-audit-poc.test.ts` (test titles carry the finding IDs: B2-01..07, B2-09..14, KNOWN SRV-001/002/003)
   * `/home/user/audit/quietvote-b2/packages/server/test/b2-fixtures/srv001-child.ts` (plain server process for the SRV-001 crash)
   * `/home/user/audit/quietvote-b2/packages/trustee/test/b2-audit-poc.test.ts` (B2-08, KNOWN TR-01/CP-01)
   * `/home/user/audit/quietvote-b2/packages/cli/test/b2-audit-poc.test.ts` (KNOWN BC-01, BC-04, BC-05 status)
   * `/home/user/audit/quietvote-b2/packages/board/test/b2-audit-poc.test.ts` (KNOWN BC-09, BC-10 status)
4. Known items from unmerged branches were checked for presence at this SHA by code inspection, and by a PoC where the item is High or
   was claimed fixed in-tree (SRV-001, TR-01).
5. Synthetic data only (generated keys, `example.invalid` contacts, labels "Synthetic member A/B"); no network beyond loopback.

## 3. Findings table

New findings first (B2-xx), then known items whose fixes are not in this SHA.

| ID | Sev | Confidence | Category | Spec IDs | file:line (SHA 424110d) | Summary |
|---|---|---|---|---|---|---|
| B2-01 | High | CONFIRMED | DoS / availability | QV-29-REQ-019, QV-29-REQ-001, QV-09 §13 | `packages/server/src/app.ts:410-421`; `election.ts:1041-1058,1150-1161`; `protocol/src/tally.ts:224-228` | Anonymous `GET /elections/{id}/tally/draft` recomputes the whole homomorphic aggregate (and after any restart/eviction the full proof-verifying ballot analysis) synchronously on the single event loop on every call; 2,000 counted ballots = 5.5-6.9 s stall of the whole instance per request; available for as long as the election is stored once its tally aggregate is posted (TALLYING, STALLED, AUDIT, ARCHIVED, IMPORTED mirrors). |
| B2-02 | Medium | CONFIRMED | DoS / availability | QV-29-REQ-019, QV-18-REQ-033, QV-09 §10 | `server/src/imports.ts:196,323`; `ext-routes.ts:107-111`; `NOTES.md:144` | `POST /imports` runs `verifyElection` (every proof) on the event loop (≈130-220 ms stall per ballot entry measured) and checks `ELECTION_EXISTS` only after full verification, so the same valid bundle can be re-submitted to stall the instance repeatedly; any org key may import and the default `registrationMode` is `open`. NOTES claims the job "yields to the event loop". |
| B2-03 | Medium | CONFIRMED | AuthN/AuthZ | QV-08-REQ-019, QV-12 §5 (no support override), QV-09 §3.6, ADR-001 | `server/src/app.ts:69`; `controldb.ts:236-238`; `app.ts:265-276` | An `instance_admin` key, once seeded, can never be revoked: removing it from `adminKeys` leaves it active (no API path revokes admin keys). PoC: after removal and restart the key still gets `200 /admin/status` and mints an `org_owner` key in a foreign org. |
| B2-04 | Medium | CONFIRMED | Board / witness integrity | QV-18-REQ-020, QV-18-REQ-023, QV-18 §9.4, QV-18-REQ-053 | `server/src/app.ts:62,67`; `election.ts:254-256,890,1098`; `admin.ts` `clearQuarantine` | The live server evaluates witness quorum with the operator's `witnesses` config and ignores manifest `bb.witnesses`: the manifest witness's cosignature is dropped, an operator key under the same name satisfies the `election_open` gate, the aggregate gate, `/state` (`witnessed:true`, `integrity:ok`) and quarantine clear. |
| B2-05 | Medium | CONFIRMED | AuthZ / lifecycle | QV-ADR-022 (k-of-m), QV-12-REQ-003, T-100 | `server/src/election.ts:741-746,897-930`; `records.ts:33` | Control records (`pause`/`resume`/`security-notice`) carry no freshness binding: any single earlier signer re-posts an old m-of-k record in a new entry header. PoC: one coordinator re-pauses an OPEN election alone (ballots then 409). |
| B2-06 | Medium | CONFIRMED | Lifecycle / conformance | QV-03 §5.5 ("No early close"), QV-16 §5.14.3, T-100 | `server/src/election.ts:837-844` | `election_close` is accepted at any time in OPEN/PAUSED; PoC closes 7.5 days before `voting_close` (`201`). The server checks time for `election_open` and ballots but not for close. |
| B2-07 | Medium | CONFIRMED | Board / equivocation | QV-18-REQ-012, QV-18-REQ-053, QV-12 §7 (restore integrity), QV-28-REQ-011 | `server/src/election.ts:128-166`; `board/src/log.ts:51-80`; `admin.ts` `backupWork` | Restoring an older election DB (for example an `/admin/backups` copy) is not detected; the server keeps appending and signs a second, different root for a size it already signed (valid fork evidence against its own log key), `integrity: ok`. The REQ-053 guard exists only via optional gossip peers (default off). |
| B2-08 | Medium | CONFIRMED | Trustee custody | QV-17-REQ-070, QV-17 §11.2, QV-06-REQ-006, ADR-013 | `trustee/src/trustee.ts:759,824`; `cli.ts` `guardOut` | `backup --to` stores the path verbatim; `destroy` later resolves it against the current directory: the real sealed backup survives untouched while the tool reports `backups_removed` and writes a signed destruction attestation, and an unrelated same-named file in the cwd is overwritten and unlinked. |
| B2-09 | Low | CONFIRMED | Abuse / quotas | QV-29 §6.4, QV-29-REQ-010 | `server/src/app.ts:459` | The invite cap compares registered voters (`voterCount() + n > 2 x maxVotersPerElection`), not invites: 24 live invites for a cap of 2 voters; invite rows are unbounded per organizer (60 manage requests/min x 1000). |
| B2-10 | Low | CONFIRMED | Conformance (invites) | QV-04-REQ-004, QV-29-REQ-008, QV-09 §4.4 | `server/src/app.ts:452-456,521-529` | Invites without `expires_at` never expire (QV-04 default 336 h, QV-29 ≤ 30 d); unknown and used codes answer differently (`422 INVITE_EXPIRED` vs `409 INVITE_USED`); a used code with another already-registered key answers `201` (QV-09 §4.4 expects `409`). |
| B2-11 | Low | CONFIRMED | Privacy / retention | QV-28 §11, QV-28-REQ-013, QV-06-REQ-004, QV-09 §7.1, T-099 | `server/src/electiondb.ts:388-395`; `app.ts:446-470,499` | P2 invite data is never purged except the contact of a registered invite: labels kept after registration and revocation, contacts kept after revocation, nothing at `election_open + 7 d`; contacts are accepted and stored although delivery is not supported. |
| B2-12 | Low | CONFIRMED | Board / receipts | QV-18-REQ-013 | `server/src/election.ts:142,577-581`; `board/src/log.ts:141` | IMPORTED mirrors (and, by code, ARCHIVED elections after a restart, whose keys are erased) answer a resubmitted entry with a receipt signed by the all-zero-seed placeholder key, so the receipt never verifies under the log key (false broken-promise alarms for clients that retry). |
| B2-13 | Low | CONFIRMED | Linkage (ordering) | QV-28 §8.2 unlinkability note, QV-04 §4.2 | `server/src/electiondb.ts:410-412`; `app.ts:539-550` | The anonymous `GET /roll` lists voters in enrolment order (`ORDER BY rowid`, also after `roll_commit`), defeating the hour-rounding of `registered_at`: anyone who knows when a person enrolled maps them to their voter key. |
| B2-14 | Low | CONFIRMED | Validation / cache | QV-09 §8 (`POST /cosignatures` 403/422, `rejected[]`), QV-09 §13 | `server/src/app.ts:713-727` | Junk cosignature lines get `200 {accepted:[], rejected:[]}` and still bump the export generation, invalidating the `.qvb` cache (anonymous class-G request). `rejected` is always empty. |
| B2-15 | Medium | CONFIRMED | Conformance (status inflation) | COMPLETION C5, QV-24 honest-status rule | `docs/audit/README.md:13,20`; `packages/server/NOTES.md:50,74,80,144`; `server/src/ratelimit.ts:105` | The in-tree audit index lists SRV-001 (High) as fixed and CP-01/TR-01 plus the server trustees-mode spoil endpoint as closed; none of those fixes is in this SHA and PoCs show SRV-001 and TR-01 present. C5 still partly open; new inaccurate statements (import "yields to the event loop"; "/64 coarser than /56 ... never finer" is inverted). |
| B2-16 | Low | LIKELY | Telemetry / conformance | QV-31-REQ-001, QV-31-REQ-008, QV-31 §4.2-4.3, QV-06-REQ-007 | `server/src/logger.ts:35`; `http.ts:448-452`; `election.ts:679`; `records.ts:33` | Request logs use 1-second timestamps and fields outside the QV-31 allowlist (`election_id`, `request_id`, exact `latency_ms`, `bytes_in`, ballot `seq`); the minute rounding of the ballot `append` event is undone by the adjacent second-precision `request` line. Control records carry free-text `reason` into the public log. |
| B2-17 | Low | LIKELY | DoS (export) | QV-09 §13 "Mass export abuse" | `server/src/app.ts:831-838` | `GET /export.json` re-parses and re-serialises the whole log on every request, including `If-None-Match` (304) and every `Range` request; only `export.qvb` is cached. |
| KNOWN SRV-001 | High | CONFIRMED | DoS (crash) | QV-29 | `server/src/http.ts:446` | Fix on unmerged PR #9. **Affected**: one unauthenticated chunked oversized request whose peer disconnects kills the server process (exit 1, `TypeError ... reading 'destroy'`). |
| KNOWN SRV-002 | Medium | CONFIRMED | Rate limiting | QV-29-REQ-003 | `server/src/ratelimit.ts:105` | PR #9 unmerged. Affected: compressed IPv6 text splits one /64 into many buckets. |
| KNOWN SRV-003 | Medium | CONFIRMED | Access control / caching | QV-09 §3.5, §4.2 | `server/src/http.ts:394`; `app.ts:631,687,702` | PR #9 unmerged. Affected: read-key protected responses are `public, max-age=31536000, immutable` with `ACAO *`. |
| KNOWN SRV-004 | Medium | LIKELY | DoS (memory) | QV-29 | `server/src/app.ts:602-624` | PR #9 unmerged. Affected: log pages up to 1000 entries without a byte cap. |
| KNOWN SRV-005/006/007 | Low | LIKELY | Robustness / SQL hygiene | QV-28-REQ-001 | `tar.ts:42-57`; `static.ts:35`; `app.ts:124` | PR #9 unmerged. Affected (code unchanged): non-strict `readTar`, SPA fallback for `/api/*`, string-built `DELETE FROM idempotency`. SRV-008..014 (info) unchanged. |
| KNOWN TR-01 / CP-01 | Medium | CONFIRMED | Ballot secrecy | QV-16 §1(e)/§5.16, ADR-020(4) | `trustee/src/trustee.ts:710-726`; `server/src/election.ts:1022-1026` | Fixes on unmerged PR #8/#10 (in-tree README says closed). **Affected**: a counted ballot re-wrapped as a trustees-mode spoil under a new code is decrypted by the relay (PoC recovers `{budget:["no"]}`); the server also admits such a spoil. |
| KNOWN TR-03 | Low | LIKELY | Trustee one-shot release | QV-17-REQ-080 | `trustee/src/fsutil.ts` (no lock) | Lock part of PR #17 unmerged; restore part mitigated in-tree by the release ledger (T2). Two concurrent processes on one bundle can still each release. |
| KNOWN TR-04 | Low | LIKELY | Trustee fork detection | QV-17-REQ-040 | `trustee/src/trustee.ts:602-604` | PR #17 unmerged. Affected: release merges into an empty log, so a fork against the imported ceremony log is not detected (log-evidence gate T1 mitigates). |
| KNOWN TR-07/TR-08 | Info/Low | LIKELY | Custody | QV-17 §11 | `trustee.ts:938`; `fsutil.ts` `shred` | Unchanged: public `debugPlaintext()`; `shred` follows symlinks (compounds B2-08). |
| KNOWN BC-01 | Medium | CONFIRMED | Verifier anchor | QV-18 §13 | `cli/src/cmd-board.ts:59-74` | PR #11 unmerged. Affected: `qv board verify` with `--author-key` but no `--log-key` exits 0 VERIFIED on a history re-signed under the bundle's own key. |
| KNOWN BC-02 / BC-04 | Medium | CONFIRMED (BC-04) / LIKELY (BC-02) | Trust anchors | QV-18 §13, QV-05 | `cli/src/cmd-board.ts:10`; `cmd-ballot.ts:39` | PR #11 unmerged. Affected: no `--witness-policy`; `ballot encrypt` cannot pin the manifest hash (`unknown option`). |
| KNOWN BC-10 | Low | CONFIRMED | Robustness | QV-30 §7 | `board/src/bundle.ts:106` | PR #11 unmerged. Affected: `verifyLog(null)` throws. |
| KNOWN DEP-01 | Low | CONFIRMED | Packaging | QV-08 D1 | `cli/package.json:23-27` | PR #15 unmerged. Affected: `@quietvote/verifier` imported but not declared. |

Fixed at this SHA (checked): SR-1..SR-4 (security review merged), TR-02 (refused as `WRONG_STATE` by T12 before any log work), TR-05
(`readSecretFile` for passphrase files), BC-03 (F2), BC-05 (F3 + strict key parsing; PoC shows no exit 70), BC-06, BC-07, BC-08, BC-09.

Counts (new B2 findings): High 1, Medium 8 (B2-02..08, B2-15), Low 8 (B2-09..14, B2-16, B2-17). Confidence: 15 CONFIRMED, 2 LIKELY.

## 4. Finding details

### B2-01 (High, CONFIRMED) Anonymous `/tally/draft` stalls the whole instance

* **Where.** `app.ts:410-421` registers `GET /api/v1/elections/:id/tally/draft` as `auth:'none'`, class R (120/min per bucket). The handler calls
  `rt.buildTallyDraft(use)` (`election.ts:1150-1161`), which calls `ensureAnalysis()` (memory-only cache; recomputed after every restart or
  LRU eviction, and verifying every ballot's proofs) and then `buildTally()`; `protocol/src/tally.ts:227` recomputes `aggregate(p, counted)`
  (2 ristretto decodes plus adds per counted ballot and option) **before** checking that enough shares exist. There is no `await`, no worker,
  no mutex: the work runs synchronously on the event loop that serves every election.
* **Scenario.** Once any election on the instance has its tally aggregate on the log (TALLYING, STALLED, AUDIT, ARCHIVED, or an IMPORTED
  mirror that carries one), an anonymous client loops `GET .../tally/draft`. Each call answers 409 (no shares) or 200, after blocking the process for ≈ counted × options × 0.5 ms.
* **Evidence.** `node --test --test-name-pattern=B2-01 test/b2-audit-poc.test.ts` (server):
  `aggregate() costs 2.659-3.344 ms per counted ballot (5 options) => ~26-33 s of synchronous CPU per anonymous request at 10,000 counted
  ballots`; `2000 counted: anonymous GET /tally/draft -> 409 after 5539-6948 ms; a GET /healthz scheduled at +50 ms completed at +5541-6950 ms`;
  `analyzeBallotLog (run by the first /tally/draft after every restart or pool eviction, not cached on disk): 116-119 ms per ballot`.
  (The PoC injects a 2,000-ballot counted set into the runtime's cached analysis; the endpoint code path is unchanged.)
* **Fix.** Serve the draft from the stored aggregate (`st.aggs` / the `tally_aggregate` entry) instead of re-aggregating; return 409 before
  any work while fewer than `t` shares are stored; cache the draft per `(decrypters, shares received)`; move analysis/aggregation/proof work
  to a worker with a bounded queue (QV-29-REQ-019); consider class P or coordinator-only access for the draft.

### B2-02 (Medium, CONFIRMED) Import verification stalls the event loop; duplicates are verified in full first

* **Where.** `imports.ts:196` `await verifyElection(electionJ)` (no macrotask yield inside protocol verification); `commitImport`
  (`imports.ts:323`) checks `electionAny(id)` only after the whole `verifyBundle`. Route `ext-routes.ts:89-121` accepts any org key;
  `config.ts` default `registrationMode: 'open'` lets anyone create an org (`POST /orgs` needs only proof of possession).
* **Scenario.** Create an org, then submit a valid large public bundle (anyone can download one from any instance's `export.qvb`, or build
  one offline) to `POST /imports` with a new `Idempotency-Key` each time; every submission stalls the instance for the full proof verification
  and then fails `ELECTION_EXISTS`. Class X allows 2 per hour per bucket (more with KNOWN SRV-002).
* **Evidence.** PoC B2-02 (server): `bundle with 6 ballot entries: first import wall 1205-1407 ms, longest event-loop stall 959-1034 ms;
  duplicate import (refused ELECTION_EXISTS) wall 980-1532 ms, stall 794-1304 ms` (`perf_hooks.monitorEventLoopDelay`). Extrapolated:
  thousands of ballots per bundle (64 MiB default cap) give stalls of many minutes per submission.
* **Fix.** Parse `election.json` and check `electionAny(manifest.election_id)` and the quota before `verifyElection`; run verification in a
  worker thread with a CPU/time budget; per-org import rate per day; correct NOTES.md:144.

### B2-03 (Medium, CONFIRMED) Admin keys are irrevocable

* **Where.** `app.ts:69` seeds `cfg.adminKeys` with `ControlDb.seedAdmin`, which inserts when absent (`controldb.ts:236-238`) and never
  revokes. `DELETE /orgs/:org/keys/:keyid` (`app.ts:265-276`) requires `k.org_id === org`, and admin keys have `org_id NULL`, so no API can
  revoke them either. `keyById` treats the row as valid until `revoked_at` is set.
* **Scenario.** An operator removes a suspected-compromised admin key from the configuration and restarts. The key keeps `instance_admin`:
  it can add `org_owner` keys to any organization (then publish manifests, read invite labels, delete elections, register webhooks), run
  backups, clear quarantines and delete elections.
* **Evidence.** PoC B2-03: `after removal from adminKeys: GET /admin/status -> 200; POST /orgs/<org>/keys (org_owner) -> 201`.
* **Fix.** At start, set `revoked_at` for every `instance_admin` key not in `adminKeys` (configuration is authoritative) and write an
  `operator_audit` row; document the rotation procedure.

### B2-04 (Medium, CONFIRMED) Server witness policy comes from operator config, not the manifest

* **Where.** `app.ts:62,67` builds the only `WitnessPolicy` from `cfg.witnesses`; `ElectionRuntime.witnessPolicy()` (`election.ts:254-256`)
  uses it for `witnessInfo`, `witnessedWithin` (open gate `:702`, aggregate gate `:1072`), cosignature intake (`:1098`, lines not verifying
  under config keys are dropped) and `clearQuarantine`. `vManifest` (`:890`) only compares the quorum with the number of configured
  witnesses; manifest `bb.witnesses` (names and keys, QV-18-REQ-020) is never consulted.
* **Scenario.** Manifest names witness `w1` with key W; the server is configured with `w1` = key O (operator). W's cosignature is discarded;
  O's cosignature opens the election, triggers the aggregate, yields `witnessed:true`/`integrity:ok` and can clear a rollback quarantine.
  Verifiers and trustees (manifest policy) see "not witnessed", so trustees refuse release unless overridden: honest-operator
  misconfiguration stalls the tally, and a dishonest operator self-witnesses the server-side gates.
* **Evidence.** PoC B2-04: `manifest witness cosig accepted=[]; operator key accepted=["w1"]; open=201; manifest-policy witnessed=false`.
* **Fix.** When the manifest lists `bb.witnesses`, derive the election's policy from it (names and keys); refuse a manifest whose witnesses
  are not configured with identical keys (or accept their cosignatures regardless of config); use the same policy in `clearQuarantine`.

### B2-05 (Medium, CONFIRMED) Single-coordinator replay of m-of-k control records

* **Where.** `multi()` (`election.ts:741-746`) checks m valid coordinator signatures over the record body and that the entry author is one of
  the signers. The control body (`records.ts:33`: `{proto, type:'control', action, reason?}`) has no sequence or nonce, and nothing rejects a
  body that was already posted. `vNotice` (`:897-930`) checks only the current state and `maxHalts`.
* **Scenario.** Coordinators A and B (m = 2) pause and later resume an election. A alone wraps the old `pause` record in a new entry header:
  accepted, election PAUSED, ballots refused; A or B alone can likewise replay `resume`. Up to the server's `maxHalts` (default 3).
* **Evidence.** PoC B2-05+B2-06: `solo pause -> 422 E_SIG; replayed 2-of-3 pause -> 201; ballot while paused -> 409`.
* **Fix.** Bind control bodies to the state they act on (for example `after_seq` = seq of the current phase entry, or a unique nonce) and
  reject a control body whose JCS bytes are already on the log. This needs a spec definition (spec gap G-17).

### B2-06 (Medium, CONFIRMED) Early close accepted

* **Where.** `election.ts:837-844` validates the `election_close` marker's signatures only; no time check (compare `election_open`
  `:834` and ballots `:992-997`). No other path enforces QV-03 §5.5.
* **Scenario.** m coordinators close the election days before `voting_close`; voters who planned to vote later are disenfranchised. With
  `witness_quorum = 0` the verifier only reports times as unwitnessed; with a quorum the verifier fails the election (sabotage path).
* **Evidence.** PoC B2-05+B2-06: `election_close accepted 7.5 days before voting_close`. (The repository's own `fullElection` test helper relies on it.)
* **Fix.** Reject `election_close` while `now < voting_close - clock_skew_s` (cancel remains the early-termination path).

### B2-07 (Medium, CONFIRMED) Restored DB is not detected; server signs a fork

* **Where.** `ElectionRuntime.open`/`BoardLog` constructor (`election.ts:128-166`, `board/src/log.ts:51-80`) only check the DB against its own
  stored checkpoints, which a restore rolls back as well. No high-water mark is kept outside the election DB; the REQ-053 guard is only fed
  by optional `gossipPeers` (default none, `gossipIntervalMs` 0). `POST /admin/backups` produces exactly such restorable copies.
* **Scenario.** The operator restores yesterday's election DB after a disk problem. The server appends new entries at sequence numbers it
  already signed; voters' receipts and witnesses' cosigned heads now prove the log key equivocated; the election cannot be trusted.
* **Evidence.** PoC B2-07: `restored DB accepted (integrity=ok); second checkpoint for size 2 signed; checkFork ok=true`.
* **Fix.** Persist the last signed `(size, root)` per election in `control.sqlite` (and ideally a witness/mirror poll at start, QV-18-REQ-053);
  refuse to sign or append when the election DB is behind or inconsistent, quarantine, and require `quarantine/clear` with evidence.

### B2-08 (Medium, CONFIRMED) Trustee `destroy` misses relative-path backups and shreds the wrong file

* **Where.** `Trustee.backup` records `{ path: dest }` verbatim (`trustee.ts:759`); `destroy` shreds `b.path` (`:824`) relative to the
  process cwd. `fsutil.shred` follows symlinks (KNOWN TR-08). `guardOut` uses the same relative paths.
* **Scenario.** `qv-trustee backup --bundle /x/share.qvtb --to share-backup.qvtb` in `/x`; weeks later `destroy` is run from another
  directory. The sealed backup containing the share survives; the attestation says the share was destroyed (ADR-013 long-term secrecy);
  a file named `share-backup.qvtb` in the current directory is overwritten with random bytes and deleted.
* **Evidence.** PoC B2-08 (trustee): `backups_removed:["share-backup.qvtb"]; real backup still present: true; unrelated file present: false`.
* **Fix.** Store `resolve(dest)` (and realpath) at backup time; before shredding, `lstat` (no symlinks) and check the file is this share's
  bundle (magic + a header id stored at backup); report "not found / not a bundle" otherwise.

### B2-09 (Low, CONFIRMED) Invite quota counts voters

`app.ts:459`: `voterCount() + n > maxVotersPerElection * 2`. PoC B2-09: `maxVotersPerElection=2, invites created=24`. Fix: count
`voter_invite` rows in `issued|sent` (and cap total rows per election).

### B2-10 (Low, CONFIRMED) Invite lifetime, oracle and idempotency semantics

`app.ts:452-456` stores `expires_at = null` unless given; `:522-528` distinguishes unknown (`422 INVITE_EXPIRED "not valid"`) from used
(`409 INVITE_USED`); `:526-527` answers `201` for any registered key on a used code. PoC B2-10: `unknown -> 422 INVITE_EXPIRED; used -> 409
INVITE_USED; +400d -> 201; cross-invite replay -> 201`. Fix: default TTL from the rules (QV-04: 336 h; QV-29-REQ-008: ≤ 30 days; owner to
pick, spec gap G-10); one generic failure for unknown/used/expired/revoked; decide the §4.4 semantics (spec gap G-12).

### B2-11 (Low, CONFIRMED) P2 invite data retention not implemented

QV-28 §11 says `voter_invite.contact_enc`, `label_enc` are NULLed 7 days after registered/revoked/expired or `election_open`. Code NULLs only
`contact_enc` on registration (`electiondb.ts:393`); revocation (`:388-390`, `app.ts:499`) keeps both; no job exists. Contacts are accepted
although `deliver` is refused (`app.ts:450,469`). PoC B2-11 (DB read after 30 days): registered `has_label 1`, revoked `has_label 1,
has_contact 1`. Data is sealed under the election DEK, so this is retention/minimisation, not exposure. Fix: retention job per QV-28 §11;
do not accept `contact` until delivery exists; NULL label and contact on revoke.

### B2-12 (Low, CONFIRMED) Zero-key receipts from mirrors and erased-key elections

`election.ts:142` passes `logSk ?? new Uint8Array(32)` to `BoardLog`; the duplicate path (`:577-581`) runs before the phase gate and
`BoardLog.receiptFor` signs with that key (`log.ts:141`). PoC B2-12: `verifies under the election log key: false; verifies under the
zero-seed key: true`. Fix: never sign without the real key; for keyless runtimes return the entry with inclusion proof and no promise
signature (or 409), and document it.

### B2-13 (Low, CONFIRMED) Roll listing reveals enrolment order

`electiondb.ts:411` (`ORDER BY rowid`) feeds the public `GET /roll` before and after commit. PoC B2-13: listing equals enrolment order and
differs from key order. QV-28 §8.2 accepts organizer-side correlation as a non-claim; this ordering is available to anyone. Fix: list by
`pk` (or `roll_index` after commit) with an opaque cursor.

### B2-14 (Low, CONFIRMED) Cosignature endpoint

`app.ts:722-725` bumps `exportGen` and drops the cached bundle on every request and always returns `rejected: []`. PoC B2-14: ETag
`"1:...:0"` -> `"1:...:1"` after a junk line. Fix: bump only when something was accepted; list rejected lines (QV-09 §8).

### B2-15 (Medium, CONFIRMED) Status inflation in the audit index and stale notes

`docs/audit/README.md:13` counts SRV-001 among 4 fixed highs; `:20` lists "server endpoint/storage/tally inclusion for trustees-mode spoils" and
"re-wrapped-spoil rule (CP-01/TR-01) in ... the trustee relay" as closed. At this SHA PRs
#8/#9/#10/#14 are not merged: the KNOWN SRV-001 PoC crashes the process and the KNOWN TR-01 PoC recovers a counted vote. COMPLETION C5:
NOTES.md:74 ("restart drops pending retries") and :80 ("webhook delivery state is not persisted") remain (superseded by :90 but not
corrected); "/admin/* not implemented" is gone. New inaccuracies: NOTES.md:144 (import "yields to the event loop", see B2-02), NOTES.md:50
(ambiguous "relay not built"), `ratelimit.ts:105` comment ("/64 ... coarser than /56 ... never finer": a /64 is finer). Fix: mark items
"fixed on PR #n (unmerged)" until merged; correct the notes.

### B2-16 (Low, LIKELY) Logging outside the QV-31 allowlist

`logger.ts:35` rounds to the second except voter-path `append` events; `http.ts:448-452` logs every request with `request_id`,
`election_id`, `latency_ms`, `bytes_in`, second-precision `ts`; `election.ts:679` logs ballot `seq`. The sequential `n` counter ties the
minute-rounded `append` line to the second-precision `request` line. Ballot timing is already public through receipts (`sequenced_at`), so
the privacy impact is small; it is a conformance gap (QV-31-REQ-008 Must). `records.ts:33` allows free-text `reason` into the public log
(QV-06-REQ-007).

### B2-17 (Low, LIKELY) `export.json` rebuilt per request

`app.ts:831-838` builds `JSON.stringify(electionBundle(rt))` before the ETag/Range logic runs, so 304 and every Range request rebuild the
full export (parse of every body). Class X (2/hour/bucket) bounds it. Fix: cache like `cachedQvb`.

### KNOWN TR-01 / CP-01 at this SHA (CONFIRMED present)

`analyzeBallotLog` now collects `castAlphas`, but only `protocol/src/verify.ts:574` uses it; `Trustee.releaseSpoil` (`trustee.ts:710-726`)
still compares ballot codes only, and server admission (`election.ts:1022-1026`) compares codes only. PoC (trustee):
`3 trustees released spoil shares for the re-wrapped code; decrypted selections = {"budget":["no"]} (the counted vote)`. Fix: PR #8/#10
(ciphertext-level refusal); also reject at server admission.

### KNOWN SRV-001 at this SHA (CONFIRMED present)

PoC spawns a plain server process (`b2-fixtures/srv001-child.ts`) and sends one chunked oversize `POST /api/v1/orgs`:
`server process after one unauthenticated request: exit=1; stderr: TypeError: Cannot read properties of null (reading 'destroy')`.

## 5. Conformance table

Status: OK / partial / not-implemented / untested / mismatch. "Test" names the evidence test file.

| Spec ID | Status | Code | Test / note |
|---|---|---|---|
| TODO T-076 byte helpers, errors | OK | `board/src/bytes.ts`, `errors.ts` | `board/test/log.test.ts`, `audit.test.ts` |
| TODO T-077 Merkle | OK | `board/src/merkle.ts` | `board/test/merkle.test.ts` |
| TODO T-078 checkpoints, cosignatures, witness policy | partial | `board/src/checkpoint.ts` OK; server integration uses config keys | B2-04 |
| TODO T-079 entry header, caps, origin, KeyId | OK (origin encoding is spec gap G-8) | `board/src/entry.ts` | `board/test/log.test.ts` |
| TODO T-082 BoardStore SQLite, WAL, durability | OK | `server/src/electiondb.ts:172-228`, `db.ts` | `server/test/unit.test.ts`, `e2e.test.ts` |
| TODO T-083 append pipeline, idempotent resubmission | OK (B2-12 for keyless runtimes) | `election.ts:569-683` | `negative.test.ts` (append integrity) |
| TODO T-096 HTTP skeleton | partial | `http.ts` | SRV-001/002/003/006 present |
| TODO T-099 invites + enrolment, "no PII" | mismatch | `app.ts:440-538`, `electiondb.ts:370-395` | B2-09, B2-10, B2-11, B2-13 |
| TODO T-100 lifecycle with steward authZ | partial | `election.ts`, `lifecycle.ts` | B2-04, B2-05, B2-06; `negative.test.ts` covers binding/witness gate |
| TODO T-101 ballot endpoint | OK | `election.ts:999-1036` | `negative.test.ts`, `e2e.test.ts` |
| TODO T-102 spoil / Benaloh endpoints | partial | `election.ts:1022-1035` | reveal mode OK; trustees-mode relay/storage not in this SHA; TR-01 |
| TODO T-108 Idempotency-Key | partial | `app.ts:107-127` | SRV-007, SRV-012; B2-10 (registration semantics) |
| TODO T-113 webhooks | OK | `webhooks.ts`, `ssrf.ts` | `webhooks-persist.test.ts`, `ssrf.test.ts`; outbox body in control DB (SR flag) |
| TODO T-127 DKG client | OK | `trustee/src/trustee.ts:360-573` | `trustee/test/ceremony.test.ts` |
| TODO T-128 transcript | OK | `trustee/src/transcript.ts` | `ceremony.test.ts` |
| TODO T-129 share release after verification | partial | `trustee.ts:583-687` | `tally.test.ts`, `hardening.test.ts`; TR-03 (concurrency), TR-04 open |
| TODO T-161 CLI framework, key files, exit codes | partial | `cli/src/*` | `cli.test.ts`, `audit-regressions.test.ts`; BC-01/02/04/10 open |
| COMPLETION C5 stale server NOTES | partial | `server/NOTES.md:74,80` | B2-15 |
| QV-09-REQ-003 problem+json | OK | `problem.ts`, `http.ts:435-446` | `negative.test.ts` |
| QV-09-REQ-004 no cookies / no IP or UA logs | OK | `logger.ts`, `http.ts` | `negative.test.ts` |
| QV-09-REQ-005 self-authenticating appends | OK | `app.ts:585-600`, `election.ts:583` | `negative.test.ts` |
| QV-09-REQ-006 session challenge-response | not-implemented | QV-08 signed requests instead (D-84 pending) | spec gap G-1 |
| QV-09-REQ-007 128-bit codes, constant-time compare | OK | `app.ts:90,464,468` | `negative.test.ts` (code not stored) |
| QV-09-REQ-008 idempotency semantics | partial | `app.ts:107-127,526-528` | B2-10; SRV-012 |
| QV-09-REQ-010 SSE | OK | `sse.ts` | `events.test.ts` |
| QV-09-REQ-012 rate limits §4.7 | partial | `ratelimit.ts`, `http.ts:308-318` | SRV-002; no per-invite fail counter; X is per bucket not per election |
| QV-09-REQ-014 integrations P0/P1 only | OK | `webhooks.ts:150-170` | `events.test.ts` |
| QV-09-REQ-015 delete preconditions | partial | `pool.ts:105-116`, `app.ts:423-433` | no export-ack/30-day grace; DRAFT deletable; returns `{state:'done'}` not a Job |
| QV-09-REQ-016 export after manifest | OK | `app.ts:822-838` | `range.test.ts`, `imports.test.ts`; B2-17 |
| QV-09-REQ-001/002 schemas, OpenAPI | not-implemented | — | T-097 open (no inflation) |
| QV-04-REQ-004 invite codes | partial | `app.ts:452-536` | B2-10 |
| QV-04-REQ-005 PoP binding | partial | `app.ts:520` binds election and pk only | spec gap G-11 |
| QV-04-REQ-009 eligibility fixed | OK per ADR-015 | `app.ts:512`, `election.ts:976-990` | `negative.test.ts` |
| QV-18-REQ-004/005 gapless, atomic append | OK | `electiondb.ts:30-38`, `election.ts:650-664` | `negative.test.ts` |
| QV-18-REQ-006 server checks §5.3 | OK | `election.ts:569-610,758-870` | `negative.test.ts` |
| QV-18-REQ-010/011 C2SP notes, checkpoint per append | OK | `board/src/checkpoint.ts`, `election.ts:655` | `board/test/log.test.ts` |
| QV-18-REQ-012 never two inconsistent heads, incl. restart | mismatch | `election.ts:128-166` | B2-07 |
| QV-18-REQ-013 receipts | partial | `board/src/receipt.ts`, `election.ts:142` | B2-12 |
| QV-18-REQ-014 proofs | OK | `app.ts:667-704` | `range.test.ts`, `gossip.test.ts` |
| QV-18-REQ-020 manifest witness policy | mismatch (server) | `app.ts:62-67` | B2-04 |
| QV-18-REQ-021 server submits to witnesses | not-implemented | push-only intake `app.ts:713-727` | T-086 partial (no inflation) |
| QV-18-REQ-023 default quorum ≥ 1 / explicit flag | partial | `app.ts:67` auto-acknowledges quorum 0 | spec gap G-6; B2-04 |
| QV-18-REQ-031 retention before deletion | not-implemented | `pool.ts:105-116` | — |
| QV-18-REQ-032/033 export, verified import | OK | `export.ts`, `imports.ts` | `imports.test.ts`; B2-02 DoS |
| QV-18-REQ-050 fail closed on signing failure | OK | `election.ts:661-663`, `pool.ts:24-30` | `negative.test.ts` |
| QV-18-REQ-053 rollback guard | not-implemented by default | gossip only (`gossip.ts`) | B2-07 |
| QV-28-REQ-001 no string-built SQL | mismatch | `app.ts:124` | SRV-007 |
| QV-28-REQ-002/003/004/005 | OK | `db.ts`, `electiondb.ts` | `unit.test.ts` |
| QV-28-REQ-007 column privacy registry | not-implemented | — | — |
| QV-28-REQ-008/009 P2 sealed, per-election DEK | OK | `kek.ts`, `pool.ts:74-100`, `app.ts:468-469` | `negative.test.ts` (code not stored) |
| QV-28-REQ-010 migrations | partial | `db.ts:96-115` (checksummed, transactional) | no pre-migration backup, no root check |
| QV-28-REQ-011/012 restore, encrypted backups | not-implemented / partial | `admin.ts` `backupWork` (local, unencrypted) | B2-07 |
| QV-28-REQ-013 retention §11 | not-implemented | — | B2-11 |
| QV-28-REQ-016 disk guard | OK (absolute 500 MiB) | `election.ts:685-696` | `negative.test.ts` |
| QV-28-REQ-017 rebuild-projections | not-implemented | — | NOTES |
| QV-28-REQ-019 control DB no election content | mismatch | `controldb.ts` `webhook_outbox.body` | security review flag |
| QV-29-REQ-001 admission order | OK | `election.ts:569-683,999-1036` | `negative.test.ts` (`stats.proofVerifications`) |
| QV-29-REQ-002 hard bounds | OK | `config.ts` | `unit.test.ts` |
| QV-29-REQ-003 buckets | partial | `ratelimit.ts` | SRV-002 |
| QV-29-REQ-004 pre-auth 6/min + PoW | not-implemented | — | NOTES |
| QV-29-REQ-006 per-key quotas | OK (counts attempts) | `election.ts:585-601,1018,1023` | `negative.test.ts` |
| QV-29-REQ-008 invite tokens | partial | `app.ts` | B2-10 |
| QV-29-REQ-016 load levels | not-implemented | — | NOTES |
| QV-29-REQ-019 worker-thread verification | not-implemented | event loop | B2-01, B2-02 |
| QV-29-REQ-021 extension policy | not-implemented | — | NOTES |
| QV-29-REQ-022 abuse telemetry | OK | `logger.ts:43-49` | — |
| QV-31-REQ-001/008 log allowlist, minute timestamps | mismatch | `logger.ts`, `http.ts` | B2-16 |
| QV-17-REQ-015 all key_confirm before open | spec gap (server follows QV-16 §5.7 `|T| ≥ t`) | `election.ts:813` | G-3 |
| QV-17-REQ-016 fire drill enforced | not-implemented (server) | `keycheck` entries are rejected (`election.ts:283-304`, `lifecycle.ts`) | trustee produces the packet |
| QV-17-REQ-020/023/030 bundle, backups, no secrets to server | OK | `trustee/src/bundle.ts`, `fsutil.ts` | `hardening.test.ts`, `lifecycle.test.ts` |
| QV-17-REQ-021 age format | mismatch (documented) | `crypto/src/bundle-cipher.ts` | README honest limits |
| QV-17-REQ-040/041 release only own aggregate, witnessed | OK | `trustee.ts:583-687` | `tally.test.ts`, `hardening.test.ts` |
| QV-17-REQ-051 compromise report accepted in all phases | not-implemented (server) | no resolver/phase entry for `trustee_compromise_report` | — |
| QV-17-REQ-060 transcript | OK | `transcript.ts` | `ceremony.test.ts` |
| QV-17-REQ-070 destruction + published `key_destruction` | partial | trustee OK except B2-08; server rejects `key_destruction` entries | B2-08 |
| QV-17-REQ-080 resumable state machine | partial | `trustee.ts`, `machine.ts` | TR-03 |
| QV-12-REQ-003 operator cannot add voters/alter after signing | mismatch / spec gap | admin may create invites for any org's election before `roll_commit` (`app.ts:95-100`) | G-2 |
| QV-06-REQ-002/003 no IP/UA, no plaintext secrets | OK | `logger.ts`, `app.ts:468` | `negative.test.ts` |
| QV-06-REQ-004 retention jobs | not-implemented | — | B2-11 |
| QV-06-REQ-006 destruction attestation entry | partial | attestation file only; server rejects entry | B2-08 |
| QV-06-REQ-007 no free text in log | partial | `records.ts:33` `reason` | B2-16 |
| QV-26-REQ-020 no IP persistence | OK | — | — |
| QV-26-REQ-043 receipts after append | OK | `election.ts:650-680` | `e2e.test.ts` |
| Server/trustee/CLI call protocol verification before accepting data | OK | server `verifyEnvelope`/`checkDealing`/`verifyKeyconf`/`decVerify`/tally recompute; imports `verifyElection`+`verifyLog`; trustee `verifyElection`+`verifyLogStructure`; CLI `electionContext` | gaps: BC-04 (no manifest pin), TR-01 (code-level spoil check) |

## 6. Spec gaps (not bugs; no policy invented)

* **G-1** QV-09 §3.2 / REQ-006 session bearer vs QV-08 signed requests (implemented); owner decision D-84 pending.
* **G-2** QV-09 §3.6 lets `admin` manage org keys, invites and drafts of every org; QV-12 §5 says operators cannot add org admins and
  REQ-003 says no code path lets the operator add voters. The code follows QV-09.
* **G-3** QV-17-REQ-015 (key_confirm from all qualified trustees before open) vs QV-16 §5.7 (`|T| ≥ t`); server follows QV-16.
* **G-4** QV-17-REQ-002 (`t ≥ ⌊n/2⌋+1`, risk-ack flag for t = 1 or t = n) and REQ-001 (`ceremony_mode`, `audit_window_days`) have no fields in
  the QV-16 manifest schema; `validateManifest` checks only `t ≤ n`.
* **G-5** QV-17-REQ-052 (restart after abort, new `ceremony_start`) vs QV-18 grammar and ADR-022 (`ceremony_abort` terminal, ABORTED).
* **G-6** QV-18-REQ-023 requires an explicit `none_acknowledged` manifest flag for quorum 0; the QV-16 manifest has none and the server
  sets `noneAcknowledged = (quorum === 0)`.
* **G-7** QV-18 §9.4 gates the aggregate on a witnessed head of size = seq(close) (server conforms) while the trustee requires size ≥ close+1
  (QV-17-REQ-041 implementation); the server can post an aggregate trustees then refuse to release against.
* **G-8** QV-18-REQ-001 origin uses 32-hex `election_id`; board/server/protocol use 26-char base32 (documented in server/trustee NOTES).
* **G-9** QV-12 §6 "Pause only if the manifest declares `pause_allowed`" and QV-03 `max_halts` from the rules; the manifest has no such
  fields and the server uses its own `maxHalts` config (operator-chosen).
* **G-10** Invite entropy/lifetime: QV-04 (≥ 128 bit, 26-char base32, TTL 336 h) vs QV-29-REQ-008 (160 bit, ≤ 30 days).
* **G-11** PoP binding: QV-04-REQ-005 (group, invite, pk, label) vs QV-09 §3.3 (election_id, pk); server follows QV-09.
* **G-12** QV-09 §4.4 registration idempotency on `(invite_code, pk)` cannot be implemented while QV-28 §8.2 forbids storing the
  invite→voter link.
* **G-13** QV-31-REQ-005 `/health/live|ready|integrity` vs QV-09 `/healthz`, `/readyz`.
* **G-14** QV-26-REQ-040 `submission_privacy` and QV-29-REQ-021 extension policy have no manifest fields in QV-16.
* **G-15** QV-28 §11.2 deletable states exclude DRAFT; server and QV-09 implementation allow DRAFT deletion.
* **G-16** QV-26-REQ-044 / QV-06-REQ-009 (no per-ballot arrival time / 60 s rounding) vs QV-18 §7 receipts carrying `sequenced_at`
  (seconds) for every entry, retrievable by anyone through the duplicate-submission path.
* **G-17** ADR-022 control entries (`pause`/`resume`/`invalidate`/`security_notice`) have no defined freshness or sequence binding in any
  spec; B2-05 needs one.

## 7. Not reviewed / coverage limits

* Crypto and protocol internals (B1), web client (B3), `verifier-py`, CI workflows and dependency gates (DEP-02), deployment/TLS/proxy.
* No load test beyond the micro-benchmarks quoted; extrapolations are labelled as such. Node v22.22.0 only;
  Node 24 and Windows not run.
* Not executed: SSE slot release when the client vanishes before attach (security-review suspicion), gossip rounds racing LRU eviction,
  `apply()` failing after commit (see appendix), two concurrent trustee processes (TR-03).
* Spec text was read for the in-scope specs; the traceability matrix has no per-requirement statuses, so "Done" status was taken from
  `docs/plan/TODO.md` and `COMPLETION.md`.

### Appendix: speculative (not reported as findings)

* `ElectionRuntime.processLocked` applies the projection after the commit (`election.ts:666`); if `apply()` ever threw for an admitted
  entry, the entry would be durable, the request would answer 500 and `replay()` would throw on every later open, making the election
  unloadable. No concrete trigger found (`adjudicateDkg` returns errors as values).
* `GossipService.runOnce` keeps a runtime across network awaits (`gossip.ts:221-245`); LRU trimming by other loads can close it, aborting
  the round and dropping that round's evidence.

## 8. Commands run

| Command (cwd `/home/user/audit/quietvote-b2` unless noted) | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | pass (exit 0) |
| `npm run typecheck` (before PoCs, and again after adding PoC files) | pass (exit 0); one unused-parameter error in my PoC fixed before the second run |
| baseline `node --test "test/**/*.test.ts"` in `packages/board` / `cli` / `trustee` / `server` | 61/61, 29/29, 65/65, 121/121 pass |
| `node --test --test-reporter=spec test/b2-audit-poc.test.ts` (`packages/server`) | 15/15 pass (each asserts the current defect) |
| `node --test --test-reporter=spec test/b2-audit-poc.test.ts` (`packages/trustee`) | 2/2 pass |
| `node --test --test-reporter=spec test/b2-audit-poc.test.ts` (`packages/cli`) | 3/3 pass |
| `node --test --test-reporter=spec test/b2-audit-poc.test.ts` (`packages/board`) | 2/2 pass |
| full package suites including PoCs (`node --test "test/**/*.test.ts"` per package) | board 63/63, cli 32/32, trustee 67/67, server 136/136 pass |
| `cat packages/cli/package.json` (DEP-01: `dependencies` lists board, crypto, protocol only) | confirms DEP-01 present |
| `git -C /home/user/quietvote merge-base --is-ancestor origin/<branch> 424110d` for every prior-audit branch | audit-server-1, audit-board-cli-1, audit-trustee-1, trustee-hardening-1, crypto-protocol-1, spoil-wiring-1, cli-spoil-collect-1, ci-gates-1 not merged; audit-qa-1 merged except its handoff commit |
| `python3 -m unittest` (verifier-py) | not run (out of scope) |
