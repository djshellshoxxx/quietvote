# ChatGPT randomized read-only audit ledger

## 2026-11-10 — first run

**Worker arrangement:** Independent concurrent ChatGPT subagent not available. This was a separate review-only phase in the same scheduled invocation, followed by an isolated test/fix branch only after non-overlapping ownership was verified. Do not describe this as a second concurrently running worker.

- Source pinned: PR #30 head `ab84f16136184cb1fa0fa67b41e113424e134ba8` (base main `019f4e789be2ff38a5fb2d348c3b225cc87cf296`).
- Ledger: no predecessor in `docs/audits/` at the reviewed ref.
- Repeatable selection: integer seed `parseInt("ab84f161", 16) = 2877616481`; sorted manually enumerated `packages/server/src/*.ts` candidates (31) at index `seed % 31 = 3` selects `packages/server/src/config.ts`.
- Threat boundary: trusted deployment configuration feeding token-bucket rate limiting. Reviewed `packages/server/src/config.ts`, `env.ts`, `app.ts` setup, `ratelimit.ts` and `packages/server/test/unit.test.ts`. No network-reachable configuration injection mechanism was identified or claimed.
- Existing `unit.test.ts` tests maximum bounds and normal refill but does not test non-finite custom rate values.

### Confirmed correctness issue: non-finite rate configuration accepted

- Location: `packages/server/src/config.ts` `resolveConfig` rate validation (the `for (const [k, r] of Object.entries(rate))` loop), corresponding consumer `packages/server/src/ratelimit.ts` `RateLimiter.take`.
- Original guard only checks `r.limit >= 1`, `r.windowSec >= 1` and `r.burst >= 1`. JavaScript `Infinity >= 1` is true. Thus `resolveConfig({dataDir: '/x', rate: {read:{limit:Infinity,windowSec:60}}})` reaches the returned config; a corresponding bucket has `cap = Infinity`, and `Infinity - cost` stays infinite.
- Source-derived isolated Node v22.16.0 predicate/bucket reproduction: original predicate rejects **false**, new finite predicate rejects **true**; 1,000 consecutive unit-cost attempts against the unbounded token value all accepted. This is **not** a complete repository e2e test.
- Scope/impact: **Low**, trusted-operator misconfiguration only; an invalid non-finite custom rate can defeat intended throttling. No proof of remote influence over `ServerOptions.rate`, no secret exposure or cryptographic effect. Confidence: high on code path and arithmetic; complete hosted regression remains unverified.
- Proposed minimal repair: require finite limit/window/burst while keeping previously accepted positive finite values and normal quotas unchanged.
- Isolated branch commits: red test `9c6d5714fb5610c01da429ae42233ffdb16ec883`; fix `dc42f935fd12d63562992fff5a8b5246944ea671`. Test path `packages/server/test/config-rate-finite.test.ts`.
- Validation: static source and isolated arithmetic reproduction only; **not yet** full server tests, workspace typecheck or hosted CI. Do not claim green CI.
- Review boundary: primary development branch PR #32 edits only scripts/diagnostic docs; this audit proposal edits server configuration and its new test. Neither changes the owner's PR #30 branch. No merge/release.
- Follow-up: inspect the audit PR's hosted CI, rerun complete server tests and check finite extremes policy before integration. Do not add an upper bound without an approved rate policy.

### Rotation

Next run must exclude `packages/server/src/config.ts` as a random seed target until the remaining paths have reasonable coverage. Inspect the previous ledger before choosing the next seed. This file is a bounded spot audit, not an independent professional audit or claim of repository-wide assurance. QuietVote is not for real elections.

## 2026-11-10 — second rotation (read-only)

**Worker arrangement:** A separate concurrent/subagent worker was unavailable; this audit was a distinct read-only phase of the same run, not a second concurrently running worker. No coding fixes or test changes were made in this rotation.

- Source tree: PR #30 at `ab84f16136184cb1fa0fa67b41e113424e134ba8` (the same immutable candidate as the first audit), main `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Selection: fetched complete Git tree (839 entries; not truncated); filtered sorted `packages/{server,web,cli,board,trustee,verifier}/src/**/*.(ts|mjs)`, excluded `index.ts` and previously audited `packages/server/src/config.ts`: **134 candidates**.
- Reproducible FNV-1a/32 seed string `ab84f16136184cb1fa0fa67b41e113424e134ba8|packages/server/src/config.ts|20261110-run2`; unsigned hash **1865539371**, index **81** (`hash % 134`). Selected `packages/web/src/flow/election.ts` (blob `b0e96650ac6fbc0b2a2bbd742f896550f1434c5b`).
- Surrounding inspection: `packages/web/src/flow/entries.ts` (untrusted log-body decoding), `packages/web/src/flow/live.ts` (SSE hints and re-read), `packages/web/src/api/client.ts` (credential-free API requests and bounded pagination), `packages/web/src/flow/ballot-controller.ts` (cast context/receipt boundary), `packages/web/src/flow/organizer.ts`, `packages/web/test/flow.test.ts` and `packages/web/test/live.test.ts`.
- Trust-boundary observations: `deriveElectionContext` validates the manifest and coordinator signatures, independently adjudicates DKG, verifies signed election markers and signed tally, and compares the supplied expected manifest hash when provided. Live updates read records rather than trusting SSE event bodies; entry decoding rejects malformed QV-JSON. `bindServerLog` compares server-advertised log key/origin against the signature-verified manifest. These are source observations, **not proof that every adversarial input is safe**.
- Reviewed for malformed records, absent log entries, spoofed context/phase/tally, disclosure via network access, log size, cancellation and error handling. Existing `flow.test.ts` checks wrong manifest-hash and truncated ceremony refusal; `live.test.ts` covers forged phase hints, coalescing, and refresh recovery.
- **No new reproducible correctness or security defect established.** No vulnerability severity assigned; no speculative issue filed. No runtime tests/fuzzing were executed in this audit phase. Review is bounded; it does not establish audit or real-election readiness.
- Follow-up: next selection must exclude both `packages/server/src/config.ts` and `packages/web/src/flow/election.ts`; consider focused negative tests for malformed signed-record inputs or partial pagination after ownership review, without altering B3-01 or D-92–D-94 protocol decisions.
