# Independent replay/projection follow-up review — 2026-11-16

Reviewed `f190a6b` independently from its author, after completing operation-response recovery
`36ff4a7`. Integration equivalent: `7e00534`; reviewer execution equivalent: `923fca5`.

No blocking finding in this correction.

- Replay records each pending sequence's original `from` and `to` values without completing its
  intent. Final quarantine flags, election projection and control registry synchronization run before
  any pending intent is deleted. A failure or second process exit before those writes finish retains
  the durable reason for the next startup to reopen the runtime.
- After synchronization, each supplemental event and its intent deletion still share an election
  transaction. A second exit after that commit can no longer strand the projections. The explicit
  per-sequence transition and existing stored append timestamp preserve phase content and timing;
  completed or pruned history has no intent and remains excluded.
- `ControlDb.setState` now commits state, optional title and the applicable first lifecycle timestamp
  together. This prevents a crash after the state update from leaving a missing timestamp that a
  later state-equality shortcut would otherwise skip. Existing non-null timestamps remain unchanged.
- Archive signing-key erasure/read-only finalization still occurs before the archive intent can
  complete. This correction does not change admission, authorization or archive policy.

Independently executed on Linux / Node 24.22.1:

`node --max-old-space-size=512 --test --test-concurrency=1 packages/server/test/replay-completion-review.test.ts`

Result: **4 pass, 0 fail/skip**. Three cases use real child exits during append replay completion,
archive replay completion and the registry state-update transaction. The fourth loses completion
after registry synchronization commits, verifies two intents survive, then checks each recovered
phase's original sequence, transition, timestamp and restart deduplication.

This closes the separately recorded second-crash projection finding at the reviewed boundaries.
Whole-server integration qualification is being performed separately. This is AI source review and
automated process-exit evidence, not external security or physical power-loss acceptance.
