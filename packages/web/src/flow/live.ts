// Live election state: keeps a loaded election (log records + derived context) current from the SSE stream.
// SSE events are hints only. They never carry bodies and are never trusted as data: each hint schedules a re-read of the log
// from the first sequence we do not have, and the context (phase, tally) is re-derived from those signed records, exactly as
// on first load. A lost or forged event can therefore delay an update but cannot change what the page shows.
import type { ApiClient } from '../api/client.ts';
import { connectEvents, type ConnStatus, type EventConnection, type LiveEvent } from '../net/sse.ts';
import { deriveElectionContext, type ElectionContext } from './election.ts';
import { entryRecord } from './entries.ts';

/** The part of a loaded election the live layer updates in place (the UI's `Loaded` satisfies this). */
export interface LiveTarget {
  apiId: string;
  api: Pick<ApiClient, 'allEntries' | 'events'>;
  records: { seq: number; record: unknown }[];
  ctx?: ElectionContext | undefined;
  ctxError?: string | undefined;
}

export interface LiveChange {
  /** New log entries read in this refresh. */
  added: number;
  phaseChanged: boolean;
  tallyAppeared: boolean;
}

export interface LiveOptions {
  /** Coalesces bursts of events into one re-read. */
  debounceMs?: number;
  onChange?(c: LiveChange): void;
  onStatus?(s: ConnStatus): void;
  onAlert?(e: Extract<LiveEvent, { type: 'alert' }>): void;
  onError?(e: unknown): void;
  /** Test hooks, passed through to the connection. */
  connect?: typeof connectEvents;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  baseMs?: number;
  maxMs?: number;
  idleMs?: number;
}

export class LiveElection {
  private readonly t: LiveTarget;
  private readonly o: LiveOptions;
  private conn: EventConnection | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private dirty = false;
  private closed = false;

  constructor(target: LiveTarget, o: LiveOptions = {}) {
    this.t = target;
    this.o = o;
  }

  start(): void {
    if (this.conn !== undefined || this.closed) return;
    const connect = this.o.connect ?? connectEvents;
    this.conn = connect({
      open: (last, signal) => this.t.api.events(this.t.apiId, { lastEventId: last, signal }),
      onEvent: (e) => this.hint(e),
      onResync: () => this.schedule(),
      ...(this.o.onStatus ? { onStatus: this.o.onStatus } : {}),
      ...(this.o.sleep ? { sleep: this.o.sleep } : {}),
      ...(this.o.random ? { random: this.o.random } : {}),
      ...(this.o.baseMs !== undefined ? { baseMs: this.o.baseMs } : {}),
      ...(this.o.maxMs !== undefined ? { maxMs: this.o.maxMs } : {}),
      ...(this.o.idleMs !== undefined ? { idleMs: this.o.idleMs } : {}),
    });
  }

  /** Stops the stream and any pending refresh. Safe to call twice. */
  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.conn?.close();
    for (const w of this.waiters.splice(0)) w();
  }

  /** Resolves when no refresh is running or queued (tests, and "settled" UI). */
  settled(): Promise<void> {
    if (!this.running && this.timer === undefined) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
  private waiters: (() => void)[] = [];

  private hint(e: LiveEvent): void {
    if (e.type === 'alert') {
      try {
        this.o.onAlert?.(e);
      } catch {
        /* ignore */
      }
      return;
    }
    if (e.type === 'witness') return; // witness lag does not change log content
    if (e.type === 'entry' && e.seq < this.t.records.length) return; // already read
    this.schedule();
  }

  /** Queues a re-read of the log (bursts are coalesced). */
  schedule(): void {
    if (this.closed) return;
    if (this.running) {
      this.dirty = true;
      return;
    }
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, this.o.debounceMs ?? 100);
  }

  async refresh(): Promise<void> {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      do {
        this.dirty = false;
        await this.readOnce();
      } while (this.dirty && !this.closed);
    } catch (e) {
      try {
        this.o.onError?.(e);
      } catch {
        /* ignore */
      }
    } finally {
      this.running = false;
      if (this.timer === undefined) for (const w of this.waiters.splice(0)) w();
    }
  }

  private async readOnce(): Promise<void> {
    const t = this.t;
    let top = -1;
    for (const r of t.records) if (r.seq > top) top = r.seq; // no spread: a long log would exceed the argument limit
    const from = top + 1;
    const page = await t.api.allEntries(t.apiId, from);
    const fresh = page.entries.filter((e) => e.seq >= from).map((e) => ({ seq: e.seq, record: entryRecord(e) }));
    if (fresh.length === 0) return;
    // entries must continue the log without a gap or repeat, otherwise reload from the start next time rather than guess
    for (let i = 0; i < fresh.length; i++) if (fresh[i]!.seq !== from + i) throw new Error('log entries are not contiguous');
    t.records.push(...fresh);
    const before = t.ctx;
    const r = await deriveElectionContext(t.records);
    if (r.ok) {
      t.ctx = r.value;
      t.ctxError = undefined;
    } else if (before === undefined) {
      t.ctxError = r.detail;
    }
    try {
      this.o.onChange?.({
        added: fresh.length,
        phaseChanged: before?.phase !== t.ctx?.phase,
        tallyAppeared: before?.tally === undefined && t.ctx?.tally !== undefined,
      });
    } catch {
      /* ignore */
    }
  }
}
