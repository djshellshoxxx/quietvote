// Public deterministic fixture keys only. Never use these keys for a real group.
import { bytesToHex, concatBytes, ed25519Keypair, jcs, sha256, utf8 } from '@quietvote/crypto';
import { groupPolicyTemplate } from '../src/group-policy-draft.ts';
import { GOVERNANCE_EXPORT, governanceGroupId, groupRulesHash, signGroupRules, type GroupRulesBody, type GroupRulesEnvelope, type GroupRulesExport, type RatificationRequest } from '../src/governance.ts';

export const fixtureSeeds = [1, 2, 3, 4, 5].map(n => new Uint8Array(32).fill(n));
export const fixtureKeys = fixtureSeeds.map(s => bytesToHex(ed25519Keypair(s).publicKey));
export const wrapRules = (body: GroupRulesBody, seedIndices: number[]): GroupRulesEnvelope => ({ body, sigs: seedIndices.map(i => signGroupRules(body, fixtureSeeds[i]!)).sort((a, b) => a.key.localeCompare(b.key)) });
export function governanceFixtures() {
  const first: GroupRulesBody = {
    proto: 'qv-governance/1', kind: 'group-rules', identity_key: fixtureKeys[0]!, group_id: governanceGroupId(fixtureKeys[0]!), version: 1,
    steward_keys: fixtureKeys.slice(1, 4).sort(), policy: groupPolicyTemplate('foundation').policy,
  };
  const genesis = wrapRules(first, [0, 1, 2]);
  const second: GroupRulesBody = structuredClone(first);
  second.version = 2; second.prev_rules_hash = groupRulesHash(first);
  second.decision_class = 'rules';
  second.policy.decision_classes.ordinary.quorum_bp = 2500;
  const amendment = wrapRules(second, [1, 2]);
  amendment.ratification = { manifest_hash: '11'.repeat(32) };
  const third: GroupRulesBody = structuredClone(second);
  third.version = 3; third.prev_rules_hash = groupRulesHash(second);
  third.decision_class = 'entrenched';
  third.steward_keys = fixtureKeys.slice(2, 5).sort();
  const rotation = wrapRules(third, [1, 2]);
  rotation.ratification = { manifest_hash: '22'.repeat(32) };
  const makeExport = (rules: GroupRulesEnvelope[]): GroupRulesExport => ({ format: GOVERNANCE_EXPORT, rules });
  const pins = { identityKey: fixtureKeys[0]!, genesisRulesHash: groupRulesHash(first) };
  const approvals: RatificationRequest[] = [amendment, rotation].map(e => ({ previous_rules_hash: e.body.prev_rules_hash!, rules_hash: groupRulesHash(e.body), decision_class: e.body.decision_class!, manifest_hash: e.ratification!.manifest_hash }));
  return { first, second, third, genesis, amendment, rotation, makeExport, pins, approvals };
}
export interface GovernanceVector {
  id: string; input: unknown; trust: { identityKey: string; genesisRulesHash: string; ratifications?: RatificationRequest[] };
  status: 'VERIFIED' | 'INCOMPLETE' | 'INVALID'; code?: string; active_version?: number;
}
/** Build published vectors with declared expectations; never ask the verifier for expected results. */
export function buildGovernanceVectors(): GovernanceVector[] {
  const f = governanceFixtures(), cases: GovernanceVector[] = [];
  const add = (id: string, input: unknown, status: GovernanceVector['status'], extra: Partial<GovernanceVector> = {}) => cases.push({ id, input, trust: f.pins, status, ...extra });
  add('genesis', f.makeExport([f.genesis]), 'VERIFIED', { active_version: 1 });
  add('amendment-needs-final-election', f.makeExport([f.genesis, f.amendment]), 'INCOMPLETE', { active_version: 1 });
  add('amendment-trusted-harness-approval', f.makeExport([f.genesis, f.amendment]), 'VERIFIED', { active_version: 2, trust: { ...f.pins, ratifications: f.approvals.slice(0, 1) } });
  add('rotation-old-authority', f.makeExport([f.genesis, f.amendment, f.rotation]), 'VERIFIED', { active_version: 3, trust: { ...f.pins, ratifications: f.approvals } });
  add('later-approval-cannot-skip-earlier', f.makeExport([f.genesis, f.amendment, f.rotation]), 'INCOMPLETE', { active_version: 1, trust: { ...f.pins, ratifications: f.approvals.slice(1) } });
  add('exact-replay-idempotent', f.makeExport([f.genesis, f.amendment, f.genesis, f.amendment]), 'VERIFIED', { active_version: 2, trust: { ...f.pins, ratifications: f.approvals.slice(0, 1) } });
  const wrong = { ...f.pins, genesisRulesHash: '00'.repeat(32) };
  add('wrong-genesis-pin', f.makeExport([f.genesis]), 'INVALID', { code: 'E_RULES_ANCHOR', trust: wrong });
  add('wrong-identity-pin', f.makeExport([f.genesis]), 'INVALID', { code: 'E_RULES_ANCHOR', trust: { ...f.pins, identityKey: fixtureKeys[4]! } });
  const mutate = (id: string, path: string[], value: unknown, code: string) => {
    const input = structuredClone(f.makeExport([f.genesis]));
    let target = input as unknown as Record<string, unknown>;
    for (const part of path.slice(0, -1)) target = target[part] as Record<string, unknown>;
    target[path.at(-1)!] = value;
    // Pin the mutated body so a signature/shape test cannot accidentally stop only at the old pin.
    let hash = f.pins.genesisRulesHash;
    try { hash = bytesToHex(sha256(concatBytes(utf8('QV-rules/1'), jcs(input.rules[0]!.body)))); } catch { /* canonical rejection intended */ }
    add(id, input, 'INVALID', { code, trust: { ...f.pins, genesisRulesHash: hash } });
  };
  const b = ['rules', '0', 'body'], p = [...b, 'policy'];
  const rows: [string, string[], unknown, string][] = [
    ['wrong-format', ['format'], 'qv/1', 'E_RULES_SCHEMA'],
    ['export-self-authority', ['verifyRatification'], true, 'E_RULES_SCHEMA'],
    ['empty-history', ['rules'], [], 'E_RULES_BOUND'],
    ['unknown-envelope', ['rules', '0', 'approved'], true, 'E_RULES_SCHEMA'],
    ['wrong-profile', [...b, 'proto'], 'qv1-r255-sha2', 'E_RULES_SCHEMA'],
    ['wrong-kind', [...b, 'kind'], 'manifest', 'E_RULES_SCHEMA'],
    ['unknown-body', [...b, 'activated'], true, 'E_RULES_SCHEMA'],
    ['wrong-group-id', [...b, 'group_id'], '00'.repeat(32), 'E_RULES_SCHEMA'],
    ['uppercase-group-id', [...b, 'group_id'], f.first.group_id.toUpperCase(), 'E_RULES_SCHEMA'],
    ['small-order-identity', [...b, 'identity_key'], '00'.repeat(32), 'E_RULES_SCHEMA'],
    ['version-zero', [...b, 'version'], 0, 'E_RULES_BOUND'],
    ['version-65', [...b, 'version'], 65, 'E_RULES_BOUND'],
    ['version-boolean', [...b, 'version'], true, 'E_RULES_BOUND'],
    ['genesis-predecessor', [...b, 'prev_rules_hash'], '00'.repeat(32), 'E_RULES_CHAIN'],
    ['genesis-ratification', ['rules', '0', 'ratification'], { manifest_hash: '11'.repeat(32) }, 'E_RULES_CHAIN'],
    ['genesis-decision-class', [...b, 'decision_class'], 'rules', 'E_RULES_CHAIN'],
    ['empty-stewards', [...b, 'steward_keys'], [], 'E_RULES_BOUND'],
    ['duplicate-stewards', [...b, 'steward_keys'], [fixtureKeys[1], fixtureKeys[1], fixtureKeys[2]].sort(), 'E_RULES_SCHEMA'],
    ['unsorted-stewards', [...b, 'steward_keys'], [...f.first.steward_keys].reverse(), 'E_RULES_SCHEMA'],
    ['small-order-steward', [...b, 'steward_keys'], ['00'.repeat(32), ...f.first.steward_keys.slice(1)].sort(), 'E_RULES_SCHEMA'],
    ['count-key-mismatch', [...p, 'stewards', 'approval', 'n'], 4, 'E_RULES_BOUND'],
    ['threshold-too-large', [...p, 'stewards', 'approval', 'k'], 4, 'E_RULES_BOUND'],
    ['threshold-zero', [...p, 'stewards', 'approval', 'k'], 0, 'E_RULES_BOUND'],
    ['threshold-boolean', [...p, 'stewards', 'approval', 'k'], true, 'E_RULES_SCHEMA'],
    ['invite-ttl-zero', [...p, 'enrollment', 'invite_ttl_hours'], 0, 'E_RULES_BOUND'],
    ['invite-ttl-excess', [...p, 'enrollment', 'invite_ttl_hours'], 2161, 'E_RULES_BOUND'],
    ['unknown-policy-field', [...p, 'operator_override'], true, 'E_RULES_SCHEMA'],
    ['review-too-short', [...p, 'proposals', 'min_review_hours'], 23, 'E_RULES_BOUND'],
    ['proposal-too-large', [...p, 'proposals', 'max_text_chars'], 20001, 'E_RULES_BOUND'],
    ['notice-too-short', [...p, 'elections', 'min_notice_hours'], 23, 'E_RULES_BOUND'],
    ['vote-min-beyond-max', [...p, 'elections', 'min_voting_hours'], 721, 'E_RULES_BOUND'],
    ['trustee-threshold-one', [...p, 'elections', 'trustees', 'min_t'], 1, 'E_RULES_BOUND'],
    ['trustee-nonmajority', [...p, 'elections', 'trustees', 'min_t'], 2, 'E_RULES_BOUND'],
    ['entrenched-quorum-low', [...p, 'decision_classes', 'entrenched', 'quorum_bp'], 5999, 'E_RULES_BOUND'],
    ['entrenched-threshold-low', [...p, 'decision_classes', 'entrenched', 'threshold', 'num'], 2, 'E_RULES_BOUND'],
    ['entrenched-comparison', [...p, 'decision_classes', 'entrenched', 'threshold', 'cmp'], 'gt', 'E_RULES_BOUND'],
    ['threshold-zero-denominator', [...p, 'decision_classes', 'ordinary', 'threshold', 'den'], 0, 'E_RULES_BOUND'],
    ['dispute-window-short', [...p, 'disputes', 'window_hours'], 71, 'E_RULES_BOUND'],
    ['even-arbiter-count', [...p, 'disputes', 'arbiters', 'count'], 4, 'E_RULES_BOUND'],
    ['duplicate-ground', [...p, 'disputes', 'grounds'], ['G1_MISSING_BALLOT', 'G1_MISSING_BALLOT'], 'E_RULES_BOUND'],
    ['halt-too-long', [...p, 'halt', 'max_hours_each'], 169, 'E_RULES_BOUND'],
    ['halt-zero-count', [...p, 'halt', 'max_halts'], 0, 'E_RULES_BOUND'],
    ['unknown-retention', [...p, 'retention_profile'], 'delete-now', 'E_RULES_SCHEMA'],
    ['no-signatures', ['rules', '0', 'sigs'], [], 'E_RULES_SIG'],
    ['duplicate-signers', ['rules', '0', 'sigs'], [f.genesis.sigs[0], f.genesis.sigs[0]], 'E_RULES_SIG'],
    ['reversed-signers', ['rules', '0', 'sigs'], [...f.genesis.sigs].reverse(), 'E_RULES_SIG'],
    ['missing-identity-signature', ['rules', '0', 'sigs'], f.genesis.sigs.filter(s => s.key !== fixtureKeys[0]), 'E_RULES_SIG'],
    ['insufficient-stewards', ['rules', '0', 'sigs'], f.genesis.sigs.filter(s => s.key !== fixtureKeys[1]), 'E_RULES_SIG'],
    ['signature-flipped', ['rules', '0', 'sigs', '0', 'sig'], '00'.repeat(64), 'E_RULES_SIG'],
    ['unknown-signature-field', ['rules', '0', 'sigs', '0', 'trusted'], true, 'E_RULES_SCHEMA'],
  ];
  for (const [id, path, value, code] of rows) mutate(id, path, value, code);
  add('foreign-signature', f.makeExport([wrapRules(f.first, [0, 1, 2, 4])]), 'INVALID', { code: 'E_RULES_SIG' });
  const wrongPrev = structuredClone(f.second); wrongPrev.prev_rules_hash = '33'.repeat(32);
  add('wrong-predecessor', f.makeExport([f.genesis, wrapRules(wrongPrev, [1, 2])]), 'INVALID', { code: 'E_RULES_CHAIN' });
  const fork = structuredClone(f.second); fork.policy.decision_classes.ordinary.quorum_bp++;
  add('competing-amendment', f.makeExport([f.genesis, f.amendment, wrapRules(fork, [1, 2])]), 'INVALID', { code: 'E_RULES_CHAIN' });
  add('missing-version', f.makeExport([f.genesis, f.rotation]), 'INVALID', { code: 'E_RULES_CHAIN' });
  add('replacement-self-authorizes', f.makeExport([f.genesis, f.amendment, wrapRules(f.third, [3, 4])]), 'INVALID', { code: 'E_RULES_SIG' });
  const ordinaryRotation = structuredClone(f.third); ordinaryRotation.decision_class = 'rules';
  add('protected-change-ordinary-vote', f.makeExport([f.genesis, f.amendment, wrapRules(ordinaryRotation, [1, 2])]), 'INVALID', { code: 'E_RULES_BOUND' });
  return cases;
}
