// Static site generation: hashed assets, SRI, strict CSP (meta + headers file), asset manifest, offline verifier page.
// Deterministic: no timestamps; same inputs give byte-identical output (QV-19 §9).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild, type BuildOptions } from 'esbuild';
import { EN } from '../i18n/en.ts';
import { precompileI18nPlugin } from './precompile.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const PKG = join(here, '..', '..');

const hashOf = (algo: 'sha256' | 'sha384', data: string | Uint8Array, enc: 'hex' | 'base64'): string => createHash(algo).update(data).digest(enc);
export const sri = (data: string | Uint8Array): string => `sha384-${hashOf('sha384', data, 'base64')}`;

/** A connect origin is spliced into the CSP and an HTML attribute: only a bare https origin (http for loopback/.onion) is allowed. */
const ORIGIN_RE = /^(?:https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|http:\/\/(?:localhost|127\.0\.0\.1|[a-z0-9.-]+\.onion))(?::\d{1,5})?$/;
export function checkOrigin(o: string): string {
  if (!ORIGIN_RE.test(o)) throw new Error(`invalid connect origin ${JSON.stringify(o)}: expected a bare https origin`);
  return o;
}
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function csp(boardOrigins: readonly string[] = []): { header: string; meta: string } {
  const connect = ["'self'", ...boardOrigins.map(checkOrigin)].join(' ');
  const common = [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'", `connect-src ${connect}`,
    "worker-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    "require-trusted-types-for 'script'", 'trusted-types qv-default', 'upgrade-insecure-requests',
  ];
  return { header: [...common, "frame-ancestors 'none'", 'report-uri /csp-report'].join('; '), meta: common.join('; ') };
}

export function headersFile(boardOrigins: readonly string[] = [], verifier?: { scriptHash: string; styleHash: string; policy: string }): string {
  let { header } = csp(boardOrigins);
  // Hosts can enforce every matching rule. Permit only these exact offline bytes in the common header; the app's
  // own meta CSP still permits no inline code. The offline meta policy independently forbids network and workers.
  if (verifier) header = header.replace("script-src 'self'", `script-src 'self' '${verifier.scriptHash}'`).replace("style-src 'self'", `style-src 'self' '${verifier.styleHash}'`);
  return [
    '/*', `  Content-Security-Policy: ${header}`, '  Cross-Origin-Opener-Policy: same-origin', '  Cross-Origin-Embedder-Policy: require-corp',
    '  Cross-Origin-Resource-Policy: same-origin', '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), interest-cohort=()',
    '  X-Content-Type-Options: nosniff', '  Strict-Transport-Security: max-age=63072000; includeSubDomains', '  Cache-Control: no-cache',
    ...(verifier ? ['/verifier.html', `  Content-Security-Policy: ${verifier.policy}; frame-ancestors 'none'`] : []),
    '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', '',
  ].join('\n');
}

export interface Asset {
  path: string;
  sha256: string;
  sha384: string;
  integrity: string;
  size: number;
}

const common: BuildOptions = {
  bundle: true, format: 'esm', target: 'es2022', minify: true, legalComments: 'none', write: false, sourcemap: false, logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"production"' }, absWorkingDir: PKG,
};

export function htmlPage(a: { js: Asset; css: Asset; worker: Asset; modules?: Asset[]; version: string; buildId: string; connectOrigins: string[] }): string {
  const { meta } = csp(a.connectOrigins);
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${meta}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="qv-version" content="${esc(a.version)}">
<meta name="qv-build" content="${esc(a.buildId)}">
<meta name="qv-worker" content="/${a.worker.path}">
<title>${esc(EN['qv.app.name'].message)}</title>
<link rel="stylesheet" href="/${a.css.path}" integrity="${a.css.integrity}" crossorigin="anonymous">
<link rel="modulepreload" href="/${a.js.path}" integrity="${a.js.integrity}" crossorigin="anonymous">
${(a.modules ?? []).map((m) => `<link rel="modulepreload" href="/${m.path}" integrity="${m.integrity}" crossorigin="anonymous">`).join('\n')}
</head>
<body>
<div id="app"><p>${esc(EN['qv.shell.loading'].message)}</p><noscript><p>${esc(EN['qv.shell.noscript'].message)}</p></noscript></div>
<script type="module" src="/${a.js.path}" integrity="${a.js.integrity}" crossorigin="anonymous"></script>
</body>
</html>
`;
}

export async function verifierHtml(): Promise<{ html: string; scriptHash: string; styleHash: string; policy: string }> {
  const stubCatalogs = {
    name: 'stub-catalogs',
    setup(b: { onResolve(o: { filter: RegExp }, cb: () => { path: string }): void }) {
      b.onResolve({ filter: /catalogs\/(es|fr|de|pt-BR|ar)\.ts$/ }, () => ({ path: resolve('src/i18n/catalogs/verifier-stub.ts') }));
    },
  };
  const r = await esbuild({ ...common, format: 'iife', entryPoints: ['src/verifier/page.ts'], outdir: 'out', plugins: [stubCatalogs] });
  const js = new TextDecoder().decode(r.outputFiles![0]!.contents).replace(/<\/script/gi, '<\\/script').replace(/<script/gi, (m) => `<\\x73${m.slice(2)}`).replace(/<!--/g, '<\\x21--');
  const css = 'body{font:1.1rem/1.6 system-ui,sans-serif;max-inline-size:44rem;margin:1rem auto;padding-inline:16px;background:#fff;color:#14213d}@media(prefers-color-scheme:dark){body{background:#10151f;color:#eef2f8}}label{display:block;font-weight:600;margin-block-start:1rem}input,button{font:inherit;min-block-size:44px}:focus-visible{outline:3px solid #b45309;outline-offset:2px}.sr{position:absolute;clip-path:inset(50%);inline-size:1px;block-size:1px}';
  const sh = `sha256-${hashOf('sha256', js, 'base64')}`;
  const st = `sha256-${hashOf('sha256', css, 'base64')}`;
  const policy = `default-src 'none'; script-src '${sh}'; style-src '${st}'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`;
  const html = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QuietVote verifier</title><style>${css}</style></head>
<body><main><h1>Verify an election</h1><p>This page makes no network requests. You can disconnect before you load a bundle.</p>
<p>A checker you didn’t download or compare yourself can lie. Compare this file’s SHA-256 with the signed release manifest.</p>
<label for="file">Election bundle file (JSON)</label><input id="file" type="file" accept="application/json">
<label for="anchor">Election ID you were told (from your organizer, not from this page)</label><input id="anchor" type="text" autocomplete="off" spellcheck="false">
<p><button id="run" type="button">Run checks</button></p><div id="out"></div><div id="live" class="sr" role="status" aria-live="polite"></div></main>
<script>${js}</script></body></html>
`;
  return { html, scriptHash: sh, styleHash: st, policy };
}

export async function buildSite(outDir: string, opts: { version?: string; connectOrigins?: string[] } = {}): Promise<{ assets: Asset[]; buildId: string; verifierBytes: number }> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  const assets: Asset[] = [];
  const emitNamed = (file: string, data: Uint8Array): Asset => {
    const path = `assets/${file}`;
    writeFileSync(join(outDir, path), data);
    const a: Asset = { path, sha256: hashOf('sha256', data, 'hex'), sha384: hashOf('sha384', data, 'hex'), integrity: sri(data), size: data.length };
    assets.push(a);
    return a;
  };
  const emit = (name: string, ext: string, data: Uint8Array | string): Asset => {
    const sha256 = hashOf('sha256', data, 'hex');
    const path = `assets/${name}.${sha256.slice(0, 12)}.${ext}`;
    writeFileSync(join(outDir, path), data);
    const a: Asset = { path, sha256, sha384: hashOf('sha384', data, 'hex'), integrity: sri(data), size: typeof data === 'string' ? Buffer.byteLength(data) : data.length };
    assets.push(a);
    return a;
  };
  // Code splitting: dynamic import() boundaries (translated catalogs, results chart) become chunks next to the entry. esbuild names
  // chunks by content hash, so imports between files stay valid; the entry is renamed by its own hash below and imports its chunks
  // by relative path (all live in assets/; esbuild names shared chunks `chunk-<hash>.js`). Chunks are listed in asset-manifest.json like every other asset.
  const app = await esbuild({ ...common, metafile: true, splitting: true, chunkNames: '[name]-[hash]', entryPoints: { app: 'src/main.ts' }, outdir: 'out', plugins: [precompileI18nPlugin()] });
  const worker = await esbuild({ ...common, entryPoints: { 'seal-worker': 'src/worker/seal-worker.ts' }, outdir: 'out' });
  const css = readFileSync(join(PKG, 'static', 'styles.css'));
  const entry = app.outputFiles!.find((f) => /[\\/]app\.js$/.test(f.path));
  if (entry === undefined) throw new Error('entry bundle missing from build output');
  const chunks = app.outputFiles!.filter((f) => f !== entry).sort((x, y) => (x.path < y.path ? -1 : 1));
  for (const c of chunks) emitNamed(c.path.split(/[\\/]/).pop()!, c.contents);
  const js = emit('app', 'js', entry.contents);
  const wk = emit('seal-worker', 'js', worker.outputFiles![0]!.contents);
  const cs = emit('styles', 'css', css);
  const buildId = hashOf('sha256', assets.map((a) => a.sha256).sort().join('\n'), 'hex').slice(0, 12);
  const version = opts.version ?? (JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { version: string }).version;
  const connectOrigins = opts.connectOrigins ?? [];
  const staticModules = new Set<string>();
  const visit = (path: string): void => {
    for (const imp of app.metafile!.outputs[path]?.imports ?? []) {
      if (imp.kind !== 'import-statement' || imp.external || staticModules.has(imp.path)) continue;
      staticModules.add(imp.path); visit(imp.path);
    }
  };
  visit(Object.keys(app.metafile!.outputs).find((p) => p.endsWith('/app.js'))!);
  const staticNames = new Set([...staticModules].map((p) => `assets/${p.split('/').pop()!}`));
  writeFileSync(join(outDir, 'index.html'), htmlPage({ js, css: cs, worker: wk, modules: assets.filter((a) => staticNames.has(a.path)), version, buildId, connectOrigins }));
  const v = await verifierHtml();
  writeFileSync(join(outDir, 'verifier.html'), v.html);
  if (Buffer.byteLength(v.html) >= 400 * 1024) throw new Error('verifier.html exceeds 400 KB (QV-19-REQ-016)');
  writeFileSync(join(outDir, '_headers'), headersFile(connectOrigins, v));
  const manifest = {
    schema: 'qv-client-assets/1', version, build_id: buildId,
    client_assets: assets.map((a) => ({ path: a.path, sha384: a.sha384, sha256: a.sha256, size: a.size })).sort((x, y) => (x.path < y.path ? -1 : 1)),
    verifier_page: { path: 'verifier.html', sha256: hashOf('sha256', v.html, 'hex') },
    index_html: { sha256: hashOf('sha256', readFileSync(join(outDir, 'index.html')), 'hex') },
  };
  writeFileSync(join(outDir, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { assets, buildId, verifierBytes: Buffer.byteLength(v.html) };
}
