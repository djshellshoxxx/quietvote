# Candidate: server export and full protocol verification compatibility

Date: 2026-11-27. Source baseline: `5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7`
(draft PR #75). This report accompanies the optional CLI export-verification adapter.
It does not adopt a new protocol record or author-trust rule.

## Finding

An ordinary server tally export carries board-only `tally-aggregate` and `dec-shares`
records. The existing full verifier can report `PASS` while its subordinate
`chk.encoding.canonical` check fails with local `E_VERSION` findings for those
records. The export adapter and offline ballot-status gate correctly refuse a
successful claim. Independently pinning the supplemental JSON author resolves
header binding; it does not resolve the record-reader mismatch.

The optional adapter therefore supports complete, protocol-compatible signed
snapshots and reports the existing limitation for ordinary server tally exports.
The ordinary server-to-independent-verifier workflow remains incomplete.

## Source evidence

All links below are bound to the baseline commit, rather than a changing branch.

- [Protocol notes](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/NOTES.md#L217)
  explicitly describe the absence of a QV-16 `tally-aggregate` body and deliberately
  retain the server's record as board-level derived data pending a specification.
- [Server record schemas](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/records.ts)
  define `AggregateBody`/`aggregateSchema` and `DecSharesBody`/`decSharesSchema`.
  [Server tally publication](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/election.ts#L1328)
  creates the aggregate automatically after the witnessed close.
- [Export selection](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/export.ts)
  filters these records from default content JSON. The
  [existing `board=1` route](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/app.ts#L1019)
  includes all public bodies so a full board can be bound.
- [Archive preparation](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/cli/src/cmd-prepare.ts)
  similarly reconstructs the complete content log from authenticated board bodies.
  [Log binding](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/logcheck.ts#L291)
  refuses a board entry omitted from the protocol view. Filtering those entries
  again would defeat this required completeness check.
- The [protocol reader's default branch](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/verify.ts#L434)
  emits local `E_VERSION` and sets `chk.encoding.canonical` to `fail` for unknown
  record types. Its aggregate verdict can remain `PASS` despite this local failure.
- The [earlier author-pin handoff](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/docs/handoffs/P1-LOG-REQUIRED-20261116.md#L88)
  separately records that API/QVB metadata does not grant verifier authority to a
  supplemental server signer. QVB structural preparation is not a settled
  independent-author trust contract for a future complete verification path.

## Reproduction and retained assertions

Run from the repository root after the normal dependency/vendor setup:

```sh
node --test --test-reporter=spec \
  --test-name-pattern='election-export retains actual server downloads' \
  packages/cli/test/export-verify.test.ts
```

The fixture runs an owned local server through registration, signed manifest,
DKG, witnessed open/close, three ballots, two trustee share packets and published
tally. It uses a coordinator manifest-entry author and an origin-bound log ID,
so those separate compatibility boundaries do not obscure this finding.

The regression requires QVB and independently author-pinned full-board JSON to
retain their bytes, exit 1, report strict `FAIL` alongside raw verifier `PASS`,
and expose `chk.encoding.canonical: fail`. The three findings identify one
`tally-aggregate` and two `dec-shares` records. It also requires `ballot status`
on that same QVB to return `UNVERIFIED`, and checks that none of these operations
overwrites the retained artifact. Separate signed protocol-compatible fixtures
exercise genuine full-check `verified: true` results in both formats.

Local validation on 2026-11-28 with Node 24.22.3: this real-server regression passed
1/1; the remaining export regressions passed 19/19. Existing ballot-status tests
passed 23/23 and archive preparation tests passed 2/2. Workspace TypeScript and
`git diff --check` passed. These local results are not native Windows CI evidence.

## Remaining decision

Adopt a reviewed read contract for board-only derived records: their canonical
shapes, signer roles and independent trust anchors, signature scope, and binding
to the recomputed aggregate, proofs and published tally. QVB supplemental-author
provenance needs an explicit answer alongside JSON. Keep unknown-record refusal
and complete board binding intact. The adapter must not bypass the failed check,
discard the records, or infer author authority from transport metadata to obtain
`verified: true`. Freshness and election finality remain separate concerns.
