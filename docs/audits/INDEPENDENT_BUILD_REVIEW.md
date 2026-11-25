# Independent build and browser integration review

Status: **engineering review complete for the scope below**. Both confirmed
findings are corrected and independently revalidated, and the assembled source
passes the targeted local build gates. Hosted qualification remains required.
This is not a formal GitHub approval or a release qualification.

## Independence and scope

The reviewer used a separate worktree and did not implement the production
changes. The review read the branch inventory, unfinished-work ledger,
consolidation report, security-boundary report and verification ledger, then
inspected the complete main-to-candidate path inventory for omissions. Detailed
source review focused on dependency installation and provenance checks, workflow
coverage, build reproducibility, worker settlement, browser verification
cancellation, device settings and the corresponding browser journeys.

Initial source was commit `21f5c90d6c2280406857fe3a16bc5619ba597ce1`, tree
`cec21d44e4a89eb7c0a798c35a8401e63f6c9166`. The pending UI slice was also inspected
at `45715e7dbffc2a24c6b9f4967bdf6d3c8e49e07f`. These identifiers are local
engineering provenance. The final publication receipt must identify the
published equivalent tree separately.

The initial main contains documentation only. Its comparison with the initial
review candidate contains 1,271 changed paths: 1,250 additions, 21 modifications
and no deletions. The two production dependency versions, crypto dependency
manifest and registry lockfile are unchanged from PR #70. This inventory check
does not substitute for line-by-line cryptographic or server-protocol review;
those areas have a separate independent review.

## Confirmed findings

### Delayed verifier announcements outlive the run that produced them

Visible `/verify` results correctly check the route and run generation, but the
global live-region announcer schedules its text separately. If navigation,
page hiding, an input edit or a new run occurs after the result is ready but
before that callback fires, a screen reader can receive the obsolete verdict.
The same race affects running and cancellation status.

An independent regression records every nonempty assignment to the actual
`live-polite` and `live-urgent` regions. All 13 distinguishing cases failed on
the initial review source for the expected stale-emission assertion. Two
positive controls confirmed current PASS and FAIL verdicts still announce.
Recording all assignments also detects a stale announcement briefly overwritten
by a current status. The finding was returned to the integrating author; the
reviewer did not alter production code.

**Resolved and independently revalidated.** Commit
`bd89f60e62f42885cbb207d807ca0624006a9a7f`, tree
`3392fc1fce42eee58013fcfd4c93d0891d1c5c98`, captures the route/run generation for
every verifier announcement and checks it when the delayed text is delivered.
The reviewer's original 15-case regression passes without modification, including
both positive controls. Together with the existing SPA and sealing-worker
lifecycle tests, the independent rerun passed 23 tests, with zero failures or
skips.

### Transient IndexedDB opening failures cannot be retried

The storage adapter caches a rejected database-opening promise permanently.
After a transient initial opening error, a later settings read reuses that
rejection rather than opening the database again. Consequently the newly exposed
explicit retry controls cannot recover without reloading the page.

A deterministic adapter regression rejects the first opening and provides a
working database for the next attempt. The second read fails on the original
source, and the observed opening count remains one instead of two. The finding
was returned to the UI author, including pending-open sharing, successful-cache
reuse and abandoned blocked-request cleanup as relevant review edges.

**Resolved and independently revalidated.** The UI author's correction
`d56bc9ce62da6ae66b118edb1fc1c15a7e35f0ba` clears only the failed cached opening,
retains shared pending/successful connections, aborts abandoned upgrades and
closes late successful connections from those abandoned requests. The original
independent retry probe passes on composition
`fbf9c1f83d56533dd8f6a07574845d888af9eafa`, tree
`bee114e8bdcf584393dbbd0ebe707b70568eb7f2`. A separate run of the committed
settings, opening, locale-preference, SPA and announcement tests passed all 30
tests, with zero failures or skips.

## Independently observed checks

These results qualify the initial review source, not an untested later merge.

| Check | Observed result |
| --- | --- |
| Fresh `npm ci --ignore-scripts` | Passed; 17 packages installed. |
| Explicit vendor installation | Passed; two pinned packages and 132 verbatim files. |
| Vendor, workflow coverage, browser-runner and action-pin tests | 36 passed, zero failed or skipped. |
| Dependency boundaries | Passed with the two existing D-97 layering deviations still reported. |
| Registry source/integrity lint | Passed; 35 registry entries and eight workspace links. |
| Claims lint | Zero findings across 289 checked files. |
| Documentation links | 1,948 links checked; none broken. |
| Announcement regression before repair | 13 expected failures; two current-verdict positive controls passed. |
| IndexedDB retry regression before repair | Expected failure; the second read made no new opening attempt. |

The original archive SHA-512 pins, per-file SHA-256 checks, regular-file-only
verification, installed module resolution and explicit setup receipt were
reviewed together. All five workflow dependency restores install the verified
copies. `buildSite` checks the installation even when called directly. Existing
CI failure handling still executes every independent browser journey and returns
failure if any journey fails; the UI slice registers its additional journey.
No budget, source allowlist, Action pin or assertion was relaxed by the reviewed
changes.

## Final-source qualification and limits

Final reviewed production source:

- Commit `363f7ed38001090d0a7e00a549288b525aaf8bda`.
- Tree `bee114e8bdcf584393dbbd0ebe707b70568eb7f2`.
- Linux, Node 24.22.3, npm 11.9.0, unchanged registry lockfile.

This tree is identical to the previously tested `fbf9c1f` composition, so its
30-test UI result and independent retry result apply without a source assumption.
The final main-to-source inventory has 1,280 changed paths: 1,259 additions,
21 modifications and no deletions. The final UI simplification reuses the existing
receipt label and completion status, retains optional local acknowledgment and
explicit retry, and does not alter normative guarantees, translation review
metadata, budget thresholds or browser-runner failure behavior.

Additional checks run independently after selecting the final commit:

| Check | Observed result |
| --- | --- |
| `npm run vendor:check` | Passed for both pinned packages and all 132 files. |
| Build and precompiled-catalog tests | 6 passed; repeated application builds, asset manifests and standalone verifier bytes agree. SRI, CSP, no-network verifier, text-only DOM and catalog review gates remain checked. |
| `tsc -p packages/web/tsconfig.json --noEmit` | Passed with a 256 MiB Node heap limit. This is the web package check, not the full-repository check. |
| Production web build | Passed; build ID `a4879782fa7e`. |
| Independently measured gzip sizes | Aggregate JavaScript **204,577 bytes** against 204,800; entry **101,529 bytes** against 112,640. Aggregate headroom is 223 bytes. |
| Browser-runner, workflow-input and Action-pin tests | 20 passed, zero failed or skipped. All eight journeys remain mandatory; missing tooling or a failed journey fails the runner. |

The reproducible-build and focused regression groups overlap earlier checks;
their counts are not presented as a unique whole-repository test total. This
report-only commit does not modify production source.

**No confirmed finding from this review remains open.** Hosted Windows/macOS,
complete repository typechecking and actual Chromium journeys remain separate
required gates. The known local Chromium socket restriction is not a browser
pass; this reviewer did not repeat that blocked launch or substitute simulated
DOM tests for browser execution. This review does not supply native-language
review, manual assistive-technology qualification, independent cryptographic
approval or the formal reviewer appointments required for main promotion.
