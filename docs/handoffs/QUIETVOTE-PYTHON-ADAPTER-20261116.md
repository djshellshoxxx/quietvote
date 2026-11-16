# Python JSON Lines adapter milestone — 2026-11-16

Base: `28d9e23`; production implementation: `c08ce6b536b6a1f576c9573e42f9743db12dd101`.
Branch/worktree: `codex/qv-python-adapter`, `qv-python-adapter`.

The missing QV-34 §10.2 stdin/stdout interface is implemented as
`python3 -I verifier-py/qv_verifier adapter --tree test-vectors/v1`.
It performs the specified handshake and independently dispatches known Python
operations. It does not read expected outputs, call TypeScript, change the corpus,
or claim a complete P0/P1 profile. The CLI and detailed interface/limits are in
`verifier-py/README.md`.

## Implemented boundaries

- Strict bounded JSON Lines, duplicate-key/noninteger rejection, closed request
  envelope, bounded identifiers/operation names, flushed response before EOF,
  recovery after a malformed request, and terminal oversized framing.
- Explicit root-relative artifact reads through a pinned directory descriptor.
  Reject parent/absolute paths, symlinks and special files; nonblocking open prevents
  FIFO hangs. A renamed/replaced root path cannot redirect the pinned handle.
  Unsupported platforms fail file operations explicitly rather than using an
  unsafe fallback. Primitive operations remain available there.
- Existing independent `OPS`, full-election and log-evidence verification. Default
  missing log evidence yields INCOMPLETE. Only caller CLI `--content-only` enables
  that scoped verification; an artifact/request cannot authorize it. Bad supplied
  evidence and required witnesses retain their existing behavior.
- Unknown operations use `ERR_UNSUPPORTED_OP`. Known QV errors remain named.
  Exact log check maps are output; informational details preserve all findings.
  The first deterministic emitted code is the envelope error when several exist.
- DKG requires integer `1 <= t <= n <= 32` before loops. Direct ballot producer,
  verifier and spoil inputs validate the existing manifest before processing its
  selection sizes. Cryptography and underlying operation implementations are unchanged.

## Validation

Python 3.12.14, Linux. The 13 original focused tests passed in 3.936 seconds;
the final 15-test suite adds actual interactive flushing and pinned-root replacement
regressions and passed in 3.829 seconds. It includes real subprocess crypto positives
and negatives, default/content-only election outputs, tampered signatures/board
evidence, invalid handshake, malformed/oversized input, bounds, path escape,
symlink/FIFO rejection, response limits and unsupported safe file I/O.

The unchanged vector sweep passed **282/282**, with all **79** manifest-listed
file hashes matching and no unsupported cases. This is the existing direct runner
receipt; it is not a claim that the new adapter has independently been driven by
the not-yet-shipped external conformance runner through every profile operation.

The full Python suite at production source `c08ce6b` passed **182 tests** in
**138.474 seconds**, using `python3 -I -m unittest discover -s tests -t .` from
`verifier-py/`. The later two tests change no production source and are covered by
the focused 15-test receipt above; overlapping totals must not be summed. The
earlier 181-test pass (141.133 seconds) began before final resource guards and is
not used as the final-source acceptance claim.
Root performs the fresh adapter review; its findings/receipt are separate from
the author's tests. No Windows/macOS file-mode qualification is claimed.

## Fresh continuation

The next independent Python milestone is the separate experimental signed-group
rules contract in `docs/GOVERNANCE-CORE.md`, with immutable fixture inputs in
`test-vectors/governance/v1/cases.json` from the governance-core author. Implement
only after that author's corrected contract freeze: a pre-freeze self-review found
and is repairing a ratifying-manifest/rules hash cycle. Root will supply the final
source SHA. Implement from that byte contract and normative policy schema, not a translation of the
TypeScript implementation. Fixture ratification callbacks are harness assertions,
not actual verified governed elections. Preserve pending ratification, external
identity/genesis pins, old-steward authorization, strict report scope, and no
suite-v1 activation. Root assigns a fresh agent for that milestone.
