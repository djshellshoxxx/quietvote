# @quietvote/cli: implementation notes

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
- **F2 `keygen --force`.** The old entry is `lstat`ed; a symlink is refused (exit 4). Otherwise it is unlinked and recreated with mode
  0600, so the old permissions are not kept.
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
POST body is the signed record as JSON; the server endpoint is not in this tree, so that body shape is an assumption. Files are created
with `wx` (never overwritten). Tests: `test/spoil-collect.test.ts` (8; uses `packages/protocol/test/helpers/sim.ts`).
## Dependency declaration (DEP-01, 2026-10-21)

`packages/cli/src` imports `@quietvote/verifier` (`cmd-board.ts`, `cmd-vectors.ts`, `cmd-verify.ts`, `common.ts`), but the
package did not declare it. `packages/cli/package.json` now lists `"@quietvote/verifier": "*"` in `dependencies`, the same form as
the other workspace dependencies. `package-lock.json` changed by one line only (the `packages/cli` entry), from
`npm install --package-lock-only --ignore-scripts`. This is a declaration fix; it does not change the D1 layering question above.
Tests after the change: `npm test -w @quietvote/cli` 29/29 pass.

## B3-25 QVKEY1 passphrase interoperability (unresolved)

The CLI applies NFKC only; the web client also folds recognised word-list passphrases to lower-case words joined with single spaces.
The normalization policy and compatibility migration remain an owner decision; key derivation and existing-container unlocking are
unchanged. Reproduced on the integrated tree: web-wrapped `lobe kuga guna husa tejo nula neno` unlocks in both clients with that exact
phrase. `LOBE-kuga-guna-husa-tejo-nula-neno` unlocks the same container in the web client but fails in the CLI. A CLI-created key using
the latter spelling also does not unlock in the web client. This is an interoperability gap, not a closed finding.

Backup guidance: keep the exact phrase used when creating a CLI key, including capitalization, spaces and hyphens. For a word phrase
generated by the web client, enter the displayed lower-case words with one space between words in the CLI. Case/separator variants
accepted by the web client are not portable. README and CLI help now state this limitation.

## Integration regressions (2026-10-30)

The spoil-collect malicious-quorum fixture now constructs signed shares from the exact candidate envelope. CP-01 excludes re-wrapped
cast ciphertexts from the verified spoil map, so looking up that candidate in the map crashed the old fixture before the CLI ran.
The regression still requires refusal even with `t` valid share packets, empty stdout and no POST files; it accepts refusal at the
earlier verified-spoil gate. The ordinary-spoil combination and all other spoil-collect cases pass (8/8, direct test-file run).
The standalone-policy/election-bundle regression passes (1/1); workspace typecheck passes. After the protocol/schema integration
fixes, final `npm test -w @quietvote/cli` passes all 47 tests, including the real-process command checks and vector/self-test checks.
