# P1 / TSV-05 / TSV-04 evidence-required verdict milestone

Authority: accepted QV-ADR-027 and the parent task's explicit instruction to
implement the approved default. This milestone implements the missing-log
verdict gate and the interrupted supplied-board gate. It depends on the separate
PY-02 no-tally implementation (`0a73091`, locally cherry-picked as `cb33bb0`).
The parent must integrate this milestone's own commits, not duplicate PY-02.

Default verification needs append-only and witness checks to pass. Fatal
findings take precedence over INCOMPLETE. Optional receipt sampling remains
separate. An operational log-layer interruption is INCOMPLETE with a generic
caveat, preserving fatal findings already established.

Only a caller-owned strict Boolean `allowNoLog: true` / `allow_no_log=True`
enables content-only scope. It permits absent evidence, or authenticated
append-only evidence with signed manifest witness quorum zero. A supplied
malformed, failed, skipped, redacted/unverified or interrupted append layer
cannot use this exception. Nonzero witness requirements remain enforced. The
report states `CONTENT-ONLY` and that PASS does not establish witnessed log
integrity. Bundle fields cannot enable the exception. No corpus bytes, expected
reports, comparator acceptance predicates or capability exclusions changed.

## Runtime caller inventory and disposition

| Caller | Scope and behavior |
|---|---|
| `protocol.verifyElection` / `verifyElectionText` | Strict default; explicit caller option only. Core input still uses caller `log` evidence. |
| `verifier.verifyBundle` | Strict default; extracts optional board, checks protocol and independent board layers, caps PARTIAL/skipped/thrown supplied layer even under opt-out. Existing manifest pin and anchor caveat retained. |
| `verifyWithSelfTest`, `qv verify`, `qv-verify` | Strict default; explicit `--content-only` or caller option; report caveat and exit 0/1/3 for PASS/FAIL/INCOMPLETE. Self-test remains independently fatal. |
| `qv board verify` election path | Strict outer verifier; no content-only option; existing log-specific exit gate retained. |
| CLI `common.electionContext` | Strict default; derives encryption parameters only from required manifest/DKG checks, not overall PASS. No opt-out needed. |
| Trustee `verifiedElection` | Strict core default; strips prospective tally and independently enforces its existing authenticated log/witness/key gates. No PASS claim or opt-out added. |
| Server `verify-worker` / import pipeline | Strict default; existing import phases separately validate board, binding and protocol. Import job's incomplete protocol report stays explicit; acceptance remains gated by all existing phases. |
| Web admin prospective/restored tally checks (two calls) | Explicit internal content-only option: prospective coordinator record has not been appended yet. Existing candidate-content acceptance checks remain. This is not a public result report. |
| Web results / SPA verifier / standalone offline verifier | Strict default, no exposed opt-out. Results fetch additive board evidence and bind it to the already loaded pinned record snapshot. Uploaded board is evidence only. |
| Python `verify_bundle` | Strict default; explicit keyword for trusted content callers; supplied `log` checks still run. |
| Python `verify` CLI | Strict default; reads separate `--board` or embedded `board`; explicit `--content-only` only. Bundle option injection ignored. |
| Protocol tally benchmark | Strict default; core timings still run, absent board reports INCOMPLETE. |

Trusted conformance callers explicitly opt out: protocol vector generator and
reader, log-vector generator and reader, CLI vector evaluator, outer verifier
canary control/mutations, Python vector runner, and strict cross-verifier report
comparison. Pure cryptographic/classification positive unit controls use this
scope deliberately. Public/default CLI, HTTP export, report and smoke fixtures
assert INCOMPLETE. Browser positive fixtures now contain actual signed log
checkpoints and independent witness cosignatures.

## Evidence export and public presentation

`GET /elections/{id}/export.json?board=1` is additive; it uses the same read,
read-key, export-rate and published-manifest guards as the existing export. The
response combines election records and public board evidence synchronously. It
is no-store with no ETag/range reuse because cosignatures may change at the same
log size. Default export shape/cache behavior remains unchanged. The web cannot
substitute the export's record snapshot for its pinned loaded snapshot. Binding
mismatches fail checks; missing evidence stays incomplete, and live appends
invalidate/retry the result before display. The INCOMPLETE label now says more
evidence is needed rather than incorrectly claiming no result was published.
Translations retain their existing review status; no native-language review is
claimed.

## Milestone validation and fresh handoff

At source freeze: targeted protocol/log/wrapper/web suite 79/79; full Python
suite 144/144 before the additive embedded-board CLI test, then that focused
module 5/5. Typecheck passed. Production web build passed unchanged budgets:
198.3 KiB total gzip JavaScript, 95.6 KiB entry, 187.8 KiB standalone verifier.
The expanded suite, HTTP, CLI, strict comparator and browser attempts are being
recorded in a follow-up receipt. Committed vectors and embedded corpus are
unchanged. No hosted/browser or professional security-review claim is made by
this source milestone.

Fresh reviewer `/root/python_log_fresh_review` receives this exact source for
independent Python and Node API/CLI probes: absent/malformed/partial board,
strict caller flag, malicious bundle flags, signed zero-witness policy, witnessed
positive controls, thrown board/witness layers, and fatal precedence. The parent
integrates only after reviewing the receipts and any follow-up corrections.
