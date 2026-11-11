# Audit: packages/web and packages/verifier

- Scope: `packages/web` (SPA, build, offline verifier page, key storage, worker), `packages/verifier` (bundle verifier, canary self-test, report)
- Date: 2026-10-21
- **AI-assisted review, not an independent professional audit.** QuietVote is unaudited and not for real elections.

## Threat model

Assets: the voter's wrapped signing key (QVKEY1 in IndexedDB), the invite token (URL fragment), ballot randomness `xi` (memory only until cast/audit), receipts and pinned tree heads, the integrity of the served JS/CSS, the verifier verdict and report.

Trust boundaries: browser to board server (untrusted, may lie or equivocate); static host / CDN to browser (SRI + CSP + hashed names); UI thread to sealing Worker (same origin, JSON only); user-supplied files (key file, bundle, receipt) to parsers; bundle contents to verifier (attacker-controlled, only the signature-verified manifest is an anchor).

Adversaries: malicious or compromised board server; network attacker without TLS break; author of a crafted invite link or bundle file; malicious co-resident script (XSS) or extension; a shared-device user; a build/deploy operator supplying hostile config.

Assumptions: the user obtains the Election ID out of band; the static host serves the `_headers` file; WebCrypto/IndexedDB behave per spec; unwrapped seeds cannot be protected against a compromised browser.

Failure modes considered: HTML/DOM injection (all rendering is `createElement`/`textContent`; lint test bans `innerHTML` etc.), CSP weakening, secret leakage (no `console` in browser code, referrer suppressed, token only in fragment, `credentials: omit`), worker URL abuse, server-substituted trust anchors, verifier accepting under a broken self-test, report/hash inconsistency, crafted-input crashes.

## Findings

| ID | Severity | Evidence | Remediation | Status |
|---|---|---|---|---|
| WV-4 | medium | `packages/web/src/ui/app.ts` `load()` (was line ~143-147): `logPk` and `origin` for receipt/checkpoint verification came from the server's `/elections/{id}` answer, not the signature-verified manifest (`bb.log_pk`, `logOrigin`). A malicious server could name its own key and mint "valid" receipts and checkpoints for ballots it drops or alters. | `bindServerLog` in `flow/election.ts`; `load()` uses manifest values and refuses to load the election on mismatch. Fake board made origin-conformant. | fixed: `WV-4: the log key and origin must come from the signature-verified manifest` (web/test/security.test.ts) |
| WV-1 | medium | `packages/verifier/src/main.ts` `verifyWithSelfTest` (was lines 17-26): verdict forced to FAIL (or caveat appended) after the report was sealed, so `reportHash` stayed the hash of the PASS report. A FAIL report carried a hash that matches a PASS report; anyone comparing report hashes across verifiers would be misled. | Recompute `reportHash` after the mutation. | fixed: `WV-1: reportHash matches ...` (2 tests, verifier/test/security.test.ts) |
| WV-2 | low | `main.ts`: unloadable/malformed `canary/corpus.json` made `runSelfTest` throw; `verifierMain` crashed (unhandled rejection) instead of reporting. Not a PASS, but no structured fail-closed result. | catch, record self-test failure, verdict FAIL; `--selftest` exits 1. | fixed: `WV-2: a corpus that cannot be loaded fails closed` |
| WV-3 | low | `packages/web/src/flow/invite.ts` `parseFragment`: `decodeURIComponent` throws `URIError` on `#board=%E0%A4%A`; thrown inside `electionView`, so a crafted invite link breaks the page. Reproduced before the fix. | try/catch, ignore member. | fixed: `WV-3: a malformed percent escape ...` |
| WV-5 | low | `packages/web/src/build/site.ts` `csp()`: `connectOrigins` spliced unvalidated into the CSP and into an HTML attribute (e.g. `https://a; script-src-elem *` weakens the policy; `"` breaks the attribute). Build-time operator input only. Also `<!--<script` could desynchronise the inline verifier script (hash-pinned, low likelihood). | `checkOrigin` allow-list regex; escape meta values; escape `<script`/`<!--` in the inline bundle. | fixed: `WV-5: CSP origins are validated`, `WV-5: build rejects a hostile connect origin`, `verifier.html: inline script cannot break out` |
| WV-6 | low | `packages/web/src/verifier/page.ts`: an exception in `verifyElectionText`, an unknown check key (catalog behind protocol), or no file left the page on "running" or blank; an Election ID mismatch was not in the live region. Never a false PASS. | try/catch to FAIL display, label fallback, size bound, anchor in live region. | fixed, but not unit-tested (page is DOM, e2e-only; build and typecheck only) |
| WV-7 | low | `ui/app.ts` `download`: object URL for key/receipt files never revoked (wrapped key stays reachable in memory for the tab's life). | `revokeObjectURL`. | fixed, not unit-tested (DOM) |
| WV-8 | info | `packages/web/src/ui/app.ts` ~487 organizer create view uses `coordinatorPkHex: '00'.repeat(32)` placeholder and a random election id; the organizer UI is a stub (NOTES: UI stops at roll preview). | none here | open (owner: web organizer work) |
| WV-9 | info | `canary/corpus.json` is unsigned and `loadCorpus` only checks `canaries.length > 0`; an attacker who can edit the corpus can edit the code, but a truncated corpus passes the self-test silently. `--skip-selftest` exits 0 on PASS with only a caveat. Offline `verifier.html` has no self-test (documented). | sign corpus; require expected canary count | open |
| WV-10 | info | Worker module has a content-hashed name but no SRI (module workers cannot take `integrity`); `_headers` is host-specific (Netlify/Cloudflare format) and the CSP `report-uri /csp-report` has no handler in this package. Meta CSP cannot carry `frame-ancestors`; `verifier.html` has no header. | document / host config | open |
| WV-11 | info | a11y/i18n review (code reading, no axe run): labels are bound with `for`/`id`, one polite + one assertive live region, focus moved to heading on render, `:focus-visible` outline `#b45309` on white/dark backgrounds looks sufficient (not measured). `p[aria-label]` on the stepper is not exposed by most screen readers (visible text is the same, so no loss). Catalog key parity: es/fr/de/pt-BR/ar match the English key set (existing test `catalogs: every locale table has exactly the English key set`), and all `qv.verify.chk.*` keys exist. No translation was marked reviewed; non-`en` locales stay unoffered. | none | no defect found |

Checked, no finding: DOM rendering (no HTML sinks; `h()` only sets attributes from code-controlled names, `href`s are internal paths); `parseRoute` strict id regex; `safeBoardOrigin` rejects `javascript:`, `data:`, credentials, http (non-loopback); key container strict parse, KDF floor and ceiling, AAD binding, wipes; IndexedDB holds only wrapped key, receipts, heads, settings; `ApiClient` omits credentials, no-store, no-referrer; allowed-worker-URL policy (tested); verifier: closed top-level member set, strict QV-JSON, pinned manifest hash overrides bundle value, board layer skipped when manifest signature fails, V4 never passes on absent input, `verifyBundle` never throws.

## Verification

`npm test -w @quietvote/web` 76 pass, 0 fail; `npm test -w @quietvote/verifier` 23 pass, 0 fail; `npm run build -w @quietvote/web` ok. `npm run typecheck` reports no errors in web/verifier; it reports an unrelated unused-import error in `packages/board/test/audit.test.ts` (outside scope). Playwright e2e was not run.
