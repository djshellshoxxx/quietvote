// Independent review fixtures: Node crypto and hand-framed hashes, no production signer/generator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { groupPolicyTemplate } from '../src/group-policy-draft.ts';
import {
  GOVERNANCE_MAX_BYTES, governanceGroupId, groupRulesHash, groupRulesSignatureDigest,
  verifyGroupRulesExport, verifyGroupRulesJson, type GroupRulesBody,
  type GroupRulesEnvelope, type GovernanceTrust, type RatificationRequest,
} from '../src/governance.ts';

const privateKeys = Array.from({ length: 8 }, (_, i) => createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.alloc(32, i + 61)]),
  type: 'pkcs8', format: 'der',
}));
const publicKeys = privateKeys.map(key => createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'));
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const u32 = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };
const lp = (value: Uint8Array) => Buffer.concat([u32(value.length), value]);
function digest(label: string, ...fields: Uint8Array[]): Buffer {
  return createHash('sha256').update(Buffer.concat([
    lp(Buffer.from('QV-GOV-HASH')), lp(Buffer.from('qv-governance/1')), lp(Buffer.from(label)),
    u32(fields.length), ...fields.map(lp),
  ])).digest();
}
const ruleHash = (body: GroupRulesBody) => createHash('sha256').update('QV-rules/1').update(canonical(body)).digest('hex');
const signatureDigest = (body: GroupRulesBody) => digest('signature', Buffer.from(body.group_id, 'hex'), Buffer.from(body.kind), digest('body', Buffer.from(canonical(body))));
function genesis(stewards = [1, 2, 3]): GroupRulesBody {
  const policy = groupPolicyTemplate('foundation').policy;
  policy.stewards.approval.n = stewards.length;
  return { proto: 'qv-governance/1', kind: 'group-rules', identity_key: publicKeys[0]!,
    group_id: digest('group-id', Buffer.from(publicKeys[0]!, 'hex')).toString('hex'), version: 1,
    steward_keys: stewards.map(i => publicKeys[i]!).sort(), policy };
}
function amendment(previous: GroupRulesBody, stewards?: number[]): GroupRulesBody {
  const body = structuredClone(previous);
  body.version++; body.prev_rules_hash = ruleHash(previous); body.decision_class = stewards ? 'entrenched' : 'rules';
  body.policy.decision_classes.ordinary.quorum_bp++;
  if (stewards) { body.steward_keys = stewards.map(i => publicKeys[i]!).sort(); body.policy.stewards.approval.n = stewards.length; }
  return body;
}
function envelope(body: GroupRulesBody, keys: number[], reference?: string): GroupRulesEnvelope {
  return { body, sigs: keys.map(i => ({ key: publicKeys[i]!, sig: sign(null, signatureDigest(body), privateKeys[i]!).toString('hex') })).sort((a, b) => a.key < b.key ? -1 : 1),
    ...(reference ? { ratification: { manifest_hash: reference } } : {}) };
}
const exported = (...rules: GroupRulesEnvelope[]) => ({ format: 'qv-governance-export/1', rules });
const pins = (body: GroupRulesBody): GovernanceTrust => ({ identityKey: publicKeys[0]!, genesisRulesHash: ruleHash(body) });
function invalid(report: ReturnType<typeof verifyGroupRulesExport>, code?: string): void {
  assert.equal(report.status, 'INVALID'); assert.equal(report.versions, 0);
  assert.equal(report.active_version, undefined); assert.equal(report.active_rules_hash, undefined);
  assert.equal(report.candidate_rules_hash, undefined);
  if (code) assert.equal(report.errors[0]?.code, code);
}

test('fresh governance: independently framed hashes and Node Ed25519 signatures verify', () => {
  const body = genesis();
  assert.equal(governanceGroupId(publicKeys[0]!), body.group_id);
  assert.equal(groupRulesHash(body), ruleHash(body));
  assert.equal(Buffer.from(groupRulesSignatureDigest(body)).toString('hex'), signatureDigest(body).toString('hex'));
  const report = verifyGroupRulesExport(exported(envelope(body, [0, 1, 2])), pins(body));
  assert.equal(report.status, 'VERIFIED'); assert.equal(report.active_rules_hash, ruleHash(body));
  const wrongDomain = envelope(body, [0, 1, 2]);
  wrongDomain.sigs = [0, 1, 2].map(i => ({ key: publicKeys[i]!, sig: sign(null, Buffer.from(ruleHash(body), 'hex'), privateKeys[i]!).toString('hex') })).sort((a, b) => a.key < b.key ? -1 : 1);
  invalid(verifyGroupRulesExport(exported(wrongDomain), pins(body)), 'E_RULES_SIG');
});

test('fresh governance: identity is mandatory and counts only once when it is also a steward', () => {
  const separate = genesis();
  invalid(verifyGroupRulesExport(exported(envelope(separate, [1, 2, 3])), pins(separate)), 'E_RULES_SIG');
  invalid(verifyGroupRulesExport(exported(envelope(separate, [0, 1])), pins(separate)), 'E_RULES_SIG');
  const overlap = genesis([0, 1, 2]);
  invalid(verifyGroupRulesExport(exported(envelope(overlap, [0])), pins(overlap)), 'E_RULES_SIG');
  assert.equal(verifyGroupRulesExport(exported(envelope(overlap, [0, 1])), pins(overlap)).status, 'VERIFIED');
});

test('fresh governance: rotation and threshold reduction require old authority, then only new authority', () => {
  const first = genesis(), second = amendment(first, [4, 5, 6]); second.policy.stewards.approval.k = 1;
  const third = amendment(second), root = envelope(first, [0, 1, 2]);
  const trust = { ...pins(first), verifyRatification: () => true };
  invalid(verifyGroupRulesExport(exported(root, envelope(second, [4], '11'.repeat(32))), trust), 'E_RULES_SIG');
  const signedSecond = envelope(second, [1, 2], '11'.repeat(32));
  assert.equal(verifyGroupRulesExport(exported(root, signedSecond, envelope(third, [4], '22'.repeat(32))), trust).active_version, 3);
  invalid(verifyGroupRulesExport(exported(root, signedSecond, envelope(third, [1, 2], '22'.repeat(32))), trust), 'E_RULES_SIG');
  const extra = envelope(second, [0, 1, 2], '11'.repeat(32));
  invalid(verifyGroupRulesExport(exported(root, extra), trust), 'E_RULES_SIG');
});

test('fresh governance: later ratifications cannot activate across one missing predecessor', () => {
  const first = genesis(), second = amendment(first, [4, 5, 6]), third = amendment(second), fourth = amendment(third);
  const history = exported(envelope(first, [0, 1, 2]), envelope(second, [1, 2], '11'.repeat(32)),
    envelope(third, [4, 5], '22'.repeat(32)), envelope(fourth, [5, 6], '33'.repeat(32)));
  const requests: Readonly<RatificationRequest>[] = [];
  const report = verifyGroupRulesExport(history, { ...pins(first), verifyRatification: request => {
    requests.push(request); assert(Object.isFrozen(request)); return request.rules_hash !== ruleHash(second);
  } });
  assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.active_version, 1); assert.equal(report.versions, 4);
  assert.equal(report.pending_ratifications.length, 1); assert.equal(requests.length, 3);
  assert.equal(report.candidate_rules_hash, ruleHash(fourth));
  const accepted = verifyGroupRulesExport(history, { ...pins(first), verifyRatification: () => true });
  assert.equal(accepted.status, 'VERIFIED'); assert.equal(accepted.active_version, 4);
  let called = false;
  const broken = structuredClone(history); broken.rules[3]!.sigs[0]!.sig = '00'.repeat(64);
  invalid(verifyGroupRulesExport(broken, { ...pins(first), verifyRatification: () => { called = true; return true; } }), 'E_RULES_SIG');
  assert.equal(called, false);
});

test('fresh governance: partial or poisoned replays cannot combine signatures or be ignored', () => {
  const first = genesis(), second = amendment(first), root = envelope(first, [0, 1, 2]);
  invalid(verifyGroupRulesExport(exported(envelope(first, [0, 1]), envelope(first, [2])), pins(first)), 'E_RULES_SIG');
  const full = envelope(second, [1, 2]);
  invalid(verifyGroupRulesExport(exported(root, full, envelope(second, [1])), pins(first)), 'E_RULES_SIG');
  invalid(verifyGroupRulesExport(exported(root, full, envelope(second, [1, 2, 7])), pins(first)), 'E_RULES_SIG');
  const fork = amendment(first); fork.policy.proposals.max_open_per_member++;
  invalid(verifyGroupRulesExport(exported(root, full, envelope(fork, [1, 2])), pins(first)), 'E_RULES_CHAIN');
  const duplicate = verifyGroupRulesExport(exported(root, full, structuredClone(full)), pins(first));
  assert.equal(duplicate.versions, 2); assert.equal(duplicate.status, 'INCOMPLETE');
});

test('fresh governance: ratification reference is noncircular metadata, never signed-body authority', () => {
  const first = genesis(), second = amendment(first), root = envelope(first, [0, 1, 2]), candidate = envelope(second, [1, 2]);
  const candidateHash = ruleHash(second);
  // An election can bind candidateHash before its own hash is known.
  const electionHash = createHash('sha256').update(canonical({ rules_hash: candidateHash, previous_rules_hash: ruleHash(first) })).digest('hex');
  const attached = { ...candidate, ratification: { manifest_hash: electionHash } };
  assert.deepEqual(attached.sigs, candidate.sigs); assert.equal(ruleHash(attached.body), candidateHash);
  let calls = 0;
  const trust = { ...pins(first), verifyRatification: (request: Readonly<RatificationRequest>) => {
    calls++; return request.manifest_hash === electionHash && request.rules_hash === candidateHash &&
      request.previous_rules_hash === ruleHash(first) && request.decision_class === 'rules';
  } };
  assert.equal(verifyGroupRulesExport(exported(root, candidate), trust).status, 'INCOMPLETE'); assert.equal(calls, 0);
  assert.equal(verifyGroupRulesExport(exported(root, candidate, attached), trust).active_version, 2);
  const wrong = { ...candidate, ratification: { manifest_hash: 'aa'.repeat(32) } };
  assert.equal(verifyGroupRulesExport(exported(root, wrong), trust).status, 'INCOMPLETE');
  invalid(verifyGroupRulesExport(exported(root, attached, wrong), trust), 'E_RULES_CHAIN');
  invalid(verifyGroupRulesExport({ ...exported(root, candidate), ratifications: [electionHash] }, trust), 'E_RULES_SCHEMA');
});

test('fresh governance: callbacks receive snapshots and cannot expose exception text or truthy approvals', () => {
  const first = genesis(), second = amendment(first), history = exported(envelope(first, [0, 1, 2]), envelope(second, [1, 2], '11'.repeat(32)));
  for (const answer of [1, 'true', new Boolean(true), { verified: true }]) {
    const report = verifyGroupRulesExport(history, { ...pins(first), verifyRatification: (() => answer) as unknown as NonNullable<GovernanceTrust['verifyRatification']> });
    assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.active_version, 1);
  }
  const originalHash = ruleHash(second);
  const report = verifyGroupRulesExport(history, { ...pins(first), verifyRatification: request => {
    history.rules[1]!.body.policy.stewards.approval.k = 1;
    assert.equal(request.rules_hash, originalHash); throw new Error('private callback diagnostic');
  } });
  assert.equal(report.status, 'INCOMPLETE'); assert.equal(report.candidate_rules_hash, originalHash);
  assert(!JSON.stringify(report).includes('private callback diagnostic'));
});

test('fresh governance: rejected async and cross-realm callback answers remain incomplete without process failure', () => {
  const target = new URL('../src/governance.ts', import.meta.url).href;
  const first = genesis(), second = amendment(first);
  const input = exported(envelope(first, [0, 1, 2]), envelope(second, [1, 2], '11'.repeat(32)));
  const script = `
    import vm from 'node:vm';
    import { verifyGroupRulesExport } from ${JSON.stringify(target)};
    const input=${JSON.stringify(input)}, trust=${JSON.stringify(pins(first))};
    let getterRead=false;
    for (const callback of [async()=>{throw new Error('private callback diagnostic')},
      ()=>vm.runInNewContext('Promise.reject(new Error("private callback diagnostic"))'),
      ()=>({get then(){getterRead=true; throw new Error('must not read')}})]) {
      const report=verifyGroupRulesExport(input,{...trust,verifyRatification:callback});
      if(report.status!=='INCOMPLETE'||report.active_version!==1) process.exit(2);
    }
    if(getterRead) process.exit(3);
    await new Promise(resolve=>setImmediate(resolve));
  `;
  const result = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});

test('fresh governance: bounded wire parser rejects nested duplicate authorization and exact excess', () => {
  const first = genesis(), wire = canonical(exported(envelope(first, [0, 1, 2]))), trust = pins(first);
  assert.equal(verifyGroupRulesJson(wire, trust).status, 'VERIFIED');
  invalid(verifyGroupRulesJson(wire.replace('"approval":{"k":2', '"approval":{"k":1,"k":2'), trust), 'E_RULES_SCHEMA');
  invalid(verifyGroupRulesJson(wire.replace('"version":1', '"version":-0'), trust));
  const exact = wire + ' '.repeat(GOVERNANCE_MAX_BYTES - Buffer.byteLength(wire));
  assert.equal(verifyGroupRulesJson(exact, trust).status, 'VERIFIED');
  invalid(verifyGroupRulesJson(exact + ' ', trust), 'E_RULES_BOUND');
  invalid(verifyGroupRulesJson(Buffer.from([0xff]), trust), 'E_RULES_SCHEMA');
});
