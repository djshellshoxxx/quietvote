# Receipt consolidation code review — R12

Date: November 20, 2026. Fresh reviewer: `/root/code_audit_r12`.
This worker owns this report only and follows the completed R11
[code](independent-receipt-code-r11-20261120.md),
[functional](independent-receipt-bugs-r11-20261120.md) and
[security](independent-receipt-security-r11-20261120.md) reviews.
This is source and consolidation review, not appointed approval or release
qualification.

## Scope and exact identities

**No new blocker was identified in the chosen production, adapted acceptance
source or narrow API example correction.** All seven paths in concurrent PR #73
were compared with their published baseline and the chosen local composition.
The production choice retains the R11 corrections, established JSON output and
receipt-only scope. Candidate history and its qualification statement survive;
its distinct election-open/replay acceptance is retained through the separately
executed R12 functional-worker adaptation.

| Identity | Value |
| --- | --- |
| Published comparison point / PR #71 | `29cde9b1d8d774ee201c06f53386a556a2ad48d7` |
| Published comparison tree | `9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d` |
| Concurrent PR #73 source | `1cab4ae130a4c1823b61e369557340ba4ec3842d` |
| Candidate tree | `69fd28869df9c5627cea7f919f6f3ce544d88664` |
| Reviewed and retained production | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Initial R12 composition | `f919d319bd7dd346274e2e0dbbccd973ffd57159` |
| Initial composition tree | `cfbae3de8e200679e919e369c88315183a46e41d` |
| Initial composition parents | `fa16bdb9326b8b100d9d7111f3ff1c032d74b812`, `1cab4ae130a4c1823b61e369557340ba4ec3842d` |
| Adapted test commit | `ee123c26ccfd0d3d1d03c1d7724c9b15dbddeec5` |
| Integrated equivalent test commit | `48c7ad7057f057aed8a540681b2a1e1b9fe9483a` |
| Both test composition trees | `bed534f6a6de6f38278b7cd4a9a57baee84f59a5` |
| API example correction | `ac42798cef20d5e07b3b757b22addef124af94a8` |
| Corrected composition tree | `3519d720d01cf406f15a52e717d47baa14d72696` |
| Isolated review branch | `codex/qv-code-r12-20261120` |

The fixed diff is `git diff 29cde9b...f919d31`; the candidate comparison is
`git diff 29cde9b..1cab4ae`. The candidate is one commit on the published
baseline. The subsequent test and documentation diffs above were inspected
separately. The code-review skill's standards and specification axes are kept
separate. Independent worker roles are code, functional and security; no nested
standards/specification workers are claimed. Requirements come from repository
contracts and the R11 handoff, without an inferred external issue or contract.

## Seven-path disposition

| Candidate path | Disposition | Reason and evidence |
| --- | --- | --- |
| `docs/audits/CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md` | Preserve byte-for-byte. | Both trees reference blob `bdcdc736b97df7e9cac59d2174f898219160490a`. Its explicit lack of product execution and TypeScript qualification remains historical evidence. |
| `packages/cli/README.md` | Retain the R11 guide and corrected key-error wording. | It documents independent pins, packet binding, normalized output, promise-only exit 3, possible acceptance, both JSON modes and I/O bounds. The candidate's wrapper/text instructions describe a discarded implementation. |
| `packages/cli/src/cmd-online.ts` | Retain the reviewed checked branch. | Strict key validation precedes regular-file input; transport JSON permits additive members; typed refusal becomes possible-acceptance guidance; selected JSON is emitted. No-pin `jsonRequest` behavior remains. |
| `packages/cli/src/main.ts` | Retain R11 help. | Both versions expose the optional independent pin. Retained help states promise-only exit 3 and excludes witness, freshness and counting assurance. |
| `packages/cli/src/submit-receipt.ts` | Do not add the alternative helper. | Existing [receipt-check.ts](../../packages/cli/src/receipt-check.ts) supplies the packet binding and REST-to-board conversion with the retained error/output convention. A second helper would duplicate this internal adapter. |
| `packages/cli/test/online.test.ts` | Retain the election-open/replay intent through adapted commit `ee123c2`. | It uses the selected report schema, adds exact header-leaf/pin/scope assertions and preserves original lifecycle/export checks. At `f919d31` this file was still baseline; ancestry alone did not preserve the test hunk. |
| `packages/cli/test/submit-receipt.test.ts` | Do not add the helper-specific file unchanged. | Its three groups import the discarded helper and assert its distinct API. Packet binding, promise-only evidence and wrong-pin handling have executed R11 command coverage. Other candidate refusal assertions remain source review, not additional execution. |

The preserved [candidate handoff](../audits/CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md)
continues to describe `1cab4ae`, including its original qualification limits.
The current [operator guide](../../packages/cli/README.md#check-returned-submission-evidence)
describes the selected command. The historical handoff is not substituted for
current operator instructions.

## Standards

The selected adapter follows [QV-30](../30-engineering-standards.md) section 7
and QV-30-REQ-011: expected receipt refusals return the board `Result` with
`QV_BOARD_BAD_RECEIPT`. The candidate's pure helper throws `FailError`; adopting
it would undo R11-C2. This is comparison with an already corrected finding,
not a newly reproduced runtime failure.

Both implementations reuse board decoding, hashing and receipt verification.
The retained helper has an SPDX header and introduces no dependency, public
package export, cryptographic primitive or protocol rule. Keeping both helpers
would be a possible duplicated-code smell; the selected composition avoids it.
No additional structure change is warranted by this review.

The candidate, preservation merge, adapted test and API example commits have
Conventional Commit subjects, references and author-matching DCO trailers,
inspected against [CONTRIBUTING](../../CONTRIBUTING.md). Parent preservation
does not attest historical DCO gaps. Formal requirements in
[GOVERNANCE](../../GOVERNANCE.md) remain separate from agent reviews.

Standards result: **zero new unresolved findings in the retained composition.**

## Specification and compatibility

Requirements derive from [QV-09](../09-api-data-contracts.md) sections 4.1, 4.5,
8 and 11.1, [QV-18](../18-bulletin-board-transparency.md) section 7, and the
pre-existing online CLI JSON contract. The selected implementation preserves
the intended optional receipt verification with the following explicit choices.

### Transport and output

QV-09 section 4.1 permits additive response members. The candidate parses the
whole REST envelope with protocol `parseQvJson`, which would reintroduce R11-C1.
The retained source uses bounded strict UTF-8 plus ordinary `JSON.parse`, then
validates and projects known evidence fields. R11's executed promise-only case
includes null, fractional and non-NFC metadata and a server advisory object.
That execution qualifies the retained correction, not the original candidate.

The baseline README already says all online commands print JSON. The candidate
instead prints text in checked mode unless `--json` is present. The selected
command keeps JSON in both modes and one documented `status`, normalized
`receipt`, and locally generated `verification` report. The candidate's
`server_response` / `client_verification` wrapper was an unqualified alternative,
not a shipped CLI contract. Separate wrapper namespaces do not themselves prove
a defect; choosing the reviewed projection avoids competing interfaces and
keeps unrecognized server members out of client assurance.

### Input and proof bounds

The retained checked path validates lowercase hex and a strict Ed25519 key
before reading the bounded regular packet file. The candidate checks hex
spelling after the inherited file read. Both bind the selected origin, canonical
header, exact body length/digest and original header leaf before one POST.
The retained `unb64u` already performs canonical decoding through
[bytes.ts](../../packages/board/src/bytes.ts); the candidate's extra re-encoding
comparison is not a missing behavior.

The bounds differ: candidate response 256 KiB and note text 8,192 characters;
selected response 64 KiB and note bounded within that response. Both cap proof
paths at 64 members and use the board parser for canonical 32-byte hashes. The
selected 64 KiB bound is documented. A larger otherwise valid response can be
refused with possible-acceptance guidance. No reviewed requirement mandates
256 KiB, but this review does not claim every candidate-accepted response also
fits the chosen bound or that large-response compatibility was tested.

The candidate explicitly checks `tree_size > seq` and each path string's length.
The selected adapter checks positive safe size and bounded response/path counts,
then delegates canonical hash, index/tree and proof validity to the existing
board parser/verifier. These are different validation placements, not a lost
accepted proof capability.

### Duplicate identity fields and example correction

The selected adapter requires inclusion `seq` and `leaf_hash` to equal the outer
receipt. QV-09 section 11.1's `InclusionProof.required` includes both; the server's
`receiptView` in [app.ts](../../packages/server/src/app.ts) emits both. The
candidate accepts their absence and checks agreement when present. The selected
decision follows the schema and current server representation; it does not
accept every shape the alternative helper accepts.

At the initial composition, QV-09's worked example and QV-18's abstract sketch
omitted those repeated fields. This reviewer raised the illustration/schema
discrepancy. The coordinator corrected the concrete API example at `ac42798`:
it now includes matching `seq` and `leaf_hash` and explains the existing schema
requirement. This exact six-line documentation diff was inspected. It changes
neither the schema nor production. QV-18 remains an abstract receipt sketch;
the explicit QV-09 wire schema and server serializer remain the adapter's basis.

### Assurance and failures

Both implementations use caller-owned anchors and distinguish included evidence
from a signed promise without inclusion. The selected report explicitly leaves
authority, witness quorum, freshness and ballot counting false. Neither supplies
finality, newest-independent-head or retained-head-consistency assurance. Both
make one POST and retain possible acceptance after response verification fails,
without polling, persistence or automatic retry. No-pin mode retains raw server
JSON and acquires no independent receipt assurance.

Contract result: **zero new unresolved production findings.** The candidate's
transport parser and default text output are not adopted. Its distinct normal
workflow acceptance is retained below. Selected output, bounds and schema checks
are explicit dispositions, not a claim of input/output equivalence.

## Adapted acceptance source

Test commit `ee123c26ccfd0d3d1d03c1d7724c9b15dbddeec5` is directly on `f919d31`.
Only `packages/cli/test/online.test.ts` changes, with 25 added and two removed
lines; its blob is `b57c3bf6a5fe611559b9d7d8db43a34f5c082818`. The integrated
equivalent `48c7ad7` has the same complete tree. This reviewer inspected the
exact diff and independently checked that **all 50 original assertion lines
remain in their original order**. Remaining lifecycle code and timeouts are
unchanged.

The opening packet uses `--log-key`. Assertions check included status, verified
promise/inclusion, the leaf independently calculated from the exact opening
header, the supplied pin and all four false assurance flags. Explicit replay
uses the same packet and checks the same sequence, receipt leaf and verification
object. Original OPEN state, casting, early-close refusal, later close, trustee
shares, tally relay, export, TypeScript and Python verifier, permissions and
no-overwrite assertions remain.

The R12 functional worker reports **five passed, zero failures, skips or
cancellations, 17.006720632 seconds** against its isolated test composition;
the lifecycle case took 16.346967911 seconds. It verified local workspace
aliases and unchanged production. This reviewer independently confirmed no CLI
production diff to `918f270`. Its report is
`docs/reports/continuation-bugs-r12-20261120.md`, committed at
`5cd620e37257d49a1cb66b988917d178f8814144`.

The execution belongs to that worker: in-process CLI, real local server and
the existing Python subprocess. These cases overlap the earlier compatibility
run and are not five additional unique tests on top of R11 totals. The original
PR #73 tests are not executed merely because their commit is now an ancestor.

## Preservation and evidence limits

Independent read-only Git checks passed for candidate ancestry, historical
handoff byte equality, CLI production equality to `918f270`, and package equality
between `fa16bdb` and `f919d31`. Board, server, crypto and protocol also match the
published baseline. The preservation merge keeps both parents and the original
candidate without selecting its helper or claiming its tests ran. Ancestry alone
does not establish behavior preservation; the seven-path comparison and adapted
workflow inspection provide that separate assessment.

All three R11 reports were read in full. Their four functional groups qualify
the exact source and test composition recorded there. The coordinator separately
reported full TypeScript, four integrated receipt groups and nine compatibility
cases passing on the retained production. This worker ran no product suite,
compiler, network probe, exploit or vulnerability reproduction. No original
candidate test or hosted check is independently qualified by this review.

The discarded helper tests also assert refusals for incoherent status, a changed
expected leaf, altered deadline and mismatched repeated inclusion identity.
Corresponding selected conditions and delegated board verification were source
reviewed; R11 command groups are not claimed to execute every such assertion.
The candidate's duplicate-field cases also contain an invalid checkpoint, so
copying their failures alone would not isolate each precondition. This prevents
unexecuted or overlapping assertions from inflating test totals.

Documentation-only validation in this isolated worktree, including this report:

| Check | Result |
| --- | --- |
| `node scripts/check-links.mjs` | Exit 0; 2,457 links in 387 files, none broken. |
| `node scripts/lint-claims.mjs` | Exit 0; 366 files and 45 rules checked, zero findings. |
| `git diff --cached --check` | Exit 0; no staged whitespace errors. |

These checks add documentation evidence, not product-test coverage. No
dependency or production file is changed by this worker.

## Fresh-worker handoff

A successor should start at the coordinator's final integrated commit/tree,
confirm selected production and adapted acceptance survive publication, and
bind current hosted evidence to its actual tested commit. Do not replace the
candidate's historical qualification statement with results from different
source. Further receipt-lifecycle features need separate scope and must retain
independent pins, exact packet identity and possible-acceptance semantics.

The stopped background-runtime/gossip work and old untracked test were not
inspected or resumed. No native-browser retry, escalation, publication, external
message, branch deletion or main merge was performed. Formal appointed review,
historical DCO, native ACL and release/provenance gates remain separate.
