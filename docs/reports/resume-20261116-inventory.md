# QuietVote continuation inventory — 2026-11-16

This is a report-only engineering inventory, not an external security audit, release approval or a claim that the actionable backlog is exhausted. QuietVote remains an experimental prototype. The current assignment resumes development; the historical pause does not authorize overriding held protocol choices, merging protected main, releasing or deploying.

## Snapshot and method

- Reviewed integration ref: `codex/quietvote-resume-20261116` at `182cb508503c1ee5f6e6410a7beed6abcd02423c`.
- Starting remote integration ref: `5382d5f89226a7464025480c3a6be606da79859a`.
- Sources: current source and test files; `README.md`; `docs/SPEC-INDEX.md`; QV-16 protocol and Appendix C; `docs/decision-log.md`; `docs/plan/TODO.md`, `OPEN-DECISIONS.md`, `CONSOLIDATION.md`, `CONSOLIDATION-MATRIX-20261111.md`; the completion/milestone/next-phase handoffs; `docs/reports/inventory-20261111/`; dated audit reports and `docs/audits/` blue-team passes.
- Historical inventories are discovery leads. Their snapshots and test totals do not describe this candidate. In particular, old audit summaries still call S1-02 absent, and old package notes describe already-added dependency and traceability scripts as missing.
- This inventories selected core workflows and high-value security/operational tasks. It does **not** individually verify all 730 traced requirements or equate a traceability link with satisfaction.
- Tests named below are evidence locations. Unless an executed result is explicitly stated, their existence is not a new execution receipt. The lead must append exact-candidate tests, commit/tree IDs and independent review outcomes after integration.

Status vocabulary: **COMPLETE** applies only to the narrowly stated behavior with focused evidence; **PARTIAL** means some working implementation exists but acceptance is unfinished; **MISSING** means the inspected interface lacks the behavior; **BLOCKED** requires a specified owner/external decision; **DEFERRED** is outside this continuation's approved scope. Owner labels are recommended workstream ownership, not claims that a worker remains active.

## Core feature matrix

| ID / priority | Description | Current code | Missing behavior / acceptance | Dependencies | Owner | Evidence tests | Status |
|---|---|---|---|---|---|---|---|
| LIFE-01 / P0 | Create and configure election | `server/src/app.ts`, `config.ts`, `protocol/src/manifest.ts`; web publish flow | Organizer CLI and connected organizer journey; approved manifest-bound choices | CLI-01; registration/authority holds | Server + CLI + Web | `server/test/consolidation.test.ts`, `negative.test.ts`; `web/test/publish.test.ts` where applicable | PARTIAL |
| LIFE-02 / P0 | Trustee setup and DKG | `trustee/src/trustee.ts`, `cli.ts`; `protocol/src/dkg.ts` | Real shipped-client ceremony relay in full acceptance journey; remaining custody/release edge review | Existing approved protocol only | Trustee + integration | `trustee/test/ceremony.test.ts`, `lifecycle.test.ts`, `hardening.test.ts`; server HTTP e2e | PARTIAL |
| LIFE-03 / P0 | Eligibility and voter registration | `server/src/app.ts`; `web/src/flow/onboarding.ts` | Web hashes invite and binds different PoP bytes than raw-code reference server; do not silently patch either side | B3-01 / ADR-028 exact bytes and migration | Owner + protocol; Server/Web after ruling | `server/test/consolidation.test.ts` explicitly reproduces `401 BAD_SIGNATURE` | BLOCKED |
| LIFE-04 / P0 | Encrypt, cast or audit | `crypto/src/`, `protocol/src/ballot.ts`; web ballot controller and CLI encryption | Fully connected client journey, reload persistence of uncertain delivery, broader adversarial cases | LIFE-03 for real web registration | Web + protocol | `server/test/e2e.test.ts`, `spoil-shares.test.ts`; web ballot tests | PARTIAL |
| LIFE-05 / P0 | Duplicate/revote/spoil separation | `server/src/election.ts` replay-derived cast/spoil alpha sets | Broader import/recovery and all-mode qualification; no reuse of publicly spoiled ciphertext as cast | Exact candidate regression run | Server + security | `server/test/s1-spoil-then-cast-rewrap.test.ts` includes restart; `consolidation.test.ts` reverse-order control | PARTIAL (S1-02 narrow fix integrated) |
| LIFE-06 / P0 | Receipt delivery and verification | Board receipt/proof modules; `web/src/flow/ballot-controller.ts`, `ballot-machine.ts` | Keep submission/acceptance/receipt/independent verification statuses distinct; durable uncertain-send state across reload | Web recovery task; verifier holds | Board + Web | `web/test/cast-alarm-delivery.test.ts`, `audit2.test.ts`; board tests | PARTIAL (accepted receipt retained after alarm) |
| LIFE-07 / P0 | Close, recover aggregate and tally | `server/src/election.ts`, protocol tally; trustee `tally-release` | Shipped organizer close/share relay/publish commands and complete recovery qualification | CLI-01; approved threshold semantics | Server + Trustee + CLI | `server/test/tally-crash-window.test.ts`, `e2e.test.ts`; `trustee/test/tally.test.ts` | PARTIAL |
| LIFE-08 / P0 | Publish/export results and verify | `server/src/export.ts`, routes; TS verifier; `verifier-py/` | Equivalent shared reports and sufficient independent log/anchor evidence in verdicts | D-92..D-96; P1/TSV-05; N-13 | Verifier + owner | `verifier/test/logcheck.test.ts`, `b1-anchor.test.ts`; `scripts/compare-verifiers.ts` | BLOCKED for complete assurance |
| E2E-01 / P0 | Full election using actual server, CLI, trustee and both verifiers | Real server acceptance tests and real protocol components exist | One acceptance test must invoke actual shipped CLI/trustee tools and both verifiers; helper-driven server e2e is not that requirement | OPS-01, CLI-01, LIFE-03; verifier decisions documented | Integration | `server/test/consolidation.test.ts`, `e2e.test.ts` are useful partial coverage | MISSING as specified |
| CLI-01 / P0 | Organizer and voter online parity | `cli/src/main.ts` has offline verify/keygen/ballot/board/inspect/spoil-collect/vectors | Organization/election creation, registration, open/close, signed packet relay, tally publish, online submission and recovery commands | Signed-request service reuse; B3-01 for client registration | CLI | Existing `cli/test/` covers current commands only | MISSING for online lifecycle |
| OPS-01 / P0 | Executable and deployment package | `server/bin/qv-server.ts`, `src/launcher-config.ts`; `deploy/` Docker/Compose/systemd/examples | Candidate smoke qualification, actual container build/runtime and supported-platform service trials; no offline restore tool | Explicit public URL/data dir/registration choice; preserve policy holds | Server + ops | `server/test/launcher.test.ts` validates config and actual process health/start/SIGTERM | PARTIAL (launcher and examples integrated) |
| OPS-02 / P0 | Exclusive data-directory ownership | `server/src/data-lock.ts`, startup/shutdown in `app.ts`; `server/DATA-LOCK.md` | Final candidate/cross-platform qualification; shutdown now drains tracked jobs/HTTP/pool work before unlock; crash requires manual stale-lock recovery; no multi-host FS guarantee | Atomic mkdir on supported FS | Server | `server/test/data-lock.test.ts`, `shutdown-drain.test.ts`: competing processes, aliases, startup failure and tracked-work shutdown | PARTIAL (implementation integrated) |
| OPS-03 / P0 | Detect lost KEK without replacing it | `server/src/kek.ts` | Separately protected KEK source, rotation and disaster recovery remain distinct | BT-05 custody policy | Server + ops | `server/test/kek-missing.test.ts` | PARTIAL (missing-key refusal integrated) |
| OPS-04 / P0 | Backup, verify and restore | `server/src/admin.ts` online snapshot + quick-check; KEK excluded | Offline backup verification/restore command, full restore drill with independently provisioned KEK, recovery runbook | OPS-01; custody policy | Server + ops | `server/test/admin.test.ts`; add actual restoration and representative field decryption | PARTIAL |
| OPS-05 / P1 | Crash-safe jobs/idempotency/deletion | `server/src/jobs.ts`, `imports.ts`, `pool.ts`, `controldb.ts` | Stale status=0 idempotency recovery; atomic outbox/append behavior; resumable file cleanup and crash fault injection | Preserve log-is-truth; no protocol change | Server | `jobs-start-transition.test.ts`, `import-preabort.test.ts`, `delete-authoritative-state.test.ts`, `tally-crash-window.test.ts` | PARTIAL |
| OPS-06 / P1 | Retention with visible failures | `server/src/retention.ts`, `server/RETENTION.md` | Candidate qualification; operator alert routing and backup-retention policy; process counters reset | Existing privacy-filtered logger/audit store | Server + ops | `retention-health.test.ts`, existing `b2-fixes.test.ts` | PARTIAL (durable count-only sweep events and audit-failure alarm integrated) |
| WEB-01 / P1 | Organizer UI after publish | `web/src/flow/publish-ui.ts`, `ui/app.ts` | Connected ceremony, open/close and tally operator flow with CLI trustee custody preserved | CLI/API work; B3-01 | Web | Existing publish and signed-share relay tests; add real-server browser journey | PARTIAL |
| WEB-02 / P1 | Accessibility/localization | `web/src/i18n`, `web/e2e/a11y.ts`, browser journeys | Native locale review, manual keyboard/screen-reader and broader browser/device acceptance | External reviewers/devices | Web + external reviewers | Browser/DOM tests do not substitute for manual acceptance | PARTIAL |
| TRACE-01 / P2 | Requirement traceability | `scripts/trace.mjs`, `trace/`; dependency/link gates exist | Fresh exact-head trace and claims evidence; manual satisfaction review beyond presence links | Lead qualification | Documentation + integration | `scripts/trace.test.mjs`, `check-deps.test.mjs`, `check-links.test.mjs` | PARTIAL |
| FUTURE-01 / later | Federation, ranked/weighted/delegated voting, blockchain, phase-2 anonymity, mobile wrappers | Draft specs / `docs/plan/TODO.md` later tracks | No implementation scheduled by this continuation | Explicit scope selection and protocol review | Owner | None claimed | DEFERRED |

Paths under package columns are relative to `packages/` unless prefixed `scripts/`, `docs/`, `trace/` or `verifier-py/`.

## Security remediation register and queue

Severity below is the historical report's characterization, not a new independently calibrated rating. Separate narrow code repairs from broader guarantees. Preserve original audit reports and their dated evidence.

| ID / priority | Component / severity | Evidence / root cause | Existing correction | Missing work / regression | Owner / dependency | Status |
|---|---|---|---|---|---|---|
| S1-02 = BT-01 / P0 | Server / HIGH | Prior cast-side admission lacked spoil-alpha exclusion, allowing rewrapped revealed ciphertext | `election.ts` tracks/replays spoiled alphas and rejects cast overlap; PR46 source now included | Run exact-candidate `s1-spoil-then-cast-rewrap.test.ts` (restart included), reverse-order controls, broader replay/import cases | Server/security | PARTIAL (narrow correction integrated; old blue-team “absent” statements stale) |
| P1/TSV-05 = BT-02; TSV-04 / P0 | Protocol/TS verifier / HIGH in blue-team report | Overall verdict can remain PASS with absent/unexecuted log checks | Caveats and `not_run` exist, not sufficient for full-election PASS semantics | Approved cap/opt-out/error contract, fixture/vector regeneration, UI/CLI/Python alignment; never weaken comparator | Owner + verifier; ADR-027/D-96 | BLOCKED |
| BT-03 / P0 | Verifier / HIGH | `pinnedManifestHash` optional; bundle-derived hash can accompany PASS | `manifestHashSource` and caveat emitted | Approve authenticated vs unanchored status in every format; alternate self-consistent bundle negative cases | Owner + verifier | BLOCKED for status semantics |
| BT-04; B1-07; PY-01/PY-02 / P0 | TS/Python / HIGH assurance | Python lacks full TS board/log scope and has unresolved report/acceptance differences | Existing differential tooling and explicit unsupported cases | Shared capability/negative vector coverage; D-92..D-96 and per-erratum rulings | Owner + verifier | BLOCKED for parity completion |
| B2-05 / P0 | Control records / MEDIUM | Signed controls lack monotonic freshness binding (`control_seq` absent from `records.ts`) | Existing signature authorization only | Exact sequence field/migration, replay vectors, both verifiers and client authority rules | Owner/protocol; ADR-027 conflict | BLOCKED |
| B2-07 / P0 | Board/storage / MEDIUM | Older DB restore can evade a local-only history view | Existing checkpoints/pin interfaces; no complete high-water anchor guarantee | Crash-ordering review and independently witnessed rollback anchor | Owner + Board/Server | BLOCKED |
| B2-12 / P0 | Server/Board / LOW recorded | `election.ts` still passes `logSk ?? new Uint8Array(32)` to board runtime | None in selected branch for this held item | Resolve authority on interim refusal; prove keyless duplicate paths cannot sign with zero seed | Owner + Board/Server; disputed ADR-027 | BLOCKED |
| BT-11 / P1 | Static files / MEDIUM | `statSync` followed linked files/directories outside root | `static.ts` rejects links/special files, canonical containment, descriptor identity check | Focused `static-boundary.test.ts` passed 7/7 in lane; final candidate/platform check remains | Server/security | COMPLETE for narrow static startup boundary repair |
| BT-12 / P1 | Retention / MEDIUM | Purge/sweep failures previously swallowed | Count-only durable sweep events, health counters, logger alarms including audit persistence failure; shutdown drains sweep | `retention-health.test.ts`; operator alert delivery and retention policy remain | Server/ops | PARTIAL (engineering repair integrated) |
| BT-13 / P1 | Gossip / MEDIUM | Peer failures/counters not durable; unexpected scheduler errors swallowed | Existing request/blocked/malformed counters | Durable last-success/failure and consecutive failures, safe operational events, restart/outage/recovery tests | Server/ops | PARTIAL |
| BT-14 / P1 | Secret containers / MEDIUM | Unauthenticated `logN` up to 20 can request about 1 GiB before authentication | `openWithPassphrase` accepts caller `maxLogN`; cap regression exists | Deployment budget and explicit caller policy; validate cap inputs, concurrency/file limits. Global max stays 20 | Crypto + Trustee/ops; preserve compatibility | PARTIAL |
| BT-15 / P1 | Secret containers / LOW–MEDIUM | Seal failure skipped cleanup; follow-up found KDF/payload derivation gaps while opening | `bundle-cipher.ts` wraps owned buffers in cleanup boundaries | Seal/open failure injection tests; opening suite 6/6 and crypto package 88/88 passed in lane, final integration qualification separate | Crypto/security | COMPLETE for demonstrated cleanup exceptions; JS zeroization remains best effort |
| TR CLI / P1 | Trustee / LOW | Unknown, duplicate, unused options or echoed supplied values can cause misuse/disclosure | Command-specific option validation and generic positional errors | `cli-argument-safety.test.ts`, `cli-unknown-options.test.ts`, `cli-transcript-options.test.ts`; qualify all commands | Trustee | PARTIAL (repair integrated) |
| CP-02/C2/B1-12 + C3 / P1 | Nonce registry / LOW–INFO | Decryption nonce field binding and other hedging deviate from proposed registry | No construction change in this continuation | Exact labels/field lists, approved registry revision and one vector regeneration with security review | Owner + crypto/protocol | BLOCKED |
| BC-02 / P1 | Standalone board CLI / MEDIUM | Caller can omit out-of-band witness policy and rely on bundle policy | `--witness-policy` and `--log-key` available | Resolve proposed PARTIAL downgrade without external policy; tests must pin chosen verdict/exit behavior | Owner + CLI/Board | BLOCKED for verdict change |
| BT-05/SRV-011 / P1 | KEK custody / MEDIUM–HIGH conditional | KEK co-located under application data dir; copied directory includes key | Restrictive mode bits; backup manifest excludes KEK; missing-key refusal | Separate protected secret source, rotation/recovery and restore drill | Owner + ops | PARTIAL |
| BT-06/SRV-008; BT-07/SRV-009 / P1 | Hosted registration/proxy / MEDIUM | Open org registration default; configured bucketHeader trusts supplied value | Existing explicit config options and limits | Launcher now requires explicit mode and excludes bucketHeader; API default remains open. Trusted proxy network/header test for embeddings and global growth controls remain | Owner + ops/server | PARTIAL |
| B3-09/B3-11/B3-14/B3-25 / P1 | Web/key UX / MEDIUM–LOW | Backup-waiver, suspended timers, revote copy and passphrase canonicalization need decisions/testing | Idle-lock and key restore exist; KDF cost confirmation integrated | Cross-browser/AT work; exact compatibility fixtures and approved normalization/gating/copy | Owner + Web/CLI | BLOCKED for normative choices; testing remains actionable |
| B3 uncertain-send / P1 | Web/privacy | Pending send is not durable across reload | In-memory retry and accepted-receipt preservation exist | Persist exact sealed bytes/state without retaining additional secrets; reload/crash and stale async tests | Web | PARTIAL |
| W15/B3-04/WV-10 / P1 | Client delivery / LOW | Lazy chunk/worker integrity not covered by static-only SRI | Static-module integrity checks and build tests | Approved lazy preload approach plus real tampered-chunk browser test; do not port rejected WIP blindly | Web + authority review | PARTIAL |
| SRV-012 / P1 | Idempotency / INFO | Crashed status=0 marker can block retry for existing long TTL | Existing replay cache only | Reproduce and implement bounded orphan recovery without allowing concurrent duplicates | Server | PARTIAL |
| DEP-02 / P1 | Supply chain / MEDIUM historical | Older notes claim missing dependency/audit gates | `lockfile-lint.mjs`, `check-deps.mjs`, CI audit and action pins now present | Exact-head gate results; registry-signature/vendoring/SBOM policy and release provenance remain distinct | Integration + owner | PARTIAL (old “no gates” claim superseded) |
| BT-08/BT-10 / P1 | Disclosure/release / MEDIUM | Security contact/key placeholders; governance and branch controls not proven | Honest governance documents exist | Real monitored contact/encryption keys, private reporting exercise, required reviews/rulesets and release provenance | Owner/external maintainers | BLOCKED on external credentials/decisions |

## Held decisions: precise boundaries

| Decision | Conflict / affected interface | Required ruling / next action |
|---|---|---|
| B3-01 / QV-ADR-028 | QV-09 raw `invite_code` + PoP over election/key vs QV-19 hashed token + invite-bound PoP; owner hold persists alongside approval prose | Specify exact wire, signature framing, storage hash, label/election scope and migration for existing invites. Use `docs/reports/registration-decision-20261109.md`; preserve current failure reproduction until ruled. |
| QV-ADR-027 authority | Later approval register and explicit holds conflict; historical lane #27 contains behavior not selected in integration | Reconcile applicable authority for verdict cap, nonce revision, `control_seq`, rollback anchor, zero-seed receipt refusal and relevant web/preload/copy choices. A source implementation on another branch is not approval. |
| D-92 | Failed coordinator signature with matching out-of-band manifest anchor: TS stops; Python continues later checks | Choose stop or continuation; keep signature failure fatal and document downstream checks/counts. |
| D-93 | Published tally count differs from recovered count: TS leaves result rules not_run; Python evaluates recovered counts | Specify whether valid recovered counts permit rules evaluation after decrypt reporting failure. |
| D-94 | Failed reports' `results`: TS verified published result only; Python emits recomputation | Define `results` and any separately named recomputation field, then update vectors/comparator expectations through approval. |
| D-95 | Zero-digest spoil without enabled trustee mode; Python unsupported manifest flag | Define error code, check, class and inclusion in spoiled set; named unsupported-flag behavior and false value handling. |
| D-96 / PY-02 | Protocol prose says PASS/FAIL while TS also uses INCOMPLETE; Python lacks equivalent state | Approve incomplete verdict/exit semantics together with P1/TSV-05 and align both implementations. |
| V13 / N-13 / N-32 | Control authority, freshness and pause/invalidate effects unspecified/unimplemented in full verifier | Specify authority and verdict classes, freshness, extension/pause bounds and record migration; do not infer PAUSED from unauthenticated/stale records. |
| TR-09 | Proposed byte-identical spoil release re-serving conflicts with current one-shot release semantics | Approve storage/replay/backup behavior before changing `SPOIL_REPLAY`; retain rollback protections. |
| Release and external assurance | Internal AI peer review is not external professional audit or protocol sign-off | Owner review plus required security/protocol approvals; native language/assistive-technology acceptance and operational recovery trials remain separate. |

## Consolidation evidence and dispositions

All observed remote branch tips were classified using `git merge-base --is-ancestor` against the snapshot and `git cherry` for divergent tips. “Contained” proves commit ancestry, not a fresh semantic audit of every inherited feature. `+/-` counts mean non-merge commits with unique/equivalent patches, not an estimate of valuable features. Original branches are preserved; this report does not close PRs or rewrite refs. No remote fetch was performed by this report lane; these are the lead's fetched remote-tracking refs.

The selected baseline already contained the earlier milestone/audit chain. This continuation additionally integrated PR44 recovery/client work and PR46/S1-02 source. All remaining divergent branches are documentation/planning, patch-equivalent CI work or the deliberately held #27 lane; none warrants a blind merge.

| Remote branch | Tip | Ancestry / unique-equivalent patches | Disposition / reason |
| `chatgpt/quietvote-ci-action-pin-guard-20261104` | `51851c1` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/quietvote-s1-02-reverse-spoil-guard-20261114` | `03f2f0c` | Contained / 0–0 | S1-02 correction integrated; restart coverage added by continuation. |
| `chatgpt/quietvote-trustee-fixture-paths-20261102` | `a222037` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/quietvote-visual-ci-repair-20261102` | `980a5cd` | Divergent / 0–1 | Duplicate patch (0 unique, 1 equivalent); signed counterpart already contained; preserve, do not merge. |
| `chatgpt/quietvote-visual-ci-signed-20261102` | `06e0898` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex-continuation-spec-20261109` | `d5c7998` | Divergent / 1–0 | Planning-only `docs/CHATGPT_ZERO_CODEX_CONTINUATION.md`; retain as historical lane proposal, no implementation to port. |
| `chatgpt/zero-codex/audit-rate-config-20261110` | `0dac28b` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/board-reader-lengths-20261110` | `0352bca` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/crockford-display-grouping-20261110` | `5ca8b53` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/docs-wiki-sections-20261110` | `571c9f0` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/election-inspect-counters-20261110` | `1cfc10d` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/import-preabort-20261110` | `6768318` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/job-start-recovery-20261110` | `c4a8959` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/pool-delete-diagnostic-20261110` | `5cf3592` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/seal-worker-lifecycle-20261110` | `11c8ca2` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `chatgpt/zero-codex/verifier-triage-20261110` | `61ddc6d` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `checkpoint/quietvote-ordinary-ux-20261024` | `1b531b8` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/clever-gates-uqd5p1` | `761da0a` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/dazzling-cerf-n8ha3g` | `d75d4a2` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/docs-screenshots` | `e671fd1` | Divergent / 1–0 | Obsolete README/spec-index prose says no runnable UI and old QV IDs; superseded by current source/docs; reject wholesale port. |
| `claude/exciting-hawking-r0evza` | `8d6e096` | Contained / 0–0 | PR44 recovery/client corrections and handoff now integrated. |
| `claude/haiku-T01-baseline` | `5c63db8` | Divergent / 1–0 | Historical report-only `docs/reports/haiku-baseline-2026-11-14.md` for ab84f16; preserve as receipt, not candidate qualification; optional archival docs port. |
| `claude/laughing-volta-61srfa` | `2aaf0a0` | Divergent / 5–0 | Five unique commits; held protocol/authority-sensitive changes and rejected WIP patch; see detailed disposition below. |
| `claude/quietvote-audit-board-cli-1` | `8770aae` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-audit-crypto-protocol-1` | `55aff9a` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-audit-qa-1` | `563eec8` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-audit-server-1` | `6b32085` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-audit-trustee-1` | `f0973a1` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-audit-web-verifier-1` | `e142169` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-board-cli-1` | `c69473f` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-ci-gates-1` | `57ba6cd` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-cli-spoil-collect-1` | `709729a` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-complete-1` | `fdc552a` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-docs-1` | `5341f6f` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-finish-1` | `e56403b` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-security-fixes-k616wx` | `5382d5f` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-spoil-wiring-1` | `fe8b75e` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-trustee-hardening-1` | `f042330` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-ui-locale-a11y-sltfb3` | `424110d` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quietvote-web-triage-1` | `e9d4cd3` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/quirky-curie-n5pxf5` | `019f4e7` | Contained / 0–0 | Original main ancestor; main unchanged by this continuation. |
| `claude/sharp-archimedes-tu76rh` | `2a02bd3` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `claude/tender-maxwell-93ctiw` | `8d6e096` | Contained / 0–0 | PR44 recovery/client corrections and handoff now integrated. |
| `claude/wonderful-hypatia-9yszin` | `a5c9032` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `codex/quietvote-consolidation-audit-20261104` | `934357f` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `codex/quietvote-milestone-20261109` | `ab84f16` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `docs/readme-and-wiki` | `29313c3` | Divergent / 1–0 | Legacy `docs/wiki/` and old README status; current `wiki/` supplies later user/developer guides; superseded, no blind merge. |
| `integration/quietvote-completion` | `5382d5f` | Contained / 0–0 | Starting baseline at 5382d5f; later local continuation fixes are additional. |
| `integration/quietvote-consolidated-20261030` | `aae414e` | Contained / 0–0 | Already integrated; preserve source branch; no additional merge. |
| `main` | `019f4e7` | Contained / 0–0 | Original main ancestor; main unchanged by this continuation. |
| `planning/future-cli-specs-20261110` | `85a7d3e` | Divergent / 1–0 | Draft `docs/future-cli-spec.md` only; retain as future proposal, does not implement online CLI. |

Observed branch tips: **51** (symbolic `origin/HEAD` excluded). Branch membership was checked against `182cb508503c1ee5f6e6410a7beed6abcd02423c`; later branch movements require a fresh check.

### Unique held #27 lane (feature-level accounting)

| Commit | Unique work | Present in selected source? | Disposition / acceptance needed |
|---|---|---|---|
| `13b86c2` | Board rollback anchor, no zero-seed receipts, control reason enum | Missing corresponding complete behavior; zero-seed fallback and free-text reason remain | BLOCKED: authority/crash-order/schema choices; do not silently merge. Add keyless-receipt, rollback-crash and reason-catalog tests after ruling. |
| `07fd61c` | Invite expiry, signed-only auth, /56 buckets, export acknowledgement | PARTIAL: signed-only client cleanup exists; default /64, missing full export-ack lifecycle | Port only approved slices after a separate review; B3-01 and authority-sensitive policy remain held; add bounded expiry/bucket/export-delete tests. |
| `b2f043e` | Integrity-pinned lazy preloads and CLI-only trustee scope | CLI trustee custody already intended; complete lazy preload browser acceptance absent | PARTIAL/BLOCKED: establish authority and real tampered-chunk test before feature port. |
| `80c3a17` | Traceability, claims markers, governance and scope notes | PARTIAL: trace tooling/governance arrived through PR42; text/markers differ | Compare individual paragraphs against current code; do not use historical markers to erase current claims failures. |
| `2aaf0a0` | Pause handoff plus rejected web-ballot WIP patch | Historical evidence only | DEFERRED as implementation: preserve patch unapplied; its unbound-body mutation and stale PAUSED display failed review. Current assignment resumes work but does not approve that patch. |

## Next dependency-aware work

1. Lead completes serialized exact-candidate qualification and independent review of the integrated repairs, records actual failures/unsupported checks, and updates the continuation handoff.
2. Server/ops lane qualifies the integrated strict launcher and packaging examples, including a real container build/runtime when a Docker daemon is available; parallel ops work can add offline backup verification and a restore drill without choosing held protocol semantics.
3. Server/security lane reproduces remaining decision-free crash/idempotency/outbox, admin-boundary and input/resource-limit cases; fixes require regression evidence, not inherited audit prose.
4. CLI/integration lane implements existing signed API lifecycle commands and packet relay through shared domain/service interfaces; actual-tool full-election acceptance must name registration/verifier held steps explicitly.
5. Web lane completes durable uncertain-send recovery and real-server journeys; keep trustee secrets CLI-only and native locales unreviewed until reviewed.
6. Owner resolves the decision packet above. Crypto/verifier/control-record workers then implement only the approved changes with vectors and independent protocol/security review.
7. Release, hosted deployment and real-election readiness remain unfulfilled; no internal result substitutes for external review or operational trials.

## Verification limits and handoff contract

This report changes no runtime, policy, test vector, wire format or verdict. It does not run a new full test suite and does not transfer historical results to this snapshot. Narrow test evidence from the author lanes: static boundary 7/7; opener cleanup 6/6 and crypto package 88/88. The opener lane's first broad typecheck was killed (137) during shared-host memory contention; its retry was deliberately interrupted (130) so the lead could run serialized checks. These are lane receipts, not final integrated qualification.

The lead should append the final candidate SHA/tree, actual check results, remaining findings and concrete next actions to the versioned handoff after integrating this report. No worker persistence after the session is implied.


## Integrated CLI follow-up

After the inventory snapshot, the continuation added `qv online instance`,
`election-create`, `election-inspect`, `election-draft`, `election-submit` and
`election-export` (`packages/cli/src/cmd-online.ts`). The server remains the
validation/authorization authority. Request signing moved without byte changes
to `packages/board/src/request-auth.ts`; server exports remain compatible and no
new package dependency or dependency-policy exception was added.

`packages/cli/test/online.test.ts` exercises the actual HTTP server, actual qv
command runner, real cryptography/board/ceremony packets and both verifier paths.
The shared World test helper still generates trustee cryptography; it does not
run the qv-trustee executable. Python checks shared supported protocol behavior;
board/witness/receipt capability and manifest-pin CLI parity remain incomplete.
CLI-01 and LIFE-01/07/08 now have a tested management/relay/export slice but remain
PARTIAL for complete command parity and real shipped-client acceptance. See the
latest handoff for final source, test and publication evidence.
