# PR #71 — split-origin same-document key-form transition handoff

Date: 2026-11-20 (America/Los_Angeles). Exact reviewed starting head: `fc0e1fb9b2ea1dd564cecbfe07ecdb6b071cf92d`, complete tree `4b6b65965279210903463634074bdb8f27106a75`.

## Actual current-head evidence

At review, the new-head full matrix [44674877609](https://github.com/djshellshoxxx/quietvote/actions/runs/44674877609), claims [44674877536](https://github.com/djshellshoxxx/quietvote/actions/runs/44674877536) and visual [44674877499](https://github.com/djshellshoxxx/quietvote/actions/runs/44674877499) were all **queued**. None qualifies this change or the preceding POSIX fix. The preceding source's browser job [136054077407](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627729/job/136054077407) conclusively timed out after 30 seconds waiting for the exact voter-list message at split-origin.ts:105; it passed the enrollment journey beforehand. The log does not identify which view, error or roll response was present at the timeout.

## Focused source diagnosis and bounded correction

`packages/web/src/ui/app.ts` mounts an Unlock key button on the enrollment key form after the first successful import/registration. A subsequent fragment-only `page.goto` returns `null` for a same-document navigation. The `hashchange` handler retires the old form and installs the new manifest-backed form asynchronously. The existing browser journey immediately filled and clicked an Unlock key control that can refer to **either** form: Playwright waiting for a button label alone does not prove the navigation's view transition finished. This is a source-supported *race hypothesis*, not a proven root cause of the hosted failure.

The changed production browser test records the old passphrase input handle before the navigation and waits for that **specific** element to be detached before unlocking on the new view. If the app does not retire the form, the unchanged per-action default 30-second wait fails; there is no reload, skipped journey, added replay, changed CSP, loosened assertion, increased timeout or production-source change. The original exact voter-list assertion is retained.

If the assertion still fails, failure-only output now reports finite flags for the mounted view, error count, Unlock button count and HTTP statuses of `/roll` reads. It never prints fragment contents, invitation/read keys, request bodies or full URLs. These diagnostics distinguish routing from roll-fetch problems and provide evidence for a subsequent scoped correction. No test was executed against the changed QuietVote repository in this invocation: the attached container has no local checkout and cannot reach github.com over DNS. **This is an unqualified browser-test change until CI runs.**

## Separate-scope same-invocation reviews (not independent workers)

- **Code-audit scope:** examined `app.ts`'s `hashchange`, `route`, `keyView` and `load` paths, plus the split-origin E2E's actual transition and waits. The old and new key forms share the same button label; waiting for a specific retired element directly establishes the intended boundary. No core source is changed.
- **Ordinary bug-hunt scope:** checked the [previous failing job log](https://github.com/djshellshoxxx/quietvote/actions/runs/44665627729/job/136054077407) and `World.registerVoters(1)` setup. The preceding 30-second timeout establishes only that the message did not appear; it cannot show a roll/root mismatch or prove a UI race. The next hosted run must resolve this.
- **Defensive security scope:** reviewed the unchanged `ApiClient.req` credential/request policies and the new failure-only finite diagnostic values. No fragment, token, raw key, response body or credential-bearing request URL is logged; native permissions, timeouts, SSRF and replay restrictions are untouched.

These are source-bound reviews by one execution, **not** three independent fresh-worker attestations. Separate worker process support and local repository execution were unavailable. Do not count this as the project's appointed security-reviewer approval.

## Handoff to next fresh code, bug and defensive-security workers

1. Read this document and the exact new tree, inspect current-head matrix, especially browser [job 136084226753](https://github.com/djshellshoxxx/quietvote/actions/runs/44674877609/job/136084226753) and macOS trustee Node 24 [job 136084226855](https://github.com/djshellshoxxx/quietvote/actions/runs/44674877609/job/136084226855), without assigning old results to the changed test.
2. **Code reviewer:** verify that Playwright's element-handle wait cannot silently accept a stale form and that source IDs/contexts are preserved.
3. **Functional reviewer:** execute the mandatory split-origin E2E on the new source. If it still fails, use the finite diagnostics and a separately reproduced case to identify the actual application issue. Do not disable the journey or increase its timeout.
4. **Defensive security reviewer:** verify the added log fields remain finite and nonsecret, and inspect unchanged fragment/read-key isolation and no-operation-replay rules. Do not pursue the previously automatically stopped background-runtime/gossip investigation or its untracked test.
5. Reconcile macOS cleanup outcome (old expected true failure) on its new source; native ACL grants beyond mode/sticky bits remain an open distinct policy boundary.

The active accepted-feature ledger is [UNFINISHED_WORK](../audits/UNFINISHED_WORK.md). Organization enrollment and recorded-export CLI already exist. Governance/ratification, group membership, challenge/finality, signed freshness, crypto-provider and ACL contract decisions are not adopted by this test change. Main promotion still requires two formal sensitive-change approvals including the appointed reviewer and resolution of historical DCO provenance. No main merge, release, deployment or original-branch deletion occurs.
