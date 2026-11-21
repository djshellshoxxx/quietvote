# Interim verification results: quietvote

Backup of the independent verification pass as of 2026-10-29 03:15 UTC. The pass stopped twice on a usage limit and is being resumed; the consolidated report supersedes this file.

Findings extracted: 72; batch-verified: 52; findings with extra lens results: 0.

| ID | Auditor severity | Verifier verdict | Verifier severity | Extra checks | Summary |
|---|---|---|---|---|---|
| B2-01 | High | confirmed | High | - | Anonymous GET /elections/{id}/tally/draft synchronously recomputes the full homomorphic aggregate (and after restart/eviction the full proof-verifying ballot an |
| B2-02 | Medium | confirmed | Medium | - | POST /imports runs full verifyElection on the event loop and checks ELECTION_EXISTS only after full verification, so a valid bundle can be resubmitted repeatedl |
| B2-03 | Medium | confirmed | Medium | - | instance_admin keys, once seeded, can never be revoked; removing them from adminKeys leaves them active and no API revokes them. |
| B2-04 | Medium | confirmed | Medium | - | The server evaluates witness quorum with operator config witnesses and ignores manifest bb.witnesses. |
| B2-05 | Medium | confirmed | Medium | - | m-of-k control records (pause/resume/security-notice) have no freshness binding, so a single earlier signer can replay an old record. |
| B2-06 | Medium | confirmed | Medium | - | election_close is accepted at any time in OPEN/PAUSED with no time check against voting_close. |
| B2-07 | Medium | confirmed | Medium | - | Restoring an older election DB is not detected and the server signs a second, different root for a size it already signed. |
| B2-08 | Medium | confirmed | Low | - | backup --to stores a relative path verbatim and destroy resolves it against the current cwd, missing the real backup and shredding an unrelated file. |
| B2-09 | Low | confirmed | Low | - | Invite cap compares registered voters rather than invites, so invites are effectively unbounded. |
| B2-10 | Low | confirmed | Low | - | Invites without expires_at never expire, unknown vs used codes answer differently, and a used code with another registered key answers 201. |
| B2-11 | Low | confirmed | Low | - | P2 invite data (labels, contacts) is never purged except a registered invite's contact; no retention job exists. |
| B2-12 | Low | confirmed | Low | - | IMPORTED mirrors and keyless ARCHIVED runtimes sign duplicate-submission receipts with an all-zero-seed placeholder key. |
| B2-13 | Low | confirmed | Low | - | Anonymous GET /roll lists voters in enrolment order (ORDER BY rowid), defeating hour-rounding of registered_at. |
| B2-14 | Low | confirmed | Low | - | Junk cosignature lines get 200 with empty accepted/rejected and still bump the export generation, invalidating the .qvb cache. |
| B2-15 | Medium | confirmed | Low | - | In-tree audit index lists SRV-001 as fixed and CP-01/TR-01 and trustees-mode spoil endpoint as closed though fixes are not in this SHA; NOTES contain stale and  |
| B2-16 | Low | confirmed | Low | - | Request logs use second timestamps and fields outside the QV-31 allowlist, undoing minute rounding of ballot append events; control records carry free-text reas |
| B2-17 | Low | confirmed | Low | - | GET /export.json re-parses and re-serialises the whole log on every request including 304 and Range requests. |
| KNOWN TR-07/TR-08 | Low | confirmed | Low | - | Public debugPlaintext() remains and shred follows symlinks (compounds B2-08); report says unchanged and names no fix branch. |
| B1-01 | Medium | confirmed | Medium | - | A spoil beyond max_spoils_per_voter or outside the voting window is dropped before entering the spoiled set, so the same code cast later is counted without E_SP |
| B1-02 | Medium | confirmed | Low | - | verifier-py makes non-ballot record anomalies (control entries, unknown types, bad-signature markers preceding valid ones, binding fields on non-open markers, r |
| B1-03 | Low | confirmed | Low | - | verifier-py raises an uncaught QVError for an approval contest without winners and would KeyError on a yes-no contest without rule, which its manifest validatio |
| B1-04 | Medium | confirmed | Low | - | verifier-py does not enforce lower-case fixed-width hex or integer types in records outside ballot envelopes and manifest (bytes.fromhex accepts upper case/whit |
| B1-05 | Low | confirmed | Low | - | Bidi-control rejection sets differ: Python also rejects U+061C which TS accepts, and TS skips trustee/witness names (KNOWN P6). |
| B1-06 | Medium | confirmed | Medium | - | qv-verify without --manifest-hash compares the manifest with the bundle's own manifest_hash, reports V1 PASS and exits 0 with no caveat and without printing the |
| B1-07 | Medium | confirmed | Medium | - | Open spec questions recorded in errata now produce verdict-level disagreement between the TS and Python verifiers on honest elections. |
| B1-08 | Low | confirmed | Low | - | verifier-py manifest validation accepts manifests the reference rejects (time ordering, impossible dates, yes-no without rule, small-order/non-canonical keys, w |
| B1-09 | Info | pending |  | - | COMPLETION C3 says verifier-py does not reject binding fields on non-open markers, but it rejects them fatally; the real gap is the class mismatch. |
| B1-10 | Info | pending |  | - | T-028 'Exponential ElGamal encrypt/decrypt-to-point, rerandomize' is marked Done but no rerandomize function exists. |
| B1-11 | Low | pending |  | - | Negative corpus does not cover every Appendix C check and Ed25519/DKG edge cases, and a mutation sweep leaves 3 real survivors (Ed25519 small-order R, late DKG  |
| B1-12 | Info | pending |  | - | The test claiming decryption nonces never repeat with a failed RNG varies only oid; with same (ctx,cid,oid) and different aggregate the nonce repeats and s_j is |
| B1-13 | Low | confirmed | Low | - | The manifest record envelope {body, sigs} and its signature objects are not checked against a closed schema, so unknown members pass in TS while verifier-py FAI |
| B1-14 | Low | confirmed | Low | - | verifier-py neither requires the dkg-open marker nor checks DKG marker order, passing a bundle the reference (and its own canary) rejects. |
| CP-01 (verifier-py residual) | Medium | confirmed | Medium | - | Counted ballot re-wrapped under another supersedes with published reveal passes; the verifier-py side has no fix on any branch. |
| CP-04 (verifier-py residual) | Medium | confirmed | Medium | - | Even after PR #10's TS fix, verifier-py still accepts mixed-order public keys and 1/8 of signatures, so acceptance sets differ. |
| TSV-04 | Info | confirmed | Info | - | A throwing board layer only sets boardSkipped; PASS stays reachable. |
| TSV-06 | Info | confirmed | Info | - | Canary self-test never compares expect.verdict. |
| PY-01 | Info | confirmed | Info | - | verifier-py has no trustee-mode spoils; manifests with spoil_trustee_decrypt are rejected. |
| PY-02 | Info | confirmed | Info | - | verifier-py verdict is PASS/FAIL only. |
| WV-9 | Info | confirmed | Info | - | Test-vector corpus is unsigned. |
| N-13, N-24, N-25, N-27 | Info | confirmed | Info | - | Tracked TODO gaps still present: V13 not run, no vendoring, no secret types/constant-time discipline beyond noble, no rule basis roll. |
| B3-01 | High | confirmed | High | - | The web registration request (PoP layout and hashed invite_code) is refused by the reference server, and no test could notice. |
| B3-02 | High | confirmed | Medium | - | The Results page shows a coordinator-signed tally without verifying it, though the protocol verifier FAILs the same log. |
| B3-03 | Medium | confirmed | Low | - | verifier.html does not run when served with the build's own _headers or the reference server's static CSP, because the header CSP blocks its hashed inline scrip |
| B3-04 | Medium | confirmed | Low | - | SRI covers only the entry module and CSS; statically imported chunks execute without integrity, so claims C-12 and T-189 "SRI yes" are overstated. |
| B3-05 | Medium | confirmed | Medium | - | A revote built from the cached log is rejected with E_SUPERSEDES and the screen tells the voter a newer ballot is recorded, the opposite of what happened. |
| B3-06 | Medium | confirmed | Medium | - | Late/paused/refused ballot screens fall back to 'Something went wrong' (missing message args), show receipt-proof text for unrecorded ballots, report PAUSED as  |
| B3-07 | Medium | confirmed | Medium | - | The 'Test this ballot' result never shows what the device sealed yet asks 'Do these match what you picked?'. |
| B3-08 | Medium | confirmed | Medium | - | 'Clear this device' deletes the only copy of the key in one click with no confirmation. |
| B3-09 | Medium | confirmed | Medium | - | Key backup is offered only once at creation and the displayed recovery code cannot be imported (restoreFromRecovery has no caller). |
| B3-10 | Medium | confirmed | Medium | - | 'Your key is registered.' is shown with no invitation and for HTTP 409 INVITE_USED. |
| B3-11 | Medium | confirmed | Medium | - | Auto-lock is announced only in a live region, leaves Seal/Send offered (sealing with a zeroed hedge key, send failing generically), the hidden>2min rule cannot  |
| B3-12 | Medium | confirmed | Low | - | If IndexedDB cannot be opened, every election page including rules and results shows 'Something went wrong'. |
| B3-13 | Medium | confirmed | Low | - | A 'sequenced' answer's signed promise is not stored or re-checkable, and a 5xx after a recorded ballot reads 'has not been sent'. |
| B3-14 | Medium | confirmed | Medium | - | In one-ballot elections the UI promises revoting, and the REVOTE_LIMIT refusal is forced retryable, retried 4 times and reported as E-API-RATE. |
| B3-15 | Low | confirmed | Low | - | Cast and Test buttons differ in fill, size and weight, contrary to the equal-prominence requirement. |
| B3-16 | Low | confirmed | Low | - | Verifier headline says 'All checks passed' under an Election-ID mismatch and with 3 of 14 checks not run. |
| B3-17 | Low | pending |  | - | route() has no staleness guard, so a slow earlier view overwrites a later navigation. |
| B3-18 | Low | pending |  | - | Pages have 2-3 live regions and the assertive anti-phishing announcement is truncated at 140 chars mid-word. |
| B3-19 | Low | pending |  | - | Unlock field uses autocomplete=new-password and a non-key file is reported as 'This browser won't store your key'. |
| B3-20 | Low | pending |  | - | The transparent re-wrap predicate is inverted so fast devices never re-wrap a floor-parameter key. |
| B3-21 | Low | pending |  | - | Header link 'Privacy and limits' goes to /e, which renders 'not found'. |
| B3-22 | Low | pending |  | - | Prototype-named ids (constructor, __proto__) from a manifest or tally crash the vote/results view. |
| B3-23 | Low | pending |  | - | Organizer 'Invitation links' list shows bare codes with no link or copy button, and selection yields garbled text. |
| B3-24 | Low | pending |  | - | 'Election ID confirmed' is stored per URL/API id, not per Election ID hash. |
| B3-25 | Low | pending |  | - | Word passphrases are canonicalised by the web client but not by the CLI, so a typed-back passphrase unlocks in only one. |
| B3-26 | Low | pending |  | - | The offline verifier runs on the main thread with no Worker pool, progress or resumability. |
| B3-27 | Low | pending |  | - | Library code and catalog copy exist with unit tests but no UI call site (11 symbols, 115 of 487 messages, 8 UX codes never produced). |
| B3-28 | Info | pending |  | - | A crafted key file within the accepted KDF ceiling costs ~9-30 s per unlock attempt. |
| B3-29 | Info | pending |  | - | SPA /verify reads the chosen file with no size bound, unlike the standalone page and verifier loader. |
| B3-30 | Info | pending |  | - | Browser checks (CSP/TT, a11y, key flow) are not run by CI and no E2E loads verifier.html. |
| B3-31 | Info | pending |  | - | The receipt screen prints the browser's current time as 'Logged' instead of the log's sequenced_at. |
| B3-32 | Info | pending |  | - | axe-core 4.13 reports region (moderate) on every page and aria-allowed-role (minor) on chart figure role=group. |
