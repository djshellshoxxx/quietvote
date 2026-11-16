# Private recovery floor milestone — 2026-11-16

Base: PR #51, `5566c88c5e42d57fc1e50e2539d91aba16f2a30f`.

Independent agent review reproduced restoration of a revoked organization key
from an older snapshot against a newer minimum backup with identical public
Merkle history. The restored key was active. Public-tree/deletion checks alone
did not cover private security state.

`backup-security-floor.ts` captures private control and invitation state only
from disposable verified copies. Offline restore rejects lost/rebound keys,
credential or organization reactivation, disabled/deleted webhook resurrection,
loss of deletion evidence, live request replay/idempotency rollback, reopened
closed invitations, and resurrection of erased invitation data. Public reports
remain unchanged and contain no private comparison rows. Expired request records
may be pruned. Candidate state is never silently merged or repaired.

Validation: four integration tests pass in
`packages/server/test/backup-security-floor.test.ts`; root typecheck passes with
`NODE_OPTIONS=--max-old-space-size=512`. Tests use real backups/restores and
independently resealed database mutations, assert unchanged public trees in the
credential reproduction, no refused destination creation, permitted forward
progress/expiry and private canary exclusion from JSON reports.

Fresh reviewer: inspect monotonic transition comparisons, data exposure, clock
expiry boundary, restore copy provenance, and interactions with the new durable
webhook bridge. These checks are deliberately conservative and do not resolve
registration/authority policy. Public `verifyBackup(..., minimumReport)` retains
its public-history-only API; full private-floor assurance belongs to `restore`
with both full snapshots. Independent witness/WAL activation, offsite custody,
global snapshot atomicity and platform qualification remain separate work.
