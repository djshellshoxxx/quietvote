# QuietVote owner decision register — 2026-11-04

Status: **Approved by the project owner on 2026-11-04 (all categories A–D; B3-01 = QV-19 hashed invite + invite-bound PoP). Recorded as QV-ADR-027 and QV-ADR-028.** Compiled by AI-assisted triage of the consolidation audit ledger, TODO, OPEN-DECISIONS and current source at `1133dc1`. Every recommendation follows the existing spec text or the "recommended default" already recorded in OPEN-DECISIONS where one exists; approval is recorded in `docs/decision-log.md`.

B3-01 (registration wire contract) is listed separately: the owner held it on 2026-10-30 pending protocol review.

QuietVote remains unaudited and not for real elections.

## A. Verifier and report semantics

### P1/TSV-05 — verifyElection PASS without board log evidence

- **Question:** Should overall verdict be capped below PASS when chk.board.append_only (and/or witness) is not_run?
  - *A: cap at INCOMPLETE unless log evidence supplied or caller passes explicit opt-out (e.g. opts.allowNoLog)* — Closes silent-removal hole; breaks every PASS vector/test lacking log evidence (regenerate expected-report.json, log-layer-4v, corpus); verifier-py needs INCOMPLETE (PY-02); web verifier wording + docs/16, QV-05 updates.
  - *B: keep PASS, always print NOT WITNESSED / NO LOG CHECK caveat* — No vector churn; false-assurance risk remains in any UI that shows only the verdict.
  - *C: cap only in packages/verifier (full bundle verifier), keep protocol-layer verifyElection as pure crypto layer returning PASS* — Smaller blast radius; but protocol API still foot-gun; vectors for the verifier package change only.
- **Recommended:** A, with explicit opt-out for library callers
- **Rationale:** QV-35-REQ-004 already forbids reporting log-layer checks as pass; a PASS verdict with append-only not_run contradicts the spirit. docs/audit/HANDOFF.md:3.1 recommends (a). Add tests: bundle with a cast entry removed and no log -> INCOMPLETE (never PASS); with consistent log -> PASS; FAIL still wins. Never relabel not_run as pass.
- **Sources:** docs/audit/consolidation-2026-10-30.md:4193; docs/audit/HANDOFF.md:3.1; docs/35-second-verifier.md:48 (QV-35-REQ-004)

### TSV-04 — Verifier: board-layer throw leaves PASS reachable

- **Question:** When a bundle carries a board export but board verification is skipped or throws (also no-board, TSV-05/P1), may overall verdict be PASS?
  - *A: keep PASS + V4 not_run + caveat (status quo)* — Matches INV-17 'never pass V4 on absent input' and no-board behaviour; reader must see caveat; PASS can hide skipped log layer.
  - *B: board export present but layer threw/skipped -> FAIL (or INCOMPLETE)* — Fail-closed; no-board bundle stays PASS/INCOMPLETE per policy; new verdict semantics must be mirrored in verifier-py and CLI exit codes.
  - *C: board export present + throw -> INCOMPLETE (exit 3)* — Reuses existing INCOMPLETE state (protocol X-11, verifier NOTES exit codes); distinguishes 'not verified' from 'bad'.
- **Recommended:** C
- **Rationale:** packages/verifier/NOTES.md item 3 (V4 never passes on absent input, INV-17) and QV-16 App. C step 22 (docs/16-crypto-protocol.md:1145 'PASS only if no F-class error'): a layer that did not run produced no evidence; INCOMPLETE already exists (exit code 3) so no new state is invented. Do not pick without owner: ledger says no blanket FAIL policy invented.
- **Sources:** docs/audit/consolidation-2026-10-30.md ### TSV-04; packages/verifier/NOTES.md item 3; docs/16-crypto-protocol.md:1145

### PY-02 — verifier-py verdict is PASS/FAIL only (no INCOMPLETE)

- **Question:** Is INCOMPLETE part of the QV-16/QV-34 conformance surface (verdict enum)?
  - *A: add INCOMPLETE to QV-16 C8 + QV-34 report schema; Python implements* — Cross-verifier parity; needs spec text for when (no tally record, nothing failed), exit code 3, a vector with expected INCOMPLETE.
  - *B: INCOMPLETE is TS UX only; conformance verdict PASS/FAIL; TS maps INCOMPLETE->FAIL in conformance reports* — Spec stays minimal; TS verifier needs a conformance mode; users lose distinction.
- **Recommended:** A
- **Rationale:** A bundle with no tally is neither verified nor bad (docs/16 C8 'PASS only if no F-class error' leaves no state); verifier NOTES exit code 3 already ships. Needs QV-16 owner edit then a new vector (no-tally) in test-vectors, then Python change (S).
- **Sources:** docs/16-crypto-protocol.md:1145; packages/protocol/NOTES.md X-11; docs/audit/consolidation-2026-10-30.md ### PY-02

### DIFF-count-altered — Differential: mutations/count-altered (chk.result.rules, results)

- **Question:** After chk.tally.decrypt fails (published T differs from recovered), is chk.result.rules pass, fail or not_run?
  - *A: not_run (TS)* — Fail-closed; never certify results on an unverified decryption; Python needs _stop on any decrypt failure.
  - *B: evaluate with recovered counts (Python)* — More diagnostics; risk a FAIL report carries a seemingly valid result.
- **Recommended:** A
- **Rationale:** Extends QV-35-REQ-005 principle and QV-16 App C step 19-21 ordering (C6 before C7) and QV-35-REQ-003 'no check pass without evidence' (docs/35:47). Fix: Python election.py near line 563-578 _stop chk.result.rules when chk.tally.decrypt failed; amend REQ-005 + errata PY-007; no vector expectation changes.
- **Sources:** docs/35-second-verifier.md:47,49; docs/16-crypto-protocol.md:1106-1145

### DIFF-manifest-signature-removed — Differential: mutations/manifest-signature-removed (11+ fields)

- **Question:** After the coordinator manifest signature fails (hash anchor OK), does the verifier continue and report downstream checks or stop with not_run?
  - *A: stop, downstream not_run (TS)* — Unauthorised manifest = no election to verify; consistent with hash-mismatch rule; Python must _stop after sig failure.
  - *B: continue (Python)* — Diagnostics but a bundle with unauthorised manifest yields rich 'pass' checks; verdict still FAIL.
- **Recommended:** A
- **Rationale:** docs/34 s9.1 chk.manifest.sig 'Organizer signature valid'; every other check's meaning depends on an authorised manifest (docs/16 App C step 2 precedes all). Same principle as REQ-005/PY-006. Fix: Python election.py around manifest sig check (~278-303) -> _stop(ALL_AFTER_MANIFEST excluding hash). Amend REQ-005 to say 'anchor or signature failure'.
- **Sources:** docs/16-crypto-protocol.md:1111 (C1 step 2); docs/34-test-vectors-conformance.md s9.1; docs/35-second-verifier.md:49

### DIFF-result-flipped — Differential: mutations/result-flipped (results field only)

- **Question:** When published results fail verification, does the report's results field carry nothing, the recomputed results, or the published results?
  - *A: empty (TS)* — A failing report never contains an outcome that could be misread as authoritative.
  - *B: recomputed results* — Useful for auditors; label must make clear unverified.
- **Recommended:** A
- **Rationale:** Conservative and matches 'results only verified' design in TS (verify.ts:574-575). Python change: election.py:655 only set out['results'] when chk.result.rules passes. Record in QV-35 REQ-003 note + errata PY-007.
- **Sources:** docs/35-second-verifier.md:47; docs/16-crypto-protocol.md C7/C8

### DIFF-unknown-field-in-tally — Differential: mutations/unknown-field-in-tally (aggregate, decrypt, rules, results)

- **Question:** Is a record rejected for unknown fields still used as evidence for aggregate/decrypt/rules checks?
  - *A: no, treated as absent -> dependent checks not_run (TS)* — Consistent with closed-schema rejection; Python must stop after tally schema failure.
  - *B: yes, verify remainder (Python)* — More diagnostics; verifier trusts values from a record it declared malformed.
- **Recommended:** A
- **Rationale:** QV-16 5.5 item 7 (closed schema) plus QV-35-REQ-003 'no pass without evidence'. Vector lists only fail set so it does not force B. Change Python (election.py tally schema branch ~505-515) and amend errata PY-007 'rest of tally still verified'.
- **Sources:** docs/16-crypto-protocol.md s5.5 item 7; docs/errata/spec-errata-log.md QV-ERR-PY-007

### N-17 — Second-verifier errata QV-ERR-PY-001..015 need QV-16 owner resolution

- **Question:** Owner (Proto) must rule per erratum; batch ruling proposed: adopt vector-implied behaviour for 001-004,006-010,012,014,015; fix canary expectation (005: decrypt=fail or not_run, rules per rule); define leaf encoding for 013.
  - *A: amend spec to match vectors/Python choices where vectors are consistent* — No vector regeneration except 005 and 013; fastest to G4 evidence.
  - *B: amend spec independently, regenerate vectors* — Cleaner spec, but all hashes/signatures regenerate (also fixes N-18 once) and TS+Python change.
- **Recommended:** A
- **Rationale:** Errata log header: entries 'reported, not resolved: spec owner decides'; 'None of these entries required changing a vector or TS code'. 005 is genuinely contradictory (canary cannot have decrypt=pass per QV-34 s9.1 #9), so 005 must be fixed on the canary side, never by weakening the check. Do not mark errata resolved without owner.
- **Sources:** docs/errata/spec-errata-log.md QV-ERR-PY-001..015; docs/34-test-vectors-conformance.md s8.2 step 4

### P10 — Duplicate election-open/close markers are class L, first wins

- **Question:** Should a second election-open/close marker whose body differs from the first be F, with byte-identical repeats staying L?
  - *A: differing duplicate = F E_MARKERS; identical = L (P3 rule)* — Detects coordinator marker equivocation; benign re-post tolerated; possible vector regeneration only if corpus has duplicates (none known).
  - *B: any duplicate = F* — Strict; breaks idempotent re-append.
  - *C: keep L* — Equivocation silently ignored, first wins.
- **Recommended:** A
- **Rationale:** Consistent with P3 precedent already adopted in the verifier and with QV-ADR-015 binding of election-open (open referenced by seq): the window is integrity-critical. Acceptance: tests duplicate-identical -> verdict unchanged PASS with L finding; duplicate-differing (e.g. different opens_at) signed by m coordinators -> FAIL with F E_MARKERS; same for election-close; verifier-py parity if it models markers.
- **Sources:** docs/audit/consolidation-2026-10-30.md:4403; packages/protocol/test/second-wave.test.ts:23 (P3 precedent)

### BC-02 — board verify witness policy default (bundle self-attested)

- **Question:** For standalone board bundles with no --witness-policy, require the flag, downgrade VERIFIED to PARTIAL (exit 3), or keep current warning-only behaviour?
  - *A: downgrade to PARTIAL (exit 3, incomplete) when policy comes from bundle* — Mirrors log-key rule; cli.test.ts:307 must now pass --witness-policy to get VERIFIED (a strengthening, not weakening); docs/CLI help updated.
  - *B: require --witness-policy (usage error exit 2)* — Strictest; breaks quick inspect workflows.
  - *C: keep warning only* — Forged bundle claiming quorum 0 + none_acknowledged still gets VERIFIED.
- **Recommended:** A
- **Rationale:** QV-18-REQ-020 (docs/18-bulletin-board-transparency.md:85) says witnessed status is computed from the manifest policy only, so a bundle's own copy is attacker-controlled; same logic already applied to log key. Acceptance: tests: no flag + clean bundle -> PARTIAL/exit 3 with self-attested warning; with --log-key + --witness-policy + author keys -> VERIFIED; tampered -> FAILED; election-bundle path unchanged.
- **Sources:** docs/audit/HANDOFF.md:3.1; docs/audit/board-cli.md BC-02; docs/18-bulletin-board-transparency.md:85

### B1-02 — verifier-py non-ballot record anomalies fatal vs TS class L

- **Question:** Which record-class table is normative for non-ballot anomalies (QV-16 §5.20): fatal or L (log-only finding) per anomaly, and what are control-entry scope/shape (D-87, QV-ERR-PY-007, SG7)?
  - *A: Py mirrors TS (L for unknown/malformed non-ballot + bad-sig markers, first validly signed marker wins, identical repeat tally = dup)* — Fixes 5 false-FAIL vectors (pause-resume, E11, E7, E13-C3, E17). Lets log appenders add noise but not flip verdict; needs spec table + mutants in both verifiers.
  - *B: TS tightens to Py (all fatal)* — Any appended junk fails honest election (DoS); breaks shipped pause-resume vector.
  - *C: Split per anomaly* — Most precise; slowest; needs per-row owner sign-off.
- **Recommended:** A. D-87 (docs/plan/OPEN-DECISIONS.md:135) already proposes keeping verifier's closed control schema {body:{proto,type:'control',action,reason?}} co-signed under manifest hash; shipped vector log-layer-4v/notices/pause-resume.bundle.json is TS-PASS so the reference is the de-facto contract. Record classes written into QV-16 §5.20.
- **Sources:** docs/audit/consolidation-2026-10-30.md#B1-02; docs/plan/OPEN-DECISIONS.md:135

### B1-05 — Bidi-control set differs TS vs Py (U+061C)

- **Question:** Is U+061C (Arabic Letter Mark) in the normative bidi-reject list (SG8, QV-ERR-PY-012)?
  - *A: Exclude (QV-13-REQ-082 list exactly); Py drops U+061C* — Matches accepted text docs/13-accessibility-localization.md:259; ALM text accepted.
  - *B: Include; add U+061C to TS + amend REQ-082 and QV-13 line ~326* — Stricter (UAX#9 bidi control); needs spec amendment + vectors.
- **Recommended:** A unless owner amends QV-13: REQ-082 does not list U+061C and QV-13:326 demands identical rules, so spec text wins; do not invent Unicode policy. Cross-check Unicode UAX #9 Bidi_Control property (includes 061C) if choosing B.
- **Sources:** docs/audit/consolidation-2026-10-30.md#B1-05; docs/13-accessibility-localization.md:259

### B1-07 — Honest-election verdict disagreements TS vs Py from open errata

- **Question:** Owner-approved semantics for QV-ERR-PY-003/009/010 and SG1/2/3/5/6 (and 006/007/015).
  - *A: Adopt TS reference reading as normative per erratum, port to Py, add vectors* — Fast; risks enshrining TS bugs; each needs spec text.
  - *B: Per-erratum owner ruling, then both impls change* — Slow, correct; vectors regenerated with explicit approval.
- **Recommended:** Per erratum, adopt the TS reference reading where the spec is silent; record each ruling in the errata log and add vectors; election-outcome rules (quorum, winner order, ties) listed individually.
- **Sources:** docs/audit/consolidation-2026-10-30.md#B1-07

### B1-08-open — Manifest validation remaining owner gates (bounds, witness policy, ties)

- **Question:** Normative numeric bounds, witness schema/quorum rules, tie restrictions per method (SG10/12, QV-ERR-PY-014).
  - *A: Adopt TS limits as normative, Py matches* — Consistent; bounds then frozen.
  - *B: Owner sets new bounds* — Both change.
- **Recommended:** A where TS limits are derived from spec; otherwise owner ruling. Bidi covered by B1-05.
- **Sources:** docs/audit/consolidation-2026-10-30.md#B1-08

### PY-01 — verifier-py rejects spoil_trustee_decrypt manifests with generic E_SCHEMA

- **Question:** D-88: is trustee-decryption spoil mode (QV-ADR-020, QV-16 5.13.4) in suite v1?
  - *A: off in v1 (D-88 default)* — Python: accept flag=false, reject flag=true with named code (e.g. E_UNSUPPORTED/ERR_UNSUPPORTED_VERSION-class) ; TS keeps code behind flag. Small change, closes PY-01 under REQ-012 option 2.
  - *B: on in v1* — Python must implement cp-dec-spoil + Lagrange + bit recovery (M/L) and trustee-mode vectors must exist; large independent-implementation work.
- **Recommended:** A
- **Rationale:** D-88 proposed default 'off in suite v1 (the ADR's own default)'; REQ-012 explicitly allows named-error rejection. Once A is approved the Python change is S: in manifest.py add spoil_trustee_decrypt as optional bool; if true raise QVError with a registered/named code; add test in verifier-py/tests; document in verifier-py/README.md. Do not implement before D-88 owner approval.
- **Sources:** docs/35-second-verifier.md:56; docs/plan/OPEN-DECISIONS.md:136

## B. Protocol and cryptography registry

### CP-02 — cp-dec-nonce hedge omits ciphertext (A,B) (also C2, HANDOFF 3.1)

- **Question:** Amend QV-16 cp-dec-nonce registry field list to bind the statement (A,B) (and M) in decProve, or keep (s_j,ctx,cid,oid,rand32) and document the failed-RNG residual?
  - *A: add pt(A), pt(B) to cp-dec-nonce fields (registry erratum)* — Closes same-oid/different-aggregate nonce reuse under failed RNG. Prover-side only; verifiers (TS, verifier-py) unchanged since u never transmitted. Frozen vectors that embed decProve proofs generated via vecrng change bytes -> regenerate, review diff. Spoil path: either also fold alpha/beta or keep E-12 (ballotCode already commits ciphertexts).
  - *B: keep registry, document residual* — No vector churn; exposure stays (needs RNG failure AND two decryptions of different aggregates same ctx/cid/oid). REQ-013 hedge weaker than statement-bound.
  - *C: A plus hedge all prover nonces (PoK/DLEQ/keyconf) in one registry revision* — Resolves CP-02 and C3/OQ-7 together; larger vector regeneration; one spec revision.
- **Recommended:** C: add pt(A), pt(B) to cp-dec-nonce and hedge PoK/share-key/DH nonces in one registry revision (with C3); regenerate vectors once (prover side only).
- **Rationale:** RFC 6979 s3.2 / RFC 8032 s5.1.6 derive the Schnorr/EdDSA nonce from the secret AND the message/statement precisely to prevent nonce reuse across different messages; hedged variants keep that input. Repo precedent: spoil path already added the ballot code (E-12) for this reason. Verifier-compat unaffected. Acceptance tests once approved: constant-RNG test with same ctx/cid/oid, different (A,B): decProve nonces differ (s1-s2 != (c1-c2)*sj); decVerify still passes; update docs/16 registry rows 188/712; regenerate vectors via packages/protocol/test/vecgen/generate.ts.
- **Sources:** docs/audit/consolidation-2026-10-30.md:3974; docs/audit/HANDOFF.md:3.1; docs/16-crypto-protocol.md:188,712; RFC 6979 s3.2; RFC 8032 s5.1.6

### B1-12 — CP-02 decryption nonce repeats with failed RNG and changed aggregate

- **Question:** Add the aggregate (A,B or ciphertext) to the cp-dec-nonce field list, changing the registry label spec (E-12 precedent)?
  - *A: Append aggregate bytes to cp-dec-nonce fields* — Closes the failed-RNG leak; prover-only nonce so verifier unaffected, but registry/spec text and any vectors that fix rng change.
  - *B: Keep, document RNG requirement; add nonce-registry/guard* — No spec change; weaker, relies on RNG health.
- **Recommended:** Same as CP-02 (one registry revision).
- **Sources:** docs/audit/consolidation-2026-10-30.md#B1-12; packages/crypto/src/proofs.ts:214-222

### C3 — PoK / share-key / DH nonces from plain CSPRNG (OQ-7, D-19, T-043, N-41)

- **Question:** Approve registry labels/field lists for hedged PoK, share-key PoK and DH-reveal nonces (e.g. pok-nonce, pok-share-nonce, cp-dh-nonce) or keep plain CSPRNG?
  - *A: add three hs_nz labels hedged with (secret, manifest/ctx, indices, statement point, rand32)* — Defence in depth vs failed RNG; prover-only, verifiers unaffected; vecgen outputs using vecrng change -> regenerate; docs/16 registry update.
  - *B: keep CSPRNG, record as accepted* — No churn; PoK reuse under failed RNG leaks dealer secret a_k.
  - *C: batch with CP-02 into one registry revision* — Single vector regeneration.
- **Recommended:** Batch with CP-02 (one registry revision): hs_nz labels hedged with secret, ctx, indices, statement point, rand32.
- **Rationale:** D-19 spec-author default already 'add in next revision'; same mechanism and review as CP-02; Schnorr nonce reuse leaks the secret exactly like EdDSA (RFC 8032 s5.1.6 / RFC 6979 motivation). Tests after approval: constant-RNG proofs for different statements yield different nonces; verify unchanged.
- **Sources:** docs/16-crypto-protocol.md:949 (OQ-7); docs/plan/OPEN-DECISIONS.md:45 (D-19); docs/plan/TODO.md:158 (T-043)

### V13-control-entries — V13: pause/resume/invalidate control entries not interpreted (HANDOFF 3.2 #2; N-13)

- **Question:** What does V13 mean in v1: (i) authorisation-only check, (ii) full effect semantics (pause credit moves window, invalidate => verdict), or (iii) documented out of scope for v1?
  - *A: authorisation + terminal effect only* — V13 = pass/fail on authority (coordinator/steward m-of-n per manifest), unauthorised control entry => F; invalidate/cancel/abort => verdict not PASS (INVALID/FAIL class decided by owner); pause/resume stay non-window-moving (matches QV-16 s5.14.3). New vectors + verifier-py parity; steward key set must be defined in manifest.
  - *B: full semantics incl. QV-03 s9 halt credit* — Needs QV-16 amendment of the close bound and max_halts/max_total_hours caps; largest change.
  - *C: mark V13 out of scope for v1 in QV-05/QV-34, keep not_run + caveats* — No code; REQ-010 must be amended; V13 permanently not_run.
- **Recommended:** A
- **Rationale:** ADR-022 (docs/decision-log.md:298-303) already fixes authority (operator never pauses/invalidates; steward k-of-m) and a coordinator-key check exists; window credit conflicts with QV-16 s5.14.3 so defer (B) until OQ-9 resolved. Owner must still choose verdict class for invalidate and whether authority is steward k-of-m (multi-sig) vs coordinator single key. Never turn not_run into pass without a real check.
- **Sources:** docs/audit/HANDOFF.md:3.2 #2; docs/plan/TODO.md:56 (N-13); docs/decision-log.md:298 (QV-ADR-022); docs/05-ballot-protocol.md:186

### N-13 — V13 (steward/operator authorisation, control entries) always not_run

- **Question:** D-87: control-entry record shape/signature scope (pause, resume, invalidate, security-notice, waiver, extension).
  - *A: keep verifier reading (closed schema {body:{proto,type:'control',action,reason?}}, co-signed under manifest hash); server conforms* — Unblocks V13 in verifier (implement step: apply pause/resume/invalidate to window/validity) ; server change needed.
  - *B: adopt server reading* — Verifier logcheck.ts + log-layer vectors (notice-* group) regenerate.
- **Recommended:** A
- **Rationale:** OPEN-DECISIONS.md:135 D-87 proposed default keeps verifier's reading (protocol NOTES X-31/X-33, QV-ADR-022). Then V13 implementation is M (parse control entries, apply effects, tests); until then not_run is correctly honest.
- **Sources:** docs/plan/OPEN-DECISIONS.md:135; docs/decision-log.md:298; docs/plan/TODO.md N-13

### N-12 — Control-entry record shape/signature scope (D-87)

- **Question:** Ratify control record = {proto,type:'control',action,reason?} multi-signed over sig-record(manifest_hash,'control',body) with actions pause,resume,invalidate,security-notice,witness-waiver,extension,audit-close,cancel,abort, and amend QV-16/QV-18 accordingly?
  - *Ratify current server+verifier reading (recommended)* — Spec edits only; add vectors; verifier-py must match; unblocks N-13 (V13 control authorisation).
  - *Switch scope to ctx or add nonce/freshness* — Server, verifier, protocol, vectors, verifier-py all change; fixes cross-entry replay concerns (B2-05 freshness) but larger blast radius.
- **Recommended:** Ratify current reading, track replay/freshness separately under B2-05
- **Rationale:** Spec gap, not an engineering one. D-87 recommendation: keep verifier's closed schema {body:{proto,type:'control',action,reason?}} co-signed under manifest hash (protocol NOTES X-31). Signing under manifest hash binds to the election but not ctx; accept explicitly. Need owner/protocol edit to QV-16 5.14.3 and QV-18 5.2.
- **Sources:** docs/plan/OPEN-DECISIONS.md:135 (D-87); packages/protocol/NOTES.md X-31..X-33; packages/server/src/election.ts:894-900; packages/protocol/src/logcheck.ts:140,201; docs/plan/TODO.md N-12,N-13

### B2-05 — Control records replayable (no freshness binding)

- **Question:** How are m-of-k control bodies bound to state so old signatures cannot be replayed, while still allowing repeated legitimate pause/resume/notice?
  - *A: signed after_seq (tree size / last control seq) field; server rejects if != current head control seq* — Strong replay and ordering protection; legit repeats allowed since seq changes; signers must re-sign if another entry lands first (liveness friction); new field in schema, verifiers, vectors.
  - *B: per-action nonce/counter (control_seq must equal prior control_seq+1)* — Total order of controls independent of ballot traffic, no re-sign on ballot arrival; needs derivable state in verifiers; simple dedup.
  - *C: reject exact JCS-body duplicates only* — No wire change but blocks identical legit repeat pause/resume/notice (ledger explicitly rejects silently choosing this).
- **Recommended:** B: monotonic signed control counter (`control_seq` = previous + 1), checked by server and both verifiers; new negative vectors, existing vectors unchanged.
- **Sources:** docs/audit/consolidation-2026-10-30.md ### B2-05 (lines 351-395); packages/server/src/records.ts:33; packages/server/src/election.ts control handling (~897-950)

### N-27 — Eligible/roll basis and abstain options not implemented

- **Question:** Which basis set does suite v1 support: yes+no only, or also roll (eligible voters) and abstain as a counted option?
  - *A: v1 = yes+no only; reserve roll/abstain for suite v2* — No change; document rejection as designed; verifiers stay simple.
  - *B: add basis 'roll' per QV-20, amend QV-16 5.19.3* — Rules engine + Python rules.py + vectors + manifest schema change; threshold denominator uses roll size; abstain option semantics (ballot encoding) also needed.
  - *C: B without abstain option* — Smaller; abstain stays out; 'roll' basis equals non-voters count as implicit no.
- **Recommended:** A
- **Rationale:** Lowest risk before audit: freezes surface; owner to confirm since QV-20 vs QV-16 conflict is a spec decision (CONSISTENCY-REPORT row 10). If B/C chosen, protocol amendment first then regenerate vectors.
- **Sources:** docs/plan/TODO.md N-27; packages/protocol/NOTES.md X-18; docs/16-crypto-protocol.md:774

## C. Server, operations and dependency policy

### B2-07 — Older-DB restore not detected; second root signed for same size

- **Question:** What trusted anchor records the last signed (size, root) outside the election DB, and what is the recovery policy when the DB is behind it?
  - *A: control.sqlite high-water per election (size, root, written before checkpoint release); refuse append and quarantine if DB behind* — Cheap, catches single-file restore; control.sqlite restored together with election DB defeats it; needs crash ordering (write-ahead of signing).
  - *B: A plus poll configured witnesses/gossip peers at start and take max* — Catches whole-disk restore if a witness holds newer cosigned head; adds network dependency at boot and a trust policy for witness lists.
  - *C: operator-attested restore command that records rollback evidence and resigns nothing* — Explicit human policy; slower recovery; needs new admin API.
- **Recommended:** B with A as local floor; quarantine (read-only) on mismatch, never silently continue. Grounded in QV-18 REQ-053 rollback guard already referenced at board/src/log.ts:227 and witness model (docs/18 section 9). Needs independent review of crash ordering.
- **Sources:** docs/audit/consolidation-2026-10-30.md ### B2-07 (457-); packages/server/src/election.ts:128-166; packages/board/src/log.ts:227

### B2-10 — Invite expiry default, unknown/used oracle, cross-invite idempotency

- **Question:** Default invite lifetime and error policy: distinguish 409 INVITE_USED / 422 INVITE_EXPIRED (docs/09:133,137,146) or uniform failure (docs/04:97 asks unknown to match USED response time)?
  - *A: default TTL 14 days (docs/02:99 QV-02-REQ-010) + keep distinct USED/EXPIRED codes; make unknown indistinguishable from USED (same code, constant-ish time) per docs/04:97* — Matches both specs largely; used-vs-unknown oracle closed; expired still distinguishable (low leak).
  - *B: one generic 422 for unknown/used/expired/revoked* — Max anti-oracle; violates docs/09 error table and test expectations, needs errata.
  - *C: keep null default expiry* — Contradicts QV-02-REQ-010; permanent bearer tokens.
- **Recommended:** A. Same-pk retry on a used invite already returns original (docs/09:146, app.ts:557); cross-invite existing-key 201 requires invite-to-voter linkage decision (do not persist linkage without privacy review). Registration also blocked by B3-01.
- **Sources:** docs/02-product-requirements.md:99; docs/04-identity-eligibility.md:97; docs/09-api-data-contracts.md:133,137,146; packages/server/src/app.ts:484,553-564

### B2-12 — Zero-seed placeholder key signs duplicate receipts on keyless runtimes

- **Question:** What does a duplicate submission return on IMPORTED/keyless ARCHIVED runtimes where no log key exists?
  - *A: 409 (or existing LOG_UNAVAILABLE 503 read-only) for any append on keyless runtime, duplicates included* — Smallest, no schema change; clients lose idempotent receipt retrieval on archives.
  - *B: return stored original receipt (persist promise signature at first issue) * — Faithful idempotency; needs storing promise sig per entry (schema migration) and cannot serve entries from imports that never had one.
  - *C: inclusion proof without promise with explicit schema* — Informative; new receipt schema variant in docs/09 and clients/verifiers.
- **Recommended:** A as interim minimum (never sign with zero seed: make BoardLog secretKey optional and throw in getReceipt promise-sign when absent), B later. Rationale: the ledger forbids silently changing receipt schema/authority; zero-seed signing is always wrong.
- **Sources:** docs/audit/consolidation-2026-10-30.md ### B2-12; packages/server/src/election.ts:146,633-637; packages/board/src/log.ts:141

### B2-16 — Request log timestamps/fields outside QV-31 allowlist; free-text control reason

- **Question:** Conform to docs/31 allowlist strictly (minute ts, dur_bucket, no election_id/bytes/request_id) or amend docs/31 to approve the current fields; and keep or drop public free-text reason?
  - *A: conform: coarse=true for all request lines, replace latency_ms with dur_bucket, drop bytes_in/request_id/election_id from logs, add field-drop + canary test (QV-31-REQ-001/008)* — Spec-conformant; loses per-request debugging, aggregate signals via metrics only.
  - *B: amend docs/31 allowlist via privacy-review PR to include current fields* — Keeps operability; weaker timing privacy; needs documented review (docs/31:81).
  - *C: reason -> enumerated codes only* — Closes free-text public leak; wire change in control record schema.
- **Recommended:** A plus C-lite (reason accepted but constrained to a catalog enum). Cites docs/31:19,22,50,87,94 and docs/31:82. Dropping the field set is code-only but the reason constraint is a record change, hence owner gate.
- **Sources:** docs/31-telemetry-observability.md:19,22,50,81-94; packages/server/src/logger.ts:31-40; packages/server/src/http.ts:448-452; packages/server/src/records.ts:33

### N-21 — Advisory open/close scheduler

- **Question:** Is an automatic open/close scheduler in scope, given the manifest has no closer key?
  - *A: not in MVP; coordinator posts election_open/election_close manually* — No change; closes at human latency.
  - *B: manifest names a `closer` key; server scheduler holds it, can only close (docs/18:222)* — Spec-supported auto-close; new key custody, manifest/verifier checks (created_at >= closes_at-24h advisory).
  - *C: scheduler for open too (docs/03:178 T3 system scheduler)* — Needs an opener key not defined in manifest; larger protocol change.
- **Recommended:** A for MVP (matches D-91 default); B post-MVP since docs/18:222 defines it.
- **Sources:** docs/plan/OPEN-DECISIONS.md:139; docs/18-bulletin-board-transparency.md:222; docs/03-governance-and-policy.md:178

### N-32 — State/parameter gaps: CHALLENGED, max_total_hours, RESUME new close, IPv6 /56, archive export-ack

- **Question:** Which gaps are implemented now? Sub-items: (a) IPv6 /56 per QV-29, (b) archive delete requires export acknowledgement per docs/28 s11.2, (c) max_total_hours pause cap, (d) RESUME with new close_at, (e) CHALLENGED producer.
  - *A: implement (a) and (b) now (spec settled), defer c/d/e to protocol decision* — (a) change v6Prefix64 to /56 with test; (b) add export_record.acknowledged_at + 30-day grace per docs/28:540; c/d/e remain gaps.
  - *B: all five together after protocol spec for RESUME/CHALLENGED* — Complete but blocked on owner on semantic fields; interacts with B2-05 control freshness.
- **Recommended:** A: (a) and (b) are pure spec-following engineering; c/d/e need B2-05 control-record design first. Do not change vectors.
- **Sources:** docs/plan/TODO.md:82; docs/28-data-model-storage.md:540; packages/server/src/ratelimit.ts:111,132; packages/server/NOTES.md:42-52

### N-16 — Rate-limit header names (E-002 / D-90)

- **Question:** Keep early-draft names or switch to current draft names?
  - *A: keep until the draft is final (D-90 default)* — Stable for clients; may need later migration.
  - *B: emit both old and new names for a transition* — Compatible; slight header bloat; new-name syntax may still change before RFC.
  - *C: switch now* — Churn risk if draft changes again.
- **Recommended:** A, per OPEN-DECISIONS.md:138 and errata E-002 (spec-errata-log.md:46). Revisit when draft becomes an RFC; then B for one release.
- **Sources:** docs/plan/OPEN-DECISIONS.md:138; docs/errata/spec-errata-log.md:46; packages/server/src/http.ts:302,314-316

### N-20 — Organizer/admin auth mismatch (D-84)

- **Question:** Accept D-84: QV-08 QV-Sig signed requests as the sole organizer/admin auth, retire QV-09 challenge/session bearer?
  - *QV-08 signed requests (recommended)* — Rewrite docs/09 section 3.2 + REQ-005/006; delete authChallenge/authSession/setSessionToken/Challenge/Session types from web; no server change.
  - *QV-09 bearer sessions* — Implement /auth/challenge,/auth/session, session store, rotation, revocation on server; rewrite QV-08 section 7; new attack surface; web signing code replaced.
- **Recommended:** QV-08 signed requests
- **Rationale:** OPEN-DECISIONS D-84 proposes QV-08 signed requests (recommended there: already implemented and negative-tested; no session store or bearer to leak; +-120 s window plus nonce cache; QV-08 section 7 REQ-019, QV-ADR-P08-4). Doc rewrite changes a normative spec so owner must accept; the dead-code removal is safe after acceptance.
- **Sources:** docs/plan/OPEN-DECISIONS.md:125 (D-84); docs/plan/TODO.md N-20; packages/web/src/api/client.ts:63,200-204; packages/web/NOTES.md Decisions and deviations

### D-85 — Dependency rule D1: allow cli->verifier edge or extend qv-verify

- **Question:** Amend D1 to allow exactly the edge cli->verifier, or extend qv-verify so the CLI spawns it?
  - *A: amend D1: allow single edge cli->verifier* — Zero code; keeps one verdict pipeline; D5 protects verifier independence; must add deps-boundaries check encoding the exception.
  - *B: spawn qv-verify, add board anchor flags/loader to verifier* — Strict D1; changes output/exit contracts of four CLI commands and expands verifier CLI surface (packages/cli/NOTES.md option 1).
  - *C: move verifyBundle/loadBundle into protocol/board* — Changes verifier package identity; largest change.
- **Recommended:** A
- **Rationale:** Preserves single independent verdict pipeline (QV-08 D5, ADR-001 principle 1) as cli NOTES argue; a duplicated pipeline can drift. Record exception in docs/decision-log.md and implement deps-boundaries script.
- **Sources:** docs/plan/OPEN-DECISIONS.md:133; packages/cli/NOTES.md D1 section; docs/08-architecture-deployment.md sec 5.1

### N-39c — CLI: qv trustee subcommands delegating to trustee package

- **Question:** How should `qv trustee` reach trustee code without breaking D1/ADR-024 isolation?
  - *A: spawn the qv-trustee binary as child process* — No import edge, secrets stay in the offline binary, trivial S-size; requires binary on PATH and arg passthrough only.
  - *B: amend D1 to allow cli->trustee import* — Single front-end, but CLI process links trustee secret-handling code and widens D1 exceptions beyond D-85.
  - *C: no `qv trustee`; docs point to qv-trustee only* — Closes T-168 as won't-do; no unified UX.
- **Recommended:** A: spawn qv-trustee (and decide together with D-85).
- **Rationale:** Keeps D1 intact and honors QV-ADR-024 (docs/decision-log.md:310, trustee secrets only in offline qv-trustee); passthrough adds no policy.
- **Sources:** docs/08-architecture-deployment.md sec 5.1; docs/decision-log.md:310; docs/plan/BACKLOG.md:210

## D. Web, trustee and documentation

### B3-06 — PAUSED phase handling / API error args in ballot path

- **Question:** Should web derive PAUSED from signed pause/resume control entries, and what authority/freshness rule applies (who may pause, what if operator withholds a newer resume/pause)?
  - *A: derive from verified log control entries* — Add 'paused' Phase + copy + gate; must verify author against manifest steward/trustee delegation (QV-ADR-022). A withheld RESUME or PAUSE leaves stale phase; need STH-freshness bound (QV-07-REQ-041 60s STH while OPEN/PAUSED).
  - *B: server-reported machine reason only* — Cheap, server can lie (operator may only hold/notify per QV-ADR-022); UI hint only, never authoritative.
  - *C: keep generic 'not accepting ballots right now' copy* — No new policy; voter doesn't learn it is a pause. Current behaviour.
- **Recommended:** A, gated on STH freshness
- **Rationale:** QV-ADR-022 (decision-log.md:298) and QV-07-REQ-082 (07-threat-model-security.md:613) settle that pause is a signed steward control entry and operator cannot pause; logcheck.ts:129 already classifies pause/resume as notices. Open piece is freshness/authority-verification policy plus UX copy, so owner confirmation needed. Meanwhile an S decision-free piece: make remaining throw sites t('qv.err.*') pass args (api/errors callers) with a test.
- **Sources:** docs/decision-log.md:298; docs/07-threat-model-security.md:162; docs/07-threat-model-security.md:567; docs/audit/consolidation-2026-10-30.md:2637

### B3-11a — Auto-lock: QV-13 vs QV-19 timeout wording

- **Question:** Is the 10-minute default lock (QV-19) accepted as compliant with QV-13-REQ-007 (which constrains only >15 min sessions), or should spec text be harmonised?
  - *A: keep 10 min, amend QV-13 note* — No code change; 10 min is stricter than 15 and warning+extend already present. Doc-only.
  - *B: change to 15 min* — Longer exposure window of unlocked signer; weaker than QV-19 security default.
  - *C: configurable (10 default, <=15 cap) setting* — UI settings surface + test; matches QV-19 'configurable'.
- **Recommended:** A
- **Rationale:** docs/13-accessibility-localization.md:69 only mandates a warning for sessions over 15 min; shorter lock does not violate it; docs/19-client-supply-chain.md:72 sets 10 min. Never lower the idle bound.
- **Sources:** docs/13-accessibility-localization.md:69; docs/19-client-supply-chain.md:72; packages/web/src/key/lock.ts:28

### B3-14 — One-ballot elections vs unconditional qv.privacy.g4 revote guarantee

- **Question:** What is the approved guarantee-4 wording for elections whose manifest allows one ballot per voter?
  - *A: conditional variant g4 key chosen by manifest max_per_voter* — Truthful in both modes; new normative copy in all 6 locales, non-English must be native-reviewed; guarantee set changes need owner sign-off.
  - *B: keep g4 unconditional, add adjacent one-ballot note* — Current state; page still contradicts itself for one-ballot elections.
  - *C: forbid max_per_voter=1 in v1* — Resolves copy conflict, removes spec feature QV-04-REQ-008 'first when single'.
- **Recommended:** A (English variant now; other locales fall back until native review, never marked reviewed)
- **Rationale:** docs/04-identity-eligibility.md:246 explicitly supports single-ballot (first counts); an unconditional promise is then false. Guarantee text is normative so owner approves wording.
- **Sources:** docs/04-identity-eligibility.md:246; docs/audit/consolidation-2026-10-30.md:3097; packages/web/src/i18n/en.ts:91

### B3-25 — Passphrase canonicalization web vs CLI

- **Question:** Which passphrase canonicalization applies to QVKEY1 KEK derivation across web and CLI, and how are existing containers kept unlockable?
  - *A: shared canonical fn, try-both on unlock* — New fn in a shared package used by both; unlock tries legacy NFKC-only then canonical form (<=2 Argon2 runs, doubles worst-case unlock time); wrap always uses canonical. Back-compatible; needs legacy fixtures and a version note.
  - *B: bump container to v2 with canonicalization flag* — Clean semantics, no double KDF, but QV-19 §5.3 format change, needs migration + vectors + spec edit.
  - *C: keep divergence, CLI/web display the exact canonical phrase and document* — No crypto change; interop gap persists for hand-typed variants; lowest risk.
- **Recommended:** A: one shared canonicalization function; unlock tries the canonical form and then the legacy exact form so existing containers stay unlockable.
- **Rationale:** Spec 5.3 (docs/19-client-supply-chain.md:61-90) defines passphrase policy and KDF but not the canonical form; any change alters KEK input so needs owner sign-off and legacy-fixture tests. Keep current CLI guidance until decided. Do not silently reconcile.
- **Sources:** docs/plan/OPEN-DECISIONS.md:16-19; packages/cli/NOTES.md:106-117; docs/19-client-supply-chain.md:61-90

### B3-26 — Offline verifier in Worker with progress

- **Question:** May the offline verifier page gain a Worker (and thus relax its closed offline policy 'no network, no workers'), or should progress be done cooperatively on the main thread?
  - *A: cooperative yielding + progress on main thread* — No CSP change; needs verifyElection to accept an async progress/yield hook in packages/protocol (API change, verdict logic untouched); still slower than a pool.
  - *B: inline/blob Worker allowed by the verifier CSP* — True off-thread; widens the verifier page CSP (worker-src hash/blob) which weakens its audited minimal surface; needs W15-style integrity story for the worker.
  - *C: document limit, keep CLI/packages/verifier for large bundles* — No change; 10k-ballot ~7 min freeze remains on web.
- **Recommended:** A
- **Rationale:** Preserves the closed offline CSP property already tested server-side while fixing responsiveness; Worker pool for the app page (which already has worker-src 'self' and a seal worker, worker/seal-worker.ts) could follow separately.
- **Sources:** packages/web/src/verifier/page.ts; packages/web/NOTES.md:16-22; docs/19-client-supply-chain.md (QV-19 §7)

### B3-28 — Key-file KDF ceiling cost

- **Question:** Lower the unlock-time ceiling, or keep it and add a pre-unlock cost warning/cancel?
  - *A: keep ceiling, add UI warning + cancel/abort before deriving when params exceed default (m>65536 or t>3)* — No cryptographic policy change; legit stronger CLI/other-device files still unlock; user informed.
  - *B: lower ceiling to e.g. 2x default (m=131072,t=6)* — Bounds worst case ~4x lower, but rejects previously valid key files created with stronger params; breaks compatibility, needs spec edit.
  - *C: accept and document* — Info-level, no change.
- **Recommended:** A
- **Rationale:** Does not lower any floor and does not reject existing containers; ceiling is an owner KDF-policy number the spec does not set, so changing it is not mine to invent. Option A is UI-only engineering once chosen.
- **Sources:** packages/web/src/key/keystore.ts:15-18,63-70; docs/19-client-supply-chain.md:276

### TR-09 — SPOIL_REPLAY guard: availability vs idempotent re-serve

- **Question:** Should a trustee re-serve the stored spoil-release record idempotently instead of refusing SPOIL_REPLAY?
  - *A: keep refusal, document* — No semantics change; lost packet means trustee cannot re-send, coordinator may lack quorum.
  - *B: store released record in ledger and re-serve identical bytes on repeat* — Availability fixed; ledger grows (public data per ledger.ts:8); must define that re-serve returns byte-identical signed packet and not a fresh proof (fresh proof with new nonce is also safe but changes transcript).
  - *C: allow recompute of identical deterministic share with fresh proof* — No storage, but weakens one-shot guard invariant and QV-17 audit trail.
- **Recommended:** B
- **Rationale:** Deterministic share means no confidentiality loss; B keeps one-shot audit trail. It changes QV-17 release semantics, so owner/protocol sign-off needed first.
- **Sources:** docs/audit/trustee.md:54; packages/trustee/src/trustee.ts:779-788; packages/trustee/NOTES.md:163

### W15 — SRI for lazy chunks / worker vs hash-pinned CSP

- **Question:** How should lazy chunks and the worker get integrity pinning?
  - *A: preload-with-integrity fallback for offered/reviewed lazy chunks (+chart chunk)* — No CSP change; per HTML modulepreload semantics the integrity-checked fetch populates the module map for later import(), but this must be browser-tested (Chromium e2e tamper test) and it eagerly downloads those chunks; worker URL still not covered.
  - *B: inline integrity import map with its SHA-256 hash added to script-src* — Covers import() and possibly more; adds a script hash to the app CSP (currently no inline code), build must hash the generated map; import-map integrity browser support is [UNVERIFIED] per spec line 169; does not cover Worker constructor.
  - *C: keep documented gap* — Same-origin hashed chunks only; operator-malicious case is out of SRI's scope anyway (docs/19:170).
- **Recommended:** A, plus e2e tamper test; revisit B once support verified
- **Rationale:** Spec names preload-with-integrity as the fallback and honest-limit text (docs/19:170) says SRI only defends partial compromise; A needs no CSP relaxation. Browser behavior claim needs verification against current HTML/Fetch specs before implementation.
- **Sources:** docs/19-client-supply-chain.md:169-170,344; packages/web/NOTES.md:18,155; docs/audit/web-second-wave.md:26; packages/web/src/build/site.ts:25-31,77-83

### N-37c — Trustee flows in web

- **Question:** Should the web client ever drive trustee ceremony/tally steps, or only organizer markers and relays?
  - *CLI-only trustees; web only organizer markers + public relay of already-signed records (N-04)* — No trustee secrets in browser; ceremony markers still need web wiring for organizer. Matches ADR-024.
  - *Full in-browser trustee* — Large new attack surface (share secrets in JS, CSP, key storage); requires new security review and spec change.
- **Recommended:** CLI-only trustees; web relays signed records only
- **Rationale:** Product scope: ADR-024 makes trustee operation CLI-only by design; adding browser-held trustee secret shares changes the threat model.
- **Sources:** packages/web/NOTES.md line 168 (ADR-024); docs/decision-log.md ADR-024

### N-36a — /verify-client page

- **Question:** Define release-manifest.json schema and signing/trust root (who signs, how verifier gets the pubkey), or ship an advisory-only hash comparison against asset-manifest.json first?
  - *Define signed release-manifest per docs/19 section 10, then build CLI first and in-page page as advisory* — Correct per spec; blocked on release key ceremony (T-008-style) and QV-19 freeze.
  - *Ship advisory page comparing served assets to asset-manifest.json hashes only* — Quick, but proves nothing against a malicious origin; must be labelled advisory and not satisfy QV-19-REQ-032.
- **Recommended:** Define the signed release manifest (docs/19 §10); build CLI verify-client first, the in-page check second and label it advisory.
- **Rationale:** Needs a signed release-manifest format and signing key policy that do not exist yet; the in-page variant is advisory only per docs/19:175. Building the page first would invent the manifest schema.
- **Sources:** docs/19-client-supply-chain.md:26,92,175,304; packages/web/src/build/site.ts

### N-23c — Traceability script (scripts/trace.mjs, @verifies tags)

- **Question:** Traceability gate scope now: report-only matrix or blocking Must-REQ gate?
  - *Report-only matrix, tags added incrementally* — Cheap, honest coverage view; gate stays aspirational until coverage high
  - *Blocking gate on all Must REQs now* — Fails immediately; forces mass tagging; rubber-stamp tag risk
  - *Blocking only for crypto/protocol Must REQs* — Meaningful where risk highest; owner must pick subset
- **Recommended:** Report-only matrix, tags added incrementally
- **Rationale:** QV-30-REQ-027 (docs/30:275) makes it a release gate, not PR gate; report-only satisfies generation while honest about gaps.
- **Sources:** docs/30-engineering-standards.md:222,275,311

### CLAIMS-LINT-HISTORICAL — Claims lint: preserved historical quotes / citation titles (14 findings)

- **Question:** How to silence preserved-history findings without weakening the lint?
  - *Inline claims-lint-ignore markers on each quote* — Existing mechanism (lint-claims.mjs:6-7,24-26); explicit, reviewable; 14 edits
  - *Exclude frozen dirs in collectFiles()* — Fewer edits but unscans current ledger/research; bigger blind spot
  - *Add allow-patterns for quote contexts* — Regex fragility, can mask real claims
- **Recommended:** Inline claims-lint-ignore markers on each quote
- **Rationale:** Mechanism designed in scripts/lint-claims.mjs:6-7; keeps scan scope and keeps evidence byte-identical.
- **Sources:** scripts/lint-claims.mjs:6-7,24-26,117-120

### N-08b — MAINTAINERS.md, docs/RELEASE-KEYS.md, docs/LICENSE-NOTE.md

- **Question:** Create with honest empty-state content now, or remove references from specs until real data exists?
  - *Create files stating no maintainers/keys published yet, unaudited, not for real elections* — Satisfies QV-27-REQ-001 literally; must contain no fake fingerprints; risk of looking authoritative
  - *Remove references from specs and TODO* — Spec drift, loses requirement
  - *Wait for owner to supply maintainers and key* — Stays open; blocks nothing technical
- **Recommended:** Create files stating no maintainers/keys published yet, unaudited, not for real elections
- **Rationale:** docs/27:179 requires the files; honest empty state matches docs/audit/HANDOFF.md:84 (no invented facts). LICENSE-NOTE wording needs legal review (external).
- **Sources:** docs/27-project-governance-release.md:179; docs/audit/HANDOFF.md:84

### RECON-REQ063-SERVER — Server-rendered no-JS Accept-Language page selection (REQ-063 remainder)

- **Question:** Should a server-rendered no-JavaScript page path with Accept-Language display-language selection be built now, or should REQ-063 be scoped to the browser client only?
  - *Client-only; mark server path deferred* — No server change, no new privacy surface; spec REQ-063 stays partly unimplemented but documented.
  - *Implement no-JS pages with Accept-Language, never logged/persisted* — Needs server/log-redaction test proving header is not logged (QV-06), more attack surface; offered locales still gated by reviewed status.
- **Recommended:** Client-only; mark server path deferred
- **Rationale:** Spec text added in 57f8498 (docs/13-accessibility-localization.md REQ-063) already limits the header to display selection without logging; only English is offered (no reviewed translations), so a server path has no user value yet and would touch server code outside the ordinary slice.
- **Sources:** docs/13-accessibility-localization.md REQ-063 (post-merge); packages/web/NOTES.md 'Locale preference...' section (post-merge)

### N-29d — Trustee: qv-ceremony air-gapped image and dealer mode

- **Question:** Ship dealer mode and the qv-ceremony image in v1, or defer?
  - *A: defer dealer mode; build only true DKG + image later* — Smaller attack surface, matches ADR-004 default; small groups lack the simple option.
  - *B: build dealer mode now with mandatory voter-visible disclosure string in manifest* — Needs a manifest flag + verifier display + new protocol path; more review.
  - *C: image only (live Linux ISO packaging) without dealer mode* — Delivers air-gap story; needs reproducible build infra and external hardware testing.
- **Recommended:** A: defer dealer mode; build the qv-ceremony image later.
- **Rationale:** QV-ADR-P17-1 (docs/17:516) makes true DKG the default and dealer mode an optional disclosed add-on; ADR-004 mandates verifiable DKG. The image portion also needs external hardware testing.
- **Sources:** docs/17-key-ceremony-trustees.md:258,516

### N-28 — Trustee bundle: age-compatible, SLIP-0039, dice entropy, hardware tokens

- **Question:** Make the bundle truly age-compatible (add chacha20poly1305/x25519 from @noble/ciphers or ristretto-free curves) or amend REQ-021 to age-style and document?
  - *A: amend REQ-021 to the implemented age-style format* — No new deps, zero code; interop with age CLI and hardware-token recipients is lost, spec must be changed.
  - *B: add @noble/ciphers (vendored) and implement age v1 passphrase+X25519 recipients* — Meets REQ-021; extends the production dependency allowlist (P19-4) and ADR-024; plugin/token recipients still need external hardware tests.
  - *C: keep age-style now, plan B later* — Status quo, REQ-021 remains Must but unmet and documented.
- **Recommended:** C: keep the implemented age-style format and amend REQ-021 wording now; real age interoperability (vendored @noble/ciphers) later; dice entropy may be added as HKDF mixing; SLIP-0039 deferred.
- **Rationale:** REQ-021 is Must and names C2SP age; D-11 resolution says age is for local bundles. Allowlist change needs ADR amendment. Round-trip tests with the age CLI (docs/17:87 verification) are the acceptance bar. Dice mixing (REQ-012) needs no decision and can be done now: S-M with a test that dice only adds entropy.
- **Sources:** docs/17-key-ceremony-trustees.md:81,87,90; docs/plan/OPEN-DECISIONS.md:37; packages/trustee/NOTES.md Deviations

## Held: B3-01 registration wire contract

- **Question:** Which wire contract is normative for voter registration: QV-09 raw invite_code + PoP over (election_id, pk), or QV-19/QV-04 hashed invite_code b64u(SHA-256(token)) + invite-bound PoP over (id, H(token), pk)?
  - *A: QV-09/server contract wins* — Change web registrationBody (packages/web/src/flow/onboarding.ts ~117-127, ui/app.ts ~382) to send raw token + (id,pk) PoP. Smallest change; raw invite token goes to server (QV-19 hashed-invite privacy intent lost; QV-19 §6.1, QV-19-REQ-010 + QV-04-REQ-005 text must be amended).
  - *B: QV-19/QV-04 wins* — Change server packages/server/src/app.ts ~520-521 to accept hashed code + invite-bound PoP; server stores/compares H(token). Reference server + QV-09 schema and server tests change; keeps token off-wire.
  - *C: both (versioned/negotiated)* — Server accepts both for a transition; added surface and ambiguity, needs version field in QV-09 schema and downgrade analysis.
  - *D: remain blocked* — Web registration keeps returning 401 BAD_SIGNATURE vs reference server; no voter can register end-to-end. Current state.
- **Summary:** Owner explicitly retained 'keep blocked pending protocol review'. Do not unblock w/o owner.

