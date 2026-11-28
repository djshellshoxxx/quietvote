// @verifies QV-03-REQ-004 — independent graph, reachable authenticated HTTP pairs and exact STALLED boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_TYPES, checkEntry, type EntryType } from '@quietvote/board';
import { streamRng, type Rng } from '@quietvote/crypto';
import { ELECTION_STATES, type ElectionStateName } from '../src/controldb.ts';
import { effectiveState, TERMINAL, transition, typeAllowed, type LifecycleEvent } from '../src/lifecycle.ts';
import { boardState, lifecycleWorld, phase, STALL_SECONDS } from './helpers/lifecycle-world.ts';
import type { World } from './helpers/world.ts';

// Expectations are specified independently of the implementation's state-indexed tables.
// This is the currently implemented graph; CHALLENGED/extension/second-ceremony policy is not adopted here.
const STATES: ElectionStateName[] = ['DRAFT', 'SETUP', 'CEREMONY', 'SETUP_KEYED', 'READY', 'OPEN', 'PAUSED', 'CLOSED', 'TALLYING',
  'STALLED', 'TALLIED', 'CHALLENGED', 'AUDIT', 'ARCHIVED', 'INVALIDATED', 'CANCELLED', 'ABORTED', 'DELETED', 'IMPORTED'];
const EVENTS: LifecycleEvent['t'][] = ['manifest', 'ceremony_start', 'joint_key', 'roll_commit', 'election_open', 'pause', 'resume',
  'invalidate', 'election_close', 'tally_aggregate', 'tally_result', 'audit_close', 'election_cancel', 'ceremony_abort'];
const ENDS: ElectionStateName[] = ['ARCHIVED', 'INVALIDATED', 'CANCELLED', 'ABORTED', 'DELETED', 'IMPORTED'];
const edges: Record<LifecycleEvent['t'], readonly [readonly ElectionStateName[], ElectionStateName]> = {
  manifest: [['DRAFT'], 'SETUP'], ceremony_start: [['SETUP'], 'CEREMONY'], joint_key: [['CEREMONY'], 'SETUP_KEYED'],
  roll_commit: [['SETUP_KEYED'], 'READY'], election_open: [['READY'], 'OPEN'], pause: [['OPEN'], 'PAUSED'], resume: [['PAUSED'], 'OPEN'],
  invalidate: [['OPEN', 'PAUSED', 'CLOSED', 'TALLYING', 'STALLED', 'TALLIED', 'AUDIT'], 'INVALIDATED'],
  election_close: [['OPEN', 'PAUSED'], 'CLOSED'], tally_aggregate: [['CLOSED'], 'TALLYING'], tally_result: [['TALLYING', 'STALLED'], 'AUDIT'],
  audit_close: [['AUDIT'], 'ARCHIVED'], election_cancel: [['SETUP', 'SETUP_KEYED', 'READY', 'OPEN'], 'CANCELLED'], ceremony_abort: [['CEREMONY'], 'ABORTED'],
};
const permits: Partial<Record<EntryType, readonly ElectionStateName[]>> = {
  manifest: ['DRAFT'], ceremony_start: ['SETUP'], election_cancel: ['SETUP', 'SETUP_KEYED', 'READY', 'OPEN'],
  dkg_round1: ['CEREMONY'], dkg_round2: ['CEREMONY'], dkg_complaint: ['CEREMONY'], key_confirm: ['CEREMONY'], joint_key: ['CEREMONY'], ceremony_abort: ['CEREMONY'],
  roll_commit: ['SETUP_KEYED'], election_open: ['READY'], ballot: ['OPEN'], ballot_audit: ['OPEN'], election_close: ['OPEN', 'PAUSED'],
  notice: ['CEREMONY', 'OPEN', 'PAUSED', 'CLOSED', 'TALLYING', 'STALLED', 'AUDIT'], tally_aggregate: ['CLOSED'],
  decryption_share: ['TALLYING', 'STALLED'], tally_result: ['TALLYING', 'STALLED'], audit_close: ['AUDIT'],
};
const modelNext = (state: ElectionStateName, event: LifecycleEvent['t']): ElectionStateName | undefined => edges[event][0].includes(state) ? edges[event][1] : undefined;
const modelAllows = (state: ElectionStateName, type: EntryType): boolean => permits[type]?.includes(state) ?? false;
const pick = <T>(rng: Rng, items: readonly T[]): T => items[rng.bytes(1)[0]! % items.length]!;
function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = rng.bytes(1)[0]! % (i + 1); [items[i], items[j]] = [items[j]!, items[i]!]; }
  return items;
}

test('declared lifecycle gates and seeded event walks match the independent graph', () => {
  assert.deepEqual([...ELECTION_STATES].sort(), [...STATES].sort()); assert.deepEqual([...TERMINAL].sort(), [...ENDS].sort());
  for (const state of STATES) {
    for (const event of EVENTS) assert.equal(transition(state, event), modelNext(state, event), `${state}/${event}`);
    for (const type of ENTRY_TYPES) assert.equal(typeAllowed(state, type), modelAllows(state, type), `${state}/${type}`);
    if (ENDS.includes(state)) for (const type of ENTRY_TYPES) assert.equal(typeAllowed(state, type), false, `${state} is closed to new entries`);
  }
  for (const seed of ['lifecycle-graph-a', 'lifecycle-graph-b', 'lifecycle-graph-c']) {
    const rng = streamRng(seed); let expected: ElectionStateName = 'DRAFT', actual: ElectionStateName = 'DRAFT';
    for (let step = 0; step < 500; step++) {
      if (ENDS.includes(expected)) expected = actual = 'DRAFT';
      const available = EVENTS.filter((e) => modelNext(expected, e) !== undefined);
      const event = pick(rng, step % 3 === 0 || available.length === 0 ? EVENTS : available);
      const next = modelNext(expected, event), got = transition(actual, event);
      assert.equal(got, next, `${seed}/${step}/${expected}/${event}`);
      if (next !== undefined) expected = next;
      if (got !== undefined) actual = got;
      assert.equal(actual, expected); assert.ok(STATES.includes(actual));
    }
  }
});

test('STALLED is derived only strictly after the configured threshold', () => {
  const since = 1000;
  for (const state of STATES) for (const delta of [-1, 0, STALL_SECONDS - 1, STALL_SECONDS, STALL_SECONDS + 1]) {
    const expected = state === 'TALLYING' && delta > STALL_SECONDS ? 'STALLED' : state;
    assert.equal(effectiveState(state, since, since + delta, STALL_SECONDS), expected, `${state}/${delta}`);
    assert.equal(effectiveState(state, undefined, since + delta, STALL_SECONDS), state, 'missing tallying timestamp cannot invent STALLED');
  }
});

test('50 authenticated same-election state/type pairs refuse without append; terminal retries remain distinct', { timeout: 180_000 }, async (t) => {
  const fixture = await lifecycleWorld(), rng = streamRng('lifecycle-http-pairs'), pairs = new Set<string>();
  const counts: Partial<Record<ElectionStateName, number>> = { DRAFT: 2, SETUP: 4, CEREMONY: 4, SETUP_KEYED: 3, READY: 3, OPEN: 3,
    PAUSED: 3, CLOSED: 3, TALLYING: 3, STALLED: 3, AUDIT: 3, ARCHIVED: 4, INVALIDATED: 4, CANCELLED: 4, ABORTED: 4 };
  async function checkPairs(w: World, state: ElectionStateName): Promise<void> {
    assert.equal(await phase(w), state);
    const candidates = [...fixture.samples.values()].filter((s) => !modelAllows(state, s.type)
      && (state !== 'DRAFT' || s.type === 'ballot' || s.type === 'ballot_audit'));
    const selected = shuffle(rng, candidates).slice(0, counts[state]);
    assert.equal(selected.length, counts[state], `${state}: enough actually admitted sample types`);
    for (const sample of selected) {
      const label = `${state}/${sample.type}`; assert.equal(pairs.has(label), false); pairs.add(label); w.tick();
      const before = await boardState(w), packet = w.entry(sample.type, sample.who, sample.record);
      const authenticated = checkEntry(packet.headerBytes, packet.body, w.origin, () => sample.who.publicKey, before.size);
      assert.ok(authenticated.ok, label);
      const response = await w.submit(packet.headerBytes, packet.body);
      assert.equal(response.status, 409, `${label}: ${response.text}`); assert.equal(response.json.code, 'WRONG_PHASE', label);
      assert.deepEqual(await boardState(w), before, `${label}: rejected new packet cannot append or change lifecycle/control state`);
    }
  }
  async function retry(w: World, packet: ReturnType<World['entry']>, original: { seq: number; promise: unknown; promise_sig: string }): Promise<void> {
    const before = await boardState(w), response = await w.submit(packet.headerBytes, packet.body);
    assert.equal(response.status, 200, response.text); assert.equal(response.json.receipt.seq, original.seq);
    assert.deepEqual(response.json.receipt.promise, original.promise); assert.equal(response.json.receipt.promise_sig, original.promise_sig);
    assert.deepEqual(await boardState(w), before, 'an exact existing packet is a receipt retry, never a new terminal append');
  }
  try {
    // ARCHIVED is checked while this live runtime still holds its genuine signing keys.
    // Reloaded keyless archives have a different, separately tested LOG_UNAVAILABLE receipt contract.
    await checkPairs(fixture.w, 'ARCHIVED'); await retry(fixture.w, fixture.archivedRetry.packet, fixture.archivedRetry.receipt);
    for (const state of fixture.snapshots.keys()) {
      const w = await fixture.restore(state);
      try { await checkPairs(w, state); } finally { await w.stop(); }
    }
    for (const [from, terminal, type, action] of [
      ['SETUP', 'CANCELLED', 'election_cancel', 'cancel'], ['CEREMONY', 'ABORTED', 'ceremony_abort', 'abort'],
      ['OPEN', 'INVALIDATED', 'notice', 'invalidate'],
    ] as const) {
      const w = await fixture.restore(from);
      try {
        const record = w.control(action), packet = w.entry(type, w.coord[0]!, record);
        const accepted = await w.submit(packet.headerBytes, packet.body); assert.equal(accepted.status, 201, accepted.text);
        assert.equal(await phase(w), terminal); await checkPairs(w, terminal); await retry(w, packet, accepted.json.receipt);
      } finally { await w.stop(); }
    }
    assert.equal(pairs.size, 50); t.diagnostic('50 distinct authenticated HTTP pairs across 15 reached phases; 4 exact terminal retries');
  } finally { await fixture.close(); }
});
