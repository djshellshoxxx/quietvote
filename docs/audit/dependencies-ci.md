# Dependencies and supply-chain gates: DEP-01, DEP-02 (2026-10-21)

**AI-assisted review, not independent audit.** This is an AI-assisted review of the repository as checked out in this session. It is not an independent professional audit and gives no assurance of security. QuietVote is unaudited and not for real elections.

Note on file name: the audit index (`docs/audit/README.md`) names `dependencies.md` for this scope, but that file is not present in this checkout. This report is `docs/audit/dependencies-ci.md`; rename it if the audit PR adds `dependencies.md`.

## Scope

- `.github/workflows/ci.yml` (CI gates)
- `scripts/lockfile-lint.mjs` (new), root `package.json` script `lockfile:lint`
- `package-lock.json` and `packages/cli/package.json` (one workspace dependency declaration)
- Not in scope: dependency upgrades, new dependencies, `npm audit signatures` (see open items).

## Threat model (dependency and CI scope)

- **Assets:** the integrity of the installed dependency tree that CI builds and tests, and of the CI pipeline itself.
- **Trust boundaries:** pull request (lockfile contents are attacker-controllable from a fork PR) to CI runner; npm registry (`https://registry.npmjs.org/`) to the lockfile to `npm ci`.
- **Adversaries:** (a) a contributor or dependency-update PR that points a `resolved` URL at another host, a git repository, or a local file, so the tarball is not the registry artifact; (b) a lockfile entry with its `integrity` removed, so a substituted tarball is not detected; (c) a published package version with a known high or critical advisory entering the tree.
- **Assumptions:** the registry serves the tarball that matches its published `integrity` value; the npm advisory database is current enough for `npm audit`; GitHub-hosted runners are trusted.
- **Failure modes:** a lockfile source that is not a registry entry could bypass a check that only reads `resolved`; an advisory without a fix would still fail the high gate (blocking, by design); `npm audit` needs network access to the registry (a registry outage fails the job rather than passing it silently).

## Findings

| ID | Severity | Evidence (file:line) | Remediation | Verification status |
|---|---|---|---|---|
| DEP-01 | low | `packages/cli/src/cmd-board.ts:4`, `packages/cli/src/cmd-vectors.ts:15`, `packages/cli/src/cmd-verify.ts:1`, `packages/cli/src/common.ts:3` import `@quietvote/verifier`; `packages/cli/package.json` (before this change) listed only `@quietvote/board`, `@quietvote/crypto`, `@quietvote/protocol` as dependencies. The lockfile had a workspace link for the verifier but no declaration in the CLI package. | Declare `"@quietvote/verifier": "*"` in `packages/cli/package.json`, matching the sibling workspace declarations; refresh `package-lock.json` for the workspace link only. | **Fixed (declaration).** `npm install --package-lock-only --ignore-scripts` changed one line in the lockfile: the `packages/cli` entry gained `"@quietvote/verifier": "*"` (no other lockfile change; compared with a pre-change copy). `npm test -w @quietvote/cli`: 29/29 pass. No regression test added: the repo has no manifest-vs-import check. Open: the D1 layering question (`cli -> verifier`) is unchanged; see `packages/cli/NOTES.md`. |
| DEP-02 | medium | `.github/workflows/ci.yml` (before this change) had no `npm audit` and no lockfile check. `docs/30-engineering-standards.md:137` and `:152` and `docs/19-client-supply-chain.md:248` (P11) call for both. | Added to the `typecheck-test` job, gated to `ubuntu-24.04` with node 22: `npm run lockfile:lint` before `npm ci`, and `npm audit --audit-level=high` after it (blocking for high and critical). `scripts/lockfile-lint.mjs` (Node built-ins only) fails on: a `resolved` URL not starting with `https://registry.npmjs.org/`; a registry entry without an `integrity` field or with a non-`sha256/384/512` value; any `git`, `file`, `link`, `http(s)` or path source in `resolved`, `version` or dependency specifiers; a `node_modules` entry with no source. Workspace links are allowed only as `packages/<name>`. | **Fixed (gates added; first run in GitHub Actions not executed here).** Local runs: `node scripts/lockfile-lint.mjs` on the real lockfile: OK (32 registry entries with https and integrity, 8 workspace links). `npm audit --audit-level=high` on the real lockfile: 0 vulnerabilities (run from this session). Crafted copies, each expected to fail, all exit 1: `http://` resolved; other host; host suffix `registry.npmjs.org.evil.example`; userinfo in URL; missing integrity; `sha1-` integrity; `git+https` resolved; `file:` resolved; `github:` version; `github:` dependency spec; link to `../outside`; link `packages/../../x`; `node_modules` entry with no source; `http://` tarball in a lockfile v1 `dependencies` tree. Negative control, expected to pass: a dependency named `link` with a semver spec. Missing lockfile path: exit 2. |

## Action pins

Existing actions stay pinned by full 40-character SHA. No new third-party actions were added (run steps only). The workflow `permissions` remain `{}` at top level and `contents: read` on the job. `node .github/scripts/check-action-pins.mjs` (the script lives under `.github/scripts/`, not `scripts/`) reports: verified SHA pins for 1 workflow file.

## Open items

- `npm audit signatures` (docs/30-engineering-standards.md:137; docs/19 P4) is not added. It needs a decision on the registry-signature policy.
- No check that the set of dependencies matches the allowlist or the exact-pin policy (docs/19 P1 and P2, QV-19-REQ-029). `lockfile-lint` checks sources and integrity only.
- The lockfile integrity values are not compared with an independent source; the check depends on the registry's TLS and the integrity values recorded in the lockfile.
- The gates have not been run in GitHub Actions from this session; the first CI run is the verification.
