// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import test from 'node:test';
import { promisify } from 'node:util';
import { World } from '../../server/test/helpers/world.ts';
import { BIN, qv } from './helpers.ts';

const exec = promisify(execFile);
const instance = { instance_id: 'test-instance', server_version: '0.1.0', api_versions: ['1.0'], protocol_suites: ['qv1-r255-sha2'] };
const paths = ['/healthz', '/readyz', '/api/v1/instance'];
const bodyFor = (path: string): unknown => path === '/healthz' ? { status: 'ok' } : path === '/readyz' ? { status: 'ready' } : instance;

async function fixture(reply: (path: string, response: ServerResponse) => void) {
  const seen: { method: string | undefined; path: string; authorization: string | undefined }[] = [];
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    seen.push({ method: request.method, path, authorization: request.headers.authorization });
    reply(path, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { base: `http://127.0.0.1:${address.port}`, seen,
    stop: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

test('health checks the actual running server through the shipped CLI without an account', { timeout: 30_000 }, async (t) => {
  const world = new World({ seed: 'cli-service-health', n: 2, t: 2, voters: 3, freshConnections: true });
  await world.start();
  try {
    const { stdout, stderr } = await exec(process.execPath, [BIN, 'health', world.base, '--json'],
      { encoding: 'utf8', timeout: 15_000, signal: t.signal });
    const result = JSON.parse(stdout);
    assert.equal(result.scope, 'service-health', stderr);
    assert.equal(result.ready, true);
    assert.equal(result.election_verified, false);
    assert.deepEqual(result.checks, paths.map((path) => ({ path, ok: true, detail: 'ok' })));
    const text = await qv(['health', world.base]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /service health: READY/);
    assert.match(text.out, /election integrity and release authenticity are unchecked/);
  } finally { await world.stop(); }
});

test('health preserves partial results, uses three unsigned GETs and excludes extra response fields', async () => {
  const server = await fixture((path, response) => {
    response.writeHead(path === '/readyz' ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(path === '/readyz'
      ? { code: 'MAINTENANCE', message: 'private diagnostic must not be printed' }
      : { ...(bodyFor(path) as object), token: 'response-only-private-value' }));
  });
  try {
    const result = await qv(['health', server.base, '--json']);
    assert.equal(result.code, 1, result.err);
    const report = JSON.parse(result.out);
    assert.equal(report.ready, false);
    assert.deepEqual(report.checks.map((check: { ok: boolean }) => check.ok), [true, false, true]);
    assert.match(report.checks[1].detail, /HTTP 503 MAINTENANCE/);
    assert.doesNotMatch(result.out + result.err, /private diagnostic|response-only-private-value|token/);
    assert.deepEqual(server.seen.sort((a, b) => a.path.localeCompare(b.path)),
      [...paths].sort().map((path) => ({ method: 'GET', path, authorization: undefined })));
  } finally { await server.stop(); }
});

test('health requires the documented success bodies and usable instance metadata', async () => {
  const replies = new Map<string, unknown>([['/healthz', { status: 'unknown' }], ['/readyz', { status: 'ok' }], ['/api/v1/instance', {}]]);
  const server = await fixture((path, response) => response.end(JSON.stringify(replies.get(path))));
  try {
    const result = await qv(['health', server.base, '--json']);
    assert.equal(result.code, 1, result.err);
    assert.ok(JSON.parse(result.out).checks.every((check: { ok: boolean }) => check.ok === false));
    replies.set('/healthz', { status: 'ok' }); replies.set('/readyz', { status: 'ready' });
    replies.set('/api/v1/instance', { ...instance, api_versions: [] });
    assert.equal((await qv(['health', server.base])).code, 1);
    replies.set('/api/v1/instance', instance);
    assert.equal((await qv(['health', server.base])).code, 0);
  } finally { await server.stop(); }
});

test('health refuses malformed, oversized and redirect responses without following redirects', async () => {
  const server = await fixture((path, response) => {
    if (path === '/healthz') { response.end('{'); return; }
    if (path === '/readyz') { response.writeHead(302, { location: '/redirect-target' }); response.end(); return; }
    response.end(' '.repeat(64 * 1024 + 1));
  });
  try {
    const result = await qv(['health', server.base, '--json']);
    assert.equal(result.code, 1, result.err);
    const report = JSON.parse(result.out);
    assert.ok(report.checks.every((check: { ok: boolean }) => check.ok === false));
    assert.match(report.checks[0].detail, /invalid health response/);
    assert.match(report.checks[2].detail, /configured limit/);
    assert.equal(server.seen.length, 3);
    assert.ok(server.seen.every((request) => paths.includes(request.path)));
  } finally { await server.stop(); }
});

test('health deadlines include stalled response bodies and connection refusal is non-success', { timeout: 10_000 }, async () => {
  const server = await fixture((_path, response) => { response.writeHead(200); response.flushHeaders(); });
  try {
    const result = await qv(['health', server.base, '--timeout-ms', '50', '--json']);
    assert.equal(result.code, 1, result.err);
    const report = JSON.parse(result.out);
    assert.equal(report.ready, false);
    assert.equal(report.checks.length, 3);
    assert.ok(report.checks.every((check: { detail: string }) => /failed or timed out/.test(check.detail)));
  } finally { await server.stop(); }
  const refused = await qv(['health', server.base, '--timeout-ms', '1000', '--json']);
  assert.equal(refused.code, 1, refused.err);
  assert.equal(JSON.parse(refused.out).ready, false);
});

test('health validates origin, arguments and deadlines before making requests', async () => {
  const server = await fixture((_path, response) => response.end('{}'));
  try {
    for (const argv of [
      [], [server.base, 'extra'], [server.base, '--typo'], [server.base, '--timeout-ms', '0'],
      [server.base, '--timeout-ms', '120001'], [server.base, '--timeout-ms', '1.5'],
      [server.base, '--timeout-ms', '1', '--timeout-ms', '2'], ['http://example.com'],
      [`${server.base}/other`], [`${server.base}/?q=1`], [`${server.base}/#fragment`],
      [server.base.replace('http://', 'http://user:password@')], ['not-a-url'],
    ]) {
      const result = await qv(['health', ...argv]);
      assert.equal(result.code, 2, JSON.stringify(argv) + result.err);
      assert.equal(result.out, '');
    }
    assert.equal(server.seen.length, 0);
  } finally { await server.stop(); }
});
