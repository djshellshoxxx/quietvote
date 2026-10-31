// Differential check of the shared full-election corpus. Unsupported Python
// board/receipt capabilities are listed explicitly, never counted as agreement.
// Protocol ambiguities remain failures here; this script does not pick a side.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { verifyElection } from '@quietvote/protocol';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): any => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const cases: { id: string; bundle: any }[] = [];
for (const name of readdirSync(new URL('../test-vectors/v1/elections/', import.meta.url)).sort()) {
  cases.push({ id: `elections/${name}`, bundle: read(`../test-vectors/v1/elections/${name}/bundle.json`) });
}
for (const name of readdirSync(new URL('../test-vectors/v1/mutations/', import.meta.url)).sort()) {
  const mutation = read(`../test-vectors/v1/mutations/${name}`);
  cases.push({ id: `mutations/${mutation.id}`, bundle: mutation.bundle });
}
cases.push({ id: 'canary/canary-election', bundle: read('../test-vectors/v1/canary/canary-election.json') });
assert.ok(cases.length > 0, 'the differential corpus must not be empty');

const py = spawnSync(process.env.QV_PYTHON ?? 'python3', ['-I', '-c', String.raw`
import json, sys
sys.path.insert(0, sys.argv[1])
from qv_verifier.election import verify_bundle
rows = []
for case in json.load(sys.stdin):
    try:
        rows.append({"id": case["id"], "report": verify_bundle(case["bundle"])})
    except Exception as exc:
        rows.append({"id": case["id"], "error": repr(exc)})
json.dump(rows, sys.stdout)
`, `${root}/verifier-py`], {
  input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000,
});
if (py.error || py.status !== 0) throw new Error(`Python verifier process failed: ${py.error?.message ?? py.stderr}`);
const python = JSON.parse(py.stdout) as { id: string; report?: any; error?: string }[];
assert.equal(python.length, cases.length, 'Python must return every case');
const unsupported = new Set(['chk.board.append_only', 'chk.board.witness', 'chk.receipts.sample']);
const rows: { id: string; ts_verdict: string; python_verdict: string; compared: string[]; skipped: string[]; differences: string[] }[] = [];
for (let i = 0; i < cases.length; i++) {
  const c = cases[i]!;
  const p = python[i]!;
  assert.equal(p.id, c.id, 'Python must preserve case identity');
  const ts = await verifyElection(c.bundle, { expectedManifestHash: c.bundle.manifest_hash });
  const differences: string[] = [];
  const compared: string[] = [];
  const skipped: string[] = [];
  if (p.error) differences.push(`Python threw: ${p.error}`);
  else {
    const pr = p.report!;
    const compare = (name: string, a: unknown, b: unknown): void => {
      compared.push(name);
      if (!isDeepStrictEqual(a, b)) differences.push(`${name}: TS=${JSON.stringify(a)} Python=${JSON.stringify(b)}`);
    };
    compare('verdict', ts.verdict, pr.verdict);
    for (const [check, status] of Object.entries(ts.checks)) {
      if (unsupported.has(check)) {
        skipped.push(`${check}: Python not implemented`);
        continue;
      }
      compare(check, status, pr.checks[check]);
    }
    for (const key of ['cast', 'spoiled', 'counted'] as const) compare(`counts.${key}`, ts.counts[key], pr.counts[key]);
    compare('ctx_prefix', ts.ctxPrefix, pr.ctx_prefix);
    compare('results', ts.results ?? [], pr.results ?? []);
  }
  rows.push({ id: c.id, ts_verdict: ts.verdict, python_verdict: p.report?.verdict ?? 'THROW', compared, skipped, differences });
}
const failures = rows.filter((r) => r.differences.length);
const verdictAgreements = rows.filter((r) => r.ts_verdict === r.python_verdict).length;
if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: failures.length === 0, cases: rows.length, verdict_agreements: verdictAgreements, failures: failures.length, rows }, null, 2));
else {
  for (const row of failures) console.error(`${row.id}\n${row.differences.map((d) => `  ${d}`).join('\n')}`);
  console.log(`cross-verifier: ${rows.length - failures.length}/${rows.length} agree within shared capabilities; ${failures.length} disagree`);
  console.log(`Verdicts agree on ${verdictAgreements}/${rows.length}; report differences remain failures pending the documented errata decisions.`);
  console.log(`Excluded capabilities (not agreement): ${[...unsupported].join(', ')}`);
}
process.exitCode = failures.length ? 1 : 0;
