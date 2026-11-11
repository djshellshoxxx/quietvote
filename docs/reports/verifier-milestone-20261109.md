# Verifier milestone evidence and decision packet — 2026-11-09

**Strict gate: BLOCKED.** At `51851c10c5ac33cd89f05f9e0af44fd43b41b930`, the unchanged differential command exits **1**: all **27 verdicts agree**, but **3 reports differ in 17 compared fields**. The historical 12 differences were reproduced separately; nine already have a repair in this source. This work adds evidence only. No verifier, expected vector, comparison rule or CI gate was changed.

QuietVote and its second verifier remain **unaudited and not for real elections**. Corpus agreement is not independent security review or complete verifier conformance.

## Evidence and scope

- Current source: [`51851c10c5ac33cd89f05f9e0af44fd43b41b930`](https://github.com/djshellshoxxx/quietvote/tree/51851c10c5ac33cd89f05f9e0af44fd43b41b930). This immutable tree pins the cited text; relative document links are navigation aids and may later change.
- Historical source rerun: `324a278fc27cd6ec4bec74260c414fc6d186b5a8`, immediately before report repair `e858b9e10ab3d2d219338895813f0bf174e98865`.
- Both runs used Node `v24.22.1`, Python `3.12.14`, isolated worktrees and each worktree's own workspace-package links. Installed external dependencies came from the repository lockfile. The second verifier used the Python standard library only.
- `test-vectors/` and `scripts/compare-verifiers.ts` are identical between those two sources. The corpus Git tree is `70c3d44d5d49785d78caff57ea9c7952f5bda6bf`.
- [Machine receipt](verifier-milestone-20261109.json) records all 27 case verdicts, every historical/current difference, mutation expectations and input digests, minimized actual report pairs for the three remaining failures, command results and comparator digest. Optional absent report members remain absent in those pairs.
- The historical rerun's complete `rows` array equals [the 2026-10-30 receipt](consolidation-cross-verifiers-2026-10-30.json). That earlier receipt names source `247df393ea1ace300fe5ed1f569a12090e1364dc`; it is historical evidence, not the current source.

The strict command compares the verdict, 11 shared check statuses, three counts, context prefix and results. Python's unsupported `chk.board.append_only`, `chk.board.witness` and `chk.receipts.sample` remain explicitly excluded, never counted as agreements. Findings, error-detail text, caveats and additional report fields are not part of that comparator. There is no claim that all 14 checks or every report member agree.

## Validation actually run

| Source | Command | Exit | Observation |
|---|---|---:|---|
| Historical source | `node scripts/compare-verifiers.ts --json` | 1 | 27/27 verdict agreements; 12 differing reports |
| Current source | `node scripts/compare-verifiers.ts --json` | 1 | 27/27 verdict agreements; 3 differing reports, 17 differing fields |
| Current source | `node --test packages/protocol/test/report-semantics.test.ts` | 0 | 10 passed; 0 failed or skipped |
| Current source, `verifier-py/` | `python3 -I -m unittest` | 0 | 58 tests passed |
| Current source | `python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet --report <scratch-report.json>` | 0 | 282 cases: 229 PASS, 0 FAIL, 53 NOT-IMPLEMENTED; 79 listed file hashes matched, 0 mismatched/missing |

The 53 unsupported cases are 48 `log.verify_election` and five `benaloh.private_audit` cases. The Python vector runner's zero exit is its documented “no FAIL” policy; it is not a full-implementation result. Its MANIFEST check reports an unsigned manifest and does not recompute the Merkle root. No expected vector was regenerated. The full application test suite and hosted matrix are outside this focused receipt.

## Disposition of all 12 historical report differences

All rows below have verdict `FAIL` in both implementations, both historically and currently. `R` means the exact recomputed result shown after the table. “Absent” describes the actual report; the strict script compares missing `results` as `[]`.

For the eight open-binding cases, the historical difference tuple is ordered as `chk.manifest.sig`, `chk.keys.trustees`, `chk.encoding.canonical`. It was TS `(pass, pass, pass)` versus Python `(not_run, not_run, not_run)`. The current tuple is `(pass, pass, not_run)` in both. The actual binding failure remains `chk.time.window=fail`, `E_MARKERS`; it was not made acceptable.

| Mutation file under `test-vectors/v1/mutations/` | Historical TS / Python difference | Current disposition | Spec/source basis |
|---|---|---|---|
| `open-binding-fields-absent.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-joint-key-ref-forward.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-joint-key-ref-mismatch.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-manifest-hash-mismatch.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-roll-ref-absent.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-roll-ref-forward.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-roll-ref-nonexistent.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `open-roll-ref-wrong-record.json` | Open-binding tuple above | Resolved before this work; tuples agree | S1, S2, S3; existing repair `e858b9e` |
| `unknown-field-in-tally.json` | Aggregate/decrypt/rules: TS `not_run`, Python `pass`; results: absent / `R` | Both leave all three checks `not_run` and results absent; encoding remains failed | S4; existing repair `e858b9e` |
| `manifest-signature-removed.json` | Nine checks, three counts, context prefix and results differ | Still differs: 14 fields; see D-92 below | S5; unresolved approval provenance |
| `count-altered.json` | Rules: `not_run` / `pass`; results: absent / `R` | Still differs: 2 fields; see D-93/D-94 below | S6; unresolved approval provenance |
| `result-flipped.json` | Results: absent / `R` | Still differs: 1 field; see D-94 below | S7; unresolved approval provenance |

```json
[{"contest":"budget","participation":4,"quorum_met":true,"outcome":{"kind":"passed"}}]
```

Source keys refer to repository text at the current source SHA:

- **S1:** [QV-16 Appendix C](../16-crypto-protocol.md#appendix-c--full-verifier-algorithm-check-list), C1/C2 precede the C3 binding check; [QV-35](../35-second-verifier.md) REQ-005 makes later checks `not_run`.
- **S2:** [QV-34 §9.1](../34-test-vectors-conformance.md#91-named-check-registry-schemacheck-idsjson), encoding means all objects were examined; QV-35 REQ-003 forbids `pass` without evidence.
- **S3:** [Errata](../errata/spec-errata-log.md) QV-ERR-PY-015 and the November 4 stop-scope addendum; [OPEN-DECISIONS §I](../plan/OPEN-DECISIONS.md#i-added-2026-11-04-verifier-report-semantics-strict-differential). Existing regression files are `packages/protocol/test/report-semantics.test.ts` and `verifier-py/tests/test_report_semantics.py`.
- **S4:** QV-16 §5.5 item 7 (closed schemas), Appendix C step 1 (rejection), §5.20 (`E_SCHEMA`); the QV-ERR-PY-007 tally addendum withdraws using the rejected record as evidence.
- **S5:** QV-16 Appendix C input anchor and steps 2–4; QV-35 REQ-005 names anchor failure but not signature failure; QV-34 §9.1 defines signature validity. These do not settle stopping versus continuing after an anchored manifest's signature failure.
- **S6:** QV-16 Appendix C steps 19–21 and QV-35 REQ-005. They do not settle whether results may be evaluated from valid recovered counts when only the published `T` is false.
- **S7:** QV-35 REQ-003 lists results without defining failure-time payloads; QV-16 C7/C8 and QV-34 mutation expectations do not pin that member on these failures.

## Exact remaining outputs and decisions

### D-92: manifest-signature-removed

Both reports have `verdict=FAIL`, `chk.manifest.hash=pass`, `chk.manifest.sig=fail`, and fatal `E_MANIFEST_SIG`. The complete differing fields are:

| Compared field | TypeScript | Python |
|---|---|---|
| `chk.keys.trustees` | `not_run` | `pass` |
| `chk.ballots.valid` | `not_run` | `pass` |
| `chk.ballots.latest` | `not_run` | `pass` |
| `chk.tally.aggregate` | `not_run` | `pass` |
| `chk.tally.decrypt` | `not_run` | `pass` |
| `chk.result.rules` | `not_run` | `pass` |
| `chk.benaloh.spoiled` | `not_run` | `pass` |
| `chk.encoding.canonical` | `not_run` | `pass` |
| `chk.time.window` | `not_run` | `pass` |
| `counts.cast` | `0` | `4` |
| `counts.spoiled` | `0` | `1` |
| `counts.counted` | `0` | `4` |
| `ctx_prefix` (`ctxPrefix` in TS) | absent | `bb914d504e8e9247` |
| `results` | absent; compared as `[]` | `R` above |

Mechanism: `packages/protocol/src/verify.ts` returns immediately after `!sigsOk`; `verifier-py/qv_verifier/election.py` records the fatal signature finding and continues. The input mutation expects only verdict FAIL, failing check `chk.manifest.sig` and code `E_MANIFEST_SIG`; it does not specify the 14 fields above.

**Required ruling:** stop downstream after signature failure, or continue after a matching anchor while preserving the fatal signature finding. The ruling must also define count/context/result availability after that stop. Neither behavior is changed here.

### D-93: count-altered

Both reports fail `chk.tally.decrypt` with fatal `E_DLOG_RANGE`. The aggregate agrees; Python's finding states published `budget/yes` count `4` differs from recovered `3`.

| Compared field | TypeScript | Python |
|---|---|---|
| `chk.result.rules` | `not_run` | `pass` |
| `results` | absent; compared as `[]` | `R` above |

Mechanism: TS evaluates rules only when counts exist **and** decryption status is `pass`. Python stores the recovered count despite the published-count mismatch, then evaluates rules. Both reports have cast/spoiled/counted `4/1/4` and context prefix `bb914d504e8e9247`. The mutation expects only verdict FAIL, failing check `chk.tally.decrypt` and `E_DLOG_RANGE`.

**Required ruling:** skip rules whenever decryption fails, or evaluate from independently recovered counts when all required proofs/recoveries succeeded. Specify separate handling for insufficient shares, failed recovery, an unconfirmed aggregate and the privacy floor; none should become an inferred pass.

### D-94: result-flipped

Both reports have `verdict=FAIL`, `chk.tally.decrypt=pass`, `chk.result.rules=fail` and fatal `E_RESULT`. All compared fields except results agree.

| Compared field | TypeScript | Python |
|---|---|---|
| `results` | absent; compared as `[]` | `R` above |

Mechanism: TS emits `results` only after published results match evaluation and rules pass. Python assigns its recomputation before comparing against the published results. The mutation expects only verdict FAIL, failing check `chk.result.rules` and `E_RESULT`.

**Required ruling:** define `results` as verified published results, recomputation, or verified results plus a separately named diagnostic member. Specify its condition in the report schema and consumer behavior. Adding or excluding a new diagnostic member without a decision would not resolve the meaning of the existing field.

## Approval provenance conflict: implementation remains held

The repository contains both an accepted batch approval and still-open, contradictory recommendations. A chronology alone does not decide their normative precedence.

| Evidence | Recorded state | Consequence for these three cases |
|---|---|---|
| `761da0a45c538aa2232ee5511eb84e3fc1ca4e21`, committed 2026-11-04 07:44:51Z; [QV-ADR-027](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/decision-log.md#qv-adr-027--owner-approval-of-the-2026-11-04-decision-register-categories-ad) | Accepted owner approval of every recommended default in [DECISIONS-2026-11-04](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/plan/DECISIONS-2026-11-04.md), categories A–D; implementing commits should amend specs/errata | Category A recommends stop after signature failure; rules `not_run` after decrypt failure; empty results after failed rules |
| `e858b9e10ab3d2d219338895813f0bf174e98865`, committed 2026-11-04 08:07:44Z | Repaired nine differences and explicitly left D-92–D-94 for the owner | [OPEN-DECISIONS](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/plan/OPEN-DECISIONS.md) recommends **continue**, **evaluate recovered counts**, and a **separate recomputation field**; these differ from the register's defaults |
| `dcc92e5589d6aff3a147f1d78546bed85b80fe62`, committed 2026-11-04 08:53:54Z | Merged the owner-register branch into the branch containing `e858b9e` | Both records coexist in the assigned source; the merge did not reconcile them |
| [PR #28](https://github.com/djshellshoxxx/quietvote/pull/28), created 2026-11-04 17:17:08Z; read back 2026-11-09 | Open/draft at `51851c10`; body still requires the strict differential to remain failing until D-92–D-94 | The active checkpoint carries an explicit hold; its recorded “three detail differences” matches this rerun |

The register commit and report-repair commit were on separate histories with common base `324a278`; later commit time is not evidence that one author reviewed and superseded the other decision. PR #28's `updated_at` was `2026-11-09T11:10:48Z` at readback; that timestamp alone does not establish when the hold wording was written.

**Decision packet to reconcile:** explicitly confirm whether ADR-027 category A's three DIFF defaults govern D-92–D-94, or replace them with named alternatives. Then reconcile QV-16 Appendix C, QV-34 report semantics, QV-35 REQ-003/005, the errata addendum and OPEN-DECISIONS together. The current task's instruction to preserve unresolved semantics keeps this work diagnostic-only. This report does not assert that ADR-027 was revoked or that a fresh product decision has been made.

After that reconciliation, implementation must retain each mutation's rejection, keep the strict comparator and its compared fields intact, add regressions for the selected stop/result behavior plus positive controls, and rerun the unchanged vectors and both verifiers. Unsupported Python capabilities and the independent-review gate remain separate blockers even if these three reports later agree.

## Reproduction

Use separate checkouts at the current and historical SHAs above, with their own workspace-package resolution. From each repository root:

```sh
node scripts/compare-verifiers.ts --json
```

Both runs are expected to exit 1. The historical result has 12 differing cases; the current result has three. Do not append a success-forcing shell fallback when recording the exit status.

For the inherited repairs and current Python behavior:

```sh
node --test packages/protocol/test/report-semantics.test.ts
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet
```

Run `python3 -I -m unittest` with working directory `verifier-py/`. The JSON companion is observed evidence, not a new expected-vector file or a rule selecting either side of a disagreement.
