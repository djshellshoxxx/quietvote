# Organizer console milestone — 2026-11-16

Base: published PR #51, `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.
Implementation branch: `codex/qv-teams-organizer`.
This is a scoped engineering handoff, not project completion or external qualification.

## Implemented

- `/e/:id/admin` is connected even before DKG completion. `/new` links the
  published election to the console and shows its full manifest hash for saving.
- Explicit hash-pinned snapshot validation checks the manifest schema, signature
  quorum, election ID and snapshot ordering. Data is detached before asynchronous
  checks. It does not trust the endpoint's own claimed hash as an external anchor.
- Existing DKG start/round/final markers, approved-roll commitment, reference-bound
  election-open, scheduled election-close and tally records can be prepared.
  DKG finalization recomputes the joint key and requires sufficient verified key
  confirmations. Open references the authenticated final and roll entries.
- Tally proposals come from the existing read endpoint. The generated signed
  candidate must pass the unchanged full content verifier's aggregate, decryption
  and result-rule checks before a public packet is exposed or submitted.
- Public `qv-trustee export-entry` packets can be loaded. Size, permitted trustee
  entry type, origin, body binding and authorized outer signature are checked.
  Secret trustee bundles never enter the page; the server checks protocol admission.
- Preparation and Send are separate actions. Read-only organizer unlock always
  locks afterward. Navigation/device-clear invalidation discards late completion.
- Sends use one POST. Unknown outcomes retain exact bytes for download and explicit
  retry, and prevent replacement preparation. Pending public packets are in memory,
  so save before leaving the page. There is no automatic network retry.
- Coordinator packet/record files support multiple signers. Import validates every
  existing signature, rejects duplicates and foreign signers, and recomputes the
  current permitted action before adding one signature to its unchanged body.
  Send requires the manifest's signature quorum. Tally retains its existing single
  authorized-signature contract.
- Saved coordinator packets have a separate restore action that requires no key
  and preserves the exact outer header/body. It supports retry after a lost
  response and reload, even when the election has since progressed.
- Send authenticates acknowledgments against the pinned log key, origin and
  outgoing leaf hash. Missing, forged or mismatched receipts keep the packet
  available for download and exact-byte retry.
- Fresh review found and reproduced lifecycle validation gaps. Signing now rejects
  invalid or duplicate context markers, bad opening references, forbidden binding
  fields, incomplete key-confirmation evidence and fixed-roll conflicts. Snapshot
  sequences are uint32-bounded and generated bodies pass their wire schema before
  signing. Pending registration snapshots remain readable during the ceremony.
- All five draft locale catalogs contain the new strings. Existing review gates,
  wire contracts, protocol policies, package boundaries and build budgets remain.

## Evidence

On Node 24.22.1 / Linux:

- Final root typecheck and `git diff --check` passed.
- Final focused run: **23 tests passed, zero failures/skips**, 27.9 seconds.
  Command: `node --test --test-concurrency=1 packages/web/test/admin.test.ts
  packages/web/test/admin-ui.test.ts packages/web/test/admin-review-local.test.ts
  packages/web/test/admin-review-ui-local.test.ts packages/web/e2e/organizer-http.test.ts`.
  The two `*-local` files were temporary copies of the fresh reviewer's independent
  regression files; they are removed before this commit to preserve their separate
  test ownership. Integrate the reviewer's `admin-review.test.ts` and
  `admin-review-ui.test.ts` commit alongside this source milestone.
- Twelve owned behavior tests passed in `web/test/admin.test.ts` and `admin-ui.test.ts`.
  They cover every generated stage, authenticated opening references, wrong pins,
  forged markers, incomplete ceremony, wrong key, early close, changed roll,
  tampered tally count/context/schema, packet binding/size/type, single POST,
  review-before-send, single-flight preparation, read-only key lifetime,
  stale work, download and identical-byte retry, plus partial-signature export,
  quorum enforcement, co-signing, duplicate/forged/foreign signature rejection.
- Ten independent fresh-review regressions passed: missing key confirmations for
  open and roll commit, wrong opening references, duplicate and forged context
  markers, forbidden setup fields, fixed-roll conflict, overflowing sequence refs,
  unauthenticated acknowledgments and saved-packet restoration.
- `e2e/organizer-http.test.ts` passed against an actual HTTP server with three
  trustees, threshold two and three voters. All ten coordinator lifecycle stages
  used the shipped organizer adapter; trustee/voter crypto used the test harness.
  Final content verification was PASS with three counted ballots, and a restored
  opening packet received its original authenticated receipt on duplicate replay.
  This is separate from all-executable CLI acceptance and browser acceptance.
- The first milestone's complete serial web suite passed **288/288**, with no
  skips. That result predates the second milestone; broad final integration
  qualification is delegated to the parent. Earlier related/build tests also passed.
- Final production build passed within unchanged limits: **197.8 KiB** gzip total
  JS, **95.2 KiB** entry, **186.6 KiB** standalone verifier; build `98f2a91a408b`.
- i18n check passed; the pre-existing unbounded `message` reference in the
  offline verifier view remains listed. No new literal exemption was added.
- Final logs: `/tmp/qv-organizer-final-focused.log`,
  `/tmp/qv-organizer-final-types.log`, `/tmp/qv-organizer-final-build.log`,
  `/tmp/qv-organizer-final-i18n.log`. Interrupted checks are not counted as passing.

## Fresh-agent review and continuation

Review `web/src/flow/admin.ts`, `web/src/ui/admin.ts` and the early admin route
before integrating. Fresh reviewer owns the independent regression commit and
final review receipt. Root owns final integrated suites and hosted production
browser qualification; local Chromium launch is blocked by `EPERM`. DOM tests and
actual-HTTP acceptance do not establish browser qualification.

The server export provides content evidence only. Board-history freshness,
independent witnesses and existing protocol/authority/registration holds remain
unchanged. Existing multiple-coordinator manifests now support signature
accumulation in this console; `/new` keeps its existing one-coordinator setup.
Audit window archival, cancellation/pause policy, member lifecycle and broader draft
specification modules are outside this bounded console implementation.

No file owned by the concurrent PR51 restore/organizer repair session was edited:
`organizer-key.ts`, `organizer-setup.test.ts`, and existing browser runner/real-server
files are unchanged. The new HTTP test is isolated in `e2e/organizer-http.test.ts`.
No remote branch, PR, merge, release or deployment was mutated.
