# Versioned governance contract: implementation draft

Status: **proposed contract, 2026-11-16**. Existing QV-03/QV-04 requirements and
accepted ADRs supply the behavior below. Proposed encodings and reconciliations
are identified explicitly. This document does not change suite-v1 acceptance,
the label registry, current board types, or any signed election bytes.

The [remaining-contracts handoff](../handoffs/QUIETVOTE-REMAINING-CONTRACTS-20261116.md)
distinguishes already accepted implementation decisions from actual contract gaps.
The new offline policy-draft tools implement only the unsigned configuration
slice described in [the usage guide](../GROUP-POLICY-DRAFT.md).

## 1. Isolation and identity

Recommended implementation profiles:

| Profile | Responsibility | Compatibility |
|---|---|---|
| `qv-group-policy-draft/1` | Offline, unsigned policy/template planning, implemented separately | Cannot be a GroupRules record, manifest or authorization input |
| `qv-governance/1` (proposed) | GroupRules, proposals, membership and dispute envelopes | Dedicated parser, verifier and export profile; no fallback to ordinary JSON or suite-v1 records |
| `qv2-r255-sha2-gov1` (proposed) | A governed election manifest with mandatory governance bindings and corresponding verifier behavior | Explicit suite dispatch; preserve old `qv1-r255-sha2` verification unchanged |

Do not embed governance metadata in a current title, unsigned export sidecar or
unrecognized optional field and call it an immutable manifest binding. The current
manifest is closed and lacks `group_id`, `rules_hash`, `proposal_hash` and steward
keys. A new profile is necessary to satisfy QV-03 §4. Its implementation must
parameterize the suite component of every framed hash; changing the global suite
constant would break old ballots. Existing curves, primitives and equations can
be reused, while all version-bound transcript bytes receive separate vectors.

Proposed group identity: generate a group identity Ed25519 key locally as required
by QV-02-REQ-001; derive `group_id` from its public key using the governance hash
frame below. Its secret never reaches the server. The identity key signs the
bootstrap rule hash; founding stewards separately meet the first policy's `k/n`.
Subsequent authority derives from the previous finalized rules, never a key set
supplied only by the action being authorized. The group identity key is not an
emergency override. Group identity and founding rule hash are external trust pins.

## 2. Proposed byte contracts

All following bytes are **new proposed governance encodings**, not a claim that
QV-03 already specified these details. Use strict QV-JSON parsing/JCS, reject
duplicate fields, unknown fields, unsafe integers, non-NFC strings and invalid
encodings before hashing. No floats or null. Integers in binary frames are
unsigned big-endian. Keys/hashes are 32 bytes, signatures 64 bytes; JSON uses
lowercase fixed-width hex. A timestamp is seconds-resolution UTC `...Z`.

Define `LP(b) = U32(len(b)) || b`. For an ASCII label `L` and `m` byte fields:

```
GF(L; fields) = LP(UTF8("QV-GOV-HASH")) || LP(UTF8("qv-governance/1"))
             || LP(UTF8(L)) || U32(m) || LP(field_1) || ... || LP(field_m)
GH(L; fields) = SHA-256(GF(L; fields))
```

| Purpose | Proposed digest |
|---|---|
| Group identity | `GH("group-id"; identity_public_key)` |
| Unsigned governance body | `GH("body"; JCS(body))` |
| Signature digest | `GH("signature"; group_id, UTF8(kind), body_hash)` |
| Proposal version | `GH("proposal"; JCS(proposal_body))` |
| Evidence attachment | `GH("evidence"; media_type_utf8, exact_bytes)` |
| Governed policy identifier | Retain QV-03's explicit `SHA-256(UTF8("QV-rules/1") || JCS(rules_body))`; its body carries the new governance profile |

Envelope: `{body, sigs:[{key,sig}]}`; body includes `proto`, `kind`, `group_id`,
`rules_hash`, and kind-specific fields. The founding rules body omits its own
`rules_hash` to avoid self-reference. Body identity excludes signatures so an
offline co-signer can add its signature without changing the identity. Signatures
use strict Ed25519 over the 32-byte signature digest. Canonical envelope export
sorts signatures by key; duplicate keys are rejected and never count twice.

Every state-changing body carries an explicit predecessor hash or monotonic
counter, scoped to the specific object. An idempotent exact-body replay returns
the original result; another body at an occupied predecessor/counter is a visible
fork and cannot win by arrival order. Do not use operator timestamps as freshness.
The operator's outer log signature authenticates storage, not action authority.

The precise genesis signing rule above resolves a source ambiguity: QV-03-REQ-002
says “founding version: creator,” while §6.2 says founding stewards sign. Requiring
both identity bootstrap and the declared founding threshold is the proposed
resolution; it is not already implemented or adopted by the unsigned draft tool.

## 3. GroupRules and manifest binding

Rules body: `{proto,kind:"group-rules",group_id,version,prev_rules_hash?,policy}`.
Version 1 has no predecessor; later versions require exactly the prior finalized
hash and `version = previous + 1`. Policy keys are fixed by the selected schema;
the unsigned draft's steward counts are replaced by actual strict public keys.
The declared `n` must equal the distinct key count. Signatures for amendments
are checked against **old** authorized stewards; replacing the steward set cannot
authorize itself. A passed, final ratifying election must reference the exact
new rules hash and the required `rules`/`entrenched` decision class.

Protected paths come from QV-03 §6.2: steward set/threshold, rules/entrenched class
thresholds, dispute/halt authority, retention floor and disclosure becoming less
private. Compare fractions using integer products; compare privacy levels by the
explicit ordering `hidden < members < public`. A changed rule cannot affect an
already signed governed manifest. Initial rules are the sole no-vote exception.

The new election manifest contains the complete copied policy needed to evaluate
the election plus `{group_id,rules_hash,rules_version,decision_class}` and each
contest's `{proposal_id,proposal_hash,proposal_version}`. It contains distinct
`stewards` and `coordinator` sets; neither silently grants the other's authority.
Both the required steward signatures and ordinary ceremony signatures are checked.
The displayed/pinned election identifier is this new manifest hash, not a mutable
group URL. Export includes every hash-referenced rule/proposal/authority record.

Use ADR-015's roll commitment after DKG: the immutable manifest selects the
membership snapshot rule; a signed `roll_commit` binds the chosen group checkpoint
and exact root/size, and `election_open` binds that commit. This requires an explicit
amendment to QV-02-REQ-035 and QV-04 §5.4, which currently say snapshot at manifest
signing. Do not claim both orderings simultaneously. Pinned/static roll mode can
still bind an already-known snapshot in the new manifest.

## 4. Proposal version and review reducer

Proposed body fields: `proposal_id` (random 16 bytes), `version`, `prev_hash?`,
`author`, `decision_class`, `target`, `title`, `text`, `substantive`, `rules_hash`.
For `target:"rules"`, include the complete candidate policy hash/document.
Author and distinct sponsor signatures cover the same version body. The current
membership checkpoint and rules determine proposer/sponsor permission.

| Event | Guard and deterministic result |
|---|---|
| Create/submit | Permitted author, sponsor threshold, title ≤200 Unicode scalars, body ≤20,000, allowed Markdown only; enter REVIEW |
| Revise | Exact predecessor and incremented version; append immutable version; substantive=true restarts review |
| Substantive dispute | Current member signs `{proposal_id,version_hash}`; restart review once per member/version, preserve evidence |
| Ready | Verified review-time evidence reaches `max(global,class)` minimum; derive READY, never trust a DB flag |
| Attach | Latest READY version only; bind hash into governed manifest; no later edits to that attachment |
| Withdraw | Author signature before OPEN; mark proposal WITHDRAWN and refuse opening any not-yet-open attachment |

Recommended handling of QV-02-REQ-024 withdrawal versus QV-03's immutable
attachment: keep the signed election immutable, append the withdrawal, and require
pre-open cancellation/replacement. Do not mutate the attachment or silently swap a
new proposal into the old manifest. After OPEN, withdrawal is rejected.

For Markdown, reject raw HTML, scripts and remote images; do not hash sanitized
text while displaying a different source. Store/hash the accepted exact NFC source,
then use a bounded renderer. Links can be shown as text pending a defined safe-link
policy. Proposal text is public; private attachments need a separately defined
evidence/disclosure policy.

## 5. Membership and election-local activation

Group state includes a stable member identity and current key, with transitions
INVITED/PENDING/ENROLLED/SUSPENDED/REVOKED/ROTATED per QV-04 §5.2. Enrollment must
resolve the separate group/label/invite-ID contract; election registration alone
does not create group membership. Group suspension/revocation affects future
snapshots only. Never change an open election's denominator by editing the group DB.

Two-key rotation carries `{group_id,member_id,old_pk,new_pk,rotation_counter,nonce}`
with both key signatures. Require the currently active old key, a new strict key
not already assigned/aliased, and the exact next counter; reject self-rotation,
cycles and competing successors. The group log controls future snapshots.
An open election logs the authenticated certificate separately: its own log index
`r` activates the alias. Old-key ballots before `r` remain eligible; after `r` they
are rejected. Revoting selects the latest ballot **per stable member**, not per key.
This avoids inventing a cross-log wall-clock ordering. Broadcast may be pending in
one election while included in another; the UI must expose each inclusion status.

Lost-key recovery is an election-scoped amendment signed by the manifest-pinned
steward threshold, binding `{manifest_hash,origin_leaf,new_pk,reason,evidence_hash,
delay_hours,amendment_counter}`. QV-04 specifies default delay24h, range6–72h and old
key veto; recovery cannot take effect at an operator-supplied `effective_after` alone.
Use the authenticated time evidence below. Each amendment is counted against
`max(2,floor(N*200/10000))` by default. A veto consumes the attempt for abuse accounting
unless a future explicit policy says otherwise; that counting convention remains
a proposed clarification. Recovery and new rotation activation stop at close.

Revocation uses the enumerated QV-04 reasons, steward threshold and public delay;
it excludes that member's ballots while preserving snapshot `N`. `roll.add` is
available only to implement a signed dispute remedy, never as a normal late invite.
The exact effect of such an addition on `N`, and whether any remedy may include a
new post-close ballot, is unresolved in the source; recommended: no new post-close
ballot, correct only already receipted admissible evidence or annul/rerun.

## 6. Challenges, remedies and time authority

Filing binds `{manifest_hash,challenge_id,ground,evidence_hash,media_type,byte_length}`
and the member's authenticated snapshot identity. Evidence is at most 1MiB total;
type-specific parsing/limits apply before export or rendering. Missing-ballot
evidence contains receipt/checkpoint/proof only, never the vote/reveal. The exact
stored bytes must match the signed digest. Confidential evidence access and later
deletion are explicit policy decisions, not arbitrary operator visibility.

Arbiter assignment is a signed/reproducible record pinned to the rules, member
snapshot, excluded roles, recusal chain and authenticated randomness. Named keys
are mandatory for named mode; sortition requires complete drand chain/round
parameters and independently checked beacon verification. The abbreviated chain
hash in QV-03 is not usable configuration. D-33 proposes named fallback below15
members, but a named set cannot be fabricated if the rules have none.

Proposed normalized remedies: STANDS, ANNUL, and CORRECT. RERUN is an action after
ANNUL creating a fresh manifest/ceremony; it is not an edit to a rejected tally.
CORRECT carries the exact corrected evidence/report hash and may only produce the
deterministically recomputed result from already admissible public evidence.
An arbiter signature cannot override a failed cryptographic proof or prescribe
arbitrary counts. Resolution requires a strict majority of the assigned distinct
arbiter keys, binds all addressed challenge IDs, and consumes its decision counter.

FINAL requires every timely challenge resolved, the applicable challenge/appeal
window elapsed, and a valid result/evidence chain. QV-03's “silence → STANDS after
168h” conflicts with QV-02-REQ-063's signed-outcome requirement. Recommended
resolution: a distinct TIMEOUT record with verified time evidence; keep unresolved
status rather than manufacture arbiter signatures or a valid STANDS resolution.
This policy difference requires explicit adoption; neither behavior is implied by
the current enum containing CHALLENGED.

**Time contract still needs one precise choice before the state reducer is
authoritative.** Signed user/operator timestamps cannot prove review/delay expiry.
Recommended model: start clocks at a quorum-witnessed checkpoint containing the
trigger; require a later quorum-witnessed checkpoint/effective transition record
with a conservative elapsed lower bound. Define exactly how the quorum is selected,
duplicate witness observations, skew, missing witnesses, and checkpoint intervals
produce that bound. Reuse authenticated checkpoint parsing, not a browser clock.
Until this rule is specified and vectored, pure reducers may accept a typed
`VerifiedElapsed` input from a test harness, but no HTTP route may assert one.

## 7. Implementation order and release evidence

1. **Implemented preparatory slice:** unsigned numeric policy draft validation and
   literal template expansion, offline CLI, independent bound/shape/arithmetic tests.
   It does not satisfy signed GroupRules publication or governance workflow claims.
2. Build the proposed envelope/parser, strict signatures, rules-chain verification
   and ≥40 shared negative cases in TS and Python. Implement group-root/bootstrap
   pin handling and offline co-signing before storage/API/UI.
3. Implement the governed suite dispatch and mandatory manifest/roll/proposal
   bindings. Add cross-profile replay/stripping tests and a complete export verifier.
4. Implement proposal state/permission/review, then membership aliases and delayed
   recovery, then disputes/finality. Each lane needs a full CLI/API journey followed
   by the equivalent browser path; status-only controls are insufficient.
5. Test migration using old unmodified exports and live database fixtures. Existing
   elections stay on their original profile; no in-place conversion of signed
   manifests/ballots. New governed elections are opt-in until both verifiers and
   release gates support them; preserve the old independent verification path.

Remaining concrete choices before enabling the new profile: genesis signature
threshold; exact new suite/envelope domains; dynamic membership snapshot timing;
T3's 48h-versus72h voting and 24h-versus168h effective review conflicts; authoritative
time bounds; amendment-cap accounting; late-addition denominator/remedies;
confidential evidence/timeout behavior; complete arbiter randomness and fallback.
These choices are not reasons to stop independent bounded implementation work.
