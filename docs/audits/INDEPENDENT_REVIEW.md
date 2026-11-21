# Independent consolidation engineering review

Status: **completed engineering review of the identified source, with explicit
qualification limits**. The confirmed deletion-lifecycle finding is repaired and
independently revalidated. This receipt does not grant main-promotion approval.

## Independence and source scope

This review is performed by a fresh review worker that did not implement the
candidate. The reviewer used an isolated worktree and changed no production
source. Confirmed findings were sent to the implementer, who made the fixes and
regression tests. The reviewer then reran the original reproduction independently.
This is engineering review, not a designated security-reviewer approval, an
external cryptographic audit, or authorization to release or merge main.

- Initial main: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Inherited membership baseline: `8b417c6c8b86a7a9a9454468bf16bec0baa8517b`.
- Review started at `0cb0fb8063b8b9e04901c4577d7616f5c9fdf833` and incorporated
  subsequent integration commits in the isolated worktree.
- Final source covered by this receipt:
  `bd89f60e62f42885cbb207d807ca0624006a9a7f`.
- Exact reviewed source tree: `3392fc1fce42eee58013fcfd4c93d0891d1c5c98`.
- The report-only commit itself is not included in that source-tree identifier.

The later device/rules/undervote and IndexedDB retry integration is outside this
receipt. Its final source review and targeted verification are assigned to a
separate fresh surface reviewer. Required hosted CI must qualify that delta and
the final published tree. This report must not be presented as evidence that an
unseen later commit received the same review.

The complete main-to-candidate file inventory and deletion set were examined,
followed by focused source review of the cryptographic/protocol and recovery
changes since the membership baseline. This is not a claim that every line in the
large inherited implementation, test-vector corpus, or verbatim dependency tree
received a new line-by-line audit. Existing qualification of a historical commit
does not qualify the composed candidate.

## Confirmed finding and independent revalidation

### IR-01: queued append could sign after deletion tombstoned its storage — high

**Affected source:** `packages/server/src/pool.ts`, `ElectionPool.remove`;
`packages/server/src/election.ts`, runtime signing and retirement gates. Confirmed
against `ad2e1df5d24cee8d9167b77e2df8283897c98c72`, before fix
`60c5bffa229200e24bb3254b295e921829be3847`.

The deletion policy check and tombstone were protected by the election mutex, but
the mutex was released before eviction drained already queued writers. The cached
runtime retained its signing keys and accepted a writer even after the registry
had been tombstoned. A valid manifest could therefore receive an included signed
receipt immediately before the backing log file was removed.

The independent reproduction used a new DRAFT election, held its mutex with a
promise barrier, queued removal first, queued a valid manifest append second, and
released the barrier only after both operations were queued. Before correction,
both promises fulfilled, the append returned an included receipt at sequence zero,
the independent anchor advanced to size one, and the registry and election file
were absent. No timing lottery or modified production code was involved.

The implementer now retires the cached runtime inside the deletion mutex,
refuses signing without a live registry entry, prevents cached acquisition after a
tombstone, and retires a closed handle idempotently. Retirement does not persist an
ordinary eviction as quarantine. The durable regression is
`packages/server/test/delete-runtime-lifecycle.test.ts`.

The original independent reproduction was rerun on the corrected source. Removal
fulfilled, the later append rejected with `LOG_UNAVAILABLE`, and the anchor stayed
at size zero. The related 18-test batch passed, including direct signing and
duplicate-receipt refusal, old-handle retirement, normal reopening, rollback,
deletion recovery, and archived export/deletion composition. Three focused import
cases also passed after the correction: normal keyless staging, the legacy versus
numbered-control archive boundary, and incomplete-election import. **Resolved in
the reviewed source**, subject to the remaining final-tree qualification gates.

## Source and compatibility checks

- **Source preservation:** independently parsed all 72 original tips from the
  branch inventory and checked their ancestry. Exactly 65 are contained. The
  seven non-ancestor tips match the documented retained/excluded list. No file is
  deleted relative to original main. These local checks do not recertify the
  historical remote CI results or turn retained branches into merged features.
- **Migrations:** compared version, name and literal SQL for all seven historical
  control migrations and all ten historical election migrations against the
  membership baseline. They are identical. Only control migration 8 and election
  migration 11 were appended; old-schema fixture updates do not weaken migration
  verification.
- **Nonce construction:** inspected the new hedged nonce transcripts, secret and
  statement binding, trustee-index inclusion, aggregate/spoil separation and
  constant-randomness regressions. Verification equations are unchanged. Passing
  those checks is not an independent cryptographic proof or constant-time claim.
- **Controls:** reviewed admission, authenticated replay, content and board
  verification in TypeScript and Python, CLI preparation/signing, web snapshot
  parsing, and archive import/export. Legacy unnumbered controls remain a readable
  prefix. Once numbering begins, an authenticated body must advance exactly one;
  rewrapping an old body, gaps and downgrade cannot consume or reset the sequence.
  Invalid signatures cannot reserve a counter. An authenticated archive is still
  not proof that its head is current; terminal verdict effects remain separately
  documented work.
- **Recovery:** reviewed independent identity/root floors, FULL control durability,
  committed-append exposure ordering, direct/duplicate signing gates, startup
  peer acquisition, event forwarding and restore-floor preservation. Local floors
  do not defeat rollback of every copy. Peer/witness availability and private-link
  recovery limitations are disclosed rather than represented as solved freshness.
- **Exports:** reviewed bounded immutable public snapshots, exact digest/tree
  binding, signed acknowledgment and notice, job/operation recovery, expiration,
  evidence retention and final-tree deletion checks. Downloads do not acknowledge
  retention. Acknowledgment is the caller's signed assertion, not proof of an
  independently retained backup. The combined rollback/deletion check prevents an
  old acknowledged archive from overriding a newer independent floor.
- **Vendoring:** reviewed exact archive/SRI/lock binding, every-file hash and byte
  checks, path/link refusal, installation receipts, package resolution and shadow
  dependencies, production build checks, workflow installation, and Docker/service
  setup. Upstream bytes and dependency/audit metadata remain intact. The installer
  intentionally rejects modified existing dependency bytes instead of silently
  repairing them. No container or service deployment was performed.
- **Browser changes:** worker settlement, cooperative verification cancellation
  and the delayed-announcement correction were reviewed. At `bd89f60`, the
  announcement callback checks the originating route/run at delivery time, so an
  obsolete running/verdict announcement cannot survive cancellation, input edits
  or navigation. Final device/rules/undervote and storage work is qualified by the
  separate surface review, not this receipt.

## Independently executed evidence

Linux, Node 24.22.3, Python 3.12, isolated checkout; dependency installation used
the repository lockfile and the explicit verified vendor installation. Node test
batches used `--test-concurrency=1`; package typechecks were run serially. These
counts are per command and overlap other reports; they must not be summed into a
unique repository-wide test total.

| Check | Tested source | Observed result |
| --- | --- | --- |
| Fresh `npm ci --ignore-scripts --no-audit --no-fund`, then explicit `npm run vendor:install` after integration | Install at `0cb0fb8`; vendor step at `21f5c90` | Passed. |
| Crypto tests; added protocol nonce/control/marker tests; CLI control tests; vendor and workflow coverage tests | `21f5c90` | 142 passed, zero failed/skipped. |
| Python control sequence and existing control-authentication discovery | Started at `21f5c90`; unchanged Python subtree in `60c5bff` | 14 passed. |
| Python method/tie, published-decrypter and marker-conflict regressions | `60c5bff` | 4, 2 and 4 passed respectively. |
| Initial selected server batch including the entire imports test file | `21f5c90` | 41 passed; imports child failed without an assertion result. This command did not pass. |
| Imports diagnostic rerun with TAP and a 192 MiB old-space cap | `21f5c90` | Child terminated with SIGKILL at about 69 seconds, exit code absent. Not a pass; no assertion failure was reported. |
| Original independent deletion-race probe, after correction | `60c5bff` | Later append refused; deletion completed; independent anchor remained zero. |
| Corrected lifecycle/anchor/deletion recovery/combined archive rollback batch | `60c5bff` | 18 passed, zero failed/skipped. |
| Focused normal, legacy-control and incomplete import boundaries after correction | `60c5bff` | 3 passed, zero failed/skipped. |
| Protocol and CLI package typechecks | `60c5bff` | Passed. |
| Server package typecheck after restore-floor fixture correction | `eb66c19` | Passed. The earlier check at `60c5bff` found the now-corrected missing `runtimeAnchors` fixture property; it is not counted as a pass. |
| Complete `npm run vectors:check` | `eb66c19` | 438/438 passed; zero failed and zero files not run. |
| SPA verification, delayed announcements and sealing-worker lifecycle tests | `bd89f60` | 23 passed, zero failed/skipped. |
| Browser launch with `QV_REQUIRE_BROWSER=1` and the repository launch helper | `bd89f60` | Chromium failed at `process_singleton_posix` with socket EPERM and SIGABRT, before any page assertions. No browser test pass or intentional skip is claimed. |
| Final device/storage UI, final production build and final web package typecheck | Later source | Separate surface-review and hosted-CI receipts required. Not claimed here. |

Additional exact source identifiers used above:
`21f5c90d6c2280406857fe3a16bc5619ba597ce1` and
`eb66c19379718e8e4b09fbd85ca5ea27cefcea6b`. The other full identifiers appear in
the scope and finding sections. All production changes between these reviewed
commits were inspected; subsequent source requires its own applicable evidence.

The initial explicit-module Python command under `-I` could not resolve the tests
package and executed no real tests; the corrected standard-library discovery
command produced the 14-test pass above. That harness error is not counted as a
source failure or as successful verification. The independent logs and original
reproduction were preserved under the session's `quietvote-evidence/final-review-*`
paths; the permanent lifecycle regression is committed in the repository.

## Limits and promotion conditions

The complete supported OS/Node matrix, whole-repository typecheck, complete import
suite, required production-browser journeys, CSP checks and accessibility gates
must qualify the final published tree. A terminated process and a browser that
cannot launch are incomplete evidence. Existing capability exclusions and skips
must remain explicit. This review does not certify every historical security
finding closed, all product workflows complete, or release readiness.

No additional confirmed implementation defect was left unresolved in this
review's completed scope. This bounded result does not erase the already recorded
feature gaps, conditional contract decisions or qualification requirements.

The current feature/contract boundaries belong in `UNFINISHED_WORK.md`; reviewed
source and qualification evidence belong in `CONSOLIDATION_REPORT.md` and
`FINAL_VERIFICATION.md`. Repository policy still requires two formal approvals,
including a designated security reviewer, for these sensitive changes. No such
appointment or approval is supplied by this report. Historical DCO gaps are an
owner provenance decision and are not retrospectively attested here.
