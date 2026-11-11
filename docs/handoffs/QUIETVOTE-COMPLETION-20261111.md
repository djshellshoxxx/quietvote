# QuietVote completion cycle — consolidation and discovery handoff (2026-11-11)

**Status label: AI-assisted engineering and review. It is not an independent professional
review. QuietVote remains unaudited and not for real elections.**

**This cycle stopped early.** The owner paused QuietVote work on 2026-11-11 at about 01:01 UTC,
when this cycle had finished discovery and consolidation and had not yet started
implementation. Nothing is half-merged. No implementation lane was started. `main` is unchanged.
Nothing was released or deployed.

Branch `integration/quietvote-completion`, draft
[PR #43](https://github.com/djshellshoxxx/quietvote/pull/43) against `main`.

## 1. Repository state found

- `main` (`019f4e7`) holds documentation only. The whole implementation is unmerged.
- `codex/quietvote-milestone-20261109` at `ab84f16` (draft PR #30) is the cumulative
  implementation tip. An ancestry check over all 44 remote branches shows it contains every
  older `claude/`, `chatgpt/`, `checkpoint/` and `integration/` implementation branch.
- Not contained in `ab84f16`: PR #2 and PR #21 (obsolete documentation), PR #23 (closed,
  same tree as PR #24), PR #31 (lane specification for the ChatGPT lane), and the ten
  `chatgpt/zero-codex/*` branches of PRs #32 to #41.
- An hourly ChatGPT lane (`chatgpt/zero-codex/*`) was active; its last commit was
  2026-11-11 00:17 UTC. Its ledger is `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md`.
- No GitHub issues exist. No `AGENTS.md` or `CLAUDE.md` exists in the repository.

## 2. What this cycle did

1. Reviewed PRs #32 to #41 statically
   ([report](../reports/completion-discovery-20261111/zero-codex-pr-review.md)). None changes
   wire, signature, storage or protocol semantics. The strict verifier comparator is untouched.
2. Executed a red/green check for the nine code PRs: each new regression test fails on
   `ab84f16` and passes on the PR head
   ([table](../reports/completion-discovery-20261111/zero-codex-red-green.tsv)).
3. Merged the ten branches with `--no-ff` in the order 39, 40, 41, 33, 35, 36, 37, 38, 32, 34.
   No conflicts. Source branches and PRs were not modified. Result: `31f13e4`, tree
   `9a5d5b42a3475a9d5432a7ab0d884613e480384a`.
4. Qualified both the milestone tip and the merged head locally (section 3).
5. Surveyed specifications, planning ledgers, the audit ledger and all code
   ([reports](../reports/completion-discovery-20261111/README.md)).

**Duplicate to resolve:** draft PR #42 (`claude/wonderful-hypatia-9yszin`, base
`codex/quietvote-milestone-20261109`) was opened by a parallel session about ten minutes
before PR #43. It merges the same ten branches. Its head `4cb2f9a` has the **same tree** as
`31f13e4`. The two results agree byte for byte; one of the two PRs is redundant. PR #43
additionally carries this handoff and the discovery reports.

## 3. Verification evidence

Local, Linux, Node 22.23.4, npm 10.9.9, Python 3.13.18, `npm ci --ignore-scripts --no-fund`.
Each workspace suite was run separately.

| Check | `ab84f16` | `31f13e4` |
|---|---|---|
| `npm run typecheck` | pass | pass |
| crypto / protocol / board / server | 75 / 215 / 74 / 165 pass | 75 / 215 / 76 / 169 pass |
| trustee / verifier / cli / web | 87 / 25 / 47 / 219 pass | 87 / 25 / 48 / 224 pass |
| Workspace tests in total | 907 pass, 0 fail, 0 skipped | 919 pass, 0 fail, 0 skipped |
| `.github/scripts/*.test.mjs`, action-pin check | pass | pass |
| Python verifier unit tests | pass | pass |
| TS vectors | 412/412, 1 DKG file not run | same |
| Python vectors | 229 PASS, 0 FAIL, 53 NOT-IMPLEMENTED | same |
| Web production build, scoped i18n check | pass | pass |
| Lockfile lint, `npm audit --audit-level=high`, licence snapshot | pass | pass |
| Strict TS/Python verifier comparison | exit 1 (held gate) | exit 1 (unchanged) |
| Claims lint (non-blocking) | exit 1, 20 findings | exit 1, 29 findings |

Per-step exit statuses and durations:
[milestone](../reports/completion-discovery-20261111/qualification-ab84f16.tsv),
[integration head](../reports/completion-discovery-20261111/qualification-31f13e4.tsv).

The nine additional claims-lint findings arrived with the merged lane ledgers
(`docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md` 5, `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md` 3)
and `wiki/Developer-Guide.md` (1). None was suppressed. This handoff and the discovery
reports add none.

Not run locally: the five browser journeys, Windows, macOS. `scripts/triage-verifier-report.test.mjs`
(added by PR #32) was run only in the red/green check, not in the qualification script.
Hosted CI for PR #43 was still queued when this cycle stopped; read the PR for results. The
`vectors, Python verifier and production build` job is expected to fail at the strict
comparison, as it does on PR #30.

## 4. What the specifications require, and what the code provides

Voting model as specified
([citations](../reports/completion-discovery-20261111/feature-inventory.md)):

- v1 methods are yes/no, single-choice, approval and k-of-n, with quorum and
  simple or supermajority thresholds (QV-ADR-006, QV-20). The code implements exactly these four.
- Ranked ballots, weighted votes and delegation are Phase 2. Ranked is disabled until
  external review (QV-ADR-023). Score voting, STV and write-ins are out of scope.
- Choices are secret. Participation is public by voter key in Phase 1, including revote
  counts (QV-ADR-005, QV-ADR-008). Participation privacy is Phase 2 or 3 work.
- Revoting is supported; the latest valid ballot in log order counts (QV-ADR-016). A
  cast-or-audit (Benaloh) challenge must be offered (QV-ADR-020).
- Ballots are exponential ElGamal on ristretto255 with CDS and Chaum-Pedersen proofs;
  trustees run a threshold DKG; the board is an RFC 9162 Merkle log with signed receipts;
  verifiers are the TypeScript CLI and offline page plus a Python second verifier.
- No blockchain or token (QV-ADR-012). Federation and peer-to-peer operation are research.

Capability snapshot at `31f13e4`. "Implemented" means code exists and its own tests pass. It
does not mean reviewed or fit for use.

| Capability | State | Evidence | Main gap |
|---|---|---|---|
| Cryptographic primitives | Implemented | 75 tests, vectors | External review. Decryption-nonce binding and nonce hedging (CP-02, C3) not done |
| Ballot build, proofs, verification, four methods | Implemented | 215 protocol tests, 412 vector cases | No tied election through the full verifier; `E_DUP_CODE` path untested |
| Revote and duplicate resolution | Implemented | protocol and server tests | None found |
| DKG and threshold decryption | Implemented | protocol and 87 trustee tests | One DKG vector file unsupported by `qv vectors check` |
| Tally and decision rules | Implemented | rules tests | TS and Python may disagree on ties for non-majority thresholds (B1-07, owner gate; from static reading) |
| Bulletin board, receipts, witness cosigning | Implemented | 76 board tests, server tests | Witness monitoring endpoints absent |
| TS verifier, `qv verify`, offline page | Implemented | 25 verifier and 48 CLI tests | PASS is reachable with no board-log evidence (P1/TSV-05). CLI does not expose witness or receipt inputs |
| Python second verifier | Partial | 58 unit tests, 229 of 282 vector cases | No board, witness or receipt checks. Strict report comparison fails (D-92 to D-94) |
| Server API and persistence (56 routes) | Implemented as a library | 169 tests | **No executable, no configuration loader, no TLS, no container or service files** |
| Organizer lifecycle: manifest, roll commit, open, close, tally, publish | **Missing outside test helpers** | driven only by `packages/server/test/helpers/world.ts` | `qv` has no online commands. The web organizer page stops after publish |
| Voter registration, web to server | **Blocked** | a regression pins the `401` | B3-01, owner-held |
| Voter casting in the web client | Implemented against a stub board | 224 web tests, hosted browser journeys on PR #30 | No browser test against the real server. See section 7 |
| Trustee CLI | Implemented | 87 tests | No tool turns trustee packets into log entries |
| Bundle import and export | Implemented | server tests | Synchronous stages remain |
| Server backup and restore | Backup only | admin tests | **No restore code**. Backups exclude the KEK |
| Accessibility and localization | Partial | automated checks on Home, Help, not-found | Only English offered. Assistive-technology and native review are external |
| Deployment path | Not started | none | No Dockerfile, service unit or runbook |

The operator workflow parity matrix (server API, `qv`, `qv-trustee`, per step, with test
evidence) is section 5 of the
[backend survey](../reports/completion-discovery-20261111/code-survey-backend.md). The web
column is in sections 3 and 4 of the
[web survey](../reports/completion-discovery-20261111/code-survey-web.md).

No completion percentage is given. The countable evidence is the table above, the test
counts in section 3, 737 distinct requirement ids in `docs/`, and the open-work counts in the
two digests. Requirement-by-requirement traceability (ledger item C2) is still open.

**Plain summary:** the protocol core is extensively tested. A real person cannot yet run an
election with the shipped tools: there is no server executable, no organizer tooling for the
lifecycle steps, and web registration is blocked.

## 5. Decisions the owner has to make

The repository records conflict. `docs/decision-log.md` QV-ADR-027 and QV-ADR-028 record
owner approval on 2026-11-04. Later handoffs and the ChatGPT lane specification treat two
items as still held. This cycle did not resolve or work around either.

1. **B3-01, registration contract.** If QV-ADR-028 stands: the client sends the hash of
   the invite token with an invite-bound proof of possession, as the web client already does,
   and the server changes. No release exists, so no issued invites need migration. Still to
   state explicitly: the at-rest hashing of the accepted bearer, the QV-04 label binding, and
   same-invite retry (B2-10). Packet: `docs/reports/registration-decision-20261109.md`.
   Suggestion from this cycle: confirm QV-ADR-028 with the at-rest hash (candidate C in the packet).
2. **D-92 to D-94, verifier report semantics.** QV-ADR-027 category A keeps the TypeScript
   behaviour: stop after a manifest-signature failure, rules `not_run` after a decryption
   failure, results only when verified. `docs/plan/OPEN-DECISIONS.md` recommends the opposite.
   Packet: `docs/reports/verifier-milestone-20261109.md`. Suggestion from this cycle: category A,
   because it fails closed; the Python verifier then changes.
3. **Is QV-ADR-027 authoritative for the remaining register items?** Several integrity items
   depend on it: verdict capped below PASS without board-log evidence (P1/TSV-05), nonce
   hedging (CP-02, C3), monotonic `control_seq` (B2-05), no signing with a zero seed (B2-12).
4. **PR #42 or PR #43.** Keep one integration line.
5. Server defaults listed as SRV-008 to SRV-014, including open registration by default.

These are suggestions for the owner to accept or reject. They are not decisions.

## 6. Planned work, not started

Batches were sized for one isolated worktree each, with an independent reviewer per batch.
Item ids refer to the digests.

Wave 1:

- **OPS-A** Server launcher (`qv-server`: strict config file, explicit `publicUrl`,
  `dataDir`, `registrationMode`, graceful shutdown, `--check-config`), plus `deploy/`
  (Dockerfile, compose example, systemd unit, runbook). No Docker daemon was available in
  the work environment, so an image build would have been unverified there.
- **OPS-B** Fail fast when the KEK file is missing but wrapped data exists; exclusive lock
  on the data directory; offline `verifyBackup` and `restoreBackup`.
- **CLI-ONLINE** Online `qv` commands for the organizer lifecycle, ceremony and tally relay
  (trustee packets to log entries), voter register/submit/receipt check; then a private
  `packages/e2e` workspace running a full election against the real server and checking the
  exported bundle with both verifiers.
- **CORE-A** `qv board verify` PARTIAL without an out-of-band witness policy (BC-02);
  witness, pin and receipt options on `qv verify`; bounded input reads; strict manifest
  parsing in the board grammar; the unused option name in `scripts/compare-verifiers.ts`.
- **CORE-B** Marker equivocation class (P10); pin the behaviour for spoils omitted from the tally.
- **SRV-A** Tally aggregate retry after a crash at close; registry resync and delete guard;
  resumable deletion; in-progress idempotency markers after a crash (SRV-012).
- **SRV-B** Never sign with a zero seed (B2-12a); IPv6 `/56` buckets (N-32a); cost of the
  unauthenticated `tally/draft` route.
- **TRU-A** Strict option allow-list in `qv-trustee`; `--witness-key` parsing; explicit
  `maxLogN`; idempotent spoil re-release (TR-09); test that a trustee refuses a hand-picked
  ballot subset.
- **WEB-A/B/C** Cast-delivery honesty (section 7), persisted unconfirmed-send state,
  already-voted pre-check, conditional revote wording (B3-14), KDF cost warning (B3-28),
  single-steward warning, draft selections across auto-lock, invite token left in the URL,
  deadline time zone, Worker constructor failure.
- **TEST-A/B** Protocol edge and property tests (ties through the verifier, `E_DUP_CODE`,
  floor boundaries, determinism across trustee subsets, reference-model revote sequences);
  server concurrency tests (duplicate casts, closure race, registration race, restart).
- **TOOL** `scripts/trace.mjs`, report-only requirement traceability.

Wave 2: verdict cap (P1/TSV-05) and, if decided, D-92 to D-94 in one vector regeneration;
nonce hedging; web organizer flow and removal of the unused bearer-session client code
(D-84); deeper review of `logcheck.ts`, `proofs.ts`, the DKG and the server's webhook, SSE,
gossip and import modules; deployment smoke test; feature inventory with status columns.

The ChatGPT lane lists import/replay/tally scheduling and trustee backup rollback as its own
next items. Avoid duplicating them.

## 7. Suspected defects to verify first

From static reading only. None has been reproduced. Write the failing test before any fix.

1. Web: after a successful POST, a board-integrity alarm leaves no receipt stored or offered,
   and the offered button does nothing (`packages/web/src/flow/ballot-controller.ts` about
   lines 152 to 195, `ballot-machine.ts` about line 106).
2. Web: the unknown-delivery retry state is memory-only; after a reload the voter sees a
   clean form (`ballot-controller.ts` about lines 54 and 145).
3. Server: a missing KEK file is silently replaced by a new key (`packages/server/src/kek.ts`
   about line 11), so existing data fails to unwrap later.
4. Server: no retry of the tally aggregate after a crash between close and aggregate
   (`election.ts` about lines 702 and 1163).
5. Server: the delete guard reads registry state that can be stale after a crash
   (`pool.ts` about lines 104 to 110, `election.ts` about lines 684 to 708).
6. Server: nothing prevents two processes on one data directory; the one-ballot rules are
   in-memory projections (`election.ts` about lines 477 to 491).
7. Server: a log opened without its key would sign with the all-zero seed (`election.ts`
   about line 146; B2-12).
8. Trustee CLI: unknown options are silently ignored (`packages/trustee/src/cli.ts` about
   lines 50 to 66).
9. Verifier: verdict PASS does not require ballot checks to pass or board checks to run
   (`packages/protocol/src/verify.ts` about line 148; known as P1/TSV-05).
10. Trustee: confirm that `tally-release` recomputes the counted set itself rather than
    trusting a caller-supplied list (`packages/protocol/src/tally.ts` about lines 33 to 65).

More, with reasoning, in the three code surveys.

## 8. How to continue

```sh
git fetch origin integration/quietvote-completion
git switch integration/quietvote-completion
npm ci --ignore-scripts --no-fund
npm run typecheck
for w in crypto protocol board server trustee verifier cli web; do npm test -w "@quietvote/$w"; done
node --test .github/scripts/*.test.mjs scripts/triage-verifier-report.test.mjs
(cd verifier-py && python3 -I -m unittest)
npm run vectors:check
python3 -I verifier-py/qv_verifier vectors test-vectors/v1
npm run build -w @quietvote/web && npm run i18n:check -w @quietvote/web
node scripts/compare-verifiers.ts --json   # expected exit 1 until D-92..D-94 are decided
bash .github/scripts/run-browser-journeys.sh   # needs Chromium; QV_CHROMIUM selects the binary
```

Work in a separate worktree per batch with its own `npm ci`; a shared `node_modules`
contaminates workspace resolution. Keep one commit per item, each with a `Signed-off-by:`
line. Then: resolve section 5, start with OPS-A, CLI-ONLINE and the section 7 checks.

## 9. Limits of this record

- Surveys were static. Suspected defects are not findings.
- No fix, feature or test was written in this cycle beyond the merges.
- Browser journeys, Windows and macOS were not exercised locally.
- No statement here is a security certification. External cryptographic review, native
  translation review, assistive-technology qualification and release governance remain open.
