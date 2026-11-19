# Cooperative verification in the application

The `/verify` route now uses the same accepted cooperative verification hook as
the standalone page. It displays current-stage progress, supports cancellation
and retry, and stops its active verification when the file, election pin, signing
keys, route or page lifetime changes. A cancelled or obsolete run cannot publish
a verdict or replace a newer report. Progress is explicitly separate from results.

This completes the missing SPA connection identified by B3-26. JSON parsing and
individual cryptographic operations remain synchronous; this change does not
claim worker execution, resumable verification or a measured large-election
latency bound. The CSP and verifier acceptance rules are unchanged. The additional
catalog entries keep every draft translation unreviewed and unoffered.

## Evidence

- Three regressions execute the real application and shared verifier using a
  deterministic DOM/task harness: cancel/retry during ballot work; replacement
  during a pending read; navigation and page exit. They pass on this change.
- The existing six standalone verifier regressions pass.
- Production build passes: 197.6 kB aggregate JavaScript gzip, 97.8 kB entry gzip,
  within the existing 200 KiB/110 KiB budgets. These are measured values for this
  change, not a promise about later combinations.
- The production browser journey adds SPA cancellation, retry and navigation
  assertions. Local Chromium cannot start because its process-singleton socket
  receives `EPERM`; exact-candidate hosted CI must execute this journey.

The final combined source and hosted results are recorded in
[`../audits/FINAL_VERIFICATION.md`](../audits/FINAL_VERIFICATION.md).

## Independent review follow-up

The separate surface review found that the shared live-region announcer schedules
its text 30 ms later. Visible report guards therefore did not prevent an obsolete
announcement after navigation, page exit, input changes or a subsequent run.
Every verifier announcement now captures its route and run generation, and the
announcer checks that predicate at emission time, including running, cancellation
and failure messages.

The reviewer supplied 13 distinguishing regressions that fail against `21f5c90`,
plus two positive controls confirming that current PASS/FAIL reports are still
announced. All 15 now pass, together with the three existing SPA lifecycle tests
(18/18). The web package TypeScript check also passes. This qualifies the actual
application/live-region harness; real assistive-technology review remains separate.
