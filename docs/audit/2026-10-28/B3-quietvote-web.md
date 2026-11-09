# B3 — QuietVote web client audit (`packages/web`)

**Auditor:** B3 (read-only, one of six parallel auditors) · **Repo:** `djshellshoxxx/quietvote` · **SHA audited:** `424110d90e23dc443aa4498a4340973d3c8cb8b6` (merge of PR #19 on top of PR #18 branch `claude/quietvote-ui-locale-a11y-sltfb3`) · **Worktree:** `/home/user/audit/quietvote-b3` (detached) · **Report date:** 2026-10-28

> QuietVote is labelled unaudited and not for real elections. This report is an AI-assisted code audit with automated checks. It makes **no** claim that the software is secure and **no** claim of WCAG conformance (the accessibility checks below are automated heuristics only; no assistive technology was used). All data used is synthetic.

---

## 1. Scope, SHA and what was reviewed

**In scope (B3):** `packages/web` — `src/` (api, flow, i18n, key, net, ui, build, verifier, worker), `scripts/i18n-check.ts`, `static/styles.css`, build configuration (`src/build/site.ts`, `cli.ts`, `precompile.ts`), `e2e/` (run, help, a11y), `test/` (159 unit tests, fake board), catalogs (`src/i18n/en.ts`, five machine-draft locale tables), `NOTES.md`/`COPY.md`/`README.md`. Also checked: how the web client calls protocol functions (`@quietvote/protocol`, `@quietvote/crypto`, `@quietvote/board`) and that no identity travels with a ballot.

**Specs read (all Draft):** QV-10 (user experience), QV-13 (accessibility/localization), QV-19 (client and supply chain), the client-facing parts of QV-04 (key import/registration), QV-06 (REQ-013), QV-26 (REQ-011/020/030/042/043), QV-07 (REQ-050…066 client rows), QV-09 (registration, error model), QV-16 §5.11/§5.19 (hedged randomness, tally record), ADR text in `docs/decision-log.md`; QV-18 (receipt promise, MMD) only through the QV-09/QV-10 references and the server's behaviour; plus `docs/plan/TODO.md` (web rows T-176…T-195, T-309…T-317, N-34…N-37, T-037), `docs/plan/COMPLETION.md`, `docs/24-traceability-matrix.md` (it has no QV-10/13/19/26 rows: "_not yet generated_"), `docs/claims/claims-register-v0.md` (C-12, C-14), `docs/handoffs/QUIETVOTE-NEXT.md`, `docs/handoffs/2026-10-24-ordinary-inventory.md`, `docs/handoffs/2026-10-24-ordinary-ux.md`, `packages/web/NOTES.md`.

**Prior audits consulted (for KNOWN labels):** in this SHA: `docs/audit/README.md`, `docs/audit/web-verifier.md` (WV-1…11), `docs/audit/web-second-wave.md` (W1…W15), `docs/reports/security-review-2026-10-21.md`; on unmerged branches (read with `git show origin/<branch>:<path>`): PR #6 `docs/audit/HANDOFF.md`, PR #9 `server.md`, PR #10 `crypto-protocol.md`, PR #11 `board-cli.md` + `dependencies.md` (DEP-04), PR #15 `dependencies-ci.md` (DEP-01/02), PR #8/#17 `trustee.md` (no web items). Only W-, WV-, DEP- and HANDOFF items touch the web client; matches are labelled `KNOWN` in section 4.

**Out of scope (other auditors):** server/board/trustee/cli internals (B2), crypto/protocol/verifier internals (B1). Server and CLI behaviour is cited only where the web client talks to it; where I drove the real `@quietvote/server` it was through its own in-process test `World`, with no network beyond loopback.

**Explicitly not re-reported (known gap per brief):** `REGISTRATION_CLOSED`, `INVITE_EXPIRED`, `INVITE_USED` have no UX codes in QV-10 §8.1 and the app shows `E-GEN-UNKNOWN` for them. B3-10 below is a different defect (a false success text) and says so.

**Worktree state at the end:** only untracked `packages/web/audit-b3/` (throwaway PoCs, listed in Appendix B) plus git-ignored build output `packages/web/dist/` and `node_modules/`. Nothing committed, pushed or commented anywhere. Outside the worktree I wrote only the report (the path the brief names), the session scratchpad, and transient build directories under `/tmp` (`qv-b3-*` from the PoC harness; the repo's own tests create `qvA-*`, `qvS-*` and similar). I did not remove the `/tmp` directories: a wildcard delete in the shared temp directory was declined by the permission system, and they contain only synthetic build output.

---

## 2. Method

1. **Baseline.** `npm ci --ignore-scripts --no-audit --no-fund` (setup), typecheck, `npm test -w @quietvote/web` (159/159 incl. `i18n:check`), production build, byte-reproducibility check (two builds, different output dir/cwd/`TZ`/`LC_ALL`: all 15 files identical), the repo's own Playwright scripts (`e2e/run.ts` 8/8, `e2e/help.ts` 12/12 light + 12/12 dark, `e2e/a11y.ts` 45/45). The a11y harness was mutation-tested in a scratch copy (three CSS mutations: removing only the custom `:focus-visible` rule left 45/45 because the browser default ring remains; lowering `--muted` contrast failed `contrast light Home/Help`; forcing `outline:none !important;box-shadow:none !important` failed the keyboard-focus and forced-colors checks), so the harness can fail.
2. **Spec-driven pass.** For every requirement in scope that a spec marks Must/Should or a plan row marks Done/Partial: (a) find the implementation, (b) compare behaviour with the acceptance criteria, (c) find the test. Result is the conformance table (section 5).
3. **Code reading** of all of `src/ui/app.ts` (719 lines) and of the security- and flow-relevant parts of `src/flow/*` (ballot controller and machine, seal, receipt, election derivation, onboarding, invite, publish), `src/api/*`, `src/key/*`, `src/build/site.ts`, `src/verifier/page.ts`, `src/i18n/{icu,index,datetime}.ts`, `src/key/passphrase.ts`, plus the relevant server handlers (`packages/server/src/app.ts` registration, `election.ts` append rules, `http.ts` static headers) for the interop questions.
4. **Proof-of-concept tests (throwaway, inside the worktree).** Three kinds: (i) Node tests that drive the web client code against the **real** `@quietvote/server` through the server package's own `World` helper (registration, revote, phase, limits, publish, receipts); (ii) Node unit PoCs for key storage, i18n and state machines; (iii) Playwright + Chromium (Playwright 1.63.0 global install, Chromium build 1243, not a repo dependency) against the **production build** served with the real CSP header and a switchable `FakeBoard` (UI behaviour, supply-chain tampering, headers, performance). axe-core 4.13.0 (read-only copy placed in the session scratchpad) was used for information only. Every CONFIRMED finding below names the PoC file, the command and an output excerpt.
5. **Negative testing** of the focus areas: DOM/ICU injection, eval/Function, storage, privacy of requests, key-file validation, locale gating, protocol API usage (section 2.1).
6. **Confidence labels:** CONFIRMED = a PoC or command I ran shows it; LIKELY = traced end to end in code, not executed; SPECULATIVE = Appendix A only.
7. **Severity:** Critical / High / Medium / Low / Info as in the brief. No Critical was found. "High" is used where a core flow cannot work against the reference server or a displayed result is not verified although the spec says it must be.

### 2.1 Areas with no finding (negative results, all with evidence)

| Area | Result | Evidence |
|---|---|---|
| XSS / DOM injection | No finding. All rendering is `createElement`/`textContent`; `h()` sets only code-chosen attribute names; no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc`, `DOMParser`. Hostile manifest/option/title text (`<script>`, `javascript:`, `<svg onload`, ICU syntax such as `{t} {n, plural`) renders as literal text in results and vote form; 0 injected nodes, 0 CSP violations. | `grep` over `src/` and `dist/` (no hits); `audit-b3/xss.poc.ts` output `results {"xss":0,"imgs":0,"onattrs":0}`, `vote form {"xss":0,...}`; lint test `test/build.test.ts:74-79`. |
| eval / `Function` | No finding. The SPA bundle, all chunks, the worker and `verifier.html` contain no `eval(`, `new Function`, `Function(`. The app bundle has no ICU parser (0 occurrences of `selectordinal`); precompiled formatters are used. | `grep` on `dist/assets/*.js` and `dist/verifier.html`; `test/app-precompile.test.ts:51`; `test/build.test.ts:42`. (The standalone `verifier.html` still embeds the parser: 2 occurrences of `selectordinal` — see QV-13-REQ-062 in section 5.) |
| CSP of the SPA | No finding for `index.html`: meta CSP has `default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; require-trusted-types-for 'script'; trusted-types qv-default; upgrade-insecure-requests`; no inline script/style; Trusted Types policy only creates the worker URL; `e2e/run.ts` reports 0 CSP/TT violations and 0 third-party requests. (The verifier page is a separate finding, B3-03.) | `src/build/site.ts:25-33`; `test/build.test.ts:12-45`; `e2e/run.ts` last step: ok. |
| Browser storage | No finding. IndexedDB `quietvote-v1` holds only the wrapped key (QVKEY1), receipts, pinned heads, settings. No `localStorage`/`sessionStorage`/cookie/`sendBeacon`/XHR/WebSocket in any shipped JS; no `console.*` in browser code. | `src/key/storage.ts:95-163`; `test/security.test.ts:79-105`; `grep` on `dist`. |
| Privacy of requests | No finding. Registration sends public key + invite hash; ballots send the signed entry (voter public key + ciphertext), exactly the Phase-1 public data of QV-10 §7.1; no name/email/IP/UA is collected; `credentials:'omit'`, `cache:'no-store'`, `referrerPolicy:'no-referrer'`; the invite token lives in the URL fragment; SSE cursor/read key travel in headers, URL has only the election id. The bundle contains no fingerprinting API (canvas, WebGL, audio, hardwareConcurrency, battery, WebRTC, enumerateDevices) and the only absolute URLs are the SVG namespace and the user-clicked GitHub source link. | `src/api/client.ts:54-99`; `grep` on `dist` for the QV-26 deny-list. |
| Key-file validation / KDF parameters | No finding on validation: `parseContainer` rejects unknown fields, wrong hex lengths, AAD mismatch, non-integer or below-floor parameters and anything above the ceiling; unwrap verifies the derived public key and key id. Defaults 64 MiB/t=3/p=1, floor 19 MiB/t=2, ceiling 256 MiB/t=10/p=4. (Re-wrap logic and ceiling cost are B3-20 and B3-28.) | `src/key/keystore.ts:15-18,63-70,134-151,161-196`; `test/key.test.ts`; `audit-b3/unit.poc.test.ts` B3-F11. |
| Protocol API use | No finding. Sealing uses `deriveXi(ctx, nonceKey, rho, attempt, selvec)` → `encryptBallot` → `verifyBallotContent` (self-check) → `ballotCode`; the cast signature is over `castDigest(ctx, code)`; spoil envelopes and audit packages use the protocol builders; `verifyAppendResult`/`checkHeadAgainstPin`/`checkInclusion` use `@quietvote/board`; `bindServerLog` takes `log_pk` and origin from the signature-verified manifest. Driven against the real server: cast, spoil (private and published reveal), identical re-post (200, idempotent), organizer publish (election → manifest → dkg-open → invites) and "Check inclusion now" with consistency all succeed. | `src/flow/seal.ts:46-64`, `ballot-controller.ts:124-178`, `receipt.ts`, `election.ts:165-172`; `errmap-server.poc.test.ts` (four control tests, output in section 8), `publish-server.poc.test.ts`. |
| Locale gating | No finding. Machine-draft locales are neither offered (`?lang=es`, `?lang=ar`, `?lang=fr-CA`, `?lang=en-XA`, browser language `ar-SA` all render `lang=en dir=ltr`) nor downloaded (only `styles`, `app`, one shared `chunk` fetched). Guarantee strings have no fallback (`src/i18n/index.ts:33-39`). | `audit-b3/lang-gate.poc.ts` output (section 8). |
| Bidi / Trojan Source | No finding for organizer text: `validateManifest` rejects U+202A–202E and U+2066–2069 (RLO in option label, LRI in title); plain Hebrew label is accepted; displayed arguments are FSI/PDI isolated. | `unit.poc.test.ts` B3-F10 output. |
| Supply chain basics | Production dependency closure of the web client is `@noble/curves@2.4.0` + `@noble/hashes@2.4.0` (via workspace `crypto`); esbuild pinned `0.28.2`; no service worker (QV-19 §12: none in v1); build is byte-reproducible on one toolchain; `npm ci --ignore-scripts` + build works without esbuild's postinstall (answers the open question in DEP-04, PR #11). | `npm ls --omit=dev --all`; section 8. |

---

## 3. Findings table

Paths in the file:line column without a package prefix are under `packages/web/`.

Counts: **High 2 · Medium 12 · Low 13 · Info 6 (33 findings)**. By confidence: CONFIRMED 31, LIKELY 2 (B3-23, B3-29), SPECULATIVE 0 in the table (see Appendix A). B3-26 is CONFIRMED for the blocking/no-progress behaviour; its 10,000-ballot time is an extrapolation and is marked as such.

| ID | Sev | Confidence | Category | Spec IDs | file:line (audited SHA) | One-line summary |
|---|---|---|---|---|---|---|
| B3-01 | High | CONFIRMED | interop / conformance | QV-04-REQ-005, QV-19 §6.1, QV-19-REQ-010, QV-09 §4 | `packages/web/src/flow/onboarding.ts:117-127`; `src/ui/app.ts:382`; server `packages/server/src/app.ts:520-521` | Web registration request is refused by the reference server (PoP layout and `invite_code` semantics differ); no test could notice |
| B3-02 | High | CONFIRMED | conformance / integrity | QV-16 §5.19.1, QV-10 §6.2 V10, QV-10 §1(1) | `src/flow/election.ts:134-149`; `src/ui/app.ts:576-604` | Results page shows a coordinator-signed tally without verifying it; the protocol verifier FAILs the same log |
| B3-03 | Medium | CONFIRMED | supply-chain / availability | QV-19 §7, §8.1, REQ-016, REQ-018 | `src/build/site.ts:35-46,84-107,148`; server `packages/server/src/http.ts:106,277` | `verifier.html` does not run when served with the build's own `_headers` or the reference server's static CSP |
| B3-04 | Medium | CONFIRMED | supply-chain / conformance (status inflation: C-12, T-189 "SRI yes") | QV-19 §8.1, QV-19-REQ-020 | `src/build/site.ts:59-82,131-137` | SRI covers only the entry module and CSS; statically imported chunks execute without integrity (PoC); preload-with-integrity fixes it |
| B3-05 | Medium | CONFIRMED | bug | QV-10 §8.1 E-VOT-SUPERSEDED-LOST, §7.1 g4 | `src/ui/app.ts:231-251,440-445,502-506`; `src/api/errors.ts:42` | Revote built from a cached log is rejected (`E_SUPERSEDES`) and the screen says the opposite of what happened |
| B3-06 | Medium | CONFIRMED | bug / conformance | QV-10 §8.1, §8.2, REQ-006; QV-13-REQ-094 | `src/ui/app.ts:138-148,500-509`; `src/api/errors.ts:40` | Late/paused/refused ballot screens: error copy falls back to "Something went wrong", receipt-proof text shown for unrecorded ballots, PAUSED reported as closed, vote form not phase-gated |
| B3-07 | Medium | CONFIRMED | conformance | QV-10-REQ-008, §6.2 V8, QV-19 §6.2, QV-13 C-BENALOH | `src/ui/app.ts:492-499` | "Test this ballot" result never shows what the device sealed, yet asks "Do these match what you picked?" |
| B3-08 | Medium | CONFIRMED | bug / usability | QV-13 C-DIALOG, QV-10-REQ-011 | `src/ui/app.ts:97-107,435,508` | "Clear this device" deletes the only copy of the key in one click, no confirmation (confirmation strings exist, unused) |
| B3-09 | Medium | CONFIRMED | conformance | QV-10-REQ-021, QV-19-REQ-008, QV-04-REQ-006 | `src/ui/app.ts:378-396,429`; `src/flow/onboarding.ts:69` | Key backup is offered only once at creation (lost if registration fails or the page is left); the displayed recovery code cannot be imported (no caller of `restoreFromRecovery`) |
| B3-10 | Medium | CONFIRMED | bug | QV-10 §1(1), QV-09 §4 | `src/ui/app.ts:380-395` | "Your key is registered." is shown with no invitation, and for HTTP 409 `INVITE_USED` (another key consumed the invite) |
| B3-11 | Medium | CONFIRMED | bug / conformance | QV-19 §5.3, QV-13-REQ-007 | `src/ui/app.ts:79-93`; `src/key/lock.ts:19-29`; `src/flow/ballot-controller.ts:231-235` | Auto-lock is announced only in a live region; Seal/Send stay offered and fail generically; the "hidden > 2 min" rule cannot fire if timers are suspended; no pre-lock warning |
| B3-12 | Medium | CONFIRMED | availability | QV-26-REQ-011, QV-07-REQ-064, QV-10 §8.1 E-KEY-STORAGE | `src/ui/app.ts:336`; `src/main.ts:9` | If IndexedDB cannot be opened every election page (even rules and results) shows "Something went wrong" |
| B3-13 | Medium | CONFIRMED | bug / conformance | QV-10 §8.1 E-NET-TIMEOUT, §8.2, §10.2; QV-19 §6.2 | `src/flow/ballot-controller.ts:144-153,158-178`; `src/flow/receipt.ts:58` | A `sequenced` answer (signed promise, no proof yet) is not stored or re-checkable; a 5xx after a recorded ballot says "has not been sent" |
| B3-14 | Medium | CONFIRMED | bug | QV-10 §8.1 E-VOT-ONEBALLOT, QV-09 §4.3 | `src/api/client.ts:234`; `src/flow/ballot-controller.ts:160`; `src/i18n/en.ts:207`; `src/ui/app.ts:510` | One-ballot elections: UI promises revoting; the refusal (`REVOTE_LIMIT`, `retryable:false`) is forced retryable, retried 4 times and reported as E-API-RATE (which renders as the generic error, B3-06) |
| B3-15 | Low | CONFIRMED | conformance | QV-10-REQ-007, QV-19-REQ-011, QV-10 §6.2 V6 | `src/ui/app.ts:479-480`; `static/styles.css:13-14` | Cast and Test buttons differ in fill, size and weight (spec: "same size/style") |
| B3-16 | Low | CONFIRMED | bug | QV-10 §1(1), §8.1 E-VER-ANCHOR, §11 | `src/ui/app.ts:617-625`; `src/verifier/page.ts:53-74` | Verifier headline "All checks passed" is printed under an Election-ID mismatch and with 3 of 14 checks "not run" |
| B3-17 | Low | CONFIRMED | bug | QV-13 C-STEPPER, QV-10-REQ-020 | `src/ui/app.ts:253-268,326-364` | `route()` has no staleness guard: a slow earlier view overwrites a later navigation (URL and page disagree) |
| B3-18 | Low | CONFIRMED | a11y | QV-13-REQ-021 | `src/ui/dom.ts:33-37`; `src/ui/app.ts:273,341,368,519,609,630` | 2–3 live regions per page; the assertive anti-phishing announcement is cut at 140 chars mid-word |
| B3-19 | Low | CONFIRMED | a11y / bug | QV-13 C-KEY, WCAG 3.3.8, QV-10 §8.1 E-KEY-STORAGE | `src/ui/app.ts:370,374-377` | Unlock field uses `autocomplete="new-password"`; a non-key file is reported as "This browser won't store your key" |
| B3-20 | Low | CONFIRMED | bug | QV-19 §5.3, QV-19-REQ-005 | `src/flow/onboarding.ts:104-113`; `src/key/keystore.ts:199-209` | Transparent re-wrap predicate is inverted: fast devices never re-wrap a floor-parameter key |
| B3-21 | Low | CONFIRMED | conformance (self-reported) | QV-10-REQ-002 | `src/ui/app.ts:712` | Header link "Privacy and limits" goes to `/e`, which renders "not found" |
| B3-22 | Low | CONFIRMED | bug (availability) | robustness (QV-07-REQ-062 spirit) | `src/flow/ballot-machine.ts:6`; `src/ui/app.ts:451-459,599-600`; `src/i18n/icu.ts:229-231`; `src/i18n/index.ts:33` | Prototype-named ids (`constructor`, `__proto__`) from a manifest or tally crash the vote/results view |
| B3-23 | Low | LIKELY | usability | QV-10 §6.1 O4/O6, T-183 | `src/ui/app.ts:133,666-667` | Organizer "Invitation links" list shows bare codes (no link), no copy button, selection yields garbled text |
| B3-24 | Low | CONFIRMED | conformance | QV-10-REQ-012, §9 | `src/ui/app.ts:340-353` | "Election ID confirmed" is stored per API id, not per Election ID (hash) |
| B3-25 | Low | CONFIRMED | interop | QV-19 §5.3, QV-04 §4.1 | `src/key/passphrase.ts:89-94`; `packages/cli/src/keyfile.ts` (B2) | Word passphrases are canonicalised by the web client but not by the CLI: same key file, typed-back passphrase unlocks in one only |
| B3-26 | Low | CONFIRMED (blocking) / LIKELY (10k estimate) | conformance | QV-19 §7 | `src/verifier/page.ts:35-49` | Offline verifier runs on the main thread with no Worker pool, progress or resumability |
| B3-27 | Low | CONFIRMED | conformance | QV-19-REQ-008/022/035, QV-10-REQ-010/011, QV-13-REQ-007/092/093/094 | `src/flow/onboarding.ts:69`; `src/flow/election.ts:154`; `src/key/lock.ts:29`; `src/i18n/datetime.ts:57,80`; `src/flow/invite.ts:40`; `src/key/storage.ts:21-25` | Library code and catalog copy with unit tests but no UI call site (11 symbols; 115 of 487 messages; 8 UX codes never produced) |
| B3-28 | Info | CONFIRMED | security (DoS, user-initiated) | QV-19-REQ-004 | `src/key/keystore.ts:18,63-70` | A crafted key file within the accepted ceiling costs ~9 s (256 MiB, t=3, measured) to ~30 s (t=10, extrapolated) per unlock attempt on this machine |
| B3-29 | Info | LIKELY | robustness | QV-07-REQ-062 | `src/ui/app.ts:615-616` | SPA `/verify` has no input size bound (the standalone page and the verifier loader do) |
| B3-30 | Info | CONFIRMED | test gap | QV-19-REQ-016/018, QV-13-REQ-001 | `.github/workflows/ci.yml`; `packages/web/e2e/*.ts` | Browser checks (CSP/TT, a11y, key flow) are not run by CI; no E2E ever loads `verifier.html` |
| B3-31 | Info | CONFIRMED | correctness | QV-10 §6.2 V7, REQ-009 | `src/ui/app.ts:504` | Receipt screen prints the browser's current time as "Logged", not the log's `sequenced_at` |
| B3-32 | Info | CONFIRMED | a11y (automated, info only) | QV-13 C-SHELL, C-CHART | `src/ui/app.ts:715`; `src/ui/charts.ts:34` | axe-core 4.13: `region` (moderate) on every page (banner outside landmarks); `aria-allowed-role` (minor) on chart `figure role=group` |
| B3-33 | Info | CONFIRMED | supply-chain | QV-19 §11 P3 | `packages/web/package.json:24-26`; `.npmrc` | Workspace dependencies are `"*"` (resolve to links, no registry fetch); no `audit-level` / lockfile lint (KNOWN DEP-02, PR #15) |


---

## 4. Finding details

Conventions: `PoC:` names a throwaway file under `/home/user/audit/quietvote-b3/packages/web/audit-b3/` (all listed in Appendix B). Commands are run from the repo root `/home/user/audit/quietvote-b3`. Output excerpts are verbatim from this session's re-runs. "KNOWN" lines follow the brief's rule.

### B3-01 — High — CONFIRMED — Web registration is refused by the reference server

- **Where.** Web: `packages/web/src/flow/onboarding.ts:117-127` (`REG_DOMAIN`, `registrationBody`: `invite_code = b64u(SHA-256(token))`; PoP signs `"QV-REG-v1\0" ‖ electionId ‖ 0x00 ‖ SHA-256(token) ‖ pk`), called at `packages/web/src/ui/app.ts:382`. Server: `packages/server/src/app.ts:520` (PoP verified over `"QV-REG-v1\0" ‖ electionId ‖ "\0" ‖ pk`) and `:521` (invite found by `sha256("QV-INVITE-v1\0" ‖ invite_code)`, i.e. the server expects the raw issued code).
- **Scenario.** Organizer issues an invite (`POST /invites` → 201, 16-byte code). Voter opens `/e/<id>#inv=<code>`, creates a key, the page posts `{invite_code: b64u(SHA-256(token)), pk, alg, pop}`. Server answers `401 BAD_SIGNATURE`; if only the PoP is corrected it answers `422 INVITE_EXPIRED` because the hashed value is hashed again. The voter sees the generic error and cannot register. A control with the server's layout and the raw code is accepted (`201 approved`).
- **Why nothing noticed.** `FakeBoard.register()` (`test/helpers/fake-board.ts:164-177`) checks only the body shape and then returns `403 REGISTRATION_CLOSED`; `e2e/run.ts` asserts only that a refusal is shown; no test verifies the `pop` bytes (`grep` over `test/`: no use of `.pop`). The ordinary-UX continuation lists registration as excluded scope (`docs/handoffs/QUIETVOTE-NEXT.md`, 2026-10-27 section), and PR #19 changed only the stub.
- **Evidence.**
  ```
  $ node --test --test-reporter=spec packages/web/audit-b3/interop-server.poc.test.ts
  (a) web registrationBody -> 401 BAD_SIGNATURE
  (b) server-layout PoP + invite_code=b64u(SHA-256(token)) -> 422 INVITE_EXPIRED
  (c) control: server layout + raw code -> accepted approved
  ✔ B3-F1: web registrationBody() is refused by the real server (PoP layout and invite_code semantics differ)
  ```
  PoC: `interop-server.poc.test.ts` (test B3-F1).
- **Spec position.** Web follows QV-19 §6.1 (`POST /registrations {pubkey, sig over (ID, SHA-256(TOKEN), pubkey)}`, line 95), QV-19-REQ-010 (hash on device) and QV-04-REQ-005 (PoP binds group, invite, pk); `NOTES.md:73` says "QV-19 over QV-09 wording". Server follows QV-09 (lines 63, 146, 262, 562: raw `invite_code`, PoP over `(election_id, pk)`). `docs/decision-log.md`, `docs/errata/spec-errata-log.md` and `CONSISTENCY-REPORT.md` contain no entry for this conflict; QV-16 does not define the registration PoP (QV-09:562 only names the label). See section 6, spec gap G1.
- **Suggested fix.** The owner picks the contract (no new policy invented here), then one side changes so both implement it, and a cross-package test drives `registrationBody` against the server `World` (this PoC is the template). If QV-19/QV-04 govern: the server hashes the on-wire value once and the PoP includes the invite hash. If QV-09 governs: the web sends the raw token as `invite_code` and signs `(election_id, pk)`, and QV-19 §6.1/REQ-010 are amended.
- **KNOWN.** None. Distinct from the known "no UX codes for REGISTRATION_CLOSED/INVITE_EXPIRED/INVITE_USED" gap (not re-reported). See also B2's spec gap G-11 (PoP binding: QV-04-REQ-005 versus QV-09 §3.3, server follows QV-09) and B2-10 (registration semantics), the server-side view of the same conflict.

### B3-02 — High — CONFIRMED — Results are shown from a signed but unverified tally

- **Where.** `packages/web/src/flow/election.ts:134-149` accepts the first `tally` record whose `ctx` matches and whose signature verifies under a manifest coordinator key (W5 fix); `packages/web/src/ui/app.ts:576-604` renders its counts, percentages, quorum and outcome as "Results". No decryption-share, DLEQ, homomorphic-sum or counted-root check runs in the page; the Results view carries no statement of verification status.
- **Scenario.** A holder of a manifest coordinator key (m-of-n) posts a `tally` whose option counts and outcome differ from the decrypted sum. The SPA derives `phase = tallied` and shows the forged winner. The shared verifier on the same log returns FAIL.
- **Evidence.**
  ```
  $ node --test --test-reporter=spec packages/web/audit-b3/unit.poc.test.ts
  SPA context: phase = tallied | chair outcome shown = {"kind":"winners","winners":["cy"]} | cy votes shown = 4
  protocol verifyElection on the same log: verdict = FAIL | first failures = E_DLOG_RANGE,E_DLOG_RANGE,E_DLOG_RANGE
  ✔ B3-F7: SPA derives "Results" from a coordinator-signed tally without verifying it; the protocol verifier FAILs the same log
  $ node packages/web/audit-b3/ui-observer.poc.ts      (step B3-F7b)
  mentions of "verified"/"checks passed" on the page: false; disclaimer present: false; hasVerify=false
  ```
  PoCs: `unit.poc.test.ts` (B3-F7), `ui-observer.poc.ts` (B3-F7b: chart + table rendered, no CSP errors).
- **Spec.** QV-16 §5.19.1 (`docs/16-crypto-protocol.md:750`): the tally "is signed by the tally coordinator (a convenience signature; **the record is verified, not trusted**)"; QV-10 §6.2 V10: "How do I know this is correct? → itemized verification (client runs proofs in-page; offers the standalone verifier)"; QV-10 §1(1) no false assurance; QV-10-REQ-013.
- **Suggested fix.** In `resultsView`, run the shared protocol verifier on the log the page already holds before drawing numbers; render its itemized checks (QV-10-REQ-013) and show `E-VER-FAIL` instead of counts when it fails; label the in-page check as made by the same software (ADR-010, as V8 does).
- **KNOWN.** Related W5 (high, fixed at this SHA: unsigned/foreign tallies ignored). W5 does not cover a correctly signed but unverified tally; this is the residual.

### B3-03 — Medium — CONFIRMED — `verifier.html` is dead under the build's own headers and the reference server

- **Where.** `src/build/site.ts:35-46` writes one `/*` block (CSP `script-src 'self'; style-src 'self'`) that also matches `/verifier.html`; the page's own policy (meta, `site.ts:96`) pins an inline script and style by hash. A header CSP and a meta CSP are both enforced, so the inline code is blocked. Same effect in the reference server: `packages/server/src/http.ts:106` (`STATIC_CSP`) is attached to every static file at `:277`.
- **Scenario.** An operator deploys `dist/` on Netlify/Cloudflare Pages with the generated `_headers`, or behind `@quietvote/server`. A voter or observer opens `/verifier.html`, selects a bundle, presses "Run checks": nothing happens, no output, no error (the page's script never ran). Saved to disk and opened from `file://` it works.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/verifier-headers.poc.ts
  meta CSP only (file:// or a static host with no header rule)
     result: All checks passed | 11 of 14 checks passed. | Manifest hash: passed | Organizer signature on the manifest: passed | Trus
     console errors: none
  _headers "/*" rule applied (Netlify / Cloudflare Pages style)
     result: (no output after 60 s)
     console errors: ... Applying inline style violates ... 'style-src 'self'' ... || Executing inline script violates ... 'script-src 'self'' ...
  $ node packages/web/audit-b3/verifier-server.poc.ts
  verifier.html via the reference server: (no output after 20 s)
  console errors: Applying inline style violates the following Content Security Policy directive 'style-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-wEExrVw7XRAgHMylt8r ... || Executing inline script violates the following Content Security Policy directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash ('sha256-dVLUuMnx5aAB1HN6 ...
  $ node --test --test-reporter=spec packages/web/audit-b3/server-static.poc.test.ts
  GET /verifier.html -> 200 text/html; charset=utf-8
     CSP : default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: ...
  ```
  (The two `ERR_TUNNEL_CONNECTION_FAILED` lines in the first run coincide with the two violations and are most likely the browser's CSP reports to `report-uri /csp-report`, which bypass the PoC's route; the meta-only run has none.) PoCs: `verifier-headers.poc.ts`, `verifier-server.poc.ts`, `server-static.poc.test.ts`.
- **Why untested.** `e2e/run.ts:45-48` serves `/verifier.html` with `default-src 'none'` and never loads it; `test/build.test.ts` checks the page text only; `_headers` assertions cover three headers.
- **Spec.** QV-19 §7 ("usable from `file://` or any static host", own meta CSP), QV-19-REQ-016 (E2E: page loads, fixture bundles pass/fail), §8.1 ("all HTML/JS responses" carry the header set — in tension with §7, section 6 gap G2).
- **Suggested fix.** Emit a `/verifier.html`-specific header block whose CSP equals the page's meta policy (the build already has `scriptHash`/`styleHash`) and keep it out of `/*` (or serve it from its own path prefix); make the reference server's static handler choose the CSP per file; add one Chromium test that loads `verifier.html` under the generated headers.
- **KNOWN.** WV-10 (info) notes `_headers` is host-specific and that "`verifier.html` has no header"; the break described here is not covered.

### B3-04 — Medium — CONFIRMED — SRI protects the entry module only; the claim "uses subresource integrity" is overstated

- **Where.** `src/build/site.ts:59-82` emits `integrity` for the stylesheet, one `modulepreload` and the entry `<script>`; chunks are written by `emitNamed` (`:131-137`) and imported by relative path with no integrity. The entry statically imports `assets/chunk-RFRBNNRD.js` and `assets/chunk-RWNAQACR.js` (executed on every load); locale tables and the chart are lazy chunks; the seal worker has none.
- **Scenario.** Object-store/CDN tamper (QV-19 §16 lists SRI as the mitigation): the entry hash still matches, a modified chunk runs with page privileges (can read the passphrase field, the unlocked signer, choices). Tampering the entry itself is blocked.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-observer.poc.ts          (step B3-F24)
  entry statically imports: assets/chunk-RFRBNNRD.js, assets/chunk-RWNAQACR.js
  tampered static chunk executed: true; console errors: 0
  tampered entry executed: false; page shows: "Loading…"; console: Failed to find a valid digest in the 'integrity' attribute for resource '.../assets/app.7fbf58ec18ff.js' ...
  $ node packages/web/audit-b3/sri-preload.poc.ts          (index.html with modulepreload+integrity for the two static chunks, in a temp copy)
  modulepreload+integrity, chunk intact: tampered code ran = false; page = "Skip to main content Experimental software. It has"; console = none
  modulepreload+integrity, chunk TAMPERED: tampered code ran = false; page = "Loading…"; console = Failed to find a valid digest in the 'integrity' attribute for resource '.../assets/chunk-RFRBNNRD.js' ...
  ```
- **Spec / status.** QV-19 §8.1: "`modulepreload` with integrity for lazy chunks … fallback is preload links with integrity"; QV-19-REQ-020 (Must): "HTML parse test verifies every `script`/`modulepreload`/`link` has integrity". `docs/claims/claims-register-v0.md` C-12 says "supported" ("uses subresource integrity"); `docs/plan/TODO.md` T-189 evidence says "SRI yes". `test/build.test.ts:12` is titled "(REQ-018/020/023)" but only checks that attributes present in `index.html` match their files and that at least three exist; it cannot see chunks, and its "reproducible" assertion is two builds in one process (not two independent builders).
- **Suggested fix.** Have `htmlPage()` emit `<link rel="modulepreload" integrity=… crossorigin>` for every statically imported chunk (and, optionally, lazy chunks); extend the HTML test to require integrity for every module the entry imports. No inline script or import map is needed.
- **KNOWN.** W15 (low, not fixed at this SHA; also the "design decision" in PR #6 `HANDOFF.md`) and WV-10. W15's and `NOTES.md`'s reasoning ("needs an import map / inline script") does not hold for the spec's own preload fallback, and W15 speaks of lazy chunks while the PoC tampers a statically imported one.

### B3-05 — Medium — CONFIRMED — Revote from a cached log is rejected and the screen says the opposite

- **Where.** `load()` caches the log for the SPA's lifetime (`src/ui/app.ts:231-251`); `voteView()` derives `supersedes` from `L.records` each time the Vote tab is entered (`:440-445`); `L.records` changes only through the SSE refresh (`src/flow/live.ts`); the server's `422 ENTRY_INVALID reason E_SUPERSEDES` is mapped to `E-VOT-SUPERSEDED-LOST` (`src/api/errors.ts:42`), whose outcome screen reads "Replaced by a newer ballot / A newer ballot from you is already recorded / The older ballot was not counted" (`app.ts:502-506`).
- **Scenario.** `max_per_voter > 1`. Voter casts A (recorded), then navigates Receipt → Vote in the same page session; with no live event applied yet the new controller still points at the genesis link, B is refused, A stays the counted ballot, B (the voter's final choice) is not recorded, and the text tells the voter the reverse. A fresh read of the log revotes fine. With SSE connected the cache refreshed 337–577 ms after the cast in my calibration, so the exposure is sessions where the stream is down (the e2e stub itself shows "Live updates are off").
- **Evidence.**
  ```
  $ node --test --test-reporter=spec packages/web/audit-b3/interop-server.poc.test.ts
  ballot A -> ACCEPTED_RECORDED
  ballot B (stale cache) -> SUPERSEDED { ux: 'E-VOT-SUPERSEDED-LOST', requestId: 'Gaj1Zde_A3asregY' }
    receipt title shown: "Replaced by a newer ballot"
    error shown: "A newer ballot from you is already recorded" / "The older ballot was not counted."
    voter ballots in the log after B: 1
  ballot C (fresh log) -> ACCEPTED_RECORDED
  $ node --test --test-reporter=spec packages/web/audit-b3/live-refresh.poc.test.ts
  records grew after own cast: true 337 ms after cast() returned/started | SSE states: connecting > live
  ```
  `FakeBoard` does not enforce `supersedes`, so no existing test can produce this outcome (`grep`: no test mentions `SUPERSEDED`).
- **Spec.** QV-10 §8.1 E-VOT-SUPERSEDED-LOST ("older ballot arrives after newer"), §7.1 `qv.privacy.g4` (newest ballot counts).
- **Suggested fix.** Re-read the log tail (or call the live refresh) when entering the Vote view and before sealing; append the voter's own recorded entry to `L.records` on `ACCEPTED_RECORDED`; on `E_SUPERSEDES` refresh and offer to seal again instead of the "newer ballot recorded" copy.
- **KNOWN.** Related W3 (medium, fixed): a re-seal after a failed cast is refused because its `supersedes` would be stale. The path here (a cached log after a successful cast) is not covered by W3.

### B3-06 — Medium — CONFIRMED — Late, paused or refused ballots are misreported

Four defects on the same screens (`src/ui/app.ts:138-148`, `:500-509`; `src/api/errors.ts:40`):

1. **Arguments missing.** `errorBox(ux, {}, ref)` is called with empty arguments at `app.ts:266,376,387,506,509,529`, but several catalog messages need arguments: E-VOT-CLOSED.body (`{time}`), E-VOT-NOTOPEN.title (`{time}`) and E-API-RATE.body (`{seconds}`) are all produced by `uxCodeFor` today; E-BOARD-STALE (`{time}`), E-VERSION (`{protocol}`), E-VER-FAIL (`{id}`), E-ORG-LANG (`{lang}`) and the E-VOT-OVERVOTE box variant (`{k}`) have no producer yet (B3-27). Formatting throws, the `catch` (`:143-145`) shows `E-GEN-UNKNOWN` ("Something went wrong / Your ballot has not been sent unless you saw a receipt") and the real code appears only in the reference line.
2. **Receipt text on unrecorded ballots.** `app.ts:505` always prints `qv.receipt.proves` ("This receipt proves your ballot was received and recorded in the public log…"), plus the ballot code, "Clear this device" and "Check inclusion now", for AFTER_CLOSE, REJECTED, SUPERSEDED and DUPLICATE outcomes.
3. **PAUSED/SCHEDULED shown as closed.** `errors.ts:40` classifies `WRONG_PHASE` by regex on free text (`/clos/`, `/not.*open|before/`, default CLOSED). The real server's detail is `"ballot is not accepted while the election is PAUSED"` (`packages/server/src/election.ts:609`), so a steward pause is reported as "Voting had closed". `FakeBoard` uses the phrase "Election closed; ballots are no longer accepted." (`fake-board.ts:191`), which hides it.
4. **Vote form not phase-gated.** A closed election still offers choices, review, seal and a code, and fails only at Send.

- **Evidence.**
  ```
  $ node --test ... packages/web/audit-b3/unit.poc.test.ts
  E-VOT-CLOSED.body: missing message argument "time"
  E-VOT-NOTOPEN.title: missing message argument "time"
  E-VOT-OVERVOTE.body: missing message argument "k"
  E-BOARD-STALE.title: missing message argument "time"
  E-ORG-LANG.body: missing message argument "lang"
  E-API-RATE.body: missing message argument "seconds"   (also E-VERSION, E-VER-FAIL, E-ORG-MANIFEST)
  $ node --test ... packages/web/audit-b3/interop-server.poc.test.ts
  server answer while PAUSED: 409 WRONG_PHASE detail="ballot is not accepted while the election is PAUSED" reason=undefined -> client AFTER_CLOSE E-VOT-CLOSED
  cast while PAUSED -> AFTER_CLOSE E-VOT-CLOSED
    UI title: "Voting had closed" | error title: "Voting has closed"
  $ node packages/web/audit-b3/ui-voter.poc.ts        (B3-F21, election closed)
  phase shown before voting: none (form rendered); after sealing and sending: Voting had closed | Ballot code: S51F- | ... | This receipt proves your ballot was received and recorded in the public log, and lets anyone (including you) check that it has not been removed or changed. | It does not show what you chose ... | Something went wrong | Your ballot has not been sent unless you saw a receipt. | Reference: E-VOT-CLOSED req_fake | Clear this deviceCheck inclusion now
  ```
  PoCs: `unit.poc.test.ts` (B3-F9), `interop-server.poc.test.ts` (B3-F4, B3-F4b), `ui-voter.poc.ts` (B3-F21).
- **Spec.** QV-10 §8.1 (E-VOT-CLOSED "Voting has closed / Your ballot was not counted. Voting closed at {time}.", E-VOT-NOTOPEN "Voting opens {time}"), §8.2 (outcome copy), QV-10-REQ-006, QV-13-REQ-094 (E-VOT-CLOSED behaviour).
- **Suggested fix.** Pass the arguments (close/open instants from the signed manifest, formatted per QV-13 §9.5); choose the receipt paragraph by outcome; classify `WRONG_PHASE` from the manifest times and a machine-readable `reason` rather than a regex (QV-09 needs a code, section 6 gap G3); gate the vote view on `ctx.phase`/manifest times and show E-VOT-NOTOPEN/E-VOT-CLOSED before sealing.
- **KNOWN.** None.

### B3-07 — Medium — CONFIRMED — Test-ballot result omits what was sealed

- **Where.** `src/ui/app.ts:492-499` shows the automatic checks, `qv.audit.posted`, the question "Do these match what you picked?" (`qv.audit.matchQ`, radio group) and a download of `qv-audit.json` (the package holds `reveal: {xi, selections}`, `src/flow/audit.ts:24-29`), but no table of contest → opened selection, no randomness view, and the `qv-audit:` link that `ballot-controller.ts:216` already computes (`auditLink`) is never rendered; there is no QR.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-voter.poc.ts           (B3-F12)
  tables on the screen: 0; contains "YES"/"ann": false
  screen text from the heading on: Practice vote opened | Your device locks your choices. A test lets you check ... | Automatic checks on this page | The opened ballot matches the code shown before you chose: passed | ...
  ```
- **Impact.** The human comparison, the one Benaloh step not performed by the same software, cannot be done on the screen; the downloaded `qv-audit.json` is the only place the opened choices exist, and the web `/verify` page does not accept audit packages (NOTES "Gaps"), so the second-device path is the CLI only.
- **Spec.** QV-10-REQ-008, §6.2 V8 ("Table: contest → what your device sealed … 'Do these match what you picked?'"), §10.1; QV-19 §6.2 ("AUDIT shows … tracking code, plaintext selections, randomness, and a `qv-audit:` link/QR"); QV-13 C-BENALOH ("result table with headers"). `docs/plan/TODO.md` T-181 is Open, so this is a known-open row rather than inflation, but the UI already presents the confirmation question.
- **Suggested fix.** Render the V8 table from the audit package the controller already builds (`ctl.lastAudit`), keep the radio group, add the second-device link when available.
- **KNOWN.** None.

### B3-08 — Medium — CONFIRMED — "Clear this device" is irreversible and unconfirmed

- **Where.** `clearDevice()` (`src/ui/app.ts:97-107`) wipes all four stores; the button is always present on the key page (`:435`) and on the receipt screen (`:508`). The catalog already has `qv.key.forgetConfirm` and `qv.key.forgetBody`, unreferenced.
- **Scenario.** A voter who never exported the key file (see B3-09) taps the button; the wrapped key is gone. Before freeze the organizer must re-issue; after freeze there is no recovery by design (QV-19 §5.4, ADR-005).
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-voter.poc.ts           (B3-F13)
  IndexedDB before {"heads":0,"keys":1,"receipts":0,"settings":0} -> after {"heads":0,"keys":0,"receipts":0,"settings":0}; browser dialogs: 0; in-page dialog elements: 0
  ```
- **Spec.** QV-13 C-DIALOG ("confirmations: freeze, cancel, clear device — native `<dialog>` with focus trap + Esc + return focus; … label states consequence"), QV-10-REQ-011.
- **Suggested fix.** Native `<dialog>` using the existing strings, with the checkbox alternative to typing.
- **KNOWN.** None (W9 fixed the failure announcement only).

### B3-09 — Medium — CONFIRMED — Key backup is offered once; the recovery code cannot be read back

- **Where.** Backup buttons exist only in `finish(signer, created)` (`src/ui/app.ts:378-396`) and `created` is passed only by the create path (`:429`); the unlock (`:403`) and key-file import (`:420`) paths call `finish(signer)` without it, and a failed registration returns early (`:385-389`) before the buttons are drawn. `restoreFromRecovery` (`src/flow/onboarding.ts:69`) has no caller. There is no restore check or waiver gate before the key is used.
- **Scenario.** (a) Registration fails (network, `E-GEN-UNKNOWN`) or the voter navigates away before pressing "Download key file": the key exists only in IndexedDB; the key page never again offers an export; any storage eviction, "Clear this device" (B3-08) or browser change loses it. (b) A voter writes down the recovery code the page shows; the web client has nothing to type it into.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-voter.poc.ts           (B3-F15)
  registration error shown: "Something went wrong | Your ballot has not been sent unless you saw a receipt. | Reference: ⁨E-GEN-UNKNOWN⁩ ⁨req_fake⁩"
  keys stored in IndexedDB: 1; backup buttons after the failure: 0; after reload+unlock: 0
  $ grep -rn restoreFromRecovery packages/web/src      -> only its definition (src/flow/onboarding.ts:69)
  ```
- **Spec.** QV-10-REQ-021; QV-19-REQ-008 (Must: key-file export and recovery-code backup before first ballot, "with checksum validation on import … Round-trip test, E2E"); QV-04-REQ-006 (Must: no enrolment completion until a backup restore check passes, unless waived). Unit tests (`test/key.test.ts`) cover the library round trip only.
- **Suggested fix.** Offer "Download key file" and "Show recovery code" from the stored container on the unlocked key page (the container is already in IndexedDB); add the import form using `restoreFromRecovery` with the existing `qv.key.recoveryImport`/`qv.key.recoveryBad` strings; add the restore check/waiver step of QV-04-REQ-006.
- **KNOWN.** `docs/plan/TODO.md` T-178/T-179 are "Partial", but neither names these gaps.

### B3-10 — Medium — CONFIRMED — "Your key is registered." without a registration

- **Where.** `src/ui/app.ts:380-395`. (a) With no `#inv=` token no request is made (`if (token)`), yet `finish()` prints `qv.key.registered`. (b) Any HTTP 409 is treated as success (`:385`); the real server answers 409 `INVITE_USED` when a different key already consumed the invite (and 409 for "this key is already registered").
- **Scenario.** (a) A link copied without its fragment: the voter creates a key, is told it is registered, and later gets E-VOT-NOTONROLL at Send. (b) A forwarded invite used by someone else: the second voter is told "Your key is registered. The organizer will add it to the voter list" although the server refused.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-voter.poc.ts           (B3-F14)
  hint "no invitation" shown: true; success text shown: true; POST /registrations sent: 0
  $ node --test --test-reporter=spec packages/web/audit-b3/interop-server.poc.test.ts   (B3-F31)
  key 1 with the invite  -> ok
  key 2 with the same invite -> { status: 409, code: 'INVITE_USED' }
  app.ts decides on e.status === 409 only (never on e.code): INVITE_USED is reported as success
  ```
- **Spec.** QV-10 §1(1) (no false assurance); QV-09 §4 (`409 INVITE_USED`).
- **Suggested fix.** Treat 409 as success only when the server confirms the same key (idempotent `201`, per QV-09:146) and show an error for `INVITE_USED`; when no registration was attempted, show a neutral "key ready on this device" text.
- **KNOWN.** W6 (medium, "fixed": 409 = already registered counts as success) — incomplete: its stated assumption is wrong for `INVITE_USED`. The missing-UX-code gap is excluded from this report; this finding is the success branch that would remain even after codes are added.

### B3-11 — Medium — CONFIRMED — Auto-lock is silent, leaves a broken flow, and the hidden-tab rule can be bypassed

- **Where.** `src/ui/app.ts:79-93` (`lockAll`, the `visibilitychange` handler at `:84-87`, the 15 s interval at `:88-93`), `src/key/lock.ts:19-29`, `src/key/signer.ts:56-61` (`lock()` wipes `nonceKey`), `src/flow/ballot-controller.ts:231-235`.
- **Scenario 1 (idle).** After 10 minutes on the review screen the lock fires: only the live region says "Your key is locked." (no visible text, no unlock prompt); "Seal my ballot" is still offered; sealing works with a zeroed hedge key (`signer.lock()` wiped `nonceKey`, which feeds `deriveXi`, QV-16 §5.11); a code is shown; "Send my vote" enabled; Send fails with "Something went wrong / Your ballot has not been sent unless you saw a receipt" and 0 POSTs reach the board. Nothing tells the voter to unlock.
- **Scenario 2 (hidden).** `visibilitychange` calls `timer.setHidden(document.hidden, now)` and only then `shouldLock`; on return `setHidden(false)` has already cleared `hiddenSince`, so the "hidden > 2 min" rule can fire only if the 15 s interval ticks while hidden. Where timers are suspended in background tabs (typical on mobile), a tab hidden for 5 minutes returns unlocked.
- **No warning.** `LockTimer.warningMsRemaining` (REQ-007) is never called; `qv.key.lockWarn`, `qv.key.stayUnlocked`, `qv.key.lockNow` are unreferenced.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/autolock.poc.ts           (fake clock, +11 min)
  before idle: review screen shown: true
  live regions after the lock: polite= "Your key is locked." urgent= ""
  visible lock notice in the page body: false
  seal button still offered: true
  sealed after the lock; code shown; send enabled: true
  after Send: Something went wrong | Your ballot has not been sent unless you saw a receipt.
  POST requests that reached the board: 0
  $ node packages/web/audit-b3/hidden-lock.poc.ts        (visibility emulated, timers suspended, +5 min)
  after 5 minutes hidden: lock notice shown = false; ballot form offered = true  (spec: locked after > 2 minutes hidden)
  $ node --test ... packages/web/audit-b3/unit.poc.test.ts
  after lock: nonceKey all zero = true | controller state = reviewing
  seal with the wiped signer -> sealed (the hedge key in QV-16 5.11 is now 32 zero bytes)
  cast -> PENDING_UNCONFIRMED E-GEN-UNKNOWN | state failed | copy: "Your ballot has not been sent unless you saw a receipt."
  ```
  (The hidden-tab PoC models suspended timers with Playwright's fake clock and a stubbed `document.hidden`; real browser behaviour is Appendix A, S2.)
- **Spec.** QV-19 §5.3 ("auto-locks after 10 min idle and on `visibilitychange` to hidden for > 2 min"), QV-13-REQ-007 (warn ≥ 2 min before, option to extend), QV-10 §8.1 E-KEY-LOCKED.
- **Suggested fix.** Evaluate `shouldLock` before clearing `hiddenSince` in the visibility handler; after a lock redraw the vote view to the existing "key locked" screen with the unlock link; make `seal()` refuse a locked signer; wire `warningMsRemaining` with the existing `qv.key.lockWarn`/`stayUnlocked` strings.
- **KNOWN.** W4 (medium, "fixed": `lockSession` reaches the controller, DOM wiring untested) — the controller part holds; the user-visible and hidden-tab behaviour above remains.

### B3-12 — Medium — CONFIRMED — No IndexedDB means no election pages at all

- **Where.** `src/ui/app.ts:336` awaits `env.storage.getSettings()` before choosing a sub-view, so overview, rules, key, vote, receipt and results all depend on storage and a rejection is caught by `route()` (`:264-267`) and shown as the generic error; `src/main.ts:9` checks only that `indexedDB` exists, not that it opens.
- **Scenario.** Environments where `indexedDB.open` fails (older Firefox/Tor private modes, storage-blocking settings). Every page shows "Something went wrong — Your ballot has not been sent unless you saw a receipt." A voter cannot read the rules or the results, and E-KEY-STORAGE's "Download the key file now and use it each time" is unreachable because no key file can be created.
- **Evidence** (failure simulated in Chromium by making `indexedDB.open` fire `onerror` with `InvalidStateError`):
  ```
  $ node packages/web/audit-b3/storage-blocked.poc.ts
  overview  -> Something went wrong | Your ballot has not been sent unless you saw a receipt.
  rules     -> Something went wrong | Your ballot has not been sent unless you saw a receipt.
  key       -> Something went wrong | Your ballot has not been sent unless you saw a receipt.
  vote      -> Something went wrong | Your ballot has not been sent unless you saw a receipt.
  results   -> Something went wrong | Your ballot has not been sent unless you saw a receipt.
  forms on the key page: 0 | uncaught page errors: none
  ```
- **Spec.** QV-26-REQ-011 (Must: "function in Tor Browser at 'Standard' level without storage, service workers or WebCrypto subtle"), QV-07-REQ-064, QV-10 §8.1 E-KEY-STORAGE, QV-13 §7.1 (read-only pages are meant to keep working when other capabilities fail). `crypto.subtle` absence is also refused at `main.ts:9` (feature detection is a spec requirement, QV-13-REQ-044, but REQ-011's wording asks to work without it).
- **Suggested fix.** Make storage optional: wrap storage reads in `try/catch` with an in-memory fallback, show E-KEY-STORAGE only on key operations, allow a session-only key from an imported file. Real Tor Browser/Firefox behaviour was not tested (Appendix A, S1).
- **KNOWN.** None.

### B3-13 — Medium — CONFIRMED — The signed promise of a `sequenced` answer is dropped; a 5xx after a recorded ballot reads "not sent"

- **Where.** `src/flow/ballot-controller.ts:144-153` saves a receipt and head only for `ACCEPTED_RECORDED`; `verifyAppendResult` returns `PENDING_UNCONFIRMED` when the receipt has no inclusion (`src/flow/receipt.ts:58`); the board answers `sequenced` whenever no checkpoint covers the entry yet (`packages/server/src/election.ts:615`, receipt inclusion only "when covered by a checkpoint", `packages/board/src/log.ts:139-143`). QV-09:305 defines both answers ("`POST /entries` blocks up to 2 s for the next checkpoint (QV-18 §7.2); `AppendResult.status` is `included` (with proof) or `sequenced` (promise only)"). The reference server checkpoints inside every append (`election.ts:655`) and therefore always answers `included`, so this branch is reached with a board that checkpoints on a cadence (QV-18 MMD; `FakeBoard.lazyCheckpoints` in the tests), not with the reference server. Unknown deliveries (5xx, timeouts) go to the `failed` state (`:158-178`) and the screen shows the generic error (`app.ts:509`), not the §8.2 outcome title or the E-NET-TIMEOUT copy.
- **Scenario A (board with a checkpoint cadence).** A cast answered `sequenced`: no receipt file, nothing stored on the device, no pinned head, no "check later" path (the Receipt page works from stored receipts or an uploaded file); the signed promise (`promise_sig`, `checkpoint_deadline`), which is the voter's evidence that the operator accepted the ballot, is lost when the tab closes.
- **Scenario B.** The board records the ballot but the HTTP answer is a 500: the voter reads "Something went wrong — Your ballot has not been sent unless you saw a receipt" with a "Send my vote" button (a retry is safe because identical bytes are idempotent, see control) while the entry is in the log.
- **Evidence.**
  ```
  $ node --test --test-reporter=spec packages/web/audit-b3/pending.poc.test.ts
  outcome: PENDING_UNCONFIRMED | state: cast | receipt file offered: false | receipts stored on device: 0 | pinned head stored: false
  $ node packages/web/audit-b3/ui-voter.poc.ts           (B3-F20)
  entries recorded on the board by this click: 1
  screen text from the live line on: Your ballot | ... | Something went wrong | Your ballot has not been sent unless you saw a receipt. | Send my vote | More details
  $ node --test ... packages/web/audit-b3/errmap-server.poc.test.ts      (control)
  second POST of identical bytes -> 200 (first was 201); pending kept after success: true
  ```
- **Spec.** QV-10 §8.2 (`PENDING_UNCONFIRMED` — "Waiting for confirmation"), §8.1 E-NET-TIMEOUT ("We're not sure your ballot arrived … it's safe to retry"), §10.2 (receipt file, re-check later), QV-19 §6.2, QV-26-REQ-043. The catalog has `qv.receipt.pendingTitle`; `qv.receipt.pendingBody` is unreferenced. `test/flow.test.ts:281` covers the library path only.
- **Suggested fix.** Persist the signed receipt/promise as a receipt file for the pending case and let the Receipt page re-check it; show the pending title/body for unknown deliveries and use the E-NET-TIMEOUT copy for 5xx/timeouts.
- **KNOWN.** W1 (high, fixed: retry resends the same bytes) — retained and verified by the control; this finding concerns what is kept and said.

### B3-14 — Medium — CONFIRMED — One-ballot elections: the UI promises revoting and mis-reports the refusal

- **Where.** `qv.ballot.revoteNote` ("You can vote again before the vote closes…", `src/i18n/en.ts:207`) is shown on the vote view whatever `manifest.ballots.max_per_voter` says (`src/ui/app.ts:510`); the pre-seal screen omits "whether revoting is allowed" (QV-10-REQ-001). The server refuses an over-limit ballot with `429 REVOTE_LIMIT` and `retryable:false` (`packages/server/src/election.ts:1018`), but `src/api/client.ts:234` forces `retryable` for every 429, `postEntryWithRetry` re-posts it, and `ballot-controller.ts:160` treats any 429 as an unknown delivery. `errors.ts:41` (REVOTE_LIMIT → E-VOT-ONEBALLOT) is therefore never reached.
- **Scenario.** The voter has used up `max_per_voter` (with `max_per_voter = 1` the UI has still told them twice that they can vote again), seals another ballot and presses Send: four POSTs, final state "failed", error code E-API-RATE (whose body needs `{seconds}` and therefore renders as the generic "Something went wrong", B3-06), a retry button (the PoC below uses `max_per_voter = 4` and a fifth ballot; the copy PoC uses `max_per_voter = 1`). The first ballot stays counted; the voter's intended change is silently not applied and the screen does not say so.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-copy.poc.ts            (B3-F26)
  manifest ballots: {"max_per_voter":1,"max_spoils_per_voter":16}
  revote claim shown: true; "This election allows one ballot per person" shown: false
  $ node --test --test-reporter=spec packages/web/audit-b3/errmap-server.poc.test.ts   (B3-F30)
  5th ballot (max_per_voter = 4): POST attempts = 4 429,429,429,429 | outcome PENDING_UNCONFIRMED E-API-RATE | controller state failed (retry button offered)
  problem codes per attempt: REVOTE_LIMIT > RATE_LIMITED > RATE_LIMITED > RATE_LIMITED | first body retryable flag: false
  ```
  (Attempts 2–4 returned `RATE_LIMITED` because the server's limiter also counted the retries, as the output shows.)
- **Spec.** QV-10 §8.1 E-VOT-ONEBALLOT ("This election allows one ballot per person. Your first ballot counts."); QV-09:124 and :647 (`retryable` guides clients; unknown codes are non-retryable unless `retryable:true`). QV-09:138 lists REVOTE_LIMIT among "yes, after Retry-After" 429s, which contradicts the server body (section 6, gap G4). The normative guarantee string g4 (QV-10 §7.1) is unconditional and has no one-ballot variant (gap G5).
- **Suggested fix.** Honour the problem body's `retryable` when present; treat `REVOTE_LIMIT` as a definite refusal (E-VOT-ONEBALLOT); show the revote note and the REQ-001 "revoting allowed" field from the manifest (the `qv.ballot.revoteNote` string is client-authored, not normative).
- **KNOWN.** None.

### B3-15 — Low — CONFIRMED — Cast and Test do not have equal prominence

- **Where.** `src/ui/app.ts:479-480`: Cast is `btn(..., {primary: true})`, Test is a plain `btn`; `static/styles.css:13-14` makes `.btn.primary` filled and `.btn` outlined. (Order, initial focus on Cast and "code before buttons" do match the spec.)
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-copy.poc.ts            (B3-F27)
  Send my vote: {"bg":"rgb(11, 92, 173)","fg":"rgb(255, 255, 255)","border":"rgb(11, 92, 173)","w":160}
  Double-check this vote: {"bg":"rgba(0, 0, 0, 0)","fg":"rgb(11, 92, 173)","border":"rgb(11, 92, 173)","w":241}
  ```
- **Spec.** QV-10-REQ-007 and QV-19-REQ-011 (Must: "give both equal prominence"), QV-10 §6.2 V6 ("Both buttons same size/style"), QV-13 C-BENALOH, QV-10-REQ-024 (no dark patterns); `docs/plan/TODO.md` T-181 (Open).
- **Fix.** Render both with the same class; keep Cast first and focused.
- **KNOWN.** None.

### B3-16 — Low — CONFIRMED — Verifier headline says "All checks passed" under a mismatching Election ID and with checks not run

- **Where.** SPA `src/ui/app.ts:617-625` prints the `E-VER-ANCHOR` box, then the verdict heading from `rep.verdict`; the standalone page does the same (`src/verifier/page.ts:53-74`). The protocol verdict is PASS while "append-only log", "witness cosignatures" and "sampled receipts" are `not run`.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/verifier-anchor.poc.ts      (WRONG Election ID typed)
  SPA /verify: This doesn't match the Election ID you entered | You may be examining a different election. Stop and check where you got the file. | All checks passed | 11 of 14 checks passed. | ... The record is an append-only log: not run | Witness cosignatures: not run | ... Sampled receipts: not run
  standalone verifier.html: This doesn't match the Election ID you entered. You may be examining a different election. Stop and check where you got the file. | All checks passed | 11 of 14 checks passed. ...
  #live (announced): "This doesn't match the Election ID you entered. All checks passed"
  ```
  (The standalone page was loaded with its own meta CSP only, see B3-03.)
- **Spec.** QV-10 §1(1) ("'Verified' is only ever shown next to an enumerated list"), §8.1 E-VER-ANCHOR (primary action: Stop), §11 (fake-verifier controls), QV-10-REQ-013 (itemized list is present, so not a violation of the letter).
- **Fix.** When the anchor check fails, do not print the PASS heading; show the E-VER-ANCHOR stop message as the result. Do not label a run "All checks passed" while the same screen reports "11 of 14" (use the existing `qv.verify.itemized` line as the headline or reword the catalog string with the copy owner).
- **KNOWN.** WV-6 (low, fixed: the mismatch was added to the live region); the headline remains.

### B3-17 — Low — CONFIRMED — Stale views overwrite later navigation

- **Where.** `route()` (`src/ui/app.ts:253-268`) and `electionView()` (`:326-364`) await network/chunk loads with no token check before `render()`.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/nav-race.poc.ts           (chart chunk delayed 1.5 s; click Results then Check a receipt)
  0.3 s after the second click: url = receipt | h1 = Check a receipt
  3 s later                   : url = receipt | h1 = Results
  $ node packages/web/audit-b3/nav-race2.poc.ts          (election log read delayed 2.5 s; click Help meanwhile)
  0.3 s after clicking Help: url = /help | h1 = Help and accessibility
  after the election finished loading: url = /help | h1 = Test election web-e2e
  ```
  The late render also moves focus to its heading (`render()` focus rule, `:217`).
- **Spec.** QV-13 C-STEPPER/2.4.3 (focus order and history), QV-10-REQ-020 and QV-13 §3 (slow networks are a target).
- **Fix.** A monotonically increasing navigation id checked after each `await`.
- **KNOWN.** None.

### B3-18 — Low — CONFIRMED — Live regions: too many, and the key warning is truncated

- **Where.** QV-13-REQ-021 allows one polite and one assertive region per page, messages ≤ 140 characters. Pages carry extra `role=status`/`role=alert` containers (`src/ui/app.ts:273,341,368,519,609,630`) next to `#live-polite`/`#live-urgent`; `Announcer.say` enforces the limit by truncation (`src/ui/dom.ts:36`). Only one catalog message used with `say` exceeds 140 characters: `qv.phish.mismatch` (213), announced assertively when the voter says the Election ID does not match.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/live-regions.poc.ts
  home                       3 live regions: p[alert/] div#live-polite[status/polite] div#live-urgent[alert/]
  key                        3 live regions: div[status/] div#live-polite[status/polite] div#live-urgent[alert/]
  receipt                    3 live regions: div[status/] div#live-polite[status/polite] div#live-urgent[alert/]
  verify                     3 live regions: div[status/] div#live-polite[status/polite] div#live-urgent[alert/]
  $ node packages/web/audit-b3/phish-announce.poc.ts
  announced (assertive region, 140 chars): "Stop. This Election ID does not match the one you were given. ... Tell your organiz"
  visible text (213 chars): "Stop. This ... Tell your organizer, and use the link or ID they gave you in person or by another channel."
  ```
  (The visible text is complete and sits in a `role=status` container, so a screen-reader user hears it in full politely as well; no AT was run.)
- **Fix.** A ≤ 140-character announcement key for the assertive case; drop the extra live containers or turn them into plain regions.
- **KNOWN.** WV-11 (info) recorded "one polite + one assertive live region" by code reading; the extra containers were not counted.

### B3-19 — Low — CONFIRMED — Key form: wrong `autocomplete`, wrong error for non-key files

- **Where.** One `pass` field serves create and unlock with `autocomplete: 'new-password'` (`src/ui/app.ts:370`); the organizer publish field correctly uses `current-password` (`:648`). `showErr` maps every `KeyError` except `E_KEY_LOCKED` to `E-KEY-STORAGE` (`:374-377`), so a file that is not a key file (`E_KEY_FORMAT`), has bad parameters or a bad checksum reads "This browser won't store your key". `qv.key.importBad` exists and is unreferenced.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-voter.poc.ts
  B3-F17 unlock form passphrase input autocomplete="new-password"
  B3-F16 alert text: This browser won't store your key | Download the key file now and use it each time.
  ```
- **Spec.** QV-13 C-KEY (`new-password` / `current-password`), WCAG 3.3.8 (§4 table), QV-10 §6.2 V3 ("allows paste and password managers"), §8.1 E-KEY-STORAGE (storage blocked only).
- **Fix.** Choose the token by mode; map `E_KEY_FORMAT`/`E_KEY_PARAMS`/`E_KEY_CHECKSUM` to `qv.key.importBad`.
- **KNOWN.** None.

### B3-20 — Low — CONFIRMED — Transparent re-wrap predicate is inverted

- **Where.** `src/flow/onboarding.ts:104-113`: re-wrap requires `adapt.changed === false`, but `adaptParams` (`src/key/keystore.ts:199-204`) reports `changed: true` exactly when the device is fast enough to afford more memory; a floor container therefore stays at the floor on fast devices and is only doubled on mid-speed ones.
- **Evidence.**
  ```
  $ node --test --test-reporter=spec packages/web/audit-b3/unit.poc.test.ts
  fast device (unlock took 100 ms): rewrapped = false | stored m = 19456
  mid device (unlock took 1000 ms): rewrapped = true | stored m = 38912
  ```
- **Spec.** QV-19 §5.3 ("parameters … can be raised later with transparent re-wrap at next unlock"), QV-19-REQ-005 (Should).
- **Fix.** Re-wrap when the adapted target is larger than the stored `m` (up to the default) and the unlock time is within range.
- **KNOWN.** None.

### B3-21 — Low — CONFIRMED — "Privacy and limits" leads nowhere

- **Where.** `src/ui/app.ts:712` links `/e`; `parseRoute` has no such route, so the page says "We could not find this election on this server."; the guarantee panel is reachable only inside collapsed "More details" on the rules and vote pages.
- **Evidence.** `ui-voter.poc.ts` B3-F18: `href -> http://127.0.0.1:42555/e; page says: We could not find this election on this server.`
- **Spec.** QV-10-REQ-002 (Must: guarantee panel shown on first entry; "no screen in voter flow lacks link `qv.nav.privacy`"), §5.3. `rulesSeen` (first-entry memory) is unwired.
- **KNOWN.** Self-reported: `docs/handoffs/2026-10-24-ordinary-inventory.md` "Restricted-scope items" and `QUIETVOTE-NEXT.md` ("The privacy `/e` destination … unchanged"). Not a prior audit ID.

### B3-22 — Low — CONFIRMED — Prototype-named ids crash views

- **Where.** `Selections = Record<string, string[]>` (`src/flow/ballot-machine.ts:6`) and `sel[c.id]` (`src/ui/app.ts:451-459`) use plain objects keyed by manifest ids; ICU `select` uses `n.cases[key] ?? n.cases.other` (`src/i18n/icu.ts:229-231`) and the catalog lookup is `EN[key]` (`src/i18n/index.ts:33`). The results view passes tally-supplied strings (`String(res.quorum_met)`, `res.outcome.kind`, `app.ts:599-600`) into these.
- **Scenario.** A manifest with contest id `constructor` (accepted by `validateManifest`) makes the vote view throw ("Something went wrong"); a signed tally with `quorum_met: "constructor"` or `outcome.kind: "__proto__"` crashes the results view. Organizer- or coordinator-triggered availability loss; no injection.
- **Evidence.**
  ```
  $ node packages/web/audit-b3/proto-id.poc.ts
  manifest accepted with contest id: constructor
  vote view text: Something went wrong | Your ballot has not been sent unless you saw a receipt.
  $ node --test ... packages/web/audit-b3/unit.poc.test.ts
  ✔ B3-F8: ICU select / key lookups use plain objects: prototype names in data throw instead of falling back to "other"
  ```
- **Fix.** `Object.hasOwn`/`Map` for these lookups; id charset check in manifest validation (B1 scope).
- **KNOWN.** None.

### B3-23 — Low — LIKELY — Organizer "Invitation links" are bare codes and hard to copy

- **Where.** The published-invites list renders `codeEl(i.code ?? '')` (`src/ui/app.ts:666-667`) under the heading "Invitation links (shown once)"; `makeInviteFragment` has no UI caller, so no `https://host/e/<id>#inv=<code>` is composed; there is no copy button. `codeEl` (`:133`) duplicates each group as a visually hidden spelled form, which becomes part of a mouse selection (shown for the Election ID helper in `code-select.poc.ts`: `selection text : "FT3P-F T 3 P,1KPZ-1 K P Z,..."`).
- **Why LIKELY.** The invite list needs an organizer key and the real server; I exercised `publishElection` against the real server (`publish-server.poc.test.ts`: election → manifest → dkg-open → invites accepted) but not this DOM list.
- **Spec.** QV-10 §6.1 O4/O6 (invitation distribution tool); T-183 (Partial).
- **Fix.** Render full links and a copy button that copies clean text.
- **KNOWN.** None.

### B3-24 — Low — CONFIRMED — "Election ID confirmed" is bound to the URL id

- **Where.** `src/ui/app.ts:340-342` reads/writes `settings.confirmed[r.id]` (API id from the path), `:349-353` sets it; the persistent "Not yet confirmed" chip (`qv.phish.unconfirmed`) is unreferenced.
- **Scenario.** After a voter confirms election X at `/e/<id>`, a host that later serves a different manifest under the same path is still shown as "Election ID confirmed on this device." (needs the same origin, i.e. the operator).
- **Evidence.**
  ```
  $ node packages/web/audit-b3/ui-voter.poc.ts           (B3-F19)
  before: Test election web-e2e Election ID: FT3P- ...
  after swap: Test election b3-other-election Election ID: KWXA- ...
  the page still says "Election ID confirmed on this device." (no comparison was made against the new ID)
  ```
  Clicking "Yes, it matches" with an empty field confirms by design (QV-10 V1 is a by-eye comparison).
- **Spec.** QV-10-REQ-012, §9 ("the client stores 'confirmed' locally" — what is stored is unspecified, gap G6).
- **Fix.** Store the confirmed Election ID string and compare on each load; show the stop/unconfirmed state when it differs.
- **KNOWN.** None.

### B3-25 — Low — CONFIRMED — Passphrase canonicalisation differs between web and CLI

- **Where.** `src/key/passphrase.ts:89-94` lower-cases and single-space-joins word passphrases before the KDF; the CLI uses NFKC of the raw string (`packages/cli/src/keyfile.ts:21-22`, B2 scope), with a code comment saying so ("the web client additionally folds word-list passphrases … which is not replicated here").
- **Evidence.**
  ```
  $ node packages/web/audit-b3/keyfile-interop.poc.ts
  generated : lobe kuga guna husa tejo nula neno
  typed back: LOBE-kuga-guna-husa-tejo-nula-neno | web canonical form equals generated: true
  web-made key file, web with typed passphrase : unlocks
  web-made key file, CLI with the same typed passphrase : fails (wrong passphrase or damaged key file)
  web-made key file, CLI with the canonical passphrase  : unlocks
  CLI-made key file, web unlock : unlocks, same key
  ```
- **Spec.** QV-19 §5.3 (key file is the portable backup), QV-04 §4.1 (CLI/second device import). Behaviour is undocumented in the UI.
- **Fix.** One shared canonicalisation, or tell the user the canonical (generated) form to use in the CLI.
- **KNOWN.** Acknowledged only in the CLI code comment above; not in any audit document and not surfaced to the voter.

### B3-26 — Low — CONFIRMED (blocking, no progress) / LIKELY (10,000-ballot time) — Offline verifier has no Worker pool or progress

- **Where.** `src/verifier/page.ts:35-49` calls `verifyElectionText` on the main thread; `verifier.html` contains no `new Worker(` and no `<progress>`; the only feedback is "Running…".
- **Evidence.**
  ```
  $ N=24  node packages/web/audit-b3/verifier-perf-browser.poc.ts   -> 1277 ms (53 ms/ballot); longest gap between animation frames 1206 ms
  $ N=96  ...                                                       -> 4082 ms (43 ms/ballot); longest gap 3986 ms
  $ N=192 ...                                                       -> 7586 ms (40 ms/ballot); longest gap 7514 ms
  verifier.html mentions "new Worker": false | mentions <progress>: false
  ```
  The page is unresponsive for the whole run (frame gap ≈ run time). Extrapolating the linear trend: 10,000 ballots ≈ 7 minutes with a frozen tab on this machine (LIKELY; not run).
- **Spec.** QV-19 §7: "M-tier bundle (10,000 ballots) verified in a Worker pool in < 5 min on a laptop, with progress and resumability".
- **Fix.** Run the shared verifier in a Worker pool and report progress.
- **KNOWN.** None.

### B3-27 — Low — CONFIRMED — Library code and catalog copy with no UI call site

Unit-tested or catalogued features a user cannot reach (verified by `grep` over `src/` and by `node packages/web/scripts/i18n-check.ts --json`). Each affected requirement is recorded in section 5.

| Item | Defined | UI references | Affects |
|---|---|---|---|
| `restoreFromRecovery` | `src/flow/onboarding.ts:69` | none | QV-19-REQ-008 (B3-09) |
| `checkRoll` (and `ApiClient.roll`) | `src/flow/election.ts:154`; `src/api/client.ts:148` | none | QV-19 §6.1 "You are on the roll"; QV-10 V3 |
| `LockTimer.warningMsRemaining` | `src/key/lock.ts:29` | none | QV-13-REQ-007 (B3-11) |
| `zonedLocalToUtc`, `offsetText` | `src/i18n/datetime.ts:57,80` | none (organizer dates use `isoUtc` of a `datetime-local`) | QV-13-REQ-092 |
| `parseFragment().board` / `safeBoardOrigin` | `src/flow/invite.ts:40` | parsed, never used (`load()` uses `env.apiBase`) | QV-19 §4 split-origin, REQ-022 |
| `commitRoll` | `src/flow/publish.ts:217` | none | self-reported in NOTES / N-37 |
| settings `sharedDevice`, `rulesSeen`, receipts opt-in | `src/key/storage.ts:21-25` | none (`rememberReceipts` read only in the controller) | QV-10-REQ-011, REQ-002, §10.2; QV-06-REQ-013 |
| `listKeySlots` | `src/key/storage.ts:129` | none | — |
| UX codes never produced | `src/api/errors.ts:28-31`, `en.ts` | E-KEY-LOST, E-BOARD-STALE, E-CLIENT-HASH, E-ORG-LANG, E-VER-FAIL, E-GEN-UNSUPPORTED, E-VERSION, E-VOT-DUP (so `DUPLICATE_IGNORED` is unreachable) | QV-10 §8.1/§8.2 |
| Catalog messages | `src/i18n/en.ts` (487) | 115 have no static or dynamic-prefix reference (Appendix C), e.g. `qv.key.forgetConfirm`, `qv.key.lockWarn`, `qv.receipt.enterCode`, `qv.ballot.undervote` (QV-10 V4: an undervote must never be silent), `qv.ballot.closingSoon`, `qv.help.clockOff`, `qv.help.versionSkew`, `qv.verify.selfTest*`, `qv.phish.unconfirmed`, `qv.status.*`, `qv.glossary.*` | see section 5 |

- **Evidence.**
  ```
  $ cd packages/web && for s in restoreFromRecovery checkRoll warningMsRemaining zonedLocalToUtc safeBoardOrigin sharedDevice rulesSeen commitRoll; do printf "%-22s" $s; grep -rln "$s" src | tr '\n' ' '; echo; done
  restoreFromRecovery   src/flow/onboarding.ts
  checkRoll             src/flow/election.ts
  warningMsRemaining    src/key/lock.ts
  zonedLocalToUtc       src/i18n/datetime.ts
  safeBoardOrigin       src/flow/invite.ts
  sharedDevice          src/key/storage.ts
  rulesSeen             src/key/storage.ts
  commitRoll            src/flow/publish.ts
  ```
  (each symbol appears only in its defining file; `restoreFromRecovery`, `checkRoll` and `recoveryCodeFor` have no unit test either). Catalog figure: Appendix C.
- **Why it matters.** `COPY.md`, the 487-message catalog, `i18n:check` (green) and the unit tests can be read as "built". The repo's own plan rows do not claim these as Done (T-178/T-179/T-186/T-187 are Partial; NOTES "Gaps" lists some), so this is a traceability risk rather than an overstated status, except where noted in B3-04.
- **KNOWN.** Partly self-reported in `packages/web/NOTES.md` ("Gaps": no QR, `/verify-client` not done, `commitRoll` not wired) and `docs/plan/TODO.md` N-36/N-37.

### B3-28 — Info — CONFIRMED — Key-file KDF ceiling is generous

- **Where.** `src/key/keystore.ts:18` ceiling `m=262144 KiB, t=10, p=4`, accepted by `validateParams` (`:63-70`).
- **Evidence.**
  ```
  $ node --test --test-reporter=spec packages/web/audit-b3/unit.poc.test.ts
  default 64 MiB t=3 p=1: 2836 ms
  floor   19 MiB t=2 p=1: 577 ms
  256 MiB t=3 p=1 (a quarter of the accepted ceiling work): 9365 ms
  ```
  A crafted key file at the ceiling would stall the tab for tens of seconds or exhaust memory on low-end phones; the user has to choose the file. Info only.
- **KNOWN.** None.

### B3-29 — Info — LIKELY — SPA `/verify` has no size bound

- **Where.** `src/ui/app.ts:615-616` reads the chosen file with `f.text()` and passes it to `verifyElectionText` (no limit in `packages/protocol/src/verify.ts:61`); the standalone page bounds input at 64 MiB (`src/verifier/page.ts:17-18,43`), as does the verifier loader (`packages/verifier/src/bundle.ts:6`). Malformed inputs themselves return FAIL in under 3 ms (`verify-garbage.poc.ts`: 13 shapes incl. 200,000-deep nesting). Not exercised with a huge file.

### B3-30 — Info — CONFIRMED — Browser checks are not in CI

- **Where.** `.github/workflows/ci.yml` runs `npm run check` (typecheck + workspace tests) and a non-blocking claims lint. `e2e/run.ts`, `e2e/help.ts`, `e2e/a11y.ts` need a global Playwright at a fixed path (`createRequire('/opt/node22/lib/node_modules/')`) and exit 0 when it is missing. The E2E never loads `verifier.html`, never registers successfully, never revotes, never opens results/receipts.
- **Evidence.** `.github/workflows/ci.yml` job `typecheck-test`: `run: npm run check` (= `npm run typecheck && npm test`); the only other job is the non-blocking claims lint. `e2e/run.ts:45-48` serves `/verifier.html` with `default-src 'none'` and no step opens it.
- **Spec.** QV-19-REQ-016/018 (E2E), QV-13-REQ-001 (axe via Playwright, zero serious/critical), QV-13 §6.1 ("blocks merge").
- **Note.** `e2e/a11y.ts` is honest about its limits (Home, Help, not-found only; "NOT a WCAG conformance claim"); my axe scan of eight further pages found no serious/critical rule (B3-32).

### B3-31 — Info — CONFIRMED — "Logged" time is the render time

- **Where.** `src/ui/app.ts:504` formats `new Date()` for `qv.receipt.logged`; the log's `sequenced_at` is in the receipt (`ReceiptView.promise`). QV-10 V7/REQ-009 ask for the time as logged.
- **Evidence** (page clock set to 2030, board clock 2026):
  ```
  $ node packages/web/audit-b3/logged-time.poc.ts
  receipt line: Logged ⁨1/1/2030, 12:00:02 PM⁩, entry #21
  POSTs seen by the board: 1 | real clock now: 2026-10-28T11:49:55.431Z
  ```

### B3-32 — Info — CONFIRMED — axe-core 4.13 results (information only)

```
$ node packages/web/audit-b3/ui-observer.poc.ts     (step B3-A1; axe-core 4.13.0, bypassCSP context)
overview /e/<id>: region[moderate] x1      rules: region[moderate] x1      key (create form): region[moderate] x1
results (tally): aria-allowed-role[minor] x2, region[moderate] x1      receipt: region[moderate] x1
verify: region[moderate] x1      create election: region[moderate] x1      verifier.html (standalone): no violations reported
$ node packages/web/audit-b3/axe-results.poc.ts
aria-allowed-role: <figure class="qv-chart" role="group" aria-labelledby="qv-cap-2"> (and qv-cap-4)
region: <p class="banner" role="note">Experimental software. It has not been independently audited. ...</p>
```
The experimental banner (`src/ui/app.ts:715`) sits outside every landmark; the chart wrapper (`src/ui/charts.ts:34`) uses a role axe does not allow on `figure`. QV-13 C-CHART asks for `role="img"` plus a description linked to the table. Not a conformance statement; no assistive technology was run.

### B3-33 — Info — CONFIRMED — Dependency declarations

```
$ sed -n 23,27p packages/web/package.json
  "dependencies": {
    "@quietvote/board": "*",
    "@quietvote/crypto": "*",
    "@quietvote/protocol": "*"
$ cat .npmrc
ignore-scripts=true
save-exact=true
engine-strict=true
```
`packages/web/package.json:24-26` declares `@quietvote/board|crypto|protocol` as `"*"` (QV-19 §11 P3: no ranges). They resolve to workspace links (`npm ls` shows `-> ./packages/...`), so no registry fetch happens; `esbuild` is pinned `0.28.2`; `.npmrc` has `ignore-scripts`, `save-exact`, `engine-strict` but not `audit-level=high`; the root `package.json` has no `packageManager`; no `Dockerfile.build`, `scripts/repro-check.sh`, `policy/` allowlists, release manifest or SBOM exist in the tree (QV-19 §9–§11, QV-19-REQ-023…031 — section 5).
- **KNOWN.** DEP-02 / DEP-01 (PR #15, unmerged): CI gates for exact pins, allowlist and lockfile checks are absent at this SHA. DEP-04 (PR #11) asked whether the build works without esbuild's postinstall: it does (section 8).


---

## 5. Conformance table

Status vocabulary: **OK** (implemented, matches the acceptance criteria, a test covers it) · **partial** · **not-implemented** · **untested** (implemented and apparently matching, no test covers it) · **mismatch** (implemented but behaves differently from the spec). Only requirements I evaluated are listed; others are in section 7. "Test" names the existing repo test; PoC files are mine. `docs/24-traceability-matrix.md` has no rows for these specs ("not yet generated"), so the specs' own requirement tables are the baseline.

### 5.1 QV-10 — user experience (27 requirements)

| Spec ID | Requirement (short) | Status | Implementation | Test | Notes / finding |
|---|---|---|---|---|---|
| QV-10-REQ-001 | One reviewable screen with question, options, rule, times in both zones, revoting allowed, Election ID before sealing | partial | `ui/app.ts:471-475` (review shows choices only), `:338-345`, `:358` | none (DOM) | rule/zones/revote spread over overview and rules pages; B3-14, gap G7 |
| QV-10-REQ-002 | Guarantee panel on first entry, one action from every voter screen, guarantees and non-claims equal weight | mismatch | `app.ts:712` (dead `/e` link), panel in `<details>` `:358,:510` | none | B3-21; first-entry memory `rulesSeen` unwired |
| QV-10-REQ-003 | Four visibility classes legend | partial | `app.ts:510`, `en.ts:91,165` | none | one-line note + panel; no four-class legend |
| QV-10-REQ-004 | No edit controls after ceremony | untested | no edit UI exists (`app.ts:363` admin stub) | none | by construction |
| QV-10-REQ-005 | Confirmation/receipt never show selections | untested | `app.ts:500-508`, `:492-499` | none (e2e does not assert) | review screen shows them by design |
| QV-10-REQ-006 | Exactly six outcomes, never "Success" without one | partial | `flow/ballot-machine.ts:27`, `app.ts:500-509` | `test/flow.test.ts` (ACCEPTED, PENDING, AFTER_CLOSE only) | B3-06, B3-13; REJECTED/SUPERSEDED/DUPLICATE_IGNORED untested; DUPLICATE_IGNORED unreachable (B3-27) |
| QV-10-REQ-007 | Code before Cast/Test; equal prominence; default focus Cast; test discarded text | mismatch | `ballot-machine.ts:50-55`, `app.ts:477-491` | `flow.test.ts:73`; e2e step "buttons enabled only after the code shows" | B3-15 (prominence) |
| QV-10-REQ-008 | Test ballot shown as plaintext record + second-device path + in-page checker | partial | `app.ts:492-499`, `flow/audit.ts` | `flow.test.ts:123` | B3-07; no table, no QR/link |
| QV-10-REQ-009 | Receipt contents, no choice data, statement of what it proves | partial | `flow/receipt.ts:115-137`, `app.ts:500-508` | `flow.test.ts:93` | B3-31; file name differs from §10.2; own schema (gap G11) |
| QV-10-REQ-010 | Re-check later by code or file, without login | partial | `app.ts:517-571`, `receipt.ts:81-113` | `flow.test.ts:296`, `live.test.ts` | lookup by code missing (`qv.receipt.enterCode` unreferenced); B3-13 |
| QV-10-REQ-011 | Shared-device toggle and Clear this device deleting key, receipts, drafts | partial | `app.ts:97-107,435,508` | none | B3-08; toggle/opt-in unwired (B3-27) |
| QV-10-REQ-012 | Election ID in persistent header; compare once; second-channel prompt | partial | `app.ts:320-324,340-356` | e2e step "overview: step indicator and Election ID check" | B3-24; "Not yet confirmed" chip and organizer prompt missing |
| QV-10-REQ-013 | Verifier: itemized named checks, manifest hash shown, no single all-good badge | partial | `app.ts:606-627`, `verifier/page.ts` | `build.test.ts` (page text) | list present; the manifest hash value is not printed; B3-16 |
| QV-10-REQ-014 (S) | Built-in canary self-test | not-implemented | none | — | NOTES "no canary self-test"; `qv.verify.selfTest*` unreferenced |
| QV-10-REQ-015 | No third-party resources; opt-in local "Copy diagnostic info" | partial | CSP, same-origin only | e2e last step; `security.test.ts:79` | diagnostic-copy absent (reference line only) |
| QV-10-REQ-016 (S) | Eligibility/rules preview and dry-run | partial | `app.ts:629-708` roll summary only | `publish.test.ts` | no dry-run |
| QV-10-REQ-017 | Organizer views expose no ballot-to-voter mapping | untested | no such view | none | |
| QV-10-REQ-018 | Early-results lock in trustee UI | not-implemented | trustee flows are CLI-only (ADR-024) | — | T-184 Open |
| QV-10-REQ-019 | Time displays per QV-13 (dual zone, offset) | mismatch | `app.ts:338` (viewer zone only) | `ui-logic.test.ts` (library) | gap G7; `qv.election.deadline*` unreferenced |
| QV-10-REQ-020 | Offline mid-submit: pending, idempotent retry, accepted once | partial | `client.ts:183-197`, `ballot-controller.ts` | `flow.test.ts:206,223,237` | B3-13 (copy, promise) |
| QV-10-REQ-021 | Offer key export after creation with §7.3 copy | partial | `app.ts:393-395` | `key.test.ts` (library) | B3-09 (once only) |
| QV-10-REQ-022 (S) | Report a problem with prefilled evidence | not-implemented | `qv.help.report` text only | — | |
| QV-10-REQ-023 | Trustee backup restore test | not-implemented | CLI-only | — | |
| QV-10-REQ-024 | No dark patterns | untested | review only | none | the only default-on box is the spec'd "post test ballot"; see B3-15 |
| QV-10-REQ-025 (S) | Reading level and glossary tooltips | partial | `test/copy.test.ts` | `copy.test.ts` | glossary tooltips absent (`qv.glossary.*` unreferenced) |
| QV-10-REQ-026 | Display-name policy | not-implemented | none | — | |
| QV-10-REQ-027 | Usability test plan executed with evidence | not-implemented | none | — | no `evidence/ux/` in repo |

### 5.2 QV-13 — accessibility and localization (requirements evaluated)

| Spec ID | Requirement (short) | Status | Implementation | Test | Notes / finding |
|---|---|---|---|---|---|
| QV-13-REQ-001 | WCAG 2.2 AA; axe zero serious/critical; manual audit; ACR | partial | — | `e2e/a11y.ts` (45 checks, Home/Help/not-found); my axe scan of 8 more pages: no serious/critical | no manual audit, no ACR, not in CI (B3-30); B3-32; **not a conformance claim** |
| QV-13-REQ-002 | Complete accessibility tree; read-only pages work without JS | not-implemented | SPA; `<noscript>` only | — | gap G8 |
| QV-13-REQ-005 | Guarantee panel at parity in every offered language | OK | `i18n/index.ts:33-39`; only `en` offered | `i18n-catalogs.test.ts`; `lang-gate.poc.ts` | one language today |
| QV-13-REQ-006 | prefers-color-scheme/-contrast/forced-colors/reduced-motion | partial | `static/styles.css`, Help `app.ts:289-303` | `e2e/a11y.ts`, `e2e/help.ts` (Home/Help) | other pages unchecked |
| QV-13-REQ-007 | Warn ≥ 2 min before inactivity lock, option to extend | mismatch | `key/lock.ts:29` unused | `key.test.ts` (timer only) | B3-11; thresholds differ between specs (gap G12) |
| QV-13-REQ-021 | ≤ 1 polite + ≤ 1 assertive region, messages ≤ 140 chars | mismatch | `ui/dom.ts:33-37`, `app.ts` | none | B3-18 |
| QV-13-REQ-022 | Sealing status and completion announced; focus to code heading | partial | `app.ts:476,490` | e2e (focus not on body) | focus goes to Cast per QV-10 V6 (gap G9) |
| QV-13-REQ-023 | Codes read by group; copy announced | partial | `app.ts:133-137` | W13 source test (`audit2.test.ts`) | no AT run |
| QV-13-REQ-024 | Accessibility Help page | OK | `app.ts:289-303` | `e2e/help.ts` | |
| QV-13-REQ-030 | No traps, visible focus ≥ 2 px / 3:1 | partial | `static/styles.css` | `e2e/a11y.ts` (3 pages) | |
| QV-13-REQ-033 | Reflow 320 px, 200% text | partial | `static/styles.css` | `e2e/a11y.ts` (3 pages + pseudo-locales) | |
| QV-13-REQ-034 | Contrast 4.5:1 / 3:1 in all themes | partial | tokens in `styles.css` | `e2e/a11y.ts` (mutation-tested: can fail) | Home/Help only |
| QV-13-REQ-040 | Read-only pages work without JS; `<noscript>` text | partial | `en.ts:30` (text equals the spec), `index.html` | none | pages need JS (gap G8) |
| QV-13-REQ-041 | JS ≤ 200 kB gz, per-locale catalog chunks ≤ 20 kB, total ≤ 300 kB | OK | `build/site.ts`, `build/cli.ts` | `build.test.ts`, `lazy.test.ts` | measured: 190.2 kB all JS, entry 93.0 kB, largest locale chunk 19.0 kB (ar); total transfer not measured |
| QV-13-REQ-042 | Time-to-interactive and seal-time budgets on low profile | untested | worker sealing `worker/worker-sealer.ts` | none | |
| QV-13-REQ-043 | Intermittent connectivity: idempotent retry, body ≤ 64 kB | partial | `client.ts:183-197` | `flow.test.ts:206,223,237` | body size for 10×10 not measured |
| QV-13-REQ-044 | Feature detection yields E-GEN-UNSUPPORTED with CLI instructions | partial | `main.ts:9` (`crypto.subtle`, `indexedDB` only) | none | other copy key used; B3-12 |
| QV-13-REQ-048 | Offline verifier page < 1 MB | untested | `dist/verifier.html` 172.0 kB | none (my PoC passes from a `file://`-like CSP) | no E2E (B3-30); hosted use broken (B3-03) |
| QV-13-REQ-060 | All strings via catalog IDs; lint for literals/concatenation | partial | `scripts/i18n-check.ts`, `i18n/extract.ts` | `i18n-lint.test.ts`, `i18n-cli.test.ts` | scope: main, app, dom, charts; `verifyView` and the verifier page excluded; 6 dynamic references unresolved |
| QV-13-REQ-061 | Catalog JSON schema with sensitivity | OK | `i18n/catalog-lint.ts` | `i18n-lint.test.ts`, `i18n-catalogs.test.ts` | |
| QV-13-REQ-062 | Precompiled messages, no runtime parser | partial | `build/precompile.ts` | `precompile.test.ts`, `app-precompile.test.ts` | SPA bundle: 0 parser markers; standalone `verifier.html` still embeds the parser (2 occurrences of `selectordinal`) |
| QV-13-REQ-063 | Locale negotiation: query > stored preference > browser > en | partial | `app.ts:61` | `i18n-catalogs.test.ts` | stored preference/switcher absent (inventory says so) |
| QV-13-REQ-064 | No silent fallback for guarantee strings; unreviewed locale not offered | OK | `i18n/index.ts:33-39`, `i18n/locales-core.ts` | `i18n-catalogs.test.ts`; `lang-gate.poc.ts` | draft locales neither offered nor downloaded |
| QV-13-REQ-065 | Pseudo-locales used in visual tests | partial | `i18n/pseudo.ts` | `e2e/a11y.ts` (Home/Help) | |
| QV-13-REQ-068 | Digits/ICU numbers, Latin for codes | partial | `i18n/icu.ts` (`number, latn`) | `icu-number.test.ts` | ar/fa/hi snapshot tests absent |
| QV-13-REQ-082 | Bidi isolation; bidi controls rejected in manifest | OK | `app.ts:133` (`bdi dir=ltr`), `validateManifest` (B1) | `unit.poc.test.ts` B3-F10; protocol tests | |
| QV-13-REQ-083 | FSI/PDI isolation of arguments | OK | `i18n/icu.ts` | `precompile.test.ts` (bidi cases) | results text shows isolates (B3-F7b) |
| QV-13-REQ-090 | Manifest stores UTC instants and `display_time_zone` | not-implemented | `voting_open/close` only | — | gap G7 (field absent from QV-16/QV-09) |
| QV-13-REQ-091 | Deadline shown in election zone and viewer zone with offsets | mismatch | `app.ts:338` | `ui-logic.test.ts` (library) | viewer zone only |
| QV-13-REQ-092 | Organizer local time resolved in election zone, DST gap/fold handling | not-implemented | `i18n/datetime.ts:57` unused | `ui-logic.test.ts` (library) | B3-27 |
| QV-13-REQ-093 | Clock-skew warning from signed responses | not-implemented | `qv.help.clockOff` unreferenced | — | |
| QV-13-REQ-094 | Closing-minute announcements; E-VOT-CLOSED behaviour | not-implemented | `qv.ballot.closingSoon` unreferenced | `flow.test.ts:254` (outcome only) | B3-06 |
| QV-13-REQ-095, -097 (S/M) | ICS export; locale calendar with ISO secondary | not-implemented | `isoDate` computed, unused | — | |

### 5.3 QV-19 — client architecture and supply chain (requirements evaluated)

| Spec ID | Requirement (short) | Status | Implementation | Test | Notes / finding |
|---|---|---|---|---|---|
| QV-19-REQ-001 | Static bundle, no origins other than declared | OK | `build/site.ts`, `api/client.ts` | `e2e/run.ts` last step; `security.test.ts:79` | |
| QV-19-REQ-002 | Production deps only `@noble/curves`, `@noble/hashes` | untested | `npm ls --omit=dev --all` shows exactly these | none | |
| QV-19-REQ-003 | Seed from CSPRNG, stored only AEAD-wrapped by Argon2id | OK | `flow/onboarding.ts:45`, `key/keystore.ts:90-127` | `key.test.ts` | |
| QV-19-REQ-004 | Argon2id 64 MiB/t=3/p=1, floor, stored params | OK | `key/keystore.ts:15-18,63-70,134-151` | `key.test.ts` | B3-28 (ceiling cost) |
| QV-19-REQ-005 (S) | Unlock 0.5–3 s, adapt m, warn at floor | partial | `keystore.ts:198-204`, `app.ts:428` | `key.test.ts` | B3-20 |
| QV-19-REQ-006 (S) | Non-extractable signing key, seed zeroed | OK | `key/signer.ts:20-67` | `key.test.ts:146-155` | |
| QV-19-REQ-007 | Passphrase policy, 7-word generator | OK | `key/passphrase.ts` | `key.test.ts`, `ui-logic.test.ts` | |
| QV-19-REQ-008 | Key-file export and recovery-code backup, checksum on import | partial | `app.ts:393-395`; `onboarding.ts:69` unwired | `key.test.ts` (library) | B3-09 |
| QV-19-REQ-009 | No secrets in URL/DOM/logs/localStorage/errors | partial | no `console`, no `localStorage` | `security.test.ts:79-105` | runtime canary test absent; passphrase stays in its input |
| QV-19-REQ-010 | Invite token in fragment, hashed on device | partial | `flow/invite.ts`, `onboarding.ts:117-127` | `ui-logic.test.ts:136` | web conforms; reference server does not accept it (B3-01) |
| QV-19-REQ-011 | Code and fixed ciphertext before CAST/AUDIT; equal prominence | mismatch | `ballot-machine.ts:50-55`, `app.ts:479-480` | `flow.test.ts:73` | B3-15 |
| QV-19-REQ-012 | Audit reveals plaintext and randomness, posted as spoiled, fresh randomness | partial | `ballot-controller.ts:196-220`, `flow/audit.ts` | `flow.test.ts:123,169`; real-server control | no on-screen plaintext (B3-07) |
| QV-19-REQ-013 | Audit completable on a second device | partial | download + CLI | none in web | web `/verify` rejects audit packages (NOTES); CLI is B2 |
| QV-19-REQ-014 | Randomness zeroed after submit, never persisted | OK | `ballot-controller.ts:155,172,217,237-245` | `flow.test.ts:93` | |
| QV-19-REQ-015 | Inclusion proof, STH signature, consistency checked after CAST | OK | `receipt.ts`, `ballot-controller.ts:140-142,181-193` | `flow.test.ts:268,296`, `audit2.test.ts` (W2); real-server control | B3-13 for `sequenced` |
| QV-19-REQ-016 | Verifier page single file < 400 KB, `connect-src 'none'`, runs from `file://` | partial | `build/site.ts:84-107` (172.0 kB) | `build.test.ts:47-60`; no E2E | B3-03, B3-30 |
| QV-19-REQ-018 | Header set of §8.1 on all HTML/JS responses | partial | `build/site.ts:25-46` | `build.test.ts` (3 headers); e2e CSP check | verifier.html conflict (B3-03); server's own static headers differ (B2) |
| QV-19-REQ-019 | DOM sinks banned by lint | OK | `ui/dom.ts` | `build.test.ts:74-79` | |
| QV-19-REQ-020 | Script/module assets content-hashed with SRI | mismatch | `build/site.ts:59-82` | `build.test.ts:12` (title claims REQ-020) | B3-04 |
| QV-19-REQ-021 | State that SRI/CSP do not stop a malicious operator | partial | `en.ts:102` (`qv.privacy.whyBody`) | `copy.test.ts` | split-origin mitigation not offered in UI |
| QV-19-REQ-022 (S) | Split-origin operation | not-implemented | `invite.ts:40` parsed, unused | `security.test.ts` (parser) | B3-27 |
| QV-19-REQ-023 | Two independent builders identical | partial | build is byte-identical across dir/cwd/TZ/locale (section 8) | `build.test.ts:12` (same process) | no independent-builder gate or `repro-check.sh` |
| QV-19-REQ-024 | Pinned Node/npm/esbuild, digest base image, `--ignore-scripts`, `SOURCE_DATE_EPOCH` | partial | esbuild `0.28.2` exact, `.npmrc` ignore-scripts | CI `npm ci --ignore-scripts` | no `Dockerfile.build`, no `SOURCE_DATE_EPOCH`, Node `>=22.18` |
| QV-19-REQ-025…029, -031, -036, -037 | Signed release manifest, SLSA, SBOM, policy CI, vendoring, release checklist, revocation | not-implemented | no artefact in the tree | — | self-reported T-189 / E11; KNOWN DEP-02 (PR #15) |
| QV-19-REQ-032, -033 | `client_release` in manifest; `qv verify-client` / `/verify-client` | not-implemented | none | — | N-36 |
| QV-19-REQ-034 | No auto-update or phone-home | OK | no service worker, no timers to third parties | `e2e/run.ts` egress check | |
| QV-19-REQ-035 | Refuse unsupported protocol version, name a release | partial | `election.ts` validation → E-ORG-MANIFEST | `security.test.ts` | `qv.err.E-VERSION` unreferenced |
| QV-19-REQ-038 | Residual risks stated in onboarding | partial | `app.ts:433` inside collapsed `<details>` | none | |

### 5.4 Other specs (client parts) and plan/claim rows

| Spec ID | Requirement (short) | Status | Implementation | Test | Notes / finding |
|---|---|---|---|---|---|
| QV-16-REQ-013 (web side) | Hedged randomness from voter nonce key, fresh CSPRNG bytes, context, plaintext vector | OK | `flow/seal.ts:46-64` (`deriveXi`), `key/signer.ts:40` (`h256('voter-nonce-key', seed)`), Worker draws `rho` | `flow.test.ts:73-123`; protocol tests (B1) | zeroed nonce key after lock: B3-11 |
| QV-16-REQ-014 | Benaloh flow: code before choice; ballot immutable after code display; spoil path reveals ξ; recompute equals ballot | OK | `flow/ballot-machine.ts`, `ballot-controller.ts:119-220`, `flow/audit.ts` | `flow.test.ts:73,123,169`; e2e steps "buttons enabled only after the code shows" and "optional double-check, then seal again"; real-server control (spoil posted with and without reveal) | prominence and on-screen plaintext are QV-10/QV-19 items (B3-07, B3-15), not QV-16 |
| QV-16-REQ-016 (web side) | Ed25519 signature over the framed cast digest | OK | `ballot-controller.ts:133-137` (`castDigest`), `key/signer.ts:51-55` | `flow.test.ts:93`; accepted by the real server | strict verification is the verifier's (B1) |
| QV-16-REQ-019 (web side) | Tally record verified, not trusted | mismatch | `flow/election.ts:134-149`, `ui/app.ts:576-604` | `audit2.test.ts` (W5: signature only) | B3-02 |
| QV-16-REQ-022 (web side) | Voter nonce key and seeds never logged or transmitted unencrypted | OK | `console.*` absent; nonce key only passed to the same-origin Worker | `security.test.ts:98-105` | |
| QV-04-REQ-001 | Local CSPRNG key generation, no secret transmitted | untested | `onboarding.ts:34-51`; requests carry only pk, invite hash, PoP, signed entries (section 2.1) | `key.test.ts` (generation); no network-capture test over enrolment runs | behaviour matches by code reading and the PoC request logs |
| QV-04-REQ-002 | Per-group keys by HKDF from a master seed | not-implemented | random seed per election slot (`keySlot`) | — | gap G10 (QV-19 §15 prevails in code) |
| QV-04-REQ-005 | PoP binds group, invite, pk | mismatch | web binds (id, H(token), pk); server verifies (id, pk) | none | B3-01 |
| QV-04-REQ-006 | Enrolment blocked until backup restore check, unless waived | not-implemented | none | — | B3-09 |
| QV-04-REQ-014 | Phase-1 visibility facts shown before enrolment and casting | partial | guarantee panel on rules/vote pages | none | not on the key page |
| QV-06-REQ-013 | Privacy notice shown and its version recorded locally | not-implemented | `rulesSeen` unwired | — | B3-27 |
| QV-26-REQ-011 | Works in Tor Browser Standard without storage or WebCrypto subtle | mismatch | `main.ts:9`, `app.ts:336` | none | B3-12 |
| QV-26-REQ-030 | CI fails on deny-listed fingerprinting APIs or non-same-origin URLs | partial | none found in bundle (section 2.1) | `security.test.ts:79-88` (cookies, XHR, WebSocket, …) | no deny-list scan; GitHub link present |
| QV-26-REQ-042 (S) | Client random submission delay | not-implemented | none | — | |
| QV-26-REQ-043 | Receipt only after append, with inclusion proof | partial | `ballot-controller.ts:124-157` | `flow.test.ts:93,281` | `sequenced` path B3-13 |
| QV-07-REQ-053 | No third-party requests, no telemetry | OK | — | `e2e/run.ts` last step | |
| QV-07-REQ-054 (S) | Build hash and version shown; "check served client" | partial | `app.ts:713` footer | none | `/verify-client` absent |
| QV-07-REQ-055 | Pinned deps, `--ignore-scripts`, ≤ 5 prod deps | partial | 2 prod deps | CI | audit gates absent (DEP-02) |
| QV-07-REQ-061 | No passwords or reset flows | OK | key-only | — | |
| QV-07-REQ-062 | Strict size-bounded decoders | partial | `parseContainer`, `parseQvJson` | `key.test.ts`; `verify-garbage.poc.ts` | B3-29 |
| TODO T-176 (Done) | Framework-free SPA, esbuild, strict CSP, Trusted Types, i18n hooks | OK | `src/**`, `build/site.ts` | `build.test.ts`, e2e | verified; caveat B3-04 for "SRI" |
| TODO T-037 (Done) | Argon2id wrapper used by cli and web | OK | `keystore.ts:51-58` | `key.test.ts` | B3-20, B3-28 |
| TODO T-177 (Partial) | Browser crypto bundle, worker for proofs | partial | seal in Worker `worker/*` | `lazy.test.ts` | verification runs on the main thread (B3-26) |
| TODO T-178/T-179 (Partial) | Key management; enrolment with backup confirmation | partial | see B3-01, B3-09, B3-10 | | plan rows do not name these gaps |
| TODO T-180 (Partial) | Voter flow | partial | B3-05, B3-06, B3-13, B3-14 | | |
| TODO T-181 (Open) | Benaloh UX equal prominence, Election-ID compare | partial | B3-07, B3-15 | | consistent with Open |
| TODO T-187 (Partial) | Guarantee strings; banner by assurance level | partial | `app.ts:316` hard-codes `status: 'other'` | `copy.test.ts` | consistent; statement is the conservative one |
| TODO T-189 (Partial) | "SRI yes; reproducible build and signed manifest not" | mismatch | `build/site.ts` | `build.test.ts:12` | "SRI yes" overstated: entry and CSS only (B3-04) |
| TODO T-190 (Open) | Lint rules banning innerHTML/eval/localStorage secrets | OK | — | `build.test.ts:74-79`, `app-precompile.test.ts:51` | plan row is stale (understated) |
| TODO T-193 (Partial) | Playwright e2e enroll→vote→audit→verify | partial | `e2e/run.ts` (8 steps) | itself | not in CI; no verify step (B3-30) |
| TODO T-194 (Open) | Offline/timeouts, retries without double-cast | partial | `client.ts`, `ballot-controller.ts` | `flow.test.ts:206-254` | plan row understated; copy gaps B3-13 |
| TODO T-309/T-310 (Open) | i18n framework; axe in CI | partial | extraction, lint, precompile exist | `i18n-*.test.ts` | T-309 understated; no axe in CI |
| TODO N-34/N-35 | Draft locales unreviewed and unoffered; RTL unchecked | OK | `locales-core.ts` | `lang-gate.poc.ts` | confirmed: only `en` offered |
| TODO N-36 | `/verify-client`, QR, witness events not done | OK (accurately stated) | — | — | confirmed |
| TODO N-37 | Organizer publish never run against a live server | partial | `flow/publish.ts` | `publish-server.poc.test.ts` | my PoC: accepted by the real server's HTTP API; `commitRoll` still unwired |
| Claims C-12 | "strict CSP and uses SRI — supported" | partial | `build/site.ts` | `build.test.ts` | SRI covers the entry only (B3-04); `verifier.html` header conflict (B3-03) |
| Handoff REQ-060/061 (QUIETVOTE-NEXT) | Scoped extraction and lint | OK (as scoped) | `scripts/i18n-check.ts` | `i18n-*.test.ts` | counts reproduce: 487 messages, 282 static, 8 resolved + 6 unresolved dynamic |
| Handoff REQ-062 (ordinary app build) | Parser-free app, no eval/Function | OK (as scoped) | `build/precompile.ts` | `app-precompile.test.ts` | verified on `dist`; verifier page excluded by design |
| docs/audit/HANDOFF.md item 1 (PR #6) | Web UI for trustees-mode spoil results / coordinator relay | not-implemented | none | — | KNOWN (unmerged PR #6), this SHA affected |


---

## 6. Spec gaps (ambiguity or silence; recorded, no policy invented)

| ID | Gap | Where | Effect on the web client |
|---|---|---|---|
| G1 | Registration contract is specified two ways and no ADR/erratum chooses: QV-19 §6.1 / QV-19-REQ-010 / QV-04-REQ-005 (token hashed on device, PoP over (ID, SHA-256(token), pk)) versus QV-09 (raw `invite_code`, PoP over `(election_id, pk)`); QV-16 does not define the `QV-REG-v1` message (QV-09:562 only names the label). | docs/19:95,282; docs/04:243; docs/09:63,146,262,562 | B3-01 |
| G2 | QV-19 §7 gives `verifier.html` its own meta CSP with inline hashes; §8.1 says the header set (with `script-src 'self'`) applies to "all HTML/JS responses". No per-route rule is specified. | docs/19 §7, §8.1 | B3-03 |
| G3 | QV-09 gives `WRONG_PHASE` no machine-readable sub-reason (not yet open / paused / closed), so clients must parse English `detail`; QV-10 §8.1 has no UX code or copy for a steward pause (PAUSED, QV-ADR-022). | docs/09 §4.3, docs/10 §8.1 | B3-06 |
| G4 | QV-09:138 lists `REVOTE_LIMIT` among retryable 429s ("yes, after Retry-After"); the server answers `retryable:false` and QV-10 E-VOT-ONEBALLOT is a final state. | docs/09:138,124,647 | B3-14 |
| G5 | The normative guarantee `qv.privacy.g4` ("you can vote again") is unconditional while QV-10 O2 lets organizers choose "One ballot only"; no one-ballot variant string exists. | docs/10 §7.1, §6.1 O2 | B3-14 |
| G6 | "The client stores 'confirmed' locally" does not say what is stored (API id, Election ID, or manifest hash). | docs/10 §9 | B3-24 |
| G7 | QV-13-REQ-090/091 require the manifest to carry `display_time_zone` and QV-13 §12 says QV-09 supplies it; neither QV-09 nor QV-16 defines the field (the manifest has `voting_open`/`voting_close` only). The election-zone half of the dual-zone display cannot be built. | docs/13 §9.5, §12 | QV-10-REQ-019, QV-13-REQ-090/091 |
| G8 | QV-10 §5.1 and QV-13-REQ-002/040 require server-rendered read-only pages that work without JavaScript; QV-19 §4 requires a static SPA with no server-side rendering. | docs/10 §5.1, docs/13 §7, docs/19 §4 | QV-13-REQ-002 |
| G9 | QV-13-REQ-022 says focus moves to the code heading after sealing; QV-10 §6.2 V6 says Cast gets initial focus. | docs/13:120, docs/10 V6 | QV-13-REQ-022 |
| G10 | QV-04 §4.1 derives per-group keys by HKDF from a master seed and defines a `.qvkey` JSON shape; QV-19 §15 / QV-ADR-P19-5 use per-election random keys and the QVKEY1 container. The code follows QV-19. | docs/04 §4.1, QV-04-REQ-002, docs/19 §5.3, §15 | QV-04-REQ-002 |
| G11 | QV-10 §10.2 names a receipt file (`qv-receipt-<electionIdShort>-<codeShort>.json`, "schema: QV-09; QV-34 vector `receipt/*`"), but QV-09 defines only the server `Receipt` object and `test-vectors/v1` has no `receipt/` directory; the web defines its own `qv-receipt/1` wrapper. | docs/10 §10.2, docs/09, docs/34 | QV-10-REQ-009 |
| G12 | QV-13-REQ-007 speaks of "session inactivity > 15 min" with a warning ≥ 2 min before; QV-19 §5.3 locks at 10 min idle. Which threshold triggers the warning is unclear. | docs/13:69, docs/19 §5.3 | B3-11 |
| G13 | QV-10 V3 says the passphrase is "optional on a personal device"; QV-19-REQ-007 requires ≥ 12 characters or 6 words (NOTES: QV-19 followed). | docs/10 V3, docs/19 §5.3 | none (documented choice) |
| G14 | QV-26-REQ-011 asks the client to work "without storage, service workers or WebCrypto subtle"; QV-19 §4/§5.3 wrap the key with WebCrypto AES-256-GCM (`importKey`/`encrypt`), so a client without `subtle` cannot unwrap a stored key. Unclear whether only Ed25519-via-subtle is meant. | docs/26:63, docs/19 §4 | B3-12 |
| G15 | QV-10 §8.2 `DUPLICATE_IGNORED` ("same bytes seen") is not tied to any API signal; QV-09 §4.4 answers a replay with the original receipt (`200` instead of `201`). The web ignores the status code, so the outcome is unreachable. | docs/10 §8.2, docs/09 §4.4 | B3-27 |

---

## 7. Not reviewed / coverage limits

- **Assistive technology and manual accessibility.** No screen reader, switch, voice-control or manual keyboard task script was run. The accessibility results here are automated heuristics (the repo's 45 checks, my axe-core 4.13 scan, computed-style probes); they are not a WCAG conformance statement and do not replace the AT matrix of QV-13-REQ-020. RTL layout of the Arabic draft was not reviewed visually.
- **Browsers.** Only Chromium build 1243 via Playwright 1.63.0. Firefox, Safari, Tor Browser and mobile browsers were not run: timer suspension while hidden (B3-11), private-mode IndexedDB (B3-12), Ed25519-in-`subtle` support differences, Trusted Types fallbacks and SSE behind buffering proxies are untested (Appendix A).
- **Performance.** No Slow-3G/4×-CPU run, no reference low-end device; verifier timings are from this machine only.
- **Server, board, trustee, CLI, verifier, crypto, protocol internals** (B1/B2 scope) were read only where the web client depends on them. Observations for B2, not B3 findings: the server's static headers (`packages/server/src/http.ts:97-106`) omit `require-trusted-types-for`, HSTS, COEP and CORP that QV-07-REQ-052/QV-19 §8.1 list and apply the app CSP to every static file; the registration handler does not bind the invite into the PoP (QV-04-REQ-005); `REVOTE_LIMIT` carries `retryable:false` against QV-09:138.
- **Translations.** Key parity of the five draft locale tables is covered by existing tests; translation quality was not assessed (unreviewed by design).
- **Organizer UI.** The create/publish view was not driven in a browser with an organizer key; `publishElection` was run against the real server in-process (`publish-server.poc.test.ts`). Trustee and dry-run flows are CLI-only or absent.
- **Release pipeline** (QV-19 §9–§13, QV-19-REQ-023…031/036/037): existence check only; there is no `Dockerfile.build`, `scripts/repro-check.sh`, `policy/` allowlist, release manifest, SBOM or signing in the tree. `npm audit` and `npm audit signatures` were not run (no network beyond the toolchain's module downloads).
- **Requirements not individually evaluated** (need manual or AT work, belong to other packages, or are organizer/trustee screens): QV-13-REQ-003/-004/-008/-009/-010/-020/-031/-032/-035…-038/-045…-047/-049/-066/-067/-069…-073/-080/-081/-084/-096, QV-10 §6.1 organizer screens O1–O10 and §13 usability plan, QV-19-REQ-017/-030.
- **Dependencies** (`@noble/*`, esbuild) were not reviewed; `verifier-py` and the other workspaces' tests were not run.
- **Calibration data** (SSE refresh time, verifier ms/ballot) depend on this machine and are reported as measurements, not guarantees.
- **axe-core.** A read-only copy of axe-core 4.13.0 was placed in the session scratchpad (copied from another repository's `node_modules`, not added to this repo).

---

## 8. Commands run (pass/fail)

Environment: Node v22.22.0, npm 10.9.4, TypeScript 5.9.3, esbuild 0.28.2, Playwright 1.63.0, Chromium 1243. All from `/home/user/audit/quietvote-b3` unless stated. For PoCs, **PASS = the behaviour named in the finding was observed**, FAIL = it was not.

| # | Command | Result |
|---|---|---|
| 1 | `npm ci --ignore-scripts --no-audit --no-fund` (setup) | pass (exit 0); the web build then works without esbuild's postinstall (answers DEP-04) |
| 2 | `npm run typecheck` | pass, no errors (re-run at the end with every PoC present: the PoCs sit outside `src/` and `test/`, so `tsc -p tsconfig.json` and `npm test` do not pick them up) |
| 3 | `npm test -w @quietvote/web` | pass: 159 tests, 0 fail; `i18n:check passed: 282 static reference(s), 8 resolved dynamic reference(s), 6 unresolved dynamic reference(s), 1 exclusion(s)` |
| 4 | `npm run build -w @quietvote/web` | pass: build `8051ced34d38`, JS gzip 190.2 kB (all files), entry 93.0 kB, `verifier.html` 172.0 kB |
| 5 | `node packages/web/src/build/cli.ts <dirA>` and, from `/tmp` with `TZ=Pacific/Auckland LC_ALL=de_DE.UTF-8`, `... <dirB>`; `sha256sum` of every file | pass: 15 files, all identical; equal to `packages/web/dist` |
| 6 | `node packages/web/e2e/run.ts` | pass: 8/8 steps ok |
| 7 | `node packages/web/e2e/help.ts` | pass: 12/12 light, 12/12 dark |
| 8 | `node packages/web/e2e/a11y.ts` | pass: 45/45 automated checks (not WCAG conformance) |
| 9 | a11y harness mutation tests (scratch copy outside the worktree, 3 CSS mutations) | harness detects contrast and outline/forced-colors mutations; removing only the custom focus rule is not detected (browser default ring remains) |
| 10 | `node --test --test-reporter=spec packages/web/audit-b3/interop-server.poc.test.ts` | pass (5 tests: B3-F1 registration, F2 stale supersedes, F3 re-entrant cast, F4 PAUSED, F31 INVITE_USED) and a sixth, B3-F4b (server detail text), pass |
| 11 | `... audit-b3/unit.poc.test.ts` | pass (7 tests: F5 re-wrap, F6 lock, F7 forged tally, F8 ICU proto names, F9 arg-less errors, F10 bidi negative control, F11 KDF cost) |
| 12 | `... audit-b3/errmap-server.poc.test.ts` | pass (5 tests: F29 control not-on-roll, F30 REVOTE_LIMIT, controls: spoil post accepted, identical re-post idempotent, "Check inclusion now" works) |
| 13 | `... audit-b3/live-refresh.poc.test.ts`, `server-static.poc.test.ts`, `publish-server.poc.test.ts`, `pending.poc.test.ts` | pass (SSE refresh 337 ms; static headers recorded; organizer publish accepted; F32 reproduced) |
| 14 | `node audit-b3/ui-voter.poc.ts` | 10/10 findings reproduced (B3-F12…F21) |
| 15 | `node audit-b3/ui-observer.poc.ts` | 4/5 steps reproduced: B3-F23, F7b, F24, A1 reproduced; the old B3-F23b step FAILS by design of its harness (served `verifier.html` under `default-src 'none'`), superseded by `verifier-anchor.poc.ts` (item 17) |
| 16 | `node audit-b3/verifier-headers.poc.ts`, `verifier-server.poc.ts` | reproduced (no output under `_headers` / server CSP; works with meta CSP only) |
| 17 | `node audit-b3/verifier-anchor.poc.ts`, `verifier-perf-browser.poc.ts` (N=24, 96, 192), `verify-perf.poc.ts`, `verify-garbage.poc.ts` | reproduced (headline under mismatch; 1277/4082/7586 ms; Node 157–176 ms/ballot; garbage inputs FAIL in ≤ 2 ms) |
| 18 | `node audit-b3/autolock.poc.ts`, `hidden-lock.poc.ts`, `storage-blocked.poc.ts`, `ui-copy.poc.ts`, `live-regions.poc.ts`, `phish-announce.poc.ts`, `nav-race.poc.ts`, `nav-race2.poc.ts`, `proto-id.poc.ts`, `keyfile-interop.poc.ts`, `code-select.poc.ts`, `sri-preload.poc.ts`, `logged-time.poc.ts`, `axe-detail.poc.ts`, `axe-results.poc.ts`, `arg-check.poc.ts` | reproduced as described in section 4 (`arg-check.poc.ts` found one static mismatch, `qv.privacy.review`, which is a false positive: the `other` branch needs no arguments) |
| 19 | `node audit-b3/xss.poc.ts`, `lang-gate.poc.ts` | negative results: 0 injected nodes; draft locales not offered or downloaded |
| 20 | `grep` scans of `src/` and `dist/` for DOM sinks, eval/Function, fingerprinting APIs, absolute URLs; `npm ls --omit=dev --all`; `node packages/web/scripts/i18n-check.ts --json` + reference analysis | results in sections 2.1 and 4 (B3-27, Appendix C) |

---

## Appendix A — SPECULATIVE items (not counted in the findings table)

- **S1.** Behaviour in real Tor Browser/Firefox with blocked IndexedDB or without `crypto.subtle` (B3-12 was reproduced only by making `indexedDB.open` fail in Chromium).
- **S2.** Whether iOS/Android browsers suspend the 15 s lock interval while a tab is hidden (B3-11 scenario 2 is shown with a fake clock and a stubbed `document.hidden`).
- **S3.** Screen-reader output for the truncated assertive warning (B3-18), the spelled-out code groups and the copied text (B3-23).
- **S4.** `download()` revokes the object URL in a 0 ms timeout (`src/ui/app.ts:155`); some browsers may start the download after the revoke, losing the key/receipt/audit file.
- **S5.** `report-uri /csp-report` is emitted in `_headers` but a static host has no handler (WV-10 already notes the missing handler); violation reports would 404.

## Appendix B — Throwaway PoC files (all untracked, in `/home/user/audit/quietvote-b3/packages/web/audit-b3/`)

`harness.ts` (shared Playwright/production-build harness), `ux-codes.ts`; Node tests: `interop-server.poc.test.ts`, `unit.poc.test.ts`, `errmap-server.poc.test.ts`, `live-refresh.poc.test.ts`, `server-static.poc.test.ts`, `publish-server.poc.test.ts`, `pending.poc.test.ts`; Playwright scripts: `ui-voter.poc.ts`, `ui-observer.poc.ts`, `ui-copy.poc.ts`, `verifier-headers.poc.ts`, `verifier-server.poc.ts`, `verifier-anchor.poc.ts`, `verifier-perf-browser.poc.ts`, `autolock.poc.ts`, `hidden-lock.poc.ts`, `storage-blocked.poc.ts`, `live-regions.poc.ts`, `phish-announce.poc.ts`, `nav-race.poc.ts`, `nav-race2.poc.ts`, `proto-id.poc.ts`, `xss.poc.ts`, `lang-gate.poc.ts`, `logged-time.poc.ts`, `sri-preload.poc.ts`, `code-select.poc.ts`, `axe-detail.poc.ts`, `axe-results.poc.ts`; Node scripts: `keyfile-interop.poc.ts`, `verify-garbage.poc.ts`, `verify-perf.poc.ts`, `arg-check.poc.ts`. Run Node tests with `node --test --test-reporter=spec <file>` and scripts with `node <file>` from the repo root. Scratch outputs of this session are in the session scratchpad (`.../scratchpad/b3-out/`).

## Appendix C — Catalog messages with no reference (115 of 487)

Method: `node packages/web/scripts/i18n-check.ts --json` for the catalog, then a literal search of every `src/**/*.ts` file other than `en.ts` and the catalogs for each key, counting a key as referenced if it occurs literally or falls under a dynamic prefix seen in the source (`qv.err.`, `qv.help.theme.`, `qv.key.pp.`, `qv.org.tpl.`, `qv.results.outcome.`, `qv.verify.chk.`, `qv.verify.status.`, `qv.verify.verdict.`). The `qv.err.` prefix is counted as covering every `qv.err.*` key, so the figure is conservative (eight UX codes have no producer, B3-27).

`qv.a11y.checkFailed|checkNotRun|checkPassed|table`, `qv.audit.evidence|link|sealedAs|secondDevice`, `qv.ballot.backRules|blank|blankRule|change|changeShort|closingSoon|firstTimeAudit|nothingYet|oneBallot|sealed|unconfirmedReminder|undervote`, `qv.banner.demo`, `qv.election.deadline|deadlineViewer|langNotice`, `qv.glossary.ballotCode|electionId|publicLog|superseded|trustee|verifier`, `qv.help.clockOff|translating|versionSkew`, `qv.key.cancel|fingerprintHelp|forgetBody|forgetConfirm|importBad|lockNow|lockWarn|mustBackup|notYetRoll|onRoll|passphraseNew|recoveryBad|recoveryImport|saved|stayUnlocked`, `qv.org.announce|ballotsReceived|boardAge|close|closed|dashboard|description|draftSaved|dstFold|dstGap|freezeCheck|instant|inviteCount|invites|k|maxBallots|noPeekButton|open|opened|passRule|preview|previewRule|quorum|rollFile|rule.majority|rule.twoThirds|step.ballot|step.basics|step.review|step.rules|step.trustees|step.voters|trustee.warning|trusteeKey|trusteeLabel|zone|zoneHint`, `qv.phish.unconfirmed`, `qv.receipt.enterCode|pendingBody|print|qrMissing|remember`, `qv.shell.done|language|loadingSlow`, `qv.status.ceremony|closed|draft|invalidated|open|paused|ready|tallied|unknown`, `qv.step.of`, `qv.verify.checks|findings|jumpFail|offlineNote|selfTest|selfTestBad|selfTestOk|source|sourceFile|sourceServer|verifierWarn`.

_End of report. QuietVote is unaudited and not for real elections; nothing in this report is a security or accessibility certification._
