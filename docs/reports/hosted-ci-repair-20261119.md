# Hosted CI integration repair

This change repairs the three server test failures from PR #71's Linux Node 24 job on published head `ddf58d6168e2b8bc5069689400538be8e9b85180`. The repair is based on local consolidation commit `32deb381fb9e4bd19776e603663611e7f940834e`, which also contains the subsequent organizer timezone and separate-origin work.

## Hosted evidence and causes

[Run 44493061333, job 135453303940](https://github.com/djshellshoxxx/quietvote/actions/runs/44493061333/job/135453303940) failed its workspace test step at 10:06:30 UTC on 19 November 2026. The server reported 349 tests: 345 passed, three failed, and one existing platform-specific skip. The web workspace passed all 379 tests.

- The admin status test still expected control schema 7. The accepted independent runtime-anchor migration correctly reports schema 8.
- Startup response recovery opened both untouched empty draft elections in the create-crash fixture. The new anchor recovery condition treated every missing anchor as unfinished append recovery, including a zero-entry draft with no append completion. That contradicted the existing response-only recovery guarantee and unnecessarily opened keys and runtime state.
- The deletion diagnostic test supplied only a partial control-database stub. Authoritative deletion now opens and replays the election before checking its runtime health, log state and export conditions. The stub lacked the configuration and storage needed for this operation and failed before reaching the expected state-conflict error.

## Repair and preserved guards

Startup still reconciles durable response receipts and public export jobs. It opens an owned election for explicit append completions, a missing anchor on a nonempty log, or a stored size that differs from an existing anchor. An untouched empty draft with no anchor stays lazy. Its first runtime acquisition still performs the complete independent-anchor and configured-peer checks before signing or deletion can succeed.

The distinction is deliberate: an empty log behind an existing newer anchor must still open during startup and quarantine. A reopened empty draft with configured peers also remains unable to sign or delete when it has no signed checkpoint for the existing gossip acquisition contract. This repair does not mark such a draft as freshly created, fabricate checkpoint evidence, or remove the runtime health guard.

The admin test now expects schema 8. The deletion diagnostic uses a real World server, advances the election to CEREMONY, evicts its runtime, and tests the actual replay and refusal path. It retains the exact status, code and permitted-state diagnostic assertions, then checks that the election registration, wrapped key, database file and log remain intact with no pending cleanup.

Four additional startup regressions cover empty drafts with and without configured peers, nonempty missing-anchor recovery, and an empty rollback behind a retained newer floor. They test successful resumed signing when allowed and explicit signing/deletion refusal when required. The original create-crash assertion of zero open runtimes remains unchanged.

## Validation checkpoint

All commands ran on local Linux with Node 24.22.3. Dependencies were installed at the existing lockfile versions; `npm run vendor:install` validated and installed both pinned crypto packages and all 132 verbatim files. An initial offline installation lacked one cache entry; ordinary `npm ci --ignore-scripts` completed without changing the lockfile.

Before the repair, the three affected test files, including the four new regressions, reported **22 tests: 17 passed and five failed**. The failures were the three hosted cases and the two new empty-draft lazy-recovery cases. The nonempty recovery and retained-floor rejection cases already passed.

After the repair, the same complete test files reported **22 passed, zero failed, zero skipped and zero cancelled**:

```sh
node --test --test-concurrency=1 --test-reporter=spec \
  packages/server/test/admin.test.ts \
  packages/server/test/operation-response-recovery.test.ts \
  packages/server/test/pool-delete-diagnostic.test.ts
```

`git diff --check` passed before this report was added. The broader adjacent anchor, deletion, export and supplemental-recovery test command was interrupted at the integration owner's request after workspace transport stalls returned; it is not claimed as a completed validation. The integration owner will resume remaining checks on the combined candidate. No full local typecheck retry, test skip, timeout increase, workflow change, old-run retry, release or deployment is part of this repair. Hosted results from the earlier head do not qualify this new source; the final published head requires its own CI.

The complete hosted log and local red/green outputs are retained with the integration evidence as `pr71-server-web-node24-linux-job-135453303940.log`, `hosted-repair-red.log` and `hosted-repair-green.log`.
