# Independent tally-draft code review — R9

Date: November 20, 2026. Fresh reviewer: `code_audit_r9`.
This follows the completed [R8 implementation preflight](continuation-code-r8-20261120.md).
The reviewer owns this report only. Production changes and runtime qualification
belong to the coordinator and the separate functional worker.

## Exact source and scope

- Published comparison point: `547ea2d402f265c38e0d6d24c66f1c20bf3580ae`, tree
  `68c3b990f6511982d075d54af9c466ed9eb2f44f`.
- Initial core source: `a88b44629a47909805adae524abe050a6a6debeb`, tree
  `0bf68b94db29972adf7b81db8476d1efdb06cf87`.
- Independent protocol cases: `16dc810e9040c930091456fa6317840d7ab6c306`.
- Witness correction: `8cc06c6e5adfd5f5b6c5e3e2ec9fcd09def5f8b0`, tree
  `48e9dddcdae6c25a8c4d4aa90a947614b7643e48`.
- Final implementation reviewed: `c123608e0fb1d523d6a3bc442111b18448a6661e`, tree
  `01639794d97d1037940047f07abc83bcc97f5116`.
- Fixed comparisons: initial `git diff 547ea2d...a88b446`, followed by the
  committed witness correction and CLI adapter through `c123608`.
- Initial change: 40 additions and six deletions in
  [protocol/verify.ts](../../packages/protocol/src/verify.ts).

The standards and contract axes were assessed separately. The available team
slots were allocated to root, code, bug and security roles; this report does
not claim two additional nested reviewers. No external issue tracker was
needed: the accepted source is [QV-16 sections 5.15–5.19 and Appendix C](../16-crypto-protocol.md),
the existing verifier, and the explicit CLI gap recorded in R8.

## Standards

The implementation reuses the existing verified-prefix and tally computation
rather than duplicating DKG, counting, proof, rule or spoil arithmetic. The new
private `guardedRun` shares exception and cooperative-control handling between
the existing and new public entry points. It introduces no dependency, secret
handling, network access, storage mutation, new signed record or protocol
encoding. The narrow report projection has an explicit draft scope and distinct
verdict vocabulary.

The original published path still uses its real logged tally, exact duplicate
and conflict classification, and existing convenience-signature check. The
added optional-tally guard cannot be selected through an input bundle: only
the new entry point supplies the private candidate argument. A caller cannot
turn ordinary `verifyElection` into draft verification through JSON fields.

The implementation commits have matching author/DCO trailers and Conventional
Commit subjects within 72 characters. The initial core and independent protocol
test commits include specification references. The witness correction and CLI
commits omit the applicable `Refs:` footer requested by
[CONTRIBUTING](../../CONTRIBUTING.md); this minor commit-metadata omission was
reported to the coordinator. The coordinator is retaining these local receipts
for traceability and plans to include the references in the canonical
publication commit. This note does not attest that a later commit already
exists. New source and test files carry SPDX headers. Existing repository-wide
style/tooling debt is not represented as newly implemented enforcement or a
reason for unrelated verifier refactoring. Formal protocol review requirements
in CONTRIBUTING and [QV-30](../30-engineering-standards.md) remain separate from
this worker's review.

## Contract and one shared completeness finding

The candidate remains outside the historical board and is validated using the
existing tally schema and recomputed verified context. No convenience signature
or board entry is fabricated. This first increment is explicitly limited to a
snapshot before a tally is published; a published tally refuses the draft path
instead of being silently replaced. The existing full-election entry point is
still the path for published results.

The report distinguishes body correspondence from overall completeness. Missing
evidence can leave the comparison `INCOMPLETE` even when arithmetic matches.
It always reports `published: false` and `freshnessVerified: false`. A failed
spoil check prevents draft acceptance while retaining the original finding
class; no existing published-result classification is rewritten.

**Source-level finding in the initial core:**
[verifyWitnessing](../../packages/protocol/src/logcheck.ts) treats an absent
published tally as an unfinished election. Missing final ballot-set witnessing
adds a caveat, and missing witnessed open/close coverage does not fail those
pre-publication gates. The old verifier remained incomplete because tally
decryption was absent. Once the new candidate supplies successful tally checks,
inheriting that pre-publication witness status can overstate strict closed-snapshot
completeness. The draft path needs an explicit closed-snapshot witness requirement
without inventing a tally sequence or modifying authenticated log evidence.

The security reviewer independently identified the same dependency. It is one
shared finding, discovered by source tracing; this reviewer did not execute a
reproduction or modify source or tests. The coordinator accepted it and corrected
it in `8cc06c6`.

**Disposition: closed in the reviewed implementation.** `verifyWitnessing` now
accepts an explicit `requireClosedSnapshot` requirement. The private draft path
sets that requirement, and ordinary `verifyElection` does not. With a positive
manifest witness quorum, the draft path now requires final ballot-set witness
coverage and witnessed open/close timing. It continues to use the actual phase
sequences and existing checkpoints. Missing coverage fails; the content-only
option cannot waive a positive witness requirement. The existing zero-quorum
early return stays `not_run`, so the ordinary default is incomplete and an
explicit content-only result retains its caveats.

For an actual published tally, `requireClosed` is true for exactly the same
reason as before: a real tally sequence is present. The original before-tally
checkpoint interval, tally-record caveat, witness trust anchors, exclusions,
notice handling and time bounds remain unchanged. This correction neither
synthesizes a tally sequence nor expands the first increment to published-result
replacement.

## CLI follow-up

The committed [check-tally adapter](../../packages/cli/src/cmd-tally-check.ts)
is a narrow reader over the protocol API. Its command registration and help are
present in [main.ts](../../packages/cli/src/main.ts).

| Boundary | Source assessment |
| --- | --- |
| Election identity | `--manifest-hash` is mandatory and uses the existing lower-case 32-byte pin parser. Archive content, the recomputed manifest hash and manifest signatures are checked by the existing preparer. |
| Public inputs | The draft must be a regular QV-JSON file of at most 1 MiB. The descriptor read is bounded to the observed size plus one byte, so growth cannot create an unbounded read. The existing archive preparer retains its separate 64 MiB and entry limits. |
| Archive evidence | The adapter calls the existing [archive preparer](../../packages/cli/src/cmd-prepare.ts), preserving record/body binding and authenticated board structure, then passes the complete content and evidence to `verifyTallyDraft`. No alternate tally calculation is introduced. |
| Snapshot identity | The preparer adds the authenticated origin, recomputed tree size and tree root. The report also carries the pin and SHA-256 of the canonical draft body. These identify the supplied inputs without claiming the snapshot is current. |
| Read-only behavior | The command reads two public files and writes its report to the supplied output channel. It loads no private key and invokes no server mutation, publication, signing or filesystem writer. |
| Report and exits | JSON retains the full report and identities. Text retains verdict, body correspondence, identities, board/witness checks, warnings, caveats and findings. Both retain the publication/freshness limits. `MATCH`, `FAIL` and `INCOMPLETE` map to existing exit codes 0, 1 and 3; argument/input handling uses existing errors. |

The extra `snapshot` property returned by the preparer is additive. Existing
preparation consumers still select their existing fields; their output formats
are unchanged. The draft reader deliberately uses the existing coordinator
body-size boundary. The initial command is limited to public `.qvb` archives
before publication, as stated in its help.

## Follow-up review and verification

The source review is complete through `c123608`. No additional functional
blocker was identified after the witness correction. The commit-metadata note
above is separate from functional correctness and formal approval gates.

This reviewer inspected the committed
[independent protocol cases](../../packages/protocol/test/tally-draft.test.ts)
and [CLI acceptance cases](../../packages/cli/test/tally-check.test.ts) without
executing them. The protocol cases cover ordinary public fixtures, original
verifier behavior, schema refusal, content/rule/share disagreement, input
immutability, incomplete snapshots, and cooperative completion/cancellation.
The CLI cases cover a normal witnessed closed archive, an export awaiting its
close checkpoint witness, zero-quorum/content-only distinction, the independent
pin, bounded input, report identities and unchanged input/server state.

The coordinator reported three CLI acceptance tests passing with zero failures
or skips on `c123608` in 11.64 seconds, and a successful full TypeScript check
using a 768 MiB heap. This is coordinator-owned execution evidence, not a second
run by this reviewer. Full protocol/verifier regression runs were still underway
when the coordinator supplied that status. The coordinator owns those complete
suites, and the functional worker owns its distinct cases; this report does not
assign their results to a different source tree.

Report-only validation passed: the offline Markdown checker found no broken
links among 2,349 links in 375 files; public-claims lint found zero findings
across 354 files and 45 rules; staged diff whitespace was clean. No production
or test file was changed by this reviewer.

No browser retry, native probe, vulnerability reproduction or stopped
background-runtime/gossip investigation was performed. No publication, release,
main promotion or historical sign-off was made by this review.

## Handoff

A fresh reviewer should begin with the final implementation commit/tree above,
the single closed shared finding, and the coordinator's exact-source runtime
results. Continue any newly accepted feature increment in its own bounded
review. Do not treat this DCO-signed report as appointed code-owner/security
approval, current production evidence or a reason to reopen the stopped work.
