# Getting Started (Developers)

> **Draft – unaudited software.** Status as of **2026-10-21**.

## Requirements

- **Node.js 22.18 or later.** The root `package.json` sets `engines.node` to `>=22.18`, and `.npmrc` enables `engine-strict`, so npm refuses older versions. The CI matrix runs Node 22 and 24. `package.json` is authoritative.
- npm (ships with Node). The repo uses npm workspaces.

## Setup

```bash
git clone https://github.com/djshellshoxxx/quietvote.git
cd quietvote
npm ci --ignore-scripts
```

`.npmrc` sets `ignore-scripts=true`, so install scripts do not run automatically. CI uses the same command.

## Checks

| Command | What it does | Status on 2026-10-21 |
|---|---|---|
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit` across all packages | Passes |
| `npm test` | Runs `npm test` in each workspace (uses `node --test`) | Pass/fail counts change per commit; see CI and [[Testing and Conformance]]. |
| `npm run check` | Typecheck, then tests | Fails, because of the test failures above |
| `node .github/scripts/check-action-pins.mjs` | Confirms every GitHub Action is pinned to a full commit SHA | Passes |
| `node scripts/lint-claims.mjs` | Lists banned or overstated public wording (non-blocking in CI) | Reports findings, mostly in spec text that quotes banned wording. See [[Testing and Conformance]]. |
| `node scripts/licence-snapshot.mjs` | Regenerates `docs/reports/dependency-licence-snapshot.md` | Writes a report with no flagged licences |

Run `npm run check` before opening a pull request. It may fail while the trustee and CLI tests are being updated for the QV-ADR-015 election-open change.

The browser end-to-end tests are separate: `npm run e2e -w @quietvote/web` (needs Playwright and a browser; see `packages/web/NOTES.md`).

## Next

- [[Repository and Packages]] for the layout and per-package state.
- [[Contributing]] for commit and review rules.
- [docs/claims/claims-register-v0.md](https://github.com/djshellshoxxx/quietvote/blob/main/docs/claims/claims-register-v0.md) before writing any public text about security or privacy.
