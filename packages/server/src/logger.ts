// Structured logging that cannot carry addresses by construction (QV-09-REQ-004, R-02 §8) and that emits only the QV-31 §4.2 allowlist
// (QV-31-REQ-001/008, B2-16): `ts` (always rounded to the minute), `level`, `event`, `route`, `status`, `dur_bucket`, `code`, `component`,
// `msg`, `tree_size`. Callers hand over LogFields (a closed set); everything that is not on the allowlist (request ids, election ids, byte
// counts, exact latencies, entry types, per-line counters) is dropped, and the drop is counted (`droppedFields`). No sequential per-line
// counter is emitted: it would re-link a minute-rounded voter-path line to its second-precision neighbours.

export interface LogFields {
  /** Accepted for call-site compatibility; never emitted (not on the QV-31 allowlist). */
  request_id?: string;
  /** Route template, never the raw path. */
  route?: string;
  method?: string;
  status?: number;
  outcome?: 'ok' | 'rejected' | 'error';
  error_code?: string;
  bytes_in?: number;
  /** Emitted only as the `dur_bucket` enumeration. */
  latency_ms?: number;
  election_id?: string;
  rate_class?: string;
  seq?: number;
  entry_type?: string;
  /** Emitted as `msg` only when it is a static catalog-style token. */
  note?: string;
  /** Not emitted for `coarse` (voter-path) events. */
  tree_size?: number;
}

/** The only keys that may appear in a log line (QV-31 §4.2). */
export const LOG_ALLOWLIST: ReadonlySet<string> = new Set(['ts', 'level', 'event', 'route', 'status', 'dur_bucket', 'code', 'component', 'build', 'msg', 'epoch_no', 'tree_size']);

/** LogFields keys that are accepted but never written. */
const NOT_EMITTED = ['request_id', 'method', 'bytes_in', 'election_id', 'seq', 'entry_type'] as const;

export const durBucket = (ms: number): string => (ms < 50 ? '<50ms' : ms < 250 ? '<250ms' : ms < 1000 ? '<1s' : ms < 5000 ? '<5s' : '>=5s');

const STATIC_MSG = /^[a-z0-9_ ./-]{1,64}$/;
const clean = (v: string): string => v.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, 200);

export class Logger {
  private readonly sink: (line: string) => void;
  private readonly now: () => number;
  private readonly lastLimitLog = new Map<string, number>();
  /** Number of non-allowlisted fields dropped (QV-31-REQ-001 "dropped and counted"). */
  droppedFields = 0;
  constructor(sink: (line: string) => void, now: () => number) {
    this.sink = sink;
    this.now = now;
  }

  /** `coarse` marks voter-path events (no tree size); every line is minute-rounded regardless. */
  event(event: string, f: LogFields = {}, coarse = false): void {
    const ts = new Date(Math.floor(this.now() / 60_000) * 60_000).toISOString().replace('.000Z', 'Z');
    const cand: Record<string, unknown> = { ts, event: clean(event) };
    if (f.outcome !== undefined) cand['level'] = f.outcome === 'error' ? 'error' : f.outcome === 'rejected' ? 'warn' : 'info';
    if (f.route !== undefined) cand['route'] = clean(f.route);
    if (f.status !== undefined) cand['status'] = f.status;
    if (f.error_code !== undefined) cand['code'] = clean(f.error_code);
    if (f.latency_ms !== undefined) cand['dur_bucket'] = durBucket(f.latency_ms);
    if (f.rate_class !== undefined) cand['component'] = `rate_${clean(f.rate_class)}`;
    if (f.note !== undefined && STATIC_MSG.test(f.note)) cand['msg'] = f.note;
    if (f.tree_size !== undefined && !coarse) cand['tree_size'] = f.tree_size;
    for (const k of NOT_EMITTED) if (f[k] !== undefined) this.droppedFields++;
    const rec: Record<string, unknown> = {};
    for (const k of Object.keys(cand)) {
      if (LOG_ALLOWLIST.has(k)) rec[k] = cand[k];
      else this.droppedFields++;
    }
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
