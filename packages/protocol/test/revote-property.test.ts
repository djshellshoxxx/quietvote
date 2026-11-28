// SPDX-License-Identifier: AGPL-3.0-or-later
// @verifies QV-04-REQ-008 QV-07-REQ-025 QV-16-REQ-015 QV-16-REQ-017
// Bounded inventory T4 coverage; not the full 10,000-history cross-implementation acceptance of QV-07-REQ-025.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bytesToHex, streamRng, type Rng } from '@quietvote/crypto';
import { analyzeBallotLog, buildBallot, makeCast, makeSpoil, NO_SUPERSEDES, type BuiltBallot, type CastEnvelope, type SpoilEnvelope } from '../src/index.ts';
import { defaultContests, setup, type Sim } from './helpers/sim.ts';

interface Candidate {
  id: string;
  voter: number;
  parent: string | null;
  selections: string[];
}
interface Event { kind: 'cast' | 'spoil'; ballot: Candidate }
interface Located { ballot: Candidate; position: number }
interface Plan {
  candidates: Candidate[];
  events: Event[];
  checkpoint: number;
  marks: { spoiledCast: Event; staleFork: Event; forkChild: Event; overLimit: Event };
}

/**
 * QV-16 §5.14 and adopted X-10: the reference is a graph of symbolic predecessor IDs.
 * Delete authenticated-spoiled vertices, then follow the earliest remaining successor
 * at each hop, up to the cap. It never parses envelopes, calls the implementation,
 * or obtains an expected predecessor/count from production output.
 */
function reference(events: readonly Event[], voters: number, cap: number): Located[][] {
  const excluded = new Set(events.filter(e => e.kind === 'spoil').map(e => e.ballot.id));
  return Array.from({ length: voters }, (_, voter) => {
    const edges = events.flatMap((event, position) => event.kind === 'cast' && event.ballot.voter === voter &&
      !excluded.has(event.ballot.id) ? [{ ballot: event.ballot, position }] : []);
    const path: Located[] = [];
    for (let hop = 0; hop < cap; hop++) {
      const previous = path.at(-1);
      const next = edges.find(edge => edge.position > (previous?.position ?? -1) && edge.ballot.parent === (previous?.ballot.id ?? null));
      if (next === undefined) break;
      path.push(next);
    }
    return path;
  });
}

const below = (rng: Rng, n: number): number => {
  const bytes = rng.bytes(2);
  return (bytes[0]! + 256 * bytes[1]!) % n;
};

function plan(seed: string, cap: number): Plan {
  const rng = streamRng(`${seed}/plan`), candidates: Candidate[] = [], events: Event[] = [];
  const candidate = (voter: number, parent: Candidate | null): Candidate => {
    const ballot = { id: `b${candidates.length}`, voter, parent: parent?.id ?? null, selections: [[], ['yes'], ['no']][below(rng, 3)]! };
    candidates.push(ballot);
    return ballot;
  };
  const emit = (kind: Event['kind'], ballot: Candidate): Event => {
    const event = { kind, ballot };
    events.push(event);
    return event;
  };

  // A spoiled first attempt cannot consume a slot. Two devices then fork from
  // zero: the first cast wins, and a child of the rejected fork is also rejected.
  const audited = candidate(0, null);
  emit('spoil', audited);
  const spoiledCast = emit('cast', audited);
  let head = candidate(0, null);
  emit('cast', head);
  const fork = candidate(0, null), staleFork = emit('cast', fork);
  const forkChild = emit('cast', candidate(0, fork));
  for (let count = 2; count <= cap; count++) {
    head = candidate(0, head);
    emit('cast', head);
  }
  const overLimit = emit('cast', candidate(0, head));

  // A later authenticated spoil excludes an earlier cast. Descendants of the
  // excluded candidate cannot advance the chain; a sibling of it can recover.
  const anchor = candidate(1, null), laterSpoiled = candidate(1, anchor);
  emit('cast', anchor);
  emit('cast', laterSpoiled);
  emit('spoil', laterSpoiled);
  emit('cast', candidate(1, laterSpoiled));
  emit('cast', candidate(1, anchor));
  emit('spoil', candidate(2, null)); // auditing alone is not a counted vote
  emit('cast', candidate(3, null));
  const checkpoint = events.length;

  // The random suffix uses all prior candidate IDs, including rejected and
  // audited ones. It never asks the implementation or oracle which head to use.
  for (let step = 0; step < 12; step++) {
    const voter = below(rng, 4), mine = candidates.filter(c => c.voter === voter);
    const chosen = mine[below(rng, mine.length)]!;
    switch (below(rng, 6)) {
      case 0: emit('cast', candidate(voter, null)); break;
      case 1: emit('cast', candidate(voter, chosen)); break;
      case 2: emit('cast', candidate(voter, mine.at(-1)!)); break;
      case 3: emit('spoil', chosen); break;
      case 4: emit('cast', chosen); break;
      case 5: {
        const audit = candidate(voter, chosen);
        emit('spoil', audit);
        emit('cast', audit);
        break;
      }
    }
  }
  return { candidates, events, checkpoint, marks: { spoiledCast, staleFork, forkChild, overLimit } };
}

function interleave(events: readonly Event[], seed: string): Event[] {
  const rng = streamRng(`${seed}/interleave`);
  const queues = Array.from({ length: 4 }, (_, voter) => events.filter(e => e.ballot.voter === voter));
  const result: Event[] = [];
  while (result.length < events.length) {
    const live = queues.filter(q => q.length > 0);
    result.push(live[below(rng, live.length)]!.shift()!);
  }
  return result;
}

function encode(sim: Sim, input: Plan, seed: string) {
  const built = new Map<string, BuiltBallot>(), rng = streamRng(`${seed}/ballots`), p = sim.params!;
  for (const candidate of input.candidates) {
    const voter = sim.voters[candidate.voter]!;
    const predecessor = candidate.parent === null ? NO_SUPERSEDES : bytesToHex(built.get(candidate.parent)!.code);
    const result = buildBallot(p, voter.secretKey, voter.publicKey, predecessor, { budget: candidate.selections }, rng, 0);
    assert.ok(result.ok, `${seed}/${candidate.id}: generated ballot must be well formed`);
    built.set(candidate.id, result.value);
  }
  const packets = new Map<Event, CastEnvelope | SpoilEnvelope>();
  for (const event of input.events) {
    const voter = sim.voters[event.ballot.voter]!, ballot = built.get(event.ballot.id)!;
    packets.set(event, event.kind === 'cast' ? makeCast(p, voter.secretKey, ballot) : makeSpoil(p, voter.secretKey, ballot, 'private'));
  }
  return { built, packets };
}

function compare(sim: Sim, events: readonly Event[], wire: ReturnType<typeof encode>, cap: number, label: string) {
  const open = sim.openSeq!, entries = events.map((event, i) => ({ seq: open + i + 1, raw: wire.packets.get(event)! }));
  const actual = analyzeBallotLog(sim.params!, new Set(sim.rollHex), entries, open, open + events.length + 1);
  const expected = reference(events, sim.voters.length, cap).flatMap(path => {
    const last = path.at(-1);
    if (last === undefined) return [];
    const previous = path.at(-2);
    return [{ voter: bytesToHex(sim.voters[last.ballot.voter]!.publicKey), code: bytesToHex(wire.built.get(last.ballot.id)!.code),
      seq: open + last.position + 1, supersedes: previous === undefined ? NO_SUPERSEDES : bytesToHex(wire.built.get(previous.ballot.id)!.code) }];
  }).sort((a, b) => a.voter < b.voter ? -1 : a.voter > b.voter ? 1 : 0);
  assert.deepEqual(actual.counted.map(b => ({ voter: b.voter, code: b.code, seq: b.seq, supersedes: b.env.body.supersedes })), expected, label);
  assert.equal(new Set(actual.counted.map(b => b.voter)).size, actual.counted.length, `${label}: at most one per voter`);
  assert.equal(actual.castSeen, events.filter(e => e.kind === 'cast').length, `${label}: cast observations`);
  assert.equal(actual.spoilSeen, events.filter(e => e.kind === 'spoil').length, `${label}: spoil observations`);
  assert.equal(actual.checkFailures.ballotsValid, true, `${label}: genuine signatures and proofs`);
  assert.equal(actual.checkFailures.encoding, true, `${label}: canonical envelopes`);
  assert.equal(actual.checkFailures.window, true, `${label}: only in-window events`);
  if (cap === 1) assert.ok(actual.counted.every(b => b.env.body.supersedes === NO_SUPERSEDES), `${label}: first admissible cast in single mode`);
  return actual;
}

test('reference graph: hand-worked fork, later spoil, orphaned child, recovery and cap', () => {
  const a: Candidate = { id: 'a', voter: 0, parent: null, selections: [] };
  const fork: Candidate = { ...a, id: 'fork' }, b: Candidate = { ...a, id: 'b', parent: 'a' };
  const orphan: Candidate = { ...a, id: 'orphan', parent: 'b' }, recovery: Candidate = { ...a, id: 'recovery', parent: 'a' };
  const tail: Candidate = { ...a, id: 'tail', parent: 'recovery' };
  const events: Event[] = [a, fork, b, orphan, recovery, tail].map(ballot => ({ kind: 'cast', ballot }));
  events.push({ kind: 'spoil', ballot: b });
  for (const [cap, expected] of [[1, ['a']], [2, ['a', 'recovery']], [4, ['a', 'recovery', 'tail']]] as const) {
    assert.deepEqual(reference(events, 2, cap).map(path => path.map(e => e.ballot.id)), [expected, []]);
  }
});

for (const cap of [1, 2, 4]) test(`seeded revote graph agrees with proved ballot chains at max_per_voter=${cap}`, { timeout: 60_000 }, async () => {
  const sim = await setup({ seed: `revote-property-context-${cap}`, n: 3, t: 2, voters: 4,
    contests: [defaultContests()[0]!], maxPerVoter: cap });
  for (const suffix of ['alpha', 'beta']) {
    const seed = `revote-property-${cap}-${suffix}`, input = plan(seed, cap);
    assert.deepEqual(input, plan(seed, cap), `${seed}: generator is reproducible`);
    const wire = encode(sim, input, seed);
    const prefix = compare(sim, input.events.slice(0, input.checkpoint), wire, cap, `${seed}/scripted-prefix`);
    for (const [event, code, cls] of [
      [input.marks.spoiledCast, 'E_SPOILED_CODE_CAST', 'ALARM'],
      [input.marks.staleFork, 'E_SUPERSEDES', 'L'],
      [input.marks.forkChild, 'E_SUPERSEDES', 'L'],
      [input.marks.overLimit, 'E_REVOTE_LIMIT', 'L'],
    ] as const) {
      const seq = sim.openSeq! + input.events.indexOf(event) + 1;
      assert.ok(prefix.findings.some(f => f.seq === seq && f.code === code && f.cls === cls), `${seed}: ${code} at ${seq}`);
    }
    const full = compare(sim, input.events, wire, cap, `${seed}/random-suffix`);
    const reordered = interleave(input.events, seed);
    assert.notDeepEqual(reordered, input.events, `${seed}: interleaving must change global order`);
    const shuffled = compare(sim, reordered, wire, cap, `${seed}/interleaved-voters`);
    const identities = (result: typeof full) => result.counted.map(b => [b.voter, b.code, b.env.body.supersedes]);
    assert.deepEqual(identities(shuffled), identities(full), `${seed}: independent voter interleavings preserve each chain`);
  }
});
