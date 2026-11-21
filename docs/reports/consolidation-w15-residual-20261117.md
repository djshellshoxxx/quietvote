# W15 residual: prepared source port, excluded from consolidation

## Disposition

Keep this port out of the integration candidate. It fails the existing strict JavaScript size gate and has not completed actual browser qualification. Neither gate was weakened. The useful source and regression work is preserved for a focused follow-up.

- Historical source: PR27 commit `b2f043e0b9e648d3c85503ee40ccf4b6f0278c83`.
- Port base: `25d26aa3dc35127015100ace20419c57509ed338`.
- Signed-off local port commit: `e4212219635291a002b68d6b27a9714df23d7df2`.
- Original local branch: `codex/quietvote-lazy-integrity-20261117`.
- Preserved Git bundle: [quietvote-w15-residual-20261117.bundle](../provenance/quietvote-w15-residual-20261117.bundle), requiring the recorded base history from the main consolidation bundle.
- [Recovery instructions](../provenance/README.md). The source is archived for follow-up and is not merged into active application files.

## Proposed behavior

The build emits SHA384 integrity pins for the chart and every reviewed locale catalog, including their static dependency graphs. Dependencies precede their importers in HTML; the app entry preload comes last. Unreviewed catalogs remain excluded from eager downloads. Missing outputs and cyclic emitted dependency graphs fail the build.

Each browser realm checks the immutable trusted build's modulepreload links once. The helper clones those original pins, refuses absent/empty href, absent integrity and unsupported `modulepreload`, then waits for every load event. An error permanently rejects that realm's cached check. Dynamic chart/catalog imports are reached only after success. The chart keeps its existing table fallback; an unsupported or failed locale load leaves that locale unavailable.

This uses trusted build HTML as the integrity root, not metadata fetched from an untrusted server. It does not protect against replacement of that root HTML. The seal worker remains the already documented separate integrity gap. W15 option A explicitly accepts eager downloading of the allowed lazy modules; module evaluation remains behind the imports.

The newer author-pin input generation checks, route handling and result snapshot checks remain in place. The only production app change is the awaited preload gate immediately before its existing chart import. The runtime locale loader adds the same gate before its existing selected loader.

## Issues found and corrected during preparation

1. **Unsupported preload can hang older supported browsers.** A browser that ignores `rel=modulepreload` may emit neither load nor error. The proposed helper now rejects when `relList.supports(link.rel)` is false. This allows table/English fallback instead of leaving results or locale startup pending.
2. **Resolved `link.href` cannot detect an empty raw href.** An empty present attribute can resolve to the document URL while the preload algorithm does not fetch it. The proposed helper uses `getAttribute('href')`, and the fake DOM regression deliberately models the resolved URL so it cannot hide this bug.
3. **A head preload request no longer proves a results verification run has reached its chart import.** The existing live-append browser race now waits for the helper's duplicate pin before appending a log entry. This ties the test to a pending verified results run.
4. **Preload ordering must protect static dependencies as well as the lazy root.** Emission now follows dependency-first traversal, with a cycle guard; a build test parses emitted imports and requires each dependency pin before its importer.

An independent source reviewer reproduced the first two hangs in the earlier draft and confirmed both refuse promptly after these corrections. Single-realm promise caching was also reviewed against full navigation and back-forward cache behavior.

## Validation evidence

| Check | Observed result |
| --- | --- |
| `npm run typecheck` | Pass |
| `git diff --check` | Pass |
| Focused lazy/preload tests | 14 pass, 1 fail; the only failure is the unchanged aggregate JS size limit |
| Default and reviewed-catalog build pin tests | Pass; all static dependencies precede importers, hashes match bytes, unreviewed catalogs absent |
| Missing/empty href, missing integrity, empty pin set, unsupported preload | All refuse promptly with no appended link |
| All-load gating, failed-load refusal, success/rejection caching | Pass |
| Production build | Emitted build ID `166e0896dae8`; CLI warns about the size overage |
| Entry gzip | 98,907 bytes, below unchanged 110 KiB entry limit |
| All JavaScript gzip | **204,814 bytes**, versus unchanged strict **`< 204,800`** test; 14 bytes over the ceiling, requiring at least 15 bytes reduction to pass |
| Actual Chromium verifier/tamper run | Blocked before any browser test: Chromium process-singleton `socket()` failed with `Operation not permitted` |

Focused command:

```sh
node --test --test-reporter=spec packages/web/test/pinned-preload.test.ts packages/web/test/lazy.test.ts
```

Attempted actual-browser command:

```sh
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts
```

The browser regression source includes a chart positive control, real served-byte lazy tampering with an execution sentinel, continued results-table availability, no uncaught page error, unsupported-preload fallback, and the corrected live-append milestone. Existing static tamper and author-pin/verification cancellation checks remain. These source changes are **not evidence that the browser scenarios have passed**. A future candidate must pass this required hosted browser command on its exact commit, after satisfying the unchanged size budget.

## Remaining recovery scope

The separate N-37c trustee-boundary test was not added to this port. The historical regex guard omits `dkgCommitFor` and is incomplete for re-exports, package subpaths and dynamic imports; carrying it unchanged would overstate its coverage. Retain this as scoped PR27 follow-up work if stronger architectural enforcement is desired. No trustee producer or protocol behavior was added by the W15 port.
