# QuietVote continuation — KDF opening budget

Base: PR #48 (`bc32cb2752bb07d133deb408ee5a8ee69a731c8e`), which already
includes PR #47. Continue from `codex/quietvote-continue-20261116`; avoid
remerging the older consolidation branches.

Implemented the BT-14 caller budget for trustee opens and restore, with a
strict CLI compatibility override. See trustee NOTES for behavior, resource
limits and requirement linkage. Invalid crypto caps are rejected explicitly.
No protocol, wire, vectors, verifier comparison or registration contract changed.

Validation: typecheck and focused budget tests pass. The invalid-cap regression
was observed failing before the implementation (`E_PARSE` instead of `E_ARG`).
The synthetic forged logN=19 header now refuses before authentication; explicit
vault limits are exercised using cheap test-only KDF costs. Focused serial validation: 109 tests pass, zero failures or skips (all crypto
files, trustee CLI/unknown-option/custody/budget files). Dependency checks and
whitespace pass. Broad npm run check passed initial typecheck and 76 board tests,
then was interrupted while the CLI suite was pending; it is not an all-suite
pass. A redundant typecheck during overlapping runs was killed; the initial
standalone typecheck passed. No final-head hosted CI result is available.

Local implementation commit: e72ed14. The GitHub push was blocked by automatic
approval review because publication authorization was considered insufficient.
No continuation PR was created and no push workaround was attempted.

Still outstanding: shared bounded public archive preparation (the existing
strict archive verifier belongs to the server package), coordinator/voter
packet paths, B3-01 registration contract, organizer/coordinator authority,
strict TS/Python report disagreements, durable gossip health, backup/restore
acceptance and web recovery. Read the PR #48 handoff for exact prior evidence.
Main and release are unchanged. This checkpoint does not complete all features.


Continuation: the owner explicitly approved publication. Shell git push has no credentials; use the connected GitHub app. Final standalone typecheck passes; four KDF budget tests pass, including CLI accepted-budget and keygen-refusal coverage. Serial workspace validation is in progress.
