# QuietVote next-phase implementation checkpoint — 2026-11-09

The selected A/B/C/E/F implementation work is integrated for review. **Protocol-qualified milestone: BLOCKED.**
Exact frozen-candidate qualification and publication SHA/tree are recorded in the latest
[PR #30 receipt](https://github.com/djshellshoxxx/quietvote/pull/30), not inferred from the earlier checkpoint.
The technical checkpoint requires those candidate tests and final independent integration reviews; a source commit alone is not qualification.
QuietVote remains an unaudited prototype, not for real elections. No main merge, release or deployment is authorized by this checkpoint.

## Baseline, work plan and ownership

Live refresh found PR #30 unchanged at `35b5d4d6161c5ea0cd99ec4746cb9a4bb11a3f6e`, tree
`02d2fe5210585b0b4631f6f684985b53d14b7a56`, with main at `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
No newer PR, resolving approval, review submission or inline thread was present. Two independent analysts re-read the contradictory
approval records and confirmed the current task's holds. No historical approval is represented as revoked.

Six GPT-6 Astra agents at extra-high effort worked within seven total slots. Four authored server/offline/custody/CI slices;
two independently assessed protocol decisions and reviewed server/offline code. The integration lead authored the separate web
recovery slice and reviewed custody. Authors were then reused to review others' CI/web changes and final integration evidence.
Every author used an isolated worktree with its own lockfile-installed dependencies and workspace package links. No existing
worktree, user changes, remote branch history or source PR was discarded.

| Stream | Owned scope and acceptance | Dependencies / exclusions |
|---|---|---|
| A | Existing import worker extended to board verification; worker termination/cancellation, staged replay, final quota/identity checks and cleanup regressions | Server-only; no registration, authority or protocol acceptance choice; parsing/replay still synchronous |
| B | Shared optional cooperative verifier scheduling; report equivalence, accessible progress/cancel/retry and stale-completion rejection | Protocol scheduling plus standalone page; existing B3-26 option A; no Worker, CSP/network relaxation or D-92–D-94 changes |
| C | Failed backup rollback reports a possibly unregistered encrypted copy with safe cleanup/reopen instructions | Preserves fingerprint/CAS/identity refusals; abrupt-kill transaction journal remains outside this slice |
| D | Two independent approval reconciliations using existing packets | Evidence only; no duplicate packet, disputed protocol implementation or fabricated external approval |
| E | Signed-share upload retains partial batches, rejects overlapping sends and protects replacement input | Browser relays existing signed public records; no browser trustee secret custody or new release semantics |
| F | Transitive visual-test triggers and required browser runner that preserves every suite's failure | Same pins/dependencies/strict gates; all 20 claims findings classified, none suppressed |
| G | Independent slice/final reviews, one integrated candidate, exact local/hosted receipts and guarded publication | Main/release/deployment held; test results stay tied to their actual source |

The change exceeds the preferred PR-size guidance because the requested checkpoint spans slices separately reviewed by AI agents and includes
failure regressions, browser journeys, bounded measurements and provenance. The source reports below provide the review boundaries.

## Behavior and evidence

* **Server:** board verification uses the existing sequential worker entry. Dedicated decoded bytes transfer out/back; verification
  strength and log/protocol correspondence remain unchanged. Worker settlement waits for termination. Replay validates staged files
  before registry publication; one non-yielding transaction rechecks quota/identity and records publication/audit. Cleanup errors are
  explicit failed imports. See [server report](../reports/next-server-20261109.md) for negative cases, benchmarks and every remaining stage.
* **Offline:** the optional checkpoint hook supplies work counts, not evidence of passed checks. Cancellation/callback failure rejects
  without a report. The default API and cooperative path share verification logic. File/anchor/page-lifetime changes invalidate old
  results. The closed offline policy is preserved. See [offline report](../reports/next-offline-20261109.md).
* **Custody:** caught rollback refusal/failure returns `BACKUP_NOT_REMOVED`, exit 60, instead of silently discarding cleanup failure.
  The instance requires reopening; unrelated replacement files remain protected. See [custody report](../reports/next-custody-20261109.md).
* **Web:** partial acceptance or network interruption preserves the original batch for correction/retry. Complete accepted/duplicate
  batches clear normally. Revision and route guards prevent late reads/results from erasing new input. Five new unit regressions
  supplement five existing tests. The browser journey checks real signed fixtures, partial HTTP failure, duplicate retry, keyboard
  input, exact decoded selections, 375px layout, CSP and stale navigation. Already-started batches are not cancelled by navigation.
* **CI:** the pseudo-locale workflow now follows transitive package/tooling inputs, merge queue and manual runs. All five required
  browser suites execute even if an earlier suite fails, and any failure fails the job. The temporary Playwright 1.62.0/root 1.57.0
  difference remains explicit; no speculative upgrade occurred. See [CI report and individual claims dispositions](../reports/next-ci-20261109.md).

Bounded observations on the local shared host are illustrative, not hard latency guarantees:

| Workload | Before/default | After/cooperative |
|---|---|---|
| 512 valid signed board entries | ~1,451 ms main-thread activity; ~1,446 ms timer delay | ~9 ms main-thread activity; ~1 ms timer delay; worker startup increases wall time |
| 80 real signed proof envelopes | ~2,769 ms, zero timer heartbeats | ~3,132 ms, 210 heartbeats; largest observed uninterrupted interval ~85 ms; report bytes identical |

Independent offline review compared both new execution paths against separately captured **unchanged baseline reports**, not just
against one another: 66 comparisons across 33 cases were byte-equal, including hostile/malformed cases, explicit log evidence and a
larger workload. Strict TS/Python comparison retains 27 verdict agreements, three differing reports and 17 differing fields.

## Qualification and publication procedure

Do not transfer the older 873-test/26-job-pass receipt to this candidate. Source reports contain author/slice results and their limits.
The frozen candidate is checked from a clean worktree with independent workspace links, recording Node/npm/Python versions and
full commit/tree. The latest PR receipt records actual exit statuses and each hosted job disposition for:

```sh
npm ci --ignore-scripts --no-fund
npm run typecheck
npm test --workspaces --if-present
node --test .github/scripts/*.test.mjs
node .github/scripts/check-action-pins.mjs
(cd verifier-py && python3 -I -m unittest)
npm run vectors:check
python3 -I verifier-py/qv_verifier vectors test-vectors/v1
npm run build -w @quietvote/web
npm run i18n:check -w @quietvote/web
node scripts/compare-verifiers.ts --json
npm run lockfile:lint
npm audit --audit-level=high
node scripts/licence-snapshot.mjs --stdout
node scripts/lint-claims.mjs
bash .github/scripts/run-browser-journeys.sh
git diff --check
```

Independent checks continue after expected strict-comparison/claims failures. The browser runner forces `QV_REQUIRE_BROWSER=1`.
Local required Chromium was attempted by authors and reviewers and failed at process-singleton `socket() EPERM` before assertions;
deterministic DOM tests are not browser acceptance. The PR's `ci:full-matrix` label requests Linux/macOS/Windows × Node 22/24.
Unsupported Python/vector capabilities remain explicit exclusions. Existing Windows POSIX-mode skips and conditional OpenSSL TLS
fixture skips must be reported from actual logs; green jobs do not imply every platform-specific assertion executed.

Native Git push lacked authentication; the connected GitHub API may publish an equivalent tree with linked-account author/DCO.
Local author SHAs are provenance, not a claim that those commit identities were pushed. Publication verifies the exact tree,
uses an expected-head guard, reads back the ref and leaves prior source refs untouched. The final PR receipt records the map.

## Ancestry and retained gates

All 33 observed source refs were checked against the baseline. The prior cumulative #22 → #25 → #26 → #27 → #28 chain and #29 audit
are already in #30. The three non-ancestor tips remain deliberately excluded: unsigned #23 is tree-equivalent to signed #24;
`claude/docs-screenshots` and `docs/readme-and-wiki` contain obsolete documentation already selectively reconciled.
See [prior branch disposition](../reports/branch-disposition-20261109.md). No additional source merge is presumed, and no source
PR was closed or reopened. The source changes in this continuation are recorded in [review provenance](../reports/next-integration-review-20261109.md).

**Highest-value next owner action:** reconcile the applicable approval record for B3-01 and D-92–D-94 in one explicit decision,
using the existing [registration packet](../reports/registration-decision-20261109.md) and
[verifier packet](../reports/verifier-milestone-20261109.md). For registration, specify exact wire/signature/storage bytes, label/election
scope and existing-invite migration; “hashed invites” alone does not resolve the accepted-bearer-at-rest problem. For the verifier,
confirm or replace the ADR-027 defaults governing signature-failure continuation, rule prerequisites and failed-report result fields.
Required protocol/security reviews remain separate. Until reconciled, preserve the regression and strict failing comparator.

Remaining technical/external work includes synchronous parse/replay/tally stages, crash-journal custody recovery, Windows ACL
qualification, complete key backup/restore browser coverage, authority/replay/high-water decisions, external cryptographic review,
native translation review, assistive-technology qualification and release governance. No completion percentage or production readiness
is inferred from this checkpoint.
