# QuietVote consolidation audit ledger — 2026-10-30

AI-assisted review and implementation; not an independent professional audit. QuietVote remains unaudited and not for real elections.

Latest accepted source checkpoint: `247df393ea1ace300fe5ed1f569a12090e1364dc`. Initial CI checkpoint `963c577` is followed by web repair `f58533b` and the accepted documentation/status commit; validation completed at this frozen source. The strict differential and claims checks retain explicit nonzero exits. This ledger accounts for every original identifier; source repair, historical reproduction, final validation and owner approval are distinct evidence.

## Evidence and review boundaries

- Original interim extraction: **72 findings, 52 batch-verification records, 0 extra lens results**. All 52 interim verdicts were confirmed; 20 had no completed interim batch review. Missing revised severity remains **pending**, even where consolidation adds repairs. The full original extraction and verification objects are retained in the companion JSON.
- Original audit base: `424110d90e23dc443aa4498a4340973d3c8cb8b6`; interim backup commit: `2a02bd3249f3c988ef5afd8e9559fa13a959bdef`. [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) and the dated reports/PoCs remain unchanged.
- A passing historical PoC that asserts a defect demonstrates the defect, not a repair. Repair evidence below names correct-behavior regression tests and bounded scope. Final commands, cwd, environment overrides, exit statuses and timings are recorded in the [validation receipt](../reports/consolidation-validation-2026-10-30.json). Worker reproduction notes remain bounded to their named tests.
- Strict differential remains a **failed gate**: the final run has 27 verdicts agreeing and 12 detailed reports disagreeing; actual strict exit is 1. The [full per-case result](../reports/consolidation-cross-verifiers-2026-10-30.json) retains every differing field. QV-ERR-PY-006/007/015 and other owner semantic gates remain. No semantics or candidate vectors were changed to manufacture agreement.
- **B3-01 remains blocked by protocol review.** The web/server registration contract is not repaired by tests that show refusal. Other confirmed omitted, partial and unresolved findings remain explicit below.
- Every source fix still requires independent external security/cryptographic review. No audit, approval, release, deployment, translation-review or real-election readiness is claimed.

## Source repair commits

| Scope | Exact commit |
|---|---|
| crypto | `48a2b73c6a4c77666284f094372eb683e2a5364a` |
| server | `f2fc966db01cd6e4dc1f5104d67a769240d35ee2` |
| cli | `aaf35a71f41f2fd091a1336d3eb0636fa8d4d347` |
| trustee | `8cf26691f87af3a10c55c896f15bf4169aa862fa` |
| web | `88b376a81d464617e8f5fe3da65fc327dfcba9ec` |
| ci | `963c57716dbceced04114d5119c61740b0cfb0fb` |
| Web follow-up (SSE/chart race and seed cleanup) | `f58533b13c87f06af50f8d104c5a28b77bb8c270` |
| Documentation/status reconciliation | `247df393ea1ace300fe5ed1f569a12090e1364dc` |

Imported historical repairs include SRV-001 `0a800649139d9c34773ee161d548b5b0ee477887`, CP-01/03/04 `592adbb790a5fa8d18f1c32cd33daa7a308c1ce8`, CP-05 `6e0559648ae07fb1c3eb6f0138d22da9dbf3ace7`, second-wave crypto/protocol `e4513dbfdd4889a00c07d6515305a7b7017ded61`, and dependency gates `57ba6cd779e7621603cd36179887379e942b5e63`. Those are provenance, not proof that all related findings are closed.

Pinned test tooling is recorded in [docs/decision-log.md](../decision-log.md) (QV-ADR-026): implemented on this branch, with tooling/security review required before a main merge. It does not authorize a protocol or product-policy change.

## All 72 original findings

“Revised” is the historical interim verifier severity. “Disposition” is the current bounded worker assessment; partial/disclosed/documentation states do not close their remaining security gates. Full original details and exact interim commands/excerpts follow the table.

| ID | Original severity | Interim verdict | Revised severity | Consolidation disposition | Fix/partial fix |
|---|---|---|---|---|---|
| B2-01 | High | confirmed | High | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-02 | Medium | confirmed | Medium | open | No semantic repair commit; open/owner gate. |
| B2-03 | Medium | confirmed | Medium | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-04 | Medium | confirmed | Medium | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-05 | Medium | confirmed | Medium | blocked_protocol_review | No semantic repair commit; open/owner gate. |
| B2-06 | Medium | confirmed | Medium | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-07 | Medium | confirmed | Medium | blocked_integrity_design | No semantic repair commit; open/owner gate. |
| B2-08 | Medium | confirmed | Low | fixed | [8cf2669](https://github.com/djshellshoxxx/quietvote/commit/8cf26691f87af3a10c55c896f15bf4169aa862fa) |
| B2-09 | Low | confirmed | Low | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-10 | Low | confirmed | Low | blocked_contract_review | No semantic repair commit; open/owner gate. |
| B2-11 | Low | confirmed | Low | open | No semantic repair commit; open/owner gate. |
| B2-12 | Low | confirmed | Low | blocked_contract_review | No semantic repair commit; open/owner gate. |
| B2-13 | Low | confirmed | Low | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-14 | Low | confirmed | Low | fixed | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B2-15 | Medium | confirmed | Low | documentation_reconciled | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2), [247df39](https://github.com/djshellshoxxx/quietvote/commit/247df393ea1ace300fe5ed1f569a12090e1364dc) |
| B2-16 | Low | confirmed | Low | open | No semantic repair commit; open/owner gate. |
| B2-17 | Low | confirmed | Low | fixed_bounded_cache | [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| KNOWN TR-07/TR-08 | Low | confirmed | Low | partially_fixed | [8cf2669](https://github.com/djshellshoxxx/quietvote/commit/8cf26691f87af3a10c55c896f15bf4169aa862fa) |
| B1-01 | Medium | confirmed | Medium | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-02 | Medium | confirmed | Low | owner_gate | No semantic repair commit; open/owner gate. |
| B1-03 | Low | confirmed | Low | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-04 | Medium | confirmed | Low | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-05 | Low | confirmed | Low | owner_gate | No semantic repair commit; open/owner gate. |
| B1-06 | Medium | confirmed | Medium | fixed_disclosure | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-07 | Medium | confirmed | Medium | owner_gate | No semantic repair commit; open/owner gate. |
| B1-08 | Low | confirmed | Low | partially_fixed_owner_gate | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-09 | Info | pending | pending | documentation_corrected_policy_gate_open | [247df39](https://github.com/djshellshoxxx/quietvote/commit/247df393ea1ace300fe5ed1f569a12090e1364dc) |
| B1-10 | Info | pending | pending | documentation_corrected_partial_scope | [247df39](https://github.com/djshellshoxxx/quietvote/commit/247df393ea1ace300fe5ed1f569a12090e1364dc) |
| B1-11 | Low | pending | pending | partially_covered_open | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-12 | Info | pending | pending | fixed_documentation_risk_open | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-13 | Low | confirmed | Low | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| B1-14 | Low | confirmed | Low | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| CP-01 (verifier-py residual) | Medium | confirmed | Medium | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| CP-04 (verifier-py residual) | Medium | confirmed | Medium | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| TSV-04 | Info | confirmed | Info | owner_gate_disclosed | No semantic repair commit; open/owner gate. |
| TSV-06 | Info | confirmed | Info | fixed | [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a) |
| PY-01 | Info | confirmed | Info | unsupported_owner_gate | No semantic repair commit; open/owner gate. |
| PY-02 | Info | confirmed | Info | unsupported_owner_gate | No semantic repair commit; open/owner gate. |
| WV-9 | Info | confirmed | Info | open | No semantic repair commit; open/owner gate. |
| N-13, N-24, N-25, N-27 | Info | confirmed | Info | open_owner_gates | No semantic repair commit; open/owner gate. |
| B3-01 | High | confirmed | High | blocked | No semantic repair commit; open/owner gate. |
| B3-02 | High | confirmed | Medium | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f58533b](https://github.com/djshellshoxxx/quietvote/commit/f58533b13c87f06af50f8d104c5a28b77bb8c270) |
| B3-03 | Medium | confirmed | Low | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2) |
| B3-04 | Medium | confirmed | Low | partial | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-05 | Medium | confirmed | Medium | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-06 | Medium | confirmed | Medium | partial | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-07 | Medium | confirmed | Medium | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-08 | Medium | confirmed | Medium | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-09 | Medium | confirmed | Medium | partial | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-10 | Medium | confirmed | Medium | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-11 | Medium | confirmed | Medium | partial | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-12 | Medium | confirmed | Low | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-13 | Medium | confirmed | Low | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-14 | Medium | confirmed | Medium | partial | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-15 | Low | confirmed | Low | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-16 | Low | confirmed | Low | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-17 | Low | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f58533b](https://github.com/djshellshoxxx/quietvote/commit/f58533b13c87f06af50f8d104c5a28b77bb8c270) |
| B3-18 | Low | pending | pending | open | No semantic repair commit; open/owner gate. |
| B3-19 | Low | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-20 | Low | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f58533b](https://github.com/djshellshoxxx/quietvote/commit/f58533b13c87f06af50f8d104c5a28b77bb8c270) |
| B3-21 | Low | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-22 | Low | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-23 | Low | pending | pending | open | No semantic repair commit; open/owner gate. |
| B3-24 | Low | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-25 | Low | pending | pending | blocked | No semantic repair commit; open/owner gate. |
| B3-26 | Low | pending | pending | open | No semantic repair commit; open/owner gate. |
| B3-27 | Low | pending | pending | partial | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-28 | Info | pending | pending | open | No semantic repair commit; open/owner gate. |
| B3-29 | Info | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-30 | Info | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [963c577](https://github.com/djshellshoxxx/quietvote/commit/963c57716dbceced04114d5119c61740b0cfb0fb) |
| B3-31 | Info | pending | pending | fixed | [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec) |
| B3-32 | Info | pending | pending | open | No semantic repair commit; open/owner gate. |

### Disposition counts

These are verbatim status labels, not “security fixed” totals.

- `blocked`: 2
- `blocked_contract_review`: 2
- `blocked_integrity_design`: 1
- `blocked_protocol_review`: 1
- `documentation_corrected_partial_scope`: 1
- `documentation_corrected_policy_gate_open`: 1
- `documentation_reconciled`: 1
- `fixed`: 35
- `fixed_bounded_cache`: 1
- `fixed_disclosure`: 1
- `fixed_documentation_risk_open`: 1
- `open`: 9
- `open_owner_gates`: 1
- `owner_gate`: 3
- `owner_gate_disclosed`: 1
- `partial`: 6
- `partially_covered_open`: 1
- `partially_fixed`: 1
- `partially_fixed_owner_gate`: 1
- `unsupported_owner_gate`: 2

## Detailed original evidence, reproduction and disposition

### B2-01

**Severity and historical review:** High → High; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Anonymous GET /elections/{id}/tally/draft synchronously recomputes the full homomorphic aggregate (and after restart/eviction the full proof-verifying ballot analysis) on the single event loop on every call.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-01).

**Original location:** packages/server/src/app.ts:410-421, packages/server/src/election.ts:1041-1058, packages/server/src/election.ts:1150-1161, packages/protocol/src/tally.ts:224-228

**Original confidence/category:** CONFIRMED; DoS / availability

**Original spec references:** QV-29-REQ-019, QV-29-REQ-001, QV-09 §13

**Original scenario:** Once any election has its tally aggregate posted (TALLYING/STALLED/AUDIT/ARCHIVED/IMPORTED), an anonymous client loops GET .../tally/draft; with 2,000 counted ballots each request stalls the whole instance 5.5-6.9 s.

**Original evidence (verbatim):** PoC packages/server/test/b2-audit-poc.test.ts in /home/user/audit/quietvote-b2, `node --test --test-name-pattern=B2-01 test/b2-audit-poc.test.ts`: aggregate 2.659-3.344 ms per counted ballot; 2000 counted -> 409 after 5539-6948 ms with /healthz delayed equally; analyzeBallotLog 116-119 ms per ballot (PoC injects 2,000-ballot set into cached analysis).

**Original suggested remediation:** Serve draft from stored aggregate; return 409 before work when fewer than t shares; cache per (decrypters, shares); move work to a bounded worker queue; consider class P or coordinator-only access.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && VB_VOTERS=20|100 node --test --test-name-pattern=VB-01 test/verify-b2b1.test.ts
```

**Interim output excerpt (verbatim):** V=20: draft runs 57/72/101/69 ms, all 409 (no shares posted). V=100: draft runs 319/296/317/253 ms, all 409; aggregate(100)=266 ms; aggregate(2000 counted)=5706 ms (V=20 run: 6255 ms).

**Interim refutation attempt (verbatim):** Read app.ts:410-421. The route is class R with auth 'none', and the handler calls rt.buildTallyDraft(use) synchronously with no await. election.ts:1150-1161 caches the ballot analysis (st.analysis). buildTally (protocol/src/tally.ts:224-228) still calls aggregate(p, counted) and decryptAggregates on every call, before it checks whether enough shares exist. The result is not memoized. The read rate limit is 120/min per IP bucket by default (config.ts:146). At about 2.5-3 ms per counted ballot that is far more blocking time per minute than a minute holds. maxVotersPerElection defaults to 10,000 (config.ts:227), so 2,000 counted ballots is in range. No spec or decision permits this, and QV-29-REQ-019 requires event-loop lag p99 < 100 ms. I did not refute it. I did not reproduce the restart/eviction case (full analyzeBallotLog with proof checks), which costs once per load, nor a real 2,000-ballot election. The 2,000-ballot figure comes from timing the same aggregate() over 2,000 counted ballots. Per-call cost grew roughly linearly from V=20 to V=100. With no shares posted every call returns 409 after doing the full work. In my in-process event-loop histogram, monitorEventLoopDelay showed 0 for most draft calls. Because the handler is synchronous, the blocking is shown by the in-process wall-clock time instead.

**Interim notes:** For an election in TALLYING/STALLED/AUDIT/ARCHIVED/IMPORTED with an aggregate posted, any anonymous client can repeatedly block the event loop of the whole instance, including elections still open. Link-access elections need the read key. Vote integrity is not affected. Impact is availability. I agree with the suggested fix: serve the stored aggregate and return 409 before doing work.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Confirmed in supplied B2 PoC and interim timing verification; consolidation regression makes ensureAnalysis throw and verifies insufficient-share response plus successful draft after runtime eviction without invoking it.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/election.ts; packages/protocol/src/tally.ts; packages/server/test/consolidation.test.ts; packages/protocol/test/tally.test.ts

**Regression evidence:** consolidation.test.ts real server journey; protocol aggregate-equivalence/share rejection regression; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** Native draft uses admitted stored aggregate, admitted spoil projection, <=16 cached trustee subsets, early threshold rejection. Imported mirrors explicitly refuse this convenience endpoint with 409 rather than trust ignored ballot records. First draft still verifies share proofs/decodes counts; worker isolation and production-scale p99 load measurements remain unfulfilled general requirements. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-02

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `open`.

**Original summary:** POST /imports runs full verifyElection on the event loop and checks ELECTION_EXISTS only after full verification, so a valid bundle can be resubmitted repeatedly to stall the instance.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-02).

**Original location:** packages/server/src/imports.ts:196, packages/server/src/imports.ts:323, packages/server/src/ext-routes.ts:107-111, packages/server/NOTES.md:144

**Original confidence/category:** CONFIRMED; DoS / availability

**Original spec references:** QV-29-REQ-019, QV-18-REQ-033, QV-09 §10

**Original scenario:** Attacker creates an org (default registrationMode open) and resubmits a large public bundle with new Idempotency-Keys; each submission stalls the instance for full proof verification, then fails ELECTION_EXISTS.

**Original evidence (verbatim):** PoC B2-02 in packages/server/test/b2-audit-poc.test.ts: 6 ballot entries, first import stall 959-1034 ms, duplicate (refused) stall 794-1304 ms via perf_hooks.monitorEventLoopDelay.

**Original suggested remediation:** Check electionAny(manifest.election_id) and quota before verifyElection; verify in a worker with CPU budget; per-org import rate; correct NOTES.md:144.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test --test-name-pattern=VB-02 test/verify-b2b1.test.ts
```

**Interim output excerpt (verbatim):** bundle=160768B. Duplicate import: job failed rule=ELECTION_EXISTS (409), total 1208 ms, max event-loop lag 1003 ms. Same bundle with manifest_hash=000..0: rule=MANIFEST_HASH (422), total 1118 ms, max lag 1052 ms.

**Interim refutation attempt (verbatim):** Read imports.ts:196 (await verifyElection, effectively synchronous) and :323 (the ELECTION_EXISTS check in commitImport runs only after verifyBundle). The ext-routes.ts:90-111 pre-checks cover quota, org and body only. Mitigations that do exist: class X rate limit of 2/hour per IP bucket (config.ts:152), importQueueMax 2, an authenticated org key is required, and registrationMode defaults to 'open' (config.ts:200). These limit the rate but do not stop it. A single submission of a large bundle (up to 64 MiB, maxImportEntries 250k) can stall the instance for a long time. The scenario holds. Checking ELECTION_EXISTS earlier is not a sufficient fix: a bundle that fails a later check (for example a wrong manifest_hash query parameter) also runs the full verification on the event loop before it is refused, as my second case shows.

**Interim notes:** The underlying cause is synchronous verification on the event loop (a documented gap). The early-check ordering is a secondary issue. NOTES.md:144 should be corrected.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Supplied B2 and interim tests confirmed long synchronous import proof verification and duplicate verification before ELECTION_EXISTS; unchanged verifyBundle/commitImport paths remain present.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/imports.ts; packages/server/src/ext-routes.ts; packages/server/NOTES.md

**Regression evidence:** Existing imports.test.ts still documents duplicate refusal after verification; no new timing claim made.

**Remaining gate:** Need worker/time budget/bounded CPU isolation, early trusted-id/quota preflight, and suitable abuse limits. NOTES now states that yields occur between stages, not within verifyElection. This is a remaining availability blocker. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-03

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** instance_admin keys, once seeded, can never be revoked; removing them from adminKeys leaves them active and no API revokes them.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-03).

**Original location:** packages/server/src/app.ts:69, packages/server/src/controldb.ts:236-238, packages/server/src/app.ts:265-276

**Original confidence/category:** CONFIRMED; AuthN/AuthZ

**Original spec references:** QV-08-REQ-019, QV-12 §5, QV-09 §3.6, ADR-001

**Original scenario:** Operator removes a compromised admin key from config and restarts; the key still gets 200 on /admin/status and can mint org_owner keys in any org.

**Original evidence (verbatim):** PoC B2-03 in packages/server/test/b2-audit-poc.test.ts: after removal GET /admin/status -> 200; POST /orgs/<org>/keys (org_owner) -> 201.

**Original suggested remediation:** At start, revoke every instance_admin key not in adminKeys with an operator_audit row; document rotation.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test --test-name-pattern=VB-03 test/verify-b2b1.test.ts
```

**Interim output excerpt (verbatim):** after removal: admin/status=200 mint org_owner=201

**Interim refutation attempt (verbatim):** app.ts:69 only seeds keys. controldb.ts:236-238 seedAdmin inserts a key if it is missing and never revokes one. revokeKey is called only from DELETE /orgs/:org/keys/:keyid (app.ts:265-276), which requires k.org_id === org, and admin keys have org_id NULL, so it returns 404. admin.ts:20 states 'no API creates admin keys', and no API or startup step removes them either. No spec, ADR or NOTES entry says that removing a key from config leaves it active, or describes how to rotate admin keys. D-84 (admin auth model) is still pending and does not address revocation. An admin key can also mint org_owner keys in any org (app.ts:250), which conflicts with QV-12 §5 ('operators cannot add org admins'). That makes the impact of a compromised key larger. I did not refute it. Precondition: the admin key must already be compromised. An operator with database access could revoke it by hand.

**Interim notes:** Fix: at startup, revoke instance_admin rows that are not in adminKeys and audit-log the revocation.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Restart regression seeds admin, verifies access, removes configuration, restarts same persistent data, then observes 401.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/controldb.ts; packages/server/src/app.ts; packages/server/test/consolidation.test.ts

**Regression evidence:** consolidation.test.ts B2-03/B2-09; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** Removed active instance_admin keys are revoked and operator-audited at startup. Rotation uses a distinct new key; revoked ids are not implicitly reactivated. Operational rotation rehearsal remains advisable before deployment. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-04

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** The server evaluates witness quorum with operator config witnesses and ignores manifest bb.witnesses.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-04).

**Original location:** packages/server/src/app.ts:62, packages/server/src/app.ts:67, packages/server/src/election.ts:254-256, packages/server/src/election.ts:890, packages/server/src/election.ts:1098, packages/server/src/admin.ts (clearQuarantine)

**Original confidence/category:** CONFIRMED; Board / witness integrity

**Original spec references:** QV-18-REQ-020, QV-18-REQ-023, QV-18 §9.4, QV-18-REQ-053

**Original scenario:** Manifest names w1 with key W, server config maps w1 to operator key O; W's cosignature is dropped while O's opens the election, gates the aggregate, yields witnessed:true/integrity:ok and clears quarantine.

**Original evidence (verbatim):** PoC B2-04 in packages/server/test/b2-audit-poc.test.ts: manifest witness cosig accepted=[]; operator key accepted=["w1"]; open=201; manifest-policy witnessed=false.

**Original suggested remediation:** Derive per-election policy from manifest bb.witnesses; refuse manifests whose witnesses mismatch config keys; use same policy in clearQuarantine.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test --test-name-pattern=VB-04 test/verify-b2b1.test.ts
```

**Interim output excerpt (verbatim):** manifest-witness cosig: 200 {"accepted":[],"rejected":[],"witnessed":false}; open before cfg cosig=409; cfg cosig accepted=["w1"]; state.witnessed=true; open after=201

**Interim refutation attempt (verbatim):** election.ts:254-256 builds the policy from env.witnessPolicy(quorum), which uses the cfg.witnesses keys (app.ts:62, 67). The manifest's bb.witnesses is never read on the live path. election.ts:890 checks only that witness_quorum <= the number of configured witnesses, so a manifest whose witnesses differ from config is accepted (201). By contrast, the import path (imports.ts) and protocol witnessAnchors (logcheck.ts:68) take the manifest witnesses, and QV-18-REQ-020 (Must) says the witnessed status is computed from the manifest. Partial refutation, clearQuarantine only: QV-09 §… (09-api-data-contracts.md:380) explicitly says quarantine/clear names 'configured witnesses', so that sub-claim is spec-permitted. Mitigating factors: QV-16 (the higher authority) does not define bb.witnesses, an open erratum covers it, and verifiers that use the manifest anchors would flag such an election as not witnessed. So the impact is a server gate that disagrees with the manifest, plus manifest-witness cosignatures being dropped silently (they are neither accepted nor rejected). It is not undetectable integrity loss.

**Interim notes:** Confirmed for the open/aggregate gates and the witnessed/integrity status. The clearQuarantine part is permitted by QV-09. Severity is tempered by the open erratum and by verifier-side detection.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Pre-fix regression accepted operator witness with 200; post-fix operator key gets 403 and only manifest-only key opens the election. Policy advertises manifest-only name.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/election.ts; packages/server/src/app.ts; packages/server/src/admin.ts; packages/server/test/consolidation.test.ts

**Regression evidence:** consolidation.test.ts B2-04; negative.test.ts; events.test.ts; admin.test.ts; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** Manifest bb.witnesses governs runtime gates, cosignatures, state, export, and quarantine clear. Instance configuration is fallback only when the manifest omits a witness list, matching current manifest/import compatibility. External witness monitoring remains absent. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-05

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `blocked_protocol_review`.

**Original summary:** m-of-k control records (pause/resume/security-notice) have no freshness binding, so a single earlier signer can replay an old record.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-05).

**Original location:** packages/server/src/election.ts:741-746, packages/server/src/election.ts:897-930, packages/server/src/records.ts:33

**Original confidence/category:** CONFIRMED; AuthZ / lifecycle

**Original spec references:** QV-ADR-022, QV-12-REQ-003, T-100

**Original scenario:** Coordinators A and B (m=2) pause then resume; A alone re-wraps the old pause record in a new entry header and the OPEN election is paused, ballots refused with 409 (up to maxHalts).

**Original evidence (verbatim):** PoC B2-05+B2-06 in packages/server/test/b2-audit-poc.test.ts: solo pause -> 422 E_SIG; replayed 2-of-3 pause -> 201; ballot while paused -> 409.

**Original suggested remediation:** Bind control bodies to state (after_seq or nonce) and reject bodies whose JCS bytes are already on the log; needs spec definition (G-17).

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/packages/server && node --test --test-name-pattern=B2-05 test/verify-b2b2.test.ts
```

**Interim output excerpt (verbatim):** B2-05 replay=201 ballot-while-paused=409 (solo 1-of-3 pause -> 422; the log holds two notice entries with byte-identical pause bodies)

**Interim refutation attempt (verbatim):** election.ts:741-746 `multi` checks only that m coordinator signatures over (mh, body) are valid and that the entry author is one of the signers. The control body (records.ts:13-18, schema records.ts:33) is {proto,type,action,reason?}. It has no seq, nonce or state binding. vNotice (election.ts:897-930) checks only the current state and maxHalts. The QV-18 header author_nonce (docs/18 §5.3 step 6) stops replay of a whole entry but not re-wrapping a body in a fresh header. The protocol verifier (logcheck.ts:120-228, X-31/X-32) reports control entries but never applies or deduplicates them. No spec or ADR allows replaying a control record. QV-07-REQ-034 requires 'k-of-m threshold enforced', and QV-ADR-022 makes pause/resume a k-of-m steward authority. Not refuted. Limits: the replayer must have signed the original record. The replay is visible on the log. Pauses are capped by maxHalts, but resume can also be replayed, so one earlier signer can un-pause an incident pause.

**Interim notes:** I signed the genuine pause and resume with coordinators 1 and 2. Coordinator 2 alone (whose solo pause gets 422 E_SIG) re-posted the old pause body: 201, phase PAUSED, and a ballot then got 409. Replaying the old resume also worked. Locations at this SHA are accurate.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** B2 PoC and interim verification confirmed prior multi-signature control-body replay; controlSchema still lacks signed freshness binding and repeated-body detection.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/records.ts; packages/server/src/election.ts

**Regression evidence:** Original evidence retained in docs/audit/2026-10-28/poc/B2/packages/server/test/b2-audit-poc.test.ts.txt; no claim of current fix.

**Remaining gate:** Owner must define freshness binding and replay semantics for repeated legitimate actions. Exact-body dedup alone would prevent identical future notices/resumes and is not silently chosen. Remaining lifecycle/authority blocker. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-06

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** election_close is accepted at any time in OPEN/PAUSED with no time check against voting_close.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-06).

**Original location:** packages/server/src/election.ts:837-844

**Original confidence/category:** CONFIRMED; Lifecycle / conformance

**Original spec references:** QV-03 §5.5, QV-16 §5.14.3, T-100

**Original scenario:** m coordinators close the election 7.5 days before voting_close; voters planning to vote later are disenfranchised.

**Original evidence (verbatim):** PoC B2-05+B2-06 in packages/server/test/b2-audit-poc.test.ts: election_close accepted 7.5 days before voting_close (201); repo's fullElection helper relies on it.

**Original suggested remediation:** Reject election_close while now < voting_close - clock_skew_s.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/packages/server && node --test --test-name-pattern=B2-05 test/verify-b2b2.test.ts
```

**Interim output excerpt (verbatim):** B2-06 close=201 7.46d early, later ballot=409

**Interim refutation attempt (verbatim):** election.ts:837-844 checks only the marker name and the m-of-k signatures. There is no comparison against manifest voting_close. By contrast, election_open (election.ts:832) does check voting_open. The specs forbid early close: QV-03 §5.5 (docs/03:203) says 'No early close. Close before close_at is impossible except HALT->CANCELLED', and QV-16 §5.14.3 (docs/16:662), which outranks other specs, says 'the coordinator may not close early'. QV-18 §5.2 (docs/18:166) says only 'after opens_at', but QV-16 prevails. No ADR or owner decision permits early close. Not refuted. The close needs m coordinator signatures (the QV-07 A3 malicious-steward threat). With witness_quorum>0 the verifier flags it afterwards. With witness_quorum=0 (the default in the test world) the times are only reported as unwitnessed.

**Interim notes:** After open at 2026-11-01T10:00Z, a 2-of-3 election-close was accepted 7.46 days before voting_close (2026-11-08T21:00Z). A voter casting one hour later, still inside the published window, got 409. This disenfranchises voters through an authorized but non-conformant action that the server should refuse.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Pre-fix actual HTTP accepted early close with 201; post-fix early close returns 409 and scheduled close returns 201.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/election.ts; packages/server/test/helpers/world.ts; packages/server/test/consolidation.test.ts

**Regression evidence:** consolidation.test.ts real server journey; e2e.test.ts; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** No-early-close gate enforces server now >= signed voting_close without a permissive skew allowance. Tests advance to actual close time. Auto-close scheduler remains absent. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-07

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `blocked_integrity_design`.

**Original summary:** Restoring an older election DB is not detected and the server signs a second, different root for a size it already signed.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-07).

**Original location:** packages/server/src/election.ts:128-166, packages/board/src/log.ts:51-80, packages/server/src/admin.ts (backupWork)

**Original confidence/category:** CONFIRMED; Board / equivocation

**Original spec references:** QV-18-REQ-012, QV-18-REQ-053, QV-12 §7, QV-28-REQ-011

**Original scenario:** Operator restores yesterday's DB (e.g. /admin/backups copy); server appends at already-signed sequence numbers, producing valid fork evidence against its own log key while reporting integrity ok.

**Original evidence (verbatim):** PoC B2-07 in packages/server/test/b2-audit-poc.test.ts: restored DB accepted (integrity=ok); second checkpoint for size 2 signed; checkFork ok=true.

**Original suggested remediation:** Persist last signed (size, root) per election in control.sqlite and optionally poll witnesses at start; refuse append when behind, quarantine.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/packages/server && node --test --test-name-pattern=B2-07 test/verify-b2b2.test.ts
```

**Interim output excerpt (verbatim):** B2-07 integrity after restore=ok phase=SETUP; size 2 signed twice with different roots; fork={"ok":true,"value":"fork"}

**Interim refutation attempt (verbatim):** The only rollback guard on load is in board/src/log.ts:73-79, which compares the tree with checkpoints stored in the same DB. Those checkpoints are restored together with the DB, so a coherent older snapshot passes. ElectionRuntime.open (election.ts:145-163) and the control DB keep no last-signed (size, root). Gossip catches it only if gossipPeers are configured and a peer holds the newer note. The tests here and the auditor's PoC run with none. QV-18-REQ-012 (Must, docs/18:77) says 'A server restart shall not change this (persist last checkpoint before replying). Test: restore older DB backup -> server refuses to sign'. REQ-053 and QV-12-REQ-004 / §7 also require failing closed. Not refuted.

**Interim notes:** Steps: copy the election sqlite at size 1, append ceremony_start, fetch checkpoint A (size 2), stop, restore the copy, restart (integrity=ok), append election_cancel, fetch checkpoint B (size 2). A and B parse with the same size and different roots, and checkFork returns 'fork' under the election log key. Impact: the server produces self-incriminating equivocation evidence and silently drops entries (for example ballots) accepted after the backup. Witnesses or clients holding pins would later detect it.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Supplied B2 rollback PoC and interim verification confirmed older election DB restoration can cause the log key to sign a fork. Existing evidence guards rely on optional gossip.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/election.ts; packages/server/src/controldb.ts; packages/server/src/gossip.ts; packages/server/src/admin.ts

**Regression evidence:** Original rollback PoC preserved; existing gossip/admin tests cover only externally supplied rollback/fork evidence.

**Remaining gate:** Need reviewed independent signed-head/high-water persistence and crash/recovery ordering, plus trusted restoration policy. A new rollback trust design is not silently introduced. Remaining integrity blocker; backup self-check is not rollback detection. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-08

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** backup --to stores a relative path verbatim and destroy resolves it against the current cwd, missing the real backup and shredding an unrelated file.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-08).

**Original location:** packages/trustee/src/trustee.ts:759, packages/trustee/src/trustee.ts:824, packages/trustee/src/cli.ts (guardOut)

**Original confidence/category:** CONFIRMED; Trustee custody

**Original spec references:** QV-17-REQ-070, QV-17 §11.2, QV-06-REQ-006, ADR-013

**Original scenario:** backup --to share-backup.qvtb in /x, later destroy from another directory: real sealed backup survives, signed destruction attestation claims backups_removed, and a same-named file in cwd is overwritten and unlinked.

**Original evidence (verbatim):** PoC B2-08 in packages/trustee/test/b2-audit-poc.test.ts: backups_removed:["share-backup.qvtb"]; real backup still present: true; unrelated file present: false.

**Original suggested remediation:** Store resolve(dest)/realpath at backup; lstat and verify bundle magic/header id before shredding; report not found otherwise.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/packages/trustee && node --test test/verify-b2b2.test.ts
```

**Interim output excerpt (verbatim):** B2-08 report={"removed":["copy.qvtb"],"missing":[]} realBackupStillThere=true unrelatedFileStillThere=false; attestation body keys=ctx,destroyed_at,j,method,proto,statement,type

**Interim refutation attempt (verbatim):** trustee.ts:759 stores the `dest` string verbatim. At keygen (trustee.ts:148) the bundle path is resolved (home: resolve(path)), but the backup path is not. cli.ts:220-222 passes --to unchanged. destroy (trustee.ts:824) calls shred(b.path), which stat()s, overwrites and unlinks whatever that relative path resolves to in the current cwd (fsutil.ts:51-67), with no magic or header check and no lstat. Not refuted. One correction: the signed attestation does not list backups_removed. That list is only in the unsigned CLI report (cli.ts:237). The signed `method` text does claim 'overwrite+unlink of the encrypted bundle and known backups'. If no same-named file exists in the new cwd, the backup is honestly reported as missing with a manual-check reminder, which matches QV-17 §11.2 step 4 ('list and instruct').

**Interim notes:** I rate it Low rather than Medium. The harmful path needs a cwd change and an unrelated file with the same name in the new cwd. Without both, the tool reports the backup as missing. When both are present: an unrelated file (possibly another election's backup) is destroyed, the real sealed backup survives, and the report says it was removed. That undermines destruction under ADR-013 and causes data loss. The fix is to store resolve(dest), and to lstat the file and check the bundle magic before shredding.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Red: custody.test.ts relative backup retained relative alias path; cross-cwd destruction could erase unrelated same-named file (original B2 PoC). Green: destination canonical absolute, parent symlink retarget/cwd changes preserve unrelated file and remove registered ciphertext only. Concurrent publication red: both separate shares succeeded to one destination; exclusive atomic publication now permits only one and returns BUNDLE_EXISTS to the other. Failed atomic writes clean their own temporary file; moved restore source is registered.

**Fix or partial-fix commit:** [8cf2669](https://github.com/djshellshoxxx/quietvote/commit/8cf26691f87af3a10c55c896f15bf4169aa862fa)

**Affected source:** ['packages/trustee/src/trustee.ts', 'packages/trustee/src/bundle.ts', 'packages/trustee/src/fsutil.ts', 'packages/trustee/NOTES.md']

**Regression evidence:** ['packages/trustee/test/custody.test.ts: B2-08 relative backups stay anchored across cwd changes and parent symlink retargeting', 'packages/trustee/test/custody.test.ts: TR-08 replaced backup bytes and legacy relative paths are never shredded or reported removed', '/workspace/work/validation/trustee-custody-red.log', '/workspace/work/validation/trustee-custody-green.log', '/workspace/work/validation/trustee-package-tests.log', '/workspace/work/validation/trustee-final-regressions.log (33 named tests passed)', '/workspace/work/validation/trustee-custody-final.log (7 named tests passed)', '/workspace/work/validation/trustee-backup-race-red.log', '/workspace/work/validation/trustee-atomic-red.log', '/workspace/work/validation/trustee-freeze-safety.log (19/19 named safety tests passed before final DESTROYING-resume refinement)', '/workspace/work/validation/trustee-freeze-typecheck.log (exit0)', '/workspace/work/validation/trustee-command-summary.log', '/workspace/work/validation/trustee-tombstone-green.log (final9/9 custody tests incl resurrection refusal and crash resume)']

**Remaining gate:** Legacy relative backup records have no recoverable original cwd. Files with no sealed SHA-256, unsafe aliases/hardlinks, or mismatched bytes remain in backups_missing with manual-removal reminder; never reported removed. Flash/SSD erasure not guaranteed; hostile active filesystem mutation is outside guarantee. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/trustee
node --test packages/trustee/test/custody.test.ts
```

### B2-09

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Invite cap compares registered voters rather than invites, so invites are effectively unbounded.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-09).

**Original location:** packages/server/src/app.ts:459

**Original confidence/category:** CONFIRMED; Abuse / quotas

**Original spec references:** QV-29 §6.4, QV-29-REQ-010

**Original scenario:** With maxVotersPerElection=2, 24 live invites can be created; invite rows unbounded per organizer (60 req/min x 1000).

**Original evidence (verbatim):** PoC B2-09 in packages/server/test/b2-audit-poc.test.ts: maxVotersPerElection=2, invites created=24.

**Original suggested remediation:** Count voter_invite rows in issued|sent and cap total rows per election.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test test/verify-b2b3.test.ts (worktree /home/user/audit/verify-quietvote/B2-b3, now removed)
```

**Interim output excerpt (verbatim):** # created 24 listed 24  (maxVotersPerElection=2; six POST /invites {count:4} all 201; a single {count:5} -> 429)

**Interim refutation attempt (verbatim):** packages/server/src/app.ts:459 is `if (rt.edb.voterCount() + n > cfg.maxVotersPerElection * 2) throw 429 'too many invites'`. voterCount() (electiondb.ts:403-405) counts only voter rows with status approved/committed, so existing voter_invite rows are never counted. Only the size of one request is bounded (n <= 2*max), so repeated requests add rows without limit. No other cap exists: addInvites (electiondb.ts:370-377) inserts without a check, and invites are not counted against maxLogBytes. Spec check: the cited QV-29 §6.4 and QV-29-REQ-010 quotas (5 outstanding, 20 per 30 days) apply to NON-steward inviters in the group model. §6.4 says stewards are unlimited. REQ-010 is a Should, and docs/24-traceability-matrix.md:227 marks it Proposed. So the spec ids do not themselves require an organizer cap. The defect still stands on the code's own terms: the guard plainly means to cap invites (its message is 'too many invites') but never does. That leaves storage growth bounded only by the manage rate limit (60/min, 1000 rows per request), against the storage controls of QV-29 §6.6.

**Interim notes:** Needs an authenticated organizer (role M) of the election. The impact is storage/DoS on the instance, not vote integrity. The finding's spec basis is weak because stewards/organizers are unlimited under §6.4. The defect is the ineffective guard at app.ts:459.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Actual server with maxVotersPerElection=2 accepts exactly four total invitation rows, rejects a fifth with 429, and honors an idempotent replay after the cap.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/electiondb.ts; packages/server/src/app.ts; packages/server/test/consolidation.test.ts

**Regression evidence:** consolidation.test.ts B2-03/B2-09; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** Counts total invitation rows, including consumed/revoked, at existing 2x voter cap. Rows cannot grow without bound through revocation. Existing rows above cap are retained and further issuance refused. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-10

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `blocked_contract_review`.

**Original summary:** Invites without expires_at never expire, unknown vs used codes answer differently, and a used code with another registered key answers 201.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-10).

**Original location:** packages/server/src/app.ts:452-456, packages/server/src/app.ts:521-529

**Original confidence/category:** CONFIRMED; Conformance (invites)

**Original spec references:** QV-04-REQ-004, QV-29-REQ-008, QV-09 §4.4

**Original scenario:** Invite used 400 days later -> 201; unknown -> 422 INVITE_EXPIRED vs used -> 409 INVITE_USED (oracle); cross-invite replay -> 201 instead of 409.

**Original evidence (verbatim):** PoC B2-10 in packages/server/test/b2-audit-poc.test.ts: unknown -> 422; used -> 409; +400d -> 201; cross-invite replay -> 201.

**Original suggested remediation:** Default TTL per rules (owner pick, G-10); one generic failure for unknown/used/expired/revoked; decide §4.4 semantics (G-12).

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test test/verify-b2b3.test.ts
```

**Interim output excerpt (verbatim):** # register +400d without expires_at: 201
> # unknown 422 INVITE_EXPIRED | used 409 INVITE_USED
> # cross-invite replay 201 {"voter_kid":"GTUY...","status":"approved"}
> # expires_at 2099 -> 201

**Interim refutation attempt (verbatim):** (1) No default expiry: app.ts:452-456 sets exp=null unless expires_at is given, and any parsable date is accepted, including 2099 (no upper bound). Registration checks expiry only when it is non-null (app.ts:521). QV-04 §(line 93) sets 'TTL default 336 h (rules)', QV-04-REQ-004 (Must) says 'expire per rules', and QV-29-REQ-008 says <= 30-day lifetime. This part is a real deviation; reproduced with 201 at +400 days. (2) Oracle: this sub-claim is REFUTED. QV-09 §7.1 (09-api-data-contracts.md:262) and §4.4 (line 146) prescribe 409 INVITE_USED and 422 INVITE_EXPIRED. QV-04 line 97 defines separate E_INVITE_USED and E_INVITE_UNKNOWN codes and asks only for the same response TIME. Only QV-29 §6.4 asks for one generic code, so the specs conflict and the code follows QV-09/QV-04. Codes are 128-bit, so the 'oracle' only tells a code holder that its code was already used. (3) Cross-invite replay: code A used by k1, then (A, k2) where k2 registered via code B returns 201 (app.ts:525-527), not the 409 that QV-09 §4.4 asks for. No voter is added and no invite is consumed. The server cannot tell the cases apart without storing the invite-to-voter link that QV-ADR-P28-4 forbids, so this is a spec conflict with no integrity impact (Info).

**Interim notes:** Confirmed only for the missing default/maximum invite lifetime (Low: a leaked or old code stays valid until roll_commit; registration closes at roll commit, app.ts:512, which limits the window). The unknown-vs-used oracle is permitted by QV-09/QV-04. The cross-invite 201 is an Info-level spec conflict (QV-09 §4.4 vs QV-28 §8.2 / ADR-P28-4).

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Supplied B2 and interim evidence confirm null default expiry, used/unknown oracle, cross-invite existing-key idempotency. These behaviors remain unchanged.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/app.ts; packages/server/src/electiondb.ts; docs/09-api-data-contracts.md; docs/04-identity-eligibility.md

**Regression evidence:** negative.test.ts retains current raw-token contract and used-code behavior; original B2 PoC retained.

**Remaining gate:** Owner must reconcile default lifetime and unknown/expired/used response policy, plus same-key retry semantics with no persisted invite-to-voter linkage. QV-09 explicitly distinguishes 409 INVITE_USED and 422 INVITE_EXPIRED while other clauses seek uniform failures. Registration overall also blocked by B3-01. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-11

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `open`.

**Original summary:** P2 invite data (labels, contacts) is never purged except a registered invite's contact; no retention job exists.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-11).

**Original location:** packages/server/src/electiondb.ts:388-395, packages/server/src/app.ts:446-470, packages/server/src/app.ts:499

**Original confidence/category:** CONFIRMED; Privacy / retention

**Original spec references:** QV-28 §11, QV-28-REQ-013, QV-06-REQ-004, QV-09 §7.1, T-099

**Original scenario:** 30 days later, registered invites still have labels and revoked invites still have label and contact; contacts are stored although delivery is unsupported.

**Original evidence (verbatim):** PoC B2-11 in packages/server/test/b2-audit-poc.test.ts (DB read after 30 days): registered has_label 1; revoked has_label 1, has_contact 1.

**Original suggested remediation:** Retention job per QV-28 §11; refuse contact until delivery exists; NULL label and contact on revoke.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test test/verify-b2b3.test.ts (reads the election sqlite file read-only after a +30 day clock jump)
```

**Interim output excerpt (verbatim):** # [{"state":"registered","l":1,"c":0},{"state":"revoked","l":1,"c":1}]

**Interim refutation attempt (verbatim):** QV-28 §11.1 (28-data-model-storage.md:526) requires voter_invite.contact_enc and label_enc to be NULLed at registered/revoked/expired or election_open (+7 d). The code: consumeInvite (electiondb.ts:392-394) NULLs only contact_enc and keeps label_enc deliberately (`label_enc=label_enc`). DELETE invite (app.ts:493-501) calls setInviteState (electiondb.ts:388-390), which changes only the state. A grep of packages/server/src finds no other writer of label_enc or contact_enc, and no retention job. Reproduced: 30 days after registration and revocation, the registered row still has its label and the revoked row has both label and contact. NULLing at the moment of revoke is not required (the spec allows +7 d), but 30 days is past the horizon. The sub-claim that storing contacts is wrong is not supported: QV-09 §7.1 InviteCreate allows contact (purged after delivery) and QV-28 marks it optional and encrypted. The data is P2 and sealed under the per-election DEK (app.ts:468-469), which archive deletion crypto-erases. That limits exposure to the operator/organizer during the election's life.

**Interim notes:** Confirmed against QV-28 §11.1 / QV-28-REQ-013 (Must). The retention job is an acknowledged open item (T-089 Partial, T-112 Open), so this is mostly a known gap outside the Done scope. The label kept on consumeInvite is a deliberate code choice that §11.1 does not allow beyond +7 d.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Supplied B2 database inspection and interim verification confirm retained invite labels and revoked contacts. setInviteState/consumeInvite paths and missing retention job remain.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/electiondb.ts; packages/server/src/app.ts

**Regression evidence:** Original B2 retention PoC retained; no new retention regression or fix claim.

**Remaining gate:** Implement retention/minimisation per QV-28, including persisted revocation/expiry timing, scheduled or lazy purge semantics, and no unsupported contact collection. Data is encrypted but retention is not implemented. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-12

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `blocked_contract_review`.

**Original summary:** IMPORTED mirrors and keyless ARCHIVED runtimes sign duplicate-submission receipts with an all-zero-seed placeholder key.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-12).

**Original location:** packages/server/src/election.ts:142, packages/server/src/election.ts:577-581, packages/board/src/log.ts:141

**Original confidence/category:** CONFIRMED; Board / receipts

**Original spec references:** QV-18-REQ-013

**Original scenario:** A client retries an entry against a mirror and gets a receipt that never verifies under the log key, raising false broken-promise alarms.

**Original evidence (verbatim):** PoC B2-12 in packages/server/test/b2-audit-poc.test.ts: verifies under election log key: false; under zero-seed key: true.

**Original suggested remediation:** Never sign without the real key; return entry and inclusion proof without promise signature (or 409).

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd packages/server && node --test test/verify-b2b3.test.ts
```

**Interim output excerpt (verbatim):** # archived live dup 200 logkey true
> # archived restarted dup 200 logkey false zero true
> # has inclusion true
> # mirror dup 200 logkey false zero true

**Interim refutation attempt (verbatim):** election.ts:142 builds BoardLog with `secretKey: logSk ?? new Uint8Array(32)`. logSk is undefined when dek_wrapped or log_sk_enc is missing (election.ts:154-158). That is the case for IMPORTED mirrors (initImported omits log_sk_enc, electiondb.ts:254) and for ARCHIVED elections after a reload, since finalizeArchive -> eraseKeys NULLs log_sk_enc (election.ts:1187-1190, electiondb.ts:342-344). The duplicate path in precheck (election.ts:577-581) runs before any phase, quarantine or read-only check. It returns outcomeFor -> log.getReceipt -> receiptFor -> signPromise(this.o.secretKey, ...) (board/src/log.ts:141-142), so POST /log/entries returns 200 with a promise signed by the zero-seed key. Reproduced for both cases: the receipt fails verifyReceipt under the election log key and passes under ed25519Keypair(zeros).publicKey. Before a restart, the live ARCHIVED runtime still signs with the real key, which is inconsistent. QV-18-REQ-013 (Must) requires receipts that verify offline against the log public key. Mitigation: the response also carries an inclusion proof and a stored checkpoint note signed by the real key, so the inclusion part is still valid.

**Interim notes:** Integrity is not affected (no entry is appended, and the checkpoint/inclusion data is genuine). A client that checks promise_sig gets a receipt that does not verify. That can cause false 'bad receipt / broken promise' alarms against a mirror or a reloaded archived election. It also signs with a publicly known key, which is poor hygiene.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Supplied B2 and interim verification confirmed duplicate submissions on imported/keyless archived runtimes can receive zero-seed-signed promises; placeholder BoardLog key path remains.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/election.ts; packages/board/src/log.ts; docs/09-api-data-contracts.md

**Regression evidence:** Original B2 zero-key receipt PoC retained. New mirror draft refusal does not fix receipt signing.

**Remaining gate:** Define keyless duplicate response (stored original valid receipt, inclusion without promise with explicit schema, or refusal). Do not silently replace receipt schema or authority. Remaining false broken-promise risk. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-13

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Anonymous GET /roll lists voters in enrolment order (ORDER BY rowid), defeating hour-rounding of registered_at.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-13).

**Original location:** packages/server/src/electiondb.ts:410-412, packages/server/src/app.ts:539-550

**Original confidence/category:** CONFIRMED; Linkage (ordering)

**Original spec references:** QV-28 §8.2, QV-04 §4.2

**Original scenario:** Anyone knowing relative enrolment timing can map a person's position in the roll to their voter key.

**Original evidence (verbatim):** PoC B2-13 in packages/server/test/b2-audit-poc.test.ts: listing equals enrolment order and differs from key order.

**Original suggested remediation:** List by pk (or roll_index after commit) with an opaque cursor.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/server/test/verify-b2b4.test.ts (worktree /home/user/audit/verify-quietvote/B2-b4, since removed)
```

**Interim output excerpt (verbatim):** ok 1 - V-B2-13: public roll listing order after roll_commit = enrolment order, not pk / roll_index order

**Interim refutation attempt (verbatim):** Looked for a spec that requires or allows enrolment-order listing. QV-09 §7.1 sets no order, and QV-04 §4.2 / REQ-003 deliberately make the roll independent of enrolment order. The QV-28:402 non-claim covers the organizer observing order, not a permanent public ordering. Checked whether roll_commit re-sorts the listing: it does not. After commit the listing is still in rowid order while roll_index runs in pk order. Not refuted.

**Interim notes:** electiondb.ts:410-412 `ORDER BY rowid`; app.ts:539-549 serves it with auth 'none', and the cursor is also rowid-based. QV-09 §7.1 (docs/09-api-data-contracts.md:264) does not set an order. QV-04 §4.2 makes the root independent of enrolment order, but the listing does not follow that. The listing does not include registered_at, but the order alone shows enrolment sequence. Extra leakage is limited: during registration anyone can poll /roll for public elections and see new keys appear, which the spec's non-claim partly covers. What the finding adds is that the order stays available after the fact to anyone, including after roll_commit. Low.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Actual registration order differs from sorted roll; test consumes two paginated HTTP responses and requires exact ascending public-key list.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/electiondb.ts; packages/server/src/app.ts; packages/server/test/consolidation.test.ts; packages/server/test/audit.test.ts

**Regression evidence:** consolidation.test.ts real server journey; audit.test.ts SQL/query hygiene; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** Pagination cursor resolves to the known voter public key and uses pk ordering. Unknown cursor returns 400. Public ballot/revote ordering remains an explicitly documented Phase 1 metadata non-claim. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-14

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Junk cosignature lines get 200 with empty accepted/rejected and still bump the export generation, invalidating the .qvb cache.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-14).

**Original location:** packages/server/src/app.ts:713-727

**Original confidence/category:** CONFIRMED; Validation / cache

**Original spec references:** QV-09 §8, QV-09 §13

**Original scenario:** Anonymous junk POST /cosignatures invalidates the cached export each time; rejected[] is always empty.

**Original evidence (verbatim):** PoC B2-14 in packages/server/test/b2-audit-poc.test.ts: ETag "1:...:0" -> "1:...:1" after a junk line.

**Original suggested remediation:** Bump exportGen only on acceptance; list rejected lines.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/server/test/verify-b2b4.test.ts
```

**Interim output excerpt (verbatim):** ok 2 - V-B2-14: junk cosignature -> 200, rejected [], and export ETag generation still bumped (ETag ends ':2"' after two junk POSTs)

**Interim refutation attempt (verbatim):** Checked whether the board layer reports rejected lines or errors on junk input. It does not: lines are dropped without a report and ok() is returned. Checked whether the ETag depends only on log size and root. It also includes exportGen (app.ts:799), which goes up with every POST. QV-09 §8 lists rejected[] and 403/422 outcomes, and no decision permits always answering 200 with an empty list. Not refuted.

**Interim notes:** board/src/log.ts:185-197 skips invalid lines without reporting them and always calls putCheckpoint. election.ts:1095-1116 returns ok, and app.ts:713-726 always bumps exportGen and deletes exportCache, then returns `rejected: []` hard-coded. QV-09 §8 (docs/09-api-data-contracts.md:295) specifies `200 {accepted:[...], rejected:[...]}` with 403 for an unknown key and 422 for a mismatched root. The handler needs no auth and is limited by gossip class G (30/min/bucket). Impact is cache churn and an inaccurate response, not integrity. Low.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Pre-fix operator non-policy signature got 200. Post-fix unknown key gets403, malformed/bad proof422, valid name accepted, repeated valid signature returns accepted[] empty and leaves export ETag unchanged.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/election.ts; packages/server/src/app.ts; packages/server/test/consolidation.test.ts; packages/server/test/events.test.ts; packages/server/test/negative.test.ts

**Regression evidence:** consolidation.test.ts B2-04; events.test.ts; negative.test.ts; range.test.ts; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** Mixed batches return rejected identifiers; new names are measured for requested checkpoint rather than latest head. Generation bumps only for newly attached valid names. Endpoint remains record-authenticated anonymous transport as previously implemented. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-15

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `documentation_reconciled`.

**Original summary:** In-tree audit index lists SRV-001 as fixed and CP-01/TR-01 and trustees-mode spoil endpoint as closed though fixes are not in this SHA; NOTES contain stale and new inaccurate statements.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-15).

**Original location:** docs/audit/README.md:13, docs/audit/README.md:20, packages/server/NOTES.md:50, packages/server/NOTES.md:74, packages/server/NOTES.md:80, packages/server/NOTES.md:144, packages/server/src/ratelimit.ts:105

**Original confidence/category:** CONFIRMED; Conformance (status inflation)

**Original spec references:** COMPLETION C5, QV-24 honest-status rule

**Original scenario:** Readers trust the index that SRV-001 and TR-01 are fixed while PoCs show the server crash and counted-vote recovery still present; NOTES claim import yields to event loop and the /64 vs /56 comment is inverted.

**Original evidence (verbatim):** KNOWN SRV-001 and TR-01 PoCs (server and trustee b2-audit-poc.test.ts) pass at this SHA; git merge-base --is-ancestor shows PRs #8/#9/#10/#14 unmerged.

**Original suggested remediation:** Mark items 'fixed on PR #n (unmerged)' until merged; correct NOTES.md and ratelimit.ts comment.

**Interim reproduction:** method=command; reproduced=True

**Exact historical interim command:**

```text
git merge-base --is-ancestor origin/<branch> 424110d (PRs #8, #9, #10, #11, #14 all NOT merged); own SRV-001 child-process repro (chunked 2 MB body to POST /api/v1/orgs, peer destroys socket)
```

**Interim output excerpt (verbatim):** child exit code: 1 stderr has destroy TypeError: true

**Interim refutation attempt (verbatim):** Checked whether the fixes could have reached this SHA another way, such as a cherry-pick. They did not: http.ts:446 has no optional chaining, there is no spoil-shares route, and the trustee relay still checks codes only. Checked whether README framing (line 5 'reports live on the stacked audit PRs', line 26 'Integration of all audit PRs') makes the claims accurate. It partly mitigates them, but the Fixed/Closed columns never say 'unmerged'. Checked whether NOTES staleness was already tracked: C5 covers the webhook and /admin lines, but not line 50 or ratelimit.ts:105. The import-yield sub-claim is mostly accurate, so I do not count it.

**Interim notes:** docs/audit/README.md:13 lists SRV-001 as Fixed (high). At this SHA http.ts:446 still runs `req.socket.destroy()`, and my repro kills the server process. README:20 says the trustees-mode spoil server endpoint/storage and the CP-01/TR-01 rule 'in the log analysis and the trustee relay' are 'Closed'. At this SHA the server has no /spoil-shares route (only on the unmerged spoil-wiring branch, app.ts:413 there). trustee.ts:710-724 still checks ballot codes only, and ballotlog.ts adds re-wrapped spoils to `spoiled` without a check. Only verify.ts:571-580 detects the re-wrap. README:22 also says 'server endpoint ... exist'. Mitigation: README:5 and :26 say the reports live on stacked PRs and the test totals are for the integration of all audit PRs, so the index can be read as describing that stack. It never says the fixes are absent from this tree. NOTES.md:50 'trustee spoil-decryption relay is not built' is stale, since releaseSpoil exists at trustee.ts:~700. The ratelimit.ts:105 comment is inverted: a /64 bucket is finer than the spec's /56 (QV-29 docs/29-abuse-dos-prevention.md:104), not 'coarser ... never finer'. The NOTES.md:144 import 'yields to the event loop' sub-claim is weak: imports.ts awaits tick() between stages (116, 167, 192, 202, ...), although verifyElection itself is one long synchronous call. This is documentation only, so I rate it Low, not Medium.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Original audit index advertised unmerged fixes; historical branches now integrated. Server NOTES stale package-dependency, webhook-memory, event-table, spoil-relay, witness-policy, IPv6 and import-yield claims corrected.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2), [247df39](https://github.com/djshellshoxxx/quietvote/commit/247df393ea1ace300fe5ed1f569a12090e1364dc)

**Affected source:** packages/server/NOTES.md; docs/audit/README.md; docs/plan/CONSOLIDATION.md

**Regression evidence:** Historical fixes covered by audit.test.ts, spoil-shares.test.ts, webhook-persist and security-review suites. Root owns audit/index reconciliation.

**Evidence scope / unresolved boundary:** Historical audit files remain unchanged. Current status is supplied by this ledger and root documentation reconciliation, not by relabeling old evidence as current.

**Documentation/status commit:** 247df393ea1ace300fe5ed1f569a12090e1364dc

**Current documentation resolution:** Root audit/index and status reconciliation now distinguishes imported repairs, current partial/open findings and original historical receipts. Final frozen-checkpoint command receipts are now recorded; no historical evidence was overwritten.

**Remaining gate:** Root audit/index and status reconciliation now distinguishes imported repairs, current partial/open findings and original historical receipts. Final frozen-checkpoint command receipts are now recorded; no historical evidence was overwritten. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-16

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `open`.

**Original summary:** Request logs use second timestamps and fields outside the QV-31 allowlist, undoing minute rounding of ballot append events; control records carry free-text reason into the public log.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-16).

**Original location:** packages/server/src/logger.ts:35, packages/server/src/http.ts:448-452, packages/server/src/election.ts:679, packages/server/src/records.ts:33

**Original confidence/category:** LIKELY; Telemetry / conformance

**Original spec references:** QV-31-REQ-001, QV-31-REQ-008, QV-31 §4.2-4.3, QV-06-REQ-007

**Original scenario:** The sequential counter ties the minute-rounded append line to the adjacent second-precision request line with election_id, latency_ms, bytes_in, seq.

**Original evidence (verbatim):** Code inspection (no PoC).

**Original suggested remediation:** Restrict log fields to the QV-31 allowlist with minute timestamps; disallow free-text reason.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/server/test/verify-b2b4.test.ts
```

**Interim output excerpt (verbatim):** ok 3 - V-B2-16: ballot POST request log line has 1 s timestamp + election_id, adjacent (n) to minute-rounded append line

**Interim refutation attempt (verbatim):** Looked for an accepted decision that overrides QV-31 §4.2 or REQ-008. ADR-P31-1..3 point the other way (default-deny). The QV-09:617 non-claim admits that the operator can observe timing; it does not permit recording it in logs at second precision. T-110 being Partial means this is acknowledged as incomplete, but QV-31-REQ-008 is a Must on an implemented module, and the code comment claims minute rounding for voter-path events, which the request line contradicts. For the control reason, I found no spec that defines a free-text reason field, and QV-07-REQ-083/§795 call for reason codes. Not refuted, though the impact is limited to operator-held logs.

**Interim notes:** logger.ts:35 uses 1 s steps for non-coarse events. http.ts:448-452 logs every request, including the ballot POST to log/entries, without the coarse flag, together with request_id, latency_ms, bytes_in and election_id. election.ts:679 logs the ballot append minute-rounded with seq, and the request line follows immediately with n+1. QV-31-REQ-008 (Must) requires timestamps rounded to 1 minute. QV-31 §4.2 allows only ts, level, event, route, status, dur_bucket, code, ... and §4.3 forbids 'timing of a specific voter's request'. The fields request_id, latency_ms, bytes_in, election_id, seq and n are outside that allowlist. records.ts:33 controlSchema accepts optional free-text `reason: str(256)`. QV-07-REQ-083 requires INVALIDATE to carry a reason code from §15.2, so free text deviates. QV-06-REQ-007 is literally about personal data and member-status reasons, so that citation is weaker. Mitigations: the logs are operator-local, and the operator can observe POST timing anyway (non-claim). Low.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Interim verifier upgraded LIKELY to confirmed Low; logger/http/control-record field paths unchanged.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/server/src/logger.ts; packages/server/src/http.ts; packages/server/src/election.ts; packages/server/src/records.ts

**Regression evidence:** Original B2 source/PoC evidence preserved; existing leakage tests do not establish QV-31 field/time conformance.

**Remaining gate:** Reconcile allowlisted telemetry and rounding without losing useful aggregate operational signals; restrict or explicitly approve public free-text control reasons. No claim of metadata/privacy conformance. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B2-17

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed_bounded_cache`.

**Original summary:** GET /export.json re-parses and re-serialises the whole log on every request including 304 and Range requests.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B2-17).

**Original location:** packages/server/src/app.ts:831-838

**Original confidence/category:** LIKELY; DoS (export)

**Original spec references:** QV-09 §13

**Original scenario:** Repeated If-None-Match or Range requests each rebuild the full export (bounded by class X 2/hour/bucket).

**Original evidence (verbatim):** Code inspection (no PoC).

**Original suggested remediation:** Cache like cachedQvb.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/server/test/verify-b2-17.test.ts (in worktree /home/user/audit/verify-quietvote/B2-b5 at 424110d, now removed)
```

**Interim output excerpt (verbatim):** # json scans 1 1 1  (200, 304, 206 each rebuild via edb.entries)
> # qvb scans 1 0 0  (control: cached)
> ok 1 - export.json: 304 and 206 each re-scan the full log
> ok 2 - export.qvb (control): cached, 304 and 206 do not re-scan

**Interim refutation attempt (verbatim):** At 424110d, packages/server/src/app.ts:831-838 (handler at :836) calls JSON.stringify(electionBundle(rt)) unconditionally. electionBundle (packages/server/src/export.ts:14-33) pages through the whole log and runs parseQvJson on each entry. The If-None-Match/304 decision is made in http.ts:406-411 only after the handler returns, and Range slicing happens at http.ts:415+, so neither skips the rebuild. Only export.qvb uses cachedQvb (app.ts:800-821). I checked whether a spec allows this and found the opposite: QV-09 §10 (docs/09-api-data-contracts.md:377) puts export.qvb and export.json together and says 'built bundles are cached per election for 10 minutes (bounded), so resumed downloads do not rebuild them'. QV-09 §13 (line 640) lists 'Per-election cache' as a mitigation for mass export abuse. So the behaviour does not match the spec. What limits the impact: the class X limit is applied before the handler (http.ts:308-309) at the default 2/hour per bucket (config.ts:152). The default is per bucket and not per election, as the spec table at line 171 says, but the rate limiter is not this finding. Many buckets can still multiply requests, and each request costs only CPU and memory in proportion to log size.

**Interim notes:** Location is correct (handler at app.ts:836, route at 831-838). This is an availability and efficiency deviation from QV-09 §10/§13 and has no integrity or privacy impact. The suggested fix of reusing the cachedQvb pattern (or the election.json bytes that qvb() already builds) fits the spec.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Interim verified Low. New journey populates JSON cache then replaces edb.entries with a throwing method; repeated200, conditional304, and ranged206 succeed without scanning entries.

**Fix or partial-fix commit:** [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** packages/server/src/app.ts; packages/server/test/consolidation.test.ts; packages/server/test/range.test.ts

**Regression evidence:** consolidation.test.ts real server journey; range.test.ts; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** JSON and QVB share bounded 128 MiB/10min LRU. Exact ETag304 avoids serialization on cold cache. Bodies larger than total budget are not retained and can still be expensive; large-scale export/load limits remain unmeasured. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### KNOWN TR-07/TR-08

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `partially_fixed`.

**Original summary:** Public debugPlaintext() remains and shred follows symlinks (compounds B2-08); report says unchanged and names no fix branch.

**Original report:** [docs/audit/2026-10-28/B2-quietvote-server-board.md](2026-10-28/B2-quietvote-server-board.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier KNOWN TR-07/TR-08).

**Original location:** packages/trustee/src/trustee.ts:938, packages/trustee/src/fsutil.ts (shred)

**Original confidence/category:** LIKELY; Custody

**Original spec references:** QV-17 §11

**Original scenario:** shred on a symlinked backup path destroys the symlink target rather than the intended file.

**Original evidence (verbatim):** Code inspection.

**Original known overlap:** TR-07, TR-08

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/trustee/test/verify-tr0708.test.ts (in worktree /home/user/audit/verify-quietvote/B2-b5 at 424110d, now removed)
```

**Interim output excerpt (verbatim):** ok 1 - shred on a symlinked path overwrites the unrelated target and only unlinks the link
> ok 2 - debugPlaintext is a public instance method
> # pass 2
> # fail 0

**Interim refutation attempt (verbatim):** At 424110d, packages/trustee/src/fsutil.ts:51-66 shred() uses stat() and open(path,'r+'), and both follow symlinks. It never uses lstat and does not check for the QVBUNDL1 magic, so it overwrites whatever the link points to and then unlinks only the link. destroy calls it on every recorded backup path (trustee.ts:824) and on the live bundle (trustee.ts:827). The backup-failure rollback also calls it (trustee.ts:769). debugPlaintext() is still a public method at trustee.ts:938-940 and returns encodeBundle(this.d), the full plaintext state. Trustee is re-exported from the package index (packages/trustee/src/index.ts:8), and no code or test in the repo calls the method. I checked both trustee audit branches: TR-07 and TR-08 are listed 'open' and neither branch fixes them. QV-17 §11.2 (docs/17-key-ceremony-trustees.md:335-340) requires crypto-erase of the bundle files and says nothing to allow overwriting files that are not bundles. Mitigating factors: exploiting the symlink needs write access to the backup directory between backup and destroy, which usually means the same user or a shared or removable mount. Overwriting a symlinked real backup is arguably the intended effect. debugPlaintext() can only be reached by in-process code that already holds an unlocked Trustee. The finding's wording 'destroys the symlink target rather than the intended file' is slightly imprecise: shred overwrites the target's contents and also removes the symlink.

**Interim notes:** This is a known issue that remains unfixed at this SHA. The prior audit rated both 'info'. Low is defensible only if combined with B2-08, which I did not verify. Taken alone, each is Info to Low.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Red: shred followed symlink and overwrote precious target; replaced backup and current-cwd legacy file both reported removed. Green: same-descriptor fingerprint/type/identity checks refuse these paths; unused public debugPlaintext removed.

**Fix or partial-fix commit:** [8cf2669](https://github.com/djshellshoxxx/quietvote/commit/8cf26691f87af3a10c55c896f15bf4169aa862fa)

**Affected source:** ['packages/trustee/src/fsutil.ts', 'packages/trustee/src/trustee.ts', 'packages/trustee/src/bundle.ts', 'packages/trustee/NOTES.md']

**Regression evidence:** ['packages/trustee/test/custody.test.ts: TR-08 shred preserves symlink targets, hardlinked files and nonregular paths', 'packages/trustee/test/custody.test.ts: TR-08 replaced backup bytes and legacy relative paths are never shredded or reported removed', '/workspace/work/validation/trustee-custody-red.log', '/workspace/work/validation/trustee-custody-green.log', '/workspace/work/validation/trustee-package-tests.log', '/workspace/work/validation/trustee-final-regressions.log', '/workspace/work/validation/trustee-custody-final.log', '/workspace/work/validation/trustee-freeze-safety.log (19/19 named safety tests passed before final DESTROYING-resume refinement)', '/workspace/work/validation/trustee-freeze-typecheck.log (exit0)', '/workspace/work/validation/trustee-command-summary.log', '/workspace/work/validation/trustee-tombstone-green.log (final9/9 custody tests incl resurrection refusal and crash resume)']

**Remaining gate:** TR-08 filesystem confusion fixed conservatively. TR-07 public diagnostic removed, but immutable JS passphrase/key strings still cannot be reliably wiped; trusted embedding data getter still exposes bundle data by design. No memory-erasure guarantee. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/trustee
node --test packages/trustee/test/custody.test.ts
```

### B1-01

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** A spoil beyond max_spoils_per_voter or outside the voting window is dropped before entering the spoiled set, so the same code cast later is counted without E_SPOILED_CODE_CAST even when its reveal is published.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-01).

**Original location:** packages/protocol/src/ballotlog.ts:75-79,packages/protocol/src/ballotlog.ts:83-88,packages/protocol/src/ballotlog.ts:96,packages/protocol/src/ballotlog.ts:124

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-16-REQ-015, QV-16 §5.13.2 step 4, QV-16 §5.14.4 #14

**Original scenario:** Manifest max_spoils_per_voter: 0 (or voter past limit); voter posts ballot X as spoil with published reveal, then casts same body X; TS verifier counts X, chk.benaloh.spoiled pass, only E_REVOTE_LIMIT/L; verifier-py (no limit) excludes it and FAILs (E_COUNTED_ROOT, E_AGG_MISMATCH).

**Original evidence (verbatim):** node --test audit-b1-poc/b1-poc.test.ts test B1-01 passes (verdict PASS, code in countedBallots); py_diff.py row E1-spoil-over-limit TS=PASS PY=FAIL; control E1c-spoil-within-limit both flag. PoC dir /home/user/audit/quietvote-b1/audit-b1-poc/.

**Original suggested remediation:** Register every envelope-valid voter-signed spoil code in the spoiled set before window/limit rules (which still raise their L finding); same in verifier-py plus the limit; add regression tests for over-limit and outside-window. PR #10 P4 fix does not cover this.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test vpoc/v01.test.ts (worktree /home/user/audit/verify-quietvote/B1-b1, now removed)
```

**Interim output excerpt (verbatim):** # 0 PASS pass E_REVOTE_LIMIT/L
> ok 1 - over-limit spoil with reveal then cast of same code (maxSpoils=0)
> # 1 PASS pass E_REVOTE_LIMIT/L
> ok 2 - ... (maxSpoils=1)
> ok 3 - control: within-limit spoil then cast of same code is flagged
> # E_TIME_WINDOW@19
> ok 4 - pre-open spoil: code not in spoiled set, later in-window cast counted

**Interim refutation attempt (verbatim):** I read packages/protocol/src/ballotlog.ts. Line 75-79 runs the window check and line 85-88 the max_spoils check. Both `continue` before line 96 (spoiled.set) and before the reveal check at line 89-95. Line 124 then tests only the spoiled set. QV-16 §5.13.2 step 4 says the spoiled code 'can never be counted', and §5.14.4 #14 and line 552 say 'the verifier flags E_SPOILED_CODE_CAST regardless'. No spec text or ADR makes membership in the spoiled set depend on the spoil limit or the window; §5.13.1 item 5 describes the limit only as abuse control. The server rejects over-limit spoils (packages/server/src/election.ts:1023), so an honest board does not produce this. The verifier exists to handle logs from a buggy or malicious board (§5.20 class L), so the guard does not refute it. No existing test covers this. CP-01 (PR #10) is about a different path.

**Interim notes:** Reproduced with maxSpoils=0 and with maxSpoils=1 (allowance used up first). Result: verdict PASS, chk.benaloh.spoiled pass, the code with the published reveal is counted, and the only finding is E_REVOTE_LIMIT/L. The control case (a spoil within the limit) correctly raises E_SPOILED_CODE_CAST. The pre-open-marker spoil reproduces the same way at the analyzeBallotLog level. A side effect: an over-limit spoil also skips the reveal check, so a bad reveal there raises no E_SPOIL_MISMATCH alarm. The consequence: a voter working with a non-conforming board can publish the plaintext of the ballot that is counted (a receipt), and the reference verifier stays silent. Medium because an honest server blocks it.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed new red: signed same-code spoil counted at limit zero and before-open/after-close; composition rewrap failed to alarm. All new regressions green.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** packages/protocol/src/ballotlog.ts; verifier-py/qv_verifier/election.py

**Regression evidence:** packages/protocol/test/b1-regressions.test.ts; verifier-py/tests/test_audit_regressions.py

**Remaining gate:** Finding-code ownership for ignored excess spoils is part of the broader QV-ERR-PY-007 check mapping gate; code-exclusion/alarm repair is definite. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-02

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `owner_gate`.

**Original summary:** verifier-py makes non-ballot record anomalies (control entries, unknown types, bad-signature markers preceding valid ones, binding fields on non-open markers, repeated identical tally) fatal, failing elections the reference passes.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-02).

**Original location:** verifier-py/qv_verifier/election.py:314-320,verifier-py/qv_verifier/election.py:341-344,verifier-py/qv_verifier/election.py:354-358,verifier-py/qv_verifier/election.py:396-400,verifier-py/qv_verifier/election.py:509-511

**Original confidence/category:** CONFIRMED; divergence (QV-35)

**Original spec references:** QV-35 §1, QV-35 §6, QV-16 §5.20, QV-ADR-022

**Original scenario:** Shipped vector test-vectors/v1/elections/log-layer-4v/notices/pause-resume.bundle.json: TS PASS, Python FAIL (E_SCHEMA fatal); also E11-control-entries, E7-bad-close-then-good (E_SIG fatal), E13-C3-close-with-binding, E17-tally-posted-twice all TS PASS / Py FAIL; anyone able to append to the exported log can make verifier-py FAIL a valid election.

**Original evidence (verbatim):** python3 -I audit-b1-poc/py_diff.py on TS-built bundles; quick_ts.ts / quick_py.py on pause-resume bundle; test_b1_py_poc.py.

**Original suggested remediation:** Mirror the reference in verifier-py: class L for unknown/malformed non-ballot records and bad signatures, pick first validly signed marker, treat identical repeated tally as duplicate; record classes in QV-16 §5.20 (owner decision); add mutants.

**Interim reproduction:** method=command; reproduced=True

**Exact historical interim command:**

```text
node vpoc/gen02.ts; for f in vpoc/out/*.bundle.json test-vectors/v1/elections/log-layer-4v/notices/pause-resume.bundle.json; do node vpoc/ts_one.ts $f; python3 -I vpoc/py_one.py verifier-py $f; done
```

**Interim output excerpt (verbatim):** pause-resume: TS {verdict:PASS, fails:[chk.encoding.canonical], E_VERSION/L x2} | PY {verdict:FAIL, fatal:[E_SCHEMA chk.encoding.canonical x2]}
> forged-close-first: TS PASS (E_SIG/L) | PY FAIL (E_SIG chk.time.window fatal)
> marker-extra-binding: TS PASS (E_SCHEMA/L) | PY FAIL (E_SCHEMA fatal)
> tally-twice: TS PASS (E_SCHEMA/L) | PY FAIL (E_SCHEMA chk.tally.aggregate fatal)
> unknown-type(control): TS PASS (E_VERSION/L) | PY FAIL (E_SCHEMA fatal)
> baseline: both PASS

**Interim refutation attempt (verbatim):** I checked whether the behaviour is permitted. QV-16 §5.20 gives E_SCHEMA and E_SIG class R/L, not F; E_VERSION is R/L/F. verifier-py/qv_verifier/election.py:315 and :344, :358 and :400 mark E_SCHEMA and E_SIG fatal on non-ballot records. Lines 396-400 take opens[0]/closes[0] without first filtering out invalid signatures, and line 509-510 makes any tally count other than 1 fatal. The reference (packages/protocol/src/verify.ts:255-339, :408-413, :468) records these as class L. The mutation vector unknown-field-in-tally expects FAIL, so a schema error inside a tally is legitimately F, but that does not cover a repeated identical tally or records that are not tallies. QV-ADR-022 accepts control entries (provisional). QV-35 §6 and REQ-003/006 want agreement, with divergences recorded as errata, and no QV-ERR-PY entry records these. Mitigating context: verifier-py is labelled SKELETON and the log layer is documented as not implemented. Only parties who can append records (the board operator) can trigger the forged-marker and junk-record cases.

**Interim notes:** Divergence confirmed on the shipped pause-resume bundle and on 4 bundles I built. The failure direction is a false FAIL in verifier-py, which is a denial of verification. Neither verifier passes a tampered result, so I rate it Low rather than Medium. verifier-py is a documented skeleton second verifier, and the notice and log-layer scope is a known gap (QV-35-REQ-011).

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Original audited pause/resume, bad earlier markers, identical duplicate tally and malformed non-ballot records remain false-FAIL divergences in Python. No finding classes silently changed.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** verifier-py/NOTES.md

**Regression evidence:** Original preserved B1 PoCs and root strict differential

**Evidence scope / unresolved boundary:** Do not reinterpret strict report inequality as a pass. On the supplied comparison corpus 27 verdicts agree while 12 detailed reports still disagree; strict comparison retains exit 1.

**Remaining gate:** Owner must reconcile non-ballot finding classes and scope/semantics of controls (SG7, D-87, QV-ERR-PY-007). All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-03

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** verifier-py raises an uncaught QVError for an approval contest without winners and would KeyError on a yes-no contest without rule, which its manifest validation accepts.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-03).

**Original location:** verifier-py/qv_verifier/rules.py:25,verifier-py/qv_verifier/rules.py:59,verifier-py/qv_verifier/election.py:186-193,verifier-py/qv_verifier/election.py:624-626,verifier-py/qv_verifier/manifest.py:130-139

**Original confidence/category:** CONFIRMED; robustness

**Original spec references:** QV-35 §7, QV-20 §5.3

**Original scenario:** E5-approval-no-winners: TS PASS (one seat), verify_bundle raises QVError('E_RULES: number of winners undefined'); callers other than the vector runner get an exception instead of a verdict.

**Original evidence (verbatim):** Python PoC test_B1_03_* in audit-b1-poc/test_b1_py_poc.py (python3 -I -m unittest discover -s audit-b1-poc -p 'test_b1_py_poc.py').

**Original suggested remediation:** Default approval to one seat per QV-20 §5.3 (or reject at validation with named error consistently with reference), require rule for yes-no in validation, catch evaluation errors as named failure.

**Interim reproduction:** method=command; reproduced=True

**Exact historical interim command:**

```text
node vpoc/gen03.ts; node vpoc/ts_one.ts vpoc/out/approval-no-winners.bundle.json; python3 -I vpoc/py_one.py verifier-py <same>; python3 -I vpoc/py03.py verifier-py <same>
```

**Interim output excerpt (verbatim):** TS: {verdict:PASS, fails:[], codes:[]}
> PY: EXC QVError E_RULES: number of winners undefined
> validate: accepted yes-no without rule
> evaluate raised KeyError 'rule'

**Interim refutation attempt (verbatim):** QV-16 §5.19.3 item 3 defers `w` to QV-20. QV-20 §5.3 says 'highest approval count wins (single-winner) or top-w for seats = w', so an approval contest without `winners` is valid and has one seat. The reference does the same (packages/protocol/src/rules.ts:34) and passes the bundle. verifier-py/qv_verifier/rules.py:59 raises QVError instead. verify_bundle (election.py:190-193) catches only _Stop, so the error propagates to the caller. The vector runner (runner.py:107-110) catches it, but direct callers do not. That conflicts with QV-35 §7: 'a malformed input yields a named error and a FAIL ..., never a crash'. For yes-no, manifest.py does not require `rule` (lines 95-139), and rules.py:25 then raises KeyError. The reference rejects such a manifest at validation (packages/protocol/src/manifest.ts:107).

**Interim notes:** Both parts reproduced. The approval case gives a wrong outcome type: an exception from verifier-py where the reference returns PASS. The yes-no case is a crash on a manifest that the reference rejects. No impact on integrity.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed approval-without-winners QVError and accepted yes/no-without-rule; now one-seat approval and named manifest/result failures.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** verifier-py/qv_verifier/rules.py; verifier-py/qv_verifier/manifest.py; verifier-py/qv_verifier/election.py

**Regression evidence:** verifier-py/tests/test_audit_regressions.py

**Remaining gate:** Independent external review remains required. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-04

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** verifier-py does not enforce lower-case fixed-width hex or integer types in records outside ballot envelopes and manifest (bytes.fromhex accepts upper case/whitespace; True == 1), so verifiers compute different DKG outcomes and verdicts.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-04).

**Original location:** verifier-py/qv_verifier/election.py:85-132,verifier-py/qv_verifier/election.py:280,verifier-py/qv_verifier/ristretto.py:116-121,verifier-py/qv_verifier/ristretto.py:144-149,verifier-py/qv_verifier/dkg.py:24-29

**Original confidence/category:** CONFIRMED; conformance / divergence

**Original spec references:** QV-16 §5.5 item 3, QV-16 §5.5 item 7, QV-35-REQ-003

**Original scenario:** D2-uppercase-hex-dealing: TS Q=[1,2], Python E_DKG_QUORUM; D5-boolean-index-trustee-1 ("i": true): TS Q=[2,3], Python E_DKG_QUORUM; E14-tally-share-uppercase-hex and E18-roll-uppercase-hex: TS FAIL, Python PASS.

**Original evidence (verbatim):** op_py.py / oplevel.ts op-level probes; py_diff.py and quick_ts.ts/quick_py.py on out/E18-roll-uppercase-hex.bundle.json; test_b1_py_poc.py.

**Original suggested remediation:** Validate every record field in verifier-py with the closed schema used on the ballot path (lower-case fixed-width hex regex, type(x) is int and ranges) before decoding.

**Interim reproduction:** method=command; reproduced=True

**Exact historical interim command:**

```text
python3 -I vpoc/mut04.py vpoc/out/baseline.bundle.json; node vpoc/ts_one.ts / python3 -I vpoc/py_one.py on tally-share-upper and roll-upper; python3 -I vpoc/dkg04.py verifier-py; node vpoc/dkg04.ts
```

**Interim output excerpt (verbatim):** tally-share-upper: TS {FAIL, E_SCHEMA/F} | PY {PASS}
> roll-upper: TS {FAIL, E_ROLL/F} | PY {PASS}
> DKG honest vector: PY Q=[1,2,3] ctx e14e3720..; upper3 (trustee 3 dealing upper-case, commit recomputed): PY Q=[1,2,3] ctx e30b4ec8..; bool1 ("i": true): PY Q=[1,2,3] ctx 47764e8d..
> TS schema upper3: "$.enc.E: expected 32-byte lowercase hex"; bool1: "$.i: integer out of range"; TS adjudicateDkg on same records: E_DKG_QUORUM

**Interim refutation attempt (verbatim):** QV-16 §5.5 item 3 says binary values are lower-case fixed-length hex and 'upper-case hex is rejected, not normalised'. Item 2 allows integers only, and a JSON boolean is not an integer. In verifier-py, _record_schema_ok (election.py:85-132) checks hex case only for roll-commit root and election-open manifest_hash, and checks key sets only for DKG and tally records. ristretto.decode_hex and scalar_decode_hex (ristretto.py:116-121, 144-149) use bytes.fromhex, which accepts upper case. election.py:280 decodes the roll the same way, and dkg.py compares indices with == (True == 1). I confirmed that verifier-py accepts all of these non-canonical forms. The reference rejects them by schema (verify.ts:146-152, :262-333). The ctx values differ, so a malicious trustee or coordinator can make the two verifiers compute different DKG transcripts and verdicts. The values decode to the same bytes, so no tampered tally is accepted.

**Interim notes:** Divergence confirmed in both directions. verifier-py PASSes a tally or roll with upper-case hex that the reference FAILs, and it accepts non-canonical DKG records that the reference excludes, which gives a different ctx and Q. In a real ceremony the honest trustees run the TS rules and exclude the bad dealer, so verifier-py would FAIL a valid election. I rate it Low rather than Medium: this is a conformance and disagreement problem in a skeleton second verifier, and it gives no path to accepting altered counts.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed boolean trustee index accepted; uppercase tally and roll accepted. Added exact types/width/lowercase validation and shared direct DKG field guard.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** verifier-py/qv_verifier/recordfields.py; verifier-py/qv_verifier/election.py; verifier-py/qv_verifier/dkg.py

**Regression evidence:** verifier-py/tests/test_audit_regressions.py; unmodified 282-vector sweep

**Remaining gate:** No claim of complete JSON Schema formalization; numeric/schema policies and error/check ownership remain owner gates. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-05

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `owner_gate`.

**Original summary:** Bidi-control rejection sets differ: Python also rejects U+061C which TS accepts, and TS skips trustee/witness names (KNOWN P6).

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-05).

**Original location:** packages/protocol/src/manifest.ts:10,packages/protocol/src/manifest.ts:63-67,verifier-py/qv_verifier/manifest.py:27,verifier-py/qv_verifier/manifest.py:75

**Original confidence/category:** CONFIRMED; divergence

**Original spec references:** QV-13-REQ-082, QV-13 §8, QV-34 §7.2

**Original scenario:** M6-title-U061C: TS accepts, Python rejects; M5-trustee-name-bidi-U202E: TS accepts, Python rejects; verifiers disagree on the same manifest.

**Original evidence (verbatim):** op_py.py op-level probes; TS PoC test B1-05 in audit-b1-poc/b1-poc.test.ts passes.

**Original known overlap:** P6 (partial overlap)

**Original suggested remediation:** One normative list in QV-16/QV-13 (owner), same in both verifiers, a QV-34 vector per code point.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test vpoc/gen.test.ts (writes manifest probes + TS verdicts); python3 -I vpoc/py_check.py (runs verifier_py manifest.validate on same JSON)
```

**Interim output excerpt (verbatim):** title_061c TS=ACCEPT PY=REJECT ('E_MANIFEST: title: bidi control character') DIVERGE; trustee_name_202e TS=ACCEPT PY=REJECT ('E_MANIFEST: trustee.name: bidi control character') DIVERGE; title_202e / title_200f rejected by both

**Interim refutation attempt (verbatim):** Looked for a guard elsewhere in TS that checks trustee or witness names for bidi characters. There is none: validateManifest only scans the `free` array, and the schema does not filter the names. Looked for an accepted spec that lists U+061C. QV-13-REQ-082 does not, and QV-16 has no list (QV-ERR-PY-012). No accepted decision allows the two implementations to differ, and QV-13 requires them to be identical. The finding is not refuted.

**Interim notes:** TS BIDI regex packages/protocol/src/manifest.ts:10 = U+200E, U+200F, U+202A-202E, U+2066-2069. It is applied only to title, contest titles and option labels (manifest.ts:63-67), not to trustee names or witness names. Python verifier-py/qv_verifier/manifest.py:27 adds U+061C, and _text() is applied to trustee.name (line 220) and witness.name (line 252). QV-13-REQ-082 (docs/13-accessibility-localization.md:259) lists U+202A-202E and U+2066-2069 for organizer-supplied text, rejected at manifest validation. QV-13 line 326 says the bidi-control rejection rules must be identical in all implementations. Trustee names are organizer-supplied manifest text, so TS also arguably misses REQ-082 there. U+061C is outside the QV-13 list, so neither list is wrong for that code point, but the two verifiers disagree on the same manifest.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** TS imported P6 now covers trustee/witness names; U+061C still differs between TS/Python.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/protocol/src/manifest.ts (imported); verifier-py/NOTES.md

**Regression evidence:** Imported packages/protocol/test/second-wave.test.ts P6

**Remaining gate:** Owner must define one normative bidi list (SG8); no Unicode acceptance policy invented. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-06

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed_disclosure`.

**Original summary:** qv-verify without --manifest-hash compares the manifest with the bundle's own manifest_hash, reports V1 PASS and exits 0 with no caveat and without printing the manifest hash.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-06).

**Original location:** packages/verifier/src/main.ts:38,packages/verifier/src/main.ts:49,packages/verifier/src/main.ts:77,packages/verifier/src/verify.ts:122-123,packages/protocol/src/verify.ts:166-172,packages/verifier/src/format.ts:159-161

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-16 §5.6.1, QV-16 App. C Inputs

**Original scenario:** A distributor substitutes a complete self-consistent election (own coordinator, trustees, roll, results); qv-verify bundle.json prints V1 PASS, VERDICT PASS, exit 0.

**Original evidence (verbatim):** node packages/verifier/src/bin.ts audit-b1-poc/out/E0-baseline.bundle.json --skip-selftest -> VERDICT PASS, V1 PASS, exit 0; PoC test B1-06 in b1-poc.test.ts builds attacker election and asserts PASS, no pin caveat, hash absent from output.

**Original known overlap:** BC-04 (same class, covered only qv ballot encrypt/audit)

**Original suggested remediation:** Always print the verified manifest hash; without pin report V1 not run or verdict INCOMPLETE with caveat 'manifest hash NOT pinned'; mandatory pin is an owner decision. Same pattern for qv verify (packages/cli/src/cmd-verify.ts:8-12) and web page (packages/web/src/verifier/page.ts:55-63).

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test vpoc/gen.test.ts (B1-06 case); node packages/verifier/src/bin.ts vpoc/out/v-b106.bundle.json --skip-selftest; same with --manifest-hash abab...
```

**Interim output excerpt (verbatim):** VERDICT: PASS / V1 PASS Manifest hash and coordinator signatures / election ctx: f4a5704e8ec57396... / exit=0. The manifest hash does not appear in the text or the JSON report, and no caveat about the missing pin is printed. With --manifest-hash ab*32 the same bundle gives VERDICT: FAIL, exit=1.

**Interim refutation attempt (verbatim):** Checked whether any spec, ADR or the verifier NOTES makes an unpinned run with a PASS verdict and no hash output acceptable. QV-16 App. C and QV-18 §13 step 1 point the other way. Checked caveats.push sites in verify.ts:148,200-201: none mention the missing pin. Checked format.ts and the report type: no manifest hash is emitted. Not refuted. The claims about the CLI (cmd-verify.ts) and the web page (page.ts:55-63) were confirmed by reading: the pin is optional, and the web anchor compares only the election id.

**Interim notes:** packages/verifier/src/main.ts:49 and :77 make the pin optional. packages/verifier/src/verify.ts:123 uses the bundle's own manifest_hash when no pin is given. packages/protocol/src/verify.ts:166-172 compares against that hash, so chk.manifest.hash and V1 pass for any self-consistent substituted election. format.ts prints only a 16-hex ctx prefix and never the manifest hash. The VerifierReport type has no manifest-hash field. QV-16 App. C lists the out-of-band manifest_hash as an input, and §5.6.1 requires out-of-band comparison. QV-18 §13 step 1 (docs/18:419) requires qv-verify to 'report manifest hash H_m for out-of-band comparison'. The current tool does neither. QV-35 line 63 calls the pin 'optional' only for the second verifier, and even there the comparison relies on reporting the hash. Severity Medium: it is a conformance gap in the trust anchor, and an attacker election fully passes when the user does not pin. Exploiting it needs a distributor who substitutes the bundle and a user who skips the optional flag.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed unpinned PASS with no chosen hash/caveat. Report now prints selected manifest hash/source, warns when not supplied out of band, and reseals hash.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** packages/verifier/src/verify.ts; report.ts; format.ts

**Regression evidence:** packages/verifier/test/b1-anchor.test.ts

**Remaining gate:** Mandatory out-of-band anchor/overall verdict policy remains SG13; caller-supplied wrong hash still fails. Disclosure does not authenticate a bundle-provided anchor. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-07

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `owner_gate`.

**Original summary:** Open spec questions recorded in errata now produce verdict-level disagreement between the TS and Python verifiers on honest elections.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-07).

**Original location:** packages/protocol/src/rules.ts:26-31,packages/protocol/src/rules.ts:34-46,packages/protocol/src/schema.ts:231,packages/protocol/src/dkg.ts:189-205,packages/protocol/src/dkg.ts:275-280,packages/protocol/src/ballotlog.ts:105-132,verifier-py/qv_verifier/rules.py:20,verifier-py/qv_verifier/rules.py:37-47,verifier-py/qv_verifier/rules.py:60-67,verifier-py/qv_verifier/manifest.py:195-198,verifier-py/qv_verifier/dkg.py:24-29,verifier-py/qv_verifier/dkg.py:76,verifier-py/qv_verifier/dkg.py:128,verifier-py/qv_verifier/election.py:476-504

**Original confidence/category:** CONFIRMED; conformance (spec gaps)

**Original spec references:** QV-16 §5.19.3, QV-16 §5.7.6, QV-16 §5.14.2, QV-20 §5.1, QV-ERR-PY-003, QV-ERR-PY-009, QV-ERR-PY-010

**Original scenario:** E3-tie-basis-counted (TS tie, Py E_RESULT), E3b-2of3-status-quo-yes, E2-count-quorum (Py E_SCHEMA), E4-kofn-winner-order, E15-excluded-latest-cast (Py E_COUNTED_ROOT), DKG D1-duplicate-different-commit, D3-complaint-vs-R2-disqualified (different Q and ctx), D4-commit-before-dkg-open.

**Original evidence (verbatim):** gen.ts + py_diff.py on honest TS-built bundles; oplevel.ts / op_py.py for DKG rows; existing rules.json/dkg.json vectors pass in both and do not distinguish.

**Original known overlap:** QV-ERR-PY-003, QV-ERR-PY-009, QV-ERR-PY-010 (errata; verdict consequence new)

**Original suggested remediation:** Owner decisions on each question in QV-16 §5.19.3, §5.7.6, §5.14.2; align both verifiers; add distinguishing vectors.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test vpoc/gen.test.ts (builds honest TS bundles; TS verifyElection PASS on all); python3 -I vpoc/py_check.py (verifier_py.election.verify_bundle on the same files)
```

**Interim output excerpt (verbatim):** v-2of3-sq-yes: TS publishes and verifies {kind:'passed',reason:'tie-break'}; PY verdict FAIL E_RESULT, evaluates {kind:'rejected'}. v-counted-tie: TS {kind:'rejected',reason:'tie-break'} PASS; PY FAIL E_RESULT. v-count-quorum (quorum {type:'count',value:2}): TS PASS; PY FAIL E_SCHEMA "quorum: missing ['n']".

**Interim refutation attempt (verbatim):** Checked whether an accepted spec or ADR settles any of these questions in a way that makes one side clearly right. QV-16 §5.19.3 is ambiguous on ties and on the count-quorum field name, and §5.14.2 is silent on an excluded latest cast. The errata log says the questions are open. Because the spec is silent, neither implementation is a clear spec violation, which weakens 'defect'. The finding, though, is the verdict-level disagreement between the two verifiers, which QV-34 §8.2 and QV-35 treat as a discrepancy to resolve. I reproduced it on honest bundles, so it is not refuted. I did not verify every listed scenario (DKG rows, k-of-n order).

**Interim notes:** TS rules.ts:27-31 treats any strict lhs==rhs as a tie and applies tie_break. Python rules.py:37-47 treats a result as a tie only when y==n. With strict 2/3, y=2, n=1 and status-quo 'yes', the two verifiers reach OPPOSITE outcomes (passed vs rejected) on the same tally. QV-16 §5.19.3 item 2 ('Equality of y and n_ is a tie only if the rule cannot decide') is ambiguous. Quorum count field: TS schema.ts:231 uses `value`, Python rules.py:20 and manifest.py:195-198 use `n`. The spec writes only 'V ≥ n'. Excluded latest cast, confirmed by reading: TS ballotlog.ts:118-131 skips the excluded cast, so the earlier cast stays counted. Python election.py:487-501 leaves the voter with no counted ballot, which gives a counted-set divergence. I did not reproduce the DKG rows (D1/D3/D4) or the k-of-n winner order. Side observation outside this finding: TS rules.ts:22 would use V for basis 'roll', but the TS schema (schema.ts:203) rejects 'roll', so this cannot be reached. Severity Medium because one case flips the outcome. verifier-py is a partial skeleton (TODO T-148 Partial) and not a security control (QV-35-REQ-015), and the fix needs owner decisions, so Low/Medium is the plausible range.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Original honest-election disagreements remain outside shipped corpus: ties, count quorum field, winner order, DKG duplicates/early/equivocating records/complaints and latest excluded cast.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** verifier-py/NOTES.md

**Regression evidence:** Original preserved B1 op/election PoCs; root strict differential

**Evidence scope / unresolved boundary:** Agreement on the shipped 27-case verdict corpus does not close honest-election semantic disagreements outside it. QV-ERR-PY-006/007/015 and other referenced errata remain owner gates.

**Remaining gate:** QV-ERR-PY-003/009/010 and SG1/2/3/5/6 require owner-approved semantics, then vectors/reimplementations; no silent schema/vector changes. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-08

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `partially_fixed_owner_gate`.

**Original summary:** verifier-py manifest validation accepts manifests the reference rejects (time ordering, impossible dates, yes-no without rule, small-order/non-canonical keys, witness rules, size bounds) and diverges in both directions.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-08).

**Original location:** verifier-py/qv_verifier/manifest.py:155-269,verifier-py/qv_verifier/manifest.py:170-175

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-16 App. C step 3, QV-16 §5.5 item 5, QV-16 §5.6.1, QV-ADR-018

**Original scenario:** 23 of 25 probes diverge, e.g. M1 created after voting_open, M2 2026-02-30, M3 hour 24, M10/M11/M23 small-order or non-canonical keys, M18 yes-no without rule: Python accepts, TS rejects.

**Original evidence (verbatim):** op_py.py / oplevel.ts manifest probes (M0 valid control); test_b1_py_poc.py.

**Original suggested remediation:** Port reference checks the spec states into verifier-py; record the rest as errata.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test vpoc/gen.test.ts (TS validateManifest probes); python3 -I vpoc/py_check.py (verifier_py manifest.validate on the same JSON)
```

**Interim output excerpt (verbatim):** created_after_open TS=REJECT 'time ordering' PY=ACCEPT; feb30 TS=REJECT 'timestamp' PY=ACCEPT; hour24 TS=REJECT PY=ACCEPT; smallorder_coord (01||00*31) TS=REJECT 'coordinator key invalid' PY=ACCEPT; yesno_no_rule TS=REJECT 'yes-no requires rule' PY=ACCEPT; witness_is_logkey TS=REJECT 'witness entry invalid' PY=ACCEPT; control accepted by both

**Interim refutation attempt (verbatim):** Looked for later Python checks that would reject these manifests in verify_bundle. Small-order keys fail at strict signature verification, but only if that key must sign. There is no later check for time ordering, impossible dates, a missing yes-no rule, or the witness rules. QV-16 App. C step 3 explicitly lists time ordering, and QV-ADR-018 requires strict keys. Not refuted. The impact is limited because verifier-py is a partial second verifier.

**Interim notes:** verifier-py/qv_verifier/manifest.py:170-175 checks only TS_RE syntax and voting_close > voting_open. It does not check created <= voting_open, and it does not check that dates are real calendar dates. QV-16 App. C step 3 requires 'time ordering', and §5.5 item 5 requires UTC timestamps. Lines 221/233/245/253 check key fields only as hex, not as strict Ed25519 points (QV-ADR-018), unlike TS manifest.ts:73-85. Python rejects a small-order key later at signature verification (ed25519.py:65), so the verdict impact is limited when that key must sign. Python _contest does not require `rule` for yes-no, unlike TS manifest.ts:107. Python checks no witness-name prefix and does not stop a witness key from equalling log_pk. I tested 6 divergent probes, not the auditor's 23/25. 'Both directions' is supported by the B1-05 bidi cases, where Python is stricter. verifier-py is a declared partial skeleton.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed 17 date/key regression subcases red; now reject impossible dates, created>open, yes/no without rule, invalid/small/mixed-order coordinator/trustee/log/witness keys.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** verifier-py/qv_verifier/manifest.py; ed25519.py

**Regression evidence:** verifier-py/tests/test_audit_regressions.py; corrected honest generated key fixtures in tests/test_protocol.py

**Remaining gate:** Numeric bounds, witness schema/name/quorum policies, method-specific tie restrictions and bidi remain owner gates (SG8/10/12, QV-ERR-PY-012/014). All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-09

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `documentation_corrected_policy_gate_open`.

**Original summary:** COMPLETION C3 says verifier-py does not reject binding fields on non-open markers, but it rejects them fatally; the real gap is the class mismatch.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-09).

**Original location:** docs/plan/COMPLETION.md:27,verifier-py/qv_verifier/election.py:95-109

**Original confidence/category:** CONFIRMED; conformance (status accuracy)

**Original spec references:** COMPLETION.md C3, QV-ADR-015

**Original scenario:** E13 close marker carrying binding fields: TS PASS (class L, ignored), Python FAIL (E_SCHEMA fatal), contrary to the status text.

**Original evidence (verbatim):** Code reading of _record_schema_ok; py_diff.py row E13-C3-close-with-binding.

**Original suggested remediation:** Update C3 to describe the class mismatch (part of B1-02).

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Python already rejected forbidden binding fields; actual gap is fatal-vs-L record class.

**Fix or partial-fix commit:** [247df39](https://github.com/djshellshoxxx/quietvote/commit/247df393ea1ace300fe5ed1f569a12090e1364dc)

**Affected source:** verifier-py/NOTES.md; root to correct docs/plan/COMPLETION.md

**Regression evidence:** Code read; B1-02 preserved PoCs

**Documentation/status commit:** 247df393ea1ace300fe5ed1f569a12090e1364dc

**Current documentation resolution:** Root corrected stale completion wording: Python does reject binding fields, with an unresolved fatal-versus-L policy mismatch. B1-02 owner gate remains.

**Remaining gate:** Root corrected stale completion wording: Python does reject binding fields, with an unresolved fatal-versus-L policy mismatch. B1-02 owner gate remains. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-10

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `documentation_corrected_partial_scope`.

**Original summary:** T-028 'Exponential ElGamal encrypt/decrypt-to-point, rerandomize' is marked Done but no rerandomize function exists.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-10).

**Original location:** packages/crypto/src/elgamal.ts

**Original confidence/category:** CONFIRMED; conformance (status inflation)

**Original spec references:** TODO T-028

**Original scenario:** TODO row overstates implemented scope; grep finds no rerandomize (not required by suite v1).

**Original evidence (verbatim):** grep -rni rerandom packages/crypto/src packages/protocol/src returns nothing.

**Original suggested remediation:** Correct the TODO row status/description.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** No rerandomize API in packages/crypto/src/elgamal.ts; QV-16 suite v1 does not require it.

**Fix or partial-fix commit:** [247df39](https://github.com/djshellshoxxx/quietvote/commit/247df393ea1ace300fe5ed1f569a12090e1364dc)

**Affected source:** root to correct docs/plan/TODO.md T-028

**Regression evidence:** Source search; no production change needed

**Documentation/status commit:** 247df393ea1ace300fe5ed1f569a12090e1364dc

**Current documentation resolution:** Root corrected T-028 scope/status; no unused rerandomize API was invented. Any future rerandomization requirement needs explicit specification and review.

**Remaining gate:** Root corrected T-028 scope/status; no unused rerandomize API was invented. Any future rerandomization requirement needs explicit specification and review. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-11

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `partially_covered_open`.

**Original summary:** Negative corpus does not cover every Appendix C check and Ed25519/DKG edge cases, and a mutation sweep leaves 3 real survivors (Ed25519 small-order R, late DKG complaint, late key confirmation).

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-11).

**Original location:** test-vectors/v1/*,packages/crypto/test/*,packages/protocol/src/dkg.ts:276,packages/protocol/src/verify.ts:388,packages/crypto/test/proofs.test.ts:98-103

**Original confidence/category:** CONFIRMED; test coverage

**Original spec references:** QV-16-REQ-020, QV-16 §11, QV-34-REQ-001, QV-34-REQ-007, QV-34-REQ-009, QV-34 §7.2, QV-34 §9.3

**Original scenario:** Removing the Ed25519 strict R check (M14), adjudicating complaints after dkg-r3-close (M26), or counting key confirmations outside the window (M30) passes all tests; e.g. with t=n a late confirmation turns E_DKG_KEYCONF FAIL into PASS.

**Original evidence (verbatim):** Vector inventory script over test-vectors/v1; 32-mutant sweep via audit-b1-poc/mutation/mutate.py on scratchpad copies (summary.txt: 21 killed, 8 equivalent/unreachable, 3 real); small_order_r.ts shows noble accepts R=identity; identity_cds.ts shows CDS identity test passes for wrong reason.

**Original known overlap:** CP-08 (partly)

**Original suggested remediation:** One negative test each for M14/M26/M30 plus QV-34 vectors for small-order R, DKG timing, and missing Appendix C mutants.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** All three actual audit mutation survivors now have regressions. Isolated scratch removal of the strict R guard, late-complaint guard and late-keyconf guard each fails its new test. Imported CP-04/proof mutation coverage retained.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** packages/crypto/test/audit.test.ts; packages/protocol/test/b1-regressions.test.ts; imported crypto/protocol audit/second-wave tests

**Regression evidence:** crypto-b111-guards.log and crypto-protocol-green.log are green; crypto-b111-mutant-{small-order-r,late-complaint,late-keyconf}.log each records expected assertion failure

**Remaining gate:** Full negative corpus coverage for every Appendix C case and external-standard Ed25519/DKG vectors is still incomplete. Candidate corpus remains unsigned/unfrozen. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-12

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `fixed_documentation_risk_open`.

**Original summary:** The test claiming decryption nonces never repeat with a failed RNG varies only oid; with same (ctx,cid,oid) and different aggregate the nonce repeats and s_j is recovered.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-12).

**Original location:** packages/crypto/test/proofs.test.ts:208-220

**Original confidence/category:** CONFIRMED; test quality

**Original spec references:** QV-16 §5.16, QV-16 Appendix B item 6

**Original scenario:** constantRng, same (ctx, cid, oid), different aggregate: both proofs verify and s_j = (s1-s2)/(c1-c2) recovered.

**Original evidence (verbatim):** node audit-b1-poc/known_check.ts (CP-02 AFFECTED).

**Original known overlap:** CP-02

**Original suggested remediation:** Rename the test or add the failing case once CP-02 is decided.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Original test varied oid only. Renamed test to describe option-id separation, explicitly noting CP-02 does not bind changed aggregates.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** packages/crypto/test/proofs.test.ts; packages/protocol/NOTES.md

**Regression evidence:** Existing proof test; original preserved CP-02 PoC

**Evidence scope / unresolved boundary:** Corrected test naming does not repair the CP-02 nonce registry risk.

**Remaining gate:** CP-02 nonce-registry repair requires spec-owner decision; nonce reuse with failed RNG plus changed aggregate remains possible. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-13

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** The manifest record envelope {body, sigs} and its signature objects are not checked against a closed schema, so unknown members pass in TS while verifier-py FAILs.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-13).

**Original location:** packages/protocol/src/verify.ts:157-173,packages/verifier/src/bundle.ts:43

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-16 §5.5 item 7, QV-16 Envelope

**Original scenario:** out/E19-manifest-envelope-extra-members.bundle.json (E0 plus manifest.note and extra member in sig): protocol.verifyElection PASS with chk.encoding.canonical pass, qv-verify PASS, verifier-py FAIL (E_SCHEMA).

**Original evidence (verbatim):** quick_ts.ts / quick_py.py on E19 bundle; b1-poc.test.ts and test_b1_py_poc.py.

**Original suggested remediation:** Check S.multiSigned(manifest) shape (closed, sigs as S.sig) and report E_SCHEMA with chk.encoding.canonical fail.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node vpoc/gen.ts && python3 vpoc/py_run.py (in worktree /home/user/audit/verify-quietvote/B1-b4, since removed)
```

**Interim output excerpt (verbatim):** b113-envelope-member: TS verdict PASS, chk.encoding.canonical pass, loadBundle ok=true | Python FAIL ['chk.manifest.hash'] ['E_SCHEMA']. b113-sig-member (extra member in manifest.sigs[0]): TS PASS, Python PASS.

**Interim refutation attempt (verbatim):** I read verify.ts:144-178. Only mrec.body and mrec.sigs are read, and the {body, sigs} envelope is never checked against S.multiSigned (schema.ts:100). Log records do get closed-envelope checks (verify.ts:273,288). bundle.ts:43 only requires manifest and manifest.body to be objects. QV-16 §5.5 item 7 says schemas are closed, and I found no ADR or errata entry that exempts the manifest envelope. verifier-py election.py:250 does reject it (_keys_ok(env, {'body','sigs'}, set())). One part of the claim is overstated: verifier-py does not close-check the sig objects either (_coordinator_ok and _sig_valid, election.py:140-156). An extra member inside a manifest sig gives PASS in both verifiers, so only the envelope-level member actually makes the two verifiers diverge.

**Interim notes:** The junk members are outside the signed body, so the manifest content cannot be changed through them. The impact is that the bundle bytes become malleable and the two verifiers return different verdicts on the same bundle. Python reports E_SCHEMA under chk.manifest.hash, not chk.encoding.canonical.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed unsigned manifest envelope/signature extras PASS in TS; new exact wrapper/signature schema fails. Python signature-only extra also reproduced and fixed. Empty signatures retain E_MANIFEST_SIG. Unknown manifest protocols retain E_VERSION, demonstrated red/green; no expectation edits.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** packages/protocol/src/verify.ts; verifier-py/qv_verifier/election.py

**Regression evidence:** packages/protocol/test/b1-regressions.test.ts; verifier-py/tests/test_audit_regressions.py

**Remaining gate:** Independent external review remains required. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B1-14

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** verifier-py neither requires the dkg-open marker nor checks DKG marker order, passing a bundle the reference (and its own canary) rejects.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B1-14).

**Original location:** verifier-py/qv_verifier/election.py:363,verifier-py/qv_verifier/dkg.py:65,packages/verifier/src/canary.ts:50-51

**Original confidence/category:** CONFIRMED; conformance / divergence

**Original spec references:** QV-16 §5.7, QV-16 App. C step 5, QV-35 §6

**Original scenario:** out/E20-dkg-open-marker-dropped.bundle.json (first log entry dkg-open removed): TS FAIL (E_DKG_MARKERS), Python PASS.

**Original evidence (verbatim):** quick_ts.ts / quick_py.py on E20 bundle; test_b1_py_poc.py.

**Original suggested remediation:** Require all six markers in strictly increasing order as adjudicateDkg does (dkg.ts:182-183).

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node vpoc/gen.ts && python3 vpoc/py_run.py
```

**Interim output excerpt (verbatim):** dkg-open at index 0 seq 1; b114-no-dkg-open: TS FAIL ['E_DKG_MARKERS/F'] | Python PASS [] []

**Interim refutation attempt (verbatim):** QV-16 §5.7 (docs/16-crypto-protocol.md:303) lists dkg-open as one of the six coordinator-signed phase markers. App. C step 5 says DKG records are ordered 'against phase markers by sequence'. TS adjudicateDkg (dkg.ts:182-183) requires all six markers in strictly increasing order. verifier-py election.py:363 'need' omits dkg-open. dkg.py:65 defaults dkg_open to 0, and dkg.py never checks marker order. I found no QV-ERR-PY errata entry recording this as a deliberate choice (grep of docs/errata). The reference canary also contains this exact case (canary.ts:49-51, 'synthetic/first-log-entry-dropped').

**Interim notes:** The impact is that the two verifiers return different verdicts. With dkg-open missing, Python accepts commits from seq 0 onward. I did not separately exercise the marker-order part of the claim; it is established by reading only (no order comparison exists in dkg.py).

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed missing dkg-open PASS and direct DKG fallback; full election and direct adjudication now require ordered six markers.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** verifier-py/qv_verifier/election.py; dkg.py

**Regression evidence:** verifier-py/tests/test_audit_regressions.py

**Remaining gate:** Independent external review remains required. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-01 (verifier-py residual)

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Counted ballot re-wrapped under another supersedes with published reveal passes; the verifier-py side has no fix on any branch.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier CP-01 (verifier-py residual)).

**Original location:** verifier-py/qv_verifier/election.py,packages/protocol/src/verify.ts:571-581,packages/protocol/src/ballotlog.ts:63-66

**Original confidence/category:** CONFIRMED (reproduced at SHA); conformance

**Original spec references:** QV-16-REQ-015

**Original scenario:** K-CP01: TS PASS with chk.benaloh.spoiled pass and Python PASS; also a planted invalid cast's alpha makes an honest trustee-mode audit raise E_SPOILED_CODE_CAST/ALARM.

**Original evidence (verbatim):** node audit-b1-poc/known_election.ts (K-CP01); node audit-b1-poc/known_tr01_plant.ts.

**Original known overlap:** CP-01

**Original suggested remediation:** Apply PR #10 fix in TS (castAlphas restricted to valid casts) and an equivalent check in verifier-py.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node vpoc/gen.ts && python3 vpoc/py_run.py
```

**Interim output excerpt (verbatim):** cp01 counted code still counted: true n_counted 4; cp01-rewrap-reveal: TS PASS chk.benaloh.spoiled pass | Python PASS. plant-false: TS PASS ben pass; plant-true: TS PASS, chk.benaloh.spoiled fail, findings [E_SIG/L, E_SPOILED_CODE_CAST/ALARM]. (Python FAILs both plant bundles with E_SCHEMA because trustee-mode spoils are unsupported.)

**Interim refutation attempt (verbatim):** I checked whether either verifier compares ciphertexts. TS analyzeBallotLog (ballotlog.ts:96-127) keys spoils and E_SPOILED_CODE_CAST by ballot code only. The alpha check at verify.ts:571-581 runs only for trustee-mode tally spoils. verifier-py election.py:456-504 compares by code only and has no alpha check. Diffing every origin branch against this SHA for verifier-py/qv_verifier shows only deletions (older trees), so no branch fixes the Python side. On the plant side effect: castAlphas is filled at ballotlog.ts:63-66 before verifyEnvelope's result is checked, so an invalid cast (E_SIG) still contributes its alphas. Mitigating factor: the plant gives verdict PASS, because the finding is ALARM rather than F. Only chk.benaloh.spoiled fails and an ALARM is raised against the honest audit. Posting an invalid envelope also requires a party able to append to the log.

**Interim notes:** Both verifiers PASS at this SHA, so this is the known CP-01 issue reproduced in both. The genuinely new part is that verifier-py has no counterpart to the PR #10 fix, so once PR #10 merges the two verifiers will disagree. The plant side effect is a TS-only false alarm (Low on its own).

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed K-CP01-rewrap-reveal benaloh pass, now fail with E_SPOILED_CODE_CAST; invalid-signature alpha plant control stays unalarmed.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** verifier-py/qv_verifier/election.py; packages/protocol/src/ballotlog.ts

**Regression evidence:** verifier-py/tests/test_audit_regressions.py; packages/protocol/test/b1-regressions.test.ts

**Remaining gate:** Trustee-mode independent Python support remains PY-01; low-level trusteeDecryptSpoiled still requires trusted counted-set-aware caller. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-04 (verifier-py residual)

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Even after PR #10's TS fix, verifier-py still accepts mixed-order public keys and 1/8 of signatures, so acceptance sets differ.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier CP-04 (verifier-py residual)).

**Original location:** verifier-py/qv_verifier/ed25519.py:52-57,packages/crypto/src/ed25519.ts

**Original confidence/category:** CONFIRMED; divergence

**Original spec references:** QV-16-REQ-016, QV-ADR-018

**Original scenario:** Mixed-order key A = aB + T8: at SHA TS accepts 16/16, Python 2/16; with PR #10 ed25519.ts TS 0/16 and rejects the key while Python accepts the key, so a roll with it is E_ROLL FAIL in patched TS and PASS in Python.

**Original evidence (verbatim):** op_py.py / oplevel.ts Ed25519 mixed-order probes; scratchpad copy of packages/crypto with PR #10 ed25519.ts, node check.ts.

**Original known overlap:** CP-04

**Original suggested remediation:** Add the same torsion-free check to verifier-py valid_public_key.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node vpoc/mixed.ts && python3 vpoc/mixed_py.py && node vpoc/roll.ts
```

**Interim output excerpt (verbatim):** TS: {strictPointAtSHA:true, torsionFree:false, tsAccepts:16, patchedAccepts:0}; Python: {'valid_public_key': True, 'py_accepts': 2}; py roll_root accepts; TS rollRoot at SHA ok= true

**Interim refutation attempt (verbatim):** I read the PR #10 diff (git diff SHA..origin/claude/quietvote-audit-crypto-protocol-1 -- packages/crypto/src/ed25519.ts). Its only change adds '&& P.isTorsionFree()' to ed25519IsStrictPoint. verifier-py ed25519.py:52-57 (valid_public_key) and verify() check only canonical encoding and small order, not torsion-freeness, and use the cofactorless equation. merkle.py:53 uses valid_public_key, while TS manifest.ts:35 uses ed25519IsStrictPoint. QV-ADR-018 makes the same acceptance set a conformance requirement for every verifier. I found no branch that changes verifier-py. QV-ERR-PY-011 records the R-policy choice but not torsion-freeness.

**Interim notes:** At this SHA the two verifiers already disagree on signatures from mixed-order keys (TS 16/16, Python 2/16); this is the known CP-04. Once PR #10 is applied, TS rejects the key entirely (strict point false, so rollRoot gives E_ROLL), while Python still accepts the key in the roll and 1/8 of its signatures. The residual divergence claim therefore holds. Exploiting it requires a voter, trustee or coordinator who controls their own key; the effect is that the verifiers return different verdicts, not that votes can be altered.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed valid_public_key(mixed-order) true and cancellation signatures accepted. Independent two-torsion constructions rejected after prime-subgroup checks; honest controls retained.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** verifier-py/qv_verifier/ed25519.py; manifest.py

**Regression evidence:** verifier-py/tests/test_audit_regressions.py; existing RFC8032 controls

**Remaining gate:** Acceptance-set boundary should receive independent crypto review and broader external-standard vectors. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### TSV-04

**Severity and historical review:** Info → Info; interim verdict confirmed. Consolidation disposition: `owner_gate_disclosed`.

**Original summary:** A throwing board layer only sets boardSkipped; PASS stays reachable.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier TSV-04).

**Original location:** packages/verifier/src/verify.ts:133-138,packages/verifier/src/verify.ts:255

**Original confidence/category:** yes (code read); verifier robustness

**Original spec references:** Not supplied.

**Original scenario:** Board-layer verification throws; verdict can still be PASS.

**Original evidence (verbatim):** Code read at SHA (HANDOFF 3.2.4 item, no severity given).

**Original known overlap:** TSV-04 (PR #6 HANDOFF)

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/packages/verifier && node --experimental-test-module-mocks --test test/b5-tsv04.test.ts
```

**Interim output excerpt (verbatim):** baseline PASS pass
> throwing PASS not_run ["board verification raised: synthetic board-layer fault"] ["V4 not run: board verification raised: synthetic board-layer fault"]
> no board PASS not_run
> ok 1 - TSV-04

**Interim refutation attempt (verbatim):** Read verify.ts:118-155 and compose() 160-258: on a throw from runBoard (verify.ts:133-137) br stays undefined, boardFailed stays false, and the verdict at verify.ts:255 is pr.verdict, so PASS is reachable; V4 becomes not_run with a caveat. I tried to find an input-reachable throw and did not find one: board.verifyLog (packages/board/src/bundle.ts:99 onward) wraps its body in try/catch and turns exceptions into QV_BOARD_BAD_BUNDLE failures, bundleFromJson validates the export shape first, and runBoard only runs after chk.manifest.sig passes. So the catch is defensive code. To show the claimed behaviour I mocked @quietvote/board.verifyLog to throw on an otherwise PASSing witnessed, bound election. The verdict stayed PASS. Mitigating context: a bundle that carries no board at all also gets PASS with V4 not_run (the open TSV-05/P1 decision), and QV-16 C8 only says PASS requires no F-class error, which does not cover an internal exception. No accepted spec requires this composition, and the unmerged HANDOFF asks for FAIL here.

**Interim notes:** Logic confirmed. The throw could not be triggered from untrusted bundle input at this SHA, and the outcome matches the existing no-board behaviour (TSV-05). This is defence-in-depth only.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Current catch still leaves PASS reachable when board verification throws, but V4 is not_run and explicit boardSkipped caveat prints. No blanket FAIL policy invented.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/verifier/NOTES.md; existing src/verify.ts and format.ts

**Regression evidence:** Code read; original interim module-mock PoC

**Evidence scope / unresolved boundary:** A skipped/throwing board check can still leave overall PASS reachable. Existing caveat disclosure is not a fail-closed semantic repair.

**Remaining gate:** Owner must decide overall verdict requirement for absent/skipped board checks (also P1/TSV-05). All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### TSV-06

**Severity and historical review:** Info → Info; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Canary self-test never compares expect.verdict.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier TSV-06).

**Original location:** packages/verifier/src/canary.ts:85-90

**Original confidence/category:** yes (code read); verifier self-test

**Original spec references:** Not supplied.

**Original scenario:** A canary yielding the wrong verdict is not detected.

**Original evidence (verbatim):** Code read at SHA (HANDOFF 3.2.4, no severity given).

**Original known overlap:** TSV-06 (PR #6 HANDOFF)

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/packages/verifier && node --test test/b5-tsv06.test.ts
```

**Interim output excerpt (verbatim):** {"id":"aggregate-altered","kind":"canary","ok":true,"verdict":"FAIL",...} {"id":"ballot-replayed","kind":"canary","ok":true,"verdict":"PASS",...} overall ok true

**Interim refutation attempt (verbatim):** Read canary.ts:76-117. For canaries, ok = rejectedOk && exact && codesOk (canary.ts:85-90). Here rejectedOk means the verdict is not PASS or some named check failed. expect.verdict is declared in CorpusCase (canary.ts:10) but is never read. The shipped corpus (packages/verifier/canary/corpus.json) sets expect.verdict on every canary, with FAIL on most and PASS on ballot-replayed, spoil-wrong-plaintext and spoiled-also-cast, so the field carries information. QV-34 section 9.4 says the self-test compares results to expected-report.json, which contains a verdict. I edited the expectations so they contradict the actual verdicts, and runSelfTest still reported every case and the overall result as ok. Mitigation: the exact failed-check and code comparison still catches a verifier that accepts everything. What goes undetected is a verdict-composition bug, such as named checks failing while the verdict says PASS.

**Interim notes:** Self-test completeness gap. It is not exploitable on its own.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Observed rigged canary expected FAIL with actual PASS and matching failed checks accepted selftest; now compares expected verdict.

**Fix or partial-fix commit:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Affected source:** packages/verifier/src/canary.ts

**Regression evidence:** packages/verifier/test/b1-anchor.test.ts

**Remaining gate:** Independent external review remains required. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### PY-01

**Severity and historical review:** Info → Info; interim verdict confirmed. Consolidation disposition: `unsupported_owner_gate`.

**Original summary:** verifier-py has no trustee-mode spoils; manifests with spoil_trustee_decrypt are rejected.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier PY-01).

**Original location:** verifier-py/qv_verifier/manifest.py

**Original confidence/category:** yes; conformance

**Original spec references:** QV-35-REQ-012

**Original scenario:** Probe M12: manifest with spoil_trustee_decrypt rejected by Python, accepted by TS (allowed interim with named error).

**Original evidence (verbatim):** op_py.py M12.

**Original known overlap:** PY-01 (PR #6 HANDOFF)

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/verifier-py && python3 -m unittest tests.test_b5_py -v; node ts-cmp.ts (TS manifestSchema check)
```

**Interim output excerpt (verbatim):** PY-01 flag True -> E_SCHEMA manifest: unknown fields ['spoil_trustee_decrypt']
> PY-01 flag False -> E_SCHEMA manifest: unknown fields ['spoil_trustee_decrypt']
> TS schema flag true -> accepted
> TS schema flag false -> accepted

**Interim refutation attempt (verbatim):** QV-35-REQ-012 (docs/35-second-verifier.md:56) allows the interim of rejecting 'the manifest flag path ... with a named error', and verifier-py/README.md:72 documents trustee-mode spoils as not implemented, so rejection itself is permitted. The finding describes it correctly as an allowed interim. The gap is still real. The Python top-level manifest _obj call (verifier-py/qv_verifier/manifest.py:161-165) has no spoil_trustee_decrypt in its optional set, so any manifest carrying the flag, including spoil_trustee_decrypt:false, fails with the generic E_SCHEMA 'unknown fields'. There is no dedicated named error. The TS schema accepts the flag (packages/protocol/src/schema.ts:235), and TS verify.ts:582 checks it for trustee-mode tally spoils. Python also skips zero-digest spoils with only a note (election.py:469-470) and ignores non-reveal tally.spoiled entries (election.py:619). REQ-012 is marked 'Not met' and TODO N-14 awaits decision D-88. This is a documented open conformance item, not a refuted claim.

**Interim notes:** Fails closed: a manifest Python cannot handle is rejected. The divergence also covers spoil_trustee_decrypt:false, which TS accepts.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Still rejects spoil_trustee_decrypt manifest and lacks trustee spoil decryption.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** verifier-py/NOTES.md

**Regression evidence:** Unsupported capability remains explicit; no canary/adapter pretending support

**Remaining gate:** D-88 trustee-mode policy and complete independent implementation/review required. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### PY-02

**Severity and historical review:** Info → Info; interim verdict confirmed. Consolidation disposition: `unsupported_owner_gate`.

**Original summary:** verifier-py verdict is PASS/FAIL only.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier PY-02).

**Original location:** verifier-py/qv_verifier/election.py:203

**Original confidence/category:** yes; conformance

**Original spec references:** Not supplied.

**Original scenario:** No INCOMPLETE/other verdict states are reported.

**Original evidence (verbatim):** Code read at SHA.

**Original known overlap:** PY-02 (PR #6 HANDOFF)

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
cd <worktree>/verifier-py && python3 -m unittest tests.test_b5_py -v; node ts-cmp.ts notally.json
```

**Interim output excerpt (verbatim):** PY-02 no-tally -> FAIL ['E_SCHEMA'] fail
> TS no-tally verdict INCOMPLETE not_run

**Interim refutation attempt (verbatim):** verifier-py/qv_verifier/election.py:203 sets verdict = 'FAIL' if any fatal finding else 'PASS', and no other state exists. A bundle without a tally gets a fatal E_SCHEMA at election.py:509-511, so Python says FAIL. On the same bundle the TS verifier returns INCOMPLETE, per packages/protocol/NOTES.md X-11 and packages/verifier/NOTES.md:11,18. I checked whether any spec requires INCOMPLETE. None of docs/*.md (QV-16 C8, QV-34, QV-35) defines it; QV-16 C8 (docs/16-crypto-protocol.md:1146) only says to report PASS only if no F-class error occurred, and every expected-report.json verdict is PASS or FAIL. The claim is factually right and was reproduced. The divergence fails closed (FAIL rather than INCOMPLETE), and there is no spec obligation for INCOMPLETE, only implementation notes and the unmerged HANDOFF.

**Interim notes:** A cross-verifier verdict divergence. It is not a security defect. Could be rated None if the owner decides INCOMPLETE is not part of the conformance surface.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Python still reports only PASS/FAIL; no INCOMPLETE implementation added.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** verifier-py/NOTES.md

**Regression evidence:** Source read; unsupported capabilities explicit

**Remaining gate:** Define complete expected report semantics and implement INCOMPLETE independently. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### WV-9

**Severity and historical review:** Info → Info; interim verdict confirmed. Consolidation disposition: `open`.

**Original summary:** Test-vector corpus is unsigned.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier WV-9).

**Original location:** test-vectors/v1

**Original confidence/category:** yes; test vectors

**Original spec references:** Not supplied.

**Original scenario:** Corpus integrity relies on unsigned MANIFEST hashes.

**Original evidence (verbatim):** In-SHA docs/audit/web-verifier.md item re-checked.

**Original known overlap:** WV-9

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/verifier/test/b6-verify.test.ts (in worktree /home/user/audit/verify-quietvote/B1-b6, now removed)
```

**Interim output excerpt (verbatim):** truncated self-test: {"ok":true,"n":1,"full":24}; MANIFEST.json signature = "unsigned (release job signs)"; ok 1 - WV-9

**Interim refutation attempt (verbatim):** Checked whether any signature or expected-count check exists. test-vectors/MANIFEST.json has "signature": "unsigned (release job signs)", and the generator writes it that way on purpose (packages/protocol/test/vecgen/generate.ts:554-558). packages/verifier/src/canary.ts:22-25 loadCorpus only checks format and canaries.length > 0. The corpus is drift-checked against test-vectors by packages/verifier/test/verifier.test.ts:137-139, and the CLI vectors check (packages/cli/src/cmd-vectors.ts:196-205) checks SHA-256 hashes only. Neither check is a signature. QV-34 gate G3 ("MANIFEST signature valid") and N-38 ("QV-34 says the canary is signed each build") call for signing, so no accepted spec permits leaving it unsigned. Nothing at this SHA fixes it. Location note: the in-SHA WV-9 is about packages/verifier/canary/corpus.json, which is built from test-vectors/v1. The finding cites test-vectors/v1 and its MANIFEST. Both are unsigned, so the claim holds either way.

**Interim notes:** This gap was already known and is tracked (WV-9 open, N-38 P2 Open, T-211 Partial). The impact is small. Anyone who can edit the corpus can also edit the verifier code. The one silent effect is that a truncated corpus still passes the self-test.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Corpus remains unsigned; test-vector MANIFEST hashes are consistency checks, not publisher authenticity.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** packages/verifier/NOTES.md; verifier-py/NOTES.md

**Regression evidence:** Unmodified vector integrity sweep

**Remaining gate:** Independent signed release/corpus provenance required. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### N-13, N-24, N-25, N-27

**Severity and historical review:** Info → Info; interim verdict confirmed. Consolidation disposition: `open_owner_gates`.

**Original summary:** Tracked TODO gaps still present: V13 not run, no vendoring, no secret types/constant-time discipline beyond noble, no rule basis roll.

**Original report:** [docs/audit/2026-10-28/B1-quietvote-crypto-protocol.md](2026-10-28/B1-quietvote-crypto-protocol.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier N-13, N-24, N-25, N-27).

**Original location:** docs/plan/TODO.md

**Original confidence/category:** yes; tracked gaps

**Original spec references:** QV-ADR-024, QV-16-REQ-021

**Original scenario:** e.g. basis roll manifests unsupported (M15); V13 never runs.

**Original evidence (verbatim):** Code read / probes at SHA.

**Original known overlap:** N-13, N-24, N-25, N-27 (TODO)

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/verifier/test/b6-verify.test.ts plus grep for vendor/, VENDOR.lock and SecretScalar (worktree removed afterwards)
```

**Interim output excerpt (verbatim):** V13: {"status":"not_run",..."no verifier step exists for steward/operator control entries yet (QV-ADR-022; see NOTES.md)"}; basis roll: {"ok":false,"error":"E_SCHEMA","detail":"$.contests[0].rule.basis: not in enum"}; no vendor/ dir, no VENDOR.lock; no SecretScalar in packages/crypto/src or packages/protocol/src

**Interim refutation attempt (verbatim):** N-13: packages/verifier/src/verify.ts:248 always sets V13 to not_run, and the shipped tiny election shows it. No spec text says V13 may be skipped permanently. QV-ADR-022 is cited only as context. N-24: QV-ADR-024 (Accepted, provisional; docs/decision-log.md:308-312) requires @noble/* to be vendored under vendor/ with a VENDOR.lock. Neither exists. packages/crypto/package.json:17-18 pins the packages by version and lockfile only. N-25: grep finds no SecretScalar or zeroization code in packages/crypto/src or packages/protocol/src. TODO N-25 confirms scalars are plain bigint. N-27: QV-16 §5.19.3 (docs/16-crypto-protocol.md:774) and QV-20 (docs/20-voting-methods.md:55) both allow rule basis ∈ {yes+no, counted, roll}. The schema (packages/protocol/src/schema.ts:203) allows only 'yes+no' and 'counted', and rules.ts:22 has no roll branch. A manifest with basis roll therefore fails with E_SCHEMA. That is a QV-16 conformance gap, not permitted behaviour. Two caveats. TODO N-27 is marked 'Decision needed' and P2. QV-16 calls roll a 'conformance addition', so the owners may still settle it. None of the four items is fixed at this SHA, and none is in the Done scope. All four are still tracked as open gaps.

**Interim notes:** These four gaps were already known and are tracked as open TODO items. All four claims hold at this SHA. Wording: the finding says "no rule basis roll". TODO N-27 and X-18 call it the 'eligible' basis, and QV-20:55 renames 'eligible' to 'roll', so both refer to the same gap. The N-25 claim (no secret types or zeroization) was checked by grep only. Constant-time behaviour was not measured.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** V13 governance, noble vendoring, secret types/constant-time beyond noble, and roll-basis policy remain absent/unresolved.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** Owned NOTES documents

**Regression evidence:** Source read; existing named not_run/caveats

**Remaining gate:** Owner-approved governance and numeric/rules schemas, supply-chain and external cryptographic assurance work. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### B3-01

**Severity and historical review:** High → High; interim verdict confirmed. Consolidation disposition: `blocked`.

**Original summary:** The web registration request (PoP layout and hashed invite_code) is refused by the reference server, and no test could notice.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-01).

**Original location:** packages/web/src/flow/onboarding.ts:117-127, packages/web/src/ui/app.ts:382, packages/server/src/app.ts:520-521

**Original confidence/category:** CONFIRMED; interop / conformance

**Original spec references:** QV-04-REQ-005, QV-19 §6.1, QV-19-REQ-010, QV-09 §4

**Original scenario:** Voter opens /e/<id>#inv=<code> and creates a key; the page posts invite_code=b64u(SHA-256(token)) with PoP over (id, H(token), pk); the server answers 401 BAD_SIGNATURE (422 INVITE_EXPIRED if only PoP fixed); the voter sees a generic error and cannot register.

**Original evidence (verbatim):** PoC interop-server.poc.test.ts (test B3-F1): node --test --test-reporter=spec packages/web/audit-b3/interop-server.poc.test.ts -> (a) 401 BAD_SIGNATURE, (b) 422 INVITE_EXPIRED, (c) control with raw code accepted. FakeBoard.register only checks shape.

**Original suggested remediation:** Owner picks the contract (QV-19/QV-04 vs QV-09); change one side and add a cross-package test driving registrationBody against the server World.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/web/vb3/reg.test.ts (worktree /home/user/audit/verify-quietvote/B3-b1, since removed)
```

**Interim output excerpt (verbatim):** web body -> 401 BAD_SIGNATURE; server pop + hashed code -> 422 INVITE_EXPIRED; control (raw code + server PoP) -> 201

**Interim refutation attempt (verbatim):** Read the server handler (packages/server/src/app.ts:503-538). The PoP message is 'QV-REG-v1\0'+id+'\0'+pk (line 520). The invite lookup is sha256('QV-INVITE-v1\0'+invite_code) (line 521). Invites are issued as b64u(16 random bytes) and stored under that hash (lines 464-468). Web side: registrationBody (packages/web/src/flow/onboarding.ts:117-127) signs over id\0 SHA-256(token) pk and sends inviteHash(token)=b64u(SHA-256(token)) (packages/web/src/flow/invite.ts:54-56). keyView.finish calls it (packages/web/src/ui/app.ts:382). No preimage path lets the hashed value match the stored code hash. I found no adapter, errata or ADR that reconciles the two. HEAD (PR #19) made FakeBoard answer every well-formed registration with 403 REGISTRATION_CLOSED (test/helpers/fake-board.ts). Neither unit nor e2e tests can see the mismatch. The owner-approved PR #19 changed test infrastructure only; it does not accept this incompatibility. The two specs conflict, but the implemented client and the reference server still cannot interoperate under either contract. So this is a defect, not permitted behaviour.

**Interim notes:** Availability and interop break of the primary web onboarding path; it fails closed, with no integrity or confidentiality impact. Every web registration against @quietvote/server fails, and the 401/422 is shown as a generic error. Which contract is correct is an owner decision (QV-19/QV-04 vs QV-09).

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Audited QV-19/QV-04 registration bytes still conflict with the QV-09 reference server. Owner explicitly requires protocol review before either wire contract changes.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/flow/onboarding.ts']

**Regression evidence:** Original B3-01 server PoC; server team retains a cross-package contract regression.

**Cross-package evidence:** Actual web registrationBody is sent to real server:401 BAD_SIGNATURE. Raw-token server-contract registrations then succeed before roll_commit; after commitment registration is403. Tests: consolidation.test.ts explicitly names unresolved actual-client mismatch. No server acceptance broadening. Remaining: Owner explicitly left registration blocked for protocol review. QV-09 raw invite/PoP(election_id,pk) conflicts with QV-19 hash-before-send/invite-bound PoP and QV-04 group+invite+pk+label. Exact bytes/hash/storage framing and label treatment require reviewed contract choice.

**Evidence scope / unresolved boundary:** Explicit owner blocker: no registration wire/PoP/invite semantics change is authorized without protocol review. Passing refusal tests do not repair the web/server contract.

**Remaining gate:** Protocol owner must choose and document invite/PoP semantics; no web wire change made. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-02

**Severity and historical review:** High → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** The Results page shows a coordinator-signed tally without verifying it, though the protocol verifier FAILs the same log.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-02).

**Original location:** packages/web/src/flow/election.ts:134-149, packages/web/src/ui/app.ts:576-604

**Original confidence/category:** CONFIRMED; conformance / integrity

**Original spec references:** QV-16 §5.19.1, QV-10 §6.2 V10, QV-10 §1(1), QV-10-REQ-013

**Original scenario:** A holder of a manifest coordinator key posts a correctly signed tally with forged counts/outcome; the SPA derives phase=tallied and shows the forged winner with no verification status.

**Original evidence (verbatim):** PoC unit.poc.test.ts (B3-F7): verifyElection verdict FAIL (E_DLOG_RANGE) while SPA shows winners [cy]; ui-observer.poc.ts (B3-F7b) shows no verified/disclaimer text.

**Original known overlap:** W5 (related, fixed; residual)

**Original suggested remediation:** Run the shared protocol verifier in resultsView before drawing numbers, render itemized checks, show E-VER-FAIL on failure.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test packages/web/vb3/tally.test.ts
```

**Interim output excerpt (verbatim):** phase tallied budget outcome {"kind":"passed"} yes T 3 | verifier FAIL E_DLOG_RANGE,E_DLOG_RANGE

**Interim refutation attempt (verbatim):** Checked deriveElectionContext (packages/web/src/flow/election.ts:134-149). It accepts the first tally whose ctx matches and that carries a valid signature by any manifest coordinator key. It runs no proof or recount check. resultsView (packages/web/src/ui/app.ts:576-604) renders ctx.tally counts and winners directly. The only caveat is a collapsed <details> 'How do I know this is correct?' whose body says not to rely on this page alone, plus a link to /verify. QV-16 §5.19.1 (docs/16-crypto-protocol.md:750) says the tally record 'is verified, not trusted'. QV-10 V10 (docs/10-user-experience.md:270) describes in-page itemized verification. Nothing permits showing an unverified tally as results. Mitigations: the copy never says 'Verified', so QV-10 §1(1) is not literally breached. The attack needs a coordinator signing key (sim m=1). Any bundle verification still detects the forgery.

**Interim notes:** Rated Medium rather than High. It needs a coordinator-key holder (an insider or a compromise). The forged tally stays publicly detectable by the standalone verifier, the CLI and /verify. The page carries a 'do not rely on this page alone' note, and in-page verification is tracked as Partial rather than claimed done. It is still a real gap against QV-16 'verified, not trusted' and QV-10 V10: observers see forged winners with no failure indication.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** A genuine completed simulated election verifies; coordinator-resigned false tally counts fail the shared verifier and never render a results table. A later conflicting signed tally arriving through SSE during a held lazy-chart response is reverified before any result table renders.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f58533b](https://github.com/djshellshoxxx/quietvote/commit/f58533b13c87f06af50f8d104c5a28b77bb8c270)

**Affected source:** ['packages/web/src/flow/verification.ts', 'packages/web/src/ui/app.ts', 'packages/web/test/verification.test.ts', 'packages/web/e2e/verifier.ts']

**Regression evidence:** verification.test.ts positive/forged/wrong-roll checks; verifier.ts production honest/forged result journeys. Final-review production regression holds chart HTTP, delivers a real SSE log reread, and requires the appended conflicting tally to fail closed.

**Remaining gate:** In-page verification checks the supplied snapshot. Board/witness/receipt evidence remains explicitly not run; independent release/client verification remains necessary. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-03

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** verifier.html does not run when served with the build's own _headers or the reference server's static CSP, because the header CSP blocks its hashed inline script/style.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-03).

**Original location:** packages/web/src/build/site.ts:35-46, packages/web/src/build/site.ts:84-107, packages/web/src/build/site.ts:148, packages/server/src/http.ts:106, packages/server/src/http.ts:277

**Original confidence/category:** CONFIRMED; supply-chain / availability

**Original spec references:** QV-19 §7, QV-19 §8.1, QV-19-REQ-016, QV-19-REQ-018

**Original scenario:** Operator deploys dist/ with _headers or behind @quietvote/server; a user opens /verifier.html, selects a bundle, presses Run checks, and nothing happens.

**Original evidence (verbatim):** node packages/web/audit-b3/verifier-headers.poc.ts (no output after 60 s, CSP violations), verifier-server.poc.ts, node --test server-static.poc.test.ts (CSP script-src 'self'). e2e never loads verifier.html.

**Original known overlap:** WV-10 (related, not covering this break)

**Original suggested remediation:** Emit a verifier.html-specific header block matching its meta CSP, per-file CSP in the reference server, and a Chromium test loading verifier.html under generated headers.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
SCRATCH=<scratchpad> node packages/web/vb3/browser.ts (Playwright + /opt/pw-browsers/chromium)
```

**Interim output excerpt (verbatim):** verifier.html mode=none: #out="A check failed0 of 14 checks passed..." cspErrors=0; mode=headers (csp().header from _headers): #out="" cspErrors=2 'Applying inline style violates ... style-src'; mode=server (STATIC_CSP): #out="" cspErrors=2

**Interim refutation attempt (verbatim):** headersFile (packages/web/src/build/site.ts:35-46) emits one '/*' block with script-src 'self' and style-src 'self', and buildSite writes it next to verifier.html (site.ts:146-148). verifierHtml (site.ts:84-107) relies on hash-allowed inline <script> and <style> through a meta CSP. When a header CSP and a meta CSP both apply, both are enforced, so the header blocks the inline script. The reference server attaches STATIC_CSP (packages/server/src/http.ts:106) to every static response (http.ts:277). Possible refutation: QV-19 §8.1 (docs/19-client-supply-chain.md:147) literally says those headers apply to 'all HTML/JS responses'. So the spec is internally inconsistent with §7 (:137, inline script, 'usable from file:// or any static host') and REQ-016. Neither section explicitly permits shipping a verifier page that cannot run on the build's own host config. The page still works from file:// and from a host that sends no CSP header, and the SPA /verify route and the CLI remain available.

**Interim notes:** Reproduced in Chromium: under either header CSP, choosing a bundle and pressing Run checks produces no output. It fails silently and never shows a false PASS. Rated Low rather than Medium because this is availability only and alternatives exist (file://, the SPA /verify route, the CLI). The root cause is partly the spec tension between QV-19 §8.1 and §7.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Original wildcard app CSP blocked offline inline bytes. The generated wildcard now permits only their exact hashes, the offline meta policy forbids network, and the exact offline route policy also works when all matches apply. Server validates/recomputes exact hashes before serving its exception.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f2fc966](https://github.com/djshellshoxxx/quietvote/commit/f2fc966db01cd6e4dc1f5104d67a769240d35ee2)

**Affected source:** ['packages/web/src/build/site.ts', 'packages/web/e2e/verifier.ts', 'packages/server/src/static.ts', 'packages/server/src/http.ts']

**Regression evidence:** verifier.ts loads and verifies under both matching generated headers and the actual reference server.

**Cross-package evidence:** Actual verifierHtml build served through reference HTTP server yields exact script/style hash policy, connect-src none, frame-ancestors none, security headers and same policy on304. Tests: consolidation.test.ts B3-03; web agent owns browser execution proof. Remaining: Only recognizes exact offline meta policy and recomputes sole inline script/style hashes; no arbitrary policy passthrough. Other pages retain app STATIC_CSP; app-wide header gaps remain separate.

**Remaining gate:** Static hosts must serve the generated policies accurately; no unsafe-inline/eval is enabled. App effective meta/header intersection remains strict. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-04

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `partial`.

**Original summary:** SRI covers only the entry module and CSS; statically imported chunks execute without integrity, so claims C-12 and T-189 "SRI yes" are overstated.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-04).

**Original location:** packages/web/src/build/site.ts:59-82, packages/web/src/build/site.ts:131-137

**Original confidence/category:** CONFIRMED; supply-chain / conformance (status inflation: C-12, T-189 "SRI yes")

**Original spec references:** QV-19 §8.1, QV-19-REQ-020

**Original scenario:** CDN/object-store tamper of assets/chunk-RFRBNNRD.js: entry hash still matches and the modified chunk runs with page privileges (passphrase, signer, choices).

**Original evidence (verbatim):** ui-observer.poc.ts step B3-F24: tampered static chunk executed true; sri-preload.poc.ts shows modulepreload+integrity blocks it. build.test.ts:12 cannot see chunks.

**Original known overlap:** W15 (not fixed at this SHA), WV-10

**Original suggested remediation:** Emit <link rel=modulepreload integrity crossorigin> for every statically imported chunk and extend the HTML test to require integrity for every imported module.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
SCRATCH=<scratchpad> node packages/web/vb3/browser.ts (tamper step)
```

**Interim output excerpt (verbatim):** entry app.7fbf58ec18ff.js static imports: [ 'chunk-RFRBNNRD.js', 'chunk-RWNAQACR.js' ]; chunk-RFRBNNRD.js has integrity in index.html: false; chunk-RWNAQACR.js ... false; tampered static chunk executed: 1 sriErrors 0 | app rendered: Skip to main content...

**Interim refutation attempt (verbatim):** htmlPage (packages/web/src/build/site.ts:59-82) emits integrity only for the CSS and the entry module (stylesheet, modulepreload and script). Chunks are emitted at site.ts:131-137 with no HTML reference. The built entry begins with import{...}from"./chunk-RFRBNNRD.js";import{...}from"./chunk-RWNAQACR.js". Both chunks execute at load in page context, before the entry body. I prepended code to chunk-RFRBNNRD.js: it executed, Chromium raised no integrity error, and the app rendered. QV-19-REQ-020 (docs/19-client-supply-chain.md:292, Must) requires every script/module asset to be referenced with SRI. Mitigating argument (NOTES.md:98): whoever can alter a chunk on the same host can usually alter index.html. That does not hold for a separately cached or stored /assets/* path, and _headers gives /assets/* its own immutable cache rule. T-189 'SRI yes' (docs/plan/TODO.md:292) and C-12 overstate coverage. The entry's SRI does not transitively protect its static imports.

**Interim notes:** Reproduced. The static chunks are small (727 B and 1761 B), but they run first in page context, so a tampered chunk can patch globals: fetch, crypto, DOM. Rated Low to match the project's own W15 rating for the same threat class (asset-path-only tamper, same origin). It is fixable with modulepreload+integrity for static chunks. The status-inflation part (T-189 'SRI yes', C-12) is accurate.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Transitive static application modules now have integrity-pinned modulepreloads; tampering a shared chunk is blocked in Chromium without executing the marker.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/build/site.ts', 'packages/web/test/build.test.ts', 'packages/web/e2e/verifier.ts']

**Regression evidence:** Build traverses esbuild import-statement graph; build.test.ts checks integrity contents; verifier.ts static-chunk tamper negative control.

**Remaining gate:** Lazy chart/catalog modules and module worker still lack SRI. No full subresource-integrity or cross-browser support claim; unoffered locales remain unpreloaded. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-05

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** A revote built from the cached log is rejected with E_SUPERSEDES and the screen tells the voter a newer ballot is recorded, the opposite of what happened.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-05).

**Original location:** packages/web/src/ui/app.ts:231-251, packages/web/src/ui/app.ts:440-445, packages/web/src/ui/app.ts:502-506, packages/web/src/api/errors.ts:42

**Original confidence/category:** CONFIRMED; bug

**Original spec references:** QV-10 §8.1 E-VOT-SUPERSEDED-LOST, QV-10 §7.1 g4

**Original scenario:** max_per_voter>1, SSE down; voter casts A, goes Receipt->Vote, casts B with stale supersedes; B refused, A stays counted, screen says 'Replaced by a newer ballot'.

**Original evidence (verbatim):** interop-server.poc.test.ts: ballot B (stale cache) -> SUPERSEDED, voter ballots in log 1; live-refresh.poc.test.ts shows SSE refresh after 337 ms. FakeBoard does not enforce supersedes.

**Original known overlap:** W3 (related, fixed; different path)

**Original suggested remediation:** Re-read the log tail on entering Vote/before sealing, append own recorded entry on ACCEPTED_RECORDED, on E_SUPERSEDES refresh and offer to seal again.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test --test-reporter=spec packages/web/test/verify-b3b2.poc.ts (worktree /home/user/audit/verify-quietvote/B3-b2, real @quietvote/server via server/test/helpers/world.ts)
```

**Interim output excerpt (verbatim):** B -> SUPERSEDED E-VOT-SUPERSEDED-LOST | heading: Replaced by a newer ballot | err: A newer ballot from you is already recorded
> (log: 1 ballot from this voter; control revote from fresh log -> ACCEPTED_RECORDED)
> ✔ V-B3-05 revote from the page-cached log

**Interim refutation attempt (verbatim):** I looked for anything that updates L.records after a cast: the controller (no), voteView (no), receipt view (it reads L.records but does not refresh it). Only the SSE LiveElection refreshes it. NOTES.md:90 says only the receipt and results views are repainted, and it does not mention this revote path. I checked W3: it covers NEW_SEAL after a failed cast, not a new controller built from cached records. The server's E_SUPERSEDES check is required by the protocol, so the rejection itself is correct. The defect is the stale client value plus the inverted message. A working SSE stream usually refreshes within the 100 ms debounce, which narrows the window but does not remove it (SSE failed, or a quick Receipt->Vote navigation). No accepted spec permits telling the voter that a newer ballot is recorded when their newer ballot was refused.

**Interim notes:** The page loads an election once, and load() returns the cached Loaded (packages/web/src/ui/app.ts:231-233). Nothing appends the voter's own accepted entry to L.records after ACCEPTED_RECORDED (packages/web/src/flow/ballot-controller.ts:143-157). voteView recomputes supersedes from L.records (app.ts:444-445). Only LiveElection.readOnce (packages/web/src/flow/live.ts:138-153) refreshes records, so with SSE down/failed or navigating faster than the refresh, the revote carries a stale supersedes value. The server rejects it with ENTRY_INVALID / E_SUPERSEDES (packages/server/src/election.ts:1016-1017). errors.ts:42 maps that to E-VOT-SUPERSEDED-LOST and the controller maps it to outcome SUPERSEDED (ballot-controller.ts:164). The screen then shows 'Replaced by a newer ballot' (app.ts:502) and 'A newer ballot from you is already recorded / The older ballot was not counted'. In fact the newer choice (B) was refused and the older one (A) stands. QV-10 §8.1 defines E-VOT-SUPERSEDED-LOST only for the race in which an older ballot arrives after a newer one, so this case does not match it.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** The cached-log Receipt-to-Vote journey is reproduced with /events unavailable. Vote entry now rereads and derives the signed log; a second cast links to the first and is recorded. Rejected stale links no longer claim a newer ballot was recorded.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/api/errors.ts', 'packages/web/src/i18n/en.ts', 'packages/web/src/flow/ballot-controller.ts', 'packages/web/e2e/run.ts']

**Regression evidence:** Production run.ts no-SSE revote checks two distinct ballot codes and correct supersedes; audit3.test.ts concurrent submission regression.

**Remaining gate:** Concurrent voting on another device can still cause a final explicit refusal; the corrected message asks to reload/check the latest receipt. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-06

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `partial`.

**Original summary:** Late/paused/refused ballot screens fall back to 'Something went wrong' (missing message args), show receipt-proof text for unrecorded ballots, report PAUSED as closed, and the vote form is not phase-gated.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-06).

**Original location:** packages/web/src/ui/app.ts:138-148, packages/web/src/ui/app.ts:500-509, packages/web/src/api/errors.ts:40

**Original confidence/category:** CONFIRMED; bug / conformance

**Original spec references:** QV-10 §8.1, QV-10 §8.2, QV-10-REQ-006, QV-13-REQ-094

**Original scenario:** Steward pauses the election; voter seals and sends; server 409 WRONG_PHASE 'PAUSED' is classified as E-VOT-CLOSED, rendered as generic error alongside 'This receipt proves your ballot was received and recorded'.

**Original evidence (verbatim):** unit.poc.test.ts (B3-F9) missing argument errors; interop-server.poc.test.ts (B3-F4, B3-F4b) PAUSED -> AFTER_CLOSE E-VOT-CLOSED; ui-voter.poc.ts (B3-F21) closed election screen text.

**Original suggested remediation:** Pass message arguments from manifest times; choose receipt paragraph by outcome; classify WRONG_PHASE from manifest times/machine reason; gate vote view on phase.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test --test-reporter=spec packages/web/test/verify-b3b2.poc.ts (V-B3-06), plus code-reading of packages/web/src/ui/app.ts:138-148, 500-509
```

**Interim output excerpt (verbatim):** PAUSED -> AFTER_CLOSE E-VOT-CLOSED
> fallback: Something went wrong / Your ballot has not been sent unless you saw a receipt.
> ✔ V-B3-06 (t('qv.err.E-VOT-CLOSED.body', {}) and t('qv.err.E-VOT-NOTOPEN.title', {}) both throw /missing message argument/)

**Interim refutation attempt (verbatim):** I checked every errorBox call site (app.ts:266,334,376,387,506,509,529,...). None of the voter cast paths pass time arguments. I checked whether the receipt paragraph is conditional on outcome: it is not (app.ts:505). Pause is an accepted lifecycle state (lifecycle.ts:18-19, ADR-022), so classifying it as 'closed' is wrong copy, not permitted behaviour. NOTES.md:90 does cover the lack of phase gating on the vote form, which weakens that one sub-claim but not the rest.

**Interim notes:** (1) errorBox is called with no arguments at app.ts:506 and app.ts:509. qv.err.E-VOT-CLOSED.body needs {time} and qv.err.E-VOT-NOTOPEN.title needs {time}. icu.ts:186 throws on a missing argument, and the catch at app.ts:143-144 then renders 'Something went wrong / Your ballot has not been sent unless you saw a receipt.' (2) app.ts:505 renders qv.receipt.proves ('This receipt proves your ballot was received and recorded in the public log...') for every outcome in the 'cast' state, including AFTER_CLOSE, REJECTED, SUPERSEDED and PENDING_UNCONFIRMED. This contradicts QV-10 §8.2 / REQ-006. (3) The server's pause refusal reads 'ballots are not accepted while the election is PAUSED' (election.ts:1003). That text matches neither regex in errors.ts:40, so it falls through to E-VOT-CLOSED, and the controller turns every WRONG_PHASE into AFTER_CLOSE (ballot-controller.ts:164). The heading is therefore 'Voting had closed' even though the election can resume (lifecycle.ts:19). (4) The sub-claim that the vote form is not phase-gated is accurate (voteView has no phase check), but packages/web/NOTES.md:90 discloses it as a design choice that relies on WRONG_PHASE at cast time. On its own I treat this part as weak; the confirmed defects are (1)-(3).

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Known open/ready/closed phases gate ballot entry; close/not-open errors receive their real signed-manifest time, refusals omit receipt-proof claims, unknown delivery uses pending copy, unknown WRONG_PHASE no longer says closed.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/api/errors.ts', 'packages/web/src/flow/ballot-controller.ts']

**Regression evidence:** audit2.test.ts unknown-delivery regressions; flow.test.ts refusal/retry checks; production run.ts known-open journey.

**Remaining gate:** PAUSED is not added to signed-log phase derivation without an authoritative control/freshness policy. A dedicated PAUSED reason/copy remains a protocol/UX decision; API error argument handling outside this bounded ballot path is not fully closed. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-07

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** The 'Test this ballot' result never shows what the device sealed yet asks 'Do these match what you picked?'.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-07).

**Original location:** packages/web/src/ui/app.ts:492-499

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-10-REQ-008, QV-10 §6.2 V8, QV-19 §6.2, QV-13 C-BENALOH

**Original scenario:** Voter spoils a ballot to audit it; screen shows automatic checks and the match question but no contest->selection table, randomness, or qv-audit link/QR, so the human comparison cannot be made.

**Original evidence (verbatim):** ui-voter.poc.ts (B3-F12): tables on the screen 0; no selection text.

**Original suggested remediation:** Render the V8 table from ctl.lastAudit, keep the radio group, add the second-device link.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node packages/web/e2e/verify-b3b2.ts (repo e2e harness: FakeBoard + built site + Chromium at /opt/pw-browsers/chromium)
```

**Interim output excerpt (verbatim):** AUDITED SCREEN {"matchQuestion":1,"tables":0,"selectionLabelShown":false,"links":0}

**Interim refutation attempt (verbatim):** I looked for any rendering of lastAudit selections or the link elsewhere in app.ts and found none. I checked whether the spec allows omitting the table: V8 and C-BENALOH both require it. I checked whether the gap is disclosed: NOTES.md N-36 says 'no QR codes', and TODO T-181 is Open. Neither covers asking the match question with nothing shown. The selection label 'YES' was selected but does not appear in the audited screen text.

**Interim notes:** The audited branch at packages/web/src/ui/app.ts:492-499 renders: the automatic checks list, 'same software' text, posted/not posted, the 'Do these match what you picked?' radio group, the ok/mismatch line, a Download button, second-device help text, and 'Seal a new ballot'. It renders nothing from the sealed selections: no contest->selection table, no randomness, and no link or QR (ctl.lastAudit.link exists but is not shown). QV-10 §V8 (docs/10-user-experience.md:266) and QV-13 C-BENALOH (docs/13-accessibility-localization.md:89) require a contest -> 'what your device sealed' result table that the voter confirms by eye. QV-10-REQ-008 is an M requirement. The automated 'plaintext' check compares against selections supplied by the same software, so the human comparison is the defence the spec relies on. Mitigation: the downloaded qv-audit.json carries the package for a second device. Note that docs/plan/TODO.md:284 lists T-181 'Benaloh audit UX' as Open, so this is not a status-inflation claim; it is a conformance gap in UI that is shipped and reachable.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** The audit result now shows contest labels and opened selections before asking whether they match.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/e2e/run.ts']

**Regression evidence:** Production run.ts opens the tested ballot and checks the YES/P plaintext table before the match question.

**Remaining gate:** The same-software limitation remains visible; manual assistive-technology review is still outstanding. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-08

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** 'Clear this device' deletes the only copy of the key in one click with no confirmation.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-08).

**Original location:** packages/web/src/ui/app.ts:97-107, packages/web/src/ui/app.ts:435, packages/web/src/ui/app.ts:508

**Original confidence/category:** CONFIRMED; bug / usability

**Original spec references:** QV-13 C-DIALOG, QV-10-REQ-011

**Original scenario:** Voter who never exported the key taps the button on the key or receipt page; wrapped key is wiped; after freeze there is no recovery.

**Original evidence (verbatim):** ui-voter.poc.ts (B3-F13): IndexedDB keys 1 -> 0; browser dialogs 0; in-page dialog elements 0.

**Original suggested remediation:** Native <dialog> confirmation using existing qv.key.forgetConfirm/forgetBody strings.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node packages/web/e2e/verify-b3b2.ts
```

**Interim output excerpt (verbatim):** CLEAR {"keysBefore":1,"keysAfter":0,"browserDialogs":0,"dialogEls":0}

**Interim refutation attempt (verbatim):** I checked for a confirm step in clearDevice and at both call sites and found none. I checked whether QV-10-REQ-011 alone permits a one-click clear: it requires the action to exist, and C-DIALOG separately requires a confirmation for 'clear device'. The unused forgetConfirm/forgetBody strings show the confirmation was intended. In this flow the key was imported from a file, so it is recoverable here, but a freshly created key that was never downloaded would be lost.

**Interim notes:** Both buttons call clearDevice() directly: the receipt screen at packages/web/src/ui/app.ts:508 and the key page at app.ts:435. clearDevice (app.ts:97-107) calls env.storage.clearAll() with no confirmation. The catalog already has the dialog strings qv.key.forgetConfirm and qv.key.forgetBody (packages/web/src/i18n/en.ts:152-153, 'Dialog confirm button.' / 'Dialog body.'), but nothing uses them. QV-13 C-DIALOG (docs/13-accessibility-localization.md:100) lists 'clear device' among the confirmations that need a native <dialog>. In the browser, one click took the wrapped-key store from 1 to 0 with no browser or in-page dialog. Recovery then depends on an exported key file or recovery code. Otherwise the voter faces E-KEY-LOST and needs an organizer replacement (QV-04), which is not possible after the roll commit without organizer action.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Clear actions open a native confirmation dialog; Cancel preserves the key; confirm clears stored key/receipts and reroutes to remove visible secrets. Storage errors are not reported as success.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/e2e/run.ts']

**Regression evidence:** Production run.ts Cancel/retained-unlock and confirmed-erasure journeys.

**Remaining gate:** No claim of forensic storage erasure; the documented browser/device residuals still apply. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-09

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `partial`.

**Original summary:** Key backup is offered only once at creation and the displayed recovery code cannot be imported (restoreFromRecovery has no caller).

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-09).

**Original location:** packages/web/src/ui/app.ts:378-396, packages/web/src/ui/app.ts:429, packages/web/src/flow/onboarding.ts:69

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-10-REQ-021, QV-19-REQ-008, QV-04-REQ-006

**Original scenario:** Registration fails or voter leaves before downloading; key page never offers export again; eviction or clear loses the key. A written recovery code has nowhere to be entered.

**Original evidence (verbatim):** ui-voter.poc.ts (B3-F15): backup buttons after failure 0, after reload+unlock 0; grep restoreFromRecovery only definition.

**Original suggested remediation:** Offer download/show recovery code on the unlocked key page, add recovery import form, add QV-04-REQ-006 restore check/waiver.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node packages/web/verify-b3/ui.vpoc.ts (Playwright with /opt/pw-browsers/chromium, real production build, FakeBoard), in worktree /home/user/audit/verify-quietvote/B3-b3 at 424110d; plus grep -rn restoreFromRecovery packages/web/src
```

**Interim output excerpt (verbatim):** "B3-09 after failed registration: download buttons": 0, "recovery buttons": 0, "B3-09 after unlock: download buttons": 0, "recovery buttons": 0, "B3-09 recovery import UI anywhere on key page": 0; grep: restoreFromRecovery only at src/flow/onboarding.ts:69

**Interim refutation attempt (verbatim):** I looked for another export or restore entry point: the key page, the vote view and the receipt view, plus grep over src for restoreFromRecovery, recoveryImport and download(. None exists. I checked whether a spec, decision or owner note waives backup. TODO marks T-178/T-179 Partial and NOTES.md says nothing about backup. PR #19's owner-approved journey covers importing a key without an invite, not backup. Nothing permits the gap. The successful-create path does offer export, so the claim is limited to the failure and revisit paths and to recovery import, and those are accurate.

**Interim notes:** The backup buttons appear only inside finish() when `created` is passed (app.ts:393-394). That happens only on the create path (app.ts:429), and only if registration does not fail: app.ts:385-388 returns before line 393 for any non-409 error. The unlock path (app.ts:403) and the import path (app.ts:420) call finish() without `created`, so a returning voter never sees export again, even though the container is in IndexedDB. The recovery code is displayed with the text 'Write this code on paper...' (en.ts:133), but restoreFromRecovery (onboarding.ts:69) has no caller in src. The strings qv.key.recoveryImport and qv.key.recoveryBad (en.ts:149-150) are never rendered. No QV-04-REQ-006 restore check or waiver exists. The successful-create path does offer export, which partly meets QV-10-REQ-021. The finding is about the failed-registration path, the later visits and recovery-code import.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Saved key backup/recovery actions are available after later unlock and are rendered before registration, so registration failure does not hide the backup. Recovery restore is now wired.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/flow/onboarding.ts', 'packages/web/e2e/run.ts']

**Regression evidence:** Existing key recovery checksum/roundtrip unit tests; production run.ts later unlock/clear lifecycle. Browser backup download/recovery restore journey is not yet run.

**Evidence scope / unresolved boundary:** Browser backup download → recovery reveal/hide → recovery restore with a new passphrase was not executed. Current app12 proves import, later unlock and clear lifecycle only. Mandatory restore/enrolment gate remains absent.

**Remaining gate:** Mandatory backup restore-check/enrolment gate is still absent. Native review and backup-waiver semantics need separate review; no assertion that QV-04-REQ-006 is complete. Production backup/recovery restore journey still needs browser coverage. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-10

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** 'Your key is registered.' is shown with no invitation and for HTTP 409 INVITE_USED.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-10).

**Original location:** packages/web/src/ui/app.ts:380-395

**Original confidence/category:** CONFIRMED; bug

**Original spec references:** QV-10 §1(1), QV-09 §4

**Original scenario:** (a) link without #inv: no POST yet success text; (b) forwarded invite already consumed by another key: server 409 INVITE_USED reported as success.

**Original evidence (verbatim):** ui-voter.poc.ts (B3-F14): POST /registrations sent 0, success shown; interop-server.poc.test.ts (B3-F31): key 2 -> 409 INVITE_USED treated as success.

**Original known overlap:** W6 (marked fixed, incomplete)

**Original suggested remediation:** Treat 409 as success only when server confirms same key; error on INVITE_USED; neutral text when no registration attempted.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node packages/web/verify-b3/ui.vpoc.ts; registration POSTs counted at the test server; 409 answered with a problem body {code:'INVITE_USED'}
```

**Interim output excerpt (verbatim):** "B3-10a registered text without invite, POSTs": 0, "B3-10b 409 INVITE_USED shown as registered; POSTs": 1, "B3-10b alerts": 0

**Interim refutation attempt (verbatim):** I checked QV-09 for whether 409 legitimately means 'already registered'. Same-pk replay is specified as 201, and 409 INVITE_USED is specified for a different pk, so treating all 409s as success is not permitted. I checked whether the owner-approved PR #19 journey (importing a key without an invite) makes the success text intended. It covers an already-on-roll imported key, not a newly created key, so sub-case (a) still stands for creation. The real-server PoP mismatch limits reachability today but does not refute the client logic.

**Interim notes:** (a) With no #inv token, finish() skips registration (app.ts:380) and always prints qv.key.registered, 'Your key is registered. The organizer will add it to the voter list.' (app.ts:393, en.ts:143). It does this next to the noInvite hint (app.ts:434). For a key that was imported and is already on the roll (the owner-approved PR #19 e2e journey), the text is defensible. For a freshly created key it is false. (b) app.ts:385 checks e.status === 409 only and never e.code. Per QV-09 (docs/09:146, 262, 598), the same pk replay returns 201 and a different pk returns 409 INVITE_USED, so the client reports a consumed or hijacked invite as success. The real server (server/src/app.ts:526-528) returns 409 INVITE_USED for this case. Caveat: at this SHA, the web PoP layout differs from the server's (onboarding.ts:125 vs server app.ts:520), so the real server returns 401 BAD_SIGNATURE before reaching the invite check. Path (b) is reachable against the QV-09 contract and becomes live once that interop issue is fixed. Server 409 STATE_CONFLICT ('this key is already registered', app.ts:530) is the only 409 that means already registered.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** No-invite completion checks the signed roll commitment and says on-list/not-yet-on-list. Only a valid registration success response says registered; HTTP 409 is no longer blanket success.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/e2e/run.ts', 'packages/web/test/audit2.test.ts']

**Regression evidence:** Production run.ts no-invite on-roll import and invite-refusal journey; audit2 rejects historical blanket409 source wiring.

**Remaining gate:** Successful web registration remains blocked by B3-01. No unsupported duplicate-invite success semantics are invented. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-11

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `partial`.

**Original summary:** Auto-lock is announced only in a live region, leaves Seal/Send offered (sealing with a zeroed hedge key, send failing generically), the hidden>2min rule cannot fire if timers are suspended, and there is no pre-lock warning.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-11).

**Original location:** packages/web/src/ui/app.ts:79-93, packages/web/src/key/lock.ts:19-29, packages/web/src/key/signer.ts:56-61, packages/web/src/flow/ballot-controller.ts:231-235

**Original confidence/category:** CONFIRMED; bug / conformance

**Original spec references:** QV-19 §5.3, QV-13-REQ-007, QV-10 §8.1 E-KEY-LOCKED

**Original scenario:** Voter idles 10 min on review; lock fires silently; seal succeeds with zero nonceKey; Send shows 'Something went wrong', 0 POSTs. A tab hidden 5 min with suspended timers returns unlocked.

**Original evidence (verbatim):** autolock.poc.ts (fake clock +11 min), hidden-lock.poc.ts (+5 min hidden, not locked), unit.poc.test.ts (nonceKey all zero, sealed, cast PENDING_UNCONFIRMED E-GEN-UNKNOWN).

**Original known overlap:** W4 (marked fixed; controller part holds)

**Original suggested remediation:** Evaluate shouldLock before clearing hiddenSince; redraw to locked screen after lock; seal() refuses locked signer; wire warningMsRemaining.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test test/verify-b3-11.vtest.ts (node, FakeBoard + inlineSealer) and node verify-b3/ui.vpoc.ts (browser; Date.now shifted +11 min, real 15 s interval)
```

**Interim output excerpt (verbatim):** node: ok 1 - setHidden(false) then shouldLock never applies hidden rule; ok 2 - state unchanged after lock, sealed with all-zero nonceKey, failed E-GEN-UNKNOWN, outcome PENDING_UNCONFIRMED, posts 0. Browser: "live region": "Your key is locked.", visible locked text in main: 0, Seal button still offered: 1, after Send generic error; POSTs: 0, E-KEY-LOCKED text: 0

**Interim refutation attempt (verbatim):** I checked whether the lock is drawn elsewhere: lockAll only calls ballotLock, which redraws only if the state changed. I checked whether seal() refuses a locked signer: it does not, because it reads signer.nonceKey only. I checked whether cast maps a locked-signer error to E-KEY-LOCKED: uxCodeFor gives E-GEN-UNKNOWN for a non-ApiError. I checked for a decision accepting a 10-minute lock without a warning: none found. QV-19 §5.3 sets the 10-minute and 2-minute values but does not override QV-13-REQ-007's warning and extend requirement. I partly refuted the 'zeroed hedge key' risk: rho remains random, so this is a robustness and UX issue, not a key or randomness leak.

**Interim notes:** (1) app.ts:85-86 calls setHidden(false), which clears hiddenSince (lock.ts:21), before shouldLock. The >2 min hidden rule (QV-19 §5.3 line 72) can therefore only fire from the 15 s interval while hidden. If timers are suspended, a tab hidden for 2-10 min returns unlocked. Desktop Chrome throttles but still runs the interval, so the gap mainly affects frozen or mobile tabs. (2) After the idle lock, the only notice is the sr-only live region (app.ts:91). On the review screen the Seal button stays, and sealing runs with signer.nonceKey wiped to zero (signer.ts:58). This is not a cryptographic weakness: rho is 32 fresh bytes from systemRng (seal.ts:52), so the hedge is lost but the randomness is not. Send then fails with E-GEN-UNKNOWN ('Something went wrong'), not a locked or unlock prompt, and nothing is POSTed. (3) warningMsRemaining (lock.ts:29) and qv.key.lockWarn (en.ts:140) are never used. The 10-minute lock has no warning and no option to extend, contrary to QV-13-REQ-007 (Must). No integrity impact: no ballot is sent with a locked key.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Idle lock now visibly replaces active selection/seal controls, prevents sealing with a wiped signer, displays a two-minute idle warning, and clears key passphrase/generated/recovery displays. Resume checks hidden duration before resetting it, and stale input cannot reset an expired idle timer before lock.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/flow/ballot-controller.ts', 'packages/web/test/audit3.test.ts', 'packages/web/e2e/run.ts']

**Regression evidence:** audit3 locked-signer negative control; production run.ts Playwright clock proves visible idle lock; existing LockTimer unit tests cover hidden threshold.

**Evidence scope / unresolved boundary:** Production browser clock proves visible 10-minute idle lock. Actual hidden-tab/background suspension across browsers/mobile remains untested; no document.hidden replacement was used.

**Remaining gate:** Actual timer suspension/background behavior in Safari/Firefox/Tor/mobile remains untested. QV-13 15-minute wording versus QV-19 10-minute policy needs owner review; existing 10-minute policy is preserved. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-12

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** If IndexedDB cannot be opened, every election page including rules and results shows 'Something went wrong'.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-12).

**Original location:** packages/web/src/ui/app.ts:336, packages/web/src/main.ts:9

**Original confidence/category:** CONFIRMED; availability

**Original spec references:** QV-26-REQ-011, QV-07-REQ-064, QV-10 §8.1 E-KEY-STORAGE

**Original scenario:** Browser where indexedDB.open fails (private modes, storage blocked): overview, rules, key, vote, results all show the generic error; no key file can be created.

**Original evidence (verbatim):** storage-blocked.poc.ts (indexedDB.open made to fire onerror in Chromium): all five pages generic error, 0 forms on key page.

**Original suggested remediation:** Make storage optional with try/catch and in-memory fallback; show E-KEY-STORAGE only on key operations; allow session-only key from imported file.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node verify-b3/ui.vpoc.ts with an init script that replaces IDBFactory.prototype.open with a request that fires onerror (UnknownError)
```

**Interim output excerpt (verbatim):** for /, /rules, /key, /vote, /results: generic error 1, E-KEY-STORAGE text 0, forms (main input) 0

**Interim refutation attempt (verbatim):** I looked for a try/catch or fallback around getSettings and for a MemoryStorage fallback in main.ts. There is none: main.ts:17 always passes new IdbStorage(). I checked whether main.ts:9 pre-empts the case: it checks only typeof indexedDB, not whether open succeeds. I checked whether any spec permits a generic error here: QV-10 §8.1 defines E-KEY-STORAGE specifically for 'Browser blocks storage'. Not refuted. Severity is lowered because modern private-browsing modes usually allow IndexedDB, so the trigger needs storage to be explicitly blocked.

**Interim notes:** electionView awaits env.storage.getSettings() unconditionally at app.ts:336, before dispatching to the overview, rules, key, vote, receipt or results view. IdbStorage.db() rejects (storage.ts:107-117), and route()'s catch (app.ts:264-266) maps the non-ApiError to E-GEN-UNKNOWN. Every election tab, including the read-only rules and results tabs, shows only 'Something went wrong'. E-KEY-STORAGE ('Download the key file now and use it each time', QV-10 §8.1 line 421) is never shown on this path, and no key form is rendered. Reachability: mainstream private modes now generally provide IndexedDB (memory-backed), so the trigger is mainly user or enterprise settings that block site data. That lowers likelihood but not the defect. QV-26-REQ-011 (no storage) is a Must, but main.ts:9 also hard-requires crypto.subtle and indexedDB, so that requirement is broadly unimplemented rather than broken here.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Blocked IndexedDB no longer prevents rules or proof-verified results. Settings are read only for overview; missing storage/subtle does not block read-only startup. Key persistence failure remains an explicit key error.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/main.ts', 'packages/web/src/ui/app.ts', 'packages/web/e2e/verifier.ts']

**Regression evidence:** Production verifier.ts forces IndexedDB.open to throw and successfully visits rules and proof-gated results.

**Remaining gate:** This is read-only availability, not a memory-only voting/key mode or a Tor Browser certification. WebCrypto-free key wrapping remains the documented spec conflict. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-13

**Severity and historical review:** Medium → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** A 'sequenced' answer's signed promise is not stored or re-checkable, and a 5xx after a recorded ballot reads 'has not been sent'.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-13).

**Original location:** packages/web/src/flow/ballot-controller.ts:144-153, packages/web/src/flow/ballot-controller.ts:158-178, packages/web/src/flow/receipt.ts:58

**Original confidence/category:** CONFIRMED; bug / conformance

**Original spec references:** QV-10 §8.1 E-NET-TIMEOUT, QV-10 §8.2, QV-10 §10.2, QV-19 §6.2, QV-26-REQ-043

**Original scenario:** Board with checkpoint cadence answers sequenced: no receipt stored, promise lost on tab close. Board records ballot but returns 500: voter told ballot not sent while it is in the log.

**Original evidence (verbatim):** pending.poc.test.ts: PENDING_UNCONFIRMED, receipts stored 0; ui-voter.poc.ts (B3-F20): entries recorded 1, generic error text; errmap-server.poc.test.ts control idempotent retry.

**Original known overlap:** W1 (related, fixed)

**Original suggested remediation:** Persist signed promise as a receipt file and allow re-check; show pending title/body and E-NET-TIMEOUT copy for 5xx/timeouts.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test --test-reporter=spec packages/web/test/b3b4-verify.test.ts (own worktree /home/user/audit/verify-quietvote/B3-b4, now removed; copy at /tmp/claude-0/-home-user/b9ccda38-9f8d-54d6-a99c-1f20e1924081/scratchpad/b3b4-verify.test.ts)
```

**Interim output excerpt (verbatim):** B3-13a outcome PENDING_UNCONFIRMED seq 21 receipt undefined stored 0 | B3-13b recorded 1 state failed outcome PENDING_UNCONFIRMED ux E-GEN-UNKNOWN copy: Something went wrong / Your ballot has not been sent unless you saw a receipt.

**Interim refutation attempt (verbatim):** I checked whether a 'sequenced' answer is permitted. QV-09 §5 (docs/09-api-data-contracts.md:305) and QV-18 §7.2 (docs/18-bulletin-board-transparency.md:270-273) define it as a valid 201 answer, and in that case the client polls for inclusion. QV-18 §7.1 (:266) says the voter client must store receipts. At ballot-controller.ts:144-153 the receipt is built and stored only for ACCEPTED_RECORDED. In the sequenced case, receipt.ts:58 returns only {outcome, seq}. The signed promise is then dropped and `pending` is cleared. app.ts:503-508 shows no seq, no save button, and the receipt view (app.ts:518) lists only stored receipts, so the voter has nothing to re-check. Mitigation: the reference server checkpoints on every append (packages/server/src/election.ts:654-657, 615), so it never answers 'sequenced'. Only another QV-18-conformant board or a mirror would. 5xx path: the catch at ballot-controller.ts:160 marks it as an unknown delivery and keeps the retry (the W1 fix). However uxCodeFor maps INTERNAL and BAD_RESPONSE to E-GEN-UNKNOWN (errors.ts:50), and its body (en.ts:470) says 'Your ballot has not been sent unless you saw a receipt'. That contradicts the outcome the controller itself assigns (PENDING_UNCONFIRMED, 'Unknown if recorded', QV-10 §8.1/§8.2). No spec or decision permits this copy for a sent submit. Precondition: every one of the 4 attempts must fail with 5xx after the board recorded the ballot. If any retry gets through, it is an idempotent replay and returns the receipt. I reproduced this with maxAttempts=1, or equivalently 4 consecutive 5xx. QV-26-REQ-043 is cited but bears only weakly on this. Not refuted.

**Interim notes:** I rated this Low, not Medium. Reasons: the reference server never answers 'sequenced'; the 5xx case needs every retry to fail after the ballot was recorded; and the 'Send my vote' retry button stays available, which resends the same bytes idempotently and shows the receipt. The harm is misleading status copy and a lost promise for non-reference boards. No vote is lost or altered.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Promise-only signed receipts are retained/downloadable/stored for later inclusion; unknown delivery keeps same signed bytes and pending text; local persistence failure cannot turn a verified recorded receipt into not-sent.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/flow/ballot-controller.ts', 'packages/web/src/ui/app.ts', 'packages/web/test/audit3.test.ts']

**Regression evidence:** audit3 promise-only receipt, concurrent cast, storage-failure tests; existing flow/audit2 same-byte retry, board pin and inclusion tests.

**Remaining gate:** A signed promise is visibly pending until inclusion is checked. Optional receipt remembrance setting is respected. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-14

**Severity and historical review:** Medium → Medium; interim verdict confirmed. Consolidation disposition: `partial`.

**Original summary:** In one-ballot elections the UI promises revoting, and the REVOTE_LIMIT refusal is forced retryable, retried 4 times and reported as E-API-RATE.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-14).

**Original location:** packages/web/src/api/client.ts:234, packages/web/src/flow/ballot-controller.ts:160, packages/web/src/i18n/en.ts:207, packages/web/src/ui/app.ts:510

**Original confidence/category:** CONFIRMED; bug

**Original spec references:** QV-10 §8.1 E-VOT-ONEBALLOT, QV-09 §4.3, QV-10-REQ-001

**Original scenario:** Voter over max_per_voter seals and sends: four POSTs (429), state failed with retry button, generic error; intended change silently not applied.

**Original evidence (verbatim):** ui-copy.poc.ts (B3-F26): revote claim shown with max_per_voter=1; errmap-server.poc.test.ts (B3-F30): 4 attempts 429, outcome PENDING_UNCONFIRMED E-API-RATE.

**Original suggested remediation:** Honour problem body retryable; map REVOTE_LIMIT to E-VOT-ONEBALLOT; show revote note per manifest.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test --test-reporter=spec packages/web/test/b3b4-verify.test.ts (real server via packages/server/test/helpers/world.ts)
```

**Interim output excerpt (verbatim):** B3-14 max_per_voter 4 attempts 429:REVOTE_LIMIT > 429:RATE_LIMITED > 429:RATE_LIMITED > 429:RATE_LIMITED outcome PENDING_UNCONFIRMED ux E-API-RATE state failed retryCast true; unit: 429 problem with retryable:false -> ApiError.retryable true, 4 POSTs

**Interim refutation attempt (verbatim):** QV-09 §4.3 (docs/09-api-data-contracts.md:138) does list 429 RATE_LIMITED and REVOTE_LIMIT as 'retryable: yes, after Retry-After', so retrying once in itself has some spec cover. That does not refute the finding. (1) The server marks REVOTE_LIMIT retryable:false (packages/server/src/election.ts:1018), and client.ts:234 overrides the body for any 429. (2) The retries hit the ballot-interval limiter, so the final error is RATE_LIMITED, which maps to E-API-RATE ('Too many requests / wait and try again'). The voter never sees QV-10 §8.1 E-VOT-ONEBALLOT ('Not counted ... Your first ballot counts'), even though errors.ts:41 maps it. (3) ballot-controller.ts:160 classifies a 429 refusal as an unknown delivery: outcome PENDING_UNCONFIRMED with a retry button, even though nothing was appended. (4) app.ts:510 always renders qv.ballot.revoteNote ('You can vote again...', en.ts:207), whatever manifest.ballots.max_per_voter says. The schema allows max_per_voter=1 (packages/protocol/src/schema.ts:222). That contradicts QV-10-REQ-001 (must show whether revoting is allowed) and the V7 '<if allowed>' copy. Rejecting the ballot is correct behaviour; only the client's handling is wrong.

**Interim notes:** Reproduced against the real reference server under normal configuration. Vote integrity is not affected: the earlier ballot still counts and the rejected one is not appended. The defects are a definite refusal reported as a transient rate limit and pending state, a futile retry loop, and a false revote promise in limited-revote elections.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Explicit REVOTE_LIMIT is final even on 429; problem retryable:false is preserved. One-ballot elections show the existing ordinary one-ballot note.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/api/client.ts', 'packages/web/src/api/errors.ts', 'packages/web/src/flow/ballot-controller.ts', 'packages/web/src/ui/app.ts', 'packages/web/test/audit3.test.ts']

**Regression evidence:** audit3 final REVOTE_LIMIT negative test and rate-limit retry control.

**Remaining gate:** Normative unconditional qv.privacy.g4 still conflicts with one-ballot elections. No guarantee copy/policy changed; an approved variant remains a gate. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-15

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Cast and Test buttons differ in fill, size and weight, contrary to the equal-prominence requirement.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-15).

**Original location:** packages/web/src/ui/app.ts:479-480, packages/web/static/styles.css:13-14

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-10-REQ-007, QV-19-REQ-011, QV-10 §6.2 V6

**Original scenario:** Voter sees a filled primary 'Send my vote' and an outlined 'Double-check this vote', nudging away from auditing.

**Original evidence (verbatim):** ui-copy.poc.ts (B3-F27): computed styles differ (bg, width 160 vs 241).

**Original suggested remediation:** Render both with the same class; keep Cast first and focused.

**Interim reproduction:** method=code-reading; reproduced=False

**Exact historical interim command:**

```text

```

**Interim output excerpt (verbatim):** app.ts:479 castB = btn(..., { primary: true, ... }) -> class 'btn primary'; app.ts:480 testB = btn(..., { disabled, id }) -> class 'btn' (app.ts:119-120). styles.css:13 .btn transparent background, accent outline; styles.css:14 .btn.primary{background:var(--accent);color:var(--accent-fg)}

**Interim refutation attempt (verbatim):** I looked for a spec or decision that allows unequal styling and found the opposite. QV-10 V6 (docs/10-user-experience.md:252) says 'Both buttons same size/style; Cast gets initial focus'. QV-10-REQ-007 (:95, Must) requires 'equal prominence' and acceptance by 'UI snapshot checks button parity'. QV-19 §6.2 (docs/19-client-supply-chain.md:123) requires 'equal visual weight', and QV-19-REQ-011 (:283, Must) requires the same. OPEN-DECISIONS D-63 says 'Always offered, equal prominence'. The wrapper `.row.equal` (styles.css:19) makes the two columns equal flex items, but the buttons inside are inline-block and sized by their content. Cast is filled (.btn.primary) and Test is outlined (.btn). Two parts of the claim are overstated. The width difference comes mostly from label length ('Send my vote' vs 'Double-check this vote'), not from CSS. Font-weight is identical (both use font: inherit), so 'weight' is accurate only as visual weight. The difference in fill is real and contradicts the spec. No existing test checks parity. T-181 being Open means the work is not claimed complete, but the V6 screen is implemented and the Must requirement applies to it.

**Interim notes:** Cast keeps first position and initial focus (app.ts:490), as the spec requires. Only fill/style parity is violated.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Send and Test use the same primary button class, equal column width and equal minimum height.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/static/styles.css', 'packages/web/e2e/run.ts']

**Regression evidence:** Production run.ts casts and audits with both actions available; full build and ordinary browser checks pass. No new exact bounding-box equality assertion was added before freeze.

**Evidence scope / unresolved boundary:** Both actions are present in the passing app journey. Exact computed bounding-box/background/font-weight equality was not asserted; equal-column sizing is a source/CSS repair, not a browser dimension result.

**Remaining gate:** Exact equal-dimension/style browser regression remains to be added; source uses the same class, full column width and minimum height. Draft translated layouts remain unreviewed. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-16

**Severity and historical review:** Low → Low; interim verdict confirmed. Consolidation disposition: `fixed`.

**Original summary:** Verifier headline says 'All checks passed' under an Election-ID mismatch and with 3 of 14 checks not run.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-16).

**Original location:** packages/web/src/ui/app.ts:617-625, packages/web/src/verifier/page.ts:53-74

**Original confidence/category:** CONFIRMED; bug

**Original spec references:** QV-10 §1(1), QV-10 §8.1 E-VER-ANCHOR, QV-10 §11

**Original scenario:** User types the wrong Election ID; both SPA /verify and verifier.html print the mismatch warning followed by 'All checks passed'.

**Original evidence (verbatim):** verifier-anchor.poc.ts: SPA and standalone show mismatch + 'All checks passed | 11 of 14'.

**Original known overlap:** WV-6 (related, fixed live-region part)

**Original suggested remediation:** Suppress PASS heading on anchor failure; do not headline 'All checks passed' with checks not run.

**Interim reproduction:** method=test; reproduced=True

**Exact historical interim command:**

```text
node --test --test-reporter=spec packages/web/test/b3b4-verify.test.ts (DOM shim driving src/verifier/page.ts directly)
```

**Interim output excerpt (verbatim):** p: This doesn't match the Election ID you entered. ... / h2: All checks passed / p: 11 of 14 checks passed. / - Manifest hash: passed / - The record is an append-only log: not run / - Witness cosignatures: not run / - Sampled receipts: not run

**Interim refutation attempt (verbatim):** I checked whether the anchor result is meant to feed into the verdict. QV-34 §9.1 check 1 (docs/34-test-vectors-conformance.md:308) defines chk.manifest.hash as 'Manifest hashes to the anchored Election ID / hash'. The CLI applies the anchor as a pin that overrides the bundle hash (packages/verifier/src/verify.ts:20-21,123). QV-35-REQ-005 says an anchor mismatch makes the later checks not_run. The web pages (verifier/page.ts:52-67 and ui/app.ts:616-622) call verifyElectionText(text) without the anchor. As a result chk.manifest.hash shows 'passed' and the h2 shows the protocol verdict 'All checks passed' directly under the mismatch notice. On the not_run part: the protocol verdict is PASS whenever tally.decrypt ran (packages/protocol/src/verify.ts:136), and the individual not_run rows are reported honestly (INV-17 is met). Still, the headline copy 'All checks passed' (en.ts:281) next to '11 of 14 checks passed' is self-contradictory. That conflicts with QV-10 §1(1) 'No false assurance'. No spec or decision permits a PASS headline under an anchor mismatch.

**Interim notes:** Mitigations: the mismatch notice is displayed first (in the SPA it is an errorBox with role=alert), the live region announces it, and the itemized list shows the not-run checks. It is therefore misleading, not silent. Reproduced on the standalone page by driving page.ts through a DOM shim. The SPA path (app.ts:622) was checked by reading the code: it uses the same pattern.

Any complete interim `poc_source`, known-overlap fields and other original fields are preserved without truncation in [docs/audit/consolidation-2026-10-30.json](consolidation-2026-10-30.json).

**Consolidation reproduction/analysis:** Both verifier UIs show A check failed for a supplied Election-ID mismatch. PASS uses Supplied checks passed and enumerates not-run rows and caveats; protocol verdicts remain unchanged.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/flow/verification.ts', 'packages/web/src/verifier/page.ts', 'packages/web/src/ui/app.ts', 'packages/web/src/i18n/en.ts', 'packages/web/e2e/verifier.ts']

**Regression evidence:** verificationSummary unit anchor test; verifier.ts standalone generated/server and SPA anchor/skip journeys.

**Remaining gate:** No board/witness evidence or independent anchor is implied by an unanchored input. Draft translation wording requires review and remains unoffered. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-17

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** route() has no staleness guard, so a slow earlier view overwrites a later navigation.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-17).

**Original location:** packages/web/src/ui/app.ts:253-268, packages/web/src/ui/app.ts:326-364

**Original confidence/category:** CONFIRMED; bug

**Original spec references:** QV-13 C-STEPPER, QV-10-REQ-020

**Original scenario:** Click Results (slow chart chunk) then Check a receipt: URL says receipt but page shows Results and focus moves.

**Original evidence (verbatim):** nav-race.poc.ts and nav-race2.poc.ts: url=receipt h1=Results; url=/help h1=election title.

**Original suggested remediation:** Monotonic navigation id checked after each await.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Route epochs discard delayed election/settings/receipt/results/create work and delayed ballot redraws after navigation.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f58533b](https://github.com/djshellshoxxx/quietvote/commit/f58533b13c87f06af50f8d104c5a28b77bb8c270)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/e2e/verifier.ts']

**Regression evidence:** Production verifier.ts holds an election API response, navigates to Help, releases it, and observes the Help route/content remain consistent. The final-review chart-import/SSE append race is also covered through the actual serving path.

**Remaining gate:** No comprehensive browser race/model-checking claim; async actions scoped to detached local nodes may complete without changing the current view. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-18

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `open`.

**Original summary:** Pages have 2-3 live regions and the assertive anti-phishing announcement is truncated at 140 chars mid-word.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-18).

**Original location:** packages/web/src/ui/dom.ts:33-37, packages/web/src/ui/app.ts:273, packages/web/src/ui/app.ts:341, packages/web/src/ui/app.ts:368, packages/web/src/ui/app.ts:519, packages/web/src/ui/app.ts:609, packages/web/src/ui/app.ts:630

**Original confidence/category:** CONFIRMED; a11y

**Original spec references:** QV-13-REQ-021

**Original scenario:** Voter reports an Election ID mismatch; the assertive region announces a 213-char message cut at 'Tell your organiz'.

**Original evidence (verbatim):** live-regions.poc.ts (3 live regions per page); phish-announce.poc.ts (140-char truncation).

**Original known overlap:** WV-11 (info, did not count extra containers)

**Original suggested remediation:** Short (<=140) assertive announcement key; drop extra live containers.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Local status/alert nodes and the original Announcer 140-character slicing remain.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/ui/dom.ts', 'packages/web/src/ui/app.ts']

**Regression evidence:** Original B3-18 live-region/phishing announcement PoCs; no new acceptance claim.

**Remaining gate:** Needs a dedicated announcement/focus design and real screen-reader review. Automated checks are not WCAG conformance. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-19

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** Unlock field uses autocomplete=new-password and a non-key file is reported as 'This browser won't store your key'.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-19).

**Original location:** packages/web/src/ui/app.ts:370, packages/web/src/ui/app.ts:374-377

**Original confidence/category:** CONFIRMED; a11y / bug

**Original spec references:** QV-13 C-KEY, WCAG 3.3.8, QV-10 §8.1 E-KEY-STORAGE

**Original scenario:** Voter imports a wrong file; sees storage error; password manager not offered on unlock.

**Original evidence (verbatim):** ui-voter.poc.ts B3-F17 (autocomplete new-password), B3-F16 (alert text E-KEY-STORAGE).

**Original suggested remediation:** Choose autocomplete by mode; map E_KEY_FORMAT/PARAMS/CHECKSUM to qv.key.importBad.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Existing-key unlock uses current-password; invalid key/recovery formats use the relevant existing validation copy instead of blaming storage.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/e2e/run.ts']

**Regression evidence:** Existing key format/checksum negative tests and production valid-file/unlock lifecycle. A new malformed-file browser assertion was not added before freeze.

**Remaining gate:** Password-manager and assistive-technology behavior still need manual/browser-matrix review. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-20

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** The transparent re-wrap predicate is inverted so fast devices never re-wrap a floor-parameter key.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-20).

**Original location:** packages/web/src/flow/onboarding.ts:104-113, packages/web/src/key/keystore.ts:199-209

**Original confidence/category:** CONFIRMED; bug

**Original spec references:** QV-19 §5.3, QV-19-REQ-005

**Original scenario:** Fast device unlocks floor container in 100 ms; rewrapped=false, m stays 19456.

**Original evidence (verbatim):** unit.poc.test.ts: fast rewrapped=false m=19456; mid rewrapped=true m=38912.

**Original suggested remediation:** Re-wrap when adapted target exceeds stored m and unlock time is within range.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Fast unlock of a below-default key now enters the stronger-parameter rewrap path; the inverted adapt.changed condition was removed. unlockKey now wipes its caller-owned unwrapped seed in finally, including failed rewrap KDF and failed upgraded-container persistence.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [f58533b](https://github.com/djshellshoxxx/quietvote/commit/f58533b13c87f06af50f8d104c5a28b77bb8c270)

**Affected source:** ['packages/web/src/flow/onboarding.ts', 'packages/web/test/audit3.test.ts']

**Regression evidence:** audit3 deterministic 100ms fast-unlock case reproduced false before fix and true afterward, with stronger stored memory parameter. Final-review audit3 regression captures the caller-owned decrypted seed, forces KDF and storage failures, and asserts zeroed buffers after rejection (red before finally, green afterward).

**Remaining gate:** KDF policy/floors/ceilings are unchanged; device-specific performance still varies. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-21

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** Header link 'Privacy and limits' goes to /e, which renders 'not found'.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-21).

**Original location:** packages/web/src/ui/app.ts:712

**Original confidence/category:** CONFIRMED; conformance (self-reported)

**Original spec references:** QV-10-REQ-002

**Original scenario:** Voter clicks Privacy and limits and sees 'We could not find this election on this server.'

**Original evidence (verbatim):** ui-voter.poc.ts B3-F18: href /e -> not found text.

**Original known overlap:** Self-reported in docs/handoffs (not a prior audit id)

**Original suggested remediation:** Link to a real guarantee panel route; wire rulesSeen first-entry display.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** The broken extra /e privacy link is removed; shared Help navigation is canonical and present once.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/e2e/help.ts']

**Regression evidence:** Production Help 64 link-count/navigation checks; ordinary a11y 49 checks.

**Remaining gate:** Privacy details remain on election Rules; this is not an added standalone privacy page. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-22

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** Prototype-named ids (constructor, __proto__) from a manifest or tally crash the vote/results view.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-22).

**Original location:** packages/web/src/flow/ballot-machine.ts:6, packages/web/src/ui/app.ts:451-459, packages/web/src/ui/app.ts:599-600, packages/web/src/i18n/icu.ts:229-231, packages/web/src/i18n/index.ts:33

**Original confidence/category:** CONFIRMED; bug (availability)

**Original spec references:** QV-07-REQ-062

**Original scenario:** Manifest with contest id 'constructor' (accepted by validateManifest) makes the vote view show 'Something went wrong'; tally with outcome.kind '__proto__' crashes results.

**Original evidence (verbatim):** proto-id.poc.ts; unit.poc.test.ts (B3-F8).

**Original suggested remediation:** Use Object.hasOwn/Map for lookups; id charset check in manifest validation.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** ICU selectors consult own cases, translator IDs reject prototype properties, and ballot selection maps are prototype-free; result schemas/proofs gate hostile tally fields.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/i18n/icu.ts', 'packages/web/src/i18n/index.ts', 'packages/web/src/ui/app.ts', 'packages/web/test/audit3.test.ts']

**Regression evidence:** audit3 constructor/__proto__/toString select and message lookup negative controls; existing precompile equivalence tests.

**Remaining gate:** No broad arbitrary-input UI fuzzing claim. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-23

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `open`.

**Original summary:** Organizer 'Invitation links' list shows bare codes with no link or copy button, and selection yields garbled text.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-23).

**Original location:** packages/web/src/ui/app.ts:133, packages/web/src/ui/app.ts:666-667

**Original confidence/category:** LIKELY; usability

**Original spec references:** QV-10 §6.1 O4/O6, T-183

**Original scenario:** Organizer copies invite codes and gets spelled-out duplicates mixed in; no full #inv link composed.

**Original evidence (verbatim):** code-select.poc.ts selection garbled for Election ID helper; publish-server.poc.test.ts exercised publish, not the DOM list (hence LIKELY).

**Original suggested remediation:** Render full links and a copy button copying clean text.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Organizer invitation output still renders bare codes without complete usable links or per-invite copy controls.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/ui/app.ts']

**Regression evidence:** Original B3-23 organizer PoC; no new organizer browser acceptance.

**Remaining gate:** Needs bounded organizer invitation UX work; no new invitation-token exposure policy chosen. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-24

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** 'Election ID confirmed' is stored per URL/API id, not per Election ID hash.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-24).

**Original location:** packages/web/src/ui/app.ts:340-353

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-10-REQ-012, QV-10 §9

**Original scenario:** Operator later serves a different manifest under the same path; page still says 'Election ID confirmed on this device.'

**Original evidence (verbatim):** ui-voter.poc.ts (B3-F19): after manifest swap, confirmed text persists.

**Original suggested remediation:** Store confirmed Election ID string and compare on each load.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Confirmation settings are keyed by the signed manifest hash that produces the displayed Election ID, rather than mutable API URL id.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts']

**Regression evidence:** Typecheck and production overview/confirmation journey; source key is ctx.manifestHashHex.

**Remaining gate:** Old URL-id confirmations intentionally do not confirm a replacement manifest; no migration of old true values. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-25

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `blocked`.

**Original summary:** Word passphrases are canonicalised by the web client but not by the CLI, so a typed-back passphrase unlocks in only one.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-25).

**Original location:** packages/web/src/key/passphrase.ts:89-94, packages/cli/src/keyfile.ts:21-22

**Original confidence/category:** CONFIRMED; interop

**Original spec references:** QV-19 §5.3, QV-04 §4.1

**Original scenario:** Voter types 'LOBE-kuga-...' for a web-made key file: unlocks in web, fails in CLI.

**Original evidence (verbatim):** keyfile-interop.poc.ts: web unlocks, CLI fails with typed form, CLI unlocks with canonical form.

**Original suggested remediation:** One shared canonicalisation, or show the canonical form for CLI use.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Web and CLI passphrase canonicalization differences are preserved pending explicit owner policy; no cryptographic unlock behavior is silently reconciled.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/key/passphrase.ts', 'packages/cli/src/keyfile.ts']

**Regression evidence:** Original B3-25 keyfile interop evidence; web passphrase/key tests remain passing.

**Remaining gate:** Protocol/security owner must choose canonicalization and migration/compatibility semantics; CLI team documents current safe guidance. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-26

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `open`.

**Original summary:** The offline verifier runs on the main thread with no Worker pool, progress or resumability.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-26).

**Original location:** packages/web/src/verifier/page.ts:35-49

**Original confidence/category:** CONFIRMED (blocking, no progress) / LIKELY (10,000-ballot time); conformance

**Original spec references:** QV-19 §7

**Original scenario:** Verifying a large bundle freezes the tab; 10,000 ballots extrapolated to ~7 min frozen.

**Original evidence (verbatim):** N=24/96/192 node packages/web/audit-b3/verifier-perf-browser.poc.ts: frame gap ~ run time; no new Worker or <progress>.

**Original suggested remediation:** Run the shared verifier in a Worker pool and report progress.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Standalone verification still runs on the main thread without a worker pool, progress or resumability.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/verifier/page.ts']

**Regression evidence:** Original B3-26 timing evidence; current size bounds only limit input bytes.

**Remaining gate:** Large-election responsiveness requires a separate worker/progress design and performance validation. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-27

**Severity and historical review:** Low → pending; interim verdict pending. Consolidation disposition: `partial`.

**Original summary:** Library code and catalog copy exist with unit tests but no UI call site (11 symbols, 115 of 487 messages, 8 UX codes never produced).

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-27).

**Original location:** packages/web/src/flow/onboarding.ts:69, packages/web/src/flow/election.ts:154, packages/web/src/key/lock.ts:29, packages/web/src/i18n/datetime.ts:57, packages/web/src/i18n/datetime.ts:80, packages/web/src/flow/invite.ts:40, packages/web/src/key/storage.ts:21-25

**Original confidence/category:** CONFIRMED; conformance

**Original spec references:** QV-19-REQ-008, QV-19-REQ-022, QV-19-REQ-035, QV-10-REQ-010, QV-10-REQ-011, QV-13-REQ-007, QV-13-REQ-092, QV-13-REQ-093, QV-13-REQ-094

**Original scenario:** Readers of COPY.md/catalog/tests assume features like recovery import, roll check, lock warning, undervote warning exist, but users cannot reach them.

**Original evidence (verbatim):** grep loop over src for each symbol (only defining file); node packages/web/scripts/i18n-check.ts --json plus literal search (Appendix C).

**Original known overlap:** Partly self-reported in NOTES.md and TODO N-36/N-37

**Original suggested remediation:** Wire or remove the unreachable code/messages; track them in plan rows.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Recovery restore, saved-key backup, idle warning and several unused error/UI helpers now have actual call sites.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/flow/onboarding.ts']

**Regression evidence:** Scoped catalog extraction passes; current CLI reports306 static references/18 resolved dynamics/1 unresolved dynamic/1 forwarder/1 explicit verifier-view exclusion.

**Remaining gate:** Rules notice recording, shared-device settings, random submission delay and remaining library-only flows are not claimed complete; original 115-unused count is historical, not a current measurement. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-28

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `open`.

**Original summary:** A crafted key file within the accepted KDF ceiling costs ~9-30 s per unlock attempt.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-28).

**Original location:** packages/web/src/key/keystore.ts:18, packages/web/src/key/keystore.ts:63-70

**Original confidence/category:** CONFIRMED; security (DoS, user-initiated)

**Original spec references:** QV-19-REQ-004

**Original scenario:** User selects a crafted key file at m=256 MiB t=10; tab stalls or low-end phone runs out of memory.

**Original evidence (verbatim):** unit.poc.test.ts timings: 256 MiB t=3 9365 ms.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Accepted key KDF ceiling still allows deliberately expensive user-selected key files.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/key/keystore.ts']

**Regression evidence:** Original B3-28 measured evidence; existing ceiling rejection tests pass.

**Remaining gate:** No unreviewed KDF ceiling/performance policy change is made. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-29

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** SPA /verify reads the chosen file with no size bound, unlike the standalone page and verifier loader.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-29).

**Original location:** packages/web/src/ui/app.ts:615-616

**Original confidence/category:** LIKELY; robustness

**Original spec references:** QV-07-REQ-062

**Original scenario:** A very large file passed to /verify is read wholly into memory (not exercised).

**Original evidence (verbatim):** Code reading; verify-garbage.poc.ts shows malformed inputs fail fast; huge file not tested.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** SPA and standalone verifier both reject files larger than 64 MiB before reading/parsing them and render failure.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/verifier/page.ts', 'packages/web/e2e/verifier.ts']

**Regression evidence:** Production verifier.ts uses a 64 MiB + 1 sparse file and checks both rendered failures.

**Remaining gate:** This is an input bound, not a verification time/resource bound for every accepted file. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-30

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** Browser checks (CSP/TT, a11y, key flow) are not run by CI and no E2E loads verifier.html.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-30).

**Original location:** .github/workflows/ci.yml, packages/web/e2e/run.ts:45-48

**Original confidence/category:** CONFIRMED; test gap

**Original spec references:** QV-19-REQ-016, QV-19-REQ-018, QV-13-REQ-001

**Original scenario:** Regressions like B3-03 pass CI because e2e scripts exit 0 without Playwright and are not in the workflow.

**Original evidence (verbatim):** ci.yml runs only npm run check and claims lint; e2e/run.ts serves verifier.html but never opens it.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** All browser runners share a supported Playwright loader and required mode fails when browser tooling is absent; CI runs genuine production journeys including verifier.html.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec), [963c577](https://github.com/djshellshoxxx/quietvote/commit/963c57716dbceced04114d5119c61740b0cfb0fb)

**Affected source:** ['packages/web/e2e/browser.ts', 'packages/web/e2e/run.ts', 'packages/web/e2e/help.ts', 'packages/web/e2e/a11y.ts', 'packages/web/e2e/verifier.ts', '.github/workflows/ci.yml']

**Regression evidence:** Required/optional missing-binary controls; actual Chromium production app 12/12, Help 64/64, a11y 49/49, verifier 16/16; root owns final CI validation.

**Remaining gate:** Automated heuristics are not WCAG, manual AT, multi-browser, Tor, mobile or release certification. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-31

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `fixed`.

**Original summary:** The receipt screen prints the browser's current time as 'Logged' instead of the log's sequenced_at.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-31).

**Original location:** packages/web/src/ui/app.ts:504

**Original confidence/category:** CONFIRMED; correctness

**Original spec references:** QV-10 §6.2 V7, QV-10-REQ-009

**Original scenario:** Page clock set to 2030 shows 'Logged 1/1/2030' while the board logged it in 2026.

**Original evidence (verbatim):** logged-time.poc.ts.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** Receipt Logged time is the cryptographically verified receipt promise.sequenced_at, not the browser clock.

**Fix or partial-fix commit:** [88b376a](https://github.com/djshellshoxxx/quietvote/commit/88b376a81d464617e8f5fe3da65fc327dfcba9ec)

**Affected source:** ['packages/web/src/flow/ballot-controller.ts', 'packages/web/src/ui/app.ts', 'packages/web/test/audit3.test.ts']

**Regression evidence:** audit3 asserts returned sequencedAt equals signed promise; production receipt journey.

**Remaining gate:** Locale formatting uses the viewer device clock zone, but the underlying timestamp is the signed log value. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

### B3-32

**Severity and historical review:** Info → pending; interim verdict pending. Consolidation disposition: `open`.

**Original summary:** axe-core 4.13 reports region (moderate) on every page and aria-allowed-role (minor) on chart figure role=group.

**Original report:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); [docs/audit/2026-10-28/interim-verification-quietvote.json](2026-10-28/interim-verification-quietvote.json) (exact identifier B3-32).

**Original location:** packages/web/src/ui/app.ts:715, packages/web/src/ui/charts.ts:34

**Original confidence/category:** CONFIRMED; a11y (automated, info only)

**Original spec references:** QV-13 C-SHELL, QV-13 C-CHART

**Original scenario:** Experimental banner sits outside landmarks; chart figure uses disallowed role.

**Original evidence (verbatim):** ui-observer.poc.ts step B3-A1 and axe-results.poc.ts.

**Interim reproduction:** pending. No completed batch verification or reviewed severity is inferred.

**Consolidation reproduction/analysis:** The banners remain outside a landmark and chart figure role=group remains; no full axe/AT review of the revised election UI was done.

**Fix or partial-fix commit:** No semantic repair commit; open/owner gate.

**Affected source:** ['packages/web/src/ui/app.ts', 'packages/web/src/ui/charts.ts']

**Regression evidence:** Ordinary 49 automated heuristics pass; original B3-32 axe findings remain distinct.

**Remaining gate:** Needs targeted semantic fixes and manual AT/disabled-user review. Do not label automated heuristics WCAG conformance. All new source repairs are AI-assisted, unaudited and require independent security/cryptographic review before any real use.

**Reproducible checked-in commands** (run from repository root; strict comparison deliberately stays nonzero while reports differ):

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

## Supplementary older overlaps and extraction omission

These entries do not alter the original 72-item denominator. Older crypto/server overlaps retain their original source rows and remediation limits. B3-33 exists in the dated B3 report but was absent from the interim extract; it is retained explicitly here.

### CP-01

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); medium, **Fixed** in `analyzeBallotLog` (protocol/src/ballotlog.ts): a spoil of any mode sharing ElGamal `a` values with an envelope-valid cast under a *different* code is excluded from `spoiled`, ALARM `E_SPOILED_CODE_CAST` (`re-wrapped`), `chk.benaloh.spoiled` fails; same-code case keeps the old handling. Trustee relay (TR-01) already refuses. Tests: `protocol/test/audit.test.ts` (6 mode×order cases + control; 7 failed before the fix), `tally.test.ts`. Residual: `trusteeDecryptSpoiled` itself does not know the cast set (callers use `analyzeBallotLog`).

**Disposition:** imported_and_extended

**Original report rows (verbatim):**

```text
| CP-01 | medium | A voter can re-wrap a counted ballot as a spoil (only `supersedes` changes). Trustees then decrypt the counted vote, and `E_SPOILED_CODE_CAST` is bypassed | `protocol/src/ballotlog.ts:96,124` (spoil/cast compared by code only); `protocol/src/tally.ts:64-66` (trustee checks mode only); `crypto/src/proofs.ts:119` (CDS does not bind `supersedes`) | Compare spoil and cast at the ciphertext level (any `alpha` of a spoil equal to any cast `alpha` makes the spoil inadmissible). Do this in `analyzeBallotLog`, in `trusteeDecryptSpoiled` (refuse), and in the verifier for both `reveal` and `trustees` modes | open. Related to TR-01. A partial fix (verifier, trustee mode only) was in the working tree during review; PoC still reproduces at the protocol level (see detail) |
| CP-01 (medium) | **Fixed** in `analyzeBallotLog` (protocol/src/ballotlog.ts): a spoil of any mode sharing ElGamal `a` values with an envelope-valid cast under a *different* code is excluded from `spoiled`, ALARM `E_SPOILED_CODE_CAST` (`re-wrapped`), `chk.benaloh.spoiled` fails; same-code case keeps the old handling. Trustee relay (TR-01) already refuses. Tests: `protocol/test/audit.test.ts` (6 mode×order cases + control; 7 failed before the fix), `tally.test.ts`. Residual: `trusteeDecryptSpoiled` itself does not know the cast set (callers use `analyzeBallotLog`). |
```

**Reproduction/analysis:** Imported TS ciphertext rewrap quarantine; extended with out-of-window/limit signed spoil regressions.

**Fix/partial-fix provenance:** [592adbb](https://github.com/djshellshoxxx/quietvote/commit/592adbb790a5fa8d18f1c32cd33daa7a308c1ce8), [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Cross-package evidence:** {'status': 'fixed', 'original_severity': 'Medium', 'interim_verdict': 'known historical finding', 'interim_severity': 'Medium', 'reproduction': 'Historical server admission still checked code only. New real HTTP regression posts valid cast then a re-signed spoil with the same ciphertexts/different supersedes; it must receive422 E_SPOILED_CODE_CAST.', 'fix_paths': 'packages/server/src/election.ts; packages/server/test/consolidation.test.ts; packages/protocol/src/ballotlog.ts', 'tests': 'consolidation.test.ts real server journey; protocol audit.test.ts; spoil-shares.test.ts; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)', 'remaining_review': 'Admission rejects cast-alpha collisions in spoils; draft filters old admitted aliases against all stored valid cast alphas, preserving protocol CP-01 behavior without re-verifying ballots. Protocol/trustee/verifier owners cover their own surfaces.'}

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-02

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low, **Open, declined**: adding A/B to the `cp-dec-nonce` hedge deviates from the registry field list `(s_j, ctx, cid, oid, rand32)` in QV-16; needs a spec-owner decision. Exposure needs a failed RNG plus two decryptions of the same (ctx, cid, oid) with different aggregates; the spoil path is code-bound.

**Disposition:** owner_gate

**Original report rows (verbatim):**

```text
| CP-02 | low | `cp-dec-nonce` hedge omits the ciphertext `(A,B)`. With a failed RNG, two partial decryptions for the same `(ctx,cid,oid)` reuse the nonce and leak `s_j` | `crypto/src/proofs.ts:219` (registry `crypto/src/transcript.ts:39`) | Add `pt(A)`, `pt(B)` (and `pt(M)`) to the hedged nonce fields (spec registry erratum). Optionally hedge PoK/DLEQ/keyconf nonces too (X-20) | open (PoC) |
| CP-02 (low) | **Open, declined**: adding A/B to the `cp-dec-nonce` hedge deviates from the registry field list `(s_j, ctx, cid, oid, rand32)` in QV-16; needs a spec-owner decision. Exposure needs a failed RNG plus two decryptions of the same (ctx, cid, oid) with different aggregates; the spoil path is code-bound. |
| C2 / CP-02 | low | see CP-02 | Spec deviation. Report only | open (spec) |
```

**Reproduction/analysis:** Failed-RNG changed-aggregate nonce reuse remains; registry transcript amendment is owner-controlled.

**Fix/partial-fix provenance:** No semantic repair commit; open/owner gate.

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-03

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low, **Fixed**: `Object.hasOwn` in the closed-schema check. Test: `protocol/test/audit.test.ts` (failed before).

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| CP-03 | low | Closed-schema check accepts inherited property names (`constructor`, `toString`, `__proto__`, `valueOf`, ...) as "known" fields | `protocol/src/schema.ts:69` (`k in s.req`) | Use `Object.hasOwn(s.req, k)` / `Object.hasOwn(opt, k)` (and likewise for the required-field presence test) | open (PoC) |
| CP-03 (low) | **Fixed**: `Object.hasOwn` in the closed-schema check. Test: `protocol/test/audit.test.ts` (failed before). |
```

**Reproduction/analysis:** Object.hasOwn closed-schema fix imported with regression.

**Fix/partial-fix provenance:** [592adbb](https://github.com/djshellshoxxx/quietvote/commit/592adbb790a5fa8d18f1c32cd33daa7a308c1ce8)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-04

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); medium, **Fixed**: `ed25519IsStrictPoint` now also requires torsion-free, so cofactored and cofactorless verification agree. Test: `crypto/test/audit.test.ts` (failed before). Behaviour change: mixed-order keys/R values are rejected (honest keys are unaffected).

**Disposition:** imported_and_extended

**Original report rows (verbatim):**

```text
| CP-04 | medium | Ed25519 "strict" policy admits mixed-order keys and R. Verification is noble's cofactored equation, while QV-16 §5.12.2 says "cofactorless-equivalent". Verifiers can disagree | `crypto/src/ed25519.ts:22-28,39`; `protocol/src/manifest.ts:35` (roll accepts such keys); `docs/16-crypto-protocol.md:601` | Reject points with a torsion component (`[ℓ]P ≠ O`) in `ed25519IsStrictPoint`, or pin the cofactored equation in QV-16. Add mixed-order vectors to QV-34 | open (PoC) |
| CP-04 (medium) | **Fixed**: `ed25519IsStrictPoint` now also requires torsion-free, so cofactored and cofactorless verification agree. Test: `crypto/test/audit.test.ts` (failed before). Behaviour change: mixed-order keys/R values are rejected (honest keys are unaffected). |
```

**Reproduction/analysis:** Imported TS torsion-free A/R checks; independent Python boundary repaired here.

**Fix/partial-fix provenance:** [592adbb](https://github.com/djshellshoxxx/quietvote/commit/592adbb790a5fa8d18f1c32cd33daa7a308c1ce8), [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-05

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low, Open (roll-commit ordering vs election-open; second conflicting roll-commit ignored).

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| CP-05 | low | Base verifier does not order `roll-commit` against `election-open`. When the manifest has no `roll.root`, extra or conflicting `roll-commit` records are silently ignored | `protocol/src/verify.ts:283-288,341-354` | Require the `roll-commit` seq < `election-open` seq (F). Flag any second, differing `roll-commit` as equivocation (F) | open (reasoning) |
| CP-05 (low) | Open (roll-commit ordering vs election-open; second conflicting roll-commit ignored). |
```

**Reproduction/analysis:** All signed roll commitments must match supplied roll and precede open.

**Fix/partial-fix provenance:** [6e05596](https://github.com/djshellshoxxx/quietvote/commit/6e0559648ae07fb1c3eb6f0138d22da9dbf3ace7)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-06

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); info, Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4).

**Disposition:** open_design

**Original report rows (verbatim):**

```text
| CP-06 | info | Feldman/Pedersen DKG selective-abort bias: corrupt dealers see all `A_i0` and then choose to drop out (withhold R2 / false complaint), so they choose among `2^c` joint keys | `protocol/src/dkg.ts:301-361` | Known GJKR limitation. Document it in QV-17. Use a GJKR/Pedersen-VSS commitment phase if uniform `K` is required | open (reasoning) |
| CP-06, CP-07, CP-08 (info) | Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4). |
```

**Reproduction/analysis:** DKG selective-abort bias remains documented construction limitation.

**Fix/partial-fix provenance:** No semantic repair commit; open/owner gate.

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-07 / C10

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); info, Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4)., low

**Disposition:** imported_fixed_with_limit

**Original report rows (verbatim):**

```text
| CP-07 | info | `openWithPassphrase` takes the scrypt `logN` from the unauthenticated header (up to 22, about 4 GiB) before any check. A crafted bundle file can exhaust memory | `crypto/src/bundle-cipher.ts:19,35,73-75` | Let the caller cap `logN` (for example the value it sealed with), or lower `BUNDLE_MAX_LOGN` | open (reasoning) |
| CP-06, CP-07, CP-08 (info) | Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4). |
| C10 | low | `bundle-cipher.ts:19,74`: header `logN` up to 22 (~4 GiB scrypt) before authentication | `BUNDLE_MAX_LOGN` lowered from 22 to 20 (~1 GiB), plus an optional `maxLogN` on open. The floor stays 18 (QV-17-REQ-021). Behaviour change: bundles sealed at 21 or 22 are refused; none exist in the repo | fixed, test `C10`; trustee could pass `maxLogN` (follow-up, out of scope) |
```

**Reproduction/analysis:** Header scrypt maximum reduced to logN20 and caller cap; high allowed local work factor still disclosed.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### CP-08

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); info, Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4).

**Disposition:** partial_coverage

**Original report rows (verbatim):**

```text
| CP-08 | info | Test gaps: crypto unit tests do not catch Fiat-Shamir field omissions (only the protocol frozen vectors do). Nothing catches the switch to ZIP-215 or mixed-order Ed25519 | mutation sweep, §4 | Add per-field challenge-mutation unit tests in `crypto/test/proofs.test.ts`. Add mixed-order / ZIP-215 divergence vectors | open |
| CP-06, CP-07, CP-08 (info) | Open (selective-abort bias of K is a known property; scrypt header work factor; mutation gaps listed in §4). |
```

**Reproduction/analysis:** Imported crypto/proof audit tests plus new B1 tests; no full mutation/corpus completeness claim.

**Fix/partial-fix provenance:** [48a2b73](https://github.com/djshellshoxxx/quietvote/commit/48a2b73c6a4c77666284f094372eb683e2a5364a)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P1 / TSV-05

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); medium (design)

**Disposition:** owner_gate

**Original report rows (verbatim):**

```text
| P1 / TSV-05 | medium (design) | `protocol/src/verify.ts:136,208`: the verdict ignores `chk.board.*`. Without `opts.log` the board checks stay `not_run` and only a caveat is added, so a cast the operator removed from the log can still yield PASS | Spec-owner decision (verdict semantics; the verifier package composes the log layer itself). No code change | open (design) |
```

**Reproduction/analysis:** Overall PASS for absent board evidence is existing verdict policy; explicit skipped-check caveat retained.

**Fix/partial-fix provenance:** No semantic repair commit; open/owner gate.

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P2

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| P2 | low | `protocol/src/tally.ts:41`: `trusteeDecryptTally([b,b,b])` passed the floor and decrypted one ballot | Refuse a repeated voter or code (`E_TRUSTEE_REFUSE`). Differencing over two different ≥floor subsets cannot be stopped without the log. The trustee package recomputes `counted` from the log (`trustee.ts` `verifiedElection`) and releases once, so it is not exposed. `decryptAggregates`/`buildTally` handle only public data | fixed (dup guard), test `P2`; differencing: open (API contract) |
```

**Reproduction/analysis:** Trustee tally API refuses repeated voters/codes before floor padding.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P3

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); medium

**Disposition:** imported_fixed_python_gate

**Original report rows (verbatim):**

```text
| P3 | medium | `verify.ts:472`: a second signed tally with a different `T` gave PASS | A later differing body is F `E_RESULT`. An identical repeat stays L | fixed, test `P3` |
```

**Reproduction/analysis:** TS conflicting tally is fatal, identical repeat stays L; Python identical-repeat class remains B1-02.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P4

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); medium

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| P4 | medium | `ballotlog.ts:66`: a spoil with a bad attached reveal was dropped, so the same body cast later was counted (REQ-015) | Re-verify without `reveal`. If the voter signature holds, register the spoil, raise ALARM `E_SPOIL_MISMATCH` and fail benaloh. The later cast becomes `E_SPOILED_CODE_CAST` | fixed, test `P4/REQ-015` |
```

**Reproduction/analysis:** TS strips invalid attached reveal and re-verifies signed spoil for code exclusion.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P6

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low

**Disposition:** imported_fixed_list_gate

**Original report rows (verbatim):**

```text
| P6 | low | `manifest.ts:65`: trustee and witness names skipped the NFC/bidi check | Check is extended to those names | fixed, test `P6` |
```

**Reproduction/analysis:** TS trustee/witness name bidi/NFC validation imported; normative U+061C boundary remains B1-05.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P7 / TSV-03

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| P7 / TSV-03 | low | `verify.ts:478,558`: below the floor, `chk.tally.decrypt` read `pass` without any decryption (so verifier V10/V11 showed PASS) and the rules `fail` was overwritten to `not_run`. The verdict was already FAIL | `decrypt` is set to `pass` only after verification and combination. The rules failure is kept. Vectors regenerated | fixed, test `P7/TSV-03` |
```

**Reproduction/analysis:** TS decrypt remains not_run until actual share verification; corrected canary expected decrypt status imported.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P9

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| P9 | low | `verify.ts:391`: an invalid keyconf signed by trustee j shadowed j's later valid keyconf, so `\|T\|<t` gave FAIL | Only a valid keyconf settles j (§5.7.8) | fixed, test `P9` |
```

**Reproduction/analysis:** Invalid keyconf no longer shadows later valid confirmation.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P10

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); info

**Disposition:** owner_gate

**Original report rows (verbatim):**

```text
| P10 | info | `verify.ts:282,413`: duplicate `election-open/close` markers (m-of-n coordinator signed) are L, and the first one wins deterministically | Whether coordinator marker equivocation should be F is for the spec owner (QV-18) | open (design) |
```

**Reproduction/analysis:** Duplicate election marker classification remains existing L policy; no new policy chosen.

**Fix/partial-fix provenance:** No semantic repair commit; open/owner gate.

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### P11

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low

**Disposition:** imported_fixed_python_residual

**Original report rows (verbatim):**

```text
| P11 | low | `verify.ts:537`: `tally.decrypters` was never compared, and `buildTally` listed every trustee that sent shares | Must equal the recomputed `T_valid` (F `E_DEC_PROOF`). `buildTally` emits `T_valid` | fixed, test `P11` |
```

**Reproduction/analysis:** TS tally.decrypters must equal recomputed T_valid; Python still emits mismatch as note, a residual conformance gap.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### C1, C4, C5, C6, C7, C8

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); low, info

**Disposition:** imported_fixed

**Original report rows (verbatim):**

```text
| C1 | low | `crypto/src/share-cipher.ts:47`: identity `E_j` was accepted, so the key could be derived from public data | `E_IDENTITY` | fixed, test `C1` |
| C4 | low | `elgamal.ts:21`: `r = l` passed, giving `A = O` | Require `0 < r < l` | fixed, test `C4` |
| C5 | low | `json.ts:193,209`: `canonicalize` serialised Map/Uint8Array/Date and NFD strings or lone-surrogate keys that `parseQvJson` rejects | Plain objects only, with NFC and surrogate checks on strings and keys | fixed, test `C5` |
| C6 | low | `proofs.ts:189`: a non-integer `L` threw `RangeError` out of `limitVerify` | Return false | fixed, test `C6` |
| C7 | low | `feldman.ts:44,56`: `lagrangeAtZero([0],0)` returned 1, and `feldmanVerifyShare(f(0),A,0)` returned true | Reject index < 1 | fixed, test `C7` |
| C8 | info | `proofs.ts:94,231`: `dhVerify` accepted `Ej = S = O` | Reject identity `Ej/R/S` (dh) and `Yj` (dec). Callers already decode these as non-identity, so this is defence in depth | fixed, test `C8` |
```

**Reproduction/analysis:** Imported identity guards, scalar range, canonical JSON domain, integer limit, positive index guards, proof identity checks.

**Fix/partial-fix provenance:** [e4513db](https://github.com/djshellshoxxx/quietvote/commit/e4513dbfdd4889a00c07d6515305a7b7017ded61)

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### C3

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); info

**Disposition:** owner_gate

**Original report rows (verbatim):**

```text
| C3 | info | `proofs.ts:50,67,85`: PoK, share-key and DH-reveal nonces come from the plain CSPRNG | Matches QV-16 §5.7.2 ("CSPRNG (or hedged)") and is listed as OQ-7. Hedging needs registry labels | open (design, OQ-7) |
```

**Reproduction/analysis:** PoK/DLEQ/keyconf nonce hedging registry labels not decided; plain CSPRNG remains.

**Fix/partial-fix provenance:** No semantic repair commit; open/owner gate.

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### C11

**Original source/severity:** [docs/audit/crypto-protocol.md](crypto-protocol.md); info

**Disposition:** open

**Original report rows (verbatim):**

```text
| C11 | info | `crypto/src/index.ts:4` (`rng.ts`): `streamRng`, `constantRng` and `vecrng` are exported from the main entry | Moving them to a `/testing` subpath would break tests in cli, server, trustee, verifier and web (out of scope). Not changed | open |
```

**Reproduction/analysis:** Test RNG helpers remain exported on production entry point; removing requires consumer/import migration.

**Fix/partial-fix provenance:** No semantic repair commit; open/owner gate.

**Regression evidence:** Imported packages/{crypto,protocol}/test/{audit,second-wave}.test.ts; owned NOTES

**Remaining gate:** See original disposition and unclosed policy/capability gate; no external audit claim. Independent external protocol/cryptographic review required; source edits and regression tests are not certification.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/crypto
npm test -w @quietvote/protocol
npm test -w @quietvote/verifier
(cd verifier-py && python3 -m unittest discover -s tests)
node scripts/compare-verifiers.ts
```

### SRV-001

**Original source/severity:** [docs/audit/server.md](server.md); high

**Disposition:** fixed_historical_integration

**Original report rows (verbatim):**

```text
| SRV-001 | high | `src/http.ts:381` (was `req.socket.destroy()` in a `finish` handler). When a request is refused with `Connection: close` (body too large, bad media type, rate limited) and the peer disconnects first, `req.socket` is null and the handler throws inside an event emitter: uncaught exception, whole process down. Reproduced pre-fix: chunked body over the limit and abrupt client close. Unauthenticated. | `req.socket?.destroy()` | fixed; test `SRV-001: a chunked body without Content-Length...` (failed pre-fix with `TypeError ... reading 'destroy'`, passes now) |
```

**Reproduction/analysis:** Historical audit-server/spoil-wiring merge restores req.socket?.destroy(). Existing hostile chunked+disconnect regression passes in initial full suite.

**Fix/partial-fix provenance:** [0a80064](https://github.com/djshellshoxxx/quietvote/commit/0a800649139d9c34773ee161d548b5b0ee477887)

**Regression evidence:** audit.test.ts SRV-001; npm test -w @quietvote/server: 140/140 pass (server-tests-final.log)

**Remaining gate:** No unresolved SRV-001 crash claim. Historical report/test evidence preserved. Independent review and remaining release/supply-chain gates remain required.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/server
node --test packages/server/test/consolidation.test.ts
```

### B3-33

**Original source/severity:** [docs/audit/2026-10-28/B3-quietvote-web.md](2026-10-28/B3-quietvote-web.md); Info

**Disposition:** partially_fixed

**Extraction note:** Present in the original B3 report but absent from the 72-item interim extract. Retained here without changing the original denominator. Imported/current DEP-01/02 and CI gates are partially fixed; workspace wildcard and broader release-policy gates remain.

**Original report rows (verbatim):**

```text
| B3-33 | Info | CONFIRMED | supply-chain | QV-19 §11 P3 | `packages/web/package.json:24-26`; `.npmrc` | Workspace dependencies are `"*"` (resolve to links, no registry fetch); no `audit-level` / lockfile lint (KNOWN DEP-02, PR #15) |
```

**Reproduction/analysis:** The original B3-33 observation described the reviewed snapshot. DEP-01/02 fixes were imported in 57ba6cd, and 963c577 pins required browser tooling and runs dependency/lockfile checks. Final validation at 247df393ea1ace300fe5ed1f569a12090e1364dc records lockfile lint exit 0, npm audit exit 0 with 0 advisories, and action pins exit 0. Workspace dependency wildcards remain local workspace links; broader release assurance remains incomplete.

**Fix/partial-fix provenance:** [57ba6cd](https://github.com/djshellshoxxx/quietvote/commit/57ba6cd779e7621603cd36179887379e942b5e63), [963c577](https://github.com/djshellshoxxx/quietvote/commit/963c57716dbceced04114d5119c61740b0cfb0fb)

**Regression evidence:** [Final supply-chain command receipt](../reports/consolidation-validation-2026-10-30.json): lockfile lint, dependency audit and action-pin checks each exit 0; npm audit reports 0 advisories. Exact commands/cwd/environment/timings are preserved there.

**Remaining gate:** Workspace "*" declarations remain local links. Broader dependency allowlist/exact-pin policy, vendoring, reproducible release, artifact signing, SBOM and independent supply-chain review remain gates. Passing these bounded checks does not establish complete release assurance. Independent review and remaining release/supply-chain gates remain required.

**Reproducible checked-in commands:**

```sh
npm test -w @quietvote/web
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

## Final validation receipt

Validation completed at `247df393ea1ace300fe5ed1f569a12090e1364dc`, from `2026-10-31T05:24:21.905353+00:00` to `2026-10-31T05:31:29.545543+00:00`. These UTC timestamps are technical execution metadata; this consolidation record is dated 2026-10-30.

The [machine command receipt](../reports/consolidation-validation-2026-10-30.json) preserves exact command arguments, working directories, supplied environment overrides, exit codes and durations. Its source SHA is the validated source checkpoint; subsequent ledger/handoff commits change documentation only.

| Check | Observed result | Exit |
|---|---|---:|
| `npm run check` | 810 named tests; 0 failures, 0 skips. Board 74, CLI 47, crypto 58, protocol 197, server 140, trustee 83, verifier 25, web 186. | 0 |
| Python unit tests | 50 tests, OK. | 0 |
| TypeScript vectors | 412/412 supported cases; 1 explicitly unsupported DKG file. | 0 |
| Python vectors | 282 total: 229 PASS, 0 FAIL, 53 NOT_IMPLEMENTED. Unsupported cases remain unsupported. | 0 |
| Required Chromium app | 12/12 named production journey steps. | 0 |
| Production Help/Home | 64/64 checks across four viewport/device-theme combinations. | 0 |
| Automated accessibility | 49/49 heuristics; no WCAG or assistive-technology conformance claim. | 0 |
| Verifier production/reference-server browser | 16/16 checks, including real SSE append during delayed chart loading and fail-closed reverification. | 0 |
| Build and i18n | Both pass. | 0 |
| Lockfile and dependency audit | Both pass; audit reports 0 advisories. | 0 |
| Action pins | Pass. | 0 |
| Licence snapshot | 35 packages; all permissive, 0 flagged. Root refreshes the checked-in snapshot separately. | 0 |
| Working-tree and repair-range whitespace | Both checks pass. | 0 |
| Strict cross-verifier comparison | 27/27 verdicts agree; 12 detailed reports differ. Strict equality remains a failed gate. | **1** |
| Claims lint | 20 findings in 9 files; known nonblocking CI check. Historical evidence was not suppressed. | **1** |

The [strict differential receipt](../reports/consolidation-cross-verifiers-2026-10-30.json) preserves `ok: false`, all per-case report differences and the source SHA. QV-ERR-PY-006/007/015 remain unresolved; no semantics or vectors were changed to force agreement. `node scripts/compare-verifiers.ts --json` must continue returning nonzero while those differences exist.

Browser checks used `QV_REQUIRE_BROWSER=1` and `QV_CHROMIUM=/usr/bin/chromium`; required browser availability failures cannot pass by skipping. Scope gaps remain: backup-download/recovery-restore lifecycle, exact action-button computed-dimension equality, actual hidden-tab/background timer suspension, manual assistive technology and native translation review were not established by these passing suites.

B3-01 registration remains blocked by protocol review. Other partial/open findings and external review gates above remain open despite passing runtime suites. This branch is unaudited and not for real elections.

Historical scratch paths in quoted original evidence or raw worker assessments are provenance, not required working links. Current regression commands and final command receipts are reproducible. Original reports/PoCs remain unchanged; the companion JSON preserves all original records, exact commit mappings and the final bounded validation result.
