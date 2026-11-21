# Retention sweep monitoring

The sweep retains its existing retry policy and purge deadline (QV-28 §11.1).
Each sweep now writes an operator-audit `retention.sweep` record with only
`checked`, `failed`, `purged`, and `complete` fields and no election identifier,
personal fields, or exception text. Missing databases are reported as failures
and are not recreated. Corrupt or unavailable databases do not stop other elections.

A failed sweep emits `retention_sweep` with `RETENTION_SWEEP_FAILED` through the
existing privacy-filtered logger. Alert on recurring failures in the collected
logs. `server.retention.status` exposes the last success/failure times,
consecutive failures, and last sweep database counts for an embedding operator;
these counters reset at process restart. Audit records survive restart. A
successful sweep resets the consecutive-failure count.

Concurrent callers share one sweep. Server shutdown awaits an active sweep before
closing the control database. Monitoring failure does not prove that personal
data was erased: investigate the affected storage locally, restore access and
run the sweep again. No public health endpoint exposes these administrative
statistics. Automatic alert routing is an operator responsibility.

Regression coverage: `test/retention-health.test.ts` (missing/corrupt databases,
recovery, privacy of logs/audit, top-level failure, concurrent callers and shutdown)
and the existing retention deadline/purge tests in `test/b2-fixes.test.ts`.
