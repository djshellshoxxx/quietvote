# Fresh composition code review — R10

Date: November 20, 2026. Reviewer: `code_audit_r10`, independent of the
implementation author and the completed R9 workers. This report owns no
production changes and makes no formal promotion or security-approval claim.

## Exact source and disposition

**No new functional blocker was identified in the inspected tally-draft
implementation. One operator-guide completeness finding was corrected and
source-verified.** The earlier shared witness finding remains closed; it is
not counted as a new R10 finding.

| Identity | Value |
| --- | --- |
| Published comparison point | `547ea2d402f265c38e0d6d24c66f1c20bf3580ae` |
| Starting composition | `4df1e3289e1bb1387e5f2f2ec66897c53043c8b5` |
| Starting tree | `5563f02ea96b4f11ff89ead2a276f4d46b7f7f69` |
| Executable implementation reviewed | `c123608e0fb1d523d6a3bc442111b18448a6661e` |
| Guide correction reviewed | `a347e53445ebc5e2ed78dbab0d6eff422dd11f71` |
| Corrected composition tree | `acb96512c98ccb61142f71d4912b6df5e1aa192c` |
| Isolated branch | `codex/qv-code-r10-20261120` |

The fixed comparison is `git diff 547ea2d...4df1e32`, followed by the exact
documentation-only correction `4df1e32..a347e53`. The production and test paths
in `packages/protocol`, `packages/cli/src` and `packages/cli/test` are identical
between `c123608` and the corrected composition. The review follows the R9
[code](independent-tally-code-r9-20261120.md),
[functional](independent-tally-bugs-r9-20261120.md) and
[security](independent-tally-security-r9-20261120.md) handoffs and the
[implementation receipt](cli-tally-draft-20261120.md).

The code-review skill's standards and contract axes were examined separately
within this assigned worker. The parent allocated the concurrent workers to
code, functional and security roles; no additional nested reviewers are claimed.
The originating contract is available in the repository, so no issue-tracker
integration or external technical lookup was needed.

## Standards

The feature adds a small CLI adapter and reuses the existing protocol verifier,
board authentication and archive preparation. There is no new dependency,
cryptographic primitive, protocol encoding, signing path or network request in
the offline check. The new entry point is exported through the existing package
barrel. The shared guarded runner preserves total verification and the explicit
cooperative cancellation exception; it is not a second verification algorithm.

The bounded proposal reader is intentionally local to the new command, matching
the neighboring command structure. Extracting a universal file-reader abstraction
would expand this change without improving the stated workflow. The added
snapshot metadata is derived from the verified log structure; existing preparer
consumers retain their original fields and output behavior.

The reviewed new source/test files carry SPDX headers. All local commits in this
feature range have author-matching DCO trailers and Conventional Commit subjects.
The known local `Refs` omissions in `8cc06c6` and `c123608` remain accurately
recorded in the R9 report and implementation receipt. They are not new findings;
the canonical publication message must carry the applicable references. This
review does not retroactively attest any historical contribution.

The documentation describes the design and limits for this larger composition,
as required by the size guidance in [CONTRIBUTING](../../CONTRIBUTING.md) and
[QV-30 section 10](../30-engineering-standards.md). Agent review does not satisfy
the formal two-approval/security-reviewer promotion rule. Existing repository-wide
tooling and native ACL limitations are not reclassified as changes introduced here.

Standards result: **no new documented-standard or actionable code-smell finding**
in this review; the prior commit-metadata note remains separate.

## Contract and compatibility

The candidate body is supplied only through `verifyTallyDraft`'s private runner
argument. JSON input cannot select that path for `verifyElection`. No historical
record, signature, sequence position or caller-owned evidence is fabricated or
modified. A snapshot containing a published tally refuses draft checking.

For the published path, the original no-tally early return, duplicate/conflict
handling and convenience-signature check remain. The ordinary witness caller
passes the default false draft condition, so its actual published tally sequence
and before-tally witness interval continue to control the existing checks.
There is no change to the published Python verifier or trustee-release contract.

For the draft path, required closed-ballot-set and open/close witness coverage
are explicit. Missing coverage cannot be converted into a match by the unsigned
body or `--content-only`. The zero-quorum path still returns `not_run`, leaving
the normal result incomplete unless the caller explicitly requests the existing
content-only scope. Latest-head, informational and alarm caveats remain visible.

The CLI requires an external manifest pin and a complete authenticated archive.
It reuses the existing authority boundaries, including separate-organizer refusal.
Its result preserves the draft-body digest and snapshot identity and distinguishes
`MATCH`, `FAIL` and `INCOMPLETE`. Both output modes retain qualifications; neither
claims publication, newest state, counted receipt status, remedies or FINAL.
These observations match [QV-16](../16-crypto-protocol.md),
[QV-18](../18-bulletin-board-transparency.md) and the bounded R8/R9 implementation
scope, rather than adopting new protocol policy.

### R10-C1: complete the signing example's context input

**Priority: low; disposition: corrected and source-verified.** The extended
coordinator example created `before-tally.qvb` and `tally-body.json`, then invoked
`sign-record --election public-election.json` without creating that last file.
The existing [signing adapter](../../packages/cli/src/cmd-packet.ts) routes tally
signing through `electionContext`, which reads the JSON context bundle. The
authenticated `.qvb` used for the draft check does not supply that separate
input automatically.

Correction `a347e53` adds the explicit `online election-export --format json`
download immediately before signing. Its accompanying paragraph identifies the
manifest/DKG context check and retains the earlier comparison's exact snapshot
scope. It does not imply that the later JSON download replaces draft checking
or establishes newest independent state. The command and paragraph were checked
against the existing handlers. No runtime behavior changed or retest was needed
for this documentation correction.

Contract result: **one new documentation finding, closed; no new functional
blocker identified** in the inspected composition.

## Next source-ready increment: optional online receipt checking

The CLI guide still identifies automatic receipt-proof checks as missing.
The narrow next increment can verify the immediate response to
`online election-submit` when an independently obtained log-key pin is supplied.
This can preserve the existing submission mode while adding explicit receipt
assurance. Flag naming and output structure are implementation choices; this
report does not adopt a new protocol or change mutation authority.

Existing building blocks and required bindings:

| Concern | Existing source and implementation constraint |
| --- | --- |
| Submission | [cmd-online.ts](../../packages/cli/src/cmd-online.ts) validates packet framing and performs one POST. Retain bounded transport, redirect refusal, deadlines and no automatic mutation retry. |
| Expected log | Derive the existing `logOrigin({ election_id: id })` from the selected API election ID. The external log-key pin must not be learned from the response being verified. |
| Exact packet | Decode the canonical board header; bind its origin, body length and `bodyDigest` to the decoded body, then compute `hashLeaf` over the exact header bytes. The response must match this leaf, not one supplied by the server as the expectation. Use [entry.ts](../../packages/board/src/entry.ts) primitives without inventing a sequence for pre-submission checks. |
| Wire conversion | The server's `receiptView` in [app.ts](../../packages/server/src/app.ts) emits nested `promise` fields and base64url leaf/signature. [board/receipt.ts](../../packages/board/src/receipt.ts) expects flat fields and standard base64. The existing [web receipt adapter](../../packages/web/src/flow/receipt.ts) demonstrates the explicit bridge; passing raw API JSON directly to `receiptFromJson` is incorrect. |
| Proof | Reuse `verifyReceipt` for the signed promise, fixed merge-delay relation, signed checkpoint and inclusion proof. Validate the bounded response shape and consistency of duplicate wire fields before projection. |
| Scope | Follow [verify-receipt](../../packages/cli/src/cmd-receipt.ts): a valid promise alone leaves inclusion `INCOMPLETE`; an included proof verifies only that receipt's bound entry. Witness quorum, consistency with other observations, newest state and election tally remain separate. |

The first increment should stop after checking the immediate response. Later
polling, independent observed-head consistency, receipt retention and lifecycle
rechecks need their own bounded workflows. A failed post-submit proof is not
evidence that the mutation was rejected; retain the original packet and report
the ambiguity without an automatic replay. Avoid treating the server's status
string or a valid-looking JSON object as cryptographic evidence.

Normal functional acceptance should use an actual admitted public packet and
its real server receipt: included response, explicit identical-byte replay,
matching locally derived leaf, and unchanged packet. A separately supplied
ordinary promise-only receipt should preserve incomplete inclusion. Input/pin
validation, both output modes and the legacy no-check submission contract should
be checked independently. No exploit construction or reproduction is needed to
establish these requirements. The existing receipt tests and web flow provide
the contract examples; this review did not execute or alter them.

## Evidence limits and fresh handoff

This worker performed source, commit/tree and documentation checks only. The
implementation receipt records the author's completed full typecheck, 459
protocol/verifier cases, three CLI acceptance cases and two existing preparation
cases. The R9 bug worker's 18 earlier-source cases remain separately attributed
and overlap the full suite. None is claimed as an execution by this reviewer.

Report validation passed: 2,381 Markdown links across 379 files, none broken;
public-claims lint found zero findings across 358 files and 45 rules. The
working diff passed whitespace checking. These documentation checks do not
add runtime qualification.

No application suite, probe, vulnerability reproduction, browser attempt,
publication or release was performed. The stopped background-runtime/gossip
investigation and old untracked test were not inspected or resumed. Main,
original branches, historical DCO, native ACL and formal appointed-review gates
remain unchanged.

The next fresh code reviewer should inspect the exact composed publication and
its source tree, preserve the guide correction and scoped result language, then
review any optional receipt adapter against the concrete bindings above. Hosted
results must identify their actual tested tree. No old pass qualifies new source
automatically, and no further empty review round is needed without a new change,
unresolved finding or concrete acceptance question.
