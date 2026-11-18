# QuietVote trustee relay continuation — 2026-11-16

Continues [PR #47](https://github.com/djshellshoxxx/quietvote/pull/47) from
`153ac6b2d066d4c4ed9b912ab3193477115eb872`. Review branch:
`codex/quietvote-trustee-acceptance-20261116`,
[PR #48](https://github.com/djshellshoxxx/quietvote/pull/48).

## Implemented

`qv-trustee export-entry --bundle F --round ROUND --out F.json` exports an
existing trustee output as the signed `{header, body}` envelope consumed by
`qv online election-submit`. Supported rounds are `r1-commit`, `r1-dealing`,
`r2-shares`, `r3-complaints`, `r4-keyconf`, and `tally-share`. `--index` selects
one existing complaint; an honest verification round can have none to export.

The exporter accepts no arbitrary payload, origin, secret or ciphertext. It
derives the origin from the joined manifest and signs only saved outputs.
Tally export maps the already released proof fields to the existing server
`dec-shares` record. It performs no decryption, changes no release ledger and
does not bypass `tally-release` verification. A bundle lock and sealed-file
comparison refuse stale objects. Existing per-command release stages are enforced.
Abort/destruction and failed-save gates remain;
output files are published exclusively after the existing protected-path check.

The new process test performs a three-trustee, threshold-two DKG using actual
`qv-trustee` invocations, production RNG and default KDF. Each command reopens its
own sealed bundle. The parent receives only the trustee public keys, compares
the three fingerprints, relays outputs with actual `qv online` processes and
asks the server to count three ballots with two trustee releases. It checks the
known plaintext aggregate totals and compares the final TypeScript and Python
shared reports. Missing log evidence is refused before a share is released.

## Boundaries found during integration

This is trustee executable acceptance, not complete all-shipped-client acceptance.
Coordinator signing, registration and voter actions remain harness operations.
The server is a real in-process HTTP instance with an injected clock, not the
`qv-server` executable; its launcher has separate existing coverage.

The test prepares public input files, a step still missing from shipped tools:

- A `.qvl` ceremony input is constructed from the server's JSON export.
- For trustee release, the downloaded `.qvb` is unpacked. Every board entry,
  including server aggregate records omitted by the content-only JSON export,
  is retained in the supplied log. The server public key is included through the
  existing `extraAuthorKeys` input. No server private state is read.
- The fixture uses an organizer who is also a manifest coordinator. The existing
  trustee log-evidence verifier authorizes coordinator keys for the manifest
  envelope, whereas the server can accept a separate organizer. A preliminary
  real-process run with separate keys refused release with
  `LOG_EVIDENCE_INVALID / QV_BOARD_AUTHOR_UNRESOLVED`. That broader authority
  mismatch is not repaired or silently authorized by this change.
- Final shared TS/Python comparison uses the content-only JSON export. Python
  board/witness/receipt capabilities and the wider verifier policy holds remain.

An earlier fixture also used historical server dates against real process
timestamps. The fixture now uses valid second-resolution dates relative to the
run time; the server clock-skew and manifest-schema checks were not relaxed.

Source review found a defect in the initial exporter: `commit` persists a dealing
privately for crash recovery before the reveal stage. A regression reproduced
premature export with `Missing expected rejection`. The correction requires the
existing `AT_OR_AFTER` release states for each output; the same regression and
all 21 focused exporter/CLI safety tests then passed. No protocol state transition
was changed. An assertion that an unused third trustee must be `TALLYING` was
also corrected: its actual, unchanged state remains `STANDBY` until it releases.

## Validation and provenance

Corrected code snapshot: published `51ef2d0a15c2b546532acf7a3f87a3f1b13f88d8`, tree
`ab38db5db049613ce438962e13ac79d748f47d6e`. The tree equals local commit
`1c71145d2af98e62787c82949741dc4671ce868a`. The initial implementation was published
as `13fb4d02c743ba305988bab3c9f22e158331acbf`, matching local `4462f3b3ea5ccc0ef8d52b52ca00b89b5cf940e4`.
Connected-GitHub publication preserves local IDs in `Original-local-commit`
trailers and checks tree equality before updating the branch. Later handoff
changes are docs only.

Local validation on Linux, Node v24.22.1:

| Check | Result |
|---|---|
| `npm run typecheck` on corrected code | Pass |
| `npm test -w @quietvote/trustee` on corrected code | 109 pass, 0 fail, 0 skipped; 277 seconds |
| Real executable election within that suite | Pass, 274 seconds; all trustee DKG operations, two accepted shares, exact tally counts and TS/Python shared report comparison |
| Other seven workspace suites in the broad run | 908 pass, 0 fail, 0 skipped: board 76, CLI 54, crypto 88, protocol 215, server 205, verifier 25, web 245 |
| Focused corrected exporter and CLI safety tests | 21 pass; these overlap the trustee suite and are not added to its count |
| Dependency boundaries and lockfile | Pass; existing D-97 deviations retained, no new dependencies |
| Links, trace-link check and whitespace | Pass |
| Claims lint | Exit 1, eight historical findings in two unchanged audit files; no new finding |

There are 1,017 distinct workspace tests covered by these successful runs. The
initial `npm run check` command itself exited 1 because the new process test
expected the unused trustee's state incorrectly (108/109 trustee tests passed).
That assertion was corrected and the **entire trustee suite** rerun successfully
after the release-stage repair. Do not describe the initial full command as
passing or count overlapping reruns twice. No other production package changed.

Hosted corrected-code [CI run 43885785374](https://github.com/djshellshoxxx/quietvote/actions/runs/43885785374)
is not all green. Its Python units, TS/Python vector sweeps, production web build,
i18n and licence steps passed; the preserved strict verifier comparison failed.
The workspace/platform jobs were still queued when this handoff was written.
The corrected-code pseudo-locale workflow passed. A browser,
CSP and automated accessibility job passed on the initial code snapshot; that
earlier result is not claimed as final-head qualification. Windows/macOS and
independent human/protocol review remain unqualified here.

The strict verifier comparator remains unchanged: 27/27 verdicts agree;
24/27 detailed reports agree; three reports differ in 17 fields. Its exit 1
remains a failed gate, not a passing result.

## Next work

1. Add a shipped, bounded public-archive preparation path for trustee ceremony
   and release inputs. Verify checksum/signature/origin bindings and preserve
   every board entry; do not disguise the organizer/coordinator authority mismatch.
2. Complete coordinator and voter packet generation/relay and independent
   receipt checks. Registration B3-01 still needs the recorded contract decision.
3. Continue server backup verification/restore, BT-13 gossip health, BT-14 bundle
   work-factor limits and the existing web recovery backlog from the prior handoff.
4. Resolve the recorded verifier/authority holds through explicit protocol review.
   No vector, comparator or admission-policy changes were made here.

Review is a same-author source and test review, not independent professional
review. Main, release and deployment were not changed. The project remains an
incomplete experimental prototype.

Resume from the PR #48 branch rather than repeating the PR #47 consolidation:

```sh
git fetch origin codex/quietvote-trustee-acceptance-20261116
git switch -c codex/quietvote-next origin/codex/quietvote-trustee-acceptance-20261116
npm ci --ignore-scripts --no-fund
npm run check
```
