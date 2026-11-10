# QuietVote ChatGPT Zero-Codex Continuation Specification

Status: proposed. This specification guides ChatGPT scheduled runs when enabled; it is not a credit detector, identity enforcement mechanism, or permission to bypass approval gates.

## Objective
Continue QuietVote engineering through direct ChatGPT GitHub connector and available execution tools without Codex, Codex CLI/cloud, paid OpenAI API, or credit-consuming agents. ChatGPT and GitHub Actions may have separate usage limits and charges.

## Repository reality
The main README describes an early specification framework; more recent draft PR #30 contains a substantial prototype. Always inspect main, the latest PRs, docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md, instructions, and exact branch heads before selecting work. Do not treat draft changes as merged or protocol approved.

## Ownership and coordination
Use dedicated implementation branches under `chatgpt/zero-codex/` and a progress ledger at `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md`. The ChatGPT-only lane is an advisory ownership convention. Do not overwrite, rebase, close, merge, or edit branches and PRs owned by other agents. Do not interfere with active Claude/Codex work. Inspect changed files and CI before each slice.

## Sequential priority queue
1. Reconcile non-cryptographic, decision-free implementation and CI gaps from PR #30, including strict TypeScript/Python verifier report differences, without altering expected semantics to force green tests.
2. Improve import/replay/tally scheduling, bounded resources, cancellation, recovery and observability without changing cryptographic or election protocol guarantees.
3. Harden trustee CLI, encrypted backup rollback, recovery UX, portable Windows behavior, and automated tests.
4. Improve accessible web flows, offline verification responsiveness, signed-share retry, localization and human-readable error handling.
5. Extend test coverage, fuzz/property tests, CI provenance, security reviews, and documentation.
6. Prepare integration/release evidence while keeping protocol and security approval gates explicit.

## Non-negotiable holds
B3-01 registration and D-92–D-94 verifier semantics have conflicting approval records and require owner decisions and protocol/security review. Do not invent a resolution, modify protocol wire/signature/storage/migration semantics, weaken strict comparator or tests, or claim anonymity, election integrity, independent audit, or production readiness. Work on independent tasks while held.

## Each scheduled run
- Inspect previous run's handoff and active GitHub PR/CI status first. If an earlier task is still active or CI pending, avoid duplication; defer until next hourly invocation rather than launching competing work.
- Select the highest-priority unblocked slice; finish and qualify it before proceeding sequentially.
- Follow AGENTS.md and nested instructions, docs/SPEC-INDEX.md, the current handoff, security rules, DCO requirements and existing project conventions.
- Add a failing regression test before a bug fix; implement minimally; run available typecheck, unit/property and integration tests, plus hosted CI when supported.
- Commit on isolated branch and open/update a draft PR. Report precisely which checks ran and which did not; never fabricate evidence.
- Record current base/head SHAs, changed files, tests and CI links, remaining work, blocked approvals, conflicting PRs and exact next steps in the handoff.
- No automatic merge, release, deployment or changes to approval-gated protocol without explicit authorization.
- Continue on the next scheduled invocation until all independent features are as complete as possible. A blocked feature must not block unrelated tasks.

## Completion
A feature is complete only after its code, negative tests, docs, relevant CI and approvals pass. Near-complete means remaining external gates are individually documented with evidence and owner. Do not invent completion percentages. The repository file alone does not start a timer.
