import type { Manifest, ManifestContest, TallyBody } from './types.ts';

export type ContestResult = TallyBody['results'][number];

export function quorumMet(m: Manifest, V: number, rollSize: number): boolean {
  const q = m.quorum;
  if (q === undefined) return true;
  if (q.type === 'fraction') return BigInt(V) * BigInt(q.den!) >= BigInt(q.num!) * BigInt(rollSize);
  return V >= q.value!;
}

/** Exact-integer outcome evaluation (QV-16 §5.19.3, REQ-024). `T` maps option id -> count. */
export function evaluateContest(m: Manifest, c: ManifestContest, T: ReadonlyMap<string, number>, V: number, rollSize: number): ContestResult {
  const quorum_met = quorumMet(m, V, rollSize);
  const base = { contest: c.id, participation: V, quorum_met };
  if (!quorum_met) return { ...base, outcome: { kind: 'no-quorum' } };

  if (c.method === 'yes-no') {
    const r = c.rule!;
    const y = BigInt(T.get('yes') ?? 0);
    const n = BigInt(T.get('no') ?? 0);
    const b = r.basis === 'yes+no' ? y + n : BigInt(V);
    if (b === 0n) return { ...base, outcome: { kind: 'rejected', reason: 'no-base' } };
    const lhs = y * BigInt(r.den);
    const rhs = BigInt(r.num) * b;
    if (r.strict ? lhs > rhs : lhs >= rhs) return { ...base, outcome: { kind: 'passed' } };
    if (!(r.strict && lhs === rhs)) return { ...base, outcome: { kind: 'rejected' } };
    const tb = c.tie_break;
    if (tb.type === 'declare-tie') return { ...base, outcome: { kind: 'tie', tied: ['no', 'yes'] } };
    const winner = tb.type === 'status-quo' ? tb.option! : 'no'; // lexicographic: smallest id of {no, yes}
    return { ...base, outcome: { kind: winner === 'yes' ? 'passed' : 'rejected', reason: 'tie-break' } };
  }

  const seats = c.winners ?? (c.method === 'k-of-n' ? c.selection_limit! : 1);
  const ranked = c.options
    .map((o) => ({ id: o.id, t: T.get(o.id) ?? 0 }))
    .sort((a, b) => (b.t !== a.t ? b.t - a.t : a.id < b.id ? -1 : 1));
  if (seats >= ranked.length) return { ...base, outcome: { kind: 'winners', winners: ranked.map((r) => r.id) } };
  const cut = ranked[seats - 1]!.t;
  const above = ranked.filter((r) => r.t > cut).map((r) => r.id);
  const group = ranked.filter((r) => r.t === cut).map((r) => r.id);
  const left = seats - above.length;
  if (group.length <= left) return { ...base, outcome: { kind: 'winners', winners: [...above, ...group] } };
  if (c.tie_break.type === 'declare-tie') return { ...base, outcome: { kind: 'tie', winners: above, tied: group } };
  const picked = [...group].sort().slice(0, left); // lexicographic
  return { ...base, outcome: { kind: 'winners', winners: [...above, ...picked], reason: 'tie-break' } };
}

export function evaluateAll(m: Manifest, counts: ReadonlyMap<string, ReadonlyMap<string, number>>, V: number, rollSize: number): ContestResult[] {
  return m.contests.map((c) => evaluateContest(m, c, counts.get(c.id) ?? new Map(), V, rollSize));
}
