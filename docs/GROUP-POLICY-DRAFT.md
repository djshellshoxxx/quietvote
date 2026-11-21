# Offline group policy drafts

The `qv policy-draft` commands expand and check unsigned policy configuration from
QV-03 §§3/10. They do not sign or publish GroupRules, create a group, grant authority,
change an election, or verify that governance is implemented in suite v1.

```sh
node packages/cli/bin/qv.ts policy-draft template foundation --out foundation.json --json
node packages/cli/bin/qv.ts policy-draft template association --out association.json --json
node packages/cli/bin/qv.ts policy-draft validate foundation.json --json
```

Templates: `foundation` (T1), `association` (T2), `collective` (T3). Output uses
`qv-group-policy-draft/1`, a deliberately separate format containing policy values
and a suggested ordinary-election duration. Files must not already exist; there
is no overwrite flag. Edit a saved draft, then validate it. No networking or keys
are involved. Input must be a regular file of at most 128 KiB; strict JSON rejects
duplicate fields, noncanonical strings/numbers and malformed encodings.

Validation returns at most ten errors with JSON pointers, distinguishes shape
errors (`E_RULES_SCHEMA`) from numeric/cross-field bounds (`E_RULES_BOUND`), and
reports warning-only choices such as one steward or unlimited terms. Threshold
comparisons use integer arithmetic. The selected class's effective minimum review
and voting durations are reported, including the stronger global/class constraint.

`required_configuration` names what the unsigned draft cannot supply: group
identity, real steward keys, signed rule history, versioned election binding, and
applicable arbiter/randomness details. A valid draft is not a verified election or
evidence of authorized rules. No cryptographic identifiers, signatures, shortened
drand hashes or named arbiter keys are invented.

## Literal template conflict

```sh
node packages/cli/bin/qv.ts policy-draft template collective --out collective.json --json
```

This writes the literal T3 draft and returns **exit 1**: QV-03 §10 suggests 48h voting
but inherits the 72h global and ordinary-class minima from §3.1. It also lowers
`proposals.min_review_hours` to 24h while the inherited ordinary-class minimum is 168h;
the effective minimum remains 168h. The tool exposes these conflicts instead of
quietly changing a threshold. A future corrected template must explicitly choose
the corresponding overrides. T1/T2 validate within this unsigned draft profile.

Exit codes: 0 valid unsigned draft, 1 invalid draft (including the literal T3
conflict), 2 usage error, 4 unreadable/malformed input or existing output. Template
generation can therefore create a reviewable file even when its validation exits 1.

This profile checks only the fixed policy fields used by QV-03's three templates.
It intentionally excludes names/labels, public keys, custom classes, signed record
framing, member counts, group/enrollment identities, signature thresholds against
actual keys, approval chains, clock evidence, drand parameters and election binding.
Existing functions validating actual manifests and records do not accept this
format. Its extension-duration/counter ceilings are safe-integer representability
bounds where the source sets no stricter platform ceiling; they are not promises
that an election implementation supports those values.

The proposed full contract and integration order are in
[the governance RFC](rfcs/governance-v1-contract.md). The policy tool completes the
bounded drafting slice only; signed governance workflows remain unfinished.
