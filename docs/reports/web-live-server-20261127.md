# Web live-update recovery and real-server acceptance — 2026-11-27

This completes the missing SSE portion of [inventory web task 10](inventory-20261111/web.tasks.md). The existing `e2e/server.ts` already exercised real HTTP management, signed casts, entry lookup, inclusion proofs and browser receipt lookup. The remaining stream coverage used simulated responses.

## Confirmed gap and correction

The real server intentionally starts a stream without `Last-Event-ID` at its current event tip. Previously, `LiveElection` fetched records only after an event or an HTTP 410 response. A signed append could therefore go unseen if it arrived between the initial load and the first stream, or during a disconnection before the client had received its first event ID. Neither case requires an invalid server response.

Both cases failed against the unchanged production source and actual `World`/`buildServer` fixture. The recorded before-fix suite also has downstream failures caused by the earlier stale record counts and reconnect gates; those are not additional independent defects.

The correction schedules the existing incremental signed-log refresh whenever a connection becomes `live`, before forwarding that status to the UI. The stream is already attached before the read. Existing scheduling coalesces event, reconnect and 410 triggers; reads start at the first missing sequence, require contiguous records and derive context through the existing verification path. Closing still discards pending work. A cursor replay can produce an additional empty read without duplicating stored records.

The parser, server, general `onResync` callback contract, API, protocol bytes, copy and verification gates are unchanged.

## Acceptance

`test/live-server.test.ts` uses the actual web `ApiClient`, `LiveElection`, HTTP server, durable outbox and signed records. Only the reconnect delay is gated. It checks the two connection gaps, live entry updates, exact retained-cursor replay without duplicates, actual outbox-pruned HTTP 410 followed by cursor reset and signed close recovery, and release of the server stream/runtime on close.

`e2e/live-server.ts` uses the built SPA and actual server. Connection gates delay requests; responses and frames are unchanged. Six browser steps cover the two gaps, retained-header resume, real HTTP 410, an already-open Results view changing from its waiting message after a signed tally is published, and stream cleanup when leaving the election. No reload supplies the visible update. The ordinary final-server result remains unestablished under the existing verification gate. The browser makes only GET requests, places no cursor in URLs, and reports no page/CSP errors or external requests.

The required runner preserves all 15 existing journeys and adds `live-server` as the sixteenth. Its failure controls also retain the integration branch's `vote-methods` and `a11y-election` cases.

| Check | Result |
|---|---|
| New real-server test plus existing live/parser regression suites | 26 passed, 0 failed, 0 skipped |
| Production browser | All six steps passed; no tooling skip |
| Web and browser strict TypeScript checks | Passed |
| Browser runner failure-propagation tests | 3 passed |
| Shell syntax and diff checks | Passed |
| Build `4755cd2cb900`, all JavaScript gzip | 193,539 / 204,800 bytes |
| Entry module | 56,901 bytes gzip; 173,420 bytes raw |
| Standalone verifier | 202,373 / 409,600 bytes |

The build and receipts bind the isolated source based on PR77 plus the frozen preceding web increments. The integration branch's separate receipt-wording/COPY corrections require its composed validation. Local browser execution used the previously documented scratch Chromium wrapper; repository launch flags and deadlines were unchanged.

## Limits preserved

Stream availability does not establish authenticated freshness or finality. The browser test's status label proves transport, its entry requests prove rereads, and the separate visible Results transition proves a DOM update. The Node test directly checks the derived phase from signed records.

Pre-close receipt supersession still needs an adopted prefix-evidence contract. Ordinary final-server exports still retain the unsupported derived-record verification block. Signed display-zone/freshness contracts, worker/native CSP qualification, native translation review and assistive-technology review remain separate. This correction neither relaxes those gates nor claims completion of those tasks.
