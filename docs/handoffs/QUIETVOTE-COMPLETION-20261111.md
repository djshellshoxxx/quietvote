# QuietVote completion cycle handoff — 2026-11-11

**Stopped early at the owner's instruction. QuietVote remains an unaudited prototype, not for real elections. Nothing was merged to `main`, released or deployed. No mandatory release criterion is met.**

This cycle was asked to complete the project. It did not. It consolidated the open work, produced an evidence-based inventory, added tooling and a few approved fixes, and found new defects. Then the owner paused every project except five others, and a usage limit ended most of the agents. This document says exactly what exists, what was verified, and what was not.

## 1. Where things are

| Item | Value |
|---|---|
| Integration branch | `claude/wonderful-hypatia-9yszin` |
| Draft pull request | [#42](https://github.com/djshellshoxxx/quietvote/pull/42), stacked on the PR #30 branch `codex/quietvote-milestone-20261109` at `ab84f16` |
| `main` | `019f4e7`, documentation only, unchanged |
| Landing order | PR #30 into `main`, then #42. Together they carry the whole prototype. |
| Superseded by #42 | PRs #32 to #41 (their heads are merged here; the PRs were left open and untouched) |
| Not included, on purpose | #2 and #21 (obsolete documentation), #23 (same tree as #24), #31 (process note for another agent lane) |

Why it stopped: the owner told the coordinating session at 01:00 and 01:01 UTC on 2026-11-11 to stop all projects except five, let workers finish what they were doing, update GitHub, and stop. QuietVote is not one of the five. Separately, eight agents were terminated by a usage limit shortly before that message arrived (section 4).

## 2. What this cycle added

In commit order on the integration branch:

1. **Ten merges** of the open `chatgpt/zero-codex/*` pull requests (#39, #41, #35, #36, #38, #33, #37, #40, #32, #34), each with `--no-ff` at its head after a diff review and its targeted tests.
2. **`scripts/trace.mjs`**: requirement traceability report (approved item N-23c, report-only). It parses the requirement tables, reads `@verifies` annotations and `trace/links.json`, and fails `--check` on unknown IDs, dangling evidence paths or a "tested" status with no test.
3. **`scripts/check-deps.mjs` and `scripts/check-links.mjs`**: package layering and dependency allowlist check (QV-08 section 5.1, QV-ADR-024, D-85), and an offline Markdown link check. Wired into CI with first-party actions only. One real finding was fixed (`typescript` was imported by web tooling without being declared); one is recorded as owner decision D-97.
4. **`trace/`**: one status row for each of the 730 requirement IDs, with machine-checked evidence paths (section 5).
5. **Governance files with an honest empty state** (approved item N-08b): `MAINTAINERS.md`, `docs/RELEASE-KEYS.md`, `docs/LICENSE-NOTE.md`, `CHANGES.md`. `CONTRIBUTING.md` and `SECURITY.md` no longer claim an enforced DCO check or a working security contact. Claims lint went from 29 findings to 0 by inline markers on quotes, citation titles and negations only.
6. **Four approved web fixes** (N-20, B3-28, B3-06 decision-free part, W7): see [the web fixes report](../reports/web-fixes-20261111.md).
7. **Inventory and review records**: [docs/reports/inventory-20261111/](../reports/inventory-20261111/) and [docs/audit/2026-11-11/](../audit/2026-11-11/README.md).

No protocol, wire format, vector, domain-separation label or verdict rule changed. No dependency was added.

## 3. Verification

Environment: Linux, Node 22.23.4, npm 10.9.9, Python 3.13.18, `npm ci --ignore-scripts --no-fund`, 4 cores.

| Check | Baseline `ab84f16` | Integration head (see section 3.1) |
|---|---|---|
| `npm run typecheck` | pass | pending, see 3.1 |
| Workspace tests | 907 run, 907 pass, 0 fail, 0 skipped | pending, see 3.1 |
| Python unit tests | 58 pass | pending, see 3.1 |
| TypeScript vectors | 412 of 412; one DKG file not run | pending, see 3.1 |
| Python vectors | 229 pass, 0 fail, 53 not implemented | pending, see 3.1 |
| Production web build, i18n check | pass | pending, see 3.1 |
| Lockfile lint, `npm audit --audit-level=high`, licence snapshot, action pins | pass | pending, see 3.1 |
| Strict verifier comparison | **exit 1**: 27 of 27 verdicts agree, 3 reports differ (held decisions D-92 to D-94) | pending, see 3.1 |
| Claims lint | exit 1, 20 findings | exit 0, 0 findings (see item 5 above) |
| Tooling tests, `deps:check`, link check, `trace --check` | not present | pending, see 3.1 |
| Five required browser journeys in Chromium | not run | pass, exit 0, at `4cb2f9a` and again with the web fixes applied |

The strict verifier comparison is expected to fail and is not suppressed. Browser journeys were run with the pre-installed Chromium through `QV_CHROMIUM`; they are automated checks, not WCAG or assistive-technology acceptance, and they use the pinned Playwright 1.57.0 against a newer Chromium build than the one it pins.

### 3.1 Exact head for the right-hand column

A full qualification of commit `946b120` (the last commit that changes code) was still running when this document was first committed. If this sentence is still here, the result was not recorded in the repository: use the description of pull request #42.

Hosted CI on #42: not yet read when this document was first committed.

## 4. What the agents produced

Twenty-three agents were started in two waves, each in its own Git worktree where it wrote files. Models and prompts are not recorded in the repository.

| Agent task | Outcome | Integrated |
|---|---|---|
| Eight read-only inventories (crypto and protocol, board and verifiers, server, trustee and CLI, web, product specs, decision ledger, process specs) | All completed | Yes: `trace/links.json` and `docs/reports/inventory-20261111/` |
| Dependency-boundary and link checkers | Completed | Yes, after coordinator review and a known-deviation ratchet |
| Governance files and claims dispositions | Completed | Yes |
| Approved web fixes | Completed | Yes, after coordinator diff review, 243 web tests and the browser journeys |
| Confidentiality and custody review (S3) | Completed | Report and proofs of concept in `docs/audit/2026-11-11/` |
| Eligibility and duplicate-vote review (S1) | **Terminated by a usage limit before its report** | Two proofs of concept recovered and reproduced by the coordinator |
| Tally integrity review (S2) | **Terminated before any output** | Nothing. This scope was not reviewed. |
| Verifier and board fuzz tests | **Terminated before any output** | Nothing |
| Randomized election harness | **Stopped by a machine restart** after the pause; two helper modules written, no test | No. Preserved unreviewed in [wip-20261111/](wip-20261111/README.md) |
| Server concurrency and duplicate-vote tests | **Stopped by the restart**; exploration scripts only | No. Scripts preserved in the same directory |
| Privacy canary tests | **Stopped by the restart**; two helper modules written, no test | No. Preserved unreviewed in the same directory |
| Server entry point and self-host packaging | **Terminated at start** | Nothing |
| Approved server fixes (B2-12, invite TTL, IPv6 /56, stale idempotency marker, CORS preflight) | **Terminated at start** | Nothing |
| CLI read-only commands and `qv trustee` passthrough | **Terminated at start** | Nothing |
| Cross-package end-to-end election and tamper tests | **Terminated at start** | Nothing |
| Trustee CLI defect D-A and command coverage | **Terminated at start** | Nothing |

No replacement was started for any terminated agent, and the three stopped by the restart were not resumed, because the stop instruction had arrived.

## 5. Inventory and completion numbers

Method: each of the 730 requirement IDs defined in the current specifications got a status from an AI-assisted read of the spec, code and tests at `ab84f16`. "Covered" means status `implemented_tested` with at least one existing test file linked. It is a link check. It is not proof that a test is sufficient, and it is not an independent audit. Regenerate with `node scripts/trace.mjs --write`; details in [trace/summary.md](../../trace/summary.md) and [trace/gaps.md](../../trace/gaps.md).

- 592 of the 730 requirements are Must. 62 of those need people or third parties (external review, counsel, native translation, assistive-technology testing, ongoing process) or are deferred out of v1.
- **166 of the remaining 530 Must requirements are covered: 31%.**
- All requirements by status: partial 248, implemented and tested 175, not implemented 143, implemented but untested 53, process 36, external 34, deferred 24, blocked on a decision 17.

By workstream, Must requirements covered over Must requirements in engineering scope:

| Workstream | Specs | Covered |
|---|---|---|
| Voting engine and cryptography | QV-16, QV-20, QV-05 | 20 of 23, 9 of 10, 6 of 13 |
| Tally and result verification | QV-18, QV-35, QV-34 | 11 of 23, 2 of 9, 1 of 12 |
| Identity and eligibility | QV-04 | 5 of 15 |
| Privacy and data lifecycle | QV-06, QV-26 | 2 of 12, 0 of 9 |
| Proposals and governance | QV-02, QV-03 | 18 of 49, 3 of 13 |
| Backend and persistence | QV-09, QV-08, QV-29, QV-28, QV-31 | 12 of 17, 8 of 25, 4 of 19, 2 of 18, 1 of 10 |
| Frontend and user experience | QV-19, QV-13, QV-10 | 11 of 28, 11 of 44, 4 of 21 |
| Trustees and CLI | QV-17 | 8 of 20 |
| Security requirements | QV-07, QV-33 | 23 of 51, 0 of 5 |
| Operations and deployment | QV-12 | 1 of 9 |
| Testing, traceability, process, release | QV-11, QV-24, QV-30, QV-27, QV-25, QV-01 | 0 of 14, 0 of 10, 4 of 26, 0 of 11, 0 of 5, 0 of 6 |

The rows were classified before this cycle's tooling existed, so a handful (for example the layering requirements in QV-01 and QV-08 that `check-deps` now enforces) are stale on the pessimistic side. No row was upgraded without a re-read.

What the numbers mean in plain terms:

- **The cryptographic core is the strongest part.** Ballot encryption, proofs, threshold decryption, tally rules and the verification algorithm are implemented and tested, with frozen vectors and a second verifier in Python for a subset.
- **The application around it is incomplete.** There is no way to start the server (it is a library with no entry point, container or service unit). Twenty-two administrative workflows have no command-line tool. In the web client, one workflow runs against the real server, nine are proven only against fakes, six are local-only, one is blocked (registration, B3-01) and eight are missing. No test drives the browser client against the real server.
- **Governance features are mostly absent.** Group rules, proposals, amendments, disputes, roll amendment and revocation are specified but not built.
- **Voting methods in code:** yes/no, single choice, approval and k-of-n. Ranked, weighted and delegated voting are out of v1 by specification. See [product.model.md](../reports/inventory-20261111/product.model.md) for the voting model with citations.
- **Assurance level:** by the project's own ladder in QV-11 the repository cannot claim level L-0. See [process.gates.md](../reports/inventory-20261111/process.gates.md).

Detailed tables with status, verified functionality, remaining requirements, defects, dependencies, security implications, effort estimates and acceptance criteria are in the `*.features.md` files. The command-line surface is in [trustee-cli.commands.md](../reports/inventory-20261111/trustee-cli.commands.md) and the GUI workflow matrix in [web.workflows.md](../reports/inventory-20261111/web.workflows.md); together they are the GUI and CLI parity record.

## 6. Open findings

Listed in full in [docs/audit/2026-11-11/README.md](../audit/2026-11-11/README.md). In short:

- **S1-01 (Medium):** with a roll pinned in the manifest, one invitee or one absent member blocks the election from opening. Reproduced. Needs decision D-99.
- **S1-02 (Medium):** a cast that reuses the ciphertexts of a published test ballot is admitted and counted. Reproduced. A server admission check would fix it without touching verifier rules.
- **S3-01 (Low):** ballot timestamps on the public board have second precision; the spec promises minutes.
- **S3-02 (Info).**
- From the inventories: trustee tool defect D-A, trustee and server record mismatches D-B and D-C, zero-seed receipts B2-12 (approved fix not implemented), small-roll validation gap, a reported cross-organization admin scope that was not reproduced.

**Tally integrity was not reviewed in this cycle, and the eligibility review is partial.** Earlier AI-assisted reviews are in `docs/audit/`; none is an independent audit.

## 7. Decisions only the owner can make

1. **Registration contract B3-01** and the pinned-roll rule **D-99**, together. The decision log (QV-ADR-028) records an approval of the hashed-invite contract; later handoffs kept it held because the stored hash would itself be a usable credential. Packet: [registration-decision-20261109.md](../reports/registration-decision-20261109.md). Until decided, no voter can register through the real web client.
2. **Verifier report semantics D-92 to D-94.** QV-ADR-027 approved "stop, not run, empty results" (the TypeScript behaviour); a same-day note recommended the opposite. Saying which governs lets the Python verifier be aligned and the strict comparison pass. D-95 and D-96 are related.
3. **D-97** layer order, **D-98** small-roll rule, **D-100** DCO attestation: see [OPEN-DECISIONS section J](../plan/OPEN-DECISIONS.md).
4. The remaining approved-but-unimplemented and still-open items, with one question each, are in [ledger.tasks.md](../reports/inventory-20261111/ledger.tasks.md) part B. Of the 50 items in the 2026-11-04 register, a code check found 2 implemented, 11 partly, 6 needing no code and 31 not implemented ([ledger.decisions.md](../reports/inventory-20261111/ledger.decisions.md)).

External gates are unchanged: independent cryptographic and security review, native translation review, assistive-technology qualification, counsel, release keys and maintainers.

## 8. How to continue

Decision-free work, in priority order, with files and acceptance checks already written down:

1. Fix S1-02 at server admission (proof of concept and required test are in the findings file).
2. The approved server fixes: B2-12, invite lifetime default, IPv6 /56 buckets, stale idempotency marker ([ledger.tasks.md](../reports/inventory-20261111/ledger.tasks.md) rows T1, T4, T5, T8).
3. A cross-package end-to-end election and tamper test (row T2). Expect it to hit D-B and D-C.
4. A server entry point with configuration, health check, graceful shutdown and self-host files ([server.tasks.md](../reports/inventory-20261111/server.tasks.md)).
5. Read-only CLI commands and the `qv trustee` passthrough; trustee defect D-A and CLI coverage ([trustee-cli.tasks.md](../reports/inventory-20261111/trustee-cli.tasks.md)).
6. Randomized election, concurrency, privacy canary and fuzz tests (none landed; partial helpers are in [wip-20261111/](wip-20261111/README.md)), then a tally integrity review.
7. Apply the proposed QV-09 section 3.2 text for N-20 from the web fixes report.

Qualification commands, run from a clean checkout:

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
for w in crypto board protocol verifier cli trustee server web; do npm test -w "@quietvote/$w"; done
npm run tools:test && npm run deps:check && npm run links:check && npm run trace:check
node --test .github/scripts/*.test.mjs && node .github/scripts/check-action-pins.mjs
(cd verifier-py && python3 -I -m unittest)
npm run vectors:check
python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --quiet
npm run build -w @quietvote/web && npm run i18n:check -w @quietvote/web
node scripts/compare-verifiers.ts --json   # expected exit 1 until D-92 to D-94 are decided
npm run lockfile:lint && npm audit --audit-level=high
node scripts/lint-claims.mjs
QV_CHROMIUM=/path/to/chromium bash .github/scripts/run-browser-journeys.sh
```

Working rules that held up in this cycle: one worktree and one `npm ci` per worker (never share `node_modules`; the workspace links would point at the wrong tree), an explicit file ownership list per worker, workers do not commit, the coordinator reviews each diff and reruns the tests before committing, a failing proof of concept is kept as a `.repro.ts` file outside the test glob, and nothing that changes vectors, labels, wire formats or verdict rules is done without an owner decision.

## 9. Deliverables requested and their state

| Requested | State |
|---|---|
| Consolidated implementation, updated repository | Partly: branch and draft PR #42; `main` untouched |
| Reviewed and merged pull requests | Ten source PRs merged into the integration branch after review; nothing merged to `main` |
| Feature completion percentages and remaining-work inventory | Done as described in section 5 |
| Voting correctness report; tally verification results | Baseline and head test receipts only. No new tally review and no randomized harness: neither finished |
| Eligibility and duplicate-vote test results | Partial review with two open, reproduced findings. The new concurrency tests did not land |
| Privacy and threat-model assessment | S3 review complete with one Low finding. The canary tests did not land |
| Security review findings | Section 6 |
| Performance and concurrency results | Not done; the 2026-11-04 baseline in `docs/reports/` is the latest |
| GUI and CLI parity matrix | Inputs recorded (section 5); no single merged matrix |
| Deployment verification | Not done; nothing deployable exists yet |
| README, specifications, wiki | Governance files and status pointers only |
| TODO lists and changelog | `CHANGES.md` created; `docs/plan/TODO.md` not refreshed, use the inventory |
| Release readiness assessment | Not ready for any release; below L-0 on the project's ladder |
| Remaining blockers; continuation instructions | Sections 6 to 8 |
