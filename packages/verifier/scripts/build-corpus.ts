// Regenerates canary/corpus.json from test-vectors/v1 (control election, canary election, mutation corpus).
// Usage: node packages/verifier/scripts/build-corpus.ts [--check]   (--check: exit 1 if the checked-in file differs)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tv = join(here, '..', '..', '..', 'test-vectors', 'v1');
const out = join(here, '..', 'canary', 'corpus.json');
const rd = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const failed = (checks: Record<string, string>): string[] => Object.entries(checks).filter(([, s]) => s === 'fail').map(([k]) => k).sort();

export function buildCorpus(): string {
  const control = rd(join(tv, 'elections', 'tiny-yesno-3v', 'bundle.json'));
  const cexp = rd(join(tv, 'canary', 'expected-report.json'));
  const canaries: unknown[] = [
    { id: 'canary-election', source: 'canary/canary-election.json', expect: { verdict: cexp.verdict, failed_checks: failed(cexp.checks), codes: [] }, bundle: rd(join(tv, 'canary', 'canary-election.json')) },
  ];
  for (const f of readdirSync(join(tv, 'mutations')).sort()) {
    const m = rd(join(tv, 'mutations', f));
    canaries.push({ id: m.id, source: `mutations/${f}`, expect: m.expect, bundle: m.bundle });
  }
  return JSON.stringify({ format: 'qv-canary-corpus/v1', protocol_version: 'qv1', control: { id: 'tiny-yesno-3v', expect: { verdict: 'PASS' }, bundle: control }, canaries }) + '\n';
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const text = buildCorpus();
  if (process.argv.includes('--check')) {
    if (readFileSync(out, 'utf8') !== text) {
      process.stderr.write('canary/corpus.json is stale: rerun node packages/verifier/scripts/build-corpus.ts\n');
      process.exitCode = 1;
    }
  } else writeFileSync(out, text);
}
