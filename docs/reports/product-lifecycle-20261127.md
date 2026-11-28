# Product T9: lifecycle graph and HTTP admission coverage

Date: 2026-11-27 (America/Vancouver). Base: PR #76,
`d38c55c3d6f0d8254967efea066cd282c4012553`. Test-only; no production policy,
schema, authority, protocol or verifier changes.

## Implemented plan

[QV-03-REQ-004](../03-governance-and-policy.md) requires listed transitions,
guards and authorized actors. The bounded accepted
[product T9 task](inventory-20261111/product.tasks.md) strengthens coverage of the
currently implemented server graph; it does not adopt the broader unresolved
governance graph. The new [lifecycle model test](../../packages/server/test/lifecycle-model.test.ts)
uses independently specified event-to-state edges and type-to-state permissions,
without reading the implementation's transition or admission tables to generate
expected outcomes.

- All **266 state/event pairs** and **494 state/type pairs** cover the 19 declared
  states, 14 lifecycle events and 26 entry types. Three seeded walks add **1,500
  event steps**, retaining state on refused events and starting a new modeled
  election after a terminal outcome.
- **50 distinct authenticated HTTP pairs across 15 reached phases** use real
  same-election record bodies that were successfully admitted during the full
  fixture. Fresh outer packets have independently checked signatures/body hashes,
  and the server must resolve the author before returning `409 WRONG_PHASE`.
  Every refusal preserves the checkpoint, board size/body bytes, base and public
  state, control counter and halt count.
- Exact `stalledMaxSec` equality remains TALLYING. The next second produces
  STALLED without any new log record or persisted state change. Two real trustee
  share submissions and a signed, verified tally remain accepted from STALLED and
  reach AUDIT.
- Four active terminal runtimes reject new packets while exact retries of their
  existing terminal record return the original signed promise without appending.

## Fixture and reachability

The dedicated [lifecycle fixture](../../packages/server/test/helpers/lifecycle-world.ts)
drives a real 2-of-3 ceremony with four registered voters, valid casts/spoil,
signed pause/resume, close, trustee shares and tally. It takes directory snapshots
only after a clean server stop and reopens each snapshot through normal replay;
it never assigns runtime states or bypasses append validation. A real witness
signature satisfies the opening gate. Holding back the close cosignature leaves
CLOSED observable; adding it admits the real aggregate and reaches TALLYING.

The HTTP matrix covers DRAFT, SETUP, CEREMONY, SETUP_KEYED, READY, OPEN, PAUSED,
CLOSED, TALLYING, STALLED, AUDIT, ARCHIVED, INVALIDATED, CANCELLED and ABORTED.
DRAFT samples use already registered voters because coordinator authority is not
available before the manifest. Terminal cancellation, abort and invalidation are
reached by genuinely authorized control records on restored live prefixes.

TALLIED and CHALLENGED have no incoming normal server transition in the current
implementation. DELETED and IMPORTED use storage/deletion or mirror read-only
paths, whose refusal classes differ from normal log phase admission. Those four
states receive pure graph/gate assertions; no invented HTTP `WRONG_PHASE` path is
claimed. Type admission is a preliminary gate; an allowed type still has its
record-specific validators and does not imply arbitrary bodies are accepted.

The ARCHIVED HTTP checks run in the active runtime that retains its genuine
in-memory signing keys. Reloaded archives whose keys were erased have the existing
`503 LOG_UNAVAILABLE` receipt contract and are covered separately. Terminal safety
here means no new append, while preserving permitted identical-packet retries.
The snapshot method is a fixture/replay technique, not simulated power-loss or
filesystem durability evidence. Witness use establishes these lifecycle gates;
the test makes no full-election verifier PASS claim.

## Validation

- Focused file: **3 passed, 0 failed, 0 skipped** on Node 24.22.3/Linux, **5.82 s**.
- Repository TypeScript, pinned vendor integrity (132 files), and diff whitespace
  checks: passed.
- No production defect was found; no production changes were needed.

T10's halt-limit and operator/under-quorum workflow is the next separate slice.
Close-time extension, CHALLENGED behavior and a second server ceremony remain
outside the accepted scope.
