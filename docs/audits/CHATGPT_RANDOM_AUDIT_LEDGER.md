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
