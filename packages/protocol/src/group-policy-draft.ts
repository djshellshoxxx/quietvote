// Unsigned policy planning only. This format is NOT a GroupRules record, election
// manifest, signature preimage or authority grant. QV-03 §§3/10 supply its bounds
// and template values; the signed governance contract remains a separate module.
import { arr, check, int, lit, obj, oneOf, type Schema } from './schema.ts';

export const GROUP_POLICY_DRAFT_FORMAT = 'qv-group-policy-draft/1';
export const GROUP_POLICY_TEMPLATES = ['foundation', 'association', 'collective'] as const;
export type GroupPolicyTemplate = typeof GROUP_POLICY_TEMPLATES[number];
type DecisionClass = 'ordinary' | 'bylaw' | 'rules' | 'entrenched';
type Threshold = { num: number; den: number; cmp: 'gt' | 'gte'; base: 'yes_no' | 'all_cast' | 'eligible' };
type ClassPolicy = { quorum_bp: number; threshold: Threshold; min_review_hours: number; min_voting_hours: number };
export interface GroupPolicyDraft {
  format: typeof GROUP_POLICY_DRAFT_FORMAT;
  policy: {
    stewards: { approval: { k: number; n: number }; term_days: number; max_consecutive_terms: number };
    enrollment: { approval: 'auto' | 'steward'; invite_ttl_hours: number; vouches: number; label_policy: 'pseudonym_ok' | 'unique_only' };
    proposals: { who: 'any_member' | 'sponsored' | 'stewards'; sponsors_required: number; min_review_hours: number; max_open_per_member: number; max_text_chars: number };
    elections: {
      min_notice_hours: number; min_voting_hours: number; max_voting_hours: number; revoting: 'allowed' | 'single';
      trustees: { min_n: number; min_t: number; independence: 'warn' | 'require' };
      roll_churn_alarm_bp: number; extension: { allowed_if: 'always' | 'quorum_unmet'; max_hours: number; max_times: number };
    };
    decision_classes: Record<DecisionClass, ClassPolicy>;
    tie_break: { yes_no: 'status_quo'; multi_winner: 'drand_lot' | 'runoff' | 'fail' | 'incumbent' };
    disputes: { window_hours: number; arbiters: { count: number; selection: 'sortition' | 'named'; exclude: string[] }; grounds: string[] };
    halt: { authority: 'none' | 'stewards_k_or_trustees_t'; max_hours_each: number; max_halts: number; max_total_hours: number };
    disclosure: { roll_labels: 'members' | 'public' | 'hidden'; result_detail: 'full_counts' };
    retention_profile: 'default-v1';
  };
  suggested_election: { decision_class: DecisionClass; voting_hours: number };
}

export interface PolicyDiagnostic {
  code: 'E_RULES_SCHEMA' | 'E_RULES_BOUND';
  path: string;
  message: string;
}
export interface GroupPolicyDraftReport {
  scope: 'unsigned-policy-draft';
  valid: boolean;
  errors: PolicyDiagnostic[];
  truncated: boolean;
  warnings: { code: string; path: string; message: string }[];
  required_configuration: string[];
  effective_min_review_hours?: number;
  effective_min_voting_hours?: number;
}

const SAFE = Number.MAX_SAFE_INTEGER;
const CLASSES = ['ordinary', 'bylaw', 'rules', 'entrenched'] as const;
const GROUNDS = ['G1_MISSING_BALLOT', 'G2_VERIFY_FAIL', 'G3_ROLL_ERROR', 'G4_PROCEDURE', 'G5_CONFLICT', 'G6_OTHER'];
const EXCLUSIONS = ['stewards', 'trustees', 'proposers', 'challengers'];
// Construct only when draft validation is used. Protocol's public barrel also
// serves browser cryptography workers, where offline planning code must tree-shake.
function makeDraftSchema(): Schema {
  const thresholdSchema = obj({ num: int(0, SAFE), den: int(1, SAFE), cmp: oneOf('gt', 'gte'), base: oneOf('yes_no', 'all_cast', 'eligible') });
  const classSchema = obj({ quorum_bp: int(0, 10000), threshold: thresholdSchema, min_review_hours: int(24, 2160), min_voting_hours: int(24, 2160) });
  return obj({
  format: lit(GROUP_POLICY_DRAFT_FORMAT),
  policy: obj({
    stewards: obj({ approval: obj({ k: int(1, 15), n: int(1, 15) }), term_days: int(0, SAFE), max_consecutive_terms: int(0, SAFE) }),
    enrollment: obj({ approval: oneOf('auto', 'steward'), invite_ttl_hours: int(1, 2160), vouches: int(0, 10), label_policy: oneOf('pseudonym_ok', 'unique_only') }),
    proposals: obj({ who: oneOf('any_member', 'sponsored', 'stewards'), sponsors_required: int(0, SAFE), min_review_hours: int(24, 2160), max_open_per_member: int(1, 20), max_text_chars: int(1, 20000) }),
    elections: obj({
      min_notice_hours: int(24, 720), min_voting_hours: int(24, 2160), max_voting_hours: int(24, 2160), revoting: oneOf('allowed', 'single'),
      trustees: obj({ min_n: int(3, 15), min_t: int(2, 15), independence: oneOf('warn', 'require') }),
      roll_churn_alarm_bp: int(0, 10000), extension: obj({ allowed_if: oneOf('always', 'quorum_unmet'), max_hours: int(1, SAFE), max_times: int(1, SAFE) }),
    }),
    decision_classes: obj(Object.fromEntries(CLASSES.map(k => [k, classSchema]))),
    tie_break: obj({ yes_no: lit('status_quo'), multi_winner: oneOf('drand_lot', 'runoff', 'fail', 'incumbent') }),
    disputes: obj({ window_hours: int(72, SAFE), arbiters: obj({ count: int(3, SAFE), selection: oneOf('sortition', 'named'), exclude: arr(oneOf(...EXCLUSIONS), 0, EXCLUSIONS.length) }), grounds: arr(oneOf(...GROUNDS), 1, GROUNDS.length) }),
    halt: obj({ authority: oneOf('none', 'stewards_k_or_trustees_t'), max_hours_each: int(1, 168), max_halts: int(0, SAFE), max_total_hours: int(0, SAFE) }),
    disclosure: obj({ roll_labels: oneOf('members', 'public', 'hidden'), result_detail: lit('full_counts') }),
    retention_profile: lit('default-v1'),
  }),
  suggested_election: obj({ decision_class: oneOf(...CLASSES), voting_hours: int(24, 2160) }),
  });
}

const pointer = (path: string, key: string | number) => `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

/** Deterministic, at most ten errors. Checks this closed unsigned draft profile,
 * not signatures, rule history, member authority or compatibility with a live election. */
export function validateGroupPolicyDraft(input: unknown): GroupPolicyDraftReport {
  const errors: PolicyDiagnostic[] = [];
  let total = 0;
  const add = (code: PolicyDiagnostic['code'], path: string, message: string) => {
    total++;
    if (errors.length < 10) errors.push({ code, path, message });
  };
  // Reuse the existing closed-schema leaves; collect paths instead of changing
  // election schema validation or its first-error semantics.
  function shape(schema: Schema, value: unknown, path: string): void {
    if (schema.t === 'obj') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) { add('E_RULES_SCHEMA', path, 'expected object'); return; }
      const data = value as Record<string, unknown>;
      for (const key of Object.keys(data).sort()) if (!Object.hasOwn(schema.req, key)) add('E_RULES_SCHEMA', pointer(path, key), 'unknown field');
      for (const [key, sub] of Object.entries(schema.req)) {
        if (!Object.hasOwn(data, key)) add('E_RULES_SCHEMA', pointer(path, key), 'required field');
        else shape(sub, data[key], pointer(path, key));
      }
    } else if (schema.t === 'arr') {
      if (!Array.isArray(value) || value.length < schema.min || value.length > schema.max) { add('E_RULES_SCHEMA', path, 'array length outside draft profile'); return; }
      for (let i = 0; i < value.length; i++) shape(schema.item, value[i], pointer(path, i));
    } else {
      if (typeof value === 'number' && Object.is(value, -0)) { add('E_RULES_SCHEMA', path, 'negative zero is not canonical'); return; }
      const failure = check(schema, value, '');
      if (failure !== null) add(schema.t === 'int' && typeof value === 'number' && Number.isSafeInteger(value) ? 'E_RULES_BOUND' : 'E_RULES_SCHEMA', path, failure.slice(2));
    }
  }
  shape(makeDraftSchema(), input, '');
  const report: GroupPolicyDraftReport = { scope: 'unsigned-policy-draft', valid: false, errors, truncated: total > 10, warnings: [], required_configuration: ['group identity', 'steward public keys', 'signed rule chain', 'versioned election binding'] };
  if (errors.length) return report;
  const draft = input as GroupPolicyDraft, p = draft.policy;
  const bound = (condition: boolean, path: string, message: string) => { if (!condition) add('E_RULES_BOUND', path, message); };
  bound(p.stewards.approval.k <= p.stewards.approval.n, '/policy/stewards/approval/k', 'approval cannot exceed the steward count');
  bound(p.proposals.who !== 'sponsored' || p.proposals.sponsors_required >= 1, '/policy/proposals/sponsors_required', 'sponsored proposals need at least one sponsor');
  bound(p.elections.min_voting_hours <= p.elections.max_voting_hours, '/policy/elections/max_voting_hours', 'maximum cannot be below the minimum');
  bound(p.elections.trustees.min_t <= p.elections.trustees.min_n, '/policy/elections/trustees/min_t', 'trustee threshold cannot exceed the count');
  bound(2 * p.elections.trustees.min_t > p.elections.trustees.min_n, '/policy/elections/trustees/min_t', 'trustee threshold must be a strict majority');
  bound(p.disputes.arbiters.count % 2 === 1, '/policy/disputes/arbiters/count', 'arbiter count must be odd');
  bound(new Set(p.disputes.arbiters.exclude).size === p.disputes.arbiters.exclude.length, '/policy/disputes/arbiters/exclude', 'duplicate exclusion');
  bound(new Set(p.disputes.grounds).size === p.disputes.grounds.length, '/policy/disputes/grounds', 'duplicate ground');
  bound(p.halt.authority === 'none' || p.halt.max_halts >= 1, '/policy/halt/max_halts', 'enabled halt authority needs at least one halt');
  for (const name of CLASSES) {
    const c = p.decision_classes[name];
    bound(c.threshold.num <= c.threshold.den, `/policy/decision_classes/${name}/threshold/num`, 'threshold cannot exceed one');
    bound(c.min_voting_hours <= p.elections.max_voting_hours, `/policy/decision_classes/${name}/min_voting_hours`, 'class minimum exceeds the maximum voting duration');
  }
  const entrenched = p.decision_classes.entrenched.threshold;
  bound(p.decision_classes.entrenched.quorum_bp >= 6000, '/policy/decision_classes/entrenched/quorum_bp', 'entrenched quorum must be at least 60 percent (QV-03 AC4)');
  bound(entrenched.cmp === 'gte' && 4n * BigInt(entrenched.num) >= 3n * BigInt(entrenched.den), '/policy/decision_classes/entrenched/threshold', 'entrenched threshold must be at least 3/4 with gte');
  const requested = draft.suggested_election;
  const minimum = Math.max(p.elections.min_voting_hours, p.decision_classes[requested.decision_class].min_voting_hours);
  report.effective_min_review_hours = Math.max(p.proposals.min_review_hours, p.decision_classes[requested.decision_class].min_review_hours);
  report.effective_min_voting_hours = minimum;
  bound(requested.voting_hours >= minimum && requested.voting_hours <= p.elections.max_voting_hours, '/suggested_election/voting_hours', `suggested duration must be between ${minimum} and ${p.elections.max_voting_hours} hours`);
  const warn = (code: string, path: string, message: string) => report.warnings.push({ code, path, message });
  if (p.stewards.approval.n === 1) warn('W-SINGLE-STEWARD', '/policy/stewards/approval', 'one steward is a single point of failure');
  else if (2 * p.stewards.approval.k <= p.stewards.approval.n) warn('W-STEWARD-THRESHOLD', '/policy/stewards/approval', 'a strict steward majority is recommended');
  if (p.stewards.term_days === 0 || p.stewards.max_consecutive_terms === 0) warn('W-UNLIMITED-TERM', '/policy/stewards', 'zero means unlimited');
  if (p.tie_break.multi_winner === 'drand_lot' || p.disputes.arbiters.selection === 'sortition') report.required_configuration.push('authenticated drand chain and round rule');
  if (p.disputes.arbiters.selection === 'named') report.required_configuration.push('named arbiter public keys and authority');
  if (Object.values(p.decision_classes).some(c => c.threshold.base === 'eligible')) report.required_configuration.push('eligible-denominator election profile (not supported by suite v1)');
  report.valid = total === 0;
  report.truncated = total > 10;
  return report;
}

/** Literal QV-03 §3.1 defaults plus §10 overrides. No private keys, network,
 * signatures or election mutation. Unspecified cryptographic identities are not fabricated. */
export function groupPolicyTemplate(name: GroupPolicyTemplate): GroupPolicyDraft {
  if (!(GROUP_POLICY_TEMPLATES as readonly string[]).includes(name)) throw new RangeError('unknown policy template');
  const c = (quorum_bp: number, num: number, den: number, cmp: 'gt' | 'gte', review: number, vote: number): ClassPolicy => ({ quorum_bp, threshold: { num, den, cmp, base: 'yes_no' }, min_review_hours: review, min_voting_hours: vote });
  const draft: GroupPolicyDraft = {
    format: GROUP_POLICY_DRAFT_FORMAT,
    policy: {
      stewards: { approval: { k: 2, n: 3 }, term_days: 365, max_consecutive_terms: 2 },
      enrollment: { approval: 'steward', invite_ttl_hours: 336, vouches: 0, label_policy: 'pseudonym_ok' },
      proposals: { who: 'any_member', sponsors_required: 0, min_review_hours: 168, max_open_per_member: 3, max_text_chars: 20000 },
      elections: { min_notice_hours: 72, min_voting_hours: 72, max_voting_hours: 720, revoting: 'allowed', trustees: { min_n: 5, min_t: 3, independence: 'require' }, roll_churn_alarm_bp: 1000, extension: { allowed_if: 'quorum_unmet', max_hours: 72, max_times: 1 } },
      decision_classes: { ordinary: c(2000, 1, 2, 'gt', 168, 72), bylaw: c(4000, 2, 3, 'gte', 336, 168), rules: c(5000, 2, 3, 'gte', 336, 168), entrenched: c(6000, 3, 4, 'gte', 504, 240) },
      tie_break: { yes_no: 'status_quo', multi_winner: 'drand_lot' },
      disputes: { window_hours: 168, arbiters: { count: 3, selection: 'sortition', exclude: [...EXCLUSIONS] }, grounds: [...GROUNDS] },
      halt: { authority: 'stewards_k_or_trustees_t', max_hours_each: 72, max_halts: 2, max_total_hours: 168 },
      disclosure: { roll_labels: 'members', result_detail: 'full_counts' }, retention_profile: 'default-v1',
    }, suggested_election: { decision_class: 'ordinary', voting_hours: 168 },
  };
  const p = draft.policy;
  if (name === 'association') {
    p.stewards.approval = { k: 3, n: 5 };
    p.proposals.who = 'sponsored'; p.proposals.sponsors_required = 2; p.proposals.min_review_hours = 336;
    p.elections.revoting = 'single';
    p.decision_classes.ordinary.quorum_bp = 3000; p.decision_classes.bylaw.quorum_bp = 5000;
    p.decision_classes.rules.quorum_bp = 6000; p.decision_classes.rules.threshold = { num: 3, den: 4, cmp: 'gte', base: 'yes_no' };
    p.tie_break.multi_winner = 'runoff'; p.disputes.window_hours = 336; p.disputes.arbiters.selection = 'named'; draft.suggested_election.voting_hours = 240;
  } else if (name === 'collective') {
    p.stewards.approval = { k: 1, n: 2 }; p.enrollment.approval = 'auto'; p.proposals.min_review_hours = 24;
    p.elections.trustees = { min_n: 3, min_t: 2, independence: 'warn' };
    p.decision_classes.ordinary.quorum_bp = 0; p.decision_classes.bylaw.quorum_bp = 2500; p.decision_classes.rules.quorum_bp = 4000;
    p.disputes.window_hours = 72; draft.suggested_election.voting_hours = 48;
    // §10's 48h suggestion conflicts with the inherited 72h global/ordinary
    // minimum. Preserve and report that conflict, rather than change the rule.
  }
  return draft;
}
