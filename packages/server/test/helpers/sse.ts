// Minimal EventSource-style client over node:http for the SSE tests (no buffering by fetch, explicit close).
import { request, type IncomingMessage } from 'node:http';

export interface SseEvent {
  id: number | undefined;
  event: string;
  data: string;
  json: any;
}

export class SseClient {
  status = 0;
  headers: IncomingMessage['headers'] = {};
  events: SseEvent[] = [];
  comments: string[] = [];
  raw = '';
  ended = false;
  body = '';
  private buf = '';
  private res: IncomingMessage | undefined;
  private waiters: (() => void)[] = [];

  static open(base: string, path: string, headers: Record<string, string> = {}): Promise<SseClient> {
    const c = new SseClient();
    return new Promise((resolve, reject) => {
      const req = request(base + path, { method: 'GET', headers: { accept: 'text/event-stream', ...headers } }, (res) => {
        c.res = res;
        c.status = res.statusCode ?? 0;
        c.headers = res.headers;
        res.setEncoding('utf8');
        const stream = (res.headers['content-type'] ?? '').startsWith('text/event-stream');
        res.on('data', (d: string) => {
          if (!stream) {
            c.body += d;
            return;
          }
          c.raw += d;
          c.buf += d;
          c.parse();
        });
        res.on('close', () => {
          c.ended = true;
          c.wake();
        });
        resolve(c);
      });
      req.on('error', (e) => {
        if (!c.res) reject(e);
        c.ended = true;
        c.wake();
      });
      req.end();
    });
  }

  private parse(): void {
    for (;;) {
      const i = this.buf.indexOf('\n\n');
      if (i < 0) break;
      const block = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      let id: number | undefined;
      let event = 'message';
      const data: string[] = [];
      let any = false;
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) this.comments.push(line.slice(1).trim());
        else if (line.startsWith('id:')) (id = Number(line.slice(3).trim()), (any = true));
        else if (line.startsWith('event:')) (event = line.slice(6).trim(), (any = true));
        else if (line.startsWith('data:')) (data.push(line.slice(5).trim()), (any = true));
      }
      if (any && data.length > 0) {
        const d = data.join('\n');
        this.events.push({ id, event, data: d, json: JSON.parse(d) });
      }
    }
    this.wake();
  }

  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  /** Resolves when `pred` holds (checked after each chunk), or rejects after `ms`. */
  async until(pred: (c: SseClient) => boolean, ms = 5000): Promise<void> {
    const t0 = Date.now();
    while (!pred(this)) {
      if (this.ended && !pred(this)) throw new Error(`stream ended before condition (events=${this.events.length})`);
      const left = ms - (Date.now() - t0);
      if (left <= 0) throw new Error(`timeout waiting for condition (events=${this.events.map((e) => e.event + ':' + e.id).join(',')})`);
      await new Promise<void>((res) => {
        const t = setTimeout(res, Math.min(left, 50));
        this.waiters.push(() => {
          clearTimeout(t);
          res();
        });
      });
    }
  }

  close(): void {
    this.res?.destroy();
    this.ended = true;
  }
}
