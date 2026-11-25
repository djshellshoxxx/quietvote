# Onion and I2P hosting for QuietVote: research note

Status: research draft, not normative. Access date for all sources: 2026-10-21.
Scope: QV-26 (network and metadata privacy), QV-08 §6.5 (onion deployment), QV-18 (bulletin board), QV-09 (API), client and CLI packages.

## Verification legend

| Tag | Meaning |
|---|---|
| [R] | Read in this repo (file:line given). Repo facts are verified. |
| [F] | Primary page fetched and read in this session. |
| [S] | Search-result snippet of a primary URL. Page not fetched. Re-check before relying on exact wording. |
| [U] | Unverified. From memory or a secondary source only. Test before use. |

Access limits, stated plainly:
- `*.torproject.org` returned `getaddrinfo ENOTFOUND` through WebFetch, and `curl` through the agent proxy returned HTTP 403 (policy denial, per `/root/.ccr/README.md`). Tor Project material is therefore [S] or [U], not [F]. The 403 was reported, not routed around.
- `geti2p.net` and `i2pd.readthedocs.io` returned `ENOTFOUND` through WebFetch. I2P material is [S] or [U].
- `nodejs.org/api/globals.html` was fetched [F]. `nodejs.org/api/cli.html` was only partly read [F, partial].
- No Tor or I2P router was run. No network test was executed. Every behavioural claim about Tor Browser, Tor, or I2P runtime is a hypothesis to test (see §8).

---

## 0. Recommendations

| Profile | Use when | Status |
|---|---|---|
| P0 Clearnet only (TLS 1.3, same origin) | Default today. | Shipped. |
| P1 Dual-publish: clearnet + public v3 onion | General public elections with Tor-using voters. Recommended default for privacy-aware groups. | Needs fixes F1 to F5 (§1) first. |
| P2 Onion-only public | High-risk voter groups where a clearnet listener is itself a liability. | Needs P1 fixes, the Unix-socket listener (F6), and vanguards. |
| P3 Private (client-authorized v3 onion) | Closed rolls where the organiser can distribute one key per voter. Hides the service from non-members. | Needs key-distribution design; the server has no client-auth tooling. |
| P4 I2P (eepsite) | Additional transport for CLI and verifier users only. Not a browser voting path. | Optional, later. Not a substitute for Tor. |

Dual-stack guidance (§5.4): one board origin, one log signing key, one election. Each transport is a separate listener with its own audience string. Do not put Tor, I2P and clearnet behind one reverse proxy.

Top risks, in priority order:
1. The onion profile collapses all clients into one rate-limit bucket and one SSE stream cap (F3). This is a trivial denial of service on the shared onion identity.
2. `upgrade-insecure-requests` in the CSP will likely break `http://*.onion` (F1).
3. The per-instance audience string makes dual-publish fail for one of the two origins (F2).
4. The browser client hard-requires `crypto.subtle` and IndexedDB at startup (F5). Tor Browser behaviour for both is unverified.
5. Tor does not hide the voter key or the ballot's participation (§4). Tor reduces only the network-path link.

---

## 1. Repo findings that block or shape onion/I2P deployment

| ID | Where | Finding | Impact | Fix |
|---|---|---|---|---|
| F1 | [R] `packages/web/src/build/site.ts:19-22` | `csp()` always includes `upgrade-insecure-requests` (in both the header and the `<meta>`). | MDN: the directive rewrites insecure subresource URLs to `https:` before the request, and the request fails if HTTPS is unavailable [S, MDN]. An onion origin is `http://` with no TLS, so same-origin subresources may be rewritten to a dead `https://*.onion` URL. Likely breaks the page in Tor Browser [U, must test]. | Build an onion variant without the directive (§6.2). |
| F2 | [R] `packages/server/src/config.ts:163`, `auth.ts:66-68`; `packages/web/src/flow/publish-ui.ts:48-50, 87` | Request audience is `qv:<instance_id>@<publicUrl>` on the server, from a single configured URL (default `http://localhost`). The client builds its audience from the page origin (`publishAudience(instance_id, r.origin)`). | A dual-published instance has two origins, so one origin's signed requests fail verification. Single-valued `publicUrl` is the constraint. | Server accepts an audience allowlist; client signs with the audience from the instance descriptor, not `location` (§6.1, §6.2). |
| F3 | [R] `packages/server/src/ratelimit.ts:95-107`; `http.ts:201`; `sse.ts:65-68`; `config.ts:198` | Bucket key is `remoteAddress` (IPv4 /24 prefix) or `bucketHeader`. Behind Tor, the socket is loopback or a Unix socket with no peer address, so every onion client maps to one bucket (prefix `none` or `127.0.0`). The SSE cap `maxSseStreams` (default 4) is per bucket. | One attacker exhausts write and SSE capacity for every onion voter. Starves live updates. QV-18 §10 already anticipates a "global bucket (shared onion)". | Per-circuit identity via `HiddenServiceExportCircuitID haproxy` plus HAProxy to set a bucket header (§2.3) [S, unverified in this session]. Keep the author-key path available to authenticated voters. Use Tor's intro-point DoS defence and PoW. |
| F4 | [R] `packages/server/src/ssrf.ts:137` | `.onion` is on `BAD_SUFFIXES`. There is no outbound witness submission code (`grep add-checkpoint` finds nothing; QV-18-REQ-021 is unimplemented). | Onion witnesses cannot be reached by the server's webhook/SSRF path. Witness design over Tor is open (§3.5). | Add an explicit, separate onion egress policy; do not loosen the general SSRF rule. |
| F5 | [R] `packages/web/src/main.ts:8`; `key/keystore.ts:55`; `key/storage.ts:110` | Startup refuses to run unless `crypto.subtle` and `indexedDB` exist (type checks only; no open attempt). Keystore uses `subtle`. | QV-26-REQ-011 and §5.3 require the client not to depend on `crypto.subtle`. The current code contradicts that. Secure-context status of `http://*.onion` is unverified (§3.1). Firefox private-mode IndexedDB behaviour is in doubt (§3.1). | Feature-detect with try/catch around `indexedDB.open`; degrade to memory; document the subtle dependency or remove it (§6.2). |
| F6 | [R] `packages/server/src/config.ts:163-164`; `http.ts:402-404` | The server listens on `cfg.port` and `cfg.host` only (TCP). There is no Unix-socket option. | QV-26-REQ-010 ("App process holds no TCP listener in onion-only profile") cannot be met today. Onion traffic reaches the app over loopback TCP. | Add `socketPath` to `ServerOptions` and `listen(path)`. Keep TCP as the default (§6.1). |
| F7 | [R] `packages/cli/README.md`; `cli/src/*.ts`; `verifier/src/*.ts` | The CLI and verifier perform no network I/O. The README calls the CLI "zero-dependency". There is no submission or fetch command. | "CLI/verifier via SOCKS5h" is new code, and it conflicts with the zero-dependency claim. Native `fetch` cannot use SOCKS directly (§3.2). | Put network code in an optional module, or run the offline CLI behind `torsocks` (§3.2). |
| F8 | [R] `packages/server/src/sse.ts:177-186`; `config.ts:147, 200, 203`; `web/src/net/sse.ts:203, 239` | Server heartbeat default 15 s, hard max 20 s. Client idle timeout 60 s. The client comment says "Server heartbeats are 5-60 s apart", which is wrong. | Not a bug, but the comment misleads tuning. Over Tor, circuit rebuilds drop streams, so reconnect logic matters more (§3.4). | Fix the comment. Keep heartbeat at 10-15 s over onion. |
| F9 | [R] `web/src/build/site.ts:22` (`report-uri /csp-report`) | No `/csp-report` route exists in `packages/server` (grep). | Violation reports 404. If someone adds a sink, it must not log IP or UA (QV-26 §6). | Drop `report-uri` in the onion build, or add a no-log sink. |
| F10 | [R] `packages/server/src/http.ts:120, 144-146` | `https` flag comes from `publicUrl.startsWith('https://')`. It controls HSTS only. | In dual-publish, the single `publicUrl` decides whether HSTS is sent on every response. Browsers ignore HSTS over `http://` [U]. Harmless, but a foot-gun. | Compute HSTS per listener. |
| F11 | [R] (absent) | No `Onion-Location` header anywhere in code. | Dual-publish discovery (QV-26 §5.1 mode 1) is unimplemented. | Add the header on clearnet responses only (§6.1). |
| F12 | [R] `packages/server/src/util.ts:60`; `protocol/src/logcheck.ts:42` | Board origin is `quietvote/v1/` + base32(election_id bytes). It is independent of host. | Good: one log, one checkpoint stream, identical origin on clearnet and onion. The election_id base32 form differs from the hex wording in QV-18-REQ-001; correct the spec. | Keep. Add a cross-host test (§7). |
| F13 | [R] `docs/26-network-metadata-privacy.md:166-172` (References) | QV-26 cites an OnionBalance URL for the Vanguards claim ([R5]), and says "(search result; secondary)". The `HiddenServicePort ... unix:` syntax is not verified. | Spec citations are weak. | Fix the citations. Verify the `unix:` syntax against `tor(1)` (§2.1). |

Repo facts already in place, which are good:
- Server security headers, `Cross-Origin-Opener-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (`http.ts:89-97`).
- ETags are content hashes, not per-user (`static.ts:37`).
- Request signing is HMAC-free Ed25519 over method, target, audience, timestamp, nonce, and body hash (`web/src/api/signing.ts:24-26`).
- `safeBoardOrigin` already allows `http:` only for `localhost` and `.onion` (`web/src/flow/invite.ts:33-38`).
- No service worker is used anywhere in `packages/web` (grep).

---

## 2. Tor deployment recipes

### 2.1 torrc

Option names below are [S] or [U] unless marked. Check every option against `tor(1)` for the version you ship. Tor 0.4.8 or newer is required for PoW [S, forum/blog snippet].

Public v3 onion, dual-publish or onion-only:

```
# /etc/tor/torrc  (Tor >= 0.4.8 for PoW; verify every option in tor(1))
SafeLogging 1
Log notice syslog
DataDirectory /var/lib/tor

HiddenServiceDir /var/lib/tor/quietvote/
HiddenServiceVersion 3
# TCP to HAProxy (see 2.3); HAProxy forwards to the app over a Unix socket.
HiddenServicePort 80 127.0.0.1:8080
HiddenServiceExportCircuitID haproxy        # [S] per-circuit id via PROXY protocol
HiddenServicePoWDefensesEnabled 1           # [S] dormant until under load
HiddenServiceEnableIntroDoSDefense 1        # [U] option name from QV-26; verify
HiddenServiceMaxStreams 64                  # [U] verify
HiddenServiceMaxStreamsCloseCircuit 1       # [U] verify
```

Notes:
- QV-26 §5.2 uses `HiddenServicePort 80 unix:/run/quietvote/http.sock`. The Tor 0.2.6.3 changelog gives `socket:` syntax [S]; a third-party torrc uses `unix:` [S]. The two prefixes conflict in the sources found. Check `tor(1)` before using either.
- `HiddenServiceExportCircuitID haproxy` is documented as sending a PROXY protocol header with a per-circuit identifier to a TCP backend [S, haproxy-proxy spec]. Whether it works with a Unix-socket target is unverified. The TCP-to-HAProxy layout above avoids the question.
- PoW and OnionBalance do not work together [S, GitLab issue 13 and June 2024 relay post]. Do not combine them. Scale vertically or with mirrors (§2.5).
- Client authorization, private profile P3. Tor documents two modes: `basic` (general) and `stealth` (also hides service activity from unauthorised clients, less scalable) [S, third-party torrc snippet quoting the manual; verify]:

```
HiddenServiceDir /var/lib/tor/quietvote-private/
HiddenServiceVersion 3
HiddenServiceAuthorizeClient stealth voter-a,voter-b   # [U] syntax; verify in tor(1)
HiddenServicePort 80 127.0.0.1:8080
HiddenServiceExportCircuitID haproxy
```

Client side for P3 [U format]: each voter's `ClientOnionAuthDir` holds a `<56-char address without .onion>.auth_private` file with `descriptor:x25519:<base32 private key>`. The server side holds one `authorized_clients/<name>.auth` per voter containing the public key. Test the exact format on a real Tor build before publishing docs.

### 2.2 Keys and backup

- The service identity is `HiddenServiceDir/hs_ed25519_secret_key` [U, standard Tor layout; verify]. It is the address. Losing it means a new address; stealing it means impersonation, including a malicious client served from the impersonated address.
- Back it up offline, encrypted, in at least two places. Do not put it in the QuietVote export bundle.
- Rotation (QV-12): new address, a signed redirect or `Onion-Location` on the old address for a transition period, and an updated manifest `board_urls`.
- Private profile: each voter's x25519 client key is a credential. Losing a voter's key locks that voter out. Revoking one requires a Tor restart [S, manual snippet]. Plan that into roll updates.
- The authorized-clients directory is an operator-visible list of which keys can see the service. For a roll of N voters it reveals N keys to the operator. That is roll-level linkability, not a new class of leak; document it (§4).

### 2.3 Node binding, HAProxy and nginx

Target layout: `Tor -> HAProxy (TCP 127.0.0.1:8080, PROXY v2 in) -> app (Unix socket)`. Each hop has no logs of client addresses.

App side (requires F6 fix):

```ts
// packages/server, proposed (not applied)
// Listen on a Unix socket in onion profiles; keep TCP as default.
server.listen(cfg.socketPath, () => { /* ... */ });   // replaces server.listen(cfg.port, cfg.host, ...)
```

HAProxy sketch (unverified; test exact directive support on the shipped version):

```
# /etc/haproxy/haproxy.cfg  (sketch)
global
  log stdout format raw local0 warning
defaults
  mode http
  timeout connect 5s
  timeout client 90s
  timeout server 90s
  option dontlognull
  no option http-server-close
frontend tor_in
  bind 127.0.0.1:8080 accept-proxy        # PROXY protocol from Tor
  http-request set-header X-QV-Bucket %[src]   # [U] circuit id encoded in src; verify
  default_backend qv_app
backend qv_app
  server app unix@/run/quietvote/http.sock
```

HAProxy must not log the client source. `log` is off and the defaults above keep logs to warnings. Verify.

The server's `bucketHeader` option (`config.ts:47`, `http.ts:201`) keys buckets on the named header. Only enable it when the app accepts connections exclusively from HAProxy's socket. Otherwise a client can spoof the header and pick its own bucket.

nginx sketch, for the clearnet listener in P1 (onion traffic does not need nginx):

```
server {
  listen 443 ssl http2;
  server_name election.example.org;
  ssl_protocols TLSv1.3;
  access_log off;                          # QV-26 §6
  error_log /var/log/nginx/qv-error.log crit;   # errors include client addr by default
  add_header Onion-Location "http://EXAMPLE.onion$request_uri" always;  # [S] header name; clearnet only
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  location / {
    proxy_pass http://unix:/run/quietvote/http.sock;   # [U] verify unix upstream syntax for your nginx build
    proxy_http_version 1.1;
    proxy_buffering off;                   # SSE
    proxy_read_timeout 90s;
    proxy_set_header Host $host;
    # Do not forward client addresses: no X-Forwarded-For.
  }
}
```

Host and origin handling:
- The app ignores the `Host` header (grep for `headers.host` in `packages/server` finds nothing). The audience string comes from configuration, not the request, so a spoofed `Host` cannot change the audience. Good.
- `Onion-Location` is documented as a header that Tor Browser uses to offer the onion site [S, Tor Browser 9.5 notes]. Send it only on clearnet responses. Automatic redirect is opt-in per user [S].
- Pin `server_name` to the onion host in the onion vhost. Reject unknown `Host` with 421 or 404.

### 2.4 Logs and metadata configuration

- `SafeLogging 1` and `Log notice syslog` (QV-26 §6). Do not enable debug logs.
- The application's log fields must exclude IPs. For onion traffic the source is always the local HAProxy, so the risk is the proxy, not the client; keep both silent.
- Circuit identifiers from HAProxy are linkable across requests on one circuit. Do not log them, and do not persist them. They are needed only for the in-memory bucket.

### 2.5 OnionBalance and scaling

- OnionBalance does not support PoW [S, GitLab issue 13]. If PoW is on, do not use OnionBalance.
- The current OnionBalance status (maintenance, Arti support) is [U].
- Use mirrors instead (QV-18-REQ-025): each mirror is a full verified copy with its own onion. The manifest lists them in `board_urls`. Mirrors do not split one address, so they do not give a single origin a load balancer. They do give availability. Verify the mirror serves identical bytes and proofs (test in §7).
- Vertical scaling is the MVP option (QV-26 §5.2).

---

## 3. Client side

### 3.1 Web in Tor Browser

| Issue | Status | Recommendation |
|---|---|---|
| JavaScript | Tor Browser Safest disables JavaScript on all sites [S, tb-manual security-settings]. QuietVote cannot vote without JS (ADR-001, QV-26 §5.3). | Document. Advise Standard or Safer on the onion site. Safer disables JS only on non-HTTPS sites [S]; an onion site is not HTTPS, so Safer also disables JS there. Verify this for onion specifically. |
| Secure context on `http://*.onion` | Tor's patch whitelists `.onion` as a potentially trustworthy origin via `dom.securecontext.whitelist_onions` [S, 2015-2020 commits]. Current Tor Browser default unverified. | Test `window.isSecureContext` and `crypto.subtle` on the onion build in the target Tor Browser release (§8). If false, the app must not depend on `subtle` (F5). |
| CSP | Header set per build. `upgrade-insecure-requests` likely breaks onion (F1). `require-trusted-types-for 'script'` depends on Trusted Types support; if unsupported the directive is ignored [U, verify in Tor Browser]. | Onion build: drop `upgrade-insecure-requests`. Keep the rest. Test the Trusted Types policy path separately. |
| SRI | `integrity` with `sha384` and `crossorigin="anonymous"` on script, css and modulepreload (`site.ts:62-68`). No third-party origins. | Keep. |
| Service workers | None used (grep). | Keep none. QV-26-REQ-011 requires this. |
| IndexedDB | Firefox private mode historically did not offer IndexedDB [S, Bugzilla 781982]. A later Firefox change reportedly allows it with an in-memory or encrypted-on-disk design [U, secondary sources only]. Tor Browser is private by default. | Feature-detect with `indexedDB.open` in try/catch. Fall back to memory and show the in-memory warning (QV-26 §7). |
| Timing | Tor adds latency. Ops target: p95 8 s submit ack over Tor (docs/12). | Show the onion latency in UX. Keep client-side proving time out of the server metric. |
| Fingerprinting | Same bytes for all voters (QV-26 §7); no analytics; locale chosen by UI, not sent. `navigator.languages` is read only for local negotiation (`ui/app.ts:60`). | Keep. Add the static deny-list check (QV-26-REQ-030). |

### 3.2 CLI and verifier over SOCKS5h

Facts:
- Node's built-in `fetch` uses an undici dispatcher [F, nodejs globals].
- `NODE_USE_ENV_PROXY=1` enables env-var proxying for fetch on Node >= 22.21 [R, `/root/.ccr/README.md` local doc; S, secondary]. Those env vars carry HTTP CONNECT proxies, not SOCKS. Do not use them for Tor.
- undici's `ProxyAgent` with a SOCKS URI silently drops `requestTls` in undici 7.23.0 through the fix versions 7.28.0 and 8.5.0 [S, CVE page]. Use `Socks5ProxyAgent` at a fixed version (>= 7.28.0 or >= 8.5.0) and verify the TLS options.
- undici `Socks5ProxyAgent` takes `socks5://` or `socks://` URIs [S, undici docs].
- `EnvHttpProxyAgent` is experimental [S, undici docs]. Do not use it for SOCKS.

Proposed client code, in an optional module so the zero-dependency core stays intact (F7). Not applied:

```js
// packages/cli/src/net/tor.ts (proposed; optional dependency: undici >= 7.28.0)
import { Socks5ProxyAgent, fetch } from 'undici';

export function torFetch(proxyUrl = 'socks5://127.0.0.1:9050') {
  // Tor resolves hostnames (including *.onion). Do not resolve names locally.
  const dispatcher = new Socks5ProxyAgent(proxyUrl);
  return (url, init = {}) =>
    fetch(url, { ...init, dispatcher, signal: init.signal ?? AbortSignal.timeout(60_000) });
}

// usage:
// const f = torFetch();
// const r = await f('http://EXAMPLE.onion/api/v1/elections/<id>/log/checkpoint');
```

Test that no name lookup leaks: run `strace -f -e trace=network,connect` or `tcpdump -i any port 53` during a fetch. Expect zero DNS packets.

Dependency-free alternative: `torsocks qv board verify ...` (LD_PRELOAD wrapper) keeps the CLI code unchanged [U, not tested here]. Recommended for auditors who already use Tor.

Verifier: the offline verifier must stay offline. Network fetch belongs in a wrapper. Keep `packages/verifier` free of network code.

### 3.3 Witnesses reaching the board over Tor

- Witnesses are not implemented on the server side (F4). Two shapes:
  - Witness pulls checkpoints from the board. The witness runs its own client (Tor SOCKS5h, as in §3.2) and posts cosignatures back. This needs no server change.
  - Server pushes `add-checkpoint` to a witness (QV-18-REQ-021). This needs a SOCKS egress path and a separate onion allowlist in `ssrf.ts`.
- Prefer the pull model over Tor for a first release. It keeps the server out of the outbound business.
- Witnesses must be independent of the operator and of each other's Tor entry. Otherwise one adversary sees both.
- `qv witness serve` (QV-18-REQ-024) should run as an onion service itself.

### 3.4 SSE over Tor

- The client reads `text/event-stream` with `fetch` streaming, not `EventSource` (`web/src/net/sse.ts:1-5`). Good for Tor: headers carry the resume cursor (`Last-Event-ID`).
- WebSockets are not used (QV-09-REQ-019). Good.
- Server defaults: heartbeat 15 s (`config.ts:200`), `retry: 3000`, idle close 600 s (`config.ts:204`), `maxSseStreams` 4 per bucket, `maxSseTotal` 1024.
- Client: `idleMs` default 60 s (`sse.ts:239`).

Tuning for onion (recommendation, to test):

| Setting | Clearnet default | Onion recommendation | Reason |
|---|---|---|---|
| server `sseHeartbeatMs` | 15 s | 10-15 s | Keeps circuits and proxies from idling out. Stays below the 20 s hard max. |
| client `idleMs` | 60 s | 45-60 s | At least 3 heartbeats. Tolerates one lost beat. |
| `retry:` | 3000 ms | 3000-5000 ms | Circuit rebuilds take seconds. Avoid reconnect storms. |
| `maxSseStreams` per bucket | 4 | Per-circuit bucket, see F3 | Without F3 fixed, the shared bucket caps all onion voters at 4. |
| `sseIdleCloseMs` | 600 s | 600 s | Unchanged. |

Circuit changes mid-stream will close the stream. The client resumes with `Last-Event-ID`. Verify no duplicate delivery beyond at-least-once (`sse.ts:1-5`).

---

## 4. Metadata and anonymity analysis

### 4.1 What Tor hides, and what it does not

| Observable | Observer | Tor hides it? | Protocol-level leak | Mitigation |
|---|---|---|---|---|
| Client IP connecting to the server | Server, network | Yes. The server sees Tor exit or rendezvous circuits, never the client IP (onion). | None, if no client identity is in the request. | Keep the server off clearnet in P2. |
| Server IP | Client, network | Yes for onion. | None. | Onion-only hides the server IP. |
| Network observer sees client is using Tor | ISP | No. Tor usage is visible; the destination is not, except through Tor's own patterns. | Tor usage fingerprint. | Bridges and pluggable transports (§4.3). |
| Voter key on the roll | Anyone | No. Participation is public (QV-ADR-005; docs/18 non-claims). | Public key list. | Phase 2 unlinkable tokens (QV-ADR-005). |
| Ballot signed by voter key | Anyone | No. Same key signs and is on the roll. | Ballot-to-key link (public). | Same as above. |
| Submission timing vs. ballot append time | Server, log readers | No. Server sees arrival time. | Timing correlation between the Tor path and the log. | S1 random delay, S2 hash-sorted epoch batching (QV-26 §8.2). |
| Ballot size | Network, server | No. Ciphertext size is per-election fixed. | Size side channel if padding is off. | S3 fixed-size padding (`pad_to`). |
| Number of revotes per key | Everyone | No. Revoting is visible in the log (docs/16). | Count per key. | Document; not solved by Tor. |
| IP at registration | Registrar, network | Only if registration also uses Tor. | IP-to-roll link if registered over clearnet. | Route registration (invite redemption, roll enrolment) through Tor too. |
| Circuit-level correlation | Global passive adversary | No. Tor does not defend this [S, QV-26 R1]. | Timing correlation. | Organisational: no single observer of both ends; vanguards. |
| Guard discovery against the onion service | Adversary with relay control | Partly. Vanguards-lite is specified as the default [S, Tor vanguards spec]. Full vanguards is an add-on for higher assurance. | Long-lived services are less protected by lite [S]. | Run the vanguards add-on for P2 and high-risk P1. Tor version defaults are [U]. |
| Client authorization key list | Operator | Not applicable. The operator holds the list. | Roll-size and key-set disclosure (P3). | Document; consider blinding or threshold distribution. |
| Access pattern to rate-limit buckets | Operator | Partly. Per-circuit buckets link requests within a circuit. | Requests on one circuit are linkable. | Keep the circuit ID in memory only (F3). Never log it. |
| Onion-Location pill | Clearnet observer | No. Clearnet responses reveal the onion address. | Onion address disclosure. | Accept it. The address is public in the manifest anyway. |
| Errors and timing | Anyone | Not applicable. | Roll-membership oracle via error differences. | QV-26-REQ-032: uniform errors and timing class. |

### 4.2 Correlation risks specific to QuietVote

- Same-session dual-stack use. A voter who submits over clearnet and onion from the same device links the two. Advise: pick one transport per ballot.
- Revoting over a different transport from the first attempt. The log shows two entries from the same voter key. Tor does not hide that (§4.1).
- Invite token redemption over clearnet followed by casting over Tor. The redemption IP and the casting time are separate, but the token and the key are linked by enrolment (QV-04). Route both through Tor in P1.
- Onion Location auto-redirect. A voter using clearnet at voting time and then switching to onion leaks the switch timing to the ISP only, not to the server.
- Shared onion bucket (F3) leaks nothing about a voter's identity, but it lets an attacker correlate by rate-limit pressure. Fix F3 first.
- Logs and metrics. QV-26 §6 requires no IPs. HAProxy and Tor logs must match.

### 4.3 Bridges and pluggable transports for censored users

- Tor Browser offers bridges and pluggable transports (obfs4, Snowflake, WebTunnel; current list [U]).
- Voters behind censorship need a bridge before they reach the onion. The onion address itself is not blocked by DNS, but Tor entry relays are.
- For the CLI, configure `UseBridges 1` and `Bridge` lines in the user's torrc, and the matching `ClientTransportPlugin` [U, verify].
- The server cannot bridge clients. Onion services are reachable through the Tor network, and a censor who blocks Tor blocks the service too.
- Distribute bridge lines through the same trusted channel as the election invite, not the election's own website.
- I2P (§5) is an alternative for censored users only if they can run an I2P router. It has a much larger operational cost.

---

## 5. I2P

### 5.1 Implementation options

| Option | Language | SAM v3 | BOB | Notes | Status |
|---|---|---|---|---|---|
| Java I2P (I2P Foundation) | Java | Off by default; enable in router console | Dropped for new installs in 1.7.0 (2022-02) | Default tunnel quantity 2 [S] | Mature. Heavier. |
| i2pd | C++ | On by default | Still supported, with extensions [S] | Default tunnel quantity 5 [S]. Limited SAM 3.2/3.3 support reported [S, unverified current status]. | Lighter. Used for servers. |
| SAM v3 client libraries | varies | Client side | Not needed | Choose one and pin a version. Specific Node SAM libraries not evaluated [U]. | — |

SAM v3 facts [S, i2p.net SAMv3 page]: default port 7656 [U], `HELLO VERSION`, `SESSION CREATE STYLE=STREAM ...`, `STREAM CONNECT ID=... DESTINATION=...`. Set `inbound.quantity` and `outbound.quantity` explicitly in `SESSION CREATE` for consistent behaviour across routers [S].

Tunnel defaults differ between routers [S]. Set quantities explicitly.

Garlic routing, b32 addressing (hash of the destination, `.b32.i2p`) [S for b32]. Garlic routing mechanics were not verified [U].

### 5.2 Eepsite hosting recipe (i2pd, server tunnel)

Official i2pd example [S, i2pd tunnel docs]:

```
# /var/lib/i2pd/tunnels.conf  (or ~/.i2pd/tunnels.conf)
[quietvote]
type = http
host = 127.0.0.1
port = 8080                       # the app, or HAProxy listening on loopback
keys = quietvote.dat              # created on first start; back this up
```

Notes:
- Without `keys`, the router creates transient keys and the address changes on restart [S]. Always set `keys`.
- The `.b32.i2p` address derives from the destination [S]. Back up `quietvote.dat` offline.
- The eepsite is plain HTTP inside I2P's encrypted tunnels. It is not a TLS origin.

### 5.3 Tradeoffs against Tor, and browser viability

- Voters need a local I2P router and proxy to reach an eepsite from a browser. There is no Tor-Browser-equivalent for I2P in this project.
- `http://*.b32.i2p` is not a secure context in standard browsers [U, expected from the secure-context rules; verify]. Browser voting over I2P would fail the `crypto.subtle` gate (F5). I2P is therefore CLI and verifier only in this design.
- I2P latency and tunnel build time are typically higher than Tor [U].
- I2P has no equivalent of the Tor Project's documented onion-service PoW defence in this design. Use the server rate limits and author-key bucket instead [U].
- The I2P router is heavier to run for voters and for the operator [U].
- Advantage: different network and threat community from Tor. Useful as an independent transport for CLI users, not as the primary channel.

### 5.4 Dual-stack Tor, I2P and clearnet

- One election, one board origin (F12), one log signing key, one manifest. The origin does not depend on transport.
- Each transport has its own audience string (F2). The manifest lists `board_urls` for all of them.
- Clearnet: TLS 1.3, HSTS, `Onion-Location`, primary for browser voters.
- Tor onion: primary for privacy-aware browser voters. Separate process chain (Tor, HAProxy, app).
- I2P: CLI, verifier and mirror only. Its own listener and its own audience string.
- Do not share a reverse proxy, a process, or a log file across transports. A shared log lets one operator correlate transports.
- Do not put one transport behind another (e.g. I2P-to-Tor). That is an extra hop that adds latency and failure modes without privacy gain.

---

## 6. Concrete code and config changes, by package

Changes are proposals. Nothing under `packages/**` was edited in this task. Each snippet is a sketch.

### 6.1 `packages/server`

| Change | File | Ref |
|---|---|---|
| Unix-socket listener option (`socketPath`), TCP stays default | `src/config.ts`, `src/http.ts:402-404` | F6, QV-26-REQ-010 |
| Audience allowlist, signed audience is still validated | `src/auth.ts:66-68`, `src/config.ts` | F2 |
| Bucket header accepted only from the local socket | `src/http.ts:201` | F3 |
| `Onion-Location` on clearnet responses only | `src/http.ts` (response headers) | F11 |
| Per-listener HSTS instead of `publicUrl` | `src/http.ts:120, 144-146` | F10 |
| Witness onion egress, explicit allowlist, separate from SSRF | `src/ssrf.ts:137`, new module | F4 |
| No `/csp-report` sink, or no-log sink | new route, or remove `report-uri` in the web build | F9 |

Sketches:

```ts
// src/auth.ts (proposed)
export function audiencesOf(env: Env): Set<string> {
  return new Set(env.cfg.publicUrls.map((u) => `qv:${env.control.instanceId()}@${u}`));
}
// authenticate(): accept if requestAudience is in audiencesOf(env).
// The signature covers the audience string (requestMessage in web/src/api/signing.ts), so this
// does not weaken signing: a request signed for clearnet is not valid for onion unless the client
// signed for the onion audience.
```

```ts
// src/http.ts (proposed) - Onion-Location on clearnet responses only
if (cfg.onionUrl !== undefined && !isOnionListener) {
  headers['Onion-Location'] = new URL(req.url ?? '/', cfg.onionUrl).toString();
}
```

```ts
// src/http.ts (proposed) - HSTS per listener
const sendHsts = listener.scheme === 'https';
```

### 6.2 `packages/web`

| Change | File | Ref |
|---|---|---|
| Onion build variant: omit `upgrade-insecure-requests`, drop `report-uri` | `src/build/site.ts:19-22`, `site.ts:50` | F1, F9 |
| Startup: feature-detect IndexedDB by opening it; fall back to memory | `src/main.ts:8`, `src/key/storage.ts:110` | F5, QV-26 §7 |
| Remove the `crypto.subtle` startup gate or make it a per-action check | `src/main.ts:8`, `src/key/keystore.ts:55` | F5, QV-26 §5.3 |
| Audience from the instance descriptor, not `location.origin` | `src/flow/publish-ui.ts:48-50, 87` | F2 |
| Fix heartbeat comment | `src/net/sse.ts:203` | F8 |
| Static check: deny-list APIs, no non-same-origin URLs | CI, new script | QV-26-REQ-030 |

Sketch:

```ts
// src/build/site.ts (proposed)
export function csp(boardOrigins: readonly string[] = [], opts: { onion?: boolean } = {}): { header: string; meta: string } {
  const connect = ["'self'", ...boardOrigins].join(' ');
  const common = [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'",
    `connect-src ${connect}`, "worker-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'self'",
    "object-src 'none'", "require-trusted-types-for 'script'", 'trusted-types qv-default',
    ...(opts.onion ? [] : ['upgrade-insecure-requests']),
  ];
  // header and meta as before; report-uri only for clearnet builds
  return { header: [...common, "frame-ancestors 'none'", ...(opts.onion ? [] : ['report-uri /csp-report'])].join('; '), meta: common.join('; ') };
}
```

```ts
// src/key/storage.ts (proposed) - storage open with fallback
async function openDb(): Promise<IDBDatabase | undefined> {
  try {
    return await new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } catch {
    return undefined; // caller uses in-memory storage and shows the QV-26 §7 warning
  }
}
```

### 6.3 `packages/cli`

| Change | File | Ref |
|---|---|---|
| Optional `torFetch` module (new), undici `Socks5ProxyAgent` | `src/net/tor.ts` (new) | F7, §3.2 |
| Keep the offline core zero-dependency. Network only through the optional module. | `package.json` | F7 |
| Board fetch subcommand (`qv board fetch --proxy socks5://...`) | `src/cmd-board.ts` | §3.2 |

### 6.4 `packages/board`, `packages/verifier`, `packages/protocol`

- No code change needed for host independence (F12). Add a cross-host test.
- Verifier stays offline. No network code.

### 6.5 Docs

- QV-26 §5.2: replace the `unix:` example after verifying syntax; add the HAProxy layout; note PoW and OnionBalance incompatibility.
- QV-26 References [R5]: replace the OnionBalance URL with the Vanguards spec.
- QV-18-REQ-001 and the origin construction: state base32 election_id encoding.
- QV-08 §6.5: list P1 and P2 steps and the audience allowlist.

---

## 7. Test plan

| # | Test | Pass condition | Package |
|---|---|---|---|
| T1 | Onion build loads in Tor Browser Standard | Page renders; no CSP violation for `upgrade-insecure-requests`; no subresource failures | web |
| T2 | `window.isSecureContext` and `crypto.subtle` on `http://*.onion` in target Tor Browser | Recorded result; if false, app runs without subtle (F5) | web |
| T3 | IndexedDB open in Tor Browser private window | Fallback engages cleanly if open fails | web |
| T4 | Service worker absent | `navigator.serviceWorker` never registered | web |
| T5 | Static deny-list scan | No non-same-origin URL; no deny-listed API (QV-26-REQ-030) | web CI |
| T6 | Dual-publish audience | Requests signed for clearnet audience accepted on clearnet; onion audience accepted on onion; cross-audience replay rejected | server, web |
| T7 | Rate-limit isolation | Two circuits: one exhausting its bucket does not block the other | server, HAProxy |
| T8 | SSE cap per circuit | Streams from different circuits are not capped together | server |
| T9 | Heartbeat over Tor | Stream survives 10 minutes with 10-15 s heartbeat; reconnect after forced circuit change | server, web |
| T10 | No IP in logs | Grep of app, HAProxy, nginx, Tor logs for client addresses returns none | all |
| T11 | Unix-socket-only app | `ss -ltnp` shows no TCP listener of the app in onion-only profile (QV-26-REQ-010) | server |
| T12 | Host independence of origin | Same board origin and checkpoint from clearnet and onion | board, server |
| T13 | SOCKS5h has no local DNS | `tcpdump port 53` empty during `torFetch` | cli |
| T14 | Mirror identical bytes | Mirror serves identical log bytes and proofs | server, board |
| T15 | Client-auth onion (P3) | Non-authorised client cannot fetch descriptor; authorised client can | ops |
| T16 | Witness pull over Tor | Witness completes cosignature cycle through onion | cli, witness |
| T17 | I2P eepsite | `qv` CLI completes fetch via SAM stream; no browser path claimed | cli |
| T18 | Vanguards enabled | Vanguards add-on running in P2 profile; config captured | ops |

---

## 8. Open questions and items to verify before use

1. Tor manual option names and defaults for the shipped Tor version (`tor(1)`). Affects §2.1.
2. `HiddenServicePort` target syntax for Unix sockets (`unix:` vs `socket:`).
3. `HiddenServiceExportCircuitID haproxy` on a TCP-to-HAProxy target, and the PROXY header encoding.
4. Client-auth key format (`.auth`, `.auth_private`) and `HiddenServiceAuthorizeClient` syntax.
5. Tor Browser behaviour for `http://*.onion`: secure context, `crypto.subtle`, `upgrade-insecure-requests`, Trusted Types, and JS under each security level.
6. Firefox private-mode IndexedDB current behaviour in Tor Browser.
7. Node `NODE_USE_ENV_PROXY` exact version and whether it applies to SOCKS (expected not).
8. undici `Socks5ProxyAgent` and `socks5h` handling (the name must reach Tor unresolved). Test it.
9. OnionBalance and PoW status in current releases.
10. I2P: SAM 3.2/3.3 support in i2pd, BOB status, garlic routing and b32 details against primary specs.
11. Vanguards-lite default version in Tor (spec says MUST default; release version unverified).

Items 1, 2, 4, and 5 block P1 and P3 implementation. Test them with a real Tor build before merging.

---

## 9. Sources (access date 2026-10-21)

| Tag | Source |
|---|---|
| [F] | https://nodejs.org/api/globals.html (fetch, custom dispatcher) |
| [F, partial] | https://nodejs.org/api/cli.html (NODE_USE_ENV_PROXY not reached) |
| [S] | https://spec.torproject.org/rend-spec/hsdesc-encrypt.html (HS-DESC-ENC, x25519 client auth) |
| [S] | https://spec.torproject.org/vanguards-spec/index.html (Vanguards-Lite default, Full Vanguards option) |
| [S] | https://spec.torproject.org/haproxy-proxy.html (HiddenServiceExportCircuitID haproxy) |
| [S] | https://blog.torproject.org/introducing-proof-of-work-defense-for-onion-services (PoW, Tor 0.4.8) |
| [S] | https://gitlab.torproject.org/tpo/onion-services/onionbalance/-/issues/13 (PoW not supported with OnionBalance) |
| [S] | https://forum.torproject.org/t/tor-relays-onion-services-operators-please-enable-tor-pow-defense/13043 (OnionBalance PoW note, June 2024) |
| [S] | https://archive.torproject.org/websites/support.torproject.org/onionservices/onion-location/ (Onion-Location, Tor Browser 9.5) |
| [S] | https://tb-manual.torproject.org/security-settings (Tor Browser security levels, JS) |
| [S] | https://gitlab.torproject.org/t-m-w/tor-browser/-/commit/b841177305f08975e1d7d154a99ddea72ff3200e (.onion whitelisted as potentially trustworthy; old) |
| [S] | https://bugzilla.mozilla.org/show_bug.cgi?id=781982 (IndexedDB in private browsing; old) |
| [S] | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/upgrade-insecure-requests |
| [S] | https://undici.nodejs.org/api/Socks5ProxyAgent.json (undici Socks5ProxyAgent) |
| [S] | https://www.rapid7.com/db/vulnerabilities/cve-2026-9697/ (ProxyAgent SOCKS requestTls drop; fix 7.28.0 / 8.5.0) |
| [S] | https://i2p.net/docs/api/samv3 (SAM v3) |
| [S] | https://i2pd.readthedocs.io/en/latest/user-guide/tunnels/ (i2pd server tunnel) |
| [S] | https://docs.i2pd.website/en/latest/devs/i2pd-specifics/ (i2pd deviations) |
| [R] | `/root/.ccr/README.md` (NODE_USE_ENV_PROXY on Node >= 22.21; 403 policy handling) |
| [R] | Repo files cited in §1 (file:line) |

Not used as a source for normative claims: the forum and Reddit anecdotes on i2pd tunnel settings and Firefox 115, which appear as [U] above.
