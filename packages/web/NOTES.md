# @quietvote/web notes

Framework-free TypeScript SPA (QV-19). `npm run build -w @quietvote/web` -> `dist/` (hashed assets, SRI, CSP meta + `_headers`,
`asset-manifest.json`, offline `verifier.html`). `npm run e2e -w @quietvote/web` runs Playwright (global install at
/opt/node22, Chromium at /opt/pw-browsers) against `test/helpers/fake-board.ts`; it skips if those are missing. Not part of `npm test`.

## Layout
`src/flow` (state machines, controllers, election derivation, receipts, organizer logic), `src/key` (QVKEY1, passphrase, signer,
lock, storage), `src/api`, `src/i18n` (ICU subset, catalog, locales), `src/ui` (DOM views), `src/build`, `src/verifier`, `src/worker`.
All logic is node-testable; `src/ui` and `main.ts` are covered by the e2e only. `COPY.md` is generated from the catalog.

## Decisions and deviations
* Added `argon2idKdf*` to `packages/crypto` (the only `@noble` importer). Web depends on workspace crypto/protocol/board; esbuild 0.28.2 pinned (dev).
* Voter-facing copy follows the plain-language rules (<= 20 words/sentence, banned jargon; `test/copy.test.ts`). Normative QV-10 section 7
  guarantee strings are kept verbatim except: `qv.privacy.g2` uses `{trustee_names, list}`; `qv.audit.public` follows QV-ADR-020
  (spoil is posted, its reveal stays private unless the voter opts in), so it differs from QV-10 wording. They sit under "More details".
* Registration: `invite_code` carries SHA-256(token) (QV-19-REQ-010) and the PoP signs (election id, SHA-256(token), pk) under `QV-REG-v1`
  (QV-19 over QV-09 wording). Passphrase policy (>= 12 chars or 6 words) follows QV-19, not QV-10 "optional".
* Entry bodies are JCS bytes of protocol records/envelopes; ballots use type `ballot`, tests `ballot_audit`. Organizer auth
  challenge message and `bb.log_id = SHA-256(origin)` are my choices (undefined in specs).
* Client derives K/ctx itself by re-running DKG adjudication from the log. Word list is generated (placeholder, QV-19 open question).
* Sealing runs in a Worker via a Trusted Types policy `qv-default` (script URL only); falls back in-thread.
* Under hash-pinned CSP the standalone verifier page has inline script/style by spec (QV-19 section 7); index.html has none.

## Gaps
* es/fr/de/pt-BR/ar have key tables but no translations, so only `en` is offered (REQ-064 gating works, tested). RTL CSS is logical-only.
* Messages are parsed at runtime (REQ-062 wants precompile). No lazy chunks (single bundle ~94 kB gzip); no import-map integrity (inline script).
* No QR codes (text/file alternatives only). Receipt "superseded" detection, SSE, `/verify-client`, results charts not done.
* Organizer UI stops at building/validating the manifest and roll preview; publishing manifest/roll-commit/markers and invites via API
  is not wired (server does not exist yet; `ApiClient` has the endpoints, `signMulti` exists). Trustee flows are CLI-only (ADR-024).
* Standalone verifier does bundle verification only (no audit-package or canary self-test; packages/verifier was in flux).
* Unit tests cover no DOM; a11y checks (axe), RTL visual and AT matrix are not automated here.
