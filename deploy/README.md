# Experimental server launcher

`qv-server` assembles the existing server and HTTP API. This is local operational
scaffolding for the unaudited prototype; it does not resolve registration B3-01,
verifier semantics D-92…D-96, external review, or real-election release gates.

From a checkout with Node >=22.18, prepare the exact dependencies before starting the service:

```sh
npm ci --ignore-scripts
npm run vendor:install
npm run vendor:check
node packages/server/bin/qv-server.ts --config /absolute/path/server.json --check-config
node packages/server/bin/qv-server.ts --config /absolute/path/server.json
```

The package declares `qv-server` as its executable. `--help` describes its complete
argument grammar. Unknown/repeated options and positionals fail. Exit 0 means
config validation succeeded, help printed, or a running service shut down cleanly;
2 means invalid arguments/configuration; 1 means startup/shutdown failure.
On POSIX, SIGINT/SIGTERM stop the existing services, close connections and databases, and
await the existing service cleanup. HTTP shutdown force-closes remaining connections;
it does not guarantee that every in-flight client receives a response. The listening event on stdout includes only bind host/port, never
tokens or the complete configuration. Operational events use the existing stderr
JSON logger. Startup errors are deliberately generic to avoid exposing secrets.

For a Node parent supervisor on Windows or POSIX, spawn the executable with an
IPC channel (`stdio: ['ignore', 'pipe', 'pipe', 'ipc']`). After receiving the
listening event, send the exact string `qv-server:shutdown` with `child.send()`.
The launcher completes the same cleanup, disconnects IPC and exits 0; other
messages are ignored. This channel is inherited from the parent, not exposed
over HTTP. Windows `child.kill('SIGTERM')` terminates the process abruptly and
does not exercise graceful cleanup. Forced termination still leaves the
data-directory lock for deliberate recovery as described below.

## Configuration

Copy `server.example.json`, replace the public origin, and choose the registration
policy explicitly. `dataDir` and optional `staticDir` must be absolute. `publicUrl`
must be an exact HTTP(S) origin, without credentials, trailing slash, path, query
or fragment: it becomes part of the signed management-request audience. Set the
same origin in clients and the reverse proxy. The default bind host is loopback;
port defaults to 0 (ephemeral), so configure a stable port for a service.

Required: `dataDir`, `publicUrl`, `registrationMode` (`closed`, `token`, `open`).
Token mode also requires a nonempty `registrationTokens` array. Closed mode blocks
new organization registration; initialize organizations using an explicitly
chosen registration mode before switching to closed. `adminKeys` seeds existing
strict Ed25519 public keys as instance administrators, not private signing keys.
The launcher does not generate operator identities or bootstrap organizations.

Optional fields: `host`, `port`, `staticDir`, `adminKeys`, `registrationTokens`,
`allowedOrigins`, `witnesses` (`name`, `publicKey`), `gossipPeers`, `rate`, and the
integer operational limits listed in
`packages/server/src/launcher-config.ts`. Public keys use 64 lowercase hex digits.
Origins are exact HTTP(S) origins. Witness names/keys must be unique. Each `rate`
class accepts `limit`, `windowSec`, optional `burst`; class names are `read`,
`proof`, `writeKey`, `writePre`, `auth`, `manage`, `export`, `gossip`, `inviteFail`.
Existing compiled-in service bounds apply. Unknown fields, duplicate JSON keys,
wrong types, fractional limits, and configuration files over 64 KiB fail before
server assembly. Proxy `bucketHeader`, release signing seeds, callbacks and test
seams are intentionally unavailable in this JSON interface. Set up proxy/TLS and
static release integrity separately rather than trusting client-provided headers.

Protect config files as secrets if they contain registration tokens (owner read
only). `--check-config` performs syntax/type/policy/hard-bound validation only: it
does not create the data directory or keys, check disk permissions/free space,
load static assets, test DNS, probe a port, verify a backup, or replace the planned
`quietvote doctor` acceptance checks.

## Local smoke test

Use a temporary absolute data path, loopback host, a loopback public origin, port
0 and registration `closed`. Start the command, read the listening JSON event,
then GET `/healthz` and `/readyz` on that bind host/port. Send SIGTERM on POSIX or
the parent IPC shutdown message on either platform and wait for exit 0. The
automated `packages/server/test/launcher.test.ts` exercises this
flow against the real server. These health endpoints show liveness/database
availability; they are not election-integrity or complete deployment-readiness
certificates.

## Container and systemd examples

Build from the repository root with `docker build -f deploy/Dockerfile .`.
The image explicitly installs the verified copies from `vendor/` after its production-only dependency restore. It serves the API; no web build is bundled. For Compose, copy the example
to `deploy/compose.yml` and create `deploy/server.json` and `deploy/data` first.
Set container `host` to `0.0.0.0` while retaining the host-side loopback port bind;
set `dataDir` to `/var/lib/quietvote`. Make data writable by the image's `node`
user (UID 1000) and config readable by that user. Place a separately configured
TLS reverse proxy in front only when that deployment is authorized. Config and
static assets should not be writable by the application user. No Docker build or
Compose deployment is implied by the presence of these examples.

For systemd, provision a dedicated `quietvote` account, place the checkout and its
installed dependencies at `/opt/quietvote`, create `/etc/quietvote/server.json`,
and review the example unit before installing it. Adjust the Node executable
path to the installed supported runtime. `StateDirectory` provisions the writable
data directory. The unit's config check intentionally has no filesystem side
effects. Do not run two instances against the same data directory. See
`packages/server/DATA-LOCK.md` for lock ownership and crash recovery; never
remove a lock while another process may still use that data volume.

## Backup, recovery and upgrades

Retain the existing backup/restore and upgrade requirements in
`docs/12-operations-administration.md`; this launcher does not implement an offline
restore tool or make a restore drill pass. Preserve the instance KEK separately
from database archives and protect both. Never replace a missing KEK over existing
wrapped data. Before an upgrade, stop writes, obtain and verify an application
backup, separately retain required key material and the exact config/source SHA,
and test restoration in an isolated copy. Do not migrate or roll back an active
election without an approved procedure. A stopped whole-directory copy contains
the KEK and encrypted records together and needs secret-level protection.
