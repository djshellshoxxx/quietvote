// Server-Sent Events client for QV-09 §9 (GET /elections/{id}/events), built on fetch streaming rather than EventSource so that
//  * the resume cursor and any read key travel in headers (Last-Event-ID, QV-Read-Key), never in the URL;
//  * the stream can be aborted, backed off and resumed under our control;
//  * every frame is validated strictly before the UI sees it.
// Delivery is at-least-once and ordered (server outbox cursor), so frames with an id <= the last delivered id are dropped here.
// Event payloads are public hints only: the UI treats them as "something changed, re-read the log" and never as proof.

export type LiveEvent =
  | { type: 'entry'; id: number; seq: number; entryType: string; author: string; leafHash: string }
  | { type: 'checkpoint'; id: number; treeSize: number; root: string; witnessed: boolean; cosigners: string[]; issuedAt: string }
  | { type: 'phase'; id: number; from: string; to: string; seq: number }
  | { type: 'alert'; id: number; kind: string; detailCode: string }
  | { type: 'witness'; id: number; witness: string; lagSeconds: number; quorumMet: boolean };

export interface RawFrame {
  id: string | undefined;
  event: string;
  data: string;
}

export class SseProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SseProtocolError';
  }
}

export interface ParserLimits {
  maxLineChars: number;
  maxEventChars: number;
}
const DEFAULT_LIMITS: ParserLimits = { maxLineChars: 16 * 1024, maxEventChars: 64 * 1024 };

/** Incremental text/event-stream parser (WHATWG HTML §9.2.6): LF, CR and CRLF line ends, BOM, comments, multi-line data. */
export class SseParser {
  private buf = '';
  private started = false;
  private skipLf = false;
  private id: string | undefined;
  private event = '';
  private data: string[] = [];
  private dataChars = 0;
  private retryNow: number | undefined;
  private readonly lim: ParserLimits;

  constructor(lim: Partial<ParserLimits> = {}) {
    this.lim = { ...DEFAULT_LIMITS, ...lim };
  }

  /** The latest `retry:` value seen (it applies at once, even when no event follows). Reading it clears it. */
  takeRetry(): number | undefined {
    const r = this.retryNow;
    this.retryNow = undefined;
    return r;
  }

  push(chunk: string): RawFrame[] {
    let s = chunk;
    if (!this.started && s.length > 0) {
      this.started = true;
      if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    }
    if (this.skipLf && s.length > 0) {
      if (s[0] === '\n') s = s.slice(1);
      this.skipLf = false;
    }
    this.buf += s;
    const out: RawFrame[] = [];
    let start = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (c !== '\n' && c !== '\r') continue;
      const frame = this.line(this.buf.slice(start, i));
      if (frame) out.push(frame);
      if (c === '\r') {
        if (i + 1 < this.buf.length) {
          if (this.buf[i + 1] === '\n') i++;
        } else {
          this.skipLf = true;
        }
      }
      start = i + 1;
    }
    this.buf = this.buf.slice(start);
    if (this.buf.length > this.lim.maxLineChars) throw new SseProtocolError('line too long');
    return out;
  }

  private line(l: string): RawFrame | undefined {
    if (l.length > this.lim.maxLineChars) throw new SseProtocolError('line too long');
    if (l === '') return this.dispatch();
    if (l[0] === ':') return undefined;
    const k = l.indexOf(':');
    const name = k < 0 ? l : l.slice(0, k);
    let value = k < 0 ? '' : l.slice(k + 1);
    if (value[0] === ' ') value = value.slice(1);
    switch (name) {
      case 'event': this.event = value; break;
      case 'data':
        this.dataChars += value.length + 1;
        if (this.dataChars > this.lim.maxEventChars) throw new SseProtocolError('event too large');
        this.data.push(value);
        break;
      case 'id': if (!value.includes('\0')) this.id = value; break;
      case 'retry': if (/^\d{1,9}$/.test(value)) this.retryNow = Number(value); break;
      default: break;
    }
    return undefined;
  }

  private dispatch(): RawFrame | undefined {
    const f: RawFrame = { id: this.id, event: this.event === '' ? 'message' : this.event, data: this.data.join('\n') };
    const had = this.data.length > 0;
    this.event = '';
    this.data = [];
    this.dataChars = 0;
    // The HTML spec lets `id` carry over to later events. The QuietVote server sends one with every frame, so a frame without
    // its own id is malformed here and must not silently inherit a cursor.
    this.id = undefined;
    return had ? f : undefined;
  }
}

// ---------------------------------------------------------------- strict event validation
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUint = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isStr = (v: unknown, max = 256): v is string => typeof v === 'string' && v.length <= max;
const B64U = /^[A-Za-z0-9_-]{1,128}$/;
const B64ANY = /^[A-Za-z0-9+/_-]{1,128}={0,2}$/;
const NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const LAST_ID = /^\d{1,12}$/;

/** Returns the typed event, or undefined for an unknown event name (ignored for forward compatibility). Throws on a malformed known event. */
export function validateEvent(name: string, id: number, data: string): LiveEvent | undefined {
  if (name !== 'entry' && name !== 'checkpoint' && name !== 'phase' && name !== 'alert' && name !== 'witness') return undefined;
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    throw new SseProtocolError(`${name}: data is not JSON`);
  }
  if (!isObj(v)) throw new SseProtocolError(`${name}: data is not an object`);
  const bad = (what: string): never => {
    throw new SseProtocolError(`${name}: bad ${what}`);
  };
  switch (name) {
    case 'entry':
      if (!isUint(v.seq)) bad('seq');
      if (!isStr(v.type, 64) || !NAME.test(v.type as string)) bad('type');
      if (!isStr(v.author) || !B64U.test(v.author as string)) bad('author');
      if (!isStr(v.leaf_hash) || !B64U.test(v.leaf_hash as string)) bad('leaf_hash');
      return { type: 'entry', id, seq: v.seq as number, entryType: v.type as string, author: v.author as string, leafHash: v.leaf_hash as string };
    case 'checkpoint': {
      if (!isUint(v.tree_size)) bad('tree_size');
      if (!isStr(v.root) || !B64ANY.test(v.root as string)) bad('root');
      if (typeof v.witnessed !== 'boolean') bad('witnessed');
      const cos = v.cosigners ?? [];
      if (!Array.isArray(cos) || cos.length > 64 || !cos.every((c) => isStr(c, 128))) bad('cosigners');
      if (!isStr(v.issued_at, 40) || !ISO.test(v.issued_at as string)) bad('issued_at');
      return { type: 'checkpoint', id, treeSize: v.tree_size as number, root: v.root as string, witnessed: v.witnessed as boolean, cosigners: cos as string[], issuedAt: v.issued_at as string };
    }
    case 'phase':
      if (!isStr(v.from, 64) || !NAME.test(v.from as string)) bad('from');
      if (!isStr(v.to, 64) || !NAME.test(v.to as string)) bad('to');
      if (!isUint(v.seq)) bad('seq');
      return { type: 'phase', id, from: v.from as string, to: v.to as string, seq: v.seq as number };
    case 'alert':
      if (!isStr(v.kind, 64) || !NAME.test(v.kind as string)) bad('kind');
      if (!isStr(v.detail_code, 64) || !NAME.test(v.detail_code as string)) bad('detail_code');
      return { type: 'alert', id, kind: v.kind as string, detailCode: v.detail_code as string };
    default:
      if (!isStr(v.witness, 128)) bad('witness');
      if (!isUint(v.lag_seconds)) bad('lag_seconds');
      if (typeof v.quorum_met !== 'boolean') bad('quorum_met');
      return { type: 'witness', id, witness: v.witness as string, lagSeconds: v.lag_seconds as number, quorumMet: v.quorum_met as boolean };
  }
}

// ---------------------------------------------------------------- connection with reconnect
export type ConnState = 'connecting' | 'live' | 'reconnecting' | 'failed' | 'closed';
export interface ConnStatus {
  state: ConnState;
  /** reconnecting: ms until the next attempt. */
  waitMs?: number;
  attempt?: number;
  /** failed / reconnecting: short machine reason, never a secret. */
  reason?: string;
}

export interface ConnectOptions {
  /** Opens the stream. Must send Last-Event-ID as a header (not in the URL) and reject with an object carrying `status` on HTTP errors. */
  open(lastEventId: number | undefined, signal: AbortSignal): Promise<Response>;
  onEvent(e: LiveEvent): void;
  onStatus?(s: ConnStatus): void;
  /** The server no longer retains events after our cursor (410): re-read the log, then events continue from the newest id. */
  onResync?(): void;
  /** A known event type failed validation; the frame is skipped. */
  onInvalid?(reason: string): void;
  lastEventId?: number | undefined;
  baseMs?: number;
  maxMs?: number;
  /** No bytes (not even a heartbeat) for this long: drop and reconnect. Server heartbeats are 5-60 s apart. */
  idleMs?: number;
  /** A connection that lived this long counts as healthy and resets the backoff. */
  stableMs?: number;
  /** After this many consecutive failed attempts without progress the connection gives up (state failed). Default: unlimited. */
  maxAttempts?: number;
  random?: () => number;
  now?: () => number;
  sleep?(ms: number, signal: AbortSignal): Promise<void>;
}

export interface EventConnection {
  close(): void;
  readonly lastEventId: number | undefined;
  /** Resolves when the connection loop ends (after close() or a permanent failure). */
  readonly done: Promise<void>;
}

const defaultSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done(): void {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });

const statusOf = (e: unknown): number | undefined => (isObj(e) && typeof e.status === 'number' ? e.status : undefined);
const retryAfterOf = (e: unknown): number | undefined => (isObj(e) && typeof e.retryAfter === 'number' && e.retryAfter > 0 ? e.retryAfter : undefined);

export function connectEvents(o: ConnectOptions): EventConnection {
  const baseDefault = o.baseMs ?? 1000;
  const maxMs = o.maxMs ?? 30_000;
  const idleMs = o.idleMs ?? 60_000;
  const stableMs = o.stableMs ?? 10_000;
  const random = o.random ?? Math.random;
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  const life = new AbortController();
  let last = o.lastEventId;
  let serverRetry: number | undefined;
  let attempt = 0;
  let closed = false;
  let failed = false;
  let gone = 0;
  let needResync = false;
  const status = (s: ConnStatus): void => {
    try {
      o.onStatus?.(s);
    } catch {
      /* UI callbacks must not break the stream */
    }
  };

  async function once(): Promise<{ progressed: boolean }> {
    const ctl = new AbortController();
    const stop = (): void => ctl.abort();
    life.signal.addEventListener('abort', stop, { once: true });
    const startedAt = now();
    let progressed = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const res = await o.open(last, ctl.signal);
      const ct = res.headers.get('content-type') ?? '';
      if (!/^text\/event-stream\b/i.test(ct) || res.body === null) throw Object.assign(new SseProtocolError('not an event stream'), { status: 415 });
      status({ state: 'live' });
      if (needResync) {
        needResync = false; // the stream is open again: re-read the log now so nothing between the 410 and here is missed
        try {
          o.onResync?.();
        } catch {
          /* ignore */
        }
      }
      reader = res.body.getReader();
      const dec = new TextDecoder('utf-8', { fatal: false });
      const parser = new SseParser();
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const idle = new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new SseProtocolError('idle')), idleMs);
        });
        let r: ReadableStreamReadResult<Uint8Array>;
        try {
          r = await Promise.race([reader.read(), idle]);
        } finally {
          clearTimeout(timer);
        }
        if (r.done) break;
        const frames = parser.push(dec.decode(r.value, { stream: true }));
        const rt = parser.takeRetry();
        if (rt !== undefined) serverRetry = Math.min(60_000, Math.max(1000, rt));
        for (const f of frames) {
          if (f.id === undefined || !LAST_ID.test(f.id)) {
            o.onInvalid?.('bad or missing id');
            continue;
          }
          const id = Number(f.id);
          if (last !== undefined && id <= last) continue; // at-least-once: duplicate after a resume
          let ev: LiveEvent | undefined;
          try {
            ev = validateEvent(f.event, id, f.data);
          } catch (e) {
            o.onInvalid?.(e instanceof Error ? e.message : 'invalid event');
            continue; // cursor not advanced for a frame we could not use
          }
          progressed = true;
          if (ev === undefined) {
            last = id; // unknown future event type: skip but keep the cursor moving
            continue;
          }
          last = id;
          try {
            o.onEvent(ev);
          } catch {
            /* handler errors are the handler's problem */
          }
        }
      }
      return { progressed: progressed || now() - startedAt >= stableMs };
    } catch (e) {
      (e as { progressed?: boolean }).progressed = progressed || now() - startedAt >= stableMs;
      throw e;
    } finally {
      life.signal.removeEventListener('abort', stop);
      ctl.abort();
      try {
        void reader?.cancel().catch(() => undefined);
      } catch {
        /* already released */
      }
    }
  }

  const done = (async (): Promise<void> => {
    while (!closed) {
      status({ state: 'connecting', attempt });
      let progressed = false;
      let wait: number | undefined;
      let reason = 'closed by server';
      try {
        progressed = (await once()).progressed;
      } catch (e) {
        if (closed) break;
        progressed = (e as { progressed?: boolean }).progressed === true;
        const st = statusOf(e);
        reason = e instanceof Error ? e.message.slice(0, 80) : 'error';
        if (st === 410) {
          last = undefined;
          needResync = true;
          wait = Math.min(maxMs, 500 * 2 ** gone++); // a server that keeps answering 410 must not be hammered
          reason = 'resync';
        } else if (st !== undefined && st >= 400 && st < 500 && st !== 408 && st !== 429) {
          failed = true;
          status({ state: 'failed', reason: `http ${st}` });
          return;
        } else {
          const ra = retryAfterOf(e);
          if (ra !== undefined) wait = Math.min(120_000, ra * 1000);
        }
      }
      if (closed) break;
      if (progressed) {
        attempt = 0;
        gone = 0;
      }
      if (wait === undefined) {
        const base = serverRetry ?? baseDefault;
        const cap = Math.min(maxMs, base * 2 ** attempt);
        wait = Math.floor(cap / 2 + random() * (cap / 2)); // equal jitter: never a tight loop, never in lock-step
        attempt++;
        if (o.maxAttempts !== undefined && attempt > o.maxAttempts) {
          failed = true;
          status({ state: 'failed', reason });
          return;
        }
      }
      status({ state: 'reconnecting', waitMs: wait, attempt, reason });
      await sleep(wait, life.signal);
    }
  })().finally(() => {
    if (!failed) status({ state: 'closed' });
  });

  return {
    close(): void {
      closed = true;
      life.abort();
    },
    get lastEventId(): number | undefined {
      return last;
    },
    done,
  };
}
