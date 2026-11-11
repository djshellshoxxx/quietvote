import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN } from '../src/i18n/en.ts';
import { lintCatalog, lintLiterals } from '../src/i18n/catalog-lint.ts';
import { extractReferences, translatorEvidence, unknownReferences, unknownResolvedReferences } from '../src/i18n/extract.ts';

const args = process.argv.slice(2);
if (args.some((a) => a !== '--json') || args.filter((a) => a === '--json').length > 1) {
  console.error('Usage: node packages/web/scripts/i18n-check.ts [--json]');
  process.exit(2);
}
const json = args.includes('--json');
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const paths = ['packages/web/src/ui/app.ts', 'packages/web/src/main.ts', 'packages/web/src/ui/dom.ts', 'packages/web/src/ui/charts.ts'];
const files = Object.fromEntries(paths.map((p) => [p, readFileSync(resolve(root, p), 'utf8')]));
const catalogIssues = lintCatalog(EN);
const scan = lintLiterals(files);
// Type-check the scanned files so the forwarder check can tell a numeric `x.t` from a handed-on translator
// and confirm that `{ t }` is only handed to functions declared in scanned files.
const config = ts.getParsedCommandLineOfConfigFile(resolve(root, 'packages/web/tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } });
if (!config) throw new Error('cannot read packages/web/tsconfig.json');
const absolute = Object.fromEntries(paths.map((p) => [p, resolve(root, p)]));
const program = ts.createProgram(Object.values(absolute), config.options);
for (const [p, abs] of Object.entries(absolute)) if (program.getSourceFile(abs)?.text !== files[p]) throw new Error(`type-checked text differs from scanned text: ${p}`);
const refs = extractReferences(files, EN, { evidence: translatorEvidence(program, absolute) });
const unknown = [...unknownReferences(refs.static, EN), ...unknownResolvedReferences(refs.resolved, EN)];
if (json) {
  const catalog = Object.keys(EN).sort().map((key) => ({ key, ...EN[key as keyof typeof EN] }));
  console.log(JSON.stringify({ catalog, references: refs, unknown, exclusions: scan.exclusions, findings: scan.findings, catalogIssues }, null, 2));
} else if (catalogIssues.length || unknown.length || scan.findings.length) {
  console.log(`i18n check: ${catalogIssues.length} catalog issue(s), ${unknown.length} unknown key(s), ${refs.resolved.length} resolved dynamic reference(s), ${refs.dynamic.length} unresolved dynamic reference(s), ${scan.findings.length} literal finding(s), ${scan.exclusions.length} exclusion(s)`);
  for (const x of catalogIssues) console.log(`catalog ${x.key}: ${x.reason}`);
  for (const x of unknown) console.log(`${x.file}:${x.line}: unknown catalog key ${JSON.stringify(x.key)}${'reason' in x ? ` (${x.reason})` : ''}`);
  for (const x of refs.dynamic) console.log(`${x.file}:${x.line}: unresolved dynamic translator reference (${x.reason}): ${x.expression}`);
  for (const x of scan.exclusions) console.log(`${x.file}: excluded ${x.name}: ${x.reason}`);
  for (const x of scan.findings) console.log(`${x.file}:${x.line}: ${x.reason}: ${JSON.stringify(x.text)}`);
} else {
  console.log(`i18n check passed: ${refs.static.length} static reference(s), ${refs.resolved.length} resolved dynamic reference(s), ${refs.dynamic.length} unresolved dynamic reference(s), ${refs.forwarded.length} translator forwarder(s), ${scan.exclusions.length} exclusion(s)`);
}
if (!json && !(catalogIssues.length || unknown.length || scan.findings.length)) {
  for (const x of scan.exclusions) console.log(`${x.file}: excluded ${x.name}: ${x.reason}`);
}
if (catalogIssues.length || unknown.length || scan.findings.length) process.exitCode = 1;
