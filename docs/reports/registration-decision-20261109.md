# Registration contract decision brief — 2026-11-09

**Status: decision preparation only; B3-01 remains held for this work.** No wire
contract, acceptance set, storage format, vector or normative document is changed.
The current task explicitly retains the owner hold. This report does not resolve
the conflicting approval records below or constitute independent protocol review.

Source baseline: `51851c10c5ac33cd89f05f9e0af44fd43b41b930`. All source links and
line numbers below refer to that commit, not a moving branch. Requirements in
scope: QV-04-REQ-004/005, QV-09 §3.3/§4.4, QV-19 §6.1/REQ-010, QV-28 §8.2,
QV-30 S8; audit findings B3-01 and the related B2-10 idempotency question.

## 1. Authority records need reconciliation

| Record at the baseline | What it says |
|---|---|
| [OPEN-DECISIONS:10–15](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/plan/OPEN-DECISIONS.md#L10-L15) | Owner retained the hold; exact wire bytes, storage hash, signature framing and label treatment are required before unblocking. |
| [Consolidated handoff:3](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/handoffs/QUIETVOTE-CONSOLIDATED-NEXT.md#L3) | Registration is an owner-held protocol-review block. |
| [2026-11-04 register:3–5](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/plan/DECISIONS-2026-11-04.md#L3-L5) | Header claims owner approval of hashed invite plus invite-bound PoP. |
| [Same register:476–483](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/plan/DECISIONS-2026-11-04.md#L476-L483) | Its B3-01 section still says held and explicitly forbids unblocking without owner approval. |
| [ADR-028:344–352](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/decision-log.md#L344-L352) | Claims the 2026-11-04 owner approval supersedes the hold, adopts the web bytes and stores the token hash; requires external review. |

These are conflicting repository assertions, not newly verified owner approvals.
They must be reconciled with the current instruction before implementation. Even
if ADR-028 is reaffirmed, its storage-security and QV-04 label/scope consequences
need an explicit disposition; calling both drafts “QV-19/QV-04” does not make
their different contracts equivalent. The existing failure regression is retained.

## 2. Exact bytes implemented today

Notation: `||` is byte concatenation, `U(s)` is UTF-8, `00` is one NUL byte,
`B(x)` is unpadded base64url, and `S(x)` is plain SHA-256. `T` is the 16 random
token bytes; `C = B(T)` is their 22-character issued code. `I` is the API election
identifier (currently 32 lowercase hexadecimal characters), not the displayed
manifest-hash Election ID. `P` is the 32 raw Ed25519 public-key bytes.

| Stage | Current exact operation | Source |
|---|---|---|
| Issuance | Server generates `T`; returns `code = C` to the organizer. | [app.ts:501–515](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L501-L515) |
| Stored invite verifier | `D = S(U("QV-INVITE-v1") \|\| 00 \|\| U(C))`. It hashes the **encoded code text**, not `T`. | [app.ts:508](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L508) |
| Browser fragment | `#inv=C`; decode to exactly 16 bytes. `inviteHash(T) = B(S(T))`. | [invite.ts:12–22,53–61](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/web/src/flow/invite.ts#L12-L61) |
| Browser request | `{invite_code: B(H), pk: B(P), alg: "ed25519", pop: B(Sign(sk, M_web))}`, where `H = S(T)`. | [onboarding.ts:122–131](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/web/src/flow/onboarding.ts#L122-L131) |
| Browser signed bytes | `M_web = U("QV-REG-v1") \|\| 00 \|\| U(I) \|\| 00 \|\| H \|\| P`. `H` and `P` are raw bytes, with no separator between these fixed-width fields. | Same source. |
| Server signed bytes | `M_server = U("QV-REG-v1") \|\| 00 \|\| U(I) \|\| 00 \|\| P`. No invite or human label is signed. | [app.ts:559–562](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L559-L562) |
| Server lookup | After PoP verification, calculate `S(U("QV-INVITE-v1") \|\| 00 \|\| U(request.invite_code))` and query `code_hash`. | [app.ts:563–565](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L563-L565) |
| Redemption transaction | Consume issued/sent invite; erase contact; insert approved voter. The invite-to-voter relationship is deliberately absent. | [app.ts:566–578](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L566-L578), [electiondb.ts:436–450](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/electiondb.ts#L436-L450) |

The browser signs these message bytes directly with ordinary Ed25519; this is
neither Ed25519ph nor a signature over a QV-16 framed digest. Both browser signer
implementations use those supplied bytes; server verification requires a 64-byte
signature and strict points ([signer.ts:51–54](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/web/src/key/signer.ts#L51-L54),
[ed25519.ts:13–41](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/crypto/src/ed25519.ts#L13-L41)).
The API ID is generated from 16 random bytes as hex
([pool.ts:72–73](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/pool.ts#L72-L73)).

The server accepts an `invite_code` string of 22–64 base64url characters without
decoding it; thus the browser's 43-character hash passes shape validation and
fails the PoP first. Merely changing the PoP leaves a second mismatch:
`S(U("QV-INVITE-v1") || 00 || U(B(H)))` is not the issued `D`. This is not a
simple accidental double hash of the same bytes. The encoding and domain differ.
Source: [app.ts:549–565](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L549-L565).

Synthetic byte check, independently recomputed with Node's SHA-256 on 2026-11-09:

```text
T hex:      000102030405060708090a0b0c0d0e0f
C:          AAECAwQFBgcICQoLDA0ODw
H hex:      be45cb2605bf36bebde684841a28f0fd43c69850a3dce5fedba69928ee3a8991
B(H):       vkXLJgW_Nr695oSEGijw_UPGmFCj3OX-26aZKO46iZE
stored D:   1b0150f0ac41e92384e562c57ff26c341b9aa561e3e52a83abf06ea4d010f15c
web lookup: cf92f7e169a1909178c776a80f92315235f8cd2af24cf75a5ca7efc3765711af
```

For a 32-byte ASCII `I`, the common message prefix is 43 bytes: nine ASCII domain
bytes, NUL, 32 ASCII ID bytes, NUL. `M_server` is 75 bytes; `M_web` is 107 bytes.
This diagnostic example is not a new normative vector or an approved contract.

## 3. Draft contradictions beyond the two failing bytestrings

| Question | Draft/source conflict and decision needed |
|---|---|
| Invitation representation | [QV-04:93](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/04-identity-eligibility.md#L93) specifies base32 (26 chars) and `S("QV-invite/1" \|\| code)`. Issuance uses base64url and `QV-INVITE-v1` plus NUL. QV-19 does not say whether `TOKEN` denotes decoded bytes or encoded text; the web chooses decoded bytes. |
| PoP scope and fields | [QV-09:63,559–562](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/09-api-data-contracts.md#L559-L562) names `(election_id, pk)`; [QV-19:95–102](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/19-client-supply-chain.md#L95-L102) names `(ID, SHA-256(TOKEN), pubkey)`; [QV-04:94/REQ-005](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/04-identity-eligibility.md#L94) names `"QV-enroll/1" \|\| group_id \|\| invite_id \|\| pk \|\| label`. Group versus election scope, opaque invite ID versus token hash, and label binding are separate choices. |
| Domain-label registry | QV-09 attributes `QV-REG-v1` to QV-16, but [QV-16 §5.3–5.4](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/16-crypto-protocol.md#L124-L191) defines no registration domain or preimage. Its `H256/H512/hs` registry is not the direct-signing API used here. [QV-30 S8](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/30-engineering-standards.md#L79) broadly requires domain separation and length prefixes. Either document the precise API-domain exception/registry or approve a versioned framed construction; do not silently replace these bytes with `H256`. QV-19 §6.1 itself does not specify the NUL separators that ADR-028 calls its “exact” bytes. |
| Human labels | QV-04 requires PoP binding of `label`, optional reserved `label_hint`, and a logged `member.enrolled` label hash ([§5.1](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/04-identity-eligibility.md#L82-L97)). Current registration has no label field. Only organizer invite creation accepts `label` (max 120 JavaScript code units), rejects NUL via `fStr`, encrypts nonempty labels, and performs no reservation or uniqueness check ([app.ts:483–509](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L483-L509), [util.ts:74–83](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/util.ts#L74-L83)). The shared HTTP JSON parser rejects non-NFC strings rather than normalizing them ([http.ts:381–385](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/http.ts#L381-L385), [json.ts:96–97](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/crypto/src/json.ts#L96-L97)). The redemption handler inserts a voter without the QV-04 enrollment log entry. |
| Label visibility/lifetime | [QV-04:68](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/04-identity-eligibility.md#L68) proposes a separate signed label mapping. [QV-16:281](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/16-crypto-protocol.md#L281) keeps human labels outside the roll's cryptographic record. Current encrypted invite labels are organizer data, retained then purged; they are not a voter label mapping ([electiondb.ts:423–438](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/electiondb.ts#L423-L438)). |
| Same-invite retry | [QV-09:146](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/09-api-data-contracts.md#L146) requires original `(invite, pk)` success and different-key conflict. The handler returns 201 for a used invite if the submitted key exists anywhere in that election, because [QV-28:402](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/28-data-model-storage.md#L402) deliberately forbids persisted linkage. No voter is added in that branch. Changing the hash/PoP cannot restore a relationship the DB does not retain. [B2-10](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/docs/plan/DECISIONS-2026-11-04.md#L235-L242) leaves linkage subject to privacy review. |

## 4. Candidate choices, without selection

| Candidate | Concrete contract | Migration and security consequence |
|---|---|---|
| A — Retain server contract | Send `C`, sign `M_server`, retain `D`. Change the web and amend the QV-19/QV-04 requirements that it does not satisfy. | Existing invite rows remain usable. Raw redemption credential reaches the server. PoP proves possession of `sk` for `I/P` but cannot bind a captured PoP to its intended invite. Label/scope discrepancy remains unless explicitly resolved. |
| B — Adopt existing web bytes, store `H` directly | Send `B(H)`, sign `M_web`, compare decoded 32-byte `H` with the issued row's stored `H`. This is the natural reading of ADR-028's storage wording, pending clarification. | Existing `D` rows cannot be converted using stored data alone. Stored `H` is itself the accepted bearer: theft of an unused row permits enrollment with a thief's own key and valid PoP. It does not reveal `T`, but that does not prevent redemption. |
| C — Adopt web bytes, separately hash the bearer at rest | Same web request and PoP as B; issuance and lookup both store/derive an additional approved hash of the accepted bearer. One possible byte definition is `S(U("QV-INVITE-v1") \|\| 00 \|\| U(B(H)))`, but this report does **not** approve that reuse/domain or any framing. | Preserves a one-way barrier between a stolen DB verifier and the on-wire bearer, unlike B. Requires explicit reviewed storage framing/version, reissue or versioned legacy handling. The server still sees the usable `H` during registration and originally generates `T`. |
| D — Implement full QV-04 enrollment | A separately specified group/invite-ID/key/label proof, normalization and label policy, approval mode and log artifact. Exact field encodings/framing and domain/version must first be written and reviewed. | Broader API, UI, enrollment/log and privacy work. Persisted/public invite-to-key/label linkage must be reconciled with QV-28; a one-line web/server fix cannot implement it. |
| E — Explicit versioned transition | Approved A and an approved replacement each have an unambiguous mode/version, matching DB discriminator and PoP domain/field rules. No opportunistic “try both signatures” fallback. | Preserves outstanding legacy invites if that is required, at the cost of two acceptance paths and downgrade analysis. Bind version selection and define cutoff, retry and restoration behavior before implementation. |
| F — Retain the hold | Preserve the observed rejection and use this brief for the owner/protocol decision. | Real web registration remains unavailable. This is the disposition of this work, not a new product decision. |

For B/C, “hash before sending” does not establish “server stores no usable
credential” by itself. Anyone holding `H` can make a new keypair and sign
`M_web` for that key. Binding the PoP to `H` prevents transplanting a signature
between invitations; it does not prove knowledge of the preimage `T`. This is an
inference from the specified acceptance rule, not a tested implementation of B/C.
A compromised live server already sees redemption credentials in every option
above; an additional storage hash addresses stored-verifier theft only.

Also scope the phrase “raw token never crosses the wire” correctly: current
issuance generates the raw token on the server and returns `C` in the organizer's
invite response. B/C avoid sending `T/C` in the **redemption request**; they do
not establish that broader statement for the complete issuance lifecycle.

Human-label disposition needs its own explicit choice: either scope the QV-04
label/group rules out of this election registration endpoint and amend the
requirements, or define the requested label, NFC/rejection rule, length units,
reservation/uniqueness checks, visibility, signed bytes and retention. Do not add
an unsigned label field and claim QV-04-REQ-005 is met.

## 5. Migration boundary and acceptance criteria

`code_hash` is a unique 32-byte BLOB with no scheme tag
([electiondb.ts:42–45,398–407](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/electiondb.ts#L398-L407)).
The DB retains `D`, not `T` or `C`; invite-creation idempotent replay withholds codes
([app.ts:515](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/src/app.ts#L515)).
Changing issuance for new rows does not migrate outstanding invitations. A rollout
must choose reissue/revocation or an explicitly versioned legacy path; it cannot
recover `H` from `D` by a deterministic DB migration. Already registered voters,
committed rolls, retention deadlines and imported read-only mirrors must remain
intact. A scheme-changing migration needs backup/restore and partial-cutover tests.

Before any selected contract is reported working:

1. Reconcile the authority records and publish an exact normative tuple: token
   encoding, wire field/length, storage preimage, signature preimage, ID scope,
   domain/version and label disposition. Resolve the separate idempotency policy.
2. Add independently checked positive and negative byte fixtures for `T`, encoded
   text, `H`, stored verifier, complete message and signature. Mutate domain/NUL,
   election/group ID, invite, key, version and any bound label independently.
   Reject wrong widths, padding and noncanonical encodings per the selected rule.
   Current browser base64url decoding does not re-encode to reject nonzero pad
   bits ([hex.ts:10–18](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/web/src/util/hex.ts#L10-L18)); canonical acceptance must be stated, not assumed.
3. Drive the real `registrationBody` through the real HTTP server using an issued
   invite in a permitted pre-commit state; assert the intended voter/key is stored.
   Keep malformed PoP, strict-key, revoked/expired/unknown, duplicate-key,
   used-invite and concurrent consumption cases. No second voter may consume an
   invite after successful registration. Assert the chosen retry/linkage semantics.
4. Retain post-roll-commit `403 REGISTRATION_CLOSED`, mirror refusal, quota/rate
   checks and operator-data retention. Test old-format outstanding invites,
   old-server/new-client, new-server/old-client, restoration and explicit cutoff.
5. Add a real browser/server successful onboarding journey (including failure
   display and key backup continuity). The existing fake-board refusal journey is
   insufficient. Search enrollment consumers before changing helpers; no CLI
   enrollment implementation was found in `packages/cli/src` or `bin` at this
   baseline. Reconcile the API schema, QV-04/19/28 text, notes and handoff claims.

These are acceptance criteria for a future authorized implementation. No tests
are weakened and no new conformance capability is claimed by this report.

## 6. Fresh verification and limits

On 2026-11-09, Node `v24.22.1`, isolated worktree at the pinned baseline:

```sh
node --test --test-name-pattern='^real server: permitted registration' packages/server/test/consolidation.test.ts
```

Result: **1 passed, 0 failed, 0 skipped**. The unchanged regression explicitly
observed actual web `registrationBody` returning `401 BAD_SIGNATURE`, then
successful raw-contract registration, and post-commit refusal. Its source is
[consolidation.test.ts:17–43](https://github.com/djshellshoxxx/quietvote/blob/51851c10c5ac33cd89f05f9e0af44fd43b41b930/packages/server/test/consolidation.test.ts#L17-L43).
A passing defect-preservation regression is not a passing web registration flow.

A temporary diagnostic using the same `World`, `registrationBody` and real signer
independently submitted three requests for one issued invite before commitment:

| Submitted form | Fresh HTTP observation |
|---|---|
| Unmodified web body | `401 BAD_SIGNATURE` |
| Web hashed wire value, only PoP replaced with server-layout signature | `422 INVITE_EXPIRED` |
| Raw issued code and server-layout signature | `201`, status `approved` |

The diagnostic used only synthetic fixture keys, asserted all three responses and
removed its temporary server data. The hash example above was independently
computed with Node built-ins. No browser run, full repository qualification,
timing/oracle study or independent cryptographic review was performed for this
documentation-only task. `git diff --check` is the documentation hygiene check.
