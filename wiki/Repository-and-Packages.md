# Repository and Packages

> **Draft – unaudited software.**

Layout target: spec [30 Engineering standards](https://github.com/djshellshoxxx/quietvote/blob/main/docs/30-engineering-standards.md) section 4. Packages: spec 08 section 5.

## Top level

| Path | Purpose | Status |
|---|---|---|
| `package.json` | npm workspaces (`packages/*`), scripts | Present |
| `tsconfig.base.json`, `tsconfig.json` | Strict TypeScript settings | Present |
| `packages/` | All workspaces (below) | Present, mostly scaffold |
| `test-vectors/` | Language-neutral test vectors ([[Testing and Conformance]]) | Empty |
| `scripts/` | Repo tooling | Empty |
| `docs/` | Specifications and decision log | Present |
| `CONTRIBUTING.md`, `SECURITY.md`, `README.md` | Project files | Present |
| `.github/`, ESLint config, `LICENSE`, `DCO` | Planned in spec 30 | Not yet in repo |

## Packages

| Package | Name | Current state |
|---|---|---|
| `crypto` | `@quietvote/crypto` | Hash (SHA-256/512) and Ed25519 helpers; one smoke test |
| `board` | `@quietvote/board` | Byte helpers, entry format, Merkle tree and inclusion verification (no tests yet) |
| `protocol` | `@quietvote/protocol` | Scaffold |
| `server` | `@quietvote/server` | Scaffold |
| `web` | `@quietvote/web` | Scaffold |
| `cli` | `@quietvote/cli` | Scaffold |
| `trustee` | `@quietvote/trustee` | Scaffold |
| `verifier` | `@quietvote/verifier` | Scaffold |

Each package has a `README.md` that points to the specs. Conventions: ESM (`"type": "module"`), a single public `exports` entry, and `sideEffects: false` for crypto.

Dependency rules and layering: [[Architecture Overview]].
