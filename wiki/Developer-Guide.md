# Developer Guide

> **Draft prototype only.** This page indexes reviewed source documentation; it does not approve cryptographic/protocol semantics. Main and [draft PR #30](https://github.com/djshellshoxxx/quietvote/pull/30) are not interchangeable.

## Architecture and prerequisites

Read [[Architecture Overview]], [[Repository and Packages]], [[Cryptographic Protocol Summary]], [[Bulletin Board Summary]], [[Security Model and Threats]] and [[Specification Index]]. The prototype comprises eight npm workspaces (`crypto`, `protocol`, `board`, `server`, `trustee`, `verifier`, `cli`, `web`) plus `verifier-py/`. The network/data contracts are **draft** [QV-09](https://github.com/djshellshoxxx/quietvote/blob/main/docs/09-api-data-contracts.md), [QV-16](https://github.com/djshellshoxxx/quietvote/blob/main/docs/16-crypto-protocol.md), and [QV-35](https://github.com/djshellshoxxx/quietvote/blob/main/docs/35-second-verifier.md). Protocol approvals are not inferred from implementation.

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

The strict comparator can exit **1** on known D-92–D-94 differences. Record the failure; never disable or normalize it to manufacture green CI. Consult `packages/cli/README.md` and `packages/cli/src/main.ts` on the chosen branch for current `qv` command usage rather than assuming all commands are implemented.

## APIs, tests, debugging and security

Use [[Testing and Conformance]] for qualification context and the package `NOTES.md` files for gaps. CI runs a platform/Node matrix, browser journeys, vectors and supply-chain gates in the prototype; current run results belong to the exact PR head, not to main. Look up the failing job's logs and reproduce locally with the same SHA, Node, npm and Python. For web troubleshooting, note browser CSP, storage isolation and unconfirmed receipt states; for import/trustee issues, preserve audit evidence and avoid unsafe key-recovery shortcuts.

Follow [[Contributing]], [CONTRIBUTING.md](https://github.com/djshellshoxxx/quietvote/blob/main/CONTRIBUTING.md), [SECURITY.md](https://github.com/djshellshoxxx/quietvote/blob/main/SECURITY.md), [engineering standards](https://github.com/djshellshoxxx/quietvote/blob/main/docs/30-engineering-standards.md), and the [decision log](https://github.com/djshellshoxxx/quietvote/blob/main/docs/decision-log.md). Sign off commits, add negative regressions before fixes, use isolated branches and draft PRs, and avoid making approval-gated protocol changes.

## Contribution, release and outstanding work

The [implementation handoff](https://github.com/djshellshoxxx/quietvote/blob/codex/quietvote-milestone-20261109/docs/handoffs/QUIETVOTE-NEXT-PHASE-20261109.md) records next work, exact evidence and remaining review requirements. Major outstanding gates include B3-01 registration, D-92–D-94 verifier semantics, external crypto/security review, unfinished scheduling/recovery, assistive-technology testing and translation review. **No authorized merge, release or deployment** is inferred from a passing unit test or draft PR. Release policy and traceability are drafted in [QV-27](https://github.com/djshellshoxxx/quietvote/blob/main/docs/27-project-governance-release.md) and [QV-24](https://github.com/djshellshoxxx/quietvote/blob/main/docs/24-traceability-matrix.md). Do not publish production-readiness statements.
