import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSite, csp } from '../src/build/site.ts';
import { EN } from '../src/i18n/en.ts';

const read = (d: string, f: string): string => readFileSync(join(d, f), 'utf8');

test('build: hashed assets, SRI matches content, strict CSP, no inline scripts, reproducible (REQ-018/020/023)', async () => {
  const a = mkdtempSync(join(tmpdir(), 'qvA-'));
  const b = mkdtempSync(join(tmpdir(), 'qvB-'));
  const ra = await buildSite(a);
  const rb = await buildSite(b);
  assert.equal(ra.buildId, rb.buildId, 'two builds are bit-identical');
  assert.equal(read(a, 'asset-manifest.json'), read(b, 'asset-manifest.json'));
  assert.equal(read(a, 'verifier.html'), read(b, 'verifier.html'));
  const html = read(a, 'index.html');
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), 'no inline script');
  assert.ok(!/ on[a-z]+=/i.test(html) && !html.includes('style='), 'no inline handlers or styles');
  assert.ok(!/unsafe-inline|unsafe-eval|wasm-unsafe-eval/.test(html));
  assert.match(html, /require-trusted-types-for 'script'; trusted-types qv-default/);
  assert.ok(!/https?:\/\//.test(html), 'no third-party resources');
  for (const m of html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"[^>]*integrity="(sha384-[^"]+)"/g)) {
    const want = `sha384-${createHash('sha384').update(readFileSync(join(a, m[1]!))).digest('base64')}`;
    assert.equal(m[2], want, m[1]);
    assert.match(m[1]!, /(?:\.[0-9a-f]{12}|-[A-Z0-9]{8})\.(js|css)$/);
  }
  assert.ok((html.match(/integrity=/g) ?? []).length >= 3);
  const entryPath = /<script type="module" src="\/(assets\/[^"]+)"/.exec(html)![1]!;
  for (const imp of read(a, entryPath).matchAll(/(?:import[^;]*?from|import)["']\.\/([^"']+)["']/g)) assert.ok(html.includes(`href="/assets/${imp[1]}" integrity="`), 'static module has a pinned preload');
  assert.ok(!/modulepreload[^>]*catalog/.test(html), 'unoffered translations are not preloaded');
  const mani = JSON.parse(read(a, 'asset-manifest.json')) as { client_assets: { path: string; sha384: string }[] };
  for (const x of mani.client_assets) assert.equal(createHash('sha384').update(readFileSync(join(a, x.path))).digest('hex'), x.sha384);
  const headers = read(a, '_headers');
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Cross-Origin-Embedder-Policy: require-corp/);
  assert.match(headers, /camera=\(\)/);
  assert.ok(csp(['https://board.example']).header.includes("connect-src 'self' https://board.example"));
  for (const f of readdirSync(join(a, 'assets'))) {
    const js = read(a, `assets/${f}`);
    assert.ok(!/\beval\(|new Function\(|document\.write\(/.test(js) || f.endsWith('.css'), `${f} has no eval-style sinks`);
  }
});

test('verifier.html: single file < 400 KB, hash-pinned inline script/style, connect-src none (REQ-016)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'qvV-'));
  const r = await buildSite(d);
  assert.ok(r.verifierBytes < 400 * 1024);
  const html = read(d, 'verifier.html');
  const policy = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!;
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /base-uri 'none'/);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1]!;
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
  assert.ok(policy.includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`));
  assert.ok(policy.includes(`'sha256-${createHash('sha256').update(style).digest('base64')}'`));
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(script), 'no network APIs in the verifier page');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(script, '')), 'no external references');
});

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

test('lint: DOM injection sinks and eval are banned (REQ-019); secrets never touch localStorage (REQ-009)', () => {
  const banned = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(|setAttribute\(\s*['"]style['"]|createContextualFragment|srcdoc|localStorage\.setItem\([^)]*(seed|pass|secret|xi)/i;
  for (const f of walk(SRC).filter((x) => x.endsWith('.ts') && !x.includes('/build/'))) {
    const text = readFileSync(f, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!banned.test(text), `${f} uses a banned sink`);
  }
});

test('lint: CSS uses logical properties only (REQ-080) and every t() key exists in the catalog', () => {
  const css = readFileSync(new URL('../static/styles.css', import.meta.url), 'utf8');
  assert.ok(!/(margin|padding|border)-(left|right)|[^-a-z](left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:|outline\s*:\s*none/.test(css));
  const keys = new Set(Object.keys(EN));
  for (const f of walk(SRC).filter((x) => x.endsWith('.ts'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('(qv\.[A-Za-z0-9_.\-]+)'/g)) assert.ok(keys.has(m[1]!), `${f}: unknown key ${m[1]}`);
  }
});
