// Results chart model (pure, node-testable). The chart is a horizontal bar chart drawn as inline SVG by ui/charts.ts.
// Accessibility rules baked into the model, checked by test/charts.test.ts:
//  * no colour-only encoding: every bar has a direct text label, a printed count and share, a distinct hatch pattern and an outline;
//  * a winner is marked with a text tag, not a colour;
//  * geometry is mirrored for right-to-left locales so bars grow from the inline start;
//  * the same numbers are always available as a real table (rendered next to the chart by the results view).

export interface ChartInput {
  options: readonly { id: string; label: string; count: number }[];
  winners?: readonly string[] | undefined;
}

export interface ChartRow {
  id: string;
  label: string;
  count: number;
  /** Fraction of all counted votes in this contest (0..1), or undefined when the total is zero. */
  share: number | undefined;
  /** Bar length as a percentage of the axis (the largest count fills 100). */
  lengthPct: number;
  /** Index into the hatch pattern set. */
  pattern: number;
  winner: boolean;
}

export interface ChartModel {
  total: number;
  max: number;
  rows: ChartRow[];
}

/** Number of visually distinct hatch patterns; options beyond this reuse one, but still carry label, value and outline. */
export const PATTERN_COUNT = 6;

export function chartModel(i: ChartInput): ChartModel {
  const counts = i.options.map((o) => (Number.isFinite(o.count) && o.count > 0 ? Math.floor(o.count) : 0));
  const total = counts.reduce((a, b) => a + b, 0);
  const max = counts.reduce((a, b) => Math.max(a, b), 0);
  const win = new Set(i.winners ?? []);
  const rows = i.options.map((o, k): ChartRow => {
    const c = counts[k]!;
    return {
      id: o.id, label: o.label, count: c, share: total > 0 ? c / total : undefined,
      lengthPct: max > 0 ? (c > 0 ? Math.max(1, Math.round((c / max) * 1000) / 10) : 0) : 0,
      pattern: k % PATTERN_COUNT, winner: win.has(o.id),
    };
  });
  return { total, max, rows };
}

/** x/width in percent of the track. RTL mirrors so the bar starts at the inline start (right edge). */
export function barGeometry(lengthPct: number, rtl: boolean): { x: number; width: number } {
  const w = Math.min(100, Math.max(0, lengthPct));
  return { x: rtl ? Math.round((100 - w) * 10) / 10 : 0, width: w };
}

// ---------------------------------------------------------------- SVG description (turned into DOM by ui/charts.ts)
export interface SvgNode {
  tag: string;
  attrs: Record<string, string | number>;
  children?: SvgNode[];
}

const node = (tag: string, attrs: Record<string, string | number>, children?: SvgNode[]): SvgNode => (children ? { tag, attrs, children } : { tag, attrs });

/** Six hatch patterns, drawn with classes (not inline style) so CSS and forced-colors can recolour them. */
export function patternDefs(prefix: string): SvgNode {
  const bg = (): SvgNode => node('rect', { width: 8, height: 8, class: 'qv-pat-bg' });
  const line = (x1: number, y1: number, x2: number, y2: number): SvgNode => node('line', { x1, y1, x2, y2, class: 'qv-pat' });
  const pats: SvgNode[][] = [
    [line(0, 8, 8, 0), line(-2, 2, 2, -2), line(6, 10, 10, 6)], // diagonal /
    [line(0, 0, 8, 8), line(-2, 6, 2, 10), line(6, -2, 10, 2)], // diagonal \
    [node('circle', { cx: 4, cy: 4, r: 1.6, class: 'qv-pat-dot' })], // dots
    [line(0, 2, 8, 2), line(0, 6, 8, 6)], // horizontal
    [line(0, 0, 8, 8), line(0, 8, 8, 0)], // cross-hatch
    [line(2, 0, 2, 8), line(6, 0, 6, 8)], // vertical
  ];
  return node('defs', {}, pats.map((p, k) => node('pattern', { id: `${prefix}-${k}`, width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, [bg(), ...p])));
}

/** One bar: an outlined track plus the filled, hatched bar. Decorative (aria-hidden): the row's text carries the meaning. */
export function barSvg(row: ChartRow, rtl: boolean, prefix: string): SvgNode {
  const g = barGeometry(row.lengthPct, rtl);
  const kids: SvgNode[] = [node('rect', { x: '0%', y: 1, width: '100%', height: 16, class: 'qv-track' })];
  if (row.lengthPct > 0) kids.push(node('rect', { x: `${g.x}%`, y: 1, width: `${g.width}%`, height: 16, class: 'qv-bar', fill: `url(#${prefix}-${row.pattern})` }));
  return node('svg', { class: 'qv-bar-svg', width: '100%', height: 18, 'aria-hidden': 'true', focusable: 'false' }, kids);
}

/** Serialises a node tree (tests, and a stable text form for debugging). Attribute values are escaped. */
export function svgToString(n: SvgNode): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const a = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('');
  return n.children ? `<${n.tag}${a}>${n.children.map(svgToString).join('')}</${n.tag}>` : `<${n.tag}${a}/>`;
}
