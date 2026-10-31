# Dependency and CI supply-chain review

**Scope:** `package-lock.json`, all `packages/*/package.json`, root `package.json`, `.npmrc`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `.github/scripts/check-action-pins.mjs`, `scripts/licence-snapshot.mjs`.
**Date:** 2026-10-21
**Branch:** claude/quietvote-audit-qa-1
**Reviewer:** AI-assisted review, not independent audit. This report is not a professional security audit and has not been reviewed by an independent auditor. The project is unaudited and not for real elections.
**Method:** read-only inspection plus the commands listed in section 5. No git commands were run. No dependency was added, removed or changed. No code was edited.

## 1. Threat model (dependency and CI scope)

**Assets**
- Integrity of the built and tested code (what is shipped to voters and verifiers).
- Integrity of the lockfile and the resolved package set.
- CI runner and its `GITHUB_TOKEN`.
- Crypto code that depends on `@noble/curves` and `@noble/hashes`.

**Trust boundaries**
- npm registry (`registry.npmjs.org`) to lockfile to `npm ci` on CI runners.
- GitHub Actions marketplace (`actions/*`) to workflow execution.
- Workspace packages (`packages/*`) resolved through npm workspace links, not the registry.

**Adversaries considered**
- Compromised or malicious maintainer of a transitive dependency, including dev tooling (esbuild, TypeScript, `@types/node`).
- Registry-level substitution (a `resolved` URL pointing elsewhere, dependency confusion).
- Compromised action tag (`actions/checkout`, `actions/setup-node`) or a fork PR using secrets.
- Undeclared workspace dependency that resolves differently when a package is installed or packed alone.

**Assumptions**
- The registry is reached over TLS through the agent proxy.
- Lockfile `integrity` (sha512) values are honoured by `npm ci`.
- `.npmrc` `ignore-scripts=true` and CI `npm ci --ignore-scripts` are in force.

**Failure modes in scope**
- A new install script or a new registry host enters the lockfile without review.
- A workspace package imports a sibling it does not declare, so it breaks when packed or installed alone.
- A documented CI gate is absent, so a supply-chain regression would not fail the build.

## 2. Dependency inventory (evidence)

- Lockfile: `lockfileVersion` 3, 48 entries (`node_modules/*` plus 8 workspace links). Only host: `registry.npmjs.org` (32 entries). No non-HTTPS or git/file `resolved` URLs. All 32 registry entries carry an `integrity` value.
- Runtime (non-dev, non-link) packages per lockfile: `@noble/curves@2.4.0` (MIT) and `@noble/hashes@2.4.0` (MIT), both pulled by `packages/crypto/package.json` lines 17-19 (exact pins).
- Dev packages: `typescript@5.9.3` (Apache-2.0), `@types/node@22.18.0` (MIT), `undici-types@6.21.0` (MIT), `esbuild@0.28.2` (MIT, `web` devDependency) and 26 `@esbuild/*` platform packages (MIT, optional).
- Pinning: root devDependencies and `packages/crypto` use exact versions. `.npmrc` sets `save-exact=true`. Workspace links use `"*"` (see DEP-03).
- Licence (lockfile and installed `package.json`): 32 third-party packages, all MIT or Apache-2.0. `scripts/licence-snapshot.mjs --stdout` reports 32 permissive, 0 flagged, 0 unknown. Permissive licences are compatible with combining into an AGPL-3.0-or-later work. This is a metadata snapshot, not legal advice.
- Install scripts: `hasInstallScript: true` for `node_modules/esbuild@0.28.2` only (`"postinstall": "node install.js"`). No other package in the lockfile has an install script.
- Workspace dependencies: every package's bare `@quietvote/*` and `@noble/*` imports were grepped and compared with its `package.json`. One undeclared import found (DEP-01). Correction to the brief: `packages/protocol/package.json` (line 18) and `packages/trustee/package.json` (line 20) **do** declare `@quietvote/crypto`. No finding for them.

## 3. Findings

| ID | Severity | Evidence | Finding | Remediation | Verification status |
|---|---|---|---|---|---|
| DEP-01 | low | `packages/cli/src/cmd-verify.ts:1`, `packages/cli/src/common.ts:3`, `packages/cli/src/cmd-board.ts:4`, `packages/cli/src/cmd-vectors.ts:15` import `@quietvote/verifier`; `packages/cli/package.json:23-27` `dependencies` omits it | `@quietvote/cli` imports `@quietvote/verifier` without declaring it. It resolves only through the hoisted workspace link, so a packed or standalone install of the CLI would fail to resolve it. The same layering issue (cli to verifier) is already recorded as an open finding in `packages/cli/NOTES.md` (D1). | Add `"@quietvote/verifier": "*"` to `packages/cli/package.json` `dependencies` and regenerate the lockfile, or move the shared loader to a lower layer as NOTES.md proposes. | open (not edited: outside this review's write scope; no test written) |
| DEP-02 | medium | `docs/30-engineering-standards.md:137` specifies `npm ci --ignore-scripts && node scripts/check-deps.mjs && node scripts/lockfile-lint.mjs && npm audit signatures`; `:152` specifies OSV/npm audit (audit-level=high), CodeQL and secret scanning; `docs/research/R-02-application-platform-security-research.md:291-293, 302` specifies `npm audit signatures`, provenance checks and an SBOM. Actual: `.github/workflows/ci.yml` has only the pin check, `npm ci --ignore-scripts`, `npm run check` and a non-blocking claims lint. `scripts/` contains only `licence-snapshot.mjs` and `lint-claims.mjs`. `.npmrc` has no `audit-level`. | The project's own documented supply-chain controls are not present in CI. A lockfile host change, a new install script or a vulnerable advisory would not fail the build. This is a control gap against the project's own specification, not an exploitable bug. | Add the documented gates to CI: a lockfile lint (registry hosts, no install scripts outside an allowlist), `npm audit --audit-level=high`, and `npm audit signatures`. Then add `audit-level=high` to `.npmrc`. Implement or drop the referenced `check-deps.mjs` and `lockfile-lint.mjs`, and update docs/30 to match. | open. `npm audit` was run locally and found 0 vulnerabilities (section 5). `npm audit signatures` could not be completed locally (see section 4). |
| DEP-03 | info | `packages/{board,cli,protocol,server,trustee,verifier,web}/package.json` declare `"@quietvote/*": "*"` | Workspace dependencies use a wildcard range. All packages are `"private": true` and resolve through workspace links, so there is no current registry exposure. The range would accept a registry package of the same name if a link were ever removed. | Optional: pin workspace links to `"0.0.0"` (the package version), or keep as is. | open, informational |
| DEP-04 | info | `.npmrc:1` `ignore-scripts=true`; `ci.yml:37` `npm ci --ignore-scripts`; `esbuild@0.28.2` has `postinstall: node install.js` | esbuild's install script never runs in CI or on developer machines using this `.npmrc`. Whether `npm run build -w @quietvote/web` and the e2e path work without it was **not** tested here. | Run the web build on a clean checkout with the current `.npmrc` and record the result, or document the expected behaviour. | not verified |

**Checked, no finding:**
- Action pinning: all 4 `uses:` references (`actions/checkout`, `actions/setup-node`, each used in two jobs) are pinned to full 40-character SHAs; `.github/scripts/check-action-pins.mjs` passes. Comments give the version (`# v4.2.2`, `# v4.4.0`).
- Permissions: top-level `permissions: {}` (`ci.yml:10`); the typecheck job grants `contents: read` (`ci.yml:20-21`); the claims job grants `contents: read` (`ci.yml:45-46`). Checkout uses `persist-credentials: false`.
- Triggers: `pull_request`, `push` (main), `merge_group`. No `pull_request_target`, so fork PRs do not receive secrets.
- Matrix: Node 22 and 24; ubuntu-24.04, macos-15, windows-2025 (`ci.yml:24-26`). `fail-fast: false`.
- Non-blocking job: `claims-lint` uses `continue-on-error: true` (`ci.yml:55`, by design per its comment).
- Dependabot: `.github/dependabot.yml` covers `npm` and `github-actions`, weekly.
- Lockfile hosts, integrity, install scripts and licences: see section 2.
- Declared-vs-imported workspace deps: all packages except `cli` (DEP-01) match.

## 4. Not verified / limits

- `npm audit signatures` failed locally with `npm error Failed to download` (exit 1). The cause was not isolated. `curl` to `https://registry.npmjs.org/-/npm/v1/keys` and to the `@noble/hashes` tarball both returned HTTP 200 during this review. Signature and provenance status of the 32 registry packages is therefore **unverified**.
- No OSV, CodeQL, gitleaks, actionlint or OpenSSF Scorecard run (none is installed or configured in the repo).
- Licence results are from package metadata only (`licence-snapshot.mjs`); licence texts and NOTICE files were not read.
- Source imports were checked with a regex grep (`from '...'` forms). Dynamic `import()` and `require()` were not separately enumerated.
- `npm audit` metadata reports `prod: 19`, `dev: 30`, `optional: 26`, `total: 48`. The lockfile itself marks only two registry packages as non-dev (`@noble/curves`, `@noble/hashes`). The cause of this difference was not investigated.
- Tests and typecheck were not run: this review made no code changes.

## 5. Commands run and results

| Command (cwd `/home/user/quietvote`) | Result |
|---|---|
| `npm audit --json` | exit 0. `vulnerabilities: {}`; totals info 0, low 0, moderate 0, high 0, critical 0. Metadata: prod 19, dev 30, optional 26, total 48. Registry reachable. |
| `npm ls --all` | exit 0. No `invalid` or `missing` errors (stderr empty). `UNMET OPTIONAL DEPENDENCY` lines for non-Linux `@esbuild/*` platform packages only. |
| `npm outdated --json` | exit 1 (outdated present). `@types/node` 22.18.0 (latest 26.6.5); `typescript` 5.9.3 (latest 7.0.2). Both pinned exact by design; not changed. |
| `npm audit signatures` | exit 1: `npm error Failed to download`. Unresolved (section 4). |
| `node .github/scripts/check-action-pins.mjs` | exit 0: `Verified SHA pins for 1 workflow file(s).` |
| `node scripts/licence-snapshot.mjs --stdout` | exit 0. 32 third-party packages; 32 permissive; 0 flagged; 0 unknown. Output not written to disk. |
| Lockfile parse (`node` script in scratchpad) | 48 entries; hosts `{registry.npmjs.org: 32}`; no non-HTTPS or non-registry `resolved`; `integrity` present on all 32 registry entries; `hasInstallScript` only `node_modules/esbuild@0.28.2`. |
| Installed `package.json` checks (`node -e require(...)`) | `@noble/curves` 2.4.0 MIT; `@noble/hashes` 2.4.0 MIT; `@types/node` 22.18.0 MIT; `undici-types` 6.21.0 MIT; `esbuild` 0.28.2 MIT; `typescript` 5.9.3 Apache-2.0. |
| `grep` of bare imports per `packages/*` | Only undeclared cross-package import: `@quietvote/verifier` in `packages/cli` (DEP-01). |

## 6. Summary

- Findings: 0 critical, 0 high, 1 medium (DEP-02), 1 low (DEP-01), 2 informational (DEP-03, DEP-04).
- Fixed: 0. Open: 4. No edits were made outside this report.
- `npm audit` reports no known vulnerabilities at the time of review. The runtime dependency set is two MIT packages. CI pins actions by SHA and scopes permissions.
