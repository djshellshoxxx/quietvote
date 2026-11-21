// A scripted stand-in for GET /elections/{id}/events (QV-09 §9): each connection is a controllable text/event-stream body, so tests
// decide exactly which bytes arrive when, where the chunk boundaries fall, and when the socket dies. Compose it with FakeBoard:
// route URLs ending in /events here and everything else to board.fetch.
import type { FetchLike } from '../../src/api/client.ts';

export interface FakeConn {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal | undefined;
  /** Raw text to the client (any chunking). */
  write(text: string): void;
  /** Whole frame like server/src/sse.ts frame(). */
  frame(id: number, type: string, data: unknown): void;
  /** Server closes the stream cleanly. */
  end(): void;
  /** Connection breaks mid-stream. */
  fail(): void;
  closed: boolean;
  aborted: boolean;
}

export type Behavior = 'ok' | { status: number; code?: string; headers?: Record<string, string> } | { contentType: string } | 'network';

export class FakeSseServer {
  readonly conns: FakeConn[] = [];
  /** Consumed one per connection attempt; empty means 'ok'. */
  script: Behavior[] = [];
  private waiters: (() => void)[] = [];

  readonly fetch: FetchLike = async (input, init) => {
    const url = new URL(input, 'http://board.test');
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const b = this.script.shift() ?? 'ok';
    if (b === 'network') throw new TypeError('fetch failed');
    if (typeof b === 'object' && 'status' in b) {
      return new Response(JSON.stringify({ status: b.status, code: b.code ?? 'ERR', detail: 'x', retryable: b.status >= 500 }), { status: b.status, headers: { 'Content-Type': 'application/problem+json', ...b.headers } });
    }
    const enc = new TextEncoder();
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const conn: FakeConn = {
      url: url.pathname + url.search, headers, signal: init?.signal ?? undefined, closed: false, aborted: false,
      write: (text) => { if (!conn.closed) ctl.enqueue(enc.encode(text)); },
      frame: (id, type, data) => conn.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
      end: () => { if (!conn.closed) { conn.closed = true; ctl.close(); } },
      fail: () => { if (!conn.closed) { conn.closed = true; ctl.error(new TypeError('network error')); } },
    };
    const body = new ReadableStream<Uint8Array>({
      start: (c) => { ctl = c; },
      cancel: () => { conn.closed = true; conn.aborted = true; },
    });
    init?.signal?.addEventListener('abort', () => {
      conn.aborted = true;
      if (!conn.closed) { conn.closed = true; try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* already closed */ } }
    }, { once: true });
    this.conns.push(conn);
    for (const w of this.waiters.splice(0)) w();
    const ct = typeof b === 'object' && 'contentType' in b ? b.contentType : 'text/event-stream; charset=utf-8';
    return new Response(body, { status: 200, headers: { 'Content-Type': ct } });
  };

  /** Resolves with the n-th connection (1-based) once it exists. */
  async connection(n: number): Promise<FakeConn> {
    while (this.conns.length < n) await new Promise<void>((r) => this.waiters.push(r));
    return this.conns[n - 1]!;
  }
}

export const entryEvent = (seq: number, type = 'ballot'): Record<string, unknown> => ({ seq, type, author: 'QUJD', leaf_hash: 'REVG' });
export const checkpointEvent = (size: number): Record<string, unknown> => ({ tree_size: size, root: 'AAAA', witnessed: false, cosigners: [], issued_at: '2026-10-21T10:00:00Z' });

/** Lets queued microtasks and I/O callbacks run. */
export const settle = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => setImmediate(r));
};
export async function until(cond: () => boolean, what = 'condition', ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise<void>((r) => setTimeout(r, 2));
  }
  if (cond()) return;
  throw new Error(`timed out waiting for ${what}`);
}
