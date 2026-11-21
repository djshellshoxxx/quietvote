# @quietvote/web

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

Run `QV_REQUIRE_BROWSER=1 npm run e2e:server -w @quietvote/web` from the repository root after `npm ci --ignore-scripts`, `npm run vendor:install` and `npx playwright install --with-deps chromium`. Every production `buildSite` call verifies the installed vendor copies before bundling.
This bounded acceptance test serves a fresh production build from the actual HTTP server. It runs the existing trustee ceremony and voter enrollment fixture, imports that enrolled key into Chromium without registering again, casts one ballot, and checks its receipt against the server's signed checkpoint and inclusion proof. It also tests the web signed-request adapter against real management endpoints, accepting the correct audience and rejecting another audience, and exercises coordinator co-signing and lifecycle actions in the organizer console. No API responses are stubbed; the race check pauses an unchanged server response. The separate `e2e/registration.ts` journey exercises actual browser enrollment before the ceremony.

The required browser CI runner runs all nine journeys: app, help, automated accessibility, verifier, spoil shares, real server, registration, device settings and split-origin operation. `QV_CHROMIUM` can select an installed Chromium binary. Missing tooling fails when `QV_REQUIRE_BROWSER=1`; browser launch failures always fail. To run only the HTTP signed-adapter acceptance without launching Chromium: `node --test --test-name-pattern="signed client" packages/web/e2e/server.ts`.

## Serving a separate frontend and board

Build a client whose default API is a separate board:

```sh
npm run build -w @quietvote/web -- ./dist-client \
  --api-base https://board.example \
  --connect-origin https://alternate-board.example
```

`--api-base` sets the default board for election requests and organizer creation
and publication. Repeat `--connect-origin` for each additional board that this
deployment permits an invitation to select. The builder includes the default
API in that list automatically, sorts and deduplicates it, and accepts at most
16 external board origins. Omitting both flags preserves same-origin operation.
Only canonical bare HTTPS origins are accepted: no path, trailing slash, query,
fragment, credentials or wildcard. HTTP is supported only for `localhost`,
`127.0.0.1` and `.onion` hosts; explicit default ports must be omitted.

Serve the generated directory from the frontend origin, for example
`https://client.example`, using a static host that applies `_headers` (or
configure those headers equivalently). Both the generated header CSP and the
HTML meta CSP must permit the configured boards. A host's additional CSP also
applies and can further restrict those connections. The reference board
server's built-in static route supplies its own same-origin header CSP; it is
not the serving path for a bundle configured to contact a separate board.
The standalone `verifier.html` retains its network-disabled policy.

Configure the API server with the actual API audience and the frontend origin:

```json
{
  "publicUrl": "https://board.example",
  "allowedOrigins": ["https://client.example"]
}
```

Keep this pair and the client build configuration consistent. `publicUrl` is
the origin bound into management request signatures; it is the board's public
origin, not the frontend's. `allowedOrigins` controls the server's existing
CORS allowance for management and other non-public requests. Public GETs keep
their credential-free wildcard CORS behavior. The client sends no cookies and
uses the named read-key and signing headers. Proxies must forward `Origin`,
`Authorization`, `Content-Type`, `Idempotency-Key`, `QV-Read-Key` and
`Last-Event-ID`, preserve the CORS/rate/retry response headers, and allow SSE
streaming. API redirects are refused; configure the directly served canonical
API origin.

An invitation may select an allowed board using its fragment, for example
`https://client.example/e/ID#inv=TOKEN&read=KEY&board=https%3A%2F%2Falternate-board.example`.
The board selector must pass the deployment allowlist before any election
request or key unlock. Malformed, duplicate or unallowed board selectors fail
closed. The token and read key stay out of request URLs and referrers; enrollment
sends the existing hashed invitation proof and read access uses `QV-Read-Key`.
Election navigation preserves the fragment, including links that have a read
key or board selector without an invitation token. Generated split-origin
invitations point at the frontend and carry the selected default board in the
fragment.

Cached API clients distinguish the board, election ID and in-memory read
credential. Stored voter and organizer keys, receipts, pinned heads and pending
cast recovery markers have separate board namespaces. Same-origin deployments
retain their historical storage slots. Switching boards therefore requires an
explicit key import or creation for the new board; it does not copy a stored
key. Device preferences remain shared, and election acknowledgements remain
bound to the signed manifest hash. Clear this device clears all board namespaces.

Run `QV_REQUIRE_BROWSER=1 node packages/web/e2e/split-origin.ts` from the repository
root for the separate static host/real board journey. It covers actual CORS,
enrollment, board and read-key changes within the running app, resumed SSE,
casting and checking a receipt, and organizer creation/publication. This
implementation does not change the proposed status of P08-2 or P19-3 and does
not establish deployment of a static host or board, or its external review.

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

## When browser storage is unavailable

IndexedDB remains the default. After an actual storage refusal, the application
offers **Retry browser storage** and **Use this page only**. The latter is an
explicit choice for this document; it is never selected automatically or saved
as a preference. It creates a separate `MemoryStorage` with persistence set to
false, invalidates prior key work and signers, and rebuilds the existing board
namespaces. It does not copy or erase inaccessible browser data. Such data may
include an earlier unresolved ballot; use its saved code to check recording
before attempting another vote.

The page labels this mode and explains that access to keys, receipts, preferences
and pending markers is not guaranteed after reload, tab closure or navigation
away. A browser can retain the document and its memory in the
[back/forward cache](https://web.dev/articles/bfcache); leaving the page is not
a secure-clearing action. Use **Clear this page session** to remove the session's
data from the application. This is not a claim of physical memory erasure by
the browser or operating system. Internal application navigation can retain an
unresolved submission. Before voter
continuation or organizer setup can proceed, the user must activate **Download
key file**. The application can observe the download action, not whether the
user has kept a usable copy; the file and its exact passphrase remain necessary.
The ordinary encrypted key format and WebCrypto wrapping dependency are
unchanged. This storage feature alone does not satisfy the separate requirement
for operation without `crypto.subtle` or establish Tor Browser qualification.

Once a ballot has started, this document refuses a storage-mode switch. The
normal persistent pending-cast gate stays in place. In session mode, an explicit
retry after uncertain delivery uses the original signed bytes even after
internal navigation. The retained controller is bound to the board, API
election ID, read-credential context, signed manifest and signing identity.
Changing those contexts cannot silently reuse it. Leaving the ballot view drops
its selections and randomness; only an unresolved retry is retained. The public
pending marker remains until verified resolution or explicit session clearing.

**Save ballot code** exports public tracking data. **Save receipt file** remains
available when a signed receipt was returned, including with receipt storage
turned off. A public inclusion lookup does not manufacture a missing signed
receipt. Download these files before leaving. **Clear this page session** clears
only the selected memory store and explicitly says saved browser data was not
cleared. Reload starts with the default IndexedDB path again.

The mandatory `device-settings` browser journey denies IndexedDB in the real
built application, exercises the explicit choice and backup gate, resends
identical bytes after a lost response and internal navigation, downloads the
public files, and checks reload loss. Node application tests separately cover
changed boards, read credentials and stored keys, refusal after ballot start,
and preservation of inaccessible durable data.

## Uncertain cast recovery

In the default durable mode, before a CAST POST the client commits a small public
recovery marker to IndexedDB. It contains the signed-manifest hash, log origin, election ID, ballot
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
