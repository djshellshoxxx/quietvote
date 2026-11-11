# QuietVote cryptographic core: static code survey

Repo /home/user/quietvote, HEAD ab84f16 (codex/quietvote-milestone-20261109). Method: static reading/grep/wc only; nothing executed.
Paths below are relative to the repo root; line numbers are source lines. "UNVERIFIED" = not checked or not checkable statically.
Repository docs/NOTES were treated as data. Test counts are `grep -cE '^\s*(test|it)\('` (top-level only); `for` loops that
generate tests (verify.test.ts:183, vectors.test.ts:164, audit.test.ts:21, dkg.test.ts:35, manifest-rules.test.ts:74,
b1-regressions.test.ts:10/32) mean real executed counts are higher. UNVERIFIED: actual pass/fail (no tests run, per constraints).

## 1. Per-package inventory

### packages/crypto (@quietvote/crypto, 1360 src lines)
- Purpose: primitives. ristretto255 group, Ed25519 (strict + ZIP215 variants), tagged hashes, ElGamal, CDS 0/1 proofs, limit (sum) proof, Schnorr PoK, DLEQ (decrypt/DH), Feldman VSS, BSGS dlog, share cipher, QV-JSON strict parser + JCS, HKDF/bundle cipher, RNG.
- src (lines): index 15, bytes 95, ed25519 45, elgamal 39, rng 48, share-cipher 88, transcript 98, ristretto 116, kdf 31, proofs 293, feldman 89, json 219, hash 9, dlog 40, bundle-cipher 114, errors 21.
- Exports (src/index.ts:1-15): `export *` from errors, bytes, rng, ristretto, transcript, elgamal, proofs, feldman, dlog, share-cipher, json, kdf, bundle-cipher; plus sha256/sha512 and ed25519Keypair/Sign/Verify/IsStrictPoint.
- Runtime deps (package.json): @noble/curves 2.4.0, @noble/hashes 2.4.0 (exact pins).
- Tests: 10 files, ~75 top-level cases (cp08-fiat-shamir 13, proofs 14, ristretto 11, misc 10, transcript 8, second-wave 7, bundle-cipher 4, audit 3, cp08-ed25519-zip215 3, smoke 2).
- Skip/todo: none. TODO/FIXME/XXX/HACK in src: none.

### packages/protocol (@quietvote/protocol, 3422 src lines)
- Purpose: protocol records, manifest validation, DKG, ballot encrypt/verify, ballot-log analysis (revotes, spoils), tally decrypt, rules evaluation, full-election verifier (`verifyElection`), QV-18 log-layer checks.
- src: ballotlog 235, index 13, ballot 297, spoilshare 77, logcheck 749, manifest 153, tally 284, merkle 16, dkg 340, verify 658, schema 238, rules 51, records 43, cooperative 51, types 217.
- Exports (src/index.ts:1-13): `export *` from types, schema, records, merkle, manifest, dkg, ballot, ballotlog, rules, tally, spoilshare, verify, logcheck. (cooperative.ts is re-exported only partially via verify.ts:5-6: `CooperativeVerification`, `VerificationProgress`, `VerificationSchedulingError`.)
- Runtime deps: @quietvote/board "*", @quietvote/crypto "*" (workspace, unpinned `*`).
- Tests: 18 files, ~111 top-level cases (loglayer 16, ballot 11, verify 11, manifest-rules 10, dkg 9, vectors 9, attacks 6, b1-regressions 6, cooperative 6, second-wave 7, tally 5, property 4, others 1-3). Helpers: test/helpers/{sim,board}.ts; vector generator test/vecgen/*; bench/tally-bench.ts (not a test).
- Skip/todo: none. TODO markers in src: none.

### packages/board (@quietvote/board, 1866 src lines)
- Purpose: QV-18 bulletin-board log: entry header codec, Merkle tree (RFC 9162), checkpoints/witness cosignatures, receipts, equivocation checks, phase grammar, bundle import/verify.
- src: bundle 431, equivocation 89, index 10, bytes 174, receipt 91, checkpoint 159, entry 247, store 108, merkle 217, log 302, errors 38.
- Exports (src/index.ts:1-10): `export *` from bytes, errors, merkle, entry, checkpoint, receipt, store, log, equivocation, bundle.
- Runtime deps: @quietvote/crypto "*".
- Tests: 5 files, ~74 cases (log 20, bundle 18, audit 13, audit-bc 13, merkle 10).
- Skip/todo: none in these 5 files. TODO markers in src: none.

### packages/verifier (@quietvote/verifier, 661 src lines)
- Purpose: standalone `qv-verify` CLI/library composing protocol.verifyElection + board.verifyLog into a V1..V14 report, with a canary self-test corpus.
- src: bundle 58, index 6, format 41, bin 7, report 88, verify 263, canary 118, main 80. Also canary/corpus.json, scripts/build-corpus.ts.
- Exports (src/index.ts:1-6): report, bundle, verify (`verifyBundle`, `hashReport`, `VERIFIER_TOOL`), canary, format, main (`verifierMain`, `verifyWithSelfTest`, `exitCodeFor`, `EXIT`).
- Runtime deps: @quietvote/board, crypto, protocol (all "*"). bin: qv-verify -> src/bin.ts.
- Tests: 4 files, ~25 cases (verifier 13, logcheck 7, security 3, b1-anchor 2).
- Skip/todo: none. TODO markers: none.

### verifier-py (qv_verifier, 3279 src lines, Python 3.11+ stdlib only)
- Purpose: independent second verifier written from the specs; explicitly "skeleton, unaudited, NOT for real elections" (qv_verifier/__init__.py:1-10).
- src (lines): election 687, manifest 291, ballot 284, runner 241, ops 231, dkg 180, qvjson 179, aead 168, proofs 168, edwards 163, ristretto 154, framed_hash 118, recordfields 107, rules 89, ed25519 75, merkle 62, __main__ 27, cli 25, __init__ 16, errors 14.
- Public API: `qv_verifier.election.verify_bundle(bundle)->dict`, `runner.main_vectors`, `ops.run_op`, CLI (cli.py/__main__.py).
- Runtime deps: none (requirements.txt:1-4 says stdlib only; no pins needed).
- Tests: 6 files, 58 `def test_` (test_protocol 15, test_primitives 15, test_audit_regressions 13, test_report_semantics 8, test_vectors_cli 4, test_qvjson 3).
- Skips: `@unittest.skipUnless(TREE.is_dir(), ...)` at tests/test_report_semantics.py:35, :83 and tests/test_vectors_cli.py:62 (conditional on test-vectors presence only). TODO markers: none.

### test-vectors/ and scripts/ (context)
- test-vectors/v1: primitives (ristretto, hash, encoding, ed25519), protocol (manifest, board/roll-merkle, proofs cds/pok/dleq/limit, dkg, rules, ballot encrypt/verify, tally partial-decrypt, benaloh), elections (tiny-yesno-3v, small-approval-20v, log-layer-4v + notices/ variants), 23 mutations, canary. Total ~52k JSON lines. schema/check-ids.json.
- scripts/: compare-verifiers.ts (81 lines, TS vs Py differential), lint-claims.mjs 173, lockfile-lint.mjs 160, licence-snapshot.mjs 203. No scripts touch voting logic except compare-verifiers.
- Elections in vectors are tiny: 3, 4, 20 voters (UNVERIFIED beyond names; sizes inferred from directory names).

## 2. Election lifecycle as implemented in packages/protocol

Log is `{seq, entry}[]` (types.ts:204-217). Entries are either voter envelopes (`intent` key) or `{body, sig}` / `{body, sigs[]}` records.
Signature digest = H256("sig-record"; scope, type, JCS(body)) (records.ts:227-229). Scope = manifest hash for the manifest, roll-commit, pre-key markers and DKG records; scope = ctx (from DKG transcript) for election-open/close, tally. Dispatch: verify.ts:271-364.

| Entry | Signer / check | Builder / checker (file:line) |
|---|---|---|
| manifest (bundle member, log seq 0 in board export) | m-of-k coordinator keys over manifest hash (`verifyMultiSig` records.ts:249-260; used verify.ts:192) | `validateManifest` manifest.ts:338; `manifestHash` manifest.ts:290; schema schema.ts:186 |
| roll-commit | coordinator m-of-k, scope mh (verify.ts:310-316) | `rollRoot` manifest.ts:310; body type types.ts:88; schema.ts:106; all must agree with roll (verify.ts:370-387); none at/after open (verify.ts:460) |
| markers dkg-open, dkg-r1-open, dkg-r1-close, dkg-r2-close, dkg-r3-close, dkg-final | coordinator m-of-k, scope mh (verify.ts:304) | types.ts:73-87; need all six (verify.ts:390-400), strict order `adjudicateDkg` dkg.ts:184 |
| election-open | coordinator m-of-k, scope ctx (verify.ts:446); binds manifest_hash, joint_key_seq, roll_commit_seq | `electionOpenBody` records.ts:222; binding checks verify.ts:469-487 |
| election-close | coordinator m-of-k, scope ctx | verify.ts:451-468 |
| dkg-commit / dkg-dealing / dkg-shares / dkg-complaint / dkg-keyconf | each trustee's `sign_pk`, scope mh (verify.ts:317-351) | dkg.ts: `dkgDeal` 25, `checkDealing` 64, `dkgMakeShares` 84, `dkgMakeComplaint` 119, `adjudicateDkg` 180, `dkgKeyconf` 330, `verifyKeyconf` 334 |
| ballot (cast envelope) | voter Ed25519 key over h256("sig-cast", ctx, code) | `buildBallot` ballot.ts:117, `makeCast` 144, `verifyEnvelope` 247, `verifyBallotContent` 177 |
| spoil envelope | voter key over h256("sig-spoil", ctx, code, reveal_digest) | `makeSpoil` ballot.ts:149 (modes publish/private/trustees), `verifySpoilReveal` 272, `auditSpoil` 288 |
| tally | coordinator "convenience" signature only; wrong/invalid sig is only class `I` (verify.ts:532-534); tally is recomputed, not trusted | `buildTally` tally.ts:234, `buildTallyFromAggregate` 242; schema schema.ts:148 |
| spoil-share (trustee-mode spoil decryption) | trustee sign_pk, scope ctx; NOT a board-log record (spoilshare.ts:1-4) | `collectSpoilShares` spoilshare.ts:468 |
| control/notice (pause, resume, invalidate, security-notice, witness-waiver, extension, audit-close, cancel, abort) | coordinator m-of-k, scope mh, closed schema | logcheck.ts:128-135, `checkControl` logcheck.ts:385; reported, never applied (comment logcheck.ts:142) |
| unknown record type / unknown proto | rejected: `E_VERSION` class L, chk.encoding.canonical=fail (verify.ts:281-285, 361-363) | |

Board-layer entry types (board/src/entry.ts:8-13): manifest, trustee_accept/decline, ceremony_start, dkg_round1/2, dkg_complaint, dkg_justification, key_confirm, joint_key, keycheck, ceremony_abort, roll_commit, election_open, ballot, ballot_audit, notice, election_close, tally_aggregate, decryption_share, tally_result, trustee_compromise_report, key_destruction, anchor, audit_close, election_cancel. Protocol-to-board type mapping: logcheck.ts:157-172 (`MARKER_TYPE`, `DKG_TYPE`, `Keys.bind`). Author must be on the roll for ballots, a trustee for DKG, coordinator for markers/control.

### State machine
There is no explicit state enum in protocol; the lifecycle is positional (log order of markers) and enforced in two places:
1. Protocol verifier (post hoc): markers must be ordered dkg-open < r1-open < r1-close < r2-close < r3-close < dkg-final (dkg.ts:182-184), and dkg-final < election-open < election-close (verify.ts:465-468); duplicate markers are E_MARKERS (verify.ts:305, 447); missing election-open/close => verification returns INCOMPLETE-ish (verify.ts:453-457, verdict computed in done(), :148). Ballots admissible only when `open < seq < close` (ballotlog.ts:406-410).
2. Board grammar (admission-time, `grammarStep` board/src/entry.ts:225-246): states are implicit flags `opened/closed/terminal`. Allowed: manifest only at seq 0; ONCE types (ceremony_start, joint_key, roll_commit, election_open, election_close, audit_close; entry.ts:203-205); NEEDS prerequisites (entry.ts:206-216: roll_commit needs joint_key, election_open needs roll_commit unless manifest has roll.root, election_close needs election_open, tally_* need election_close); SETUP_ONLY types forbidden after election_open (entry.ts:219-223); ballot/ballot_audit only while opened && !closed (entry.ts:240); ceremony_abort only between ceremony_start and joint_key (:231); election_cancel not after close (:232); abort/cancel are terminal (:244).
   Transitions: SETUP/CEREMONY -> (joint_key) -> READY -> (election_open) -> OPEN -> (election_close) -> CLOSED -> tally_* -> audit_close; cancel from SETUP/READY/OPEN; abort from CEREMONY.
- Gap between layers: the board grammar enforces ordering at admission; the protocol verifier re-derives ordering from markers and does not itself consult the board grammar (UNVERIFIED whether the two agree on every corner; see risk R12).
- Time window semantic: the voting window is defined by log position of the markers, not by wall-clock (ballotlog.ts:406). Manifest timestamps (voting_open/close, clock_skew_s) are validated for format/order only (manifest.ts:377-379) and bind to the log only through witnessed times in logcheck (`verifyWitnessing`, logcheck.ts:504; test loglayer.test.ts:222). Without witnesses the report carries caveat "election times are unwitnessed" (verify.ts:488).

## 3. Voting methods implemented

Manifest `method` enum (schema.ts:192; types.ts:41): `yes-no`, `single-choice`, `approval`, `k-of-n`. Nothing else.
NOT implemented (no code path, schema rejects): ranked/IRV/STV, score/rating, write-in, weighted votes (roll is `weights: 'uniform'` literal, schema.ts:217; leaf weight hard-coded u32(1), manifest.ts:305), cumulative, abstain as a distinct option (see below). `min_selections` is schema-pinned to 0 (schema.ts:194).
- Validation of contest config: manifest.ts:390-408. yes-no: options exactly [yes, no], selection_limit 1, needs `rule`. single-choice: >=2 options, limit 1, winners 1. approval: no selection_limit, winners <= N. k-of-n: 1 <= k < n. beacon tie-break rejected (manifest.ts:412). status-quo only for yes-no (manifest.ts:413-414). Option ids starting `~` reserved (manifest.ts:387).
- Encoding: one ElGamal ciphertext per real option, plaintext bit 0/1; for contests with `selection_limit` L, L extra placeholder ciphertexts `~ph1..~phL` are appended so the per-contest bit-sum is exactly L (ballot.ts:25-30, 37-47). Abstain/undervote = select nothing (placeholders absorb); there is no separate abstain option and no "none of the above".
- Validity proofs: per-ciphertext CDS disjunctive 0/1 proof bound to (ctx, voter binder, contest id, option id) (ballot.ts:88, verify 217-223; crypto/src/proofs.ts); per-contest limit/sum proof only when selection_limit set (ballot.ts:96-101, verify 225-235). Approval contests have only 0/1 proofs, no sum proof (any subset allowed; matches "no limit").
- Min/max: max = selection_limit (single-choice/yes-no/k-of-n) or N (approval); min always 0. Overvote and unknown/duplicate options rejected at encoding (ballot.ts:40-43) and at verification as E_CDS/E_LIMIT_PROOF/E_STRUCTURE (ballot.ts:181-235).
- Invalid ballots: `verifyEnvelope` failures are logged as findings (class L, "ignored") and the ballot is not counted (ballotlog.ts:394-400); verdict stays PASS unless another fatal finding exists, but `chk.ballots.valid` goes to `fail` (ballotlog.ts:397, verify.ts:503).
- Revote/duplicates (ballotlog.ts:451-484): per voter a `supersedes` hash chain; a cast must reference the voter's current counted code or the zero hash (:459-460) else E_SUPERSEDES, dropped. Resolution is "last valid cast in log order wins" (map `last` overwritten, :482), subject to `ballots.max_per_voter` (:465, schema max 1000) counted over admissible casts. Same code by two voters: E_DUP_CODE, dropped (:470-473). A code that was spoiled can never be counted (:475-479). Spoils limited by max_spoils_per_voter (:415). Ordering is log seq order of the entries, so the coordinator/board determines revote order.
- Counted set is sorted by voter pk hex (ballotlog.ts:484), `counted_root` = RFC 9162 root over code||voter (ballotlog.ts:503-506).
- Ties (rules.ts:273-307): yes-no strict-threshold equality => tie_break: `declare-tie` gives `{kind:'tie', tied:['no','yes']}`; `status-quo` returns the named option; `lexicographic` => 'no'. Multi-winner: options sorted by count desc then id asc (:295-297); a cut-line group larger than remaining seats => `declare-tie` gives `{kind:'tie', winners:above, tied:group}`, otherwise lexicographic fill (:305). Outcome kinds: passed | rejected | no-quorum | tie | winners (types.ts:200). `beacon` is refused at manifest validation.
- Quorum/threshold: `quorumMet` (rules.ts:265-270): optional manifest `quorum` {fraction of roll size, or absolute count} on participation V = number of counted ballots (exact BigInt arithmetic for fraction). Below quorum => `no-quorum` for every contest (rules.ts:276). yes-no `rule` {num/den, basis yes+no|counted, strict} evaluated by integer cross-multiplication (:279-287). Privacy floor `min_counted_ballots` (default 5 if roll>=8 else 3; schema min 3; manifest.ts:329-331, 425) is a hard FAIL below it (verify.ts:536) and trustees refuse (tally.ts:45).

## 4. Tally and verification

- Aggregation: per contest per real option, Ristretto point sums of alpha/beta over counted ballots; placeholders excluded (ballotlog.ts:514-532). Order-independent (test property.test.ts:40).
- Decryption: trustees compute partial decryptions M_j with DLEQ proofs (`trusteeDecryptTally` tally.ts:33-65; trustee refuses if counted list repeats voter/code (:42), is below floor (:45), or claimed aggregate differs (:47-56)). `decryptAggregates` (tally.ts:95-150): verify each share set against Y_j, require trustee in confirmed decrypter set (:108); any share failure invalidates that trustee's whole set (:112-119); need >= t valid (:122); canonical subset S = lowest t valid indices (:123); if more than t valid, a second subset (highest t) must agree (:124, 136); Lagrange combine; BSGS `dlogTable(V)`/`dlogSolve` (crypto/src/dlog.ts:12-40) with bound V = counted ballots, hard cap 2^40 (dlog.ts:13) => baby-step table ~sqrt(V). A miss is E_DLOG_RANGE, never zero (tally.ts:138). Per-contest sum bound `sum <= L*V` (:142-145).
- Threshold: manifest n,t in [1,32]; warnings only for weak t (W-NO-THRESHOLD etc., manifest.ts:428-431) not rejection (t=1 allowed).
- Determinism: counts and results are deterministic functions of the log (canonical subset, sorted voters, exact-integer rules). The tally record bytes are NOT reproducible across runs because trustee decryption nonces mix rng (crypto/src/proofs.ts:222 `rng.bytes(32)`); the verifier recomputes results rather than comparing bytes. Report bytes are deterministic (verifier.test.ts:44; cooperative.test.ts:9).
- Trustee-mode spoil decryption (manifest flag `spoil_trustee_decrypt`): tally.ts:68-85, 157-202, spoilshare.ts. Python does not support it.
- `verifyElection` check ids (verify.ts:21-24; ALL_CHECKS :46-50): chk.manifest.hash, chk.manifest.sig, chk.keys.trustees, chk.board.append_only, chk.board.witness, chk.ballots.valid, chk.ballots.latest, chk.tally.aggregate, chk.tally.decrypt, chk.result.rules, chk.benaloh.spoiled, chk.receipts.sample, chk.encoding.canonical, chk.time.window. Status values: pass | fail | not_run.
- Verdicts (verify.ts:28, 148): `FAIL` if any finding of class `F`; else `INCOMPLETE` if chk.tally.decrypt is not_run; else `PASS`. Finding classes F (fatal), L (logged/ignored record), ALARM, I (info) (ballotlog.ts:304). IMPORTANT: L/ALARM findings do not change the verdict; checks can be `fail` while verdict is PASS (e.g. late ballot, bad revote chain; test verify.test.ts:208). Also PASS does not require chk.board.* / chk.receipts.sample to have run (they stay not_run and a caveat is added, verify.ts:153).
- Verifier package V-mapping: V1..V14 from check ids (verifier/src/verify.ts:232-260); V13 (steward/operator control entries) is permanently `not_run` (verifier/src/verify.ts:253). Verdict FAIL if protocol or board layer fails. Self-test (canary corpus) failing forces FAIL (verifier/src/main.ts:19-30). Exit codes 0 PASS /1 FAIL /3 INCOMPLETE/2 usage/4 input (main.ts:1-2).
- CLI only forwards `--manifest-hash`; witnesses, receipts, observed/pinned checkpoints exist in `VerifyBundleOptions` (verifier/src/verify.ts:17-30) but `verifierMain`/`verifyWithSelfTest` pass only pinnedManifestHash (verifier/src/main.ts:18). Board/log checks therefore run only on a bundle-embedded board export, with bundle-supplied witness identities treated as self-attested.

### Python verifier vs TS (capability gaps; qv_verifier/election.py, NOTES.md "Remaining capabilities")
- Implemented: manifest/roll/DKG/ballot/spoil-reveal/tally/rules verification for the shared corpus, strict QV-JSON, own Ed25519/ristretto/AES-GCM/HKDF, BSGS (election.py:181-198).
- NOT implemented: board append-only, witness, receipts (`st.skip("chk.board.append_only","chk.receipts.sample")` election.py:202; witness skipped :463/:466; compare-verifiers.ts:41 lists them as unsupported). 48 `log.verify_election` and 5 `benaloh.private_audit` shipped vector cases unsupported (verifier-py/NOTES.md:49-50). Trustee-mode spoil decryption unsupported; manifests with `spoil_trustee_decrypt` rejected (NOTES.md:42).
- Verdict set: only PASS/FAIL (election.py:217). A bundle with no tally record gives fatal E_SCHEMA "0 tally records" (election.py:565-567) => FAIL, while TS gives INCOMPLETE.
- Differences that are by-design-open in NOTES (B1-02/05/07/08, D-92..D-96): tally.decrypters mismatch is only a note in Python (election.py:649) but a fatal check failure in TS (verify.ts:584-586); a spoiled-list mismatch is non-fatal in Python (election.py:677); yes-no tie semantics differ (see R3); bidi-control lists differ; DKG duplicate/early records; exact numeric limits; scripts/compare-verifiers.ts "still exits 1" on 3 known report differences (NOTES.md:27-29). Latest differential result UNVERIFIED (not run).
- scripts/compare-verifiers.ts:47 passes `{expectedManifestHash: ...}` to TS `verifyElection`; that option does not exist in `VerifyElectionOptions` (verify.ts:54-63), so it is silently ignored (type stripping hides it).

## 5. Test coverage map for critical invariants

COVERED = a test asserts it; PARTIAL = indirect; GAP = no test found by grep. (Not executed; coverage of branches UNVERIFIED.)

| Invariant | Status | Evidence |
|---|---|---|
| Zero-vote election | GAP (and by design unreachable) | min_counted_ballots >= 3 (schema.ts:233); zero ballots => E_BELOW_FLOOR FAIL (verify.ts:536); the V===0 PASS branch verify.ts:595 is dead because floor>=3. No test of a 0-ballot bundle. |
| Single vote / below privacy floor | COVERED (as refusal) | second-wave.test.ts:77 (2 counted, floor 3 => FAIL, decrypt not_run); attacks.test.ts:109; tally.test.ts:62 |
| Ties | PARTIAL | rules only: manifest-rules.test.ts:147-170 (yes-no tie-breaks), :185-195 (multi-winner ties). No end-to-end tied election through verifyElection; no ties in shipped vectors (UNVERIFIED) |
| Invalid ballot rejected (overvote, 2-in-a-bit, bad placeholder sum) | COVERED | ballot.test.ts:56, :223 (bits 2, overvote, wrong sum), :101 (per-field tamper matrix), :274 (property) |
| Duplicate/replayed cast | PARTIAL | verify.test.ts:118 (verbatim replay => E_SUPERSEDES); no test found for `E_DUP_CODE` (two voters, same code) => GAP for that branch (ballotlog.ts:470) |
| Revote (last wins, limits, fork) | COVERED | verify.test.ts:230-246 (chain, max_per_voter, fork/stale pointer); e2e.test.ts:7 (revotes, 50 voters) |
| Cast after close | COVERED | verify.test.ts:168 (E_TIME_WINDOW); b1-regressions.test.ts:9-25 (spoil after-close) |
| Cast before open | PARTIAL | protocol: only spoil before-open (b1-regressions.test.ts:9/18); board-layer grammar: board/test/log.test.ts:39, bundle.test.ts:198. No protocol-level cast-before-open mutant |
| Non-eligible signer | COVERED | verify.test.ts:161-167; ballot.test.ts:142 |
| Tampered ciphertext / proof | COVERED | verify.test.ts:107 (bit flip), :111 (re-signed bad proof => E_CDS); ballot.test.ts:101; crypto/test/proofs.test.ts:42, :105; vectors mutations (test-vectors/v1/mutations/ciphertext-bit-flip.json) |
| Dropped / reordered / forked log entries | COVERED | verify.test.ts:97 (dropped), :101 (reordered revote), :96 (non-monotone seq); loglayer.test.ts:113-175 (hidden entry, reordered, fork, rollback); loglayer.test.ts:247 (dropped revote via receipt); attacks.test.ts:59, :77 |
| Wrong ctx replay | COVERED | ballot.test.ts:182 (cross-election replay), verify.test.ts:130 (tally ctx), loglayer.test.ts:425 (notice replay) |
| Tally repeated twice -> identical bytes | PARTIAL / GAP | counts identical across t-subsets (tally.test.ts:13); verifier report bytes deterministic (verifier.test.ts:44, cooperative.test.ts:9). Tally record bytes are rng-dependent by design (proofs.ts:222), so no byte-identity test exists |
| Insufficient trustee shares (< t) | COVERED | tally.test.ts:13 (t-1), verify.test.ts:125 (fewer than t); dkg.test.ts:46 (|Q|<t) |
| Malicious trustee share | COVERED | tally.test.ts:13 (bad share ignored, others reach t), verify.test.ts:124, second-wave.test.ts:124 (decrypters != T_valid), crypto proofs.test.ts:182 |
| Large election (>= 1k ballots) | GAP in tests | largest test: e2e 50 voters (e2e.test.ts:10); bench-smoke N=12; cooperative.test.ts:80 adds 80 duplicate envelopes. 1k/10k only in `npm run bench` (bench/tally-bench.ts, not part of `npm test`). UNVERIFIED if CI runs bench |
| Property-based / fuzz | PARTIAL | hand-rolled seeded loops, no fast-check/etc.: property.test.ts:15 (random DKG faults), :40 (aggregation order), :63 (150 single-char envelope corruptions, requires >=148 rejected), :90 (24 random-corruption bundles, totality only); ballot.test.ts:274; crypto/test/misc.test.ts:147 (JSON canonicalisation). Fixed small iteration counts |
| Malicious/hostile bundle totality | COVERED | verify.test.ts:83, verifier.test.ts:85, cooperative.test.ts:57 |
| Python verifier tests | tests/ 58 cases, mostly shipped-vector based; no Python fuzz/large-scale test (UNVERIFIED for coverage beyond file names) |

## 6. Risks spotted while reading (all SUSPECTED, not executed)

R1. PASS verdict is weaker than the checks map. verify.ts:148 derives the verdict only from class-F findings; invalid/late/over-limit ballots (class L) and unwitnessed logs leave verdict PASS while `chk.ballots.*`, `chk.time.window`, board checks are `fail`/`not_run` (verify.ts:153, 503-506; test verify.test.ts:208). An integrator using only `verdict`/exit code 0 (verifier/src/main.ts:35, 79) may over-trust. Why it matters: silent exclusion of voters' ballots is not a FAIL.

R2. CLI does not expose witness anchors, receipts or pinned checkpoint. verifier/src/main.ts:18 passes only pinnedManifestHash although VerifyBundleOptions supports the rest (verifier/src/verify.ts:17-30). So default `qv-verify` cannot detect split-view or tail-drop without a bundle-embedded export, and witness keys then come only from the manifest. Why it matters: log-integrity assurance depends on caller code, not the shipped CLI.

R3. TS and Python disagree on yes-no ties. TS: tie when `strict && lhs === rhs` of the threshold inequality (rules.ts:287). Python: tie only when yes == no count (verifier-py/qv_verifier/rules.py:37). They diverge for any threshold other than simple majority (e.g. 2/3 strict with 2 yes/1 no: TS tie-break, Python rejected) and for non-strict. Documented as open owner decision B1-07 (NOTES.md:36-37), but it is a real result-level divergence between the two "independent" verifiers.

R4. Trustee decryption trusts the caller's `counted` list. `trusteeDecryptTally` (tally.ts:33-65) checks distinctness, floor and the optional `claimed` aggregate, but does not re-run `verifyEnvelope` or the roll/window/supersedes analysis on `counted`; it takes envelopes from the caller. A malicious coordinator could hand a trustee a sub-set padded with colluder ballots to reach the floor (floor counts distinct voter/code only, tally.ts:42-45) and obtain a decrypted sub-aggregate of a few real ballots; verifiers would later flag E_COUNTED_ROOT but shares are already released. Needs spec check; UNVERIFIED whether the trustee client (packages/trustee, out of scope) re-derives the set from the log.

R5. Voting window is log-position based, not time based. ballotlog.ts:406 uses seq between open/close markers; the placement of the election-close marker is coordinator-signed and decides which ballots count. Manifest voting_open/close/clock_skew_s are never compared to anything unless witnessed log checkpoints are supplied (logcheck.ts:504; caveat verify.ts:488). Why it matters: with witness_quorum 0 (allowed, loglayer.test.ts:236) a coordinator can close early/late and verifiers only warn.

R6. Tally `spoiled[]` is advisory: verify.ts:609-650 validates only the spoils the tally lists; spoils that are signed on the log but omitted from the tally are not required to be listed or checked beyond analysis (ballotlog.ts:419-426). Why it matters: Benaloh audit completeness relies on the voter's own check; the report cannot say "all spoils were published/decrypted correctly".

R7. Zero-ballot and one/two-ballot elections cannot reach PASS: privacy floor >= 3 enforced by schema (schema.ts:233) and verifier (verify.ts:536); dead branch verify.ts:595-598 (V===0 && V>=floor never true). Likely intended behaviour, but integrators expecting "empty election => result 'no-quorum'" will get FAIL/E_BELOW_FLOOR instead. Also the privacy_ack escape (manifest.ts:425) only works for floor in 3..9.

R8. Unbounded memory/CPU from untrusted bundle size. verifyElection loads the whole log, no cap on `b.log` length or entry size (verify.ts:217-226); ballot analysis is O(ballots) but holds all envelopes in arrays/Maps/Sets (ballotlog.ts:364-373); `aggregate` does a linear `contests.find` per ballot per option (ballotlog.ts:522); `dlogTable(V)` allocates ~sqrt(V) hex-string-keyed Map entries, cap 2^40 => ~1M entries (dlog.ts:13-21, rebuilt on every `decryptAggregates` call tally.ts:125). `mth` recursion with `slice` copies (merkle.ts:326) is O(n log n). Schema caps do exist for fields (e.g. n_counted <= 2^20 schema.ts:158) but V itself comes from the log, not the schema.

R9. Dead/misleading `expectedManifestHash` option in scripts/compare-verifiers.ts:47 (see section 4): the differential therefore never pins the manifest hash on the TS side; harmless today, wrong if someone expects it to be enforced.

R10. Revote conflicts are silently resolved by log order. A cast failing the chain (E_SUPERSEDES) or max_per_voter is dropped and the voter's previous ballot stays counted (ballotlog.ts:460-469). A voter whose newest revote was rejected has no signal other than the optional receipt checks; chk.ballots.latest fails but verdict can still be PASS (R1). Coordinator-controlled ordering can therefore decide which of two valid revotes counts only if it can also build a consistent chain; chain fork handling (first-in-log wins) is by design (verify.test.ts:230-246).

R11. Python `bsgs` and TS `dlogTable` differ on edge bound handling and Python has no allocation cap (election.py:181-198; `m = isqrt(bound)+1` with an unbounded dict). Python verifier on a million-ballot bundle would be slow (pure-Python group arithmetic) — scalability UNVERIFIED, no large test.

R12. Board grammar vs protocol verifier use different JSON parsers for the manifest: board `manifestDeclaresRoll` uses plain `JSON.parse` (board/src/entry.ts:189-196: duplicate keys last-wins, no QV-JSON strictness) to decide whether roll_commit may be skipped, while the protocol side uses strict `parseQvJson`. A manifest with duplicate `roll` keys could make the board treat the log as static-roll while the protocol verifier rejects the bundle; admission-vs-verification disagreement. Low impact (verifier is authoritative) but an inconsistency.

R13. `verifyMultiSig` and key matching use `Array.includes` on hex strings and require no ordering/duplicates beyond a `Set` of good keys (records.ts:249-260) — correct, but coordinator.keys uniqueness is checked only in manifest validation (manifest.ts:363); fine as long as validateManifest always runs first (it does, verify.ts:171). Listed to flag the ordering dependency.

R14. Sorting comparators that never return 0 (ballotlog.ts:484, 504; rules.ts:297) and `group.sort()` default UTF-16 order (rules.ts:305) are deterministic only because voter keys/option ids are unique and ASCII (ID_RE schema.ts:24); if either invariant were relaxed, TS and Python (code-point order) could diverge on ties. No Date.now/Math.random in protocol/board/crypto/verifier src (grep: only `new Date(...)` parse in manifest.ts:14; RNG is `crypto.getRandomValues`, rng.ts:11-16). Map/Set iteration is insertion-ordered and the results derived from them are sorted or canonicalised (aggregate counts in manifest option order; counted sorted), so no iteration-order nondeterminism found in tally logic (UNVERIFIED for logcheck.ts bulk).

R15. Weak-parameter acceptance: threshold t=1 and t<majority are warnings only (manifest.ts:428-431) and `witness_quorum` may be 0 (schema.ts:224); a verifier consumer must read `warnings`/`caveats`, not just verdict. Combined with R1, a 1-of-n, unwitnessed, 3-voter election can return PASS.

## Not verified / out of scope
- No tests, builds, npm, node or Python run; all pass/fail status UNVERIFIED.
- Cryptographic correctness of proofs.ts/ristretto.ts/ed25519.ts and the DKG not reviewed line by line (only structure and call sites).
- logcheck.ts (749 lines) and board bundle.ts/log.ts were read selectively (structure, binding, control records), not exhaustively.
- Specs (docs/16, 18, 20, 34, 35) were not compared line by line against code; "by design" statements above rely on code comments/NOTES.
- packages/cli, server, trustee, web exist but were outside the requested scope (grep across packages/*/test for skips also showed skips there: cli audit.test.ts:57, server ssrf.test.ts:185-257, web lazy.test.ts; not analysed).
