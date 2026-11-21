# W15 independent source review

## Review state

**No blocking source finding identified in final W15 commit `df064156727a0bb79400c0c636ddcc1801188f4a`, including its app-only UTF-8 follow-up.** This is an AI source review and focused test receipt, not a formal GitHub approval or a security-reviewer-group approval. Browser qualification remains a separate required gate.

- Base: `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`.
- Final candidate: `df064156727a0bb79400c0c636ddcc1801188f4a`.
- Final tree: `0db87c6933db0ba9123bd583083a2a98faeee2a6`.
- Prior reviewed implementation commit: `6b25d6df61820e43735ce8afeae08e8435133957`, tree `66d731074e81af2ecbc7ac6e1ce29df3cad07530`.
- Final independent receipt: 2026-11-18 08:01 UTC, Node `v24.22.1`.
- Worktree: `session-evidence/quietvote-w15`.
- Scope: the W15 web build/preload change and its narrow localization-extractor adaptation. Review performed without source edits, remote changes, or a full duplicate test run.

## Findings and reasoning

### Failed preloads do not reach the lazy imports

`packages/web/src/util/pinned-preload.ts` caches one underlying check in `ready`. It rejects an absent pin set, absent or empty raw `href`, absent integrity, or unsupported modulepreload. A load error rejects the cached check; later load events do not change a settled rejection. Success waits for each cloned pin's load event. Node tooling without a document returns without creating a browser-check cache.

The chart path in `packages/web/src/ui/app.ts` awaits the gate before executing the direct import inside an async IIFE. If the gate rejects, execution leaves that IIFE before reaching import, and the existing outer catch supplies the table fallback. The locale path in `packages/web/src/i18n/runtime.ts` invokes its loader only through the gate's fulfillment callback. A rejected gate or rejected loader yields an empty table. Neither path catches a preload error and then retries the import without integrity.

The HTML Standard says modulepreload stores a module for later evaluation, and its root load event does not wait for dependencies. It also specifies removal of failed module-fetch entries. Therefore waiting for every pin, and refusing an unpinned import after failure, are material to this design. Source: [modulepreload processing](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload) and [single-module fetch processing](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script), checked 2026-11-18. The source review does not substitute for testing implementation behavior in the required browser.

### Dependencies are pinned before their importers

`packages/web/src/build/site.ts` traverses static import edges in dependency-first order for the entry and each allowed lazy root. It rejects missing emitted lazy roots and cyclic emitted dependency graphs. The emitted preload list contains static dependencies, then additional allowed lazy roots and their dependencies, then the app entry. Shared assets are deduplicated. Each emitted pin uses the actual asset SHA-384.

The default allowed lazy root is the results chart. Catalog roots are selected from the same review-record predicate used by the runtime loader. The build tests inspect emitted JavaScript imports, require every static dependency to be pinned before its importer, and compare pin digests with emitted file bytes. A synthetic reviewed-Arabic build exercises the otherwise dormant reviewed-catalog branch.

### Existing locale and stale-result gates remain in place

Current locale metadata contains no native review records for draft translations. The change does not add review records, change the source hashes, or change `gate()`/`offeredLocales()`. An empty table after an integrity failure cannot pass the existing translated-locale gate; English remains available through the existing source-locale rule.

The results path retains its route epoch, results-view epoch, and verification-generation check immediately after the combined preload/import await. It also retains the record-count snapshot comparison and re-verification path. Delayed completion cannot use this path to paint counts into a newer route, view, or run. This is a guard on stale rendering, not a claim that a successful import can be cancelled after navigation.

The browser live-append test now waits for the gate's additional preload links before delivering the append. The original eager head preload request alone would no longer prove that verification had reached the chart wait; the revised milestone addresses that test-race ambiguity.

### The extractor change is limited to a transparent namespace wrapper

`packages/web/src/i18n/extract.ts` retains constant receiver binding, scanned module resolution, scanned concrete callee implementation, local-only receiving-parameter use, and clean-typecheck requirements. Its added namespace form is a zero-argument async arrow with exactly two statements: an awaited expression followed by a return of a direct import, with or without a redundant await on that return. The async function adopts the returned import promise. The change does not treat arbitrary promise callbacks or arbitrary returned objects as scanned namespaces.

The new fixture accepts both intended return forms and rejects arbitrary `.then` chains, missing or unawaited gates, arguments, early returns, alternative branches, an impostor namespace, an impostor promise, and a shadowed `undefined` catch fallback. The fixture program helper requires these cases to typecheck before testing extraction, so rejected evidence is not merely a side effect of malformed TypeScript.

### Scope and existing checks are preserved

The reviewed production changes are confined to the web build, preload utility, locale loading, chart-import wrapper, and extractor. Cryptographic proof code, protocol validation, verifier algorithms, schemas, dependencies, and workflows have no changes from the stated base in this W15 diff. The standalone verifier implementation and its build function are unchanged.

The strict aggregate JavaScript test remains `< 200 * 1024` bytes gzip; the entry test remains `< 110 * 1024`; the offline verifier limit remains `< 400 * 1024` bytes. No assertion was removed to fit the feature. The browser suite retains static tamper, proof-gated results, author-key invalidation, stale navigation, blocked-storage fallback, file-size bounds, cancellation, and stale-read checks. Added cases include chart success, served-byte lazy tampering with a nonexecution sentinel and table fallback, and unsupported-preload fallback.

## Original implementation receipt

Independently executed on the prior implementation commit `6b25d6df61820e43735ce8afeae08e8435133957`:

| Check | Result |
| --- | --- |
| Nine preload-helper tests | 9 passed |
| Localization namespace fixture, covering two accepted and nine rejected forms | Passed |
| Chart wiring and retained lazy/table/CSS assertions | Passed |
| Total focused Node test cases | **11 passed, 0 failed, 0 skipped** |
| `git diff --check BASE HEAD` | Passed |
| Protected crypto, protocol, verifier, vector, workflow, and root dependency paths compared with base | No changes |
| Worktree before and after focused execution | Clean |

Command:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  --test-name-pattern='W15:|wiring:' \
  packages/web/test/pinned-preload.test.ts \
  packages/web/test/i18n-lint.test.ts \
  packages/web/test/charts.test.ts
```

Evidence: `session-evidence/analysis/crypto_review/w15-focused-final.log` and `w15-receipt.json`. Log SHA-256: `bb986b9b98fdf979c2c879bdb3ebea04976f31ef40f6f94d384b282cc294263f`.

The implementation agent separately reports the full serial web suite at 338/338 passed, plus i18n, typecheck, and production build success. Its reported final build ID is `4164a79a6f7b`, aggregate JavaScript gzip size is 204,798 bytes against the unchanged strict 204,800-byte ceiling, and entry gzip size is 98,887 bytes. This reviewer did not duplicate that full suite or build.

No browser assertion was executed by this reviewer. The implementation agent reports Chromium failing at process startup with `socket() EPERM`; that is an environment blocker, not a passing tamper test. Required browser evidence must be attached to the final candidate before calling W15 qualified.

## Final UTF-8 follow-up and receipt

The follow-up at `df064156727a0bb79400c0c636ddcc1801188f4a` changes exactly two files relative to the prior reviewed implementation: `packages/web/src/build/site.ts` and `packages/web/test/lazy.test.ts`. The production change adds `charset: 'utf8'` only to the app module-graph build. It does not change common options, the worker build, the standalone verifier build, CSP, integrity generation, dependencies, proof code, or the previously reviewed preload/locale/chart/extractor control flow. Those unchanged paths were compared directly.

The HTML already declares UTF-8, and module fetching uses UTF-8 decoding. The selected esbuild option emits original characters rather than ASCII escape spelling; it does not select a new message catalog or alter the source strings. Sources: [esbuild charset documentation](https://esbuild.github.io/api/#charset) and the HTML module-fetch processing cited above. The corresponding regression now compares parsed JavaScript literal values instead of searching for one escaped spelling. It checks Spanish text, an additional accented Spanish value, and Arabic text in their lazy catalog chunks and outside the entry. Existing pin, digest, static-dependency-order and size assertions remain.

This reviewer independently executed the final two focused files:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/web/test/pinned-preload.test.ts packages/web/test/lazy.test.ts
```

Result on the exact final commit: **16 passed, 0 failed, 0 skipped**, including the unchanged aggregate size gate, decoded-string checks, reviewed-catalog build branch, complete pin/digest/order checks, and failed-preload behavior. `git diff --check` passed and the worktree remained clean. Evidence: `session-evidence/analysis/crypto_review/w15-utf8-focused-final.log` and `w15-utf8-receipt.json`; log SHA-256 `477f9cb1109621a2e3dedd05d400c7066a5a20c3f7ffb2ff02b094ccb4e8a692`.

The implementation agent's final full-suite log, inspected separately, records **338/338 passed** at `session-evidence/analysis/recovery_review/w15-utf8-node24-web-serial.log`. Its build receipt records aggregate JavaScript gzip **200,263 bytes** and build `32fdc00ba3c1`; worker and standalone-verifier hashes are unchanged by this encoding-only follow-up. These full-suite/build measurements are attributed to that execution, not a duplicate full-suite run by this reviewer.

Combination evidence is also separate from the W15-only source review. The earlier combination with nonce candidate `fd23cb3` exceeded the strict limit at 204,817 bytes. With both W15 commits, the isolated combined head is `bdd4fdaef052aecf5e881f1806840fe5fb8bd149`, tree `76afd6a75484d460ee2d123632f591fd71ff2b66`. The implementation agent's `w15-nonce-utf8-combined.json` records **200,281 bytes**, **7/7 lazy tests passing**, and equality of 10,897 decoded string literals after excluding hashed import specifiers, with worker/standalone bytes unchanged by the encoding adjustment. This reviewer checked that exact combined head/tree identity and inspected the receipt; the combined result still does not supply required approvals or browser qualification.

## Limits and disposition

The integrity root remains the trusted build HTML. Replacement of both HTML and hashes is outside this protection. The seal worker remains an explicit separate integrity gap. The proposal accepts eager fetches of allowed lazy modules; it preserves deferred module evaluation. No real translated locale is approved by the synthetic catalog test. This review is scoped to the changed code and targeted regressions and is not a new end-to-end security certification of QuietVote.

**Disposition:** no source-repair request from this independent review of the committed candidate. Retain the required CI and actual browser qualification gates. Required human review approvals remain independent of this receipt.

## Publication note

Session-evidence paths and bare execution-log names identify intermediate evidence outside this repository. This report preserves their exact source, commands, results and available hashes; they are not repository download links. New candidate PRs and current hosted-CI status are recorded in the [current reconciliation](consolidation-current-recheck-20261117.md). Original canonical statuses remain bound to their stated SHA.
