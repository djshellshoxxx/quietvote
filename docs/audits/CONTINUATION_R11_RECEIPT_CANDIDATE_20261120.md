# R11 source candidate: opt-in immediate submit receipt (November 20, 2026)

## Identity and scope
Base continuation PR #71 commit `29cde9b1d8d774ee201c06f53386a556a2ad48d7`, tree `9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d`.
This isolated candidate adds an opt-in `online election-submit --log-key` receipt verifier. It does **not** change the existing default relay, publish or deploy. A new draft PR should target `codex/quietvote-comprehensive-consolidation`; do not merge until independent reviewers and actual hosted/runtime source qualification finish.

The external log-key pin is checked before POST, the election log origin is derived from the selected API ID, and exact base64url submitted header/body bytes are preflighted against header origin, body length, digest and per-type bounds. A leaf hash is derived locally from retained header bytes. One bounded POST is made. The QV-09 nested promise and base64url leaf/signature are projected to the board's flat, standard-base64 receipt form and checked through `verifyReceipt`. Included proofs bind checkpoint and entry under the pinned log key; promise-only is explicitly incomplete. Duplicate inclusion seq/leaf fields must agree when present. Unknown additive response fields cannot override client verification because output namespaces are separate.

Response errors, malformed successful responses and bad evidence after POST retain possible acceptance and never cause an automatic retry. Inclusion does **not** claim witness quorum, consistency with later heads, authenticated freshness, tally, finality or counted ballots. No server changes, polling, extra network reads or new cryptography.

## Distinct checks to perform on this exact candidate
1. **Code review:** inspect `submit-receipt.ts`, the opt-in conditional in `cmd-online.ts`, source naming/types, output compatibility, `logOrigin` and exact preflight digest/leaf binding. Confirm the no-pin path remains `jsonRequest`.
2. **Ordinary functional review:** execute the new standalone promise and negative tests and the amended real-server `online.test.ts` receipt+exact-byte replay. Exercise a real included response, a separately constructed promise-only response, no-pin behavior and both output formats. Confirm external pin rejection pre-POST.
3. **Source-focused defensive review:** inspect QV-09 wire conversion, `seq` / `leaf_hash` duplication, malformed proof handling, response size/deadline, promise-only outcome and unknown mutation result semantics. Only benign source review and normal fixture tests.

## Qualification status and handoff
**No local product execution or TypeScript compiler result is claimed for this candidate.** The GitHub connector can publish this source but does not provide an isolated Node workspace runner; local container networking cannot resolve GitHub for cloning dependencies. Existing R10 459-test and offline-tally receipts qualify the previous implementation, not this new delta. The earlier current-head GitHub Actions CI/claims/visual runs were queued at inspection, so their outcomes are not assumed. Next reviewers must inspect fresh live refs, actual check runs and this source before recommending integration. Do not blindly merge, retry an uncertain submission, or imply a signed FINAL/freshness claim.

Formal approvals, historical DCO provenance, governance contracts and native ACL qualification remain outstanding. The stopped background-runtime investigation remains excluded.
