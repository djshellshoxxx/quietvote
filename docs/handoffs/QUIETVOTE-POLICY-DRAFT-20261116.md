# Unsigned policy drafting milestone — 2026-11-16

Base: `bf6c36df2bb8df6bd5b985a55a29ad4e2a1af912`, followed by the separate
decision-readiness handoff `d4f5d1b`. This lane changes no current election wire,
signature digest, authority rule, production database or vector expectation.

Implemented:

- Pure `groupPolicyTemplate` / `validateGroupPolicyDraft` in the protocol package.
  The separate `qv-group-policy-draft/1` format contains unsigned configuration,
  not GroupRules records. It exposes capped JSON-pointer errors, exact rational
  threshold checks, cross-field bounds, warnings and missing configuration.
- Actual offline CLI commands `qv policy-draft template` and `validate`, with
  bounded strict input, no existing-output overwrite, and explicit draft-only
  reports. No network, keys, signing or election mutation.
- Literal T1/T2 expansion validates. T3 preserves the source's 48h suggested voting
  duration versus inherited 72h minimum and exits 1 with a reviewable saved draft.
  Its effective ordinary review minimum is 168h despite the template's 24h global
  proposal value. No threshold was silently relaxed to make the template pass.
- A [versioned governance contract proposal](../rfcs/governance-v1-contract.md)
  defines concrete envelope, authority, binding, state and migration directions,
  with explicit unresolved conflicts. It is not an adopted wire specification.

Executed after the implementation and test corrections:

```sh
node --test --test-concurrency=1 packages/protocol/test/group-policy-draft.test.ts packages/cli/test/policy-draft-executable.test.ts
NODE_OPTIONS=--max-old-space-size=512 npm run typecheck
node scripts/check-links.mjs
git diff --check
```

Results: **58 passed, 0 failed/skipped**, including the real executable roundtrip,
duplicate/malformed/bounded input and no-overwrite paths; typecheck passed;
1,264 links across 233 files passed; diff check passed. The initial new test run
failed one assertion that expected an array-level path for an invalid ground;
the implementation correctly reported the element pointer. The assertion was
corrected and all checks above rerun. No existing tests or vectors were weakened.

Fresh reviewer should check:

1. Exact source-derived versus draft-profile bounds; T1/T2/T3 value fidelity.
2. No route or signature verifier accepts this format as authority; consumers must
   retain `scope: unsigned-policy-draft` and not mistake exit 0 for signed rules.
3. Rational comparisons at safe-integer extremes, cross-field interactions and
   canonical input handling; bounded regular-file/no-overwrite behavior.
4. The signed-governance RFC remains a proposal. In particular, template conflicts,
   genesis threshold, clock evidence, membership snapshot ordering and finality
   semantics are not resolved merely by the pure draft tool.

Remaining: signed GroupRules and templates with actual identities, proposal/review,
membership and challenge/dispute workflows still need their governed profile,
both independent verifiers, persistence/API/UI and end-to-end acceptance. This
milestone completes the bounded planning tool, not those missing core features.
