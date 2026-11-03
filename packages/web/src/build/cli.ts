import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSite, PKG } from './site.ts';

const out = process.argv[2] ?? join(PKG, 'dist');
const r = await buildSite(out);
const js = r.assets.filter((a) => a.path.endsWith('.js')).reduce((n, a) => n + gzipSync(readFileSync(join(out, a.path))).length, 0);
console.log(`built ${out} (build ${r.buildId}); js gzip ${(js / 1024).toFixed(1)} kB; verifier.html ${(r.verifierBytes / 1024).toFixed(1)} kB`);
if (js > 200 * 1024) console.warn('WARNING: JS exceeds the 200 kB compressed budget (QV-13-REQ-041)');
