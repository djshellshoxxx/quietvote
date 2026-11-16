# Supplemental author public-key pins — 2026-11-16

Author: `/root/supplemental_author_pins` (Codex). DCO commits, no GitHub writes.

## Milestone and exact sources

- Baseline: `1cff939858a74d9c58d44006e55a22a8e0867042` (P1 required-log verdict and complete public export follow-up already integrated).
- Production and initial regressions: `d3046beb15324164fbdc909f93530a682253f16f`.
- Real HTTP executable regression and user documentation: `4d7209e33c61feb311fc198c110a209262a60c02`; production unchanged.
- Worktree: `/workspace/scratch/d66ff14a02a0/qv-author-pins`.
- Fresh reviewer: `/root/python_log_fresh_review`, reviewing the frozen production source above. The independent review receipt is separate.

## Completed behavior

`verifyWithSelfTest` forwards caller-supplied `extraAuthorKeys` to the existing verifier. Both `qv verify` and standalone `qv-verify` expose repeated `--extra-author-key <hex>` / `--extra-author-key=<hex>` options. Each key must be exactly 64 lower-case hexadecimal characters; at most 32 values are accepted. Malformed keys are usage errors before file reads. Duplicate valid keys are harmless and deduplicated.

The upload verifier, standalone offline verifier, and live results page expose optional additional **public signing keys**. Help text directs users to obtain keys separately from a trusted source. The input takes one key per line (whitespace is accepted), bounded at 2080 characters and 32 values. No secret-key input, network key discovery, storage, metadata import, or automatic pin selection was added.

The web helper explicitly forwards the new trusted caller field; it still never forwards arbitrary bundle options. Pins authenticate supplemental author signatures under the existing log rules. They confer no coordinator, trustee, voter, or control authority. The manifest's witness requirements and the default missing-evidence verdict are unchanged. A correctly pinned zero-witness export remains INCOMPLETE by default.

Input changes clear completed results and invalidate pending runs. Upload verification binds its file, anchor, and keys to a generation and checks route lifetime before success/error rendering. Live verification checks route, view, and input generations after the board fetch, roll fetch, verification, and chart import. Live repaints start a fresh view without retaining pins for an automatic run; using a pin requires an explicit **Run checks** action. Standalone verification uses its existing abort scope for pin edits as well as file/anchor changes.

## Validation

All commands ran in this worktree. Production remained frozen at `d3046be` throughout the final checks.

- `node --test packages/cli/test/supplemental-author.test.ts packages/web/test/offline-verifier.test.ts packages/web/test/verification.test.ts`: **9/9 pass**. Actual spawned qv and qv-verify, canary-enabled wrapper forwarding, correct/missing/wrong keys, malformed/repeated/33-key options, exact length and final-newline rejection, default zero-witness exit 3 versus explicit content-only exit 0, independently witnessed supplemental fixture, metadata rejection, DOM edit/read races.
- `node --test packages/server/test/e2e.test.ts`: **1/1 pass**. Real 22-voter HTTP lifecycle and actual server `export.json?board=1`; independently fixture-owned server key; executable qv-verify exits 1 without pin, 3 with pin, and 0 only with pin plus explicit content-only scope. No signature or board metadata was treated as an independent key source.
- `npm test --workspace=@quietvote/verifier`: **25/25 pass**.
- `node --test packages/web/test/build.test.ts packages/web/test/security.test.ts packages/web/test/lazy.test.ts packages/web/test/audit3-ui.test.ts`: **25/25 pass**.
- `npm run typecheck`: **pass** on the frozen production source. An earlier concurrent invocation was killed with exit 137; the serial rerun passed.
- `npm run i18n:check --workspace=@quietvote/web`: **pass**; native-review gates unchanged.
- `npm run build --workspace=@quietvote/web`: **pass**. Total JavaScript gzip **204651 bytes** (199.9 KiB; 149 bytes below the unchanged 204800-byte ceiling), entry gzip **98752 bytes** (96.4 KiB; below 110 KiB), standalone HTML **193739 bytes** (189.2 KiB; below 400 KiB). CSP, SRI, no-network standalone constraints, lazy-loading and size gates unchanged.
- `git diff --check`: **pass**.

## Browser qualification and integration

`packages/web/e2e/verifier.ts` adds actual browser scenarios for both upload surfaces and live results: empty default inputs, missing/wrong pins, explicit positive pin runs, key edits clearing results, and edits while the live board response is pending. Existing route/chart concurrency regressions remain. These additions require the parent's hosted Chromium run; they were not claimed as locally executed. The reviewer independently confirmed the standard local Chromium launch is blocked by EPERM; no retry or sandbox bypass was attempted by this lane.

Cherry-pick the two source/test commits above, then this handoff commit. Recheck the total size on the integrated candidate: the remaining all-files gzip margin is only 149 bytes. Review findings, if any, should be applied as new signed commits and re-reviewed. No push, PR update, or deployment was performed by this lane.

## Export dependency review

Read-only review of `1cff939` confirmed the additive `board=1` route calls `electionBundle(rt, { includeBoardRecords: true })` and `logBundle(rt)` synchronously, behind the existing access/export guards, with `no-store` and no legacy content ETag reuse. The new flag includes every public record body required for binding; default JSON and QVB export paths retain their existing behavior. The real HTTP regression checks complete evidence, legacy-shape preservation, and the independent pin boundary. No blocker found in that follow-up diff.
