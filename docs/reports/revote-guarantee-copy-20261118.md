# B3-14: conditional revote guarantee copy

Base: `754c586aa65735d50514b543a62a5e3c96a4d138` (the W15 branch, PR #60).
This focused change depends on that branch's app-module UTF-8 budget fix.

## Implemented scope

[QV-ADR-027](../decision-log.md) approves the conditional guarantee requested by
[B3-14](../plan/DECISIONS-2026-11-04.md#b3-14--one-ballot-elections-vs-unconditional-qvprivacyg4-revote-guarantee).
The existing `qv.privacy.g4` now makes voting again conditional on the election
allowing it. `qv.privacy.nc3` says voting again **may help**, only when allowed and
while voting remains open. It no longer describes revoting as protection the
system promises to provide.

This implementation uses conditional wording in the existing keys. The existing
ballot panel still selects the explicit `qv.ballot.oneBallot` or
`qv.ballot.revoteNote` from the signed manifest's `max_per_voter`. There is no new
runtime branch, key, voting policy, or quota behavior.

The English source, five existing draft catalogs, generated
[COPY.md](../../packages/web/COPY.md), and the
[QV-10 copy table](../10-user-experience.md) agree. All non-English native-review
maps remain empty. Those catalogs remain unavailable to voters until qualified
native review; updating their draft text does not approve them.

## Verification

On Node 24.22.1:

- `UPDATE_COPY=1 node --test --test-reporter=spec test/copy.test.ts` regenerated
  the copy inventory: 2/2 passed.
- The serial `copy`, `ui-logic`, `i18n-catalogs`, `audit3`, and `lazy` test files
  passed 37/37, with no failures or skips. These cover catalog/ICU parity,
  sentence rules, locale review gating, the existing final revote refusal, and
  the unchanged strict all-JavaScript gzip limit of 204800 bytes.
- `NODE_OPTIONS=--max-old-space-size=512 npm run i18n:check` passed with the
  existing counts: 360 static, 21 resolved dynamic, one unresolved dynamic, one
  translator forwarder, and one documented exclusion. The initial unbounded
  check was killed with exit 137; no source, test, or gate was weakened.
- The production web build passed: build `63c62a5f7a6b`, all JavaScript gzip
  **200274 bytes**, entry gzip **98912 bytes**, leaving 4526 bytes below the cap.
- An independent DOM probe exercised the actual `startApp` rules and unlocked
  ballot panels with authenticated test manifests allowing one and eight
  ballots. Both displayed the conditional guarantees; each ballot panel showed
  only its corresponding one-ballot or revote note. It made no POST requests.
  Key unlock and live transport startup were mocked. This is DOM semantic
  evidence, not browser, key-derivation, ballot-casting, or native review.

## Separate residual

The API error mapper still maps every `REVOTE_LIMIT` refusal to
`E-VOT-ONEBALLOT`, including exhaustion of a larger per-voter quota. Accurate
quota-exhaustion copy remains a separate follow-up. This patch does not close
that residual or claim that all B3-14 work is complete.
