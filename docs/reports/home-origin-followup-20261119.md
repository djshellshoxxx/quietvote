# Home invitation routing and same-origin IPv6 follow-up

This bounded follow-up starts from the integrated candidate
`32deb381fb9e4bd19776e603663611e7f940834e`. Production changes are confined to the
Home pasted-address handler and the shared origin helpers. It does not change
election verification, signed protocol bytes, the board-origin limit, or the
proposed status of P08-2 and P19-3.

## Reproduction and correction

The Home handler used a base32-only prefix expression even though the existing
application route parser accepts both legacy 26-character base32 election IDs
and current 32-character hex IDs. A regression invokes the actual `startApp`
Home callback: the legacy address opens, while a current hex address leaves the
application on Home. The same rejection occurs for a relative current address.
The handler now requires an exact supported election route through `parseRoute`.
It accepts relative addresses or absolute addresses on this frontend, rejects
foreign frontend origins and URL credentials, and preserves the authentication
fragment. It does not infer a board from a pasted foreign frontend URL. Board
selection still comes only from the configured default or an allowed fragment
selector.

The split-origin origin validator also narrowed previously usable same-origin
hosting. Its DNS-label validation rejected a browser page origin containing a
canonical IPv6 literal, so `startApp` threw before rendering Home. The new
regression reproduces that startup exception through the application itself.
Origin identity now accepts IPv6 validated by the URL parser, while retaining
exact canonical serialization and the existing URL-length/port/credential/path
checks. HTTPS IPv6 literals and HTTP loopback `[::1]` can therefore use the
same-origin application and its historical storage slots. Non-loopback HTTP
IPv6, malformed literals, zone identifiers, expanded noncanonical spellings,
explicit default ports and URL credentials remain rejected.

The bounded external origin list still rejects IPv6 literal entries, including
an explicit IPv6 `--api-base`. Same-origin deployments omit those flags and use
the existing CSP `'self'` expression. This distinction preserves same-origin
operation without claiming external IPv6 literal CSP support. CSP Level 3
defines a separate same-origin match for `'self'`; its host-source grammar and
host matching do not provide a general IPv6 literal permission. The primary
reference is the [CSP Level 3 source-expression matching section](https://www.w3.org/TR/CSP3/#match-url-to-source-expression),
with the [host-part matching section](https://www.w3.org/TR/CSP3/#match-hosts).
The maximum of 16 external board origins and fail-closed selection remain
unchanged.

## Focused verification

`packages/web/test/home-origin-ui.test.ts` drives the actual `startApp` callback
and router through the same small deterministic DOM/task adapter used by the
existing device-settings UI tests. It covers both ID formats, relative paths,
exact election views, foreign frontend refusal, retained fragments, read-key
headers, and invalid or unallowed board fragments. Those fragments render the
SPA error view without an API request or stored-key lookup. The IPv6 cases
start the application, open an election, check the request origin and preserve
same-origin storage identity. They separately assert rejection by the external
allowlist, site configuration and CSP builder. This is application behavior
evidence, not browser layout, networking or CORS enforcement evidence.

Two older expectations in `security.test.ts` were updated to the already
implemented fail-closed contract: malformed board escapes must be rejected, and
board URLs with paths must not silently normalize to another destination. The
negative cases remain, and the actual SPA regression verifies the original
route-survival concern without permitting a default-board fallback. Updating
these obsolete expectations is not counted as an additional defect.

The preserved before receipt, `quietvote-evidence/home-origin-before.log`, shows
2 of 5 tests passing: the legacy address and malformed-board SPA refusal pass;
the current absolute/relative address and IPv6 startup checks fail. The exact
same new test cases pass after the production change.

The combined focused run of `home-origin-ui.test.ts`, `split-origin.test.ts` and
`ui-logic.test.ts` passed 21 of 21 tests; its receipt is
`quietvote-evidence/home-origin-after.log`. The two selected security tests
passed 2 of 2 under `--test-name-pattern='WV-3|invite fragment'`; their receipt is
`quietvote-evidence/home-origin-security-expectations.log`.

No full TypeScript or Chromium retry was attempted for this follow-up. The
previous environment limitations and pending hosted browser qualification are
unchanged. A fresh aggregate bundle measurement is left to integration; neither
the 200 KiB total nor the 110 KiB entry limit was changed.
