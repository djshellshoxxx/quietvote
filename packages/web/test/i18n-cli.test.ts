import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/i18n-check.ts', import.meta.url));
const packageRoot = resolve(script, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const scopedFiles = new Set([
  'packages/web/src/ui/app.ts',
  'packages/web/src/main.ts',
  'packages/web/src/ui/dom.ts',
  'packages/web/src/ui/charts.ts',
]);

async function run(args: string[] = [], cwd = repoRoot) {
  return execFileAsync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

test('i18n CLI emits clean, deterministic JSON with bounded scan metadata', async () => {
  const first = await run(['--json']);
  const second = await run(['--json']);
  assert.equal(first.stdout, second.stdout);
  assert.equal(first.stderr, '');

  // Parsing the complete stdout proves the command emitted no npm or other wrapper text.
  const report: unknown = JSON.parse(first.stdout);
  assert.ok(report && typeof report === 'object' && !Array.isArray(report));
  const result = report as Record<string, unknown>;
  assert.deepEqual(Object.keys(result).sort(), ['catalog', 'catalogIssues', 'exclusions', 'findings', 'references', 'unknown']);

  assert.ok(Array.isArray(result.catalog) && result.catalog.length > 0);
  for (const entry of result.catalog) {
    assert.ok(entry && typeof entry === 'object' && !Array.isArray(entry));
    const message = entry as Record<string, unknown>;
    assert.equal(typeof message.key, 'string');
    assert.equal(typeof message.message, 'string');
    assert.equal(typeof message.description, 'string');
    assert.ok(message.sensitivity === 'normal' || message.sensitivity === 'guarantee');
    assert.ok(message.maxLength === undefined || (Number.isInteger(message.maxLength) && (message.maxLength as number) > 0));
  }

  assert.ok(result.references && typeof result.references === 'object' && !Array.isArray(result.references));
  const references = result.references as Record<string, unknown>;
  assert.ok(Array.isArray(references.static));
  assert.ok(Array.isArray(references.dynamic));
  // The app's translator wrapper forwards its key parameter; its call sites are the references.
  assert.deepEqual((references.forwarded as { file: string; expression: string }[]).map((r) => [r.file, r.expression]), [['packages/web/src/ui/app.ts', 'k']]);
  for (const ref of [...references.static, ...references.dynamic] as Record<string, unknown>[]) {
    assert.ok(scopedFiles.has(ref.file as string), `unexpected scan source: ${String(ref.file)}`);
  }
  assert.ok((references.dynamic as Record<string, unknown>[]).every((ref) => typeof ref.expression === 'string' && ref.expression.length > 0));

  assert.ok(Array.isArray(references.resolved) && references.resolved.length > 0);
  const catalogKeys = new Set((result.catalog as { key: string }[]).map((e) => e.key));
  for (const ref of references.resolved as { keys: string[]; patterns: string[]; form: string }[]) {
    assert.ok(ref.keys.length > 0 && ref.keys.every((k) => catalogKeys.has(k)), 'resolved keys must exist in catalog');
    assert.ok(Array.isArray(ref.patterns) && typeof ref.form === 'string');
  }
  // Only genuinely unresolvable (identifier / call) references remain dynamic, each with a reason.
  for (const ref of references.dynamic as { reason: string }[]) assert.match(ref.reason, /^(bare identifier|call expression)$/);

  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.catalogIssues, []);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.exclusions, [{
    file: 'packages/web/src/ui/app.ts',
    name: 'verifyView',
    reason: 'restricted block excluded by scan scope',
  }]);
});

test('i18n CLI resolves its bounded source set from package and repository working directories', async () => {
  const fromPackage = await run(['--json'], packageRoot);
  const fromRepository = await run(['--json'], repoRoot);
  assert.equal(fromPackage.stdout, fromRepository.stdout);
});

test('i18n CLI rejects unsupported and repeated JSON arguments with exit code 2', async () => {
  for (const args of [['--unknown'], ['--json', '--json']]) {
    await assert.rejects(run(args), (error: unknown) => {
      assert.ok(error && typeof error === 'object');
      const failure = error as { code?: number | string; stderr?: string };
      assert.equal(failure.code, 2);
      assert.match(failure.stderr ?? '', /Usage: node .*i18n-check\.ts \[--json\]/);
      return true;
    });
  }
});
