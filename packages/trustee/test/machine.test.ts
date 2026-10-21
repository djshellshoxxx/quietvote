import test from 'node:test';
import assert from 'node:assert/strict';
import { allStates, assertTransition, canTransition, isTerminal, nextStates } from '../src/index.ts';

test('state machine: DESTROYED is the only terminal state and is reachable from every other state', () => {
  const all = allStates();
  for (const s of all) assert.equal(nextStates(s).length === 0, isTerminal(s), s);
  const reach = (from: string): Set<string> => {
    const seen = new Set([from]);
    const q = [from];
    while (q.length > 0) for (const n of nextStates(q.pop() as never)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    return seen;
  };
  for (const s of all) assert.ok(reach(s).has('DESTROYED'), `${s} cannot reach DESTROYED`);
});

test('illegal transitions throw ILLEGAL_TRANSITION (exit 40); key release cannot skip confirmation', () => {
  assert.throws(() => assertTransition('DESTROYED', 'ACCEPTED'), (e: { code?: string; exitCode?: number }) => e.code === 'ILLEGAL_TRANSITION' && e.exitCode === 40);
  assert.ok(!canTransition('KEY_DERIVED', 'STANDBY'));
  assert.ok(!canTransition('KEY_DERIVED', 'RELEASED'));
  assert.ok(!canTransition('STANDBY', 'RELEASED'));
  assert.ok(!canTransition('RELEASED', 'TALLYING'));
  assert.ok(canTransition('ACCEPTED', 'ACCEPTED'), 'self-transition is idempotent');
});
