// Results chart view (lazy chunk: loaded only when a tally is shown). Inline SVG bars, no dependencies.
// Text, not colour, carries the data: see flow/chart.ts for the accessibility rules and test/charts.test.ts for their checks.
import { barSvg, chartModel, patternDefs, type ChartInput, type SvgNode } from '../flow/chart.ts';
import type { MessageKey, Args } from '../i18n/index.ts';
import { add, h, nextId } from './dom.ts';

const NS = 'http://www.w3.org/2000/svg';

export function svgElement(n: SvgNode): SVGElement {
  const el = document.createElementNS(NS, n.tag);
  for (const [k, v] of Object.entries(n.attrs)) el.setAttribute(k, String(v));
  for (const c of n.children ?? []) el.append(svgElement(c));
  return el;
}

export interface ChartEnv {
  t(key: MessageKey, args?: Args): string;
  rtl: boolean;
}

/** A figure with a labelled list of bars. Pair it with the data table (the text alternative) in the caller. */
export function renderBarChart(env: ChartEnv, title: string, input: ChartInput): HTMLElement {
  const m = chartModel(input);
  const prefix = nextId('qv-pat');
  const capId = nextId('qv-cap');
  const defs = svgElement({ tag: 'svg', attrs: { class: 'qv-defs', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' }, children: [patternDefs(prefix)] });
  const rows = m.rows.map((r) => {
    const value = r.share === undefined ? env.t('qv.results.barCount', { count: r.count }) : env.t('qv.results.barValue', { count: r.count, share: r.share });
    return h('li', { class: r.winner ? 'qv-bar-row qv-winner' : 'qv-bar-row' },
      h('span', { class: 'qv-bar-label' }, r.label, r.winner ? h('strong', { class: 'qv-tag' }, ' ', env.t('qv.results.winnerTag')) : null),
      svgElement(barSvg(r, env.rtl, prefix)),
      h('span', { class: 'qv-bar-value' }, value));
  });
  const fig = h('figure', { class: 'qv-chart', role: 'group', 'aria-labelledby': capId }, h('figcaption', { id: capId }, env.t('qv.results.chartLabel', { title })));
  add(fig, [defs, h('ul', { class: 'qv-bars' }, ...rows)]);
  return fig;
}
