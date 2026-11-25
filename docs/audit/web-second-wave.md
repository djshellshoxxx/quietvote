# Web client and verifier audit (packages/web)

Scope: packages/web. Date: 2026-10-21. AI-assisted review, not independent audit.
Note: this file did not exist when the second-wave triage ran; the earlier WV-1..WV-7 section is not present here and is not reproduced.

## Second-wave triage

Input: unverified haiku-audit findings W1..W15. Tests are in `packages/web/test/audit2.test.ts` (node:test), written first and seen failing before the fix where marked.

| ID | Sev | Evidence | Status |
|----|-----|----------|--------|
| W1 | high | `flow/ballot-controller.ts` cast catch: 500/502/BAD_RESPONSE treated as rejected, secrets wiped | fixed; tests `W1: a 500 ...`, `W1: a bad-body ...` (failed first) |
| W2 | high | `ballot-controller.ts` putHead after receipt, no pin check | fixed (`checkAgainstPin`); tests `W2` fork, rollback, honest growth (fork/rollback failed first) |
| W3 | medium | `ballot-machine.ts` NEW_SEAL from non-retryable failed cast, stale supersedes | fixed; test `W3` (failed first) |
| W4 | medium | `ui/app.ts` lockAll never reached the ballot controller | fixed (`lockSession`, `LOCK` event); tests `W4` x2. DOM wiring (`ballotLock`) not unit-tested |
| W5 | high | `flow/election.ts` first `tally` record accepted unsigned | fixed (ctx + coordinator key + signature); test `W5` (failed first) |
| W6 | medium | `ui/app.ts` registration `catch {}` then success text | fixed (409 = already registered is OK, others shown); source-wiring test only, not unit-tested |
| W7 | medium | `flow/live.ts` refresh errors swallowed | partly: swallow fixed (status line `qv.live.failed`, UI only, not unit-tested). "Gap loops": not reproduced; a gap page throws before mutating, and the next refresh with a good page recovers (test `W7`). Status line is not reset to "live" after a later successful refresh (still says reload), open/minor |
| W8 | low | `live.ts` `Math.max(...records)` | fixed; test `W8` (300k records, failed first) |
| W9 | medium | `ui/app.ts` `clearAll().then` without catch, "cleared" announced | fixed (`clearDevice`); source test only, not unit-tested |
| W10 | low | `seal()` no try/catch | fixed; test `W10` |
| W11 | low | `toISOString` on invalid date throws | fixed (`isoUtc`); test `W11` |
| W12 | low | garbled preview copy `qv.org.announce` with placeholder id | fixed by removing the line (no catalog change); source test, not unit-tested |
| W13 | low | `aria-label` on span (code groups) and on stepper `p` | fixed (spoken text as `sr-only` text, label removed); source test; no screen-reader run |
| W14 | low | `qv.audit.public` inside collapsed details (docs/16 5.13.3 "plainly") | fixed (shown plainly with the two checkboxes); source test only |
| W15 | low | SRI not on lazy chunks / worker | not fixed, design limit: dynamic `import()`/Worker URLs cannot carry SRI without an import map (inline script, conflicts with the hash-pinned CSP). Already documented in NOTES.md "Gaps"; mitigations: same origin, content-hashed names, `asset-manifest.json`, `script-src 'self'`, and the entry's SRI lives in the same host-controlled `index.html` |

Assumptions: a 409 from `POST /registrations` means the key or invite was already used (server `conflict(...)`); the 4xx/5xx split for "unknown delivery" relies on the server answering definite refusals with 4xx problem bodies.
Not done: no browser/e2e run; no AT testing; translations untouched (no review records changed).
