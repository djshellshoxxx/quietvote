# QuietVote continuation: rounds 9–10, November 20, 2026

## Delivered increment

`qv election check-tally` compares an unsigned proposal against an externally
pinned public archive from before tally publication. It reuses the protocol
verifier without fabricating a signature or board entry. The default requires
the closed snapshot's declared witness coverage; content-only selection is
explicit and cannot waive required or failed evidence.

Both outputs identify the manifest, canonical candidate and snapshot, retain
findings/warnings/caveats, and distinguish a scoped `MATCH` from publication,
currentness and a full-election verdict. The [implementation receipt](../reports/cli-tally-draft-20261120.md)
and [operator guide](../../packages/cli/README.md#check-an-unsigned-tally-proposal)
describe the full workflow and remaining signing/authority boundaries.

## Exact sources and verification

Implementation `c123608e0fb1d523d6a3bc442111b18448a6661e`, tree
`01639794d97d1037940047f07abc83bcc97f5116`, includes protocol entry point
`a88b446`, independent cases `16dc810` and witness correction `8cc06c6`.
Fresh R10 composition was `4df1e3289e1bb1387e5f2f2ec66897c53043c8b5`, tree
`5563f02ea96b4f11ff89ead2a276f4d46b7f7f69`. Later `a347e53` and `66d50aa`
correct guide completeness and exit wording. All later changes are documentation
only; production and test content still matches `c123608`.

| Check | Actual result and scope |
| --- | --- |
| Full root TypeScript | Passed with a 768 MiB compiler heap after the typed snapshot metadata correction. Earlier interrupted attempts are not successful gates. |
| Full protocol and verifier suites | 459 passed; zero failures/skips/cancellations; 202.30 seconds on Linux/Node 24.22.3, test concurrency 2. |
| New CLI acceptance | Three passed; zero failures/skips/cancellations; 11.64 seconds. Actual server archives and offline executable checking. |
| Existing archive preparation | Two passed; zero failures/skips/cancellations; 1.25 seconds. Existing separate-organizer refusal preserved. |
| R9 independent cases | 18 passed on earlier `a88b446`; content fixtures contain no board evidence. These cases also appear in the 459-case author run. |
| R10 independent workflows | Three cases through six executable invocations passed in 10.97 seconds. Local workspace package resolution, JSON/text identity, caveats, unchanged files and unchanged TALLYING phase were checked. |

R10 witnessed the close before later trustee shares, confirming that a strict
match still displays the unwitnessed-latest-head caveat when required phase
coverage passes. Existing witness semantics do not imply the entire latest head
is witnessed. Counts overlap and are not summed as unique tests. No native
browser retry occurred.

## Completed worker handoffs

Every R9 worker completed before the fresh R10 set began. Each used an isolated
checkout; source review and execution are separately attributed.

| Round | Code audit | Functional bug hunt | Defensive security |
| --- | --- | --- | --- |
| R9 | [Protocol/CLI and witness closure](../reports/independent-tally-code-r9-20261120.md) | [Independent public-fixture cases](../reports/independent-tally-bugs-r9-20261120.md) | [Candidate, evidence and output boundaries](../reports/independent-tally-security-r9-20261120.md) |
| R10 | [Composition and signing example](../reports/continuation-code-r10-20261120.md) | [Executable workflows and hosted source](../reports/continuation-bugs-r10-20261120.md) | [Final boundaries, exit wording and receipt preflight](../reports/continuation-security-r10-20261120.md) |

Closed findings: the one shared R9 closed-snapshot witness dependency, missing
signing-context JSON download, and imprecise parsing-versus-schema exit wording.
The two auditors' witness observations count as one finding. No additional
functional blocker was identified in these scopes. Two local implementation
messages lack requested `Refs` footers; exact source identities are preserved,
with references required in the canonical publication message. DCO and
historical provenance remain separate matters.

## Hosted source qualification

Backup predecessor `547ea2d402f265c38e0d6d24c66f1c20bf3580ae`, tree
`68c3b990f6511982d075d54af9c466ed9eb2f44f`, has its own
[CI 44771157652](https://github.com/djshellshoxxx/quietvote/actions/runs/44771157652).
R10 fetched logged synthetic merge `529f6bfc27d365b572b7a7ebf03697ce26baacc9`,
verified its main/backup parents and identical tree, and qualified completed
macOS 15/Node 24.22.3 protocol (403) and verifier (38) tests, all passing.
At that observation, 25 other jobs were queued and one in progress. Visual
workflow metadata reported success; claims remained queued. This is a partial,
time-bound observation of the backup tree, not qualification of new tally code.

The new publication's complete local/remote tree mapping and hosted checks
belong to [PR #71](https://github.com/djshellshoxxx/quietvote/pull/71) and its
actual tested source. Earlier green checks never qualify a different tree.

## Next concrete increment

R10 preflights agree on an opt-in returned-receipt check for
`online election-submit --log-key`: derive origin from the selected election,
bind the canonical header/body and exact leaf before POST, and verify evidence
under the independent log-key pin. Explicitly bridge the REST nested-promise/
base64url shape to the board receipt representation. Preserve additive response
compatibility while keeping client verification fields owned by the client.

A signed promise without inclusion remains incomplete; post-submit failures
retain possible acceptance and no automatic retry. The first slice checks only
already-returned evidence. No polling, witness, freshness, counted-ballot or
finality guarantee is implied. Actual wire-response acceptance and a fresh
review set must qualify that new implementation.

Formal sensitive approvals and appointed security review, historical DCO,
native ACL and unresolved protocol/release contracts remain promotion gates.
Preserve main and original branches. Continue from live refs and exact handoffs,
including concurrent-work checks. Keep the stopped investigation and denied
native browser attempts excluded. Continue useful work; do not create empty
review cycles or treat unavailable credit-balance information as proof of
exhausted usage.
