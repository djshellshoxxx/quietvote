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

## 2026-11-10 — third rotation (read-only)

**Worker arrangement:** No independent no-cost ChatGPT subagent capability was available in this invocation. This review was a separate **sequential read-only** phase, not a concurrent second worker.

- Source: frozen PR #30 head `ab84f16136184cb1fa0fa67b41e113424e134ba8`, tree (839 entries, complete). Main stays `019f4e789be2ff38a5fb2d348c3b225cc87cf296`. Reviewed the prior audit ledger before selecting.
- Eligible target set: sorted `packages/{server,web,cli,board,trustee,verifier}/src/**/*.(ts|mjs)` blobs, except `index.ts` and previously reviewed `packages/server/src/config.ts`, `packages/web/src/flow/election.ts`: **133** candidates.
- Repeatable rotation: FNV-1a/32 over UTF-8/ASCII string `ab84f16136184cb1fa0fa67b41e113424e134ba8|packages/server/src/config.ts|packages/web/src/flow/election.ts|20261110-run3`; unsigned hash **4023840259**, index **5** (`hash % 133`). Selected `packages/board/src/errors.ts`, blob `8269d81c392cd94b09888ebc25549bcf5ac248c7`.
- Surrounding callers/trust boundaries inspected: `packages/board/src/log.ts` admission/store errors, `packages/board/src/equivocation.ts` hostile-evidence error wrapping, `packages/board/src/entry.ts` entry validation, and `packages/board/test/audit.test.ts` negative error/result regressions (including F9 store-failure and F10 malformed evidence). Type-level `BoardErrorCode` names are not runtime validation.
- The selected file implements a stable discriminated `Result<T>` envelope and `ok`/`err` constructors; it does not parse external bytes, perform crypto, retain resources, or issue I/O. Reviewed for error-shape integrity, error-code use, exception surfaces and propagation across callers. Invalid evidence is explicitly caught at the inspected equivocation wrappers; append failures are mapped to `QV_BOARD_INTERNAL` in the inspected log path. This is bounded source inspection, **not** complete proof that every caller is total or that all error messages are privacy-safe.
- **No new reproducible defect established.** No severity assigned, no vulnerability claim and no fix PR. No local runtime, fuzz, or integration tests were executed in this phase.
- Separate existing audit PR #33 exact head `40ed68861ca486e80258564c0376218648d6d9be` had completed [CI 42823098479](https://github.com/djshellshoxxx/quietvote/actions/runs/42823098479): **10 successful / 1 failed** jobs; server+web Node 24 job explicitly passed the new non-finite-rate regression (166 server tests passed). The sole failing gate was the unchanged strict TS/Python report comparator (D-92–D-94 hold). This CI result applies **before** the present ledger commit; recheck the new head's checks.
- Next rotation: exclude all three audited target files and vary the seed/ledger counter. In any future suspected error-message leak, document a concrete reachable caller and reproduction privately before claiming a finding. This audit is not independent professional review or real-election assurance.

## 2026-11-10 — fourth rotation (read-only; sequential)

**Worker arrangement:** No independent free ChatGPT subagent/worker was available through the current tool set. The same assistant performed a separate read-only phase; this was **not** a second concurrent worker.

- Source snapshot: frozen owner draft PR #30 head `ab84f16136184cb1fa0fa67b41e113424e134ba8` (full Git tree: 839 entries, not truncated); default `main` remains `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Reproducible path selection: sorted `packages/{server,web,cli,board,trustee,verifier}/src/**/*.(ts|mjs)` regular source files, excluding `index.ts` and prior picks `packages/server/src/config.ts`, `packages/web/src/flow/election.ts`, `packages/board/src/errors.ts`; **132** candidates. Seed `ab84f16136184cb1fa0fa67b41e113424e134ba8|packages/server/src/config.ts|packages/web/src/flow/election.ts|packages/board/src/errors.ts|20261110-run4|9469` (final element is the preceding ledger's UTF-16/ASCII text length); FNV-1a/32 hash **3476491950**, index **30** (`hash % 132`).
- Selected `packages/server/src/ext-routes.ts` at blob `2ca0c73c114605235953e18e34fe76145907522f` (217 lines). Inspected the entire file, including anonymous checkpoint gossip, evidence listing, signed job-status lookup, import submission and admin routes.
- Adjacent boundaries inspected: `packages/server/src/app.ts` (readable/link-key enforcement), `packages/server/src/http.ts` (authentication and request framing), `packages/server/src/admin.ts` (`authorizeAdmin`), `packages/server/src/ssrf.ts` (target-address controls) and test coverage in `packages/server/test/gossip.test.ts`, `packages/server/test/imports.test.ts` and `packages/server/test/security-review.test.ts`. The code checks signed administrative access, scopes imported organizations, enforces a byte cap on import requests, and delegates signed checkpoint and link-key checks to the appropriate helpers. Source tests include link-election gossip confidentiality and import read-key/idempotency cases. This is bounded inspection, not a claim of complete property verification.
- Examined potential unauthenticated origin/tree-size disclosure, cross-organization access, forged gossip notes, input/body-boundary bypass, job-status leakage and inconsistent admin errors. **No new independently reproducible defect was established.** No severity assigned, no public finding/issue opened and no implementation fix proposed. No local test, fuzz or external security review was run in this phase.
- Previous application [PR #35 exact-head CI](https://github.com/djshellshoxxx/quietvote/actions/runs/42831513209) completed **10 successful / 1 failed** jobs; the server regression passed, and the unchanged strict TS/Python comparator failed. That is separate engineering evidence, **not** evidence of this audit's completeness.
- Next rotation must exclude all four previously audited files and vary the seed. Preserve the B3-01 and D-92–D-94 protocol holds. In particular, audit observations must not be interpreted as independent certification of ballot privacy or integrity.
