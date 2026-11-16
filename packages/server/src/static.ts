// Static asset server: an in-memory map built at startup (no request-derived filesystem access, R-02 §4.4).
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { sha256 } from '@quietvote/crypto';
import { toHex } from '@quietvote/board';
import type { Reply, StaticHandler } from './http.ts';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', woff2: 'font/woff2', map: 'application/json',
};

export interface Asset { path: string; bytes: Uint8Array; type: string; sha256: string }

export class StaticAssets implements StaticHandler {
  readonly files = new Map<string, Asset>();
  private verifierCsp: string | undefined;
  constructor(dir: string) {
    if (lstatSync(dir).isSymbolicLink()) throw new Error('static root must not be a symlink');
    const root = realpathSync(dir);
    if (!lstatSync(root).isDirectory()) throw new Error('static root must be a directory');
    const walk = (rel: string, depth: number): void => {
      if (depth > 8 || this.files.size > 5000) throw new Error('static dir too large');
      for (const name of readdirSync(join(root, rel))) {
        const r = rel ? `${rel}/${name}` : name;
        const path = join(root, r);
        const st = lstatSync(path);
        // Reject links even when their current target is inside the root. Deployment
        // mistakes must fail startup rather than quietly publish linked host files.
        if (st.isSymbolicLink()) throw new Error('static asset must not be a symlink');
        const resolved = relative(root, realpathSync(path));
        if (isAbsolute(resolved) || resolved === '..' || resolved.startsWith(`..${sep}`)) throw new Error('static asset escapes root');
        if (st.isDirectory()) walk(r, depth + 1);
        else if (!st.isFile()) throw new Error('static asset must be a regular file');
        else if (st.size <= 16 * 1024 * 1024) {
          // O_NOFOLLOW protects the final component on supporting platforms; fstat
          // additionally rejects replacement between inspection and opening.
          const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
          try {
            const opened = fstatSync(fd);
            if (!opened.isFile() || opened.dev !== st.dev || opened.ino !== st.ino) throw new Error('static asset changed during load');
            if (opened.size > 16 * 1024 * 1024) throw new Error('static asset grew during load');
            const bytes = new Uint8Array(readFileSync(fd));
            this.files.set('/' + r, { path: r, bytes, type: TYPES[name.split('.').pop() ?? ''] ?? 'application/octet-stream', sha256: toHex(sha256(bytes)) });
          } finally { closeSync(fd); }
        }
      }
    };
    walk('', 0);
    const verifier = this.files.get('/verifier.html');
    if (verifier) {
      const html = new TextDecoder().decode(verifier.bytes);
      const hash = (s: string): string => `sha256-${Buffer.from(sha256(new TextEncoder().encode(s))).toString('base64')}`;
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
      const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
      // Accept only the build's closed offline policy, with hashes recomputed from the actual inline bytes.
      // Unrecognized documents keep the default policy; an asset cannot supply arbitrary header directives.
      if (scripts.length === 1 && styles.length === 1) {
        const policy = `default-src 'none'; script-src '${hash(scripts[0]![1]!)}'; style-src '${hash(styles[0]![1]!)}'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`;
        const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
        if (html.includes(tag)) this.verifierCsp = `${policy}; frame-ancestors 'none'`;
      }
    }
  }
  serve(path: string, _m: string): Reply | undefined {
    // the API namespace is never answered with the SPA shell: a mistyped endpoint must be a 404 problem, not a 200 HTML page
    if (path === '/api' || path.startsWith('/api/')) return undefined;
    const key = path === '/' ? '/index.html' : path;
    let a = this.files.get(key);
    if (!a && !/\.[a-z0-9]+$/i.test(key)) a = this.files.get('/index.html'); // SPA fallback
    if (!a) return undefined;
    return { status: 200, bytes: a.bytes, contentType: a.type, etag: `"${a.sha256.slice(0, 32)}"`, cache: 'no-cache', ...(key === '/verifier.html' && this.verifierCsp ? { csp: this.verifierCsp } : {}) };
  }
  manifest(): { path: string; sha256: string }[] {
    return [...this.files.values()].map((a) => ({ path: a.path, sha256: a.sha256 })).sort((x, y) => (x.path < y.path ? -1 : 1));
  }
}
