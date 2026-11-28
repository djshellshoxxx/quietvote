# Repository secret scan: implementation and local evidence

Date: 2026-11-27 (America/Vancouver). Base:
`c110e06bc584e642e9130a82f7a16493ad8b12e3` (PR78).
This implements [process T3](inventory-20261111/process.tasks.md#t3-in-repo-secret-scanner)
and the PR/nightly check required by QV-30-REQ-022 in
[the engineering standards](../30-engineering-standards.md).
Source is prepared for independent review and integration; no publication or
branch-protection setting was changed from this worktree.

## Plan and resulting behavior

1. Implement the current-file scan with Node built-ins, closed/redacted findings,
   exact exception validation, finite input bounds and failure on incomplete reads.
2. Prove a fake token under a test directory is still detected. Review the actual
   repository candidates before recording any exact fixture exception.
3. Add complete available Git-history traversal, including root and merge-parent
   diffs, deleted secrets and branch/remote/tag-only commits. Refuse shallow history
   and unsupported or truncated input.
4. Add a separate pinned workflow covering documentation-only PRs and scheduled
   history scans. Run the focused tests and the actual repository scans.

All four implementation steps are complete. The scanner does not need
`node_modules`, a package installation, a third-party scanner or a new action.

Run from the repository root:

```sh
node scripts/secret-scan.mjs --json
node scripts/secret-scan.mjs --history --json
node --test scripts/secret-scan.test.mjs
```

`--root <repository-root>` selects another checkout containing its own reviewed
allowlist. Exit 0 means the declared scan scope completed without an unexcepted
finding; exit 1 means detection; exit 2 means incomplete scanning or invalid input.
An incomplete result never becomes a partial pass.

## Detection and output contract

| Fixed rule | Scope |
|---|---|
| `PRIVATE_KEY_PEM` | Private-key PEM headers, including RSA, EC, DSA, OpenSSH and encrypted-private-key variants. |
| `TOKEN_PREFIX` | Bounded recognizable GitHub, npm, AWS access-key-ID, Slack, Stripe and OpenAI-style token prefixes. These are format checks, not online credential-validation requests. |
| `HEX_SECRET` | 64-hex literals assigned to secret/private/seed/token/password/api/signing-key/sk/kek/dek/key-like names, including JSON, common casing, environment assignments and the named simple hex-decoder wrappers. Bounded whitespace permits split-line literals. Explicit public/hash names and `pk` fields remain outside the rule. |

Findings contain only `path`, `line`, `rule`, and optional immutable `commit`.
They never contain source excerpts, matched values, value hashes, arbitrary
exception messages or Git stderr. JSON and text output use the same finding
data; text paths are JSON-escaped. Results are sorted without locale-dependent
ordering. Counts and explicit exclusion records describe the scan scope.

The current-tree mode enumerates Git-tracked files and nonignored untracked files
with NUL-delimited paths. It checks path components and does not follow symlinks.
Reads verify regular-file status, bounded size and stable size/timestamps through
completion. NUL-containing binary data is explicitly reported as excluded;
unsupported nonbinary text encoding, missing files and read errors refuse a pass.

History mode runs `git log -p --root -m --full-history` over `HEAD`, local branches,
remote-tracking branches and tags. It intentionally does not use `--all`: local
checkpoint refs can identify trees rather than commits. It disables rename
coalescing, external diffs, text conversion, notes, signatures and replacement
objects, and uses full object IDs and a fixed commit marker. Eight context lines
allow ordinary split-line declarations to be recognized when the changed literal
or name is only part of the assignment. Context alone does not create a finding.

The parser validates C-quoted/octal UTF-8 paths, Git's separator tab for unquoted
space-containing paths, hunk counts and new-file line positions. Unknown formats
or unfinished hunks fail closed. A subsequently deleted secret remains visible
in its earlier addition. Merge-parent diffs and commits reachable only through a
branch, remote or tag are exercised by real temporary Git repositories.

Git's binary attribute is not an exemption. A distinguishing test initially
passed incorrectly when a plaintext token was marked `-diff` and subsequently
deleted. The corrected path reads the bounded raw old/new blob IDs. Actual
NUL-containing binary versions are reported; text versions are scanned. This
test now detects the deleted token without echoing it.

## Exact fixture review

The checked-in allowlist contains 286 closed-schema tuples of exact path, fixed
rule, SHA-256 of the exact matched value and a reason. No directory exclusions,
wildcard values, regular-expression exceptions or inline suppression are accepted.
The generic-key detector was retained; known public fixture values were reviewed
and recorded individually rather than weakening it to ignore test directories.

| Reviewed category | Exact tuples | Source basis |
|---|---:|---|
| Public signature/governance keys | 277 across 71 fixture files | [records.ts](../../packages/protocol/src/records.ts) derives `key` from the public key and verifies it with Ed25519 verification; [governance.ts](../../packages/protocol/src/governance.ts) defines public signature keys and identity pins. Each tuple was matched to one of those public JSON field shapes in the specific fixture. |
| Public evidence-file hashes | 3 | The `evidence_sha256` objects in [the historical publication scan receipt](consolidation-publication-scan-2026-10-30.json). Their filename keys contain the word `secret`; the values are public artifact hashes. |
| Published/deterministic seed or nonce inputs | 6 | One RFC 8032 seed in QV-34, two RFC 8032 seed vectors, the immutable CLI legacy-key fixture, and the deterministic ballot seed and nonce key. [The vector generator](../../packages/protocol/test/vecgen/generate.ts) uses the fixed `vec-ballot` scenario and derives the nonce key from that fixture voter. |

Current-tree matching permits only reviewed HEX tuples. Every non-HEX exception
requires a full immutable commit ID, so it can apply only to that historical
occurrence. There are no non-HEX exceptions in the shipped list. Tests reject
changed values, copied paths, wildcard paths, extra fields, duplicate tuples and
unbound/nonimmutable commit claims. A known historical token reintroduced in a
different commit is detected again.

## Bounds and deliberate limits

| Boundary | Limit and refusal behavior |
|---|---|
| Individual file, historical blob or reconstructed hunk | 16 MiB |
| Cumulative scan input | 256 MiB, including historical binary-blob inspection |
| Individual line / reconstructed text lines | 1 MiB / 200,000 lines |
| Files, patch sections, commit-marker records, or exclusion records | 100,000 in their respective counters |
| Unique findings / exception entries | 2,000 / 2,000 |
| Small Git command output / Git command duration | 32 MiB / 120 seconds; raw blob reads use the smaller file cap |

Exceeding a bound reports an incomplete scan and exits nonzero. Binary exclusions
remain visible; archive contents, arbitrary secret encodings, runtime-computed
values and deliberately obfuscated assignments are not decoded. Pattern and
context bounds are explicit, so a clean result is scoped evidence rather than a
claim that arbitrary code cannot contain a secret. Native Windows behavior and a
hosted Node22 run were not newly qualified in this Linux Node24 worktree.

## CI and verification

[The dedicated workflow](../../.github/workflows/secret-scan.yml) has no path
filter. It runs the tests and current-tree scan on every PR, main push, merge
queue, schedule and manual dispatch. Nightly and manual runs also scan history.
It uses the repository's existing full-SHA-pinned first-party checkout/setup-node
actions, full-history checkout, disabled persisted credentials, default-deny
permissions and job-level `contents: read`. There is no privileged PR event,
dependency installation or `continue-on-error`. Hosted execution and making this
job a required branch-protection check remain integration/owner-side evidence.

Local verification used Node 24.22.3 and Git in the Linux workspace:

- **21 scanner tests passed**, including seeded test-directory detection,
  redaction, exceptions, multiline literals, deterministic output, real Git path
  quoting, deleted/merged/ref-only history, shallow refusal, binary-attribute
  bypass prevention, incomplete input and docs-inclusive CI coverage.
- **39/39 combined tests passed** with the existing action-pin and workflow-input
  coverage tests. No test deadline or retry policy was changed.
- The actual current-tree scan passed with four reported binary exclusions. Its
  final documentation-inclusive scan is retained with the handoff evidence.
- The actual full available history scan passed over **609 reachable commits**,
  **16,263 text patch sections**, **236,998,018 input bytes** including inspected
  binary blobs, and six explicit binary-version exclusions. It reported no
  unexcepted finding and 32,899 allowed value occurrences.
- Existing workflow action pins verified; Markdown links and whitespace were
  checked during final handoff preparation.

The initial broad matcher produced 1,387 candidate lines. The reviewed tuple list
accounts for those public/synthetic values; no unexplained candidate was waived.
The real current scan counted 2,641 allowed occurrences because a compact JSON
line can contain multiple public-key occurrences.

## Frozen implementation source

Only these four implementation/configuration files and this report are owned by
the increment. No package manifest, lockfile, protocol source, vectors or fixture
bytes were changed.

| File | Git blob |
|---|---|
| `scripts/secret-scan.mjs` | `24560da081a91276643340342344f4ba8907149b` |
| `scripts/secret-scan.test.mjs` | `fb44ef5539df5ed530cd5d823a46252c51d8e77f` |
| `scripts/secret-scan-allowlist.json` | `78237fdd3519131763a1e6ce9c3dd8b332860fb6` |
| `.github/workflows/secret-scan.yml` | `e75d87303c099e81b3aa6a94595a6b8ed083dda5` |


## Independent integration follow-up

The five-file frozen handoff above was integrated with exact Git-blob checks.
Review then found that `openSync` could wait for a writer when a tracked regular
file had been replaced by a FIFO: regular-file validation happened only after
the blocking open. A bounded real-filesystem regression failed on that source
with `ETIMEDOUT` after three seconds. The open now also requests `O_NONBLOCK`
where supported, so the descriptor can be inspected and refused before reading.
The unchanged regression passes for both an ordinary tracked path and the
allowlist path. It is explicitly skipped on Windows, where this POSIX fixture
is unavailable; Linux Node 24.22.3 and Node 22.20.0 both run it.

All 22 scanner tests pass on the composed source: 2.951 seconds on Node 24 and
1.773 seconds on Node 22, with zero skips on this platform. The original
one-case failure and unchanged passing rerun are retained. Existing symlink
checks describe the observed path components and the final open flags; they
are not a proof against hostile concurrent ancestor replacement or a native
custody guarantee. Final composed repository scan counts are in
[the R28 receipt](../audits/CONTINUATION_R28_20261127.md).
