# Independent live-enrollment transition follow-up

Date: 2026-11-19. This is a focused engineering review by a separate agent that did not implement the production repair. It is an additive receipt, not a human approval, external audit or release authorization.

## Exact source and scope

The exact source for this independent engineering review and test execution is **`d5435026d6b8c68ff8bf5d4edd76e645ef919724`**, tree **`44982f388a0d101ae5c5b2acc44ecfff8f680672`**. It includes the initial live repair, both corrections below and their durable regressions. Author report-only commits in its ancestry do not change these source boundaries. Later source or native-code integration is outside this exact-source receipt.

The reviewer preserved `worker/quietvote-independent-session-build` at its earlier signed report and created `worker/quietvote-independent-live-transition` at `4929153190c9dce4f9d7d51a0d27d63797316c06` (tree `5d153e6cf2c7e0c4ad82b32cbfa3fed93af4de23`) using the same clean isolated checkout and existing pinned dependencies. The review compares `94efba2b43991e27bbf9191621c646c1d01859de` with the hosted-fixture correction `4ba6207`, live enrollment repair `4929153`, and the two narrowly authorized refusal/concurrency follow-ups below. It does not reopen the earlier broad audit or qualify the separate native private-file branch.

## Source review

The author-pin DOM fixture now supplies a URL object with a valid origin. The pseudo-locale visual fixture uses HTTPS, which satisfies the existing deployment-origin validator; its new startup error check still rethrows failure. Production origin validation, layout assertions, timeouts and skips were not relaxed.

The live repair stores the original server summary’s log key and origin, and reuses the existing `bindServerLog` check when a context first derives from signed records. Only successful binding installs the manifest’s receipt key/origin and removes the context error. Mismatched metadata removes the usable context and preserves a refusal. This closes the enrollment path that formerly acquired a context through live updates without initializing its trusted receipt metadata.

A cached snapshot without a verified context now retires its old live connection and rereads metadata and records on route navigation. Valid bound snapshots retain the existing cache path. The mandatory split-origin browser journey continues to remove only the invitation fragment in the same document, and now explicitly requires `page.goto` to return `null`; it adds no forced reload, timeout extension or skip.

The four new application controls cover delayed live hints, actual unlock/seal/CAST and returned-receipt verification after live completion, and refusal of both a changed log key and a changed log origin. The author’s earlier distinguishing run had six existing passes and three new failures; the fourth origin-negative case was added later. That before-case is author evidence, not a run performed by this reviewer.

## Independent finding: stale draft completion could orphan a stream

Source review identified an out-of-order completion at the newly reachable cached-draft refresh path. Two same-context navigations can start loads while the cached context is unbound. The newer response may install a ready context and start its live stream, then an older empty-draft response can overwrite the map even though its own route is stale. Cleanup visits map members, so the newer stream can become unreachable to normal cleanup.

After the parent explicitly expanded the scope for one bounded regression, the reviewer reproduced this on exact `4929153`. The actual-app case captures an empty draft response and a later ready response, releases them in reverse order, re-enters the same context, then navigates Home. It uses the actual `LiveElection.start` path and the harness fetch streams’ real `AbortSignal`s; cleanup of any remaining streams occurs only after the observed assertion.

The distinguishing result was **one expected assertion failure**, no skips or cancellations, in **1.941 seconds**. Expected values were zero extra metadata reads, two total streams and zero unclosed streams. Observed values were **one extra metadata read, three streams and one still-unclosed stream after leaving the election**. Initial enrollment, retirement of the draft stream, and activation of the newer ready stream passed their controls. The underlying concurrent-initial-load possibility predates this delta; the new draft-refresh path makes the same stale cache write reachable with an already cached draft.

The author corrected the cache-write boundary in `826a08d8`: `electionView` passes its existing route epoch to `load`, and `load` writes its snapshot into the cache only while that route remains current. The storage-generation refusal stays in place, and the existing post-await route guard prevents a stale result from starting a live connection. The correction adds no pending-request map and leaves normal bound-cache reuse intact.

The reviewer reran the **unchanged** standalone regression on this source: **1/1 passed**, no skips or cancellations, in **1.833 seconds**. The full probe matched the preserved red-run source byte-for-byte. The normal repository test `packages/web/test/live-draft-refresh-ui.test.ts` preserves the exact distinguishing body and assertions (SHA-256 `f0c48fa69d61fccad84d8b255074817193b29caa58dad8266b37fd41a8d2d012`); only an unused helper outside that body was removed for strict TypeScript checking. No production file was edited by this reviewer.

## Independent finding: missing summary key could escape refusal

A final refusal-path read found that an omitted `log_pk` reaches `b64uDecode` as `undefined`. Its length check is outside the decoder’s catch. `LiveElection` had already assigned the newly derived context and then swallowed the binding callback’s exception, so the tentative context remained available while its receipt metadata was uninitialized. The immediate-ready load path instead propagates the exception to the route’s refusal.

The parent authorized exactly one additional actual-app case with the existing mismatched-summary harness. On `826a08d8`, the reviewer omitted only `log_pk`, completed the live refresh, and removed the invitation in the same document. The app still offered **Unlock key** (one button; expected zero), producing **one expected assertion failure**, no skips or cancellations, in **1.765 seconds**. This probe establishes the refusal failure; it does not claim a forged receipt was accepted or execute a broader malformed-input matrix.

The author corrected both boundaries in `d5435026`: `bindContext` deletes the tentative context before attempting binding, and `bindServerLog` treats the server key as untrusted (`unknown`) and returns the existing mismatch refusal for a non-string value before decoding. The existing byte-length, key-equality and origin checks remain. The earlier route-epoch/cache guard is unchanged.

The reviewer reran the **unchanged** standalone case on this source: **1/1 passed**, exit 0, no skips or cancellations, in **2.147 seconds**. Its full source matched the preserved red probe byte-for-byte (SHA-256 `4c7bf44b992c42d5a59efea8f7e9240e04c5d32b0527a6441a73bfb2e776cc47`). The author appended the same test body and assertions to `packages/web/test/split-origin-ui.test.ts` (body SHA-256 `f2dfee470fd2d4e9db161fa885d0d6cc107cede40a96aa74521bd68d9a03e7d1`). The temporary duplicate probe was removed after verification; the durable regression remains in the final affected batch.

## Independent execution and limits

On exact `d5435026`, the independent final affected batch passed **27/27**, exit 0, in **20.049 seconds**, with zero failures, skips or cancellations. It ran these existing files sequentially with `node --max-old-space-size=384 --test --test-concurrency=1 --test-reporter=spec`:

- `packages/web/test/split-origin-ui.test.ts`
- `packages/web/test/author-pins-ui-fresh-review.test.ts`
- `packages/web/test/live.test.ts`
- `packages/web/test/live-lifecycle.test.ts`
- `packages/web/test/live-status.test.ts`
- `packages/web/test/live-draft-refresh-ui.test.ts`

This batch retains actual application unlock/seal/CAST/receipt binding, board/read-key separation, valid and mismatched summary controls, live cleanup/recovery, author-pin invalidation, and both independent regressions. The existing `WV-4:` manifest-to-server log-binding case in `packages/web/test/security.test.ts`, selected with `--test-name-pattern='^WV-4:'`, also passed **1/1**, exit 0, in **0.876 seconds**, with zero skips or cancellations. That case contains the author's added `undefined`/`null` assertions; the remainder of that file was not run. `git diff --check 94efba2b43991e27bbf9191621c646c1d01859de HEAD` passed. The checkout was clean after removing the temporary probe and before adding this report.

Both independently confirmed defects are resolved by these source-bound checks. No unresolved defect was established within this focused review; this is not a finding about unreviewed paths.

The earlier five-file run on `4929153` passed **25/25** in **19.704 seconds**. The six-file run on `826a08d8` passed **26/26** in **20.912 seconds**. Both had no skips or cancellations; each preceded its subsequent independently reproduced edge and is retained with its own source boundary, not reassigned to the final correction.

No Chromium retry, native browser assertion, full-repository audit or test run, or repeated production-build comparison was performed in this follow-up. Real-browser same-document navigation, CORS, IndexedDB, visual rendering and worker/CSP behavior still require the hosted jobs on the published source. The earlier session/build receipt remains tied to its named source; its build sizes and digests are not reassigned to this later runtime source. Author typechecks/build checks are recorded in the separate author report and are not represented as this reviewer’s executions.

Evidence in the sibling `quietvote-evidence` directory is tied to the following executions:

| Evidence | Source and result |
| --- | --- |
| `live-transition-independent-4929153.log` | Initial five-file check: 25/25 on `4929153` |
| `independent-live-draft-refresh-probe.source.txt`, `live-draft-refresh-independent-before.log` | Preserved race probe and expected failure on `4929153` |
| `live-draft-refresh-independent-after.log`, `live-transition-independent-826a08d.log` | Unchanged race probe 1/1 and affected batch 26/26 on `826a08d8` |
| `independent-live-missing-log-key-probe.source.txt`, `live-missing-log-key-independent-before.log` | Preserved missing-key probe and expected failure on `826a08d8` |
| `live-missing-log-key-independent-after.log` | Unchanged missing-key probe 1/1 on `d5435026` |
| `live-transition-independent-d543502.log`, `live-log-binding-independent-d543502.log` | Final affected batch 27/27 and direct binding case 1/1 on `d5435026` |

Both regressions are preserved in the repository by the author; this review lane changes only this additive report. It carries the project's DCO sign-off and makes no GitHub/CODEOWNER approval claim.
