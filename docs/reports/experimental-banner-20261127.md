# Experimental build disclosure

Date: November 27, 2026 (America/Vancouver).

## Requirement and plan

[QV-27-REQ-006](../27-project-governance-release.md) requires the exact wording
“Experimental — not for binding elections” in CLI version output, the server
banner, UI and README until the external audit gate passes. The existing CLI
printed only its version, and server startup printed only its listening event.
The UI and README already warned about the project's incomplete assurance, but
did not contain the prescribed wording.

The plan was to add that wording at the four existing presentation points,
preserve their operational interfaces, and extend the existing executable and
rendered-UI acceptance checks. This is a disclosure correction, not attainment
of an assurance level or release approval.

## Implemented behavior

- `qv --version` and `qv version` retain the version on the first line and print
  the required disclosure on the next line.
- A successfully started `qv-server` writes the disclosure once to stderr.
  Its stdout listening event remains JSON. Configuration validation and failed
  startup retain their existing output and exit behavior.
- The existing English UI banner begins with the required wording and keeps
  its independent-audit and consequential-vote warnings. This ordinary message
  is not one of the 63 guarantee entries. The five unreviewed, unoffered
  translated catalogs and their review metadata remain unchanged.
- README's current-status section contains the exact visible disclosure.
  The separate [release-note tools](release-dossier-20261127.md) require the
  same wording in `CHANGES.md` and generated release checklists.

## Validation

The existing top-level CLI test passes for both version spellings, using both
the in-process interface and actual executable. It also retains help, invalid
command and verifier exit checks: **1/1 selected test passed**, zero skips,
2.899 seconds.

The full server launcher file passes **7/7 tests**, zero skips, 6.578 seconds.
Both real SIGTERM and parent-IPC lifecycles check the single stderr banner after
the child streams close, along with readiness, successful exit and released
directory ownership. The existing configuration and startup-refusal cases pass.

Scoped i18n checks and the root and explicit server-bin/browser TypeScript
checks pass. The existing production browser help journey now checks the exact
wording in the visible notice. Its final composed browser result is recorded in
[R28](../audits/CONTINUATION_R28_20261127.md).

No new dependency, version number, release channel, reviewer or audit result is
introduced. The banner remains unconditional for this Experimental source.
