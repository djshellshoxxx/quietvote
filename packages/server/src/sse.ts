// GET /elections/{id}/events: Server-Sent Events over HTTP/1.1 chunked streaming (QV-09 §9, QV-09-REQ-010).
//
// Delivery is at-least-once and ordered per election: every client owns a cursor into the durable `event` outbox and
// is fed from it. The only per-client memory is the batch currently being written (`sseBatch` rows) plus whatever the
// socket buffers; a client that cannot drain it (backpressure for `sseSlowClientMs`, or more than `sseMaxBufferBytes`
// queued) is dropped and may reconnect with Last-Event-ID. Memory per client therefore never depends on the number of events.
import type { ServerResponse } from 'node:http';
import type { Ctx, Reply } from './http.ts';
import type { ElectionRuntime } from './election.ts';
import type { EventRow } from './electiondb.ts';
import type { Env } from './env.ts';
import { ApiError } from './problem.ts';

export interface SseStats {
  opened: number;
  active: number;
  droppedSlow: number;
  droppedIdle: number;
  rejected: number;
  resumed: number;
}

export function frame(r: EventRow): string {
  // `data` is single-line JSON produced by JSON.stringify, so it can never contain a frame delimiter.
  return `id: ${r.id}\nevent: ${r.type}\ndata: ${r.data}\n\n`;
}

const LAST_ID_RE = /^\d{1,12}$/;

export class SseHub {
  readonly stats: SseStats = { opened: 0, active: 0, droppedSlow: 0, droppedIdle: 0, rejected: 0, resumed: 0 };
  private readonly env: Env;
  private readonly perBucket = new Map<string, number>();
  private readonly clients = new Set<{ end(reason: string): void }>();

  constructor(env: Env) {
    this.env = env;
  }

  /** Validates, reserves a slot and returns a streaming reply. Throws problem+json before any byte is streamed. */
  open(c: Ctx, rt: ElectionRuntime): Reply {
    const cfg = this.env.cfg;
    const hdr = c.header('last-event-id');
    const raw = hdr !== undefined && hdr !== '' ? hdr : c.query.get('last_event_id') ?? undefined;
    if (raw !== undefined && !LAST_ID_RE.test(raw)) throw new ApiError(400, 'BAD_REQUEST', 'Last-Event-ID must be a non-negative integer');
    const resume = raw === undefined ? undefined : Number(raw);

    rt.pruneEventsIfExpired();
    const last = rt.edb.lastEventId();
    if (resume !== undefined) {
      const b = rt.edb.eventBounds();
      // events (resume, last] must all still exist; otherwise the client resyncs from the log
      if (resume > last || (b !== undefined && resume < b.first - 1) || (b === undefined && resume < last)) {
        this.stats.rejected++;
        throw new ApiError(410, 'EVENT_GONE', 'events after that id are no longer retained; resynchronise from the log');
      }
    }
    if (c.method === 'HEAD') return { status: 200, contentType: 'text/event-stream; charset=utf-8', text: '' };

    if (this.clients.size >= cfg.maxSseTotal) {
      this.stats.rejected++;
      throw new ApiError(503, 'BUSY', 'too many event streams; retry later', { retryAfter: 5 });
    }
    const n = this.perBucket.get(c.bucket) ?? 0;
    if (n >= cfg.maxSseStreams) {
      this.stats.rejected++;
      this.env.logger.limitHit('S');
      throw new ApiError(429, 'RATE_LIMITED', `at most ${cfg.maxSseStreams} event streams per client`, { retryAfter: 5 });
    }
    this.perBucket.set(c.bucket, n + 1);
    const handle = { end: (_: string): void => undefined };
    this.clients.add(handle);
    this.stats.opened++;
    this.stats.active++;
    if (resume !== undefined) this.stats.resumed++;
    rt.inUse++;
    return {
      status: 200,
      stream: (res, headers) => {
        const end = this.attach(res, headers, rt, resume ?? last, c.bucket, () => {
          this.clients.delete(handle);
          this.stats.active--;
          rt.inUse--;
          const left = (this.perBucket.get(c.bucket) ?? 1) - 1;
          if (left <= 0) this.perBucket.delete(c.bucket);
          else this.perBucket.set(c.bucket, left);
        });
        handle.end = end;
      },
    };
  }

  /** Ends every stream (server shutdown). */
  closeAll(): void {
    for (const h of [...this.clients]) h.end('shutdown');
  }

  private attach(res: ServerResponse, headers: Record<string, string>, rt: ElectionRuntime, startAt: number, _bucket: string, release: () => void): (reason: string) => void {
    const cfg = this.env.cfg;
    const batch = cfg.sseBatch;
    let cursor = startAt;
    let ended = false;
    let blocked = false;
    let pumping = false;
    let lastEventAt = Date.now();
    let slowTimer: NodeJS.Timeout | undefined;
    let unsub: (() => void) | undefined;

    const end = (reason: string): void => {
      if (ended) return;
      ended = true;
      clearInterval(beat);
      clearTimeout(slowTimer);
      unsub?.();
      release();
      if (reason === 'slow') {
        this.stats.droppedSlow++;
        this.env.logger.event('sse_drop', { election_id: rt.id, note: 'slow_client' });
      } else if (reason === 'idle') {
        this.stats.droppedIdle++;
        this.env.logger.event('sse_drop', { election_id: rt.id, note: 'idle' });
      }
      try {
        if (reason === 'slow' || reason === 'closed') res.destroy();
        else res.end();
      } catch {
        /* socket already gone */
      }
    };

    const block = (): void => {
      if (blocked) return;
      blocked = true;
      slowTimer = setTimeout(() => end('slow'), cfg.sseSlowClientMs);
      slowTimer.unref();
      res.once('drain', () => {
        if (ended) return;
        blocked = false;
        clearTimeout(slowTimer);
        pump();
      });
    };

    const write = (s: string): boolean => {
      if (res.writableLength > cfg.sseMaxBufferBytes) {
        end('slow');
        return false;
      }
      const ok = res.write(s);
      if (!ok) block();
      return ok && !ended;
    };

    const writeRow = (r: EventRow): boolean => {
      cursor = r.id;
      lastEventAt = Date.now();
      return write(frame(r));
    };

    const pump = (): void => {
      if (ended || pumping || blocked) return;
      pumping = true;
      try {
        for (;;) {
          const rows = rt.edb.eventsAfter(cursor, batch);
          for (const r of rows) if (!writeRow(r)) return;
          if (rows.length < batch) return;
        }
      } catch {
        end('error'); // database closed underneath us (eviction / deletion)
      } finally {
        pumping = false;
      }
    };

    res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.socket?.setNoDelay(true);
    res.socket?.setTimeout(0);
    res.on('close', () => end('closed'));
    res.on('error', () => end('closed'));

    const beat = setInterval(() => {
      if (ended) return;
      if (Date.now() - lastEventAt >= cfg.sseIdleCloseMs) return end('idle');
      if (!blocked) write(': heartbeat\n\n');
    }, cfg.sseHeartbeatMs);
    beat.unref();

    write('retry: 3000\n: connected\n\n');
    unsub = rt.subscribe({
      event: (r) => {
        if (ended || blocked || pumping) return; // the pump re-reads the outbox, so nothing is lost
        if (r.id === cursor + 1) writeRow(r);
        else pump();
      },
      close: () => end('shutdown'),
    });
    pump();
    return end;
  }
}
