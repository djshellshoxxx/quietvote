# QuietVote open-work digest (deduplicated, classified)

Repo /home/user/quietvote @ ab84f16 (codex/quietvote-milestone-20261109). READ-ONLY digest; no tests/builds run. Ledgers are mostly dated 2026-10-21 and
predate the 2026-10-30 consolidation and 2026-11-09 next-phase work, so "Open" in a ledger is a claim, not a fact. "Evidence" = grep/read of code at HEAD.
Paths: P=docs/plan, N=packages/<pkg>/NOTES.md. Ledger ids: T-nnn (BACKLOG/TODO), N-nn (TODO), D-nn (OPEN-DECISIONS), B*/CP/TR/W/TSV/PY ids from
docs/audit/consolidation-2026-10-30.md (other agent; cited only via P/DECISIONS-2026-11-04.md).

## 0. Reading notes that change how to use the tables

- APPROVAL RECORDS CONFLICT. docs/decision-log.md:334-352 (QV-ADR-027/028) says the owner approved the recommended default of every item in
  P/DECISIONS-2026-11-04.md (categories A-D) and QV-19 hashed-invite for B3-01 on 2026-11-04. P/DECISIONS-2026-11-04.md:476-483 still says B3-01 is held, and
  OPEN-DECISIONS.md:8-21,168-174 keeps D-92..D-96 open with recommendations that differ from the register's (e.g. D-92: register DIFF-manifest-signature-removed
  "A stop" vs OPEN-DECISIONS.md:170 "B continue"). docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md:109-114 and docs/reports/next-integration-review-20261109.md:61-63
  say B3-01 and D-92..D-94 stay HELD. I treat: ADR-027 items other than B3-01 and D-92..D-94 as "decision-free (approved default, ADR-027)", marked [ADR27];
  B3-01 and D-92..D-96 as pending owner decisions (table 2). Whether ADR-027 is authoritative for the rest is UNVERIFIED (owner is the only authority).
- Ledger checkbox ("- [ ]") counts are in section 6. Only BACKLOG.md (table-cell "[ ]") and NEXT-STEPS.md carry boxes; TODO.md uses a Status column.
- Size: S <2h, M half-day, L >1 day. Priority: P0 integrity/confidentiality, P1 eligibility/authz/duplicate-vote, P2 workflow completeness, P3 polish.
- QuietVote is an unaudited prototype; the project's own status is "protocol-qualified milestone BLOCKED" (handoff:3).

## 1. Engineering work that is decision-free

| ID(s) | Area/package | What remains (concrete, testable) | Spec/REQ ref | Evidence it is still open at HEAD | Size | Pri |
|---|---|---|---|---|---|---|
| E-01 [ADR27] P1/TSV-05, TSV-04, PY-02 | verifier, protocol, verifier-py, web | Cap overall verdict below PASS (INCOMPLETE) when chk.board.append_only/witness is not_run, with explicit library opt-out; board-layer throw -> INCOMPLETE; add INCOMPLETE to verifier-py. Tests: bundle with cast entry removed + no log -> INCOMPLETE; consistent log -> PASS; FAIL wins. Regenerate expected reports | QV-35-REQ-004; QV-16 App.C step 22; DECISIONS-2026-11-04.md:11-37 | verifier/src/verify.ts:259-262 (verdict = protocol verdict unless FAIL; no cap); grep allowNoLog = 0 hits; verifier-py has no INCOMPLETE (grep) | L | P0 |
| E-02 [ADR27] CP-02, B1-12, C3 (T-043, N-41, D-19) | crypto, protocol, vectors | One registry revision: add pt(A),pt(B) to cp-dec-nonce; hedge PoK/share-key/DH nonces (hs_nz with secret, ctx, indices, statement point, rand32); regenerate vectors once (prover side only); negative vectors keep expectations | QV-16 OQ-7; QV-17-OQ-7; DECISIONS-2026-11-04.md:149-175 | crypto/src/proofs.ts:222,278 cp-dec-nonce field list is (s_j, ctx, cid, oid, rand32), no ciphertext; hedging of PoK/DH nonces UNVERIFIED (not checked) | L | P0 |
| E-03 [ADR27] B2-12 | server, board | Never sign with zero seed: make BoardLog secretKey optional, throw in receipt sign when absent | QV-18 receipts; DECISIONS-2026-11-04.md:244-251 | server/src/election.ts:146 `secretKey: logSk ?? new Uint8Array(32)`; board/src/log.ts:63,252 use zero leaf fallbacks (separate, UNVERIFIED if relevant) | S | P0 |
| E-04 [ADR27] B2-05 | protocol, server, verifier, verifier-py | Monotonic signed `control_seq` (=prev+1) in control records; enforce in server and both verifiers; new negative vectors, existing vectors unchanged | QV-ADR-022; QV-07-REQ-082; DECISIONS-2026-11-04.md:205-212 | grep control_seq in packages/*.ts = 0 hits | L | P0 |
| E-05 [ADR27] B2-16 | server | Restrict request-log fields/timestamps to QV-31 allowlist; constrain control `reason` to a catalog enum | QV-31:19,22,50,82,87,94; DECISIONS-2026-11-04.md:253-260 | Server tests with "canary" exist (server/test/negative.test.ts, b2-fixes.test.ts); whether allowlist/enum is enforced UNVERIFIED | M | P0 |
| E-06 [ADR27] N-13, V13-control-entries | verifier, protocol | Implement V13: parse control entries, check author vs manifest steward/trustee delegation, apply pause/resume/invalidate effects; vectors | QV-05 V13; QV-ADR-022; D-87 ratified in register N-12 | verifier/src/verify.ts:253 hard-codes V13 not_run; protocol/src/logcheck.ts:483 "QV-05 V13 is not implemented" | L | P1 |
| E-07 [ADR27] N-17, QV-ERR-PY-001..015, B1-07, B1-08-open | spec, test-vectors, verifier-py | Rule each erratum (TS reading where spec silent), record in errata log, add vectors; amend QV-16/QV-34 text | docs/errata/spec-errata-log.md:21-37,62-63 | Errata log rows still "open"; log lines 53-63 resolve only PY-006/007/015 partially | L | P1 |
| E-08 N-18 (after E-07) | test-vectors, protocol | Regenerate v1 vectors so manifests carry bb.log_id = SHA-256(logOrigin(manifest)); add board-level canary + Merkle vectors (N-38, T-215) | QV-34; protocol X-21 | verifier/NOTES.md:86-89 (placeholder bb.log_id 836ff184...c213 -> E_LOG_BINDING); N-38 board-level canary absent (verifier/NOTES.md:80-82) | M | P1 |
| E-09 [ADR27] B1-02, B1-05, PY-01 (impl part), B1-08-open | verifier-py, verifier | Python: non-ballot anomalies class L (not fatal); add U+061C to Bidi set (QV-13:326 demands identical rules); named error for unsupported spoil_trustee_decrypt flag (accept `false`); manifest bounds aligned | QV-13:259,326; QV-35-REQ-012; DECISIONS-2026-11-04.md:105-145 | grep 061C/061c in packages/ and verifier-py = 0 hits (could be encoded as range, UNVERIFIED); PY-01 option choice itself is D-95 (table 2), so only the non-D-95 parts here | M | P1 |
| E-10 [ADR27] N-20 / D-84 | web, docs/09 | Delete web bearer-session auth (authChallenge/authSession/setSessionToken, Bearer header); rewrite QV-09 §3.2 + REQ-005/006 to QV-08 signed requests | QV-08 §7 REQ-019; DECISIONS-2026-11-04.md:288-295 | web/src/api/client.ts:63 Bearer header, :219-222 /auth/challenge and /auth/session still called | M | P1 |
| E-11 [ADR27] B3-06 | web | Derive PAUSED phase from verified log control entries (author checked vs manifest), gate ballot path on STH freshness; add PAUSED copy | QV-ADR-022; QV-07-REQ-082 | grep for paused in packages/web/src = catalog strings only (de/es/fr.ts:48); no phase handling | M | P1 |
| E-12 [ADR27] N-37, N-37c | web, server | Wire commitRoll in the organizer UI (after approved registrations); e2e of publish against a live server; web relays signed trustee records only (CLI-only trustees) | QV-04; QV-ADR-024 | web/NOTES.md:164 "commitRoll is not wired"; grep commitRoll in web/src/ui = 0 hits (defined at web/src/flow/publish.ts:217) | M | P1 |
| E-13 [ADR27] B3-25 | web, cli | One shared passphrase canonicalization; unlock tries canonical then legacy-exact form so existing containers stay unlockable; legacy-key fixtures | QV-19; OPEN-DECISIONS.md:16-19 | cli/src/keyfile.ts:22 raw NFKC vs web/src/key/passphrase.ts:28,64,93 NFKC with word normalization (different code paths) | M | P1 |
| E-14 [ADR27] B2-07, B2-10 | server | Older-DB restore detection with read-only quarantine on mismatch; invite expiry default, no unknown/used oracle | QV-18 REQ-053; docs/09:146 | Quarantine endpoint exists (server/NOTES.md:179); remaining B2-07 floor check and B2-10 behaviour UNVERIFIED | M | P1 |
| E-15 [ADR27] TR-09 | trustee, server | SPOIL_REPLAY: idempotent re-serve of identical release vs hard refusal (register option B) | QV-17; QV-ADR-020 | trustee/src/trustee.ts:779,788 still throws SPOIL_REPLAY on any re-release | S | P1 |
| E-16 N-25, T-039 | crypto, protocol | Secret scalar branded type, zeroization policy, QV-30 §5.2 lint rules; scalars are plain bigint | QV-30 S2; QV-19-REQ-009 | grep SecretScalar/Secret< = 0 hits; wipe() only in cli/src/keyfile.ts:35-91 | L | P1 |
| E-17 N-24, T-234 | repo, crypto | Vendor @noble/curves+hashes under vendor/ with VENDOR.lock + CI check (per QV-ADR-024) | QV-ADR-024; QV-30 | no vendor/ dir (ls); lockfile-only pin (scripts/lockfile-lint.mjs) | M | P1 |
| E-18 [ADR27] N-39, N-39c, T-162..T-170 | cli | Build missing commands: group/rules, enroll, election create/open/close/tally, vote submit + receipt check, trustee (spawn qv-trustee), export/import, monitor; CLI e2e of full election | QV-02-REQ-001/002/011; QV-03; QV-09 | cli/src/index.ts:17-36 lists only verify, keygen, ballot encrypt/audit, board verify, election inspect/spoil-collect. enroll depends on B3-01 (table 2) | L | P2 |
| E-19 [ADR27] N-32 | server | CHALLENGED producer; max_total_hours cap; RESUME with new close time; IPv6 bucket /56 per spec; archive requires acknowledged export | QV-03; QV-29; QV-28 §11.2 | server/NOTES.md:44,51-52; ratelimit.ts:111 says IPv6 /56 but :132 uses /64 (comment at :132 calls /64 "coarser", NOTES:51 says "finer"; direction UNVERIFIED) | M | P2 |
| E-20 T-097, N-31 | server | OpenAPI 3.1 + JSON Schema generation with contract tests; rebuild-projections; merkle_node table; scheduled integrity checks; encrypted backups (after D-51) | QV-09 Q2; QV-28 | server/NOTES.md:94-98 "Not implemented" | L | P2 |
| E-21 T-109 (non-D-18 part) | server | Proof-of-work/L0-L3 load shedding beyond maxVerifyQueue->503; worker-thread proof verification (runs on event loop under per-election mutex) | QV-29; QV-26 | server/NOTES.md:94-96 | L | P1 |
| E-22 N-23, T-223, T-225, T-227, T-235 | repo CI | Add deps-boundaries job (scripts/check-deps.mjs), ESLint config + lint step, link checker, traceability report (scripts/trace.mjs, report-only, N-23c [ADR27]), SAST + secret scanning, DCO check, SBOM | QV-30; QV-11 G2 | scripts/ has no check-deps/trace; no eslint config (ls); .github has no codeql/semgrep/gitleaks/cyclonedx (grep); only PR template mentions DCO; ci.yml:79-80 has npm audit (partial T-225) | L | P2 |
| E-23 N-33, T-086, T-087 | board, server | Witness monitoring endpoints (QV-18 §9.5 step 2), `missing_consistency` evidence, mirror/monitor client; separate witness table | QV-18 §9; QV-32 | server/NOTES.md:147 "Not done: querying witness monitoring endpoints"; board/NOTES.md:32; witness-cosign+gossip exist (server/src/app.ts:209, gossip.ts) so only remainder open | L | P2 |
| E-24 N-42 | board, protocol | Replace board-local header encoding with QV-16 `enc`; leaf hashes change; regenerate affected vectors | QV-16; QV-18 | board/NOTES.md item 1 (not re-read at line level; UNVERIFIED at HEAD) | L | P1 |
| E-25 N-29, N-29d [ADR27: defer dealer], T-126..T-134 | trustee | trustee_accept PoP entry, localhost guided UI, network outbox, Shamir backup of passphrase, reminders; qv-ceremony image later; chaos suite (dropout/malicious dealer/replay) | QV-17; QV-ADR-024 | trustee/NOTES.md:50-51 "Not done" list | L | P2 |
| E-26 N-28 [ADR27 option C] | trustee | Amend QV-17 REQ-021 wording to the implemented age-style format; optional dice entropy via HKDF mixing; SLIP-0039 deferred | QV-17-REQ-012/021/024 | trustee/NOTES.md:22 | S | P3 |
| E-27 N-36a, N-36 [ADR27] | cli, web | Define signed release manifest (docs/19 §10); build CLI verify-client first, in-page check second (advisory); QR codes optional | QV-19 §10 | web/NOTES.md:156 "/verify-client not done"; no QR lib (grep) | L | P2 |
| E-28 W15 [ADR27] | web | SRI for lazy chunks/worker or hash-pinned CSP, plus e2e tamper test | QV-19; ADR-010 | web/NOTES.md:154 "chunks loaded by import() carry no SRI" | M | P1 |
| E-29 B3-14, B3-11a [ADR27] | web | English variant of qv.privacy.g4 for one-ballot elections (other locales fall back, never marked reviewed); auto-lock timeout wording per register | QV-13; QV-19 | web/src/i18n/en.ts:92 unconditional revote guarantee | S | P2 |
| E-30 B3-28 [ADR27] | cli, web | Key-file KDF ceiling cost (register option A) | QV-19 | UNVERIFIED (register option text not extracted) | S | P2 |
| E-31 T-188 | web | Persistent single-steward warning | QV-02-REQ-004 | grep single steward in web/src = 0 hits | S | P2 |
| E-32 T-181/T-182 remainder | web | Inclusion-proof UI + checkpoint pin file; results challenge UI | QV-10; QV-18 Q2 | Benaloh audit flow exists (web/src/flow/audit.ts), so T-181 is largely done; T-182/T-186 remainder UNVERIFIED | M | P2 |
| E-33 N-06, T-084 | board, server, docs | Make STH cadence <= MMD consistent across QV-05/07/18 (30 s vs 60 s) and implement mmd handling | QV-18; QV-07-REQ-041 | grep mmd in board/server/protocol src = 0 hits; docs conflict stated at TODO.md N-06 | M | P1 |
| E-34 N-08, N-08b [ADR27] | repo root | Create MAINTAINERS.md, docs/RELEASE-KEYS.md, docs/LICENSE-NOTE.md (stating none published, unaudited), DEPRECATIONS.md/CHANGES.md or drop references | QV-27-REQ-001; QV-34-REQ-01 | All absent (ls, 10 files) | S | P3 |
| E-35 CLAIMS-LINT-HISTORICAL [ADR27] | docs, CI | Inline claims-lint-ignore markers for preserved historical quotes; lint currently fails 20 findings (classified) and stays non-blocking | QV-11 G13 | docs/reports/next-integration-review-20261109.md:69; next-ci-20261109.md:92; markers found only in docs/10, R-01, R-02 | S | P3 |
| E-36 T-069, T-244, T-092, T-152, T-228 | protocol, board, CI | S2 10,000 randomized elections harness; fuzz harnesses (entry/checkpoint parsers, verifiers); coverage floors + mutation job | QV-11 §7; S2; G6 | protocol/test/property.test.ts has 5 seeded tests only; no fuzz/stryker/coverage config (grep) | L | P1 |
| E-37 T-118, T-045, T-144 | server, protocol, verifier | Load test 2,000 voters burst; benchmark suite cast->receipt; verifier 5,000x10 <=60 s | S12; QV-11 §8.5 | Only packages/protocol/bench/tally-bench.ts, server/bench/import-verification.ts, docs/reports/perf-2026-11-04 exist; floors/targets not enforced (UNVERIFIED) | M | P2 |
| E-38 Synchronous stages (handoff:116) | server, verifier | Move parse/replay/tally decrypt/rules stages off the event loop or add yields; per-phase timeout and replay timeout | QV-29 | docs/reports/next-server-20261109.md:77-89; next-offline-20261109.md:61-71 | L | P2 |
| E-39 Custody crash journal (handoff:116) | trustee/cli | Transaction journal + crash cleanup for abrupt kill between backup publication and live registration | QV-17 | docs/reports/next-custody-20261109.md:74-76 | M | P1 |
| E-40 B2-07 / T-112 retention remainder | server | 12-month backup retention policy; retention of purged data in backups | QV-28 §11.1 | server/NOTES.md:289-290 "not implemented"; sweeper exists (server/src/retention.ts:1-21) | M | P2 |
| E-41 T-064/T-065/T-066 | protocol, server | Challenge/dispute entries and rule path; steward extension applied; proposal hash chain | QV-03 §8; QV-04 §6; QV-02 §4 | TODO.md T-064/T-066 "Open"; control records pause/resume/invalidate exist, extension not applied (server NOTES via TODO T-065) ; code UNVERIFIED | L | P2 |
| E-42 T-051, T-050, T-053, T-048 | protocol | Invite entropy/expiry/single-use audit; salted label hash; approval and k-of-n ballot coverage; GroupRules templates + plain summary | QV-02-REQ-003/010; QV-04; QV-20 | TODO.md rows "Partial"; not re-checked in code (UNVERIFIED) | M | P2 |
| E-43 T-120, T-114 (non-D-52), T-116 | server | Tor onion-service listen profile (no external fetch); link read-key rotation (24 h default per D-53) | ADR-009; QV-09 Q8 | TODO.md T-120/T-116 Open; code UNVERIFIED | M | P2 |
| E-44 T-189, T-230 | web, CI | Reproducible builds (client + CLI), 2-builder verification, signed release manifest; SRI present | QV-19 §13; G8 | TODO.md T-189 "SRI yes; reproducible build and signed manifest not"; no repro job in ci.yml (grep of name:/run: lines) | L | P2 |
| E-45 T-041, T-040, T-070 | protocol, crypto | Complete ATK negative tests and INV property tests for proofs; RFC 8032 known-answer coverage (T-024) | QV-11 §6.1/7.1 | TODO.md "Partial"; UNVERIFIED | M | P1 |
| E-46 T-027, T-028, T-036, T-047 | crypto, protocol | Hash-to-group/second generator derivation doc+test; ElGamal rerandomize; shared Merkle leaf helpers; algorithm registry | QV-16; ADR-004 | grep rerandom in packages = 0 hits (T-028 confirmed open, B1-10); T-027/T-036/T-047 UNVERIFIED | M | P2 |
| E-47 N-43 docs UNVERIFIED markers | docs | 236 [UNVERIFIED] markers in VERIFICATION-TODO.md need primary-source checks; research log resolves ~60% (see table 3) | docs | P/VERIFICATION-TODO.md (grep -c UNVERIFIED = 236) | L | P3 |
| E-48 N-19, N-45 (docs) | docs | Define KeyId(pk) in QV-16 (N-45); reconcile retained drafts 15,17,18,19 into current specs (N-19) | QV-16; QV-18 | TODO.md N-19/N-45 "Open"; not code-verifiable | M | P3 |
| E-49 N-35, T-310, T-309 remainder | web | Add native-reviewable i18n pipeline gates; axe-style WCAG checks beyond bespoke a11y e2e | QV-13 G12 | web/e2e/a11y.ts has custom checks, no axe dependency (grep); i18n framework exists (web/src/i18n/*) so T-309 is stale | M | P3 |

(49 rows. Several rows bundle ledger ids that share one code change.)

## 2. Owner decisions pending

"Recorded default" = recommendation text in the cited ledger. ADR27 = covered by decision-log.md:334 approval (contested, see section 0). Rows are grouped where the ledger groups them.

| Decision id | Question | Options on record | Recorded default/recommendation | Engineering it blocks |
|---|---|---|---|---|
| B3-01 / ADR-028 | Registration wire contract: raw QV-09 invite_code + PoP(election_id,pk) vs QV-19 hashed invite + invite-bound PoP | A QV-09 wins; B QV-19 wins (server stores/compares H); C both versioned; D stay blocked (DECISIONS-2026-11-04.md:476-483) | ADR-028 (decision-log.md:344) adopts B but the register still says held; reports/registration-decision-20261109.md says bytes differ (server hashes encoded code text with QV-INVITE-v1 domain; web sends B(S(T)) and signs QV-REG-v1\|\|I\|\|H\|\|P); needs exact wire/signature/storage bytes, label scope and invite migration (handoff:109-112) | Real web/CLI voter registration end to end (server/src/app.ts:550-565 vs web onboarding.ts); T-163 qv enroll, T-179 |
| D-92 | Does failed coordinator manifest signature stop the pipeline when anchor matches? | A stop (TS); B continue (Python) (OPEN-DECISIONS.md:170) | OPEN-DECISIONS: B; register DIFF-manifest-signature-removed: A (records disagree) | TS verify.ts sigsOk early return; compare-verifiers.ts still exits 1; QV-35-REQ-005 |
| D-93 | Does chk.result.rules run after decrypt fails only on published-T mismatch? | A not_run; B run on recovered counts (OPEN-DECISIONS.md:171) | OPEN-DECISIONS: B; register DIFF-count-altered: A | Same differential; QV-16 App.C step 21 |
| D-94 | What does `results` hold after a failure? | A verified published only; B recomputation; C A plus `recomputed_results` (OPEN-DECISIONS.md:172) | OPEN-DECISIONS: C; register DIFF-result-flipped: A | Python moves value to recomputed_results; UI result display |
| D-95 (PY-01) | Zero-digest spoil when manifest lacks trustee mode: error code/check/class | A ALARM E_SPOIL_MISMATCH; B L E_SCHEMA; C private audit (OPEN-DECISIONS.md:173) | A in both verifiers (plus accept `false` in Python); register PY-01 recommends A [ADR27] but D-95 is not listed as approved | Ballot-level enforcement, mutation vector, Python named error (E-09) |
| D-96 (PY-02) | INCOMPLETE verdict in spec vs drop it | A add to QV-16 C8 and QV-34; B drop from TS (OPEN-DECISIONS.md:174) | A, decided with P1/TSV-05 (register PY-02 [ADR27] A) | Python INCOMPLETE (E-01) |
| D-11 | enc_share: own ECIES vs age | OPEN-DECISIONS.md:37 | Own ECIES with domain separation; age for local bundles only. Register N-28 option C [ADR27] | Trustee bundle age interoperability (vendored @noble/ciphers) |
| D-12 | Argon2id parameters/fallback | OPEN-DECISIONS.md:38 | scrypt N=2^17 until confirmed; Argon2id m=64 MiB,t=3,p=1 (floor 19 MiB/t=2); research A9 says RFC 9106 p-value cited in docs is wrong (research:38) | KDF defaults in cli/web; doc fix |
| D-14, D-89 (E-001) | Tracking-code alphabet/length | Crockford vs RFC 4648 lowercase; 20 base32+2 check vs 130-bit (OPEN-DECISIONS.md:40,137) | Two named alphabets (display vs log origin) written into QV-16; confirm | web receipt display; board/protocol origin; T-059 |
| D-15..D-16, D-19..D-23 | Weight in leaf, aggregation by anyone, hedged labels, tie-break beacon off, author KeyId, per-election keys, publish roll keys | OPEN-DECISIONS.md:41-49 | Constant weight 1; anyone aggregates; hedge in next revision; beacon disabled; author KeyId Phase 1; per-election keys; publish keys. D-19 covered by register C3 [ADR27]; rest unrecorded as approved | QV-16 freeze (T-008) |
| D-17, D-18 | Min aggregated ballots; spoil authentication | OPEN-DECISIONS.md:43-44 | >=2 oracle / default 5 (ADR-021 already adopts >=3, default 5); unsigned spoil + eligibility-bound anti-spam token | Anti-spam token implementation (T-109) |
| D-30..D-40 | Governance bounds: maxExtension 7d/stalledMax 30d, steward k-of-m, challenge attribution, sortition, display names, audit window 30d, air-gap, label visibility, max group 2,000, attachments, operator mapping | OPEN-DECISIONS.md:56-66 | As listed in ledger; none recorded as approved | N-32 bounds; T-064; T-118 target size |
| D-45..D-57 | Node line, board process, witness protocol/mmd, witness posture, CI/fuzz, verifier language, replication tool, alternate submission path, passkeys/rotation, OTS/ML-DSA, tz/browser matrix, release key quorum, in-flight migration | OPEN-DECISIONS.md:72-84 | 24 LTS dev/22 supported; same process; C2SP + mmd 60 s; hooks+1 volunteer witness; Actions+self-hosted fuzz; Python; evaluate Litestream vs VACUUM INTO; mirrors forward; rotation 24 h; optional/off; UTC+IANA; 2-of-3; unsupported | E-20 backups (D-51), E-33 (D-47), T-114 (D-52), T-231 (D-56) |
| D-86 / N-02 | Node floor `>=22.18` (package.json:10) vs `>=22.16` (QV-ADR-014) | OPEN-DECISIONS.md:134 | `>=22.18`, amend ADR-014 | none beyond doc edit |
| D-85 / N-11 | Allow cli->verifier edge? | OPEN-DECISIONS.md:133 | Amend D1 to allow the edge; register D-85 [ADR27] A | deps-boundaries job (E-22), E-18 |
| D-87 / N-12 | Control-entry shape and signature scope | OPEN-DECISIONS.md:135 | Keep verifier closed schema co-signed under manifest hash; register N-12 [ADR27] | E-04, E-06 |
| D-88 / N-14 | spoil_trustee_decrypt enabled in suite v1? | OPEN-DECISIONS.md:136 | Off in v1 | D-95, E-09 |
| D-90 / N-16, D-91 / N-21 | RateLimit header names; open/close scheduler | OPEN-DECISIONS.md:138-139 | Keep current names; no scheduler in MVP (register [ADR27] A) | none (decided if ADR27 holds) |
| D-01..D-06 (ADR-001..013) | Accept baseline ADRs, S1-S14, target group, assurance ladder, MVP boundary | OPEN-DECISIONS.md:25-30 | Accept all | decision-log.md:42-85 still "Accepted (provisional)"; T-004/T-005/T-006 spec approval pass |
| D-60..D-68 | Test-ID scheme, gating of Should/mutation, Benaloh visibility, languages, MF1, low-end device, reminders, timeout 20 s | OPEN-DECISIONS.md:90-98 | QV-TST-<AREA>-<nnn>; no Should gate; Test always offered; MF1+EFF list; Moto G + SE; opt-in; 20 s (web client already 20 s, web/src/api/client.ts:44) | T-241/T-242 traceability, T-312 locales |
| N-27 | Eligible basis and abstain | A yes+no only; B add roll basis; C B without abstain (DECISIONS-2026-11-04.md:214-221) | A [ADR27] | none if A holds (document rejection) |
| N-46 / D-52 | Alternate submission under operator censorship | OPEN-DECISIONS.md:79 | Mirrors forward signed ballots | T-114 |
| D-70..D-83 | Legal home, R1/R2 funding, bounty, licence/DCO, export, Art.9, trademark, hosting jurisdiction, WTP, cadence, dogfood, machine-checked, anonymity estimator | OPEN-DECISIONS.md:104-117 | See ledger | External gates (table 3); mostly no code |

## 3. External / human gates

| Item | Who is needed | What evidence would close it |
|---|---|---|
| Independent cryptographic/protocol review (R1) and implementation audit (R2), re-test (R8) | External reviewers/auditors + funder | Signed engagement, published full reports, findings triaged into ATK rows/vectors (T-266..T-270, T-278; handoff:116-117) |
| Second independent verifier review (G4/S1/R7; QV-35) | Independent author/team | Independent reviewer sign-off; strict differential with agreed fields (compare-verifiers still exits 1; T-147; N-44) |
| Web/server pentest (R3), supply-chain review (R4) | External pentester/reviewer | Report + fixes (T-271, T-272) |
| Native translation review for es, fr, de, pt-BR, ar | Native reviewers | Per-locale review hash map for every guarantee key; never mark reviewed without it (N-34; web/NOTES.md:153) |
| Assistive-technology/screen-reader qualification, native Arabic visual review, WCAG audit (R5) | A11y auditor + AT users | Audit report; AT test records (N-35, T-316) |
| Owner approval reconciliation (B3-01, D-92..D-94) and owner review of ADR-001..013, specs Draft->Review->Approved | Project owner | One explicit decision record (handoff:109-114); decision-log entries (T-004..T-006) |
| Protocol/security review required after owner decisions (ADR-027/028 reviews triggers) | External reviewers | Reviews recorded; ADR-028 "external protocol review required" cleared |
| Hosted CI qualification of exact candidate (PR #30), Linux/macOS/Windows x Node 22/24 | Maintainer with GitHub access/push auth | PR #30 receipt with exit statuses and job dispositions (handoff:65-99; native git push lacked authentication) |
| Branch protection, required reviews, CODEOWNERS placeholder, signed commits | Repo admin | Repo settings evidence (T-233; next-ci-20261109.md:89 "cannot be established from source alone") |
| Release key policy, key custody, signed releases (2-of-3) | Maintainers (not yet named; MAINTAINERS.md absent) | RELEASE-KEYS.md with real keys, signing ceremony (T-012, T-231, D-56) |
| SECURITY.md contact: placeholder mailbox, PGP fingerprint, private reporting enabled | Security lead/maintainer | Tested mailbox + acknowledged test report (SECURITY.md:9-14; T-264) |
| Claims register owners and wording approval (all 61 rows TBD) | PO, Comms | Owners assigned in docs/claims/claims-register-v0.md (N-07, N-09; grep TBD=61) |
| Counsel: licence/dual-licence snippets, DCO/pseudonyms, export control, GDPR roles/Art.9, ToU, trademark, hosted jurisdiction | Legal counsel | Written opinions (T-281..T-292; D-74..D-78) |
| Fiscal host, funding (R1/R2 $130k-$280k), bounty pool | Steward/PO | Host agreement, funded SOWs (T-289, T-340, T-342, T-343, R04) |
| Pilot recruitment (>=5 groups, >=3 with >=100 voters), willingness-to-pay LOIs, UX research (interviews, usability n>=10, comprehension n>=20, key-backup study) | Comms/UX | Signed pilot agreements; study reports (T-319..T-327, T-345..T-348) |
| Trustee recruitment/training, dry-run ceremony, ceremony usability | Operators, trustees | Dry-run record (T-133, T-325) |
| Self-host sysadmin trials (n>=5), operator-exit drill by external group | External sysadmins/group | Trial reports (T-296, T-299) |
| Public review call, protocol explainer review, launch plan | PO/Comms | Published call + responses (T-015, T-351) |
| [UNVERIFIED] primary-source checks still unresolved: A15/A16 RateLimit and Idempotency-Key status, A18 NIST IR 8363, A20/A21, A22, B2 noble audit reports, B10, B11 Sigsum, B12 OTS, B13 cosign, B14 SQLite STRICT, D8 Cortier citation, D11 classic refs, E5 onion secure context, F2, F6, G1, G2, G4, G5 | Researcher with network access | Fetched primary text, access date + URL in doc References (research/outstanding-research.md:134; VERIFICATION-TODO.md) |
| Windows ACL qualification and hosted Windows validation of server correction | Windows environment + maintainer | Hosted run logs (next-custody-20261109.md:86; next-server-20261109.md:115-116) |
| Dependency/licence confirmation before release (e.g. noble MIT, EFF list CC BY 3.0) | Maintainer + counsel | VERIFICATION-TODO.md rows closed; licence snapshot (P/VERIFICATION-TODO.md:25-33) |

## 4. Environment-limited

| Item | Needed environment |
|---|---|
| Required Chromium browser journeys (5 suites, QV_REQUIRE_BROWSER=1) | Host that can launch Chromium (local attempts failed with process-singleton `socket() EPERM`, handoff:92-93); hosted CI runner |
| Pseudo-locale visual workflow, Playwright 1.62.0 vs root 1.57.0 reconciliation | Browser-capable runner (next-ci-20261109.md:50,88) |
| Cross-platform matrix (Linux/macOS/Windows x Node 22/24), `ci:full-matrix` label | Hosted GitHub Actions (handoff:93) |
| Windows ACL/POSIX-mode behaviour, trustee bundle permissions | Windows host (trustee/NOTES.md:52-53; next-custody:84-89) |
| OpenSSL TLS fixture tests (server skips 8 cases if fixture generation fails) | Host with OpenSSL; read actual logs (next-ci-20261109.md:91) |
| Native git push / publication of candidate | Credentialed GitHub (handoff:97) |
| Browser/BFCache/background-tab qualification of cooperative verifier | Real browsers (next-offline-20261109.md:71) |
| Low-end device and poor-network performance (Moto G-class, older iPhone SE), cast <=3 s p95, Argon2id 64 MiB | Reference devices (D-66; T-192, T-315) |
| Load tests (2,000 voters, 5,000-ballot tally), chaos CH-01..CH-31, backup/restore RTO 1 h/RPO 15 min drills | Dedicated multi-process/host env (T-118, T-246, T-248) |
| Nightly fuzzing, self-hosted fuzz runner, mutation testing | Self-hosted runner (T-229, D-49) |
| Reproducible build two-builder verification, Sigstore/cosign signing | Two independent build hosts + signing keys (T-230, T-231) |
| Tor onion-service profile and test | Tor environment (T-120, T-295) |
| Python verifier / strict TS-Python differential | Python3 + Node (runs exist in CI; baseline run currently using the CPUs, not run here) |
| Live-server organizer publish e2e and `/events` live updates in browser | Running server + browser (web/NOTES.md:164,170) |
| Hostile filesystem rollback, flash/SSD erasure | Outside guarantee; hardware-level (next-custody:86-89) |

## 5. Stale ledger entries (ledger says open/partial, code shows done or superseded)

| # | Ledger claim | Evidence at HEAD |
|---|---|---|
| S-01 | TODO N-01 / WIKI Roadmap-and-Status.md:61,102 "typecheck failing" | TODO.md header says repaired and validated 2026-10-30 (N-01 row "Repaired"); wiki/Roadmap-and-Status.md:61,102 is stale; current status in handoff:3-7. Command results not re-run here (UNVERIFIED by execution) |
| S-02 | T-107 / N-31 "/imports not implemented" | server/src/app.ts:209 advertises features 'imports','range-export','admin','gossip'; server/NOTES.md:94 says imports/jobs/admin/gossip implemented |
| S-03 | T-309 i18n framework Open | web/src/i18n/{icu,catalogs,compiled-runtime,catalog-lint,extract}.ts exist; CI step "Scoped i18n checks" ci.yml:153-154 |
| S-04 | T-310 axe/WCAG automated checks Open | web/e2e/a11y.ts (contrast, forced-colors etc.) run by required browser journeys (ci.yml:163-184); only axe-library claim is absent |
| S-05 | T-181 Benaloh audit UX Open | web/src/flow/audit.ts, spoil-shares.ts, ui/spoil-shares.ts exist; tests spoil-shares-ui.test.ts |
| S-06 | T-194 20 s timeout E-NET-TIMEOUT Open | web/src/api/client.ts:44 timeoutMs 20_000; ballot-controller.ts:179 maps E-NET-TIMEOUT |
| S-07 | T-190 lint rules banning innerHTML/eval/localStorage secrets Open | web/test/build.test.ts:78 banned-pattern regex test (not ESLint, but enforced in test) |
| S-08 | T-225 dependency audit Open | ci.yml:79-80 `npm audit --audit-level=high` blocking; lockfile lint ci.yml:76-77 (SAST/secret scan still absent) |
| S-09 | T-089 / T-112 retention scheduler Open | server/src/retention.ts:1-25 RetentionSweeper (invite labels/contact); backups 12-month policy still not implemented |
| S-10 | T-045 benchmarks "no suite" | packages/protocol/bench/tally-bench.ts, packages/server/bench/import-verification.ts, docs/reports/perf-2026-11-04/bench-10000*.json |
| S-11 | T-110/T-245 canary test "not evidenced" | server/test/negative.test.ts and b2-fixes.test.ts contain canary tests (grep -il canary) |
| S-12 | T-086/N-33 witness HTTP flow and gossip transport not implemented | server/src/gossip.ts, app.ts:209 'witness-cosign','gossip'; remaining: monitoring endpoints (server/NOTES.md:147) |
| S-13 | B2-07 older-DB restore not detected | server/NOTES.md:179 quarantine + clear endpoint exists; floor-check completeness UNVERIFIED |
| S-14 | T-069 property tests Open | packages/protocol/test/property.test.ts (5 seeded tests); the S2 10,000-election harness is still open (E-36) |
| S-15 | N-08/T-014 "MAINTAINERS" etc. | NOT stale: files absent (confirmed) |
| S-16 | N-26 duplicate-alpha detection "Partial; rewrap invariant repaired" | TODO.md already marks repaired; not a stale-open item |
| S-17 | N-04 trustee spoil relay gaps | TODO.md: relay integrated; offline CLI collector exists (cli/src/cmd-spoil.ts); auto-POST orchestration and web presentation still open (web: spoil-shares UI exists, so web presentation is partly done; UNVERIFIED) |
| S-18 | OPEN-DECISIONS.md D-84 "web still calls /auth/*" | Still true (client.ts:219-222) - listed in table 1 as E-10, not stale |
| S-19 | NEXT-STEPS.md 7 unchecked boxes (window 2026-10-22..11-04, now past) | Whole document superseded by 2026-11-09 handoff; most outputs exist (CI ci.yml, board/crypto tests, test-vectors/) - treat as closed/stale |
| S-20 | BACKLOG.md `[ ]` boxes (163) | Refreshed 2026-10-21 (BACKLOG.md:13) before consolidation; TODO.md is the evidence-refreshed copy; neither refreshed after 2026-10-30 |
| S-21 | CONSISTENCY-REPORT row 25/32 "ROADMAP and BACKLOG do not exist" | Already struck out in the file (line 32) |
| S-22 | TODO N-40 manifests lack workspace edges | TODO.md itself marks "Declaration repaired" |
| S-23 | RISK-REGISTER.md R13 node:sqlite "release-candidate/experimental" | research C2 (outstanding-research.md:79): Stability 1.2 release candidate; status text partly current |
| S-24 | TODO N-35 "no automated forced-colors/pseudo-RTL" | TODO.md says production automated checks cover them; pseudo-locale-visual.yml exists |

Stale-entry count above: 24 rows, but S-15, S-16, S-18, S-21, S-22 are not-stale confirmations (kept to prevent re-triage); true stale-open items: 19.

## 6. Counts

Open items per table (rows, after de-duplication; one row may bundle several ledger ids):

| Table | Rows |
|---|---|
| 1 Engineering decision-free | 49 (P0: 5, P1: 19, P2: 19, P3: 6; counted from the Pri column) |
| 2 Owner decisions pending | 23 rows (covering ~95 D-/B-/N- decision ids; of which 6 explicit held/open: B3-01, D-92, D-93, D-94, D-95, D-96) |
| 3 External / human gates | 21 |
| 4 Environment-limited | 15 |
| 5 Stale ledger entries | 24 (19 true stale-open; 5 non-stale confirmations) |

Unchecked "- [ ]" boxes (grep -c '- \[ \]'; BACKLOG uses table cells so I also give grep -c '\[ \]'):

| Ledger file | `- [ ]` | `[ ]` anywhere | other status markers |
|---|---|---|---|
| docs/plan/TODO.md | 0 | 0 | Status column (Open/Partial/...) |
| docs/plan/VERIFICATION-TODO.md | 0 | 0 | 236 "UNVERIFIED" occurrences |
| docs/plan/BACKLOG.md | 0 | 163 | `[x]` 53, `[~]` 80 |
| docs/plan/OPEN-DECISIONS.md | 0 | 0 | |
| docs/plan/DECISIONS-2026-11-04.md | 0 | 0 | |
| docs/plan/ROADMAP.md | 0 | 0 | |
| docs/plan/RISK-REGISTER.md | 0 | 0 | |
| docs/plan/CONSISTENCY-REPORT.md | 0 | 0 | |
| docs/plan/NEXT-STEPS.md (extra) | 7 | 7 | stale window |
| docs/errata/spec-errata-log.md | 0 | 0 | |
| docs/research/outstanding-research.md | 0 | 0 | |
| docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md | 0 | 0 | |
| docs/reports/next-*-20261109.md | 0 | 0 | not grepped per-file for boxes beyond this; grep -c over the 5 files returned 0 |
| wiki/Roadmap-and-Status.md | 0 | 0 | |

(BACKLOG also: 293 tasks historically - Done 52, Partial 79, Open 162 per TODO.md header; the 163/53/80 above are cell counts incl. legend rows.)

## 7. UNVERIFIED summary

- Whether ADR-027 approval is authoritative for items other than B3-01/D-92..D-94.
- Code status for: E-05 (B2-16 allowlist/enum), E-14 (B2-07 floor, B2-10), E-24 (N-42), E-30 (B3-28), E-32 remainder, E-41, E-42, E-43, E-45, E-46 (T-027/T-036/T-047), E-37 targets, CP-02 PoK/DH hedging, U+061C Bidi encoding.
- Verification-by-execution of any test or typecheck (not run, by constraint).
- docs/audit/consolidation-2026-10-30.md ids cited only through DECISIONS-2026-11-04.md; the audit ledger itself was not read.
