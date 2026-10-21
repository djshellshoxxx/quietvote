import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PATTERN_COUNT, barGeometry, barSvg, chartModel, patternDefs, svgToString } from '../src/flow/chart.ts';
import { createTranslator } from '../src/i18n/index.ts';
import { LOCALES } from '../src/i18n/locales.ts';

const OPTS = [
  { id: 'ann', label: 'Ann', count: 6 }, { id: 'bob', label: 'Bob', count: 3 }, { id: 'cy', label: 'Cy', count: 1 }, { id: 'dee', label: 'Dee', count: 0 },
];

test('chart model: counts, shares, lengths scaled to the largest bar, winner flag', () => {
  const m = chartModel({ options: OPTS, winners: ['ann'] });
  assert.equal(m.total, 10);
  assert.equal(m.max, 6);
  assert.deepEqual(m.rows.map((r) => r.share), [0.6, 0.3, 0.1, 0]);
  assert.deepEqual(m.rows.map((r) => r.lengthPct), [100, 50, 16.7, 0]);
  assert.deepEqual(m.rows.map((r) => r.winner), [true, false, false, false]);
  // lengths are proportional to counts, so the picture never says more or less than the numbers
  assert.ok(Math.abs(m.rows[1]!.lengthPct / m.rows[0]!.lengthPct - 0.5) < 0.01);
});

test('chart model: zero totals, junk counts and a tiny non-zero count stay honest and visible', () => {
  const z = chartModel({ options: [{ id: 'a', label: 'A', count: 0 }, { id: 'b', label: 'B', count: 0 }] });
  assert.equal(z.total, 0);
  assert.deepEqual(z.rows.map((r) => [r.share, r.lengthPct]), [[undefined, 0], [undefined, 0]]);
  const j = chartModel({ options: [{ id: 'a', label: 'A', count: Number.NaN }, { id: 'b', label: 'B', count: -4 }, { id: 'c', label: 'C', count: 2.9 }] });
  assert.deepEqual(j.rows.map((r) => r.count), [0, 0, 2]);
  const tiny = chartModel({ options: [{ id: 'a', label: 'A', count: 100000 }, { id: 'b', label: 'B', count: 1 }] });
  assert.ok(tiny.rows[1]!.lengthPct >= 1, 'a non-zero count is never drawn as nothing');
  assert.equal(chartModel({ options: [] }).rows.length, 0);
});

test('no colour-only encoding: each option has text label, printed value, a distinct hatch pattern and an outline', () => {
  const many = Array.from({ length: PATTERN_COUNT + 2 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}`, count: i + 1 }));
  const m = chartModel({ options: many });
  assert.equal(new Set(m.rows.slice(0, PATTERN_COUNT).map((r) => r.pattern)).size, PATTERN_COUNT);
  const defs = svgToString(patternDefs('p'));
  for (let k = 0; k < PATTERN_COUNT; k++) assert.ok(defs.includes(`id="p-${k}"`));
  for (const r of m.rows) {
    const svg = svgToString(barSvg(r, false, 'p'));
    assert.ok(svg.includes('class="qv-track"'), 'outlined track');
    assert.ok(svg.includes(`fill="url(#p-${r.pattern})"`), 'pattern fill');
    assert.ok(svg.includes('aria-hidden="true"'), 'decorative: the row text carries the meaning');
  }
  // colours come only from CSS classes, so forced-colors / high contrast / print can recolour them
  const all = svgToString(patternDefs('p')) + m.rows.map((r) => svgToString(barSvg(r, false, 'p'))).join('');
  assert.ok(!/#[0-9a-f]{3,8}\b(?!\))|rgb\(|hsl\(|style=/i.test(all.replace(/url\(#p-\d\)/g, '')), 'no inline colours or styles');
});

test('RTL: bars are mirrored to start at the inline start; LTR is unchanged', () => {
  assert.deepEqual(barGeometry(40, false), { x: 0, width: 40 });
  assert.deepEqual(barGeometry(40, true), { x: 60, width: 40 });
  assert.deepEqual(barGeometry(100, true), { x: 0, width: 100 });
  assert.deepEqual(barGeometry(150, true), { x: 0, width: 100 }, 'clamped');
  const r = chartModel({ options: OPTS }).rows[1]!;
  assert.ok(svgToString(barSvg(r, true, 'p')).includes('x="50%"'));
  assert.ok(svgToString(barSvg(r, false, 'p')).includes('x="0%"'));
});

test('chart labels exist and format correctly in every locale (plural, percent, RTL digits left to Intl)', () => {
  for (const l of LOCALES) {
    const tr = createTranslator(l.tag, { defs: LOCALES });
    const v = tr.t('qv.results.barValue', { count: 3, share: 0.3 });
    assert.match(v, /3/);
    assert.ok(v.includes('%') || l.tag === 'ar' || /٪|٣/.test(v) || l.tag === 'fr' || l.tag === 'de', `${l.tag}: ${v}`);
    assert.ok(tr.t('qv.results.chartLabel', { title: 'Chair' }).includes('Chair'));
    assert.ok(tr.t('qv.results.winnerTag').length > 0);
    assert.ok(tr.t('qv.results.barCount', { count: 1 }).length > 0);
  }
  const en = createTranslator('en');
  assert.equal(en.t('qv.results.barValue', { count: 1, share: 1 }), '1 vote (100%)');
  assert.equal(en.t('qv.results.barValue', { count: 3, share: 0.3 }), '3 votes (30%)');
});

test('wiring: charts are a lazy chunk, the data table stays as the text alternative, CSS has forced-colors and logical rules', () => {
  const app = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.ok(/await import\('\.\/charts\.ts'\)/.test(app), 'dynamic import');
  assert.ok(!/from '\.\/charts\.ts'/.test(app), 'no static import of the chart code');
  assert.ok(/h\('table'/.test(app) && app.includes("h('caption'"), 'table with caption kept');
  assert.ok(app.includes('.catch(() => undefined)'), 'chart chunk failure degrades to the table');
  const css = readFileSync(new URL('../static/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(forced-colors:active\)\{.*\.qv-bar\{stroke:CanvasText\}/);
  assert.match(css, /\.qv-track\{fill:none;stroke:var\(--border\)/);
  assert.match(css, /@media print/);
  const dom = readFileSync(new URL('../src/ui/charts.ts', import.meta.url), 'utf8');
  assert.ok(dom.includes('aria-labelledby') && dom.includes("role: 'group'") && dom.includes("h('ul'"), 'figure group named by its caption, rows as a list');
});
