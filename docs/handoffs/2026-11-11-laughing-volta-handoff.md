# QuietVote — handoff for `claude/laughing-volta-61srfa` (PR #27), 2026-11-11

**Status: PAUSED by the project owner (2026-11-11).** Work stopped at this commit. QuietVote remains an unaudited prototype, not for real elections. Everything below is AI-assisted work, not an independent review.

- Branch: `claude/laughing-volta-61srfa`, draft PR djshellshoxxx/quietvote#27, stacked on `claude/clever-gates-uqd5p1` (PR #26, the other integration line), which is stacked on `integration/quietvote-consolidated-20261030` (PR #22) → `main`.
- Head SHA: see the PR page / `git ls-remote origin claude/laughing-volta-61srfa`.
- Owner decisions in force: `docs/plan/DECISIONS-2026-11-04.md` (QV-ADR-027 categories A–D, QV-ADR-028 registration).
- Work split agreed with the PR #26 session (`session_01KtKj8mxDyYRstJHfYESN2g`): it owns category A/B, B3-01/ADR-028, TR-09, G1/G2, CLI exit code B2, and the packages protocol, verifier, verifier-py, test-vectors, trustee, cli, vendor/, policy/, lockfile. This branch owns categories C and D outside those areas, plus CI sharding (`ci.yml`).

## Done on this branch (each adversarially reviewed unless noted)

| Area | Items | Commits (subject) |
|---|---|---|
| Integration | ordinary-UX checkpoint + #24 YAML; base merges of #26 incl. the decision register | `merge: ordinary-UX…`, `merge: base claude/clever-gates-uqd5p1…` |
| CI | 4 duration-balanced test shards; Linux PR gate (node 22/24); full 3-OS × 2-node matrix on main / nightly / dispatch / `ci:full-matrix` label; docs-only skip; claims lint split out | `ci: shard workspace tests…` (shards 70–150 s vs 474 s serial) |
| Server | B2-02 (off-thread verification, early duplicate refusal, ELU test), B2-11 (invite retention), B2-16 partial (QV-31 log allowlist; control reason enum at the server boundary), B2-07 (rollback anchor + quarantine), B2-12 (no zero-seed receipts), B2-10 partial (invite creation side), N-16, N-20, N-32 a/b, N-21 | `fix(server): off-thread import…`, `fix(board,server): rollback anchor…`, `feat(server): invite expiry default…` |
| Web | B3-18, B3-23, B3-32 (live regions, invite links, landmarks), trustees-mode spoil-share view (HANDOFF 3.2.1), JS budget recovery (196.5 KiB), W15 (integrity-pinned lazy preloads + tamper e2e), N-37c | several `feat(web)/fix(web)/build(web)` commits |
| Verifier | TS/Py report semantics: 12 → 3 differences (spec-settled cases only) | `fix(verifier): align TS/Python report semantics…` |
| Crypto | CP-08 mutation survivors killed (M3/M7/M8/M15/M18); `spoilDecVerify` refuses identity Y_j (C8 parity) | `test(crypto): kill CP-08…`, `fix(crypto): cp-dec-spoil…` |
| Perf | 10k-ballot baseline, deterministic smoke test | `perf(protocol): 10k-ballot benchmark…`, report `docs/reports/performance-baseline-2026-11-04.md` |
| Docs | N-23c `scripts/trace.mjs` (report-only), historical claims-lint markers, N-08b empty-state files, REQ-063 client scope | `docs: report-only traceability…` |

## In flight when paused (NOT merged)

- **Web ballot items (QV-ADR-027 B3-06, B3-14, B3-11a, B3-28, B3-25 web side):** implemented, but the adversarial review **rejected** it. Kept out of the branch as a patch: `docs/handoffs/wip/2026-11-11-web-ballot-adr027-B3-06-B3-14-B3-11a-B3-28-B3-25.patch` (based on `f7c05dd`; apply with `git apply --3way`; the NOTES.md and audit-ledger hunks conflict, the source hunks apply). Blocking review findings to fix first:
  1. B3-06: `packages/web/src/flow/pause.ts` `entryRecords` computes a leaf only when the served body matches the header's `bodyLen`/`bodyDigest`; replacing that condition with `true` leaves all tests passing. Add a negative test with a mismatched served body.
  2. B3-06: the STH-freshness gate is checked only when the log is read; a confirmed PAUSED never expires on an open page (no timer in `live.ts`). Re-derive on a timer or expire the PAUSED display after the freshness window.
  3. B3-28 minor: `publish-ui.ts:77` organizer unlock skips `confirmCost`.
  4. B3-25: the canonical passphrase function lives in `packages/web/src/key/passphrase.ts`; the CLI must mirror it (CLI is the #26 line's area).
- **B3-26 offline verifier:** owner chose option A (main-thread cooperative yielding + progress, no Worker). The blob:-Worker version was merged then reverted (`revert: web offline verifier blob: Worker…`). Waiting on an `onProgress` hook in `verifyElection` (requested from the #26 line, "conformance stage C3"); then wire `packages/web/src/verifier/page.ts` with progress + cancel.

## Remaining (not started here)

- CLI-located items after the #26 CLI merge: D-85, N-39c, N-36a (CLI verify-client first), B3-25 CLI mirror.
- Reviewer follow-ups on merged work (non-blocking): docs/28 still describes the retired session/challenge auth tables (N-20); N-32(b) export precondition applies to ARCHIVED only, while docs/28 §11.2 also lists CANCELLED/ABORTED/IMPORTED; the export download route shares rate class X with export creation (lock-out risk); `trace.mjs` skips bullet-list requirement IDs (e.g. QV-13-REQ-020..024) and two of its self-tests are vacuous; claims-lint inline markers also exempt the following line (8 neighbour lines unscanned); B2-07 polls gossip peers only (not witnesses); the `adr027-anchor` IMPORTED test accepts 409 or 503; W15 lazy-import walk has no direct test.
- Handed to the #26 line: protocol `logcheck.ts:140` CONTROL_RECORD `reason` must use the same QV-07 §15.2 enum as `packages/server/src/records.ts` `CONTROL_REASONS` (existing vectors with free-text reasons, e.g. `test-vectors/v1/elections/log-layer-4v/notices/pause-resume.bundle.json`, need regeneration); registration-handler side of B2-10 (unknown/revoked/used invite answers); G1/G2 server–trustee gaps; CLI B2 exit code.
- CI follow-ups for the workflow owner: add `node scripts/trace.mjs` (report-only) and `node --test scripts/trace.test.mjs`.

## CI and known failures

- Last full CI run on this branch (`250e7fa`, run 41806030218): every test shard, typecheck, browser and claims jobs green; **`vectors, Python verifier and production build` red only at the final "Compare verifiers" step** (strict TS/Python report differential, 3 remaining differences). Those 3 are QV-ADR-027 category A rulings owned by the #26 line; the gate is intentionally left failing until they land. Do not weaken it.
- Later heads (the QV-ADR-027 C/D merges) were verified locally only; see the PR body for the exact local results.
- One merge commit on this branch (`merge: tmp-c1 (QV-ADR-027 items)`) lacks a `Signed-off-by:` line; every other new commit has one.

## Open security / audit findings (see `docs/audit/consolidation-2026-10-30.md`)

Still open or partial after this branch: B2-05 (control freshness/replay, protocol side), B2-16 (protocol/verifier enum), B3-01 (registration contract, #26 line), B3-04/W15 (module worker URL not integrity-pinned), B3-06/B3-14/B3-28/B3-25 (patch above, not merged), B3-26, CP-02/C3 and all category A/B items (#26 line), and every item that needs independent cryptographic, protocol and security review. No release, deployment or main merge has happened.
