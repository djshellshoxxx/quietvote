# Checked submission receipts — November 20, 2026

## Delivered workflow

`qv online election-submit --server <url> --id <election> --file <packet.json>
--log-key <independent-public-key>` checks returned evidence against the exact
submitted packet and an independently obtained log key. It reuses the board
receipt verifier without adding a signature format, cryptographic primitive,
server route or protocol decision.

The [operator guide](../../packages/cli/README.md#check-returned-submission-evidence)
describes pin acquisition, normalized output, outcome ambiguity and offline
reuse. Omitting `--log-key` retains the previous server-response-only path and
output shape. Checked output remains JSON with or without `--json`, consistent
with the other online commands.

## Exact implementation and review sources

| Change | Local source identity |
| --- | --- |
| Initial adapter | `0b3e006375dab4de7308d2be6123ee34a7354da3` |
| Additive REST response compatibility | `fe6c4bff5853759b97024ae1c66b86c8121cb6ec` |
| Structured receipt-check result | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Final production implementation tree | `af59d1f37fe78851e23c4673ce02eeafb94a4674` |
| Independent R11 acceptance source | `da54767099309cba388996be45868e6115e5a392` |
| Integrated R11 acceptance | `a200e69` |
| Guide and pin-error clarification | `794690362de05c7987595ab284ec2afd6019773b`, `14ffcd9638f3f2b1c3adac221e60833f66443375` |
| Concurrent candidate preservation | `f919d319bd7dd346274e2e0dbbccd973ffd57159`, tree `cfbae3de8e200679e919e369c88315183a46e41d` |

Published starting point: tally checkpoint
`29cde9b1d8d774ee201c06f53386a556a2ad48d7`, tree
`9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d`. Production CLI source is unchanged
from `918f270` through the preservation merge. Later test/report composition
must retain that source binding. Hosted qualification belongs to its actual
tested tree, not to an earlier green checkpoint.

## Packet, key and response boundaries

The option requires a lowercase hexadecimal strict Ed25519 public key before
POST. The checked packet is a bounded regular file read through the existing
helper, with no-follow behavior where supported. The selected election ID
determines the expected log origin. Existing header decoding, canonical
base64url decoding, body length, per-type bounds and body digest establish the
local header/body binding. The Merkle leaf is computed from the exact canonical
header bytes. This does not assert entry authority or validate the inner
protocol artifact on behalf of the server.

One POST uses the existing timeout and redirect policy, with a 64 KiB response
cap. The REST envelope is strict UTF-8 JSON; the protocol artifact's restrictive
QV-JSON profile is not applied to unrelated additive transport members. Known
identity and evidence fields are checked explicitly. The adapter converts the
nested REST promise and base64url leaf/signature into the board library's flat
promise and standard-base64 receipt representation, then calls its parser and
verifier.

Status must be the implemented `included` or `sequenced` and agree with the
presence of inclusion evidence. Duplicate inclusion sequence and leaf must
match the enclosing receipt. An unknown future status refuses assurance without
claiming submission rejection. Unknown additive members are ignored and cannot
replace client-owned assurance. The 64 KiB bound is deliberate, not equivalent
to every larger response another client might accept.

## Output and possible acceptance

| Observed outcome | Checked command result |
| --- | --- |
| Valid promise and inclusion under the independent pin, bound to the submitted leaf | Exit 0; promise and inclusion `VERIFIED`. |
| Valid signed promise without inclusion | Exit 3; promise `VERIFIED`, inclusion `INCOMPLETE`. No proof polling or automatic retry. |
| Receipt checking fails after POST | Exit 1 with possible-acceptance guidance; retain the exact packet and inspect state before an explicit retry. |
| Malformed key or option | Usage refusal before submission. A well-formed key for another log is instead detected during response verification after POST. |
| Malformed, mismatched, oversized or nonregular checked packet | Input refusal before submission. |

Output contains `status`, normalized `receipt` and `verification`. Verification
identifies origin, exact leaf and independent key, with `scope: "receipt-only"`.
Authority, witness quorum, freshness and ballot-counting flags are explicitly
false. Inclusion proves the expected entry's relation to the returned signed
checkpoint; it does not establish consistency with another observation or that
this is the newest head.

Saving the contained `receipt` object permits the existing offline
`verify-receipt` command to check it with independent origin/key/leaf anchors.
The entire report is not itself an offline receipt input. The command does not
store receipts, overwrite the packet or acknowledge retained election exports.

## Review findings and independent execution

The [R11 code audit](independent-receipt-code-r11-20261120.md) identified two
interface corrections. Applying QV-JSON restrictions to the REST envelope could
reject unrelated additive metadata; `fe6c4bf` uses bounded transport JSON.
Expected verification refusals should follow QV-30's result convention;
`918f270` returns the board `Result` with the existing receipt error code. The
reviewer inspected and closed both findings.

The [R11 defensive security review](independent-receipt-security-r11-20261120.md)
identified the documentation distinction between malformed keys and
well-formed incorrect pins. `14ffcd9` makes the pre-POST versus post-POST boundary
explicit. No additional blocking defect was identified within those source
review scopes. Engineering reviews are separate from appointed approval.

The [independent functional worker](independent-receipt-bugs-r11-20261120.md)
authored and executed four groups in an isolated checkout whose workspace
aliases resolved locally. An actual-server case submits a manifest, verifies
inclusion, explicitly replays the packet, checks unchanged legacy mode and
reuses the normalized receipt offline. Other cases cover an ordinary signed
promise-only response with additive metadata, post-submit possible acceptance
and local input refusal. They preserve the packet and assert request counts.

## Executed checks

Linux, Node 24.22.3. All rows qualify production `918f270` and the integrated R11
acceptance test noted above.

| Check | Observed result |
| --- | --- |
| Full root TypeScript | `NODE_OPTIONS=--max-old-space-size=768 npm run typecheck`: passed after acceptance integration. |
| R11 independent acceptance | Four passed; zero failures/skips/cancellations; 1.239 seconds. |
| Coordinator acceptance verification | Same four cases passed; zero failures/skips/cancellations; 1.680 seconds. |
| Existing receipt, packet and online tests | Nine passed; zero failures/skips/cancellations; 22.162 seconds. |

The four-case rows overlap and are not eight unique tests. The earlier worker
run on `fe6c4bf` is historical, not additional coverage. The nine-case result
precedes R12's additional election-open/replay assertions; their final execution
is recorded separately in the R12 handoff. Protocol, server, board primitives,
dependencies and workflow files are unchanged. No native browser retry occurred.

## Concurrent candidate disposition

Automation independently proposed [PR #73](https://github.com/djshellshoxxx/quietvote/pull/73),
commit `1cab4ae130a4c1823b61e369557340ba4ec3842d`, tree
`69fd28869df9c5627cea7f919f6f3ce544d88664`, on the same published tally base.
Its [historical handoff](../audits/CONTINUATION_R11_RECEIPT_CANDIDATE_20261120.md)
is preserved byte for byte. The commit is a parent of preservation merge
`f919d31`; its source branch remains unchanged. That handoff records authored
tests without runtime or compiler results for the candidate.

The reviewed `receipt-check.ts` implementation is retained. Alternative
`submit-receipt.ts` and standalone tests are not installed alongside a duplicate
implementation. Its optional text/default and raw-response JSON shape are not
adopted: the online JSON contract and normalized reusable receipt are retained,
as are the corrected additive parser, structured result, strict point preflight
and regular-file boundary.

The useful additional acceptance is signed election-open submission and exact
replay after a full ceremony. Fresh R12 workers reviewed all seven candidate-path
dispositions and ported that case into the existing workflow with the chosen
output contract. All five cases in the amended file passed; the final integrated
TypeScript check passed. Original state, voting, close and export assertions remain.
Candidate unit cases are inspected source, not inherited execution evidence.
The [R11–R12 continuation](../audits/CONTINUATION_R11_R12_20261120.md) records final
source, results and handoffs.

The retained duplicate inclusion fields follow QV-09 §11.1 and the current
server representation. R12 also corrected the older §8.1 worked example to
include those fields; no schema or production rule was added.

## Remaining work

Later proof retrieval, retained receipt/checkpoint consistency, witness
qualification and authenticated freshness remain distinct workflows. This
immediate returned-evidence check does not complete them. Formal sensitive
approvals, historical DCO decisions, native ACL qualification, unresolved
protocol contracts and release evidence remain in the
[unfinished-work ledger](../audits/UNFINISHED_WORK.md).
