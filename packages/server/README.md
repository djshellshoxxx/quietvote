# @quietvote/server

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

## Executable and local operations

Prepare dependencies from the repository root with `npm ci --ignore-scripts` followed by `npm run vendor:install`. Before starting a checked-out candidate, `npm run vendor:check` verifies the installed cryptographic bytes and resolution against the recorded vendor snapshot.

Run `node packages/server/bin/qv-server.ts --config /absolute/path/server.json`
from the repository root. Use `--check-config` for strict configuration validation
without data/key creation. See [launcher configuration and deployment examples](../../deploy/README.md)
for the complete contract, health checks, graceful shutdown and known operational limits.

Node supervisors can spawn the executable with an IPC channel and send the exact
string `qv-server:shutdown` after its listening event. The launcher drains the
existing service lifecycle, releases the data-directory lock, disconnects IPC and
exits normally. This also supports Windows, where `child.kill('SIGTERM')` forcibly
terminates a child without running its JavaScript signal handler. Other IPC
messages are ignored; no network shutdown endpoint is exposed. POSIX signal
shutdown remains supported and tested separately.
