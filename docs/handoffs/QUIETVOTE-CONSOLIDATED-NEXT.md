# QuietVote consolidated restart handoff — 2026-10-30

**Milestone: BLOCKED.** Useful implementation histories are consolidated and repairs are tested, but registration remains an explicit owner-held protocol-review block and strict verifier report comparison still fails. This is an unaudited prototype, not for real elections. Stop at this checkpoint; do not merge to main, release or deploy.

## Exact source and worktree

- Branch: `integration/quietvote-consolidated-20261030`.
- Exact frozen validation/local checkpoint: `247df393ea1ace300fe5ed1f569a12090e1364dc`.
- Final implementation follow-up: `f58533b13c87f06af50f8d104c5a28b77bb8c270`.
- Starting source: `2a02bd3249f3c988ef5afd8e9559fa13a959bdef`.
- Main, freshly read before publication: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Captured local/remote publication checkpoint: `1a751ab58aef41a1ae1a7beb433d853938549b3a`, independently read back from GitHub.
- Draft consolidation PR: [#22](https://github.com/djshellshoxxx/quietvote/pull/22), open/draft against main.
- This publication-receipt update is a documentation-only successor of that checkpoint. Its own hash cannot be embedded in itself; obtain the exact receipt tip with `git rev-parse HEAD` and `git ls-remote --heads origin integration/quietvote-consolidated-20261030` before resuming. The draft PR description also records that tip.

The validation checkpoint includes all source/CI repairs and status corrections. The final audit/validation/handoff documents are added as subsequent documentation-only commits. The final publication receipt distinguishes those SHAs; check `git rev-parse HEAD` and the live remote before resuming.

The checkout was newly cloned at `/workspace/quietvote`; there were no local edits to preserve. All work used the new integration branch. No existing source branch was reset, force-pushed, deleted or rewritten. Existing PRs were neither closed nor given auto-merge. Root coordinated commits/publication; other agents edited assigned paths without making commits. New commits carry DCO sign-off using the configured author; inherited histories retain their existing attribution and sign-off state.

## Environment and bootstrap

Attached managed environment reused. Status reported current running/connected observations and enforced restricted policy permitting GitHub and package registries. Plain sandbox clone failed at inherited `proxy:8080`; the supported executor `with_additional_permissions` network path succeeded. The same supported path is needed here for sockets, Chromium and synchronous child-process stdio. No proxy unset, TLS bypass, direct egress, route change or credential dump was used.

Node **24.19.0**, npm **11.9.0**, Python **3.12.14**, Git **2.52.0**, Playwright **1.57.0**, Chromium **154.0.8037.57**, detect-secrets **1.5.0**. Other Node/OS combinations are configured in CI but are not claimed as locally qualified.

```sh
git clone https://github.com/djshellshoxxx/quietvote.git /workspace/quietvote
cd /workspace/quietvote
git fetch origin '+refs/heads/*:refs/remotes/origin/*' '+refs/pull/*/head:refs/remotes/pr/*' --tags
git switch integration/quietvote-consolidated-20261030
npm ci --ignore-scripts --no-fund --cache /workspace/work/npm-cache
```

Use the repository lockfile. Do not lower KDF floors or remove negative cases. Python uses its standard library only. Playwright is a pinned root development dependency (ADR-026); local browser checks used `/usr/bin/chromium`. A new machine without a browser can use the supported `npx playwright install --with-deps chromium` route if its environment policy permits it. Never infer successful browser checks from a skipped optional run: required runs set `QV_REQUIRE_BROWSER=1`.

## Integration and specification decisions

[CONSOLIDATION](../plan/CONSOLIDATION.md) records all 23 source branches and 21 source PRs with live SHAs, bases/merge bases, unique commits, patch equivalence, affected areas, imports and omissions. Closed #4/#5/#18/#19 merged into work branches and were not assumed present in main. Import order: current crypto/protocol #10, server/spoil #14, board/CLI collector #16, trustee #17, dependency CI #15, then live ordinary checkpoint `653bb03`. Web #7/#13 and older implementation histories were already present. Main's sole initially missing docs commit came through the ordinary checkpoint.

All useful source histories are included. Only #2 `29313c3` and #21 `e671fd1` remain deliberately unmerged: their duplicate/obsolete documentation was selectively reconciled into the current README/wiki/index. Their spec-only/no-UI wording and obsolete QV-16 filename claim were not imported. The only merge conflict appended both CLI audit/spoil and dependency NOTES sections. No protocol construction, wire format, authority policy or candidate vector was silently changed to create agreement.

Historical ordinary-task restrictions are superseded by the owner's consolidation request; required external reviews and unresolved owner decisions are not. Historical handoff receipts remain in QUIETVOTE-NEXT.md. Duplicate main HANDOFF content is preserved at its original Git SHA and the canonical historical audit handoff.

## Findings, repairs and remaining gates

[The full audit ledger](../audit/consolidation-2026-10-30.md) and companion JSON preserve all 72 original extraction IDs, all 52 full interim verification records, pending revised severities for the other 20, and zero original extra-lens results. They add older overlaps separately. Original B1/B2/B3 reports and defect-asserting PoCs are unchanged. Each finding has reproduction, disposition, exact repair provenance, correct-behavior regression evidence and remaining review requirements. The interim evidence was incomplete and is not an independent professional audit.

| Scope | Exact commit |
|---|---|
| Crypto/protocol/Python/verifier | `48a2b73c6a4c77666284f094372eb683e2a5364a` |
| Server and real HTTP contracts | `f2fc966db01cd6e4dc1f5104d67a769240d35ee2` |
| CLI witness-policy/refusal regression | `aaf35a71f41f2fd091a1336d3eb0636fa8d4d347` |
| Trustee custody/release/destruction | `8cf26691f87af3a10c55c896f15bf4169aa862fa` |
| Web proof/state/CSP/key repairs | `88b376a81d464617e8f5fe3da65fc327dfcba9ec` |
| Pinned browser + conformance CI | `963c57716dbceced04114d5119c61740b0cfb0fb` |
| Seed wipe/live-chart recheck | `f58533b13c87f06af50f8d104c5a28b77bb8c270` |
| README/NOTES/status/ADR-026 | `247df393ea1ace300fe5ed1f569a12090e1364dc` |

Definite repairs include imported unauthenticated crash/point/rewrap/roll safeguards; stored-aggregate bounded draft paths; manifest witness policy and early-close gates; invite quota/admin revocation/sorted roll/export cache; trustee canonical paths, file identity/fingerprints, exclusive backup publication, release-ledger/CAS protections and tombstones with interrupted-destruction recovery; Python subgroup/schema/date/key/spoil/DKG-marker fixes; proof-gated results, truthful verifier/skipped-check/anchor status, revote and promise receipts, key/backup/clear/lock behavior, production CSP/static-import integrity, route safety and seed wiping. New CI retains strict gates and requires real browser availability.

Remaining blocks and limits:

- **B3-01 (original High):** QV-09 raw invitation + `(election_id, pk)` PoP conflicts with QV-19 hashed invitation + invite-bound PoP, with additional QV-04 label ambiguity. The owner explicitly chose “keep blocked pending protocol review.” Actual web `registrationBody` gets `401 BAD_SIGNATURE` in a permitted server registration state; raw-token server-contract registration succeeds. Registration after roll commitment remains refused. No rule was relaxed.
- **Strict verifier report disagreement:** all 27 corpus verdicts agree, but 12 detailed reports disagree about not-run/short-circuit/result emission semantics (QV-ERR-PY-006/007/015 and related classification questions). Keep the differential command and CI gate failing. Honest-election rule/DKG/tie/counting ambiguities beyond the shipped corpus also remain owner gates.
- **Availability/authority:** B2-02 import verification still runs on the event loop; B2-05 control freshness/replay and B2-07 signed rollback/high-water policy remain unresolved. Invite expiry/oracle/retention, keyless mirror receipts and telemetry findings remain explicit in the ledger.
- **Crypto/verifier:** CP-02 nonce-hedge statement binding needs an approved registry amendment; finding classes, normative bidi/numeric/witness schema policies and V13 controls remain unresolved. Python lacks log, private/trustee spoil and some verdict capabilities. Mandatory external-anchor policy is not established by the new caveat.
- **Web/qualification:** dynamic chunks/workers still lack full SRI; offline verification stays on the main thread. Backup-download/recovery-restore needs a complete browser journey, exact action-button dimensions are not asserted, and real background-tab suspension remains unqualified. Paused-state copy, one-ballot guarantee wording and web/CLI passphrase normalization remain policy gates. All five translated catalogs stay unreviewed and unoffered.
- **External:** independent security/crypto/protocol review, owner policy/spec approval, native translation review and assistive-technology qualification remain necessary. AI peer review fixed two concrete integration issues (CI ordering and tombstone resurrection) but is not external security approval. Automated a11y checks are not WCAG or screen-reader acceptance. JS immutable secrets, active filesystem rollback and physical erasure limits remain documented.

## Exact validation

Executed **2026-10-31T05:24:21.905353+00:00 through 2026-10-31T05:31:29.545543+00:00 (UTC)** at the exact frozen checkpoint. The human-facing date is 2026-10-30 in America/Los_Angeles.

| Command (root unless cwd shown) | Exit | Result |
|---|---:|---|
| `npm ci --ignore-scripts --no-fund --cache /workspace/work/npm-cache` | 0 | passed; lockfile retained |
| `npm run check` | 0 | 810 passed, 0 failed/skipped; typecheck passed |
| `npm run build -w @quietvote/web` | 0 | passed |
| `npm run i18n:check -w @quietvote/web` | 0 | passed; draft locales remain unoffered |
| `(cd verifier-py && python3 -I -m unittest)` | 0 | 50 tests OK |
| `node packages/cli/bin/qv.ts vectors check --json` | 0 | 412/412 checks; one unsupported DKG vector file reported |
| `python3 -I verifier-py/qv_verifier vectors test-vectors/v1 --report /workspace/work/validation/python-vectors-final.json` | 0 | 229 PASS, 0 FAIL, 53 NOT-IMPLEMENTED (282 total) |
| `node scripts/compare-verifiers.ts --json` | 1 | FAILED gate: 27 verdict agreements, 12 report differences |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/run.ts` | 0 | 12/12 |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/help.ts` | 0 | 64/64 (4 combinations x 16) |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/a11y.ts` | 0 | 49/49 automated checks |
| `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node packages/web/e2e/verifier.ts` | 0 | 16/16 production checks |
| `node scripts/lint-claims.mjs` | 1 | 20 findings in 9 files; existing non-blocking job |
| `npm run lockfile:lint` | 0 | 35 registry entries, integrity, 8 workspace links |
| `npm audit --audit-level=high --cache /workspace/work/npm-cache` | 0 | 0 vulnerabilities |
| `node .github/scripts/check-action-pins.mjs` | 0 | all workflow actions use full SHA pins |
| `node scripts/licence-snapshot.mjs --stdout` | 0 | 35 permissive declarations, 0 flagged; 26 optional metadata-only packages |
| `git diff --check` | 0 | passed |
| `git diff --check 25ac8be..HEAD` | 0 | passed |

Workspace totals: board 74, CLI 47, crypto 58, protocol 197, server 140, trustee 83, verifier 25, web 186. [Machine validation receipt](../reports/consolidation-validation-2026-10-30.json) and [exact strict differences](../reports/consolidation-cross-verifiers-2026-10-30.json) preserve results. The second verifier unsupported cases are not passes. All negative/mutation inputs and KDF floors are preserved.

The real-HTTP regression covers creation, permitted raw-token registration, committed-roll refusal, voting/revoting, forged/replayed/refused submissions, spoil and trustee collection, close/tally/export/verification. Draft-after-eviction tests make ballot reanalysis throw, compare the convenience draft with independent tally construction and retain read-only mirror refusal. Production browser tests load app and standalone verifier with generated/real-server CSP; they hide forged results and enforce actual key/receipt state. FakeBoard journeys remain distinct from the real server contract test.

The first pre-final validation attempt at `963c577` was stopped when the last two web review defects were reproduced. It is superseded, not a passing receipt. Final commands below run against the stable checkpoint named above; later handoff-only commits do not change implementation.

## Reproduction of remaining failures

```sh
# Expected nonzero until reviewed semantics are resolved; prints all report differences.
node scripts/compare-verifiers.ts
# Expected nonzero claims findings remain in preserved historical/quoted research evidence.
node scripts/lint-claims.mjs
# This passing regression explicitly demonstrates the unresolved actual-client registration refusal.
node --test packages/server/test/consolidation.test.ts
```

Do not change vector expectations, ignore negative inputs, suppress a required browser, or align reports to an unapproved interpretation. The conformance CI job runs strict differential last so its known failure does not suppress independent build/i18n/licence evidence. Hosted checks must be read separately; local results are not receipts for all CI OS/Node combinations.

## Publication hygiene and receipt

`git push -u origin HEAD:refs/heads/integration/quietvote-consolidated-20261030` created only the new integration branch. A fresh `git ls-remote --heads origin` returned **`1a751ab58aef41a1ae1a7beb433d853938549b3a`** for that branch and unchanged main **`019f4e789be2ff38a5fb2d348c3b225cc87cf296`**. The working tree was clean. GitHub readback confirmed [PR #22](https://github.com/djshellshoxxx/quietvote/pull/22) is **open, draft, unmerged**, based on main, at that exact head. No existing PR was closed or auto-merge enabled.

Pre-push hygiene at this published documentation checkpoint covered **201 outgoing commits, 1,401 distinct blob versions, 27,367,160 bytes**. The full correct scan produced **18,489 candidates**: the previously reviewed 18,465 plus **24 documentation metadata flags** (19 Git commit identifiers and 5 evidence SHA-256 digests). Every new tuple and all 4 affected blobs were verified; every identifier/digest resolved to the referenced object/file. **0 unresolved credentials.** Reports contain no flagged plaintext values. Publication uses inherited supported Git authentication; no credential was printed or reconfigured.

This receipt-only successor updates the handoff, scan/status evidence and plan, without source/CI changes. It is separately scanned before the final fast-forward push; the final remote tip is read back and supplied in the draft PR description and final chat receipt. The core validation remains at `247df39`; `git diff 247df39..HEAD -- packages package.json package-lock.json scripts .github verifier-py ':!**/NOTES.md'` is empty. Hosted CI is a separate run, not a claim that all OS/Node matrix combinations have been qualified locally. Its conformance job intentionally remains blocked on the strict report discrepancy.

Core outgoing source hygiene at `247df39` covered **200 commits, 1,392 distinct blob versions, 26,206,253 bytes**. Correct scanner invocation ran from the snapshot directory with `--all-files --no-verify .`, default plugins/filters. A separate synthetic positive control produced one finding. All **18,465** candidates were exhaustively matched by blob/path/line/detector/fingerprint and reviewed: 17,885 public/synthetic vector values plus 580 nonvector candidates (24 false positives, 537 public metadata, 19 synthetic key/password fixtures), **0 unresolved operational credentials**. Provenance included deterministic regeneration and historical signature/Merkle checks. This is publication hygiene, not security acceptance.

[The core scan receipt](../reports/consolidation-publication-scan-2026-10-30.json) records exact counts and evidence digests. The additional published documentation versions were scanned and reviewed as recorded above; any further versions must also be scanned before pushing. Do not rely on an absolute-path scan invoked outside the extracted snapshot directory; an early zero-result invocation was invalidated by the positive control and is not a receipt.

To reproduce the outgoing-version extraction after creating a temporary scanner venv with `detect-secrets==1.5.0`, use `git rev-list --objects origin/main..HEAD`, select blobs with `git cat-file --batch-check`, materialize each under `<blob-sha>/<original-path>` using `git cat-file blob`, then run the scanner from that extraction root. Preserve all versions and review every candidate with its exact line and generator/RFC/public-metadata provenance. Keep control fixtures and scanner environments outside the repository. Do not upload credential-looking values to third-party validation services.

## Ordered restart actions

1. Read this handoff, `git status --short --branch`, local/remote/main SHAs and the complete integration/audit ledgers. Preserve any new local edits and refresh refs before further work.
2. Obtain protocol-owner decisions for registration bytes/signature/storage/label framing and verifier/check-result ownership. Record the approved specification changes before altering accept/reject semantics. Add a successful real web/server registration journey in the permitted state while retaining committed-roll refusal.
3. Address bounded import verification, control freshness and rollback/high-water protections, then remaining confirmed findings using their preserved reproductions and new correct-behavior regressions.
4. Complete unsupported verifier capabilities and review-required negative corpus/nonce/Unicode/rules work without weakening existing vectors. Re-run strict differential; a corpus verdict match alone is insufficient.
5. Complete backup/recovery and background-tab browser journeys, dynamic integrity/worker gaps, native translation review and assistive-technology qualification.
6. Obtain independent crypto/protocol/security review and required code-owner approvals; review inherited DCO/provenance and tooling ADR-026. Re-run the recorded validation at the next integrated source SHA and secret-scan all outgoing versions before another checkpoint.

No permission to merge to main, release or deploy is carried by this handoff.
