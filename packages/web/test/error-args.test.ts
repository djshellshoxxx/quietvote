// B3-06 (decision-free piece): every qv.err.* message with placeholders must be rendered with its arguments at the real call
// sites. A missing argument makes `t()` throw and `errorBox` silently shows the generic fallback, so the check below renders
// every such key with exactly what the call sites supply.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ApiError, uxPresentation } from '../src/api/errors.ts';
import { EN, MESSAGE_KEYS, createTranslator, type MessageKey } from '../src/i18n/index.ts';
import { argNames, parse } from '../src/i18n/icu.ts';

const TIMES = { opens: '2026-11-01T09:00:00Z', closes: '2026-11-08T17:00:00Z' };
const t = createTranslator('en');

const withArgs = MESSAGE_KEYS.filter((k) => k.startsWith('qv.err.E-') && argNames(parse(EN[k].message)).size > 0);

/**
 * Who supplies the placeholders of each qv.err.* key. `ux`: the shared presentation helper (api/errors.ts) used for failures that
 * come out of `uxCodeFor`; `site`: a call site that names the argument itself (checked against the source below).
 */
const SUPPLIERS: Record<string, { by: 'ux' | 'site'; file?: string; args?: Record<string, string> }> = {
  'E-VOT-CLOSED': { by: 'ux' },
  'E-VOT-NOTOPEN': { by: 'ux' },
  'E-API-RATE': { by: 'ux' },
  'E-VOT-OVERVOTE': { by: 'site', file: 'ui/app.ts', args: { k: 'k: max', x: 'x: cur.size + 1' } },
  'E-ORG-MANIFEST': { by: 'site', file: 'ui/app.ts', args: { detail: 'detail:' } },
  'E-VER-FAIL': { by: 'site', file: 'ui/app.ts', args: { id: 'id:' } },
  // Defined in the catalog but raised nowhere today (checked below), so there is no call site to feed.
  'E-ORG-LANG': { by: 'site' },
  'E-BOARD-STALE': { by: 'site' },
  'E-VERSION': { by: 'site' },
};
const uxOf = (k: string): string => k.split('.')[2]!;

test('B3-06: every qv.err.* key with placeholders has a declared supplier (a new one must be added here)', () => {
  assert.ok(withArgs.length >= 9, `found ${withArgs.length}`);
  for (const k of withArgs) assert.ok(SUPPLIERS[uxOf(k)], `${k} needs a supplier in this table`);
});

test('B3-06: keys the shared helper feeds render with its arguments, for every way a failure reaches them', () => {
  const rate = new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfter: 7 });
  const rateNoHeader = new ApiError({ status: 429, code: 'RATE_LIMITED' });
  const closed = new ApiError({ status: 409, code: 'WRONG_PHASE', detail: 'election is closed' });
  const early = new ApiError({ status: 409, code: 'WRONG_PHASE', detail: 'voting has not opened' });
  const cases: [string, unknown, string][] = [
    ['rate with Retry-After', rate, 'Wait 7 seconds'],
    ['rate without Retry-After', rateNoHeader, 'Wait 60 seconds'],
    ['closed with known time', closed, TIMES.closes],
    ['not open with known time', early, TIMES.opens],
  ];
  for (const [name, e, expect] of cases) {
    const p = uxPresentation(undefined, e, TIMES);
    for (const part of ['title', 'body'] as const) {
      const key = `qv.err.${p.ux}.${part}` as MessageKey;
      const text = t.t(key, p.args); // throws on a missing argument
      if (part === 'body' || p.ux === 'E-VOT-NOTOPEN') assert.ok(`${t.t(`qv.err.${p.ux}.title` as MessageKey, p.args)} ${t.t(`qv.err.${p.ux}.body` as MessageKey, p.args)}`.includes(expect), `${name}: ${p.ux} ${text}`);
    }
  }
});

test('B3-06: a closed/not-open phase with no known time falls back to the unavailable copy, never to the generic error', () => {
  const closed = new ApiError({ status: 409, code: 'WRONG_PHASE', detail: 'election is closed' });
  const p = uxPresentation(undefined, closed, {});
  assert.equal(p.ux, 'E-API-UNAVAILABLE');
  assert.doesNotThrow(() => t.t(`qv.err.${p.ux}.body` as MessageKey, p.args));
});

test('B3-06: an explicit ux code (controller state) is completed with the same arguments', () => {
  for (const ux of ['E-VOT-CLOSED', 'E-VOT-NOTOPEN', 'E-API-RATE']) {
    const p = uxPresentation(ux, undefined, TIMES);
    for (const part of ['title', 'body']) assert.doesNotThrow(() => t.t(`qv.err.${p.ux}.${part}` as MessageKey, p.args), `${ux}.${part}`);
  }
});

test('B3-06: every key with placeholders renders through the helper or names its argument at a real call site', () => {
  const src = (f: string): string => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  for (const k of withArgs) {
    const ux = uxOf(k);
    const sup = SUPPLIERS[ux]!;
    const needed = [...argNames(parse(EN[k].message))];
    if (sup.by === 'ux') {
      const p = uxPresentation(ux, undefined, TIMES);
      assert.equal(p.ux, ux);
      for (const n of needed) assert.ok(n in p.args, `${k}: helper does not supply {${n}}`);
      t.t(k, p.args);
    } else if (sup.file !== undefined) {
      for (const n of needed) assert.ok(src(sup.file).includes(sup.args![n]!), `${k}: call site for {${n}} not found`);
    } else {
      // unreferenced today: nothing outside the catalog and its tests mentions the code
      const all = ['ui/app.ts', 'flow/publish-ui.ts', 'flow/ballot-controller.ts', 'ui/spoil-shares.ts'].map(src).join('\n');
      assert.ok(!all.includes(`'${ux}'`), `${ux} is now raised somewhere: give it a real supplier`);
    }
  }
});

test('B3-06: no call site renders a uxCodeFor() result without the presentation helper', () => {
  const app = readFileSync(new URL('../src/ui/app.ts', import.meta.url), 'utf8');
  assert.ok(!/errorBox\(\s*uxCodeFor\(/.test(app), 'errorBox(uxCodeFor(e)) loses {time}/{seconds}');
  assert.ok(!/errorBox\(\s*ux\s*,\s*\{\}/.test(app), 'errorBox(ux, {}) loses {time}/{seconds}');
});
