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
