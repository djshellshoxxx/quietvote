# Integration source review — 2026-11-09

No blocking findings were identified in the two narrow repairs below. This is
AI-assisted peer review and does not satisfy independent security/code-owner
approval. It does not qualify the whole integration branch or change any
remaining protocol, browser, assistive-technology or release gate.

## Source identity

| Repair | Reviewed implementation commit | Local integration commit | Production source blob |
|---|---|---|---|
| SSE reservation cleanup | `535875b66c30960a85d3f6cff0e0e35e047425d8` | `67c129eff8a2caebb994479c7671dff5637f6096` | `packages/server/src/sse.ts`: `0db2dede38e1e8c25a28d72f921f1dbbc7397130` |
| Spoil upload recovery and route lifetime | `d8e6c119f28221777de8fe538532fe9ae70c4d5c` | `cc7a8f241d1ec78462d109e598830583bcab56c2` | `packages/web/src/ui/spoil-shares.ts`: `2edd8d0be93fca24bd7d50c3b11ea8e333087351` |

The production blob IDs match across the reviewed and integration commits.
The review also read each new regression test and package NOTES change.
Published commit IDs may differ when preserving the source through a connector;
the final publication receipt must verify the published source/tree independently.

## Server finding disposition

The original SSE path reserved a global/per-client stream slot and incremented
`rt.inUse` before attaching response listeners. A peer that disconnected while
its election loaded could emit `close` before those listeners existed, leaving
the reservation and runtime pinned.

The new guard in `SseHub.attach` checks `res.destroyed || res.writableEnded`, calls
the existing release callback once and returns an inert close callback before
creating a timer or subscription. There is no new await between that check and
listener attachment. The normal open-stream close path retains its existing
idempotence guard. No new blocking or nonblocking defect was found in this diff.

The reviewer independently ran:

```sh
node --test --test-reporter=spec packages/server/test/sse-lifecycle.test.ts
```

Result: **1 passed, 0 failed, 0 skipped**. The test uses an actual HTTP disconnect,
asserts the active count/runtime reference/subscription count return to zero,
and opens another client with a one-stream limit to prove slot reuse.

## Web finding disposition

The repaired panel catches rejected `File.text()` reads and shows its existing
unreadable-file message. It checks route lifetime after the asynchronous file
read and before submission, and guards result announcements against stale views.
The upload form starts hidden and its availability is recalculated after every
refresh, so a successful retry after an initial roll-fetch failure reveals it.
The shell's shared announcer receives the visible panel errors/results without
a second status/alert region in the panel.

No cryptographic verification function, registration behavior, share POST body,
CSP, locale review state or dependency changed. An already-started multi-record
submission is not cancelled by navigation; the package note explicitly retains
that limit. This repair does not promise cancellation of in-flight requests.
No new blocking or nonblocking defect was found in this diff.

The reviewer independently ran:

```sh
node --test --test-reporter=spec packages/web/test/spoil-shares-ui.test.ts
```

Result: **5 passed, 0 failed, 0 skipped**, covering failed-file retry, navigation
during a file read, late read failure, form recovery and shared announcements.
The test uses a small synthetic DOM, real signed public protocol fixtures and
a fake HTTP transport. It is behavioral unit evidence, not browser or
assistive-technology acceptance.

## Limits and retained blockers

The implementation workers reported broader server/web and typecheck runs; the
integrator records those separately. This reviewer independently executed only
the six focused tests above, plus source and blob-identity inspection. The local
browser launch problem and hosted final-head CI are separate evidence streams;
no old workflow success is assigned to these new commits.

[The upstream branch review](branch-disposition-20261109.md) preserves ancestry,
exact-head baseline CI and outstanding upstream gates. In particular, no reviewed
repair here resolves B3-01, P1/TSV-04/TSV-05, strict TS/Python report differences,
full import CPU isolation, external crypto/security review, native translation
review or assistive-technology qualification.
