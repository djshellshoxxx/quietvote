# Remaining accepted product test work

Reviewed 2026-11-27 (America/Vancouver), against PR #75 source `5ae96e9` plus the local continuation work.
This preserves the bounded acceptance work from [the product inventory](inventory-20261111/product.tasks.md).
Implementation status below is local; it does not assert publication, merge or native CI completion.

| Task | Current status / evidence | Remaining bounded acceptance |
|---|---|---|
| T3 — Server eligibility/reference model | Implemented and source-reviewed: three seeded real HTTP histories / 129 ballot requests, modeled heads/counts/selections and invariant checks after each refusal. See [report](product-eligibility-20261127.md). | Integrated focused qualification is recorded in R26. The fixture's standard verifier remains explicitly INCOMPLETE for zero witnesses. |
| T4 — Protocol revote/reference model | Implemented and source-reviewed: six histories / eighteen analyzer comparisons, separate symbolic graph oracle, caps 1/2/4. See [report](revote-reference-coverage-20261127.md). | The accepted bounded TS-only task is covered. QV-07-REQ-025's separate 10,000-history cross-implementation acceptance remains open. |
| T5 — Ballot retry after restart | Implemented in `packages/server/test/idempotency-restart.test.ts`; focused test passed. | Integration/review only. A real 2-of-3 election preserves exact receipt at unchanged tree, quota and checkpoint across reopen; revotes exhaust the original cap; beyond-cap refusal adds nothing. Receipt and board verification use fixture-owned public keys. |
| T6 — SQLite data inventory | Implemented in the isolated data-inventory handoff: 36 tables / 229 columns and eight tests. | Integration/review only. No assertion of arbitrary nested-JSON coverage or new privacy/retention guarantees. |
| T7 — Privacy marker sweep | Implemented and source-reviewed: forty-two private marker families, actual issuance through archive/recorded export/retention, all runtime files plus logical caches/decoded bodies, mandatory positive controls. See [report](privacy-marker-coverage-20261127.md). | Integrated focused qualification is recorded in R26. Finite literal-marker coverage does not establish memory, arbitrary encodings, external-backup privacy or physical erasure. |
| T8 — Outbound guard | Dedicated webhook/gossip and SSRF tests already exist. | Observe a whole election with no configured webhooks/gossip and zero server-originated outbound DNS/socket attempts, then demonstrate only the permitted webhook target is attempted. Include actual `node:dns/promises` and HTTPS/native connection paths. |
| T9 — Lifecycle model | `unit.test.ts` has fixed transitions; HTTP/recovery tests cover individual paths. | Independent declared-graph/model corpus plus sampled authenticated, well-formed HTTP entries for rejected state/type pairs, unchanged board on refusals, and exact STALLED deadline behavior. |
| T10 — Pause/resume limits | `e2e.test.ts` covers pause/resume and ballot denial while paused; control-sequence tests cover under-quorum signatures. | Bounded workflow with configured halt limit, rejection of the next pause, operator-only and insufficient-coordinator authority refusals, successful invalidation and unchanged state after each refusal. |

## Scope qualifications to retain

- T3: the default `fullElection` helper uses zero witnesses. Board signature/inclusion verification and a raw protocol verdict
  are not a claim that every strict full-snapshot check passes. Preserve the current derived-record compatibility boundary;
  do not weaken gates or manufacture a witnessed PASS to satisfy older wording.
- T7: distinguish private cast selections from intentionally public spoiled openings, option names and tally counts. Use
  distinctive private serialization/entropy markers. Voter/trustee secret-key absence is meaningful; demanding absence of
  the server's intentionally persisted KEK would misstate the storage contract. Do not claim physical erasure from a byte scan.
- T8: the harness's HTTP client uses sockets too. Isolate the server observation boundary so inbound test traffic is not
  counted as server egress and injected transports do not hide unexpected alternate network paths.
- T9: use reachable states. Terminal-state safety means no new append; preserve existing permitted idempotent retries.
  `effectiveState` enters STALLED strictly when elapsed time is greater than `stalledMaxSec`, not at equality.
- T10: do not introduce close-time extension or a second server ceremony; those remain separate policy/contract work.

Each remaining item is test-only unless a specific failing case establishes a production defect. Report the case and its
contract before changing production. Existing crypto/signature checks must remain real; expected state must not be copied
from the implementation under test.
