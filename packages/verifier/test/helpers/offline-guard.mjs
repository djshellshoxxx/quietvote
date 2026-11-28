// SPDX-License-Identifier: AGPL-3.0-or-later
// Test preload: refuse standard Node outbound connectors before either real CLI is imported.
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

function deny() {
  process.stderr.write('QV_TEST_OUTBOUND_ATTEMPT\n');
  throw new Error('offline test refuses outbound network');
}
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
tls.connect = deny;
for (const client of [http, https]) for (const name of ['request', 'get']) client[name] = deny;
for (const client of [dns, dnsPromises, dns.Resolver.prototype, dnsPromises.Resolver.prototype]) {
  for (const name of Object.getOwnPropertyNames(client)) if (/^(?:lookup|resolve|reverse)/.test(name) && typeof client[name] === 'function') client[name] = deny;
}
syncBuiltinESMExports();
