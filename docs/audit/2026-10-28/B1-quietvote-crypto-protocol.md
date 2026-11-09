# B1 audit: cryptography, protocol and verifiers (QuietVote)

**AI-assisted review, not an independent professional audit.** QuietVote is labelled unaudited and not for real elections; nothing
here says it is secure. All PoC data is synthetic (seeded test keys). No source file of the repository was changed; PoC files were
added under `audit-b1-poc/` in the audit worktree only.

## 1. Scope, SHA, what was reviewed

* Repository `djshellshoxxx/quietvote`, SHA `424110d90e23dc443aa4498a4340973d3c8cb8b6` (head of PR #18 branch
  `claude/quietvote-ui-locale-a11y-sltfb3`), detached worktree `/home/user/audit/quietvote-b1`. Date 2026-10-28.
* In scope, read in full: `packages/crypto/src/*` (ristretto, transcript, proofs, elgamal, feldman, dlog, share-cipher, json, ed25519,
  rng, bytes, kdf, bundle-cipher), `packages/protocol/src/*` (types, schema, manifest, records, merkle, ballot, ballotlog, dkg, tally,
  rules, spoilshare, verify; `logcheck.ts` read for the verifier-facing behaviour only), `packages/verifier/src/*` (main, verify, bundle,
  canary, report, format), `verifier-py/qv_verifier/*` (all modules), `test-vectors/` (README, MANIFEST, every vector file listed;
  mutation expectations), the test suites of those packages (names and the relevant bodies), `packages/protocol/NOTES.md`,
  `packages/verifier/NOTES.md`, `verifier-py/README.md`.
* Specs used: QV-16 (whole document incl. App. A-C), decision log QV-ADR-014..024, QV-20 §5/§6/§12, QV-34 §4/§7/§9, QV-35, QV-13
  REQ-082/§8, QV-05 (vocabulary), `docs/errata/spec-errata-log.md` (QV-ERR-PY-001..015), `docs/plan/TODO.md` (Done rows in
  crypto/protocol/verifier/test-vectors), `docs/plan/COMPLETION.md`, `docs/24-traceability-matrix.md` (no QV-16 rows are marked
  Implemented/Verified there; the conformance table in section 5 is therefore built from QV-16 section 4 Must items and the TODO Done rows).
* Prior audits checked: in-SHA `docs/audit/{README,web-verifier,web-second-wave}.md`, `docs/reports/security-review-2026-10-21.md`;
  unmerged branches (read with `git show origin/<branch>:<path>`): PR #10 `crypto-protocol.md` (CP-01..08 and second wave P1-P11,
  C1-C11), PR #9 `server.md`, PR #11 `board-cli.md`/`dependencies.md`, PR #8 `trustee.md`, PR #6 `HANDOFF.md`. `git merge-base
  --is-ancestor` confirms none of the audit-fix branches (#6, #8-#11, #14-#17) is an ancestor of the audited SHA, so their fixes are absent.

## 2. Method

1. Manual reading of all in-scope code against QV-16 byte-level rules (encodings, framed hash and label registry, every proof
   statement and Fiat-Shamir transcript, DKG adjudication table, nonce derivation, ballot checks 1-14, tally/Lagrange/BSGS, results,
   Appendix C) and against the ADRs; then the same for `verifier-py`.
2. **Differential testing (main new evidence).** `audit-b1-poc/gen.ts` builds complete elections with the repository's own test simulator
   (`packages/protocol/test/helpers/sim.ts`): coordinator and trustees run the TS reference code (`analyzeBallotLog`,
   `trusteeDecryptTally`, `buildTally`), so every bundle is what an honest TS deployment would publish. Each bundle is verified by the TS
   reference (`protocol.verifyElection`, no log evidence) and by the Python second verifier (`verify_bundle`, `audit-b1-poc/py_diff.py`).
   Operation-level inputs (manifest validation, DKG adjudication, Ed25519 verification) are compared the same way
   (`audit-b1-poc/oplevel.ts`, `op_py.py`).
3. KNOWN findings with unmerged fixes were re-run at this SHA (`known_check.ts`, `known_election.ts`) to state whether the SHA is affected.
4. A 32-mutant sweep on two **scratchpad copies** of `packages/{crypto,protocol}` (never the worktree) measured whether the test suites
   catch Fiat-Shamir field omissions and removed guards (crypto suite + 7 protocol test files); each survivor was classified by code
   reading as equivalent, not reachable, or a real gap.
5. Baseline: `npm run typecheck`, the three in-scope TS suites, `verifier-py` unit tests and the Python vector runner.

## 3. Findings table

New findings (IDs B1-xx). KNOWN items from earlier audits are listed separately in section 4.2.

| ID | Sev | Confidence | Category | Spec IDs | file:line | Summary |
|---|---|---|---|---|---|---|
| B1-01 | Medium | CONFIRMED | conformance | QV-16-REQ-015, §5.13.2 step 4, §5.14.4 #14 | `packages/protocol/src/ballotlog.ts:75-79,83-88,96` | A spoil beyond `max_spoils_per_voter` (or outside the window) is dropped before it enters the spoiled set, so the same code, cast later, is counted with no `E_SPOILED_CODE_CAST`, even when its reveal (ξ + selections) is published. Python verifier FAILs the same bundle. |
| B1-02 | Medium | CONFIRMED | divergence (QV-35) | QV-35 §1/§6, QV-16 §5.20 classes, QV-ADR-022 | `verifier-py/qv_verifier/election.py:314-320,341-344,354-358,398-400,509-511` | verifier-py makes any non-ballot record it does not like **fatal**: QV-ADR-022 control entries, unknown record types, a bad-signature marker that precedes the valid one, binding fields on a non-open marker, a repeated identical tally. It FAILs elections the reference PASSes, including the shipped vector `log-layer-4v/notices/pause-resume.bundle.json`. |
| B1-03 | Low | CONFIRMED | robustness | QV-35 §7 ("never a crash"), QV-20 §5.3 | `verifier-py/qv_verifier/rules.py:25,59`; `election.py:186-193,624-626`; `manifest.py:130-139` | verifier-py raises an uncaught `QVError` for an approval contest without `winners` (TS and QV-20: one seat) and would `KeyError` on a yes-no contest without `rule` (which its manifest validation accepts). |
| B1-04 | Medium | CONFIRMED | conformance / divergence | QV-16 §5.5 items 3 and 7, QV-35-REQ-003 | `verifier-py/qv_verifier/election.py:85-132,280`; `ristretto.py:116-121,144-149`; `dkg.py:24-29` | verifier-py does not enforce lower-case fixed-width hex or integer types outside ballot envelopes and the manifest (`bytes.fromhex` accepts upper case and whitespace; `True == 1`). One trustee can post a dealing that TS rejects and Python accepts, so the verifiers compute different R1/Q (Python aborts the DKG); Python PASSes a tally or roll in upper-case hex that TS FAILs. |
| B1-05 | Low | CONFIRMED | divergence | QV-13-REQ-082 and §8 ("identical in all implementations"), QV-34 §7.2 | `packages/protocol/src/manifest.ts:10,63-67`; `verifier-py/qv_verifier/manifest.py:27,75` | Bidi-control rejection sets differ: TS rejects U+200E/F, U+202A-E, U+2066-9; Python also rejects U+061C (TS accepts it). TS also skips trustee/witness names (KNOWN P6). |
| B1-06 | Medium | CONFIRMED | conformance | QV-16 §5.6.1 ("the log operator cannot be the sole source of a manifest hash"), App. C "Inputs" | `packages/verifier/src/main.ts:38,49,77`; `packages/verifier/src/verify.ts:122-123`; `packages/protocol/src/verify.ts:166-172`; `packages/verifier/src/format.ts:159-161` | `qv-verify bundle.json` without `--manifest-hash` compares the manifest with the bundle's own `manifest_hash`, reports V1 PASS and exits 0, with no caveat and without printing the manifest hash. Any self-consistent substitute election passes. (Same class as KNOWN BC-04, which covered only `qv ballot encrypt/audit`.) |
| B1-07 | Medium | CONFIRMED | conformance (spec gaps) | QV-16 §5.19.3, §5.7.6, §5.14.2; QV-20 §5.1; QV-ERR-PY-003(a)(d), -009(b)(c)(d), -010 | `packages/protocol/src/rules.ts:26-31,34-46`, `schema.ts:231`, `dkg.ts:189-205,275-280`, `ballotlog.ts:105-132`; `verifier-py/qv_verifier/rules.py:20,37-47,60-67`, `manifest.py:195-198`, `dkg.py:24-29,76,128`, `election.py:476-504` | The open spec questions recorded in the errata now produce **verdict-level disagreement** on honest elections: yes-no tie semantics (2 cases), count-quorum field name, order of multi-winner `winners`, duplicate/early DKG records, complaints against an R2-disqualified dealer, and the "excluded latest cast" rule. Each makes one verifier report `E_RESULT`, `E_SCHEMA`, `E_COUNTED_ROOT` or a different joint key. |
| B1-08 | Low | CONFIRMED | conformance | QV-16 App. C step 3, §5.5 item 5, §5.6.1, QV-ADR-018 | `verifier-py/qv_verifier/manifest.py:155-269` | verifier-py manifest validation accepts manifests the reference rejects: `created` after `voting_open`, impossible dates (Feb 30, hour 24), yes-no without `rule`, invalid or small-order coordinator/trustee/log keys, witness rules, size bounds. 23 of 25 probes (incl. one valid control) diverge, in both directions (list in 4.1). |
| B1-09 | Info | CONFIRMED | conformance (status accuracy) | COMPLETION.md C3, QV-ADR-015 | `docs/plan/COMPLETION.md:27` vs `verifier-py/qv_verifier/election.py:95-109` | C3 says verifier-py "does not reject" binding fields on non-open markers. It does reject them, as a fatal `E_SCHEMA`; the real remaining gap is the class (TS: L, marker ignored), which gives TS PASS / Python FAIL. |
| B1-10 | Info | CONFIRMED | conformance (status inflation) | TODO T-028 | `packages/crypto/src/elgamal.ts` | T-028 "Exponential ElGamal encrypt/decrypt-to-point, **rerandomize**" is Done, but no rerandomize function exists (not needed by QV-16 suite v1). |
| B1-11 | Low | CONFIRMED | test coverage | QV-16-REQ-020, QV-16 §11, QV-34-REQ-001/-007/-009, §7.2, §9.3 | `test-vectors/v1/*`; `packages/crypto/test/*` | Negative corpus does not cover every Appendix C check (no mutant for DKG equivocation, revote limit, duplicate code, sum bound, `E_AGG_IDENTITY`, `E_BELOW_FLOOR`, trustee-key replacement, superseded ballot counted, quorum miscount); no Ed25519 vectors for non-canonical A, small-order or non-canonical R, mixed-order keys; no `tally.combine`, `tally.dlog` or `eg.*` vectors; DKG vectors lack identity commitment, duplicate `A_0`, early record and key-confirmation (`T`). Mutation sweep (32 mutants): 21 killed (13 only by protocol tests), 8 equivalent or not reachable, 3 real survivors (Ed25519 small-order `R`, late DKG complaint, late key confirmation). |
| B1-12 | Info | CONFIRMED | test quality | QV-16 §5.16, Appendix B item 6 | `packages/crypto/test/proofs.test.ts:208-220` | The test "decryption with a failed RNG still never repeats the nonce across different statements" varies only `oid`; with the same `(ctx, cid, oid)` and a different aggregate the nonce repeats and `s_j` is recovered (KNOWN CP-02 reproduces). The test name overstates the property. |
| B1-13 | Low | CONFIRMED | conformance | QV-16 §5.5 item 7 (closed schemas) and "Envelope" | `packages/protocol/src/verify.ts:157-173`; `packages/verifier/src/bundle.ts:43` | The manifest record envelope `{body, sigs}` and its signature objects are never checked against a closed schema: unknown members pass with `chk.encoding.canonical: pass` (protocol verifier and `qv-verify` PASS); verifier-py FAILs the same bundle (`E_SCHEMA` fatal). |
| B1-14 | Low | CONFIRMED | conformance / divergence | QV-16 §5.7 ("phases are delimited by coordinator-signed marker records: `dkg-open`, ..."), App. C step 5 | `verifier-py/qv_verifier/election.py:363`; `dkg.py:65` | verifier-py neither requires the `dkg-open` marker nor checks the order of the DKG phase markers (TS: `E_DKG_MARKERS`, F). A log with `dkg-open` removed, which is exactly the reference verifier's own synthetic canary `first-log-entry-dropped`, PASSes in Python and FAILs in TS. |

Counts (new): Medium 5, Low 6, Info 3; all CONFIRMED; no Critical or High. KNOWN items re-checked (section 4.2): 30 earlier audit IDs plus 4 tracked TODO gaps; all still present at this SHA (CP-08 only partly).

## 4. Finding details

### 4.1 New findings

#### B1-01 Spoils over the limit or outside the window never enter the spoiled set (Medium, CONFIRMED)

**Code.** `analyzeBallotLog` (`ballotlog.ts`) handles a spoil in this order: envelope checks; window check `if (!(seq > open && seq < close)) { ...; continue; }`
(:75-79); per-voter count `if (n > max_spoils_per_voter) { add('E_REVOTE_LIMIT', ...); continue; }` (:83-88); only then
`spoiled.set(code, ...)` (:96). The later cast check `if (spoiled.has(code))` (:124) therefore never sees those codes. Protocol NOTES
X-10 records "`max_spoils_per_voter` excess spoils are ignored" but not this consequence.

**Scenario.** Manifest `max_spoils_per_voter: 0` (allowed by the schema, `int(0,1000)`), or any voter past the limit. Voter V builds
ballot X, posts it as a spoil with the published reveal (ξ and selections on the log), then posts a cast of the same body X (same ballot
code). The verifier counts X, raises no `E_SPOILED_CODE_CAST`, and `chk.benaloh.spoiled` stays `pass`. QV-16-REQ-015 ("a ballot code that
is both spoiled and cast shall be flagged and excluded") and §5.13.2 step 4 ("added to the spoiled set; it can never be counted") are not
met, and the counted ballot's plaintext is public on the log. The same holds for a spoil posted outside the window (for example after
close) of a counted code; there both verifiers ignore it (spec gap SG4). The impact is a public, verifier-unflagged receipt for a counted
ballot (receipt-freeness is a non-claim, ADR-008, but REQ-015 is a Must), plus verifier disagreement: verifier-py applies no spoil limit
at all, registers the code, excludes the cast and FAILs the TS-built tally (`E_COUNTED_ROOT`, `E_AGG_MISMATCH`).

**Evidence.** `node --test audit-b1-poc/b1-poc.test.ts` test "B1-01" passes (defect present): verdict PASS,
`chk.benaloh.spoiled: pass`, no `E_SPOILED_CODE_CAST`, the revealed code is in `countedBallots`, only `E_REVOTE_LIMIT/L` is logged.
Differential row `E1-spoil-over-limit`: `TS=PASS PY=FAIL` (Python codes `E_AGG_MISMATCH/F, E_COUNTED_ROOT/F, E_SPOILED_CODE_CAST`).
Control `E1c-spoil-within-limit` (limit 16): both flag `E_SPOILED_CODE_CAST` and agree.

**Fix (implements REQ-015, no new policy).** Register every envelope-valid, voter-signed spoil's code in the spoiled set before applying
the window and `max_spoils_per_voter` rules (those rules can still make the spoil "not an audit" for statistics and raise their own L
finding); apply the same in verifier-py (and add the limit there). Add regression tests for the over-limit and outside-window cases.
The PR #10 P4 fix does not cover this path.

#### B1-02 verifier-py turns non-ballot record anomalies into a FAIL verdict (Medium, CONFIRMED)

**Code.** `election.py` adds `fatal=True` findings for: a record failing `_record_schema_ok` or with an unknown `type` (:314-317), an
unknown `proto` (:318-320), a DKG marker or roll-commit with a bad signature (:341-344, :354-358), and uses the **first**
`election-open`/`election-close` regardless of its signature, failing fatally if that one is unsigned (:396-400). Any number of tally
records other than one is fatal (:509-511). The reference treats all of these as class L (logged, ignored) or picks the first valid record.

**Scenarios and evidence** (`python3 -I audit-b1-poc/py_diff.py`, all bundles built by the honest TS path):

| Bundle | TS | Python |
|---|---|---|
| shipped `test-vectors/v1/elections/log-layer-4v/notices/pause-resume.bundle.json` (QV-ADR-022 pause/resume) | PASS | FAIL (`E_SCHEMA` fatal) |
| `E11-control-entries` (coordinator pause/resume) | PASS | FAIL |
| `E7-bad-close-then-good` (non-coordinator close before the real one) | PASS | FAIL (`E_SIG` fatal) |
| `E13-C3-close-with-binding` (close carrying open-binding fields, then a clean close) | PASS | FAIL |
| `E17-tally-posted-twice` (identical tally re-posted, e.g. retried POST) | PASS | FAIL (`E_SCHEMA` fatal) |

Without log-layer evidence anybody who can append to the exported log can make verifier-py FAIL a valid election; QV-ADR-022 control
entries make it FAIL every election that uses them. QV-16 §5.20 gives classes for ballots and tally failures but not for these records
(spec gap SG7); the reference already documents its choice (protocol NOTES "Protocol-layer view of control records").

**Fix.** In verifier-py, mirror the reference: class L (finding plus `chk.encoding.canonical` fail) for unknown or malformed non-ballot
records and bad signatures; pick the first validly signed marker; treat an identical repeated tally as a duplicate. Record the classes in
QV-16 §5.20 (owner decision) and add mutants for each.

#### B1-03 verifier-py raises on valid manifests (Low, CONFIRMED)

`rules._multi` raises `QVError("E_RULES", "number of winners undefined")` for an approval contest without `winners` (`rules.py:59`);
`_yes_no` reads `contest["rule"]` (`rules.py:25`) although `manifest.validate` does not require a rule for yes-no (`manifest.py:130`).
`rules.evaluate` runs outside any handler (`election.py:624-626`) and `verify_bundle` only catches `_Stop` (`election.py:186-193`).
Scenario `E5-approval-no-winners`: TS PASS (one seat, documented in protocol NOTES X-14 and consistent with QV-20 §5.3 "single-winner"),
`verify_bundle` raises `QVError('E_RULES: number of winners undefined')` (Python PoC `test_B1_03_*`). The vector runner turns the
exception into FAIL; any other caller gets an exception. Fix: default approval to one seat as QV-20 §5.3 says (or reject at manifest
validation with a named error, consistently with the reference), require `rule` for yes-no in validation, and catch evaluation errors as a
named failure.

#### B1-04 verifier-py accepts non-canonical hex and boolean indices in records (Medium, CONFIRMED)

`_record_schema_ok` (`election.py:85-132`) checks key sets (plus the formats of the `election-open` binding fields and of
`roll-commit`), but not the hex or integer formats of DKG records, key confirmations, marker `K`/`qmask` or the tally;
`decode_hex`/`scalar_decode_hex` (`ristretto.py:116-121,144-149`) use `bytes.fromhex`, which accepts upper case and whitespace; the
roll is decoded with `bytes.fromhex` (`election.py:280`); `_first_timely` compares `get(who_key) == who`, so JSON `true` equals trustee 1
(`dkg.py:24-29`). QV-16 §5.5 item 3: "upper-case hex is rejected, not normalised".

* Op level (`op_py.py`): `D2-uppercase-hex-dealing` (trustee 3 publishes its dealing and matching commit in upper-case hex): TS
  `Q=[1,2]`; Python `E_DKG_QUORUM: |Q| = 1 < t = 2` (it admits trustee 3 to R1, so the honest trustees' share packages look incomplete).
  `D5-boolean-index-trustee-1` (`"i": true`): TS `Q=[2,3]`; Python `E_DKG_QUORUM`. One trustee can therefore make the second verifier
  reject an election the reference accepts.
* Election level: `E14-tally-share-uppercase-hex`: TS FAIL (`E_SCHEMA`, tally), Python PASS with `chk.encoding.canonical: pass`.
  `E18-roll-uppercase-hex` (roll entries upper-cased): TS FAIL (`E_ROLL`), Python PASS.

Fix: validate every record field in verifier-py with the same closed schema the ballot path uses (lower-case fixed-width hex regex,
`type(x) is int` and ranges for indices), before decoding.

#### B1-05 Bidi-control sets differ between the verifiers (Low, CONFIRMED)

TS `BIDI` (`manifest.ts:10`) is a character class of U+200E, U+200F, U+202A-U+202E and U+2066-U+2069 (decoded by script); Python adds U+061C ARABIC LETTER MARK
(`manifest.py:27`). Op level: `M6-title-U061C`: TS accept, Python reject; `M5-trustee-name-bidi-U202E`: TS accept (KNOWN P6), Python
reject. TS PoC test "B1-05" passes. QV-13 §8 requires "bidi-control rejection rules must be identical in all implementations"; QV-13-REQ-082
names only U+202A-E and U+2066-9 (spec gap SG8). Fix: one normative list in QV-16/QV-13 (owner), the same in both verifiers, and a QV-34
vector per code point.

#### B1-06 `qv-verify` without `--manifest-hash` silently trusts the bundle's own anchor (Medium, CONFIRMED)

`--manifest-hash` is optional (`main.ts:38,49,77`); without it `verifyBundle` passes the bundle's own `manifest_hash` through
(`verifier/src/verify.ts:122-123`) and `protocol/verify.ts:166-172` compares the manifest with that value. The text report prints only
the ctx prefix (`format.ts:159-161`), never the manifest hash, and adds no caveat.

**Scenario.** An operator or any distributor of the bundle substitutes a complete election of its own (own coordinator, trustees, roll,
results). `qv-verify bundle.json` prints `V1 PASS Manifest hash and coordinator signatures` and exits 0. Evidence:
`node packages/verifier/src/bin.ts audit-b1-poc/out/E0-baseline.bundle.json --skip-selftest` -> `VERDICT: PASS`, `V1 PASS`, `exit=0`,
caveats only about witnessing/V4/self-test; PoC test "B1-06" builds an "attacker" election and asserts PASS, V1 pass, no caveat matching
pin/out-of-band/anchor/manifest hash, and that the manifest hash is absent from the text output.

**Fix** (implements QV-16 §5.6.1 and App. C inputs): always print the verified manifest hash; without a pin, report V1 as not run (or the
verdict as INCOMPLETE) with a caveat "manifest hash NOT pinned: compare it with the announced value"; the same pattern BC-04 used for
`ballot encrypt` (PR #11, unmerged). Making the pin mandatory is an owner decision. Pointer for B2/B3 (not reviewed in depth): `qv verify` (`packages/cli/src/cmd-verify.ts:8-12`) calls the same `verifyWithSelfTest` with an optional pin, and the offline page checks its Election ID anchor only when the field is filled (`packages/web/src/verifier/page.ts:55-63`).

#### B1-07 Open spec questions now give opposite verdicts on honest elections (Medium, CONFIRMED)

Each row was built by the honest TS path; the published tally/result is TS's. Underlying questions are recorded as errata (KNOWN), the
verdict-level consequence is new.

| Scenario | TS | Python | Root cause (spec gap) |
|---|---|---|---|
| `E3-tie-basis-counted`: yes-no, basis `counted`, strict 1/2, `declare-tie`; yes 2, no 1, blank 1 | PASS, outcome `tie` | FAIL `E_RESULT` (evaluates `rejected`) | TS applies the tie-break whenever `lhs == rhs` under a strict rule (`rules.ts:26-31`) although y != n; Python only when `y == n` (`rules.py:37-47`). QV-ERR-PY-003(a) |
| `E3b-2of3-status-quo-yes`: non-strict 2/3 on yes+no, status-quo `yes`; yes 2, no 2 | PASS, `rejected` | FAIL `E_RESULT` (evaluates `passed` by tie-break) | Python applies the tie-break to a supermajority rule that clearly failed; QV-20 §5.1 pseudocode never tie-breaks yes-no; QV-16 says a tie is when "the rule cannot decide" |
| `E2-count-quorum`: `quorum {type: count, value: 2}` | PASS | FAIL `E_SCHEMA` (Python wants `n`) | field name undefined; QV-ERR-PY-003(d); TS documents `value` (NOTES X-14) |
| `E4-kofn-winner-order`: options in manifest order zeta, alpha, mid, low; ties above the cut | PASS, winners `[alpha, zeta, low]` | FAIL `E_RESULT` (computes `[zeta, alpha, low]`) | ranking tie order: TS by id (`rules.ts:35-37`), Python stable by manifest order (`rules.py:60`); QV-ERR-PY-003 |
| `E15-excluded-latest-cast`: X1 cast, X2 spoiled then cast | PASS (X1 counted) | FAIL `E_COUNTED_ROOT` (voter not counted) | QV-ERR-PY-010 |
| DKG `D1-duplicate-different-commit` (trustee 3 posts two different commits) | `Q=[1,2]` | `E_DKG_QUORUM` | TS disqualifies equivocators (`dkg.ts:189-205`), Python takes the first record (`dkg.py:24-29`); QV-ERR-PY-009(c) |
| DKG `D3-complaint-vs-R2-disqualified` (n=4: dealer 4's package mis-ordered, trustee 2 files a false complaint against 4) | `Q=[1,3]`, ctx `1151574f...` | `Q=[1,2,3]`, ctx `fcb6b70f...` | TS adjudicates complaints against R2-disqualified dealers (`dkg.ts:275-280`), Python ignores them (`dkg.py:128`); QV-ERR-PY-009(d) |
| DKG `D4-commit-before-dkg-open` | `Q=[1,2,3]` | `E_DKG_QUORUM` | lower timeliness bound; QV-ERR-PY-009(b) |

Two spec-following verifiers disagree on the result or the joint key, so independent verification (QV-35, QV-34-REQ-005) cannot succeed
on such elections. Fix: owner decisions on each question in QV-16 (§5.19.3, §5.7.6, §5.14.2), then align both verifiers and add vectors
that distinguish the readings (none of the current vectors does: both verifiers pass all 11 `rules.json` and 8 `dkg.json` vectors).

#### B1-08 verifier-py manifest validation is weaker than the reference (Low, CONFIRMED)

`op_py.py`, 25 manifest probes (M0 is the valid control), 23 diverge. Python accepts, TS rejects: `created` after `voting_open` (M1; Python checks only
`voting_close > voting_open`, `manifest.py:170-175`), `2026-02-30` and hour `24` (M2, M3; regex only), `clock_skew_s` 90000 (M4),
status-quo on single-choice (M7), witness named `quietvote/...` or equal to the log key (M8, M9), small-order coordinator key, non-canonical
trustee key, small-order log key (M10, M11, M23; no point checks), rule basis `roll` (M15, TS gap KNOWN N-27), yes-no with `winners`
(M16), rule on single-choice (M17), yes-no without rule (M18, then B1-03), size bounds (M19-M22). Python rejects, TS accepts: U+061C
(B1-05), trustee-name bidi (KNOWN P6), `spoil_trustee_decrypt` present (M12; allowed interim by QV-35-REQ-012 "rejected with a named
error", KNOWN PY-01), count quorum with `value` (M13). Several are spec gaps (SG10-SG12); M1-M3 and M18 are clear Python omissions
against App. C step 3 ("time ordering") and §5.5 item 5. Fix: port the reference checks that the spec states; record the rest as errata.

#### B1-09 COMPLETION.md item C3 is stale (Info, CONFIRMED)

C3: "Python verifier does not reject `manifest_hash`, `joint_key_seq` or `roll_commit_seq` on non-`election-open` markers". `election.py:95-109`
returns `False` from `_record_schema_ok` when any binding field is on another marker, which is fatal `E_SCHEMA`. Scenario E13: TS PASS
(class L, marker ignored), Python FAIL. The item should describe the class mismatch (part of B1-02).

#### B1-10 T-028 "rerandomize" marked Done (Info, CONFIRMED)

`grep -rni rerandom packages/crypto/src packages/protocol/src` returns nothing. Not required by suite v1; the TODO row overstates.

#### B1-11 Negative-vector and mutation coverage gaps (Low, CONFIRMED)

* Vector inventory (script over `test-vectors/v1`): Ed25519 verify has 5 vectors (no non-canonical `A`, no small-order or non-canonical
  `R`, no mixed-order key; QV-ERR-PY-011 notes the `R` policy is unpinned); no `tally.combine`, `tally.dlog`, `eg.*`,
  `rules.latest_ballot` operation vectors; `dkg.json` (8) has no identity commitment, duplicate `A_0`, early record, wrong coefficient
  count, equivocation or `T`/key-confirmation outcome (QV-16 §11 item 6 asks for these); the mutation corpus has 23 mutants from
  `tiny-yesno-3v` and none for trustee-key replacement, "ballot encrypts 2" at election level, superseded ballot counted, quorum
  miscount, revote limit, duplicate code, sum bound, `E_AGG_IDENTITY`, `E_BELOW_FLOOR` (QV-34 §9.3 table; QV-16-REQ-020 "each Appendix C
  check has >= 1 failing artifact"). TODO T-150/T-214 are honestly marked Partial.
* Mutation sweep (scratchpad copies; crypto suite + protocol `vectors, attacks, dkg, ballot, tally, verify, manifest-rules`): 32
  mutants, all run; scripts, per-run logs and `summary.txt` are in `audit-b1-poc/mutation/`.
  * Killed by the crypto suite (8): M04 `cp-dec-spoil` challenge omits the ballot code, M06 `cp-dec` omits `B`, M08 `pok` omits
    `u16(k)`, M12 small-order point allowed, M15 scalar reduced instead of rejected, M17 BSGS bound skipped, M18 PoK accepts identity
    `A`, M20 frame drops `u32(m)`.
  * Killed only by the protocol subset (13): M01/M02 `cp-dh` omits `E_j`/`S`, M03 `pok-share` omits `Y_j`, M05 `cp-limit` omits `L`,
    M07 `cds01` omits `K`, M10 `hs_nz` counter first, M21 binder omits `ctx`, M23 spoiled-set check removed, M25 all valid shares
    instead of the t smallest (caught only by the assertion on the reported subset, `tally.test.ts:39`; the counts are unchanged, as
    expected for Lagrange over any >= t valid shares), M27 duplicate-`A_0` rule removed, M29 published `T` not compared, M31 strict
    rule comparison made non-strict, M32 sum bound `L*V` removed. The five Fiat-Shamir omissions (M01-M03, M05, M07) drop statement
    values that also enter the verifier's commitment equations, so the crypto suite's "change one field, expect reject" tests cannot
    see them; only the frozen protocol vectors do (KNOWN CP-08, partly addressed at this SHA: M04, M06, M08 are now caught by the
    crypto suite).
  * Survived, equivalent or not reachable (8): M11 `zip215: true` (noble 2.4.0 `verify` uses the cofactored equation in both modes;
    `zip215` only relaxes encodings and small-order `A`, which the wrapper's strict-point checks already reject), M13 re-encode check
    removed (noble `fromBytes(.., false)` already rejects non-canonical encodings), M16 BSGS re-verification skipped (the table
    lookup is exact), M22 voter strict-point check in `verifyEnvelope` removed (`rollRoot` and `ed25519Verify` check the same key),
    M24 window `>=`/`<=` (log `seq` values are unique and the markers occupy `open`/`close`), M09 `cdsVerify` and M19
    `shareKeyVerify` identity guards (ballot points are decoded with `nonIdentity`, `ballot.ts:173`, and `K != O`; `Y_j` is recomputed
    from the commitments of `Q`, so an identity needs every dealer in `Q` to collude), M28 `E_AGG_IDENTITY` guard (needs every ballot
    in an aggregate to come from colluding voters so that the alphas cancel). For M09 the crypto test "CDS: identity ciphertext
    components rejected" (`proofs.test.ts:98-103`) passes for the wrong reason: its proof belongs to another ciphertext.
    `identity_cds.ts` shows that a proof made for (O, O) with r = 0 verifies once the guard is removed.
  * Survived, real gaps (3; spec-mandated behaviour that no test exercises, non-equivalent by code reading): M14 Ed25519 strict `R`
    check removed (noble with `zip215: false` accepts R = identity, `small_order_r.ts`, so only the wrapper enforces QV-16-REQ-016;
    verifier-py rejects, so a regression would also split the verifiers), M26 DKG complaint after `dkg-r3-close` adjudicated (the
    window filter at `dkg.ts:276` is the only timing guard, so `Q` and `K` change), M30 key confirmation outside
    (`dkg-r3-close`, `dkg-final`) counted in `T` (`verify.ts:388`; with t = n a late confirmation turns `E_DKG_KEYCONF` FAIL into
    PASS). Fix: one negative test each, plus QV-34 vectors for small-order `R` and the DKG timing rules.

#### B1-12 Over-stated nonce test (Info, CONFIRMED)

`proofs.test.ts:208-220` uses `oid: 'a'` and `oid: 'b'`, so the hedged nonce differs by `oid`. `known_check.ts` shows that with
`constantRng` and the same `(ctx, cid, oid)` but a different aggregate both proofs verify and `s_j = (s1 - s2)/(c1 - c2)` is recovered
(KNOWN CP-02, open as a spec decision on PR #10). Rename the test or add the failing case once CP-02 is decided.

#### B1-13 Manifest envelope is not schema-checked (Low, CONFIRMED)

`protocol/verify.ts:157-173` reads only `mrec.body` and `mrec.sigs`; `verifier/src/bundle.ts:43` requires only that `manifest.body` is an
object. `out/E19-manifest-envelope-extra-members.bundle.json` (E0 plus `manifest.note` and an extra member inside the coordinator `sig`
object, made by hand): `protocol.verifyElection` PASS with `chk.encoding.canonical: pass`, `qv-verify` PASS, verifier-py FAIL
(`E_SCHEMA` fatal on `chk.manifest.hash`). The envelope is unsigned, so the bytes of the published record are malleable without any
finding (QV-16 §5.5 item 7: "unknown fields are an error"). Fix: check `S.multiSigned(manifest)` shape (closed, `sigs` as `S.sig`) and
report `E_SCHEMA` with `chk.encoding.canonical` fail, in line with the other records.

#### B1-14 verifier-py does not require `dkg-open` or marker order (Low, CONFIRMED)

`election.py:363` lists the required markers without `dkg-open`, and `dkg.py:65` falls back to `markers.get("dkg-open", 0)`; no marker
order is checked. `out/E20-dkg-open-marker-dropped.bundle.json` (E0 with the first log entry, the coordinator-signed `dkg-open`, removed):
TS FAIL (`E_DKG_MARKERS`, `chk.keys.trustees`), Python PASS. `packages/verifier/src/canary.ts:50-51` uses the same mutation as a
self-test canary that must be rejected, so a weaker verifier passes a bundle the project itself classifies as known-bad (QV-35 §6 "bundle
crafted to pass a weaker verifier"). Fix: require all six markers in strictly increasing order, as `adjudicateDkg` does (`dkg.ts:182-183`).

### 4.2 KNOWN findings re-checked at this SHA

"Affected" means the defect reproduces (or the unchanged code was read) at `424110d`; fixes live only on the named unmerged branch.

| KNOWN ID | Source | Sev (theirs) | Affected? | Evidence at this SHA |
|---|---|---|---|---|
| CP-01 | PR #10 | medium | yes; **also verifier-py (no fix on any branch)** | `known_election.ts` K-CP01: counted ballot re-wrapped under another `supersedes`, published reveal; TS PASS with `chk.benaloh.spoiled: pass`, Python PASS. TR-01 check in `verify.ts:571-581` covers only trustee-mode, and its `castAlphas` includes invalid casts (`ballotlog.ts:63-66`), so any log writer can plant an alpha and make a trustee-mode spoil alarm: `known_tr01_plant.ts` -> honest trustee-mode audit `chk.benaloh.spoiled: pass`; with one junk cast carrying its alpha (itself `E_SIG/L`, never counted) -> `fail` + `E_SPOILED_CODE_CAST/ALARM` (PR #10 restricts `castAlphas` to valid casts) |
| CP-02 | PR #10 (open, spec) | low | yes | `known_check.ts`: `s_j` recovered; see B1-12 |
| CP-03 | PR #10 | low | yes | `known_check.ts` (`valueOf`/`hasOwnProperty` accepted in `sig`); E10: envelope with `constructor` -> TS PASS, Python FAIL |
| CP-04 | PR #10 | medium | yes | `op_py.py`: mixed-order key (A = aB + T8): TS accepts 16/16 signatures, Python 2/16 (only when `k mod 8 = 0`). **Residual after PR #10:** the PR makes TS reject mixed-order A/R, but verifier-py's `valid_public_key` (`ed25519.py:52-57`) still accepts mixed-order roll keys and 1/8 of signatures, so the acceptance sets still differ. CONFIRMED on a scratchpad copy of `packages/crypto` with PR #10's `ed25519.ts`: strict-point(mixed-order key) = false, 0/16 signatures accepted, while verifier-py accepts the key and 2/16; a roll holding such a key would be `E_ROLL` (FAIL) for patched TS and PASS for Python. QV-ADR-018 requires one acceptance set in every verifier, so verifier-py needs the same torsion-free check |
| CP-05 | PR #10 | low | yes (code read) | `verify.ts:345-358` unchanged; only `rollCommits[0]` and the bound commit are compared |
| CP-06 | PR #10 | info | yes (design) | selective-abort bias of `K`, documented |
| CP-07 / C10 | PR #10 | info/low | yes | `BUNDLE_MAX_LOGN = 22` |
| CP-08 | PR #10 | info | partly | M04/M06/M08 (spoil code, `B`, `k` omitted from the challenge) are now caught by the crypto suite; M01-M03, M05, M07 and M10 still only by the frozen protocol vectors; the ZIP-215 switch is equivalent at this SHA because of the wrapper's pre-checks (B1-11) |
| P1 / TSV-05 | PR #10 (design) | medium | yes | `verify.ts:136` verdict ignores `chk.board.*` |
| P2 | PR #10 | low | yes | `trusteeDecryptTally([b,b,b])` releases shares |
| P3 | PR #10 | medium | yes | K-P3: second coordinator-signed tally with flipped outcome -> TS PASS (`E_SCHEMA/L`), Python FAIL |
| P4 | PR #10 | medium | yes | E8: spoil with mismatching attached reveal, then cast of the same code -> TS counts it (PASS), Python excludes (FAIL) |
| P6 | PR #10 | low | yes | M5 |
| P7 / TSV-03 | PR #10 | low | yes | K-P7: `chk.tally.decrypt: pass` with no decryption, rules `not_run`, verdict FAIL |
| P9 | PR #10 | low | yes | K-P9 (t = n = 3): invalid keyconf before the valid one -> TS FAIL (`E_DKG_KEYCONF`), Python PASS |
| P10 | PR #10 | info | yes (design) | duplicate election markers are L |
| P11 | PR #10 | low | yes | K-P11: `decrypters: [3]` with shares from 1, 2 -> TS PASS (Python only notes it) |
| C1, C4, C5, C6, C7, C8 | PR #10 | low/info | yes | `known_check.ts` (each line AFFECTED) |
| C3 (OQ-7, T-043) | PR #10 | info | yes | PoK/DLEQ/keyconf nonces plain CSPRNG |
| C11 | PR #10 | info | yes | `crypto/src/index.ts:5` exports `streamRng`/`constantRng`/`vecrng` |
| TSV-04 | HANDOFF 3.2.4 | - | yes (code read) | `verifier/src/verify.ts:133-138,255`: a throwing board layer only sets `boardSkipped`; PASS stays reachable |
| TSV-06 | HANDOFF 3.2.4 | - | yes (code read) | `canary.ts:85-90` never compares `expect.verdict` |
| PY-01 | HANDOFF 3.2.4 | - | yes | no trustee-mode spoils; manifest with `spoil_trustee_decrypt` rejected (M12) |
| PY-02 | HANDOFF 3.2.4 | - | yes | `election.py:203` verdict is PASS/FAIL only |
| WV-9 | in-SHA web-verifier.md | info | yes | corpus unsigned |
| N-13, N-24, N-25, N-27 | TODO | - | yes | V13 not run; no vendoring; no secret types/constant-time discipline beyond noble; no basis `roll` |

### 4.3 Checked, no finding

* ristretto255: `pointFromBytes` is noble's RFC 9496 decode plus a re-encode check and an explicit identity rule; scalars are rejected,
  never reduced, at `>= l`; wide reduction uses 64 bytes. verifier-py's decoder matches the RFC steps; both agree on all 26 decode vectors.
* Framed hash: `FRAME = lp("QV1-HASH") || lp(suite) || lp(label) || u32(m) || lp(f_i)...`, closed label registry with kind check,
  `hs_nz` counter appended last. Every challenge was compared field by field with the §5.4 table: `pok`, `pok-share`, `cp-dh`, `cds01`,
  `cp-limit`, `cp-dec`, `cp-dec-spoil` bind the full statement, the commitments, `ctx`/`manifest_hash` and (ballots) the binder.
* Verification equations of CDS 0/1, selection limit (sums recomputed by the verifier, never taken from the prover), Schnorr PoK,
  DH-reveal DLEQ and Chaum-Pedersen decryption are the standard ones; scalars are range-checked before use.
* DKG: commit-reveal hash, per-coefficient PoK bound to `(manifest_hash, i, k)`, non-identity `A_k`/`E_i`, symmetric duplicate-`A_0`
  rule, R2 completeness in ascending order, DLEQ-backed complaint adjudication, `|Q| >= t`, `K != O`, `Y_j` and `ctx` per §5.7.7-5.7.8.
* Tally: aggregates over real options only, canonical subset = t smallest valid indices with a second-subset consistency check,
  BSGS bounded by `V` with re-verification, `sum <= L*V`, privacy floor enforced by verifier and trustee API, exact-integer rules.
* Ballots: §5.14.4 checks 1-9 in order; hedged ξ derivation per §5.11 (constant-RNG test present); distinct `sig-cast`/`sig-spoil`
  labels; Benaloh recomputation is a pure function of `(ctx, voter, supersedes, selections, ξ)`.
* No `Math.random`, clock or network use in crypto/protocol/verifier/verifier-py; only `packages/crypto` imports `@noble/*`; no logging
  of secrets in those packages. `test-vectors/MANIFEST.json` lists every file with a matching SHA-256 (82 entries).

## 5. Conformance table

QV-16 section 4 requirements (crypto/protocol/verifier scope) and TODO Done rows in scope. OK = implemented, behaves per acceptance
criteria, test present.

| Spec ID | Status | Code | Test / vector | Note |
|---|---|---|---|---|
| QV-16-REQ-001 | OK | `crypto/src/ristretto.ts` `pointFromBytes` | `crypto/test/ristretto.test.ts`; `primitives/ristretto/decode.json` (22 invalid) | both verifiers agree |
| QV-16-REQ-002 | OK | `ristretto.ts` `scalarFromBytes` | `scalars.json` (`l`, `2^256-1`) | |
| QV-16-REQ-003 | OK | `scalarRandomNonZero`, `hsNz` | `ristretto.test.ts`, `transcript.test.ts` | |
| QV-16-REQ-004 | partial | `crypto/src/transcript.ts` (typed registry + runtime kind check) | per-field CDS/dec/PoK/limit tests, `tagged-hash.json` | omissions of fields that also feed the commitments survive the crypto suite (B1-11); `cp-dec-nonce` binds no aggregate (CP-02) |
| QV-16-REQ-005 | partial | `crypto/src/json.ts` | `canonical-json.json` (23); Python agrees | `canonicalize` accepts non-plain objects/NFD (C5) |
| QV-16-REQ-006 | OK | `validateManifest`, `verify.ts` (records `E_VERSION`) | `manifest-unknown-proto` | records: class L |
| QV-16-REQ-007 | partial | `protocol/src/schema.ts` | `manifest.json` (11 negatives, not every field) | inherited names accepted (CP-03); Python schema differs (B1-08) |
| QV-16-REQ-008 | partial | `protocol/src/dkg.ts` | `dkg.test.ts` property/scenarios | no statistical or rushing-adversary test; CP-06 |
| QV-16-REQ-009 | OK | `pokProve/pokVerify` | `pok.json` rogue-key; `dkg.test.ts` | |
| QV-16-REQ-010 | mismatch | `adjudicateDkg` | `dkg.json` (8), `dkg.test.ts` | verifiers disagree on Q for duplicates/early records/complaints (B1-07, B1-04) |
| QV-16-REQ-011 | OK | `proofs.ts`, `ballot.ts` | `cds.json` (plaintext-2), `limit.json` (overvote), `ballot.test.ts` | |
| QV-16-REQ-012 | OK | `binderFor` | `ballot.test.ts` copy test; `verify-ballot-copy-resigned` | |
| QV-16-REQ-013 | OK | `buildBallot`, `deriveXi` | `ballot.test.ts` "REQ-013 hedging" | |
| QV-16-REQ-014 | not reviewed | web client (B3) | | |
| QV-16-REQ-015 | mismatch | `ballotlog.ts` | in-limit case tested only | B1-01; P4; CP-01 |
| QV-16-REQ-016 | mismatch | `crypto/src/ed25519.ts` | `verify.json` (S+l, small-order A) | cofactored equation, mixed-order accepted (CP-04); no non-canonical A/R or small-order R vectors; the small-order-R pre-check is untested (B1-11) |
| QV-16-REQ-017 | OK | `ballotlog.ts` chain | `attacks.test.ts` R-01 #5/#6 | reordering is detected as `E_SUPERSEDES` (L, verdict PASS by design X-10) |
| QV-16-REQ-018 | OK | `decryptAggregates` | `tally.test.ts` any t-subset | |
| QV-16-REQ-019 | partial | `verify.ts` | mutations | `decrypters` not recomputed (P11) |
| QV-16-REQ-020 | partial | `verify.ts`, `packages/verifier` | mutation corpus, canary | V13 never runs; negative corpus incomplete (B1-11); non-zero exit OK |
| QV-16-REQ-021 | partial | only `packages/crypto` imports `@noble/*` | none automated | no lint/CI rule; QV-ADR-024 vendoring not done (N-24) |
| QV-16-REQ-022 | partial (scope) | no logging in crypto/protocol/verifier src | none | share destruction is trustee scope (B2) |
| QV-16-REQ-023 | not-implemented | none | | Should; T-071 Open (not inflation) |
| QV-16-REQ-024 | OK | `rules.ts` (BigInt), tally integers | `manifest-rules.test.ts` boundaries | tie semantics are a spec gap (B1-07) |
| QV-16-REQ-025 | OK | `tally.ts:65-66`, `verify.ts:582` | `tally.test.ts` trustee-mode spoil | |
| T-021, T-023, T-025, T-029-T-032, T-042, T-054, T-056, T-058, T-060, T-062, T-063, T-143 | OK | | | |
| T-022 | mismatch | `ed25519.ts` | | CP-04 |
| T-026 | partial | `transcript.ts` | | see REQ-004 |
| T-028 | partial (inflated) | `elgamal.ts` | | no rerandomize (B1-10); C4 |
| T-033, T-034, T-035 | OK with KNOWN edges | | | C7; CP-02; C1 |
| T-037 | OK | `kdf.ts` | `cli/test/cli.test.ts` only | |
| T-038 | partial | `rng.ts` | | test RNGs exported from the main entry (C11); QV-34-REQ-013 not met |
| T-046 | partial | `json.ts`, `schema.ts` | | CP-03, C5 |
| T-049 | partial | `manifest.ts` | | P6, B1-05, count-quorum field undefined |
| T-055 | partial | `ballotlog.ts` | | B1-01, P4 |
| T-057 | partial | `rules.ts`, `tally.ts` | | basis `roll` missing (N-27); B1-07 |
| T-061 | partial | `tally.ts` | | P2 |
| T-142 | partial | `protocol/src/verify.ts` | | P3, P9, P11, CP-01, CP-05, B1-01 |
| T-145 | not reviewed | web build (B3) | | |
| COMPLETION "verifier-py 37 OK" | OK | | re-run: 37 OK | |
| COMPLETION "mutations vs verifier-py all match" | OK | | runner: 23/23 PASS | canary FAIL is QV-ERR-PY-005 (documented) |
| COMPLETION C3 | stale | | | B1-09 |
| COMPLETION C4, C6 | still open (accurate) | | | no `verifier-py/NOTES.md`; no Python job in `.github/workflows` |

## 6. Spec gaps (not bugs; owner decisions needed)

* SG1 Yes-no tie: QV-16 §5.19.3 item 2 ("tie only if the rule cannot decide, e.g. simple majority with y = n") vs QV-20 §5.1 pseudocode
  (never tie-breaks; exact tie on strict rule => REJECTED). Implementations differ (B1-07). QV-ERR-PY-003(a).
* SG2 Field name of a `count` quorum (`value` vs `n`). QV-ERR-PY-003(d).
* SG3 Order of `winners`/`tied` and the ranking order of equal counts. QV-ERR-PY-003.
* SG4 Do spoils outside the window or beyond `max_spoils_per_voter` still enter the spoiled set? (REQ-015 suggests yes.)
* SG5 Duplicate, early and equivocating DKG records; complaints by or against dealers outside R1/R2. QV-ERR-PY-009.
* SG6 Which ballot counts when the latest admissible cast is excluded. QV-ERR-PY-010.
* SG7 Finding classes for non-ballot records (unknown type, bad signature, duplicate tally, control entries). §5.20 is silent.
* SG8 The bidi-control list (QV-13-REQ-082 lists U+202A-E, U+2066-9; implementations add U+200E/F and U+061C).
* SG9 Ed25519 equation and mixed-order keys: §5.12.2 says "cofactorless-equivalent", noble is cofactored (CP-04, QV-ERR-PY-011).
* SG10 Manifest bounds not stated in QV-16 (`clock_skew_s`, `max_per_voter`, string lengths, coordinator key count, witness rules).
* SG11 Approval without `winners` (QV-16 defers to QV-20; QV-20 §5.3 implies one winner).
* SG12 `status-quo` for methods other than yes-no (QV-16 "named option wins ties" does not restrict it; TS does).
* SG13 Whether a verifier may run without an out-of-band manifest hash and what it must then report (B1-06).

## 7. Not reviewed / coverage limits

* Web client (REQ-014 Benaloh UI, offline `verifier.html`, T-145): B3. Server, board, trustee, CLI: B2, except where a protocol API is
  called (none deep-dived).
* `logcheck.ts` (QV-18 log layer) was read for verifier behaviour only; board Merkle/checkpoint primitives were not reviewed.
* Constant-time behaviour rests on `@noble/*`; no timing measurement. JavaScript `bigint` scalar arithmetic on secrets (`polyEval`,
  proof responses) is variable-time (KNOWN N-25/T-039).
* External-standard vectors were not re-imported (QV-34-REQ-003 open); RFC 9496/8032 values were not re-derived here.
* The mutation sweep used a subset of the protocol suite (no e2e/property tests) and ran on scratchpad copies; whether a survivor is
  equivalent, not reachable, or a real gap was decided by code reading (no distinguishing input was built for M26/M30).
* Phase 2/3 hooks (`AuthScheme`) are not implemented and were not reviewed.
* `bundle-cipher`/`kdf` reviewed only for the KNOWN items.

## 8. Commands run (worktree root unless noted)

| Command | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund` | pass |
| `npm run typecheck` | pass (exit 0) |
| `cd packages/crypto && node --test "test/**/*.test.ts"` | pass: 49/49 |
| `cd packages/protocol && node --test "test/**/*.test.ts"` | pass: 172/172 (125 s) |
| `cd packages/verifier && node --test "test/**/*.test.ts"` | pass: 23/23 |
| `cd verifier-py && python3 -m unittest discover -s tests` | pass: 37 OK |
| `python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet` | exit 1: 282 vectors, 228 PASS, 1 FAIL (canary, QV-ERR-PY-005), 53 NOT-IMPLEMENTED |
| `node audit-b1-poc/gen.ts` | 17 scenarios written; TS verdicts recorded |
| `node audit-b1-poc/known_election.ts` | KNOWN scenarios written (CP-01, P3, P7, P9, P11, P2) |
| `python3 -I audit-b1-poc/py_diff.py` | 25 bundles, **19 DIVERGE** (TS vs Python verdict) |
| `node audit-b1-poc/oplevel.ts`; `python3 -I audit-b1-poc/op_py.py` | manifest 23/25 diverge; DKG 5/6 diverge; Ed25519 mixed-order 14/16 diverge |
| `node audit-b1-poc/known_check.ts` | C7, C4, C5, C6, C8, C1, CP-02, CP-03, C10: AFFECTED |
| `node --test audit-b1-poc/b1-poc.test.ts` | pass 5/5 (defects present: B1-01, B1-06, B1-05, B1-13, reference control-entry handling) |
| `python3 -I -m unittest discover -s audit-b1-poc -p 'test_b1_py_poc.py'` | pass 9/9 (defects present: B1-02, B1-03, B1-04, B1-08, B1-13, B1-14, B1-01 divergence) |
| `node packages/verifier/src/bin.ts audit-b1-poc/out/E0-baseline.bundle.json --skip-selftest` | `VERDICT: PASS`, `V1 PASS`, exit 0 (B1-06) |
| `node audit-b1-poc/quick_ts.ts` / `python3 -I audit-b1-poc/quick_py.py` on `pause-resume.bundle.json`, `E18-roll-uppercase-hex.bundle.json`, `E19-manifest-envelope-extra-members.bundle.json`, `E20-dkg-open-marker-dropped.bundle.json` | TS PASS / Py FAIL; TS FAIL / Py PASS; TS PASS / Py FAIL; TS FAIL / Py PASS |
| `node audit-b1-poc/known_tr01_plant.ts` | honest trustee-mode audit: benaloh `pass`; with a planted junk cast: `fail` + `E_SPOILED_CODE_CAST/ALARM` (CP-01 note) |
| `node audit-b1-poc/identity_cds.ts` | `cdsVerify` rejects (O,O) only via its guard; the same transcript verifies without the guard (B1-11) |
| `node audit-b1-poc/small_order_r.ts` (+ verifier-py check) | R = identity signature: QuietVote wrapper false, noble `verify(zip215:false)` true, verifier-py false (B1-11) |
| scratchpad copy of `packages/crypto` with PR #10 `ed25519.ts`, `node check.ts` | mixed-order key strict-point false, 0/16 signatures accepted (CP-04 residual) |
| mutation sweep `python3 -I audit-b1-poc/mutation/mutate.py <copy> [ids]` on two scratch copies of `package.json`, `packages/{board,crypto,protocol}` and `test-vectors` (own `node_modules/@quietvote` links) under `/tmp/claude-0/-home-user/b9ccda38-9f8d-54d6-a99c-1f20e1924081/scratchpad/` (`mut`: M04-M07, M09-M24, M26, then M25; `mut2`: M01-M03, M08, M27-M32; replace-all for patterns that occur twice); `summarize.py` over the four logs; `which_fail.py <copy> M25` | 32/32 run: 8 killed by crypto, 13 only by protocol tests, 11 survived (8 equivalent or not reachable, 3 real gaps); copies verified identical to the worktree afterwards (B1-11) |

PoC and evidence files (left in place): `/home/user/audit/quietvote-b1/audit-b1-poc/` (`gen.ts`, `known_election.ts`, `known_check.ts`,
`oplevel.ts`, `op_py.py`, `py_diff.py`, `quick_ts.ts`, `quick_py.py`, `known_tr01_plant.ts`, `identity_cds.ts`, `small_order_r.ts`, `b1-poc.test.ts`, `test_b1_py_poc.py`, `out/*.bundle.json`,
`out/ts-results.json`, `out/py-results.json`, `out/op-*.json`, `mutation/` with `mutate.py`, `summarize.py`, `which_fail.py`, the four
run logs, the result JSON files and `summary.txt`). Run order: `gen.ts`, `known_election.ts`, `py_diff.py`; `oplevel.ts`,
`op_py.py`; then the two PoC test files. `out/E18-roll-uppercase-hex.bundle.json` (roll entries upper-cased), `out/E19-manifest-envelope-extra-members.bundle.json` and
`out/E20-dkg-open-marker-dropped.bundle.json` were derived by hand from `E0-baseline`.
