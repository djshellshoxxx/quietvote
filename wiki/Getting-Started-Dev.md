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

**Current state:** on the current branch, `npm run typecheck` reports an error in `packages/board/src/bytes.ts` (line 137, TS1294, `erasableSyntaxOnly`). Fix or check the latest state before relying on `npm run check`. Only `packages/crypto` has a test file today.

## Next

- [[Repository and Packages]] for the layout.
- [[Contributing]] for commit and review rules.
