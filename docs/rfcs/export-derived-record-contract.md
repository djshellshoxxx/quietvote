# RFC: full verification of server-derived tally records

**Status: proposed; no protocol, authority or compatibility rule is adopted by this document.**
Date: 2026-11-27 (America/Vancouver). Inspected baseline: `5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7`.
The [compatibility report](../reports/export-derived-record-compatibility-20261127.md)
records the actual server reproduction and the optional export adapter's current refusal.

## Decision requested and recommended direction

Approve, after the reviews below, a small **caller-selected verification profile** for
the server's two existing record encodings. Authenticate every record in the complete
board, validate these records against independently recomputed election data, and bind
their evidence to the published tally. Preserve the current wire bytes, cryptographic
primitives and unrelated unknown-record policy. Implement matching rules independently
in TypeScript and Python before enabling a successful full-snapshot claim.

This is a proposed reader-contract change, not an exemption from a failed check. The
current strict refusal remains correct until the contract is accepted and implemented.

## Current contracts that constrain the change

The server emits `tally_aggregate`/`tally-aggregate` under its separate election server
key and `decryption_share`/`dec-shares` under a manifest trustee's key. Its admission
schemas and role resolver are already explicit. The aggregate is computed after close
satisfies the configured witness gate; share admission checks the trustee's qualification and every proof.
Tally construction can select a subset of posted valid trustee packets. [S1, S2]

Both protocol readers currently classify these body types as unknown. They can retain
raw `PASS` while failing `chk.encoding.canonical`. This follows the deliberate protocol
note and the accepted B1-02 treatment of unknown non-ballot records as local findings.
Both log layers require one-to-one correspondence between the supplied records and
board entries. Removing records cannot repair the problem. [S3, S4]

The prior author-pin decision explicitly says that `server_pk` from an API and
`server_pk_b64u` from an archive grant no independent verifier authority. [S5]

## Minimum explicit authority input

In addition to an independently obtained manifest hash and expected election identity,
a full check of a snapshot containing `tally-aggregate` needs **one independently
obtained Ed25519 server-aggregate signing key, scoped to that election/manifest**.
Proposed CLI spelling: `--server-author-key HEX`, with exactly 64 lowercase hex digits
and strict public-key validation. The name and rollout remain decisions, not implemented
options. Manifest-authenticated log and witness keys retain their existing roles.

Pass this role-specific key as immutable caller input through archive preparation and
both verification layers. For QVB, metadata can be compared with the supplied key but
must never populate the trusted key set. A mismatch refuses verification; it cannot
select another key. Generic supplemental-author pins do not grant coordinator, voter,
trustee or server-aggregate roles by implication. Multiple server keys or rotation are
outside this first profile; require a separate explicit decision if encountered.

No extra pin is needed to identify a `dec-shares` signer: its exact trustee key and
index come from the verified manifest. Missing required authority must prevent a full
claim; the proposed distinction is `INCOMPLETE` for absent authority and `FAIL` for a
supplied conflicting key or invalid signature. The owner must approve its mapping onto
the existing APIs/CLI errors. JSON and QVB must use the same trust rules. [S1, S5]

Python's current `verify` CLI accepts supplemental author keys but has no independent
manifest-hash option. The new profile must expose a trusted caller hash through its API
and CLI, with provenance separate from the bundle's `manifest_hash`; copying a hash
from the download is insufficient. [S6]

## Existing bytes and proposed validation obligations

Retain the closed envelope `{body, sig:{key, sig}}`, where `key` is hex32 and `sig` is
hex64, and `proto: "qv1-r255-sha2"`. Here hex32 means 32 bytes encoded as 64 lowercase
hex characters. The present bodies are: [S1]

| Body type | Exact fields after `proto,type` | Existing bounds |
| --- | --- | --- |
| `tally-aggregate` | `ctx`, `n_counted`, `counted_root`, `aggregates:[{contest,option,A,B}]` | `ctx`, root, A/B: hex32; count 0..2^20; 1..16,384 rows; 64 KiB board body cap |
| `dec-shares` | `j`, `shares:[{contest,opt,M,c,s}]` | `j`: integer 1..32, subsequently within manifest n; M/c/s: hex32; 1..16,384 rows; 16 KiB board body cap |

IDs retain the current 1..64-character `ID_RE` rule. Keep duplicate-key rejection,
closed schemas, exact integer/byte widths and the stricter applicable byte/array
bounds. `dec-shares` has **no `ctx` body field**: its existing inner signature still
uses the recomputed election context as scope. Both inner signatures use
`H256("sig-record"; ctx, record_type, JCS(body))`. [S1, S7]

The following are proposed obligations, all required for a full claim:

| Area | Required evidence and rejection boundary |
| --- | --- |
| Complete board | Retain every original record and sequence; verify exact JCS/body digest/length, header signature, origin, type, nonce/reference rules, Merkle roots and checkpoint coverage. Never create a filtered view. |
| Record authority | Bind `tally-aggregate` only to `tally_aggregate` and the explicit server key. Bind `dec-shares` only to `decryption_share` and manifest trustee `j`. Require both the outer author and inner signature key to match that role. No fallback to the current generic unknown-record author set. |
| Verified prerequisites | Derive context, trustee public shares and key-confirmed eligible decrypters from verified DKG; derive the counted set from all accepted ballot/revote checks. Preserve privacy floor, phase and witness requirements. |
| Aggregate | Check `ctx`, count, counted root and exact contest/option coverage against recomputation. Decode points using existing rules and compare every A/B to the recomputed ciphertext aggregate. A valid server signature is insufficient. |
| Trustee packets | Require every aggregate cell exactly once, with no extra or duplicate cell. Validate each point/scalar and the existing decryption proof over `(ctx, contest, option, j, Yj, A, B, M)`. Check every posted packet, including packets the tally does not select. |
| Ordering/cardinality | Proposed server-profile rule: one aggregate after close and before tally; one packet per trustee after that aggregate and before tally. Reject conflicting or duplicate records for the full claim. The owner must decide finding classes without silently changing B1-02's election-level semantics. |
| Published tally | Preserve all existing tally recomputation and proof checks. For each selected trustee/cell, require the tally's exact `(M,c,s)` tuple to match its authenticated earlier packet. Require the aggregate/count/root to agree. Allow valid unselected packets: do not redefine `tally.decrypters` as every trustee who posted. |
| Outcome | No full claim if a required check fails or is unrun. A valid pre-tally snapshot remains incomplete. Preserve the final-snapshot witness/control gate; keep `freshnessVerified` and `finalityVerified` false. |

Server admission accepts any complete, unique share-array order; a backward reader
must not silently add a new sorting requirement. Authenticate original bytes, then
compare coverage by identifier. Do not normalize or re-sign historical records. The
existing tally's own manifest-order requirements remain unchanged. [S2, S7]

## Versioning and independent implementations

Recommend initial opt-in through a trusted caller profile identifier, recorded in the
report; the download cannot enable it. Supporting existing bytes changes their
interpretation even without changing `proto`, so an ADR must approve which historical
records become recognized and the check/finding/exit-code mapping. Keep existing legacy
behavior available during rollout. A new wire encoding or signed manifest role would
instead require a separately versioned contract; it cannot be retrofitted by rewriting
an old signed manifest. [S3, S4]

Place approved portable shapes and TypeScript checks below the server dependency
boundary; the server may consume them. Implement Python's field, authority and proof
checks independently from the specification. Do not import server admission code into
either independent verifier. Preserve old canary/negative expectations; add immutable
profile-specific fixtures and explicitly labeled old/new reader expectations.

Python presently consumes JSON evidence, not QVB. Compare both verifiers on the same
complete, original board/body JSON and test QVB framing separately in the TypeScript
adapter. This does not establish an independent Python QVB parser. [S6]

## Alternatives and decisions needed

| Direction | Tradeoff |
| --- | --- |
| **Recommended: existing bytes, explicit caller role pin, versioned reader profile** | Smallest scope that validates existing exports while preserving independent authority; users must obtain another public pin. |
| Signed manifest server-author role | Makes provenance discoverable from the independently pinned manifest; needs a new manifest/schema and issuance/rotation decision, and does not repair old signed manifests automatically. |
| Preserve current refusal | Safest interim behavior; ordinary server export and offline ballot-status compatibility remain incomplete. |

Metadata auto-trust, unknown-record allowlists without semantic checks, and filtering
are excluded: each would remove a required authority, correctness or completeness check.

The project owner must record: (1) reader profile/version and historical acceptance;
(2) exact server-role pin/provenance and missing-key behavior; (3) finding classes,
including malformed/unused packets and duplicate/conflicting records; (4) selected-tally
packet binding and subset policy. Assign protocol, TypeScript, Python and server owners
for implementation, and an independent security reviewer for role separation,
signature scope and proof/recomputation binding. These are roles to designate:
`MAINTAINERS.md` currently names no maintainers or security reviewers. Approval of this
proposal would not satisfy the independent cryptographic-review gate. [S8]

## Acceptance evidence required before enabling a full claim

| Distinguishing case | Required result |
| --- | --- |
| Real server, n=3/t=2, witnessed complete election; three valid packets but a tally selecting two | Same verified snapshot/counts/results in TS and Python with independent pins; TS QVB and full JSON agree; offline ballot status works. |
| Same files without a server pin, with only metadata, or with wrong/cross-election key | No full success; correct missing/conflicting-authority distinction. Separate-organizer manifest refusal remains unchanged. |
| Valid outer signatures around bad inner signatures, wrong context, wrong trustee j/key, swapped header/body types or generic-extra-role substitution | Refusal at the actual authority/binding layer. |
| Valid signatures and rebuilt witnessed boards around changed count/root/A/B, missing/extra/duplicate cells, invalid point/scalar/proof or an invalid unused packet | No full success despite intact checksums, log signatures and an otherwise valid tally. |
| Tally selects an absent packet or changes its proof tuple; duplicate/conflicting aggregate or trustee packet; wrong phase | Refusal; a valid unused packet and a previously admissible array order remain accepted. |
| Unknown versions/types, legacy controls, missing tally, phase-only witnesses, self-attested final-witness substitution, self-test failure, rollback/fork evidence | Existing refusal/incomplete semantics and strict gates retained; no freshness/finality promotion. |

Run paired golden and negative vectors through both real CLIs, plus the actual
server-export and archive-retention tests. Record complete per-check parity, not only
raw verdict parity. Keep the current compatibility refusal regression until its
replacement is tied to the approved profile and reviewed implementation.

## Source references

All external source links below are pinned to the inspected baseline commit.

- **S1:** [server record schemas](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/records.ts), [closed envelope/ID schema](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/schema.ts), [board body limits](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/board/src/entry.ts).
- **S2:** [server role resolver, `maybeAggregateLocked`, `vDecShares`, `buildTallyDraft`, `vTally`](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/election.ts), [server phase admission](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/server/src/lifecycle.ts).
- **S3:** [deliberate protocol gap](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/NOTES.md#L217), [accepted B1-02 recommendation](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/docs/plan/DECISIONS-2026-11-04.md#L105).
- **S4:** [TS record reader](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/verify.ts), [TS binding](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/logcheck.ts), [Python reader](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/verifier-py/qv_verifier/election.py), [Python binding](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/verifier-py/qv_verifier/logcheck.py).
- **S5:** [prior independent-author-pin boundary](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/docs/handoffs/P1-LOG-REQUIRED-20261116.md#L88).
- **S6:** [Python CLI](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/verifier-py/qv_verifier/cli.py), [bounded JSON loader](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/verifier-py/qv_verifier/logio.py).
- **S7:** [record signature framing](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/records.ts), [existing tally/proof computations](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/packages/protocol/src/tally.ts).
- **S8:** [owner approval and further-decision boundary, ADR-027; independent-review trigger, ADR-004](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/docs/decision-log.md), [unassigned maintainers/reviewers](https://github.com/djshellshoxxx/quietvote/blob/5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7/MAINTAINERS.md).
