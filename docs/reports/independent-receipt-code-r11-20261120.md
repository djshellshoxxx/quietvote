# Independent returned-receipt code review — R11

Date: November 20, 2026. Reviewer: `code_audit_r11`, independent of the
implementation author and the completed R10 workers. This worker owns this
report only. The review does not constitute formal security approval or a
promotion decision.

## Exact source and disposition

**Both findings raised during this review are corrected and source-verified.
No additional production or operator-guide blocker was identified within the
reviewed change.** The contract finding concerns additive response compatibility;
the standards finding concerns typed expected failures. Their priorities and
evidence remain separate below.

| Identity | Value |
| --- | --- |
| Provided published comparison point | `29cde9b1d8d774ee201c06f53386a556a2ad48d7` |
| Comparison tree | `9aa7dc90c8a5dd0e13b5e5953f594846dce3d89d` |
| Initial receipt implementation | `0b3e006375dab4de7308d2be6123ee34a7354da3` |
| Additive-response correction | `fe6c4bff5853759b97024ae1c66b86c8121cb6ec` |
| Result-contract correction / executable source | `918f27022ab0071b5b83418263c6a3cf9643f37f` |
| Executable-source tree | `af59d1f37fe78851e23c4673ce02eeafb94a4674` |
| Operator guide reviewed | `794690362de05c7987595ab284ec2afd6019773b` |
| Guide composition tree | `7814a27c0bc982ded6e34b61f537bf2ac402e505` |
| Isolated branch | `codex/qv-code-r11-20261120` |

The fixed comparison is `git diff 29cde9b..7946903`. Production changes are
limited to [receipt-check.ts](../../packages/cli/src/receipt-check.ts),
[cmd-online.ts](../../packages/cli/src/cmd-online.ts) and
[main.ts](../../packages/cli/src/main.ts); the accompanying guide is
[packages/cli/README.md](../../packages/cli/README.md). CLI source is identical
between `918f270` and `7946903`.

This review follows the R10 [code](continuation-code-r10-20261120.md),
[functional](continuation-bugs-r10-20261120.md) and
[security](continuation-security-r10-20261120.md) preflights. It examines the new
implementation rather than counting those completed reviews again. The
code-review skill's standards and contract axes were assessed separately in
this worker. Concurrent roles were assigned to code, functional and security
workers; no additional nested reviewers are claimed.

## Standards

The adapter reuses the existing board header decoder, body digest, Merkle leaf
hash, receipt parser and verifier. It adds no dependency, cryptographic
primitive, protocol encoding, signing authority or polling workflow. Its helpers
remain internal to the CLI package's public export surface. Packet errors use
the existing CLI input-error convention; the pure receipt verifier now follows
the board library's `Result` convention.

The new source file carries an SPDX header. Each of the four reviewed
implementation and guide commits has a Conventional Commit subject, a `Refs`
footer and an author-matching DCO sign-off. The feature and guide state the
design and limitations required for review under
[CONTRIBUTING](../../CONTRIBUTING.md) and
[QV-30](../30-engineering-standards.md). This report does not retroactively
attest historical commits or satisfy appointed-reviewer requirements in
[GOVERNANCE](../../GOVERNANCE.md).

### R11-C2: return typed expected receipt failures

**Priority: low; disposition: corrected and source-verified at `918f270`.**
The initial exported pure helper threw generic errors for expected receipt
identity, status, shape and verification refusals. QV-30 section 7 and
QV-30-REQ-011 require parsing and verification failures to use `Result` with
registered error codes. The CLI already caught those failures; this was an
internal interface and standards issue, not an observed runtime escape.

The correction returns `Result<SubmissionReceiptReport>` using existing board
`ok` and `err` helpers. Expected refusals use `QV_BOARD_BAD_RECEIPT`. The command
unwraps that result inside the same response-check boundary, preserving its
static possible-acceptance message, output fields and exit behavior. Source
inspection confirms the correction; no failure reproduction was needed.

Standards result: **one finding, closed; no additional actionable standards or
code-structure finding identified in this change.** Existing repository-wide
tooling gaps are not new findings in this adapter.

## Contract and compatibility

The requirements derive from [QV-09](../09-api-data-contracts.md) sections 4.1,
4.5, 8 and 11.1, [QV-18](../18-bulletin-board-transparency.md) section 7, and the
bounded R10 receipt preflight. The source implements these bindings:

| Concern | Reviewed behavior |
| --- | --- |
| Independent trust anchor | `--log-key` requires 32 bytes of lowercase hex and a strict Ed25519 point. The response cannot supply its own expected key. |
| Selected election | `logOrigin({ election_id: id })` derives the expected origin from the selected API election ID before submission. |
| Exact packet | Checked mode reads a bounded regular file, decodes canonical header/body bytes, checks header origin, body length, existing type/hard limits and body digest, then computes `hashLeaf` over the retained header bytes before POST. |
| Response boundary | One existing transport request returns at most 64 KiB. Strict UTF-8 decoding and transport JSON parsing precede explicit checks of known receipt fields. |
| Wire conversion | Nested promise timestamps and base64url leaf/signature become the board library's flat, standard-base64 `ReceiptJson`. Raw REST JSON is not passed directly to `receiptFromJson`. |
| Evidence identity | Origin and leaf match the locally derived expectation. Duplicate inclusion sequence and leaf fields agree with the outer receipt. Safe integer, byte-length and proof-shape checks precede the existing verifier. |
| Evidence verification | The existing verifier checks the promise signature and fixed merge-delay relation; included evidence additionally checks the log-signed checkpoint and inclusion proof. |
| Result states | A valid `sequenced` promise yields inclusion `INCOMPLETE` and exit 3. Valid `included` evidence yields inclusion `VERIFIED` and exit 0. Status and inclusion presence must agree. |
| Output ownership | Output selects normalized `status` and `receipt`, then creates its own `verification` object. Unknown server members are not copied into assurance fields. |
| Mutation ambiguity | A failed response check after POST exits 1 and preserves possible acceptance, directing packet retention and state inspection before retrying. There is no automatic replay. |
| Existing mode | Omitting the pin retains the prior `jsonRequest` path, packet-input behavior and server-response output shape. |

The verified leaf can belong to any admitted entry type; receipt assurance does
not establish ballot counting. Output leaves authority, witness quorum,
freshness and ballot counting unverified. Neither a promise's timestamp nor a
checkpoint's signature establishes authenticated current time, the newest
independent view or consistency with a retained observation. The adapter does
not fabricate author authority, fetch later proofs or persist checkpoints.

### R11-C1: preserve additive REST response compatibility

**Priority: medium; disposition: corrected and source-verified at `fe6c4bf`.**
The first implementation parsed the entire returned REST envelope through
`parseQvJson`. The protocol artifact's QV-JSON profile rejects values such as
null, fractional numbers and non-NFC strings. Applying it to unrelated response
metadata could refuse an otherwise valid receipt when an additive server member
used those ordinary JSON values. QV-09 section 4.1 requires clients to ignore
unknown response members.

The correction uses bounded, strict UTF-8 decoding followed by `JSON.parse` for
the transport envelope. Known receipt fields remain explicitly validated and
projected before the board parser and verifier run. Packet parsing retains its
existing QV-JSON profile. This resolves the compatibility issue without granting
server metadata verification authority. The finding and closure were established
by source inspection, without reproducing the earlier behavior.

Only the currently defined `included` and `sequenced` states receive interpreted
assurance. An unknown future status produces the same possible-acceptance
failure rather than an invented success claim or a claim that the write was
rejected. This behavior is stated in the guide and does not trigger a retry.

Contract result: **one finding, closed; no additional production blocker
identified in the inspected receipt path.**

## Operator guide and help

The guide at `7946903` and command help were checked against the implementation.
The new
[returned-evidence section](../../packages/cli/README.md#check-returned-submission-evidence)
explains independent key provenance, packet binding, both evidence states and
their exits, bounded I/O, the unchanged no-pin mode and mutation ambiguity.
It distinguishes normalized `ReceiptJson` from the complete submission report,
correctly directing users to extract the contained receipt for offline
`verify-receipt`. It separates additive members from unrecognized states and
keeps later proof retrieval, retained-checkpoint consistency and backup
orchestration as remaining work. No additional discrepancy was identified.

## Evidence limits and verification

This worker performed source, commit/tree and documentation checks only. It
did not run an application suite, network probe, exploit or vulnerability
reproduction, and did not inspect or resume stopped investigations or the
native browser workflow. No dependencies or production files were changed.

The independent functional worker separately reported four acceptance groups
passing on executable source `918f270`, using test commit
`da54767099309cba388996be45868e6115e5a392`. This code worker inspected that commit's
`packages/cli/test/online-receipts.test.ts` source: a real server's included
receipt and explicit replay, legacy output, normalized offline receipt use,
ordinary promise-only evidence with additive metadata, possible-acceptance
failures and pre-submit input refusals. Those executions belong to the
functional worker. The parent separately reported a passing full TypeScript
check, four new receipt groups and nine existing compatibility cases; its final
integration identity and execution receipt remain the parent's responsibility.
None of those runtime checks are claimed as this worker's executions.

Documentation-only checks in this isolated worktree, including this report:

| Check | Result |
| --- | --- |
| `node scripts/check-links.mjs` | Exit 0; 2,431 links in 383 files, none broken. |
| `node scripts/lint-claims.mjs` | Exit 0; 362 files and 45 rules checked, no findings. |
| `git diff --cached --check` | Exit 0; no staged whitespace errors. |

These checks do not substitute for runtime acceptance.

## Fresh handoff

A fresh composition worker should anchor review to the exact integrated source
and tree, confirm that the closed corrections and independent tests survived
consolidation, and consume the separately recorded integration results. Avoid
relabeling these closed findings as new ones or rerunning unchanged suites
without a concrete remaining risk. Comparison with the separately published
receipt candidate in PR #73 is outside this R11 source review and belongs to
the parent's next composition review.

Future proof retrieval, retained-checkpoint consistency and receipt lifecycle
work need explicit new scope and must preserve independent pins, exact packet
identity and possible-acceptance semantics. Formal release gates and existing
stopped-work boundaries remain unchanged.
