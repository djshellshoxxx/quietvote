# Split-origin client implementation and bounded verification

This work starts from `be098bee3498ca0de742008c3067f0727862b117` in the isolated
`worker/quietvote-split-origin` branch. It implements the existing deployment
posture described by QV-08 §6.1 / REQ-034, QV-19 §4 and §8 / REQ-022, and
QV-09 §3 / REQ-009. It does not adopt proposed decisions P08-2 or P19-3, change
signed election protocol equations, authorize a release, or deploy either host.

## Implemented boundary

The static builder accepts `--api-base` and repeated `--connect-origin` flags.
It validates a maximum of 16 external canonical bare origins before replacing
the output directory. The default API is included in that list. The generated
HTML metadata, meta CSP, header CSP and asset manifest describe the same
configuration; the build identity includes the configuration as well as asset
hashes. Wildcards, URL credentials, paths, fragments, noncanonical spellings and
invalid ports are rejected. HTTP remains limited to localhost, 127.0.0.1 and
onion services. The default with no flags remains same-origin.

The browser validates the deployment policy at startup. An invitation's board
selector is checked before an election client is constructed. A malformed,
duplicate or unallowed selector fails closed instead of falling back to the
default board. Election reads, roll requests, registrations, SSE, ballot
submission, inclusion/consistency checks, exports and the organizer console use
that selected client. Navigation preserves the fragment even when it contains
only a board selector or read key; this includes the link from a recorded ballot
to its receipt. Requests omit ambient credentials and referrers. Raw invitation
tokens remain in the fragment and registration retains the existing hashed
invitation proof. Read keys and SSE cursors remain headers. Redirects are refused
as an added transport boundary; no prior guarantee about redirect refusal is
asserted here.

The in-memory election cache distinguishes API origin, election ID and read
credential. Cached signers distinguish API origin and election ID. Encrypted
keys, receipts, pinned checkpoint heads and unresolved cast markers have board
namespaces; same-origin historical slots remain readable. Namespacing preserves
the underlying atomic install and unresolved-cast operations. Global device
preferences and manifest-hash-bound acknowledgements keep their existing
meaning. Clearing the device clears every board namespace. Read keys and raw
invitation tokens are not added to persistent storage keys.

Organizer creation and publication use the configured API origin as the signed
request audience. The frontend origin remains the destination of generated
invitation links, with the board encoded in the fragment. The in-memory publish
continuation is also bound to the API origin: a mismatching or untagged supplied
continuation is refused before unlocking a key. This is local continuation
metadata, not a signed protocol field or a persisted migration. Existing exact
entry bytes and explicit retry behavior remain intact.

Operator instructions, including the required server `publicUrl` and
`allowedOrigins` pair, are in `packages/web/README.md`. The supported separate
frontend host must apply the generated `_headers` or equivalent configuration.
The reference API server's built-in static route retains its own same-origin
header CSP and is not represented as a host for a remote-board bundle. The
standalone verifier keeps its network-disabled policy.

## Separately reproduced CORS recovery defect

Before the server change, an OPTIONS request for an election event stream
returned 204 but omitted `last-event-id` from
`Access-Control-Allow-Headers`. A cross-origin fetch-based SSE resume uses that
header, so that preflight did not permit the browser request. The regression
checks the actual HTTP response from the real server. The server now adds only
that named header to the existing list.

The same regression file separately showed that an allowed-origin management
error response did not expose the existing retry/rate/request headers to browser
JavaScript. Those named response headers are now exposed consistently for API
responses. The allowed and disallowed origin checks retain their prior
allow-origin behavior, public GETs retain credential-free wildcard CORS, and no
`Access-Control-Allow-Credentials` or wildcard request-header permission is
introduced. These are response/preflight metadata changes, not changes to
authentication or resource admission.

The preserved red-before receipt is
`quietvote-evidence/split-origin-cors-before.log`: both tests failed for the
missing named permissions. The same two tests pass after the change in
`quietvote-evidence/split-origin-cors-after.log`. The original malformed
management request still returns 400.

## Verification and limits

Dependencies were installed with scripts disabled, followed by the repository's
successful pinned vendor installation. Focused origin, fragment, cache, storage,
configuration, signing, CORS and runner tests pass (19 tests). Existing UI logic,
publish and audit regressions also pass (41 tests). Latest whole-project and
targeted strict TypeScript attempts were terminated with exit 137 and no
diagnostics, including a bounded-heap attempt explicitly including the browser
journey. A diagnostic-free but terminated process is not a passing check; a
completed integrated check is still needed. The root tsconfig includes source
and unit-test directories, so the browser file also needs explicit inclusion.
The required runner includes `split-origin` as its ninth journey, and
the runner tests assert that this journey's failure cannot be hidden and that
missing tooling still fails.

`packages/web/e2e/split-origin.ts` uses generated production assets on an
independent static HTTP server with both generated CSPs. Its requests target the
real API server without an API proxy or stubbed API responses. Two approved API
origin spellings of that server let the same election ID distinguish fragment
selection, cached clients and stored keys/receipts. The test covers real browser
enrollment, read-key changes, live SSE resume, casting and checking a receipt,
then organization creation and election publication using the default API.
It also checks that malformed/unallowed selectors produce no API request and
that fragments and read keys do not enter request URLs or referrers.

The browser journey has **not passed locally**. Chromium aborted before any
application assertion: `process_singleton_posix.cc` reported `socket()` denied
with `EPERM`, followed by `SIGABRT`. The launch failure is retained in
`quietvote-evidence/split-origin-browser.log`. The mandatory runner and browser
assertions remain enabled; successful hosted execution is still required to
establish browser CORS and complete journey behavior. Node HTTP and unit tests
do not substitute for that evidence.

The isolated build totals 205,431 gzip bytes across JavaScript assets and
102,383 bytes for the entry module: an 854-byte total increase from this branch's
204,577-byte base. The isolated total exceeds the unchanged 200 KiB gate by
631 bytes; its entry remains within the unchanged 110 KiB gate. The parent
integration has separate lossless catalog savings, but the combined build must
be measured after integration. This report does not claim that the isolated
branch itself passes the aggregate size gate or that unrelated release gates
have passed.
