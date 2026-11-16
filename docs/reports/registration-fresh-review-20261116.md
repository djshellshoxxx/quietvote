# Independent registration implementation review — 2026-11-16

Reviewed author implementation `be730e9` in an isolated worktree (local alias
`5447aa7`, identical source tree). The review covers the accepted ADR-028
election-enrollment wire contract and ADR-027/B2-10 expiry/error policy, including
the explicit modern/legacy database boundary. It does not qualify a release or
the separate D99 pinned-membership contract.

## Findings incorporated before the freeze

Source review identified three client-boundary improvements, implemented by the
author before the frozen commit:

- Both browser and CLI now require a successful response to name the submitted
  key's exact voter ID and a recognized `pending`/`approved` status. They expose
  only those public fields. A malformed response after a POST is an uncertain
  outcome, not proof that no enrollment happened.
- Both clients reject mismatched election IDs, inconsistent derived log origins
  and absent/unknown/legacy scheme metadata before sending modern credentials.
  CLI performs this check before reading the invitation or private-key files.
- The new CLI invitation-file input is bounded, checks a regular file after
  nonblocking opening, uses no-follow where supported and decodes UTF-8 strictly.
  The final tests exercise directories, oversized files and invalid UTF-8, plus
  POSIX symlinks and FIFOs. Native Windows filesystem behavior remains a separate
  platform qualification; the POSIX cases are not claimed as Windows evidence.

No production file was changed by this reviewer. The author implemented these
repairs, and the reviewer retained independently written probes rather than
reusing the shared registration encoder or the author's assertions.

## Executed evidence

`node --test --test-concurrency=1 packages/server/test/registration-review.test.ts`
passed **8 tests, 0 failures/cancellations/skips**, in 4.07 seconds:

1. A stolen stored verifier, even with a valid proof under the attacker's key,
   cannot redeem the invitation. Independently computed native SHA-256 confirms
   the at-rest domain. The real credential succeeds, and restart preserves the
   modern scheme and the existing-voter retry response.
2. Public-key and signature encodings with nonzero unused pad bits decode to the
   same bytes but are rejected without consuming the invitation.
3. Valid Ed25519 signatures over altered domain/separator, encoded-hash-text or
   swapped-field preimages are rejected. The independent exact 107-byte preimage
   succeeds.
4. An actual schema-8 reconstruction with a legacy hash and `expires_at=NULL`
   survives schema-9 migration unchanged and redeems under the original contract
   after twenty days. New default expiry does not silently rewrite old rows.
5. Contradictory browser metadata causes zero registration POSTs.
6. Browser success for another voter, an invalid status or malformed result is
   refused; unknown response fields are not exposed as the enrollment result.
7. The CLI adapter against a real local HTTP responder rejects a forged success
   and excludes an extra server-supplied secret canary from successful output.
8. The actual shipped CLI process rejects invalid/nonregular invitation files
   without reading the private key or blocking on a FIFO writer. No voter is
   registered by these failures.

Root TypeScript checking and `git diff --check` pass. The initial typecheck found
an inferred string type in the new test helper; the helper's algorithm literal
was annotated without changing runtime behavior. This receipt supplements the
author's [implementation report](registration-implementation-20261116.md) and
[milestone handoff](../handoffs/QUIETVOTE-REGISTRATION-20261116.md); it is not a
substitute for their broader integration runs.

## Remaining boundaries and integration

No further blocker was found in the reviewed modern, unpinned enrollment scope.
Persisted scheme selection has one path per election, old rows default to the
legacy scheme, draft input cannot change it, and the private restore floor checks
scheme preservation. The review also inspected atomic invitation consumption,
revoked/expired handling, post-roll refusal, redacted operation receipts and the
authenticated read-only migration preview.

The server still deliberately stores no invitation-to-voter relation. A used
invitation plus an already registered key can return that key's status; response
identity binding does not establish the historical redemption pair. D99 lacks an
authoritative pinned-member list/proof input. Complete group-scoped membership,
labels, rotation/revocation and destructive legacy cutover are not implemented by
this endpoint. These limits are documented rather than counted as passing cases.

The browser journey is required by CI but was not run locally because Chromium
launch is host-blocked. The integrator must record the hosted result and qualify
the combined key-policy/organizer/registration source. Independent external
security/protocol and human/platform release gates remain separate.
