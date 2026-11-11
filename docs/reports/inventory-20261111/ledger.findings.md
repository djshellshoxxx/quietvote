# Findings ledger: audit findings NOT clearly fixed-with-a-regression-test (checked against code, snapshot `ab84f16`)

Sources: `docs/audit/HANDOFF.md` 1.3/3, `docs/audit/consolidation-2026-10-30.md` (table lines 33-110, detail blocks, supplementary 3937+), per-scope reports. Severity = revised/recorded severity (ledger "Revised" column where present, else report). Status uses: `open` / `fixed, test: <file>` / `accepted/documented` / `needs decision`.
"Decision-free" = plain engineering, no owner/protocol call and no vector/label/wire/verdict change. Several consolidation-table rows are stale; where code disagrees the code wins (noted).
QuietVote is unaudited and not for real elections.

## Stale or contradicted status prose (code wins)
- B3-26: ledger says `open`; code has cooperative verification (`packages/protocol/src/cooperative.ts`, `packages/web/src/verifier/page.ts:78`), tests `packages/protocol/test/cooperative.test.ts`, `packages/web/test/offline-verifier.test.ts`. Treated as fixed (browser acceptance not run).
- B3-18/B3-23/B3-32: detail blocks say `open`, table says fixed 2026-11-04; code at `421c879` with `packages/web/test/audit3-ui.test.ts`. Listed once below because manual AT review is outstanding.
- B2-11: detail says `open`; `ElectionDb.purgeInviteData` + `packages/server/src/retention.ts` exist, test `packages/server/test/b2-fixes.test.ts`.
- CP-05: report says Open; fixed, test `packages/protocol/test/verify.test.ts:264`.
- DEP-01: fixed (`packages/cli/package.json:27`). TR-03/04/05, TR-06 (logN cap 20), TR-08: fixed with tests (`packages/trustee/test/audit.test.ts`, `custody.test.ts`, `packages/crypto/test/second-wave.test.ts`).
- Open totals in `HANDOFF.md` 1.3 (4 medium, 7 low) are from 2026-10-22 and are superseded by the rows below.

## Findings still open, partial or owner-gated

| ID | Severity | Description | Status (verified in code) | path:line | Decision-free? | Hours |
|---|---|---|---|---|---|---|
| B3-01 | High | Web registration (hashed invite + invite-bound PoP) refused by reference server (raw code, PoP over id,pk) | needs decision (HELD) | `packages/server/src/app.ts:550,561-563`; `packages/web/src/flow/onboarding.ts:117-127` | no | 20-30 |
| P1/TSV-05 | Medium | `verifyElection` PASS with no log evidence; removed cast undetected by that call | needs decision (approved A, verdict change) | `packages/protocol/src/verify.ts:148`; `packages/verifier/src/verify.ts:259` | no | 24-32 |
| B2-05 | Medium | Control records replayable (no freshness binding) | needs decision (approved B `control_seq`, wire change) | `packages/server/src/records.ts:33`; `election.ts:897-950` | no | 20-30 |
| B2-07 | Medium | Older-DB restore undetected; second root signed for same size | needs decision (design; crash ordering review) | `packages/server/src/election.ts:128-166` | no | 24-40 |
| B1-07 | Medium | Verdict disagreements TS vs Python on honest elections (ties, winner order, DKG dups, latest-excluded ballot) | needs decision (per-erratum rulings) | `verifier-py/qv_verifier/rules.py:20-67`, `dkg.py`; `docs/errata/spec-errata-log.md` PY-003/009/010 | no | 16-24 |
| BC-02 | Medium | `board verify` uses bundle's own witness policy by default | open (flag added; approved A = PARTIAL downgrade, changes CLI verdict) | `packages/cli/src/cmd-board.ts:66,75-79`; test `packages/cli/test/audit.test.ts:39` | no (verdict) | 2-3 |
| B3-06 | Medium | PAUSED handling; API error args outside ballot path | partly: phases gated; PAUSED not derived (`needs decision`: freshness) ; arg-passing piece open | `packages/web/src/flow/election.ts:13,155`; `ui/app.ts:138-148` | piece yes, rest no | 3 / 12-20 |
| B3-09 | Medium | Key backup: restore wired; mandatory backup-restore gate absent; no browser journey | partly; needs decision for the gate (QV-04-REQ-006 waiver semantics); browser test not runnable locally | `packages/web/src/ui/app.ts:378-396`, `flow/onboarding.ts:69` | no | 8-12 |
| B3-11 | Medium | Auto-lock: idle lock/warning done; timer suspension untested in Safari/Firefox/Tor; QV-13 vs QV-19 wording | partly; doc piece = B3-11a (approved A) | `packages/web/src/key/lock.ts:6`; `docs/13:69` | doc yes; browsers need hardware | 0.5 / n.a. |
| B3-14 | Medium | One-ballot elections vs unconditional g4 promise | open (approved A conditional copy; English first) | `packages/web/src/i18n/en.ts:92,210,431` | no (normative copy) | 4-6 |
| W7 | Medium | live refresh errors swallowed; status line not reset to live after good refresh | open (minor residual) | `packages/web/src/ui/app.ts:199-240` (not re-verified in browser) | yes | 2 |
| DEP-02 | Medium | Missing supply-chain gates | partly fixed, test: `scripts/lockfile-lint.mjs` + ci.yml; open: `scripts/check-deps.mjs` (allowlist/exact pin, docs/19 P1/P2, QV-19-REQ-029), `npm audit signatures` | `docs/audit/dependencies-ci.md` open items; no `scripts/check-deps.mjs` | allowlist/pin check yes; `audit signatures` needs decision | 4-6 |
| CP-02 / C2 / B1-12 | Low | cp-dec-nonce omits (A,B); failed RNG + changed aggregate leaks s_j | needs decision (approved C, registry change + vector regen) | `packages/crypto/src/proofs.ts:222,278`; `transcript.ts:39` | no | 10-16 |
| C3 / OQ-7 | Info | PoK/share-key/DH nonces from plain CSPRNG | needs decision (batched with CP-02) | `proofs.ts:50,67,85` | no | incl. |
| B2-10 | Low | Invite null default expiry; unknown vs used oracle; cross-invite 201 | open (TTL default yes; oracle part is registration-path/held; linkage needs privacy review) | `packages/server/src/app.ts:491-495,563-575` | TTL yes; rest no | 2-3 / 3 |
| B2-12 | Low | Zero-seed placeholder key signs duplicate receipts on keyless runtimes | open (approved interim A) | `packages/server/src/election.ts:143,633-637`; `packages/board/src/log.ts:141` | yes (interim) | 4-6 |
| B2-16 | Low | Request logs outside QV-31 allowlist; free-text control reason | partly: logs fixed, test `packages/server/test/b2-fixes.test.ts:100,125`; `reason` still free text | `packages/server/src/records.ts:33` | no (record schema) | 3 |
| B2-11 (residual) | Low | Retention fixed (test `b2-fixes.test.ts`); 7-day default unconfirmed; backups not purged | needs decision (default) + open (backup retention) | `packages/server/src/retention.ts`, `electiondb.ts:424-428` | partly | 4-8 |
| B2-02 (residual) | Medium | Import/verify moved to worker; parse/replay/tally stages still synchronous on main thread | accepted/documented | `packages/server/NOTES.md`; `docs/reports/next-server-20261109.md` | yes (substantial) | 16+ |
| B2-15 | Low | Audit index/NOTES drift | accepted/documented (doc reconciled) | `docs/audit/README.md` (counts still 2026-10-22: stale) | yes | 1 |
| N-32 c/d/e | Low | CHALLENGED producer, max_total_hours cap, RESUME with new close | needs decision (after B2-05) | `packages/server/NOTES.md:42-52` | no | n/a |
| N-32 (a,b) | Low | IPv6 bucket /64 not /56; archive delete lacks export ack | open (approved A) | `packages/server/src/ratelimit.ts:89-132`; no `export_record` in src | yes | 1-2 / 8-12 |
| SRV-008 | Info | Default `registrationMode: 'open'`, unlimited orgs/elections | needs decision (accept or harden default) | `packages/server/src/config.ts:208` | no | 1 |
| SRV-009 | Info | `bucketHeader` trusted verbatim | accepted/documented (operator guidance) | `packages/server/src/http.ts:~203`, `config.ts:47` | yes (doc) | 0.5 |
| SRV-010 | Info | Webhook DNS_FAILED vs TARGET_BLOCKED error oracle | needs decision (accept or collapse codes) | `packages/server/src/ssrf.ts:159-182` | no | 1-2 |
| SRV-011 | Info | KEK file next to DB; no rotation | needs decision | `packages/server/src/kek.ts:9` | no | 8-16 |
| SRV-012 | Info | Crash leaves 24 h `status=0` idempotency marker | open | `packages/server/src/app.ts:117-134`; `controldb.ts:42,429` | yes | 2-3 |
| SRV-013 | Info | CORS preflight `ACAO:*` for any path with a GET route | open | `packages/server/src/http.ts:253-258` | yes | 1 |
| SRV-014 | Info | Body buffered before signature auth | accepted/documented | `packages/server/src/http.ts` | n/a | 0 |
| B1-02 | Low | Python non-ballot anomalies fatal vs TS class L | needs decision (approved A) | `verifier-py/NOTES.md:42`; `election.py:314-358` | no | 10-16 |
| B1-05 | Low | U+061C in Python bidi set only | needs decision (approved A; verdict set change) | `verifier-py/qv_verifier/manifest.py:28`; `packages/protocol/src/manifest.ts:10` | no | 1 |
| B1-08 | Low | Python manifest bounds/witness/tie rules vs TS | partly fixed, test `verifier-py/tests/test_audit_regressions.py`; remainder needs decision | `verifier-py/NOTES.md:46-47` | no | 6-10 |
| B1-11 | Low | Negative corpus lacks full Appendix C coverage; external Ed25519/DKG vectors | partly: 3 survivors have tests (`packages/crypto/test/proofs.test.ts`, `packages/protocol/test/b1-regressions.test.ts`); corpus additions are vector changes | `test-vectors/v1` | tests yes; vectors no | 8-16 |
| B1-09 / B1-10 | Info | Doc/status corrections (binding-field class; no `rerandomize`) | accepted/documented | `docs/plan/COMPLETION.md:27`; `packages/crypto/src/elgamal.ts` | n/a | 0 |
| TSV-04 | Info | Board-layer throw leaves PASS reachable | needs decision (approved C INCOMPLETE) | `packages/verifier/src/verify.ts:128-137,259` | no | 4-6 |
| PY-01 | Info | Python rejects spoil_trustee_decrypt with generic E_SCHEMA | needs decision (D-95 code/class) | `verifier-py/qv_verifier/manifest.py` | no | 3-4 |
| PY-02 | Info | Python verdict PASS/FAIL only | needs decision (D-96) | `verifier-py/NOTES.md:49` | no | 8-12 |
| D-92/D-93/D-94 | Info | 3 report differences left in strict differential (17 fields) | needs decision (HELD; ADR-027 A vs OPEN-DECISIONS I) | `verifier-py/.../election.py:299,564-690,685`; `scripts/compare-verifiers.ts` exits 1 | no | 6 |
| P10 | Info | Duplicate open/close markers are L, first wins | needs decision (approved A; verdict change) | `packages/protocol/src/verify.ts:305,447` | no | 4 |
| P2 (residual) | Low | Differencing over two >= floor subsets cannot be stopped by `trusteeDecryptTally` API alone | accepted/documented (API contract; trustee recomputes from log) | `packages/protocol/src/tally.ts:41` | n/a | 0 |
| CP-06 | Info | DKG selective-abort bias of K | accepted/documented (known property) | `docs/audit/crypto-protocol.md:44` | n/a | 0 |
| CP-08 | Info | Mutation survivors M3/M7/M8/M15/M18 now killed, tests `packages/crypto/test/cp08-fiat-shamir.test.ts`, `cp08-ed25519-zip215.test.ts`; fuzz covers only `verifyElection`/envelope (`packages/protocol/test/property.test.ts:63,90`) | partly fixed; remainder open (fuzz for verifier loader, board bundle, checkpoints, receipts) | `packages/verifier/src/bundle.ts`, `packages/board/src/bundle.ts` | yes | 8-10 |
| C11 | Info | `streamRng`/`constantRng`/`vecrng` exported from main crypto entry | open | `packages/crypto/src/index.ts:5` (`export * from './rng.ts'`) | yes | 4-6 |
| N-13 | Info | V13 always `not_run`; control entries only authenticated, not interpreted | needs decision (V13 verdict class, steward vs single key) | `packages/verifier/src/verify.ts:253`; `packages/protocol/src/logcheck.ts:485-495` | no | 16-24 |
| N-24 | Info | No vendoring of noble dependencies | needs decision (supply-chain policy) | `docs/plan/TODO.md` | no | n/a |
| N-25 | Info | No secret types / constant-time discipline beyond noble | accepted/documented; external review | `docs/plan/TODO.md` | no | n/a |
| N-27 | Info | roll basis / abstain not implemented | accepted/documented (approved A: not in v1) | `packages/protocol/src/rules.ts:22` | yes (doc) | 1 |
| WV-9 | Info | Corpus unsigned; `--skip-selftest` exits 0 on PASS | needs decision (signing, release key) | `test-vectors/v1`; `packages/verifier/canary/corpus.json` | no | n/a |
| TR-07 | Info | Passphrase retained on Trustee (`private readonly pass`); `debugPlaintext` removed | partly fixed, test `packages/trustee/test/custody.test.ts`; residual accepted (JS strings cannot be wiped) | `packages/trustee/src/trustee.ts:130,139` | needs design | 6-8 |
| TR-09 | Info | SPOIL_REPLAY blocks idempotent re-serve (availability) | needs decision (approved B, release semantics) | `packages/trustee/src/trustee.ts:788` | no | 8-12 |
| BC-12 | Info | Library `verifyLog` can return VERIFIED with bundle-supplied key/policy | accepted/documented (design) | `packages/board/src/bundle.ts` | no (verdict) | n/a |
| BC-13/14/15 | Info | `vectors check` path join; unbounded stdin; checkpoint sigs not re-verified on load | accepted/documented | `packages/cli/src/cmd-vectors.ts`, `io.ts`; `packages/board/src/log.ts:48-56` | BC-15 yes (small) | 2 |
| B3-04 / W15 / WV-10 | Low | Lazy chunks and worker lack SRI; `report-uri /csp-report` has no handler | partly fixed (static modules: test `packages/web/test/build.test.ts`, `e2e/verifier.ts:216`); lazy open (approved A) | `packages/web/src/build/site.ts:32,77-83` | yes (needs Chromium) | 8-16 |
| B3-25 | Low | Passphrase canonicalization differs web vs CLI | needs decision (approved A; KEK input) | `packages/web/src/key/passphrase.ts:89-94`; `packages/cli/src/keyfile.ts:21-22` | no | 8-12 |
| B3-27 | Low | Library-only flows without UI call sites (rules notice recording, shared-device settings, random submission delay) | open (feature work; random delay is a privacy feature) | `packages/web/src/flow/onboarding.ts:69`, `i18n/datetime.ts` | partly | 12-30 |
| B3-28 | Info | Key-file KDF ceiling lets ~9-30 s unlock | open (approved A warning + cancel) | `packages/web/src/key/keystore.ts:15-18,63-70` | yes | 5-8 |
| B3-18 / B3-23 / B3-32 | Low/Info | Live regions, invite links, landmark/chart roles | fixed, test: `packages/web/test/audit3-ui.test.ts`; manual screen-reader/axe review outstanding | `packages/web/src/ui/app.ts` | n/a | external |
| B3-33 / DEP-03 / DEP-04 | Info | Workspace `*` ranges; esbuild postinstall under `ignore-scripts`; no SBOM/signing | accepted/documented (lockfile-lint passes) | `packages/*/package.json`; `.npmrc` | partly | 2-4 |
| N-36a | n/a | `/verify-client` page and signed release manifest absent | needs decision (signing root) | none in repo | no | 20-30 |
| HANDOFF 3.3 QA | n/a | Playwright/real-browser, cross-package tamper e2e in all spoil modes, platform matrix | open (browser runs impossible here: Chromium `socket() EPERM`) | `packages/web/e2e/*`, `packages/server/test/e2e.test.ts` | tamper e2e yes | 10-16 |

## Open counts by recorded severity (rows above; consolidated rows counted once)
- High: 1 (B3-01, held).
- Medium: 12 (P1/TSV-05, B2-05, B2-07, B1-07, BC-02, B3-06, B3-09, B3-11, B3-14, W7, DEP-02, B2-02 residual accepted).
- Low: 17 (CP-02, B2-10, B2-12, B2-16, B2-11 residual, B2-15, N-32 c/d/e, N-32 a/b, B1-02, B1-05, B1-08, B1-11, P2 residual, B3-04/W15/WV-10, B3-25, B3-27, B3-18/23/32 group).
- Info: about 25 (SRV-008..014, C3, TSV-04, PY-01, PY-02, D-92..94, P10, CP-06, CP-08, C11, N-13, N-24, N-25, N-27, WV-9, TR-07, TR-09, BC-12..15, B1-09/10, B3-28, B3-33 group).
These are counts of rows, not security assurance. Medium/High with a decision gate: 10 of 13.
