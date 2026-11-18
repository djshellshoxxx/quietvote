import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { SseClient } from './helpers/sse.ts';
import { World } from './helpers/world.ts';

function signal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('SSE: disconnect while loading the election releases the reserved stream and runtime', { timeout: 10_000 }, async () => {
  const w = new World({ seed: 'sse-before-attach', n: 3, t: 2, voters: 1, server: { maxSseStreams: 1, maxSseTotal: 1 } });
  await w.start();
  let healthy: SseClient | undefined;
  try {
    await w.setupOrgAndElection();
    const rt = (await w.server.pool.get(w.electionId))!;
    let subscriptions = 0;
    const subscribe = rt.subscribe.bind(rt);
    rt.subscribe = (subscriber) => { subscriptions++; return subscribe(subscriber); };
    const route = w.server.http.routes.find((r) => r.path === '/api/v1/elections/:id/events')!;
    const handler = route.handler;
    const reached = signal();
    const disconnected = signal();
    const attached = signal();
    // Hold the normal route until the real response has emitted close, as can happen while loading an election.
    w.server.http.server.once('request', (_req, res) => res.once('close', () => disconnected.resolve()));
    route.handler = async (ctx) => {
      reached.resolve();
      await disconnected.promise;
      const reply = await handler(ctx);
      return { ...reply, stream: (res, headers) => {
        try { reply.stream!(res, headers); } finally { attached.resolve(); }
      } };
    };
    const req = request(w.base + `/api/v1/elections/${w.electionId}/events`);
    req.on('error', () => {}); // intentional disconnect before any response
    req.end();
    await reached.promise;
    req.destroy();
    await attached.promise;
    route.handler = handler;

    assert.equal(w.server.sse.stats.active, 0, 'closed response must not retain an SSE slot');
    assert.equal(rt.inUse, 0, 'closed response must not pin the election runtime');
    assert.equal(subscriptions, 0, 'closed response must not subscribe to election events');
    healthy = await SseClient.open(w.base, `/api/v1/elections/${w.electionId}/events`);
    assert.equal(healthy.status, 200, 'the next client can use the single stream slot');
  } finally {
    healthy?.close();
    await w.stop();
  }
});
