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

**Current state:** as of commit `c8348f4`, `npm run typecheck` passes and `npm test` has one failing test in `packages/cli` (see [[Testing and Conformance]]). Run `npm ci` first. Check the latest state before relying on `npm run check`.

## Next

- [[Repository and Packages]] for the layout.
- [[Contributing]] for commit and review rules.
