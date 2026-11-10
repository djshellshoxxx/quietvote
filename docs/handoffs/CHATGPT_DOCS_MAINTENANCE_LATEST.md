# ChatGPT documentation and wiki maintenance — latest

Date: 2026-11-10. **This was a distinct sequential documentation phase, not a third concurrently running ChatGPT worker/subagent.** No Codex, paid API or credit-consuming agents were used.

## Source and ownership

- Main: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`, which is not the consolidated prototype.
- Source snapshot reviewed: draft PR #30 head `ab84f16136184cb1fa0fa67b41e113424e134ba8`, based on main; latest protocol checkpoint `docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md`. PR #31 contains the proposed ChatGPT-only continuation rules.
- Isolated docs branch: `chatgpt/zero-codex/docs-wiki-sections-20261110` stacked on PR #30. Existing source PRs and owner branches remain unmodified.
- Work before this ledger: top-level wiki hubs added in commits `3af4cb8c15422cae9ab7b65f0b64b1786686adb6` and `bb3845d000d1fa19493f11ab87117b2b455b90c6`; navigation and obsolete-status corrections followed, most recent content commit `23185974d6a7df26d6cc86794d77215adc931a55`.

## Files changed

- New `wiki/User-Guide.md`: user roles, experimental availability, safe nonbinding use, FAQ/troubleshooting, accessibility, security limitations, explicit unfinished features.
- New `wiki/Developer-Guide.md`: architecture/prerequisites, npm/Python/CLI test commands, package/API/contract references, CI/debugging and review/release holds.
- `wiki/Home.md` and `wiki/_Sidebar.md`: prominently linked both exact section names, preserving older role-specific pages.
- `wiki/Roadmap-and-Status.md` and `wiki/Getting-Started-Dev.md`: corrected historical 2026-10-21 test claims; distinguished draft PR #30 evidence from main and unqualified release status.
- Fixed new or edited prototype-only file links to pinned PR #30 source SHA, rather than broken main URLs.

## Validation and limits

- GitHub connector retrieved the wiki directory at the docs branch and parsed all `[[Wiki Page]]` references in the four navigation/hub pages: **67 references, zero missing page targets** among **27 source wiki files**.
- Resolved ten pinned draft-only repository file paths via the GitHub connector: **10/10 existed**. This is a reference-presence check, not a full HTTP link crawler, Markdown renderer, claims-lint or spellchecker.
- No native build, CLI test suite, browser execution or GitHub Wiki publication occurred in this docs phase. Full docs/CI checks should be reviewed on the draft PR.
- `wiki/README.md` confirms `wiki/` is **version-controlled wiki source only**. The live GitHub wiki is a separate git repository and is **not automatically synchronized**. **No live wiki publication is claimed.** Publishing this docs branch to the wiki requires appropriate wiki access and deliberate synchronization after review.
- Code/regression changes are owned independently by PR #32 (strict diagnostic triage) and PR #33 (rate-config finite guard); neither was modified by this documentation work.

## Open documentation gaps and next actions

Audit remaining older role-specific wiki pages for stale typecheck/election/privacy claims and hardcoded main links; confirm actual GitHub wiki content before claiming it matches source. Re-run claims lint on the docs PR. Keep phase distinctions: **main=spec framework; PR #30=draft tested prototype; PRs #32/#33=draft proposals; release=none**. Preserve B3-01 and D-92–D-94 protocol holds. Never suggest real-election readiness or an external audit based on passing automated checks.

## 2026-11-10 follow-up — hosted documentation qualification

Source-pinned docs PR #34 head `591e1f47aa61651b12a4ccedd4200fdf8e776437`; base PR #30 head `ab84f16136184cb1fa0fa67b41e113424e134ba8`. Exact-head [claims lint workflow](https://github.com/djshellshoxxx/quietvote/actions/runs/42815420575) **completed with GitHub conclusion success** (one job), but its log executed `node scripts/lint-claims.mjs` and reported **20 findings in nine files, exit 1**. It is explicitly non-blocking, so the green workflow **does not mean the underlying claims scan was clean**. All 20 matches were historical/contextual in this run's inventory; no automatic textual changes to audit claims or security promises were made. The source-inventory and navigation evidence from the preceding section remains the bounded static check, not a newly run browser or live-wiki check.

This follow-up inspected the existing CI workflow and confirmed that `.github/workflows/ci.yml` excludes wiki/docs-only edits from standard CI, explaining the absence of a main build/test workflow on this docs branch; no test was suppressed by this docs PR. **No local markdown link crawler, build, browser test, or live wiki synchronization was executed in this follow-up.** New docs-only ledger commit changes provenance and will need its own check observation. The real GitHub wiki remains unchanged/unpublished.

**Next:** after PR #34's latest exact-head claims workflow finishes, review the 20 known contextual matches for newly introduced claims (none established), and obtain authorized wiki-publishing access before syncing User Guide, Developer Guide, Home and _Sidebar. Avoid asserting that public source wiki pages have been published in the live wiki. Keep separate owners' application/verification branches untouched.

## 2026-11-10 third pass — verifier CLI operator guidance

**Source and ownership:** main still `019f4e789be2ff38a5fb2d348c3b225cc87cf296`; PR #30 remains at `ab84f16136184cb1fa0fa67b41e113424e134ba8` and is not merged. Docs draft [PR #34](https://github.com/djshellshoxxx/quietvote/pull/34) remains isolated on `chatgpt/zero-codex/docs-wiki-sections-20261110`, stacked on #30. The second independent audit phase is on separate [PR #33](https://github.com/djshellshoxxx/quietvote/pull/33); new import-cancellation tests/fix are on separate [draft PR #35](https://github.com/djshellshoxxx/quietvote/pull/35), test-first `d34149977bf159e3d15e9808822503c869c4f5f9` and minimal fix `67683185aa9d3d218c054f75f291ad24b5a770a4`. No owner branches changed.

**Change:** `wiki/Developer-Guide.md` at `9ca437116c9f89aad8c48035f6202077043e8e72` now documents the **draft-only** strict comparator diagnostic CLI in PR #32: reproducible comparator JSON generation, diagnostic exit codes 0/1/2, separate strict result, deliberate non-equivalence of excluded capabilities, and the real [hosted 7/7 Node test evidence](https://github.com/djshellshoxxx/quietvote/actions/runs/42823551666). It explicitly states that diagnostic code is not on main or PR #30 and that the unresolved exact-report differences remain a failing gate. This is a source documentation update, not protocol-approval or release documentation.

**Checks and limits:** read the new CLI and test files at PR #32 head `f9960ffc49d4b4fe4b72b39abcea45332ae93489`; its CI completed **10 successful / 1 failed** jobs, with the intentional strict TS/Python comparator failure. Read the latest docs-head [claims run 42823226278](https://github.com/djshellshoxxx/quietvote/actions/runs/42823226278): workflow completed success, but the existing non-blocking claims-lint findings are not claimed cleared. New docs-guide/ledger commit(s) require fresh exact-head check observation. No new full wiki link crawl, local browser execution, test suite, or rendered live wiki verification was performed in this pass. Existing Home/sidebar top-level **User Guide** and **Developer Guide** links were preserved, not redesigned. **Live GitHub wiki still requires deliberate publication; no wiki write occurred.**

**Next:** qualify the exact new docs head, inspect remaining role-specific wiki pages for source drift, preserve negative/positive verifier traceability, and defer any live wiki sync until authorized and supported. The wiki docs and status must never imply QuietVote is safe for binding or real elections. No concurrent third worker was spawned; this was a separate sequential maintenance phase.
