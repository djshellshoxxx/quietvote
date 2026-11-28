# Server task 3: ballot limits and overlapping admission — 2026-11-27

**Status:** the four bounded missing acceptance cases are covered by five new
tests. No production defect was observed and no production change is included.

Base: PR77 `6764bf231801a782a57b2778a344c6ab26063e9b`.
Date is America/Vancouver. Source requirements: QV-29-REQ-006/008 and adopted
QV-ADR-028; inventory `docs/reports/inventory-20261111/server.tasks.md`, task 3.

## Existing coverage retained

This slice does not duplicate the existing fresh-nonce same-body refusal,
cross-voter copied-envelope refusal, exact receipt replay/reopen, revote quota
reconstruction, ciphertext rewrap exclusions, or two-key registration race.
Those are in `negative.test.ts`, `eligibility-property.test.ts`,
`idempotency-restart.test.ts`, `s1-spoil-then-cast-rewrap.test.ts`,
`consolidation.test.ts` and `registration.test.ts`.

The inventory's raw-code registration wording predates ADR028. The new race
uses the current `hashed-pop-v1` body, including the real invite-bound Ed25519
proof of possession for each distinct public key. It neither adds a legacy
fallback nor changes invitation width or expiry.

## New acceptance evidence

| Case | Positive control and observable result |
|---|---|
| Cast quota before proofs | A real 2-of-3 ceremony opens voting; each permitted cast increases the proof counter. An independently verified, correctly chained next cast returns `429 REVOTE_LIMIT` / `E_REVOTE_LIMIT` without increasing that counter or changing state. |
| Same code: cast then spoil | Both envelopes have the identical code-bearing body and valid signatures/proofs. The first cast succeeds; the following published spoil returns `422 E_SPOILED_CODE_CAST` before proof verification. |
| Same code: spoil then cast | The first valid published spoil succeeds; the cast of that identical body returns the same typed refusal before proof verification. |
| Two overlapping same-predecessor casts | Independently verified, distinct ballots reference the same initial head. The test holds the real election mutex, queues one request, advances the injected clock beyond the existing interval, queues the second and confirms both are waiting. Releasing the mutex yields `201` then `422 E_SUPERSEDES`, one proof verification, one appended leaf and one ballot-index/reference entry. |
| One invitation, 100 distinct keys | All 100 real hashed-invite PoP bodies reach the held registration mutex before release. Exactly one returns `201`, the other 99 return `409 INVITE_USED`, the invite is consumed, and SQLite contains exactly the winning voter. Enrollment appends no board entries. |

Refusal snapshots compare the exact checkpoint note, root and size, total body
bytes, every persisted `ballot_index` and `ballot_ref` row, runtime heads,
cast/spoil counts, append counter and proof-verification counter. The cast race
checks the winning voter's first/latest sequence, count and head, and verifies
the receipt promise and inclusion proof against the actual submitted header.
The board verifier independently checks stored signatures and Merkle roots
under fixture-owned keys after the ballot cases.

The queue barrier is part of the test, not an altered admission implementation.
All queued requests are released and awaited in cleanup. The 100-request case
uses the existing `World` test rate limits so generic flood controls do not hide
the invitation-redemption decision. No production rate or queue bound changes.

## Reachable mutation controls

Each control was applied temporarily to an isolated worktree, tested only with
its relevant case, and restored in a `finally` block. All five tests failed at
the intended assertion with exit 1. Afterward both production files were
compared byte-for-byte with their saved originals.

| Temporary mutation | Intended failing observation |
|---|---|
| Move the ballot proof counter ahead of the cheap gates | Over-cap request changes the counter despite retaining its quota refusal. |
| Remove cast-to-spoil code and ciphertext exclusions together | The direct spoil returns `201` instead of `422`. |
| Remove spoil-to-cast code and ciphertext exclusions together | The direct cast returns `201` instead of `422`. |
| Bypass the admission mutex in the queued writer | The candidate fails to reach the held lock; the required overlap assertion fails. |
| Keep the invite state issued when consuming it | All 100 distinct keys enroll instead of exactly one. |

The code and ciphertext checks are overlapping defenses, so the exclusion
controls remove their semantic group. This does not claim that each redundant
line can be killed independently using the same valid input. No hash collision
or impossible cross-voter code is fabricated to exercise `E_DUP_CODE`.

Restored production SHA-256 values:

- `packages/server/src/election.ts`: `910634f9e243d3e0cf75bcaf62971578bf6e6be9a565a394b6bcb75cf09e6778`
- `packages/server/src/electiondb.ts`: `782c212da14bbe31ac10be8fd9db637fa7f202afc668b458944316b033ef22dc`

## Verification and limits

Linux, Node 24.22.3; `npm ci --ignore-scripts` and `npm run vendor:install`
completed without dependency changes.

- `node --test --test-reporter=spec packages/server/test/ballot-limits.test.ts`:
  **5/5 pass**, no skips.
- Five temporary mutation controls: **5/5 detected at their intended assertions**.
- Full TypeScript check and pinned-vendor verification: pass.
- Production source restoration and whitespace check: pass.

Only this focused suite is run here; the integration owner performs full-suite
qualification. Native Windows/macOS execution has not been performed in this
worktree. These tests establish the listed HTTP/SQLite behavior in one server
process, not throughput, distributed-writer behavior or power-loss durability.
The fixture has zero witness quorum: board/receipt checks are scoped evidence
and do not claim a witnessed full-election `PASS`.
