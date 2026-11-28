# @quietvote/cli: implementation notes


## Offline ballot status (2026-11-27)

`ballot status` implements task 4 of the CLI inventory (T-167). It requires an
independent manifest hash, complete archive, verified tally and the exact snapshot's
witness quorum. Preliminary counted arrays, failed subordinate checks and unsupported
outcome-affecting controls cannot establish status. Supersession follows the actual
same-voter predecessor chain; exclusion alone never implies supersession.

The archive preparer additionally returns its existing authenticated checkpoints and
notices. Existing validation remains unchanged. Output preserves protocol caveats,
prints no voter lists or selections, and is scoped to one snapshot without freshness
or FINAL assurance. No dependency, protocol encoding or signature changes.
See the [R24 continuation](../../docs/audits/CONTINUATION_R24_20261127.md).

## Private files on POSIX and Windows (2026-11-19)

Keys, seed files, passphrase files, governance signing inputs, read-key files and invitation tokens are read as bounded owner-private snapshots. POSIX checks use the descriptor that supplies bytes. Windows uses the fixed `src/windows-private-files.ps1` helper through Windows PowerShell **5.1** and .NET Framework; the same native `FileStream` supplies its ACL and file bytes. Missing or unusable native protection, wrong ownership, a broad/inherited or unsupported DACL, and unsafe aliases refuse the operation. There is no unchecked Windows fallback or shell/path interpolation. Native private I/O accepts ordinary local drive paths; UNC shares, device paths and alternate data streams are refused. Existing broad Windows ACLs are not silently repaired.

Private outputs use `0600` on POSIX and a protected owner-only DACL at Windows `CreateNew`, before any secret bytes are written. Outputs are flushed and atomically published; exclusive creation remains exclusive. `keygen --force` replaces an old regular file with a new private file and refuses links/nonregular targets. DOS short names and relative paths resolve in production, including requests to a reused native helper after the caller changes directory.

POSIX atomic output pins the canonical parent, checks every ancestor from the root, and uses a same-filesystem `0700` staging directory. Directory owners must be the current effective user or root. Group/other-writable directories require the sticky bit and trusted owners for every descendant; a private child beneath writable nonsticky ancestry is refused as `UNSAFE_DIRECTORY`. Cleanup is nonrecursive and operates inside the protected stage. This protects against other-user rebinding **when effective namespace permissions follow the inspected POSIX owner/mode/sticky policy**. Same-user/root compromise is outside that boundary. ACL grants overriding those bits, including macOS native deletion rights, are not inspected and remain an unresolved native custody implementation/qualification boundary. Ordinary macOS path tests do not establish ACL-safe namespace custody. This limitation is not a claim that another pathname check makes `unlink` conditional.

Invitation issuance holds one private output handle through credential unlock and POST. It checks binding before issuance, writes the response only to that handle, and refuses success if the pathname was replaced. A replaced path is never written through; a loss of privacy prevents writing bearer codes. The original pending/response file remains recovery evidence, and the CLI never automatically repeats issuance.

**Qualification boundary:** this source includes native Windows enforcement and real ACL/create/read/rename fixtures, but Linux passes are not Windows qualification. The final published head still requires hosted Windows Node 22 and Node 24 results. See [the implementation and validation report](../../docs/reports/windows-private-files-20261119.md).

## Verifier import vs. dependency rule D1 (open finding, 2026-10-21)

**Rule.** `docs/08-architecture-deployment.md` §5.1 D1: "Imports flow strictly downward ... `{server, web, cli, trustee, verifier}`.
No cycles; **L3 packages never import each other**." QV-08-REQ-002 makes violations fail CI (`deps-boundaries` job; no such
script is present in this checkout, so the rule is not mechanically enforced here).

D5 (verifier must not import `cli`) is **not** violated: the verifier does not import the CLI. The violation is one-way,
`cli -> verifier`, and it is a D1 violation.

**Current imports of `@quietvote/verifier` in this package (all in-process):**

| File | Symbols | Purpose |
|---|---|---|
| `src/cmd-verify.ts` | `verifyWithSelfTest`, `runSelfTest`, `formatReport`, `exitCodeFor` | `qv verify`, `qv selftest` |
| `src/common.ts` | `loadBundle` | strict bundle loader used by `loadBundleFile` (`qv election inspect`, `qv ballot encrypt`) |
| `src/cmd-board.ts` | `verifyBundle` with `extraAuthorKeys`, `pinnedCheckpoint` | `qv board verify` |
| `src/cmd-vectors.ts` | `verifyBundle` | `qv vectors check` |

**Why no minimal fix is implemented here.** The scope for this change was `packages/cli` only, and the candidate fixes do not fit that scope:

1. *Spawn `qv-verify` as a child process.* `qv-verify` (`packages/verifier/src/bin.ts`) accepts only one bundle, `--json`,
   `--skip-selftest` and `--manifest-hash`. It has no board anchor options (`--author-key`, pinned checkpoint for `board verify`),
   no bundle-loader entry for the ballot/election commands, and its `--selftest` text differs from `qv selftest`. Making the CLI
   a true front-end would change output and exit contracts for four commands and needs new flags in `packages/verifier`.
2. *Re-implement the composition inside `cli` on `protocol` + `board`.* This is allowed by D1, but it creates a second verdict
   pipeline in the CLI. The verifier's purpose is to be the single independent check (QV-08 D5, ADR-001 principle 1), so a
   copy that can drift is worse than the import.
3. *Move `verifyBundle` / `loadBundle` into `protocol` or `board`.* That changes the verifier's package boundary and needs an
   owner decision on the verifier's identity.

**Recommended owner decision (cheapest option that keeps the independence guarantee).** Amend D1 to allow exactly one
L3 front-end edge, `cli -> verifier` (the verifier's own independence is protected by D5, which already holds). Alternatively,
pick option 1 with the verifier package extended to the needed flags, which is a larger change.

**Until decided.** The import stays. It is a known, recorded violation of D1. Do not treat `packages/cli` as D1-compliant.

**Test status at time of writing (D1 section).** `npm run typecheck` exit 0; `npm test -w @quietvote/cli` 17/17 pass (after `npm ci --ignore-scripts`;
the first run without installed workspace links failed to resolve `@quietvote/crypto`, which is an environment issue, not this finding).
Superseded by the status under "Audit fixes" below.

## Audit fixes (2026-10-21, F1..F12)

Regression tests: `test/audit-regressions.test.ts` (one test per finding, 12 tests). Changes to existing assertions: `test/cli.test.ts`
`election inspect` mismatch case now expects exit 1 (F12). Nothing else in the existing tests was changed.

- **F1 `board verify` election bundle.** All hex flags are validated before choosing a bundle kind (bad hex: exit 2). `--manifest-hash`
  is passed to `verifyBundle` as `pinnedManifestHash`; a pin the manifest does not meet (V1 not pass) is exit 1. `--log-key` is not an
  option of `verifyBundle`, so it is compared with the manifest's `bb.log_pk` and a different value is exit 1.
- **F2 `keygen --force` (current behavior).** A symlink/nonregular target is refused (exit 4). A new private file is written and
  flushed before atomic replacement, so the old permissions are not retained: `0600` on POSIX, a protected owner-only DACL on Windows.
- **F3 `ballot audit`.** JSON that is not an object (`null`, numbers, arrays) is an input error (exit 4).
- **F4 `vectors check`.** Unreadable or non-JSON corpus files throw `InputError` naming the path (exit 4). Shapes of the manifest, vector
  files, mutants and reports are checked; a missing `v1/elections`, `v1/mutations` or canary is exit 4. A missing `elections/*/bundle.json`
  is exit 4. `Object.hasOwn` guards the runner lookup, so an operation named `constructor` is not run.
- **F5 `vectors check`.** `walk` uses `lstat` and never follows symlinks, so a cycle terminates. Symlinks are reported as failing rows
  (`... not a symlink`) rather than skipped silently. Manifest paths that resolve outside the corpus (lexically or via realpath) are
  failing rows and are not read.
- **F6 `ballot encrypt`.** The audit file is written first and removed if the envelope write fails, so a failure leaves neither file.
  A failed run produces no ballot, so there is no ballot code to print; the printed code appears only on success.
- **F7 `ballot encrypt`.** `--audit-out` with `--intent cast` is a usage error (exit 2) and writes nothing.
- **F8 keyfile.** The passphrase minimum (12 characters) is measured on `canon()` (NFKC), the form the key is derived from.
- **F9 `args`.** A value flag never consumes a following `--flag` (`--out --json` is "needs a value"); empty values (`--out=`, `--out ''`)
  are usage errors. A single-dash value such as `-` is still accepted.
- **F10 `main`.** A group command without a subcommand prints usage to stderr (exit 2). `--help` on a group still prints to stdout (exit 0).
- **F11 `board verify --json`.** With an election bundle that has no usable board export, JSON `{integrity, reason}` is printed to stdout.
  `integrity` is `FAILED` when the verdict is FAIL and `INCOMPLETE` otherwise, so it always agrees with the exit code.
- **F12 `election inspect`.** A manifest hash that differs from the bundle's exits 1 (the description is still printed). `qv --version`
  is listed in HELP.

**Test status after these fixes.** `node --test packages/cli/test/cli.test.ts`: 15 pass, 2 fail (`verify: --json is structured...`,
`selftest command`), the same two known base failures as before the change (vectors/verifier simulation against QV-ADR-015 election-open
binding; not touched here). `node --test packages/cli/test/audit-regressions.test.ts`: 12/12 pass. Typecheck: no errors in `packages/cli`.


**Merge reconciliation (audit BC-01/02/04).**
- `board verify <board bundle>` without `--log-key` downgrades a clean result to PARTIAL (exit 3): the bundle's own log key is self-attested.
  A bundle whose key is pinned with `--log-key` can still VERIFY (exit 0). Election bundles keep the existing check against `bb.log_pk`.
- `board verify --witness-policy <file>` supplies the witness policy out of band for standalone board bundles
  (`{quorum, none_acknowledged, witnesses:[{name, alg, pk_b64}]}`); a malformed or missing file is an input error (exit 4), never a pass.
  Election bundles use their manifest policy and refuse this option (exit 2), so an external policy cannot be silently ignored.
- `ballot encrypt` / `ballot audit` accept `--manifest-hash` (mismatch: exit 1, nothing written; bad hex: exit 2) and always print the
  manifest hash (`manifest hash:` line, `manifest_hash` in JSON).

## `qv election spoil-collect` (added 2026-10-21)

`src/cmd-spoil.ts`. Offline. Uses `electionContext` (full `verifyElection`, optional `--manifest-hash` pin) for the manifest, K and ctx,
then re-derives what the report does not expose (Y_j, the key-confirmed decrypter set, election-open/close) with the protocol's own
`adjudicateDkg`/`verifyKeyconf`/`verifyMultiSig` over the same record filters as `verifyElection`; it fails if the re-derived K/ctx differ.
`analyzeBallotLog` must list the code as a spoil; refused (exit 1) if the code is cast (counted or any cast envelope's code), the manifest
lacks `spoil_trustee_decrypt`, the spoil has a reveal digest, or its ciphertexts' alphas also appear in a cast envelope (TR-01), the same
gate the trustees apply. Packets must be `qv-ceremony-packet/v1` (else exit 4); non-`spoil-share` rounds and other codes are ignored.
`collectSpoilShares` then `decryptSpoiled`. Per-trustee validity is decided by running `decryptSpoiled` on that trustee's set alone with
t=1 (anything other than `E_DEC_PROOF` means every proof verified); this is a heuristic on the error code, not separate crypto. The
POST body is the signed record as JSON; the existing `POST /api/v1/elections/:id/spoil-shares` endpoint accepts this exact record schema. Files are created
with `wx` (never overwritten). Tests: `test/spoil-collect.test.ts` (8; uses `packages/protocol/test/helpers/sim.ts`).

## `qv online election-spoil-post` (2026-11-27)

Completes trustee CLI inventory task 7 and corrects defect D-F above. `src/cmd-online-spoil.ts` relays the
collector's signed body files to the existing spoil-share endpoint. It requires `--election` and an independent
`--manifest-hash`, reuses `electionContext` for verified manifest/DKG key material, compares the election ID,
requires trustee spoil mode, and checks every record with the existing `spoilShareRecordSchema` and
`collectSpoilShares`. Its verification claim is limited to manifest/context/signatures and share encodings;
the server remains responsible for proof validity, spoil eligibility and lifecycle admission.

The directory is fully read and validated before any POST: at most 1024 regular JSON files, 1 MiB each,
64 MiB total, no empty directory, unexpected entries, final symlinks, special files, changed inputs, mixed
contexts or repeated code/trustee pairs. Files are retained as bytes and sent in deterministic filename order.
The new explicit raw-JSON wrapper shares `cmd-online.ts` transport without serializing those bytes again;
existing JSON request callers retain their previous serialization and signed-request framing.

Requests are sequential and stop at the first rejected or unknown result. Matching 201/accepted or
200/duplicate acknowledgments are checked against the input code and trustee index. Network failures,
redirects, 5xx, excess responses and invalid acknowledgments are uncertain; no request is automatically retried.
Structured output preserves prior acknowledgments and marks later items unattempted. It contains only
validated public identifiers, exact body hashes and sanitized HTTP error codes, never body contents,
server free text or filenames. No management/read key is sent: the POST authenticates its signed record;
private-link GETs retain the existing read-key requirement. Duplicate replay is subject to the server's
current lifecycle and is rejected after tally publication.

Tests: `test/online-spoil.test.ts` exercises byte-preserving local HTTP, complete preflight refusal, input
bounds, uncertain/partial results, no redirects/retries, output sanitization, and the genuine link-election
collector → POST → duplicate → tally workflow. No protocol or dependency change.

## Dependency declaration (DEP-01, 2026-10-21)

`packages/cli/src` imports `@quietvote/verifier` (`cmd-board.ts`, `cmd-vectors.ts`, `cmd-verify.ts`, `common.ts`), but the
package did not declare it. `packages/cli/package.json` now lists `"@quietvote/verifier": "*"` in `dependencies`, the same form as
the other workspace dependencies. `package-lock.json` changed by one line only (the `packages/cli` entry), from
`npm install --package-lock-only --ignore-scripts`. This is a declaration fix; it does not change the D1 layering question above.
Tests after the change: `npm test -w @quietvote/cli` 29/29 pass.

## B3-25 QVKEY1 passphrase interoperability (implemented 2026-11-16)

QV-ADR-027 approved the decision register's B3-25 default. CLI and web now use the shared `protocol/src/key-passphrase.ts` policy:
new wrappers use the existing web canonical form; unlock first tries that form, then the old CLI's distinct NFKC-only spelling.
No duplicate derivation occurs when the two forms agree, and the QVKEY1 schema/version and KDF bounds are unchanged. The original
CLI spelling remains necessary for its legacy files; normalization cannot reconstruct lost capitalization or separators.
`test/keyfile-compatibility.test.ts` pins three immutable pre-change CLI/web fixtures, exercises cross-client unlock/wrap, arbitrary
Unicode text, bounded wrong-password work, parameter validation, cancellation and temporary-buffer wiping. No trustee QVTB rule
changes: that is a separate container. See the B3-25 milestone handoff for validation and remaining external review.

## Integration regressions (2026-10-30)

The spoil-collect malicious-quorum fixture now constructs signed shares from the exact candidate envelope. CP-01 excludes re-wrapped
cast ciphertexts from the verified spoil map, so looking up that candidate in the map crashed the old fixture before the CLI ran.
The regression still requires refusal even with `t` valid share packets, empty stdout and no POST files; it accepts refusal at the
earlier verified-spoil gate. The ordinary-spoil combination and all other spoil-collect cases pass (8/8, direct test-file run).
The standalone-policy/election-bundle regression passes (1/1); workspace typecheck passes. After the protocol/schema integration
fixes, final `npm test -w @quietvote/cli` passes all 47 tests, including the real-process command checks and vector/self-test checks.

## Online adapters — 2026-11-16

Added explicit `online` instance/create/inspect/draft/submit/export commands using the real HTTP API.
Management requests reuse the pure signed-request helper extracted to `@quietvote/board`; the server re-exports the same helper, with no dependency or framing changes.
Server admission remains authoritative; signed packet relay introduces no new protocol rules. Online JSON
responses are not verifier verdicts. No automatic mutation retries; unknown network outcomes are explicit.
Real-server integration tests cover signed organizer management, wrong audience, strict options, real DKG/open,
cast and close, early-close refusal, tally publication, no-overwrite export, and strict comparison of the exported supported election through the real TypeScript and Python CLIs. Registration and protocol-policy holds remain open.

## Independent receipt command — 2026-11-16

`qv verify-receipt receipt.json --log-key HEX --origin ORIGIN --leaf-hash HEX`
checks the existing board receipt signature and inclusion algorithm offline.
All three anchors are required and must come from the caller's verified election
and saved submission. A signed promise without inclusion exits 3 (INCOMPLETE),
a verified inclusion exits 0, mismatches or invalid proofs exit 1, malformed
input exits 4 and malformed options exit 2. `--json` reports the limited scope.
This proves inclusion of the expected leaf in the signed checkpoint; it does
not establish witness quorum, checkpoint freshness, election integrity or that
a ballot was counted. It makes no network request and changes no board rules.
Refs: QV-18-REQ-013.

## Public archive preparation — 2026-11-16

`qv election prepare` supplies the missing shipped public-file path for trustee ceremony import and
release evidence (QV-17-REQ-040, QV-18-REQ-033). It reuses `protocol.verifyLogStructure`, the same
binding/author/tree/checkpoint path used by trustee release, after validating the pinned manifest and
its coordinator signatures. The strict archive reader and SHA256SUMS checker now live in the portable
board package; server import reuses them without changing its protocol verification or admission rules.
The separate-organizer refusal is retained and regression-tested. Preparation is not a full protocol,
witness, receipt or freshness verdict. The existing executable election test now uses this command for
both ceremony log and tally release inputs, replacing its manual archive unpacking.

## Coordinator lifecycle proposals — 2026-11-16 parallel continuation

`qv election draft-record` creates unsigned bodies for the nine existing ceremony,
roll commitment and election open/close transitions from a pinned authenticated
`.qvb` archive. Archive parsing/authentication is the same function used by
`prepare`; no package boundary, dependency, cryptographic primitive, server
admission rule or protocol schema changed. Every generation is explicit and
writes a new private file. Existing coordinator signing and outer framing remain
separate operations.

The adapter checks the existing record schemas/signatures, ordered phase markers,
roll pins/commitments and terminal controls. It calls `adjudicateDkg` and
`verifyKeyconf` for final/keyed phases; it does not implement another DKG.
Context-bound open/close signatures and their referenced history are checked
before deriving the next body. The current protocol's `t` confirmation threshold
is retained; contradictory draft specification statements are not settled here.

Lifecycle tests exercise all nine generated bodies through the real command
entrypoint against an actual server, reject early/repeated transitions, missing
pins, damaged archives and insufficient confirmations, and rebuild authentic
outer boards around invalid trustee signatures/proofs to check inner rejection.
No time or witness guard is bypassed: the summary explicitly leaves witness and
freshness verification false and the server remains responsible for admission.
An unpinned roll is labeled `uncommitted-proposal`; its membership still needs
operator review. Separate-organizer archive refusal and B3-01/D-99 are unchanged.

## Optional verified election downloads — 2026-11-27

`online election-export --verify --manifest-hash HEX` runs the existing archive preparer and
self-testing verifier against the exact downloaded buffer after saving it exclusively. The default
download path and output remain unchanged. Verified JSON requests the existing `board=1` export and
accepts the verifier's bounded independent `--extra-author-key` pins; QVB retains the preparer's
existing authority rules. The requested election ID is separately bound to the authenticated manifest.

The shared snapshot-evidence gate also serves offline ballot status without changing its outcomes.
It requires the subordinate checks, rejects fatal/alarm findings, uses signed-manifest witness keys
for the exact snapshot, and retains the pending interpretation of authenticated outcome controls.
The export report keeps the verifier's verdict separate from this stricter verdict, includes the exact
download hash, preserves notices, and leaves freshness/finality false. Failed or incomplete verification
retains the bytes with `verified: false` and exits 1 or 3; it never overwrites an existing file.

The full ordinary server workflow remains blocked: `protocol/NOTES.md` explicitly keeps the server's
`tally-aggregate` outside the QV-16 record contract. Both it and `dec-shares` reach the verifier's unknown
record branch and fail `chk.encoding.canonical`, even when the raw verdict is PASS. The real-server
regression retains this strict refusal for QVB and JSON and for offline ballot status; it does not filter
records or exempt the failed check. QVB supplemental-author trust is also unresolved beyond structural
preparation: transport metadata alone is not an independent author pin. Exact source references and the
reproduction are in [the compatibility report](../../docs/reports/export-derived-record-compatibility-20261127.md).
