import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { precompileI18nPlugin } from '../src/build/precompile.ts';

const testDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(testDir, '..');
const options = {
  absWorkingDir: webDir,
  bundle: true,
  format: 'esm' as const,
  target: 'es2022',
  minify: true,
  legalComments: 'none' as const,
  write: false as const,
  sourcemap: false,
  logLevel: 'silent' as const,
  define: { 'process.env.NODE_ENV': '"production"' },
};

test('ordinary app build precompiles ICU deterministically within gzip budgets', async () => {
  const appOptions = {
    ...options,
    splitting: true,
    chunkNames: '[name]-[hash]',
    metafile: true,
    entryPoints: { app: 'src/main.ts' },
    outdir: 'out',
    plugins: [precompileI18nPlugin()],
  };
  const [app, repeated, worker] = await Promise.all([
    build(appOptions),
    build({ ...appOptions, plugins: [precompileI18nPlugin()] }),
    build({ ...options, entryPoints: { 'seal-worker': 'src/worker/seal-worker.ts' }, outdir: 'out' }),
  ]);

  const outputs = app.outputFiles;
  assert.ok(outputs.length > 1, 'app build should retain split locale chunks');
  const normalized = (files: typeof outputs) => files
    .map((file) => [basename(file.path), file.text] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(normalized(outputs), normalized(repeated.outputFiles), 'repeated app builds should be byte-identical');

  const entry = outputs.find((file) => basename(file.path) === 'app.js');
  assert.ok(entry, `app entry should be present; got ${outputs.map((file) => file.path).join(', ')}`);
  const appText = outputs.map((file) => file.text).join('\n');
  for (const marker of ['IcuSyntaxError', 'identifier expected']) assert.ok(!appText.includes(marker), `app output contains ${marker}`);
  assert.doesNotMatch(appText, /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(/, 'app output should not use eval or Function');
  const inputs = Object.keys(app.metafile!.inputs).map((path) => path.replace(/\\/g, '/'));
  assert.ok(inputs.some((path) => path.endsWith('/catalogs/es.ts')), 'Spanish catalog should remain in app chunks');
  assert.ok(inputs.some((path) => path.endsWith('/catalogs/ar.ts')), 'Arabic catalog should remain in app chunks');

  const entryGzip = gzipSync(entry.contents).byteLength;
  const allGzip = [...outputs, ...worker.outputFiles].reduce((total, file) => total + gzipSync(file.contents).byteLength, 0);
  assert.ok(entryGzip < 110 * 1024, `entry gzip is ${entryGzip} bytes, expected below 110 KiB`);
  assert.ok(allGzip < 200 * 1024, `app and worker gzip total is ${allGzip} bytes, expected below 200 KiB`);
});
