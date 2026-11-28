# Instance-admin and organization authority boundary

Date: 2026-11-27 (America/Vancouver). Base: `5ae96e927b2fa63bfe6ec6fe9004efa1bad8fcf7` (PR #75).
Scope: accepted [server inventory task 2](inventory-20261111/server.tasks.md).
This report records a bounded authorization correction, without adopting a new
protocol or export-verification contract.

## Requirement and plan

[QV-12 §5 and QV-12-REQ-003](../12-operations-administration.md) separate host
administration from organization authority and explicitly forbid an operator
override for organization administrators. The accepted task retains admin reads,
confirmed election deletion, import and `/admin/*` operations.

1. Trace every caller of `orgOf` and `orgElection`, including recorded exports and
   key-management routes. Treat organization membership as the default.
2. Add local HTTP authorization-contract tests using fresh synthetic organizations
   and valid request bodies; bind their baseline failures to unchanged source.
3. Make the retained admin exceptions explicit at each route. Refuse organization
   key grants and revocations so those routes cannot confer an alternate authority.
4. Run the same tests after the fix, plus existing authorization and recorded-export
   suites; check actual admin backup, deletion, job reads and QVB import.

## Route decisions

Paths below are relative to `/api/v1`.

| Operation | Required organization authority / retained admin behavior |
|---|---|
| `POST /orgs/:org/keys`, `DELETE /orgs/:org/keys/:keyid` | Same-organization owner. An instance-admin key cannot grant or revoke either organization role. |
| `POST /orgs/:org/elections` | Same-organization owner or organizer. |
| `PUT /elections/:id/draft`, `PUT /elections/:id/pinned-roll` | Same-organization owner or organizer. |
| `POST /elections/:id/invites`, `DELETE /elections/:id/invites/:invite` | Same-organization owner or organizer. |
| Webhook create/delete | Same-organization owner. Existing owner-only restriction on organizers remains. |
| Recorded-export create, acknowledgement and deletion notice | Same-organization owner or organizer. These mutate persistent organization records; the accepted task gives them no operator exception. |
| Organization/key/election lists, invite and registration-migration reads | Existing admin read access retained through an explicit `read` allowance. |
| Webhook reads | Existing owner or instance-admin access retained explicitly; organizers remain refused. |
| Recorded-export list/metadata/download | Existing admin read access retained explicitly, with the existing artifact integrity and expiry checks. |
| `DELETE /elections/:id` | Existing organization-owner or admin permission retained through an explicit `delete` allowance. Title confirmation and lifecycle/export requirements still apply. |
| `/imports`, `/jobs/:job`, `/admin/*` | Existing independent authorization retained, including explicit destination organization on an admin import and creator/admin job visibility. |

The implementation does not infer authorization from an HTTP verb. A `DELETE`
for an organization key, invite or webhook therefore receives no election-delete
exception. Public/link reads still use their existing access policy. Entry
admission still authenticates the original organization/coordinator/trustee/voter
signatures; an HTTP administration key supplies none of those authorities.

`POST /orgs` remains the existing self-authenticated new-organization registration
flow. Its registered-key uniqueness check remains in place. Existing stored key
roles are preserved; this correction does not retroactively identify or revoke
historical grants.

## Source binding and distinguishing evidence

Baseline source blobs:

| File | Git blob |
|---|---|
| `packages/server/src/app.ts` | `e44b9e341b64dfcb96770e5be23bb8edb7c2e72a` |
| `packages/server/src/ext-routes.ts` | `27d6c80eff5a200394c7d4cc8b3c5708ad61b2aa` |
| `packages/server/src/export-routes.ts` | `ddb0f7becdee012e416eb682c4c8946a13f444ce` |

The new [HTTP regression test](../../packages/server/test/admin-org-boundary.test.ts)
has blob `590c7df24118cd5b49f045f6da7b2f84ad8ce89f`. The exact same test source
was run before and after changing production source. On the baseline, all 13
denial cases received success responses. The four retained-behavior cases passed.
The runner counted 18 tests: 4 passed and 14 failed, including the parent test for
the three denied recorded-export mutations. After the fix, all 18 passed with
zero skips. Each denied mutation also checks that the relevant organization,
election, invitation, voter, webhook, export and job state is unchanged. The
corresponding owner operations still succeed.

Tests use isolated local HTTP servers and temporary databases. The webhook
resolver and transport are injected fixtures; no remote endpoint is exercised.
An actual public QVB is imported through the existing HTTP upload and background
verification path into a separate local server. That acceptance proves retained
admin import authorization, not a new integrity/finality claim about exports.

## Verification

| Check | Local result |
|---|---|
| New admin/org boundary tests | 18 passed, 0 skipped |
| Existing admin, audit and recorded-export suites | 27 passed, 0 skipped |
| Repository TypeScript check | Passed |
| Vendored dependency integrity | 2 pinned packages, 132 files passed |

```sh
node --test packages/server/test/admin-org-boundary.test.ts
node --test packages/server/test/admin.test.ts packages/server/test/audit.test.ts packages/server/test/recorded-exports.test.ts
npm run typecheck
git diff --check
```

The existing suites cover foreign-organization refusal, owner-only operations,
admin status/backup/self-audit/quarantine/delete jobs, and recorded-export
acknowledgement, notice, retention, recovery and deletion conditions. Native CI
and independent source review remain separate gates from the local results.
