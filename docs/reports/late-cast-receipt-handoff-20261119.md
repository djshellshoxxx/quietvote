# Late CAST response and receipt handoff

## Exact source and observed defect

Production/test repair: `cde2db27a23b5bf37b7a23d45c8e53c476580a66`.
Source tree: `80a9f1fc06fe6aa17723f1471c8932fbf8248553`.
The distinguishing pre-repair source is
`efb0061d8ae01790b163bc5557c90a188fde2e30`.

A CAST response could finish after the voter navigated to another application
route. With receipt remembering off, the controller had no durable receipt write,
and the departed view no longer presented its download. A successful response
removed the public pending marker correctly, but returning to Vote did not offer
the returned signed receipt. An inclusion-alarm response had the same lost-download
symptom while correctly retaining its pending marker. These were result-handoff
defects; the distinguishing controls observed exactly one accepted CAST.

The independent reviewer reproduced both response classes in the explicit
page-session mode and the normal durable-mode application path. The latter uses
a healthy in-memory adapter in the actual-app test harness; this is not a native
IndexedDB execution claim. All four cases failed at the receipt-download assertion
on the pre-repair source. Their other controls established the expected pending
state, no second CAST POST and no receipt-store write with remembering disabled.

## Repair and retained boundaries

The application now holds an unseen public `CastReport` in a document-local map
when a completed CAST or nonretryable receipt-bearing alarm arrives after its
original view was left. This map does not hold a signer, selections, randomness,
or an additional default-mode retry envelope. Existing session retry controllers
retain their separate exact-byte retry contract.

The handoff uses the existing board/election/read-credential cache key. Before
display, it checks the manifest hash, stored key identity and current signer when
present. Another unresolved pending code takes precedence. Storage-generation
invalidation prevents a completion received after successful explicit clearing
from restoring the result. Successful session selection also clears this map.

If the voter has already returned to the same pending Vote view, completion
refreshes that view. Unrelated routes and other credential contexts are not
navigated. The result title, explanation, code and receipt download are presented
under the existing outcome and receipt-evidence policies, including the existing
fork/rollback exclusions. The map entry is consumed after presentation so that
later navigation can begin a new ballot. No new `DeviceStorage` receipt write is
performed when remembering is off.

This preserves a returned result within the current document. It does not promise
post-reload recovery, cross-tab synchronization, memory erasure, a safely retained
download, or conversion of a pending receipt into an inclusion proof.

## Validation and independent receipt

The four original independent test bodies are preserved in
`packages/web/test/session-storage-ui.test.ts`. Their source bytes were compared
with the reviewer's saved pre-repair probes before independent re-execution.
Two additional author controls cover returning while the response is still
pending, actual download and subsequent ballot availability, plus clearing before
the late response arrives.

| Check | Observed result and limit |
| --- | --- |
| Four independent pre-repair late-response cases | Four distinguishing assertion failures; the other delivery, pending-state and receipt-opt-out controls passed. |
| Author session UI plus cast-alarm delivery batch | 18/18 passed, no failures/skips/cancellations, 30.430 seconds on the repair source. |
| Author strict web source/tests and the two changed browser journeys | Passed at a 384 MiB heap cap, with no diagnostics. |
| Independent unchanged response cases | All four passed on the exact repair source. |
| Independent response cases plus organizer visibility-return control | 5/5 passed, no skips/cancellations, 15.895 seconds; the visibility case qualifies the adjacent session-signing boundary. |
| Independent final integration batch | 116/116 passed across 23 files, no skips/cancellations, 66.203 seconds; includes these durable receipt tests. |

These batches overlap and must not be added as a unique-test count. The independent
reviewer also repeated both production CLI builds, checked all 16 files for byte
identity and verified the asset hashes, SRI and unchanged budgets. The complete
source-bound evidence and limits are in
[INDEPENDENT_SESSION_BUILD_FOLLOWUP](../audits/INDEPENDENT_SESSION_BUILD_FOLLOWUP.md).

Raw task evidence includes `session-review-cast-navigation-both-before.log`,
`session-review-cast-alarm-navigation-before.log`,
`receipt-handoff-root-tests.log`, `receipt-handoff-web-tsc.log` and the independent
final receipt. No local Chromium retry was attempted after the established
pre-assertion launch failure. Hosted native browser qualification is still a
separate gate, and later unrelated private-file changes are not qualified by
these web executions.
