# QuietVote feature ledger — 2026-11-16 parallel continuation

This is the implementation inventory for the continuation starting at PR #51,
`5566c88c5e42d57fc1e50e2539d91aba16f2a30f`. It supersedes earlier inventories
for the specifically inspected features below. It does not claim that all
requirements have been assessed, that every feature is complete, or that a
release is qualified. Source inspection and executed tests are distinguished.

Status terms: **implemented** means the stated narrow capability exists;
**partial** means end-to-end scope or evidence remains; **absent** means no
corresponding application contract was found in the inspected modules;
**held** means a recorded unresolved policy/protocol decision; **external**
means evidence from people, infrastructure or supported devices is still needed.
An absent feature is not automatically a held decision: the contract work needed
to implement it is specified below.

## Integrated continuation outcomes

The table below updates the starting inventory without erasing its provenance.
The implementation is proposed in [draft PR #52](https://github.com/djshellshoxxx/quietvote/pull/52),
stacked on PR #51. It is not a completed-project or release declaration.

| Capability | Delivered in this continuation | Qualification boundary |
|---|---|---|
| Coordinator CLI lifecycle | Authenticated archive-driven body generation for all existing DKG, roll, open and close markers; existing signing/framing/relay commands remain explicit. | 65-test CLI lane, independent hostile-record probes; real-client registration still uses the existing fixture contract. |
| Connected organizer console | Pinned manifest, ceremony/open/close/tally preparation, trustee packet relay, partial coordinator co-signing, saved exact packet recovery, explicit review/send and authenticated acknowledgement handling. | Integrated web suite 312/312; hosted real-browser evidence is recorded in the continuation handoff. Native accessibility and translation review remain separate. |
| Combined executable acceptance | Actual server, coordinator/voter and trustee processes complete one election, exact 2-of-3 share release and tally, TypeScript verification and Python shared-report comparison. | Successful lane run 693.7 seconds; witness quorum zero and fixture enrollment. Later integrated candidate requires its own CI receipt. |
| Crash recovery | Durable webhook bridge, supplemental-event intents, atomic management responses/deletion tombstones, archived-election cleanup, mutation receipts and repeated-crash projection recovery. | Integrated server suite 269/269 plus three subsequently integrated independent floor probes; pending intents survive failures instead of silently losing state. |
| Private restore and backup hashing | Streamed checksums; revoked/deleted/suspended security-state floors, invitation terminal state, event cursors and operation-receipt generation/response checks. | Local adversarial snapshots and crash tests; no claim of independent witness/WAL freshness, offsite custody or live disaster-recovery qualification. |
| ElGamal rerandomization | Explicit-randomness additive library operation; identity/zero/cancellation rejection and plaintext-preservation coverage. | Crypto suite 93/93 plus independent review probes; required external crypto/protocol review is not replaced by agent review. |
| Python private audit | Signed-envelope and reveal-commitment validation plus exact ciphertext/proof regeneration. | Python lane 71/71 and five additional supported corpus cases; log-completion evidence is recorded separately after integration. |
| Python board and report completion | Independent Merkle/header/checkpoint/witness/receipt checks, all 13 legacy control cases, approved report dependencies and no-tally `INCOMPLETE`/exit 3. | All 282 unchanged corpus cases pass; strict shared-report comparator 27/27. Independent review receipts separate implementation evidence from unimplemented V13 authority/window effects. |
| CLI/web key portability | Shared QVKEY1 canonicalization, at most two KDF attempts with distinct legacy spelling, immutable legacy fixtures and signer temporary-buffer cleanup. | B3-25 follows existing ADR-027 approval; old CLI files may still require their original spelling. Trustee QVTB is a different format. |
| Modern enrollment | First-voter enrollment before DKG through real web/API/CLI paths, exact invite-bound proof, protected stored bearer verifier, persistent scheme discriminator and non-destructive migration preview. | Fresh elections use the modern scheme; legacy rows retain their original format/expiry. D99 pinned membership, group labels and historical invite/voter linkage remain distinct gaps. |
| Unsigned governance planning | Bounded policy/template validator and actual `qv policy-draft` CLI, with source conflicts exposed as diagnostics. | The T3 duration conflict remains visible. This does not implement signed GroupRules, ratification, proposal history, membership or dispute authority. |

The source-specific validation receipts, fresh review findings and remaining
contract work are tracked in the [continuation handoff](../handoffs/QUIETVOTE-TEAMS-CONTINUATION-20261116.md).
The core contract gaps below remain material; implementation counts do not measure
their completion. The [versioned governance proposal](../rfcs/governance-v1-contract.md)
specifies concrete envelopes, bindings, migration and unresolved time/authority
choices instead of carrying forward blanket approval holds.

## Core workflow inventory

Paths in the evidence column are repository-relative. Existing test names are
evidence locations, not new pass receipts. The lead must record integrated test
results separately after the parallel branches are combined.

| Capability | Status at starting snapshot | Source evidence / unfinished work | Workstream |
|---|---|---|---|
| Election creation and manifest configuration | Implemented slice; partial complete workflow | `packages/server/src/app.ts`, `packages/web/src/flow/publish.ts`, `packages/cli/src/cmd-online.ts`; web setup exposes organizer backup/enrollment and k/quorum/ballot settings. The connected post-publication operator path remains incomplete. | Organizer UI |
| Trustee ceremony, archive preparation and saved packet relay | Implemented slice | `packages/trustee/src/cli.ts`, `packages/cli/src/cmd-prepare.ts`; `packages/trustee/test/online-executable.test.ts` invokes shipped trustee commands and public preparation. No need to recreate those features. | Acceptance |
| Coordinator signing and board entry framing | Implemented slice; partial body generation | `packages/cli/src/cmd-packet.ts`, `packages/cli/test/packet-executable.test.ts`; real commands sign/frame records but test fixtures still generate some lifecycle bodies. | CLI lifecycle |
| One election through every shipped client | Partial | Separate trustee and coordinator/voter executable journeys exist. The starting handoff explicitly lacks one combined journey. Browser enrollment has a separate held contract mismatch. | Combined acceptance |
| Voter enrollment and pinned-roll admission | Held | `packages/server/test/consolidation.test.ts`, `docs/reports/registration-decision-20261109.md`, B3-01/D-99: server raw invite and web hash-bound PoP differ; pinned-roll admission/removal also needs resolution. | Owner/protocol, then server/web/CLI |
| Encrypt/cast/revote/audit | Implemented slice | `packages/protocol/src/ballot.ts`, `ballotlog.ts`; encrypted ballots, proof checking, revote selection and spoil separation exist. Complete real-client enrollment remains held. | Acceptance |
| Reload-safe uncertain cast and receipt lookup | Implemented slice | `packages/web/src/flow/ballot-controller.ts`; `packages/web/test/cast-alarm-delivery.test.ts`, `receipt-file.test.ts`, `receipt-code.test.ts`, `receipt-check-gate.test.ts`; keep unknown delivery distinct from accepted inclusion and verified tally. | Browser qualification |
| Offline receipt CLI | Implemented slice | `packages/cli/test/receipt.test.ts`; required external log key/origin/leaf anchors, signed promise versus inclusion exits. This does not establish witness quorum or tally correctness. | Qualification |
| Connected organizer ceremony/open/close/tally | Partial | Existing API/relay and initial organizer UI are present; post-publication connected controls are missing from the starting snapshot. Trustee secrets remain in the trustee executable. | Organizer UI |
| Crash-safe management, webhooks and supplemental events | Partial | `packages/server/test/idempotency-recovery.test.ts`, `outbox-rollback.test.ts`, `delete-recovery.test.ts`; request binding/deletion resume exist, but durable cross-database webhook bridging and complete lost-response reconstruction remain. | Server recovery |
| Backup verification and offline restore | Implemented slice; external activation checks | `packages/server/src/offline-backup.ts`, `packages/server/test/offline-backup.test.ts`, `docs/OFFLINE-BACKUP-RESTORE.md`; independent latest witness/WAL history and offsite encrypted custody are not established by a local restore test. | Ops / qualification |
| Durable gossip health | Implemented slice | `packages/server/src/gossip-health.ts`, `controldb.ts`, `packages/cli/src/cmd-online.ts`; persistent peer health and signed admin-status exist. Independent witnesses remain operational work. | Ops |
| Strict verifier agreement | Held for three report differences | `scripts/compare-verifiers.ts`, D-92–D-96 in `docs/plan/OPEN-DECISIONS.md`; 27/27 verdict and 24/27 detailed-report agreement are historical receipts, not this lane's execution. Do not change expected reports to make CI green. | Owner/protocol |
| Passphrase interchangeability | Held/partial | `packages/cli/NOTES.md` B3-25: exact spelling is documented, but CLI NFKC and web generated-word normalization differ. A shared policy needs legacy-container compatibility fixtures. | Owner + web/CLI |
| ElGamal rerandomization (T-028 library operation) | Absent at baseline; implemented in `2a685f5` | `packages/crypto/src/elgamal.ts` now exposes explicit-randomness rerandomization; no ballot acceptance path uses it. Four new regressions and all 93 crypto tests pass. Crypto/protocol review remains required before merge. | Inventory/crypto; fresh review next |
| Native translations and assistive technology | External | Review gates in `packages/web/src/i18n` remain intact. Automated browser checks do not provide native-language, screen-reader or disabled-user acceptance. | External reviewers |
| Supported platforms, release and deployment | External/partial | Launcher and `deploy/` examples exist; exact-candidate Windows/macOS/service/container, release-signature, disclosure-contact and governance evidence still need recording. | Ops/maintainers |
| Ranked/weighted/delegated voting, federation, stronger identity/anonymity | Deferred later phases | `docs/plan/ROADMAP.md`, QV-04 later phases, `docs/19-delegation-exit-fork.md`; these are not implemented v1 features and are not silently counted complete. | Separate approved scope |

## Missing core application contracts

The product requirements explicitly include these capabilities in the MVP.
They must not be described as optional future features simply because the
implementation omits them. Their absence also cannot be repaired solely by
adding controls to the current UI.

| Module | Required behavior | Observed implementation gap | Exact next implementation work |
|---|---|---|---|
| Signed GroupRules and templates | QV-02-REQ-002/003 and QV-03 §3/§6: bounded rules, threshold signatures, version/hash chain, templates, immutable election binding | `packages/protocol/src/rules.ts` only evaluates tally outcomes. `Manifest`/`ManifestContest` in `types.ts` have no group identity, `rules_hash`, decision class or proposal hash. No GroupRules schema, signature verifier, store or route was found. | Reconcile QV-03's `qv/1` rules/JCS hashing with the current `qv1-r255-sha2` manifest and strict schema. Specify versioned rules entry, trusted steward set and amendment activation. Then implement pure schema/chain/signature validation, negative corpus, persistence/API, CLI, templates/UI, and immutable manifest binding in both verifiers. |
| Proposal versions and review lifecycle | QV-02-REQ-020–024; QV-03 §6.1: bounded safe text, proposer permission/sponsors, hashed amendment chain, substantive-change review restart, schedule freeze, withdrawal | No proposal model, storage, route, chain or manifest proposal binding was found in `packages/{protocol,server,web,cli}`. A contest title is not a proposal history. | Specify canonical proposal record/hash, author authority from GroupRules, attachment/freeze boundary and substantive-dispute event. Build text validation, chain/state tests, review scheduling, API and CLI/UI, then bind the frozen version into the manifest and export/verifier evidence. |
| Membership state, rotation and revocation | QV-04 §§5–8; REQ-008/010/012/015: signed state transitions, two-key rotation, alias identity, delayed/vetoable recovery, revocation without changing quorum N | Current registration/roll commitment is per election. No `member.rotate`, `roll.amend`, `roll.revoke`, `E_KEY_ROTATED`, or alias-chain processing was found in production packages. Org admin-key revocation is a different feature. | Resolve B3-01/D-99 admission first; reconcile QV-04 snapshot-at-manifest prose with ADR-015 roll-commit. Define canonical group/nonce framing, replay rules, log entry types and activation indices. Implement both verifier alias/admission semantics with shared vectors, then server, CLI/UI and export. |
| Challenges, disputes and finality | QV-02-REQ-060–063; QV-03 §8: member-filed grounds/evidence, challenge window, arbiter signatures, decisions/finality | Board `ENTRY_TYPES` has no `dispute.filed`/`dispute.resolved`; the current lifecycle has no QV-03 CHALLENGED/RESOLVED/FINAL path. No evidence-body store or arbiter verification was found. An administrative invalidation is not an implemented dispute module. | Resolve D-32/33, arbiter authority and named-versus-sortition policy. Reconcile QV-02 stands/annulled/rerun outcomes with QV-03 STANDS/CORRECT/ANNUL and timeout behavior. Specify canonical records, evidence retention/access/export, finality/time authority and verifier effects; implement bounded files, authenticated routes, CLI/UI and adversarial end-to-end tests. |

Specific sources inspected: `packages/protocol/src/{types,schema,records,rules,ballotlog,logcheck}.ts`,
`packages/board/src/entry.ts`, `packages/server/src/{app,ext-routes,lifecycle,controldb}.ts`,
and production web/CLI files. A recursive production-source search for
`rules_hash`, `proposal_hash`, `member.rotate`, `dispute.filed`, `dispute.resolved`
and `E_KEY_ROTATED` found no corresponding implementation at the baseline.

These are cross-package protocol additions. Preparatory schema and state-model
work can proceed from an explicit design, but wiring a private UI-only model into
an election would not satisfy the signed/exported/independently verified contract.
The explicit registration and authority holds remain applicable; recommendations
in the older draft spec are not recorded owner decisions.

## Remote branch accounting

The lead fetched all origin heads. This lane inspected **57** nonsymbolic origin
branch tips against `5566c88`: **50** are ancestors; **7** diverge. Ancestry and
`git cherry` output are recorded in
[quietvote-teams-branches-20261116.json](quietvote-teams-branches-20261116.json),
including every tip SHA and unique commit's changed files. This is source
accounting, not a semantic guarantee about all inherited code.

| Divergent branch | Unique / equivalent patches | Disposition |
|---|---:|---|
| `chatgpt/quietvote-visual-ci-repair-20261102` | 0 / 1 | Signed equivalent already integrated; no new implementation. |
| `chatgpt/zero-codex-continuation-spec-20261109` | 1 / 0 | Historical continuation instructions only. |
| `claude/docs-screenshots` | 1 / 0 | Obsolete spec-only/no-UI README status; do not replace current docs. |
| `claude/haiku-T01-baseline` | 1 / 0 | Historical qualification receipt for a different snapshot. |
| `claude/laughing-volta-61srfa` | 5 / 0 | Previously inventoried held #27 authority/rollback/control/export-ack/lazy-preload work and rejected WIP; no wholesale merge. |
| `docs/readme-and-wiki` | 1 / 0 | Older wiki/README prose; current `wiki/` has later content. |
| `planning/future-cli-specs-20261110` | 1 / 0 | Draft CLI proposal only; no executable code to recover. |

The held branch's five unique commits are `13b86c2`, `07fd61c`, `b2f043e`,
`80c3a17`, `2aaf0a0`. Their detailed feature-level disposition is retained in
[the preceding inventory](resume-20261116-inventory.md#unique-held-27-lane-feature-level-accounting).
There is no newly discovered unaccounted implementation branch in this snapshot.
No source branch was merged, rewritten or deleted by this lane.

## Dependency order and handoff

1. Combine and qualify the current server recovery, organizer UI, lifecycle CLI
   and combined acceptance lanes. Record exact commits and unresolved failures.
2. Fresh review checks the new rerandomization helper and its proof-invalidation,
   identity and input requirements. Protocol/crypto approvals remain separate.
3. Resolve the existing registration, verifier and authority decisions with a
   concrete versioned contract and legacy compatibility strategy.
4. Implement GroupRules before proposal authority/review scheduling; bind the
   resulting immutable proposal version into manifests. Implement membership
   aliases and dispute records with both verifiers and shared negative vectors.
5. Complete external operational, independent security/protocol, native-language,
   accessibility and platform qualification before any release-completion claim.

The implementation milestone and exact local validation for this lane are in
[the handoff](../handoffs/QUIETVOTE-TEAMS-INVENTORY-20261116.md). No percentage is
assigned: draft requirement counts and test counts do not measure feature
completion, and these missing core contracts materially affect the project scope.
