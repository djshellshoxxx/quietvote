# Independent returned-receipt security review — R11

Date: November 20, 2026. Fresh reviewer: `/root/security_audit_r11`.
This is a bounded defensive source review, not appointed security review,
runtime qualification or release approval.

## Disposition and exact source

**No new blocking security defect was identified in the inspected source.**
The checked path retains caller-owned anchors, binds the exact packet before
submission, reuses board receipt verification, and preserves mutation ambiguity
and the narrow receipt scope.

| Identity | Value |
| --- | --- |
| Published baseline | `29cde9b1d8d774ee201c06f53386a556a2ad48d7` |
| Baseline tree | `9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d` |
| Initial adapter | `0b3e006375dab4de7308d2be6123ee34a7354da3` |
| REST compatibility correction | `fe6c4bff5853759b97024ae1c66b86c8121cb6ec` |
| Reviewed production implementation | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Production tree | `af59d1f37fe78851e23c4673ce02eeafb94a4674` |
| Reviewed operator guide | `794690362de05c7987595ab284ec2afd6019773b` |
| Guide composition tree | `7814a27c0bc982ded6e34b61f537bf2ac402e505` |
| Reviewed key-error wording correction | `14ffcd9638f3f2b1c3adac221e60833f66443375` |
| Final inspected composition | `e5612db06cdb174de784dc2c7743f440e8904dd6` |
| Final composition tree | `fba4f3694a16a3276323e3ee71040c4c934401f7` |
| Isolated branch | `codex/qv-security-r11-20261120` |

The fixed comparison covers the new [receipt adapter](../../packages/cli/src/receipt-check.ts),
narrow changes to [online submission](../../packages/cli/src/cmd-online.ts),
[command help](../../packages/cli/src/main.ts) and the
[operator guide](../../packages/cli/README.md#check-returned-submission-evidence).
Production content is unchanged between `918f270` and `e5612db`. Server
authorization, board cryptography, protocol, dependencies and private-key
handling are unchanged. Implementation messages have matching author DCO and
references; the new file has an SPDX header. The [R10 preflight](continuation-security-r10-20261120.md)
is prior context, not evidence that this new source was already reviewed.

## Trust boundaries

| Boundary | Source observation and limit |
| --- | --- |
| Caller to anchor | `--log-key` must be canonical lowercase hex for a strict Ed25519 public key. Validation precedes packet reading/submission. The CLI cannot establish whether the caller independently obtained the correct key. |
| Packet to expected identity | API ID validation precedes `logOrigin`. Canonical base64url/header parsing, selected-origin binding, exact body length/digest and existing body caps are checked. `hashLeaf` uses original header bytes. |
| File to request | Checked mode uses a bounded regular-file descriptor reader, with no-follow where supported. The retained parsed packet is submitted once without response-derived regeneration or later rereading. This is not universal filesystem snapshot protection. |
| Response to evidence | Transport retains redirect refusal, a bounded deadline and a 64 KiB response cap. Known receipt fields are validated and explicitly converted from REST to board representation. |
| Evidence to output | Selected normalized receipt and locally derived verification fields are emitted. Unknown server members cannot supply or override client assurance. |
| Failure to operator action | Failed or malformed returned evidence retains possible acceptance and directs the operator to keep the exact packet and inspect state. No automatic retry is added. |

Returned keys, origins, leaf hashes, parsed summaries and URLs never become
their own anchors. Pre-submission packet binding checks framing and identity;
it does not resolve author authority or full election validity. The result
explicitly retains `authority_verified: false`.

## Conversion and proof checks

The server's `receiptView` in [app.ts](../../packages/server/src/app.ts) uses
the [QV-09 wire shape](../09-api-data-contracts.md#8-the-log-qv-18-on-the-wire):
nested `promise`, base64url leaf/signature and duplicate inclusion sequence/leaf
fields. The [board parser](../../packages/board/src/receipt.ts) expects flat
promise fields and standard base64. The adapter bridges these explicitly.

Known sequence/time/size values must be safe nonnegative integers, with positive
inclusion tree size. Decoded leaf and signature have exact lengths. Outer
origin/leaf must match the retained expectations; included convenience fields
must agree with the outer receipt. The proof path is at most 64 strings and the
note is bounded. Canonical proof-hash decoding and remaining proof conditions
use the existing board implementation.

`verifyReceipt` checks the fixed signed merge-delay relationship, promise
signature, checkpoint origin/size and signature, and Merkle inclusion. No new
signature/proof arithmetic or fabricated pre-submission sequence is introduced.
Known status/inclusion presence must agree. A valid promise alone leaves
inclusion `INCOMPLETE` and exits 3; valid included evidence yields `VERIFIED`
inclusion and exits 0.

The output's `receipt` is normalized board receipt JSON, distinct from the raw
REST response in no-pin mode. That member can be extracted for the existing
[offline receipt command](../../packages/cli/src/cmd-receipt.ts) with independently
retained anchors. Taking the expected key or leaf from an unverified response
would not establish this trust boundary.

## Coordinated corrections and compatibility

The code auditor identified that parsing the entire REST envelope as protocol
QV-JSON could reject compatible additive metadata. `fe6c4bf` instead decodes
bounded bytes as strict UTF-8 JSON and validates/projects known receipt fields.
Unknown members are ignored under QV-09 section 4.1 and cannot impersonate
client assurance. This worker source-verified the correction; it is not a second
independently discovered security issue.

`918f270` applies the existing `Result` convention to expected receipt refusal.
All refusal branches retain a fixed board error code. The CLI maps a refused
result or parse exception to its static possible-acceptance message; success
can be printed only after a successful result. Verification conditions and exit
behavior are preserved.

Checked mode interprets the two QV-18 section 7.2 states, `included` and
`sequenced`. Unsupported or inconsistent states receive no verification result;
their failure retains possible acceptance. The guide explicitly limits that
scope instead of claiming arbitrary future-state interpretation. QV-09 section
4.5's broader enum evolution remains a consideration when another state is
defined; this review does not invent its semantics.

No-pin submission retains the generic JSON response path. The regular-file
parameter defaults to prior behavior for other commands. New assurance and exit
semantics do not silently replace the acceptance-only interface. Both default
online output and `--json` follow the established JSON convention.

## Assurance and mutation limits

`scope: "receipt-only"` leaves authority, witness quorum, freshness and ballot
counting explicitly unverified. The command checks already-returned evidence
without fetching later proofs, comparing independent heads, polling, choosing
the newest checkpoint or deciding finality. A signed deadline is not an
authenticated present-time or deadline-violation verdict.

The generic submit command relays different entry types, so included evidence
cannot be described as a counted ballot or successful election. The larger
recorded-as-cast chain needs the separate manifest/header, later-head,
consistency and witness inputs of the protocol receipt-chain verifier.

The optional check loads no private key or credential. The added pin is public;
the packet and receipt are public artifacts. It writes no receipt file and makes
no durable-retention claim. Static errors do not echo arbitrary server text.
Receipt failure after POST, like inherited network/oversized-response ambiguity,
does not establish non-admission. A well-formed but incorrect log key is detected
only when the returned receipt fails, after the mutation may have succeeded.

The initial guide grouped invalid pins with local usage failures. This reviewer
requested a wording distinction, closed by `14ffcd9`: option errors and malformed
public keys exit 2 before submission; a valid public key for the wrong log is
detected by checking the response after POST. The corrected guide retains
possible acceptance and the exact-packet guidance. This was documentation
precision, not a production security defect.

## Evidence and successor handoff

This worker performed source, commit/tree and documentation checks only. No
product tests, dependency installation/audit, probes, vulnerability reproductions,
browser work, publication or release were performed. The independent
[functional report](independent-receipt-bugs-r11-20261120.md) records four
actual-wire acceptance groups against `918f270` and its exact test composition.
The coordinator subsequently reported four integrated groups passing in 1.68
seconds, nine existing compatibility tests passing in 22.16 seconds, and full
TypeScript passing after test integration. These are separately owned receipts,
not executions by this reviewer. Older tally and backup totals do not qualify
this adapter.

Report validation passed: 2,431 Markdown links across 384 files, none broken;
public-claims lint found zero findings across 363 files and 45 unchanged rules.
The staged report passed whitespace checking. These checks provide documentation
evidence without adding runtime or cryptographic qualification.

A fresh reviewer should inspect the final composition and operator guide,
preserving the normalized-versus-wire receipt distinction, independent pin
provenance, promise-only incompleteness and possible-acceptance guidance.
Qualify later changes separately, especially proof retrieval or persistence,
rather than extending this receipt-only assurance. A separately published
alternative receipt candidate was outside this fixed comparison and inherits
none of this report's conclusions.

The stopped background-runtime/gossip investigation and old untracked test were
not inspected or resumed. Appointed review, formal sensitive approvals,
historical DCO, native ACL and release/provenance gates remain separate. This
report is the only file owned and changed by this reviewer.
