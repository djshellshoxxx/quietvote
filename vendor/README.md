# Vendored cryptographic dependencies

QV-ADR-024 requires the published contents of `@noble/curves` and `@noble/hashes` in this repository. Both remain at **2.4.0**. The production allowlist and public package import paths are unchanged; only `packages/crypto` imports these dependencies in first-party production code.

`noble-curves/` and `noble-hashes/` contain all **132 files**, byte for byte, from the corresponding npm tarballs. Their original compressed archives are in `archives/`. The root [VENDOR.lock](../VENDOR.lock) records the registry URLs, original SHA-512 SRI values, tarball SHA-256 values and every expanded file's SHA-256. `.gitattributes` prevents checkout from changing upstream line endings. No upstream source, package metadata or license file is patched.

## Provenance and license

The initial archives were recovered from the existing npm content-addressed cache and verified against the SHA-512 SRI values already committed in `package-lock.json`. Their archive hashes are:

| Package | Files | Compressed bytes | SHA-256 |
|---|---:|---:|---|
| `@noble/curves@2.4.0` | 72 | 413451 | `55279c71b0201d6c0e58d0206d15825359e02a3932f326ba7b7909ac2d334aa9` |
| `@noble/hashes@2.4.0` | 60 | 167626 | `e1946149b780017b2564fcc092cb01c04e1d7f20627d0296c17da8868f4436dc` |

Both packages identify the MIT license and Paul Miller as author. Their complete upstream notices remain in [noble-curves/LICENSE](noble-curves/LICENSE) and [noble-hashes/LICENSE](noble-hashes/LICENSE). Those license terms apply to these third-party files; the repository's AGPL license does not replace them. These hashes establish agreement with the previously pinned artifacts, not an independent review of their algorithms, npm provenance attestations or advisory status.

## Installation and checks

```sh
npm ci --ignore-scripts
npm run vendor:install
npm run vendor:check
```

The explicit installer first verifies the archives against both SHA-512 SRI and SHA-256, checks strict archive framing, compares the complete expanded file list and bytes, and confirms the registry/package identities. It also checks the registry-installed Noble files before replacing them, so a mismatch is reported rather than silently repaired. It then copies the verified vendor directories into their normal `node_modules/@noble/` locations. Production imports therefore consume bytes copied from this repository's vendor snapshot.

`package.json` dependencies and `package-lock.json` registry sources remain unchanged. `npm audit`, the source/integrity lint and dependency allowlist retain their existing meaning. The installer does not use `file:` dependencies, run upstream lifecycle scripts, install upstream development tools, or edit upstream package manifests. Normal directories are used because package-directory links cause npm to treat upstream development dependencies as local development requirements.

An install receipt in `node_modules/` binds the installed copies to the exact `VENDOR.lock`. A new `npm ci` removes it, requiring explicit installation again. `vendor:check` compares every installed byte, rejects extra/missing/nonregular entries and checks all public package exports from the crypto workspace and transitive dependency locations. A package-local shadow copy is a failure even when its bytes happen to match.

All CI dependency restores invoke the explicit installer. The ordinary `npm run check` and every production web `buildSite` call verify the installed copies. `npm run vendor:verify` checks the committed snapshot without an installed dependency tree. Run the installation step while preparing a checkout, before starting application processes; an interrupted installation remains unusable until its receipt and full verification succeed.

## Updates

Updates require a reviewed PR showing the upstream source diff and an audit-coverage note, as ADR-024 specifies. Do not edit the expanded third-party files directly. Keep both dependency versions exact and preserve the two-package production allowlist.

For a proposed version, obtain its published npm tarball using `npm pack --ignore-scripts @noble/<package>@<exact-version>` in a temporary directory, or retrieve the same bytes from a verified npm cache. Compare its SHA-512 with the proposed registry lock entry before extracting. Record the original tarball, extract all regular `package/` members into the matching vendor directory, and update `VENDOR.lock` with the new source/version/SRI, archive SHA-256 and complete per-file SHA-256 map. Do not include npm cache metadata, omit license/README/source/type files, or change package bytes to make a check pass.

Run `vendor:verify`, a fresh `npm ci --ignore-scripts`, `vendor:install`, the tamper regressions, `npm ls --omit=dev`, dependency/source/integrity checks, the unchanged advisory audit, crypto tests and production build. A changed upstream tar format is an explicit verifier change requiring review. Preserve the update's exact commands and results in a dated report. See [the initial implementation receipt](../docs/reports/vendored-crypto-20261119.md).
