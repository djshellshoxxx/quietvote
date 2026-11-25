// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-19-REQ-022, QV-09-REQ-009
// Native Node fetch transport evidence; browser CORS qualification remains separate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ApiClient } from '../src/api/client.ts';

type Received = { url: string | undefined; readKey: string | string[] | undefined };

// Added split-origin boundary, not a claim that the previous client promised redirect refusal.
test('native fetch refuses an API redirect before forwarding a read credential', async (t) => {
  const seen: Received[] = [];
  const target = createServer((request, response) => {
    seen.push({ url: request.url, readKey: request.headers['qv-read-key'] });
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{}');
  });
  await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
  const targetOrigin = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
  const sourceSeen: Received[] = [];
  const source = createServer((request, response) => {
    sourceSeen.push({ url: request.url, readKey: request.headers['qv-read-key'] });
    response.writeHead(302, { Location: targetOrigin + (request.url ?? '/') }); response.end();
  });
  await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    source.closeAllConnections(); target.closeAllConnections();
    await Promise.all([source, target].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });
  const readKey = 'reviewReadKey0123';
  await new ApiClient({ baseUrl: targetOrigin, readKey }).election('same');
  assert.deepEqual(seen, [{ url: '/api/v1/elections/same', readKey }], 'direct selected-origin positive control');
  seen.length = 0;
  let failure: unknown;
  try { await new ApiClient({ baseUrl: `http://127.0.0.1:${(source.address() as AddressInfo).port}`, readKey }).election('same'); }
  catch (error) { failure = error; }
  assert.deepEqual(sourceSeen, [{ url: '/api/v1/elections/same', readKey }]);
  assert.deepEqual(seen, [], 'redirect target must receive no request or read key');
  assert.ok(failure, 'redirect must be returned as a transport failure');
});
