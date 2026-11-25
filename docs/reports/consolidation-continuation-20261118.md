# QuietVote consolidation continuation — 2026-11-18

## Scope and status

This continuation prepares one qualification candidate from the canonical integration, preserves the separate cryptographic/protocol review queue, and repairs observed portability problems. It does not establish production or election qualification. Existing historical reports remain unchanged.

This snapshot records the composed candidate and source-specific local evidence before hosted qualification. The associated consolidation PR records the published commit/tree and hosted results. Results recorded for an earlier source are not results for the final candidate.

| Item | Recorded source/status |
|---|---|
| Initial remote inventory | 70 branches; 14 open PRs: #27, #43, #57–#68 |
| Initial `main` | `019f4e789be2ff38a5fb2d348c3b225cc87cf296` |
| Initial canonical `integration/quietvote-completion` | `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54` |
| Initial web-test branch, #66 | `ae17bd0c2a33427a77b2d71673ed55787c463c6c` |
| Composed runtime source before this report | Local `63cd7cb77fa409c52c9a8511ef649748108a255c`, tree `5bb8f9f864a6096595b732d8780cd6ae04ab98a3` |
| Final candidate PR / hosted CI | Pending publication; no passing final Windows result is recorded here |

The inventory is the initial read on November 18, not a claim that the repository has stopped changing. The prior [remote snapshot](https://github.com/djshellshoxxx/quietvote/blob/7824e6178572c61dea133ba7e81d5e1b6a1b3234/docs/reports/consolidation-remote-snapshot-20261117.md) covered 68 branches and 12 open PRs. The new documentation branches account for the two additional branches and PRs. After #68 was closed, that original open set has 13 members; a new qualification PR would change the live count again.

## Consolidation disposition

| PR | Disposition in this continuation |
|---|---|
| [#43](https://github.com/djshellshoxxx/quietvote/pull/43) | Canonical cumulative prototype PR to `main`; formal review and qualification gates remain. |
| [#59](https://github.com/djshellshoxxx/quietvote/pull/59) | Include the existing current-finding/branch reconciliation, preserving its historical source and test limits. |
| [#60](https://github.com/djshellshoxxx/quietvote/pull/60) | Include integrity-gated lazy modules and the production app UTF-8 build. |
| [#62](https://github.com/djshellshoxxx/quietvote/pull/62) | Include externally trusted standalone-board witness-policy requirements. |
| [#65](https://github.com/djshellshoxxx/quietvote/pull/65) | Include revote copy conditional on election rules, together with its #60 dependency. |
| [#66](https://github.com/djshellshoxxx/quietvote/pull/66) | Include native file-URL fixtures and the independent build test matching production app encoding. |
| [#57](https://github.com/djshellshoxxx/quietvote/pull/57) | Keep nonce/protocol changes separate for required formal security review. Recover only its independently separable, test-only fresh-connection commit. |
| [#61](https://github.com/djshellshoxxx/quietvote/pull/61), [#63](https://github.com/djshellshoxxx/quietvote/pull/63), [#64](https://github.com/djshellshoxxx/quietvote/pull/64) | Keep verifier/protocol acceptance changes separate; their earlier evidence is not relabeled as candidate integration or formal approval. |
| [#58](https://github.com/djshellshoxxx/quietvote/pull/58) | Preserve historical audit evidence and the unresolved original-author DCO gap. |
| [#27](https://github.com/djshellshoxxx/quietvote/pull/27) | Preserve selective-recovery source; remaining rollback, export, control and migration work does not justify a wholesale merge. |
| [#67](https://github.com/djshellshoxxx/quietvote/pull/67) | Retain for selective recovery of optional ideas; do not merge its stale core-specification rewrites. |
| [#68](https://github.com/djshellshoxxx/quietvote/pull/68) | Closed as superseded at `2026-11-18T11:14:30Z`; source branch/commit retained, not merged. |

### New documentation PRs

#67 at `3350a1a4566eda73d6cfb331956bc05c9841518c` changes 20 documents by +3,616/-494 lines. A three-way comparison with canonical `72bccc6` produces **17 conflicted files**. Its reused core requirement IDs have different meanings: for example, `QV-04-REQ-001` means local CSPRNG key generation in canonical, but a rules-view UI gate in #67. Its optional QV-17/18/19 expansions introduce 30 additional IDs that collide with active trustee, board and supply-chain requirements.

The [canonical specification index](https://github.com/djshellshoxxx/quietvote/blob/72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54/docs/SPEC-INDEX.md) explicitly marks those pre-renumbering drafts non-authoritative. Useful optional clauses require new identifiers and reconciliation with current specifications/ADRs. All eight #67 commits lack `Signed-off-by:` trailers. Retaining their source does not supply the missing attestations.

#68 at `c2196a9c3ce48314a079c8ba8c1636ca2b142189` removes obsolete CONTRIBUTING-link wording already corrected in canonical and changes statuses under the obsolete QV-16/18 mapping. Both changed files conflict with canonical; no unique applicable improvement remains. Its unsigned original commit was preserved without retroactive attestation. Both documentation heads had zero GitHub check runs at review time; technical mergeability into old `main` did not establish canonical compatibility.

## Portability repairs and their evidence

### Fresh HTTP connections for the blocking verifier fixture

Source commit [`fd23cb3a481328a2b6315ae34cc2ee589b31aead`](https://github.com/djshellshoxxx/quietvote/commit/fd23cb3a481328a2b6315ae34cc2ee589b31aead) is independently separable from the nonce changes earlier in #57. It changes only `packages/server/test/e2e.test.ts`, `test/helpers/world.ts` and server notes. The candidate cherry-pick is `e6c4e1e06f18d2adccc98ffe99bac0235c32a9df`, preserving source authorship and its matching DCO.

The fixture opts into fresh connections around synchronous verification work, retaining assertions and timeouts. This exact export request also failed with `ECONNRESET` in the Node 22 Linux jobs for [#63](https://github.com/djshellshoxxx/quietvote/actions/runs/44265671528) and [#64](https://github.com/djshellshoxxx/quietvote/actions/runs/44267702258); both runs passed their other ten jobs. A current candidate run must determine whether this resolves the observed error; the connection-lifetime explanation alone is not a native Windows reproduction.

### Canonical root spelling for stored-election recovery

Repair source `2ca45b3200c93e1a3150c56ffc10f6a9282fbfcc` changes `lockDataDirectory` to use `realpathSync.native` and adds `data-lock-canonical-path.test.ts`. The root previously used the JavaScript resolver while `ElectionPool.stored` and `WebhookService.recoverStored` require exact native-resolved file paths. Node documents that its [JavaScript resolver preserves case on case-insensitive filesystems](https://nodejs.org/api/fs.html#fsrealpathpath-options-callback).

The change aligns root canonicalization with those consumers. Regular-file checks, exact per-file path equality, registry and database identity checks, lock exclusivity, and replacement-lock refusal remain intact. The new tests cover nested storage paths, directory symlink/junction aliases, ownership, release/reacquisition, and Windows case aliases. The Windows test records both resolver outputs using synthetic fixture paths.

Linux Node 24.22.1 ran the new test plus `data-lock`, `idempotency-recovery`, `operation-response-recovery`, `operation-floor-review`, `supplemental-event-recovery` and `webhook-bridge-recovery`: **36 passed, zero failed, one Windows-only test skipped; 37 total**. Root-wide TypeScript checking passed with a 512 MiB heap. These checks preserve missing-file/symlink/identity-damage refusal and exactly-once recovery behavior. They do not prove that the historical twelve Windows recovery failures have been resolved.

### Portable graceful shutdown

Repair source `dc54106f4ac8e31356ceb066bcd3855d19f1a09f` updates the real launcher and process fixtures. The observed Windows tests used `child.kill('SIGTERM')` but expected JavaScript cleanup and a zero exit. Node documents abrupt [Windows child-process termination](https://nodejs.org/api/child_process.html#subprocesskillsignal) for this operation.

The launcher accepts only the exact `qv-server:shutdown` string over an explicitly created parent IPC channel. It waits for startup, uses the existing idempotent stop path, releases ownership and disconnects IPC even when startup or stopping fails. Unrecognized messages are ignored. POSIX SIGTERM remains separately exercised. The real executable journey uses the portable contract and still requires clean exit and absence of the data lock; no assertion or deadline was relaxed.

The added IPC test first failed at the unchanged 20-second deadline without the handler. After the repair, the final launcher/data-lock run passed **13/13**, including IPC startup-listen failure; an earlier HTTP/process run passed **14/14**, including the full 22-voter HTTP flow. Root-wide typechecking passed. The integrating agent and a separate source reviewer found no blocking defect. These are local implementation/review receipts; the final combined native-platform matrix remains necessary.

## Source-bound local qualification

The following web results apply to local commit **`6e98ea42cee2e15591eb64e40c3c80c6f7c2cfcc`**, tree **`b301d8cc0f6709c60aa06652d68f63129a65085f`**, comprising the #60/#65/#66 web stack. Later CLI, documentation, server and shutdown additions require their own qualification.

| Check | Result and limitation |
|---|---|
| `npm test -w @quietvote/web` | **338/338 passed** at the recorded web source. |
| Initial unbounded root typecheck | Killed with exit **137**; retain as a failed environmental attempt. |
| `NODE_OPTIONS=--max-old-space-size=512 npm run typecheck` | Passed with unchanged compiler configuration; the bounded retry does not erase the failed attempt. |
| `npm run build -w @quietvote/web` | Aggregate JavaScript gzip **200,274 bytes**, below unchanged strict **204,800-byte** cap. |
| Independent focused web execution | **50/50 passed, zero skipped** across `pinned-preload.test.ts`, `lazy.test.ts`, `charts.test.ts` and `i18n-lint.test.ts`, at the same commit/tree. |
| `QV_REQUIRE_BROWSER=1 node packages/web/e2e/verifier.ts` | Browser launch failed before tests: process-singleton socket **EPERM**, followed by **SIGABRT**. No local browser/CSP/accessibility pass is claimed. |

The separate native-root patch qualification above ran at its own source with unchanged test expectations. Successful source review by independent agents is engineering evidence, not a human/CODEOWNER/security-group approval.

The combined candidate also passed **12/12** focused CLI tests (`board-policy-regressions.test.ts` and `audit.test.ts`). Independent source review of #62 found that missing anchors only downgrade an otherwise VERIFIED result; actual failures, missing-author evidence and signed election-bundle policy retain their existing classifications. The full server suite is run against the composed runtime source identified above; its result will be recorded with hosted qualification rather than predicted here.

## Hosted qualification and merge gates

The existing [full #60 run 44263515558](https://github.com/djshellshoxxx/quietvote/actions/runs/44263515558) and [#66 run 44271792772](https://github.com/djshellshoxxx/quietvote/actions/runs/44271792772) contain Windows failures. Fresh #66 Windows Node 22/24 review still found the recovery failures, two signal-contract failures and the HTTP reset. The earlier [Windows triage](https://github.com/djshellshoxxx/quietvote/blob/7824e6178572c61dea133ba7e81d5e1b6a1b3234/docs/reports/consolidation-windows-ci-triage-20261117.md) preserves failure details and distinguishes observation from the native-path hypothesis.

The final candidate must run its hosted matrix, required production browser checks, visual checks and other applicable gates on the published source. Queued or running jobs are not passes. An earlier green canonical or constituent PR run does not qualify the new composition.

[QV-30 §10 and REQ-018](https://github.com/djshellshoxxx/quietvote/blob/72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54/docs/30-engineering-standards.md) require two formal approvals, including a designated security reviewer, for crypto/protocol/vector and other sensitive changes. #43 already includes those paths; keeping #57 separate does not remove #43's gate. Owner authorization to continue implementation, agent review, and GitHub technical mergeability do not supply those formal approvals. [CONTRIBUTING](https://github.com/djshellshoxxx/quietvote/blob/72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54/CONTRIBUTING.md) also retains original-author DCO requirements.

This continuation does not deploy, publish a release, delete source branches, rewrite remote history, waive review rules, or resolve the remaining membership/governance/rollback/export implementation contracts. The candidate publication receipt must state exactly what advanced and what remains outstanding.
