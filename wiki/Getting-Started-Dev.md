# Getting Started (Developers)

> **Draft – unaudited software.**

## Requirements

- **Node.js 22.18 or later.** The root `package.json` sets `engines.node` to `>=22.18`, and `.npmrc` enables `engine-strict`, so npm refuses older versions. (Some specs mention Node 22 LTS generally; `package.json` is authoritative.)
- npm (ships with Node). The repo uses npm workspaces.

## Setup

```bash
git clone https://github.com/djshellshoxxx/quietvote.git
cd quietvote
npm install
```

`.npmrc` sets `ignore-scripts=true`, so install scripts do not run automatically.

## Checks

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit` across all packages |
| `npm test` | Runs `npm test` in each workspace that has a test script (uses `node --test`) |
| `npm run check` | Typecheck, then tests |

Run `npm run check` before opening a pull request.

**Current state:** the 2026-10-21 results are historical. [Draft PR #30](https://github.com/djshellshoxxx/quietvote/pull/30) reports passing typecheck and workspace tests on its exact head, but strict TS/Python verifier comparison still fails pending owner decisions. Run these checks on your selected branch; no result on a draft PR qualifies `main` or a release.

## Next

- [[Repository and Packages]] for the layout.
- [[Contributing]] for commit and review rules.
