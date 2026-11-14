# Haiku T01: baseline qualification receipt (2026-11-14)

Local receipt of the base branch, run by a worker. Records what was run and what it printed. Not a qualification of any candidate, not an audit, not a claim of production readiness. QuietVote remains an unaudited prototype, not for real elections.

## Identity

| Item | Value |
|---|---|
| Base branch | `codex/quietvote-milestone-20261109` |
| Base commit | `ab84f16136184cb1fa0fa67b41e113424e134ba8` |
| Base tree | `2e548ad9d015db50dc6e042b0dd696f371de04f3` |
| Node | v22.23.4 |
| npm | 10.9.9 |
| Python | 3.13.18 (task card asked for 3.12; actual version recorded) |
| Host | Linux, local scratch clone, `npm ci --ignore-scripts --no-fund` exit 0 |

## Commands

| Command | Exit | Counts | Note |
|---|---|---|---|
| `npm run typecheck` | 0 | n/a | pass |
| `npm test --workspaces --if-present` | 0 | web: 219 pass / 0 fail / 0 skip (last workspace shown in log) | pass; see per-package table below |
| `node --test .github/scripts/*.test.mjs` | 0 | 19 pass / 0 fail / 0 skip | pass |
| `node .github/scripts/check-action-pins.mjs` | 0 | n/a | pass |
| `(cd verifier-py && python3 -I -m unittest)` | 0 | 58 tests OK | pass |
| `npm run vectors:check` | 0 | 412/412 passed, 0 failed, 1 file not run | `protocol/dkg/dkg.json` (`dkg.adjudicate`) skipped: operation not supported by qv |
| `python3 -I verifier-py/qv_verifier vectors test-vectors/v1` | 0 | total 282, pass 229, fail 0, not_implemented 53 | NOT-IMPLEMENTED count is known Python gap |
| `npm run build -w @quietvote/web` | 0 | build output printed | pass |
| `npm run i18n:check -w @quietvote/web` | 0 | 316 static, 19 resolved dynamic, 1 unresolved dynamic, 1 translator forwarder, 1 exclusion | pass |
| `node scripts/compare-verifiers.ts --json` | 1 | 27/27 verdicts agree; 3 rows with differences; 17 field differences; `ok: false`; failures: 3 | **expected, known** (strict comparator fails by design) |
| `npm run lockfile:lint` | 0 | 35 registry entries, 8 workspace links | pass |
| `npm audit --audit-level=high` | 0 | found 0 vulnerabilities | pass |
| `node scripts/licence-snapshot.mjs --stdout` | 0 | n/a | pass |
| `node scripts/lint-claims.mjs` | 1 | 20 finding(s) in 9 file(s); 138 file(s), 45 rule(s) checked | **expected, known** (20 historical findings) |
| `bash .github/scripts/run-browser-journeys.sh` | 0 | spoil-shares journeys: PASS (3 groups shown in log) | browser ran here; author-reported EPERM not reproduced on this host |
| `git diff --check` | 0 | n/a | pass |

## Per-package node:test counts (`node --test "test/**/*.test.ts"`)

| Package | Exit | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|
| board | 0 | 74 | 74 | 0 | 0 |
| cli | 0 | 47 | 47 | 0 | 0 |
| crypto | 0 | 75 | 75 | 0 | 0 |
| protocol | 0 | 215 | 215 | 0 | 0 |
| server | 0 | 165 | 165 | 0 | 0 |
| trustee | 0 | 87 | 87 | 0 | 0 |
| verifier | 0 | 25 | 25 | 0 | 0 |
| web | 0 | 219 | 219 | 0 | 0 |

Skips: 0 in every package on this Linux host. Windows-POSIX mode skips and conditional OpenSSL TLS fixture skips are platform-specific and did not appear in this run. Not observed here, so not claimed for other platforms.

## Not run

- `npm run vectors:check` and the Python vector run were run; no other vector runs were attempted.
- Hosted CI jobs (Linux/macOS/Windows x Node 22/24): not run. This is a local receipt only.
- Claims-lint baseline before this file was added: 20 findings in 9 files. Re-run after the file was added is recorded in the PR body.

## Notes

- Expected-fail items (`compare-verifiers`, `lint-claims`) are labelled above as expected and known. Nothing was edited to make them pass.
- No code, test, vector or verifier file was changed by this task.
