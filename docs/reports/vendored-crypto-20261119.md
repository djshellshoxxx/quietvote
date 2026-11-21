# ADR-024 cryptographic dependency vendoring — 2026-11-19

## Implemented contract

This completes the executable vendoring requirement in [QV-ADR-024](../decision-log.md#qv-adr-024--vendored-noble-and-offline-only-trustee-tooling). The exact existing versions of `@noble/curves` and `@noble/hashes`, both **2.4.0**, are preserved. Their published tarballs and all **132** expanded files are committed under `vendor/`; `VENDOR.lock` records each archive and file's SHA-256 plus the original registry source and SHA-512 SRI.

The original tarball bytes came from the available npm content-addressed cache and matched the SHA-512 values already pinned in `package-lock.json`. The new verifier independently checks this binding on every invocation. No upstream source, type definition, README, package manifest or license notice is changed. Checkout preserves exact upstream bytes through the vendor-specific Git attributes. The [vendor README](../../vendor/README.md) records exact archive hashes, file counts, license notices and the reviewed-update procedure.

## How production consumes the snapshot

The dependency manifests and registry lockfile remain unchanged. `npm ci --ignore-scripts` still restores exact registry artifacts and standard workspace dependencies. The separate `npm run vendor:install` step then:

1. Checks both packages' registry/version/SRI bindings and original compressed archive hashes.
2. Parses bounded regular-file USTAR archives, refusing invalid framing, links, traversal and duplicate entries.
3. Compares every listed file's hash and bytes, rejecting extra, missing or nonregular expanded entries.
4. Validates the existing npm-installed Noble trees before replacing them with copies made from `vendor/`.
5. Writes an installation receipt tied to the exact `VENDOR.lock` and verifies installed bytes and real public-export resolution from the crypto workspace and dependency locations.

This explicit copy is the production source-selection step. The vendor tree is not merely a documentary copy beside registry-installed code. A new `npm ci` removes the receipt, so the checkout must repeat explicit installation. The installation uses only Node built-ins, works without development dependencies and invokes no upstream lifecycle script. Failures before installation leave the original tree intact; interrupted replacement has no valid receipt and can recover from the verified snapshot.

Only `packages/crypto` imports Noble in first-party production code, under the unchanged dependency-boundary gate. Public package import paths remain the same. Registry source/integrity lint, exact dependency pins and the blocking `npm audit --audit-level=high` remain in place. Normal npm package directories preserve npm's dependency/audit model. A tested link/junction prototype was rejected because npm treated the linked upstream packages' development tools as local requirements; upstream manifests were not edited to hide that issue.

All five workflow dependency restores run explicit vendor installation. Main CI and the pseudo-locale workflow include the vendor lock, implementation and complete vendor contents in their inputs, including upstream Markdown files. Every production `buildSite` invocation performs the installed-byte/resolution check before creating output, including callers that do not use `npm run build`. The ordinary `npm run check`, server setup documentation, container build recipe and service preflight carry the same explicit setup/check contract. No container is built or deployed by this change, and no release workflow is introduced.

## Verification evidence

Linux, Node **24.22.3**, npm **11.9.0**:

| Check | Result |
|---|---|
| Fresh `npm ci --ignore-scripts --offline`, explicit vendor install, installed verification | Passed; both packages and 132 files agree |
| Production-only `npm ci --ignore-scripts --omit=dev --offline` and vendor installation/check | Passed; no development dependency is needed by the installer |
| `npm ls --omit=dev --depth=1` after copying | Passed; only the existing two external production packages |
| Vendor and workflow-input regressions | **22 passed, 0 failed, 0 skipped** |
| Complete repository tooling tests | **71 passed, 0 failed, 0 skipped** |
| Workflow coverage and action-pin tests | **17 passed, 0 failed, 0 skipped** |
| `npm test -w @quietvote/crypto` | **93 passed, 0 failed, 0 skipped** |
| `npm run build -w @quietvote/web` | Passed; build ID `6321e67e9d96`, aggregate JS 196.3 KiB gzip, entry 97.3 KiB; same output identity as the tested baseline |
| `npm audit --audit-level=high` | Passed; **0 vulnerabilities** reported at this check |
| Dependency boundaries and lockfile source/integrity lint | Passed; unchanged historical layering deviations remain reported |
| Actual production build with the receipt removed | Refused before creating output; original receipt restored afterward |
| Repeated real `npm ci` | Removed the vendor receipt; explicit installation restored a verified state |

The complete import produces 26 trailing-whitespace findings from `git diff --check` inside the original upstream JavaScript. Those published bytes are deliberately preserved. The first-party diff is clean, and no whitespace rule, source/integrity lint or dependency allowlist is relaxed to hide the finding; the vendor verifier requires exact upstream byte equality.

The tamper regressions cover changed tarball bytes, a coordinated expanded-file/hash edit, changed registry source/version/SRI, modified/extra/missing installed files, missing/stale receipts, interrupted replacement, a package-local shadow dependency, linked expanded directories, invocation through a directory alias, and malformed/traversing/duplicate/link tar members. The known SHA-256 `abc` result is exercised through the installed public import. Crypto tests exercise the package's existing primitives and negative cases using those installed bytes.

Commands for the focused regression and unchanged qualification paths:

```sh
node --test --test-reporter=spec scripts/vendor.test.mjs .github/scripts/check-workflow-coverage.test.mjs
npm test -w @quietvote/crypto
npm run build -w @quietvote/web
npm run deps:check
npm run lockfile:lint
npm audit --audit-level=high
```

These are local Linux results for this worker's exact source. Windows/macOS, the assembled consolidation head and its complete suite still require their hosted gates. The earlier local TypeScript process was killed with exit 137; this report does not turn that into a typecheck pass. The new helper is plain `.mjs`, and the only production TypeScript change is the build-time integrity check. The Docker/service recipes were inspected and updated, not deployed. Hash agreement and passing tests are not external cryptographic review, package-provenance attestation verification or a release approval.
