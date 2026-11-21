# QuietVote core implementation handoff — 2026-11-17

This is an AI-assisted engineering handoff, prepared on 2026-11-18 UTC using the session's Pacific date in the filename. It preserves the D-99 source assessment, the remaining PR #27 recovery dependencies, and the distinction between B3-06 content phase and authenticated freshness. **The runtime work described here is not implemented by this report.** No runtime edits, deployment, production-data exercise, or formal approving review accompanies it.

## Exact source and decision binding

| Purpose | Exact source | Scope |
|---|---|---|
| Canonical runtime | `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`, tree `7775a2d439e04bf6d011e32ffdcc3ff48ad4b34c` | D-99 and B3-06 source assessment; current recovery rechecks |
| Accepted ADR-029 / D-99 | `fd23cb3a481328a2b6315ae34cc2ee589b31aead`, tree `4a604875a11b95ced96c4ccb38aff03124242826` | The accepted decision is present on PR #57; it is not a pinned-roll runtime implementation |
| Historical PR #27 | `2aaf0a01816afb256a804c23dd45de86eca2a993` | Recovery provenance; selective compatible ports only |
| Historical rollback/reason source | `13b86c22f973aee91453090b2ec5bcff104e8804` | Source material with incompatible migration numbering and incomplete signing-path coverage |
| Historical export source | `07fd61c83c89dd220403fe8df5dab4b3533b79de` | Source material predating current jobs, receipts, and deletion recovery |
| Prior PR #27 source audit | `25d26aa3dc35127015100ace20419c57509ed338` | Original residual assessment, retained in the linked report |
| Historical finding evidence | `9a03414e0e826db292f9dd5728e4d3d2f0682784` | PR #58 evidence concerns historical runtime `424110d90e23dc443aa4498a4340973d3c8cb8b6`; it is not a current qualification receipt |

Runtime locations in this handoff refer to the canonical commit unless a different source is explicitly named. See the [current reconciliation](consolidation-current-recheck-20261117.md), [PR #27 residual review](consolidation-pr27-residuals-20261117.md), and [historical B3 reconciliation](consolidation-web-recheck-20261117.md) for their separate evidence boundaries.

## Approved decisions versus unfinished technical contracts

[ADR-027](../decision-log.md) accepts the recommended defaults in the [2026-11-04 decision register](../plan/DECISIONS-2026-11-04.md). ADR-028 settles hashed invitation registration. ADR-029 at the exact PR #57 source above settles D-99 option A. Earlier blanket owner holds do not reopen these accepted choices.

| Work item | Approved behavior | Technical contract or integration work still missing |
|---|---|---|
| D-99 | Refuse off-roll registration without state change; pinned commitment depends on the manifest, not complete registration | Authenticated full-list input, persistence, historical attachment, complete membership reads/replay/export |
| B2-07 | Local monotonic floor plus authenticated startup witness/peer evidence; quarantine on mismatch | Crash/exposure ordering, every signing path, bounded evidence acquisition and unavailable-peer behavior |
| N-32(b) | Recorded export acknowledgement or accepted 30-day grace before archived deletion | Stable export snapshot, completed acknowledgement semantics, durable jobs/receipts, both deletion entry points |
| B2-16 C-lite | Catalog-only public reason codes for new control operations | Shared catalog and new-admission/client enforcement with explicit legacy read compatibility |
| B2-05 | Signed monotonic `control_seq`, checked by server and both verifiers | Counter activation/legacy boundary, all producers, replay reducers and negative coverage |
| B3-06 | Signed-control phase derivation, gated on authenticated STH freshness | Live action gating and complete log qualification; renewable authenticated age, expiry and zero-witness behavior |

Owner authorization permits implementation of the accepted behavior. This report does not silently choose a new delegation model, voting deadline extension, witness requirement, public record format, or legacy rejection rule. New technical fields and endpoint spelling must be documented in the implementing change; genuinely different policy needs its own recorded decision. Source review and automated tests do not replace the repository's required human/security approvals.

## D-99: complete pinned-roll implementation boundary

The following preserves the full technical assessment. All steps remain proposed at the canonical runtime source.

### Approved behavior and scope boundary

ADR-029 was accepted by the project owner on 2026-11-18. In pinned mode, registration of a key outside the pinned roll must receive a typed refusal without state change. `roll_commit` must be checked against the manifest's pinned roll only; pinned members who never register must not block commitment. ADR-028's hashed invitation and invitation-bound proof-of-possession bytes remain unchanged.

The owner decision already exists. The remaining gap is a technical input contract for an authenticated full pinned list or a membership proof. This handoff recommends the full-list path; it does not propose a voter-removal policy, new cryptographic framing, changes to signed manifest bytes, or changed historical verification rules.

**Canonical runtime has no authenticated pinned-roll list input for an active election.** The smallest coherent new-election implementation is a persistent pinned-list source supplied through the existing signed creation request, then bound to the signed manifest's root and size. Repairing already-published pinned elections additionally requires a way to attach the same authenticated list. Creation alone cannot supply their absent members.

### Existing paths and gaps

| Path | Current behavior | D-99 implication |
|---|---|---|
| Signed `POST /orgs/:org/elections` | Accepts only `title` and `access`; creation uses request-body-bound idempotency and an election DB transaction. | Best existing transport to extend for new elections. |
| Signed `PUT /elections/:id/draft` | Stores arbitrary JSON opaquely; allowed only in `DRAFT`. Runtime never reads a pinned list from it. | Draft content is not currently a list contract or verified membership source. |
| `POST /registrations` | Accepts invitation, public key, algorithm and PoP; validates them, then consumes the invitation and inserts an approved voter. | No membership proof or pinned-list check exists. |
| `.qvb` import | Verifies an election and full roll, then creates an `IMPORTED` read-only mirror without signing keys or invitations. Existing election IDs are refused. | Supplies an authenticated list for mirrors, but cannot populate an active setup election. |
| `roll_commit` | Computes a root from approved voter rows, requiring both the commitment and manifest pins to match that set. | Extra registrations and absent members both block commitment. |

Principal source locations:

- [packages/server/src/app.ts](../../packages/server/src/app.ts): signed creation route around line 354, opaque draft route around line 391, registration around line 614, public roll around line 656, voter status around line 670.
- [packages/server/src/pool.ts](../../packages/server/src/pool.ts): `ElectionPool.create`, including the election-owned creation transaction and operation receipt callback.
- [packages/server/src/imports.ts](../../packages/server/src/imports.ts): `verifyBundle`, `VerifiedBundle.roll`, and `commitImport` / `initImported` / `importVoters` flow.
- [packages/server/src/election.ts](../../packages/server/src/election.ts): `vManifest`, `vRollCommit`, `project`, and replay's `apply` handling of `roll_commit`.
- [docs/reports/registration-implementation-20261116.md](registration-implementation-20261116.md): remaining-contract note explicitly records the absent full-list/proof input.

### Recommended implementation

#### 1. Persist membership separately from registration

Add an additive election DB migration for the canonical pinned list, its deterministic ordering, and root/size binding. Keep the list distinct from registered voter rows.

This distinction is necessary because `voter.registered_at` is non-nullable and `GET /voters/:kid` currently reports registration using `!!voterRow`. Seeding absent members into `voter` would fabricate registration facts. Calling existing `commitRoll()` with a full list is also insufficient: it only updates rows that already exist.

Introduce one explicit canonical-roll accessor with these sources:

- Pinned mode: the authenticated full pinned list.
- Unpinned mode: the existing approved-voter list.
- Historical committed election: preserved committed membership, checked against its existing commitment.

Use that accessor consistently for commitment validation, replay, exports, roll-size calculations, and public roll reads. `/roll` pagination currently resolves cursors through the voter table; it must also resolve an absent pinned member. The complete pinned list must remain the quorum denominator even when registration is incomplete.

Relevant source:

- [packages/server/src/electiondb.ts](../../packages/server/src/electiondb.ts): `approvedKeysHex`, `commitRoll`, `voters`, `voterCount`, `voter`, `importVoters` and voter schema.
- [packages/server/src/election.ts](../../packages/server/src/election.ts): replay `apply('roll_commit')` currently constructs `rollSet` from `approvedKeysHex`; later ballot analysis and tally construction consume `rollSet.size`.
- [packages/server/src/export.ts](../../packages/server/src/export.ts): `electionBundle` currently exports `rollSet` or approved keys.
- [packages/server/src/app.ts](../../packages/server/src/app.ts): roll enumeration and `registered: !!v` voter status.

Preserve existing ballot admission and author-resolution semantics unless a separately documented requirement requires changing them. ADR-029's absent-member commitment rule does not require silently marking absent members as registered.

#### 2. Extend the authenticated create path for new elections

An optional creation field containing the sorted public keys is a proposed technical contract, not an existing API field.

Requirements:

- Validate canonical fixed-width keys, strict Ed25519 points, strictly ascending order, duplicates, and existing voter/request limits. Reuse `rollRoot` for the established roll leaf and Merkle-root algorithm; explicitly retain canonical input spelling checks at the wire boundary.
- Persist the list in the same transaction as election creation and its operation receipt.
- At manifest admission, require the signed `roll.root` and `roll.size` to match the stored list exactly.
- Preserve unpinned creation and first-voter enrollment before a manifest.
- Do not trust similarly named fields in an opaque draft.
- Keep immutable request/list binding across idempotent retries and crash recovery.

The create route currently permits 4,096 bytes. A list requires an explicit route-body adjustment within existing global limits. Default `maxVotersPerElection` is 10,000, configurable up to 100,000; the global request ceiling is 1,153,434 bytes. A default-sized hex-key list fits within that ceiling, while a 100,000-key list does not. Enforce and document the existing request-size boundary; do not truncate lists or silently raise global limits. Supporting larger pinned lists would need a separate bounded transfer design.

Sources: [packages/server/src/app.ts](../../packages/server/src/app.ts), `pool.ts`, `auth.ts`, `http.ts`, `config.ts`, and [packages/protocol/src/manifest.ts](../../packages/protocol/src/manifest.ts) (`rollLeaf`, `rollRoot`).

#### 3. Enforce pinned membership before election-state mutation

For a pinned election with an authenticated list:

- Check submitted key membership before the consumed-invitation success shortcut and before `consumeInvite` / `addVoter`.
- Return a documented typed off-roll refusal.
- Preserve invitation state, voter rows, and public log state on refusal.
- Keep ADR-028's bearer hashing and PoP framing unchanged.
- Validate `roll_commit` against the complete pinned list and manifest only; registration completeness is irrelevant.
- Preserve the existing approved-registration commitment rule in unpinned mode.

If the manifest pins a roll but the authenticated list is unavailable, return a distinct unavailable refusal. Missing list data must never be interpreted as unpinned mode.

#### 4. Handle already-published pinned elections explicitly

Neither creation nor the existing draft route can attach a missing list to an already-published active election. A complete recovery path therefore needs an authenticated, idempotent list attachment operation. Endpoint and field spelling remain to be specified in the implementation's API contract.

Required behavior:

- Reuse the existing election/organization authorization boundary.
- Require exact equality with the already signed manifest root and size.
- Make membership immutable after attachment; accept an identical retry, refuse different contents.
- Keep imported mirrors read-only.
- Serialize attachment with lifecycle changes through the existing runtime mutex.
- Preserve signed manifests, registration schemes, invitation binding, and the existing policy against inventing a voter-removal route.

The accepted owner decision authorizes the underlying behavior. This missing list-input contract does not require reopening the owner policy decision.

### CLI and browser callers

#### Browser

`PublishInput.rollHex` already contains the complete checked roll. `publishElection()` currently passes only title to `createElection()` and retains only root/size in publication state. Extend the existing signed creation call and resumable-state validation so that the exact submitted list remains bound across retries. Update comments that require every pinned member to register before commitment.

Relevant files:

- [packages/web/src/flow/publish.ts](../../packages/web/src/flow/publish.ts)
- [packages/web/src/flow/organizer.ts](../../packages/web/src/flow/organizer.ts) (`parseRoll`, `buildManifest`)
- [packages/web/src/api/client.ts](../../packages/web/src/api/client.ts) (`createElection`, `register`)
- [packages/web/src/api/types.ts](../../packages/web/src/api/types.ts)
- [packages/web/test/publish.test.ts](../../packages/web/test/publish.test.ts)

#### CLI

`cmdOnlineElectionCreate()` currently sends title/access only. Add a bounded list-file input with deterministic validation. Enrollment needs no cryptographic change. `cmd-lifecycle.ts` already validates an archive's full roll against manifest pins before drafting a roll commitment; corrected server exports should provide this existing path with complete membership.

Relevant files:

- [packages/cli/src/cmd-online.ts](../../packages/cli/src/cmd-online.ts)
- [packages/cli/src/cmd-lifecycle.ts](../../packages/cli/src/cmd-lifecycle.ts)
- Associated online creation/enrollment and lifecycle tests.

Update [docs/09-api-data-contracts.md](../09-api-data-contracts.md) and the actual API schema/help alongside the implementation. Do not describe a proposed input field as already supported.

### Migration and historical-readability constraints

Election schema is version **9**, control schema version **7**. The next additive election migration is **10** and the next additive control migration is **8**. Preserve every earlier SQL string: `migrate()` verifies the checksum of every applied migration. No control schema change is inherently required for a per-election list. D-99 and recorded exports both need election-owned persistence; coordinate their allocation so the two implementations do not independently claim version 10. The second integrated migration must take the next unused version, or a deliberately combined migration must be reviewed as one change.

Preserve:

- Recorded `legacy-raw-v1` and `hashed-pop-v1` assignments.
- Existing signed log bytes and historical replay.
- Readability and export of previously committed and imported elections.
- Existing invitation privacy and absence of an invite-to-voter linkage.
- Existing backup security floors.

A historical committed pinned election can reconstruct its complete list from committed membership only after verifying root and size. A historical uncommitted subset cannot reveal missing public keys. New write-time admission gates must not be applied as new historical log-validation rules during replay.

If list provisioning can occur after creation without advancing the public log, include the immutable list binding in backup rollback checks, following existing registration-scheme and operation-receipt protection. Raw database presence alone is not a new trust anchor.

Relevant files:

- [packages/server/src/electiondb.ts](../../packages/server/src/electiondb.ts)
- [packages/server/src/db.ts](../../packages/server/src/db.ts)
- [packages/server/src/election.ts](../../packages/server/src/election.ts)
- [packages/server/src/offline-backup.ts](../../packages/server/src/offline-backup.ts)
- [packages/server/src/backup-security-floor.ts](../../packages/server/src/backup-security-floor.ts)

Existing migration tests explicitly synthesize schema versions 5, 6 and 8 by dropping later tables/columns. When adding migration 10, preserve those fixtures as genuine old schemas; do not edit historical migration SQL to make them pass.

### Acceptance criteria

1. A valid invitation and PoP for an off-roll key produce the typed refusal, leaving invitation, voter and log state unchanged.
2. One pinned member never registers; roll commitment succeeds. Full membership survives restart, paginated `/roll`, export and import, and remains the quorum denominator.
3. A matching pinned key registers successfully. Invalid PoP and invalid/expired/revoked invitations retain existing results.
4. Wrong root/size, duplicate or malformed list, missing list and conflicting attachment fail closed. Identical retry preserves exact membership.
5. Unpinned creation, first enrollment before manifest, and approved-set commitment remain unchanged.
6. Pre-upgrade committed elections and imported mirrors remain readable. Legacy registration schemes remain unchanged.
7. A backup cannot replace an attached list with an absent or different list.
8. Actual browser publish and CLI create paths use signed management requests and provide the exact list later authenticated by the manifest.
9. List attachment and lifecycle transitions cannot race to validate against one list/state and commit another.
10. Absent pinned members are not falsely reported as having registered.

### Implementation stop conditions

Do not ship only removal of the approved-set comparison in `vRollCommit`: admission would remain unchecked and replay/export membership would remain incomplete.

Do not infer absent membership from approved voters, trust arbitrary draft JSON, seed fake registration rows, convert imported mirrors into active elections, change ADR-028 bytes, rewrite historical migrations, or claim creation-only support repairs already-published elections.

## Remaining PR #27 recovery dependencies

The [prior residual review](consolidation-pr27-residuals-20261117.md) remains the detailed historical port receipt. Default 14-day invitation expiry, invitation retention, IPv6 /56 handling, request-log minimization, and keyless receipt refusal already arrived through reviewed newer history. Do not replace their current implementations with historical files. Lazy-module integrity is tracked separately; its source or browser evidence does not qualify the recovery work below.

### Runtime rollback floor: B2-07 remains incomplete

The canonical [offline restore path](../../packages/server/src/offline-backup.ts) requires a separately supplied minimum backup and checks instance, election identity, log key, size, and prefix root. Its [private security floor](../../packages/server/src/backup-security-floor.ts) also preserves revoked keys, organization and webhook restrictions, unexpired replay/idempotency state, forwarding cursors, operation receipts, registration schemes, and invitation/erasure state. These protections apply to explicit verified restore. They do not continuously record the last externally released signed head outside the live election DB.

The current reconciliation records that the known runtime rollback mechanism still reproduces when only the election DB is replaced with a coherent older snapshot. Current gossip can detect later evidence, but it is not a mandatory gate before the first post-startup signature. This report incorporates that existing evidence; it does not publish private reproduction scripts or claim a new production exploit.

The historical `13b86c2` patch cannot be applied unchanged:

- Its control migration 5 collides with existing gossip health, deletion recovery, and webhook cursor migrations. The next additive control migration at canonical is **8**.
- It predates append-completion intents, durable management receipts, webhook forwarding, poison/reload handling, and the current private restore floors. Anchor persistence must fit these transaction and exposure boundaries.
- Its startup polling covers public gossip peers but not a complete configured-witness read path, and excludes link elections. That is only part of the approved option B.
- Its `bootGossipPending` check is inside `processLocked`, while `append` can return an identical-entry result through `precheck` / `outcomeFor` first. A duplicate promise receipt can therefore reach signing before the historical boot check.
- Same-size/different-root results from its floor-raising API must be handled as explicit refusal/quarantine, not ignored as an ordinary write result.

A complete next slice must add a monotonic authenticated `(size, root)` floor in [ControlDb](../../packages/server/src/controldb.ts), check it before **every** new signature including duplicate receipts, and persist it before exposing the associated receipt/checkpoint/events. Rollback or a same-size fork must leave evidence readable while signing is refused. Current [ElectionRuntime](../../packages/server/src/election.ts) recovery and event transactions must retain their ordering. Imported/keyless mirrors cannot claim an own-key signing floor.

Integrate the floor with offline restore and test schema7-to-8 upgrades, single-file rollback, same-size fork, duplicate submission, floor-write failure, both sides of the election/control commit boundary, repeated restart, and mirror behavior. A co-located local floor cannot defeat whole-disk rollback; bounded authenticated startup witness/peer acquisition is the separate required increment. Test unavailable peers and private link-election handling without leaking access capabilities. Do not claim that periodic gossip or a passing offline restore test completes this startup-signing contract.

### Recorded export and deletion acknowledgement: N-32(b) remains absent

[GET export routes](../../packages/server/src/app.ts) and the [export builder](../../packages/server/src/export.ts) produce current QVB/JSON downloads. They do not create a persistent export record or acknowledgement. [ElectionPool.remove](../../packages/server/src/pool.ts) already checks replayed lifecycle state and supports durable tombstones, key destruction, and resumable cleanup; the [admin route](../../packages/server/src/ext-routes.ts) has its own job/preflight entry point. Preserve that recovery behavior.

Historical `07fd61c` uses election migration 6, now occupied by the webhook bridge floor; versions 7-9 hold append completion, operation receipts and registration scheme. The next additive election version is **10**. D-99 needs election persistence too: allocate migrations in final integration order rather than assigning version 10 independently in both changes. Existing migration SQL/checksums must not change.

The implementation needs:

1. A bounded export record tied to an exact public snapshot: tree size/root, bundle digest, creation/expiry and acknowledgement.
2. Snapshot generation through current job, idempotency and election-owned response-journaling patterns, with unambiguous retry/crash behavior.
3. An explicit acknowledgement contract. The old patch records acknowledgement before a download response completes. An admitted or aborted transfer is not proof of completed receipt; either implement justified delivery semantics or a documented explicit organizer acknowledgement. Preserve the approved 30-day grace alternative.
4. A gate in authoritative `pool.remove` before tombstoning or key destruction, plus organizer/admin preflight. Do not lose the existing replayed-state check. Accepted N-32(b) targets ARCHIVED; reconcile the broader CANCELLED/ABORTED/IMPORTED wording in [QV-28](../28-data-model-storage.md) separately rather than claiming it is covered.
5. Schema9-to-next-version upgrade and old-database opening tests; wrong/stale tree or digest; changing checkpoint cosignatures after record creation; failed/aborted download; first acknowledgement preservation; exact grace boundary; both delete routes and direct pool use; repeated crash/retry recovery.

The old snapshot reconstruction depends on a pinned creation time but can change when checkpoint cosignatures change. Pin actual bytes or otherwise prove deterministic reconstruction of the recorded digest. Preserve existing request/rate limits while avoiding a generation/download interaction that makes the recorded export inaccessible to its requester.

### Public control reasons and control replay are distinct unfinished work

[Server control admission](../../packages/server/src/records.ts), the [CLI packet builder](../../packages/cli/src/cmd-packet.ts), [TypeScript log checking](../../packages/protocol/src/logcheck.ts), and [Python log checking](../../verifier-py/qv_verifier/logcheck.py) retain bounded free-text reasons. Existing signed corpus records contain values such as `outage` and `tie-break`. The Python path deliberately documents legacy N-12 compatibility.

The historical reason change restricts server admission to 14 QV-07 catalog codes. Copying that file does not update current packet producers or define the independent verifiers' historical/new acceptance boundary. The smallest sound slice shares a canonical code catalog across **new packet generation and live admission**, rejects noncatalog input before append or public logging, and tests the unchanged historical read path. Retain optional reason omission unless the accepted catalog contract says otherwise.

The current replay reducer applies already-admitted control actions; it is not a substitute for new-admission validation. Keep old stored controls readable through replay, import, backup verification and offline verification. Tightening a parser shared with any of those paths can reject previously signed history. Do not rewrite signatures, edit shipped vector expectations to hide the difference, or claim server-only enforcement establishes TS/Python parity. Full verifier enforcement needs an explicit legacy/new record acceptance distinction and paired tests.

B2-05 is a separate freshness issue: an old signed control body can be resubmitted under a new board header. The current reconciliation records that this known mechanism remains reproducible on canonical. ADR-027 chose a monotonic signed `control_seq` checked by server and both verifiers, not a blanket ban on identical bodies that would also forbid legitimate repeated controls. Coordinate that version/activation boundary with reason-code admission and client generation. Neither catalog wording nor a client-side phase reducer supplies replay protection. Preserve the accepted manifest-hash signature scope and distinct-coordinator threshold until the documented counter contract is implemented.

## B3-06: phase content is not authenticated freshness

This section incorporates the independent branch-inventory handoff at canonical `72bccc6ac7881f0e6b7c21e1c111ee8f34b95a54`. That lane made no B3-06 runtime change. Its current HTTP observation was: a genuine quorum-signed pause produced server `PAUSED` while the browser-derived phase remained `open`; the generic refusal mapped to `E-API-UNAVAILABLE`, so the former false CLOSED error mapping is already repaired. See the [B3 recheck](consolidation-web-recheck-20261117.md) for the historical classification and separate selected-test receipt.

### Small content-phase increment

[Web phase derivation](../../packages/web/src/flow/election.ts) has no `paused` phase or control case at canonical. A scoped improvement can recognize signed pause/resume content and prevent new ballot work, but must retain these boundaries:

- Validate the complete closed control record before signature verification. Its scope is `recordDigest(manifestHash, 'control', body)`, not DKG context. Require the manifest's `coordinator.m` distinct allowed coordinator signers. Current manifest/validation has no trustee-delegation representation; a trustee or operator is not implicitly authorized.
- Authenticate entry header/type/body binding for a qualified log, not just the body signature. Current [entry decoding](../../packages/web/src/flow/entries.ts) and phase loading discard some header/leaf evidence. Authorized content alone does not authenticate server-supplied order or prove complete/current coverage.
- Replay validated order: OPEN to PAUSED, PAUSED to OPEN, either to CLOSED. Reject impossible authenticated histories for new actions; invalid, cancelled, aborted, closed or tallied history cannot be reopened by a later resume. Security notices are not pause/resume.
- Do not add a new closing time, pause credit, witness waiver or implicit delegation. The current control schema does not carry those contracts.

The [vote view](../../packages/web/src/ui/app.ts) captures its context once; [live refresh](../../packages/web/src/flow/live.ts) replaces the current context, but the vote view does not install the repaint hook needed to update an already displayed ballot. A type-only phase change is therefore insufficient. Check current eligibility when sealing/casting/posting an audit, update in-place controls after authenticated changes, retain route/generation guards, and prevent the code-rendered microtask from re-enabling buttons after a pause. If a later derivation fails, retaining old display evidence must not retain permission to vote from an old OPEN context.

Use distinct paused copy rather than the closed-time paragraph. Preserve local checking/downloads, [pending delivery reconciliation and receipt evidence](../../packages/web/src/flow/ballot-controller.ts), accepted receipts, and idempotent same-byte recovery. A pause must not relabel a submitted ballot as unsent or erase evidence. The server remains authoritative for admission races after the last client check.

### Why a phase patch cannot close the accepted freshness gate

ADR-027's B3-06 option A is explicitly gated on STH freshness, citing the 60-second OPEN/PAUSED cadence in [QV-07](../07-threat-model-security.md). Canonical does not provide a renewable authenticated 60-second clock:

| Boundary | Current behavior | Qualification limit |
|---|---|---|
| [Checkpoint text](../../packages/board/src/checkpoint.ts) | Log signature covers origin, size and root; extra text lines are rejected. | An added timestamp would change the checkpoint contract. |
| Witness times | Signed witness timestamps exist, with an online future bound but no lower-age policy. | Zero-witness elections have no such authenticated time; `witnessed` alone does not mean recent. |
| [Same-head storage](../../packages/board/src/log.ts) | Unchanged size returns the existing note; cosignature attachment adds a witness name only when absent. | A newer signature from the same witness does not renew that witness's stored time. |
| Server SSE | Current `issued_at` appears in an event, not the signed checkpoint text. | Successful contact or SSE activity cannot prove freshness against a withholding operator. |
| [Live refresh](../../packages/web/src/flow/live.ts) | Returns early when there are no new entries. | It does not expire an unchanged authenticated head. |

The branch-inventory lane also executed a bounded in-memory observation: after advancing the synthetic clock by 120 seconds, an unchanged head retained its old note/time even when a newer valid cosignature from the same witness was offered; `witnessed` remained true. This is source/API evidence, not browser, network deployment or external-security qualification. Private scripts and synthetic input artifacts are not included in this report.

Full closure requires complete ordered header/body coverage bound to the root, authenticated origin/manifest identity, consistency against the saved pin, a renewable authenticated freshness measure, local age expiry without SSE, and explicit unavailable behavior for old/missing/insufficient evidence. Body-only records, client fetch time, header `createdAt`, and untrusted SSE `issued_at` are insufficient.

The existing witness timestamp mechanism is a possible building block. Same-head renewal, zero-witness handling, and the interaction between a 60-second age bound and the existing online +300-second future-skew allowance in [QV-18](../18-bulletin-board-transparency.md) need a concrete contract. Do not silently require new witnesses or invent heartbeat protocol records in a content-phase patch. Even a freshly cosigned consistent prefix does not prove that an operator disclosed every later record to every witness. Keep that threat-model limitation explicit.

### B3-06 acceptance boundary

1. Test valid threshold pause/resume, repeated cycles, close while paused, terminal-state preservation, malformed actions/fields, invalid order and shuffled input according to the documented sequence contract.
2. Reject insufficient/duplicate signers, outsider/operator/trustee keys without delegation, wrong manifest, bad signatures and DKG-context signatures. A header alone cannot establish record quorum.
3. Prove forged phase SSE cannot grant permission; a genuine appended control updates phase; a failed update cannot leave old OPEN eligibility active.
4. Exercise the actual vote view: initial pause, pause during selection, sealing and code display, then legitimate resume. Cover new seal/cast/audit gating, the re-enable microtask, route departure, pending outcomes and receipt recovery.
5. Preserve existing missing-time error fallback and late-response lifecycle tests. Run the production browser journey that exercises changed controls; source assertions are not browser execution.
6. For a full freshness claim, test old same-size heads, withheld controls, forged SSE times, missing quorum, invalid/duplicate witness signatures, wrong roots/order, pinned rollback/fork, idle expiry, valid renewal and future timestamps. Until the contract and these checks exist, retain partial status.

## Verification and completion limits

This deliverable changes documentation only. D-99 was a static source assessment. The B2/B3 observations cited above are attributed to their prior canonical-source rechecks; no new runtime or browser test was executed to write this report. The linked reports retain their own source and execution receipts. Historical findings, accepted decisions, implemented slices, local passing tests, hosted CI and required approving reviews are separate categories of evidence.

Nothing here closes the entire PR #27 residual list, implements D-99 or B3-06, changes the immutable corpus, qualifies W15, supplies missing human/security approvals, or establishes production/election readiness. Implementation must be reviewed and qualified on its final exact source, with historical readability and current recovery semantics preserved.
