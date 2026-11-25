# Final integration checks — round 5

Date: November 19, 2026 (America/Los_Angeles).

## Exact source

The reviewed candidate is `f81d372b63f2b35f3acb48fb5daf3aa2598c1eef`, with complete tree `fb4383d276104531ed4a22e1d7d92d97fdef074f`. Work ran in an isolated checkout. This round checked the integration boundaries and remaining repository gates; it made no production or test changes.

The diff from organization-review source `c9d59e3175bb876176de1a5edef76aadeed8fbd6` contains only documentation and the separately reviewed organization-boundaries test. Every production source file has identical bytes. The favicon and native diagnostic changes were already present before that organization checkpoint.

The following component comparisons also matched the recorded source blobs exactly:

| Component | Reviewed source retained in the final candidate |
| --- | --- |
| Export command module and shared request/key helper | `17a4a8c` |
| Organization command and main dispatcher | `c9d59e3` |
| Runtime pool and application router | `17a4a8c` |
| Both POSIX staging modules and trustee cleanup | `17a4a8c` |
| Both Windows private-file bridges | `434b2b5`; identical bridge blob `6e72bd8941939833354c3f73e24b30463bff5fc8` |
| Standalone verifier HTML builder | `ecf51d5` |

The two POSIX staging copies also remain byte-identical. All 14 local continuation commits reachable after published `8b7aa031` contain a literal author-matching sign-off. This is a trailer-text check of this local range, not an attestation to historical authors or a decision about the older missing trailers. Dependency manifests, the lockfile, compiler configuration, vendor bytes and workflow files match the published base.

## Observed gates

Available host memory was approximately 2.4 GiB before the attempt. The unchanged full-root gate was run once:

```sh
node --max-old-space-size=512 node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

It completed with **exit 0 and no compiler diagnostics** on Node **24.22.3**. The 512 MiB value limits the V8 heap, not total resident process memory. No compiler option, include pattern or assertion was changed. Earlier exit-137 attempts remain incomplete historical results; this successful run belongs to the exact candidate above.

| Gate | Result on the candidate |
| --- | --- |
| Full existing root TypeScript gate | Passed, exit 0, no diagnostics |
| Installed vendor verification | Passed: two pinned packages, 132 verbatim files |
| Dependency boundaries | No new violations; the existing two D-97 deviations and dynamic-import classification warning remain reported |
| Registry lockfile | Passed: 35 registry entries and eight workspace links |
| Relative links | Passed: 2,156 links across 350 files, none broken |
| Requirement traceability | Structural check passed; this checks links/identifiers, not requirement completion or test sufficiency |
| Public claims lint | Initial run reported one phrase in the native diagnostics report; the correction and final result follow below |

Claims lint flagged the original review wording in the native helper diagnostics report. This report-only correction says that the fresh worker performed a separate source review, retaining the explicit statement that it did not execute that scope. The lint rules, exemptions and workflow policy are unchanged. The final lint run, including this new report, passed with **zero findings across 330 files and 45 rules**, exit 0.

## Remaining boundaries and handoff

This round does not rerun complete unit suites, native Windows/macOS cases, the browser journeys or external cryptographic qualification. Those retain their own source-specific receipts and current-head hosted gates. In particular, prior-source hosted passes do not qualify a new publication merely because the integration check passed.

The stopped background-runtime investigation and its untracked test were not inspected, resumed or used. No remote branch, pull request, main, deployment or release was changed by this worker. The repository's appointed-reviewer, formal approval, native ACL and historical provenance boundaries remain explicit in the [continuation supplement](../audits/CONTINUATION_SUPPLEMENT_20261119.md).

A successor should confirm the published complete tree against this candidate plus subsequent report-only changes, inspect actual current-source hosted results, and reopen a code scope only for a concrete later delta or failure.
