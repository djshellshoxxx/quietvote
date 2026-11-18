import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPolicyTemplate, validateGroupPolicyDraft } from '../src/group-policy-draft.ts';

test('policy templates retain their published values and expose unfinished authority configuration', () => {
  const a = groupPolicyTemplate('foundation'), b = groupPolicyTemplate('association'), c = groupPolicyTemplate('collective');
  assert.equal(validateGroupPolicyDraft(a).valid, true);
  assert.equal(validateGroupPolicyDraft(b).valid, true);
  assert.deepEqual(a.policy.stewards.approval, { k: 2, n: 3 });
  assert.deepEqual(b.policy.stewards.approval, { k: 3, n: 5 });
  assert.equal(b.policy.proposals.sponsors_required, 2);
  assert.equal(b.policy.elections.revoting, 'single');
  assert.deepEqual(b.policy.decision_classes.rules.threshold, { num: 3, den: 4, cmp: 'gte', base: 'yes_no' });
  assert.equal(a.suggested_election.voting_hours, 168);
  assert.equal(b.suggested_election.voting_hours, 240);
  assert.equal(c.suggested_election.voting_hours, 48);
  assert.equal(c.policy.elections.min_voting_hours, 72);
  assert.equal(c.policy.decision_classes.ordinary.min_voting_hours, 72);
  const r = validateGroupPolicyDraft(c);
  assert.equal(r.valid, false);
  assert.equal(r.errors[0]?.path, '/suggested_election/voting_hours');
  assert.equal(r.effective_min_review_hours, 168);
  assert.equal(r.effective_min_voting_hours, 72);
  assert(r.warnings.some(w => w.code === 'W-STEWARD-THRESHOLD'));
  assert(validateGroupPolicyDraft(a).required_configuration.includes('authenticated drand chain and round rule'));
  assert(validateGroupPolicyDraft(b).required_configuration.includes('named arbiter public keys and authority'));
  assert.equal(validateGroupPolicyDraft(a).scope, 'unsigned-policy-draft');
});

function changed(path: string, value: unknown): unknown {
  const d = groupPolicyTemplate('foundation') as unknown as Record<string, unknown>;
  const parts = path.split('/').slice(1);
  let at = d;
  for (const p of parts.slice(0, -1)) at = at[p] as Record<string, unknown>;
  at[parts.at(-1)!] = value;
  return d;
}

// Independent malformed shape, authority confusion, range, arithmetic and
// cross-field failures; each case checks the public diagnostic contract.
const bad: [string, string, unknown, string?][] = [
  ['signed-record confusion', '/body', {}, 'E_RULES_SCHEMA'],
  ['signature confusion', '/sigs', [], 'E_RULES_SCHEMA'],
  ['group identity is outside the draft', '/group_id', '00', 'E_RULES_SCHEMA'],
  ['format is mandatory', '/format', 'qv/1', 'E_RULES_SCHEMA'],
  ['policy is not an array', '/policy', [], 'E_RULES_SCHEMA'],
  ['policy is not null', '/policy', null, 'E_RULES_SCHEMA'],
  ['boolean threshold', '/policy/stewards/approval/k', true, 'E_RULES_SCHEMA'],
  ['fractional threshold', '/policy/stewards/approval/k', 1.5, 'E_RULES_SCHEMA'],
  ['unsafe integer', '/policy/stewards/term_days', Number.MAX_SAFE_INTEGER + 1, 'E_RULES_SCHEMA'],
  ['infinite term', '/policy/stewards/term_days', Infinity, 'E_RULES_SCHEMA'],
  ['NaN term', '/policy/stewards/term_days', NaN, 'E_RULES_SCHEMA'],
  ['negative zero', '/policy/stewards/term_days', -0, 'E_RULES_SCHEMA'],
  ['empty steward set', '/policy/stewards/approval/n', 0],
  ['too many stewards', '/policy/stewards/approval/n', 16],
  ['impossible quorum', '/policy/stewards/approval/k', 4],
  ['negative unlimited-term marker', '/policy/stewards/term_days', -1],
  ['unsupported enrollment authority', '/policy/enrollment/approval', 'operator', 'E_RULES_SCHEMA'],
  ['zero invitation lifetime', '/policy/enrollment/invite_ttl_hours', 0],
  ['overlong invitation lifetime', '/policy/enrollment/invite_ttl_hours', 2161],
  ['too many vouches', '/policy/enrollment/vouches', 11],
  ['forbidden real-name policy', '/policy/enrollment/label_policy', 'real_name', 'E_RULES_SCHEMA'],
  ['unbounded proposal count', '/policy/proposals/max_open_per_member', 21],
  ['overlong text policy', '/policy/proposals/max_text_chars', 20001],
  ['review platform minimum', '/policy/proposals/min_review_hours', 23],
  ['review platform maximum', '/policy/proposals/min_review_hours', 2161],
  ['notice platform minimum', '/policy/elections/min_notice_hours', 23],
  ['notice platform maximum', '/policy/elections/min_notice_hours', 721],
  ['voting platform minimum', '/policy/elections/min_voting_hours', 23],
  ['inverted voting interval', '/policy/elections/max_voting_hours', 48],
  ['trustee count too small', '/policy/elections/trustees/min_n', 2],
  ['trustee count too large', '/policy/elections/trustees/min_n', 16],
  ['single trustee can decrypt', '/policy/elections/trustees/min_t', 1],
  ['trustee minority', '/policy/elections/trustees/min_t', 2],
  ['impossible trustee threshold', '/policy/elections/trustees/min_t', 6],
  ['churn fraction over one', '/policy/elections/roll_churn_alarm_bp', 10001],
  ['unbounded outcome rule', '/policy/decision_classes/ordinary/threshold/num', 3],
  ['zero denominator', '/policy/decision_classes/ordinary/threshold/den', 0],
  ['quorum fraction over one', '/policy/decision_classes/rules/quorum_bp', 10001],
  ['entrenched threshold reduction', '/policy/decision_classes/entrenched/threshold/num', 2],
  ['entrenched comparison policy', '/policy/decision_classes/entrenched/threshold/cmp', 'gt'],
  ['class window above election maximum', '/policy/decision_classes/ordinary/min_voting_hours', 800],
  ['short challenge window', '/policy/disputes/window_hours', 71],
  ['even arbiter count', '/policy/disputes/arbiters/count', 4],
  ['too few arbiters', '/policy/disputes/arbiters/count', 1],
  ['duplicate exclusions', '/policy/disputes/arbiters/exclude', ['stewards', 'stewards']],
  ['duplicate grounds', '/policy/disputes/grounds', ['G1_MISSING_BALLOT', 'G1_MISSING_BALLOT']],
  ['undefined ground', '/policy/disputes/grounds', ['G7'], 'E_RULES_SCHEMA'],
  ['overlong halt', '/policy/halt/max_hours_each', 169],
  ['enabled halt with no allowance', '/policy/halt/max_halts', 0],
  ['operator authority grant', '/policy/halt/authority', 'operator', 'E_RULES_SCHEMA'],
  ['unregistered retention profile', '/policy/retention_profile', 'forever', 'E_RULES_SCHEMA'],
  ['suggested schedule too short', '/suggested_election/voting_hours', 24],
  ['suggested schedule too long', '/suggested_election/voting_hours', 721],
];
for (const [name, path, value, code = 'E_RULES_BOUND'] of bad) test(`policy refuses ${name}`, () => {
  const r = validateGroupPolicyDraft(changed(path, value));
  assert.equal(r.valid, false);
  assert(r.errors.some(e => e.code === code && (e.path === path || path.startsWith(e.path + '/') || e.path.startsWith(path + '/'))), JSON.stringify(r.errors));
});

test('sponsorship, strict-majority and exact rational boundaries interact correctly', () => {
  const d = groupPolicyTemplate('association');
  d.policy.proposals.sponsors_required = 0;
  assert(validateGroupPolicyDraft(d).errors.some(e => e.path === '/policy/proposals/sponsors_required'));
  d.policy.proposals.sponsors_required = 1;
  d.policy.elections.trustees = { min_n: 4, min_t: 2, independence: 'require' };
  assert(validateGroupPolicyDraft(d).errors.some(e => e.path === '/policy/elections/trustees/min_t'));
  d.policy.elections.trustees.min_t = 3;
  d.policy.decision_classes.entrenched.threshold = { num: 6755399441055743, den: 9007199254740991, cmp: 'gte', base: 'yes_no' };
  // This is strictly below 3/4; floating multiplication can round it to equality.
  assert(validateGroupPolicyDraft(d).errors.some(e => e.path === '/policy/decision_classes/entrenched/threshold'));
  d.policy.decision_classes.entrenched.threshold.num++;
  assert.equal(validateGroupPolicyDraft(d).valid, true);
});

test('reports ten deterministic JSON pointers and neither mutates input nor shares templates', () => {
  const a = groupPolicyTemplate('foundation');
  const b = groupPolicyTemplate('foundation');
  a.policy.disputes.grounds.pop();
  assert.equal(b.policy.disputes.grounds.length, 6);
  const input = { ...b, ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`unknown/${String(i).padStart(2, '0')}~`, i])) };
  const before = JSON.stringify(input);
  const r = validateGroupPolicyDraft(input);
  assert.equal(r.valid, false); assert.equal(r.errors.length, 10); assert.equal(r.truncated, true);
  assert.equal(r.errors[0]?.path, '/unknown~100~0');
  assert.equal(JSON.stringify(input), before);
  const inherited = Object.create(b) as unknown;
  assert.equal(validateGroupPolicyDraft(inherited).valid, false);
  assert.equal(validateGroupPolicyDraft({}).errors[0]?.path, '/format');
});

test('single steward and unlimited terms are warnings, not invented prohibitions', () => {
  const d = groupPolicyTemplate('foundation');
  d.policy.stewards = { approval: { k: 1, n: 1 }, term_days: 0, max_consecutive_terms: 0 };
  d.policy.halt.authority = 'none'; d.policy.halt.max_halts = 0;
  const r = validateGroupPolicyDraft(d);
  assert.equal(r.valid, true);
  assert.deepEqual(r.warnings.map(w => w.code), ['W-SINGLE-STEWARD', 'W-UNLIMITED-TERM']);
  assert.throws(() => groupPolicyTemplate('operator' as never), /unknown policy template/);
});
