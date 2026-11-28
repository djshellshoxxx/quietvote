# Receipt standing for checked closed snapshots

Date: 2026-11-27 (America/Vancouver).

This increment completes the decision-free **closed snapshot portion** of web inventory task 5 / QV-10-REQ-010. Typed ballot codes, uploaded cast receipts and saved cast receipts now share one inclusion and qualified-status operation. It does **not** complete the entire receipt-standing feature or certify an election.

## Held boundaries

**Ordinary final-server exports still refuse qualified status.** Their authenticated `tally-aggregate` and `dec-shares` records currently produce `chk.encoding.canonical=fail`, even when the protocol's aggregate verdict is PASS and the supplied independent author key resolves their board headers. The new web status check preserves that failure. It does not discard these records, infer author authority from bundle metadata, or relax canonical encoding. A real HTTP server regression exercises manifest publication, ceremony, witnessed voting/close, trustee shares, a published tally, public code inclusion and this refusal. The existing [derived-record contract proposal](../rfcs/export-derived-record-contract.md) remains unadopted; see the final-server compatibility row in [unfinished work](../audits/UNFINISHED_WORK.md).

**Pre-close replacement status remains unverified.** The existing full verifier requires authenticated open and close markers before ballot analysis and does not qualify a snapshot without a checked tally. A current tree size or Infinity is never substituted for a close marker. Completing the earlier “Superseded while voting is open” UX needs an adopted prefix-evidence profile and corresponding copy. This implementation does not claim freshness, finality or ownership. Native assistive-technology, native translation and worker/CSP qualification gates remain separate.

## Source findings and plan

The typed-code inclusion path already checked exact entry header/body/code binding, the voter signature, Merkle inclusion and consistency with the saved head. It did not display replacement status. File and saved paths used a cached `BallotIndex` that did not verify ballot proofs, committed-roll membership or complete-board evidence. Their old copy said “Latest,” used “your,” and claimed a later ballot “counts instead.” The file status container also survived input invalidation and accumulated statuses.

The approved plan was to preserve inclusion, qualify status only through the established strict offline snapshot evidence profile, and give every input form the same operation lifecycle. A positive status must describe one externally anchored, exactly identified snapshot. Any missing prerequisite remains explicit; completing an unsupported protocol profile is not part of this UI change.

## Implemented behavior

An inclusion check remains available without a voting key, login, saved receipt, manifest hash or additional author key. If the user also supplies a full manifest hash obtained through a separate trusted channel, the client downloads one complete public snapshot. Optional independent author keys have the same meaning as in the existing web verifier; transported metadata cannot supply these inputs.

The client requires every established snapshot check to pass: manifest hash/signatures, trustee setup, append-only board/witnessing, ballot validity/latest-ballot processing, tally aggregate/decryption/result rules, spoil checks, canonical encoding and the voting window. Any failed check, fatal finding or alarm refuses status, even when the protocol's aggregate verdict is PASS. Candidate counted ballots populated before tally verification are never used early.

The downloaded snapshot must have the same origin, size and root as the authenticated inclusion head. Its exact final head needs witness quorum from the pinned manifest's anchors. Outcome-affecting controls without an adopted interpretation refuse status; the existing audit-close and security-notice exceptions retain the verifier's caveats. An advanced or stale download does not silently replace the inclusion snapshot.

Only after those gates does the classifier derive ballot codes from the checked envelopes. It follows a counted ballot's same-voter predecessor chain strictly backwards through non-ignored records. A different final code, unrelated later ballot, quota rejection or invalid proof is insufficient to claim replacement. Qualified copy describes either inclusion in the checked tally, replacement in this snapshot, or recorded-but-not-counted/not-proved-replaced status. It never calls a ballot globally “Latest.”

Typed, file and saved checks render one panel bound to the exact checked code. Editing any input, starting a different check, cancellation, navigation or pagehide invalidates the operation and its status. Saved rows show no automatic status from cached live records. The full verifier yields cooperatively during work. The existing successful inclusion check remains the only head-persistence path; delayed inclusion responses cannot start a pin write after invalidation.

A review also examined confirmed device clearing during a delayed lookup. The shipped receipt lookup view has no clear-device control; normal navigation to the key/vote clear controls already invokes the verification invalidator. `StorageSession.clear` additionally advances its storage generation synchronously before awaiting backing deletion, so earlier handles cannot reinstall data during that await. A retained detached control plus an artificially deferred injected clear method does not demonstrate a reachable shipped-flow race. No additional production guard was added for that suspicion.

The new download path bounds actual streamed UTF-8 bytes to 64 MiB, applies a deadline through the response body, supports cancellation, refuses malformed UTF-8 and performs no retry. Non-success response bodies are discarded without unbounded problem parsing. Parse/network/verification failures cannot contribute raw diagnostic text to the status message. Existing generic export methods retain their prior contract.

## Copy and locale policy

The new ordinary English copy uses “the same voter” and names the checked snapshot. It explicitly states that the record's freshness and the result's finality are not established. The 63 English guarantee entries are unchanged byte-for-byte from PR77. The five translated catalogs contain updated machine drafts with unchanged empty review maps; only English remains offered. There is no fabricated native review.

The root composition's first full web run found two voter-facing jargon violations in the new hint/mismatch messages and a stale generated `COPY.md`. The integration corrects those messages, gives the receipt input its own “Saved rules code” label with the exact 64-character alphabet, updates the unoffered draft catalogs, and regenerates the copy reference. The input still carries the full independent manifest hash and uses the unchanged verification gate. The corresponding UI text assertion and browser label selector follow the corrected copy; no guarantee string changes. That run also had an unexplained `i18n-lint.test.ts` file-process failure; the unchanged file passed all 28 tests separately. Both the failed run and later complete composition results remain in the audit record.

## Acceptance evidence

- Genuine signed manifests, committed rolls, encrypted/proved ballots, a multi-link revote chain, tally proofs, canonical board headers and independent witness cosignatures exercise positive classification.
- Negative cases cover missing/wrong external anchors, untrusted payload options/author keys, incomplete close/tally evidence, failed proofs and tallies, incomplete board binding, quota violations, exact-head mismatch, absent final witness quorum, every uninterpreted control, all failed required checks and fatal/alarm findings.
- Actual `startApp` tests exercise typed/file/saved parity, unchanged key storage, unknown codes, input invalidation, late results, cancellation and retry, route/pagehide invalidation, and hostile diagnostic text.
- The real final-server regression preserves successful public inclusion and explicitly refuses qualified status for the held derived-record contract.
- A required production-browser journey exercises no-login inclusion, short-code resolution, closed-snapshot replacement, uploaded receipt parity, counted status, unknown codes, open/no-tally refusal, exact-head witness refusal and cancellation/retry. It checks 320/768/1280px reflow, English-only selection, CSP/page errors and external requests. All 14 previously required journeys are preserved; this adds `receipt-standing` as the fifteenth.

The source-bound handoff receipt records final test counts, exact blobs and build measurements. The observed build is `f9f0e4a964a4`: 193529/204800 aggregate JavaScript gzip bytes, 56891 gzip /173400 raw entry bytes, and 202373/409600 bytes for the standalone verifier. These measurements do not establish native-browser or assistive-technology certification.
