# Decision-free task list (snapshot `ab84f16`)

Criteria: approved by ADR-027 (or plain engineering from an open finding) AND no change to vectors, labels, wire formats, record schemas, verdict semantics, crypto constructions, no new dependency, no held item (B3-01, D-92..D-96). Ordered by project priority. Hours are rough for one agent in its own worktree. Honest wording: unaudited, not for real elections.

Ownership caution: most tasks touch one package plus its NOTES.md; only T1 touches two packages.

## A. Top 15 decision-free tasks

| # | ID(s) | Priority axis | Files to touch | Acceptance tests | Hours | Risk |
|---|---|---|---|---|---|---|
| T1 | B2-12 (interim A) | verifiable results / tamper resistance | `packages/server/src/election.ts` (~143, 633-637), `packages/board/src/log.ts` (~141: make `secretKey` optional, throw when promise-signing without it), `packages/server/NOTES.md` | New server test: duplicate submission on IMPORTED and keyless ARCHIVED runtime returns an error (409/503 `LOG_UNAVAILABLE`) and never a zero-seed signed promise; board test: `getReceipt` promise-sign without key throws; existing receipt tests unchanged | 4-6 | Low-medium: archive clients lose idempotent receipt retrieval (documented in register); type change in board API |
| T2 | HANDOFF 3.3 (tamper e2e) | voting integrity / verifiable results | new test file in `packages/server/test/` or `packages/verifier/test/` (reuse `helpers/sim.ts`, server `e2e.test.ts` world) | Export a real election (revote + spoil), then flip a byte, drop an entry, reorder, replay an entry, wrong ctx: with log evidence supplied each case must be FAIL (never PASS); control remains PASS. Note: without `opts.log` PASS is still possible (P1 held), so tests must supply the log | 10-14 | Low; slow tests (use narrow world, do not loop) |
| T3 | CP-08 remainder / B1-11 tests | tamper resistance | new tests only: `packages/verifier/test/`, `packages/board/test/`, `packages/protocol/test/property.test.ts` | Seeded fuzz: `verifyBundle`/`loadBundle`, board `bundleFromJson`/`verifyLog`, checkpoint notes, receipt claims, `logEvidence` never throw and never yield PASS/VERIFIED on corrupted input; seeds fixed | 8-10 | Low; must not add skipped/flaky tests |
| T4 | B2-10 (TTL part only) | eligibility/authorization | `packages/server/src/app.ts:491-495`, `config.ts` (option), `packages/server/NOTES.md`, docs/09 note | Invite created without `expires_at` gets 14-day expiry (QV-02-REQ-010); explicit expiry unchanged; expired invite -> 422 `INVITE_EXPIRED`; check `negative.test.ts` assumptions about null expiry first | 2-3 | Low; do not touch unknown/used oracle (registration path is B3-01-held) |
| T5 | N-32a | eligibility (rate-limit buckets) | `packages/server/src/ratelimit.ts:89-132` (rename to /56, fix misleading comment), `packages/server/test/audit.test.ts:50-58`, NOTES | Same-/56 addresses share a bucket; different /56 differ; v4-mapped unchanged. Requires editing the existing "different /64" assertion to use a different /56 (approved by ADR-027; call it out in the diff) | 1-2 | Low; relaxes one existing assertion |
| T6 | N-20 | eligibility/authorization (attack surface) | `packages/web/src/api/client.ts` (remove `setSessionToken`, `authChallenge`, `authSession`, bearer branch), `packages/web/src/api/types.ts` (`Challenge`, `Session`), `docs/09-api-data-contracts.md` (3.2, REQ-005/006, 219-220), `packages/web/NOTES.md` | `npm run typecheck`; web tests still pass; grep proves no references; docs state QV-08 signed requests as sole organizer auth | 4-6 | Low code risk; normative doc rewrite needs reviewer |
| T7 | D-85 A + DEP-02 residual | tamper resistance (supply chain) | new `scripts/check-deps.mjs` (D1..D5 import boundaries with exactly the cli->verifier exception; production-dependency allowlist/exact-pin per docs/19 P1/P2), test file, CI step in `.github/workflows/ci.yml`, `docs/08` 5.1, `docs/decision-log.md` entry citing ADR-027 | Script fails on a synthetic extra edge (e.g. server->web), passes on the repo; `.github/scripts/check-workflow-coverage.test.mjs` still passes; no existing gate weakened | 4-6 | Low-medium; do not add dependencies; allowlist content must follow QV-ADR-P19-4 literally |
| T8 | SRV-012 | reliability | `packages/server/src/app.ts:117-134`, `controldb.ts:42,429` | Test: a `status=0` marker older than a short bound (e.g. 2x request timeout) is replaced, not 409 for 24 h; live in-flight marker still returns 409 | 2-3 | Low |
| T9 | N-28 (C) | ballot confidentiality (trustee entropy) + docs | `packages/trustee/src/` (keygen/ceremony entropy mix via HKDF), `docs/17` REQ-021 wording, `packages/trustee/NOTES.md` | Dice digits only add entropy: same CSPRNG, different dice -> different key; empty dice = old behaviour; no vector changes. Keep age-style bundle (do not claim age compatibility) | 6-8 | Medium: touches key generation; keep mix additive and reviewable |
| T10 | W15 (A) | tamper resistance (client supply chain) | `packages/web/src/build/site.ts:77-83`, `packages/web/e2e/verifier.ts` (tamper case), `packages/web/test/build.test.ts`, NOTES | HTML test: every lazy chunk reachable by `import()` has an integrity-checked preload; e2e: tampered lazy chunk blocked. Local Chromium fails `socket() EPERM`, so the e2e cannot be verified by an agent here; keep the 200 kB budget | 8-12 | Medium: unverifiable locally; eager download cost |
| T11 | B3-28 (A) | reliability / key custody UX | `packages/web/src/key/keystore.ts:15-18,63-70`, unlock UI in `packages/web/src/ui/app.ts`, English-only i18n keys (never mark reviewed) | Unit: params above default (m>65536 or t>3) require explicit confirm before derivation, cancel aborts with no KDF run; ceiling and floor unchanged | 5-8 | Low |
| T12 | B3-06 (piece) | workflows | web throw sites using `t('qv.err.*')` without args in the ballot path (`packages/web/src/ui/app.ts`, `api/errors.ts`, `flow/ballot-controller.ts`) | Test: each error key that needs `{...}` args renders without falling back to the generic copy | 3 | Low |
| T13 | N-39c (A) | workflows | `packages/cli/src/main.ts` (+ new `cmd-trustee.ts`) spawning `qv-trustee` via child_process with passthrough args; `packages/cli/NOTES.md` | Test with a fake `qv-trustee` on PATH: argv passthrough, exit-code passthrough, clear error when missing; no import of trustee package | 4-6 | Low; stays inside D1 once T7 exists |
| T14 | N-23c | tests / docs | new `scripts/trace.mjs` (report-only matrix of `@verifies` tags vs Must REQs), a small test, `docs/30` note | Script runs, prints coverage matrix, exits 0; no CI blocking gate | 6-10 | Low |
| T15 | docs bundle: N-08b, CLAIMS-LINT-HISTORICAL, B3-11a, N-12, N-27, RECON, N-28 text | docs | new `MAINTAINERS.md`, `docs/RELEASE-KEYS.md`, `docs/LICENSE-NOTE.md` (honest empty state, no invented fingerprints/legal conclusions); inline `<!-- claims-lint-ignore -->` markers in the 20 flagged places (do not weaken the lint); QV-13 REQ-007 note; QV-16 5.14.3 / QV-18 5.2 control-record shape; QV-35/QV-16 note that roll/abstain are not v1 | `node scripts/lint-claims.mjs` reports 0 findings (currently 20); files state unaudited/not for real elections; no spec text claims a decision beyond ADR-027 | 8-10 | Low; keep normative edits strictly to documented current behaviour |

Also decision-free, not in the top 15: C11 move `streamRng/constantRng/vecrng` to a `@quietvote/crypto/testing` subpath (4-6 h, wide import diff in six packages); SRV-013 align CORS preflight with real response (`packages/server/src/http.ts:253-258`, 1 h); SRV-009 document proxy header (0.5 h); W7 reset live status line (2 h).

## B. NOT decision-free: one-sentence owner/reviewer question each

- P1/TSV-05: Confirm that the INCOMPLETE cap (with a named library opt-out) may now land together with regenerated `expected-report.json`, `log-layer-4v` and corpus vectors, and name the opt-out option.
- TSV-04: Confirm that a board export present but skipped/thrown becomes INCOMPLETE (exit 3) in `packages/verifier`.
- PY-02/D-96: Approve the spec text defining INCOMPLETE (no tally, nothing failed, exit 3) in QV-16 C8/QV-34 so Python may implement it.
- D-92 / D-93 / D-94 (DIFF-manifest-signature-removed, DIFF-count-altered, DIFF-result-flipped): Which governs, ADR-027 category A (stop / `not_run` / empty results) or OPEN-DECISIONS section I (continue / evaluate recovered counts / separate `recomputed_results`)?
- N-17: Rule per erratum QV-ERR-PY-001..015 and supply the QV-ERR-PY-013 leaf encoding.
- P10: Confirm F `E_MARKERS` for a differing duplicate marker (verdict change) is approved to land now.
- BC-02: Confirm the CLI VERIFIED -> PARTIAL (exit 3) downgrade without `--witness-policy` (smallest change, explicit acceptance tests in the register).
- B1-02: Approve the QV-16 5.20 record-class table (L vs F per non-ballot anomaly) that Python must mirror.
- B1-05: Confirm U+061C is dropped from Python's bidi set (accept-set change).
- B1-07 / B1-08-open: Give the per-erratum rulings (ties, winner order, count-quorum field, DKG duplicates, numeric bounds, witness schema).
- PY-01/D-95: Which code, check and class does a zero-digest spoil under a manifest with trustee mode off receive?
- CP-02 / B1-12 / C3: Approve the exact new field lists and labels for the single nonce-registry revision and the one-time vector regeneration.
- V13 / N-13: What verdict class does an `invalidate` control entry produce, and is authority steward k-of-m or the coordinator key?
- N-12: Approve the spec text that ratifies the control record shape (protocol edit to QV-16 5.14.3 and QV-18 5.2).
- B2-05: Approve `control_seq` (wire field, both verifiers, new negative vectors) and the migration for existing control entries.
- B2-07: Who reviews the crash-ordering and witness-poll design for the signed-head high-water anchor?
- B2-10 (oracle part), B3-01: Reconcile ADR-028 with the register's "do not unblock" text, and specify exact wire, signature, storage-hash, label scope and existing-invite migration bytes.
- B2-16 C-lite: Provide the enumerated catalog for control `reason` (record schema change).
- N-32 (b): Confirm the export-acknowledgement schema and 30-day grace (needs a DB migration); c/d/e await B2-05.
- B3-06: What STH-freshness bound and authority check gate a derived PAUSED phase, and what copy is shown?
- B3-09: What are the backup-waiver semantics for a mandatory backup-restore check (QV-04-REQ-006)?
- B3-14: Approve the English wording of the conditional guarantee 4 for one-ballot elections.
- B3-25: Where does the shared passphrase-canonicalization function live (no new dependency), and which legacy fixtures prove existing containers still unlock?
- TR-09: Approve that a trustee re-serves byte-identical stored spoil-release packets (QV-17 release semantics).
- N-36a: Who signs the release manifest and how does a verifier obtain the public key?
- SRV-008, SRV-010, SRV-011: Accept or harden the open-registration default, webhook error oracle and co-located KEK.
- DEP-02: Adopt a registry-signature policy so `npm audit signatures` can be added to CI.
- B2-11: Confirm the 7-day invite-data retention default and backup retention policy.
- WV-9: Who holds the key that signs the test-vector corpus?
- Registry/vector items need independent protocol/security review before any non-experimental claim (external party): CP-02/C3/B2-05/P1.
