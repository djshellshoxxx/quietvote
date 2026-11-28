# security.txt owner template and local validator — 2026-11-27

## Scope and plan

This completes the bounded local-file slice of
[process task T10](inventory-20261111/process.tasks.md#t10-securitytxt-template-and-validator)
and [QV-33-REQ-003](../33-vulnerability-disclosure.md). The plan was to preserve
the unconfirmed contact/hosting/key status in `SECURITY.md`, add an owner template,
validate supported unsigned-file syntax and expiry with Node built-ins, and run
the template check in CI. No contact, key, fingerprint or canonical host is
invented. No dependency or action is added.

`security/security.txt.template` contains four whole-field owner tokens:
Contact URI, Expires timestamp, Canonical URI and Preferred-Languages. Comments
state that it is unpublished, direct self-hosters to list operator contacts
first, and leave optional encryption/policy URIs to the owner. The existing
`SECURITY.md` and QV-33 text, including their open items, remain unchanged.

```sh
node scripts/check-security-txt.mjs
node scripts/check-security-txt.mjs --release path/to/security.txt
node --test scripts/check-security-txt.test.mjs
```

The default command validates the checked-in template regardless of the current
working directory. It reports template mode and four unresolved values. Release
mode rejects those values. Exit status is 0 for the selected validation mode
passing, 1 for validation findings, and 2 for usage/read failure. JSON contains
the mode, validity, placeholder count and line-numbered finite issue codes; it
does not echo contact values or arbitrary filesystem error text.

## Validation behavior

- UTF-8 decoding is strict. The parser checks NFC text, disallowed control
  characters, required LF/CRLF line endings, field framing and case-insensitive
  field names. Blank lines and comments are accepted. The supported file limits
  are 32 KiB, 1,000 lines and 2,048 characters per line, following RFC 9116 §5.4's
  permitted parser bounds. CLI input reads are capped at one byte above the file
  limit so an oversized regular file can be refused without loading it all.
- Contact is required at least once; Expires is required exactly once.
  Preferred-Languages is optional and cannot repeat. Canonical is optional and
  may repeat. Contact preference ordering is not rewritten.
- The six URI fields defined by RFC 9116 use RFC 3986 generic URI syntax.
  Percent escapes, authority syntax and IP literals are checked, and web URIs
  require HTTPS. This is not validation of each scheme's delivery semantics.
  Unknown extension fields receive text/framing checks without invented meaning.
- Preferred-Languages uses RFC 5646 structural checks, including the fixed
  grandfathered list and private-use tags, and refuses repeated variant or
  extension singleton subtags. It does not consult a current IANA registry or
  assert that the receiving team speaks a listed language.
- Concrete Expires values use calendar-valid RFC 3339 timestamps with an explicit
  UTC indicator or offset. Lowercase `t`/`z` and fractional seconds are accepted;
  invalid dates are not silently normalized. This offline profile does not
  support `:60` leap-second expiries because their validity depends on external
  leap-second announcements. Such input refuses validation.
- Only an exact expected owner token exempts its own field-value check in template
  mode. Required-field counts, duplicates and other concrete values still
  validate. A token inserted into the wrong field does not create an exemption.
  Release mode rejects marked placeholders, including percent-encoded markers,
  and known reserved example/invalid domains in URI hosts or mailto recipients.
  Internal hostnames are not automatically treated as owner placeholders; passing
  syntax does not establish that a host exists or can receive reports.
- OpenPGP clearsigned input is explicitly unsupported. This utility validates
  unsigned source text before any separate signing/publishing process; it does
  not strip signatures and then imply they were checked.

## Expiry policy and the annual wording discrepancy

T10 and QV-33-REQ-003 require **at least 30 days** remaining. Equality passes;
one millisecond less refuses. The duration is 30 × 24 hours measured from the
validation clock. Unit tests inject the clock; the CLI uses the current clock.

QV-33 §3 says the expiry must be **less than a year** ahead, while §14's checklist
says **at most one year**. The validator follows the stricter §3 wording, which
also satisfies §14: a concrete expiry must be strictly before the next UTC
calendar anniversary. Equality refuses. This is **QuietVote's local policy**;
RFC 9116 §2.5.5 makes the annual limit a recommendation, not an RFC MUST.

The anniversary preserves the UTC month/day/time in the following year. A
February 29 clock clamps to February 28 at the same UTC time in the following
non-leap year. The tests distinguish this from a fixed 365-day duration and from
JavaScript's automatic March 1 rollover. Fractional seconds finer than a
millisecond retain correct inclusive-minimum/exclusive-maximum decisions against
the integer-millisecond validation clock.

## Verification and source binding

Base: PR77 `6764bf231801a782a57b2778a344c6ab26063e9b`.
Environment: Linux, Node `24.22.3`, built-ins only. No `node_modules` installation
or unrelated server/browser suite was needed for this tool.

| Check | Result |
|---|---|
| Dedicated parser and actual CLI tests | 14 passed, 0 failed/skipped |
| Existing action-pin and workflow-input tests | 18 passed, 0 failed/skipped |
| Action-pin scanner | All 3 base workflow files verified |
| Default CLI invocation from another directory | Pass; template mode, 4 unresolved values |
| Actual release CLI on the checked-in template | Exit 1; all 4 owner fields refused |
| Actual release CLI on a concrete local fixture | Pass; input bytes unchanged |
| `git diff --check` | Passed |

The tests cover the exact 30-day and annual boundaries, equivalent numeric time
offsets, leap-day anniversary handling, invalid calendar dates, malformed UTF-8,
NFC, line endings, missing/duplicate fields, valid and invalid URI forms, language
tag structures, partial templates, reserved examples, resource limits and bounded
CLI errors. All fixtures remain local; no reporting endpoint is contacted.

| Tested file | Git blob |
|---|---|
| `security/security.txt.template` | `58fa19afd31b9c290ad7206fb0a4722ee29dcd90` |
| `scripts/check-security-txt.mjs` | `304598ddee54e8e2ff15aaed67d13cc45184990c` |
| `scripts/check-security-txt.test.mjs` | `3a76038538b9575949ac1889be86137b139d9d1a` |
| `.github/workflows/ci.yml` | `6444a7b3fb33108c63d74fa0ff1218c6e003aff3` |
| Unchanged `SECURITY.md` | `bce7f3d59c2613f4c4eaf548180caf8cd7c18ea0` |
| Unchanged QV-33 | `eeb1f70bd3eddf78571e5a18c345a16f3325b824` |

CI adds only the template-mode command after existing lockfile lint and before
dependency installation. Existing path filters already include the `.template`
and `.mjs` inputs. The existing tools test step discovers the dedicated tests.
This CI delta is separate from the SBOM stdout step developed in another tree.

## Remaining owner boundaries

The template is not a published RFC 9116 file. QV-33-REQ-003's serving requirement
remains open until the owner supplies and verifies values and deploys a concrete
file at the appropriate host. Validation does not prove DNS, TLS, Content-Type,
canonical retrieval identity, private-channel operation, key ownership,
signature validity, response staffing or authorization to test a service. Existing
private-reporting, key publication and contact open items remain in force.

Primary references:

- [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html), §§2–5: field syntax,
  multiplicity, URI requirements, expiry and publication/parser limits.
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986.html), §3: generic URI syntax.
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html), §§5.6–5.7: timestamp
  grammar, calendar restrictions and leap-second considerations.
- [RFC 5646](https://www.rfc-editor.org/rfc/rfc5646.html), §2: language-tag
  well-formedness and the distinction from registry-backed validity.
- [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606), §§2–3: reserved example and
  invalid domains.
