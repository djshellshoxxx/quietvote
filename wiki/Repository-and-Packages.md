# Repository and Packages

> **Draft – unaudited software.** Status as of **2026-10-21**.

Layout target: spec [30 Engineering standards](https://github.com/djshellshoxxx/quietvote/blob/main/docs/30-engineering-standards.md) section 4. Packages: spec 08 section 5.

## Top level

| Path | Purpose | Status |
|---|---|---|
| `package.json` | npm workspaces (`packages/*`), scripts | Present |
| `tsconfig.base.json`, `tsconfig.json` | Strict TypeScript settings | Present |
| `packages/` | All workspaces (below) | Present. Every package has source and a `NOTES.md` or `README.md`. |
| `test-vectors/` | Language-neutral test vectors ([[Testing and Conformance]]) | `v1/` and `schema/` present. Candidate status. |
| `scripts/` | Repo tooling: `lint-claims.mjs` (public-claims lint), `licence-snapshot.mjs` (dependency licence report) | Present |
| `docs/` | Specifications, decision log, plan, reports | Present. Claims register in `docs/claims/`, licence snapshot in `docs/reports/`. |
| `CONTRIBUTING.md`, `SECURITY.md`, `README.md`, `LICENSE`, `DCO` | Project files | Present |
| `.github/workflows/ci.yml` | CI: typecheck and tests on three operating systems and two Node versions; pin check; non-blocking claims lint | Present. No DCO check yet. |
| `.github/scripts/check-action-pins.mjs` | Checks that every GitHub Action is pinned to a full commit SHA | Present |
| ESLint config | Planned in spec 30 | Not yet in repo |

## Packages

| Package | Name | Current state (2026-10-21) |
|---|---|---|
| `crypto` | `@quietvote/crypto` | ristretto255 wrappers, exponential ElGamal, Schnorr and CDS-style proofs, Feldman sharing, share encryption, strict JSON parsing, Ed25519. |
| `protocol` | `@quietvote/protocol` | Manifest and roll, distributed key generation, ballot build and verify, Benaloh spoil, ballot-log checks, tally and partial decryption, election verification. Spec errata in `NOTES.md`. |
| `board` | `@quietvote/board` | Merkle log, entry encoding, checkpoints, inclusion and consistency checks, receipts, bundle export, equivocation checks. |
| `server` | `@quietvote/server` | HTTP service (no third-party dependencies), SQLite-backed board and control store, admission checks, event stream, webhooks, rate limits. |
| `web` | `@quietvote/web` | Browser client (framework-free TypeScript), key handling, ballot flow, receipts, i18n catalogs, static build with CSP and SRI, offline verifier page. 74 unit tests pass. Playwright e2e is separate. |
| `cli` | `@quietvote/cli` | `qv` command: keygen, election and ballot commands, verify, board commands. Imports the verifier in-process (layering issue, see `packages/cli/NOTES.md`). |
| `trustee` | `@quietvote/trustee` | `qv-trustee`: key ceremony state machine, air-gapped log and packet files, sealed bundle. |
| `verifier` | `@quietvote/verifier` | `qv-verify`: offline verification into a named-check report, canary self-test. |

Each package has a `README.md` that points to the specs. Conventions: ESM (`"type": "module"`), a single public `exports` entry, and `sideEffects: false` for crypto.

Dependency rules and layering: [[Architecture Overview]]. The layering rule is not enforced by CI in this checkout.
