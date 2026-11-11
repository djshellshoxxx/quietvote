# Zero-Codex lane: PR #32-#41 static review (2026-11-11)

Base for all ten: ab84f16136184cb1fa0fa67b41e113424e134ba8 (origin/codex/quietvote-milestone-20261109). Static review only: no tests/builds were run. Everything about CI results below is the lane's own claim (UNVERIFIED by me).

## 1. Summary table
Counts exclude docs/handoffs. "Commits" = commits in ab84f16..branch.

| PR | branch (chatgpt/zero-codex/...-20261110) | head | commits | files (+/-) excl. handoffs | code summary | tests added | verdict | reason |
|---|---|---|---|---|---|---|---|---|
| 32 | verifier-triage | 61ddc6d | 18 (3 code/test/docs, 15 ledger-only) | .github/workflows/ci.yml +2; scripts/triage-verifier-report.mjs +89; scripts/triage-verifier-report.test.mjs +68; docs/reports/verifier-comparator-triage-20261110.md +33 (192 +/0) | New read-only diagnostic CLI that summarises `compare-verifiers.ts --json`; refuses inconsistent reports; exit 0/1/2. Adds one CI step. | scripts/triage-verifier-report.test.mjs (7 tests) | MERGE-WITH-NOTE | Diagnostic only, strict comparator untouched. Note: 234-line ledger file plus 15 ledger commits. Adds a CI step (low risk). |
| 33 | audit-rate-config | 0dac28b | 15 (3 code/test, 12 audit-ledger) | packages/server/src/config.ts +3/-1; packages/server/test/config-rate-finite.test.ts +17; docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md +165 | `resolveConfig` rate validation now rejects Infinity (limit/windowSec/burst) as well as NaN/<1. | config-rate-finite.test.ts | MERGE | Real (Low) bug, minimal, stricter-only. |
| 34 | docs-wiki-sections | 571c9f0 | 34 | 8 wiki pages (+168/-47) + docs/handoffs/CHATGPT_DOCS_MAINTENANCE_LATEST.md +138 (that file is a handoff, excluded from counts in the lane's convention; included here: total 9 files, +306/-48) | Docs only. New User-Guide/Developer-Guide hubs, Home/Sidebar links, claim-softening rewrites of Voter/Auditor guides and Roadmap. | none (docs) | MERGE-WITH-NOTE | Merge last: wiki text cites PR #32/#35-#41 as draft/unmerged and PR numbers/SHAs; will be stale or wrong if not all merged. Substantive wording changes should get owner glance (they only weaken claims). Wiki is published separately (wiki/ dir is source only). |
| 35 | import-preabort | 6768318 | 2 | packages/server/src/imports.ts +2; test/import-preabort.test.ts +26 | `signal?.throwIfAborted()` at top of `verifyBundle` | import-preabort.test.ts | MERGE | Minimal, matches existing pattern at imports.ts:64,81. |
| 36 | job-start-recovery | c4a8959 | 2 | packages/server/src/jobs.ts +2/-1; test/jobs-start-transition.test.ts +39 | Moves `c.startJob(j.id)` inside the try in `JobRunner.run` | jobs-start-transition.test.ts | MERGE | Real bug (unhandled rejection / stuck job), 1-line move. |
| 37 | seal-worker-lifecycle | 11c8ca2 | 2 | packages/web/src/worker/worker-sealer.ts +9/-2; test/seal-worker-lifecycle.test.ts +81 | Terminate Worker and resolve `{ok:false}` on `messageerror` and on sync `postMessage` throw | seal-worker-lifecycle.test.ts (3 tests) | MERGE | Real reliability fix; success path preserved. |
| 38 | pool-delete-diagnostic | 5cf3592 | 2 | packages/server/src/pool.ts +1/-1; test/pool-delete-diagnostic.test.ts +27 | Error text for refused deletion now lists IMPORTED (already allowed in the `ok` list) | pool-delete-diagnostic.test.ts | MERGE | Message-only; no policy change. |
| 39 | board-reader-lengths | 0352bca | 2 | packages/board/src/bytes.ts +1/-1; test/bytes-reader.test.ts +21 | `Reader.need` rejects non-safe-integer / negative n | bytes-reader.test.ts (2 tests) | MERGE | Real bug (NaN/negative bypass the bounds check), strictly tighter. |
| 40 | crockford-display-grouping | 5ca8b53 | 3 | packages/web/src/util/crockford.ts +1; test/crockford-grouping.test.ts +16 | `groupSymbols` throws RangeError for size not a positive safe integer | crockford-grouping.test.ts | MERGE | Display-only; callers use defaults only. |
| 41 | election-inspect-counters | 1cfc10d | 2 | packages/cli/src/cmd-election.ts +2/-1; test/election-inspect-counters.test.ts +33 | Log-type counter object is `Object.create(null)` | election-inspect-counters.test.ts | MERGE | Real (Low) bug, minimal; output shape unchanged. |

Head dates (all 2026-11-10, -0700): #32 17:17:51, #33 17:15:35, #34 17:16:31, #35 07:10:46, #36 09:15:47, #37 11:17:26, #38 12:15:16, #39 13:14:49, #40 15:10:16, #41 16:18:53.

None of the code diffs touches wire/signature/storage/protocol/crypto semantics, the strict comparator or its expected vectors. No secrets found in the code diffs; a grep of the wiki diff for token/secret/password/key found only prose.

## 2. Stacking / ancestry
- All ten branches have first-commit parent == merge-base == ab84f16. `git merge-base --is-ancestor` over all 90 ordered pairs: no branch is an ancestor of another. No stacking, despite the lane's prose ("stacked on PR #30" means based on ab84f16, which is the integration base).
- Ledger-only commits: #32 has 15 of 18 (all touch only docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md except 392e5e7, which edits ci.yml, and the 3 feature commits). #33 has 12 of 15 commits that are audit-ledger-only (docs/audits/...). #34 is 100% docs/wiki. #35-#41 contain only code+test commits (2-3 each, no ledger commits).

## 3. Conflict matrix
Files per branch (full): see table; the only non-code shared-style files are per-branch ledgers: #32 docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md, #33 docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md, #34 docs/handoffs/CHATGPT_DOCS_MAINTENANCE_LATEST.md + wiki/*. File sets are pairwise disjoint (verified from `git diff --name-only ab84f16...branch`).
- `git merge-tree --write-tree` run on all 45 unordered pairs: 45 clean, 0 conflicts.
- Cumulative simulation: not run as a chain (merge-tree on bare trees is not accepted and creating commits is outside my constraints). Because file sets are disjoint and every pair is clean, any order merges cleanly; textual three-way merges of disjoint files cannot conflict. Treat chain result as inferred, not executed.
- Ledger/wiki: no conflict among these ten. The newest ledger is docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md on #32 (61ddc6d, 2026-11-10 17:17:51 -0700); it exists only on #32 so nothing to reconcile. Against base-side changes after ab84f16 (not examined) conflicts are possible: UNVERIFIED.
- Same-package neighbours worth knowing (different files): server #33 config.ts, #35 imports.ts, #36 jobs.ts, #38 pool.ts; web #37 worker-sealer.ts, #40 crockford.ts.

Recommended merge order (all zero-conflict; ordered by value/risk, docs last):
39, 40, 41, 33, 35, 36, 37, 38, 32, 34.
Rationale: small test-first code fixes first; #32 adds a CI step and a large ledger, so after the fixes; #34 last because it narrates the others' state.

## 4. Review findings
Severity | PR | file:line | issue | suggested fix

- #32: Low | scripts/triage-verifier-report.mjs (new, `runCli`, around line 66-70 of the file) | `--input` path with no value falls to the "Unknown or incomplete argument" TypeError (good); but `JSON.parse` errors and file-read errors surface as exit 2 via the outer catch only when run as main (tested). No bug. | none.
- #32: Info | .github/workflows/ci.yml:73-74 (new step) | New CI step runs `node --test scripts/triage-verifier-report.test.mjs`; the step sits in an existing job. Ledger says strict comparator job already fails on this base (27/27 verdicts, 24/27 whole-report) - pre-existing, not caused by this PR. UNVERIFIED by me. | none; confirm CI job Node >= 18 (script uses `?.`, `node:test`).
- #32: Info | docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md (234 lines) | Ledger would land in the integration branch; it is a lane working log with PR-number cross references. | Merge as is or drop file at integration lead's discretion (no conflicts either way).
- #32: Info | scripts/triage-verifier-report.mjs summarizeComparatorReport | Validates input fields against what compare-verifiers.ts:74 emits (ok, cases, failures, rows[].id/ts_verdict/python_verdict/differences/skipped). Consistent. Tests would fail without the contradiction checks (static reasoning). | none.
- #33: no findings. packages/server/src/config.ts:191-192 now rejects Infinity; old `!(x>=1)` accepted Infinity, so the "Infinity" iterations of the test fail without the fix. Stricter only; defaults all finite (config.ts DEFAULT_RATE).
- #34: Low | wiki/Developer-Guide.md, wiki/Home.md, wiki/Auditor-and-Verifier-Guide.md | Pages cite draft PR numbers (#32,#35-#41), exact-head SHAs and CI run ids that become stale/misleading once merged or if some PRs are not merged (e.g. triage CLI documented but absent). | Merge last; if any of #32/#35-#41 is held, remove the matching paragraph in wiki/Developer-Guide.md.
- #34: Info | wiki/Voter-Guide.md, Home.md, Roadmap-and-Status.md | Claims were softened (e.g. "Anyone can check the result" -> proposed/unaudited). Direction is conservative. Pages also link to ab84f16-pinned blob URLs rather than main. | Owner skim; no technical issue.
- #35: no findings. packages/server/src/imports.ts:140 (new) throws signal reason; same pattern as imports.ts:64 and :81. Test fails without the fix because an empty buffer would fail elsewhere with a different error than `reason` (static reasoning).
- #36: no findings. packages/server/src/jobs.ts:104 (startJob moved into try). Before: startJob threw outside try, `run` rejected, job left queued, rejection stored in `current.done` (unhandled). After: catch calls finishJob(failed) which accepts state 'queued' (controldb.ts finishJob `state IN ('queued','running')`). Test asserts state failed, INTERNAL code, next job done, active==0: fails on old code. Note (Info): `startJob` itself silently no-ops if state is not queued; out of scope.
- #37: Low | packages/web/src/worker/worker-sealer.ts:29 (`new Worker(...)`) | Worker constructor throwing synchronously is still not handled (pre-existing; Promise executor would reject). | Optional: wrap construction in the same try/fail path.
- #37: no other findings; the double-settle possibility (message after error) is harmless for Promises; tests cover postMessage throw, messageerror, success.
- #38: no findings. packages/server/src/pool.ts:109 text-only; the `ok` list (line 108) already includes IMPORTED, so text and policy now agree. Test checks 409/STATE_CONFLICT (conflict() in problem.ts:67) and that markDeleted is not called.
- #39: no findings. packages/board/src/bytes.ts:142: old check `this.o + n > length` is false for NaN and negative n, so `raw(NaN)`/`raw(-1)` bypassed the underrun guard (cursor could move backwards/NaN). Fix tightens only; test covers boundaries. How raw() then updates the cursor: base code read at bytes.ts ~157-160, behaviour not executed (UNVERIFIED).
- #40: no findings. packages/web/src/util/crockford.ts:57. Size 0/negative gave an infinite loop (`i += size`); all in-repo callers (recovery.ts:14, crockford.ts:64,70) use the default 4, so no regression. Note: empty-string with bad size now also throws (intended by test).
- #41: no findings. packages/cli/src/cmd-election.ts:20: Object.create(null) so `constructor`/`toString` no longer read inherited functions (`types[t] ?? 0` previously produced strings). `__proto__` becomes an own key on a null-prototype object; JSON.stringify and Object.entries both emit it. Output shape unchanged.

Cross-cutting: no weakened checks, no wire/signature/storage change, no secrets. Each fix has a matching negative test; I reasoned each fails without its fix (not executed).

## 5. Lane's stated queue / claims (from ledger on #32, verbatim-short)
Last lane commit: #32 61ddc6d, Tue 2026-11-10 17:17:51 -0700 (= 2026-11-11 00:17:51 UTC). Section "scoped CLI qualification, audit rotation 13 and Wiki maintenance".
- Holds: "D-92-D-94 strict comparator full-report mismatch and B3-01 registration remain owner/protocol-held. The whole-report comparator must not be modified to force green." Strict TS/Python: 27/27 verdict agreement, 24/27 whole-report agreement (lane claim).
- Next: "First reconcile the new audit head's remaining exact-head CI, docs claims, and this handoff branch's ... workflows. Only then select the next isolated, decision-free import/replay/tally or trustee feature with a test-first regression, respecting active ownership and avoiding duplicate PRs."
- Earlier queue: "bounded import/replay/tally scheduling" (likely next), trustee CLI, encrypted backup rollback, accessible web flows (per continuation spec priority list). Audit rotation 13 selected packages/cli/src/cmd-vectors.ts (read-only, no finding recorded in ledger text I saw).
- Claimed/owned branches: all of chatgpt/zero-codex/*-20261110 incl. PRs #32-#41 (and #33 audit, #34 docs); it says it never edits #30 (ab84f16) or #31 (d5c79981, spec). Workers avoid: bounded import/replay/tally scheduling, trustee work, ledger/audit/wiki files.
- Ledger states "No automatic merge/release/deploy"; "QuietVote remains an unaudited experimental prototype, not for real elections"; "#40 ... held from integration by the unchanged strict comparator and owner approvals" (lane's own hold, applies to the whole lane since the comparator job fails on base).
- Lane rules file: docs/CHATGPT_ZERO_CODEX_CONTINUATION.md on origin/chatgpt/zero-codex-continuation-spec-20261109 (d5c7998, status "proposed"; advisory only).
