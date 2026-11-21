import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateContest, validateManifest, type Manifest } from '../src/index.ts';

// Both independent implementations consume these exact cases and the unchanged
// election manifest. Different existing diagnostic taxonomies remain explicit.
interface ManifestCase {
  id: string;
  basis?: string;
  method?: string;
  options?: string[];
  selection_limit?: number;
  winners?: number;
  quorum?: Manifest['quorum'];
  valid: boolean;
  ts_error?: string;
}
interface RulesCase {
  id: string;
  basis: 'yes+no' | 'counted';
  counts: Record<string, number>;
  participation: number;
  roll_size: number;
  quorum: NonNullable<Manifest['quorum']> | null;
  outcome: unknown;
}
const cases = JSON.parse(readFileSync(new URL('./fixtures/adopted-manifest-policy.json', import.meta.url), 'utf8')) as {
  manifest_cases: ManifestCase[];
  rules_cases: RulesCase[];
};
const bundle = JSON.parse(readFileSync(new URL('../../../test-vectors/v1/elections/tiny-yesno-3v/bundle.json', import.meta.url), 'utf8')) as {
  manifest: { body: Manifest };
  roll: string[];
};

function candidate(row: ManifestCase): unknown {
  const m = structuredClone(bundle.manifest.body);
  // The deliberate invalid cases exercise runtime validation, not the TS type system.
  const c = m.contests[0]! as unknown as Record<string, unknown>;
  if (row.basis !== undefined) (c.rule as Record<string, unknown>).basis = row.basis;
  if (row.method !== undefined) {
    c.method = row.method;
    delete c.rule;
    c.tie_break = { type: 'declare-tie' };
    if (row.method === 'approval') delete c.selection_limit;
    else c.selection_limit = row.selection_limit ?? 1;
  }
  if (row.options !== undefined) c.options = row.options.map(id => ({ id, label: id.toUpperCase() }));
  if (row.winners !== undefined) c.winners = row.winners;
  if (row.quorum !== undefined) m.quorum = row.quorum;
  return m;
}

for (const row of cases.manifest_cases) {
  test(`adopted manifest policy: ${row.id}`, () => {
    const result = validateManifest(candidate(row), bundle.roll.length);
    assert.equal(result.ok, row.valid, JSON.stringify(result));
    if (!result.ok) assert.equal(result.error, row.ts_error);
  });
}

for (const row of cases.rules_cases) {
  test(`preserved threshold/quorum arithmetic: ${row.id}`, () => {
    const m = structuredClone(bundle.manifest.body);
    if (row.quorum === null) delete m.quorum;
    else m.quorum = row.quorum;
    const c = m.contests[0]!;
    c.rule!.basis = row.basis;
    const result = evaluateContest(m, c, new Map(Object.entries(row.counts)), row.participation, row.roll_size);
    assert.deepEqual(result.outcome, row.outcome);
  });
}
