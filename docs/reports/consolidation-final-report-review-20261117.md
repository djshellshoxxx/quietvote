# Final report delta: independent source and evidence review

**No blocking report defect or required factual correction identified.** This is an independent AI review of the documentation delta. It supplies neither a formal approving review nor a waiver of the repository's remaining review, provenance or qualification gates.

## Exact binding

| Item | Value |
|---|---|
| Report commit | `e354d605a6c8e624f2e0fc72e53d91db6c94aa53` |
| Report tree | `c1ee3113fee79c76a294319b6f61c4cee1c39eea` |
| Parent | `4113625422e8e6b23dc7f9ed137cedcfb4b3a39f` |
| Worktree | `session-evidence/quietvote-report` |
| Delta | 18 files, all under `docs/reports/`; no production or test source changes |
| Worktree / diff check | Clean before and after; diff check passed |

No runtime suite, browser test or Windows test was rerun. No report/product edit, remote action or approval was performed.

## Historical evidence and canonical status preservation

Removing only the newly added `candidate_followups` from B1-08, B3-04 and B3-14 makes the entire 72-row finding JSON exactly equal to the parent. All identifiers, historical severities/confirmation records, current canonical statuses, evidence and limitations are retained. The candidate fields describe M7, W15 and revote-copy repairs as unmerged and preserve the unresolved portions.

The separate KNOWN review retains all 33 original IDs, ordering, row fields, overlap labels and top-level metadata. Removing only `candidate_resolution` from P10, P11 and BC-02/04 makes it equal to the branch-inventory source artifact. The independent source owner checked that comparison at this report commit and recorded it in `analysis/branch_inventory/final-report-known-composition-review.json`. Canonical counts remain **24 fixed / 5 partial / 2 reproducible / 2 unverified**. Neither matrix is presented as 72 fresh reproductions, 33 additional independent vulnerabilities, or a set of newly proven security closures.

**The older `docs/reports/consolidation-validation-20261117.json` is byte-identical to the parent**, with Git blob **`d90c6bf441129014106f65f8ee92b66cb3038d52`** on both sides. The new evidence is stored separately in `consolidation-current-validation-20261117.json`; the filename collision has not contaminated the historical receipt.

## Source and test bindings

For all seven published candidates #60–66, I read their Git objects and confirmed that the published tree equals the recorded locally tested tree, the parent and changed-file set match the receipt, and an author-matching DCO trailer is present. These checks do not attest on the historical #58 author's behalf.

The initial combined commit **`6f7d4daddc667bf0b1b4cd0dc1099c0813599968`** reads tree **`9fe4efb1753f9ffbbe94aa8379663654aa722a15`**. Final combined commit **`cf53e694483ccb45466b19f27cf8c642800b6c85`** reads tree **`316c490b46a2062556360c3c0201f1a1c6ae105c`**. Their entire file delta is:

- `packages/web/test/app-precompile.test.ts`
- `packages/web/test/no-bearer.test.ts`

Public-input replay commit **`1733e8bf3aaf1860b0c9f2680300310a70e3e2fd`** reads the same final tree directly from Git. The report correctly describes this as source reproducibility without a test rerun or a second remote integration branch.

The full Python 232, TS vectors 423, Python vectors 285, strict comparison 27 and production build **200,345 gzip bytes** stay attributed to the initial composition. Final root typecheck, i18n and web **338/338** stay attributed to the final composition. The report explicitly transfers production-build identity through unchanged production/build source, rather than inventing a final-head build execution. Individual CLI 115 and protocol 377 suites remain attached to their repair commits. The failed **337/338** ASCII app-test run and earlier environment/process failures remain visible.

I verified **37 embedded log-hash record references** against available session files, with zero hash mismatches; byte counts in the 25 structured `evidence_id` records also match. These are evidence-integrity checks, not fresh executions or necessarily 37 unique logs. Empty successful logs remain attributed to the recorded process exits.

Copied combined, P11, original PR59, W15 and Windows review texts match this lane's source artifacts after path sanitization and the appended publication notes. P10 additionally has an accurate published-PR link and unmerged/local-source qualification.

## Snapshot and approval limits

Recomputed snapshot structure confirms **68 branches, 66 PRs, 12 open, eight merged and 46 closed unmerged**. The original 60 branch heads are all unchanged, with eight additions and zero removals. All twelve open PRs have zero formal review submissions; #57 alone is ready for review.

For the stored **09:01:17 UTC** checkpoint, the 27 PR60 jobs total **11 successful, three failed, two running and 11 queued**. This agrees with the main report, JSON and snapshot prose. The three Windows failures are not hidden by the unfinished run-level status. PR66's 27 queued jobs do not supply a Windows pass. The twelve recovery failures remain unresolved, and the native/non-native canonical-path explanation remains explicitly hypothetical.

The snapshot correctly identifies **`4113625422e8e6b23dc7f9ed137cedcfb4b3a39f`** as the earlier observed #59 head and explains that it precedes final report publication. It makes no future-head or future-CI claim.

Written review policy is represented faithfully: QV-30 §9.2 names main's minimum; §10 and REQ-018 require two approvals including a security reviewer for crypto/protocol/vector and listed sensitive changes; §1 and §13 retain second-person/CODEOWNER requirements. The report preserves the integration-policy ambiguity and does not invent a docs-only waiver. `CONTRIBUTING.md` still leaves #58's original author DCO unresolved. AI review, owner design approval, technical mergeability and green tests remain separate from formal approval.

## Handoff and documentation checks

The core handoff identifies accepted ADR-027/029 decisions separately from missing runtime work. I read its proposals and spot-checked the canonical route/body limits, configured voter limits, registration/publication paths, migration versions and checksum rules against source. D-99 full-list input, rollback floors, export acknowledgement and authenticated freshness are not claimed implemented. Suggested fields, endpoints and acceptance criteria remain implementation work.

I read root's documentation-check logs: **1,553 links in 293 files, none broken**; **zero claims findings across 272 files and 45 rules**. The traceability log preserves partial/unimplemented states and **166/530** in-scope Must requirements with coverage links; structural success is not portrayed as full conformance. These checks were not rerun by this reviewer.

## Limits and disposition

No report correction is required by this review. Runtime defects, unfinished Windows/platform qualification, zero formal approvals, missing #58 DCO and main integration remain open exactly as stated. This review did not repeat all historical mechanisms or establish independent production/election qualification. All remote-status conclusions are limited to the stored snapshot timestamp.

Machine-readable binding, component identities, log-integrity counts and gate limitations: `analysis/crypto_review/final-report-review.json`. Supporting comparisons: `final-report-structural-checks.json`, `final-report-evidence-checks.json`, and `final-report-snapshot-log-checks.json` in the same analysis directory.

## Publication note

This review is bound to the exact 18-file report delta above. The later publication follow-up adds this review receipt and its structured companion, plus a link from the current reconciliation; it does not change the reviewed product findings, test results or source inputs. Session-evidence identifiers refer to intermediate execution records outside this repository. Formal review requirements remain unsatisfied.
