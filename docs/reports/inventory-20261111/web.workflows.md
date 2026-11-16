# Web SPA workflows: wiring and coverage (snapshot the ab84f16 snapshot)

Router: `packages/web/src/ui/route.ts` (`parseRoute`), dispatch in `packages/web/src/ui/app.ts:294` (`route()`). Paths, not hashes. Election ID in path must match `^[a-z2-7]{26}$`.

Legend. "Real server" = exercised against `packages/server` through the SPA's `ApiClient`. No journey in `packages/web/` does this: `e2e/run.ts` and `e2e/spoil-shares.ts` use fakes (`test/helpers/fake-board.ts` FakeBoard / hand-written stub that mimics server routes); `e2e/verifier.ts` starts the real `buildServer` only to serve static `verifier.html` (the SPA's results page there reads FakeBoard); unit tests use fake `fetch`/fake clients. "Not run in this session": I executed no tests or browsers; coverage is from reading test/e2e sources and NOTES.

## Registered routes

| Route | View (app.ts) | Reachable in UI? | ApiClient call -> server route | Unit test | Browser e2e | Real server or fake |
|---|---|---|---|---|---|---|
| `/` home | `home()` :316 | Yes (nav, brand) | none (paste-a-link box only; no election list or discovery) | `ui-logic.test.ts#routes`, `navigation.test.ts` | `e2e/run.ts#home shows How this works`; `a11y.ts`, `help.ts` | Local only; no API |
| `/new` create | `createView()` :769 | Yes (nav "Create") | preview: none. Publish: `createElection` -> POST `/api/v1/orgs/:org/elections`; `postEntryWithRetry` -> POST `/elections/:id/log/entries` (manifest, dkg-open marker); `createInvites` -> POST `/elections/:id/invites` | `ui-logic.test.ts#organizer`, `publish.test.ts`, `publish-ui.test.ts` (source-wiring check of DOM) | None (no browser journey of the create view) | Fake client / fake fetch only. `publish.test.ts` runs real `ApiClient` over fake fetch. Cannot complete on a clean profile: no UI creates the organizer key (`ORGANIZER_SLOT`), so `runPublish` returns `noKey` |
| `/verify` | `verifyView()` :745 | Yes (nav) | none (local file -> `verifyElectionText`) | `verification.test.ts`, `offline-verifier.test.ts` (standalone page logic) | `e2e/verifier.ts` covers standalone page; in-SPA `/verify` has no dedicated browser step | Local only |
| `/help` | `helpView()` :335 | Yes (nav) | none | `navigation.test.ts` | `e2e/help.ts`, `e2e/a11y.ts` (Home/Help/not-found; production build) | Local only |
| `/e/:id` overview | `electionView` :372 (`sub==='overview'`) | Yes after opening a link | `load()` :270 -> `election` GET `/elections/:id`, `allEntries` GET `/elections/:id/log/entries`; settings in IndexedDB | `flow.test.ts#election context is derived` | `e2e/run.ts#overview: step indicator and Election ID check` | FakeBoard only |
| `/e/:id/rules` | same, rules branch :415 | Yes (tab) | none beyond load() | `copy.test.ts` (strings) | `e2e/run.ts` (indirect) | FakeBoard only |
| `/e/:id/key` | `keyView()` :438 | Yes (tab; invite links land here) | `register` -> POST `/elections/:id/registrations` (only with `#inv=` token); `roll` GET `/elections/:id/roll` (no-invite onRoll check). Create/import/recovery/unlock are local | `key.test.ts`, `audit3.test.ts#B3-20`, `flow.test.ts#registration after roll commit` | `e2e/run.ts#import key file and unlock`, `#invite link after roll commit: registration refusal is shown`. Fresh create-key journey and backup/recovery journey are not covered (NOTES) | FakeBoard. Registration against the real server FAILS with 401 BAD_SIGNATURE (held B3-01; server repro `packages/server/test/consolidation.test.ts`) |
| `/e/:id/vote` | `voteView()` :528 (selection, review, seal, cast, audit, revote) | Yes (tab) after unlock | `postEntryWithRetry` -> POST `/elections/:id/log/entries` (types `ballot`, `ballot_audit`); `entries`/`allEntries` GET log (supersedes link); `inclusion` GET `/log/proof/inclusion`; `consistency` GET `/log/proof/consistency`; `checkpointNote` | `flow.test.ts`, `audit2.test.ts`, `audit3.test.ts`, `ui-logic.test.ts#ballot machine` | `e2e/run.ts#vote: choose, review, seal`, `#optional double-check`, `#send`, `#Receipt to Vote refreshes ... revote` | FakeBoard only (real signatures and Merkle, but not the real server). Sealing in a Worker is exercised in the browser; Node tests use an in-thread sealer |
| `/e/:id/receipt` | `receiptView()` :611 | Yes (tab; link after cast) | `inclusion`, `consistency` (via `checkInclusion`); standing is derived from the loaded log; stored receipts from IndexedDB | `flow.test.ts#sequenced-only`, `audit2.test.ts#W2`, `live.test.ts#receipt standing` | `e2e/run.ts#Receipt to Vote refreshes...` (indirect) | FakeBoard only. Lookup by typed code alone is not offered (file or stored receipts only) |
| `/e/:id/results` | `resultsView()` :671 | Yes (tab) | `allEntries`, `roll` (full voter list pages); verification runs locally; chart is a lazy chunk | `verification.test.ts#B3-02`, `charts.test.ts`, `audit2.test.ts#W5` | `e2e/verifier.ts` (honest/forged tally, proof gate, chart-import race) | FakeBoard (`FakeBoard` rebuilt per scenario) |
| `/e/:id/spoils` | `spoilSharesPanel` (`ui/spoil-shares.ts`) | Tab only if manifest `spoil_trustee_decrypt === true` | `getSpoilShares` GET `/elections/:id/spoil-shares[?code]`; `postSpoilShare` POST same path; `roll` | `spoil-shares.test.ts`, `spoil-shares-ui.test.ts` | `e2e/spoil-shares.ts` | Stub that mimics the server contract (not `buildServer`) |
| `/e/:id/admin` | stub in `electionView` :421 | Not linked from tabs; URL only | none | none | none | Static text only (no-peek and export copy); no controls |
| unknown path | not-found render :305 | n/a | none | `ui-logic.test.ts#routes` | `e2e/a11y.ts` (not-found checks) | Local |
| `/verifier.html` (static, not a SPA route) | `src/verifier/page.ts` | Linked from footer | none (offline) | `offline-verifier.test.ts`, `build.test.ts#verifier.html` | `e2e/verifier.ts` (16 checks, includes actual `buildServer` static serving) | REAL server static serving; verification logic itself local |
| SSE `/api/v1/elections/:id/events` | `startLive()` :221, `flow/live.ts`, `net/sse.ts` | Status line on election pages | `events` GET `/elections/:id/events` (fetch-stream, Last-Event-ID) | `sse.test.ts`, `live.test.ts`, `live-lifecycle.test.ts`, `test/helpers/fake-sse.ts` | `e2e/run.ts` FakeBoard has no `/events` route (page shows "live updates are off"); `e2e/verifier.ts` race test uses a real SSE reread of FakeBoard | Fake only; never against `packages/server/src/sse.ts` |

## GUI workflows without a route or without a control

| Workflow | Status |
|---|---|
| Election discovery list | Missing. Home only accepts a pasted link (`home()` :316). |
| Organizer key creation / recovery | Missing in the UI. `publish-ui.ts:72` needs a stored `organizer` key; `app.ts:781` only reads it. Prerequisite of the publish workflow. |
| Organizer roll commit (`flow/publish.ts commitRoll`) | Function unit-tested (`publish.test.ts`), no UI control. |
| Organizer ceremony markers r1..r3, dkg-final, trustee invites | Missing (CLI-only, ADR-024). |
| Organizer open / close / tally relay | Missing in web (no route, no function). |
| Trustee DKG / partial-decryption upload | Missing (CLI-only). Only spoil-share relay exists (`/spoils`). |
| Report a problem, dry run, corrected copy, display-name policy | Missing. |
| Receipt lookup by typed code | Missing. |
| Shared-device toggle | Missing (Clear this device exists). |

## Counts (workflows with a browser-visible entry point)

- Fully wired to a real API client call and real server for the whole journey: 1 (offline verifier page served by the real server; its verification is local).
- Wired to a real `ApiClient` method but proven only against fakes: 9 (open link/overview, vote/seal/cast, test ballot, revote, receipt check, results, live updates, spoil-share relay, organizer publish).
- Blocked or fails against the real server: 1 (registration, B3-01).
- Local only, no API: 6 (home, rules, help/appearance/language, in-SPA verify, key create/import/unlock, organizer preview).
- Missing: 8 (listed above).
