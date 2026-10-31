// Structured logging that cannot carry addresses by construction (QV-09-REQ-004, R-02 §8):
// the field set is closed; callers cannot add IPs, user agents, headers, keys or bodies.

export interface LogFields {
  request_id?: string;
  /** Route template, never the raw path. */
  route?: string;
  method?: string;
  status?: number;
  outcome?: 'ok' | 'rejected' | 'error';
  error_code?: string;
  bytes_in?: number;
  latency_ms?: number;
  election_id?: string;
  rate_class?: string;
  seq?: number;
  entry_type?: string;
  note?: string;
}

export class Logger {
  private readonly sink: (line: string) => void;
  private readonly now: () => number;
  private n = 0;
  private readonly lastLimitLog = new Map<string, number>();
  constructor(sink: (line: string) => void, now: () => number) {
    this.sink = sink;
    this.now = now;
  }

  event(event: string, f: LogFields = {}, coarse = false): void {
    const ms = this.now();
    // Timestamps are rounded (second, or minute for voter-path events) so logs add no timing precision
    // beyond the public log (R-02 §8 "timing correlation").
    const step = coarse ? 60_000 : 1000;
    const ts = new Date(Math.floor(ms / step) * step).toISOString().replace('.000Z', 'Z');
    const rec: Record<string, unknown> = { v: 1, n: ++this.n, ts, event };
    for (const [k, v] of Object.entries(f)) if (v !== undefined) rec[k] = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 200) : v;
    this.sink(JSON.stringify(rec));
  }

  /** Rate-limit events are sampled to <= 1/min/class (QV-29-REQ-022). */
  limitHit(cls: string): void {
    const t = this.now();
    const last = this.lastLimitLog.get(cls) ?? 0;
    if (t - last < 60_000) return;
    this.lastLimitLog.set(cls, t);
    this.event('rate_limit', { rate_class: cls, outcome: 'rejected' });
  }
}
