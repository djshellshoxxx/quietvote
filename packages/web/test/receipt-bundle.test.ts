// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../src/api/client.ts';
import { boundedReceiptBundleText } from '../src/api/receipt-bundle.ts';

test('receipt bundle bound counts streamed bytes and rejects understated or missing length', async () => {
  for (const length of [undefined, '1']) {
    let cancelled = false;
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('éé')); controller.enqueue(new TextEncoder().encode('é')); }, cancel() { cancelled = true; } }),
      { headers: length === undefined ? {} : { 'Content-Length': length } });
    await assert.rejects(boundedReceiptBundleText(response, new AbortController().signal, 5));
    assert.equal(cancelled, true);
  }
  assert.equal(await boundedReceiptBundleText(new Response('éé'), new AbortController().signal, 4), 'éé');
});

test('receipt bundle decoding is strict and cancellation releases a stalled reader', async () => {
  await assert.rejects(boundedReceiptBundleText(new Response(new Uint8Array([0xff])), new AbortController().signal));
  let cancelled = false;
  const scope = new AbortController();
  const reading = boundedReceiptBundleText(new Response(new ReadableStream({ cancel() { cancelled = true; } })), scope.signal);
  scope.abort(); await assert.rejects(reading); assert.equal(cancelled, true);
});

test('receipt bundle request uses private read headers and a body deadline without retry', async () => {
  const requests: { input: string; init?: RequestInit }[] = [];
  let cancelled = false;
  const api = new ApiClient({ readKey: 'READ_CANARY', timeoutMs: 25, fetch: async (input, init) => {
    requests.push({ input, ...(init === undefined ? {} : { init }) });
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } });
  await assert.rejects(api.receiptStatusBundle('a'.repeat(26), new AbortController().signal));
  assert.equal(requests.length, 1); assert.equal(cancelled, true);
  assert.ok(requests[0]!.input.endsWith('/export.json?board=1')); assert.ok(!requests[0]!.input.includes('READ_CANARY'));
  assert.equal(new Headers(requests[0]!.init?.headers).get('QV-Read-Key'), 'READ_CANARY');
  assert.equal(requests[0]!.init?.credentials, 'omit'); assert.equal(requests[0]!.init?.redirect, 'error');
});

test('receipt bundle pre-abort makes no request and active cancellation releases the body', async () => {
  let calls = 0, cancelled = false;
  const api = new ApiClient({ fetch: async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled = true; } })); } });
  const before = new AbortController(); before.abort(); await assert.rejects(api.receiptStatusBundle('a', before.signal)); assert.equal(calls, 0);
  const active = new AbortController(), reading = api.receiptStatusBundle('a', active.signal);
  await new Promise<void>((resolve) => setImmediate(resolve)); active.abort(); await assert.rejects(reading);
  assert.equal(calls, 1); assert.equal(cancelled, true);
});

test('receipt status errors discard their body without parsing unbounded problem text', async () => {
  let cancelled = false;
  const api = new ApiClient({ fetch: async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"detail":"CANARY<svg/onload=1>"}'));
  }, cancel() { cancelled = true; } }), { status: 503, headers: { 'Content-Type': 'application/problem+json' } }) });
  await assert.rejects(api.receiptStatusBundle('a', new AbortController().signal), (error: unknown) => error instanceof Error && !error.message.includes('CANARY'));
  assert.equal(cancelled, true);
});
