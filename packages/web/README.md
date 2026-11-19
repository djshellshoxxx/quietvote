# @quietvote/web

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

Run `QV_REQUIRE_BROWSER=1 npm run e2e:server -w @quietvote/web` from the repository root after `npm ci --ignore-scripts`, `npm run vendor:install` and `npx playwright install --with-deps chromium`. Every production `buildSite` call verifies the installed vendor copies before bundling.
This bounded acceptance test serves a fresh production build from the actual HTTP server. It runs the existing trustee ceremony and voter enrollment fixture, imports that enrolled key into Chromium without registering again, casts one ballot, and checks its receipt against the server's signed checkpoint and inclusion proof. It also tests the web signed-request adapter against real management endpoints, accepting the correct audience and rejecting another audience, and exercises coordinator co-signing and lifecycle actions in the organizer console. No API responses are stubbed; the race check pauses an unchanged server response. The separate `e2e/registration.ts` journey exercises actual browser enrollment before the ceremony.

The required browser CI runner runs all seven journeys: app, help, automated accessibility, verifier, spoil shares, real server and registration. `QV_CHROMIUM` can select an installed Chromium binary. Missing tooling fails when `QV_REQUIRE_BROWSER=1`; browser launch failures always fail. To run only the HTTP signed-adapter acceptance without launching Chromium: `node --test --test-name-pattern="signed client" packages/web/e2e/server.ts`.

## Organizer setup and lifecycle

The `/new` organizer page can create or import a QVKEY1 organizer key, unlock it
for its fingerprint and public key, and download its encrypted key file. It
installs new organizer keys atomically, so concurrent tabs cannot replace each
other’s saved key. Cancelled or cleared key creation/import cannot install a late key. It
keeps an existing organizer key; use its matching passphrase to unlock it.
The key uses the existing browser key store and KDF policy. Save the backup and
its exact passphrase before clearing this device. Creating a key does not enroll
it with a server.

Unlock the organizer key, enter the election settings, voter public keys and
trustee signing keys, then prepare the election. Maximum choices (k), ballots
per voter (1–20) and quorum are editable and validated. This path uses the same
key for organizer and the sole coordinator. Trustee private keys remain in the
trustee tools. The server supplies the actual election ID and log key when
publishing; the local preparation validates a provisional configuration.

In the publish section, enter an existing organization ID or explicitly create
an organization with this key, a name, the passphrase and an optional server
registration token. The server's open/token/closed registration policy applies.
Organization enrollment is a separate signed request and does not publish the
election. Its returned ID fills the organization field. Re-enter the passphrase
to publish. Enrollment never retries automatically; if a response is lost, keep
the page open and explicitly retry the same retained request. Enrollment details
and publish continuation state live only in memory. Reloading the page loses
that continuation; retrieve an uncertain organization ID through the server's
operator before attempting a new enrollment.

Modern voter enrollment uses the accepted hashed invitation and invite-bound
proof contract. New elections record this scheme; existing legacy elections keep
their original scheme. The server exposes a migration preview without converting
or invalidating legacy invitations. Pinned-roll membership/absent-member handling
and full group membership remain separate unfinished work.

After publication, `/e/:id/admin` supports pinned-manifest ceremony/open/close/tally
preparation, public trustee packet relay, coordinator co-signing, and explicit
review before Send. It authenticates acknowledgments and retains an uncertain
packet for download and an explicit identical-byte retry. Save that packet before
leaving; restore can recover it after reload without unlocking a key. The console
does not implement governed proposals, membership changes or dispute finality.
New organizer setup copy in non-English catalogs remains machine-drafted and
unreviewed, and no locale review state is changed.

## Supplemental author keys

The upload verifier, offline verifier, and live results page accept optional
additional public signing keys obtained separately from a trusted source. Enter
one 64-character lower-case hexadecimal key per line, up to 32 keys, then choose
**Run checks**. Editing the keys clears the previous result and invalidates pending
work. Live refreshes and route changes do not carry pins into a new automatic
verification. Server metadata and bundle fields never populate this input; keys
are not persisted. Witness and record-author role requirements still apply.

Default verification requires authenticated append and witness evidence. These
author pins cannot supply witness quorum or turn a content-only result into a
fully evidenced result. The [current continuation handoff](../../docs/handoffs/QUIETVOTE-TEAMS-CONTINUATION-20261116.md)
separates exact-source browser results from external security, native translation,
manual accessibility and operational qualification.

## Uncertain cast recovery

Before a CAST POST, the client commits a small public recovery marker to
IndexedDB. It contains the signed-manifest hash, log origin, election ID, ballot
code and entry leaf hash. It contains no selections, randomness, voting key,
read key, ciphertext or signed request bytes. The sealed-ballot screen discloses
this retention before sending. The marker is kept even if remembering receipts
is disabled: receipt preferences do not disable the unresolved-send gate.
"Clear this device" removes it along with the existing device data.

A storage failure prevents the POST. A reservation for another unresolved cast
also prevents a new POST, including from another tab. The IndexedDB adapter waits
for transaction completion, not merely request success, before sending.
A successful checkpoint/inclusion/consistency check removes the marker after
pinning the verified head. A promise-only response, network failure, bad proof,
fork or rollback leaves it in place. A definite refusal removes a newly created
marker; refusal on a retry cannot resolve an earlier uncertain submission.

CAST makes one POST per explicit action. On the same page the voter may still
explicitly retry the identical signed bytes after a transport failure. There is
no automatic CAST retry. After reload, signed bytes are gone; opening Vote shows
the unresolved-send gate before key unlock or voting-phase checks. "Check
inclusion now" performs only GETs, locates the saved leaf, and verifies its
inclusion against the manifest-pinned key and origin and the previously pinned
head. NOT_FOUND is not evidence of rejection and never unlocks a fresh ballot.
A confirmed check offers Continue, which reloads the current public record before
a revote is prepared. The recovered proof establishes recording, not that this
is still the latest ballot or that it will be counted.

Recovery does not recreate the server's signed sequencing promise or manufacture
a receipt file. Existing receipt files remain usable through Check a receipt.
A marker written immediately before a crash may name a POST that never started;
without proof of recording, it remains unresolved. Clearing device data is the
existing explicit escape, so voters must keep their key backup before doing so.
Browser eviction or manually clearing storage can also remove the marker. This
is local recovery, not a server-side lock, cross-device lock or guarantee that a
request was delivered.

Validation includes lost-response/no-auto-retry, public-only storage with receipts
off, controller destruction and read-only recovery, not-found and hostile proof
retention, binding mismatch, reservation/storage failure, clearing, and refusal
after an ambiguous send. The browser journey additionally exercises IndexedDB
across a real page reload while the key is locked; run it with
`QV_REQUIRE_BROWSER=1 npm run e2e -w @quietvote/web` where Chromium is available.


On **Check a receipt**, anyone can enter a full 64-character hexadecimal ballot code, its full 52-symbol Crockford form, or the seven displayed groups (28 Crockford symbols). Matching happens locally against context-bound, voter-signature-checked cast records; malformed, missing, and ambiguous matches do not report inclusion. Practice/spoil records do not qualify as cast receipts. The client fetches the matching entry again, verifies its voter-signed header, exact body digest and log origin, computes the leaf hash locally, then checks signed-checkpoint inclusion and consistency with any saved head. Imported and saved receipt files use this same code/entry/leaf binding. This proves recording of the cast entry; the receipt-standing and election verifier checks separately determine supersession and admissibility. No voting key or choices are required, and no search endpoint was added.
