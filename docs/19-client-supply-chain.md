# QV-19 — Client Architecture and Supply Chain

**Module ID:** `client-supply-chain`  
**Status:** Draft  
**Owner:** Client lead / release engineer  
**Last reviewed:** 2026-10-21  
**Related specs:** QV-04, QV-05, QV-07, QV-08, QV-10, QV-13, QV-16 (crypto protocol), QV-27 (release), QV-30 (standards); ADR-003, 004, 009, 010, 011, 013

## 1. Objective

The browser client is the weakest link in a system whose server is untrusted (ADR-010): whoever serves the JavaScript can, in principle, read the voter's choice or substitute a ballot. This spec defines (a) the web client architecture and key handling, (b) the voter onboarding, Benaloh audit and offline verification flows, (c) the browser hardening configuration, and (d) the build, signing, provenance and dependency-control pipeline that lets anyone check that the code they run is the code that was published. It documents the **residual risk honestly**: none of these controls make a malicious operator-served client impossible for a voter who never verifies anything.

## 2. Scope

### In scope
Web client architecture; browser key storage and passphrase KDF; onboarding; Benaloh cast-or-audit UX contract; offline verifier page; CSP, Trusted Types, SRI, headers; reproducible builds; signed release manifests; Sigstore/cosign; SLSA target; SBOM; npm dependency policy; update mechanism; release process.

### Out of scope
Cryptographic message formats (QV-16); visual design/copy (QV-10); accessibility details (QV-13); server deployment (QV-08); organizational release governance (QV-27); native mobile apps (not planned).

## 3. Actors and journeys

| Actor | Goal | Main outcome |
|---|---|---|
| Voter | Generate key, vote, audit | Key held only on device; ballot with receipt |
| Skeptical voter / auditor | Check that the served client is the released one | Pass/fail from `qv verify-client` or by loading from a mirror |
| Maintainer / release engineer | Publish a trustworthy release | Signed manifest, provenance, SBOM |
| Operator | Serve the client | Hashed static bundle matching the release manifest |
| Independent builder | Rebuild and compare | Identical hash or a public discrepancy report |

## 4. Web client architecture

- **Form:** static SPA; no server-side rendering; no framework runtime requirement beyond a small in-repo UI layer (target: plain TypeScript + Web Components, so the production dependency set stays `@noble/*` only; adopting any UI library requires an ADR under §11).
- **Build:** esbuild (0.28.2 at time of writing, pinned exactly), ES2022 target, single ESM entry plus 3 lazy chunks (`vote`, `audit`, `verify`), minified, `--legal-comments=none`, no source maps in the served bundle (maps published as release artifacts for debugging).
- **Modules:** `web` composes `crypto`, `protocol`, `board/verify` (QV-08 §5). No network calls other than to the board origin(s) declared in the signed manifest.
- **Crypto runtime:** all group/ballot operations via `@noble/curves` (ristretto255 is not in WebCrypto). Randomness: `crypto.getRandomValues` only. WebCrypto is used for AES-256-GCM key-wrapping and for non-extractable Ed25519 signing where available.
- **Origins:** two supported topologies: (1) *same-origin* (board serves the bundle), (2) *split-origin* (bundle served from a different host the voter chooses, board URL from the invitation fragment/manifest; board must allow that origin via CORS allowlist, QV-08-REQ-034). Split-origin removes the board operator from the client-delivery trust path and is the recommended posture for high-stakes elections.
- **Workers:** proof generation and verification run in a dedicated Worker (`worker-src 'self'`) to keep the UI responsive.
- **State:** in-memory except the wrapped key blob and a small settings/STH store in IndexedDB. No cookies. No third-party storage.
- **Telemetry:** none. CSP violation reports, if enabled, go to the same origin as counts only (§8).
- **Pages:** `/e/<id>` voter app; `/verify` verifier route; `/verifier.html` standalone offline page (§7).

## 5. Voter key management in the browser

### 5.1 Key model

| Key | Type | Lifetime | Where |
|---|---|---|---|
| Voter identity key | Ed25519 seed (32 B) | Per group/election set (QV-04) | Wrapped in IndexedDB; unwrapped only for signing |
| Ballot randomness | ristretto255 scalars | One ballot construction | Memory only; zeroed on cast; revealed only for a spoiled (audited) ballot |
| Wrapping key (KEK) | AES-256-GCM | One unlock session | Non-extractable `CryptoKey`, imported from Argon2id output |

### 5.2 Non-extractable keys: decision

Browsers can hold **non-extractable** `CryptoKey` objects in IndexedDB (they survive structured clone but cannot be exported). Decision:

1. The **persisted** secret is the wrapped seed blob (extractable form, encrypted), because users must be able to back up and recover their key (QV-04 recovery) and because browser storage is routinely cleared; a non-extractable-only key would make loss unrecoverable.
2. After unlock, if `crypto.subtle` supports Ed25519, the seed is imported as a **non-extractable** signing `CryptoKey` for the session and the raw seed buffer is zeroed immediately. Script (including injected script) can then ask for signatures but cannot exfiltrate the key. Fallback: noble `ed25519.sign` with the seed held in a closure for the unlock session only.
3. Honest limit: an attacker who can run script in the page can still request signatures or read plaintext choices while the app is unlocked. Non-extractability limits **key theft**, not **session abuse**.

### 5.3 Wrapped-key format (v1)

```
QVKEY1 container (CBOR/JSON, canonical):
{ v:1, kdf:"argon2id", m:65536 /*KiB*/, t:3, p:1, salt:16B, aead:"A256GCM",
  iv:12B, aad:"qv-key-v1|"+keyId, ct: AEAD(KEK, seed||pubkey) , keyId: SHA-256(pubkey)[0..8] }
```

- **KDF:** Argon2id via `@noble/hashes/argon2` (no extra dependency, audited family). Default **m = 64 MiB (65,536 KiB), t = 3, p = 1, 32-byte output**, matching RFC 9106's memory-constrained second recommended option for memory and iterations `[UNVERIFIED — confirm RFC 9106 §4 values; RFC lists p=4 for its option; p=1 chosen because noble runs lanes sequentially so p>1 only adds cost]`. Calibrated target on reference mid-range phone: 0.7–2.0 s unlock. Floor on memory-starved devices: m = 19 MiB (19,456 KiB), t = 2 (OWASP minimum cheat-sheet value `[UNVERIFIED current OWASP text]`); the client never goes below the floor and warns if it had to use it. Parameters are stored in the container, so they can be raised later with transparent re-wrap at next unlock.
- **Salt:** 16 random bytes per container. **KEK:** Argon2id output imported with `importKey("raw", out, "AES-GCM", false, ["encrypt","decrypt"])`; `out` zeroed after import. Fresh 96-bit random IV per wrap (re-wraps always change IV).
- **Passphrase policy:** minimum 12 characters or 6 words from an embedded 1,296-word list (about 62 bits) with a "generate for me" option defaulting to 7 words (about 72 bits); strength estimate by a small in-repo entropy heuristic (no zxcvbn dependency). Rationale: the blob is exfiltrable by an XSS attacker or a malicious extension, so offline guessing against Argon2id is the realistic attack.
- **Storage:** `navigator.storage.persist()` requested at onboarding; UI warns when denied. Unlock auto-locks after 10 min idle and on `visibilitychange` to hidden for > 2 min (configurable).
- **Export/backup:** "Download key file" produces the same QVKEY1 container as `*.qvkey`; "Show recovery code" renders seed as Crockford base32 groups with a 4-symbol checksum for paper backup (shown once, requires passphrase re-entry, clipboard disabled by default). Import validates checksum and keyId.
- **Memory hygiene:** seeds, scalars and passphrase-derived buffers are `Uint8Array`s zeroed with `.fill(0)` after use; no secret is ever put into a JS string, URL, log, `localStorage`, or the DOM except the explicit one-time recovery display. Documented limitation: JS gives no hard guarantee against copies in GC'd memory.

### 5.4 Lost key / compromised device

Recovery is governed by QV-04. The client contract: loss of key plus loss of backup means the voter cannot vote and the organizer must re-register a new key before manifest freeze. After freeze there is no recovery by design (ADR-005); this is communicated in onboarding.

## 6. Onboarding and ballot flows

### 6.1 Voter onboarding with key generation

```mermaid
sequenceDiagram
  participant O as Organizer
  participant V as Voter browser
  participant S as Board server
  O->>V: Invitation link https://host/e/ID#inv=TOKEN (out of band)
  Note over V: Fragment never sent to server
  V->>S: GET /e/ID (static bundle, manifest draft)
  V->>V: Verify bundle hash vs release manifest (if verify-client enabled)
  V->>V: Generate Ed25519 seed (CSPRNG); user sets passphrase; wrap + store (IndexedDB)
  V->>V: Show key fingerprint (8 words) and offer key-file / recovery code
  V->>S: POST /registrations {pubkey, sig over (ID, SHA-256(TOKEN), pubkey)}
  S-->>O: Pending registration (organizer approves / auto-approve per policy, QV-04)
  O->>S: Manifest freeze with roll Merkle root (signed)
  V->>S: GET roll inclusion proof for own pubkey
  V->>V: Verify proof against manifest root; display "You are on the roll"
```

Rules: the invite token is single-use, 128 bits, hashed (SHA-256) before leaving the device so the server stores no usable credential; no email or phone number is requested by the client; the key never leaves the device unwrapped. Voter is shown their fingerprint and told to check it against the published roll after freeze.

### 6.2 Benaloh cast-or-audit flow

Lineage: Benaloh, "Simple Verifiable Elections" (EVT 2006), as used in Helios/ElectionGuard; byte-level detail in QV-16/ADR-004.

```mermaid
stateDiagram-v2
  [*] --> Selecting
  Selecting --> Encrypted: user confirms choices (client encrypts with fresh randomness)
  Encrypted --> Committed: show ballot tracking code H = hash(ciphertexts) BEFORE any choice
  Committed --> Cast: user selects CAST
  Committed --> Audit: user selects AUDIT
  Audit --> Spoiled: reveal plaintext + randomness, post spoiled ballot to board
  Spoiled --> Selecting: ballot discarded; re-encrypt with NEW randomness
  Cast --> Submitted: sign with voter key, POST
  Submitted --> Receipt: inclusion proof + STH verified
  Receipt --> [*]
```

Normative UX/behaviour:
- The tracking code (and QR) is displayed and the ciphertexts are **fixed in memory** before the CAST/AUDIT buttons are enabled; the choice buttons have equal visual weight; "AUDIT" is explained in one sentence.
- AUDIT shows: tracking code, plaintext selections, randomness, and a `qv-audit:` link/QR. A **second device** (or the CLI / offline verifier page) loads the spoiled ballot by tracking code from the board (or accepts pasted/scanned data), re-encrypts with the revealed randomness and the election public key, and confirms ciphertext equality and the displayed choices.
- Spoiled ballots are published on the board and never tallied. The UI states that an audited ballot reveals its contents and must not be the voter's real vote, so the voter re-selects after auditing. Voters are encouraged to audit with arbitrary choices and then vote normally.
- The default flow requires an explicit decision each time (no "remember my choice" to skip auditing). The manifest may set a *recommended* audit count (default 1); it is advisory, not enforced.
- After CAST: the client signs, submits, verifies the inclusion proof and STH signature, stores the receipt in IndexedDB (and offers download), and checks consistency with the previously stored STH.
- Randomness for a cast ballot is zeroed immediately after the submit succeeds; it is never persisted.
- Statistical note shown in help text: if a client cheats on a fraction f of ballots, a voter who audits k ballots detects it with probability 1 − (1 − f)^k per voter; election-wide detection requires only a few audits across thousands of voters — but only if the audit device/code is not itself controlled by the attacker.

### 6.3 Receipt checks

At any time `/receipt` re-fetches the inclusion proof against the latest STH and reports "included / not found / fork detected" (QV-08-REQ-026).

## 7. Offline verifier page

`verifier.html`: one self-contained file (inline script and style; `< 400 KB`) built from `packages/verifier`, published as a release artifact with hash in the release manifest, usable from `file://` or any static host.

- Input: election bundle (drag/drop file; File API), or a Benaloh audit package, or a receipt. No network capability: its own CSP `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-<hash>'; style-src 'sha256-<hash>'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`.
- Output: structured report (manifest signature, roll commitment, each ballot's proofs and signature, Merkle consistency, tally homomorphism, trustee partial-decryption proofs, final result). Pass/fail per check with counts; machine-readable JSON download.
- Performance: M-tier bundle (10,000 ballots) verified in a Worker pool in < 5 min on a laptop (QV-08 §8.2), with progress and resumability.
- Equivalence: the page and the `qv-verify` CLI share `packages/verifier` code and the same test vectors; QV-11 requires at least one **independent re-implementation** (different language) passing the vectors before 1.0 (Should).
- Distribution: published to release assets, to mirrors, and offered in the repository; users are told to obtain it from a source other than the board operator and compare the SHA-256 against the signed release manifest.

## 8. Browser hardening configuration

### 8.1 Headers (all HTML/JS responses)

```
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self' {{BOARD_ORIGINS}};
  worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'; object-src 'none'; require-trusted-types-for 'script';
  trusted-types qv-default; upgrade-insecure-requests; report-uri /csp-report
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Referrer-Policy: no-referrer
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), interest-cohort=()
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=63072000; includeSubDomains   (clearnet; preload only on hosted domain)
Cache-Control: public, max-age=31536000, immutable   (hashed assets);  no-cache (HTML, manifest)
```

- `camera=(self)` only on the QR-scan route; otherwise `()`. No `'unsafe-inline'`, no `'unsafe-eval'`, no `wasm-unsafe-eval` (v1 has no WASM). `{{BOARD_ORIGINS}}` is empty in same-origin mode.
- CSP `report-uri /csp-report` is an optional same-origin counter endpoint (increments a counter; stores no body or address).
- Header presence is enforced by the server; for `file://` and static hosts the same policy is emitted as a `<meta>` where possible (frame-ancestors/report-uri cannot be set via meta).
- **Trusted Types:** a single policy `qv-default`; all DOM sinks (`innerHTML`, `script.src`, etc.) lint-banned (`no-unsanitized`-style rule) so the policy is effectively never called to produce HTML; rendering uses `textContent`/DOM construction. Browsers without Trusted Types support (Firefox at time of writing `[UNVERIFIED]`) rely on the lint ban plus CSP.
- **SRI:** `index.html` references `<script type="module" src="/assets/app.<contenthash>.js" integrity="sha384-…" crossorigin="anonymous">` and `modulepreload` with integrity for lazy chunks; the build emits an import map with integrity (`<script type="importmap">` including `"integrity"` entries) `[UNVERIFIED: import-map integrity support across browsers; fallback is preload links with integrity]`.
- **Honest limit of SRI:** in same-origin mode the operator serves both HTML and the hash, so SRI defends against partial compromise (CDN/mirror/cache/object-store tampering, accidental drift), **not** against a malicious operator. Defence against the latter is §9–§12 plus split-origin hosting.
- No third-party origins of any kind (ADR-009). A CI test crawls the app and fails on any request to another origin.

### 8.2 Client-side verification of the served client

`qv verify-client <url>` (CLI) and the `/verify-client` page fetch `index.html`, every referenced asset and `release-manifest.json`, compute hashes, check the manifest signatures (§10), and compare. This is also run automatically by mirrors/witnesses on a schedule, and results can be published as signed attestations ("client transparency"). The in-page variant is advisory only (a malicious page can lie about itself) and is labelled as such; the trustworthy verification is by the CLI or a second device.

## 9. Reproducible builds

Goal: any party can rebuild the release artifacts bit-for-bit.

- **Pins:** Node version exact (official binary checksum-verified against `SHASUMS256.txt` and its signature), npm exact via `packageManager`, `package-lock.json` committed with integrity hashes, `npm ci --ignore-scripts` (lifecycle scripts disabled; allowlisted exceptions in §11), esbuild exact version (0.28.2 snapshot).
- **Build container:** `Dockerfile.build` with base image referenced by `@sha256:` digest; build executed with `--network=none` after `npm ci` (dependencies pre-fetched into a verified cache).
- **Determinism:** `SOURCE_DATE_EPOCH` = commit timestamp; esbuild output without timestamps; stable file ordering; `LC_ALL=C`, `TZ=UTC`; archives created with sorted names, `--mtime=@$SOURCE_DATE_EPOCH`, `--owner=0 --group=0 --numeric-owner`, `gzip -n`; absolute paths stripped (`--sourcemap` omitted from the hashed bundle; maps built separately with relative `sources`).
- **Single binary caveat:** SEA output embeds the Node binary; reproducibility is defined relative to the (verified) official Node binary plus a deterministic injection step (`postject`); the release manifest records the Node binary hash. Platform signing (macOS notarization, Windows Authenticode) breaks bit-identity and is therefore recorded as a *separate* artifact; the unsigned binary's hash is what the manifest binds.
- **Check:** `scripts/repro-check.sh <version>` rebuilds in the pinned container and diffs against published artifacts. Release gate: at least **two independent builds** (GitHub-hosted runner and a maintainer-run local/other-CI build) must produce identical SHA-256 before the signing ceremony (§10). Mismatch blocks release and opens a public issue.
- Community rebuilders are encouraged to publish signed `rebuild-attestations/<version>/<builder>.json`; the release page lists them.

## 10. Signed release manifests, Sigstore, SLSA, SBOM

### 10.1 Release manifest

`release-manifest.json` (canonical JSON, UTF-8):

```json
{
  "schema": "qv-release/1",
  "version": "1.0.0",
  "channel": "stable",
  "created": "2027-01-15T12:00:00Z",
  "git": { "repo": "…", "commit": "…40hex…", "tag": "v1.0.0", "tag_signed": true },
  "protocol": { "versions": ["qv-proto/1"], "min_client_protocol": "qv-proto/1" },
  "node": { "version": "24.x.y", "sha256": "…" },
  "artifacts": [ { "name": "quietvote-1.0.0-linux-x64", "sha256": "…", "size": 0 }, … ],
  "client_assets": [ { "path": "assets/app.3f2a.js", "sha384": "…" }, … ],
  "verifier_page": { "sha256": "…" },
  "sbom": [ { "name": "sbom.cdx.json", "sha256": "…" } ],
  "provenance": [ { "name": "provenance.intoto.jsonl", "sha256": "…" } ],
  "builds": [ { "builder": "github-actions", "digest": "…" }, { "builder": "maintainer-local", "digest": "…" } ],
  "previous": { "version": "0.9.2", "manifest_sha256": "…" }
}
```

### 10.2 Signatures (two independent mechanisms)

1. **Sigstore keyless (cosign):** CI signs the manifest and each artifact with the workflow's GitHub OIDC identity (Fulcio certificate, Rekor entry); verification pins identity and issuer: `cosign verify-blob --bundle release-manifest.sigstore.json --certificate-identity-regexp '^https://github.com/<org>/quietvote/\.github/workflows/release\.yml@refs/tags/v' --certificate-oidc-issuer https://token.actions.githubusercontent.com release-manifest.json`. Container images are signed the same way (`cosign sign` by digest) with attached attestations. Sigstore tooling versions are pinned and recorded `[UNVERIFIED: current cosign major and bundle flags; check at implementation]`.
2. **Maintainer release keys (not dependent on Sigstore infrastructure):** detached Ed25519 signatures (minisign-compatible or `ssh-keygen -Y sign` format) over the same manifest from **at least 2 of the registered release maintainers** (hardware-backed keys, offline). Public keys and fingerprints are in `docs/RELEASE-KEYS.md`, the repository's signed tags, the website, and prior release manifests (key continuity). Rationale: ADR-001 means no single infrastructure provider (Sigstore, GitHub) should be mandatory for verifying the project's output.

Verification tool: `qv verify-release <dir|url>` (in `cli`) checks both, plus hashes, and reports which mechanisms passed. The release is considered authentic only if the 2-of-N key signatures **and** a matching rebuild/ provenance agree; Sigstore alone is a strong-but-single-vendor signal.

### 10.3 SLSA target

| Phase | Target | Notes |
|---|---|---|
| 0.x pre-releases | SLSA Build L2: hosted builder, signed provenance | GitHub artifact attestations |
| 1.0 | **SLSA Build L3**: isolated, unforgeable provenance via a reusable-workflow generator (`slsa-github-generator` or GitHub native attestation with equivalent isolation) | Provenance verified by `slsa-verifier` or `gh attestation verify` in `qv verify-release` |
| 1.x | Source track: two-party review, protected branches/tags, retained history (QV-30 branch protection) | SLSA spec version for the Source track to be confirmed `[UNVERIFIED]` |

Provenance is an in-toto statement binding artifact digests to the repo, commit, workflow path and builder. Additionally the reproducible-build check (§9) provides a verification path that does not trust the builder at all.

### 10.4 SBOM

CycloneDX 1.6 JSON generated by `@cyclonedx/cyclonedx-npm` (6.0.1 at time of writing; dev-only) per artifact, plus an SPDX 2.3 export for compliance consumers `[UNVERIFIED: tool choice for SPDX]`. SBOM is deterministic (no timestamps beyond `SOURCE_DATE_EPOCH`), signed and attested like other artifacts, listed in the manifest. Target production dependency count at 1.0: **≤ 3 packages** (`@noble/curves`, `@noble/hashes`, plus at most one more by ADR); transitive count equals direct count. CI posts the dependency diff on every PR.

## 11. npm dependency policy

| Rule | Detail |
|---|---|
| P1 Allowlist | `policy/dependency-allowlist.json` lists permitted production dependencies with exact version, reason, owner. Initial: `@noble/curves`, `@noble/hashes`. A new production dependency requires an ADR, two maintainer approvals, and a recorded audit summary. |
| P2 Dev deps | Allowed only from `policy/dev-allowlist.json`; dev tools never ship in artifacts; they run in CI with read-only tokens. Target dev set: `typescript`, `esbuild`, `eslint` (+ `typescript-eslint`), `dependency-cruiser`, `@cyclonedx/cyclonedx-npm`, `c8`/`node:test` coverage. |
| P3 Pinning | Exact versions (`"1.2.3"`, no `^`/`~`/ranges) in every `package.json`; lockfile committed; `npm ci` only; `.npmrc`: `ignore-scripts=true`, `save-exact=true`, `audit-level=high`, `engine-strict=true`. |
| P4 Provenance | Before an update PR merges: `npm audit signatures` passes (registry signatures and npm provenance attestations) and the package's provenance, if present, must name the expected source repo; packages for which provenance is available and then disappears block the update. `@noble/*` publish with provenance `[UNVERIFIED: confirm per release]`. |
| P5 Review of updates | Dependency bumps are manual, one dependency per PR, with the tarball diff (`npm diff`) reviewed, changelog read, and release age >= 14 days (cooling-off) unless a security fix. Automated bot PRs (Dependabot/Renovate) may open PRs but never auto-merge. |
| P6 Install scripts | None permitted for production dependencies; dev dependency with install script must be listed with justification (esbuild's postinstall binary resolution is handled via its platform package with `--ignore-scripts` and an explicit rebuild verification step). |
| P7 Vendoring option | Crypto-critical dependencies (`@noble/*`) are additionally vendored into `vendor/` at release as an integrity cross-check (diff between registry tarball and vendored copy must be empty). Reviewers may choose to build from vendor. |
| P8 Typosquat/ownership | CI checks that each dependency's name and maintainer set match the allowlist record; maintainer change fails the check and requires review. |
| P9 CI hardening | Actions pinned by commit SHA; `permissions: contents: read` default; no `pull_request_target` with untrusted checkout; OIDC only on release workflow; `harden-runner`-style egress control during build `[UNVERIFIED: tool choice]`. |
| P10 Typed supply | No CDN or runtime `import()` of URLs; CSP blocks it. |
| P11 Lockfile lint | `lockfile-lint`-style check (own script) verifies all resolved URLs are `https://registry.npmjs.org/` and integrity hashes are present. |

## 12. Update mechanism

- **Same-origin web:** the operator deploys a new hashed bundle. Voters always load the current bundle; the HTML shows `client version` and a short build ID; `/verify-client` and mirrors compare to the release manifest. No service worker is used in v1 (a SW is delivered by the very origin we distrust and offers no verification hook, so it would add complexity without a security benefit; revisit if a verifiable-update browser mechanism such as signed bundles/Isolated Web Apps matures `[UNVERIFIED status]`).
- **Pinned local client:** voters or groups may download the release zip (`quietvote-web-<ver>.zip`, listed in the manifest), verify it with `qv verify-release`, and open `index.html` from disk or host it themselves (split-origin). It points to a board URL given in the invitation fragment.
- **Election-time freeze:** the manifest for an election records `client_release` (version + `client_assets` Merkle root). The board server MUST serve exactly that client during an election window; a server upgrade that changes the client mid-election requires an organizer-signed `client.update` event, published on the board, so observers see client changes. Default policy: **no client change after registration opens** except security fixes.
- **Version compatibility:** the client refuses to build or verify ballots when the manifest `protocol` version is outside its supported list, and tells the user which release to obtain (QV-30 protocol-version policy).
- **Server/binary updates:** operators upgrade by replacing the binary or image digest; `quietvote verify-self` re-hashes the running binary against the embedded release manifest and prints signature status. No auto-update, no phone-home (ADR-009). `qv check-updates` is opt-in, manual, fetches only the signed release index from a URL the user configures.
- **Revocation:** compromised releases are revoked by a signed `revocations.json` (key/artifact hash list) that verifiers check when online.

## 13. Release process (client-relevant steps; governance in QV-27)

1. Release branch frozen; CI green on all required checks (QV-30).
2. Release candidate tag `vX.Y.Z-rc.N` (signed). Reproducible builds run on two builders; hashes compared.
3. Provenance and SBOM generated; Sigstore signing by the release workflow.
4. Signing ceremony: >= 2 maintainers verify the manifest against their own rebuild (not just CI output), then sign with their release keys.
5. Publish to GitHub Releases and mirror(s); update `latest` channel index; announce hashes via at least two independent channels.
6. Post-release: external rebuilders post attestations; if a discrepancy appears within 7 days the release is pulled and revoked.
7. Security fixes follow QV-27 §security releases with the same pipeline (shorter RC window, same two-builder rule).

## 14. Requirements

| ID | Requirement | Priority | Acceptance criteria | Verification |
|---|---|---|---|---|
| QV-19-REQ-001 | The web client shall be a static bundle with no server-side rendering and no runtime requests to origins other than the board origin(s) declared in the manifest. | Must | Crawler test records only declared origins; CSP `connect-src` matches. | E2E |
| QV-19-REQ-002 | The served client shall have no production dependencies beyond those in the allowlist (initially `@noble/curves`, `@noble/hashes`). | Must | `npm ls --omit=dev` equals allowlist. | CI |
| QV-19-REQ-003 | Voter identity seeds shall be generated with `crypto.getRandomValues` and stored only as an AEAD-wrapped container keyed by Argon2id. | Must | Storage inspection after onboarding shows no plaintext seed; wrap/unwrap vectors pass. | Unit, E2E |
| QV-19-REQ-004 | Default Argon2id parameters shall be m=65,536 KiB, t=3, p=1, 16-byte salt, 32-byte output, with a hard floor of m=19,456 KiB, t=2; parameters shall be stored in the container. | Must | Test rejects containers or settings under floor; benchmark reports unlock time. | Unit, perf |
| QV-19-REQ-005 | Unlock on the reference mid-range phone should take between 0.5 s and 3 s; if outside, the client shall adapt m within the floor/ceiling and warn when at the floor. | Should | Device-lab report. | Perf |
| QV-19-REQ-006 | After unlock the client shall use a non-extractable signing key when WebCrypto Ed25519 is available, and zero raw seed buffers after import. | Should | Test: `exportKey` rejects; heap probe shows buffer zeroed. | Unit |
| QV-19-REQ-007 | Passphrases shall meet the policy in §5.3; a generator of >= 7 words shall be offered. | Must | UI test rejects weak inputs. | E2E |
| QV-19-REQ-008 | The client shall provide key-file export and recovery-code backup before first ballot, with checksum validation on import. | Must | Round-trip test. | E2E |
| QV-19-REQ-009 | No secret value (seed, scalar, passphrase) shall be placed in URL, DOM (except explicit recovery display), logs, `localStorage`, or error messages. | Must | Static analysis rule plus runtime canary test searching all storage and DOM for canary secret. | Lint, E2E |
| QV-19-REQ-010 | Invitation tokens shall travel in the URL fragment and be hashed on device before transmission. | Must | Server access-log test shows no token; request body contains only the hash. | E2E |
| QV-19-REQ-011 | The ballot flow shall display the tracking code and fix ciphertexts before enabling CAST and AUDIT, give both equal prominence, and not allow skipping the decision step. | Must | UI test; accessibility review. | E2E, review |
| QV-19-REQ-012 | An audited ballot shall reveal plaintext and randomness, be published to the board as spoiled, never be tallied, and require fresh randomness for any next attempt. | Must | Protocol test: re-encryption of audit data matches ciphertext; tally excludes spoiled; randomness differs. | Unit, E2E |
| QV-19-REQ-013 | The Benaloh audit shall be completable on a second device via the verifier page, the CLI, or the web client, using only the tracking code or an audit package. | Must | Cross-implementation test on audit packages. | E2E |
| QV-19-REQ-014 | Randomness of cast ballots shall be zeroed after successful submit and shall never be persisted. | Must | Storage and heap canary test. | Unit |
| QV-19-REQ-015 | After CAST, the client shall verify the inclusion proof, STH signature, and consistency with the stored prior STH and display the result. | Must | Tampered proof and rolled-back STH produce distinct errors. | E2E |
| QV-19-REQ-016 | The offline verifier page shall be a single file under 400 KB with `connect-src 'none'`, runnable from `file://`, producing a full verification report from an export bundle. | Must | Page loads with network disabled; fixture bundles pass/fail as expected. | E2E |
| QV-19-REQ-017 | The verifier page and CLI shall produce identical verdicts on the shared test-vector corpus. | Must | Differential test in CI. | CI |
| QV-19-REQ-018 | All HTML/JS responses shall carry the header set in §8.1, including CSP without `unsafe-inline`/`unsafe-eval`, and `require-trusted-types-for 'script'` with a single `qv-default` policy. | Must | Header conformance test; browser console shows no violations in E2E. | E2E |
| QV-19-REQ-019 | DOM-injection sinks shall be banned by lint; rendering shall use `textContent`/DOM APIs. | Must | Lint rule fails on `innerHTML` usage. | Lint |
| QV-19-REQ-020 | Script and module assets shall be content-hashed and referenced with SRI (sha384). | Must | HTML parse test verifies every `script`/`modulepreload`/`link` has integrity matching file. | CI |
| QV-19-REQ-021 | Documentation shall state that SRI and CSP do not protect against a malicious operator serving both page and hashes, and shall present split-origin hosting and release verification as the mitigations. | Must | Docs and UI "About this client" text reviewed. | Review |
| QV-19-REQ-022 | The system shall support split-origin operation (client served from a host other than the board). | Should | E2E on two origins. | E2E |
| QV-19-REQ-023 | Release artifacts shall be reproducible: two independent builders shall produce identical SHA-256 for every hashed artifact before signing. | Must | `repro-check.sh` output stored with release; mismatch fails release job. | CI, release gate |
| QV-19-REQ-024 | Builds shall use pinned Node, npm, esbuild, digest-pinned base image, `npm ci --ignore-scripts`, and `SOURCE_DATE_EPOCH`. | Must | Build config lint; build log records versions/digests. | CI |
| QV-19-REQ-025 | Each release shall include `release-manifest.json` per §10.1 signed by (a) Sigstore keyless workflow identity and (b) at least 2 of N maintainer release keys. | Must | `qv verify-release` passes only with both; removal of either is reported. | Release gate |
| QV-19-REQ-026 | Maintainer release keys, fingerprints, and rotation history shall be published in-repo and on prior manifests; key rotation shall be signed by the old key. | Must | Document present; rotation test. | Review |
| QV-19-REQ-027 | Releases at 1.0 shall have SLSA Build L3 provenance for all binaries and images; pre-releases shall have at least L2. | Must (1.0) / Should (0.x) | `slsa-verifier` or `gh attestation verify` passes in CI against the published artifacts. | CI |
| QV-19-REQ-028 | A CycloneDX SBOM shall be published per release, signed, and listed in the manifest. | Must | SBOM validates against schema; component list equals lockfile production closure. | CI |
| QV-19-REQ-029 | The dependency policy P1–P11 shall be enforced by CI scripts, including exact pins, allowlist match, lockfile registry/integrity check, signature/provenance audit and no install scripts. | Must | Negative tests: range version, new dependency, tarball URL change each fail the job. | CI |
| QV-19-REQ-030 | Dependency updates shall not auto-merge; each production dependency update shall have a recorded tarball diff review and >= 14-day age (except security fixes). | Must | PR template checklist; branch protection requires two approvals on `policy/` changes. | Review |
| QV-19-REQ-031 | Crypto dependencies shall be cross-checked against vendored copies at release. | Should | Diff empty in release job. | CI |
| QV-19-REQ-032 | The client served during an election shall match the election manifest's `client_release`; changes mid-election require an organizer-signed board event. | Should | Integration test: asset swap without event is flagged by `verify-client`. | Integration |
| QV-19-REQ-033 | `qv verify-client <url>` shall fetch and verify every asset against the signed release manifest. | Must | Passes on genuine deployment; fails on single-byte change. | E2E |
| QV-19-REQ-034 | No auto-update or phone-home shall exist in any component; update checks are manual and opt-in. | Must | Egress-deny test with default config shows zero outbound attempts. | E2E |
| QV-19-REQ-035 | The client shall refuse to operate on manifests whose protocol version it does not support and shall name a compatible release. | Must | Version-skew test matrix. | Unit |
| QV-19-REQ-036 | The release process in §13 shall be executed with a checklist artifact attached to each release; releases that skip the two-builder reproducibility check shall be marked "unverified" and not promoted to `stable`. | Must | Release workflow refuses `stable` without checklist artifact. | Release gate |
| QV-19-REQ-037 | A revocation list mechanism shall exist for compromised releases and keys. | Should | Verifier flags a revoked hash in test. | Unit |
| QV-19-REQ-038 | Client text shall state the residual risks (compromised device, malicious served code, no receipt-freeness) in plain language during onboarding. | Must | Content review against QV-07 non-claims. | Review |

## 15. Data and privacy

- **Inputs:** voter choices (device only), passphrase (device only), invitation token (hashed before send).
- **Outputs:** public key, registration signature, ballot ciphertexts/proofs/signature, spoiled ballots (voluntary), no client telemetry.
- **Retention:** wrapped key and receipts persist in the browser until the voter deletes them ("Forget this device" wipes IndexedDB and Cache). Spoiled ballots are public forever.
- **Linkability risks:** stable public key links a voter across elections of the same group unless the group issues per-election keys (client generates a fresh key per election by default; reusing a key is opt-in).
- **Not claimed:** protection against malware or malicious extensions on the device, against coerced voting, or against a hostile operator-served client when the voter performs no verification.

## 16. Security and abuse cases

| Case | Attacker/cause | Impact | Mitigation | Residual risk |
|---|---|---|---|---|
| Malicious operator-served JS | Operator | Plaintext leak or ballot swap | Split-origin, verify-client, audits, reproducible build, CLI | Un-audited voters on same-origin deployments |
| CDN/object-store tamper | Third party | Same | SRI, no CDN, hash checks | Low |
| XSS | Bug | Key use, plaintext read | CSP, Trusted Types, lint ban, no dynamic HTML, non-extractable key | Session abuse while unlocked |
| Stolen device or blob | Thief | Offline passphrase guess | Argon2id 64 MiB, passphrase policy, auto-lock | Weak passphrases |
| Malicious browser extension | User-installed | Full compromise | Documented non-claim; CLI option | Accepted |
| Dependency hijack | npm attacker | Backdoored crypto | Allowlist, pins, provenance, cooling-off, vendor diff, reproducible builds | Zero-day in `@noble/*` itself (audited, but not infallible) |
| Compromised CI | Attacker | Malicious release | SLSA L3, 2-of-N offline signatures, independent rebuild | Collusion of maintainers |
| Audit bypass by attacker-controlled "second device" | Attacker | False assurance | Use the CLI or a device from a different source; docs | User behavior |
| Downgrade to older protocol client | Operator | Weaker guarantees | Manifest-pinned protocol version; refuse unsupported | None |

## 17. Open questions

| Question | Owner | Target review | Proposed default |
|---|---|---|---|
| Re-confirm Argon2id parameter sets against RFC 9106 §4 and current OWASP text | Client lead | M1 | Keep m=64 MiB, t=3, p=1; floor 19 MiB/t=2 |
| Per-election vs per-group voter keys | QV-04 owner | M1 | Per-election default (§15) |
| Passphrase wordlist (EFF short vs custom) | Client lead | M2 | EFF short list (CC BY 3.0 US, attribute) `[UNVERIFIED licence text]` |
| Which Sigstore bundle format/cosign major at 1.0 | Release engineer | M3 | Latest stable bundle format at release time |
| Release key quorum N and custody | Project owner | Before 1.0 | N=3 maintainers, threshold 2 |
| Trusted Types support gaps in Firefox/Safari | Client lead | M2 | Rely on lint+CSP fallback |
| Browser support for import-map integrity | Client lead | M2 | Fall back to preload-with-integrity |

## 18. Proposed ADRs

- **QV-ADR-P19-1** Persist only an Argon2id/AES-GCM-wrapped seed; use non-extractable `CryptoKey` for session signing where available.
- **QV-ADR-P19-2** Dual release authenticity: Sigstore keyless **and** offline 2-of-N maintainer signatures, plus two-builder reproducibility.
- **QV-ADR-P19-3** No service worker in v1; split-origin as the recommended high-assurance web posture.
- **QV-ADR-P19-4** Production dependency allowlist (`@noble/curves`, `@noble/hashes` only) with ≤ 3 package ceiling.
- **QV-ADR-P19-5** Per-election voter keys by default.

## 19. References (accessed 2026-10-21; outbound fetches were blocked in the authoring sandbox, so items marked were cited from memory)

- Benaloh, "Simple Verifiable Elections", EVT 2006 `[UNVERIFIED access]`; Adida, "Helios: Web-based Open-Audit Voting", USENIX Security 2008 `[UNVERIFIED access]`.
- RFC 9106 Argon2 — https://www.rfc-editor.org/rfc/rfc9106 `[UNVERIFIED access]`; OWASP Password Storage Cheat Sheet `[UNVERIFIED access]`.
- W3C CSP3, Trusted Types, SRI (https://www.w3.org/TR/CSP3/, https://w3c.github.io/trusted-types/dist/spec/, https://www.w3.org/TR/SRI/) `[UNVERIFIED access]`.
- SLSA — https://slsa.dev/spec `[UNVERIFIED version/tracks]`; Sigstore — https://docs.sigstore.dev `[UNVERIFIED]`; in-toto — https://in-toto.io.
- CycloneDX — https://cyclonedx.org/specification/overview/.
- Reproducible Builds — https://reproducible-builds.org (SOURCE_DATE_EPOCH spec).
- npm registry versions verified 2026-10-21 via `npm view`: `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `esbuild` 0.28.2, `@cyclonedx/cyclonedx-npm` 6.0.1, `sigstore` 5.0.0.

## 20. Approval and change history

| Reviewer | Decision | Date | Notes |
|---|---|---|---|
| Project owner | Pending | — | Draft authored 2026-10-21 |
