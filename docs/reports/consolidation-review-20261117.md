# QuietVote deep review and consolidation — 2026-11-17

This report records the requested repository review and selective integration.
Dates use America/Los_Angeles. QuietVote remains an experimental implementation;
consolidation does not establish complete product scope or release qualification.

## Completed outcome

The reviewed source was merged through [#56](https://github.com/djshellshoxxx/quietvote/pull/56)
as `38192a5498a7b6fdc612c8e6c240a8596626d579`, after exact candidate `8686e62`
passed **11/11 main CI jobs**, including **1,425 workspace tests on each of Node
22 and Node 24**. The initial **49 open PRs are reduced to 2**: #43 is the
canonical cumulative draft and #27 holds the concrete residuals. Forty-five
superseded/obsolete PRs were closed with checked-head dispositions; #47 and #54
were merged during the earlier baseline step. All source branches are retained.
See the [publication receipt](consolidation-publication-20261117.md) for final
source, tests, closure accounting and the documentation-only follow-up.

## Source and scope

- Default branch at discovery: `019f4e789be2ff38a5fb2d348c3b225cc87cf296`.
- Canonical integration at discovery: `f895b1a3f895595d62fc3ecd29dad496296e3672`.
- Green cumulative source: `c6a4df56351f560656377729df3a33192fe940b9` (#54).
- Latest reviewed milestones: `66dcfafa885bdbd82cae808c33cebe0d7f8a21ab` (#55).
- Combined repaired source before this report: `4b93752e6e8f1f5cff14474576d6a3d6265502a2`.

The review accounted for all **59 nonsymbolic remote branches and 49 open PRs**
at discovery. Three parallel review lanes inspected branch history, security and
contribution standards, and implementation against requirements. The lead
reviewed the recovered diffs and performed combined checks. This is agent code
review, not an independent professional cryptographic audit or exhaustive proof
of the 730 traced requirements.

Ancestry, patch equivalence and per-file review distinguish already included
implementation from remaining unique work. The initial latest candidate contains
51 of the 59 original branch tips. The consolidated candidate also includes the
canonical integration/T01 history and both historical planning branches: **55 of
the 59 original tips are exact ancestors**. One remaining tip is patch-equivalent,
two contain obsolete documentation, and one is PR #27's partially recovered work.
Source branches are retained; no history was force-pushed or retrospectively
attested.

## Integration and corrections

PR [#54](https://github.com/djshellshoxxx/quietvote/pull/54) was merged into
`integration/quietvote-completion` as
`44f73ca8c52511d8587d8381ef7a5c589c4626af`. Its exact-head
[CI run 43982203881](https://github.com/djshellshoxxx/quietvote/actions/runs/43982203881)
passed all 11 jobs, including Node 22/24 workspaces, browser journeys,
conformance, build and supply-chain checks. The resulting history preserves the
separate T01 historical receipt.

The following changes were combined on `integration/quietvote-reviewed-20261117`
and merged into that same canonical branch through #56:

| Change | Why it matters | Evidence/provenance |
|---|---|---|
| Latest #55 milestone source | Preserves supplemental author pins, independent Python adapter/parity, signed GroupRules core and Node 22 SQLite retention repair | Exact source `66dcfaf`; security and requirements review found no new runtime/specification blocker in the inspected delta |
| Regenerated `packages/web/COPY.md` | Repairs both Node CI failures without changing assertions or UI copy rules | `4c2051e`; failing existing test reproduced, generator run, 2/2 copy checks pass |
| IPv6 /56 network grouping | Prevents a single /56 from obtaining a separate allowance for each of its 256 /64s | Historical `07fd61c` slice, recovered as `d6c3be0`, integrated as `fffa143`; 3 new failures reproduced before repair, 21 focused checks pass after repair |
| Explicit absence of a log signing key | Imported mirrors/reloaded archives refuse to manufacture receipts under a zero-seed replacement key | Historical `13b86c2` B2-12 slice, recovered as `8d77883`, integrated as `4b93752`; actual HTTP cases reproduced, then board 78/78 and server 290/290 pass |
| Current README/web workflow status | Removes obsolete registration, parity and organizer holds while retaining actual missing work | `23c180b`; source-based requirements review; no false completion claim |
| Historical lane and future CLI plans | Preserves useful planning and original commits without reinstating old stopping instructions or command contracts | Original `d5c7998` and `85a7d3e` merged; `25d26aa` adds explicit historical status and current CLI pointers |

The copy failure was the only failed assertion in each of the two failed jobs in
[run 43983217985](https://github.com/djshellshoxxx/quietvote/actions/runs/43983217985):
server 287/287 passed and web 325/326 passed on each Node version. Handwritten
prose had been appended to a generated artifact while its two new catalog keys
were omitted from their generated location. Regeneration fixes the artifact;
the useful prose is retained in the web README.

The keyless repair preserves the board's Result API. Missing keys cause
`QV_BOARD_READ_ONLY` before append mutation or signing; the server returns
`503 LOG_UNAVAILABLE`. Authentic stored checkpoints and inclusion proofs remain
readable. The original keyed duplicate behavior is unchanged. This does not
persist original promise signatures for later replay or immediately erase an
already loaded archive's actual key. See the
[repair receipt](keyless-receipts-consolidation-20261117.md).

## Security and standards review

### Inspected #55 trust boundaries

- Supplemental signing keys are bounded, explicit caller trust. Export metadata
  does not grant author or witness authority. Editing pins or changing the page
  invalidates stale asynchronous results; missing witness evidence stays incomplete.
- Signed governance histories enforce external group/genesis pins, the old
  steward quorum for amendments, strict signed bodies and consecutive history.
  Unsigned ratification pointers do not activate amendments. The offline CLI
  cannot fabricate approval evidence.
- Python file input uses bounded JSON Lines framing and confined descriptor-based
  traversal, refusing symlinks, parent traversal and special files. Approved
  parity preserves fatal conflicts and signature-before-selection rules.
- The SQLite retention repair repeats the same cutoff across anonymous bindings;
  it preserves the retention predicates on the supported Node floor.

Focused review reruns passed 18 Node governance/pin/UI tests, 15 Python adapter
tests and 26 Python parity tests. These overlap other suites and are not added to
the totals as distinct tests.

### Contribution provenance

The two newest inherited commits, `42263c4` and `66dcfaf`, have an author that
does not match their sole DCO sign-off. A full history check at `4b93752` found
507 commits beyond main: 264 with a matching author sign-off, 211 with none, and
32 with sign-offs but no matching author. These are recorded deficiencies,
including the existing D-100 work; consolidation does not invent attestation.
The original local repair/merge/documentation commits use matching author
sign-offs, as does the published checkpoint `8686e62`. Readback of the first
hosted merge, `44f73ca` (#54), shows no sign-off; that omission is recorded here
without rewriting history or inventing a retrospective attestation.

No new dependency, cryptographic primitive, receipt encoding, database migration,
test-vector expectation, comparator relaxation or size-budget change was needed
for these recovered fixes.

## Requirements and remaining implementation

The accepted ADR-027/028 choices authorize continued implementation. Historical
generic holds on modern registration and detailed-report parity are superseded.
They must not be used to repeatedly request the same approval.

| Area | Verified current boundary | Remaining work |
|---|---|---|
| Election lifecycle | Modern web/API/CLI enrollment, organizer ceremony/open/close/tally, actual executable trustee/voter workflow and offline recovery exist | Broader qualification and the separate pinned-roll case below |
| Pinned-roll enrollment (D-99) | Modern invitation binding works, but an otherwise valid invited key is not checked against the pinned membership before approval | Prevent extraneous/absent members from blocking roll commitment; implement and exercise the pinned-membership contract |
| Signed governance | Pinned signed-rule histories, independent Python verification and offline governance CLI exist | Governed manifest/rule/proposal bindings, actual ratification evidence, persistence/API/browser integration |
| Proposals | Titles and unsigned policy planning are not a proposal lifecycle | Immutable versions, author/sponsor rules, review/restart, freeze/withdrawal and independently checked manifest binding |
| Group membership | Per-election registration and organization-admin keys exist | Group membership aliases, two-key rotation, delayed recovery/veto and revocation with the required denominator semantics |
| Disputes/finality | Administrative controls exist | Member filings, bounded evidence, arbiter authority, signed remedies and independently verifiable finality/time rules |
| Nonce hardening | Existing construction is unchanged; ADR-027 already approves the remaining work | Full-statement decryption-nonce binding (CP-02), DKG nonce hedging and coordinated registry/vector updates with security review |
| Controls and Python scope | Legacy authenticated controls, current corpus agreement and bounded JSONL interface exist | New authority/freshness/terminal semantics, individually tracked numeric/method/witness rules, trustee-mode spoil and full conformance-profile acceptance |
| Operations and release | Backup verification, public/private restore floors and durable recovery exist | Independent witness/WAL activation, offsite custody, services/containers, supported-platform evidence, external protocol/security review and release governance |
| Language/accessibility | Automated browser/a11y tooling and draft catalogs exist | Native review, manual assistive technology and supported-device acceptance |

The governance RFC still names concrete unresolved contracts: authenticated
elapsed time, group-snapshot timing, conflicting template durations, recovery
accounting, late additions and denominator effects, confidential dispute evidence,
timeout behavior and arbiter selection/fallback. These are specific requirements,
not reasons to stop unrelated implementation. Neither this review nor test counts
assigns an unsupported feature-completion percentage.

## Why PR #27 still needs selective recovery

Current invitation expiry/retention, signed-request authentication and request-log
privacy already arrived through newer history. The /56 and keyless receipt fixes
are recovered here. The original branch must not be merged wholesale:

1. Its rollback anchor reuses control migration 5, while current control schema
   is 7. A safe additive migration is 8. Its startup check also runs after a
   duplicate path that can sign a receipt; every signing path needs the gate.
   Existing explicit offline restore floors do not replace normal-startup
   external high-water checks.
2. Its recorded export uses election migration 6, while current election schema
   is 9. A safe additive migration is 10. It predates durable management receipts,
   authoritative deletion-state checks and resumable cleanup. Acknowledging
   before transfer completion needs explicit semantics and aborted-transfer tests.
3. Its reason-code enum changes server admission only. Today's CLI and both
   verifiers retain valid legacy free-text signed records. New-generation and
   admission restrictions must preserve documented legacy verification.
4. Lazy module integrity must fit the current build graph and unchanged size
   limits and pass real browser tampering checks before inclusion. The prepared
   port `e421221` is preserved in a separate source bundle and excluded: its
   204,814-byte result fails the strict `<204,800` test, and its proposed browser
   scenarios have not passed. The [port receipt](consolidation-w15-residual-20261117.md)
   records the two corrected preload hangs and remaining gates. The sealing
   worker remains a separate integrity boundary.
5. Its rejected web-ballot WIP failed its own body-binding and stale-state review;
   it remains unapplied evidence.

These are integration and compatibility tasks under existing approvals. The
original branch is retained with an actionable residual checklist.

## Verification receipt and integration policy

All results below are source-specific. The final combined candidate's hosted CI
is recorded in the consolidation PR and subsequent publication receipt; earlier
green runs are not represented as later-source evidence.

| Check | Source/result available before publication |
|---|---|
| Full baseline `npm run check` | Reviewed #55 runtime plus generated-copy repair: typecheck and 1,416 workspace tests pass, zero failures/skips; completed at documentation tip `23c180b` before the two recovered runtime fixes |
| Generated copy gate | `4c2051e`: 2/2 pass after reproduced failure |
| Recovered IPv6 focused audit/unit tests | `d6c3be0`: 21/21 pass; typecheck pass |
| Recovered keyless full workspaces | `8d77883`: board 78/78, server 290/290, zero failures/skips; typecheck pass |
| Combined rate/keyless regressions | `4b93752`: 26/26 pass, zero failures/skips; typecheck pass |
| Python units | Reviewed #55 runtime plus copy repair: 221/221 pass |
| CLI vectors | Same runtime: 420/420, zero failures/unrun files |
| Python corpus | Same runtime: 282/282, zero failures/unsupported cases within that corpus |
| Strict shared verifier comparison | Same runtime: 27/27 detailed reports agree; board append/witness/receipt capabilities are explicitly excluded from this comparator |
| Tooling tests | 55/55 pass |
| Build, dependency boundaries, lockfile | Pass with existing budgets and documented dependency deviations preserved |
| Dependency advisory check | `npm audit --audit-level=high`: zero vulnerabilities reported |
| Links and traceability | Links pass; trace checks pass. Link coverage is not requirement satisfaction |

The exact combined source passed review and CI and is merged into
`integration/quietvote-completion`. #43 remains the authoritative cumulative draft
against main, and #27 retains the genuine residuals above. Forty-five redundant
PRs, including obsolete #2/#21, are closed with explicit dispositions. Source
branches, source hashes and historical findings are preserved. The documentation
follow-up corrects stale completion states and misleading source/agent-review
wording: claims lint now reports zero findings under the unchanged rules. Main,
release and deployment qualification remain separate from this prototype consolidation.
