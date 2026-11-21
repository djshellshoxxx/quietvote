# Browser bug-hunt continuation — round 1

Date: 2026-11-19. This is an implementation and test receipt, not a formal
security approval or production qualification.

## Source and scope

- Baseline: `3f0ea6549e2fdf7ffa462de3a4978cd369655458`, the current published
  source of [PR #71](https://github.com/djshellshoxxx/quietvote/pull/71) when this
  worker started.
- Repair: `524f2e5fa2b1e8f2a3f06e0419610c27fb663da0`.
- Production scope: `packages/web/src/ui/app.ts` only. The regression additions
  are in `session-storage-ui.test.ts` and `split-origin-ui.test.ts`.
- Every production browser journey, its timeout and its assertions remain
  unchanged. Build limits, cryptographic dependencies and server policy are
  unchanged.

The [baseline browser job](https://github.com/djshellshoxxx/quietvote/actions/runs/44534548481/job/135596405200)
passed seven journeys and failed two. `device-settings.ts:355` timed out waiting
for the page-session-cleared confirmation. `split-origin.ts:105` timed out waiting
for the voter-list confirmation after same-document enrollment navigation.

## Confirmed defects and repairs

### Invalidated enrollment controls remained actionable during navigation

`route()` invalidated the prior view's handlers before awaiting election reads,
but left that view's inputs and buttons in the document. An immediate passphrase
entry or Unlock action could therefore target controls whose callback already
refused to run. The held-response regression starts from the actual enrollment
view, removes the invitation, emits both navigation events and checks the old
control before allowing the new metadata reads to finish. The baseline retained
one old Unlock button; the required count was zero.

The route now retires its controls synchronously, shows the existing translated
Loading message, and clears the old repaint callback. The final view still uses
the existing route-epoch, storage-generation and signed-context checks. The
regression then releases the reads and successfully unlocks the same scoped key
and confirms membership without another registration request.

### Successful clearing had no lasting visible confirmation

The successful-clear result existed only in the shared screen-reader announcer.
The new route could replace it with a live-connection failure announcement. The
two distinguishing tests use actual application clearing with a failed events
response, once with durable storage and once with explicitly selected memory
storage. Both baseline cases cleared their intended data but failed the visible
confirmation assertion.

After successful storage clearing, the app now carries the exact existing
confirmation text into the next rendered view and focuses that paragraph. This
provides a visible and focus-readable result independent of connection messages,
without adding a live region or duplicating the confirmation in the document.
The session case preserves inaccessible durable data. A separate cancellation
and failed-clear control proves that neither path reports success or removes
the saved key.

## Executed verification

| Check | Observed result |
| --- | --- |
| Three new distinguishing cases on unchanged baseline production source | 0 passed, 3 expected assertion failures; no skips or cancellations; 92.515 seconds |
| Same three cases after the production repair | 3/3 passed; no skips or cancellations; 64.092 seconds |
| Final seven-file affected batch, including cancellation/refusal and focus controls | 43/43 passed; zero failures, skips or cancellations; 210.568 seconds; exit 0 |
| `git diff --check` | Passed |
| Offline clean dependency installation and `npm run vendor:install` | Passed; two pinned packages, 132 verbatim files |
| Scoped i18n check | Exit 137, `Killed`, without a source diagnostic; not a pass |
| Root TypeScript check | Exit 137, `Killed`, without a TypeScript diagnostic; not a pass |
| Local Chromium startup | Failed before any browser assertion: `socket() failed: Operation not permitted (1)`; no native-browser result |

The final batch ran on Node 24.22.3 with `--max-old-space-size=384 --test
--test-concurrency=1 --test-reporter=spec`, using these files:

- `packages/web/test/session-storage-ui.test.ts`
- `packages/web/test/split-origin-ui.test.ts`
- `packages/web/test/live-draft-refresh-ui.test.ts`
- `packages/web/test/device-settings-ui.test.ts`
- `packages/web/test/live-lifecycle.test.ts`
- `packages/web/test/live-status.test.ts`
- `packages/web/test/storage-session.test.ts`

The before/after batches overlap and are not a unique-test total. The actual-app
tests use the repository's deterministic DOM/task adapters; they do not qualify
browser layout, IndexedDB, native navigation scheduling or assistive technology.
The native launch failure was not retried with weakened isolation. No hosted
rerun or remote mutation was performed by this worker.

## Handoff to a fresh worker

1. Review the three-file repair and its source-bound tests independently. Check
   that delayed work cannot regain retired controls, and that confirmation focus
   does not introduce a duplicate live region or success on a refused clear.
2. After integration, execute the unchanged required browser runner on the exact
   published candidate. Both `device-settings` and `split-origin` must pass, along
   with the other seven journeys. The app regressions above do not by themselves
   establish that the hosted failures are cleared.
3. Complete the existing TypeScript, i18n and production-build gates on that
   source. This worker's killed attempts supply no qualification for those gates.
4. Continue app/session bug hunting from the integrated source, retaining the
   same-document navigation, read-key isolation, explicit backup, signed-log
   binding and uncertain-delivery contracts. Unadopted protocol or governance
   policies remain outside this repair.

The source and this receipt carry author-matching DCO trailers. This work does
not supply formal CODEOWNER/security approval, historical author attestations,
main promotion, deployment or release authorization.
