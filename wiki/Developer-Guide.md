# Developer Guide

> **Draft prototype only.** This page indexes reviewed source documentation; it does not approve cryptographic/protocol semantics. Main and [draft PR #30](https://github.com/djshellshoxxx/quietvote/pull/30) are not interchangeable.

## Architecture and prerequisites

Read [[Architecture Overview]], [[Repository and Packages]], [[Cryptographic Protocol Summary]], [[Bulletin Board Summary]], [[Security Model and Threats]] and [[Specification Index]]. The prototype comprises eight npm workspaces (`crypto`, `protocol`, `board`, `server`, `trustee`, `verifier`, `cli`, `web`) plus `verifier-py/`. The network/data contracts are **draft** [QV-09](https://github.com/djshellshoxxx/quietvote/blob/main/docs/09-api-data-contracts.md), [QV-16](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/16-crypto-protocol.md), and [QV-35](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/35-second-verifier.md). Protocol approvals are not inferred from implementation.

Node **>=22.18** and npm are specified in the prototype root `package.json`. Python 3 is needed for the independent verifier. See [[Getting Started Dev]].

## Local development and CLI checks

Use a local checkout of the **intended branch**; do not assume code in the draft prototype exists on `main`.

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm test --workspaces --if-present
node --test .github/scripts/*.test.mjs
npm run vectors:check
python3 -I verifier-py/qv_verifier vectors test-vectors/v1
node scripts/compare-verifiers.ts --json
npm run build -w @quietvote/web
```

The strict comparator can exit **1** on known D-92–D-94 differences. Record the failure; never disable or normalize it to manufacture green CI. On **separate draft [PR #32](https://github.com/djshellshoxxx/quietvote/pull/32) only** (not main or PR #30), an optional read-only diagnostic CLI can classify the same JSON discrepancies:\n\n```sh\nnode scripts/compare-verifiers.ts --json > comparator.json\nstrict_status=$?\nnode scripts/triage-verifier-report.mjs --input comparator.json\ntriage_status=$?\nprintf 'strict=%s triage=%s\\n' "$strict_status" "$triage_status"\n```\n\nThe triage CLI exits 0 for a consistent report with zero mismatches, **1** for differences and **2** for bad/inconsistent input; Python exclusions never count as agreement. Its [source-pinned test file](https://github.com/djshellshoxxx/quietvote/blob/f9960ffc49d4b4fe4b72b39abcea45332ae93489/scripts/triage-verifier-report.test.mjs) passed **7/7** in hosted [CI 42823551666](https://github.com/djshellshoxxx/quietvote/actions/runs/42823551666), while the unchanged strict comparator failed on three differing reports out of 27. This is diagnostic evidence, not protocol approval, a green CI result, or an independently audited verifier.\n\nConsult `packages/cli/README.md` and `packages/cli/src/main.ts` on the chosen branch for current `qv` command usage rather than assuming all commands are implemented.

## APIs, tests, debugging and security

Use [[Testing and Conformance]] for qualification context and the package `NOTES.md` files for gaps. CI runs a platform/Node matrix, browser journeys, vectors and supply-chain gates in the prototype; current run results belong to the exact PR head, not to main. Look up the failing job's logs and reproduce locally with the same SHA, Node, npm and Python. For web troubleshooting, note browser CSP, storage isolation and unconfirmed receipt states; for import/trustee issues, preserve audit evidence and avoid unsafe key-recovery shortcuts.

Follow [[Contributing]], [CONTRIBUTING.md](https://github.com/djshellshoxxx/quietvote/blob/main/CONTRIBUTING.md), [SECURITY.md](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/SECURITY.md), [engineering standards](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/30-engineering-standards.md), and the [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md). Sign off commits, add negative regressions before fixes, use isolated branches and draft PRs, and avoid making approval-gated protocol changes.

## Contribution, release and outstanding work

The [implementation handoff](https://github.com/djshellshoxxx/quietvote/blob/codex/quietvote-milestone-20261109/docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md) records next work, exact evidence and remaining review requirements. Major outstanding gates include B3-01 registration, D-92–D-94 verifier semantics, external crypto/security review, unfinished scheduling/recovery, assistive-technology testing and translation review. **No authorized merge, release or deployment** is inferred from a passing unit test or draft PR. Release policy and traceability are drafted in [QV-27](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/27-project-governance-release.md) and [QV-24](https://github.com/djshellshoxxx/quietvote/blob/ab84f16136184cb1fa0fa67b41e113424e134ba8/docs/24-traceability-matrix.md). Do not publish production-readiness statements.
