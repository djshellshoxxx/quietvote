# R8 defensive preflight: independent tally-draft checking

Date: November 20, 2026. Fresh worker: `security_audit_r8`.
Reviewed source: `6fc16da296d51d498ff154442a47437ea6cd8482`.
Reviewed tree: `0e6447bd9fdda917811383edb172994dcef75796`.
This follows the completed [R7 security review](independent-backup-security-r7-20261120.md)
and [backup implementation](cli-backup-jobs-20261120.md). It is a source-only
feature preflight, not a new vulnerability finding or formal security approval.

## Disposition

Independent tally-draft checking is a bounded implementation gap under the
existing [QV-16 tally and verifier contract](../16-crypto-protocol.md), not a
reason to select a new cryptographic construction. Existing public primitives
support the calculation. The missing composition must preserve authenticated
input, independent recomputation and narrowly stated output guarantees.
No production change or runtime repair is proposed by this report.

## Current boundaries traced

| Existing path | What it establishes and what remains |
| --- | --- |
| [Online draft command](../../packages/cli/src/cmd-online.ts) | Downloads the server proposal, checks its `type`, writes a new private file and reports `verified: false`. It does not recompute the tally. |
| [Server draft/admission](../../packages/server/src/election.ts) | Builds from the server's admitted aggregate and received shares; admission compares the submitted signed body with that server recomputation. This is not independent client verification. |
| [Coordinator signing](../../packages/cli/src/cmd-packet.ts) | Checks schema, manifest pin, coordinator authority and signing context. A signature is not evidence that all tally fields were independently recomputed. |
| [CLI election context](../../packages/cli/src/common.ts) | Requires manifest/hash/signature and DKG checks to pass; returns joint key/context. That limited gate alone does not qualify ballot analysis, board completeness, tally or freshness. |
| [Archive preparation](../../packages/cli/src/cmd-prepare.ts) | Bounds input, authenticates pinned manifest and complete board framing/body correspondence. Its output explicitly leaves protocol and witness checks to the consumer. |
| [Protocol verifier](../../packages/protocol/src/verify.ts) | Recomputes DKG, open/close bindings, valid latest ballots, counted root, aggregate, share proofs, `T_valid`, counts, exact rules and disclosed spoils. It currently consumes published signed tally records. |
| [Tally helpers](../../packages/protocol/src/tally.ts) | `buildTally` recomputes the aggregate from supplied analysis; `buildTallyFromAggregate` explicitly assumes independently admitted/recomputed aggregate binding. Neither replaces the preceding trust gates. |
| [Trustee release](../../packages/trustee/src/trustee.ts) | Requires its bound manifest/key, closed election, complete log evidence and existing witness policy before locally recomputing ballots and releasing shares. A public checker must not become a new private-share release path. |

## Constraints for the next implementation

1. Require the independently obtained manifest pin and bounded public archive
   and draft inputs. Bind manifest, election origin, context, roll and each
   content record to authenticated board evidence. Preserve existing authority,
   redaction and incomplete-evidence refusals; an archive checksum is not a
   substitute for those checks.
2. Recompute the DKG/share public keys and key-confirmed trustee set, authenticated
   open/close sequence, valid latest counted ballots, counted root and aggregate.
   Do not use the proposal's aggregate, counted-root or counts as trusted input.
   `electionContext` or `buildTallyFromAggregate` alone is insufficient.
3. Apply existing schema/encoding rules, privacy floor, contest/option ordering,
   decryption proofs and canonical subset calculation. Require the proposed
   `decrypters` to equal recomputed `T_valid`; preserve the existing distinction
   between ignored invalid extra shares and insufficient valid threshold shares.
   Recompute integer-rule outcomes and validate disclosed reveal/trustee spoils
   with existing exclusion and decryption rules. Preserve zero-count semantics
   and current verifier behavior rather than inventing a special case.
4. Keep the unsigned candidate outside the authenticated historical log. Do not
   fabricate a coordinator signature or append a synthetic board entry merely
   to invoke the published-record verifier. A shared pure body-validation step
   extracted from its existing tally checks is a possible implementation seam;
   it needs paired regression evidence that published-record behavior is retained.
5. Report the external pin, checked archive identity and separate body-match,
   board/witness and completeness statuses. A matching unsigned draft is neither
   a published signed record nor server admission, election finality or proof of
   currentness. No private key, signing, submission, network retry or witness
   override is needed for this public check.

## Actual contract limits

The [unfinished-work ledger](../audits/UNFINISHED_WORK.md) separately records
unresolved challenge/remedy/FINAL authority and authenticated live freshness.
A signed checkpoint binds origin/size/root; it does not prove that no newer
history exists or define a renewable live clock. Those limits need not block a
clearly scoped check of a supplied snapshot, but they prohibit presenting that
check as final/current election approval. Existing zero-witness and incomplete
evidence distinctions must remain visible.

## Verification and handoff

Performed source, exact tree and contract inspection only. Inspected the linked
paths plus the wrapper [verifier verdict composition](../../packages/verifier/src/verify.ts)
and [spoil collector](../../packages/cli/src/cmd-spoil.ts) for existing derivation
patterns. No runtime tests, probes, vulnerability reproductions, browser attempts,
dependency changes or production edits. The stopped background-runtime/gossip
investigation and old untracked test were not inspected or resumed.

The next implementation should expose or reuse public verification context and
body checks without weakening either published-result or trustee-release gates.
Use distinguishing normal functional cases for wrong pin/context, missing stage
evidence, different counted sets, incomplete shares, `T_valid`, rule results and
spoiled disclosures; retain separate source-bound execution receipts. Earlier
CI and source reviews do not qualify that future code. Native ACL, provenance
and appointed-reviewer gates remain separate. This report is the only change.
