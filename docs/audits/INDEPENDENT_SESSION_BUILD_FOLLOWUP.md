# Independent session-storage and shared-worker integration follow-up

Date: 2026-11-19. This is an engineering review by a separate agent that did not implement the production changes under review. The reviewer supplied independent distinguishing tests and reviewed the author’s repairs. It is not an external security audit, a human GitHub approval, or authorization to release or deploy.

## Source identity and composition

The exact reviewed and executed source is `cde2db27a23b5bf37b7a23d45c8e53c476580a66`, tree `80a9f1fc06fe6aa17723f1471c8932fbf8248553`. The reviewer independently confirmed the head/tree in its isolated worktree before the final checks. This source contains the adopted Python policy, session-only storage, shared-worker packaging and receipt/copy corrections. The native private-file branch is **not present in this source**; later adoption of that branch is a different composition and is not silently assigned this exact-source receipt.

The reviewer started from root commit `48c702eef3c841e4363769139418c3f31c6d6373`, tree `3ecfb3116a57987ef3bca7725b2186821042fea1`, in a separate worktree and branch. The substantive web comparison is against `ba728be0140751bc77d464db32c5f9dc110dd007`, tree `bf64cc5646a8eebc57fceae891a60d716399959b`. This includes final session source `b0dfbc6aff8f1a8216d7bf96b0f44de8b1c9c871` and shared-worker production/test commit `0ae40d1ada4a9b2cac12a90ddca5d16858e86ede`, plus the corrections identified below. Earlier author measurements are historical evidence, not measurements of this final source.

The full diff from initial main `019f4e789be2ff38a5fb2d348c3b225cc87cf296` contains **1,313 changed paths: 1,292 additions and 21 modifications, with zero deletions**. The follow-up delta from `ba728be` contains **49 paths: 14 additions and 35 modifications, with zero deletions**. This checks accidental path deletion, not semantic equivalence of every changed line. A direct Git comparison also confirms that `packages/crypto/src`, `packages/protocol/src`, the package manifests/lock, `VENDOR.lock`, the browser keystore, sealer and worker source are unchanged from `ba728be`.

The existing independent core, build/UI/origin, server-recovery and adopted-Python-policy reports were examined to establish their coverage boundaries. This review does not recast their executions as its own or claim a fresh line-by-line audit of every consolidated path. Windows ACL transport, custody and publication corrections remain in a separate author/reviewer lane outside this source; this receipt does not establish their final independent or native Windows qualification.

| Composition surface | Existing evidence boundary and this follow-up |
| --- | --- |
| Core protocol, membership, recovered control/export behavior | `INDEPENDENT_REVIEW.md` and `INDEPENDENT_RECOVERY_FOLLOWUP.md` describe their named earlier sources and independent cases. The final composition is not a fresh whole-codebase audit. |
| UI, catalogs, timezone, API origins and recovery links | `INDEPENDENT_UI_FOLLOWUP.md` qualifies `ba728be`; this review re-executes the affected app/origin/catalog/build tests on the later combined source. |
| Adopted Python manifest policy | `INDEPENDENT_MANIFEST_FOLLOWUP.md` records the separate distinguishing Python/TypeScript evidence. Its tests were not rerun in this web/build lane. |
| Session storage and shared worker packaging | This receipt provides source review, distinguishing late-response probes, final scoped checks and exact output hashes. |
| Windows private-file implementation and publication follow-ups | The separate branch’s `docs/reports/windows-private-files-20261119.md` records author checks. Its final independent follow-up was not established when that review lane stopped. That branch is outside this tested tree; no independent final-source or native Windows result is inferred here. |

## Findings and repairs

### Navigation was incorrectly described as erasure

The original session loss disclosure said that reload, close or navigation loses the page’s keys, receipts and pending ballots. Source review found that `pagehide` only cancels verification; it does not destroy the page session or all retained signers. Browser back/forward caching may preserve a document and its JavaScript heap. The distinction matters because loss of a dependable recovery path is not a memory-erasure guarantee.

The author corrected English and all five draft catalogs, the operator README and the feature report in `efb0061d8ae01790b163bc5557c90a188fde2e30`. The copy now describes possible loss of access, explicitly says that leaving does not guarantee erasure, and identifies **Clear this page session** as the app action for intentional clearing. No destructive pagehide policy was added and the pending retry/idle-lock behavior was preserved. The actual-app assertion checks both disclosures. This is an independently confirmed source/documentation issue, not a native-browser reproduction; the cited [browser documentation](https://web.dev/articles/bfcache) supplies the cache-lifetime premise.

### A response received after navigation could lose its download

With receipt remembering off, the actual app could accept and verify a successful CAST response while the voter was on another SPA route, remove the public pending marker, and then lose the only reachable signed receipt before offering it for download. The original map only retained session controllers and removed them immediately on the completed transition. The same symptom also occurred with healthy default device storage, where the abandoned controller was not retained.

An independently authored deterministic response barrier called the real protocol/FakeBoard path, held the successful response after the board processed exactly one POST, navigated to Rules, and released the response there. In both modes it checked that the pending marker was removed, receipt storage remained empty, and no second POST occurred, then returned to Vote and required **Save receipt file**. Both unchanged cases failed only at that last assertion on `efb0061`. The two-case run reported 0 passes, 2 expected assertion failures, 0 skips/cancellations, in 6.612 seconds. The ballot itself remained accepted; this was a lost-result/download transition. Both probes drive actual `startApp` in the deterministic DOM/task harness. The default-mode control uses a healthy `MemoryStorage` adapter under the normal durable-mode app path; real IndexedDB remains a browser-journey boundary.

An adjacent independent probe sets the FakeBoard inclusion path invalid while retaining the same successful-response barrier. Both modes also lost the returned signed receipt as alarm evidence. The marker correctly remained, exactly one CAST was recorded, and receipt storage stayed empty; both cases failed at the download assertion on `efb0061` (0 passes, 2 expected failures, no skips/cancellations, 6.571 seconds). This follows the existing controller contract that an inclusion alarm retains returned evidence; fork/rollback receipt exclusions are a different boundary and remain intact.

The author repaired both response classes in `cde2db27a23b5bf37b7a23d45c8e53c476580a66`. A document-local map retains only the returned public `CastReport`, not a signer, selections, randomness or an additional default-mode retry envelope. It uses the existing board/election/read-credential cache key and checks the manifest and stored/current signing key. A different unresolved pending code takes precedence. Successful clearing prevents an old completion from restoring the map. A current pending Vote view refreshes when the result arrives, and the handoff is consumed only after the current result/download view is presented. No receipt write is added to `DeviceStorage` when remembering is off.

The reviewer verified that the four original test bodies were byte-identical to their preserved pre-fix sources, then reran them unchanged in the isolated checkout. All four passed. Together with the independently added visibility-return control, the final probe run passed **5/5**, with **0 failures, skips or cancellations**, in **15.895 seconds**. The author preserved all four distinguishing cases in `session-storage-ui.test.ts` and added return-before-response, actual download, next-ballot-after-presentation, and clear-before-response controls. The final integration batch below executes that durable test file again. No production source was edited in this review lane. Both confirmed findings are corrected in the exact source above; no further confirmed issue remained from this scoped review.

## Storage, signing and recovery review

`StorageSession` observes real storage errors and only switches after the explicit user choice. Retry keeps the original store. The one-way document-local memory mode reports persistence as false, starts separately, and neither copies nor clears inaccessible saved state. A previously inaccessible pending marker may exist; the UI cannot infer that store is empty. Existing generation-bound handles fail after switching, and late key installation uses the existing atomic/current-context guards. Failed clearing restores the earlier storage context and public pending recovery rather than announcing erasure; key/signing work remains invalidated. Once a ballot has begun, mode switching is refused.

Voter continuation requires an explicit key-file download action, also checked on the Vote route so navigation cannot bypass the gate. Organizer setup applies its own equivalent action gate. This observes a download action rather than proving a safely retained backup. Existing encrypted container format, passphrase and KDF rules are retained; session unlock does not silently rewrap an imported container.

Protected temporary organizer signers participate in generation invalidation alongside voter signers. A stale unlock is locked; a signature finishing after invalidation is zeroed and withheld from the request builder. The app’s active-key predicate includes both groups for the eight-minute warning and the existing strict ten-minute expiry. Interval, pointer and keyboard regressions exercise the actual app; the additional reviewer control exercises visibility return at the strict two-minute hidden boundary. These local controls do not establish browser suspension timing or physical key-memory erasure.

Unresolved retries keep the controller’s original signed bytes, while dropping choices, audit reveal material and randomness through the existing cleanup path. The map key binds board, API election ID and read credential; the retained entry is also checked against manifest hash, stored key ID, current signing identity when present, and the public pending code. Explicit retry rechecks the binding. The tests exercise changed boards, read credentials and stored signing keys, exact-byte resend, code download, receipt download with remembering disabled, and session clear preserving inaccessible saved data. The public inclusion check remains the proof gate and does not synthesize a missing signed receipt. Session-only retry state does not become a cross-tab or post-reload lock.

The ordinary wrapper still depends on `crypto.subtle`. Completion of the storage-disabled workflow does not adopt an alternate key-wrapping construction or resolve the conflict between QV-26’s no-SubtleCrypto requirement and QV-19’s specified WebCrypto AES-GCM/non-extractable wrapping key. No new crypto dependency or plaintext container was introduced.

## Packaging, catalogs and integration review

The app and its existing ES-module sealing worker now share one esbuild splitting graph. Their common source is emitted once; each execution realm still has independent module state. The worker request/response protocol and cryptographic source are unchanged. The standalone verifier is still built as a separate single-file output. The aggregate budget counts every emitted JavaScript asset exactly once, including all five unoffered draft catalog chunks and the worker entry. Entry-file gzip size is not the whole initial download because static shared modules also load.

Existing strict aggregate, entry and verifier budgets, CSP generation and integrity checks remain. App/static and selected lazy modules retain dependency-ordered SRI preloads. The existing W15 boundary for runtime integrity of worker entry/import fetching remains; asset-manifest digests do not themselves enforce that browser boundary. The actual emitted-worker test loads the built entry and shared imports in a separate Node worker realm and compares the complete self-checked seal response with the source response. This is executable compiled-output evidence, not browser CSP qualification.

The emitted catalog representation matches every current source string, formatting behavior, missing-key slot and review record in the parity checks. All five translated catalogs remain drafts and unoffered without the existing reviews. Neither parity checks nor this English-language engineering review constitute native translation review.

The mandatory device-settings journey includes explicit IndexedDB refusal, fallback choice, backup gate, same-byte retry across SPA routes, code and returned-receipt download, and reload behavior. Split-origin remains the ninth mandatory journey and exercises production assets against a separate real API origin, real CORS credentials, SSE resume, isolated same-ID contexts, organizer audiences and serving policies. The runner still forces browser tooling and propagates failure. Both changed journey files receive explicit strict TypeScript checking here, but native execution remains a separate hosted qualification.

## Exact-source execution

The reviewer used a regular pinned `npm ci --ignore-scripts --no-audit --no-fund` install in the isolated worktree, followed by `npm run vendor:install` (two pinned packages, 132 verbatim files). No whole-`node_modules` symlink was used. Both actual CLI builds ran the existing verified-vendor-consumption check. Node was **24.22.3**; the strict checks used the pinned TypeScript **5.9.3**. No package, lockfile or vendor digest was changed.

| Check on the exact source above | Independently observed result |
| --- | --- |
| Four unchanged late-response cases plus actual-app visibility return | **5/5 passed**, 0 failed/skipped/cancelled, 15.895 s. |
| Bounded application/origin/catalog/build/runner batch below | **116/116 passed**, 0 failed/skipped/cancelled, 66.203 s; files ran serially. |
| Actual emitted sealing-worker execution | Passed within that 116-case batch; its shared modules resolve and the complete response equals the source control. |
| Strict web source and unit-test TypeScript | Exit 0, no diagnostics, 384 MiB heap. |
| Strict explicit `e2e/device-settings.ts` and `e2e/split-origin.ts` TypeScript | Exit 0, no diagnostics, 384 MiB heap; temporary config extends the unchanged base config and anchors the checkout’s Node type root. |
| Current i18n scanner | Passed: 388 static, 29 resolved dynamic and 2 unresolved dynamic references, 1 translator forwarder and 1 declared exclusion. Its existing restricted `verifyView` scan exclusion was retained, not broadened. |
| Two production CLI invocations and complete output comparison | Both exited 0; all 16 names and file bytes match. |
| Manifest/HTML digest and size verification | Every emitted asset has the recorded size/SHA-256/SHA-384; all seven HTML asset references have matching SRI; no unmanifested asset is present. |
| Follow-up whitespace and deletion checks | `git diff --check ba728be..HEAD` passed; no deleted paths in either recorded source comparison. |

The 5-case probe count and the 116-case batch overlap: the four late-response regressions are also preserved and run in the durable application test file. They must not be added as a unique-test total. The existing timer case exercises interval, pointer and keyboard triggers; the reviewer-only visibility control separately checks exactly two hidden minutes and two minutes plus one millisecond. It first passed 1/1 on `efb0061`, and passed again in the final five-case run.

Exact scoped commands (from the isolated repository root):

```sh
node --max-old-space-size=384 node_modules/typescript/bin/tsc -p packages/web/tsconfig.json --noEmit --pretty false
node --max-old-space-size=384 node_modules/typescript/bin/tsc -p ../quietvote-evidence/session-review-browser-tsconfig.json --noEmit --pretty false
npm run i18n:check -w @quietvote/web
```

The final 116-case test command used `node --max-old-space-size=384 --test --test-concurrency=1 --test-reporter=spec` with these exact 23 files:

```text
.github/scripts/run-browser-journeys.test.mjs
packages/server/test/split-origin-cors.test.ts
packages/web/test/storage-session.test.ts
packages/web/test/session-storage-ui.test.ts
packages/web/test/device-settings.test.ts
packages/web/test/device-settings-ui.test.ts
packages/web/test/idb-opening.test.ts
packages/web/test/organizer-setup.test.ts
packages/web/test/publish-ui.test.ts
packages/web/test/cast-alarm-delivery.test.ts
packages/web/test/split-origin.test.ts
packages/web/test/split-origin-ui.test.ts
packages/web/test/split-origin-redirect.test.ts
packages/web/test/home-origin-ui.test.ts
packages/web/test/organizer-timezone-ui.test.ts
packages/web/test/copy.test.ts
packages/web/test/i18n-catalogs.test.ts
packages/web/test/precompile.test.ts
packages/web/test/app-precompile.test.ts
packages/web/test/build.test.ts
packages/web/test/lazy.test.ts
packages/web/test/seal-worker-lifecycle.test.ts
packages/web/test/built-sealing-worker.test.ts
```

`TMPDIR` was scoped to the reviewer’s disposable test-output directory. The reviewer-only probe files were removed after their final execution; their exact source and red/green logs remain in the evidence directory. The four receipt cases also remain as normal repository tests, with the original assertion bodies preserved by the author.

## Repeated production build receipt

The independent production CLI invocations were:

```sh
node --max-old-space-size=384 packages/web/src/build/cli.ts
node --max-old-space-size=384 packages/web/src/build/cli.ts ../quietvote-evidence/session-review-build-repeat
```

Both generated build **`1c5463127a71`**, with the default same-origin deployment metadata `{ "api_base": "", "board_origins": [] }`. The comparison checks the complete directory contents, including HTML, CSS, headers and manifest, not only the JavaScript graph. There are **16 output files**, **12 manifested assets**, **11 JavaScript assets** and **7 checked HTML SRI references**.

| Measurement | Exact bytes | Unchanged strict limit | Distance to limit |
| --- | ---: | ---: | ---: |
| Complete JavaScript graph, gzip | 189,042 | below 204,800 | 15,758 |
| App entry alone, gzip | 55,016 | below 112,640 | 57,624 |
| Worker entry alone, gzip | 121 | informational | — |
| Standalone verifier HTML, raw | 198,867 | below 409,600 | 210,733 |

The worker entry is 108 raw bytes and imports its algorithm from the shared graph; its entry size is not its full load. Every JavaScript asset, including those shared modules and all unoffered catalogs, is counted in the aggregate. The gzip implementation recorded by the comparison is Node’s `1.3.2.1-motley-285e94b`. No earlier feature or packaging checkpoint’s sizes are assigned to this source, and no byte identity with the older standalone verifier is claimed.

### Complete file-size and SHA-256 receipt

All entries below match both builds. Asset-level SHA-384 values are also independently recomputed and checked against the manifest, whose own SHA-256 is included here.

| Output path | Raw bytes | Gzip bytes (JS) | SHA-256 |
| --- | ---: | ---: | --- |
| `_headers` | 1,271 | — | `9bf413ca1aa28c15e0da6199e9527374b6680dcbec0141e20eea8f483fc49872` |
| `asset-manifest.json` | 3,724 | — | `33e82b0c4f0e6943cc8044b01d1b5973b17411e376867d471331bbb918bb8c4f` |
| `assets/app.8b89a3a2d4be.js` | 167,257 | 55,016 | `8b89a3a2d4becf79da7a6bfbab72df1f8aba6ddd012d26040cff42753765ab26` |
| `assets/ar-5YU2NGU4.js` | 54,064 | 13,695 | `cbd84011edc18c6ad8356505c9cce72ecc2752a210bc444b09870f0848e7f024` |
| `assets/charts-5QBASICS.js` | 2,358 | 1,193 | `cc308247d0640625889fc1801d4911450bc1571c657236d4b0804e13d936c5b4` |
| `assets/chunk-43HX6F33.js` | 676 | 432 | `808e5b4eec800ea845e05d008c301e04bba2019b5f13051fd9458fcfcfccc167` |
| `assets/chunk-FGVAZEWE.js` | 46,604 | 15,056 | `47b5675df3b244c1fa038f468cf81e5caea3cef808f901d8c205e891d88d775f` |
| `assets/chunk-FWXTNTMN.js` | 144,224 | 52,369 | `398770b070d56252b51871b6bedc9b74411d3f83c8885044596a53b81f0593be` |
| `assets/de-W4SITHDT.js` | 44,017 | 13,246 | `ab9abcb928aab7911084699aa00fe9fd8831ef186247d5e2067314ea3558eb3e` |
| `assets/es-7BF4YY4V.js` | 40,691 | 12,394 | `cdd811fe7ac8505730ae5f41f7d82ac067d5b1825e98d28ad1150ee67f164114` |
| `assets/fr-EE74X3XY.js` | 43,839 | 13,115 | `1767918b800ccd6056c0ef7cbbec31dd86f5ce0f9464121b5b0d9f3e189a8c7d` |
| `assets/pt-BR-GZNAPG5B.js` | 40,399 | 12,405 | `8396d47bd017fae6c98a81bdb6cdd1cedd54e156b70cdcebd97e4661ab3cdfd2` |
| `assets/seal-worker.ac90c595efef.js` | 108 | 121 | `ac90c595efef2e54c1c7c574f1b31301ed6151babe768a0a32c389efdcd187a1` |
| `assets/styles.cb2413f8caef.css` | 4,627 | — | `cb2413f8caef452c573cceab628899e29cad845415616c147f208b56504d1d30` |
| `index.html` | 2,298 | — | `037a3a410aff941011ac5beb57e34210afcaaf3ed793395d356d3b061d8f44fe` |
| `verifier.html` | 198,867 | — | `3bb1dcb2e00fb45c86590ebe60dda11ac4fa7e2b9d12c8497a9780c0314babb5` |

## Limits and retained evidence

No full-repository local TypeScript or all-workspace test pass is asserted. This lane ran the stated bounded checks and did not repeat known resource-failing whole-repository checks. No local Chromium retry was made: the established container startup failure occurs before browser assertions. DOM/task adapters, Node fetch/CORS checks and Node worker execution do not establish native IndexedDB, bfcache, CSP/module loading, focus/layout, or browser CORS behavior. The mandatory hosted production journeys must qualify the final published source.

The native private-file branch is outside the exact tree in this receipt, and this report makes no native Windows, final native-code independent-review, external security-audit, human/CODEOWNER approval or release claim. It also does not establish Tor Browser compatibility, alternate WebCrypto-free key wrapping, native translation review, manual accessibility assessment, operational qualification, or absence of every possible defect. Any later runtime composition needs its own applicable integration checks.

The local evidence directory is `quietvote-evidence/` beside the reviewer’s worktree. It retains:

- `session-review-npm-ci.log` and `session-review-vendor-install.log`.
- `session-review-cast-navigation-both-before.log` and `session-review-cast-alarm-navigation-before.log`, with the four expected pre-fix assertion failures; the earlier one-case success-response red run is retained separately.
- `session-review-cast-navigation-probe.source.txt`, `session-review-cast-alarm-navigation-probe.source.txt`, and `session-review-signer-visibility-probe.source.txt`, preserving the exact temporary test sources.
- `session-review-signer-visibility.log` and `session-review-independent-probes-final.log`.
- `session-review-focused-test-files.txt` and `session-review-focused-final.log`.
- `session-review-web-tsc-final.log`, `session-review-browser-tsc-final.log`, `session-review-browser-tsconfig.json`, and `session-review-i18n-final.log`.
- `session-review-build-a.log`, `session-review-build-b.log`, `session-review-build-compare.mjs`, `session-review-build-comparison.json`, and `session-review-build-comparison.log`.
- `session-review-final-source-inventory.json` and the complete `session-review-final-initial_main-inventory.txt` / `session-review-final-prior_surface-inventory.txt` path inventories.

The raw outputs are retained at `packages/web/dist` in the isolated checkout and `quietvote-evidence/session-review-build-repeat`. The measured values and complete output digests above make this committed report useful without those transient directories. The reviewer’s branch is `worker/quietvote-independent-session-build`; this additive report is its only tracked change, and its commit carries the project’s DCO sign-off.
