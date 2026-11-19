# Public control reason admission

QV-ADR-027 B2-16 C-lite is implemented for newly submitted server controls and newly signed CLI packets.
Both use the same 14-code QV-07 section 15.2 catalog. Reason omission remains permitted; `OTHER` is
a bare code. The server rejects arbitrary text before appending or logging it, and the CLI rejects
it before creating a signature file, including the additional-signature path.

This is an admission compatibility change, not a rewrite of historical evidence. Stored signed controls,
imports and independent verification keep the legacy bounded-text contract. No existing signature,
corpus expectation, cryptographic equation or database migration changes in this slice. Control replay
sequencing and full cross-verifier versioned reason enforcement are separate work.

The new HTTP regression failed on the initial source because the server accepted the private canary
as a public notice (HTTP 201 rather than 422). After the repair, five focused server/CLI tests passed:
rejected inputs do not change log size or echo private text; catalog codes and omission work;
ordinary restart retains historical signed free text; coordinator packets retain signature checks.
The initial replay test had a fixture error calling a nonexistent restart helper; that error was fixed
by stopping and restarting the real server without deleting its directory.

Validation command:

```sh
node --test packages/server/test/control-reasons.test.ts packages/cli/test/packet.test.ts
```

The source-specific typecheck and final composition qualification are recorded in the consolidation
verification report. This engineering evidence does not supply the required formal protocol reviews.
