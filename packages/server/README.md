# @quietvote/server

See docs/08-architecture-deployment.md and docs/30-engineering-standards.md.

## Executable and local operations

Run `node packages/server/bin/qv-server.ts --config /absolute/path/server.json`
from the repository root. Use `--check-config` for strict configuration validation
without data/key creation. See [launcher configuration and deployment examples](../../deploy/README.md)
for the complete contract, health checks, graceful shutdown and known operational limits.
