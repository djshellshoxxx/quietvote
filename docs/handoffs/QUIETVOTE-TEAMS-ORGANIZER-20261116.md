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
- All five draft locale catalogs contain the new strings. Existing review gates,
  wire contracts, protocol policies, package boundaries and build budgets remain.

## Evidence so far

On Node 24.22.1 / Linux:

- Root typecheck passed.
- Ten new behavior tests passed in `web/test/admin.test.ts` and `admin-ui.test.ts`.
  They cover every generated stage, authenticated opening references, wrong pins,
  forged markers, incomplete ceremony, wrong key, early close, changed roll,
  tampered tally count/context/schema, packet binding/size/type, single POST,
  review-before-send, single-flight preparation, read-only key lifetime,
  stale work, download and identical-byte retry.
- 42 existing related tests passed: app-precompile, i18n-catalogs, ui-logic,
  publish-ui and publish. Four build/security tests passed separately.
- Production build passed within the existing limits: 196.1 KiB gzip total JS,
  93.9 KiB entry, 186.2 KiB standalone verifier.
- i18n check passed; the pre-existing unbounded `message` reference in the
  offline verifier view remains listed. No new literal exemption was added.
- Full serial web suite is running at this checkpoint; its result will be
  delivered separately. This handoff does not claim the whole suite passed.

## Fresh-agent review and continuation

Review `web/src/flow/admin.ts`, `web/src/ui/admin.ts` and the early admin route
before integrating. Exercise the generated packets against the actual server and
run a production browser journey. The focused tests use real crypto/protocol
fixtures and a small DOM, not a browser qualification.

The server export provides content evidence only. Board-history freshness,
independent witnesses and existing protocol/authority/registration holds remain
unchanged. The console supports the one-coordinator setup produced by `/new`;
multiple coordinator signature accumulation remains in the existing CLI. Audit
window archival, cancellation/pause policy, member lifecycle and broader draft
specification modules are outside this bounded console implementation.

No file owned by the concurrent PR51 restore/organizer repair session was edited:
`organizer-key.ts`, `organizer-setup.test.ts`, and browser runner/real-server files
are unchanged. No remote branch, PR, merge, release or deployment was mutated.
