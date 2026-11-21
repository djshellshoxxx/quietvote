# QuietVote PR #71 — seven-day E2E clock jump / idle-lock handoff

Date: 2026-11-20 UTC. Starting implementation head: `8f865fb3cf9c5d203e532abb19848cd46050db9a`, complete tree `5da32edc203087e96a81e1f0b6ae311758b19fa2`. This report covers a scoped browser-test correction, **not** a change to production crypto, CSP, session-lock policy or server admission.

## Current-source observed failure

The mandatory production browser job [136096515552](https://github.com/djshellshoxxx/quietvote/actions/runs/44678662762/job/136096515552) failed on source `8f865fb3cf9c5d203e532abb19848cd46050db9a` after the unchanged 30-second wait for **“You are on the voter list.”** Diagnostics: `registeredMessage=false`, `onRollMessage=false`, `errorCount=1`, `unlockButtons=1` and **zero /roll responses**. Earlier production browser suites in that job passed (basic app, help, accessibility, verifier, spoils, server, registration and device settings). This is a current-head failure, not inferred from older runs.

The preceding form-detachment assertion did **not** fail; that prior synchronization alone did not repair this symptom.

## Source-bound functional diagnosis

In `packages/server/test/helpers/world.ts`, `T_SETUP` is 2026-10-25 10:00 UTC and `T_VOTING` is 2026-11-01 10:00 UTC. The E2E imports and unlocks the voter key during setup, leaving a signer in `packages/web/src/ui/app.ts`'s signer map. Later `page.clock.setSystemTime(w.clock)` jumps seven days. Playwright documents that this clock operation **does not fire timers**. The app's `LockTimer` correctly treats that signer as expired, but the next `pointerdown` can be the *Unlock key* click, after `page.fill(passphrase)` has completed. Its document-level handler calls `lockAll()`, whose active `keyLock()` clears the same form's passphrase. The unlock handler then sees a cleared passphrase, producing an error without issuing a /roll request.

This causal explanation fits the job's recorded state and is supported by exact source paths. It remains **a source-supported diagnosis**, pending a complete hosted browser pass. A separate standalone two-assertion Node model of `LockTimer` confirmed that the seven-day jump passes the 10-minute expiration threshold and that a subsequent activity touch refreshes the deadline; that is **not** a repository test or native browser run.

## Change and security boundary

The existing production journey now performs a genuine `page.keyboard.press('Tab')` **after** the clock jump but **before** filling the fresh password. It asserts the existing visible production message `Your key is locked.`. Only then does it execute the previously added old-input detachment wait, re-enter the password and run the original voter-list, cast, SSE, credential-origin, receipt and organizer assertions. This tests the required auto-lock rather than disabling it, extending the test deadline, bypassing KDF, replaying a mutation or weakening credential/CSP checks.

- **Code-audit scope (source-only):** inspected `LockTimer`, `app.ts`'s `lockAll` / document keydown and pointerdown handlers, `keyView` unlock and the E2E's clock shift. The new input event reaches the same production listener that otherwise runs at the Unlock click.
- **Ordinary functional bug scope:** reviewed the exact hosted failure, the old/new key form, and the `/roll` request absence. Distinguishes an elapsed-time-induced unlock error from the earlier same-document form-race hypothesis. No fresh browser result exists yet.
- **Defensive security scope (source-only):** verified the lock remains mandatory, no private key or passphrase is printed or copied to test diagnostics, no read-key/fragment is logged, no CSP/Trusted Types changes, no timeouts increased and no credential-bearing replay is introduced.

These are **three review scopes in one execution**, not three independently commissioned fresh agents. An appointed security reviewer's formal approval is still outstanding.

## Next fresh-worker handoff

1. Fetch current PR #71 head and tree afresh. Inspect its new job results; prioritize the mandatory split-origin browser path and the previously queued macOS Node 24 trustee/crypto job `136096515808`. Do not attribute pending or cancelled checks as passes.
2. If the new browser test still fails, identify its exact failed assertion before touching application code. If the **lock announcement** is missing, inspect `hasUnlockedKeys`, `timer.shouldLock`, `page.clock.setSystemTime` and the previous page's signer lifetime; do not synthesize a success. If membership still fails, use finite view and /roll statuses to scope the failure, without dumping secrets.
3. Run independent fresh source review plus actual supported execution, focusing on the lock/active-form boundary and same-document transitions. The local managed container cannot clone GitHub because DNS for `github.com` is unavailable; it did not run the new repository E2E.
4. Keep the existing unresolved ACL namespace, worker integrity, governance, group membership, challenge/finality, authenticated freshness, DCO provenance and designated formal sensitive-change approvals open. Do not reimplement completed organization enrollment or recorded exports; do not inspect the previously stopped background-runtime/gossip investigation.

No main merge, deployment, release, force-push, branch deletion, historical DCO attestation, or production policy weakening is part of this checkpoint.
