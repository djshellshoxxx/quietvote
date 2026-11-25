# Independent organizer review — 2026-11-16

Scope: connected organizer console history checks, coordinator signature
accumulation, saved-packet restoration, stale work/key lifetime, and authenticated
append acknowledgments. This is a scoped implementation qualification, not
project completion, a browser result, or a change to existing release holds.

## Provenance

- Independent worktree: `qv-fresh-organizer-review`; branch:
  `codex/qv-fresh-organizer-review`.
- Baseline: `c46e71ad532f596276a7be969a4623daf3f426f8`.
- Retained reviewer tests from the earlier interrupted review:
  `packages/web/test/admin-review.test.ts` and `admin-review-ui.test.ts`.
  The original flow file SHA-256 was
  `bce803e7247a11c42c5c60b7b58b3fb24e69cbbe110207c95321bcf53b8d8b95`;
  the original UI file SHA-256 was
  `aae1c7a6a01c68ef93ed97f330a20d1110f1f227bbcf92c495bc036f3fc0bf33`.
- Reviewed production change:
  `1dd91148d5d30aff9001de8bb4067846367984c0`, imported by cherry-pick as
  `e7491d4` without changes. The complete committed trees matched before the
  review-only tests and this receipt were committed. No implementation-agent file
  was edited by this reviewer.
- Runtime: Node `v24.22.1`, Linux. All commands below ran in the independent
  worktree against local source. No remote writes occurred.

## Reproduction and final results

The baseline command was:

```sh
node --test --test-reporter=spec packages/web/test/admin-review.test.ts packages/web/test/admin-review-ui.test.ts
```

It completed with **0 pass, 10 fail, 0 skipped**. Eight flow tests demonstrated
actual acceptance of invalid state; the receipt test demonstrated premature
packet clearing after an unauthenticated acknowledgment; the restore test failed
because the restore UI action did not exist yet.

After the implementation change, the original ten cases and nine additional
independent cases passed. The combined final command was:

```sh
node --test --test-reporter=spec packages/web/test/admin-review.test.ts packages/web/test/admin-review-ui.test.ts packages/web/test/admin-review-multisig.test.ts packages/web/test/admin.test.ts packages/web/test/admin-ui.test.ts packages/web/e2e/organizer-http.test.ts
```

Result: **32 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**, 10.84 seconds.
This contains **19 independent tests**, 12 implementation-owned behavior tests,
and one actual-HTTP acceptance test. `npm run typecheck` and `git diff --check`
also passed.

The first run of the new 3-of-3 test had one test-harness failure: strict object
equality distinguished safe JSON parser null-prototype objects from ordinary
objects despite identical signature fields. The assertion was corrected to
compare canonical JCS bytes, which is the preservation property under review.
No production change was required, and the final combined run above passed.

| Area | Independent evidence |
| --- | --- |
| Ceremony evidence | Removing threshold key confirmations prevents both roll commitment and opening despite an authenticated final marker. |
| History integrity | Wrong opening references, duplicate opens, forged window markers, setup-only records with opening bindings, fixed-roll conflicts, and sequences above uint32 are rejected. |
| Signature accumulation | Three coordinators reach a 3-of-3 quorum while preserving canonical body and prior signature bytes. A two-signature packet remains below quorum and cannot be restored for sending. |
| Signature input rejection | Unknown, duplicate, forged, wrong-scope, and body-modified prior signatures are rejected without invoking the next signer. Valid inner signatures cannot bypass wrong outer origin, type, or author. |
| Stale signing | Invalidation during each inner/intermediate/final co-sign signing completion prevents a usable packet from being returned. |
| Quorum UI gate | Synthetic Submit cannot send a partial packet. Restoring a partial packet fails without unlocking and cannot bypass the send gate. |
| Key lifetime | Late co-sign unlock after invalidation locks its signer and exposes no packet. Validation failure also locks the signer and clears the passphrase. |
| Append authentication | Missing/malformed/forged acknowledgments, authenticated wrong-origin/wrong-leaf receipts, foreign log keys, and invalid inclusion proofs fail. Correct signed promises and valid inclusion receipts succeed. |
| Exact retry and reload | Failed acknowledgment retains precisely the sent header/body for explicit retry; saved packets restore without unlocking or byte changes; stale append completion does not display acceptance or discard retry bytes. |

The actual-HTTP test exercised all ten coordinator lifecycle stages through the
shipped organizer adapter, using three trustees, threshold two and three voters.
The final content verifier returned PASS with three counted ballots. Replaying a
restored opening packet after the election progressed returned its original
authenticated sequence receipt. Trustee/voter cryptography in that test comes
from the server test harness; it is not an all-executable client journey.

## Assessment and limits

No unresolved blocking finding remains within the reviewed organizer scope on
the source above. Retain these three independent test files when integrating the
implementation commit.

UI tests use a lightweight DOM test double. No Chromium browser run was performed
in this fresh review; local Chromium launch had previously been reported blocked
by `EPERM`. These tests and the actual-HTTP test do not establish production
browser qualification, accessibility conformance, responsive layout behavior,
or the final merged repository's full-suite result.

Saved coordinator packets are signature-checked and restored byte-for-byte;
restoration intentionally does not demand that a historical action is still the
next fresh action. Server admission and exact-packet idempotency resolve replay
after uncertain delivery. No automatic retry occurs.

Manifest-pinned content evidence does not establish board freshness or witness
qualification. Existing authority, privacy, registration and protocol-policy
holds are unchanged. Final integrated suites and hosted production browser
qualification remain with the integrating agent.
