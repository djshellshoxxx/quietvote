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
- `board verify --witness-policy <file>` supplies the witness policy out of band (`{quorum, none_acknowledged, witnesses:[{name, alg, pk_b64}]}`);
  a malformed or missing file is an input error (exit 4), never a pass.
- `ballot encrypt` / `ballot audit` accept `--manifest-hash` (mismatch: exit 1, nothing written; bad hex: exit 2) and always print the
  manifest hash (`manifest hash:` line, `manifest_hash` in JSON).
