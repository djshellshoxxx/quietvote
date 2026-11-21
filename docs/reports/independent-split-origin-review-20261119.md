# Independent split-origin continuation review — November 19, 2026

Date uses America/Los_Angeles. Reviewed source:
`8f865fb3cf9c5d203e532abb19848cd46050db9a`, tree
`5da32edc203087e96a81e1f0b6ae311758b19fa2`.
This is a fresh worker's bounded source review and executed deterministic
application tests. It is not native browser qualification or formal security
approval.

## Result

No new blocking defect was established in the reviewed form transition, route
lifetime and scoped key/receipt paths. All **41** selected application and
navigation tests passed, with **0 failed, cancelled or skipped**. No production
code, browser assertion, timeout, CSP or protocol behavior was changed.

The earlier hosted voter-list timeout has not been assigned a cause by this
review. The [form-transition handoff](split-origin-form-transition-20261120.md)
correctly calls the old-form selection race a hypothesis. Only actual execution
of the current production journey can show whether waiting for the old input to
detach resolves that timeout.

## Source review

- `packages/web/e2e/split-origin.ts` captures the existing passphrase element
  before the invitation is removed. Waiting for that specific element's
  `isConnected` value to become false establishes retirement of the old form;
  waiting only for an `Unlock key` label would not distinguish the two forms.
  The new form's passphrase and action locators still have to resolve normally.
- `packages/web/src/ui/app.ts` retires the old form synchronously when routing,
  invalidates its asynchronous actions, and clears its password input. A
  `hashchange` following `popstate` for the same current URL does not replace the
  new form again. A genuinely different URL still starts a new route.
- The selected actual-application tests exercise delayed draft reads, stale
  route completions, paired and queued navigation events, correct membership
  after unlocking, actual simulated casting, and the same election ID on
  different selected boards. They preserve board-scoped key and receipt state.
- Failure-only native diagnostics contain booleans, element counts and `/roll`
  HTTP statuses. They do not print fragments, invitation/read tokens, raw keys,
  request bodies, response bodies or full request URLs.

## Executed checks

Environment: Linux, Node `24.22.3`, npm `11.19.1`; pinned repository dependencies.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run vendor:install
node --test packages/web/test/live-draft-refresh-ui.test.ts \
  packages/web/test/split-origin-ui.test.ts \
  packages/web/test/session-storage-ui.test.ts \
  packages/web/test/navigation.test.ts
```

Installation passed. Vendoring verified **2 pinned packages / 132 verbatim
files**. The test command exited **0**, with **41 passed** in **24.716 seconds**.
This includes the existing real `startApp` behavior under its deterministic
DOM/network adapter, not browser layout, native IndexedDB or native HTTP/CORS
execution.

## Native execution limit

The unchanged required command was attempted:

```sh
QV_REQUIRE_BROWSER=1 QV_CHROMIUM=/usr/bin/chromium \
  node packages/web/e2e/split-origin.ts
```

Chromium `156.0.8078.79` failed during launch because its local process socket was
denied: `socket() failed: Operation not permitted (1)`. The command exited **1**;
**no production-browser assertion ran**. A request to run the exact command with
the supported command escalation mechanism was rejected by the configured
granular approval policy (`sandbox_approval: false`). No alternative bypass,
modified browser flags, relaxed sandbox rule or assertion skip was used.

The ordinary browser journey uses the same launch path, so it was not repeated
after that explicit environmental refusal. Native qualification must come from
an authorized runner. At this review's observed point, current-head browser job
`136096515552` in [run 44678662762](https://github.com/djshellshoxxx/quietvote/actions/runs/44678662762)
was queued, not passed. Consult that exact head's completed result separately;
earlier hosted results do not qualify this source.

## Successor handoff

If the current native journey still fails, use its finite diagnostic output to
distinguish form routing from roll retrieval before changing production code.
Keep the same-document transition, exact membership assertion, original timeout,
board/read-key scoping and subsequent cast/receipt checks. The broader native
and formal promotion gates remain those in
[the consolidation continuation](../audits/CONTINUATION.md).
