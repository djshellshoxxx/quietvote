import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSite, PKG } from './site.ts';

const out = process.argv[2] ?? join(PKG, 'dist');
const r = await buildSite(out);
const gz = (p: string): number => gzipSync(readFileSync(join(out, p))).length;
const jsAssets = r.assets.filter((a) => a.path.endsWith('.js'));
const js = jsAssets.reduce((n, a) => n + gz(a.path), 0);
// Initial load = the entry module only; chunks (catalogs, charts) and the seal worker are fetched on demand.
const entry = jsAssets.find((a) => /^assets\/app\./.test(a.path));
console.log(`built ${out} (build ${r.buildId}); js gzip ${(js / 1024).toFixed(1)} kB (all files)${entry ? `, entry ${(gz(entry.path) / 1024).toFixed(1)} kB` : ''}; verifier.html ${(r.verifierBytes / 1024).toFixed(1)} kB`);
for (const a of jsAssets) console.log(`  ${a.path}: ${(a.size / 1024).toFixed(1)} kB raw, ${(gz(a.path) / 1024).toFixed(1)} kB gzip`);
if (js > 200 * 1024) console.warn('WARNING: JS exceeds the 200 kB compressed budget (QV-13-REQ-041)');
