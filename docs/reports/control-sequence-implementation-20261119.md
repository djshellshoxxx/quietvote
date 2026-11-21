# Signed control counter implementation — 2026-11-19

This local candidate implements the accepted QV-ADR-027 / decision-register B2-05
recommendation across current producers, server admission and replay, import and
export, and the TypeScript and independent Python verifiers. It follows the
catalog-only public reason change from `b8a1801` (local dependency `19e5153`).
The nonce correction immediately below that dependency is
`0d274b3869ddc215b19b05edfde681e15249f749`.

## Contract and migration

New controls require a signed `control_seq` integer in the QV-JSON safe range.
Their optional reason is a public catalog code. The field's presence selects the
new control shape; the record signature continues to use the manifest hash and
`control` record type, with the existing distinct coordinator threshold.

Historical controls may form an unnumbered prefix. That prefix leaves the counter
at zero, so the first numbered control is one regardless of prefix length. Every
subsequent authenticated control increments by exactly one. A replay, gap, future
initial value or unnumbered downgrade fails. All actions share this counter;
ballots and markers do not consume numbers. Authentication precedes advancement,
so malformed records and bad signatures cannot reserve a value.

The server validates under its existing append serialization, reconstructs the
counter during replay, and exposes it as an operational state hint. Exact outer
packet retries retain the existing receipt behavior. A fresh outer envelope around
an old signed body fails with `409 STATE_CONFLICT` / `CONTROL_SEQUENCE`.
No database migration or rewrite of historical signed bytes is used.

The core verifiers recognize numbered controls. An authenticated order violation
is fatal `E_LOG_ORDER` on `chk.time.window`, before dependent results are computed.
The board-evidence paths also enforce the sequence after authorization. Legacy
core class-L notice classification and existing malformed/unauthorized record
classifications are preserved. Notice interpretation still does not add terminal
effects or relax manifest witness and time gates.

## Complete history and clients

Content exports now include control notices and terminal controls, so offline
verification and the web's authenticated snapshot can derive the counter from the
signed records. Import requires every numbered physical control to appear in the
content view. It authenticates and checks the order of all physical controls.
An older archive may still omit its unnumbered controls from `election.json`, as
the previous exporter did; the physical signed records remain available and are
verified before projection. Re-export retains those original signatures.

CLI `election draft-record` prepares the seven existing server control actions
from a manifest-pinned public archive. `sign-record` requires that archive for
controls and checks the body against its next counter before unlocking a key.
Co-signing validates previous signatures over the unchanged body. A stale counter
refuses to produce an output. The current web UI has no control producer; its
existing action scope remains unchanged, and its authenticated snapshot reports
the derived counter.

The snapshot can be authentic and stale. CLI summaries explicitly report
`freshness_verified: false`; another admitted control requires a new body and new
signatures. The counter alone does not establish the latest checkpoint, absence
of forks or recovery from a restored older log. It does not retroactively remove
the legacy prefix's replay limitation.

## Validation

The following runs completed on this candidate. Counts overlap where a focused
test was also exercised by an integration run; they are not a summed suite total.

| Check | Observed result |
|---|---|
| TypeScript control core/board and server admission regressions | 8/8 passed |
| CLI lifecycle, control draft/sign, packet, public reason, web admin and full HTTP election integration | 19/19 passed |
| Final control admission/export checks plus full HTTP election after export retention changed | 4/4 passed |
| Independent Python new sequence and existing control authentication tests | 14/14 passed |
| Independent Python existing log-vector test | All 48 existing log vectors passed, with no capability skip |
| Import, re-export, runtime recovery, offline replay rejection, numbered-record omission refusal, and a fully authenticated legacy archive | 2/2 integration tests passed |
| Deterministic vector regeneration and corpus manifest | 2/2 passed; regenerated output has zero diff |
| CLI complete corpus check | 438/438 passed, 0 failed, 0 files not run |
| Strict shared TypeScript/Python comparison | 32/32 agree, 0 differences |
| Affected protocol, server, CLI and web package typechecks | Passed individually with bounded heaps |
| Whitespace check | `git diff --check` passed |

Five new signed mutation fixtures cover future first counter, immediate replay,
gap, downgrade and older replay. Existing `test-vectors/v1` files remain
byte-identical to this feature's dependency baseline. The corpus manifest and
canary corpus were regenerated to include the additions. The comparator's three
existing exclusions for board append-only, witnesses and receipts are still
explicit exclusions, not counted as agreement; the separate log-vector test
exercises the independent Python log path.

The whole-repository typecheck was attempted at 512 MiB and was killed with exit
137 without diagnostics, then at 384 MiB and exhausted the V8 heap. The affected
package project checks passed separately (protocol/server 384 MiB; CLI/web
448 MiB). No compiler rules or test expectations were relaxed to obtain passes.

Validation logs are under the session evidence directory with the
`control-sequence-` prefix. The initial fractional test fixture was corrected to
test schema rejection because QV-JSON refuses to sign fractional values. The
import regression first exposed a real binding omission, which was corrected.
The legacy fixture captures its test key while the test election is still in
AUDIT, before the normal archival transition erases that key; production key
erasure remains unchanged.

This is implementation and test evidence for local integration. It does not grant
a formal security approval, release qualification or deployment authorization.
