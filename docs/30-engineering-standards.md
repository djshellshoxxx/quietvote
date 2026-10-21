# QV-30 — Engineering Standards

**Module ID:** `engineering-standards`  
**Status:** Draft  
**Owner:** Engineering lead  
**Last reviewed:** 2026-10-21  
**Related specs:** QV-08 (packages, dependency rules), QV-11 (testing/assurance), QV-16 (crypto protocol), QV-19 (supply chain), QV-27 (governance/release); ADR-003, 004, 011, 013

## 1. Objective

Give contributors one binding, mechanically enforced set of rules for how QuietVote code is written, reviewed, tested, built, versioned and merged. For a voting system the standards exist to (a) keep cryptographic code boring and reviewable, (b) prevent secret leakage by construction, and (c) make every merged change attributable, reviewed by a second person and reproducible.

## 2. Scope

### In scope
Repo layout, TypeScript/ESLint rules, constant-time and secret-handling rules, error handling, testing pyramid, CI definition and required checks, branch protection, review, commit/DCO, versioning and protocol-version policy, docs-as-code, definition of done.

### Out of scope
Cryptographic design (QV-16), test strategy detail and audit plan (QV-11), release signing (QV-19), community governance (QV-27).

## 3. Actors

Contributor, reviewer, maintainer (QV-27), release engineer, security reviewer (named in CODEOWNERS for `packages/crypto` and `packages/protocol`).

## 4. Repository layout

```
quietvote/
  package.json                 # workspaces: ["packages/*"], private: true, engines, packageManager
  package-lock.json            # committed, integrity hashes
  .npmrc                       # ignore-scripts=true, save-exact=true, engine-strict=true
  tsconfig.base.json           # strictest settings (below)
  eslint.config.js             # flat config, shared by all packages
  packages/{crypto,protocol,board,server,web,cli,trustee,verifier}/
      src/  test/  package.json  tsconfig.json  README.md  CHANGELOG.md
  test-vectors/                # language-neutral JSON vectors (shared with QV-16 and verifiers)
  bench/                       # reference-10k, microbenchmarks (QV-08-REQ-020)
  policy/                      # dependency allowlists (QV-19 §11)
  scripts/                     # check-deps.mjs, repro-check.sh, lockfile-lint.mjs, docs-lint.mjs
  docs/                        # specs, ADRs (decision-log.md), runbooks
  .github/{workflows,CODEOWNERS,PULL_REQUEST_TEMPLATE.md,ISSUE_TEMPLATE/,dependabot.yml}
  SECURITY.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  GOVERNANCE.md  LICENSE (AGPL-3.0-or-later)  DCO
```

Package conventions: `"type": "module"`, `"exports"` map with a single public entry (plus the named `./verify` subpath where QV-08 D5 requires), `"files"` whitelist, `"sideEffects": false` for `crypto|protocol|board`, `"engines": {"node": ">=22.13"}`. File names `kebab-case.ts`; one exported concept per file where practical; tests in `test/` mirroring `src/`.

## 5. TypeScript and ESLint rules

### 5.1 `tsconfig.base.json` (normative flags)

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `isolatedModules`, `noUnusedLocals`, `noUnusedParameters`, `forceConsistentCasingInFileNames`, `skipLibCheck: false`, `target: ES2022`, `module: NodeNext`. Compiler version pinned exactly (TypeScript 7.0.2 current on 2026-10-21; pin in lockfile). `// @ts-ignore` banned; `// @ts-expect-error` allowed only in tests with explanation.

### 5.2 ESLint (flat config; `typescript-eslint` strict-type-checked + stylistic)

| Rule group | Rules (error level) |
|---|---|
| Types | `no-explicit-any`, `no-unsafe-*` (assignment, call, member-access, return, argument), `no-non-null-assertion`, `consistent-type-imports`, `switch-exhaustiveness-check`, `strict-boolean-expressions` (allow nullable object only), `no-floating-promises`, `no-misused-promises`, `require-await`, `prefer-readonly` |
| Safety | `no-eval`, `no-implied-eval`, `no-new-func`, `no-restricted-globals` (`Math.random`, `Date` in `crypto|protocol|board` cores), `no-restricted-properties` (`Date.now`, `Math.random`, `console.*` outside `cli`/`server` logger), `no-restricted-syntax` (`for..in`, `==`/`!=`, `JSON.parse` outside the `decode` module), `eqeqeq` |
| Boundaries | `no-restricted-imports` per package (QV-08 D1–D8), `import/no-cycle`, `import/no-extraneous-dependencies` (no undeclared deps, no devDeps in `src`) |
| Secrets | custom rules `qv/no-secret-in-template-or-string` (flags identifiers marked `@secret`/branded `Secret*` used in string concatenation, templates, `JSON.stringify`, `console`, thrown messages) and `qv/no-secret-compare` (flags `===`, `Buffer.compare`, `indexOf`, `includes` on `Secret*`/`Uint8Array` of MAC/tag type) |
| Web | `no-unsanitized/*` equivalent: ban `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`-likes, `postMessage` with `*` origin, `localStorage` for secrets (QV-19 REQ-009/019) |
| Style | Prettier-compatible formatting enforced by `eslint-plugin-prettier`-free approach: `prettier --check` in CI; max function complexity 15 (crypto: 10); max file length 600 lines |

Rule changes affecting `crypto`/`protocol` need a security-reviewer approval.

## 6. Constant-time and secret-handling rules

JavaScript gives no hard constant-time guarantee (JIT, GC, BigInt). The rules aim to avoid *avoidable* leaks and to rely on audited implementations (`@noble/curves`, `@noble/hashes` are designed for constant-time-ish scalar operations and publish a security stance ADR-003). We make no stronger claim.

| ID | Rule |
|---|---|
| S1 | **No hand-written primitives.** Group arithmetic, hashing, signatures, KDF, AEAD come from `@noble/*` or WebCrypto. `crypto` wraps them; no other package imports `@noble/*` directly (lint). |
| S2 | **Secret types.** Secrets are branded classes (`SecretScalar`, `SeedBytes`, `Passphrase`, `KeyShare`) with no `toString`/`toJSON`/`inspect`; `util.inspect.custom` returns `[REDACTED]`; serialisation only via explicit `unsafeExport()` that is lint-flagged and reviewed. |
| S3 | **Zeroization.** Secrets live in `Uint8Array`, never strings. Owner of a secret calls `wipe()` in `finally`. Document that BigInt scalars cannot be wiped; where noble returns bigint, convert back to bytes promptly and drop references. Best effort only. |
| S4 | **Constant-time comparison.** Comparing MACs, tags, hashes of secrets, or any secret-derived bytes uses `ctEqual(a,b)` from `crypto` (length-checked, XOR-accumulate, no early exit). `===`/`Buffer.equals` on such values is lint-banned. Public-data comparisons (Merkle hashes, public keys) may use plain equality. |
| S5 | **No secret-dependent branching or indexing** in code we write: no `if (secretBit)`, no table lookup by secret index, no early return on partial secret match. Where algorithmic (e.g. ballot bit 0/1 proof) the proof is constructed by the standard disjunctive technique that simulates one branch and computes the other uniformly; code review checklist item. |
| S6 | **Canonical decoding, fail closed.** Every point/scalar from the wire is decoded with canonical-encoding checks (ristretto255 canonical, scalar `< l`), rejects identity where forbidden, rejects non-canonical Ed25519 signatures per the QV-16 verification rule. Reject first, don't repair. |
| S7 | **Randomness only through injected `Rng`** whose production implementation is `crypto.getRandomValues`. Tests use deterministic seeded RNG; production code cannot import it (lint). Nonce/randomness is never derived from message content unless the construction (RFC 6979/8032-style deterministic) is specified by QV-16. |
| S8 | **Domain separation and length-prefixing** for all hashes: `hashToScalar(domain, ...parts)` is the only way to hash for protocol purposes; domain strings are registered in `crypto/src/domains.ts` and are unique (test enforces uniqueness). Fiat–Shamir transcripts include the full statement (ADR-004). |
| S9 | **No secrets in logs, errors, metrics, URLs, or test snapshots.** Logger redacts fields named `seed|secret|share|pass|key|token|randomness` and values of branded secret types; canary test (QV-19-REQ-009). |
| S10 | **No secret ever stored on the server** (QV-08-REQ-005). |
| S11 | **Timing of public-data verification need not be constant-time**, but verification of signatures/proofs on attacker-supplied data must be bounded in cost (size limits before parsing). |
| S12 | **Memory hygiene in CLI/trustee:** disable core dumps where feasible (`prlimit`/documentation), read passphrases without echo, never accept secrets as CLI arguments (use stdin/file descriptor/prompt). |
| S13 | **Third-party code never sees secrets**; secrets are not passed to workers except by transfer of `ArrayBuffer`s owned by `crypto`. |
| S14 | **Known-answer tests required** for every primitive wrapper using official vectors (RFC 8032, ristretto255 draft/RFC 9496, Argon2 RFC 9106 vectors) plus negative vectors (non-canonical encodings, small-order points). |

## 7. Error handling

- **Result types for expected failures.** Parsing/verification returns `Result<T, E>` (`{ok:true,value}|{ok:false,error}`); exceptions are reserved for programmer errors and I/O faults. No `catch` that swallows; `catch (e: unknown)` must narrow.
- **Error taxonomy:** every error has a stable code `QV_<DOMAIN>_<NAME>` (e.g. `QV_PROTO_BAD_PROOF`, `QV_BOARD_FORK`, `QV_AUTH_STALE_TS`), a class (`Invalid | Unauthorized | NotFound | Conflict | RateLimited | Unavailable | Internal`), a stable human message key (for localisation, QV-13), and a `retryable` flag. The registry is a single typed const map; docs table is generated from it (docs-as-code).
- **HTTP mapping:** `Invalid`→400/422, `Unauthorized`→401/403, `NotFound`→404, `Conflict`→409, `RateLimited`→429, `Unavailable`→503, `Internal`→500; body `{code, message_key, retryable, request_id}`; no stack traces, no internal paths, no secret-dependent detail (a proof failing reports `QV_PROTO_BAD_PROOF`, not which equation). Detail goes to server logs under the request id.
- **Fail closed:** unknown protocol version, unknown field with `critical` flag, unverifiable signature, inconsistent STH => reject. Unknown non-critical fields are ignored only where QV-09 declares extensibility.
- **Verification never throws on hostile input:** `verify*` functions are total (fuzzed, QV-30-REQ-017).
- **Timeouts and cancellation:** all I/O takes `AbortSignal`; default deadlines in `server` (request 10 s, proof verification 2 s).
- **Process level:** `unhandledRejection`/`uncaughtException` log and exit non-zero (supervisor restarts); no continued operation in unknown state.

## 8. Testing pyramid

| Layer | Share (target) | Tooling | Content | Gate |
|---|---|---|---|---|
| Unit | ~65% | `node:test`, `node:assert/strict` | Pure functions; KATs; edge cases; mutation-style negatives | Line coverage >= 90% in `crypto|protocol|board`, >= 80% elsewhere (via `node --experimental-test-coverage` or `c8`); branch coverage >= 85% for `crypto|protocol` |
| Property / fuzz | ~10% | `node:test` + in-repo generators (no new dep); deterministic seeds logged; nightly long-run | Round-trips (encode/decode, encrypt/decrypt, share/reconstruct), homomorphism (sum of encryptions decrypts to sum), proof soundness against mutated witnesses, parser fuzz (never throws unexpected, never hangs) | Nightly 30 min; failures file issue with seed |
| Integration | ~15% | `node:test`; in-process server + SQLite in tmpfs | Admission, board append/proofs, DKG rounds, fault injection (kill -9, disk full), tenant isolation | Required on every PR |
| End-to-end | ~8% | Playwright `[dev dependency; allowlist entry required]` or Node + headless browser; scripted election of 25 voters, 3 trustees | Full ceremony: DKG -> register -> audit -> vote -> tally -> `qv-verify` offline; Tor sidecar smoke; split-origin; CSP/header conformance | Required on `main` and release |
| Conformance / vectors | cross-cutting | `test-vectors/*.json` shared with QV-16 and any second implementation | Byte-exact encodings, proofs accept/reject sets | Required; vector changes need security-reviewer approval |
| Performance | scheduled | `bench/` | Reference-10k (QV-08 §8.2) | Nightly; release gate |
| Security | scheduled | Secret scan, SAST (CodeQL), dependency audit, Scorecard | See §9 | Required |

Rules: no test depends on wall-clock time or network except E2E; flaky tests are quarantined within 24 h with an owner and removed after 14 days (no skip-and-forget). Every bug fix adds a regression test. Test code is held to lint rules (relaxed only for `no-non-null-assertion`). Independent crypto/protocol review and external audit are scheduled by QV-11.

## 9. CI pipeline (GitHub Actions)

Principles: default `permissions: {}`; each job grants the minimum; all actions pinned by full commit SHA (versions resolved at implementation time `[UNVERIFIED — current action versions not checked in authoring sandbox]`); no `pull_request_target` with checkout of PR code; secrets unavailable to fork PRs; `npm ci --ignore-scripts`; Node from `.nvmrc`/matrix; no network during test jobs other than registry restore.

```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }
  merge_group:
permissions: {}
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  lint-typecheck:
    runs-on: ubuntu-24.04
    permissions: { contents: read }
    steps:
      - uses: actions/checkout@<sha>
        with: { persist-credentials: false }
      - uses: actions/setup-node@<sha>
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --ignore-scripts
      - run: npm run lint && npm run typecheck && npx prettier --check .
  deps-boundaries:
    runs-on: ubuntu-24.04
    permissions: { contents: read }
    steps: [ checkout, setup-node, { run: "npm ci --ignore-scripts && node scripts/check-deps.mjs && node scripts/lockfile-lint.mjs && npm audit signatures" } ]
  test:
    strategy: { matrix: { node: [22, 24], os: [ubuntu-24.04, macos-latest, windows-latest] } }
    runs-on: ${{ matrix.os }}
    permissions: { contents: read }
    steps: [ checkout, setup-node (matrix.node), "npm ci --ignore-scripts", "npm test -- --coverage", upload coverage ]
  vectors-crossimpl:
    steps: [ checkout, "node scripts/run-vectors.mjs", "differential: web verifier page vs qv-verify" ]
  build-repro:
    steps: [ "scripts/build.sh in pinned container (twice, different workdirs)", "cmp -s artifacts", "upload artifact hashes" ]
  e2e:
    needs: [test]
    steps: [ "build", "scripted election", "qv-verify offline in --network none container", "header/CSP conformance", "egress-deny check" ]
  security:
    permissions: { contents: read, security-events: write }
    steps: [ "CodeQL (javascript-typescript)", "gitleaks or equivalent secret scan on diff and history (nightly)", "OSV/npm audit (audit-level=high)", "OpenSSF Scorecard (scheduled)" ]
  sbom:
    steps: [ "cyclonedx-npm --omit dev --output-reproducible", "validate schema", "diff vs previous release (PR comment)" ]
  docs:
    steps: [ "node scripts/docs-lint.mjs (links, REQ-ID uniqueness, front-matter, Mermaid parse, spec-index consistency)", "markdownlint" ]
  dco:
    steps: [ "verify Signed-off-by on every commit in PR range" ]
  nightly:
    on: schedule
    steps: [ "fuzz/property long run (30 min)", "bench reference-10k + regression compare", "gitleaks full history", "scorecard" ]
```

Release workflow (`release.yml`): triggered only by signed tags `v*`; separate OIDC-enabled job with `id-token: write`, `attestations: write`, `contents: write`; runs reproducible build, SBOM, provenance, cosign signing (QV-19 §10). It cannot run from forks or branches.

### 9.1 Required status checks (branch protection on `main` and `release/*`)

`lint-typecheck`, `deps-boundaries`, `test (22, ubuntu)`, `test (24, ubuntu)`, `test (24, macos)`, `test (24, windows)`, `vectors-crossimpl`, `build-repro`, `e2e`, `security (CodeQL)`, `sbom`, `docs`, `dco`. Nightly jobs are not merge gates but failures block releases.

### 9.2 Branch protection and repository settings

- `main`: PR required; **>= 1 approving review** (>= 2 for paths in `packages/crypto`, `packages/protocol`, `policy/`, `.github/`, `docs/AUTHORING*`/ADR changes, via CODEOWNERS); dismiss stale approvals on new commits; **conversation resolution required**; **linear history**; require merge queue; required checks (§9.1) up to date; **no force-push, no deletion**; admins included (no bypass); signed commits **or** DCO (see §10) required; code-owner review required.
- Tags `v*`: protected; only maintainers may create; must be signed (GPG/SSH/Sigstore gitsign).
- Actions settings: workflows from forks require approval; default `GITHUB_TOKEN` read-only; allow only listed actions (SHA-pinned); Dependabot security updates on, version updates open PRs but never auto-merge.
- 2FA required for all org members; maintainers use hardware keys.
- Private vulnerability reporting enabled (QV-27 security policy).

## 10. Code review and commit rules

**Review**
- Author cannot approve own PR; reviewer is not the sole author of the changed lines.
- Reviewers use the checklist in the PR template: threat-model impact (QV-07) considered; spec/REQ IDs referenced; tests added; secret-handling rules S1–S14 respected; no new dependency (or ADR linked); docs updated; error codes registered; protocol version impact assessed (§11).
- Crypto/protocol changes: >= 2 approvals, at least one from the security-reviewer group; changes to test vectors, domain separation strings, or encodings are always "protocol changes".
- PR size guidance: <= 400 changed lines excluding generated files/vectors; larger PRs need a design note.
- Review turnaround target: first response within 3 working days.
- Reviewer blocks on: unclear invariants in crypto code, missing negative tests, `unsafeExport` use, unbounded loops on attacker input.

**Commits**
- Conventional Commits (`feat|fix|perf|refactor|test|docs|build|ci|chore|revert`, optional scope = package, `!` for breaking; footer `Refs: QV-05-REQ-012`).
- **DCO sign-off required** on every commit (`git commit -s`; `Signed-off-by: Name <email>` matching author) per ADR-011; enforced by `dco` check; no CLA. AGPL-3.0-or-later inbound = outbound.
- Squash-merge default for single-purpose PRs; merge queue produces linear history; subject <= 72 chars, imperative.
- No secrets, no generated binaries, no files > 1 MiB without justification (pre-commit/CI check).
- Maintainer-signed commits/tags for release branches.

## 11. Versioning, compatibility, protocol-version policy

**Semver 2.0.0** for the product release (single version for all packages: lockstep, taken from root `package.json`), pre-1.0 rules: minor may break with changelog notes, patch never breaks. Packages are `private` initially; if later published, they keep lockstep versions.

**Three independent version axes**

| Axis | Identifier | Changes when |
|---|---|---|
| Product release | `MAJOR.MINOR.PATCH` | Any shipped change |
| Protocol | `qv-proto/<n>` (integer, in manifest and every signed artifact; ADR-013 algorithm agility) | Any change affecting bytes that are hashed, signed, proven or verified: encodings, domain strings, proof structure, group/hash/KDF choice, state machine rules |
| Storage/API schema | `schema/<n>`, HTTP `/v<n>/` | DB layout; REST contract (QV-09) |

Policy:
1. A **protocol version is immutable once any release containing it is tagged stable**. Fixes to a protocol bug ship as `qv-proto/<n+1>`; elections already open keep their manifest-declared version.
2. Every release declares supported protocol versions. Verifiers (`qv-verify`, verifier page) must support **all** protocol versions ever released at stable (so old elections remain auditable forever); servers/clients may drop creation support after a deprecation period (>= 12 months, QV-27 deprecation).
3. A protocol change requires: ADR, updated QV-16, new vectors, independent review (QV-11), and bump of MAJOR (post-1.0) or MINOR (pre-1.0).
4. Mixed-version rule: an election uses exactly one protocol version, fixed in the signed manifest; clients refuse mismatches (QV-19-REQ-035).
5. HTTP API: additive changes in-version; breaking changes new `/v<n>/` served in parallel for >= 2 minor releases; deprecation announced via `Deprecation`/`Sunset` headers and changelog.
6. DB schema: forward-only migrations, tested from every previously released schema (QV-08-REQ-031); downgrades unsupported, backup taken automatically.
7. Export bundle format versioned (`qv-bundle/<n>`), readers must handle all prior.
8. Breaking CLI changes only in MAJOR (post-1.0); flags deprecated for >= 1 minor.
9. Git tags: `vX.Y.Z`, pre-releases `vX.Y.Z-rc.N`. Channels and cadence: QV-27.

## 12. Docs-as-code

- All specs, ADRs and runbooks live in `docs/` as Markdown reviewed via PR with the same branch protection. Spec status changes and new decisions update `docs/SPEC-INDEX.md` and `docs/decision-log.md` in the same PR (CI checks index consistency).
- Requirement IDs `QV-<spec>-REQ-nnn` are unique, never reused or renumbered; retired requirements keep the ID with status "Withdrawn". `docs-lint` fails on duplicates, dangling cross-references, missing acceptance/verification columns.
- Traceability: tests declare `// @verifies QV-08-REQ-008`; `scripts/trace.mjs` generates a matrix (REQ to tests to code), published per release; Must-requirements with no test fail the release gate.
- Generated docs: error-code registry, config reference, CLI help, HTTP API reference (from schema) are generated and checked in CI for drift (`git diff --exit-code`).
- Mermaid diagrams must parse (docs-lint using `mermaid` CLI in a dev-only job `[allowlist entry needed]`).
- Docs licence CC BY-SA 4.0 (ADR-011); code AGPL-3.0-or-later; SPDX headers (`// SPDX-License-Identifier: AGPL-3.0-or-later`) required in every source file (lint).
- Public claims policy: README, website and UI strings must be traceable to a threat-model-backed statement; a "claims register" table in QV-07 lists permitted phrases; changes to claim language require security-reviewer approval.

## 13. Definition of done

A change is done when **all** hold:

1. Linked to a spec requirement or ADR; behaviour matches acceptance criteria.
2. All required checks green; coverage thresholds met; no new lint suppressions without a justified `eslint-disable-next-line` comment.
3. Tests: unit + (where applicable) property, integration, E2E; regression test for bug fixes; negative/hostile-input tests for any parser or verifier.
4. Secret-handling checklist S1–S14 reviewed for touched code; threat-model impact noted in PR (QV-07).
5. Reviewed by the required number of reviewers; CODEOWNER approvals present; DCO signed.
6. Docs updated (spec, error codes, config, CLI help, changelog entry, migration notes); requirement IDs referenced.
7. No new production dependency (or ADR approved, allowlist updated, SBOM diff reviewed).
8. Versioning impact assessed (protocol/API/schema); vectors updated and reviewed if affected.
9. Observability: new failure modes have error codes, log lines without secrets, and (server) metrics.
10. Accessibility and localisation checked for UI changes (QV-13): keyboard flow, labels, message keys externalised.
11. Performance budget respected (bench diff within 20% for touched hot paths; bundle size budget).
12. For release-bound work: reproducible-build check passes (QV-19).

## 14. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-30-REQ-001 | The repository shall follow the layout in §4, including `test-vectors/`, `policy/`, `scripts/`, and `.github/CODEOWNERS`. | Must | `docs-lint`/layout check passes. | CI |
| QV-30-REQ-002 | All packages shall compile under the strict flags in §5.1; `any` and `@ts-ignore` shall be absent from `src/`. | Must | `tsc -b` clean; grep gate. | CI |
| QV-30-REQ-003 | ESLint configuration per §5.2 shall be applied to all packages with zero warnings allowed (`--max-warnings 0`). | Must | CI lint job. | CI |
| QV-30-REQ-004 | Only `packages/crypto` shall import `@noble/*` or WebCrypto primitives for protocol operations. | Must | Lint negative test. | CI |
| QV-30-REQ-005 | Secret values shall use branded secret types with redacting inspection and no default serialisation. | Must | Unit test: `JSON.stringify`, template literal, `util.inspect` of secret types never reveal bytes. | Unit |
| QV-30-REQ-006 | MAC/tag/secret-derived byte comparisons shall use `ctEqual`; direct equality shall be lint-banned on secret types. | Must | Lint rule test fixtures. | Lint |
| QV-30-REQ-007 | Randomness shall be injected; production code outside `crypto` shall not call `crypto.getRandomValues`/`Math.random`. | Must | Lint; deterministic-RNG test shows reproducible output. | Lint, unit |
| QV-30-REQ-008 | All protocol hashing shall use `hashToScalar`/`hash` with registered, unique, length-prefixed domain strings. | Must | Test enumerates domains; duplicate fails; fuzz test of ambiguity (concatenation collision). | Unit |
| QV-30-REQ-009 | Wire decoding shall reject non-canonical encodings, small-order/identity points where forbidden, and out-of-range scalars. | Must | Negative vector set 100% rejected. | Vectors |
| QV-30-REQ-010 | Each primitive wrapper shall have known-answer tests from official vectors plus negative vectors. | Must | Vector coverage report. | CI |
| QV-30-REQ-011 | Expected failures shall use `Result` types with registered `QV_*` error codes; HTTP errors shall use the schema in §7 and contain no stack or secret-dependent detail. | Must | Contract test over every route; error registry test. | Integration |
| QV-30-REQ-012 | All `verify*` and decode functions shall be total on arbitrary input (no throw, bounded time). | Must | Fuzz 10^7 inputs nightly: zero uncaught exceptions; max time bound. | Fuzz |
| QV-30-REQ-013 | Coverage thresholds in §8 shall be enforced. | Must | CI fails below threshold. | CI |
| QV-30-REQ-014 | Test pyramid layers in §8 shall exist and run in CI; flaky tests quarantined within 24 h. | Must | Quarantine list age report. | CI |
| QV-30-REQ-015 | The CI workflows shall follow §9: minimal permissions, SHA-pinned actions, no `pull_request_target` on untrusted code, `--ignore-scripts`. | Must | Workflow lint (`actionlint` + custom check). `[UNVERIFIED tool availability]` | CI |
| QV-30-REQ-016 | The required checks in §9.1 shall be configured as branch-protection requirements on `main` and `release/*`. | Must | Repo settings export committed under `.github/settings-snapshot.json` and compared in CI. | Audit |
| QV-30-REQ-017 | Branch protection shall enforce reviews, CODEOWNERS, linear history, no force-push, admin inclusion, conversation resolution (§9.2). | Must | Settings snapshot test. | Audit |
| QV-30-REQ-018 | Changes under `packages/crypto`, `packages/protocol`, `policy/`, `.github/`, vectors, and ADRs shall require two approvals including a security reviewer. | Must | CODEOWNERS + ruleset. | Audit |
| QV-30-REQ-019 | Every commit shall carry a DCO sign-off; commits shall follow Conventional Commits. | Must | `dco` and `commitlint`-equivalent script. | CI |
| QV-30-REQ-020 | Release tags shall be signed and created only by maintainers; release workflow shall run only on protected signed tags. | Must | Workflow `if` guard test; tag protection rule. | Audit |
| QV-30-REQ-021 | Adding a production dependency shall require an ADR and allowlist change approved per QV-19 P1. | Must | CI blocks `package.json` diff without allowlist+ADR reference. | CI |
| QV-30-REQ-022 | A secret-scanning check shall run on PRs and nightly over history; a detection blocks merge. | Must | Seeded fake secret in test branch is caught. | CI |
| QV-30-REQ-023 | SPDX headers shall be present in all source files. | Should | Lint. | CI |
| QV-30-REQ-024 | Version axes in §11 shall be implemented: product semver, `qv-proto/<n>`, schema, API version; protocol versions shall be immutable after stable release and always verifiable. | Must | Test: verifier verifies fixture bundles from every released protocol version. | CI, release gate |
| QV-30-REQ-025 | Breaking HTTP changes shall use a new `/v<n>/` prefix with parallel support >= 2 minors and deprecation headers. | Should | API diff job flags breaking change without version bump. | CI |
| QV-30-REQ-026 | Spec/ADR/index changes shall be consistent: index status matches doc header; REQ IDs unique. | Must | `docs-lint`. | CI |
| QV-30-REQ-027 | A traceability matrix (REQ to tests) shall be generated per release; every Must requirement of a shipped module shall map to >= 1 test or documented review. | Must | Release gate fails on unmapped Must REQ. | Release gate |
| QV-30-REQ-028 | Generated references (error codes, config, CLI, API) shall be drift-checked. | Should | `git diff --exit-code` after generation. | CI |
| QV-30-REQ-029 | Definition of done (§13) shall be a PR-template checklist; maintainers shall not merge with unchecked items. | Must | Template present; sample audit of 10 PRs per quarter. | Review |
| QV-30-REQ-030 | Performance budgets (bench regression <= 20%, client bundle <= 120 KB gzip voting path) shall gate releases. | Must | Bench and size job. | CI |
| QV-30-REQ-031 | The test matrix shall run on Node 22 and 24 and on Linux, macOS, Windows. | Must | CI matrix. | CI |
| QV-30-REQ-032 | Process-level handlers shall terminate on unhandled rejection/exception. | Should | Integration test. | Test |
| QV-30-REQ-033 | CLI and trustee tools shall never accept secrets via argv and shall read passphrases without echo. | Must | Integration test greps process args; TTY test. | Test |
| QV-30-REQ-034 | Public claim language shall be restricted to the claims register approved by a security reviewer. | Should | Docs-lint checks forbidden phrases ("unhackable", "anonymous voting" without qualifier). | CI, review |

## 15. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Malicious PR from fork | Outsider | Secret exfiltration/CI abuse | No secrets for forks, `pull_request` only, minimal perms | Low |
| Compromised maintainer account | Attacker | Backdoor merge | 2FA/hardware keys, two-person review on critical paths, signed tags, rebuild checks | Collusion |
| Reviewer fatigue on crypto diff | Process | Missed flaw | Mandatory security reviewer, vectors, small PRs | Human error |
| Secret leaked in log | Bug | Key exposure | Redacting types, canary tests, lint | Low |
| Timing leak in JS | Platform | Partial key info | Audited libs, avoid secret branching, accepted residual (documented) | JIT/GC effects |
| Dependency drift | Upstream | Backdoor | QV-19 P1–P11 | Zero-day |
| Protocol drift between impls | Maintenance | Unverifiable elections | Vectors, differential tests, immutable versions | Low |

## 16. Open questions

| Question | Owner | Target review | Proposed default |
|---|---|---|---|
| Playwright (dev dependency, large tree) vs. minimal CDP-based harness | Engineering lead | M2 | Playwright in dev only, isolated job with no secrets; reassess if tree is unmanageable |
| Coverage tool: built-in Node coverage vs `c8` | Engineering lead | M1 | Built-in if stable on both LTS lines |
| Signed-commit requirement vs DCO-only | Maintainers | M1 | DCO required for all; signature required for maintainers/release |
| Mutation testing for `crypto`/`protocol` (e.g., Stryker, large tree) | Security reviewer | M3 | Manual mutation checklist initially |
| Merge queue availability on chosen plan | Maintainers | M1 | Required; fall back to "require up to date" if unavailable |

## 17. Proposed ADRs

- **QV-ADR-P30-1** Lockstep product version with independent `qv-proto/<n>`; protocol versions immutable and verifiers support all released versions forever.
- **QV-ADR-P30-2** Only `packages/crypto` may import `@noble/*`; secrets via branded types.
- **QV-ADR-P30-3** Two-approval rule, including a security reviewer, for crypto/protocol/policy/CI paths.
- **QV-ADR-P30-4** Traceability gate: Must requirements without tests block release.

## 18. References (accessed 2026-10-21; web fetch unavailable in sandbox, items marked cited from memory)

- Developer Certificate of Origin 1.1 — https://developercertificate.org `[UNVERIFIED access]`.
- Conventional Commits 1.0.0 — https://www.conventionalcommits.org `[UNVERIFIED access]`; Semantic Versioning 2.0.0 — https://semver.org.
- GitHub Docs: security hardening for Actions; protected branches/rulesets `[UNVERIFIED access]`.
- RFC 8032 (Ed25519), RFC 9496 (ristretto255/decaf448), RFC 9106 (Argon2) — https://www.rfc-editor.org/ `[UNVERIFIED access]`.
- OpenSSF Scorecard — https://scorecard.dev `[UNVERIFIED access]`.
- Tool versions verified via `npm view` 2026-10-21: `typescript` 7.0.2, `esbuild` 0.28.2, `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0.

## 19. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Draft authored 2026-10-21 |
