# Python verifier static import and dependency boundary

Date: 2026-11-27 (America/Vancouver)

## Scope and baseline

Implemented on PR #78 base `c110e06bc584e642e9130a82f7a16493ad8b12e3`.
[QV-35-REQ-001](../35-second-verifier.md) identifies an automated import scan as
missing; QV-35-REQ-009 requires no third-party runtime dependencies. The existing
CI ran Python unit tests and vectors but had no import/dependency scanner.

At this source, the runtime contains 25 Python modules totaling 225,739 bytes.
Its absolute import roots are 19 stdlib roots plus `qv_verifier`. The existing
`requirements.txt` contains comments only. No runtime module or dependency
declaration is changed by this work.

The new [`check_imports.py`](../../verifier-py/check_imports.py) uses Python's
stdlib AST parser and filesystem APIs. It does not import a verifier module,
execute scanned source, install packages, load native artifacts or contact a
network service. A marker-writing fixture proves that scanning a valid module
does not execute its top-level code.

## What the check establishes

The scanner reads runtime `.py` sources under `qv_verifier/`, including imports
inside functions and conditional branches. It checks absolute import roots
against the running interpreter's stdlib inventory and the local module tree.
Relative imports must stay inside that tree; local modules and named exports
must be statically present. Missing and malformed source cannot produce a clean
result. Comments and strings that merely mention import syntax are ignored.

It also checks the empty runtime dependency declaration, sibling stdlib-shadow
names, symlinked sources and native runtime artifacts. Requirements options and
included requirement files count as dependency declarations; they are not fetched
or interpreted as an installation request.

Specific visible process, dynamic-code, loader and FFI references receive findings,
including conventional import aliases and simple assignments. Examples include
the executable members of `subprocess`, `os`, `ctypes`, `importlib` and `runpy`,
and direct dynamic-code builtins. Importing these stdlib modules for ordinary
constants or types is permitted. File operations, normal introspection and
wildcard imports are retained; this is not a blanket ban on stdlib functionality.

Import-state reads are allowed. Assignments/deletions and known mutator methods
on `sys.path`, `sys.meta_path`, `sys.path_hooks`, `sys.path_importer_cache` and
`sys.modules` receive findings. The existing launcher intentionally repairs its
search path under `if not __package__`; exactly that top-level guarded AST form
in `qv_verifier/__main__.py` is recognized. Changing its parent path or adding a
path mutation elsewhere is covered by negative fixtures. The runtime launcher
itself is unchanged.

Limits are 128 parsed modules, 1,024 directory entries, 1 MiB per source, 8 MiB
of source bytes, 16 nested source-directory levels, and 100 reported findings.
The requirements file is limited to 64 KiB. File reads require a regular file,
use no-follow/nonblocking flags where available, and reject observed identity,
size or modification-time changes. Generated regular `__pycache__` directories
are not source inputs. Findings contain bounded relative paths, locations and
fixed codes rather than source excerpts or arbitrary exception details.

## Explicit limits

The JSON scope is **static import/dependency/obvious-bridge checks only**.
A clean scan does not establish authorship, absence of translated or copied
logic, semantic independence, cryptographic correctness, hostile filesystem
custody, or the behavior of arbitrary reflection or dynamically constructed code.
Alias handling is a syntactic approximation, not a whole-program data-flow proof.
This tool evaluates the present runtime tree and `requirements.txt`; future
packaging systems or loader mechanisms require their own review.

The existing `Mirrors packages/protocol/src/verify.ts` comment is preserved.
An AST scan cannot decide whether this describes behavior, copied logic or
development provenance. QV-35-REQ-014's reviewer other than the author, recorded
scope and decision-log evidence remain separate. No human review is fabricated
and no assurance level changes. QuietVote remains unaudited and not for real
elections.

## Commands and CI

```sh
python3 -I verifier-py/check_imports.py
python3 -I -m unittest discover -s verifier-py -p test_import_boundary.py -v
```

The checker emits deterministic JSON. Exit 0 means no finding in this bounded
scan; exit 1 means findings; exit 2 denotes argument usage errors. `--root`
selects a local verifier tree for fixtures or inspection. The tool does not
print absolute temporary paths or source contents.

The only CI change is one named step before Python unit tests in the existing
conformance job. It uses the runner's existing Python and the same read-only
job permissions; no action or dependency is added. Existing unit/vector commands
and outcomes are unchanged.

## Verification

On local Linux with Python **3.12.14**, the actual runtime scan reports **25
modules, 225,739 bytes, zero findings**. The dedicated suite passes **17/17
tests**, with no skipped cases. It covers existing source and launcher behavior,
allowed stdlib operations, multiline/aliased/local imports, reference/third-party
imports, missing local targets, relative escapes, known execution bridges,
dependency declarations, symlinks, shadowing, malformed/oversized source, source
and output limits, deterministic actual CLI outcomes, non-execution of inputs,
and ordering of the CI check.

The dedicated run took 0.461 seconds. The existing action-pin/workflow coverage
suite passes **18/18**, zero skipped, in 5.553 seconds; all three workflows pass
the action-pin scanner. Relative-link checks report 2,938 links in 446 files
with none broken. Requirement traceability structural checks and
`git diff --check` pass. The actual isolated directory launcher still completes
`--help` with exit 0. A Git comparison confirms that all runtime modules and
`requirements.txt` remain byte-for-byte unchanged from the base.

No full Python vector run or full application suite is repeated for this static
tool. No hosted, Python 3.11, or native Windows execution is claimed by these
local results.
