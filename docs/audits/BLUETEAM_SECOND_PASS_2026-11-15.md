# QuietVote — Blue-Team Security Review, Second Pass

**Date:** 2026-11-15  
**Target:** `integration/quietvote-completion`  
**Reviewed branch head before this report:** `b2a11fe6dd844071c58abd0526090ccb67445985`  
**Review type:** Additional source-level defensive review.  
**Status:** No code changes or runtime tests performed in this pass.

## Scope

This pass concentrated on static asset serving, data-retention enforcement, checkpoint-gossip operations, job execution and the defensive behavior of the HTTP layer. Findings are based on inspected source. Deployment-dependent conditions are identified as such.

## New findings

### BT-11 — Static asset loader follows symlinks outside the asset root
**Severity: MEDIUM — deployment/build integrity risk**  
**Status: Source-confirmed behavior; exploitability depends on static directory contents and deployment permissions.**

File: `packages/server/src/static.ts`

The recursive asset loader uses `statSync()`, which follows symbolic links, and then reads the resulting path using `readFileSync()`. Directory symlinks are recursively traversed as well. There is no explicit symlink rejection or resolved-path containment check.

If a symlink is present in the configured static asset directory and points outside it, the target file can be loaded into the in-memory asset map and served through the HTTP static handler. This can unintentionally publish host files or deployment secrets. The static path is not request-derived, so this is not a conventional URL traversal issue; it is a build/deployment filesystem-boundary issue.

**Defensive action:**
- Use `lstatSync()` and reject symbolic links rather than following them.
- Resolve and canonicalize each file path and enforce containment beneath the canonical static root.
- Consider rejecting special files and hard-link surprises according to the deployment threat model.
- Add tests for file symlinks, directory symlinks, nested symlinks and paths resolving outside the asset root.
- Ensure the static build directory is owned by the deployment process and not writable by the application runtime.

### BT-12 — Retention sweep failures are silently suppressed
**Severity: MEDIUM — privacy/data-retention assurance risk**  
**Status: Source-confirmed.**

File: `packages/server/src/retention.ts`

The scheduled retention callback catches and discards all top-level errors. Per-election database open/purge failures are also caught and discarded. The code comments state that failures will be retried on the next sweep, but no durable failure record, metric, alert, or operator-visible health state is produced by this module.

The invite-data purge is intended to clear encrypted labels and contact fields after the retention grace period. If a database remains locked, inaccessible, corrupt, or otherwise fails to open, sensitive fields can remain beyond the configured period while the scheduled task appears to be running normally.

**Defensive action:**
- Count and expose per-election purge failures without logging personal data.
- Emit a structured, low-cardinality operational event for failed sweeps.
- Track last successful sweep time, last failure time, and number of databases skipped/failed.
- Alert when a sweep fails repeatedly or when the last successful sweep exceeds a defined threshold.
- Keep retry behavior, but make failure state visible to operators.
- Add tests for locked, missing, corrupt and permission-denied election databases.

### BT-13 — Checkpoint gossip failure state is not durably observable
**Severity: MEDIUM — transparency-monitoring / incident-detection gap**  
**Status: Source-confirmed behavior; impact depends on deployment monitoring.**

File: `packages/server/src/gossip.ts`

The periodic gossip scheduler invokes `runOnce()` with a catch handler that discards unexpected errors. Individual peer exchanges increment in-memory counters for failed requests, blocked targets and malformed responses, but this module does not persist a peer-health history or emit a structured failure event for ordinary exchange failures. The counters reset when the process restarts.

As a result, a configured peer can remain unreachable, DNS resolution can repeatedly fail, or responses can be rejected without a durable record that an operator can use to establish the duration and recurrence of the monitoring outage. This weakens the operational value of gossip as an independent split-view/rollback detection control.

**Defensive action:**
- Persist or export peer-level last-success, last-failure and consecutive-failure state.
- Emit structured events for DNS/SSRF rejection, timeout, non-2xx response, truncated response and malformed response.
- Alert on stale peer contact and sustained failure, while avoiding high-cardinality or sensitive log fields.
- Expose configured peer count separately from healthy peer count.
- Make the last successful exchange time visible in admin health/status.
- Test process restart, peer outage, DNS change, malformed response and recovery behavior.

## Additional defensive observations

### HTTP boundary controls observed

The inspected HTTP layer has several useful controls that should be preserved:
- Node's strict HTTP parser is used; insecure HTTP parsing is disabled.
- Header, request and keep-alive timeouts are configured.
- Maximum header count, header size, connection count and requests per socket are bounded.
- Request body sizes are checked while streaming.
- Large tar imports require a content length and undergo signature preflight before body reads.
- API responses receive restrictive content security policy and security headers.
- Credentialed CORS is limited to configured origins; public unauthenticated GET routes are explicitly distinguished.
- Link-restricted election reads are marked private/no-store by the application layer.
- SSE connections have per-bucket and process-wide caps, backpressure handling and idle/slow-client termination.

These are source-level observations, not confirmation of production reverse-proxy or TLS configuration.

### Job and backup observations

The backup path obtains election runtimes through the pool, which loads an election runtime on demand; therefore, an unloaded runtime is not by itself evidence that the election will be omitted. The backup manifest explicitly states that the instance KEK is excluded. Operators must therefore retain and recover the KEK separately. A database quick-check confirms structural consistency, but it does not demonstrate a successful end-to-end restoration or prove that all required external key material is available.

**Recommended additional control:** schedule restore drills that validate the control database, every election database, KEK provisioning, and successful decryption of representative sealed fields in an isolated environment.

## First-pass issues rechecked

The integration branch still has the asymmetric spoil/cast admission logic described in BT-01 of the first report: it checks a new spoil against earlier cast ciphertexts, but does not maintain the symmetric set needed to reject a later cast that reuses ciphertexts from an earlier spoil. The separate S1-02 branch had the relevant symmetric guard and regression test. This pass did not port or merge that change.

The first-pass verifier assurance findings BT-02 through BT-04, key custody BT-05, registration default BT-06, proxy trust BT-07, disclosure policy BT-08, gossip topology BT-09 and release governance BT-10 remain open pending remediation and verification. This pass did not establish that any of those items has been fixed.

## Prioritized actions

1. **Stop-ship:** close the reverse-order spoil/cast integrity issue (BT-01).
2. **Stop-ship:** correct verifier PASS semantics and require an independent manifest trust anchor (BT-02/BT-03).
3. **Privacy and deployment:** reject static symlinks and enforce asset-root containment (BT-11).
4. **Privacy operations:** make retention failures visible and alertable (BT-12).
5. **Transparency operations:** make gossip health durable and alertable (BT-13).
6. **Recovery:** perform a complete backup/restore exercise with separately provisioned KEK material.
7. **Release:** close the remaining first-pass assurance and operational findings before any real election deployment.

## Limitations

No repository checkout, local test execution, live HTTP test, fuzzing, production deployment review, filesystem-permission test, database restore, or independent cryptographic review was performed. The findings should be validated with targeted tests before assigning final severity or declaring remediation complete.

**Disposition:** This pass identifies three additional defensive weaknesses in deployment-boundary handling and operational visibility. It does not change the overall conclusion: the reviewed integration branch is not cleared for real elections.
