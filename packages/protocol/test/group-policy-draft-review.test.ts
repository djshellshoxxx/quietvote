import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQvJson } from '@quietvote/crypto';
import { groupPolicyTemplate, validateGroupPolicyDraft } from '../src/group-policy-draft.ts';

test('review: AC4 quorum and supermajority are independent entrenched protections', () => {
  const draft = groupPolicyTemplate('foundation');
  for (const quorum of [0, 5999]) {
    draft.policy.decision_classes.entrenched.quorum_bp = quorum;
    const report = validateGroupPolicyDraft(draft);
    assert.equal(report.valid, false);
    assert(report.errors.some(e => e.code === 'E_RULES_BOUND' && e.path === '/policy/decision_classes/entrenched/quorum_bp'));
  }
  for (const quorum of [6000, 10000]) {
    draft.policy.decision_classes.entrenched.quorum_bp = quorum;
    assert.equal(validateGroupPolicyDraft(draft).valid, true);
  }
  draft.policy.decision_classes.entrenched.threshold.num = 2;
  assert.equal(validateGroupPolicyDraft(draft).valid, false, 'quorum cannot substitute for the independent 3/4 threshold');
});

test('review: parser prototype keys remain unknown own fields and cannot supply draft authority', () => {
  const raw = JSON.stringify(groupPolicyTemplate('foundation'));
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const parsed = parseQvJson(raw.slice(0, -1) + `,${JSON.stringify(key)}:{"group_id":"pretend-authority"}}`);
    const report = validateGroupPolicyDraft(parsed);
    assert.equal(report.valid, false);
    assert(report.errors.some(e => e.code === 'E_RULES_SCHEMA' && e.path === `/${key}`));
  }
  assert.equal(Object.hasOwn(Object.prototype, 'group_id'), false);
  const valid = validateGroupPolicyDraft(parseQvJson(raw));
  assert.equal(valid.valid, true);
  assert.equal(valid.scope, 'unsigned-policy-draft');
  assert(valid.required_configuration.includes('signed rule chain'));
});
