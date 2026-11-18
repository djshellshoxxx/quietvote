# Combined executable election acceptance — 2026-11-16

## Scope and source

Continuation of PR #51 (`5566c88c5e42d57fc1e50e2539d91aba16f2a30f`).
This milestone combines the previously separate coordinator/voter and trustee
journeys into one election using actual `qv-server`, `qv`, `qv-trustee` and
Python verifier processes. It depends on the lifecycle drafting implementation
`9413026` (locally cherry-picked as `4d21648`). The acceptance implementation is
`965dbd4`, with real-clock scheduling correction `f82a779`. Integrate the CLI implementation and the acceptance commit once each.
The dependency cherry-pick is not another acceptance change.

New test: `packages/cli/test/all-clients-executable.test.ts`.

## Exercised behavior

- Start the actual server executable from its public configuration format and
  require HTTP readiness. Use the real wall clock throughout; no injected clock
  or modified deadline/admission policy.
- Generate encrypted organizer/coordinator/voter key files using the shipped
  `qv keygen` and default Argon2id settings. Generate independent trustee vaults
  with actual trustee keygen and its default KDF; the parent receives only their
  public identities.
- Create the election through the signed `qv online election-create` command,
  publish the coordinator-quorum-signed manifest through `sign-record`,
  `export-entry` and `online election-submit`.
- Use `election draft-record` for all six DKG lifecycle markers, the roll
  commitment, opening and closing. Sign each using the existing coordinator
  threshold, frame the signed record and relay through the actual client.
- Each trustee process imports archives through `election prepare`, commits,
  reveals, exchanges encrypted shares, verifies, finalizes and compares matching
  fingerprints. No `World.ceremony`, private trustee extraction, synthetic
  decryption shares or harness-generated DKG/protocol packets.
- Encrypt and submit all three ballots using the shipped voter commands. Wait
  for the immutable ten-minute voting deadline in cancellable intervals of at
  most ten seconds; close and prepare authenticated release inputs.
- Two trustees release and relay their shares; the third remains in `STANDBY`.
  Fetch and sign the tally proposal. Check exact counts independently of either
  verifier: yes 2, no 1; ann 3, bob 0, cy 0.
- Require TypeScript `PASS`, counts 3 cast / 0 spoiled / 3 counted, and Python's
  independently executed shared-report comparison to pass. Then require graceful
  server shutdown. Command output is checked for fixture seeds and passphrases.

## Fixture and qualification boundaries

Organization enrollment and raw-invite voter registration remain fixture HTTP
calls because the current registration contract is explicitly held under
B3-01/D-99. The fixture supplies unsigned manifest choices and public identities;
that is not a claim that browser registration or an organizer manifest wizard
is complete. The organizer is also a coordinator, preserving the existing
trustee archive-author rule; separate-organizer support is not asserted.

The public fixture uses witness quorum zero. Independent witnesses, freshness,
real-world custody, native operating-system trials and external protocol review
remain separate gates. The Python comparison covers its existing shared
capabilities only; it does not confer board/witness equivalence.

This is executable/HTTP acceptance. Local Chromium launch is host-blocked
(`process_singleton_posix` socket `EPERM`, confirmed by the integrator), so no
browser/assistive-technology qualification is claimed here. Browser coverage
must be established on the integrated exact candidate by hosted CI.

## Validation

- Baseline reproduction: the new test reaches actual server startup, key
  provisioning, manifest publication and trustee joins, then fails on the absent
  `election draft-record` command (exit 2). This is the expected implementation
  gap; 1 failing test, 0 skipped, approximately 35.8 seconds.
- Root typecheck passes before and after integrating the CLI draft implementation
  (`NODE_OPTIONS=--max-old-space-size=512 npm run typecheck`).
- First integrated attempt on `4d21648` failed after approximately 525 seconds:
  production KDF work under host load exceeded the original six-minute voting
  window; ballot submission correctly returned HTTP 409 `WRONG_PHASE`. The
  correction sets a ten-minute fixture window and avoids redundant trustee
  reimports after final/roll; imports still occur at open and close. No server
  policy, clock or assertion was weakened.
- The first corrected run on `f82a779` was interrupted without a final process
  receipt. The last observed phase was r3-close/trustee finalization (about 527
  seconds), with no voter ballots yet. Its disappeared process handle and empty
  final log do not establish a pass or a product failure.
- The single retry on `f82a77955b15f753ef59b58236c06983e2c66458` **passed**:
  exit 0, 1 test passed, 0 failed/cancelled/skipped, 693.698 seconds wall time.
  This includes every assertion above: actual executable lifecycle, exact tally,
  TypeScript PASS, independent Python shared-report agreement and graceful
  shutdown. The corrected-source typecheck also returned exit 0.
- [Machine-readable receipt](../reports/teams-acceptance-20261116-validation.json)
  and [terminal test log](../reports/teams-acceptance-20261116.txt) preserve the
  exact source/tree, runtime versions, results, superseded attempts and limits.
  This is lane validation, not qualification of later server/UI integration.
  No further local rerun was started.

Run the combined acceptance explicitly when qualifying an integration:

```sh
node --test --test-concurrency=1 packages/cli/test/all-clients-executable.test.ts
```

The test is also discovered by the normal CLI workspace test glob. Its explicit
20-minute test timeout includes default KDF work and the real ten-minute window.
No existing assertion or gate is removed, relaxed or skipped.

## Fresh-agent continuation

1. Integrate the CLI dependency and acceptance commits, preserving the held
   registration and authority contracts.
2. Review source and result provenance, then run on the exact integrated source
   if any participating server, CLI or trustee behavior changes. In particular,
   later recovery/server and UI integration is not covered by this lane snapshot;
   the root integrator/fresh qualification agent owns that final-candidate run.
3. Complete hosted browser qualification separately; preserve the existing
   three detailed TS/Python comparison disagreements and other held policies.
4. Do not mark the overall project complete from this one combined election.
