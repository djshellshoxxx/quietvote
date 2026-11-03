# @quietvote/cli: implementation notes

## Verifier import vs. dependency rule D1 (open finding, 2026-10-21)

**Rule.** `docs/08-architecture-deployment.md` §5.1 D1: "Imports flow strictly downward ... `{server, web, cli, trustee, verifier}`.
No cycles; **L3 packages never import each other**." QV-08-REQ-002 makes violations fail CI (`deps-boundaries` job; no such
script is present in this checkout, so the rule is not mechanically enforced here).

D5 (verifier must not import `cli`) is **not** violated: the verifier does not import the CLI. The violation is one-way,
`cli -> verifier`, and it is a D1 violation.

**Current imports of `@quietvote/verifier` in this package (all in-process):**

| File | Symbols | Purpose |
|---|---|---|
| `src/cmd-verify.ts` | `verifyWithSelfTest`, `runSelfTest`, `formatReport`, `exitCodeFor` | `qv verify`, `qv selftest` |
| `src/common.ts` | `loadBundle` | strict bundle loader used by `loadBundleFile` (`qv election inspect`, `qv ballot encrypt`) |
| `src/cmd-board.ts` | `verifyBundle` with `extraAuthorKeys`, `pinnedCheckpoint` | `qv board verify` |
| `src/cmd-vectors.ts` | `verifyBundle` | `qv vectors check` |

**Why no minimal fix is implemented here.** The scope for this change was `packages/cli` only, and the candidate fixes do not fit that scope:

1. *Spawn `qv-verify` as a child process.* `qv-verify` (`packages/verifier/src/bin.ts`) accepts only one bundle, `--json`,
   `--skip-selftest` and `--manifest-hash`. It has no board anchor options (`--author-key`, pinned checkpoint for `board verify`),
   no bundle-loader entry for the ballot/election commands, and its `--selftest` text differs from `qv selftest`. Making the CLI
   a true front-end would change output and exit contracts for four commands and needs new flags in `packages/verifier`.
2. *Re-implement the composition inside `cli` on `protocol` + `board`.* This is allowed by D1, but it creates a second verdict
   pipeline in the CLI. The verifier's purpose is to be the single independent check (QV-08 D5, ADR-001 principle 1), so a
   copy that can drift is worse than the import.
3. *Move `verifyBundle` / `loadBundle` into `protocol` or `board`.* That changes the verifier's package boundary and needs an
   owner decision on the verifier's identity.

**Recommended owner decision (cheapest option that keeps the independence guarantee).** Amend D1 to allow exactly one
L3 front-end edge, `cli -> verifier` (the verifier's own independence is protected by D5, which already holds). Alternatively,
pick option 1 with the verifier package extended to the needed flags, which is a larger change.

**Until decided.** The import stays. It is a known, recorded violation of D1. Do not treat `packages/cli` as D1-compliant.

**Test status at time of writing.** `npm run typecheck` exit 0; `npm test -w @quietvote/cli` 17/17 pass (after `npm ci --ignore-scripts`;
the first run without installed workspace links failed to resolve `@quietvote/crypto`, which is an environment issue, not this finding).
