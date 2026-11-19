// @verifies QV-08-REQ-034 QV-09-REQ-009
import assert from 'node:assert/strict';
import test from 'node:test';
import { World } from './helpers/world.ts';

test('split-origin SSE resume preflight permits the named Last-Event-ID header', async () => {
  const w = new World({ seed: 'split-cors-sse', n: 3, t: 2, voters: 0, server: { allowedOrigins: ['https://client.example'] } });
  await w.start();
  try {
    const r = await fetch(`${w.base}/api/v1/elections/${'a'.repeat(32)}/events`, { method: 'OPTIONS', headers: {
      Origin: 'https://client.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'last-event-id,qv-read-key',
    } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), '*', 'existing public GET CORS stays credential-free');
    assert.ok(r.headers.get('access-control-allow-headers')!.split(/,\s*/).includes('last-event-id'));
    assert.equal(r.headers.get('access-control-allow-credentials'), null);
    assert.ok(!r.headers.get('access-control-allow-headers')!.includes('*'));
  } finally { await w.stop(); }
});

test('allowed management error responses expose retry/rate/request metadata without permitting another origin', async () => {
  const w = new World({ seed: 'split-cors-errors', n: 3, t: 2, voters: 0, server: { allowedOrigins: ['https://client.example'] } });
  await w.start();
  try {
    for (const origin of ['https://client.example', 'https://other.example']) {
      const r = await fetch(w.base + '/api/v1/orgs', { method: 'POST', headers: { Origin: origin, Authorization: 'invalid', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(r.status, 400);
      assert.equal(r.headers.get('access-control-allow-origin'), origin === 'https://client.example' ? origin : null);
      assert.equal(r.headers.get('access-control-allow-credentials'), null);
      if (origin === 'https://client.example') {
        const exposed = r.headers.get('access-control-expose-headers')?.toLowerCase().split(/,\s*/);
        for (const name of ['retry-after', 'ratelimit-remaining', 'x-request-id']) assert.ok(exposed?.includes(name), name);
        assert.equal(r.headers.get('vary'), 'Origin');
      }
    }
  } finally { await w.stop(); }
});
