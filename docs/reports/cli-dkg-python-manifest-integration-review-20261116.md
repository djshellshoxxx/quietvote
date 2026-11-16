# CLI DKG and Python manifest integration review — 2026-11-16

The integrator independently reviewed the production deltas in `73d293c` and
`5a73bcd`; their root aliases are `8a66c0e` and `e60783e`.

The CLI adapter validates the public DKG vector transport before invoking the
existing production adjudicator, awaits its result, and compares all qualified
trustees, mask, joint key, context and public shares. It neither imports generator
code nor sorts/filters away adversarial input. Unknown operations remain explicit
and fail strict mode. Four actual-process tests passed after P1 integration:
4/4, no failures/skips, 3.467 seconds. Independent altered expectations exercise
computation beyond file-manifest hashes. Corpus bytes remain unchanged.

The Python manifest change implements the exact already accepted B1-05/PY-01
choices: remove only U+061C from the reject registry; accept Boolean false;
validate other manifest constraints before a named unsupported-mode refusal for
true. It does not implement trustee spoil cryptography or permit malformed flag
types. Seven tests passed in 0.402 seconds with the integrated P1 source, using
`python3 -I -m unittest discover -s tests -t . -p test_manifest_compatibility.py`.
The fixed positive hashes were independently computed by the unchanged TS
implementation; altered manifests cannot bypass coordinator signatures.

Integrated source `6f8bff6` also passed typecheck and production build: 198.9 KiB
all JavaScript, 96.0 KiB entry, 188.0 KiB standalone. No budget changed. No scoped
blocker found. These focused receipts do not replace final combined CI, the later
export/pin changes, or external protocol/security qualification.
