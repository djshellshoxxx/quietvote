// Static site generation: hashed assets, SRI, strict CSP (meta + headers file), asset manifest, offline verifier page.
// Deterministic: no timestamps; same inputs give byte-identical output (QV-19 §9).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild, type BuildOptions } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
export const PKG = join(here, '..', '..');

const hashOf = (algo: 'sha256' | 'sha384', data: string | Uint8Array, enc: 'hex' | 'base64'): string => createHash(algo).update(data).digest(enc);
export const sri = (data: string | Uint8Array): string => `sha384-${hashOf('sha384', data, 'base64')}`;

export function csp(boardOrigins: readonly string[] = []): { header: string; meta: string } {
  const connect = ["'self'", ...boardOrigins].join(' ');
  const common = [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self'", `connect-src ${connect}`,
    "worker-src 'self'", "manifest-src 'self'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
    "require-trusted-types-for 'script'", 'trusted-types qv-default', 'upgrade-insecure-requests',
  ];
  return { header: [...common, "frame-ancestors 'none'", 'report-uri /csp-report'].join('; '), meta: common.join('; ') };
}

export function headersFile(boardOrigins: readonly string[] = []): string {
  const { header } = csp(boardOrigins);
  return [
    '/*', `  Content-Security-Policy: ${header}`, '  Cross-Origin-Opener-Policy: same-origin', '  Cross-Origin-Embedder-Policy: require-corp',
    '  Cross-Origin-Resource-Policy: same-origin', '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), interest-cohort=()',
    '  X-Content-Type-Options: nosniff', '  Strict-Transport-Security: max-age=63072000; includeSubDomains', '  Cache-Control: no-cache',
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

export function htmlPage(a: { js: Asset; css: Asset; worker: Asset; version: string; buildId: string; connectOrigins: string[] }): string {
  const { meta } = csp(a.connectOrigins);
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${meta}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="qv-version" content="${a.version}">
<meta name="qv-build" content="${a.buildId}">
<meta name="qv-worker" content="/${a.worker.path}">
<title>QuietVote</title>
<link rel="stylesheet" href="/${a.css.path}" integrity="${a.css.integrity}" crossorigin="anonymous">
<link rel="modulepreload" href="/${a.js.path}" integrity="${a.js.integrity}" crossorigin="anonymous">
</head>
<body>
<div id="app"><p>Loading…</p><noscript><p>Casting needs JavaScript so your ballot can be locked on your device. You can also vote with the command-line tool or ask someone to prepare a ballot file for you.</p></noscript></div>
<script type="module" src="/${a.js.path}" integrity="${a.js.integrity}" crossorigin="anonymous"></script>
</body>
</html>
`;
}

export async function verifierHtml(): Promise<{ html: string; scriptHash: string; styleHash: string }> {
  const r = await esbuild({ ...common, format: 'iife', entryPoints: ['src/verifier/page.ts'], outdir: 'out' });
  const js = new TextDecoder().decode(r.outputFiles![0]!.contents).replace(/<\/script/gi, '<\\/script');
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
  return { html, scriptHash: sh, styleHash: st };
}

export async function buildSite(outDir: string, opts: { version?: string; connectOrigins?: string[] } = {}): Promise<{ assets: Asset[]; buildId: string; verifierBytes: number }> {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  const assets: Asset[] = [];
  const emit = (name: string, ext: string, data: Uint8Array | string): Asset => {
    const sha256 = hashOf('sha256', data, 'hex');
    const path = `assets/${name}.${sha256.slice(0, 12)}.${ext}`;
    writeFileSync(join(outDir, path), data);
    const a: Asset = { path, sha256, sha384: hashOf('sha384', data, 'hex'), integrity: sri(data), size: typeof data === 'string' ? Buffer.byteLength(data) : data.length };
    assets.push(a);
    return a;
  };
  const app = await esbuild({ ...common, entryPoints: { app: 'src/main.ts' }, outdir: 'out' });
  const worker = await esbuild({ ...common, entryPoints: { 'seal-worker': 'src/worker/seal-worker.ts' }, outdir: 'out' });
  const css = readFileSync(join(PKG, 'static', 'styles.css'));
  const js = emit('app', 'js', app.outputFiles![0]!.contents);
  const wk = emit('seal-worker', 'js', worker.outputFiles![0]!.contents);
  const cs = emit('styles', 'css', css);
  const buildId = hashOf('sha256', assets.map((a) => a.sha256).sort().join('\n'), 'hex').slice(0, 12);
  const version = opts.version ?? (JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { version: string }).version;
  const connectOrigins = opts.connectOrigins ?? [];
  writeFileSync(join(outDir, 'index.html'), htmlPage({ js, css: cs, worker: wk, version, buildId, connectOrigins }));
  const v = await verifierHtml();
  writeFileSync(join(outDir, 'verifier.html'), v.html);
  if (Buffer.byteLength(v.html) >= 400 * 1024) throw new Error('verifier.html exceeds 400 KB (QV-19-REQ-016)');
  writeFileSync(join(outDir, '_headers'), headersFile(connectOrigins));
  const manifest = {
    schema: 'qv-client-assets/1', version, build_id: buildId,
    client_assets: assets.map((a) => ({ path: a.path, sha384: a.sha384, sha256: a.sha256, size: a.size })).sort((x, y) => (x.path < y.path ? -1 : 1)),
    verifier_page: { path: 'verifier.html', sha256: hashOf('sha256', v.html, 'hex') },
    index_html: { sha256: hashOf('sha256', readFileSync(join(outDir, 'index.html')), 'hex') },
  };
  writeFileSync(join(outDir, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { assets, buildId, verifierBytes: Buffer.byteLength(v.html) };
}
