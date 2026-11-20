# Offline unsigned tally comparison — November 20, 2026

## Implemented workflow

`qv election check-tally <archive.qvb> --manifest-hash <hex> --draft <body.json>`
checks a proposed tally before a coordinator signs it. The command authenticates
the externally pinned public archive and reuses the existing protocol verifier's
recomputation. The unsigned candidate stays outside the authenticated log.

The [CLI guide](../../packages/cli/README.md#check-an-unsigned-tally-proposal)
documents acquisition, independent pinning, explicit content-only selection,
bounded files, output and the separate signing step. This implements the narrow
pre-publication comparison identified in R8 without changing suite-v1 schemas
or introducing another tally algorithm.

## Exact implementation sources

| Change | Commit |
| --- | --- |
| Shared protocol entry point and scoped report | `a88b44629a47909805adae524abe050a6a6debeb` |
| Independent protocol cases integrated by the coordinator | `16dc810e9040c930091456fa6317840d7ab6c306` |
| Explicit closed-snapshot witness requirement | `8cc06c6e5adfd5f5b6c5e3e2ec9fcd09def5f8b0` |
| CLI adapter, snapshot identity and actual-server acceptance | `c123608e0fb1d523d6a3bc442111b18448a6661e` |
| Reviewed implementation tree | `01639794d97d1037940047f07abc83bcc97f5116` |

The implementation starts from published backup checkpoint
`547ea2d402f265c38e0d6d24c66f1c20bf3580ae`. Subsequent reports and operator-guide
commits do not change executable statements or tests. Every local contribution
has a matching author DCO. Two local implementation messages omit the requested
`Refs` footer; these source identities are retained, and the canonical publication
message must include the applicable QV-16/QV-18 references.

## Verification and result semantics

The new TypeScript `verifyTallyDraft` entry point shares the original guarded
runner. Its private candidate argument leaves the caller's input and evidence
unchanged. It preserves manifest, roll, authenticated record ordering, DKG,
timely key confirmation, open/close, ballot selection and privacy-floor checks.
The candidate must match the recomputed counted root, aggregate, decryption
proofs, complete valid decrypter set, exact result rules and supplied spoil
disclosures. A published tally makes draft checking refuse; ordinary published
verification retains its existing signature/conflict path.

The report returns `MATCH`, `FAIL` or `INCOMPLETE`. Aggregate, decryption, rule
and spoil checks must all pass for a body match, and fatal evidence prevents it.
Existing nonfatal findings and ignored-envelope classifications remain visible.
A spoil comparison failure refuses a draft match while retaining its inherited
`ALARM` finding class. A match does not promise that optional checks ran or that
every historical entry was valid.

Default `MATCH` requires append-only and required witness checks. For the signed
zero-witness policy, the default is `INCOMPLETE`; explicit `--content-only`
permits a match only after the supplied board and content checks pass. Required
or failed evidence cannot be waived. The CLI always supplies the authenticated
archive; the lower-level API separately retains the explicit absent-evidence
option. Input cannot select that option on behalf of the caller.

## Shared review finding and correction

The [code](independent-tally-code-r9-20261120.md) and
[security](independent-tally-security-r9-20261120.md) reviewers independently
identified one completeness dependency. Existing pre-publication witness
handling could leave missing closed-snapshot coverage as a caveat; previously
missing tally decryption kept the overall result incomplete. An unsigned
candidate can complete decryption, so it needs explicit closed-snapshot
witness requirements before a strict match.

The correction enables `requireClosedSnapshot` for the draft entry point. It
requires coverage for the final ballot set and open/close markers using existing
quorum/time rules. It invents no tally sequence, preserves the published path's
actual before-tally range, and leaves zero-quorum handling unchanged. Missing
required coverage fails in both CLI modes. Both reviewers closed this one
shared finding by source inspection. Normal server-workflow acceptance
separately checks the corrected awaiting-witness and witnessed states.

## File and output boundaries

The existing preparer supplies its full checksummed, unredacted archive with
64 MiB, 10,000-entry and 10,032-member bounds. Its separate-organizer authority
refusal remains in force. The draft is a regular QV-JSON file of at most 1 MiB,
read through a bounded descriptor with no-follow behavior where supported.
Observed size changes refuse; this does not claim detection of every same-size
concurrent write or a universal filesystem snapshot.

Text and JSON identify the pinned manifest, canonical draft-body SHA-256 and
the verified log structure's origin, tree size and root. Both retain warnings,
caveats and findings. JSON includes `scope: "tally-draft"`, `published: false`
and `freshnessVerified: false`. No private key, signer, network request,
archive extraction or input rewrite is involved in checking.

## Author verification

Linux, Node 24.22.3; implementation content matches `c123608` above. Later
documentation commits do not change the executed files.

| Check | Observed result |
| --- | --- |
| Root TypeScript | `NODE_OPTIONS=--max-old-space-size=768 npm run typecheck`: passed. |
| New CLI acceptance | Three passed; zero failures/skips/cancellations; 11.64 seconds. Actual server election, draft-download command, real archives and child-process offline check. |
| Existing archive preparation | Two passed; zero failures/skips/cancellations; 1.25 seconds. Includes the unchanged separate-organizer refusal. |
| Complete protocol and verifier suites | 459 passed; zero failures/skips/cancellations; 202.30 seconds. `node --test --test-reporter=spec --test-concurrency=2 'packages/protocol/test/**/*.test.ts' 'packages/verifier/test/**/*.test.ts'`. |

CLI acceptance distinguishes required close-witness coverage, zero-witness
content-only selection, pin/input bounds, output identity and unchanged
files/server phase. The full suites include the new draft cases plus existing
published verification, log, witness, receipt, control, cooperative execution,
self-test and public verifier behavior.

The [independent R9 bug report](independent-tally-bugs-r9-20261120.md) separately
records 18 cases on its earlier exact source. Its content fixtures have no board
evidence and do not qualify the witness correction independently. These cases
also run in the 459-case author suite; counts are not added together.

Earlier unbounded compiler attempts exited 137 without diagnostics and are not
successful gates. A later typed snapshot metadata correction resolved actual
compiler diagnostics before the completed bounded full typecheck. The backup
predecessor's full CLI/hosted results are not assigned to this implementation.
New source requires its own hosted qualification.

## Remaining boundaries and handoff

The comparison establishes agreement with one supplied pre-publication
snapshot. Publication, newest independent state, challenge resolution and FINAL
status remain outside its result. The separate signing command does not
automatically run this check or bind a later invocation to unchanged inputs.
This is a TypeScript CLI capability, not a Python draft-checking API.

All three R9 workers completed their scopes and handed off to fresh reviewers.
Their reports preserve exact source identities and distinguish source review
from executed tests. Final composition review and publication receipts belong
in the continuation ledger and PR #71. Appointed review, formal sensitive-change
approvals, historical DCO, native ACL and release/provenance gates remain
separate. Main, original source branches and release state are unchanged.
