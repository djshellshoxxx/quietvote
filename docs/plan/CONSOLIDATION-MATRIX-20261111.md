# QuietVote consolidation matrix (2026-11-11, Haiku run)

Status label: AI-assisted engineering record. Not an independent audit. QuietVote is unaudited and not for real elections. The project is paused by the owner (2026-11-11). Nothing here is released or deployed. `main` (`019f4e7`) is unchanged.

Method: `git fetch --prune`; for each of the 45 remote branches, ahead/behind counts against `origin/main`, file footprint, ancestry checks against the candidate tips, and `git cherry` patch-equivalence for branches not contained in the integration line.

## 1. Integration line

| Item | Value |
|---|---|
| Designated working branch | `claude/exciting-hawking-r0evza` |
| Pre-run tip | `019f4e7` (= `main`) |
| Fast-forward to PR #43 tip | `35a4500` (`integration/quietvote-completion`, draft PR #43 to `main`) |
| Merge of PR #42 unique work | `22d311f` (second parent `a5c9032`) |
| `main` | unchanged (`019f4e7`) |

## 2. Ancestry of the candidate tips

| Tip | Branch / PR | Contained in #43 (`35a4500`)? | Unique patches vs #43 (`git cherry`) | Disposition |
|---|---|---|---|---|
| `35a4500` | integration/quietvote-completion (#43) | n/a | n/a | Base of the integration line |
| `a5c9032` | claude/wonderful-hypatia-9yszin (#42) | no | 8 | **Merged** as `22d311f` (one doc conflict, resolved by keeping #43's handoff) |
| `2aaf0a0` | claude/laughing-volta-61srfa (#27, paused) | no | 5 | **Not merged.** Classified by review lane L5 (see section 4) |
| `ab84f16` | codex/quietvote-milestone-20261109 (#30) | yes | 0 | Already in #43 |
| `61ddc6d`, `5ca8b53`, `1cfc10d`, `6768318`, `c4a8959`, `5cf3592`, `11c8ca2`, `0dac28b`, `0352bca`, `571c9f0` | chatgpt/zero-codex/* (#32-#41) | yes (all 10) | 0 | Already in #43 (merged there as `31f13e4`) |
| pre-#43 audit chain | integration/quietvote-consolidated-20261030 (#22), claude/clever-gates-uqd5p1 (#26), chatgpt/quietvote-ci-action-pin-guard-20261104 (#28), claude/quietvote-finish-1 (#3), claude/quietvote-ui-locale-a11y-sltfb3 (#18), claude/sharp-archimedes-tu76rh (#20), claude/dazzling-cerf-n8ha3g (#1), claude/quietvote-docs-1 (#5), codex/quietvote-consolidation-audit-20261104 (#29), checkpoint/quietvote-ordinary-ux-20261024 | yes (all) | 0 | Already in #43 |
| `e671fd1` | claude/docs-screenshots (#21) | no | 1 (README status and spec index notes) | Not merged. Docs only. Candidate for a later docs lane |
| `29313c3` | docs/readme-and-wiki (#2) | no | 1 (wiki pages and README wiki section) | Likely superseded by `wiki/` in #43. Verify content before closing |
| `d5c7998` | chatgpt/zero-codex-continuation-spec-20261109 (#31) | no | 1 (ChatGPT lane continuation spec) | Not merged. Spec only. Owner review needed before it is used |
| `980a5cd` | chatgpt/quietvote-visual-ci-repair-20261102 (#23, closed) | no | 0 (patch-equivalent to #24) | Duplicate. Closed PR, no action |
| `019f4e7` | claude/quirky-curie-n5pxf5 | n/a | 0 | Equal to `main` |

Notes
- PR #43's handoff states that PR #42 is a duplicate with the same tree. That is out of date. #42 had moved on to `a5c9032` with 8 unique commits. The merge above supersedes that statement.
- PR #42's title says "paused by owner"; PR #27's tip is a "pause handoff" commit. Both pauses are recorded in the repo.
- Branches PR #23 (closed) and PR #24 (same tree) are duplicates and need no action.

## 3. Duplicate and equivalence analysis

- Every `chatgpt/zero-codex/*` branch is an ancestor of `35a4500`. The fixes in PRs #32-#41 are therefore already present in the integration line. Their open PRs are redundant once #43 lands.
- `codex/quietvote-milestone-20261109` (#30) and `integration/quietvote-consolidated-20261030` (#22) are ancestors of #43. Their PRs can be closed after #43 is accepted.
- The `claude/quietvote-audit-*-1` and `claude/quietvote-*-1` branches (#3-#17) are ancestors of #43. They are the audit fixes and their PRs are redundant once #43 is accepted.
- Documentation PRs #1, #2, #21 and the closed #4, #5, #23 are superseded by later docs in #43.

## 4. PR #27 gap (not merged)

Review lane L5 (AI-assisted, read-only, not an independent audit) classified the five unique commits of `claude/laughing-volta-61srfa`:

| Commit | Class | Reason |
|---|---|---|
| 13b86c2 (B2-07, B2-12, B2-16) | missing | No log floor or quarantine in `board/src/log.ts`. Reviewer treats B2-12 zero-seed work as not owner-held. This run keeps it owner-held (see below) |
| 07fd61c (B2-10 part, N-16, N-20, N-32, N-21) | partial | Client bearer removal and QV-Sig-only server auth are present (via #42). Missing: export `acknowledged_at`, IPv6 /56 buckets (`ratelimit.ts` uses /64). Unknown/used oracle depends on B3-01 |
| b2f043e (W15, N-37c) | missing | `util/pinned-preload.ts` and `test/trustee-scope.test.ts` absent. Reviewer notes the branch handoff says the owner chose option A; this must be checked before applying |
| 80c3a17 (N-23c, claims markers, N-08b, REQ-063) | partial | MAINTAINERS, RELEASE-KEYS and LICENSE-NOTE present. `trace.mjs` differs, and CLAIMS-LINT-HISTORICAL markers are absent |
| 2aaf0a0 (handoff, wip patch) | missing by design | The wip patch was review-rejected and must not be applied as-is |

Decision for this run: none of the five is merged. Items 13b86c2, 07fd61c and b2f043e touch QV-ADR-027 authority, B3-01 or the owner-chosen option A. Owner review is required first, even where the reviewer finds them non-owner-held.

Known constraints from the completion handoff (section 5):
- QV-ADR-027 authority is contested. Items that depend on it (verdict cap P1/TSV-05, nonce hedging CP-02/C3, monotonic `control_seq` B2-05, no signing with a zero seed B2-12) are owner-held.
- B3-01 registration contract is owner-held (QV-ADR-028 status disputed).
- D-92 to D-94 verifier report semantics are owner-held.

## 5. Merge provenance

| Step | Source | Source commit | Integration commit | Tests | Result |
|---|---|---|---|---|---|
| Fast-forward | integration/quietvote-completion | 35a4500 | 35a4500 | none (ref move) | ok |
| Merge | claude/wonderful-hypatia-9yszin (#42) | a5c9032 | 22d311f | see qualification log | one doc conflict, kept #43 handoff |
