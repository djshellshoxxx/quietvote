// Deadlines and organizer time input (QV-13 §9.5). Authority is the UTC instant; the zone is display only.
export interface DeadlineText {
  /** e.g. "Sun 14 Mar 2027, 18:00 CET" */
  electionTime: string;
  /** e.g. "UTC+01:00" */
  offset: string;
  zone: string;
  /** Viewer's own rendering when the zone differs. */
  viewerTime?: string;
  /** ISO date in the election zone (REQ-097 secondary text). */
  isoDate: string;
  /** Full instant, locale independent. */
  instant: string;
}

function offsetLabel(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(date);
  const v = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  return v === 'GMT' ? 'UTC+00:00' : v.replace('GMT', 'UTC');
}

export function formatDeadline(instantIso: string, electionZone: string, viewerZone: string, locale: string, options: { seconds?: boolean } = {}): DeadlineText {
  const d = new Date(instantIso);
  const fmt = (zone: string): string =>
    new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(options.seconds ? { second: '2-digit' as const } : {}), hourCycle: 'h23', timeZoneName: 'short' }).format(d);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: electionZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const out: DeadlineText = { electionTime: fmt(electionZone), offset: offsetLabel(d, electionZone), zone: electionZone, isoDate: iso, instant: d.toISOString().replace('.000Z', 'Z') };
  if (viewerZone !== electionZone) out.viewerTime = fmt(viewerZone);
  return out;
}

/** Date.UTC interprets years 0..99 as 1900..1999; setUTCFullYear preserves the actual calendar year. */
function utc(year: number, month: number, day: number, hour: number, minute: number, second = 0): number {
  const value = new Date(0);
  value.setUTCFullYear(year, month, day);
  value.setUTCHours(hour, minute, second, 0);
  return value.getTime();
}

/** UTC offset of `zone` at `instantMs`, in minutes, retaining historical second precision. */
export function zoneOffsetMinutes(instantMs: number, zone: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, calendar: 'gregory', era: 'short', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p: Record<string, number> = {};
  let bc = false;
  for (const x of f.formatToParts(new Date(instantMs))) {
    if (x.type === 'era') bc = x.value === 'BC';
    else if (x.type !== 'literal') p[x.type] = Number(x.value);
  }
  const asUtc = utc(bc ? 1 - p.year! : p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return (asUtc - Math.floor(instantMs / 1000) * 1000) / 60000;
}

export interface LocalTime {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}
export type ZonedResult =
  | { kind: 'ok'; instant: string; offsetMinutes: number }
  | { kind: 'gap'; suggestions: string[] }
  | { kind: 'fold'; candidates: { offsetMinutes: number; instant: string }[] };

const pad2 = (n: number): string => String(n).padStart(2, '0');
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

/** Resolves organizer wall-clock input against an IANA zone, reporting DST gaps and folds (REQ-092). */
export function zonedLocalToUtc(l: LocalTime, zone: string, chosenOffsetMinutes?: number): ZonedResult {
  const wall = utc(l.y, l.mo - 1, l.d, l.h, l.mi);
  const offs = new Set<number>([zoneOffsetMinutes(wall - 86_400_000, zone), zoneOffsetMinutes(wall + 86_400_000, zone), zoneOffsetMinutes(wall, zone)]);
  const valid: { offsetMinutes: number; instant: number }[] = [];
  for (const o of offs) {
    const inst = wall - Math.round(o * 60_000);
    if (zoneOffsetMinutes(inst, zone) === o) valid.push({ offsetMinutes: o, instant: inst });
  }
  valid.sort((a, b) => a.instant - b.instant);
  if (valid.length === 0) {
    const s = (x: Date): string => `${String(x.getUTCFullYear()).padStart(4, '0')}-${pad2(x.getUTCMonth() + 1)}-${pad2(x.getUTCDate())} ${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())}`;
    // Reproject actual instants on either side of the offset jump. A fixed +/- one hour is still nonexistent
    // during a skipped day (e.g. Pacific/Apia), and is needlessly distant for a half-hour transition.
    const suggestions = [...offs].map((offset) => {
      const instant = wall - Math.round(offset * 60_000);
      const local = instant + Math.round(zoneOffsetMinutes(instant, zone) * 60_000);
      // Round an alternative away from the gap to an input-representable minute, never back into it.
      return s(new Date((local > wall ? Math.ceil(local / 60_000) : Math.floor(local / 60_000)) * 60_000));
    });
    return { kind: 'gap', suggestions: [...new Set(suggestions)].sort() };
  }
  if (valid.length === 1) return { kind: 'ok', instant: iso(valid[0]!.instant), offsetMinutes: valid[0]!.offsetMinutes };
  if (chosenOffsetMinutes !== undefined) {
    const hit = valid.find((v) => v.offsetMinutes === chosenOffsetMinutes);
    if (hit) return { kind: 'ok', instant: iso(hit.instant), offsetMinutes: hit.offsetMinutes };
  }
  return { kind: 'fold', candidates: valid.map((v) => ({ offsetMinutes: v.offsetMinutes, instant: iso(v.instant) })) };
}

export function offsetText(minutes: number): string {
  const s = minutes < 0 ? '-' : '+';
  const seconds = Math.round(Math.abs(minutes) * 60);
  return `UTC${s}${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor(seconds / 60) % 60)}${seconds % 60 ? `:${pad2(seconds % 60)}` : ''}`;
}
