# Independent tally-draft security review R9

Date: 2026-11-20. Reviewer: `/root/security_audit_r9`, a fresh worker separate
from the implementation author. This is a bounded defensive source review,
not an appointed security review, external audit or release approval.

## Disposition and source identity

**One shared completeness finding was corrected and source-verified. No
additional blocking defect was identified in the inspected implementation.**
The unsigned candidate remains outside the authenticated log, the default
draft verdict requires the closed snapshot's witness evidence, and output
retains the boundaries of the supplied snapshot. This conclusion is limited
to the source and paths identified below.

| Identity | Value |
| --- | --- |
| Published starting checkpoint | `547ea2d402f265c38e0d6d24c66f1c20bf3580ae` |
| Tally-draft protocol feature | `a88b44629a47909805adae524abe050a6a6debeb` |
| Protocol feature tree | `0bf68b94db29972adf7b81db8476d1efdb06cf87` |
| Witness correction | `8cc06c6e5adfd5f5b6c5e3e2ec9fcd09def5f8b0` |
| Witness correction tree | `48e9dddcdae6c25a8c4d4aa90a947614b7643e48` |
| Reviewed CLI composition | `c123608e0fb1d523d6a3bc442111b18448a6661e` |
| Reviewed CLI composition tree | `01639794d97d1037940047f07abc83bcc97f5116` |
| Isolated review branch | `codex/qv-security-r9-20261120` |

This review follows the [R8 security preflight](continuation-security-r8-20261120.md).
It traces the public draft API, original verifier, board/witness completion,
archive preparation, CLI binding and new normal functional test source. The
existing cryptographic construction, coordinator/trustee authority and private
share release path are not changed by this feature.

## Finding R9-S1: require evidence for the closed snapshot

**Priority: high for the new default draft verdict; disposition: corrected
and source-verified.** The code reviewer and this security reviewer
independently identified the same control-flow dependency. It is one shared
finding, not two separate issues.

At the protocol feature commit, [witness verification](../../packages/protocol/src/logcheck.ts)
can return `pass` for an unfinished pre-publication history while recording
missing final-ballot-set coverage as a caveat and leaving `timesWitnessed`
false. Missing witnessed open/close coverage becomes a fatal finding only
when an actual published tally sequence exists. Previously the
[verifier](../../packages/protocol/src/verify.ts) also lacked a tally decryption
check in that state, which kept its overall verdict `INCOMPLETE`. Supplying
an unsigned draft completes that check, so the new wrapper must establish
closed-snapshot witness evidence explicitly before returning default `MATCH`.

Correction `8cc06c6e5adfd5f5b6c5e3e2ec9fcd09def5f8b0` adds the explicit
`requireClosedSnapshot` option to witness evaluation, enabled by the draft
entry point. It requires quorum coverage for the final ballot set and for
the open/close markers under the existing time bounds. Missing required
coverage produces fatal witness/time findings, and `allowNoLog` cannot waive
them. The original published path still uses its actual tally sequence and
existing before-tally range; the new path invents no sequence or log record.

The zero-witness branch still returns `not_run` with its explicit caveat.
With board structure verified, that policy remains `INCOMPLETE` by default;
only the caller's explicit content-only choice can permit a scoped match.
Absent evidence and unavailable supplied evidence retain their separate
existing completion behavior. A latest head without quorum can still carry
a caveat even when required phase coverage passes; the report does not claim
the entire latest history is witnessed or current. Both source changes and
the composed CLI use were inspected at the exact commits above. This finding
was established and closed by source inspection only. No probe or
vulnerability reproduction was performed.

## Confirmed protocol boundaries

### Candidate separation and authenticated inputs

`verifyTallyDraft` passes the proposed body through a private option to the
shared verifier. It does not append a record to the bundle or bulletin board,
fabricate a signature, change entry sequences or treat proposal fields as
authenticated historical input. A tally record already present in the
snapshot causes a draft-scope refusal. Published records continue to use
`verifyElection` and its original signature and conflicting-record behavior.

The shared prefix checks the manifest pin and coordinator signatures, roll,
record order and applicable authority, supplied board/body binding, DKG and
timely key confirmations, and authenticated election-open/close bindings.
The checker derives the joint key/context and valid latest counted ballots
from that prefix. The proposal does not supply a trusted counted set or
aggregate. Board and witness checks remain separate report entries.

Some historical anomalies intentionally have nonfatal `L`, `I` or `ALARM`
classifications. For example, [QV-16 section 5.7](../16-crypto-protocol.md)
requires the verifier to use recomputed DKG output despite a discrepancy in
the coordinator's convenience final marker. Invalid ballot envelopes can be
excluded from the result while their failures remain in the detailed report.
A scoped body match therefore is not a promise that every historical entry
was valid or every check flag is `pass`. This review does not propose a
blanket change to those established published-verifier classifications.

### Independent tally arithmetic and disclosure checks

The candidate uses the existing closed tally-body schema and the same
context, counted-root, aggregate, contest/option ordering, decryption-proof,
canonical threshold subset, recomputed `T_valid`, count and exact integer-rule
checks as the published path. The existing effective privacy floor is checked
before aggregate decryption. No alternate floor, server-provided aggregate
trust shortcut or private trustee-release operation is added.

The wrapper requires aggregate, decryption, result-rule and spoil checks to
pass for `bodyMatchesSnapshot`. A failing spoil check therefore refuses a
draft `MATCH` even when its inherited finding class is `ALARM`. Disclosed
reveal/trustee spoils still use the existing exclusion, ciphertext-overlap
and proof rules. This is a check of the supplied disclosures, not a new claim
that the candidate contains an exhaustive inventory of every possible spoil.
Existing zero-count behavior is reused rather than given a draft-specific
exception.

### Early exits, unavailable evidence and completion

Missing required protocol stages return before draft decryption and cannot
produce `MATCH`. Fatal findings remain fatal. A malformed draft sets the
schema/encoding failure; an already-published snapshot is explicitly refused.
The shared finalizer still evaluates supplied log evidence on early returns
once its structure is available. If that evaluation cannot complete, the
existing unavailable-evidence path prevents content-only fallback from
turning it into a passed check.

The shared guarded runner returns a failing report for internal rejection.
Opt-in cooperative cancellation or checkpoint failure continues to reject
the operation rather than return a partial completed report. The existing
caller-owned input/evidence immutability requirement remains applicable.

## CLI and report scope

The [CLI](../../packages/cli/src/cmd-tally-check.ts) requires an
independently obtained `--manifest-hash`, one archive path and `--draft`.
It reads the proposal through a file descriptor opened read-only,
nonblocking and with no-follow behavior where supported. The descriptor must
describe a regular file of at most 1 MiB; reads are bounded by its observed
size plus one byte, and an observed size change is refused. QV-JSON parsing
precedes protocol schema checks. These observations do not claim universal
filesystem or same-size concurrent-write detection.

The existing [archive preparation](../../packages/cli/src/cmd-prepare.ts)
applies its 64 MiB and 10,000-entry limits, checksum/framing checks, complete
unredacted board requirement and manifest/signature/roll/record bindings.
The new command then supplies that board evidence and the existing server
author key to the full protocol checker; archive preparation alone is not
treated as protocol verification. It never extracts archive paths, loads a
private key, signs, submits, follows a result URL or performs network I/O.

JSON includes the complete protocol report, external pin, canonical draft
body SHA-256 and snapshot identity. Text prints the body result, board/witness
statuses, pin, draft digest and snapshot origin/size/root, followed by warnings,
caveats and findings. The snapshot identity is derived from the verified
log structure. Printing caveats in text preserves explicit content-only,
unwitnessed latest-head and notice qualifications that would otherwise be
visible only in JSON. Exit success is reserved for the scoped `MATCH` result;
`FAIL` and `INCOMPLETE` retain separate existing nonzero exits.

The protocol report uses `scope: "tally-draft"` and the distinct
`MATCH | FAIL | INCOMPLETE` vocabulary. `published: false` and
`freshnessVerified: false` are unconditional. A match concerns the supplied
snapshot and mathematical/protocol checks; it does not establish a published
signature, server admission, latest live history, election finality or remedy
authority. Existing authenticated live freshness and challenge/FINAL gaps
in the [unfinished-work ledger](../audits/UNFINISHED_WORK.md) remain separate.

## Verification limits and fresh-worker handoff

This worker performed source and exact identity inspection only, including
the [protocol regression source](../../packages/protocol/test/tally-draft.test.ts)
and [CLI acceptance source](../../packages/cli/test/tally-check.test.ts).
The latter covers ordinary closed-snapshot/witness progression, explicit
zero-witness content-only handling, unchanged input files and pre-publication
server state, external pin refusal and bounded public input parsing. These
source observations do not claim the tests ran here. No runtime test,
dependency audit, probe, vulnerability reproduction, browser attempt,
deployment or publication was performed. Parent-owned smoke/typecheck/full
suite results and the independent bug worker's benign tests must be recorded
under their own exact execution identities; they are not executions by this
reviewer and cannot qualify later source automatically.

The stopped background-runtime/gossip investigation and its old untracked
test were not inspected or resumed. Native ACL, provenance, historical DCO
and appointed-reviewer gates remain separate. No other worker's changes
were edited; this report is the only file owned by this reviewer.

The next fresh security reviewer should start from the final composed commit
and compare its exact diff against the reviewed correction. Recheck closed
snapshot evidence, content-only/zero-witness and unavailable-evidence
separation, preserved published-verifier semantics, and both CLI output modes.
Inspect any new fixture receipts without treating source review as runtime
coverage. Keep the unsigned candidate outside the authenticated log and keep
publication/freshness claims explicit. Resume only bounded defensive source
review and authorized normal functional verification; the stopped
investigation, browser attempts, publication and formal review remain outside
this handoff.
