# Completion status (v1 scope)

Status as of the completion branch `claude/quietvote-complete-1` (PR against `claude/quietvote-board-cli-1`).
Scope is the v1 specs in `docs/` as indexed by `docs/SPEC-INDEX.md`. Specs remain Draft; "complete" here means the
items below are either done and verified or listed with an owner and a real blocker.

**Not for real elections.** This software is unaudited. Nothing here is a security certification.

## Verified in this branch

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` (8 workspaces) | 530 passing, 0 failing |
| `npm audit` | 0 vulnerabilities (prod and full) |
| `.github/scripts/check-action-pins.mjs` | pass |
| `scripts/licence-snapshot.mjs` | 32 packages, 0 flagged |
| `verifier-py`: `python3 -m unittest discover -s tests` | 37 OK |
| `test-vectors/v1/mutations/*` against `verifier-py` | all match expected verdict and failing check |

## Remaining items

| # | Item | Owner | Blocker / next step |
|---|---|---|---|
| C1 | Claims lint: 108 findings in 26 files (`scripts/lint-claims.mjs`). CI runs it non-blocking. Mostly quoted or negated terms in `docs/07-threat-model-security.md` (43) and `docs/research/R-01..R-04` (30). | Comms + Sec | Each finding needs a judgement: rephrase, mark as quoted under `docs/claims/`, or add a scoped `claims-lint-ignore` block. Not mass-suppressed here, because that would hide real claim review. |
| C2 | Requirement traceability: 722 distinct `QV-xx-REQ-nnn` IDs across 35 docs. Not audited one by one against code and tests in this branch. | Proto + QA | Walk `docs/24-traceability-matrix.md` and mark each Must item implemented, tested, or deferred. |
| C3 | Python verifier does not reject `manifest_hash`, `joint_key_seq` or `roll_commit_seq` on non-`election-open` markers (TS does, `packages/protocol/src/verify.ts` ~L275). | Proto | Small port. Coordinate with audit session before touching verifier logic. |
| C4 | `verifier-py` has no `NOTES.md` (behaviour-change log required by repo rules). | Proto | Create when C3 lands. |
| C5 | `packages/server/NOTES.md` is stale: "webhook delivery state is not persisted" conflicts with webhook migration 3; "`/admin/*` not implemented" conflicts with the quarantine clear path. | Eng-S | Doc-only correction after code is re-read. |
| C6 | `verifier-py` tests are not in CI (`.github/workflows/ci.yml` runs only `npm run check`). | Eng-R | Add a Linux-only job step with `python3 -m unittest`; needs no new action pins. Not done here to avoid changing the cross-OS matrix without review. |
| C7 | Translations: not reviewed. Do not mark them reviewed. | Localisation reviewer | Human reviewer required. |
| C8 | Open owner decisions: D-01..D-06 and protocol-freeze defaults D-10..D-23 (`docs/plan/OPEN-DECISIONS.md`). | Product owner | Decisions not made. Protocol freeze depends on them. |
| C9 | Independent second verifier, audit (R1), counsel review, fiscal host, pilot groups, organiser interviews. | Product owner / Sec | External parties and funding; not code. |
| C10 | Repository file mode: `packages/trustee/src/cli.ts` is 644 in this working tree but 755 in some environments. Not committed. | Eng-R | Decide the intended mode and commit it once. |

## Notes

- Audit findings and security review belong to the audit/QA session (`claude/quietvote-audit-qa-1`). Items here do not duplicate them.
- Any item that changes protocol, crypto or verifier logic needs a crypto or protocol review before merge.

## Scoped implementation-to-requirements review — 2026-10-30

This addendum is newer than the branch snapshot above and covers only the ordinary web
presentation, localization tooling, and accessibility evidence recorded at source commit
`54f90be81855e2c334705002d615e5d2ef98ff92` (the checkpoint tip before this documentation-only
traceability update was `b5d9f1ea396abdfa5dca72d39934e2bdcedb04a4`; no app code changed after the
source commit). It is not the C2
whole-repository traceability audit and does not review or accept excluded crypto/nonce,
export-role/authorization, trust/authority, ballot/election-verification, or browser-verifier
requirements.

The owner confirmed the current high-level architecture in conversation: organization-operated
server plus browser client, with a separately hosted client permitted and a maintainer-hosted
service later. This records the architectural direction only; it does not approve every provisional
ADR or move any specification from Draft to Approved.

| Requirement area | Status | Evidence and remaining work |
|---|---|---|
| QV-13 REQ-060: catalog IDs and no visible literal text | **Partial; scoped implementation tested** | `i18n:check` reported 281 static references, 13 resolved dynamic references, 0 unresolved and 1 explicit `verifyView` exclusion. The current scan is bounded to the ordinary app source set; the exclusion and broader flows remain outside this acceptance. |
| QV-13 REQ-061: catalog schema and message consistency | **Implemented/tested for typed TypeScript catalog modules; owner choice recorded** | Web tests validate locale key sets, ICU syntax and placeholder/plural/select structure. The spec now describes the implemented typed English entries and locale message maps per QV-ADR-025. Human translation review remains separately open; translated catalogs remain drafts, unreviewed and unoffered. |
| QV-13 REQ-062: build-time message precompilation | **Implemented/tested for the web app; custom compiler accepted by owner** | Precompiler and app-build tests pass; `npm run build -w @quietvote/web` passed at build `cf734e4c27bf`. QV-ADR-025 records the owner-approved project compiler and its test/maintenance obligations. The recorded build measured 190.2 KiB gzipped JS total / 93.1 KiB entry; this does not establish every transfer-size or device-performance criterion. |
| QV-13 REQ-063: query > stored preference > browser language > English | **Partial; helper tests pass, app integration and storage contract unresolved** | `negotiateLocale` implements the ordering and offered-locale matching. `startApp` currently passes `?lang` and `navigator.languages`, but no stored preference. English is the only offered locale today, so this omission has no current user-visible language-selection effect. The spec's §10 says preferences use `localStorage`, while the existing built-asset test rejects `localStorage`, `sessionStorage` and cookies; the app already has an IndexedDB-backed settings adapter, but no owner-approved choice reconciles that contract. The SPA also does not establish the server-rendered `Accept-Language` behavior described in the requirement. Resolve the storage/spec contract and no-JS behavior before wiring persistence; keep translated locales unoffered until human review. |
| QV-13 REQ-064: do not offer unreviewed languages | **Gate implemented/tested; translated-language acceptance not met** | Tests verify that languages without matching human review records are not offered. No translated locale is currently approved for use. |
| QV-13 REQ-065: pseudo-locales in visual tests | **Partial** | Local Playwright checks passed for `en-XA` and `ar-XB` on Home and Help at 320px. A CI visual-browser job and full application-flow coverage are not evidenced. |
| QV-13 REQ-001/003/020: accessibility conformance and assistive technology | **Not accepted; human work required** | The 49 automated browser checks cover Home, Help and not-found only. No qualified screen-reader, voice-control, switch, or disabled-user evaluation or ACR is recorded; automated checks are not WCAG acceptance. |
| QV-13 REQ-033/034: reflow, zoom and contrast | **Partial** | Automated checks cover those three pages, responsive widths 320/768/1024/1440, 200% text scaling, and sampled text contrast/forced-colors behavior. Full voter and organizer flows, 400% zoom and manual component/non-text contrast review remain unverified. |

Recorded checks at the source commit: `npm run typecheck` passed; `npm test -w @quietvote/web`
passed 177/177; `QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium node
packages/web/e2e/a11y.ts` passed 49/49; and `npm run build -w @quietvote/web` passed. These results
are scoped evidence, not a full-suite or release acceptance. Browser checks did not exercise live
elections or server integration.

**Still open overall:** C2 remains open. The historical checklist's C1–C10 rows have not been
reconciled against current code in this pass. The remaining specifications, owner decisions,
server/CLI integration, privacy/legal/operations, full traceability, independent security review,
and product release gates were not audited here. The repository's specs remain Draft. Do not infer
that the architecture confirmation or this web slice makes QuietVote implementation-ready or fit
for real elections.

## GitHub Pages demo request — 2026-10-30

The owner has approved Pages deployment, but no QuietVote demo has been deployed. The app now
shows the existing “Experimental software” notice and the existing “DEMO — not for real votes”
notice together; the app footer and README credit and link Circuit Drift Labs (CDL). The added
credit text in translated catalog files remains draft/unreviewed; no locale offer gate changed.
The Help/Home browser regression verifies the warnings and CDL link. CDL's main branch now
features a Crypto Libertarian development-wing page and QuietVote source link at commit
`c86648927af76517fef7927f4821edc690e30104`. That source push succeeded, but the public Pages
update is not verified: the web viewer still returned the previous home page and could not open
the new path, and a direct page request returned HTTP 403. No alternate route was tried.

The QuietVote work branch may not publish around unresolved main merge gates: PR #20 audit
ownership/status, independent owner review, and valid DCO attestation remain unresolved. The prior
QuietVote Pages settings lookup returned HTTP 403, and no Pages workflow is tracked. The local
built `index.html` references root-absolute `/assets/...` paths, which do not resolve under the
repository project's usual `/quietvote/` Pages subpath; no verified base-path configuration or
custom domain is recorded. Before a public client demo can be linked, an authorized repository
admin must resolve Pages configuration, the subpath versus custom-domain hosting path, and the
owner-reviewed main-branch process. Keep the demo visibly marked experimental and not for real
votes. The banner/link change passed root typecheck, 9/9 catalog tests, `i18n:check` (283 static,
13 resolved dynamic, 0 unresolved, 1 forwarder and 1 explicit restricted exclusion), and the
Help/Home browser check (16/16 in light/dark at 320px and 1280px). No test server for the server
component or real election was run.
