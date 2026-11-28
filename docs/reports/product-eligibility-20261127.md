# Product T3: seeded HTTP eligibility coverage

Date: 2026-11-27 (America/Vancouver). Based on PR #75,
`5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7`. Test-only; no server admission,
schema, crypto, protocol encoding or verdict behavior changes.

## Implemented acceptance

The new [eligibility property test](../../packages/server/test/eligibility-property.test.ts)
creates three real 2-of-3 trustee elections with four registered voters. Each seed
uses seven initial admitted casts, 32 shuffled operations and four voting-close
or post-close refusals: 129 ballot HTTP requests across the corpus. The shuffled
mix contains eight candidate casts and four of each refusal category: non-roll
author, wrong election context, stale predecessor, same-author copied code,
other-author copied code and exhausted cast quota. Candidate casts also consult
the independent model's remaining quota before submission.

The model owns each voter's latest accepted code, cast count, final selections,
and first/latest receipt sequence. It does not read `World.last`, runtime
`st.last`/`st.casts`, or `analyzeBallotLog` to choose expected admission or
predecessors. The test requires the predicted status before advancing its model.
Every refusal preserves the full checkpoint note, tree size/root, every public
voter index and the stored board-body byte count. Every acceptance appends exactly
one leaf and its signed promise/inclusion receipt is verified against the
fixture-owned log key and submitted header hash.

After the real signed close, trustee shares and signed tally, the offline analyzer
and protocol report must have exactly the model's counted code set. Every option's
decrypted total must equal the sum of the model's final selections. The full board
also passes independent signature and append-only verification under the fixture's
known public keys.

## Source-backed qualifications

| Point | Implemented assertion and existing source |
|---|---|
| Admission ordering | `vBallot` in [election.ts](../../packages/server/src/election.ts) checks eligibility, context, predecessor and quota in that order. Cases use fresh packets and isolated causes; test time advances beyond the minimum submission interval. |
| Duplicate code | [ballotCode](../../packages/protocol/src/ballot.ts) hashes the entire canonical body, including `voter` and `supersedes`. A literal copied body under another eligible outer author fails `E_VOTER_NOT_ELIGIBLE`; a fresh-nonce copy by the original author fails `E_SUPERSEDES`. The deeper cross-voter `E_DUP_CODE` branch would need a hash collision or corrupted internal state and is not artificially forced. |
| Independent tally oracle | Final expected heads and selections come only from modeled admitted actions. The production analyzer and verifier are results under test, not the expected-state generator. |
| Fixture log binding | Like the existing [HTTP e2e](../../packages/server/test/e2e.test.ts), the fixture sets the manifest log ID to SHA-256 of the actual origin and uses coordinator 0 as the manifest header author. This removes generic helper defaults that are unsuitable for positive protocol log verification. |
| Verification scope | Standard `verifyElection` is explicitly expected to return `INCOMPLETE`, with witness checking `not_run`. Manifest, trustee keys, append-only, ballot validity/latest, tally aggregate/decryption and result-rule checks must pass. No `allowNoLog` or content-only bypass is used. The test makes no full-evidence PASS, freshness or finality claim; existing derived-record encoding coverage remains separate. |

The older product inventory's literal `verifyElection PASS` wording is therefore
qualified by current evidence requirements rather than obtained by weakening a
gate. Real quorum-zero fixtures cannot establish witnessed verification.

## Validation

- New focused file: **3 passed, 0 failed, 0 skipped** on Node 24.22.3/Linux;
  38.52 seconds for the completed run.
- Repository TypeScript check: passed.
- Pinned vendor integrity and diff whitespace checks: passed.
- No production defect appeared in the bounded corpus; no production edits were
  needed. The first run's final verification failures were the generic fixture's
  unbound log ID and non-coordinator manifest header, corrected within this test
  using the existing e2e setup pattern.

The accepted [product task inventory](inventory-20261111/product.tasks.md) retains
T7/T8/T9/T10; the separate restart/replay handoff also records their scope
qualifications. T7 privacy markers is independently owned by the other test
workstream; this change does not duplicate it.
