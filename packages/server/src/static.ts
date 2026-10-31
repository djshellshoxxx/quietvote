// Static asset server: an in-memory map built at startup (no request-derived filesystem access, R-02 §4.4).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
  constructor(dir: string) {
    const walk = (rel: string, depth: number): void => {
      if (depth > 8 || this.files.size > 5000) throw new Error('static dir too large');
      for (const name of readdirSync(join(dir, rel))) {
        const r = rel ? `${rel}/${name}` : name;
        const st = statSync(join(dir, r));
        if (st.isDirectory()) walk(r, depth + 1);
        else if (st.isFile() && st.size <= 16 * 1024 * 1024) {
          const bytes = new Uint8Array(readFileSync(join(dir, r)));
          this.files.set('/' + r, { path: r, bytes, type: TYPES[name.split('.').pop() ?? ''] ?? 'application/octet-stream', sha256: toHex(sha256(bytes)) });
        }
      }
    };
    walk('', 0);
  }
  serve(path: string, _m: string): Reply | undefined {
    // the API namespace is never answered with the SPA shell: a mistyped endpoint must be a 404 problem, not a 200 HTML page
    if (path === '/api' || path.startsWith('/api/')) return undefined;
    const key = path === '/' ? '/index.html' : path;
    let a = this.files.get(key);
    if (!a && !/\.[a-z0-9]+$/i.test(key)) a = this.files.get('/index.html'); // SPA fallback
    if (!a) return undefined;
    return { status: 200, bytes: a.bytes, contentType: a.type, etag: `"${a.sha256.slice(0, 32)}"`, cache: 'no-cache' };
  }
  manifest(): { path: string; sha256: string }[] {
    return [...this.files.values()].map((a) => ({ path: a.path, sha256: a.sha256 })).sort((x, y) => (x.path < y.path ? -1 : 1));
  }
}
