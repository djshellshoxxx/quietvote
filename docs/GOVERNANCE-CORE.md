# Experimental signed group rules

This opt-in `qv-governance/1` profile implements signed, pinned rule history.
It is not a suite-v1 manifest and does not authorize an election, proposal,
member change, timeout or dispute. Existing election bytes remain unchanged.
The source requirements are QV-03 §§3/6.2/11 and the versioned governance RFC.
These conservative engineering choices implement that RFC; they are not recorded
as a new owner approval or independent protocol review.

## Byte contract

All inputs are strict QV-JSON: NFC, safe integers, no null/floats/duplicate keys,
and closed schemas. Hex is lowercase and fixed width. Ed25519 keys and signatures
use the existing strict prime-subgroup policy. `LP(x)=U32BE(len(x))||x`.

```
GF(label; fields) = LP(UTF8("QV-GOV-HASH")) || LP(UTF8("qv-governance/1"))
                 || LP(UTF8(label)) || U32BE(number_of_fields) || LP(field_1) ...
GH(label; fields) = SHA256(GF(label; fields))
group_id = GH("group-id"; identity_key_bytes)
body_hash = GH("body"; JCS(body))
signature_digest = GH("signature"; group_id_bytes, UTF8("group-rules"), body_hash)
rules_hash = SHA256(UTF8("QV-rules/1") || JCS(body))
```

The export is exactly `{format:"qv-governance-export/1",rules:[envelope,...]}`.
An envelope is `{body,sigs:[{key,sig},...],ratification?:{manifest_hash}}`, with no
other fields. The optional ratification reference is unsigned transport metadata;
it is outside the body hash, avoiding a cycle between candidate rule hash and
ratifying election manifest hash. It cannot establish authorization. Genesis
cannot carry this reference. Signature order is strictly
ascending by key, with no duplicate keys; each signature must verify, including
extras. Only authorized signers may appear. Co-signing helpers sort output.

The body fields are exactly:

| Field | Contract |
|---|---|
| `proto`, `kind` | `qv-governance/1`, `group-rules` |
| `identity_key` | Strict 32-byte group identity public key |
| `group_id` | 32-byte digest derived above |
| `version` | Safe integer 1..64 |
| `prev_rules_hash` | Absent at version 1; exact prior rules hash otherwise |
| `steward_keys` | 1..15 strict keys in ascending order, unique |
| `policy` | Exact existing unsigned draft's `policy` schema and numeric bounds; approval.n equals key count |
| `decision_class` | Absent at version 1; mandatory on amendments: `rules` or `entrenched` |

Policy validation uses an ordinary suggested duration equal to the greater of the
global and ordinary minimum. It validates policy data, without applying the
collective template's conflicting 48-hour suggestion. Unsupported election
capabilities (e.g. drand) remain policy data; this module cannot activate them.

Genesis requires the identity signature and the declared founding steward quorum.
The identity key may also be a steward, counting once in that quorum. Every later
body requires the **previous** steward quorum. An identity key outside that
previous set is not an amendment authority. Changing keys cannot self-authorize.
The group identity and an externally pinned genesis rules hash are both required.

Versions are consecutive and previous hashes exact. Identical-body replays are
idempotent only with a valid envelope under the original authority. A competing
body at any used version is `E_RULES_CHAIN`; missing versions also fail. Signature
lists are outside the body hash, allowing offline co-signing without body changes.
A replay may add a missing ratification reference; two different references for
one candidate are rejected as `E_RULES_CHAIN` rather than selecting by arrival.

Changes to steward keys/approval/terms, the rules or entrenched class, disputes,
halt or retention require `entrenched`; so does decreasing label privacy under
`hidden < members < public`. Other changes require at least `rules`. This is a
conservative classifier (some stricter amendments also require entrenched).

## Trust boundary and output

`verifyGroupRulesExport` accepts trusted options, never options inside the export:
`identityKey`, `genesisRulesHash`, and optional `verifyRatification(request)`.
The callback is invoked only when an envelope supplies a manifest reference and
must return exactly `true` for an independently verified, FINAL,
passed governed election binding the exact manifest hash, previous rule hash,
candidate rule hash and required decision class supplied in `request`. An async
function, truthy object, error or missing callback cannot establish ratification.
Native promise rejections are consumed without accepting asynchronous evidence;
arbitrary thenables are not assimilated.
The callback must be pure. No CLI flag may fabricate this evidence.

Reports are scoped `signed-group-rules`, with `VERIFIED`, `INCOMPLETE` or `INVALID`.
Genesis can be VERIFIED; any unverified amendment makes the export INCOMPLETE.
`active_rules_hash` remains the last consecutively ratified rule version, even
if subsequent candidate signatures are structurally valid. INVALID reports expose
no active rule authority. Errors do not echo untrusted input. A successful report
does not assert valid governed elections or elapsed review time.

Report fields: `{scope,status,versions,pending_ratifications,errors}`; successful
structural verification also returns `active_version`, `active_rules_hash` and
`candidate_rules_hash`. `versions` counts distinct candidate versions, not replays;
INVALID reports set it to zero and omit all authority fields. Error objects are
`{code,message}`, with `E_RULES_SCHEMA`, `E_RULES_BOUND`, `E_RULES_SIG`,
`E_RULES_CHAIN` or `E_RULES_ANCHOR`. Pending entries carry
`{previous_rules_hash,rules_hash,decision_class,manifest_hash?}`; the manifest hash
is absent when no reference was supplied. Callback requests have the same fields
with mandatory manifest hash. All signatures/links are validated before any
callback. Candidate successors use their predecessor's signing keys, but no
successor activates until all prior amendments have verified ratifications.

Bounds: export 4 MiB, at most 128 envelopes including replays, at most 64 versions,
body 64 KiB and at most 16 signatures per envelope. Wire parsers enforce byte
bounds before parsing. Object APIs canonicalize and snapshot before verification.
These implementation resource limits do not change suite-v1 acceptance.

## Continuation

Next: independent Python implementation/shared vectors and offline CLI
prepare/co-sign/inspect; then governed manifest binding and independently verified
ratification evidence. Proposal state, membership, authenticated review time and
disputes follow only through explicit signed and exported contracts. An operator
timestamp is never a substitute for elapsed-time evidence.
