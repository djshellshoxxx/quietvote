// Automated ordinary-UI accessibility browser checks (Home, Help, not-found) with Playwright + Chromium.
// NOT a WCAG conformance claim: these are automated heuristics. They do not replace manual keyboard testing or testing with real
// assistive technology (screen readers, voice control, switch devices), or review by people with disabilities.
// No election, vote, key, verifier, receipt or API flows are exercised. Playwright is not a repo dependency; it is loaded from the
// global install and the script skips (exit 0) when Playwright or Chromium is missing (QV_REQUIRE_BROWSER=1 makes a skip fail; QV_CHROMIUM overrides the binary).
// Run from the repository root: node packages/web/e2e/a11y.ts
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildSite, csp } from '../src/build/site.ts';

const req = createRequire('/opt/node22/lib/node_modules/');
let pw: typeof import('playwright');
try {
  pw = req('playwright');
} catch {
  console.log('a11y skipped: playwright is not installed');
  process.exit(process.env.QV_REQUIRE_BROWSER ? 1 : 0);
}
let browser: import('playwright').Browser;
try {
  browser = await pw.chromium.launch(process.env.QV_CHROMIUM ? { executablePath: process.env.QV_CHROMIUM } : {});
} catch (e) {
  console.log('a11y skipped: chromium cannot be launched:', e instanceof Error ? e.message.split('\n')[0] : e);
  process.exit(process.env.QV_REQUIRE_BROWSER ? 1 : 0);
}

type Page = import('playwright').Page;

// ---------------------------------------------------------------- servers
const dist = mkdtempSync(join(tmpdir(), 'qv-a11y-'));
await buildSite(dist);
const policy = csp().header;
const MIME: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const unexpected: string[] = [];
const server = createServer((rq, rs) => {
  const path = new URL(rq.url ?? '/', 'http://x').pathname;
  if (path === '/favicon.ico') return void rs.writeHead(404).end();
  const asset = path.startsWith('/assets/') && existsSync(join(dist, path));
  if (!asset && /^\/(api|assets)\//.test(path)) { unexpected.push(path); return void rs.writeHead(404).end(); }
  const file = asset ? path : '/index.html';
  rs.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': policy, 'X-Content-Type-Options': 'nosniff' });
  rs.end(readFileSync(join(dist, file)));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// Pseudo-locale harness: bundles startApp with en-XA / ar-XB tables built from the English source with i18n/pseudo.ts. The pseudo tier is
// never "offered" (gate), so the test registers them as tier 1 with review hashes computed from the current English text.
const pseudoEntry = String.raw`
import { startApp } from './src/ui/app.ts';
import { MemoryStorage } from './src/key/storage.ts';
import { EN, MESSAGE_KEYS } from './src/i18n/en.ts';
import { sourceHash } from './src/i18n/locales-core.ts';
import { pseudoEnXA, pseudoArXB } from './src/i18n/pseudo.ts';
const def = (tag, dir, f) => {
  const messages = {}; const review = {};
  for (const k of MESSAGE_KEYS) { messages[k] = f(EN[k].message); review[k] = sourceHash(k); }
  return { tag, dir, autonym: tag, tier: 1, messages, review };
};
startApp({ root: document.getElementById('app'), storage: new MemoryStorage(), build: { version: 'test', id: 'a11y-pseudo' },
  locales: [{ tag: 'en', dir: 'ltr', autonym: 'English', tier: 'source', messages: {}, review: {} }, def('en-XA', 'ltr', pseudoEnXA), def('ar-XB', 'rtl', pseudoArXB)] });
`;
const bundle = await build({ stdin: { contents: pseudoEntry, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'js' }, bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const css = readFileSync(new URL('../static/styles.css', import.meta.url));
const pseudoServer = createServer((rq, rs) => {
  const path = new URL(rq.url ?? '/', 'http://x').pathname;
  if (path === '/p.js') { rs.setHeader('Content-Type', 'text/javascript'); rs.end(bundle.outputFiles[0]!.contents); }
  else if (path === '/styles.css') { rs.setHeader('Content-Type', 'text/css'); rs.end(css); }
  else if (path === '/help' || path === '/') { rs.setHeader('Content-Type', 'text/html'); rs.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/p.js"></script></html>'); }
  else rs.writeHead(404).end();
});
await new Promise<void>((r) => pseudoServer.listen(0, '127.0.0.1', r));
const pseudoOrigin = `http://127.0.0.1:${(pseudoServer.address() as { port: number }).port}`;

// ---------------------------------------------------------------- reporting
let failed = 0;
let total = 0;
const report = (ok: boolean, name: string, detail = ''): void => {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  -' : 'FAIL-'} ${name}${detail ? ` (${detail})` : ''}`);
};
const step = async (name: string, f: () => Promise<string | void>): Promise<void> => {
  try {
    report(true, name, (await f()) || '');
  } catch (e) {
    report(false, name, e instanceof Error ? e.message.split('\n')[0] : String(e));
  }
};
const need = (ok: boolean, msg: string): void => { if (!ok) throw new Error(msg); };

const PAGES = [{ path: '/', label: 'Home' }, { path: '/help', label: 'Help' }, { path: '/no-such-page', label: 'Not found' }];
const open = async (page: Page, path: string, base = origin): Promise<void> => {
  await page.goto(base + path);
  await page.locator('main').first().waitFor({ timeout: 10_000 });
  await page.locator('main h1, main h2').first().waitFor({ timeout: 10_000 });
};
// Every page records CSP / Trusted Types console reports and uncaught errors, so the final check covers the whole run.
const errors: string[] = [];
const newPage = async (o: import('playwright').BrowserContextOptions = {}): Promise<Page> => {
  const pg = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ...o })).newPage();
  pg.on('console', (m) => { if (/Content Security|Trusted Type/i.test(m.text())) errors.push(m.text()); });
  pg.on('pageerror', (e) => errors.push(e.message));
  return pg;
};

// ---------------------------------------------------------------- in-page helpers (serialised into the browser)
interface Rgba { r: number; g: number; b: number; a: number }
const lum = (c: Rgba): number => {
  const f = (v: number): number => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a: Rgba, b: Rgba): number => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]; return (hi + 0.05) / (lo + 0.05); };

/** Samples [selector, kind] text elements: foreground colour and effective (composited) background colour, as CSS strings. */
const SAMPLE_FN = `(targets) => {
  const out = [];
  const parse = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const over = (top, bot) => { const a = top.a + bot.a * (1 - top.a); return a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  const effBg = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); let c = { r: 255, g: 255, b: 255, a: 1 }; for (const l of chain.reverse()) if (l) c = over(l, c); return c; };
  for (const [sel, kind] of targets) for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || !(el.textContent || '').trim() || el.closest('.sr-only,[disabled],[aria-disabled=true]')) continue;
    const fg = parse(cs.color); if (!fg) { out.push({ kind, text: 'unparseable ' + cs.color, fg: null, bg: null, large: false }); continue; }
    const bg = effBg(el); const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    out.push({ kind, text: (el.textContent || '').trim().slice(0, 30), fg: over(fg, bg), bg, large: size >= 24 || (bold && size >= 18.66) });
  }
  return out;
}`;
const TARGETS: [string, string][] = [['main p, main li', 'body text'], ['main h1, main h2', 'heading'], ['a', 'link'], ['button, .btn', 'button'], ['label, legend', 'label'], ['.hint', 'hint'], ['footer p', 'footer'], ['.banner', 'banner'], ['select, input', 'control text']];

async function contrastOf(page: Page): Promise<{ min: number; worst: string; n: number }> {
  const samples = (await page.evaluate(`(${SAMPLE_FN})(${JSON.stringify(TARGETS)})`)) as { kind: string; text: string; fg: Rgba | null; bg: Rgba; large: boolean }[];
  need(samples.length > 0, 'no text samples');
  let min = Infinity;
  let worst = '';
  for (const s of samples) {
    need(s.fg !== null, s.text);
    const r = ratio(s.fg!, s.bg);
    const need_ = s.large ? 3 : 4.5;
    if (r / need_ < min) { min = r / need_; worst = `${s.kind} "${s.text}" ${r.toFixed(2)}:1 (needs ${need_})`; }
  }
  return { min, worst, n: samples.length };
}

// ---------------------------------------------------------------- checks
try {
  const page = await newPage();

  // landmarks and document language
  for (const p of PAGES) {
    await step(`landmarks ${p.label}`, async () => {
      await open(page, p.path);
      const c = await page.evaluate(() => ({
        main: document.querySelectorAll('main, [role=main]').length,
        banner: [...document.querySelectorAll('header, [role=banner]')].filter((e) => !e.closest('main, article, section, aside, nav')).length,
        nav: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label') ?? n.getAttribute('aria-labelledby') ?? ''),
        footer: [...document.querySelectorAll('footer, [role=contentinfo]')].filter((e) => !e.closest('main, article, section, aside, nav')).length,
        h1: document.querySelectorAll('h1').length,
        lang: document.documentElement.lang, dir: document.documentElement.dir,
      }));
      need(c.main === 1, `main count ${c.main}`);
      need(c.banner >= 1, 'no header/banner landmark');
      need(c.nav.length >= 1 && c.nav.every((n) => n.trim() !== ''), `nav names ${JSON.stringify(c.nav)}`);
      need(c.footer >= 1, 'no footer/contentinfo');
      need(c.h1 === 1, `h1 count ${c.h1}`);
      need(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(c.lang), `lang "${c.lang}"`);
      need(c.dir === 'ltr' || c.dir === 'rtl', `dir "${c.dir}"`);
      return `lang=${c.lang} dir=${c.dir} nav=${c.nav.join('|')}`;
    });
  }

  // skip link
  for (const p of PAGES) {
    await step(`skip link ${p.label}: first Tab after load focuses it`, async () => {
      await open(page, p.path); // fresh load, no scripted focus changes: this is what a keyboard user gets
      const initial = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
      await page.keyboard.press('Tab');
      const first = await page.evaluate(() => { const a = document.activeElement as HTMLElement; const r = a.getBoundingClientRect(); const v = innerHeight; return { cls: a.className, href: a.getAttribute('href'), visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < v && r.right > 0 && r.left < innerWidth, clip: getComputedStyle(a).clipPath }; });
      need(first.cls.includes('skip') && first.href === '#main', `first Tab after load focused ${JSON.stringify(first)} (focus was on <${initial}> after load)`);
    });
    await step(`skip link ${p.label}: visible when focused, Enter moves focus to main`, async () => {
      await open(page, p.path);
      await page.locator('a.skip').focus(); // independent of where load-time focus is
      const v = await page.evaluate(() => { const r = document.activeElement!.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0 && getComputedStyle(document.activeElement!).clipPath === 'none'; });
      need(v, 'skip link not visible on focus');
      await page.keyboard.press('Enter');
      const moved = await page.evaluate(() => document.activeElement?.id === 'main' && document.activeElement.tagName === 'MAIN');
      need(moved, 'Enter did not move focus to main');
    });
  }

  // aria-current
  for (const p of PAGES.slice(0, 2)) {
    await step(`aria-current=page on ${p.label}`, async () => {
      await open(page, p.path);
      const cur = await page.evaluate(() => [...document.querySelectorAll('a[aria-current=page]')].map((a) => a.getAttribute('href')));
      need(cur.length === 1 && cur[0] === p.path, `current links ${JSON.stringify(cur)}`);
      return String(cur[0]);
    });
  }
  await step('no aria-current=page on not-found', async () => {
    await open(page, '/no-such-page');
    const n = await page.locator('a[aria-current=page]').count();
    need(n === 0, `${n} current links`);
  });

  // keyboard order + focus indicator
  const FOCUS_FN = () => {
    const a = document.activeElement as HTMLElement;
    const cs = getComputedStyle(a);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const shadow = cs.boxShadow !== 'none';
    const r = a.getBoundingClientRect();
    return { tag: a.tagName.toLowerCase(), text: (a.textContent ?? a.getAttribute('aria-label') ?? '').trim().slice(0, 24), outline, shadow, focusVisible: a.matches(':focus-visible'), w: r.width, h: r.height, key: (a.dataset.qvTabKey ??= String(document.querySelectorAll('[data-qv-tab-key]').length)) };
  };
  const tabThrough = async (p: Page, fresh = true): Promise<ReturnType<typeof FOCUS_FN>[]> => {
    if (fresh) await p.locator('a.skip').focus();
    const seen: ReturnType<typeof FOCUS_FN>[] = [];
    for (let i = 0; i < 60; i++) {
      await p.keyboard.press('Tab');
      const f = await p.evaluate(FOCUS_FN);
      if (f.tag === 'body' || (seen.length > 0 && seen[0]!.key === f.key && seen.length > 2)) break;
      seen.push(f);
    }
    return seen;
  };
  for (const p of PAGES) {
    await step(`keyboard: Tab reaches every link/control with visible focus indicator on ${p.label}`, async () => {
      await open(page, p.path);
      // Start traversal at the skip link (the first Tab stop), so this check is independent of where load-time focus put the cursor.
      await page.locator('a.skip').focus();
      const seen = [await page.evaluate(FOCUS_FN), ...(await tabThrough(page, false))];
      const expected = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex="0"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !(e as HTMLInputElement).disabled && !e.closest('.sr-only'); }).length);
      need(seen.length >= expected, `Tab reached ${seen.length} of ${expected} focusable elements`);
      const bad = seen.filter((s) => !(s.outline || s.shadow) || !s.focusVisible);
      need(bad.length === 0, `no focus indicator on ${bad.map((b) => `${b.tag}:${b.text}`).join(', ')}`);
      return `${seen.length} stops: ${seen.map((s) => s.text || s.tag).join(' > ')}`;
    });
  }

  // Help controls are labelled
  await step('Help controls: theme select and high-contrast checkbox have accessible names', async () => {
    await open(page, '/help');
    const theme = page.getByLabel('Colour theme');
    const contrast = page.getByLabel('High contrast');
    need((await theme.count()) === 1 && (await contrast.count()) === 1, 'label lookup not unique');
    need((await theme.evaluate((e) => e.tagName)) === 'SELECT', 'theme is not a select');
    need((await contrast.getAttribute('type')) === 'checkbox', 'contrast is not a checkbox');
    need((await page.getByRole('combobox', { name: 'Colour theme' }).count()) === 1, 'role combobox name missing');
    need((await page.getByRole('checkbox', { name: 'High contrast' }).count()) === 1, 'role checkbox name missing');
    const opts = await theme.locator('option').allTextContents();
    need(opts.length === 3 && opts.every((o) => o.trim() !== ''), `option names ${JSON.stringify(opts)}`);
    // keyboard operation
    await theme.focus();
    await theme.selectOption('dark');
    need((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'theme not applied');
    await contrast.focus();
    await page.keyboard.press('Space');
    need(await contrast.isChecked(), 'Space did not toggle contrast');
    need((await page.evaluate(() => 'contrast' in document.documentElement.dataset)) === true, 'data-contrast not set');
    return opts.join('/');
  });

  // contrast
  const modes: { name: string; scheme: 'light' | 'dark'; theme?: string; hc?: boolean }[] = [
    { name: 'light', scheme: 'light' }, { name: 'dark (prefers-color-scheme)', scheme: 'dark' },
    { name: 'dark (explicit theme)', scheme: 'light', theme: 'dark' }, { name: 'high contrast', scheme: 'light', hc: true }, { name: 'high contrast + dark', scheme: 'dark', hc: true },
  ];
  for (const m of modes) {
    for (const p of PAGES) {
      await step(`contrast ${m.name} ${p.label}`, async () => {
        const pg = await newPage({ colorScheme: m.scheme });
        try {
          await open(pg, '/help');
          if (m.theme) await pg.getByLabel('Colour theme').selectOption(m.theme);
          if (m.hc) await pg.getByLabel('High contrast').check();
          if (p.path !== '/help') {
            // client-side navigation keeps the chosen settings
            await pg.evaluate((path) => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); }, p.path);
            await pg.locator('main h1, main h2').first().waitFor();
          }
          const r = await contrastOf(pg);
          need(r.min >= 1, `below threshold: worst ${r.worst}`);
          return `${r.n} samples, worst ${r.worst}`;
        } finally {
          await pg.context().close();
        }
      });
    }
  }

  // forced colors
  for (const p of PAGES) {
    await step(`forced-colors ${p.label}`, async () => {
      const pg = await newPage({ forcedColors: 'active' });
      try {
        await open(pg, p.path);
        need(await pg.evaluate(() => matchMedia('(forced-colors: active)').matches), 'forced-colors not active');
        const hidden = await pg.evaluate(() => [...document.querySelectorAll('main, header, footer, nav, a[href], button, input, select, h1')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') && !e.closest('.sr-only'); }).map((e) => e.tagName + ':' + (e.textContent ?? '').slice(0, 20)));
        need(hidden.length === 0, `hidden: ${hidden.join(', ')}`);
        const seen = await tabThrough(pg);
        need(seen.length > 0, 'nothing focusable');
        const bad = seen.filter((s) => !(s.outline || s.shadow));
        need(bad.length === 0, `no focus indicator on ${bad.map((b) => b.text).join(', ')}`);
        const sameColour = await pg.evaluate(() => [...document.querySelectorAll('p, a, h1, label')].filter((e) => { const cs = getComputedStyle(e); return e.getBoundingClientRect().width > 0 && cs.color === getComputedStyle(document.body).backgroundColor && (e.textContent ?? '').trim() !== ''; }).length);
        need(sameColour === 0, `${sameColour} elements with text colour equal to page background`);
        if (p.path === '/help') {
          need((await pg.getByLabel('Colour theme').isVisible()) && (await pg.getByLabel('High contrast').isVisible()), 'Help controls not visible');
          const border = await pg.getByLabel('Colour theme').evaluate((e) => getComputedStyle(e).borderTopStyle);
          need(border !== 'none', 'select has no border');
        }
        return `${seen.length} focus stops`;
      } finally {
        await pg.context().close();
      }
    });
  }

  // reflow and text scaling
  const overflow = (): { sw: number; cw: number; clipped: string[] } => {
    const root = document.documentElement;
    const clipped = [...document.body.querySelectorAll('*')].filter((e) => {
      if (e.closest('.sr-only, .skip, svg, noscript')) return false;
      const cs = getComputedStyle(e);
      if (cs.display === 'inline' || cs.display === 'none' || !(e.textContent ?? '').trim()) return false;
      const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
      return clips && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll';
    }).map((e) => e.tagName.toLowerCase() + '.' + e.className);
    const beyond = [...document.body.querySelectorAll('main *, header *, footer *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.sr-only, .skip'); }).map((e) => e.tagName.toLowerCase() + '.' + e.className + ':' + (e.textContent ?? '').slice(0, 20));
    // Text that runs past its own box (e.g. an unbreakable string) without enlarging the box.
    const spill = [...document.body.querySelectorAll('main *, header *, footer *, .banner')].filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'inline' && !e.closest('.sr-only, .skip, svg') && cs.overflowX === 'visible' && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0; }).map((e) => e.tagName.toLowerCase() + '.' + e.className + ' [' + (e.textContent ?? '').slice(0, 24) + '] box ' + e.clientWidth + ' < content ' + e.scrollWidth);
    return { sw: root.scrollWidth, cw: root.clientWidth, clipped: [...clipped, ...beyond, ...spill] };
  };
  for (const p of PAGES) {
    await step(`reflow 320x640 ${p.label}`, async () => {
      const pg = await newPage({ viewport: { width: 320, height: 640 } });
      try {
        await open(pg, p.path);
        const o = await pg.evaluate(overflow);
        need(o.sw <= o.cw + 1, `horizontal scroll: scrollWidth ${o.sw} > clientWidth ${o.cw}`);
        need(o.clipped.length === 0, `clipped/overflowing: ${o.clipped.slice(0, 5).join(', ')}`);
        return `scrollWidth ${o.sw} clientWidth ${o.cw}`;
      } finally {
        await pg.context().close();
      }
    });
    await step(`text scaling 200% at 640px ${p.label}`, async () => {
      const pg = await newPage({ viewport: { width: 640, height: 800 } });
      try {
        await open(pg, p.path);
        await pg.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        const o = await pg.evaluate(overflow);
        need(o.sw <= o.cw + 1, `horizontal scroll: scrollWidth ${o.sw} > clientWidth ${o.cw}`);
        need(o.clipped.length === 0, `clipped/overflowing: ${o.clipped.slice(0, 5).join(', ')}`);
        return `scrollWidth ${o.sw} clientWidth ${o.cw}`;
      } finally {
        await pg.context().close();
      }
    });
  }

  // pseudo-locales
  const locs = [{ lang: 'en-XA', dir: 'ltr' }, { lang: 'ar-XB', dir: 'rtl' }];
  for (const l of locs) {
    for (const p of PAGES.slice(0, 2)) {
      await step(`pseudo-locale ${l.lang} ${p.label}: lang/dir, 320px reflow, no clipped text`, async () => {
        const pg = await newPage({ viewport: { width: 320, height: 640 } });
        try {
          await pg.goto(`${pseudoOrigin}${p.path}?lang=${l.lang}`);
          await pg.locator('main h1').first().waitFor({ timeout: 10_000 });
          const d = await pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, h1: document.querySelector('main h1')?.textContent ?? '' }));
          need(d.lang === l.lang && d.dir === l.dir, `lang=${d.lang} dir=${d.dir}`);
          need(d.h1 !== '' && (l.lang === 'en-XA' ? d.h1.startsWith('[') : d.h1.length > 0), `h1 not pseudo-localised: ${d.h1}`);
          const o = await pg.evaluate(overflow);
          need(o.sw <= o.cw + 1, `horizontal scroll: scrollWidth ${o.sw} > clientWidth ${o.cw}; ${o.clipped.length} overflowing boxes, e.g. ${o.clipped.slice(0, 3).join(' ; ')}`);
          need(o.clipped.length === 0, `clipped/overflowing: ${o.clipped.slice(0, 5).join(', ')}`);
          if (l.dir === 'rtl') {
            const side = await pg.evaluate(() => { return { cs: getComputedStyle(document.querySelector('main p')!).direction, align: getComputedStyle(document.querySelector('main p')!).textAlign }; });
            need(side.cs === 'rtl', `main text direction ${side.cs}`);
          }
          return `scrollWidth ${o.sw} clientWidth ${o.cw}`;
        } finally {
          await pg.context().close();
        }
      });
    }
  }

  await step('no CSP / Trusted Types violations or page errors, no unexpected requests', async () => {
    need(errors.length === 0, errors.join(' | '));
    need(unexpected.length === 0, `unexpected requests ${unexpected.join(',')}`);
  });
} finally {
  await browser.close();
  server.close();
  pseudoServer.close();
  rmSync(dist, { recursive: true, force: true });
}
console.log(`${total - failed}/${total} automated accessibility checks passed (not a WCAG conformance claim; no assistive-technology testing)`);
if (failed > 0) process.exit(1);
