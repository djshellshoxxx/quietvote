# R10 defensive review: tally composition and receipt preflight

Date: November 20, 2026. Fresh reviewer: `/root/security_audit_r10`.
This is a bounded source review after all three R9 workers completed. It is
engineering evidence, not an appointed security review or promotion approval.

## Disposition and exact source

**No additional blocking defect was identified in the inspected tally-draft
composition.** The R9 shared witness-completeness correction remains intact.
The next opt-in submission-receipt check has an existing contract-supported
implementation path, subject to the explicit bindings below. This review
does not implement that next feature or qualify it in advance.

| Identity | Value |
| --- | --- |
| Published predecessor | `547ea2d402f265c38e0d6d24c66f1c20bf3580ae` |
| Predecessor tree | `68c3b990f6511982d075d54af9c466ed9eb2f44f` |
| Reviewed composition | `4df1e3289e1bb1387e5f2f2ec66897c53043c8b5` |
| Reviewed tree | `5563f02ea96b4f11ff89ead2a276f4d46b7f7f69` |
| Earlier reviewed implementation | `c123608e0fb1d523d6a3bc442111b18448a6661e` |
| Inspected documentation correction | `66d50aade14c16167f598ed4b79c6e48cb03b91e` |
| Isolated branch | `codex/qv-security-r10-20261120` |

The review read the R9 [code](independent-tally-code-r9-20261120.md),
[functional](independent-tally-bugs-r9-20261120.md) and
[security](independent-tally-security-r9-20261120.md) handoffs plus the
[implementation receipt](cli-tally-draft-20261120.md). The exact predecessor
diff has 13 files. A separate diff of CLI/protocol source and tests between
`c123608` and `4df1e32` is empty; later composition changes are documentation.
No dependency, workflow, trustee-release or Python-verifier implementation is
changed by this increment.

## Tally comparison: source findings

The trust inputs are the caller's manifest pin, complete public archive,
unsigned proposed body and explicit verification options. The protected
assertion is agreement with that supplied snapshot, without silently granting
publication, witness, freshness or signing authority.

| Boundary | Fresh source assessment |
| --- | --- |
| Candidate separation | `verifyTallyDraft` selects a private candidate argument to the shared guarded runner. It never inserts a log entry, signature or synthetic sequence. The tally body is checked by the existing closed schema. Existing published tallies refuse the draft path. |
| Prefix and computation | The shared manifest/roll, record, DKG, key-confirmation, window and ballot paths precede tally recomputation. Counted root, aggregate, privacy floor, proofs, complete valid decrypter set, result rules and supplied spoil disclosures retain their established checks. |
| Result projection | The wrapper requires aggregate, decrypt, rule and spoil checks to pass for body correspondence, and fatal findings prevent it. A failed spoil comparison refuses `MATCH` while preserving its inherited `ALARM` class. Other established nonfatal historical classifications stay visible. |
| Closed snapshot | Draft checking explicitly supplies `requireClosedSnapshot`. The witness path requires final-ballot-set and open/close coverage under the existing quorum and time rules, using real phase sequences. Missing required coverage creates fatal findings. |
| Zero witnesses and unavailable evidence | Quorum zero still returns `not_run` with its caveat. Content-only requires an explicit Boolean true and absent evidence or a checked append-only zero-quorum log. Failed or unavailable supplied evidence cannot use that exception. |
| Published verification | Ordinary `verifyElection` supplies no draft argument. Its real tally sequence, duplicate/conflict handling, convenience-signature check and published witness intervals remain in place. The new option is not read from bundle fields. |
| Early exits and scheduling | Missing prerequisites cannot reach a completed draft comparison. The shared finalizer handles supplied log evidence on early returns; exceptions make evidence unavailable. Cooperative cancellation/checkpoint failure continues to reject rather than return a completed result. |

These observations independently confirm the correction recorded in R9; they
are not a second discovery or a runtime reproduction. The original latest-head
caveat is also retained: required phase coverage can pass while the latest head
lacks quorum. `MATCH` therefore does not mean every later record is witnessed
or that the supplied history is the newest one.

### CLI and operator claims

The [adapter](../../packages/cli/src/cmd-tally-check.ts) requires the existing
independent pin parser, reads the bounded public draft and uses
[archive preparation](../../packages/cli/src/cmd-prepare.ts) before the full
protocol check. The preparer adds snapshot identity from verified log structure;
it does not change its existing consumers' output or its separate-organizer
authority refusal. Input-size limits, strict QV-JSON, observed-size-change
refusal and platform-supported no-follow behavior are preserved. No private key,
network call, signing, input rewrite or archive extraction is introduced.

Text and JSON identify the manifest, canonical candidate-body digest and checked
snapshot origin/size/root. Text retains warnings, caveats and findings, including
content-only and unwitnessed qualifications. The result uses the distinct draft
scope and `MATCH | FAIL | INCOMPLETE`, with publication and freshness explicitly
unchecked. The [operator guide](../../packages/cli/README.md#check-an-unsigned-tally-proposal)
correctly limits the command to pre-publication archives and tells the operator
that the separate signing command does not automatically run or consume this
check. No filesystem-snapshot, all-findings-clear, full-election or FINAL claim
is added.

One minor documentation precision item was sent to the coordinator and is
**closed** in inspected correction `66d50aa`. The guide now distinguishes file
read/parsing failures (exit 4) from a parsed candidate that fails the tally schema
or verification (`FAIL`, exit 1). The source already made this distinction; the
correction changes copy only. A separate CLI/protocol source-and-test comparison
from `4df1e32` to that correction is empty. This is not another security defect.

## Next feature: automatic checking of a submission receipt

### Existing contract and implementation

The manual [verify-receipt command](../../packages/cli/src/cmd-receipt.ts)
already checks an externally supplied log key, expected origin and expected
leaf hash. It calls the board [receipt parser/verifier](../../packages/board/src/receipt.ts).
That verifier checks the signed promise and fixed merge-delay relationship; if
inclusion is present, it checks the log-signed checkpoint, matching origin/size
and Merkle path. The command distinguishes a valid promise without inclusion
from an included receipt and makes no witness/freshness/counting claim.

The actual gap is [online election-submit](../../packages/cli/src/cmd-online.ts):
it bounds and shape-checks the submitted packet, then uses the generic JSON
request path. That path reports the server response without independently
checking receipt evidence, as the README already states. QV-09 section 8 and
[QV-18 section 7](../18-bulletin-board-transparency.md#7-receipts-and-proofs)
define `included` versus `sequenced`, exact-byte replay and the receipt proof.
No new signed record or protocol rule is needed to check that returned evidence.

The HTTP and board JSON forms differ. The server's `receiptView` in
[app.ts](../../packages/server/src/app.ts) follows the
[QV-09 wire contract](../09-api-data-contracts.md#8-the-log-qv-18-on-the-wire):
it uses a nested `promise`, base64url leaf hash/signature and inclusion convenience
`seq`/`leaf_hash` fields. Proof-path hashes are standard base64. The board parser
expects flat promise fields and standard-base64 leaf hash/signature. The browser
[receipt flow](../../packages/web/src/flow/receipt.ts) already performs an
explicit conversion before reusing the board verifier. Passing raw HTTP JSON
directly to `receiptFromJson` would not implement the intended check.

### Smallest ready increment and necessary bindings

The coordinator's proposed opt-in `online election-submit --log-key` slice is
supported by those existing contracts. These are implementation constraints,
not approval of an unreviewed future patch:

1. Validate the independently obtained log public key and the existing API
   election ID before sending. Derive the expected origin with the current
   `logOrigin({ election_id })` mapping. An unsigned instance/receipt field
   must not supply its own trusted key or expected origin.
2. Decode and retain the exact submitted header/body bytes. Check the header's
   origin, canonical framing and body length/digest before sending; derive the
   expected Merkle leaf from those exact header bytes. Do not substitute a
   server's parsed-header summary or returned leaf as the expected value.
3. Use a bounded response reader and explicit QV-09 conversion. Validate known
   fields and encodings, safe nonnegative sequence/size/time fields and coherent
   status/inclusion presence. If inclusion supplies duplicate sequence/leaf
   fields, require them to agree with the outer receipt. Preserve the API's
   additive-response-field contract without allowing server fields to impersonate
   client-produced verification output.
4. Reuse `verifyReceipt` with the caller's key, then require origin/leaf binding
   to the locally retained packet. Keep promise-only evidence visibly incomplete
   for inclusion. A valid included receipt establishes inclusion of that entry
   in that signed checkpoint, not the entry's full protocol validity or authority.
5. Preserve the existing mutation-outcome boundary. Failed receipt validation,
   malformed success, network failure or an oversized response after POST does
   not establish that the entry was rejected. Retain the exact packet, report
   possible acceptance where appropriate, and never automatically regenerate
   or retry a mutation. Existing exact-byte retry semantics remain separate.

This first increment can verify the already returned evidence without polling
or another service. Existing callers without the option need an explicit
compatibility decision and accurate documentation; preserving their existing
acceptance-only behavior is the narrowest additive implementation.

Useful normal acceptance covers a real server's included response, a valid
promise-only state, an exact packet replay, unchanged submitted bytes, and
agreement with the standalone verifier after explicit wire conversion. The
adapter's input/response boundaries and unknown-outcome handling need focused
tests on the implementation actually added; existing tally tests do not qualify
that future adapter.

### Boundaries that remain separate

Receipt inclusion does not establish witness quorum, newest independent state,
election finality or whether a ballot is counted after revotes/close. The submit
command also relays non-ballot entries, so generic success copy cannot describe
every receipt as a counted ballot. A promise's signed deadline is not, by itself,
an authenticated current-time or deadline-violation verdict.

The existing `verifyReceiptChain` requires additional trusted manifest/entry,
later-head, consistency and applicable witness inputs for its larger recorded-
as-cast scope. Adding that workflow, persistent checkpoint pins, later proof
retrieval or independent freshness is a separate increment. The optional public
key receipt check does not resolve the open freshness or challenge/FINAL
contracts. No concrete contract obstacle was found for the smaller returned-
receipt-only slice with the bindings above.

## Evidence, limits and fresh-worker handoff

This worker read exact committed source, documentation and normal test source,
and compared the relevant trees. It did not execute product tests, broad suites,
dependency audits, probes, vulnerability reproductions or browser work. The
coordinator's 459 protocol/verifier passes, three CLI acceptance passes, two
preparation passes and bounded full TypeScript result remain coordinator-owned
receipts at their recorded source; R9's 18 functional cases retain their separate
earlier-source qualification. Counts overlap and are not summed.

Report-only validation passed: 2,380 Markdown links across 379 files had no
broken links; public-claims lint found zero findings across 358 files and 45
rules. The staged report has no whitespace errors. These are documentation
checks, not additional product execution.

The stopped background-runtime/gossip investigation and old untracked test were
not inspected or resumed. No external posting, publication, main promotion,
workflow change or historical provenance attestation was performed. Formal
sensitive-change approvals, appointed review, native ACL and release gates
remain separate. This report is the only file owned by this worker.

A fresh reviewer should begin from the final published tree mapping, confirm
that the reviewed tally source is unchanged, and read any newly implemented
receipt adapter as a separate delta. Check the concrete wire conversion,
caller-owned anchors, exact packet binding, evidence-state output and mutation
ambiguity on that new source. Continue bounded defensive review and normal
functional qualification; do not convert this preflight into a claim that
receipt automation has already been implemented or tested.
