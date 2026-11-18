import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { bytesToHex, jcs } from '@quietvote/crypto';
import { GOVERNANCE_MAX_BYTES, groupRulesHash, groupRulesSignatureDigest, verifyGroupRulesExport, verifyGroupRulesJson, type GovernanceTrust } from '../src/governance.ts';
import { buildGovernanceVectors, governanceFixtures, type GovernanceVector } from './governance-fixtures.ts';

const vectors: GovernanceVector[] = JSON.parse(fs.readFileSync(new URL('../../../conformance/governance/v1/cases.json', import.meta.url), 'utf8')).cases;
for (const vector of vectors) test(`signed governance: ${vector.id}`, () => {
  const report = verifyGroupRulesExport(vector.input, { ...vector.trust, verifyRatification: request => (vector.trust.ratifications ?? []).some(r => JSON.stringify(r) === JSON.stringify(request)) });
  assert.equal(report.status, vector.status);
  if (vector.code) assert.equal(report.errors[0]?.code, vector.code);
  if (vector.active_version !== undefined) assert.equal(report.active_version, vector.active_version);
  if (report.status === 'INVALID') assert.equal(report.active_rules_hash, undefined);
});
test('published governance vectors preserve reproducible canonical bytes', () => {
  assert.deepEqual(vectors, buildGovernanceVectors());
  assert(vectors.filter(v => v.status === 'INVALID').length >= 40);
  const f = governanceFixtures();
  const hashes = JSON.parse(fs.readFileSync(new URL('../../../conformance/governance/v1/cases.json', import.meta.url), 'utf8')).hashes;
  assert.equal(hashes.genesis_rules_hash, groupRulesHash(f.first));
  assert.equal(hashes.genesis_signature_digest, bytesToHex(groupRulesSignatureDigest(f.first)));
});
test('wire parser rejects duplicate keys, non-NFC, noncanonical numbers and oversized input', () => {
  const f = governanceFixtures();
  const wire = new TextDecoder().decode(jcs(f.makeExport([f.genesis])));
  assert.equal(verifyGroupRulesJson(wire, f.pins).status, 'VERIFIED');
  for (const changed of [wire.replace('"version":1', '"version":1,"version":1'), wire.replace('"version":1', '"version":1e0'), wire.replace('"version":1', '"version":1.0'), wire.replace('"group-rules"', '"e\u0301"')]) {
    assert.equal(verifyGroupRulesJson(changed, f.pins).status, 'INVALID');
  }
  assert.equal(verifyGroupRulesJson(new Uint8Array(GOVERNANCE_MAX_BYTES + 1), f.pins).errors[0]?.code, 'E_RULES_BOUND');
});
test('ratification is explicit exact synchronous trusted evidence, never truthiness or export metadata', () => {
  const f = governanceFixtures(), input = f.makeExport([f.genesis, f.amendment]);
  for (const callback of [undefined, () => false, () => { throw new Error('untrusted text'); }, () => ({}), () => Promise.resolve(true)]) {
    const trust: GovernanceTrust = { ...f.pins };
    if (callback) trust.verifyRatification = callback as unknown as NonNullable<GovernanceTrust['verifyRatification']>;
    const report = verifyGroupRulesExport(input, trust);
    assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.active_version, 1);
  }
  let called = false;
  const bad = structuredClone(input); bad.rules[1]!.sigs[0]!.sig = '00'.repeat(64);
  const rejected = verifyGroupRulesExport(bad, { ...f.pins, verifyRatification: () => { called = true; return true; } });
  assert.equal(rejected.status, 'INVALID'); assert.equal(called, false);
});
test('mistaken async ratification callbacks cannot crash a shipped Node process', () => {
  const moduleUrl = new URL('../src/governance.ts', import.meta.url).href;
  const fixtureUrl = new URL('./governance-fixtures.ts', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
    import { verifyGroupRulesExport } from ${JSON.stringify(moduleUrl)};
    import { governanceFixtures } from ${JSON.stringify(fixtureUrl)};
    const f = governanceFixtures();
    for (const callback of [() => Promise.reject(new Error('private diagnostic')), async () => { throw new Error('private diagnostic'); }]) {
      const result = verifyGroupRulesExport(f.makeExport([f.genesis, f.amendment]), { ...f.pins, verifyRatification: callback });
      if (result.status !== 'INCOMPLETE' || result.active_version !== 1) process.exit(2);
    }
    await new Promise(resolve => setImmediate(resolve));
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout, ''); assert.equal(child.stderr, '');
});
test('ratification result thenables are not assimilated', () => {
  const f = governanceFixtures(); let called = false;
  const trust: GovernanceTrust = { ...f.pins, verifyRatification: (() => ({ get then() { called = true; throw new Error('never read'); } })) as unknown as NonNullable<GovernanceTrust['verifyRatification']> };
  assert.equal(verifyGroupRulesExport(f.makeExport([f.genesis, f.amendment]), trust).status, 'INCOMPLETE');
  assert.equal(called, false);
});
test('ratifying manifest reference can be attached after candidate signing without a hash cycle', () => {
  const f = governanceFixtures(), pending = structuredClone(f.amendment);
  delete pending.ratification;
  assert.equal(groupRulesHash(pending.body), groupRulesHash(f.amendment.body));
  let called = false;
  const trust = { ...f.pins, verifyRatification: () => { called = true; return true; } };
  const absent = verifyGroupRulesExport(f.makeExport([f.genesis, pending]), trust);
  assert.equal(absent.status, 'INCOMPLETE'); assert.equal(called, false);
  assert.equal(absent.pending_ratifications[0]?.manifest_hash, undefined);
  const supplied = verifyGroupRulesExport(f.makeExport([f.genesis, pending, f.amendment]), trust);
  assert.equal(supplied.status, 'VERIFIED'); assert.equal(supplied.active_version, 2);
  assert.equal(supplied.versions, 2);
  const conflict = structuredClone(f.amendment); conflict.ratification!.manifest_hash = '55'.repeat(32);
  assert.equal(verifyGroupRulesExport(f.makeExport([f.genesis, f.amendment, conflict]), trust).errors[0]?.code, 'E_RULES_CHAIN');
});
test('input cannot change after verification through shared nested references', () => {
  const f = governanceFixtures(), input = f.makeExport([f.genesis, f.amendment]);
  const report = verifyGroupRulesExport(input, { ...f.pins, verifyRatification: request => {
    input.rules[1]!.body.policy.stewards.approval.k = 1;
    assert(Object.isFrozen(request)); return true;
  } });
  assert.equal(report.status, 'VERIFIED'); assert.equal(report.candidate_rules_hash, f.approvals[0]!.rules_hash);
});
